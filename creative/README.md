# MUMOO creative engine

Turns a song into short 9:16 music-ad creatives. Every creative is a lyric video. The browser stays light: heavy work (lyrics, analysis, video rendering) runs in the cloud.

## The flow

1. **Upload** a song (MP3, M4A/AAC, WAV, FLAC, OGG/Opus, AIFF…) and pick the genre. The file is sniffed by its bytes, decoded in the browser and identified by a SHA-256 hash. Only title, artist and the embedded cover art are read; the cover is turned into a few colour numbers (palette, brightness, saturation, warmth) in the browser and the picture itself is never kept or uploaded.
2. **Your clip.** Drag the 15-second window on the waveform. The same page gets the lyrics: *transcribe* or *sync* typed words, in any language, then fix words in the editor and sync again. Lyrics come from `audio-intelligence/modal_lyrics_v2_staging.py` (Whisper + forced alignment) through the `transcribe-lyrics*` Netlify functions.
3. **Creatives.** As soon as the words are final, our own model reads what they mean (`lyric-meaning-cloud.ts` → `read-lyric-meaning*` functions → `modal_lyric_meaning_staging.py`); only three codes come back (attitude, sadness, intensity). The song data (genre, music analysis, lyric meaning, cover) goes to the "brain" (`creatives-pack.ts`, `readSong`), which picks the looks, type and motion. Genre and tempo choose the lane and its pool of looks; within it the attitude of the words ranks the backgrounds by how bright, saturated, warm and contrasty they are (`attitudeFit` in `look-fit.ts`), and the words then grade the chosen look: sad words give duller, cooler, darker colours and softer beat hits, defiant ones warmer and punchier (`mood-grade.ts`, applied in `pack-renderer.ts`, so previews and cloud exports match). When the file has a cover, the backgrounds closest to its colours lead (`look-fit.ts`). Previews are drawn with Pixi/WebGL.
4. **Export.** `encode-creative*` Netlify functions start a Modal job that renders the frames with `render.html` (`pack-render-page.ts`) and encodes the MP4 with the song audio.

Staging access is gated by an HMAC token (`netlify/lib/access.mjs`). There are no rate limits: the product is paid, so usage is paid for.

## Run locally

Node 22.17.1.

```sh
npm ci
npm run dev
```

The cloud steps need the Netlify functions and the Modal apps (`audio-intelligence/README.md`). Deploy to staging:

```sh
npm run build
npx netlify-cli deploy --prod --dir=dist --functions=netlify/functions --site=097cfd7a-2b9e-4b7c-9ad2-4092e6694dc5
```

## Checks

```sh
npm run typecheck
npm run lint
npm test
```

`npm test` runs unit tests and the headed product-flow test (`MUMOO_HEADED=1`, macOS, local Brave/Chrome). The product-flow test mocks the network at the Netlify boundary and walks upload → clip → lyrics → creatives.

## Source map

