import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const enc = text => new TextEncoder().encode(text);
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const u32 = n => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const synch = n => new Uint8Array([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
const pad = (bytes, to = 64) => cat(bytes, new Uint8Array(Math.max(0, to - bytes.length)));
const buf = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

async function load() {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error' });
  return { server, mod: await server.ssrLoadModule('/src/audio-format.ts') };
}

test('sniffs real containers by bytes, not by name', async () => {
  const { server, mod } = await load();
  try {
    const cases = {
      wav: cat(enc('RIFF'), u32(0), enc('WAVE'), enc('fmt ')),
      flac: cat(enc('fLaC'), new Uint8Array(32)),
      ogg: cat(enc('OggS'), new Uint8Array(32)),
      m4a: cat(u32(24), enc('ftypM4A '), new Uint8Array(32)),
      mp3: cat(enc('ID3'), new Uint8Array(32)),
      webm: cat(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), new Uint8Array(32)),
      aiff: cat(enc('FORM'), u32(0), enc('AIFF'), new Uint8Array(8)),
    };
    for (const [format, bytes] of Object.entries(cases)) assert.equal(mod.sniffAudioFormat(buf(pad(bytes))), format, format);
    // Raw frames: MPEG audio (layer III) vs ADTS AAC.
    assert.equal(mod.sniffAudioFormat(buf(pad(new Uint8Array([0xff, 0xfb, 0x90, 0x00])))), 'mp3');
    assert.equal(mod.sniffAudioFormat(buf(pad(new Uint8Array([0xff, 0xf1, 0x50, 0x80])))), 'aac');
    // Not audio at all.
    assert.equal(mod.sniffAudioFormat(buf(pad(enc('%PDF-1.7 not music at all')))), null);
    assert.equal(mod.sniffAudioFormat(buf(enc('tiny'))), null);
  } finally { await server.close(); }
});

function id3Frame(major, id, text, encoding = 3) {
  const payload = cat(new Uint8Array([encoding]), encoding === 1 ? cat(new Uint8Array([0xff, 0xfe]), ...[...text].map(c => new Uint8Array([c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8]))) : enc(text));
  const size = major === 4 ? synch(payload.length) : u32(payload.length);
  return cat(enc(id), size, new Uint8Array(2), payload);
}

test('reads ID3v2.3 and v2.4 title/artist (UTF-8 and UTF-16)', async () => {
  const { server, mod } = await load();
  try {
    for (const major of [3, 4]) {
      const frames = cat(id3Frame(major, 'TIT2', 'Ñandú nights'), id3Frame(major, 'TPE1', 'Mümoo', 1));
      const tag = cat(enc('ID3'), new Uint8Array([major, 0, 0]), synch(frames.length), frames, new Uint8Array(40));
      const meta = mod.readSongTags(buf(tag), 'mp3');
      assert.equal(meta.title, 'Ñandú nights');
      assert.equal(meta.artist, 'Mümoo');
    }
  } finally { await server.close(); }
});

test('reads WAV LIST/INFO title and artist', async () => {
  const { server, mod } = await load();
  try {
    const chunk = (id, text) => { const body = cat(enc(text), new Uint8Array([0])); const pad = body.length % 2 ? new Uint8Array([0]) : new Uint8Array(0); return cat(enc(id), new Uint8Array(u32(body.length).reverse()), body, pad); };
    const info = cat(enc('INFO'), chunk('INAM', 'Fogo na Noite'), chunk('IART', 'Coro Nova'));
    const list = cat(enc('LIST'), new Uint8Array(u32(info.length).reverse()), info);
    const fmt = cat(enc('fmt '), new Uint8Array([16, 0, 0, 0, 1, 0, 1, 0, 0x44, 0xac, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 16, 0]));
    const body = cat(enc('WAVE'), fmt, list, enc('data'), new Uint8Array(4));
    const wav = cat(enc('RIFF'), new Uint8Array(u32(body.length).reverse()), body);
    assert.deepEqual(mod.readSongTags(buf(wav), 'wav'), { title: 'Fogo na Noite', artist: 'Coro Nova' });
  } finally { await server.close(); }
});

test('reads MP4/M4A tags from ilst', async () => {
  const { server, mod } = await load();
  try {
    const typeBytes = type => Uint8Array.from([...type].map(c => c.charCodeAt(0))); // © is the single byte 0xA9 in MP4
    const box = (type, ...body) => { const b = cat(...body); return cat(u32(8 + b.length), typeBytes(type), b); };
    const item = (name, text) => box(name, box('data', u32(1), u32(0), enc(text)));
    const ilst = box('ilst', item('\u00a9nam', 'Amazing Grace'), item('\u00a9ART', 'Choir of 梅'));
    const meta = box('meta', u32(0), ilst);
    const file = cat(box('ftyp', enc('M4A '), u32(0)), box('moov', box('udta', meta)));
    const out = mod.readSongTags(buf(file), 'm4a');
    assert.equal(out.title, 'Amazing Grace');
    assert.equal(out.artist, 'Choir of 梅');
  } finally { await server.close(); }
});

test('reads Vorbis comments from ogg/flac and survives garbage', async () => {
  const { server, mod } = await load();
  try {
    const le = n => new Uint8Array([n & 255, (n >> 8) & 255, 0, 0]);
    const entry = text => cat(le(enc(text).length), enc(text));
    // The last entry is followed directly by the next Ogg page header — it must not leak into the value.
    const vorbis = cat(enc('OggS'), new Uint8Array(20), entry('TITLE=Jesus, Take the Wheel'), entry('ARTIST=Voice of Faith'), enc('OggS'), new Uint8Array(8));
    const out = mod.readSongTags(buf(vorbis), 'ogg');
    assert.equal(out.title, 'Jesus, Take the Wheel');
    assert.equal(out.artist, 'Voice of Faith');
    // A truncated/damaged tag must never throw.
    const broken = cat(enc('ID3'), new Uint8Array([3, 0, 0]), synch(9000), enc('TIT2'), u32(999999));
    assert.deepEqual(mod.readSongTags(buf(broken), 'mp3'), {});
  } finally { await server.close(); }
});
