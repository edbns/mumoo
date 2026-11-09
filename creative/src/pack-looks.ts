/**
 * Baked look backgrounds — static JPEGs produced offline by the Look Lab (`npm run bake:looks`, Shaders.com
 * recipes) and the Photo Lab (`npm run bake:photo-effects`, Shaders Pro image effects on our approved photo).
 * The browser only ever loads an image; it never runs Shaders/WebGPU.
 */
import { punchPlatesBase } from './punch-plates';

export const LOOK_DOWN_MESSAGE = 'This look is temporarily unavailable.\nReload and try again.';

export class LookUnavailableError extends Error {
  constructor(detail: string) {
    super(`${LOOK_DOWN_MESSAGE}\n(${detail})`);
    this.name = 'LookUnavailableError';
  }
}

const LOOK_ID = /^[a-z0-9][a-z0-9-]{0,60}$/;

/** Look Bank background: `bank__<id>.jpg`, baked by the Look Lab from a Shaders Pro preset. */
export function bankBackgroundUrl(bankId: string): string {
  if (!LOOK_ID.test(bankId)) throw new LookUnavailableError('bad bank id');
  return `${punchPlatesBase()}/looks/bank__${bankId}.jpg`;
}

/** Our photography with one Shaders Pro image effect baked on it: `<id>.jpg`, published from punch-plates/effects. */
export function photoEffectUrl(effectId: string): string {
  if (!LOOK_ID.test(effectId)) throw new LookUnavailableError('bad effect id');
  return `${punchPlatesBase()}/effects/${effectId}.jpg`;
}
