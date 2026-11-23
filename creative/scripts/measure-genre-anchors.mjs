/**
 * Measures zero-shot genre anchors (CLAP text prompts, `audio-intelligence/genre-evaluation/anchors.json`) against the kept
 * style prints, beside the nearest-neighbour guess and blends of the two.
 *
 *   DATABASE_URL=… node scripts/measure-genre-anchors.mjs <text-embeddings.json> [relabels.json]
 *
 * The embeddings come from `genre-evaluation/clap_text_anchors.py`. `relabels.json` is [{ sha, offsetMs?, genre, subGenre }]:
 * clips whose true genre is known to differ from what is kept. Each song is judged with all its clips left out of its own
 * neighbours; the blend weight, temperature and cut-off are chosen on other songs (5 folds by song), never on the song judged.
 */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { GUESS, guessStyle } from '../netlify/lib/style-prints.mjs';

const [textFile, relabelFile] = process.argv.slice(2);
const text = JSON.parse(readFileSync(textFile, 'utf8'));
const { lanes } = JSON.parse(readFileSync(new URL('../../audio-intelligence/genre-evaluation/anchors.json', import.meta.url), 'utf8'));
const relabels = relabelFile ? JSON.parse(readFileSync(relabelFile, 'utf8')) : [];

const dot = (a, b) => { let sum = 0; for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i]; return sum; };
const unit = v => { const n = Math.hypot(...v); return v.map(x => x / n); };
const anchors = lanes.map(lane => {
  const mean = lane.prompts.map(p => text[p]).reduce((acc, v) => acc.map((x, i) => x + v[i]), Array(512).fill(0));
  return { ...lane, vector: unit(mean) };
});
const FAMILIES = [...new Set(anchors.map(a => a.genre))];

const sql = neon(process.env.DATABASE_URL);
const rows = (await sql`select source_sha256, offset_ms, style, genre, sub_genre, print from style_prints`).map(row => {
  const fix = relabels.find(r => row.source_sha256.startsWith(r.sha) && (r.offsetMs === undefined || r.offsetMs === row.offset_ms));
  return fix ? { ...row, genre: fix.genre, sub_genre: fix.subGenre, relabelled: true } : row;
});
const songs = [...new Set(rows.map(r => r.source_sha256))];
const clipsOf = new Map(songs.map(s => [s, rows.filter(r => r.source_sha256 === s).length]));

/** Zero-shot: each lane's likeness, then family probabilities by softmax over lanes at temperature `t`. */
function zeroShot(print, t) {
  const sims = anchors.map(a => dot(print, a.vector));
  const top = Math.max(...sims);
  const e = sims.map(s => Math.exp((s - top) / t));
  const total = e.reduce((a, b) => a + b, 0);
  const family = Object.fromEntries(FAMILIES.map(f => [f, 0]));
  anchors.forEach((a, i) => { family[a.genre] += e[i] / total; });
  return { family, lane: anchors[sims.indexOf(top)], sims };
}
/** Nearest neighbours: the share of the 7 nearest other songs' likeness each family has (each song votes once). */
const knnCache = new Map();
function neighbours(row) {
  const key = `${row.source_sha256}:${row.offset_ms}`;
  if (knnCache.has(key)) return knnCache.get(key);
  const best = new Map();
  for (const other of rows) {
    if (other.source_sha256 === row.source_sha256) continue;
    const alike = dot(row.print, other.print);
    if (!(best.get(other.source_sha256)?.alike >= alike)) best.set(other.source_sha256, { genre: other.genre, alike });
  }
  const near = [...best.values()].sort((a, b) => b.alike - a.alike).slice(0, 7);
  const family = Object.fromEntries(FAMILIES.map(f => [f, 0]));
  let total = 0;
  for (const n of near) { const w = Math.max(0, n.alike); total += w; if (n.genre in family) family[n.genre] += w; }
  if (total > 0) for (const f of FAMILIES) family[f] /= total;
  knnCache.set(key, family);
  return family;
}
const argmax = family => Object.entries(family).sort((a, b) => b[1] - a[1])[0];
function predict(row, w, t) {
  const z = zeroShot(row.print, t).family;
  const k = neighbours(row);
  const p = Object.fromEntries(FAMILIES.map(f => [f, w * z[f] + (1 - w) * k[f]]));
  const [genre, conf] = argmax(p);
  return { genre, conf };
}

