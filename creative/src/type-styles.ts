/**
 * The lyric type styles by name, and the faces each needs: the shelf deals them before any drawing code (pack-type.ts, on Pixi) has
 * loaded, so this list stays apart from it.
 */
import type { FontNeed } from './ad-fonts';
import { FX_STYLES, FX_TRAITS, type FxStyleId } from './lyric-fx';

const CLASSIC_STYLES = ['typewriter', 'karaoke', 'stack', 'minimal', 'editorial', 'outline', 'swap', 'poem'] as const;
export type ClassicStyle = (typeof CLASSIC_STYLES)[number];

/** Styles whose face, colours and motion are locked (pack-presets.ts): the brain picks which, never how they look. */
export const PRESET_STYLES = ['clean', 'brat', 'subtitle', 'impact', 'hollow', 'inked', 'inked-red', 'elegant', 'scramble', 'blur'] as const;
export type PresetStyle = (typeof PRESET_STYLES)[number];

export const TYPE_STYLES = [...CLASSIC_STYLES, ...FX_STYLES, ...PRESET_STYLES] as const;
export type TypeStyleId = (typeof TYPE_STYLES)[number];

/** The styles new videos are dealt; the rest still draw for videos made before. */
export const DEALT_STYLES = [...PRESET_STYLES, 'typewriter', 'swap'] as const satisfies readonly TypeStyleId[];

export const isMotion = (style: TypeStyleId): style is FxStyleId => style in FX_TRAITS;
export const isPreset = (style: TypeStyleId): style is PresetStyle => (PRESET_STYLES as readonly string[]).includes(style);

export function typeNeeds(style: TypeStyleId): readonly FontNeed[] {
  if (isMotion(style)) return FX_TRAITS[style].needs;
  return style === 'outline' ? ['heavy'] : [];
}
