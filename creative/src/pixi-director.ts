import { Application, Sprite, Text, Texture, VideoSource } from 'pixi.js';
import { evaluate, HEIGHT, lyricText, WIDTH, type Composition } from './composition';
import { directorFrame, type DirectorShot, type ExecutableEdit } from './director-plan';

type Footage = { video: HTMLVideoElement; texture: Texture };

/** Execute only validated director instructions. Frame time, not a ticker, drives the scene. */
export async function createPixiDirectorRenderer(canvas: HTMLCanvasElement, edit: ExecutableEdit, composition: Composition) {
  const app = new Application();
  const footage = new Map<string, Footage>();
  let initialized = false;
  const dispose = () => {
    for (const { video, texture } of footage.values()) { video.pause(); video.removeAttribute('src'); video.load(); texture.destroy(true); }
    footage.clear();
    if (initialized) app.destroy(false, { children: true });
  };
  try {
    await app.init({ canvas, width: WIDTH, height: HEIGHT, preference: 'webgl', autoStart: false, sharedTicker: false, antialias: false, background: '#000000' });
    initialized = true; app.ticker.stop();
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) throw new Error('WebGL is unavailable for this video.');
    await document.fonts.load('800 112px "Inter Variable"', lyricText(composition));
    for (const asset of edit.assets) {
      const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = asset.url;
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Video loading timed out.')), 12000);
          video.onloadeddata = () => { clearTimeout(timer); resolve(); };
          video.onerror = () => { clearTimeout(timer); reject(new Error('A video could not be decoded.')); };
          video.load();
        });
        if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) throw new Error('A video has invalid properties.');
        for (const shot of edit.shots.filter(item => item.assetId === asset.id)) {
          if (shot.sourceOutMs > video.duration * 1000 + 2) throw new Error('Footage is shorter than the director source range.');
        }
        const source = new VideoSource({ resource: video, autoPlay: false }); source.autoUpdate = false;
        footage.set(asset.id, { video, texture: new Texture({ source }) });
      } catch (error) { video.pause(); video.removeAttribute('src'); video.load(); throw error; }
    }
    const previous = new Sprite(Texture.EMPTY), current = new Sprite(Texture.EMPTY);
    app.stage.addChild(previous, current);
    const lyric = new Text({ text: '', style: { fontFamily: 'Inter Variable', fontSize: 112, fontWeight: '800', fill: '#ffffff', align: 'center', wordWrap: true, wordWrapWidth: WIDTH * 0.82, dropShadow: { color: '#000000', blur: 12, distance: 0, alpha: 0.8 } } });
    lyric.anchor.set(0.5); lyric.position.set(WIDTH / 2, HEIGHT * 0.65); app.stage.addChild(lyric);
    async function show(sprite: Sprite, shot: DirectorShot, sourceMs: number, scaleMultiplier: number) {
      const resource = footage.get(shot.assetId); if (!resource) throw new Error('Footage is unavailable.');
      const { video, texture } = resource, time = sourceMs / 1000;
      if (time < shot.sourceInMs / 1000 || time >= shot.sourceOutMs / 1000 || time >= video.duration) throw new Error('Frame falls outside the approved source range.');
      if (Math.abs(video.currentTime - time) > 0.001) await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Video frame seek timed out.')), 5000);
        video.onseeked = () => { clearTimeout(timer); resolve(); };
        video.onerror = () => { clearTimeout(timer); reject(new Error('Video frame decoding failed.')); };
        video.currentTime = time;
      });
      texture.source.update(); sprite.texture = texture;
      const scale = Math.max(WIDTH / video.videoWidth, HEIGHT / video.videoHeight) * scaleMultiplier;
      const width = video.videoWidth * scale, height = video.videoHeight * scale;
      sprite.scale.set(scale);
      sprite.position.set(Math.max(WIDTH - width, Math.min(0, WIDTH / 2 - width * shot.crop.x)), Math.max(HEIGHT - height, Math.min(0, HEIGHT / 2 - height * shot.crop.y)));
      sprite.visible = true;
    }
    return {
      async render(frame: number) {
        if (gl.isContextLost()) throw new Error('The WebGL context was lost. Reload and try again.');
        const state = directorFrame(edit, frame);
        previous.visible = false;
        if (state.previous && state.mix < 1) {
          const last = directorFrame(edit, state.previous.endFrame - 1);
          await show(previous, state.previous, last.sourceMs, last.scale);
        }
        await show(current, state.shot, state.sourceMs, state.scale); current.alpha = state.mix;
        lyric.text = evaluate(composition, frame).text;
        app.render();
      },
      destroy: dispose,
    };
  } catch (error) { dispose(); throw error; }
}
