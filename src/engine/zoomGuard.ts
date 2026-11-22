/**
 * Keeps the browser from zooming the page while MouthLife is open, and gives a way back if it is
 * zoomed anyway.
 *
 * iPhone browsers ignore `user-scalable=no` (Safari on purpose, and Chrome on an iPhone is the same
 * engine with the same switch). Two fingers on anything but the play field (Scan and Surge, a
 * sheet, Home's deck) pinch-zoomed the whole page, and once a page is off full size a quick double
 * tap zooms it further. The play field takes every touch for the game (`touch-action: none`), so a
 * pinch back out did nothing: the top bar and the thumbstick stayed off the screen and the player
 * was stuck (found on an iPhone, November 2026).
 *
 * Keeping the page from zooming:
 * 1. `touch-action` in main.css: `pan-x pan-y` on the page and again on everything that scrolls (an
 *    iPhone starts from "any gesture" again inside a scroller), so there is no pinch and no
 *    double-tap zoom, while sheets still scroll.
 * 2. On touch screens WebKit's own `gesturestart` / `gesturechange` events are cancelled (the pinch
 *    itself). A trackpad pinch on a computer is left alone: someone there may need it. (An iPad
 *    counts as a touch screen, so a trackpad pinch on an iPad is cancelled as well.)
 *
 * The way back, if the page is zoomed in anyway (a zoom the browser brought back from the last
 * visit, a browser that knows none of the above):
 * 3. `<html>` gets the class `page-zoomed`, which main.css uses to give every touch back to the
 *    browser, the play field included; pinches are no longer cancelled. A page cannot undo a zoom
 *    by itself on an iPhone (setting the viewport again does nothing there), so the player's own
 *    pinch is the only way back.
 * 4. A picture with no words, two fingertips closing, is drawn in the middle of what is visible,
 *    and the game is told once (main.ts pauses a stage: its top bar may be off the screen).
 * 5. The class and the picture go when the page has stayed at full size for a moment.
 *
 * Nothing here runs per frame: it listens for the viewport changing and for fingers lifting.
 * Browsers with no `visualViewport` (iPhones older than 2019) get steps 1 and 2 only.
 */

/**
 * Zoomed in: the page is wider than the part of it that is visible by more than this.
 *
 * Widths, not the browser's zoom figure: Safari's own text-size setting (the Aa menu) changes that
 * figure while nothing is zoomed, and a guard that believed it would hand the play field's touches
 * to the browser for good. Only a real pinch or double-tap zoom makes the visible part narrower
 * than the page. The margin covers a page width the browser rounded to a whole pixel.
 */
export const ZOOMED_IN_RATIO = 1.005;
/** Where the widths cannot be read, the browser's zoom figure is used, with a wider margin. */
export const ZOOMED_IN_SCALE = 1.02;
/** Full size must hold this long before the guard believes it: a pinch out wobbles on the way. */
export const ZOOM_SETTLE_MS = 400;
/** A zoom must hold this long before the picture is shown and the game is told. */
export const ZOOM_CONFIRM_MS = 300;
/** On `<html>` while the page is zoomed in (see main.css). */
export const PAGE_ZOOMED_CLASS = 'page-zoomed';
/** The picture that says "pinch" (see main.css). */
export const ZOOM_HINT_CLASS = 'zoom-hint';

const isSize = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** `view` is the visible part of the page (`visualViewport`); `pageWidth` is the page's own width. */
export function isZoomedIn(view: { width?: number; scale?: number } | null | undefined, pageWidth?: number | null): boolean {
  if (!view) return false;
  if (isSize(view.width) && isSize(pageWidth)) return pageWidth / view.width > ZOOMED_IN_RATIO;
  return isSize(view.scale) && view.scale > ZOOMED_IN_SCALE;
}

/**
 * Where the picture goes. A fixed element stays with the page, not with what is visible, so its
 * place is worked out: the middle of the visible part, shrunk by the zoom so it keeps its size on
 * the glass.
 */
export function hintPlacement(
  view: { offsetLeft: number; offsetTop: number; width: number; height: number },
  pageWidth: number | null | undefined
): { x: number; y: number; k: number } {
  return {
    x: view.offsetLeft + view.width / 2,
    y: view.offsetTop + view.height / 2,
    k: isSize(pageWidth) && isSize(view.width) ? Math.min(1, view.width / pageWidth) : 1,
  };
}

interface ViewportLike {
  scale: number;
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
  addEventListener(type: 'resize' | 'scroll', listener: () => void): void;
}

