/** Bounded source starts at which a whole shot can be played. */
export function humanSampleOffsets(durationMs: number, requiredMs: number): number[] {
  const max = Math.max(0, Math.min(120000, Math.floor(durationMs - requiredMs)));
  return [...new Set([0, Math.floor(max / 2), max])];
}

/** Mean absolute RGB change; this measures pixel change, not human action. */
export function frameMotion(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (!a.length || a.length !== b.length || a.length % 4) throw new Error('Invalid sampled frames.');
  let difference = 0;
  for (let i = 0; i < a.length; i += 4) difference += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  return difference / (a.length / 4 * 3 * 255);
}

type Observation = { offsetMs: number; motion: number; faceX: number | null; faceY: number | null; contrast?: number };
type Face = { boundingBox: { x: number; y: number; width: number; height: number } };
type FaceDetectorConstructor = new (options: { fastMode: boolean; maxDetectedFaces: number }) => { detect: (source: CanvasImageSource) => Promise<Face[]> };

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

export async function inspectHumanFootage(url: string, requiredMs: number, signal: AbortSignal, detectFaces = true, measureContrast = false): Promise<Observation[]> {
  const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto';
  try {
    const loaded = event(video, 'loadeddata', signal); video.src = url; video.load(); await loaded;
    if (!Number.isFinite(video.duration) || video.duration * 1000 < requiredMs || !video.videoWidth || !video.videoHeight) throw new Error('Footage is too short.');
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('Footage inspection is unavailable.');
    const Detector = detectFaces ? (globalThis as typeof globalThis & { FaceDetector?: FaceDetectorConstructor }).FaceDetector : undefined;
    let detector: ReturnType<FaceDetectorConstructor['prototype']['detect']> | undefined;
    const result: Observation[] = [];
    async function seek(ms: number) {
      const seconds = Math.min(video.duration - .04, Math.max(0, ms / 1000));
      if (Math.abs(video.currentTime - seconds) < .001 && video.readyState >= 2) return;
      const done = event(video, 'seeked', signal); video.currentTime = seconds; await done;
    }
    for (const offsetMs of humanSampleOffsets(video.duration * 1000, requiredMs)) {
      await seek(offsetMs); context.drawImage(video, 0, 0, 64, 64); const a = context.getImageData(0, 0, 64, 64).data;
      let faceX: number | null = null, faceY: number | null = null;
      if (Detector) {
        try {
          detector = new Detector({ fastMode: true, maxDetectedFaces: 1 }).detect(video);
          const faces = await Promise.race([detector, new Promise<Face[]>(resolve => setTimeout(() => resolve([]), 1000))]);
          const box = faces[0]?.boundingBox;
          if (box) { faceX = Math.min(1, Math.max(0, (box.x + box.width / 2) / video.videoWidth)); faceY = Math.min(1, Math.max(0, (box.y + box.height / 2) / video.videoHeight)); }
        } catch { /* Optional browser capability. */ }
      }
      let contrast=0;
      if(measureContrast){let sum=0,squares=0;for(let i=0;i<a.length;i+=4){const light=(.2126*a[i]+.7152*a[i+1]+.0722*a[i+2])/255;sum+=light;squares+=light*light;}const count=a.length/4;contrast=Math.min(1,Math.sqrt(Math.max(0,squares/count-(sum/count)**2))*4);}
      await seek(Math.min(offsetMs + 200, video.duration * 1000 - 40)); context.drawImage(video, 0, 0, 64, 64);
      result.push({ offsetMs, motion: frameMotion(a, context.getImageData(0, 0, 64, 64).data), faceX, faceY, ...(measureContrast && {contrast}) });
    }
    return result;
  } finally { video.pause(); video.removeAttribute('src'); video.load(); }
}
