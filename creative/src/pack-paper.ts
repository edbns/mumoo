/**
 * Real paper-cutout plate on Pixi — stacked SVG silhouettes, hard paper shadows,
 * grain, beat lift, cut-paper lyric type. Designed to read as cut paper in one glance.
 */
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { META_SAFE_BOTTOM } from './ad-punch';
import { BAKED_PAPER_MESHES } from './paper-mesh-data';
import { fitPackLines } from './pack-text';
import type { PackSceneInput } from './pack-copy';

function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '');
    const n = h.length === 3
      ? h.split('').map(c => parseInt(c + c, 16))
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    return [n[0] || 0, n[1] || 0, n[2] || 0] as const;
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, bl].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function paintSvg(g: Graphics, pathD: string, color: string, alpha = 1) {
  g.clear();
  g.svg(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${pathD}"/></svg>`);
  g.fill({ color, alpha });
}

function makeText(label: string, font: string, size: number, color: string, alpha = 1) {
  const text = new Text({
    text: label,
    style: {
      fontFamily: font,
      fontSize: size,
      fontWeight: '400',
      fill: color,
      align: 'center',
      wordWrap: false,
    },
  });
  text.anchor.set(0.5);
  text.alpha = alpha;
  return text;
}

function paintGrain(g: Graphics, seed: number, amount: number) {
  g.clear();
  for (let i = 0; i < 900; i++) {
    const x = (i * 7919 + seed * 17) % WIDTH;
    const y = (i * 9973 + seed * 31) % HEIGHT;
    g.rect(x, y, 1 + (i % 2), 1);
    g.fill({
      color: i % 2 ? '#ffffff' : '#28140a',
      alpha: Math.max(0.05, Math.min(0.14, amount)),
    });
  }
}

export type PaperWorld = {
  root: Container;
  update(input: PackSceneInput): void;
  destroy(): void;
};

/** Build persistent paper display objects (reused every frame). */
export function createPaperWorld(): PaperWorld {
  const root = new Container();
  const photo = new Sprite();
  photo.anchor.set(0.5);
  photo.position.set(WIDTH / 2, HEIGHT / 2);
  photo.visible = false;
  const stock = new Graphics();
  const desk = new Graphics();
  const grain = new Graphics();
  const layerHost = new Container();

  function coverPhoto(texture: Texture) {
    photo.texture = texture;
    const scale = Math.max(WIDTH / Math.max(1, texture.width), HEIGHT / Math.max(1, texture.height));
    photo.scale.set(scale);
    photo.visible = true;
  }

  type Sheet = { wrap: Container; shadow: Graphics; fill: Graphics };
  const sheets: Sheet[] = [];
  for (let i = 0; i < 5; i++) {
    const wrap = new Container();
    const shadow = new Graphics();
    const fill = new Graphics();
    shadow.pivot.set(250, 250);
    fill.pivot.set(250, 250);
    wrap.addChild(shadow, fill);
    sheets.push({ wrap, shadow, fill });
    layerHost.addChild(wrap);
  }

  const starWrap = new Container();
  const starShadow = new Graphics();
  const starFill = new Graphics();
  starShadow.pivot.set(250, 250);
  starFill.pivot.set(250, 250);
  starWrap.addChild(starShadow, starFill);

  const birdWrap = new Container();
  const birdShadow = new Graphics();
  const birdFill = new Graphics();
  birdShadow.pivot.set(250, 250);
  birdFill.pivot.set(250, 250);
  birdWrap.addChild(birdShadow, birdFill);

  root.addChild(photo, stock, desk, layerHost, starWrap, birdWrap, grain);

  const sheetPath = BAKED_PAPER_MESHES.sheet.path;
  const starPath = BAKED_PAPER_MESHES.star.path;
  const birdPath = BAKED_PAPER_MESHES.bird.path;
  let lastPaletteKey = '';

  function recolor(colors: string[], accent: string, ink: string) {
    sheets.forEach((sheet, i) => {
      paintSvg(sheet.shadow, sheetPath, '#1c120a', 0.3);
      paintSvg(sheet.fill, sheetPath, colors[i], 1);
      sheet.shadow.position.set(16 + i * 3, 18 + i * 3);
      sheet.fill.position.set(0, 0);
    });
    paintSvg(starShadow, starPath, '#1c120a', 0.3);
    paintSvg(starFill, starPath, accent, 1);
    starShadow.position.set(12, 14);
    starFill.position.set(0, 0);
    paintSvg(birdShadow, birdPath, '#1c120a', 0.3);
    paintSvg(birdFill, birdPath, ink, 1);
    birdShadow.position.set(10, 12);
    birdFill.position.set(0, 0);
  }

  return {
    root,
    update(input: PackSceneInput) {
      const wash = input.palette.wash || '#efe4d0';
      const accent = input.palette.accent;
      const deep = input.palette.bg;
      const ink = '#1a1410';
      const colors = [
        mixHex(wash, deep, 0.08),
        mixHex(wash, accent, 0.2),
        mixHex(accent, wash, 0.32),
        mixHex(accent, deep, 0.18),
        mixHex(wash, accent, 0.5),
      ];
      const key = `${wash}|${accent}|${deep}`;
      if (key !== lastPaletteKey) {
        lastPaletteKey = key;
        recolor(colors, accent, ink);
      }

      const lift = input.beat * 28 + input.energy * 12;
      const sway = Math.sin(input.frame / 26) * 5;
      const cx = WIDTH / 2 + input.layout.driftX * 0.08;
      const cy = HEIGHT * 0.44;

      if (input.plateTexture) coverPhoto(input.plateTexture);
      else photo.visible = false;

      stock.clear();
      stock.rect(0, 0, WIDTH, HEIGHT);
      // Soft paper wash so cutout sheets sit on the cleared still, not a blank field.
      stock.fill({ color: wash, alpha: input.plateTexture ? 0.32 : 1 });

      // Foreground paper ledge — physical stack cue
      desk.clear();
      desk.moveTo(0, HEIGHT * 0.86);
      desk.quadraticCurveTo(WIDTH * 0.5, HEIGHT * 0.82 - lift * 0.25, WIDTH, HEIGHT * 0.86);
      desk.lineTo(WIDTH, HEIGHT);
      desk.lineTo(0, HEIGHT);
      desk.closePath();
      desk.fill({ color: mixHex(deep, wash, 0.4) });
      desk.moveTo(0, HEIGHT * 0.9);
      desk.quadraticCurveTo(WIDTH * 0.5, HEIGHT * 0.87 - lift * 0.15, WIDTH, HEIGHT * 0.9);
      desk.lineTo(WIDTH, HEIGHT);
      desk.lineTo(0, HEIGHT);
      desk.closePath();
      desk.fill({ color: mixHex(accent, deep, 0.22) });

      const scales = [1.08, 0.9, 0.74, 0.58, 0.42];
      sheets.forEach((sheet, i) => {
        const s = (Math.min(WIDTH, HEIGHT) * 0.58 * scales[i]) / 250;
        sheet.wrap.position.set(
          cx + sway * (i % 2 === 0 ? 0.45 : -0.35),
          cy - lift * (0.18 + i * 0.3),
        );
        sheet.wrap.scale.set(s);
        sheet.wrap.rotation = (i % 2 === 0 ? 1 : -1) * (0.025 + input.beat * 0.012);
      });

      starWrap.position.set(WIDTH * 0.78 + sway, HEIGHT * 0.17 - lift * 1.35);
      starWrap.scale.set((100 + input.beat * 28) / 250);
      starWrap.rotation = -0.18 + input.beat * 0.1;

      birdWrap.position.set(WIDTH * 0.2 - sway, HEIGHT * 0.24 - lift * 1.05);
      birdWrap.scale.set((120 + input.beat * 18) / 250);
      birdWrap.rotation = 0.12 - input.beat * 0.06;

      paintGrain(grain, 19, 0.12);
    },
    destroy() {
      root.destroy({ children: true });
    },
  };
}

/** Cut-paper lyric stack — multiple offset sheets + accent chip. */
export function paintPaperLyrics(lyrics: Container, input: PackSceneInput) {
  while (lyrics.children.length) {
    const child = lyrics.children[0];
    lyrics.removeChild(child);
    child.destroy();
  }

  const wash = input.palette.wash || '#efe4d0';
  const accent = input.palette.accent;
  const fit = fitPackLines(input.phrase, input.font, 150, 900, 4);
  const scale = (1 + input.beat * 0.08) * input.layout.scaleBias;
  const cy = input.prop === 'beast' ? HEIGHT * 0.72 : HEIGHT * 0.54;
  const group = new Container();
  group.position.set(WIDTH / 2 + input.layout.driftX * 0.12, Math.min(cy, META_SAFE_BOTTOM - 90));
  group.scale.set(scale);

  const layers: { color: string; dx: number; dy: number; alpha?: number }[] = [
    { color: '#1c120a', dx: 16 + input.beat * 5, dy: 18 + input.beat * 5, alpha: 0.3 },
    { color: accent, dx: 10, dy: 11 },
    { color: wash, dx: 5, dy: 5 },
    { color: '#fffaf2', dx: 0, dy: 0 },
  ];

  layers.forEach(sheet => {
    fit.lines.forEach((line, i) => {
      const y = (i - (fit.lines.length - 1) / 2) * fit.size * 0.88;
      const t = makeText(line, input.font, fit.size, sheet.color, sheet.alpha ?? 1);
      t.position.set(sheet.dx, y + sheet.dy);
      group.addChild(t);
    });
  });

  if (input.word && input.word !== input.phrase) {
    const chipSize = Math.max(48, fit.size * 0.36);
    const chipY = fit.lines.length * fit.size * 0.42 + (1 - input.wordEnter) * 16;
    const a = 0.9 + input.wordEnter * 0.1;
    const chip = new Container();
    chip.position.set(0, chipY);
    chip.alpha = a;
    const tw = Math.min(860, Math.max(120, input.word.length * chipSize * 0.55));
    const plateShadow = new Graphics();
    plateShadow.roundRect(-tw / 2 - 18, -chipSize * 0.55, tw + 36, chipSize * 1.15, 10);
    plateShadow.fill({ color: '#1c120a', alpha: 0.28 });
    plateShadow.position.set(5, 6);
    const plate = new Graphics();
    plate.roundRect(-tw / 2 - 18, -chipSize * 0.55, tw + 36, chipSize * 1.15, 10);
    plate.fill({ color: accent });
    const label = makeText(input.word, input.fontSecondary, chipSize, '#fffaf2');
    chip.addChild(plateShadow, plate, label);
    group.addChild(chip);
  }

  lyrics.addChild(group);
}
