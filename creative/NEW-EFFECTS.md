# New effects: the plan for the five that are left

For the agent who builds them. Read this whole file first, then `src/halftone-styles.ts` and `src/live-look.ts` (the model to copy), then build **one effect at a time**.

## 0. The rules of the job

1. **One effect per push.** Build it, test it, push it, then stop and tell the owner to test it. Do not start the next one until they say it passes.
2. **Order:** Dither, Glow, Streaks, ASCII, Depth. (Thermal and Halftone are done.)
3. **One effect = one shelf row.** Each row deals that effect in many colourings (palettes, inks, papers, glows) and has its own Refresh, its own Lyrics switch and its own Upload button. Colour is data, not a new effect.
4. **Nothing is a baked image.** Every effect is a live shader drawn over a picture, so it works on any picture, ours or the person's own, and moves with the beat.
5. **Our photography carries no live look.** Never add a look to it. It keeps the library pictures and the baked effects it had before.
6. **Existing ids never change.** The cart, the feedback log (`brain_feedback.look`) and the downloads store look ids as text.
7. Only `pixi.js` 8.22.0 is installed (there is no `pixi-filters`). Add no dependency without asking the owner.
8. The owner reads the result in the browser. Do not tell them it works until you have drawn it in a real browser (section 6).

## 1. What exists today

| Effect | Row | Colourings | Where |
|---|---|---|---|
| Thermal | Thermal | 18 colour ramps (thermal, arctic, night vision, lava, dusk, ...) | `live-look-ramp.ts` (`LOOK_STOPS`), shader `heatSource` in `live-look.ts` |
| Halftone | Halftone | 30 prints (inks, papers, one to four screens, dots, lines, squares) | `halftone-styles.ts` (the table), shader `halftoneSource` in `live-look.ts` |

The pattern you must copy is **Halftone**: a plain-code table of designs (`halftone-styles.ts`), a shader generated from that table (`halftoneSource`), and a colour function written from the same table (`halftoneAverage`) so the palette reader can pick lyric colours.

How a card gets its look:

- `live-look-deal.ts`: `LIVE_LOOKS` lists every look with its `family` (the effect), `title` and the `lanes` that welcome it. `dealLooks(lane, seed, count, family)` deals a row's four cards: never the same look side by side, never one look four times, a new look on each Refresh, the same deal for the same song and refresh.
- `creatives-pack.ts`: `lookSlots` makes the four cards of an effect's row (from library pictures, or from the person's own picture). The slot is `style: 'filter'` with `look: <id>`.
- `creatives-pack-studio.tsx`: draws the card; `packOpts` passes `look` to the renderer.
- `pack-bank.ts`: builds the look with `createLiveLook(id)` the first time it is needed, calls `look.update({ beat, energy, ms, range })` every frame and sets `bg.filters = [look.filter]`. The lyric type is drawn above the picture, never filtered.
- `pack-palette.ts` calls `lookPixel(look, r, g, b, range)` on a small copy of the picture so the lyric ink and the scrim are chosen against the picture **as the look shows it**. This is why every effect also needs a plain-code colour function.
- The cloud render (`audio-intelligence/modal_creatives_encode_staging.py`) opens `render.html` **from the deployed staging site** in headless Chromium with software WebGL (SwiftShader, no GPU) and renders 450 frames. So the shader that renders is the one on the deployed site, and it is slow: see the budget in section 3.

## 2. The checklist for every new effect

Replace `<fx>` with the effect id (lowercase letters only, for example `dither`). Do every item. The tests catch most omissions, but not all.

1. **`src/live-look-deal.ts`**
   - Add `'<fx>'` to `LOOK_FAMILIES` and a title to `LOOK_FAMILY_TITLES`.
   - Add the effect's looks to `LIVE_LOOKS` with `family: '<fx>'`. Ids are lowercase letters and digits, prefixed by the effect (`dithergameboy`), because the test finds each builder with `\bid:\s*\(\)\s*=>`.
   - Add a type like `HalftoneLookId` (`Extract<..., { family: '<fx>' }>['id']`).
   - Every lane except gospel must welcome **at least 6 looks** of the effect, or the row repeats itself on Refresh (the test enforces this). Decide on gospel on purpose: the heat effects are not dealt on gospel, the prints are.