| Area | Files |
| --- | --- |
| App | `main.tsx`, `waveform.tsx`, `lyrics-studio.tsx`, `creatives-pack-studio.tsx` |
| Song in | `audio-format.ts`, `cover-palette.ts`, `audio.ts`, `lyric-text.ts`, `lyrics-cloud.ts`, `lyric-meaning-cloud.ts`, `music-analysis-runner.tsx`, `creative-profile.ts` |
| Brain | `creatives-pack.ts`, `look-fit.ts`, `music-intent.ts`, `lyric-meaning.ts`, `mood-grade.ts`, `pack-feedback.ts` |
| Look and motion | `pack-*.ts` (renderer, scenes, type, copy, looks), `ad-fonts.ts`, `ad-punch.ts` (style catalog), `lyric-motion.ts`, `punch-plates.ts` |
| Cloud render | `render.html`, `pack-render-page.ts`, `pack-cloud-export.ts` |
| Contract | `composition.ts` (clip + cues, validation, frame clock) |
| Admin (`/admin`, light, own page) | `admin.html`, `src/admin/*`, `netlify/functions/admin-*.mjs`, `netlify/lib/admin.mjs` (who may enter: `ADMIN_EMAILS` + a confirmed email), `netlify/lib/library.mjs` (approved photos, videos, GIFs: attitudes, tags, optional genre), `netlify/lib/problems.mjs` + `report-problem.mjs` (failed renders, downloads, sign-ins), migration `009_admin.sql` |
| Live looks | `live-look-deal.ts` (the list of looks, which lanes welcome each, which cards carry one: up to three different looks, dealt only among the library cards, never to a baked effect or to our own approved photos; Refresh deals others; none on gospel, only Arctic on calm or sad songs), `live-look.ts` (the shader, drawn on the picture behind the type, moving with the beat), `live-look-ramp.ts` (the colour ramps and the heat reading, warm skin hot and cold shade cold, as plain code the same colour function as plain code, so `pack-palette.ts` picks ink and scrim against the picture as it is seen), `look` in the worker's `OPT_KEYS` and `LIVE_LOOKS`, migration `012_feedback_look.sql`. Built so far: thermal, arctic, night vision (a soft, banded heat reading, not a photo recoloured). A card with a look is one picture (a library photo or the person's own) or one video played straight through (never cut on the beat); never a baked effect |
| 404 page | `public/404.html` (Netlify serves it for any address the site does not have: a doodled black and white cow, a green 0 for the two o's of MUMOO) |
| Brain feedback | `pack-feedback.ts` (play, select, download, refresh, with the song's codes, never its words), `netlify/functions/pack-feedback.mjs`, `netlify/lib/feedback.mjs` (checks and keeps each action in `brain_feedback`, against the person when signed in; their first download is `nth_download` 1), migration `011_brain_feedback.sql` |
| Library in the templates | `library-pick.ts` (the brain's choice: attitude, then optional genre, then the genre's themes from `genre-guide.ts`), `use-library.ts` (the app asks `/api/library`), `netlify/functions/library-approved.mjs` (approved and ready items only), `netlify/lib/prepare.mjs` (our worker makes videos and GIFs a small clip), `encode-creative.mjs` (`library` in the render request), migrations `010_library_ready.sql`, `013_library_cutout.sql` and `014_library_size.sql` (the picture size: the admin sees a "Low resolution" warning on any item smaller than the 1080×1920 creatives; it can still be approved) (a ready library photo is also cut out by our worker, in the background); wired into Our photography (photos and videos), Riso and Dust (photos with a cut-out, else our approved photos) and Window (photos with a cut-out and clips, each read in the browser by `use-window-library.ts` before the row is dealt; baked effects and backgrounds only when the library has none). Videos are kept at up to 1080x1920 but never enlarged, so a small source video stays soft in the render |

## Baking assets

- `npm run bake:plates` runs automatically before `build`; it publishes the approved photos (`punch-plates/masters`), their cut-outs (`punch-plates/cutouts`, which Dust needs) and the baked backgrounds to `public/`.
- `npm run bake:looks` renders the Moving backgrounds from their Shaders recipes (needs a WebGPU-capable Chrome or Brave).
- `node scripts/measure-looks.mjs` measures the colours of every baked background into `src/look-lab/bank.json`; run it after `bake:looks` so cover matching stays accurate.
- `node scripts/bake-paper-meshes.mjs` regenerates `src/paper-mesh-data.ts`.

## Decisions worth knowing

- Cue contract: at most 120 cues, text up to 48 characters, whole milliseconds, ordered, ending inside the 15 seconds. A cue takes effect on the first frame at or after its start (ceiling division); browser playback shows the frame at or before the audio playhead (floor division).
- The preview and the cloud render run the same Pixi renderer (`pack-renderer.ts`), so what you see is what is encoded.
- The model reads the words in any language it knows (Qwen3 covers 119). Clips with too little text (chants, one phrase) read as neutral. Whisper sometimes mislabels the language of African-language chants; the meaning step is not misled by that, but the label is shown to the creator.
- Inter Variable (UI and type) is bundled with its SIL OFL licence; display faces are bundled `@fontsource` fonts.
- Every visit starts clean. Nothing of a run (song, genre, clip, lyrics, own pictures) survives a refresh; only the cart does, plus the own pictures it still draws from (kept so the cart can be downloaded; the rows never draw them in a new run). `forget-session.ts` removes what an older version left in the browser, and `DELETE /api/uploads?except=` clears the rest on load and on Start over.
- "My song has no lyrics" (step 2): for instrumental songs or only sounds. Nothing is transcribed or read (no cloud cost), `profile.noLyrics` is set, and the creatives page shows only the rows that work without words (`rowsFor` in `creatives-pack.ts`: Our photography, Riso, Dust), with no words and no Lyrics switch. Spray, Window and Pulise are made of the lyrics, so they are not dealt, painted or rendered. Feedback records `lyrics_origin = 'none'`. Choosing another song, or Start over, turns it off.
