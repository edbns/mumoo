# Lyric Punch plates

Cleared photo backgrounds for Lyric Impact (billboard / collision first).

## Workflow

1. Drop cleared masters into `masters/` (jpg / png / webp). Optional sidecar `name.json`:

```json
{
  "id": "dusk-avenue",
  "mood": ["cinematic", "dark"],
  "license": "cleared-internal",
  "sourceUrl": "https://…",
  "clearedBy": "you",
  "clearedAt": "2026-11-08"
}
```

2. Bake proxies (1080×1920 JPEG + thumb + `plates.json`):

```bash
npm run bake:plates
```

3. Vite/Netlify serves `public/punch-plates/` (generated, not committed). Masters never ship.

Without masters, the bake script writes four dark gradient placeholders so staging still works.

## Hosting

`npm run build` runs the bake first and Vite publishes `public/punch-plates/` on the Netlify CDN (same site). Masters and bake output stay gitignored.

To serve proxies from external object storage instead, set:

```bash
VITE_PUNCH_PLATES_BASE=https://your-cdn.example/punch-plates
```

Point that URL at a folder that contains `plates.json` plus the baked JPEG files.
