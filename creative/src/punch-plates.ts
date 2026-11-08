export type PunchPlateMeta = {
  id: string;
  type: 'still';
  file: string;
  thumb: string;
  mood: string[];
  license: string;
  sourceUrl: string;
  clearedBy: string;
  clearedAt: string;
};

export type PunchPlatesManifest = {
  version: 1;
  width: number;
  height: number;
  plates: PunchPlateMeta[];
};

const PLATE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Staging/local: Vite public folder. Override with VITE_PUNCH_PLATES_BASE for external CDN. */
export function punchPlatesBase(): string {
  const env = (import.meta as ImportMeta & { env?: { VITE_PUNCH_PLATES_BASE?: string } }).env?.VITE_PUNCH_PLATES_BASE;
  if (typeof env === 'string' && env.trim()) return env.replace(/\/$/, '');
  return '/punch-plates';
}

export function isPunchPlateId(value: unknown): value is string {
  return typeof value === 'string' && PLATE_ID.test(value);
}

let manifestPromise: Promise<PunchPlatesManifest | null> | null = null;

export async function loadPunchPlatesManifest(): Promise<PunchPlatesManifest | null> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${punchPlatesBase()}/plates.json`)
      .then(async response => {
        if (!response.ok) return null;
        const data = await response.json() as PunchPlatesManifest;
        if (!data || data.version !== 1 || !Array.isArray(data.plates)) return null;
        data.plates = data.plates.filter(plate => plate && isPunchPlateId(plate.id) && plate.type === 'still'
          && typeof plate.file === 'string' && typeof plate.thumb === 'string');
        return data;
      })
      .catch(() => null);
  }
  return manifestPromise;
}
