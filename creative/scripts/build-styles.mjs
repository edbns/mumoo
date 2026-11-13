/**
 * Builds the style directory (`src/styles.json`) the song step searches: the music genres of Wikidata (CC0; the snapshot
 * in `reference/wikidata-genres.jsonl`), each placed in one of our genres and its nearest sub-genre (`src/genres.ts`).
 *
 * A style is placed by ANCHORS, the well-known styles placed by hand; any other walks its "subclass of" links up to the
 * nearest anchor. A style that reaches none is left out: the search never offers a style we cannot place.
 *
 *   node --experimental-strip-types scripts/build-styles.mjs [--fetch] [--review]
 *   --fetch   takes a new snapshot from the Wikidata query service first
 *   --review  writes what was placed by walking, and what was left out, to tmp-styles-review.txt for a person to check
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { GENRES, styleKey as searchKey } from '../src/genres.ts';

const SNAPSHOT = new URL('../reference/wikidata-genres.jsonl', import.meta.url);
// Many names now sit under "mul" (one label for every language) rather than "en".
const QUERY = `SELECT ?g (SAMPLE(?name) AS ?label) (GROUP_CONCAT(DISTINCT ?parent; separator="|") AS ?parents) (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases) WHERE {
  ?g wdt:P31/wdt:P279* wd:Q188451 .
  OPTIONAL { ?g rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?g rdfs:label ?mul FILTER(LANG(?mul) = "mul") }
  BIND(COALESCE(?en, ?mul) AS ?name)
  FILTER(BOUND(?name))
  OPTIONAL { ?g wdt:P279 ?parent }
  OPTIONAL { ?g skos:altLabel ?alias FILTER(LANG(?alias) = "en" || LANG(?alias) = "mul") }
} GROUP BY ?g`;

const EDM = 'Electronic & Dance (EDM)';
const HIPHOP = 'Hip-Hop & Rap';
const LATIN = 'Latin & Urbano';
const JAZZ = 'Jazz, Soul & Blues';
const CLASSICAL = 'Classical & Cinematic';
const COUNTRY = 'Country & Folk';
const REGGAE = 'Reggae & Dancehall';
const EXPERIMENTAL = 'Experimental & Avant-Garde';
const GOSPEL = 'Gospel & Christian';

/** A well-known style (its Wikidata id) → [our genre, our sub-genre]. */
export const ANCHORS = {
  Q9778: [EDM, 'General Electronic'], // electronic music
  Q851213: [EDM, 'General Electronic'], // electronic dance music
  Q20502: [EDM, 'House'], // house music
  Q106493832: [EDM, 'Slap House'], // slap house
  Q388100: [EDM, 'Afro House'], // Afro house
  Q598593: [EDM, 'Tech House'], // tech house
  Q874038: [EDM, 'Deep House'], // deep house
  Q107697041: [EDM, 'G-House'], // g-house
  Q170611: [EDM, 'Techno'], // techno
  Q19938910: [EDM, 'Synthwave / Vaporwave'], // synthwave
  Q15733887: [EDM, 'Synthwave / Vaporwave'], // vaporwave
  Q20474: [EDM, 'Dubstep / Riddim'], // dubstep
  Q65065491: [EDM, 'Dubstep / Riddim'], // riddim
  Q193207: [EDM, 'Ambient / Downtempo'], // ambient music
  Q251192: [EDM, 'Ambient / Downtempo'], // downtempo
  Q757143: [EDM, 'Ambient / Downtempo'], // chill-out music
  Q11401: [HIPHOP, 'General Hip-Hop'], // hip-hop
  Q2913982: [HIPHOP, 'Trap'], // trap music
  Q529742: [HIPHOP, 'Boom Bap / Lo-Fi'], // boom bap
  Q97265899: [HIPHOP, 'Boom Bap / Lo-Fi'], // lofi hip-hop
  Q2106887: [HIPHOP, 'Psychedelic Rap'], // psychedelic hip-hop
  Q121667432: [HIPHOP, 'Psychedelic Rap'], // psychedelic rap
  Q16829781: [HIPHOP, 'Psychedelic Rap'], // cloud rap
  Q18345375: [LATIN, 'General Latin'], // Latin music
  Q202930: [LATIN, 'Reggaeton'], // reggaeton
  Q54329757: [LATIN, 'Latin Trap'], // Latin trap
  Q1931130: [LATIN, 'General Latin'], // funk carioca
  Q208239: [LATIN, 'Traditional Latin (Salsa, Bachata)'], // salsa
  Q40461: [LATIN, 'Traditional Latin (Salsa, Bachata)'], // bachata
  Q282131: [LATIN, 'Traditional Latin (Salsa, Bachata)'], // merengue
  Q723418: [LATIN, 'Traditional Latin (Salsa, Bachata)'], // cumbia
  Q14390274: [LATIN, 'Traditional Latin (Salsa, Bachata)'], // tango
  Q11403: [LATIN, 'Traditional Latin (Salsa, Bachata)'], // samba
  Q11399: ['Rock', 'General Rock'], // rock music
  Q11366: ['Rock', 'Alternative / Indie Rock'], // alternative rock
  Q183504: ['Rock', 'Alternative / Indie Rock'], // indie rock
  Q206159: ['Rock', 'Psychedelic Rock'], // psychedelic rock
  Q12326776: ['Metal', 'General Metal'], // metal music
  Q38848: ['Metal', 'Heavy Metal / Hard Rock'], // heavy metal music
  Q83270: ['Metal', 'Heavy Metal / Hard Rock'], // hard rock
  Q483251: ['Metal', 'Extreme Metal (Thrasher, Death)'], // death metal
  Q483352: ['Metal', 'Extreme Metal (Thrasher, Death)'], // thrash metal
  Q132438: ['Metal', 'Extreme Metal (Thrasher, Death)'], // black metal
  Q465978: ['Metal', 'Extreme Metal (Thrasher, Death)'], // extreme metal
  Q3071: ['Punk', 'General Punk'], // punk rock
  Q25554481: ['Punk', 'General Punk'], // punk music
  Q487914: ['Punk', 'Pop-Punk'], // pop-punk
  Q10922: ['Punk', 'Hardcore Punk'], // hardcore punk
  Q37073: ['Pop', 'General Pop'], // pop music
  Q211756: ['Pop', 'Dance-Pop'], // dance-pop
  Q842324: ['Pop', 'Indie Pop'], // indie pop
  Q213665: ['Pop', 'K-Pop / J-Pop'], // K-pop
  Q131578: ['Pop', 'K-Pop / J-Pop'], // J-pop
  Q8341: [JAZZ, 'General Jazz & Blues'], // jazz
  Q9759: [JAZZ, 'General Jazz & Blues'], // blues
  Q131272: [JAZZ, 'Smooth Jazz / Soul'], // soul
  Q45981: [JAZZ, 'Smooth Jazz / Soul'], // rhythm and blues
  Q850412: [JAZZ, 'Smooth Jazz / Soul'], // contemporary R&B
  Q831354: [JAZZ, 'Smooth Jazz / Soul'], // smooth jazz
  Q602561: [JAZZ, 'Electro-Swing'], // electro swing
  Q9730: [CLASSICAL, 'General Classical'], // classical music
  Q492264: [CLASSICAL, 'General Classical'], // film score
  Q106576145: [CLASSICAL, 'Neoclassical'], // neoclassical music
  Q65937946: [CLASSICAL, 'Neoclassical'], // modern classical music
  Q83440: [COUNTRY, 'Modern Country'], // country music
  Q43343: [COUNTRY, 'Americana / Folk'], // folk music
  Q2407862: [COUNTRY, 'Americana / Folk'], // Americana
  Q9794: [REGGAE, 'General Reggae'], // reggae
  Q1299260: [REGGAE, 'Roots Reggae'], // roots reggae
  Q474027: [REGGAE, 'Dancehall / Afrobeats'], // dancehall
  Q25099840: [REGGAE, 'Dancehall / Afrobeats'], // Afrobeats
  Q1640319: [EXPERIMENTAL, 'General Experimental'], // experimental music
  Q2332751: [EXPERIMENTAL, 'General Experimental'], // avant-garde music
  Q660984: [EXPERIMENTAL, 'Glitch Hop / IDM'], // intelligent dance music
  Q3108920: [EXPERIMENTAL, 'Glitch Hop / IDM'], // glitch hop
  Q487965: [EXPERIMENTAL, 'Industrial'], // industrial music
  // Styles whose links lead to none of ours: placed with the nearest.
  Q388296: [REGGAE, 'Dancehall / Afrobeats'], // Afrobeat
  Q963061: [REGGAE, 'Dancehall / Afrobeats'], // highlife
  Q972634: [REGGAE, 'Dancehall / Afrobeats'], // African popular music
  Q54365: [REGGAE, 'General Reggae'], // ska
  Q752785: [REGGAE, 'General Reggae'], // calypso
  Q1051735: [REGGAE, 'General Reggae'], // soca music
  Q227045: [REGGAE, 'General Reggae'], // zouk
  Q1597549: [REGGAE, 'General Reggae'], // kizomba
  Q4950496: [REGGAE, 'General Reggae'], // bouyon
  Q16491869: [LATIN, 'Reggaeton'], // Dominican dembow
  Q1192110: ['Pop', 'K-Pop / J-Pop'], // C-pop
  Q973150: ['Pop', 'K-Pop / J-Pop'], // mandopop
  Q853873: ['Pop', 'K-Pop / J-Pop'], // cantopop
  Q116690343: ['Pop', 'General Pop'], // ballad
  Q58339: ['Pop', 'Dance-Pop'], // disco
  Q164444: [JAZZ, 'Smooth Jazz / Soul'], // funk
  Q1507298: [HIPHOP, 'Boom Bap / Lo-Fi'], // lo-fi music
  Q2337447: [EDM, 'Ambient / Downtempo'], // meditation music
  Q1062702: [CLASSICAL, 'General Classical'], // video game music
  // The owner's calls (13 Nov 2026): drill is Trap; all phonk is electronic; gospel and Christian music have their own genre.
  Q15697534: [HIPHOP, 'Trap'], // drill
  Q65943851: [HIPHOP, 'Trap'], // UK drill
  Q90568328: [EDM, 'General Electronic'], // phonk
  Q112997482: [EDM, 'General Electronic'], // drift phonk
  Q125455905: [EDM, 'General Electronic'], // Brazilian phonk
  Q116314630: [EDM, 'General Electronic'], // rare phonk
  Q126728409: [EDM, 'General Electronic'], // doomshop phonk
  Q180268: [GOSPEL, 'Gospel'], // gospel music
  Q384064: [GOSPEL, 'Gospel'], // African gospel
  Q5967604: [GOSPEL, 'Gospel'], // urban contemporary gospel
  Q212024: [GOSPEL, 'Gospel'], // spirituals
  Q1379958: [GOSPEL, 'Worship / Contemporary Christian'], // contemporary Christian music
  Q1339121: [GOSPEL, 'Worship / Contemporary Christian'], // contemporary worship music
  Q110592421: [GOSPEL, 'Worship / Contemporary Christian'], // Christian pop
  Q856713: [GOSPEL, 'Worship / Contemporary Christian'], // Christian hymn
  Q2238236: [GOSPEL, 'Christian Hip-Hop'], // Christian hip-hop
  Q126708888: [GOSPEL, 'Christian Hip-Hop'], // gospel trap
  Q6452410: [GOSPEL, 'General Gospel & Christian'], // Christian music
};

