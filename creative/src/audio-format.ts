/** Title and artist read from the file's own tags; both optional. */
export interface SongTags { title?: string; artist?: string }

/** The picture embedded in the file (front cover when marked), as the browser can decode it. */
export interface SongCover { mime: 'image/jpeg' | 'image/png' | 'image/webp'; data: Uint8Array }

const MAX_COVER_BYTES = 12 * 1024 * 1024;

/** Identify the image by its own bytes; tags often lie about the type. */
function pictureMime(data: Uint8Array): SongCover['mime'] | null {
  if (data.length > 12 && data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
  if (data.length > 12 && data[0] === 0x89 && ascii(data, 1, 3) === 'PNG') return 'image/png';
  if (data.length > 12 && ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 4) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Format sniffing and tag reading for uploaded songs. Pure functions (no Web Audio),
 * so they can be tested in Node. Decoding itself is done by the browser in audio.ts.
 */
export type AudioFormat = 'wav' | 'mp3' | 'aac' | 'm4a' | 'ogg' | 'flac' | 'webm' | 'aiff';

export const ACCEPTED_AUDIO = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.weba,.webm,.mp4,.aif,.aiff';
export const ACCEPTED_LABEL = 'MP3, WAV, M4A, AAC, OGG, Opus, FLAC';

const ascii = (view: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...view.subarray(offset, offset + length));

/** Identify the container from its first bytes. The file name is never trusted. */
export function sniffAudioFormat(bytes: ArrayBuffer): AudioFormat | null {
  const view = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4096));
  if (view.length < 12) return null;
  if (ascii(view, 0, 4) === 'RIFF' && ascii(view, 8, 4) === 'WAVE') return 'wav';
  if (ascii(view, 0, 4) === 'fLaC') return 'flac';
  if (ascii(view, 0, 4) === 'OggS') return 'ogg';
  if (ascii(view, 4, 4) === 'ftyp') return 'm4a';
  if (ascii(view, 0, 4) === 'FORM' && ['AIFF', 'AIFC'].includes(ascii(view, 8, 4))) return 'aiff';
  if (view[0] === 0x1a && view[1] === 0x45 && view[2] === 0xdf && view[3] === 0xa3) return 'webm';
  if (ascii(view, 0, 3) === 'ID3') return 'mp3';
  // Raw frames: ADTS (AAC) has layer bits 00, MPEG audio (MP3) does not.
  if (view[0] === 0xff && (view[1] & 0xf6) === 0xf0) return 'aac';
  if (view[0] === 0xff && (view[1] & 0xe0) === 0xe0 && (view[1] & 0x06) !== 0) return 'mp3';
  return null;
}

function decodeText(data: Uint8Array, encoding: number): string {
  if (encoding === 1 && data[0] === 0xfe && data[1] === 0xff) return clean(new TextDecoder('utf-16be').decode(data.subarray(2)).replace(/\0+$/g, ''));
  const label = encoding === 1 ? 'utf-16le' : encoding === 2 ? 'utf-16be' : encoding === 3 ? 'utf-8' : 'windows-1252';
  return new TextDecoder(label).decode(data).replace(/\0+$/g, '').replace(/^\uFEFF/, '').trim();
}

