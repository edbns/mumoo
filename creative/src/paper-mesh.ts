/**
 * Paper-cutout plate from svg-mesh-3d silhouettes (MIT).
 * Meshes are Baked offline — no runtime triangulation (that blanked preview/export).
 * Path2D solid cuts are the primary paper sheets; baked tris add beat shatter.
 */
import { HEIGHT, WIDTH } from './composition';
import type { AdLayout, AdPalette } from './ad-fonts';
import { BAKED_PAPER_MESHES, type BakedMesh } from './paper-mesh-data';

export type PaperMeshPaint = {
  beat: number;
  energy: number;
  frame: number;
  palette: AdPalette;
  layout: AdLayout;
};

export type PaperMeshPlate = { bg: string; ink: string; accent: string; flipped: false };

function fill(ctx: CanvasRenderingContext2D, color: string) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function paperGrain(ctx: CanvasRenderingContext2D, amount: number, seed: number) {
  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(0.2, amount));
  for (let i = 0; i < 900; i++) {
    const x = (i * 7919 + seed * 17) % WIDTH;
    const y = (i * 9973 + seed * 31) % HEIGHT;
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.85)' : 'rgba(40,20,10,0.65)';
    ctx.fillRect(x, y, 1 + (i % 2), 1);
  }
  ctx.restore();
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = h.length === 3
    ? h.split('').map(c => parseInt(c + c, 16))
    : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return [n[0] || 0, n[1] || 0, n[2] || 0];
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, bl].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Solid SVG silhouette as a paper sheet (Path2D — always paints). */
function paintPathSheet(
  ctx: CanvasRenderingContext2D,
  svgPath: string,
  cx: number,
  cy: number,
  scale: number,
  color: string,
  shadowX: number,
  shadowY: number,
  lift: number,
) {
  const path = new Path2D(svgPath);
  // Paths authored in ~0..500 box; center at 250,250
  const draw = (ox: number, oy: number, fillStyle: string) => {
    ctx.save();
    ctx.translate(cx + ox, cy + oy - lift);
    ctx.scale(scale / 250, scale / 250);
    ctx.translate(-250, -250);
    ctx.fillStyle = fillStyle;
    ctx.fill(path);
    ctx.restore();
  };
  draw(shadowX, shadowY, 'rgba(28,18,10,0.24)');
  draw(0, 0, color);
}

/** Beat shatter from baked svg-mesh triangles. */
function paintMeshShatter(
  ctx: CanvasRenderingContext2D,
  mesh: BakedMesh,
  cx: number,
  cy: number,
  scale: number,
  color: string,
  lift: number,
  explode: number,
) {
  if (explode < 0.01) return;
  ctx.save();
  ctx.globalAlpha = Math.min(0.85, explode * 8);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const cell of mesh.cells) {
    const pts = cell.map(i => mesh.positions[i]);
    if (pts.some(p => !p)) continue;
    let mx = 0;
    let my = 0;
    for (const p of pts) {
      mx += p[0];
      my += p[1];
    }
    mx /= pts.length;
    my /= pts.length;
    pts.forEach((p, i) => {
      const x = cx + (p[0] + mx * explode) * scale;
      const y = cy - (p[1] + my * explode) * scale - lift;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

/**
 * svg-mesh paper cutout — Path2D sheets + baked mesh shatter on the beat.
 */
export function drawSvgMeshPaperCutout(ctx: CanvasRenderingContext2D, p: PaperMeshPaint): PaperMeshPlate {
  const stock = p.palette.wash || '#efe4d0';
  const accent = p.palette.accent;
  const deep = p.palette.bg;
  const ink = '#1a1410';

  // Always paint stock first so a later failure never leaves a blank frame.
  fill(ctx, stock);

  try {
    const flats = [
      mixHex(stock, deep, 0.14),
      mixHex(stock, accent, 0.25),
      mixHex(accent, stock, 0.4),
      mixHex(accent, deep, 0.28),
      mixHex(stock, accent, 0.55),
    ];
    const sheet = BAKED_PAPER_MESHES.sheet;
    const star = BAKED_PAPER_MESHES.star;
    const bird = BAKED_PAPER_MESHES.bird;

    const lift = p.beat * 22 + p.energy * 10;
    const explode = p.beat * 0.05;
    const sway = Math.sin(p.frame / 28) * 4;
    const cx = WIDTH / 2 + p.layout.driftX * 0.06;
    const cy = HEIGHT * 0.48;

    paperGrain(ctx, 0.09, 19);

    const layers = [
      { scale: Math.min(WIDTH, HEIGHT) * 0.5, color: flats[0], liftMul: 0.15, shadow: 10 },
      { scale: Math.min(WIDTH, HEIGHT) * 0.4, color: flats[1], liftMul: 0.4, shadow: 12 },
      { scale: Math.min(WIDTH, HEIGHT) * 0.31, color: flats[2], liftMul: 0.7, shadow: 14 },
      { scale: Math.min(WIDTH, HEIGHT) * 0.23, color: flats[3], liftMul: 1.0, shadow: 16 },
      { scale: Math.min(WIDTH, HEIGHT) * 0.15, color: flats[4], liftMul: 1.35, shadow: 18 },
    ];

    layers.forEach((layer, i) => {
      const x = cx + sway * (i % 2 === 0 ? 0.35 : -0.25);
      paintPathSheet(
        ctx,
        sheet.path,
        x,
        cy,
        layer.scale,
        layer.color,
        layer.shadow * 0.55,
        layer.shadow + lift * 0.15,
        lift * layer.liftMul,
      );
      paintMeshShatter(
        ctx,
        sheet,
        x,
        cy,
        layer.scale,
        layer.color,
        lift * layer.liftMul,
        explode * (0.4 + i * 0.12),
      );
    });

    // Accent star chip
    const starX = WIDTH * 0.74 + sway;
    const starY = HEIGHT * 0.2;
    const starScale = 70 + p.beat * 20;
    paintPathSheet(ctx, star.path, starX, starY, starScale, accent, 8, 10, lift * 1.4);
    paintMeshShatter(ctx, star, starX, starY, starScale, accent, lift * 1.4, explode * 1.3);

    // Bird cut
    const birdX = WIDTH * 0.28 - sway;
    const birdY = HEIGHT * 0.3;
    const birdScale = 90 + p.beat * 12;
    paintPathSheet(ctx, bird.path, birdX, birdY, birdScale, ink, 7, 9, lift * 1.1);
    paintMeshShatter(ctx, bird, birdX, birdY, birdScale, ink, lift * 1.1, explode);

    paperGrain(ctx, 0.1, 7);
  } catch {
    // Keep stock + a single readable accent block so export/preview never go blank.
    ctx.fillStyle = accent;
    ctx.fillRect(WIDTH * 0.15, HEIGHT * 0.35, WIDTH * 0.7, HEIGHT * 0.2);
  }

  return { bg: stock, ink, accent, flipped: false };
}

export function paperFlatsFromPalette(palette: AdPalette): string[] {
  const stock = palette.wash || '#efe4d0';
  return [
    mixHex(stock, palette.bg, 0.12),
    mixHex(stock, palette.accent, 0.22),
    mixHex(palette.accent, stock, 0.4),
  ];
}