2. **A styles file `src/<fx>-styles.ts`** (plain code, no drawing): the table of designs for each look id, and the colour function `<fx>Average(look, r, g, b)` (0-255 in and out) that says what a pixel of the picture looks like on average. Types come from `live-look-deal.ts` (type import only, to avoid a cycle).
3. **`src/live-look-ramp.ts`**: `lookPixel` must answer for the new ids (add an `is<Fx>` guard like `isHalftone`). `LOOK_STOPS` and `LOOK_ROUGHNESS` are typed `Record<HeatLookId, ...>` and need no change.
4. **`src/live-look.ts`**: a `<fx>Source` (GLSL generated from the table) and an `<fx>Look(id)`, and one line per id in `BUILDERS` in the form `id: () => <fx>Look('id'),` (the test looks for exactly this shape).
5. **`audio-intelligence/modal_creatives_encode_staging.py`**: add every id to `LIVE_LOOKS = {...}`. It **must stay on one line** (a test parses it).
6. **`src/creatives-pack.ts`**: add the row to `SHELF_ROWS` (after Halftone; `lyrics: 'switch'`, `upload: '<fx>'`) and `<fx>: () => effectRow('<fx>')` in `recommendRow`. `ShelfRow` already includes every `LookFamily`.
7. **`src/creatives-pack-studio.tsx`**: the row is handled by `isLookRow(row)`. Check that `pictures` (the `Record<PictureUse, ...>`) and `pictureIds` include the new use.
8. **Upload of the person's own picture** (this is a database change, so tell the owner):
   - `src/uploads.ts`: add `'<fx>'` to `PictureUse` and `ACCEPT`.
   - `netlify/lib/uploads.mjs`: add it to `USES` and `MOTION_USES`.
   - `netlify/functions/encode-creative.mjs`: the "kept for a different style" check lets Thermal and Halftone pictures through to style `filter`; add the new use to that list.
   - `db/migrations/0NN_upload_use_<fx>.sql`: drop and re-add `uploads_use_check` with every use (copy `015_upload_use_looks.sql`). Apply it with `npm run db:migrate` and say that you did.
9. **Tests**: extend `scripts/live-look.test.mjs` (see section 5). Fix any test that counts rows (`creatives-pack.test.mjs` counts rows and cards, `no-lyrics.test.mjs` lists the rows that work without words).
10. **`README.md`**: update the "Live looks" row of the table.
11. **Commit and push** to `codex/staging-lyrics`.

## 3. The shader contract and the budget

A look is `{ filter: Filter, update({ beat, energy, ms, range }) }` (`LiveLook` in `live-look.ts`).

- `beat` is 0 to 1, a pulse that is 1 on the beat and decays; `energy` is 0 to 1 and says how loud the song is. Every effect must visibly move with `beat` (size, brightness, offset, threshold: the owner decides nothing here, but a still effect is a bug) and must be calm when `energy` is low.
- `ms` is the time in ms, for slow drift. `range` is how dark and how light the picture is (used by Thermal only; ignore it if it is not useful).
- The picture arrives premultiplied: un-premultiply as `seen()` does in the halftone shader, and multiply the result by the original alpha at the end.
- **Size in rows of the picture's height**, never in fixed pixels (`cell = uInputSize.y / rows`), so a small preview and the 1080 x 1920 render look the same.
- **Budget: at most about 24 texture reads per pixel.** The cloud render is software WebGL, 450 frames. Halftone uses 5 reads per screen (3 when there are more than two screens). If an effect needs more (a real bloom), do it in two filter passes with a low-resolution target, and extend `LiveLook` to `filters: Filter[]` and the two places in `pack-bank.ts` that set and destroy `filter`. Tell the owner you did.
- No texture besides the picture, no font file, no network: the preview and the render must draw the same thing. (ASCII therefore draws its characters with maths; see its section.)
- Build constants into the generated GLSL from the table (as `halftoneSource` does) rather than adding uniforms, unless the value changes every frame.
- The palette reader sees colour only. Give it the best honest approximation of the effect as one colour per pixel (the average over a cell). Spatial effects (glow, streaks, ASCII) approximate it as the picture lifted, tinted or mixed with the ink by brightness.

## 4. The five effects

