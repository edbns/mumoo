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

/**
 * The styles that fit what was typed, best first: its own name exactly, another of its names exactly, a name that starts
 * with it, then one that has it inside. A style's own name comes before another style's alias ("trap music" is the hip-hop
 * style before the dance one also called that); among equals, the shorter name (the plain style before its offshoots).
 */
export function searchStyles(typed: string, limit = 6): StyleMatch[] {
  const key = styleKey(typed);
  if (!key) return [];
  const found: { style: Style; as?: string; rank: number; length: number }[] = [];
  for (const entry of KEYED) {
    let rank = entry.name === key ? 0 : entry.name.startsWith(key) ? 2 : entry.name.includes(key) ? 4 : 9;
    let as: string | undefined;
    for (const { alias, key: aliasKey } of entry.aliases) {
      const aliasRank = aliasKey === key ? 1 : aliasKey.startsWith(key) ? 3 : aliasKey.includes(key) ? 5 : 9;
      if (aliasRank < rank) { rank = aliasRank; as = alias; }
    }
    if (rank < 9) found.push({ style: entry.style, as, rank, length: (as ?? entry.style.name).length });
  }
  found.sort((a, b) => a.rank - b.rank || a.length - b.length || a.style.name.localeCompare(b.style.name));
  const shown = new Map<string, StyleMatch>();
  for (const { style, as } of found) {
    const label = capitalised(as ?? style.name);
    if (!shown.has(sameName(label))) shown.set(sameName(label), { style, label });
    if (shown.size === limit) break;
  }
  return [...shown.values()];
}
