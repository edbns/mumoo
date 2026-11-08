# MUMOO creative engine

Turns a song into short 9:16 music-ad creatives. Every creative is a lyric video. The browser stays light: heavy work (lyrics, analysis, video rendering) runs in the cloud.

## The flow

1. **Upload** a song (MP3, M4A/AAC, WAV, FLAC, OGG/Opus, AIFF…) and pick the genre. The file is sniffed by its bytes, decoded in the browser and identified by a SHA-256 hash. Only title, artist and the embedded cover art are read; the cover is turned into a few colour numbers (palette, brightness, saturation, warmth) in the browser and the picture itself is never kept or uploaded.
2. **Your clip.** Drag the 15-second window on the waveform. The same page gets the lyrics: *transcribe* or *sync* typed words, in any language, then fix words in the editor and sync again. Lyrics come from `audio-intelligence/modal_lyrics_v2_staging.py` (Whisper + forced alignment) through the `transcribe-lyrics*` Netlify functions.
3. **Creatives.** The song data (language, origin, lyric mood, genre, music analysis) goes to the "brain" (`creatives-pack.ts`, `readSong`), which picks the looks, type and motion. When the file has a cover, the backgrounds closest to its colours lead (`look-fit.ts`). Previews are drawn with Pixi/WebGL.
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
| Song in | `audio-format.ts`, `cover-palette.ts`, `audio.ts`, `lyric-text.ts`, `lyrics-cloud.ts`, `music-analysis-runner.tsx`, `creative-profile.ts` |
| Brain | `creatives-pack.ts`, `look-fit.ts`, `music-intent.ts`, `lyric-mood.ts`, `pack-feedback.ts` |
| Look and motion | `pack-*.ts` (renderer, scenes, type, copy, looks), `ad-fonts.ts`, `ad-punch.ts` (style catalog), `lyric-motion.ts`, `punch-plates.ts` |
| Cloud render | `render.html`, `pack-render-page.ts`, `pack-cloud-export.ts` |
| Contract | `composition.ts` (clip + cues, validation, frame clock) |

## Baking assets

- `npm run bake:plates` runs automatically before `build`; it publishes the cleared photo plates (`punch-plates/`) and their baked looks to `public/`.
- `npm run bake:looks` renders the looks over the plates (needs Playwright Chromium: `npx playwright install chromium --only-shell`).
- `node scripts/measure-looks.mjs` measures the colours of every baked background into `src/look-lab/bank.json`; run it after `bake:looks` so cover matching stays accurate.
- `node scripts/bake-paper-meshes.mjs` regenerates `src/paper-mesh-data.ts`.

## Decisions worth knowing

- Cue contract: at most 120 cues, text up to 48 characters, whole milliseconds, ordered, ending inside the 15 seconds. A cue takes effect on the first frame at or after its start (ceiling division); browser playback shows the frame at or before the audio playhead (floor division).
- The preview and the cloud render run the same Pixi renderer (`pack-renderer.ts`), so what you see is what is encoded.
- Mood is read from lyrics for English, Portuguese, Spanish and French. Other languages still get genre and music-analysis driven looks.
- Inter Variable (UI and type) is bundled with its SIL OFL licence; display faces are bundled `@fontsource` fonts.