const W = [0, 0.25, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const T = [0.01, 0.02, 0.03, 0.05];
const C = Array.from({ length: 19 }, (_, i) => 0.35 + i * 0.035);
const weight = row => 1 / clipsOf.get(row.source_sha256);
/** Over `set`: accuracy of the forced guess, and of the guesses at or above `c`, weighting every song the same. */
function score(set, w, t, c) {
  let all = 0, right = 0, asked = 0, askedRight = 0;
  for (const row of set) {
    const { genre, conf } = predict(row, w, t);
    const x = weight(row); all += x;
    if (genre === row.genre) right += x;
    if (conf >= c) { asked += x; if (genre === row.genre) askedRight += x; }
  }
  return { accuracy: right / all, coverage: asked / all, precision: asked ? askedRight / asked : 0 };
}
/** The settings that ask most often while at least `floor` of what they ask is right. */
function tune(set, floor, ws = W) {
  let best = null;
  for (const w of ws) for (const t of T) for (const c of C) {
    const s = score(set, w, t, c);
    if (s.precision >= floor && (!best || s.coverage > best.s.coverage)) best = { w, t, c, s };
  }
  return best;
}

const pct = x => `${Math.round(x * 1000) / 10}%`;
console.log(`${rows.length} clips, ${songs.length} songs, ${anchors.length} lanes in ${FAMILIES.length} families`);

// Forced guesses, every clip, every song weighted the same.
const knnOnly = score(rows, 0, 0.03, 0);
console.log('\nforced family guess (song-weighted):');
for (const t of T) console.log(`  zero-shot alone t=${t}: ${pct(score(rows, 1, t, 0).accuracy)}`);
console.log(`  neighbours alone (family vote): ${pct(knnOnly.accuracy)}`);
for (const w of [0.25, 0.5, 0.7, 0.9]) console.log(`  blend w=${w} t=0.02: ${pct(score(rows, w, 0.02, 0).accuracy)}`);
let gRight = 0, gAsked = 0, gAll = 0;
for (const r of rows) { const g = guessStyle(r.print, rows, r.source_sha256, GUESS); const x = weight(r); gAll += x; if (g) { gAsked += x; if (g.genre === r.genre) gRight += x; } }
console.log(`  today's guess (GUESS bar): asks ${pct(gAsked / gAll)}, right family when it asks ${pct(gRight / gAsked)}`);

// Cross-validated by song: settings chosen on 4/5 of the songs, judged on the rest.
for (const floor of [0.85, 0.9]) {
  for (const [name, ws] of [['zero-shot alone', [1]], ['neighbours alone', [0]], ['blend', W]]) {
    const folds = 5;
    let asked = 0, right = 0, all = 0;
    const picked = [];
    songs.forEach((_, i) => { if (i % folds === 0) picked.push([]); });
    for (let f = 0; f < folds; f += 1) {
      const test = rows.filter(r => songs.indexOf(r.source_sha256) % folds === f);
      const train = rows.filter(r => songs.indexOf(r.source_sha256) % folds !== f);
      const best = tune(train, floor, ws);
      if (!best) continue;
      picked.push(`w=${best.w} t=${best.t} c=${best.c.toFixed(3)}`);
      for (const row of test) {
        const { genre, conf } = predict(row, best.w, best.t);
        const x = weight(row); all += x;
        if (conf >= best.c) { asked += x; if (genre === row.genre) right += x; }
      }
    }
    console.log(`\ncross-validated, asked when ≥${pct(floor)} right on other songs — ${name}: asks ${pct(asked / all)}, right ${pct(right / asked)}  [${picked.filter(p => typeof p === 'string').join('; ')}]`);
  }
}

// The settings on all songs, per family, and the two songs the creator named.
const final = tune(rows, 0.9);
console.log(`\nchosen on all songs (≥90% right): w=${final.w} t=${final.t} c=${final.c.toFixed(3)} → asks ${pct(final.s.coverage)}, right ${pct(final.s.precision)}, forced ${pct(final.s.accuracy)}`);
console.log('\nper family (songs, forced right, asked, right when asked):');
for (const f of FAMILIES) {
  const set = rows.filter(r => r.genre === f);
  if (!set.length) continue;
  const s = score(set, final.w, final.t, final.c);
  const k = score(set, 0, final.t, 0);
  const z = score(set, 1, final.t, 0);
  console.log(`  ${f.padEnd(28)} ${String(new Set(set.map(r => r.source_sha256)).size).padStart(3)} songs  blend forced ${pct(s.accuracy).padStart(6)}  asks ${pct(s.coverage).padStart(6)}  right ${pct(s.precision).padStart(6)}   (zero-shot ${pct(z.accuracy)}, neighbours ${pct(k.accuracy)})`);
}
console.log('\nEDM sub-genre by zero-shot lane (forced):');
const edm = rows.filter(r => r.genre === 'Electronic & Dance (EDM)');
const bySub = {};
for (const r of edm) { const lane = zeroShot(r.print, final.t).lane; const s = bySub[r.sub_genre] ??= { n: 0, right: 0, saw: {} }; s.n += weight(r); if (lane.subGenre === r.sub_genre) s.right += weight(r); s.saw[lane.id] = (s.saw[lane.id] ?? 0) + 1; }
for (const [sub, s] of Object.entries(bySub)) console.log(`  ${sub.padEnd(22)} right ${pct(s.right / s.n)}  lanes heard: ${Object.entries(s.saw).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e.join(' ')).join(', ')}`);

for (const r of rows.filter(r => r.relabelled)) {
  const z = zeroShot(r.print, final.t);
  const ranked = anchors.map((a, i) => [a.id, z.sims[i]]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, s]) => `${id} ${s.toFixed(3)}`).join(', ');
  const p = predict(r, final.w, final.t);
  const zf = argmax(z.family), kf = argmax(neighbours(r));
  console.log(`\n${r.source_sha256.slice(0, 10)} (kept as ${r.style}, really ${r.genre} / ${r.sub_genre}):`);
  console.log(`  top lanes: ${ranked}`);
  console.log(`  zero-shot family ${zf[0]} ${pct(zf[1])}; neighbours ${kf[0]} ${pct(kf[1])}; blend ${p.genre} ${pct(p.conf)} ${p.conf >= final.c ? '(would ask)' : '(below cut-off)'}`);
}
