/**
 * The lyric type styles by name, and the faces each needs: the shelf deals them before any drawing code (pack-type.ts, on Pixi) has
 * loaded, so this list stays apart from it.
 */
import type { FontNeed } from './ad-fonts';
import { FX_STYLES, FX_TRAITS, type FxStyleId } from './lyric-fx';

const CLASSIC_STYLES = ['typewriter', 'karaoke', 'stack', 'minimal', 'editorial', 'outline', 'swap', 'poem'] as const;
export type ClassicStyle = (typeof CLASSIC_STYLES)[number];
export const TYPE_STYLES = [...CLASSIC_STYLES, ...FX_STYLES] as const;
export type TypeStyleId = (typeof TYPE_STYLES)[number];

export const isMotion = (style: TypeStyleId): style is FxStyleId => style in FX_TRAITS;

export function typeNeeds(style: TypeStyleId): readonly FontNeed[] {
  if (isMotion(style)) return FX_TRAITS[style].needs;
  return style === 'outline' ? ['heavy'] : [];
}
