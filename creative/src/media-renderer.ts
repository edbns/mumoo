import { evaluate, FPS, HEIGHT, WIDTH, type Composition } from './composition';
import { frameState, validateEditLyrics, type MediaAsset, type MediaEdit, type MediaShot } from './media-timeline';

type Resource = { type: 'image'; node: HTMLImageElement } | { type: 'video'; node: HTMLVideoElement };
async function loadAsset(asset: MediaAsset): Promise<Resource> {
  if (asset.type === 'image') { const image = new Image(); image.crossOrigin = 'anonymous'; image.src = asset.url; await image.decode(); if (!image.naturalWidth || !image.naturalHeight) throw new Error('An image could not be decoded.'); return { type: 'image', node: image }; }
  const video = document.createElement('video'); video.crossOrigin = 'anonymous'; video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = asset.url;
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Video loading timed out.')), 12000); video.onloadeddata = () => { clearTimeout(timer); resolve(); }; video.onerror = () => { clearTimeout(timer); reject(new Error('A video could not be decoded.')); }; video.load(); });
  if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) throw new Error('An invalid video was supplied.');
  return { type: 'video', node: video };
}

export async function createMediaRenderer(canvas: HTMLCanvasElement, edit: MediaEdit, composition: Composition, measure?: (stage: string, ms: number) => void) {
  validateEditLyrics(edit, composition);
  let currentEdit = edit;
  const resources = new Map<string, Resource>();
  try { for (const asset of edit.assets) { if (resources.has(asset.id)) throw new Error('Duplicate media identifier.'); const start = performance.now(); resources.set(asset.id, await loadAsset(asset)); measure?.('media_load', performance.now() - start); } }
  catch (error) { for (const resource of resources.values()) if (resource.type === 'video') { resource.node.pause(); resource.node.removeAttribute('src'); resource.node.load(); } throw error; }
  // Video seeks are asynchronous: draw the complete frame off-screen first so
  // the preview never exposes the cleared canvas while a seek is pending.
  const frameCanvas = document.createElement('canvas'); frameCanvas.width = WIDTH; frameCanvas.height = HEIGHT;
  const context = frameCanvas.getContext('2d'); const target = canvas.getContext('2d');
  if (!context || !target) throw new Error('Canvas is unavailable.');
  async function drawShot(shot: MediaShot, timeMs: number, alpha: number, zoom: number) {
    const resource = resources.get(shot.assetId); if (!resource) throw new Error('An edit asset is unavailable.');
    const element = resource.node;
    if (resource.type === 'video') {
      const shotStart = shot.startFrame === undefined ? shot.startMs : shot.startFrame * 1000 / FPS;
      const local = Math.max(0, (timeMs - shotStart + (shot.sourceStartMs ?? 0)) / 1000) % resource.node.duration;
      if (Math.abs(resource.node.currentTime - local) > 0.001) { const start = performance.now(); await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Video frame seek timed out.')), 5000);
        resource.node.onseeked = () => { clearTimeout(timer); resolve(); }; resource.node.currentTime = local;
      }); measure?.('video_seek', performance.now() - start); }
    }
    const width = resource.type === 'image' ? resource.node.naturalWidth : resource.node.videoWidth;
    const height = resource.type === 'image' ? resource.node.naturalHeight : resource.node.videoHeight;
    const scale = Math.max(WIDTH / width, HEIGHT / height) * zoom;
    context!.save(); context!.globalAlpha = alpha;
    const drawStart = performance.now(); context!.drawImage(element, (WIDTH - width * scale) / 2, (HEIGHT - height * scale) / 2, width * scale, height * scale); context!.restore(); measure?.('draw_image', performance.now() - drawStart);
  }
  return { async render(frame: number) {
    const state = frameState(currentEdit, frame);
    context.fillStyle = '#000'; context.fillRect(0, 0, WIDTH, HEIGHT);
    if (state.previous && state.mix < 1) await drawShot(state.previous, state.timeMs, 1, 1);
    await drawShot(state.shot, state.timeMs, state.mix, 1 + state.impact * 0.014);
    const text = evaluate(composition, frame).text;
    if (text) { context.save(); context.font = '800 112px "Inter Variable"'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.shadowColor = 'rgba(0,0,0,.8)'; context.shadowBlur = 12; context.fillStyle = '#fff'; context.fillText(text, WIDTH / 2, HEIGHT * 0.65, WIDTH * 0.82); context.restore(); }
    const copyStart = performance.now(); target.drawImage(frameCanvas, 0, 0); measure?.('canvas_copy', performance.now() - copyStart);
  }, setEdit(next:MediaEdit) { validateEditLyrics(next,composition);if(next.assets.length!==edit.assets.length || next.assets.some((asset,i)=>asset.id!==edit.assets[i].id || asset.url!==edit.assets[i].url || asset.type!==edit.assets[i].type)) throw new Error('The updated edit uses different footage.');currentEdit=next; }, destroy() { for (const resource of resources.values()) if (resource.type === 'video') { resource.node.pause(); resource.node.removeAttribute('src'); resource.node.load(); } resources.clear(); } };
}
