/**
 * Baked look plates — static JPEGs produced offline by the Look Lab
 * (`npm run bake:looks`, Shaders.com recipes). The browser only ever loads an
 * image; it never runs Shaders/WebGPU.
 */
import { punchPlatesBase } from './punch-plates';

export type LookId = 'noir-mono';

export const LOOK_DOWN_MESSAGE = 'This look is temporarily unavailable.\nReload and try again.';

export class LookUnavailableError extends Error {
  constructor(detail: string) {
    super(`${LOOK_DOWN_MESSAGE}\n(${detail})`);
    this.name = 'LookUnavailableError';
  }
}

/** `/punch-plates/foo-1920.jpg` → `foo-1920`. */
export function plateIdFromUrl(plateUrl: string): string {
  const name = plateUrl.split('?')[0].split('/').pop() ?? '';
  return name.replace(/\.[a-z0-9]+$/i, '');
}

export function lookPlateUrl(lookId: LookId, plateUrl: string): string {
  return `${punchPlatesBase()}/looks/${lookId}__${plateIdFromUrl(plateUrl)}.jpg`;
}

/** Look Bank background: `bank__<id>.jpg`, baked by the Look Lab from a Shaders Pro preset. */
export function bankBackgroundUrl(bankId: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(bankId)) throw new LookUnavailableError('bad bank id');
  return `${punchPlatesBase()}/looks/bank__${bankId}.jpg`;
}