/** A style both Christian and something else (Christian rock: Christian music and rock) is placed by its faith. */
const FIRST_IN_TIES = GOSPEL;


if (process.argv.includes('--fetch') || !existsSync(SNAPSHOT)) {
  let response;
  // The query runs close to the service's one-minute limit: a busy moment times out, a retry usually does not.
  for (let attempt = 0; attempt < 3 && !response?.ok; attempt++) {
    response = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(QUERY)}`, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'mumoo-styles/0.1 (style directory build)' } });
  }
  if (!response.ok) throw new Error(`Wikidata answered ${response.status}`);
  const id = value => value.replace('http://www.wikidata.org/entity/', '');
  const rows = (await response.json()).results.bindings.map(row => ({
    id: id(row.g.value),
    name: row.label.value,
    parents: row.parents.value ? row.parents.value.split('|').map(id) : [],
    aliases: row.aliases.value ? row.aliases.value.split('|') : [],
  })).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  writeFileSync(SNAPSHOT, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
  console.log(`snapshot: ${rows.length} genres`);
}

const genres = readFileSync(SNAPSHOT, 'utf8').trim().split('\n').map(line => JSON.parse(line));
const byId = new Map(genres.map(genre => [genre.id, genre]));
const anchors = ANCHORS;

for (const [id, [genre, sub]] of Object.entries(anchors)) {
  if (!GENRES.find(entry => entry.name === genre)?.subGenres.includes(sub)) throw new Error(`${id}: ${genre} / ${sub} is not one of our sub-genres`);
  if (!byId.has(id)) console.warn(`anchor ${id} is not a Wikidata music genre`);
}

/** The nearest anchors up the "subclass of" links, all at the shortest distance, with that distance. */
function nearest(start) {
  let frontier = [start];
  const seen = new Set([start.id]);
  for (let depth = 1; frontier.length && depth <= 6; depth++) {
    const next = [];
    for (const genre of frontier) {
      for (const id of genre.parents) {
        if (seen.has(id) || !byId.has(id)) continue;
        seen.add(id);
        next.push(byId.get(id));
      }
    }
    const found = next.filter(genre => anchors[genre.id]);
    if (found.length) return { found, depth };
    frontier = next;
  }
  return null;
}

/** One style per name: of several genres with the same name ("cumbia" three times), the one placed most directly. */
const byName = new Map();
const walked = [];
const left = [];
for (const genre of genres) {
  const reach = anchors[genre.id] ? { found: [genre], depth: 0 } : nearest(genre);
  if (!reach) { left.push(genre.name); continue; }
  const key = searchKey(genre.name);
  if (!key || (byName.has(key) && byName.get(key).depth <= reach.depth)) continue;
  const chosen = reach.found.find(entry => anchors[entry.id][0] === FIRST_IN_TIES) ?? reach.found[0];
  const [ours, sub] = anchors[chosen.id];
  const aliases = [...new Set(genre.aliases.filter(alias => searchKey(alias) && searchKey(alias) !== key))];
  const places = [...new Set(reach.found.map(entry => anchors[entry.id].join(' / ')))];
  const note = `${genre.name} → ${places.join(' | ')}  (via ${reach.found.map(entry => entry.name).join(', ')}, ${reach.depth} up${places.length > 1 ? ', TIE' : ''})`;
  byName.set(key, { depth: reach.depth, note, style: { name: genre.name, ...(aliases.length ? { aliases } : {}), genre: ours, subGenre: sub } });
}
/** Styles creators type that Wikidata does not have yet, placed by hand. */
const EXTRA = [
  { name: 'montagem', aliases: ['funk montagem', 'montagem funk', 'Brazilian montagem'], genre: LATIN, subGenre: 'General Latin' },
];
for (const style of EXTRA) if (!byName.has(searchKey(style.name))) byName.set(searchKey(style.name), { depth: 0, note: '', style });
/** A short name several styles share, kept only by the one a creator means by it ("R&B" is today's R&B, not British). */
const OWNED = { 'R&B': 'contemporary R&B', RnB: 'contemporary R&B', "R'n'B": 'contemporary R&B' };
for (const [alias, owner] of Object.entries(OWNED)) {
  if (!byName.has(searchKey(owner))) throw new Error(`OWNED: no style "${owner}"`);
  for (const { style } of byName.values()) {
    if (style.name === owner || !style.aliases) continue;
    style.aliases = style.aliases.filter(other => searchKey(other) !== searchKey(alias));
    if (!style.aliases.length) delete style.aliases;
  }
}
for (const { depth, note } of byName.values()) if (depth > 0) walked.push(note);
const styles = [...byName.values()].map(entry => entry.style).sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(new URL('../src/styles.json', import.meta.url), `${JSON.stringify(styles)}\n`);
console.log(`${styles.length} styles placed (${styles.length - walked.length} by hand, ${walked.length} by their links), ${left.length} left out`);
if (process.argv.includes('--review')) {
  writeFileSync(new URL('../../tmp-styles-review.txt', import.meta.url), `PLACED BY THEIR LINKS\n${walked.join('\n')}\n\nLEFT OUT\n${left.join('\n')}\n`);
  console.log('review written to tmp-styles-review.txt');
}