function clean(value: string) {
  return value.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

interface Id3Frame { id: string; start: number; size: number }

/** Walk the frames of an ID3v2.2/2.3/2.4 tag. Stops quietly at the first malformed frame. */
function* id3Frames(view: Uint8Array): Generator<Id3Frame> {
  if (view.length < 10 || ascii(view, 0, 3) !== 'ID3') return;
  const major = view[3];
  if (major < 2 || major > 4) return;
  const synchsafe = (o: number) => ((view[o] & 0x7f) << 21) | ((view[o + 1] & 0x7f) << 14) | ((view[o + 2] & 0x7f) << 7) | (view[o + 3] & 0x7f);
  const end = Math.min(view.length, 10 + synchsafe(6));
  const idLen = major === 2 ? 3 : 4;
  const headLen = major === 2 ? 6 : 10;
  for (let pos = 10; pos + headLen <= end;) {
    const id = ascii(view, pos, idLen);
    if (!/^[A-Z0-9]+$/.test(id)) return;
    const sizeAt = pos + idLen;
    const size = major === 2
      ? (view[sizeAt] << 16) | (view[sizeAt + 1] << 8) | view[sizeAt + 2]
      : major === 4 ? synchsafe(sizeAt)
        : ((view[sizeAt] << 24) | (view[sizeAt + 1] << 16) | (view[sizeAt + 2] << 8) | view[sizeAt + 3]) >>> 0;
    const start = pos + headLen;
    if (size < 2 || start + size > end) return;
    yield { id, start, size };
    pos = start + size;
  }
}

/** ID3v2.2/2.3/2.4 title and artist. Returns {} if the tag is absent or malformed. */
function readId3(bytes: ArrayBuffer): SongTags {
  const view = new Uint8Array(bytes);
  const out: SongTags = {};
  for (const { id, start, size } of id3Frames(view)) {
    const isTitle = id === 'TIT2' || id === 'TT2';
    const isArtist = id === 'TPE1' || id === 'TP1';
    if ((isTitle || isArtist) && size <= 4096) {
      const value = clean(decodeText(view.subarray(start + 1, start + size), view[start]).split('\0')[0]);
      if (value) out[isTitle ? 'title' : 'artist'] = value;
    }
  }
  return out;
}

/** ID3 attached picture (APIC, or PIC in v2.2): <encoding><mime or 3-letter format><type><description><image>. */
function coverFromId3(bytes: ArrayBuffer): { type: number; cover: SongCover } | null {
  const view = new Uint8Array(bytes);
  let best: { type: number; cover: SongCover } | null = null;
  for (const { id, start, size } of id3Frames(view)) {
    if (id !== 'APIC' && id !== 'PIC') continue;
    const end = start + size;
    const encoding = view[start];
    let pos = start + 1;
    if (id === 'PIC') pos += 3; // three-letter image format
    else {
      const stop = view.indexOf(0, pos); // zero-terminated mime type
      if (stop < 0 || stop >= end) continue;
      pos = stop + 1;
    }
    const type = view[pos++];
    // The description ends with one zero byte (Latin-1/UTF-8) or an aligned pair (UTF-16).
    const wide = encoding === 1 || encoding === 2;
    while (pos < end && (wide ? !(view[pos] === 0 && view[pos + 1] === 0) : view[pos] !== 0)) pos += wide ? 2 : 1;
    pos += wide ? 2 : 1;
    if (pos >= end) continue;
    const data = view.slice(pos, end);
    const kind = pictureMime(data);
    if (!kind || data.length > MAX_COVER_BYTES) continue;
    if (!best || (type === 3 && best.type !== 3)) best = { type, cover: { mime: kind, data } };
  }
  return best;
}

/** Visit every item of an MP4/M4A tag list (moov > udta > meta > ilst) with its path, e.g. `moov/udta/meta/ilst/covr`. */
function walkMp4(bytes: ArrayBuffer, visit: (key: string, body: number, stop: number) => void) {
  const view = new DataView(bytes);
  const u8 = new Uint8Array(bytes);
  const walk = (start: number, end: number, path: string[], depth: number) => {
    if (depth > 6) return;
    for (let pos = start; pos + 8 <= end;) {
      let size = view.getUint32(pos);
      const type = ascii(u8, pos + 4, 4);
      let header = 8;
      if (size === 1 && pos + 16 <= end) { size = Number(view.getBigUint64(pos + 8)); header = 16; }
      if (size === 0) size = end - pos;
      if (size < header || pos + size > end) break;
      const next = [...path, type];
      const body = pos + header;
      const stop = pos + size;
      const key = next.join('/');
      if (key === 'moov' || key === 'moov/udta' || key === 'moov/udta/meta/ilst') {
        walk(body, stop, next, depth + 1);
      } else if (key === 'moov/udta/meta') {
        walk(body + 4, stop, next, depth + 1); // meta is a "full box": 4 bytes of version/flags
      } else {
        visit(key, body, stop);
      }
      pos += size;
    }
  };
  walk(0, bytes.byteLength, [], 0);
}

/** Each ilst item holds `data` boxes: <size><'data'><type/flags 4><locale 4><payload>. */
function mp4DataBoxes(view: DataView, u8: Uint8Array, body: number, stop: number, maxBytes: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let inner = body; inner + 16 <= stop;) {
    const innerSize = view.getUint32(inner);
    if (innerSize < 16 || inner + innerSize > stop) break;
    if (ascii(u8, inner + 4, 4) === 'data' && innerSize - 16 <= maxBytes) out.push(u8.subarray(inner + 16, inner + innerSize));
    inner += innerSize;
  }
  return out;
}

/** MP4/M4A: title (©nam) and artist (©ART). */
function readMp4(bytes: ArrayBuffer): SongTags {
  const view = new DataView(bytes);
  const u8 = new Uint8Array(bytes);
  const out: SongTags = {};
  walkMp4(bytes, (key, body, stop) => {
    const field = key === 'moov/udta/meta/ilst/\u00a9nam' ? 'title' : key === 'moov/udta/meta/ilst/\u00a9ART' ? 'artist' : null;
    if (!field) return;
    for (const data of mp4DataBoxes(view, u8, body, stop, 4096)) {
      const value = clean(new TextDecoder('utf-8').decode(data));
      if (value) out[field] = value;
    }
  });
  return out;
}

/** MP4/M4A cover art (covr). */
function coverFromMp4(bytes: ArrayBuffer): SongCover | null {
  const view = new DataView(bytes);
  const u8 = new Uint8Array(bytes);
  let found: SongCover | null = null;
  walkMp4(bytes, (key, body, stop) => {
    if (found || key !== 'moov/udta/meta/ilst/covr') return;
    for (const data of mp4DataBoxes(view, u8, body, stop, MAX_COVER_BYTES)) {
      const mime = pictureMime(data);
      if (mime) { found = { mime, data: data.slice() }; return; }
    }
  });
  return found;
}

