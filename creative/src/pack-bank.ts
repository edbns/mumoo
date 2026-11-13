/**
 * Bank world — a picture behind the lyric type system: a Shaders Pro background baked by the Look Lab
 * (Look Bank), a baked photography effect (Our photography), or the person's own picture.
 * Colors come from the picture itself (pack-palette), so type always belongs to the image.
 * If the picture is missing, show downtime copy — never a substitute design.
 *
 * Depth looks draw two layers: the full picture (far) and the cut-out subject (near), moving apart on the beat.
 */
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { LOOK_DOWN_MESSAGE } from './pack-looks';
import { analyzeTexture } from './pack-palette';
import type { PackSceneInput } from './pack-copy';
import { createLiveLook, type LiveLook } from './live-look';
import type { DepthLookId, LiveLookId } from './live-look-deal';
import { DEPTH_STYLES, isDepth } from './live-look-ramp';
import { createTypeLayer, type TimedWord, type TypeStyleId } from './pack-type';

/** Calm styles keep the picture still; the rest let it drift and breathe with the beat. */
const DRIFT: Partial<Record<TypeStyleId, number>> = {
  typewriter: 0.6, minimal: 0.5, editorial: 0.6, wipe: 0.6, slide: 0.6, wave: 0.7,
};

export type BankWorld = {
  root: Container;
  update(input: PackSceneInput): void;
  destroy(): void;
};