export interface GuardHost {
  document: Pick<Document, 'addEventListener' | 'createElement' | 'documentElement' | 'body'>;
  visualViewport?: ViewportLike | null;
  navigator?: { maxTouchPoints?: number } | null;
  addEventListener(type: string, listener: () => void): void;
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export interface GuardOptions {
  /**
   * For checking the way back on a phone: zooming is not held off, so the page can be pinched in
   * and the pause, the picture and the pinch back out can be tried. main.ts offers it in
   * development builds only (`?zoomTest`).
   */
  allowZoomForTesting?: boolean;
}

export interface ZoomGuard {
  /** Called once each time the page is found zoomed in (main.ts pauses a stage). */
  onZoomedIn: (() => void) | null;
  /** True while the page is zoomed in, as last seen. */
  isZoomed(): boolean;
}

/** One guard per page, however often it is asked for. */
const installed = new WeakMap<object, ZoomGuard>();

/** Installs the guard at start-up. Does nothing on a computer; safe where there is no page at all. */
export function installZoomGuard(
  host: GuardHost | undefined = typeof window === 'undefined' ? undefined : window,
  options: GuardOptions = {}
): ZoomGuard {
  let zoomed = false; // latched: on at once, off only after ZOOM_SETTLE_MS at full size
  const guard: ZoomGuard = { onZoomedIn: null, isZoomed: () => zoomed };
  if (!host) return guard;
  const doc = host.document;
  const earlier = installed.get(doc);
  if (earlier) return earlier;
  installed.set(doc, guard);

  // A computer: nothing is installed and nothing is blocked. Its zoom is the user's own doing, the
  // pointer still reaches everything, and every touch rule here is about fingers.
  const touchScreen = (host.navigator?.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in host;
  if (!touchScreen) return guard;

  const allowZoom = options.allowZoomForTesting === true;
  const cancelPinch = (e: Event) => {
    // Zoomed in already: the pinch is the player's way back out, so it must go through. This reads
    // the latched state, not the viewport: a pinch sends these events at finger rate.
    if (zoomed || allowZoom) return;
    if (e.cancelable) e.preventDefault();
  };
  // WebKit only (Safari, and every iPhone browser): the pinch gesture itself.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    doc.addEventListener(type, cancelPinch, { passive: false });
  }

  const viewport = host.visualViewport ?? null;
  const root = doc.documentElement;
  const applyClass = () => root?.classList.toggle(PAGE_ZOOMED_CLASS, zoomed || allowZoom);
  applyClass();
  if (!viewport) return guard;

  let announced = false; // the picture is up and the game was told, for this zoom
  let settleTimer: number | null = null;
  let confirmTimer: number | null = null;
  let hint: HTMLElement | null = null;

  const reading = () => isZoomedIn(viewport, root?.clientWidth);
  const placeHint = () => {
    if (!hint) return;
    const at = hintPlacement(viewport, root?.clientWidth);
    hint.style.setProperty('--zx', `${at.x.toFixed(1)}px`);
    hint.style.setProperty('--zy', `${at.y.toFixed(1)}px`);
    hint.style.setProperty('--zk', at.k.toFixed(3));
  };
  const showHint = () => {
    if (!hint) {
      hint = doc.createElement('div');
      hint.className = ZOOM_HINT_CLASS;
      hint.setAttribute('aria-hidden', 'true');
      hint.innerHTML = '<span></span><span></span>'; // the two fingertips; no words to translate
      doc.body?.appendChild(hint);
    }
    hint.hidden = false;
    placeHint();
  };

  const sync = () => {
    if (reading()) {
      if (settleTimer !== null) host.clearTimeout(settleTimer);
      settleTimer = null;
      if (!zoomed) {
        zoomed = true;
        applyClass(); // every touch is the browser's again, at once
      }
      if (announced) placeHint(); // the player is panning: the picture follows
      else if (confirmTimer === null) confirmTimer = host.setTimeout(announce, ZOOM_CONFIRM_MS);
    } else if (zoomed && settleTimer === null) {
      settleTimer = host.setTimeout(settle, ZOOM_SETTLE_MS);
    }
  };
  // The zoom held: show the way back and tell the game. A reading that went away again (a phone
  // being turned can report odd sizes for a moment) shows and pauses nothing.
  const announce = () => {
    confirmTimer = null;
    if (!zoomed || announced || !reading()) {
      sync();
      return;
    }
    announced = true;
    showHint();
    guard.onZoomedIn?.();
  };
  const settle = () => {
    settleTimer = null;
    if (reading()) {
      sync(); // zoomed again and no event said so
      return;
    }
    zoomed = false;
    announced = false;
    if (confirmTimer !== null) host.clearTimeout(confirmTimer);
    confirmTimer = null;
    if (hint) hint.hidden = true;
    applyClass(); // the play field, the stick and the Floss ring take their touches back
  };

  viewport.addEventListener('resize', sync);
  viewport.addEventListener('scroll', sync); // panning while zoomed
  doc.addEventListener('touchend', sync, { passive: true }); // in case a viewport event went missing
  host.addEventListener('pageshow', sync); // back from another page, zoom and all
  sync(); // a page can load already zoomed (the browser keeps a zoom with the tab)
  return guard;
}
