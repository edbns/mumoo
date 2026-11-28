/**
 * Arriving at what an action made: when something the person asked for finishes (their lyrics are synced, their song is in, their
 * link is live), the page glides to it and a soft green ring shows where to look. Two rules keep it from being annoying:
 *   1. Only for the person's own action: `expectArrival()` when they start it, `arriveAt()` when it is done. If they scrolled the page
 *      themselves in between (wheel, touch, scroll keys or the scroll bar), they are looking at something else and the page stays where
 *      they put it. Where the page is says nothing: it also moves when the page around it gets shorter or longer while they wait.
 *   2. The ring (`arrival-cue`, about a second) marks the exact spot, so the eye lands on it at once.
 */

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
const CUE_MS = 1000;
const FADE_MS = 700;
/** The longest a smooth scroll is waited for before the ring shows anyway (a browser without `scrollend`). */
const GLIDE_MS = 900;
/** Room left around what arrives: above it, and below it for the floating dock on phones. */
const ROOM_TOP_PX = 24;
const ROOM_BOTTOM_PX = () => (matchMedia('(max-width: 767px)').matches ? 104 : 24);

let expected: { moved: boolean } | null = null;
let listening = false;
const movedByHand = () => { if (expected) expected.moved = true; };
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
/** A key that scrolls the page, pressed outside a field (in one, the arrows and space are typing). */
const scrollKey = (event: KeyboardEvent) => { if (SCROLL_KEYS.has(event.key) && !typing(event.target)) movedByHand(); };
/** A press on the page itself, not on anything in it, is on its scroll bar. */
const scrollBar = (event: PointerEvent) => { if (event.target === document.documentElement) movedByHand(); };

/** The person started something that will finish with a result to show. */
export function expectArrival() {
  if (typeof window === 'undefined') return;
  if (!listening) {
    listening = true;
    window.addEventListener('wheel', movedByHand, { passive: true });
    window.addEventListener('touchmove', movedByHand, { passive: true });
    window.addEventListener('keydown', scrollKey);
    window.addEventListener('pointerdown', scrollBar);
  }
  expected = { moved: false };
}

/** Forget an action that ended with nothing to show (cancelled, failed). */
export const noArrival = () => { expected = null; };

/**
 * The action is done: glide to `target` (from its top through `through`'s bottom) and ring `cue`. `through` is what must be seen, like the
 * button to the next step: when the two do not fit on screen together, `through` sits at the bottom with as much of `target` above it as fits.
 * Nothing happens unless `expectArrival()` came first and the person has not scrolled since, or when it is already all in view.
 */
export function arriveAt(target: Element | null | undefined, { through, cue = target }: { through?: Element | null; cue?: Element | null } = {}) {
  const waiting = expected;
  expected = null;
  if (!waiting || !target || waiting.moved) return false;
  const end = through ?? target;
  const top = target.getBoundingClientRect().top;
  const bottom = end.getBoundingClientRect().bottom;
  const roomBottom = ROOM_BOTTOM_PX();
  const fits = bottom - top <= window.innerHeight - ROOM_TOP_PX - roomBottom;
  const inView = top >= ROOM_TOP_PX && bottom <= window.innerHeight - roomBottom;
  let glide = false;
  if (!inView) {
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const element of [target, end] as HTMLElement[]) {
      element.style.scrollMarginTop = `${ROOM_TOP_PX}px`;
      element.style.scrollMarginBottom = `${roomBottom}px`;
    }
    // With `through`, it ends at the bottom (all of the target above it when it fits); alone, the target moves the least it must.
    end.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: end !== target ? 'end' : fits ? 'nearest' : 'start' });
    glide = smooth;
  }
  // The ring shows once the page has stopped, so the whole second of it is seen where the eye lands.
  if (cue) (glide ? afterGlide : (show: () => void) => show())(() => ring(cue));
  return true;
}

function afterGlide(show: () => void) {
  let shown = false;
  const once = () => { if (shown) return; shown = true; window.removeEventListener('scrollend', once); show(); };
  window.addEventListener('scrollend', once);
  window.setTimeout(once, GLIDE_MS);
}

function ring(element: Element) {
  element.classList.add('arrival-cue', 'arrival-on');
  window.setTimeout(() => element.classList.remove('arrival-on'), CUE_MS);
  window.setTimeout(() => element.classList.remove('arrival-cue'), CUE_MS + FADE_MS);
}
