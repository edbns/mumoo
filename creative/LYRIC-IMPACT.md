# Lyric Impact — kinetic catalog + cinematic worlds

Lyric Impact is a lyric-only family with an expandable registry of **28**
original kinetic-typography designs, plus **3** cinematic visual worlds that
composite under (and lightly over) those animations.

## Architecture

- `lyric-impact-motion.ts` — shared timing, music signals, easing, text fit, `fillScene` world hook.
- `lyric-impact-catalog.ts` — design metadata + one drawer per style (unchanged APIs).
- `lyric-impact-worlds.ts` — visual-world registry, compatibility metadata, background/foreground painters.
- `lyric-impact.ts` — `drawLyricImpact` entry used by preview and Mediabunny export.
- `lyric-impact-studio.tsx` — worlds row + typography gallery, live preview, MP4 / ZIP download.

Adding a typography design: append an id to `IMPACT_VARIANTS`, add metadata + drawer.
Adding a world: append an id to `IMPACT_WORLDS`, add meta + painters + feature pairing.

## Cinematic worlds (3 featured compositions)

| World | Lyric style | Intent |
| --- | --- | --- |
| Cinematic Depth | Tunnel | Parallax planes, camera drift, atmospheric light |
| Material Motion | Collision | Chrome spheres, glass panes, liquid light |
| Editorial Collage | Pull Quote | Masked graphic layers, grain, crop marks |

Worlds reuse Music Analysis v1.1 beats, RMS energy, onsets/transients, and
spectral/low-band hints when available. Motion stays restrained (no violent shake).

Compatibility metadata (`preferredStyles` / `blockedStyles`) prevents obviously
poor pairings; incompatible selections fall back to typography-only.

## Catalog (28 working)

Architectural: Monument, Billboard, Skyline, Colonnade  
Scale: Telescope, Microscope, Accordion  
Grid: Mosaic, Ticker Wall, Stamp Sheet  
Mask / reveal: Slit Reveal, Circle Iris, Wipe Blade, Type Curtain  
Layer / cutout: Cutout Stack, Stencil, Duotone Split  
Physical: Rubber Band, Gravity Drop, Collision, Wave Deform  
Editorial: Margin Note, Folio, Pull Quote  
Brutal / experimental: Concrete, Overprint, Mirror Axis, Tunnel  

## Product notes

Daily Screens, Human Magnet, Visual Curiosity and Rhythmic Montage are
unchanged. Staging only (`mumoo-staging.netlify.app`). Production mumoo.app is
untouched. Exports are H.264/AAC via Mediabunny.
