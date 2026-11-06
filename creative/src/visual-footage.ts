import { frameMotion } from './human-observation';

export type VisualSample = {
  offsetMs: number;
  meanLuma: number;
  contrast: number;
  motionScore: number;
  edgeDensity: number;
  aspectFit: 'vertical' | 'horizontal' | 'square';
};

function event(video: HTMLVideoElement, name: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); video.removeEventListener(name, done); video.removeEventListener('error', fail); signal.removeEventListener('abort', fail); };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Footage could not be inspected.')); };
    const timer = setTimeout(fail, 12000);
    video.addEventListener(name, done, { once: true }); video.addEventListener('error', fail, { once: true }); signal.addEventListener('abort', fail, { once: true });
    if (signal.aborted) fail();
  });
}

function stats(data: Uint8ClampedArray) {
  let lumaSum = 0, lumaSquares = 0, edges = 0;
  const count = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    lumaSum += luma; lumaSquares += luma * luma;
    if (i >= 64 * 4) {
      const prev = (0.2126 * data[i - 64 * 4] + 0.7152 * data[i - 64 * 4 + 1] + 0.0722 * data[i - 64 * 4 + 2]) / 255;
      if (Math.abs(luma - prev) > 0.08) edges++;
    }
  }
  const meanLuma = lumaSum / count;
  const contrast = Math.min(1, Math.sqrt(Math.max(0, lumaSquares / count - meanLuma ** 2)) * 4);
  return { meanLuma, contrast, edgeDensity: Math.min(1, edges / Math.max(1, count - 64)) };
}

/** Sample authorized footage. Reports measured traits only; no semantic scene claims. */
export async function inspectVisualFootage(url: string, signal: AbortSignal): Promise<VisualSample[]> {
  const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto';
  try {
    const loaded = event(video, 'loadeddata', signal); video.src = url; video.load(); await loaded;
    if (!Number.isFinite(video.duration) || video.duration < 2 || !video.videoWidth || !video.videoHeight) throw new Error('Footage is too short.');
    const durationMs = Math.min(180000, Math.floor(video.duration * 1000));
    const offsets = [...new Set([0, Math.floor(durationMs * 0.25), Math.floor(durationMs * 0.5), Math.floor(durationMs * 0.75)].filter(ms => ms <= durationMs - 240))].slice(0, 4);
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('Footage inspection is unavailable.');
    const aspectFit = video.videoHeight > video.videoWidth * 1.15 ? 'vertical' : video.videoWidth > video.videoHeight * 1.15 ? 'horizontal' : 'square';
    async function seek(ms: number) {
      const seconds = Math.min(video.duration - 0.04, Math.max(0, ms / 1000));
      if (Math.abs(video.currentTime - seconds) < 0.001 && video.readyState >= 2) return;
      const done = event(video, 'seeked', signal); video.currentTime = seconds; await done;
    }
    const samples: VisualSample[] = [];
    for (const offsetMs of offsets) {
      await seek(offsetMs); context.drawImage(video, 0, 0, 64, 64); const a = context.getImageData(0, 0, 64, 64).data;
      const first = stats(a);
      await seek(Math.min(offsetMs + 200, durationMs - 40)); context.drawImage(video, 0, 0, 64, 64);
      const motionScore = frameMotion(a, context.getImageData(0, 0, 64, 64).data);
      samples.push({ offsetMs, meanLuma: first.meanLuma, contrast: first.contrast, motionScore, edgeDensity: first.edgeDensity, aspectFit });
    }
    return samples;
  } finally { video.pause(); video.removeAttribute('src'); video.load(); }
}
