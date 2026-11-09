import { existsSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

/** Whichever headless Chromium Playwright has installed (its revision need not be the one this Playwright asks for). */
export function installedChromium() {
  const caches = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), platform() === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright')];
  for (const cache of caches.filter(path => path && existsSync(path))) {
    for (const folder of readdirSync(cache).filter(name => name.startsWith('chromium_headless_shell-'))) {
      for (const build of readdirSync(join(cache, folder)).filter(name => name.startsWith('chrome-headless-shell-'))) {
        const executable = join(cache, folder, build, 'chrome-headless-shell');
        if (existsSync(executable)) return executable;
      }
    }
  }
  return null;
}

/** A headless Chromium with software WebGL, or null where none is installed. */
export async function launchChromium() {
  const executablePath = installedChromium();
  if (!executablePath) return null;
  return chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}
