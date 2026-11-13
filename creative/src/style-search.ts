import { styleKey } from './genres';
import styles from './styles.json';

/** A style of the directory (`scripts/build-styles.mjs`): its name, other names it goes by, and where it is placed in ours. */
export type Style = { name: string; aliases?: string[]; genre: string; subGenre: string };

/** A style found for what was typed; `label` is the name it was found by (its own or another), as the creator sees it. */
export type StyleMatch = { style: Style; label: string };

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** Names that read the same to a creator ("Afrobeat" and "Afrobeats", three "R&B"s) are shown once. */
const sameName = (text: string) => styleKey(text).replace(/s$/, '');

const ALL = styles as Style[];
const KEYED = ALL.map(style => ({ style, name: styleKey(style.name), aliases: (style.aliases ?? []).map(alias => ({ alias, key: styleKey(alias) })) }));

/** Where a mix of styles is split ("House x rai", "trap feat. drill"). */
const MIX = /\s+(?:x|vs\.?|feat\.?|ft\.?|with)\s+/i;
/** Words that name no style on their own. */
const PLAIN = new Set(['and', 'music', 'style', 'type', 'song']);

/**
 * The styles that fit what was typed, best first. A mix ("House x rai") is looked up by each of its styles too; words that
 * together find nothing ("Bedroom R&B", "Funk Phonk", "Country (outlaw)") one by one, the last first: in a style's name
 * the last word is usually the style ("R&B", "phonk"), the ones before it the kind. The best of each part comes first,
 * so every style of a mix is offered.
 */
export function searchStyles(typed: string, limit = 6): StyleMatch[] {
  const segments = typed.split(MIX);
  const parts = [typed, ...(segments.length > 1 ? segments : [])];
  for (const segment of segments) {
    const words = segment.split(/[^\p{L}\p{N}&']+/u).filter(word => word.length > 1 && !PLAIN.has(word.toLowerCase()));
    if (words.length > 1 && !matching(segment).length) parts.push(...words.reverse());
  }
  const found = parts.map(matching);
  const shown = new Map<string, StyleMatch>();
  for (const match of [...found.map(list => list[0]), ...found.flat()]) {
    if (match && !shown.has(sameName(match.label))) shown.set(sameName(match.label), match);
    if (shown.size === limit) break;
  }
  return [...shown.values()];
}

/**
 * The styles that fit one text, best first: its own name exactly, another of its names exactly, a name that starts
 * with it, then one that has it inside. A style's own name comes before another style's alias ("trap music" is the hip-hop
 * style before the dance one also called that); among equals, the shorter name (the plain style before its offshoots).
 * A short text (under 4 letters) is only looked for at the start of a name: "rai" is not in "straight edge".
 */
function matching(typed: string): StyleMatch[] {
  const key = styleKey(typed);
  if (!key) return [];
  const inside = (name: string) => key.length >= 4 && name.includes(key);
  const found: { style: Style; as?: string; rank: number; length: number }[] = [];
  for (const entry of KEYED) {
    let rank = entry.name === key ? 0 : entry.name.startsWith(key) ? 2 : inside(entry.name) ? 4 : 9;
    let as: string | undefined;
    for (const { alias, key: aliasKey } of entry.aliases) {
      const aliasRank = aliasKey === key ? 1 : aliasKey.startsWith(key) ? 3 : inside(aliasKey) ? 5 : 9;
      if (aliasRank < rank) { rank = aliasRank; as = alias; }
    }
    if (rank < 9) found.push({ style: entry.style, as, rank, length: (as ?? entry.style.name).length });
  }
  found.sort((a, b) => a.rank - b.rank || a.length - b.length || a.style.name.localeCompare(b.style.name));
  return found.map(({ style, as }) => ({ style, label: capitalised(as ?? style.name) }));
}
