import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAGE_ZOOMED_CLASS, VIEWPORT_CONTENT, ZOOMED_IN_SCALE, installZoomGuard, isZoomedIn, resetPageZoom } from '../src/engine/zoomGuard';

/** A stand-in for the page: records listeners, the viewport tag's content and <html>'s classes. */
function fakePage(withMeta = true, touchPoints = 5) {
  const listeners = new Map<string, Array<(e: Event) => void>>();
  const written: string[] = [];
  const classes = new Set<string>();
  const meta = {
    setAttribute: (name: string, value: string) => {
      if (name === 'content') written.push(value);
    },
  };
  const viewportListeners: Array<() => void> = [];
  const viewport = {
    scale: 1,
    addEventListener: (_type: 'resize' | 'scroll', l: () => void) => void viewportListeners.push(l),
  };
  const document = {
    addEventListener: (type: string, l: (e: Event) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), l]);
    },
    querySelector: (sel: string) => (withMeta && sel === 'meta[name="viewport"]' ? meta : null),
    documentElement: {
      classList: {
        toggle: (name: string, on?: boolean) => {
          if (on) classes.add(name);
          else classes.delete(name);
          return Boolean(on);
        },
      },
    },
  } as unknown as Parameters<typeof installZoomGuard>[0] extends infer H ? (H extends { document: infer D } ? D : never) : never;
  const host = { document, visualViewport: viewport, navigator: { maxTouchPoints: touchPoints } };
  /** Sends a pinch event of that type; returns how many times it was cancelled. */
  const pinch = (type: string, cancelable = true) => {
    let prevented = 0;
    const event = { cancelable, preventDefault: () => void prevented++ } as unknown as Event;
    listeners.get(type)?.forEach((l) => l(event));
    return prevented;
  };
  return { host, viewport, listeners, written, classes, pinch, resize: () => viewportListeners.forEach((l) => l()) };
}

describe('zoom guard (a phone must never be left zoomed in on the game)', () => {
  it('knows a zoomed page from a rounding wobble', () => {
    expect(isZoomedIn(1)).toBe(false);
    expect(isZoomedIn(ZOOMED_IN_SCALE)).toBe(false);
    expect(isZoomedIn(1.03)).toBe(true);
    expect(isZoomedIn(1.6)).toBe(true);
    expect(isZoomedIn(0.8)).toBe(false);
    expect(isZoomedIn(undefined)).toBe(false);
    expect(isZoomedIn(Number.NaN)).toBe(false);
  });

  it('cancels a pinch on a touch screen while the page is at full size', () => {
    const page = fakePage();
    installZoomGuard(page.host);
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      expect(page.pinch(type), type).toBe(1);
      // an event that cannot be cancelled is left alone (no console error)
      expect(page.pinch(type, false), type).toBe(0);
    }
  });

  it('lets the pinch through once the page is zoomed in: it is the way back out', () => {
    const page = fakePage();
    installZoomGuard(page.host);
    page.viewport.scale = 1.6;
    page.resize();
    expect(page.classes.has(PAGE_ZOOMED_CLASS)).toBe(true);
    expect(page.pinch('gesturestart')).toBe(0);
    expect(page.pinch('gesturechange')).toBe(0);
    // back at full size: the class comes off and pinches are cancelled again
    page.viewport.scale = 1;
    page.resize();
    expect(page.classes.has(PAGE_ZOOMED_CLASS)).toBe(false);
    expect(page.pinch('gesturestart')).toBe(1);
  });

  it('leaves a trackpad pinch alone on a computer', () => {
    const page = fakePage(true, 0);
    installZoomGuard(page.host);
    expect(page.listeners.has('gesturestart')).toBe(false);
    // the way back still works there
    page.viewport.scale = 1.4;
    page.resize();
    expect(page.classes.has(PAGE_ZOOMED_CLASS)).toBe(true);
  });

  it('tries once to put a zoomed page back to full size, and leaves an unzoomed one alone', () => {
    const page = fakePage();
    installZoomGuard(page.host);
    page.resize(); // the keyboard or a rotation: scale is still 1
    expect(page.written).toEqual([]);
    page.viewport.scale = 1.6;
    page.resize();
    // set to something different first, so the browser sees a change, then to the real line
    expect(page.written).toHaveLength(2);
    expect(page.written[0]).not.toBe(VIEWPORT_CONTENT);
    expect(page.written[1]).toBe(VIEWPORT_CONTENT);
    // the reset did nothing and the viewport reports again at the same zoom: no second try, no loop
    page.resize();
    page.resize();
    expect(page.written).toHaveLength(2);
    // a different zoom level is a new try
    page.viewport.scale = 2.2;
    page.resize();
    expect(page.written).toHaveLength(4);
  });

  it('notices a page that loads already zoomed in', () => {
    const page = fakePage();
    page.viewport.scale = 1.5;
    installZoomGuard(page.host);
    expect(page.classes.has(PAGE_ZOOMED_CLASS)).toBe(true);
    expect(page.written).toHaveLength(2);
  });

  it('does nothing harmful where there is no viewport API or no viewport tag', () => {
    const page = fakePage(false);
    expect(() => installZoomGuard({ document: page.host.document, visualViewport: null, navigator: null })).not.toThrow();
    expect(resetPageZoom(page.host.document)).toBe(false);
    // zoomed, but no viewport tag to rewrite: the class still goes on
    const noMeta = fakePage(false);
    noMeta.viewport.scale = 1.6;
    expect(() => installZoomGuard(noMeta.host)).not.toThrow();
    expect(noMeta.classes.has(PAGE_ZOOMED_CLASS)).toBe(true);
  });

  it('uses the same viewport line as the page, and the page turns the zoom gestures off in its styles', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain(`content="${VIEWPORT_CONTENT}"`);
    const css = readFileSync('src/styles/main.css', 'utf8');
    // the page: no pinch zoom, no double-tap zoom, scrolling kept
    expect(css).toMatch(/html,\s*body\s*\{[^}]*touch-action:\s*pan-x pan-y;/);
    // buttons: a second quick tap is a tap
    expect(css).toMatch(/button,\s*\.btn,\s*\.ui-interactive,\s*\[role='button'\]\s*\{\s*touch-action:\s*manipulation;/);
    // the play field and the stick keep every touch for the game...
    expect(css).toMatch(/#mouthlife-canvas\s*\{[^}]*touch-action:\s*none;/);
    // ...until the page is zoomed in: then every touch may pinch and pan it back
    expect(css).toMatch(new RegExp(`html\\.${PAGE_ZOOMED_CLASS} \\*\\s*\\{\\s*touch-action:\\s*manipulation !important;`));
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toContain('installZoomGuard();');
  });
});
