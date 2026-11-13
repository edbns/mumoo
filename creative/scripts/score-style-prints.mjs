import { db } from '../netlify/lib/person.mjs';
import { readiness } from '../netlify/lib/style-prints.mjs';

/**
 * How well the kept style prints would guess a song's style: each song in turn is hidden, and the clips nearest its
 * own (cosine, the prints being unit length) from every other song vote, weighted by how alike they sound.
 * A song's guess is the vote of all its clips. Counted at the style, sub-genre and genre: a style only one song has
 * can never be guessed, so with few songs the genre and sub-genre say more.
 *
 *   node --env-file=.env.local scripts/score-style-prints.mjs [--nearest 5] [--songs]
 */
const args = process.argv.slice(2);
const NEAREST = Number(args[args.indexOf('--nearest') + 1]) || 5;
const rows = await db()`select source_sha256, style, genre, sub_genre, print from style_prints`;
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);

const songs = new Map();
for (const row of rows) {
  const song = songs.get(row.source_sha256) ?? { style: row.style, sub: `${row.genre} / ${row.sub_genre}`, genre: row.genre, prints: [] };
  song.prints.push(row.print);
  songs.set(row.source_sha256, song);
}

const levels = ['style', 'sub', 'genre'];
const right = { style: 0, sub: 0, genre: 0 };
const guessable = { style: 0, sub: 0, genre: 0 };
const lines = [];
for (const [hash, song] of songs) {
  const others = [...songs].filter(([other]) => other !== hash);
  const votes = { style: new Map(), sub: new Map(), genre: new Map() };
  for (const print of song.prints) {
    const near = others.flatMap(([, other]) => other.prints.map(p => ({ other, alike: dot(print, p) })))
      .sort((a, b) => b.alike - a.alike).slice(0, NEAREST);
    for (const { other, alike } of near) for (const level of levels) votes[level].set(other[level], (votes[level].get(other[level]) ?? 0) + alike);
  }
  const guess = Object.fromEntries(levels.map(level => [level, [...votes[level]].sort((a, b) => b[1] - a[1])[0]?.[0]]));
  for (const level of levels) {
    if (others.some(([, other]) => other[level] === song[level])) guessable[level] += 1;
    if (guess[level] === song[level]) right[level] += 1;
  }
  lines.push(`${guess.sub === song.sub ? 'ok ' : guess.genre === song.genre ? '~  ' : 'no '} ${song.style.padEnd(18)} heard as ${guess.style} (${guess.sub})`);
}

if (args.includes('--songs')) console.log(lines.sort().join('\n'));
console.log(`${songs.size} songs, ${rows.length} prints, ${NEAREST} nearest clips vote`);
for (const level of levels) {
  console.log(`${level.padEnd(6)} ${right[level]}/${songs.size} right (${guessable[level]} had another song of theirs to learn from)`);
}

// What a creator who does not know would see: the site's own guess, asked only when it is sure, for each clip kept.
const site = readiness(rows);
console.log(`site   asked on ${site.asked}/${site.clips} clips, ${site.right} of those the right sub-genre (a yes to a wrong one is kept as true)`);
