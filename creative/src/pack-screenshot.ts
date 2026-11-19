/**
 * Screenshot: the lyrics as a chat. A phone (21st.dev "Great UI Mobile Mockup" by saurabh-2607, its sizes and colours kept,
 * drawn at the scale of the card) shows a WhatsApp-style chat where each phrase arrives as a message as it is sung, from one
 * side or the other like a real conversation. The contact's photo and name are covered in crayon (nothing is written under
 * it), so it reads at once as a redacted screenshot. The clock and the messages show the time the person made the card. Over the Director's reel, blurred.
 */
import { CanvasTextMetrics, Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js';
import { HEIGHT, WIDTH, type LyricCue } from './composition';
import { phrasesFor } from './lyric-motion';
import { FRAME_UV, NOISE, makeFilter } from './treatment-filter';

export const SCREENSHOT_FONT = 'Inter Variable';
const FACE = `"${SCREENSHOT_FONT}", Inter, "Helvetica Neue", Arial, sans-serif`;
/** The mockup's width at its largest; every size below is the mockup's, in its pixels. */
const MOCK_WIDTH = 285;
/** How long a message takes to pop in. */
const ARRIVE_MS = 260;

type Theme = {
  bar: number; chat: number; pill: number; pillAlpha: number; pillInk: number;
  mine: number; mineInk: number; mineTime: number; mineTimeAlpha: number;
  theirs: number; theirsInk: number; theirsTime: number;
  input: number; inputPill: number; inputInk: number; emoji: number; online: number; avatar: number;
  home: number; homeAlpha: number; chassis: number; buttons: number;
};
const LIGHT: Theme = {
  bar: 0x008069, chat: 0xefeae2, pill: 0xffffff, pillAlpha: 0.9, pillInk: 0x525252,
  mine: 0xdcf8c6, mineInk: 0x171717, mineTime: 0x065f46, mineTimeAlpha: 0.7,
  theirs: 0xffffff, theirsInk: 0x171717, theirsTime: 0xa3a3a3,
  input: 0xf0f2f5, inputPill: 0xffffff, inputInk: 0xa3a3a3, emoji: 0x525252, online: 0xa7f3d0, avatar: 0x047857,
  home: 0xa3a3a3, homeAlpha: 1, chassis: 0x171717, buttons: 0x404040,
};
const DARK: Theme = {
  bar: 0x111b21, chat: 0x0b141a, pill: 0x182229, pillAlpha: 0.9, pillInk: 0xa3a3a3,
  mine: 0x005c4b, mineInk: 0xf5f5f5, mineTime: 0xa7f3d0, mineTimeAlpha: 0.6,
  theirs: 0x202c33, theirsInk: 0xf5f5f5, theirsTime: 0xa3a3a3,
  input: 0x111b21, inputPill: 0x2a3942, inputInk: 0xa3a3a3, emoji: 0xa3a3a3, online: 0x34d399, avatar: 0x064e3b,
  home: 0x404040, homeAlpha: 0.8, chassis: 0x0a0a0a, buttons: 0x262626,
};

/** Each variant: the chat's theme, the crayon's colour, and whether the screen is in its phone or fills the card. */
export const SCREENSHOT_LOOK: Record<string, { theme: Theme; crayon: number; phone: boolean }> = {
  'light-black': { theme: LIGHT, crayon: 0x141414, phone: true },
  'light-white': { theme: LIGHT, crayon: 0xf7f7f2, phone: true },
  'dark-white': { theme: DARK, crayon: 0xf7f7f2, phone: true },
  screen: { theme: LIGHT, crayon: 0x141414, phone: false },
};

/** The phone: as wide as the card allows, its bottom clear of the platform's caption and buttons. */
const PHONE = { x: 90, y: 110, w: 900, h: 1560 };

/** Waxy crayon: the strokes thin in fine specks and soft patches, the same on every frame (the scribble stays still). */
const CRAYON = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uSeed;
${FRAME_UV}
${NOISE}
void main(void) {
  vec2 px = vTextureCoord / frameMax() * vec2(${WIDTH}.0, ${HEIGHT}.0);
  float fine = hash(floor(px / 1.6) + uSeed);
  float patchy = noise(px * 0.06 + uSeed);
  float keep = mix(0.62, 1.0, smoothstep(0.2, 0.7, fine * 0.55 + patchy * 0.45));
  finalColor = texture(uTexture, vTextureCoord) * keep;
}
`;

const ICONS = {
  arrow: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  emoji: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9" stroke-width="3"/><line x1="15" y1="9" x2="15.01" y2="9" stroke-width="3"/>',
  wifi: '<path stroke-linecap="round" stroke-linejoin="round" d="M8.111 16.404a5.5 5.5 0 0 1 7.778 0M12 20h0.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>',
} as const;

const hex = (colour: number) => `#${colour.toString(16).padStart(6, '0')}`;

/** A line icon of the mockup (24×24, stroked), `size` px wide, its top left at (x, y). */
function icon(name: keyof typeof ICONS, colour: number, size: number, x: number, y: number, alpha = 1, strokeWidth = 2) {
  const g = new Graphics().svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${hex(colour)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`);
  g.scale.set(size / 24);
  g.position.set(x, y);
  g.alpha = alpha;
  return g;
}

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The clock the card was made at ("HH:MM", 24 hours), as the phone shows it: "10:13" in the status bar, "10:13 AM" on a message. */
export function clockFaces(clock: string | undefined) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock ?? '');
  const hours = match ? Number(match[1]) : 10;
  const minutes = match ? match[2] : '13';
  const twelve = hours % 12 || 12;
  return { status: `${twelve}:${minutes}`, message: `${twelve}:${minutes} ${hours < 12 ? 'AM' : 'PM'}` };
}

/** The time now on this device, for the card's clock. */
export function clockNow(now = new Date()) {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** Each phrase of the song as a message: its words, when it arrives, and whose it is (both sides, in short runs, like a real chat). */
export function chatMessages(cues: readonly LyricCue[], seed: number) {
  const roll = random(seed * 2246822519 + 7);
  let mine = roll() < 0.5;
  const messages = phrasesFor(cues).map((phrase, index) => {
    if (index > 0 && roll() < 0.55) mine = !mine;
    return { text: phrase.words.map(word => word.text.trim()).filter(Boolean).join(' '), atMs: phrase.startMs, mine };
  }).filter(message => message.text);
  if (messages.length > 1 && messages.every(message => message.mine === messages[0].mine)) messages[1].mine = !messages[1].mine;
  return messages;
}

/** Crayon scribbled over a box, back and forth, a little crooked, with a loop or two that runs past its edges. */
function scribble(g: Graphics, box: { x: number; y: number; w: number; h: number }, width: number, colour: number, roll: () => number) {
  const passes = Math.max(6, Math.round(box.h / (width * 0.3)));
  for (let layer = 0; layer < 3; layer++) {
    const lean = (roll() - 0.5) * box.h * 0.5;
    g.moveTo(box.x + roll() * width, box.y + roll() * width * 0.5);
    for (let k = 0; k <= passes; k++) {
      const y = box.y + (k / passes) * box.h + (roll() - 0.5) * width * 0.6;
      const side = (k + layer) % 2 === 0;
      const x = side ? box.x + box.w + (roll() - 0.3) * width * 1.2 : box.x - (roll() - 0.3) * width * 1.2;
      g.lineTo(x, y + (side ? lean : -lean) * 0.15);
    }
    g.stroke({ width: width * (0.9 + roll() * 0.25), color: colour, alpha: 0.95, cap: 'round', join: 'round' });
  }
  // A few quick strokes that overshoot, as a hand does.
  for (let k = 0; k < 3; k++) {
    const y = box.y + roll() * box.h;
    g.moveTo(box.x - width * roll(), y).lineTo(box.x + box.w + width * roll(), y + (roll() - 0.5) * box.h * 0.6);
    g.stroke({ width: width * 0.7, color: colour, alpha: 0.9, cap: 'round' });
  }
  for (let loop = 0; loop < 2; loop++) {
    const cx = box.x + box.w * (0.3 + roll() * 0.4);
    const cy = box.y + box.h * (0.4 + roll() * 0.2);
    const rx = box.w * (0.45 + roll() * 0.15);
    const ry = box.h * (0.5 + roll() * 0.2);
    const turns = 18;
    for (let k = 0; k <= turns; k++) {
      const angle = (k / turns) * Math.PI * 2 * 1.15 + loop;
      const wobble = 1 + (roll() - 0.5) * 0.18;
      const x = cx + Math.cos(angle) * rx * wobble;
      const y = cy + Math.sin(angle) * ry * wobble;
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke({ width: width * 0.6, color: colour, alpha: 0.85, cap: 'round', join: 'round' });
  }
}

export type ScreenshotChat = {
  root: Container;
  update(input: { cues: readonly LyricCue[]; ms: number; seed: number; variant: string; clock?: string }): void;
  destroy(): void;
};

export function createScreenshotChat(): ScreenshotChat {
  const root = new Container();
  root.filterArea = new Rectangle(0, 0, WIDTH, HEIGHT);
  const crayon = makeFilter(CRAYON, 'treatment-crayon', { uSeed: 0 });
  let built: { key: string; bubbles: { holder: Container; atMs: number; height: number; mine: boolean }[]; stackBottom: number; gap: number } | null = null;

  function clear() {
    for (const child of root.removeChildren()) child.destroy({ children: true });
    built = null;
  }

  function build(cues: readonly LyricCue[], seed: number, variant: string, clock: string | undefined) {
    clear();
    const look = SCREENSHOT_LOOK[variant] ?? SCREENSHOT_LOOK['light-black'];
    const { theme } = look;
    const outer = look.phone ? PHONE : { x: 0, y: 0, w: WIDTH, h: HEIGHT };
    const s = outer.w / MOCK_WIDTH;
    const u = (value: number) => value * s;
    const screen = look.phone
      ? { x: outer.x + u(10), y: outer.y + u(10), w: outer.w - u(20), h: outer.h - u(20), radius: u(30) }
      : { x: 0, y: 0, w: WIDTH, h: HEIGHT, radius: 0 };
    const time = clockFaces(clock);
    const style = (size: number, weight: TextStyle['fontWeight'], fill: number, extra: Partial<ConstructorParameters<typeof TextStyle>[0]> = {}) =>
      new TextStyle({ fontFamily: FACE, fontSize: u(size), fontWeight: weight, fill: hex(fill), ...extra });

    if (look.phone) {
      const body = new Graphics();
      for (const [top, height] of [[96, 32], [144, 40], [192, 40]]) body.roundRect(outer.x - u(5), outer.y + u(top), u(2.5), u(height), u(1)).fill({ color: theme.buttons });
      body.roundRect(outer.x + outer.w + u(2.5), outer.y + u(128), u(2.5), u(56), u(1)).fill({ color: theme.buttons });
      body.roundRect(outer.x, outer.y, outer.w, outer.h, u(40)).fill({ color: theme.chassis });
      root.addChild(body);
    }

    const display = new Container();
    const mask = new Graphics().roundRect(screen.x, screen.y, screen.w, screen.h, screen.radius).fill({ color: 0xffffff });
    display.mask = mask;
    root.addChild(mask, display);
    const paint = new Graphics();
    display.addChild(paint);
    paint.rect(screen.x, screen.y, screen.w, screen.h).fill({ color: theme.chat });

    // Status bar: the clock, then signal, wifi and battery.
    const statusH = u(25.75);
    const headerH = u(40);
    paint.rect(screen.x, screen.y, screen.w, statusH + headerH).fill({ color: theme.bar });
    const clockText = new Text({ text: time.status, style: style(11, '700', 0xffffff, { letterSpacing: -u(0.2) }) });
    clockText.position.set(screen.x + u(16), screen.y + u(8));
    display.addChild(clockText);
    const middle = screen.y + u(8) + u(6.9);
    const right = screen.x + screen.w - u(16);
    const battery = new Graphics();
    const bx = right - u(16);
    battery.roundRect(bx + u(16 / 24), middle - u(5) + u(10 / 14), u(18 * 16 / 24), u(12 * 10 / 14), u(2)).stroke({ width: u(1.4), color: 0xffffff });
    battery.roundRect(bx + u(3 * 16 / 24), middle - u(5) + u(3 * 10 / 14), u(11 * 16 / 24), u(8 * 10 / 14), u(1)).fill({ color: 0xffffff });
    battery.moveTo(bx + u(21 * 16 / 24), middle - u(5) + u(4 * 10 / 14)).lineTo(bx + u(21 * 16 / 24), middle - u(5) + u(10 * 10 / 14)).stroke({ width: u(1.4), color: 0xffffff, cap: 'round' });
    const wifiX = bx - u(6) - u(12);
    const signalX = wifiX - u(6) - u(12);
    const signal = new Graphics();
    for (const [x, y, h] of [[2, 16, 5], [7.5, 12, 9], [13, 8, 13], [18.5, 4, 17]]) {
      signal.roundRect(signalX + u(x / 2), middle - u(6) + u(y / 2), u(3.5 / 2), u(h / 2), u(0.25)).fill({ color: 0xffffff });
    }
    display.addChild(battery, signal, icon('wifi', 0xffffff, u(12), wifiX, middle - u(6), 1, 2.5));

    // The chat's header: back, the contact's photo and name (crayoned over), "online", and the call buttons.
    const headerY = screen.y + statusH;
    const headerMiddle = headerY + headerH / 2;
    display.addChild(icon('arrow', 0xffffff, u(16), screen.x + u(12), headerMiddle - u(8), 0.9, 2.5));
    const avatarX = screen.x + u(12 + 16 + 6);
    paint.circle(avatarX + u(14), headerMiddle, u(14)).fill({ color: theme.avatar });
    // Nothing is written under the crayon: the photo's circle and the name's place are only covered.
    const titleX = avatarX + u(28 + 6);
    const titleTop = headerMiddle - u(12.95);
    const nameWidth = u(34 + (seed % 5) * 4);
    const status = new Text({ text: 'online', style: style(9.5, '500', theme.online, { lineHeight: u(9.5) }) });
    status.position.set(titleX, titleTop + u(14.4 + 2));
    display.addChild(status);
    const iconsRight = screen.x + screen.w - u(12);
    for (const [index, name] of (['more', 'phone', 'video'] as const).entries()) {
      const x = iconsRight - u(14) - index * u(14 + 10);
      if (name === 'more') {
        const dots = new Graphics();
        for (const cy of [5, 12, 19]) dots.circle(x + u(7), headerMiddle - u(7) + u((cy * 14) / 24), u((2 * 14) / 24)).fill({ color: 0xffffff, alpha: 0.9 });
        display.addChild(dots);
      } else display.addChild(icon(name, 0xffffff, u(14), x, headerMiddle - u(7), 0.9));
    }

    // The typing bar and the home indicator.
    const homeH = u(12);
    const inputH = u(48);
    const inputY = screen.y + screen.h - homeH - inputH;
    paint.rect(screen.x, inputY, screen.w, inputH + homeH).fill({ color: theme.input });
    paint.roundRect(screen.x + screen.w / 2 - u(48), inputY + inputH + u(2), u(96), u(4), u(2)).fill({ color: theme.home, alpha: theme.homeAlpha });
    display.addChild(icon('emoji', theme.emoji, u(18), screen.x + u(8 + 4), inputY + inputH / 2 - u(9)));
    const pillX = screen.x + u(8 + 26 + 6);
    const micX = screen.x + screen.w - u(8 + 32);
    const pillW = micX - u(6) - pillX;
    paint.roundRect(pillX, inputY + inputH / 2 - u(14), pillW, u(28), u(14)).fill({ color: theme.inputPill });
    const placeholder = new Text({ text: 'Message', style: style(12, '400', theme.inputInk) });
    placeholder.anchor.set(0, 0.5);
    placeholder.position.set(pillX + u(12), inputY + inputH / 2);
    display.addChild(placeholder);
    display.addChild(icon('camera', theme.inputInk, u(16), pillX + pillW - u(12 + 16), inputY + inputH / 2 - u(8)));
    display.addChild(icon('paperclip', theme.inputInk, u(16), pillX + pillW - u(12 + 16 + 8 + 16), inputY + inputH / 2 - u(8)));
    paint.circle(micX + u(16), inputY + inputH / 2, u(16)).fill({ color: 0x00a884 });
    display.addChild(icon('mic', 0xffffff, u(16), micX + u(8), inputY + inputH / 2 - u(8)));

    // "Today", then the messages, newest at the bottom.
    const chatTop = headerY + headerH + u(10);
    const today = new Text({ text: 'Today', style: style(9, '500', theme.pillInk) });
    const pillWidth = today.width + u(20);
    const pillHeight = today.height + u(4);
    paint.roundRect(screen.x + screen.w / 2 - pillWidth / 2, chatTop, pillWidth, pillHeight, pillHeight / 2).fill({ color: theme.pill, alpha: theme.pillAlpha });
    today.anchor.set(0.5);
    today.position.set(screen.x + screen.w / 2, chatTop + pillHeight / 2);
    display.addChild(today);

    const stackTop = chatTop + pillHeight + u(6);
    const stackBottom = inputY - u(10);
    const stack = new Container();
    stack.mask = new Graphics().rect(screen.x, stackTop, screen.w, stackBottom - stackTop).fill({ color: 0xffffff });
    display.addChild(stack.mask as Graphics, stack);
    const maxBubble = (screen.w - u(20)) * 0.85;
    const bubbles = chatMessages(cues, seed).map(message => {
      const ink = message.mine ? theme.mineInk : theme.theirsInk;
      const textStyle = style(11, '400', ink, { lineHeight: u(13.75), wordWrap: true, wordWrapWidth: maxBubble - u(20), breakWords: true });
      const text = new Text({ text: message.text, style: textStyle });
      const timeText = new Text({ text: time.message, style: style(8.5, '400', message.mine ? theme.mineTime : theme.theirsTime) });
      if (message.mine) timeText.alpha = theme.mineTimeAlpha;
      const ticks = message.mine ? u(4 + 12) : 0;
      const textWidth = Math.min(maxBubble - u(20), CanvasTextMetrics.measureText(message.text, textStyle).width);
      const width = Math.max(textWidth, timeText.width + ticks) + u(20);
      const height = u(4) + text.height + u(2) + timeText.height + u(4);
      const holder = new Container();
      const bubble = new Graphics().roundRect(0, 0, width, height, u(12)).fill({ color: message.mine ? theme.mine : theme.theirs });
      bubble.rect(message.mine ? width - u(12) : 0, 0, u(12), u(12)).fill({ color: message.mine ? theme.mine : theme.theirs });
      text.position.set(u(10), u(4));
      timeText.position.set(width - u(10) - ticks - timeText.width, u(4) + text.height + u(2));
      holder.addChild(bubble, text, timeText);
      if (message.mine) {
        const check = new Graphics().svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 11"><path fill="#34b7f1" d="M11.045 0.584961L11.9883 1.52829L5.85833 7.65829L2.55833 4.35829L3.50167 3.41496L5.85833 5.77163L11.045 0.584961ZM14.345 0.584961L15.2883 1.52829L9.15833 7.65829L8.215 6.71496L14.345 0.584961ZM9.15833 9.54496L5.85833 6.24496L6.80167 5.30163L9.15833 7.65829L14.345 2.47163L15.2883 3.41496L9.15833 9.54496Z"/></svg>');
        check.scale.set(u(12) / 16);
        check.position.set(width - u(10) - u(12), timeText.y + timeText.height / 2 - u(12 * 11 / 16) / 2);
        holder.addChild(check);
      }
      holder.pivot.set(message.mine ? width : 0, height);
      holder.x = message.mine ? screen.x + screen.w - u(10) : screen.x + u(10);
      holder.visible = false;
      stack.addChild(holder);
      return { holder, atMs: message.atMs, height, mine: message.mine };
    });

    // The crayon over the photo and the name; "online" stays.
    const marks = new Graphics();
    const roll = random(seed * 374761393 + 11);
    scribble(marks, { x: avatarX, y: headerMiddle - u(12), w: u(28), h: u(24) }, u(6), look.crayon, roll);
    scribble(marks, { x: titleX - u(1), y: titleTop + u(1.5), w: nameWidth + u(6), h: u(12) }, u(5.5), look.crayon, roll);
    const crayoned = new Container();
    crayoned.addChild(marks);
    crayoned.filters = [crayon.filter];
    crayon.set({ uSeed: (seed % 997) / 7 });
    display.addChild(crayoned);

    built = { key: `${variant}|${seed}|${clock ?? ''}`, bubbles, stackBottom, gap: u(6) };
    return built;
  }

  let laidCues: readonly LyricCue[] | null = null;
  return {
    root,
    update({ cues, ms, seed, variant, clock }) {
      const key = `${variant}|${seed}|${clock ?? ''}`;
      const ready = built && built.key === key && laidCues === cues ? built : build(cues, seed, variant, clock);
      laidCues = cues;
      // Newest first, from the bottom up: a message pops in and pushes the ones before it up as it grows.
      let bottom = ready.stackBottom;
      for (let index = ready.bubbles.length - 1; index >= 0; index--) {
        const bubble = ready.bubbles[index];
        const shown = Math.min(1, Math.max(0, (ms - bubble.atMs) / ARRIVE_MS));
        bubble.holder.visible = shown > 0;
        if (!shown) continue;
        const eased = 1 - (1 - shown) ** 3;
        bubble.holder.y = bottom + (1 - eased) * bubble.height * 0.25;
        bubble.holder.alpha = eased;
        bubble.holder.scale.set(0.96 + 0.04 * eased);
        bottom -= (bubble.height + ready.gap) * eased;
      }
    },
    destroy() {
      clear();
      crayon.filter.destroy();
      root.destroy({ children: true });
    },
  };
}
