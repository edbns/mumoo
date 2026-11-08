import { HEIGHT, WIDTH } from './composition';

export const PUNCH_PLATE_STYLE_IDS = ['billboard', 'collision'] as const;
export const PUNCH_PLATE_STYLES = new Set<string>(PUNCH_PLATE_STYLE_IDS);

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
const bitmaps = new Map<string, ImageBitmap>();
const bitmapPromises = new Map<string, Promise<ImageBitmap | null>>();

export function resetPunchPlateCache() {
  for (const bitmap of bitmaps.values()) bitmap.close();
  bitmaps.clear();
  bitmapPromises.clear();
  manifestPromise = null;
}

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

export async function loadPunchPlate(id: string): Promise<ImageBitmap | null> {
  if (!isPunchPlateId(id)) return null;
  const cached = bitmaps.get(id);
  if (cached) return cached;
  let pending = bitmapPromises.get(id);
  if (!pending) {
    pending = (async () => {
      const manifest = await loadPunchPlatesManifest();
      const meta = manifest?.plates.find(plate => plate.id === id);
      if (!meta) return null;
      const response = await fetch(`${punchPlatesBase()}/${meta.file}`);
      if (!response.ok) return null;
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      bitmaps.set(id, bitmap);
      return bitmap;
    })().catch(() => null);
    bitmapPromises.set(id, pending);
  }
  return pending;
}

export function getPunchPlate(id: string | undefined): ImageBitmap | null {
  if (!id) return null;
  return bitmaps.get(id) ?? null;
}

/** Cover-crop draw into the 1080×1920 frame, then a dark scrim so punch type stays readable. */
export function drawPunchPlateBackground(
  ctx: CanvasRenderingContext2D,
  plate: CanvasImageSource,
  scrim = 0.52,
) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const source = plate as CanvasImageSource & { width?: number; height?: number; videoWidth?: number; videoHeight?: number };
  const sw = Number(source.videoWidth || source.width || WIDTH);
  const sh = Number(source.videoHeight || source.height || HEIGHT);
  const scale = Math.max(WIDTH / Math.max(1, sw), HEIGHT / Math.max(1, sh));
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (WIDTH - dw) / 2;
  const dy = (HEIGHT - dh) / 2;
  ctx.drawImage(plate, dx, dy, dw, dh);
  ctx.fillStyle = `rgba(0,0,0,${Math.max(0, Math.min(0.85, scrim))})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}
