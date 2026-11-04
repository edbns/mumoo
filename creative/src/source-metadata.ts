export interface SourceMetadata {
  title?: string;
  artist?: string;
  codec?: string;
  sampleRateHz?: number;
  channels?: number;
  durationMs?: number;
}

// Read original RIFF headers before Web Audio resamples or detaches the buffer.
export function readWavMetadata(bytes: ArrayBuffer): SourceMetadata {
  const view = new DataView(bytes);
  const ascii = (offset: number) => String.fromCharCode(...new Uint8Array(bytes, offset, 4));
  if (view.byteLength < 12 || ascii(0) !== 'RIFF' || ascii(8) !== 'WAVE') return {};
  const limit = Math.min(view.byteLength, view.getUint32(4, true) + 8);
  const metadata: SourceMetadata = {};
  let blockAlign = 0;
  let dataSize: number | undefined;
  let samples: number | undefined;
  let linear = false;
  const decoder = new TextDecoder();
  for (let offset = 12; offset + 8 <= limit;) {
    const id = ascii(offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + size;
    if (end > limit) break;
    if (id === 'fmt ' && size >= 16) {
      const format = view.getUint16(start, true);
      const subtype = format === 0xfffe && size >= 40 &&
        Array.from(new Uint8Array(bytes, start + 26, 14)).join(',') === '0,0,0,0,16,0,128,0,0,170,0,56,155,113'
        ? view.getUint16(start + 24, true) : format;
      const channels = view.getUint16(start + 2, true);
      const rate = view.getUint32(start + 4, true);
      const bits = view.getUint16(start + 14, true);
      if (channels) metadata.channels = channels;
      if (rate) metadata.sampleRateHz = rate;
      blockAlign = view.getUint16(start + 12, true);
      const codec = ({
        1: bits === 8 ? 'pcm_u8' : [16, 24, 32].includes(bits) ? `pcm_s${bits}le` : undefined,
        3: [32, 64].includes(bits) ? `pcm_f${bits}le` : undefined,
        6: 'pcm_alaw', 7: 'pcm_mulaw', 17: 'adpcm_ima_wav', 85: 'mp3',
      } as Record<number, string | undefined>)[subtype];
      if (codec) metadata.codec = codec;
      linear = [1, 3, 6, 7].includes(subtype);
    }
    if (id === 'data') dataSize = size;
    if (id === 'fact' && size >= 4) samples = view.getUint32(start, true);
    if (id === 'LIST' && size >= 4 && ascii(start) === 'INFO') {
      for (let tag = start + 4; tag + 8 <= end;) {
        const tagId = ascii(tag);
        const tagSize = view.getUint32(tag + 4, true);
        if (tag + 8 + tagSize > end) break;
        if ((tagId === 'INAM' || tagId === 'IART') && tagSize <= 4096) {
          const value = decoder.decode(new Uint8Array(bytes, tag + 8, tagSize)).split('\0')[0].trim();
          if (value) metadata[tagId === 'INAM' ? 'title' : 'artist'] = value;
        }
        tag += 8 + tagSize + tagSize % 2;
      }
    }
    offset = end + size % 2;
  }
  if (linear && dataSize !== undefined && blockAlign > 0 && dataSize % blockAlign === 0) samples = dataSize / blockAlign;
  if (samples !== undefined && metadata.sampleRateHz) {
    metadata.durationMs = Math.round(samples * 1000 / metadata.sampleRateHz);
  }
  return metadata;
}
