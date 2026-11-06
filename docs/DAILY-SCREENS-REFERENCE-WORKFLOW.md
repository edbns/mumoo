# Daily Screens: reference research and verification

For each new or materially revised screen, inspect an actual released interface before implementation. Prefer an official product page, app-store screenshot, platform documentation or an accessible licensed research library. Do not use concepts or generated images as evidence of a shipped screen. Respect access controls, rate limits and the source's terms; never scrape restricted collections or redistribute their screenshots without permission. Screenshots and names of real people do not belong in frontend assets or public commits.

## Required record

Update `DAILY-SCREENS-REFERENCE-MANIFEST.json` with the product, platform, exact version only if independently verifiable, state depicted, original URL or private reference locator, publication/capture date when known, inspection date, access and reuse restrictions, observed visual structure, owner review and verification status. A filename is not proof of an app version. An inaccessible or uninspected reference is `blocked` or `not_inspected`, not `verified`. Do not place local absolute paths, credentials or personal data in a public manifest.

## Implementation and review

1. Inspect the actual pixels, describe navigation, safe areas, status bar, typography, icons, message geometry and behavior. Confirm that the state and release belong together.
2. Build original, reusable elements in the existing Canvas renderer. Use approved lyrics only; redact fictional contacts consistently and do not imply platform affiliation.
3. Capture a matching state using the same renderer and fonts used by preview/export. Compare reference and reconstruction side by side. Record source/target aspect ratios, cropping or scaling and measured landmark differences. Inspect multiple timed frames separately from the static state.
4. Run the existing daily-screens tests, headless browser workflow and actual 15-second MP4 validation, checking audio, synchronization, frame parity and the other screens. Report mocks and limitations explicitly.
5. Keep source images and side-by-side comparisons containing third-party screenshots or personal data local/private unless redistribution rights are verified. Record review and approval separately from technical checks.

For a local comparison, from `creative`, run `node scripts/daily-reference-compare.mjs <reference> <rendered-frame> <private-output.png>`. It preserves each input's aspect ratio and includes any source footer; it does not assert visual fidelity or remove personal information. Compare matching content states and manually redact sensitive data before sharing.

## Sources and access observations, 2026-11-06

- [Gummble terms](https://gummble.com/terms): research/internal-use library; no scraping, bulk download, redistribution or bypassing limits. The provider says its MCP is read-only and rate-limited. Its [MCP documentation](https://docs.gummble.com/docs/mcp) describes remote Streamable HTTP and OAuth, and lists Codex support. Its [pricing](https://gummble.com/pricing) lists MCP on paid plans from $9.99/month, not the free tier. No server is configured or tested in this environment. Review tool annotations, data sent in search queries, permissions, account entitlements and terms before connecting. Do not send user lyrics, audio, secrets or private source code in queries. Account access and pricing may change; verify at connection time.
- [Mobbin](https://mobbin.com/): released-interface research library. Existing screenshots supplied by the owner are local references; specific original URLs, capture dates and redistribution permissions are unknown. Do not commit those files. Current account entitlements were not tested.
- [Page Flows](https://pageflows.com/): site returned HTTP 403 to the research tool; account access and terms were not verified. Do not bypass the restriction.
- Official app stores, help pages and platform guidelines: inspect actual screenshots and identify the state and version; availability and reuse permissions vary by source. Guidelines explain conventions but are not automatically proof of a specific app release.

Use only the permitted provider interface at human research scale. Gummble or any other connector requires explicit approval before installation or subscription.
