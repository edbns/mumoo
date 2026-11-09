/**
 * Baked look backgrounds — static JPEGs produced offline by the Look Lab (`npm run bake:looks`, Shaders.com
 * recipes). The browser only ever loads an image; it never runs Shaders/WebGPU.
 */
import { punchPlatesBase } from './punch-plates';

export const LOOK_DOWN_MESSAGE = 'This look is temporarily unavailable.\nReload and try again.';

export class LookUnavailableError extends Error {
  constructor(detail: string) {
    super(`${LOOK_DOWN_MESSAGE}\n(${detail})`);
    this.name = 'LookUnavailableError';
  }
}

/** Look Bank background: `bank__<id>.jpg`, baked by the Look Lab from a Shaders Pro preset. */
export function bankBackgroundUrl(bankId: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(bankId)) throw new LookUnavailableError('bad bank id');
  return `${punchPlatesBase()}/looks/bank__${bankId}.jpg`;
}
