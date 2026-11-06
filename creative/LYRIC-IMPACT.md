# Lyric Impact — premium kinetic catalog

Lyric Impact is a lyric-only family. The customer-facing Poster / Punch /
Editorial / Echo experiment has been replaced with an expandable registry of
**28** original kinetic-typography designs.

## Architecture

- `lyric-impact-motion.ts` — shared timing, music signals, easing, text fit.
- `lyric-impact-catalog.ts` — design metadata + one drawer per style.
- `lyric-impact.ts` — `drawLyricImpact` entry used by preview and Mediabunny export.
- `lyric-impact-studio.tsx` — gallery of styles, single live preview, MP4 / ZIP download.

Adding a design: append an id to `IMPACT_VARIANTS` in `composition.ts`, add
metadata + a drawer in `lyric-impact-catalog.ts`. No product rewrite required.

## Behavior

Approved WhisperX cues are grouped into short phrases (punctuation, gaps, five
word limit). Cue boundaries use the first 30 fps frame at or after the
timestamp. Punch-like single-word designs follow individual cue intervals;
phrase designs show the active phrase only during its approved interval.

Beat positions and RMS energy from Music Analysis v1 influence restrained
motion when available; nothing is invented when analysis is missing. Preview
and export share the same deterministic drawer.

## Catalog (28 working)

Architectural: Monument, Billboard, Skyline, Colonnade  
Scale: Telescope, Microscope, Accordion  
Grid: Mosaic, Ticker Wall, Stamp Sheet  
Mask / reveal: Slit Reveal, Circle Iris, Wipe Blade, Type Curtain  
Layer / cutout: Cutout Stack, Stencil, Duotone Split  
Physical: Rubber Band, Gravity Drop, Collision, Wave Deform  
Editorial: Margin Note, Folio, Pull Quote  
Brutal / experimental: Concrete, Overprint, Mirror Axis, Tunnel  

Unfinished / omitted: none in this ship — weak placeholder variants were not
included.

## Product notes

Daily Screens, Human Magnet, Visual Curiosity and Rhythmic Montage are
unchanged. Staging only (`mumoo-staging.netlify.app`). Production mumoo.app is
untouched. Exports are H.264/AAC via Mediabunny; “Download all styles” packages
a ZIP in browser memory.
