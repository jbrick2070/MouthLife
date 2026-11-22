/**
 * Keeps the browser from zooming the page while MouthLife is played, and gives a way back if it
 * is zoomed anyway.
 *
 * iPhone browsers ignore `user-scalable=no`, so a quick double tap on a button (Scan, Surge) or a
 * pinch that started on the HUD zoomed the whole page. The play field takes every touch for the
 * game (`touch-action: none`), so a pinch to zoom back out did nothing: the top bar and the
 * thumbstick stayed off the screen and the player was stuck (found on an iPhone, November 2026).
 *
 * Keeping the page from zooming:
 * 1. `touch-action` in main.css: `pan-x pan-y` on the page and `manipulation` on buttons, so there
 *    is no pinch zoom and no double-tap zoom, while sheets still scroll.
 * 2. On touch screens, WebKit's own `gesturestart` / `gesturechange` events are cancelled (the pinch
 *    itself). A Mac's trackpad pinch is left alone: someone at a computer may need it.
 *
 * The way back, if the page is zoomed in anyway (an older browser, a zoom made before this loaded):
 * 3. `<html>` gets the class `page-zoomed`, which main.css uses to let every touch pinch and pan
 *    the page again, the play field included; pinches are no longer cancelled. The class comes off
 *    when the page is back to full size.
 * 4. The viewport is set again once, which makes some browsers drop the zoom by themselves.
 *
 * Nothing here runs per frame: it listens for the viewport changing size.
 */

/** The page counts as zoomed in beyond this scale (a hair over 1 allows for rounding). */
export const ZOOMED_IN_SCALE = 1.02;
/** On `<html>` while the page is zoomed in (see main.css). */
export const PAGE_ZOOMED_CLASS = 'page-zoomed';

export function isZoomedIn(scale: number | null | undefined): boolean {
  return typeof scale === 'number' && Number.isFinite(scale) && scale > ZOOMED_IN_SCALE;
}

/** The viewport line from index.html: setting it again makes some browsers drop a zoom. */
export const VIEWPORT_CONTENT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

interface ViewportLike {
  scale: number;
  addEventListener(type: 'resize' | 'scroll', listener: () => void): void;
}

interface GuardHost {
  document: Pick<Document, 'addEventListener' | 'querySelector'> & {
    documentElement?: { classList: Pick<DOMTokenList, 'toggle'> } | null;
  };
  visualViewport?: ViewportLike | null;
  navigator?: { maxTouchPoints?: number } | null;
}

/** Sets the viewport again (with a different spelling first, so the browser sees a change). */
export function resetPageZoom(doc: Pick<Document, 'querySelector'>): boolean {
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return false;
  meta.setAttribute('content', `${VIEWPORT_CONTENT}, minimum-scale=1.0`);
  meta.setAttribute('content', VIEWPORT_CONTENT);
  return true;
}

/** Installs the guard once, at start-up. Safe where there is no touch screen or no viewport API. */
export function installZoomGuard(host: GuardHost = window): void {
  const viewport = host.visualViewport ?? null;
  const zoomedIn = () => isZoomedIn(viewport?.scale);
  const touchScreen = (host.navigator?.maxTouchPoints ?? 0) > 0;

  if (touchScreen) {
    const cancelPinch = (e: Event) => {
      // Zoomed in already: the pinch is the player's way back out, so it must go through.
      if (zoomedIn()) return;
      if (e.cancelable) e.preventDefault();
    };
    // WebKit only (Safari, and every iPhone browser): the pinch gesture itself.
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      host.document.addEventListener(type, cancelPinch, { passive: false } as AddEventListenerOptions);
    }
  }
  if (!viewport) return;

  // The zoom level a reset was last tried at: a reset that does nothing must not be tried again
  // on every later change of the same zoom.
  let resetTriedAt = 0;
  const sync = () => {
    const zoomed = zoomedIn();
    host.document.documentElement?.classList.toggle(PAGE_ZOOMED_CLASS, zoomed);
    if (!zoomed) {
      resetTriedAt = 0;
      return;
    }
    if (Math.abs(viewport.scale - resetTriedAt) < 0.01) return;
    resetTriedAt = viewport.scale;
    resetPageZoom(host.document);
  };
  viewport.addEventListener('resize', sync);
  sync(); // a page can load already zoomed (restored from the last visit)
}
