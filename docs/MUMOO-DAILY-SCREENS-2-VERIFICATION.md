# Daily Screens 2.0 verification — 2026-11-06

Checkout: `edbns/mumoo` branch `codex/staging-lyrics` commit **`64fe529`**.
Private Brain remains separate at `/Users/sennie/Documents/ChatGPT/mumoo-brain-private` (`fcb0667`); no Brain source was copied into the public tree.
Staging URL: https://mumoo-staging.netlify.app/ (live bundle includes `Dating match`, `Food delivery`, `html2canvas`, `Harbor Noodle`). Production unchanged.

## Results

| Check | Result | Evidence |
|---|---|---|
| 1. Build / typecheck / lint / unit tests | **PASS** | `npm run typecheck` PASS; `npm run lint` PASS; `npm run build` PASS; `node --test scripts/daily-screens.test.mjs` 4/4 PASS |
| 2. Contract / integration | **PASS** | Composition accepts eight variants; Canvas five + DOM three; lyric cue framing unchanged |
| 3. Browser end-to-end (local mocked services) | **PASS** | `MUMOO_HEADLESS=1 node --test scripts/daily-screens-dom-browser.test.mjs` PASS; dating/ride/food previews + downloads |
| 4. Real MP4 (local) | **PASS** | `creative/tmp-daily-dom/mumoo-{dating,ride,food}.mp4` each `h264 1080×1920 450 frames 30/1 aac 15.000s` |
| 5. Staging deploy presence | **PASS** | Pushed `64fe529`; staging assets rotated to `/assets/index-BcJ0pDki.js` + `index-CSz_RnWL.css` with DOM design strings present |
| 5b. Staging acceptance (hosted unlock + real song download) | **NOT TESTED** | Owner-controlled staging auth; no passwords requested or stored |
| 6. Independent review | **NOT TESTED** | Owner creative review of visual fidelity vs Gummble references still required |
| 7. Remaining / unverified | see below | |

## Performance (local headless Chromium)

- Dating export ≈ 52.7 s
- Ride export ≈ 58.3 s
- Food export ≈ 67.6 s

These include html2canvas frame capture + Mediabunny encode for 450 frames.

## Remaining

- Gummble OAuth visual QA still pending owner session (MCP returned 401 in this environment).
- Hosted staging E2E with real WAV/lyrics/Brain unlock **NOT TESTED** here.
- Production (`mumoo.app`) was not modified.
- Full Canvas five ZIP regression browser test was not re-run in this session (unit coverage + existing Canvas path preserved).
