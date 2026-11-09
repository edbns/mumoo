/**
 * Look Lab — bake Shaders.com looks into static 1080×1920 JPEGs, OFFLINE.
 *
 * The shipped app never runs WebGPU/Shaders. It loads these JPEGs.
 *
 *   npm run bake:looks                  # every background in src/look-lab/bank.json
 *   npm run bake:looks -- bank-sunrise  # one background
 *
 * Needs a WebGPU-capable Chromium. Uses Brave/Chrome from /Applications
 * (Playwright's headless shell has no WebGPU). Override with LOOK_LAB_BROWSER.
 *
 * Writes: punch-plates/looks/bank__{slug}.jpg
 *         (republished to public/punch-plates/looks by bake-punch-plates.mjs)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const looksDir = join(root, 'punch-plates', 'looks');
const bank = JSON.parse(readFileSync(join(root, 'src', 'look-lab', 'bank.json'), 'utf8'));
const ALL_LOOKS = bank.map(item => `bank-${item.slug}`);

const BROWSERS = [
  process.env.LOOK_LAB_BROWSER,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
].filter(Boolean);

function pickBrowser() {
  const found = BROWSERS.find(path => existsSync(path));
  if (!found) throw new Error('No WebGPU-capable Chrome/Brave found. Set LOOK_LAB_BROWSER.');
  return found;
}

async function main() {
  const wanted = process.argv.slice(2).filter(arg => !arg.startsWith('-'));
  const looks = wanted.length ? wanted : ALL_LOOKS;
  for (const look of looks) if (!ALL_LOOKS.includes(look)) throw new Error(`Unknown look: ${look}`);

  mkdirSync(looksDir, { recursive: true });

  const server = await createServer({
    root,
    logLevel: 'error',
    server: { port: 5199, strictPort: true, host: '127.0.0.1' },
    optimizeDeps: { entries: ['lab.html'], include: ['shaders/js'] },
  });
  await server.listen();

  const executablePath = pickBrowser();
  console.log('look-lab browser:', executablePath);
  const browser = await chromium.launch({
    executablePath,
    headless: false,
    args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--window-size=480,640'],
  });

  let count = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 480, height: 640 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => console.error('lab page error:', error.message));
    await page.goto('http://127.0.0.1:5199/lab.html', { waitUntil: 'load' });
    // Vite may re-optimize deps once and reload; wait for a stable ready flag.
    for (let i = 0; i < 40; i++) {
      try {
        if (await page.evaluate(() => window.__labReady === true)) break;
      } catch { /* navigation in flight */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    for (const look of looks) {
      const started = Date.now();
      const dataUrl = await page.evaluate(l => window.bakeLook(l), look);
      const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
      const file = `bank__${look.slice('bank-'.length)}.jpg`;
      writeFileSync(join(looksDir, file), bytes);
      count++;
      console.log(`baked ${file} (${Math.round(bytes.length / 1024)} KB, ${Date.now() - started} ms)`);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  console.log(`wrote ${count} background(s) → punch-plates/looks. Run \`node scripts/measure-looks.mjs\` to read their colours, then \`npm run bake:plates\` to publish.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
