import { Application, Assets, Container, Graphics, Sprite, Text, Texture, VideoSource } from 'pixi.js';
import { reaction, variation, type ReactiveTimeline } from '../assembly';
import { evaluate, type Composition } from '../composition';
import { editorialLook } from './looks';

/** Experimental Pixi path. No ticker or internal wall-clock drives the scene. */
export async function createEditorialScene(canvas: HTMLCanvasElement, timeline: ReactiveTimeline | null, seed: number, includeVideo = true, lyrics?: Composition, footageUrl?: string, footageKind: 'image' | 'video' = 'video') {
  const app = new Application();
  await app.init({ canvas, width: 1080, height: 1920, preference: 'webgl', autoStart: false, sharedTicker: false, antialias: false, background: '#101719' });
  app.ticker.stop();
  const look = editorialLook(seed);
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) { app.destroy(); throw new Error('WebGL is unavailable for the visual proof.'); }
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
  const compatibility = !renderer ? 'unknown' : /swiftshader|software|llvmpipe/i.test(renderer) ? 'software' : 'hardware';
  const texture = await Assets.load<Texture>('/pixi-proof/night-window.png');
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  const image = footageUrl && footageKind === 'image' ? new Image() : null;
  if (image) { image.src = footageUrl!; await image.decode(); }
  else {
  video.src = footageUrl || '/pixi-proof/window-motion.mp4';
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('The proof video could not be decoded.'));
    video.load();
  });
  if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
    app.destroy(); throw new Error('The selected video is invalid or cannot be decoded.');
  }
  }
  const sourceWidth = image ? image.naturalWidth : video.videoWidth;
  const sourceHeight = image ? image.naturalHeight : video.videoHeight;
  if (!sourceWidth || !sourceHeight) { app.destroy(); throw new Error('The selected media could not be decoded.'); }
  const videoSource = image ? null : new VideoSource({ resource: video, autoPlay: false });
  if (videoSource) videoSource.autoUpdate = false;
  const videoTexture = image ? Texture.from(image) : new Texture({ source: videoSource! });
  video.pause();
  const videoLayer = new Sprite(videoTexture);
  if (footageUrl) {
    const scale = Math.max(1080 / sourceWidth, 1920 / sourceHeight);
    videoLayer.scale.set(scale); videoLayer.position.set((1080 - sourceWidth * scale) / 2, (1920 - sourceHeight * scale) / 2);
  } else { videoLayer.width = 1080; videoLayer.height = 1920; }
  videoLayer.alpha = footageUrl ? 1 : 0.15;
  if (!footageUrl) videoLayer.blendMode = 'screen';
  const background = new Sprite(texture);
  background.visible = !footageUrl;
  background.tint = look.tint;
  background.width = 1080; background.height = 1920;
  app.stage.addChild(background);
  app.stage.addChild(videoLayer);
  const foreground = new Container();
  foreground.visible = !footageUrl;
  const detail = new Sprite(texture);
  detail.width = 1080; detail.height = 1920;
  foreground.addChild(detail);
  const mask = new Graphics().rect(look.maskX, 350, look.maskWidth, 1220).fill(0xffffff);
  app.stage.addChild(foreground, mask);
  foreground.mask = mask;
  const light = new Graphics().rect(0, 0, 1080, 1920).fill({ color: look.light, alpha: 0.09 });
  light.blendMode = 'screen';
  app.stage.addChild(light);
  const lyric = new Text({ text: '', style: { fontFamily: 'Inter Variable', fontSize: 90, fontWeight: '800', fill: '#ffffff', align: 'center', wordWrap: true, wordWrapWidth: 880 } });
  lyric.anchor.set(0.5); lyric.position.set(540, 1200); app.stage.addChild(lyric);
  const direction = variation(seed, 1) < 0.5 ? -1 : 1;
  return {
    compatibility,
    async render(frame: number) {
      if (!Number.isInteger(frame) || frame < 0 || frame >= 450) throw new Error('Invalid proof frame.');
      if (gl.isContextLost()) throw new Error('The WebGL context was lost. Reload to try again.');
      const started = performance.now();
      const beat = reaction(timeline, frame);
      const t = frame / 30;
      const evaluated = performance.now();
      // This proof asset is constant 15 fps: two output frames share one source frame.
      const videoTime = footageUrl ? (t % video.duration) : Math.floor((frame % 90) / 2) / 15;
      if (!image && includeVideo && Math.abs(video.currentTime - videoTime) > 0.001) {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error('Video frame seek timed out.')), 5000);
          video.onseeked = () => { clearTimeout(timer); resolve(); };
          video.currentTime = videoTime;
        });
      }
      if (!image && includeVideo) videoTexture.source.update();
      videoLayer.visible = includeVideo;
      if (footageUrl) {
        // The selected media is the entire scene: center-cover with restrained,
        // frame-derived movement, and no demo artwork showing through.
        const scale = Math.max(1080 / sourceWidth, 1920 / sourceHeight) * (1.015 + 0.008 * beat.energy + 0.004 * beat.beat);
        videoLayer.scale.set(scale);
        videoLayer.position.set((1080 - sourceWidth * scale) / 2, (1920 - sourceHeight * scale) / 2);
      }
      const sought = performance.now();
      const zoom = look.crop + t * 0.001 + beat.energy * 0.01;
      background.scale.set(1080 / texture.width * zoom, 1920 / texture.height * zoom);
      background.x = -20 + direction * Math.sin(t * 0.22) * look.drift;
      foreground.x = direction * Math.sin(t * 0.33) * (5 + beat.beat * 3);
      mask.x = direction * Math.sin(t * 0.18) * 18;
      light.alpha = 0.3 + Math.min(0.25, beat.onset * 0.2 + beat.energy * 0.1);
      lyric.text = lyrics ? evaluate(lyrics, frame).text : '';
      app.render();
      const rendered = performance.now();
      return { evaluationMs: evaluated - started, seekMs: sought - evaluated, renderMs: rendered - sought };
    },
    destroy() { video.pause(); video.removeAttribute('src'); video.load(); app.destroy(false, { children: true }); },
  };
}