For each effect: what it is, how it is made, the colourings to write (at least 12, more is better, "unlimited" in the owner's words), the lanes, and the traps. Lanes are `quiet`, `dark`, `techno`, `party`, `general`, `gospel`.

### 4.1 Dither (row "Dither")

**What it is.** The picture reduced to a few flat colours, with the in-between tones made by a pattern of pixels, as old computers and receipt printers did. Chunky square pixels, hard edges.

**How.** Pixelate to a grid (`rows` of blocks, default 120; block size also changes on the beat by one step). For each block read the picture's colour, then compare its brightness with a threshold from a matrix before choosing a palette colour.
- Matrices: Bayer 2x2, 4x4 and 8x8 (write them as constant arrays in GLSL or compute them with the bit-interleave formula), a noise threshold (`fract(sin(...))` or interleaved gradient noise), and a diagonal-line threshold. Each colouring picks one.
- Palette: 2 to 16 colours. Find the two nearest colours in the palette (brightness order) and let the threshold choose between them. Palettes are listed brightest-last so a gradient palette works.
- `levels` and `contrast` shape the tones before the threshold. The beat nudges the threshold bias (+/- 0.08 times energy) so the picture flashes, and adds one block size on strong beats.

**Colourings.** 1-bit black on white (Mac classic), white on black, Game Boy (four greens), CGA magenta-cyan-white, CGA green, EGA, Commodore 64, Apple II, PICO-8 (16), Amiga, thermal receipt (black on cream), blueprint (white on blue), amber CRT, sunset (four warm colours), vapor (purple, pink, cyan), forest, newspaper duotone, neon (black plus hot pink and cyan), gold on black, "own colours" (the picture's own colours reduced to 8 or 16 by a fixed palette).

**Lanes.** Most of them everywhere except gospel (receipt, 1-bit and sunset also on gospel).

**Palette reader.** The expected colour of a tone with a threshold matrix is a mix of the two nearest palette colours in the proportion of the tone, which is the same as sampling a gradient through the palette by brightness. Write it that way.

**Traps.** Do not make it look like Halftone (round dots, one ink): Dither is square pixels and a palette. Do not blur the blocks; edges stay hard. Keep the block grid aligned to the picture, not rotated.

### 4.2 Glow (row "Glow")

**What it is.** Light bleeding out of the bright parts of the picture: neon, dream, bloom, a night-club haze.

**How.** Extract the bright part (smooth threshold), blur it wide (two rings of 8 taps at two radii on a golden-angle spiral is enough, about 20 reads; if that is too slow use the two-pass route in section 3), tint it, and add it back over the picture, which is first graded (darker, more contrast, a colour cast) so the glow reads.
- Parameters: `threshold`, `radius` (in rows of the picture), `strength`, `tint` (colour or two colours blended by brightness), `grade` (shadows tint, contrast), `chroma` (a small red-blue split of the glow for a prism look).
- Beat: strength and radius swell with `beat`; `energy` lifts the base strength.

**Colourings.** Soft white bloom, hot pink neon, cyan neon, magenta and cyan split, amber street light, gold, ultraviolet, toxic green, red alert, sunset peach, ice blue, rainbow prism (chroma split large), dream (pastel, strong lift, low contrast), noir (very dark grade with a single white glow), club (dark with alternating pink and blue glow by position).

**Lanes.** The strong colours: dark, techno, party, general. The soft ones (bloom, dream, gold, peach): quiet, general, gospel.

**Palette reader.** `base + tint * blurredBrightness`, with the blur approximated by the pixel's own brightness squared (a bright pixel is surrounded by glow).

**Traps.** A glow that washes out the picture makes the lyrics unreadable: keep the grade darkening the midtones and cap the added light (soft clip). Check a very bright picture and a very dark one.

### 4.3 Streaks (row "Streaks")

**What it is.** Light dragged into lines: anamorphic lens streaks, speed lines, light leaks.

**How.** Directional blur of the bright part: 16 to 24 taps along a direction with exponential fall-off, added back over the picture (graded as in Glow). Variants by direction: horizontal (anamorphic), diagonal, vertical (rain, falling light), radial from the centre (zoom, taps along the line to the centre). Optionally two directions at once.
- Parameters: `direction` (degrees, or `radial`), `length` (fraction of the picture width), `threshold`, `tint`, `grade`, `falloff`.
- Beat: the streak stretches to 1.5 times its length on the beat; a slow drift of the angle by +/- 3 degrees with `ms` (smaller on low energy).

**Colourings.** Classic anamorphic blue, warm amber, teal and orange, magenta, white, red laser, green, gold, cyan, violet, prism (each colour channel streaked a bit differently), sunset, ice, "film burn" (orange-red leaks from the edges: streaks seeded from the left and top edges, not from highlights), "rain" (vertical, blue-white).

**Lanes.** Everything except gospel; the speed-line and radial ones on techno, party and general only.

**Palette reader.** Same as Glow with a smaller lift, and only along the streak direction (the average over a cell is the picture plus a weaker tint).

**Traps.** On a picture with no highlights nothing happens: lower the threshold with `range`, or fall back to streaking the brightest 15 percent. Never streak the lyric zone to white.

### 4.4 ASCII (row "ASCII")

**What it is.** The picture rebuilt out of text characters, denser characters where it is brighter (or darker).

**How.** A grid of character cells (`cols` across, default 96, cell aspect 1:2). For each cell read the brightness (and colour) at its centre with 3 taps, choose a character from a ramp ordered by ink density, and draw that character inside the cell.
- **Draw the characters with maths, not a font.** Define a 5 x 7 bitmap for each character as a bit-packed integer (a 35 bit mask fits in two `float`s or an `int` pair), look the pixel up with `step`/bit tests, and keep the set small (about 10 to 12 per ramp). This keeps the preview and the cloud render identical with no texture or font. (If you choose a texture atlas instead, you must extend `make()` in `live-look.ts` for texture resources and make sure the cloud page draws the same font; ask the owner first.)
- Ramps (each colouring picks one): density ` .:-=+*#%@`; binary `01`; blocks (filled squares of 4 sizes); dots (one dot of 4 sizes); slashes `/\|-`; letters (the word "MUMOO" repeated by brightness).
- Beat: the cells in the brightest part change character on the beat (a ramp step up), `energy` drives how many. Optional "rain" variant: columns scroll downward at their own speed with a fading tail.

**Colourings.** Green phosphor on black, amber terminal, white on black, black on paper (typewriter), the picture's own colours on black (colour ASCII), cyan code editor, hot pink on navy, blueprint, matrix rain (green, falling), red alert, gold on black, ice, newsprint grey, "sunset terminal" (orange text on deep purple).

**Lanes.** Dark, techno, party, general for the terminal ones; quiet and general for paper, blueprint and ice; none on gospel.

**Palette reader.** Per pixel: `mix(background, ink, density(brightness))`, where `density` is the ramp's average ink coverage (0 for the space, about 0.55 for `@`).

**Traps.** It is the busiest effect, so the lyric type fights it: confirm the scrim from `pack-palette.ts` is strong enough on a bright picture, and keep ASCII legible at the preview size (cells at least 5 px in a 540 px tall preview, so `cols` at most about 100).

### 4.5 Depth (row "Depth")

**What it is.** The picture split into near and far, with the near part moving against the far part to the beat, as in a 3D photo.

**This is the one that needs more than a shader.** A shader alone has no idea what is near. Two phases:

- **Phase 1 (do this first): a layered effect from the cut-out mask we already have.** Library photos have `cutoutUrl` (the subject's mask, made by the prepare worker). The far layer is the picture, slightly zoomed and blurred and graded; the near layer is the cut-out subject, on top, shifted the other way. Both move on the beat (a push and settle, a slow sway with `ms`). Photos only (no video or GIF): it is `photoOnly`, like Dust and Riso.
- **Phase 2 (only if the owner asks): a real depth map** from a monocular depth model run in the prepare worker (for example Depth Anything V2 Small, which has an Apache-2.0 licence, running on the existing Modal prepare job), stored next to the cut-out, and used for true parallax. Do not start phase 2 on your own: it adds a model and a cost, so ask.

**What phase 1 needs outside the shader.**
- The renderer and the bank world must be given the cut-out: today `pack-renderer.ts` loads a cut-out only for `dust`, `riso` and a Window in person mode (`cutOut = style === 'dust' || ...`), and `pack-bank.ts` draws only one picture. Add a second sprite (the near layer) to the bank world for cards with `look` of the Depth family, or add a new style, whichever is smaller; explain the choice to the owner.
- `encode-creative.mjs` must treat a Depth card like Riso and Dust (`cutOut` true, so the photo and cut-out are both sent). The worker (`check_media`) may need the same rule: read it.
- For the person's own picture, add `'depth'` to `CUTOUT_USES` in `netlify/lib/uploads.mjs` and `photoOnly` in `src/uploads.ts` (and the dev stand-in), as Dust and Riso do.
- The studio must deal Depth only from library photos that have a cut-out, as Riso and Dust do (see `cutOutLibrary` in `recommendRow` and `libraryCutouts` in the studio).

**Colourings** (each is a grade for the far layer, a grade for the near layer and how they move): fog (the far part fades to a colour), tilt shift (far blurred hard), warm near / cool far, silhouette (the near part black against a bright far part), neon outline (a glowing edge round the subject), echo (three trailing copies of the subject on the beat), zoom pulse (far layer zooms on the beat), dream (far layer pastel and soft), gold (far layer gold), noir (black and white far, colour near), spotlight (far layer dark, a soft light behind the subject), double exposure (far layer a second colour ramp).

**Lanes.** All except gospel; silhouette and noir on dark; dream and gold on quiet, general.

**Palette reader.** The average of the two layers over a cell, near layer weighted by the mask; the mask is not available to the reader, so use the far-layer grade and lift by 20 percent towards the near grade.

**Traps.** Never show an empty row: if no photo has a cut-out the row says so (as Dust and Riso do). Cut-out edges are hard: feather the mask by a few pixels in the shader.

## 5. Tests to write

In `scripts/live-look.test.mjs` (read the existing tests for Thermal and Halftone and follow them):
- every look of the effect has a title, welcomes real lanes, and is known to the shader and to the colour function (the existing "every look the page can deal..." test covers the builders and `lookPixel`);
- the worker's `LIVE_LOOKS` equals the page's list (existing test);
- `dealLooks` for the new family: right family only, welcomed lane only, never the same side by side, at least 6 looks per lane, Refresh deals other looks (extend the existing tests, which loop over `FAMILIES`: add the new id there);
- the colour function of the effect: a known dark and a known light colour map to what the design says, every output is 0-255, a flat ink or palette stays flat;
- the row: four cards from library pictures, four cards from the person's own picture (`recommendRow(row, profile, 0, [], null, [], {}, true)`), empty with no library and no upload, empty on a gospel song if the effect has no gospel look;
- upload: the row's `upload` value is the new use.

Then run the whole suite: `npm test` (the last full run: 178 passed, 0 failed) and `npx tsc --noEmit -p .`. Both must be clean before you push.

## 6. How to look at it before you say it works

Tests cannot tell you whether it looks right. Draw it in a real browser:

1. Write a throwaway `look-check.html` in `creative/` that creates a `pixi.js` `Application`, makes a test picture on a canvas (a gradient, a few shapes, a face-coloured circle), creates each look with `createLiveLook(id)`, calls `look.update({ beat: 0.3, energy: 0.5, ms: 1000, range: [0.2, 0.9] })`, puts the filter on a `Sprite` and renders a grid of them. Set `document.title` to `ok` or to the shader error.
2. Run `npx vite --port 5199 --host 127.0.0.1` in the background and open `http://127.0.0.1:5199/look-check.html?ids=a,b,c` in the Cursor browser; take a screenshot and look at it. Use a real library photo as well as the synthetic picture, and a dark one and a bright one.
3. **Delete `look-check.html` and stop the server before committing.**

## 7. Deploying (the order matters)

1. `npm run db:migrate` (only if you added a migration) on the database in `.env.local`, then say so; if the staging site uses another database the owner must run it there.
2. Push to `codex/staging-lyrics`. The site builds on Netlify.
3. Deploy the audio worker **after** the site: `python3 -m modal deploy audio-intelligence/modal_creatives_encode_staging.py -e mumoo-staging`. The worker loads the page from `https://mumoo-staging.netlify.app/render.html`, so a render only shows a new effect once the site has it. The worker also checks every look id against its own `LIVE_LOOKS`, so it must be deployed before downloads of the new looks work.

## 8. What the reviewer will check

- The checklist in section 2, item by item, in the diff.
- That Thermal, Halftone and Our photography still behave exactly as before.
- The effect on at least one dark and one bright picture, in the browser, with the lyrics on top.
- Refresh in the row: new colourings each time, no neighbouring repeats.
- The cloud render of one card of the effect finishes in a reasonable time (`scripts/cloud-render.mjs`; it does not take a `look` yet, so add a `LOOK=<id>` option next to `EFFECT`, a few lines, and run it against the deployed site). If the effect is slower than Halftone by more than 2 times, say so.
- That you told the owner anything they must do by hand (migration on another database, redeploy, a new dependency, a model).