/** FLAC PICTURE metadata block (type 6): all fields big-endian. */
function coverFromFlac(bytes: ArrayBuffer): SongCover | null {
  const view = new DataView(bytes);
  const u8 = new Uint8Array(bytes);
  let best: { type: number; cover: SongCover } | null = null;
  for (let pos = 4; pos + 4 <= u8.length;) {
    const last = (u8[pos] & 0x80) !== 0;
    const kind = u8[pos] & 0x7f;
    const length = (u8[pos + 1] << 16) | (u8[pos + 2] << 8) | u8[pos + 3];
    const start = pos + 4;
    const end = start + length;
    if (end > u8.length) break;
    if (kind === 6 && length > 32) {
      const type = view.getUint32(start);
      let at = start + 4;
      const mimeLength = view.getUint32(at); at += 4 + mimeLength;
      const descLength = view.getUint32(at); at += 4 + descLength;
      at += 16; // width, height, depth, colors
      const dataLength = view.getUint32(at); at += 4;
      if (at + dataLength <= end && dataLength <= MAX_COVER_BYTES) {
        const data = u8.slice(at, at + dataLength);
        const mime = pictureMime(data);
        if (mime && (!best || (type === 3 && best.type !== 3))) best = { type, cover: { mime, data } };
      }
    }
    if (last) break;
    pos = end;
  }
  return best?.cover ?? null;
}

/** Ogg/FLAC/Opus Vorbis comments. Each entry is stored as <u32 length><KEY=value>, so use the length to cut exactly. */
function readVorbis(bytes: ArrayBuffer): SongTags {
  const limit = Math.min(bytes.byteLength, 262_144);
  const u8 = new Uint8Array(bytes, 0, limit);
  const view = new DataView(bytes, 0, limit);
  const out: SongTags = {};
  const find = (key: string): string | undefined => {
    const needle = Array.from(key, c => c.charCodeAt(0));
    for (let i = 4; i + needle.length < limit; i++) {
      let hit = true;
      for (let k = 0; k < needle.length; k++) {
        if ((u8[i + k] | 0x20) !== (needle[k] | 0x20) && !(needle[k] === 61 && u8[i + k] === 61)) { hit = false; break; }
      }
      if (!hit) continue;
      const length = view.getUint32(i - 4, true);
      if (length < needle.length || length > 4096 || i + length > limit) continue;
      const value = clean(new TextDecoder('utf-8').decode(u8.subarray(i + needle.length, i + length)));
      if (value) return value;
    }
    return undefined;
  };
  const title = find('TITLE=');
  const artist = find('ARTIST=');
  if (title) out.title = title;
  if (artist) out.artist = artist;
  return out;
}

/** WAV: RIFF LIST/INFO > INAM (title) | IART (artist). */
function readWav(bytes: ArrayBuffer): SongTags {
  const view = new DataView(bytes);
  const u8 = new Uint8Array(bytes);
  const out: SongTags = {};
  const limit = Math.min(view.byteLength, view.getUint32(4, true) + 8);
  for (let offset = 12; offset + 8 <= limit;) {
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + size;
    if (end > limit) break;
    if (ascii(u8, offset, 4) === 'LIST' && size >= 4 && ascii(u8, start, 4) === 'INFO') {
      for (let tag = start + 4; tag + 8 <= end;) {
        const id = ascii(u8, tag, 4);
        const tagSize = view.getUint32(tag + 4, true);
        if (tag + 8 + tagSize > end) break;
        if ((id === 'INAM' || id === 'IART') && tagSize <= 4096) {
          const value = clean(new TextDecoder().decode(u8.subarray(tag + 8, tag + 8 + tagSize)).split('\0')[0]);
          if (value) out[id === 'INAM' ? 'title' : 'artist'] = value;
        }
        tag += 8 + tagSize + tagSize % 2;
      }
    }
    offset = end + size % 2;
  }
  return out;
}

/** Never throws: tags are a convenience, and a damaged tag must not block the upload. */
export function readSongTags(bytes: ArrayBuffer, format: AudioFormat | null): SongTags {
  try {
    if (format === 'wav') return readWav(bytes);
    if (format === 'mp3') return readId3(bytes);
    if (format === 'm4a') return readMp4(bytes);
    if (format === 'ogg' || format === 'flac') return readVorbis(bytes);
  } catch { /* fall through */ }
  return {};
}

/** The cover art inside the file, if it has one. Never throws; WAV, Ogg and raw AAC are not supported. */
export function readSongCover(bytes: ArrayBuffer, format: AudioFormat | null): SongCover | null {
  try {
    if (format === 'mp3') return coverFromId3(bytes)?.cover ?? null;
    if (format === 'm4a') return coverFromMp4(bytes);
    if (format === 'flac') return coverFromFlac(bytes);
  } catch { /* fall through */ }
  return null;
}