export function createBankWorld(): BankWorld {
  const root = new Container();
  const bg = new Sprite();
  bg.anchor.set(0.5);
  bg.position.set(WIDTH / 2, HEIGHT / 2);
  const nearLayer = new Container();
  const nearMain = new Sprite();
  nearMain.anchor.set(0.5);
  const nearEchoA = new Sprite();
  nearEchoA.anchor.set(0.5);
  const nearEchoB = new Sprite();
  nearEchoB.anchor.set(0.5);
  nearLayer.addChild(nearEchoB, nearEchoA, nearMain);
  nearLayer.visible = false;
  const scrim = new Graphics();
  const down = new Container();
  // Each live look is built the first time a card asks for it, then kept: the shelf draws card after card on this one world.
  const looks = new Map<LiveLookId, LiveLook>();
  const type = createTypeLayer();
  root.addChild(bg, nearLayer, scrim, type.root, down);

  // A cut-out is a grey mask (white where the person is), not a picture: Depth's near layer is the photo with that mask as its alpha, made once per pair.
  let subject: { photo: Texture; mask: Texture; texture: Texture } | null = null;
  function subjectOf(photo: Texture, mask: Texture): Texture | null {
    if (subject?.photo === photo && subject.mask === mask) return subject.texture;
    const picture = photo.source.resource as (CanvasImageSource & { width: number; height: number }) | undefined;
    const cut = mask.source.resource as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (!picture || !cut) return null;
    const width = Math.max(1, Math.round(cut.width));
    const height = Math.max(1, Math.round(cut.height));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || !maskCtx) return null;
    ctx.drawImage(picture, 0, 0, width, height);
    maskCtx.drawImage(cut, 0, 0, width, height);
    const colour = ctx.getImageData(0, 0, width, height);
    const alpha = maskCtx.getImageData(0, 0, width, height).data;
    for (let i = 0; i < width * height; i++) colour.data[i * 4 + 3] = alpha[i * 4];
    ctx.putImageData(colour, 0, 0);
    subject?.texture.destroy(true);
    subject = { photo, mask, texture: Texture.from(canvas) };
    return subject.texture;
  }

  function clearDown() {
    while (down.children.length) {
      const child = down.children[0];
      down.removeChild(child);
      child.destroy();
    }
  }

  function paintDown() {
    bg.visible = false;
    bg.filters = [];
    nearLayer.visible = false;
    for (const sprite of [nearMain, nearEchoA, nearEchoB]) {
      sprite.filters = [];
      sprite.visible = false;
    }
    type.paint('minimal', { ms: 0, words: [], beat: 0, beatIndex: 0, energy: 0, seed: 0, ink: '#fff', accent: '#fff', shadow: '#000', font: 'Anton', fontSecondary: 'Anton' });
    scrim.clear();
    scrim.rect(0, 0, WIDTH, HEIGHT);
    scrim.fill({ color: '#0a0a0c' });
    clearDown();
    LOOK_DOWN_MESSAGE.split('\n').forEach((line, i) => {
      const t = new Text({
        text: line,
        style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: i === 0 ? 42 : 28, fill: '#f2f0ea', align: 'center' },
      });
      t.anchor.set(0.5);
      t.alpha = i === 0 ? 0.95 : 0.7;
      t.position.set(WIDTH / 2, HEIGHT * 0.48 + (i - 0.5) * 48);
      down.addChild(t);
    });
  }

  return {
    root,
    update(input) {
      const texture = input.background;
      const style = input.typeStyle;
      if (!texture || !style) {
        paintDown();
        return;
      }
      clearDown();
      const palette = analyzeTexture(texture, input.look);

      // Slow cinematic drift so a still background still feels alive.
      const t = input.ms / 15000;
      const amount = DRIFT[style] ?? 1;
      const cover = Math.max(WIDTH / texture.width, HEIGHT / texture.height) * (1.1 + 0.03 * amount * Math.sin(t * Math.PI));
      const depth = input.look && isDepth(input.look) ? DEPTH_STYLES[input.look as DepthLookId] : null;
      const cutout = depth ? (input.subject ?? (input.cutout ? subjectOf(texture, input.cutout) : null)) : null;

      bg.texture = texture;
      bg.visible = true;
      if (input.look) {
        let look = looks.get(input.look);
        if (!look) looks.set(input.look, look = createLiveLook(input.look));
        look.update({ beat: input.beat, energy: input.energy, ms: input.ms, range: palette.range, lumaRange: palette.lumaRange });
        bg.filters = [look.filter];

        if (depth && cutout && look.nearFilter) {
          const push = (depth.push ?? 18) * input.beat * (0.55 + 0.45 * input.energy);
          const sway = (depth.sway ?? 10) * Math.sin(input.ms / 900) * (0.35 + 0.65 * input.energy);
          const farZoom = (depth.farZoom ?? 0.04) * (1 + input.beat * (depth.farZoom && depth.farZoom >= 0.1 ? 1.4 : 0.5) * input.energy);
          bg.scale.set(cover * (1 + farZoom) * (1 + input.beat * 0.008 * amount * input.energy));
          bg.position.set(
            WIDTH / 2 + (t - 0.5) * 24 * amount - push * 0.35 + sway * 0.25,
            HEIGHT / 2 + Math.sin(t * Math.PI * 2) * 10 * amount,
          );

          const nearCover = Math.max(WIDTH / cutout.width, HEIGHT / cutout.height) * (1.1 + 0.02 * amount * Math.sin(t * Math.PI));
          const placeNear = (sprite: Sprite, ox: number, oy: number, alpha: number, scaleBoost: number) => {
            sprite.texture = cutout;
            sprite.filters = [look!.nearFilter!];
            sprite.scale.set(nearCover * scaleBoost);
            sprite.position.set(
              WIDTH / 2 + (t - 0.5) * 36 * amount + push + sway + ox,
              HEIGHT / 2 + Math.sin(t * Math.PI * 2) * 14 * amount + oy,
            );
            sprite.alpha = alpha;
            sprite.visible = true;
          };
          placeNear(nearMain, 0, 0, 1, 1 + input.beat * 0.01 * input.energy);
          if (depth.echo) {
            placeNear(nearEchoA, -push * 0.55, sway * 0.2, 0.45 + 0.25 * input.beat, 1.02);
            placeNear(nearEchoB, -push * 1.05, -sway * 0.15, 0.22 + 0.2 * input.beat, 1.04);
          } else {
            nearEchoA.visible = false;
            nearEchoB.visible = false;
            nearEchoA.filters = [];
            nearEchoB.filters = [];
          }
          nearLayer.visible = true;
        } else {
          nearLayer.visible = false;
          for (const sprite of [nearMain, nearEchoA, nearEchoB]) {
            sprite.filters = [];
            sprite.visible = false;
          }
          bg.scale.set(cover * (1 + input.beat * 0.012 * amount * input.energy));
          bg.position.set(WIDTH / 2 + (t - 0.5) * 36 * amount, HEIGHT / 2 + Math.sin(t * Math.PI * 2) * 14 * amount);
        }
      } else {
        bg.filters = [];
        nearLayer.visible = false;
        for (const sprite of [nearMain, nearEchoA, nearEchoB]) {
          sprite.filters = [];
          sprite.visible = false;
        }
        bg.scale.set(cover * (1 + input.beat * 0.012 * amount * input.energy));
        bg.position.set(WIDTH / 2 + (t - 0.5) * 36 * amount, HEIGHT / 2 + Math.sin(t * Math.PI * 2) * 14 * amount);
      }

      scrim.clear();
      // The scrim only exists to keep lyrics readable; with lyrics off the background shows as it is.
      if (input.lyrics && palette.scrim.alpha > 0) {
        scrim.rect(0, 0, WIDTH, HEIGHT);
        scrim.fill({ color: palette.scrim.color, alpha: palette.scrim.alpha });
      }

      const words: TimedWord[] = !input.lyrics || !input.phrase ? [] : input.words.length
        ? [...input.words]
        : [{ text: input.phrase, startMs: 0, endMs: 600 }];
      type.paint(style, {
        ms: input.ms,
        words,
        beat: input.beat,
        beatIndex: input.beatIndex,
        energy: input.energy,
        seed: input.layout.seed,
        ink: palette.ink,
        accent: palette.accent,
        shadow: palette.ink.toLowerCase() === '#f7f4ee' ? '#000000' : '#ffffff',
        font: input.font,
        fontSecondary: input.fontSecondary,
      });
    },
    destroy() {
      bg.filters = [];
      for (const sprite of [nearMain, nearEchoA, nearEchoB]) sprite.filters = [];
      subject?.texture.destroy(true);
      subject = null;
      for (const look of looks.values()) {
        look.filter.destroy();
        look.nearFilter?.destroy();
      }
      type.destroy();
      root.destroy({ children: true });
    },
  };
}
