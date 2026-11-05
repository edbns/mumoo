import { evaluate, HEIGHT, WIDTH, type Composition } from './composition';
import { frameState, validateEditLyrics, type MediaAsset, type MediaEdit, type MediaShot } from './media-timeline';

type Resource = { type: 'image'; node: HTMLImageElement } | { type: 'video'; node: HTMLVideoElement };
async function loadAsset(asset: MediaAsset): Promise<Resource> {
  if (asset.type === 'image') { const image = new Image(); image.crossOrigin = 'anonymous'; image.src = asset.url; await image.decode(); if (!image.naturalWidth || !image.naturalHeight) throw new Error('An image could not be decoded.'); return { type: 'image', node: image }; }
  const video = document.createElement('video'); video.crossOrigin = 'anonymous'; video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = asset.url;
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Video loading timed out.')), 12000); video.onloadeddata = () => { clearTimeout(timer); resolve(); }; video.onerror = () => { clearTimeout(timer); reject(new Error('A video could not be decoded.')); }; video.load(); });
  if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) throw new Error('An invalid video was supplied.');
  return { type: 'video', node: video };
}

export async function createMediaRenderer(canvas: HTMLCanvasElement, edit: MediaEdit, composition: Composition) {
  validateEditLyrics(edit, composition);
  const resources = new Map<string, Resource>();
  try { for (const asset of edit.assets) { if (resources.has(asset.id)) throw new Error('Duplicate media identifier.'); resources.set(asset.id, await loadAsset(asset)); } }
  catch (error) { for (const resource of resources.values()) if (resource.type === 'video') { resource.node.pause(); resource.node.removeAttribute('src'); resource.node.load(); } throw error; }
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas is unavailable.');
  async function drawShot(shot: MediaShot, timeMs: number, alpha: number, zoom: number) {
    const resource = resources.get(shot.assetId); if (!resource) throw new Error('An edit asset is unavailable.');
    const element = resource.node;
    if (resource.type === 'video') {
      const local = Math.max(0, (timeMs - shot.startMs) / 1000) % resource.node.duration;
      if (Math.abs(resource.node.currentTime - local) > 0.001) await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Video frame seek timed out.')), 5000);
        resource.node.onseeked = () => { clearTimeout(timer); resolve(); }; resource.node.currentTime = local;
      });
    }
    const width = resource.type === 'image' ? resource.node.naturalWidth : resource.node.videoWidth;
    const height = resource.type === 'image' ? resource.node.naturalHeight : resource.node.videoHeight;
    const scale = Math.max(WIDTH / width, HEIGHT / height) * zoom;
    context!.save(); context!.globalAlpha = alpha;
    context!.drawImage(element, (WIDTH - width * scale) / 2, (HEIGHT - height * scale) / 2, width * scale, height * scale); context!.restore();
  }
  return { async render(frame: number) {
    const state = frameState(edit, frame);
    context.fillStyle = '#000'; context.fillRect(0, 0, WIDTH, HEIGHT);
    if (state.previous && state.mix < 1) await drawShot(state.previous, state.timeMs, 1, 1);
    await drawShot(state.shot, state.timeMs, state.mix, 1 + state.impact * 0.014);
    const text = evaluate(composition, frame).text;
    if (text) { context.save(); context.font = '800 112px "Inter Variable"'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.shadowColor = 'rgba(0,0,0,.8)'; context.shadowBlur = 12; context.fillStyle = '#fff'; context.fillText(text, WIDTH / 2, HEIGHT * 0.65, WIDTH * 0.82); context.restore(); }
  }, destroy() { for (const resource of resources.values()) if (resource.type === 'video') { resource.node.pause(); resource.node.removeAttribute('src'); resource.node.load(); } resources.clear(); } };
}
