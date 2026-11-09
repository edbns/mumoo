/**
 * Pixi pack scenes — WebGL design surface for Creatives Pack.
 * Canvas is only the blit/encode buffer (via Application canvas).
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { HEIGHT, WIDTH } from './composition';
import { fitPackLines } from './pack-text';
import { holdGate, type PackSceneInput } from './pack-copy';
import { createPaperWorld, paintPaperLyrics } from './pack-paper';
import { createRisoWorld } from './pack-riso';
import { createNoirWorld } from './pack-noir';
import { createOilWorld } from './pack-oil';
import { createSlamWorld } from './pack-slam';
import { createBankWorld } from './pack-bank';
import { createPuliseWorld } from './pack-pulise';
import { createDustWorld, type DustPoints, type DustWorld } from './pack-dust';

export type { PackSceneInput } from './pack-copy';

function drawBeast(g: Graphics, color: string) {
  g.clear();
  g.ellipse(0, -20, 120, 110);
  g.fill({ color });
  g.moveTo(-95, -90);
  g.lineTo(-130, -200);
  g.lineTo(-40, -120);
  g.closePath();
  g.fill({ color });
  g.moveTo(95, -90);
  g.lineTo(130, -200);
  g.lineTo(40, -120);
  g.closePath();
  g.fill({ color });
  g.moveTo(-55, 40);
  g.quadraticCurveTo(0, 160, 55, 40);
  g.quadraticCurveTo(0, 70, -55, 40);
  g.closePath();
  g.fill({ color });
  g.ellipse(0, 95, 28, 18);
  g.fill({ color });
  g.ellipse(-48, -30, 22, 16);
  g.ellipse(48, -30, 22, 16);
  g.fill({ color: '#06040a' });
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

export type PackScene = {
  root: Container;
  update(input: PackSceneInput): void;
  destroy(): void;
};

/** Build the pack scene graph once; update() mutates for each frame. */
export function createPackScene(): PackScene {
  const root = new Container();
  const photo = new Sprite();
  photo.anchor.set(0.5);
  photo.position.set(WIDTH / 2, HEIGHT / 2);
  photo.visible = false;
  const bg = new Graphics();
  const world = new Container();
  const props = new Container();
  const lyrics = new Container();
  const paper = createPaperWorld();
  const riso = createRisoWorld();
  const noir = createNoirWorld();
  const oil = createOilWorld();
  const slam = createSlamWorld();
  const bank = createBankWorld();
  bank.root.visible = false;
  const pulise = createPuliseWorld();
  pulise.root.visible = false;
  // The dust world is built from the photo's grains, so it exists once a photo has been read.
  let dust: { points: DustPoints; world: DustWorld } | null = null;
  const dustLayer = new Container();
  dustLayer.visible = false;
  root.addChild(photo, bg, world, paper.root, riso.root, noir.root, oil.root, slam.root, bank.root, pulise.root, dustLayer, props, lyrics);

  const topBar = new Graphics();
  const bottomBar = new Graphics();
  const holdFrame = new Graphics();
  const beastShadow = new Graphics();
  const beast = new Graphics();
  const scratches = new Graphics();

  world.addChild(topBar, bottomBar, holdFrame);
  props.addChild(beastShadow, beast, scratches);

  function clearLyrics() {
    while (lyrics.children.length) {
      const child = lyrics.children[0];
      lyrics.removeChild(child);
      child.destroy();
    }
  }

  function setFlatWorldVisible(on: boolean) {
    bg.visible = on;
    world.visible = on;
    if (!on) photo.visible = false;
  }

  function updateProps(input: PackSceneInput, accent: string) {
    beast.clear();
    beastShadow.clear();
    scratches.clear();
    if (input.prop === 'beast') {
      const onHit = input.beat > 0.22;
      const hit = onHit ? 0.9 + input.beat * 0.4 + input.energy * 0.1 : 0.55 + input.energy * 0.08;
      const alpha = onHit ? 0.95 : 0.28;
      const bob = Math.sin(input.frame / 14) * 6 * (0.2 + input.energy);
      const scale = hit * input.layout.scaleBias;
      beastShadow.position.set(WIDTH / 2 + input.layout.driftX * 0.1 + 10, HEIGHT * 0.38 + bob + 12);
      beastShadow.scale.set(scale);
      beastShadow.alpha = alpha * 0.5;
      drawBeast(beastShadow, accent);
      beast.position.set(WIDTH / 2 + input.layout.driftX * 0.1, HEIGHT * 0.38 + bob);
      beast.scale.set(scale);
      beast.rotation = input.layout.rotate + (onHit ? (input.beat - 0.5) * 0.08 : 0);
      beast.alpha = alpha;
      drawBeast(beast, onHit && input.beat > 0.55 ? '#ffffff' : '#e8e8e8');
    } else if (input.prop === 'scratch') {
      const onHit = input.beat > 0.28;
      const count = 12 + Math.floor(input.energy * 8);
      for (let i = 0; i < count; i++) {
        const seed = (i * 9973 + Math.floor(input.frame / 3) * 7) % 1000;
        const x0 = (i * 173 + seed) % WIDTH;
        const y0 = ((i * 419 + seed * 2) % HEIGHT) * 0.65;
        const len = 70 + (seed % 160) + input.beat * 50;
        const ang = -0.65 + (seed % 100) / 180;
        scratches.moveTo(x0, y0);
        scratches.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
        scratches.stroke({
          width: 2 + input.beat * 2,
          color: accent,
          alpha: onHit ? 0.5 + (i % 3) * 0.12 : 0.06 + (i % 3) * 0.02,
        });
      }
    }
  }

  function updateHoldLyrics(input: PackSceneInput) {
    clearLyrics();
    const hold = holdGate(input.beat);
    const ink = '#f5f5f5';
    if (input.phrase) {
      const ghostFit = fitPackLines(input.phrase, input.font, 320, WIDTH * 1.15, 3);
      const ghost = new Container();
      ghost.position.set(WIDTH / 2, HEIGHT * 0.4);
      ghost.alpha = Math.max(0.12, Math.min(0.5, 0.2 + (1 - hold) * 0.12));
      ghostFit.lines.forEach((line, i) => {
        const t = makeText(line, input.font, ghostFit.size, ink);
        t.position.set(0, (i - (ghostFit.lines.length - 1) / 2) * ghostFit.size * 0.8);
        ghost.addChild(t);
      });
      lyrics.addChild(ghost);
    }
    const hot = input.word || input.phrase;
    const fit = fitPackLines(hot, input.fontSecondary, 130, 860, 3);
    const group = new Container();
    group.position.set(WIDTH / 2, HEIGHT * 0.52);
    group.scale.set((0.94 + input.wordEnter * 0.1 + input.beat * 0.05) * input.layout.scaleBias);
    group.alpha = hold;
    const joined = fit.lines.join(' ');
    const shadow = makeText(joined, input.fontSecondary, fit.size, input.palette.accent);
    shadow.position.set(5, 5);
    group.addChild(shadow);
    fit.lines.forEach((line, i) => {
      const t = makeText(line, input.fontSecondary, fit.size, '#f8f8f8');
      t.position.set(0, (i - (fit.lines.length - 1) / 2) * fit.size * 0.9);
      group.addChild(t);
    });
    lyrics.addChild(group);
  }

  function updatePulise(input: PackSceneInput) {
    setFlatWorldVisible(false);
    paper.root.visible = false;
    riso.root.visible = false;
    noir.root.visible = false;
    oil.root.visible = false;
    slam.root.visible = false;
    bg.clear();
    topBar.clear();
    bottomBar.clear();
    holdFrame.clear();
    beast.clear();
    beastShadow.clear();
    scratches.clear();
    clearLyrics();
    pulise.update(input);
  }

  function updateDust(input: PackSceneInput) {
    if (!input.dustPoints || !input.dust) throw new Error('Dust needs a photo and its two colours.');
    setFlatWorldVisible(false);
    paper.root.visible = false;
    riso.root.visible = false;
    noir.root.visible = false;
    oil.root.visible = false;
    slam.root.visible = false;
    bg.clear();
    topBar.clear();
    bottomBar.clear();
    holdFrame.clear();
    beast.clear();
    beastShadow.clear();
    scratches.clear();
    clearLyrics();
    if (dust?.points !== input.dustPoints) {
      dust?.world.destroy();
      dust = { points: input.dustPoints, world: createDustWorld(input.dustPoints) };
      dustLayer.addChild(dust.world.root);
    }
    dust.world.update({
      ms: input.ms,
      beatsMs: input.beatsMs,
      downbeatsMs: input.downbeatsMs,
      beat: input.beat,
      colors: input.dust,
      font: input.font,
      word: input.lyrics ? input.dustWord : null,
    });
  }

  function updateHold(input: PackSceneInput) {
    paper.root.visible = false;
    riso.root.visible = false;
    noir.root.visible = false;
    oil.root.visible = false;
    slam.root.visible = false;
    setFlatWorldVisible(true);
    bg.clear();
    bg.rect(0, 0, WIDTH, HEIGHT);
    bg.fill({ color: input.palette.bg || '#0c0c10' });
    topBar.clear();
    bottomBar.clear();
    holdFrame.clear();
    holdFrame.rect(48, 48, WIDTH - 96, HEIGHT - 96);
    holdFrame.stroke({ width: 2, color: input.palette.accent, alpha: 0.35 });
    beast.clear();
    beastShadow.clear();
    scratches.clear();
    updateHoldLyrics(input);
  }

  function updatePaper(input: PackSceneInput) {
    setFlatWorldVisible(false);
    riso.root.visible = false;
    noir.root.visible = false;
    oil.root.visible = false;
    slam.root.visible = false;
    paper.root.visible = true;
    bg.clear();
    topBar.clear();
    bottomBar.clear();
    holdFrame.clear();
    paper.update(input);
    updateProps(input, input.palette.accent);
    clearLyrics();
    paintPaperLyrics(lyrics, input);
  }

  function updateRiso(input: PackSceneInput) {
    setFlatWorldVisible(false);
    paper.root.visible = false;
    noir.root.visible = false;
    oil.root.visible = false;
    slam.root.visible = false;
    riso.root.visible = true;
    bg.clear();
    topBar.clear();
    bottomBar.clear();
    holdFrame.clear();
    beast.clear();
    beastShadow.clear();
    scratches.clear();
    clearLyrics();
    riso.update(input);
  }

  function updateNoir(input: PackSceneInput) {
    setFlatWorldVisible(false);
    paper.root.visible = false;
    riso.root.visible = false;
    oil.root.visible = false;
    slam.root.visible = false;
    noir.root.visible = true;
    bg.clear();
    topBar.clear();
    bottomBar.clear();
    holdFrame.clear();
    beast.clear();
    beastShadow.clear();
    scratches.clear();
    clearLyrics();
    noir.update(input);
  }

  function updateOil(input: PackSceneInput) {
    setFlatWorldVisible(false);
    paper.root.visible = false;
    riso.root.visible = false;
    noir.root.visible = false;
    slam.root.visible = false;
    oil.root.visible = true;
    bg.clear();
    topBar.clear();
    bottomBar.clear();
    holdFrame.clear();
    beast.clear();
    beastShadow.clear();
    scratches.clear();
    clearLyrics();
    oil.update(input);
  }

  function updateSlam(input: PackSceneInput) {
    setFlatWorldVisible(false);
    paper.root.visible = false;
    riso.root.visible = false;
    noir.root.visible = false;
    oil.root.visible = false;
    slam.root.visible = true;
    bg.clear();
    topBar.clear();
    bottomBar.clear();
    holdFrame.clear();
    beast.clear();
    beastShadow.clear();
    scratches.clear();
    clearLyrics();
    slam.update(input);
  }

  function updateBank(input: PackSceneInput) {
    setFlatWorldVisible(false);
    paper.root.visible = false;
    riso.root.visible = false;
    noir.root.visible = false;
    oil.root.visible = false;
    slam.root.visible = false;
    bg.clear();
    topBar.clear();
    bottomBar.clear();
    holdFrame.clear();
    beast.clear();
    beastShadow.clear();
    scratches.clear();
    clearLyrics();
    bank.update(input);
  }

  return {
    root,
    update(input: PackSceneInput) {
      // Every world hides the others; the bank world is the one the legacy updaters don't know.
      bank.root.visible = input.base === 'bank';
      pulise.root.visible = input.base === 'pulise';
      dustLayer.visible = input.base === 'dust';
      if (input.base === 'dust') updateDust(input);
      else if (input.base === 'bank') updateBank(input);
      else if (input.base === 'pulise') updatePulise(input);
      else if (input.base === 'hold') updateHold(input);
      else if (input.base === 'paper-cutout') updatePaper(input);
      else if (input.base === 'riso') updateRiso(input);
      else if (input.base === 'noir') updateNoir(input);
      else if (input.base === 'oil') updateOil(input);
      else updateSlam(input);
    },
    destroy() {
      clearLyrics();
      paper.destroy();
      riso.destroy();
      noir.destroy();
      oil.destroy();
      slam.destroy();
      bank.destroy();
      pulise.destroy();
      dust?.world.destroy();
      root.destroy({ children: true });
    },
  };
}
