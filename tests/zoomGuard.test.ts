import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PAGE_ZOOMED_CLASS,
  ZOOMED_IN_RATIO,
  ZOOMED_IN_SCALE,
  ZOOM_CONFIRM_MS,
  ZOOM_HINT_CLASS,
  ZOOM_SETTLE_MS,
  hintPlacement,
  installZoomGuard,
  isZoomedIn,
  type GuardHost,
} from '../src/engine/zoomGuard';

/** An iPhone held upright: the page is 390 wide. */
const PAGE_W = 390;
const PAGE_H = 844;

/**
 * A stand-in for the page: records listeners, `<html>`'s classes, the pinch picture and the
 * timers, which the test fires by hand. `zoom(1.6)` narrows what is visible, as a real pinch does.
 */
function fakePage(opts: { touchPoints?: number; viewport?: boolean } = {}) {
  const docListeners = new Map<string, Array<(e: Event) => void>>();
  const hostListeners = new Map<string, Array<() => void>>();
  const viewportListeners = new Map<string, Array<() => void>>();
  const classes = new Set<string>();
  const hints: Array<{ className: string; hidden: boolean; innerHTML: string; attrs: Record<string, string>; vars: Record<string, string> }> = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let nextTimer = 1;
  const viewport = {
    scale: 1,
    width: PAGE_W,
    height: PAGE_H,
    offsetLeft: 0,
    offsetTop: 0,
    addEventListener: (type: string, l: () => void) => void viewportListeners.set(type, [...(viewportListeners.get(type) ?? []), l]),
  };
  const document = {
    addEventListener: (type: string, l: (e: Event) => void) => void docListeners.set(type, [...(docListeners.get(type) ?? []), l]),
    createElement: () => {
      const el = {
        className: '',
        hidden: false,
        innerHTML: '',
        attrs: {} as Record<string, string>,
        vars: {} as Record<string, string>,
        setAttribute(name: string, value: string) {
          el.attrs[name] = value;
        },
        style: { setProperty: (name: string, value: string) => void (el.vars[name] = value) },
      };
      return el;
    },
    documentElement: {
      clientWidth: PAGE_W,
      classList: {
        toggle: (name: string, on?: boolean) => {
          if (on) classes.add(name);
          else classes.delete(name);
          return Boolean(on);
        },
      },
    },
    body: { appendChild: (el: (typeof hints)[number]) => void hints.push(el) },
  };
  const host = {
    document,
    visualViewport: opts.viewport === false ? null : viewport,
    navigator: { maxTouchPoints: opts.touchPoints ?? 5 },
    addEventListener: (type: string, l: () => void) => void hostListeners.set(type, [...(hostListeners.get(type) ?? []), l]),
    setTimeout: (fn: () => void, ms: number) => {
      timers.set(nextTimer, { fn, ms });
      return nextTimer++;
    },
    clearTimeout: (id: number) => void timers.delete(id),
  } as unknown as GuardHost;
  /** Sends a pinch event of that type; returns how many times it was cancelled. */
  const pinch = (type: string, cancelable = true) => {
    let prevented = 0;
    const event = { cancelable, preventDefault: () => void prevented++ } as unknown as Event;
    docListeners.get(type)?.forEach((l) => l(event));
    return prevented;
  };
  /** A real zoom: the visible part gets narrower and moves; the page keeps its width. */
  const zoom = (factor: number, offsetLeft = 0, offsetTop = 0) => {
    viewport.scale = factor;
    viewport.width = PAGE_W / factor;
    viewport.height = PAGE_H / factor;
    viewport.offsetLeft = offsetLeft;
    viewport.offsetTop = offsetTop;
    viewportListeners.get('resize')?.forEach((l) => l());
  };
  /** Runs the pending timers that wait `ms` (one round: timers they start are left pending). */
  const fire = (ms: number) => {
    const due = [...timers.entries()].filter(([, t]) => t.ms === ms);
    for (const [id, t] of due) {
      timers.delete(id);
      t.fn();
    }
    return due.length;
  };
  return {
    host,
    viewport,
    document,
    docListeners,
    hostListeners,
    viewportListeners,
    classes,
    hints,
    timers,
    pinch,
    zoom,
    fire,
    waiting: (ms: number) => [...timers.values()].filter((t) => t.ms === ms).length,
    touchEnd: () => docListeners.get('touchend')?.forEach((l) => l({} as Event)),
    scrolled: () => viewportListeners.get('scroll')?.forEach((l) => l()),
  };
}

describe('zoom guard (a phone must never be left zoomed in on the game)', () => {
  it('tells a zoomed page by how much of it is visible, not by the zoom figure', () => {
    expect(isZoomedIn({ width: 390, scale: 1 }, 390)).toBe(false);
    expect(isZoomedIn({ width: 390 / 1.6, scale: 1.6 }, 390)).toBe(true);
    // Safari's own text size at 150%: the figure says 1.5, but all of the page is visible
    expect(isZoomedIn({ width: 260, scale: 1.5 }, 260)).toBe(false);
    // ...and a pinch on top of that is still seen
    expect(isZoomedIn({ width: 260 / 1.3, scale: 1.95 }, 260)).toBe(true);
    // text size at 85%: a real zoom the figure alone would have missed (0.85 x 1.15 is under 1)
    expect(isZoomedIn({ width: 459 / 1.15, scale: 0.98 }, 459)).toBe(true);
    // a page width rounded to a whole pixel is not a zoom
    expect(isZoomedIn({ width: 411.43, scale: 1 }, 412)).toBe(false);
    expect(isZoomedIn({ width: PAGE_W / ZOOMED_IN_RATIO, scale: 1 }, PAGE_W)).toBe(false);
    expect(isZoomedIn({ width: PAGE_W / 1.01, scale: 1.01 }, PAGE_W)).toBe(true);
    // zoomed out, or nothing to read
    expect(isZoomedIn({ width: 500, scale: 0.8 }, 390)).toBe(false);
    expect(isZoomedIn(null, 390)).toBe(false);
    expect(isZoomedIn(undefined)).toBe(false);
  });

  it('falls back to the zoom figure only where the widths cannot be read', () => {
    expect(isZoomedIn({ scale: 1 })).toBe(false);
    expect(isZoomedIn({ scale: ZOOMED_IN_SCALE })).toBe(false);
    expect(isZoomedIn({ scale: 1.03 })).toBe(true);
    expect(isZoomedIn({ scale: 1.6, width: 0 }, 390)).toBe(true);
    expect(isZoomedIn({ scale: 1.6, width: 244 }, 0)).toBe(true);
    expect(isZoomedIn({ scale: Number.NaN })).toBe(false);
    expect(isZoomedIn({})).toBe(false);
  });

  it('puts the picture in the middle of what is visible, at its usual size on the glass', () => {
    // an iPhone zoomed 1.6 times and pushed to the bottom right corner
    const at = hintPlacement({ offsetLeft: 146.25, offsetTop: 316.5, width: 243.75, height: 527.5 }, 390);
    expect(at.x).toBeCloseTo(268.125);
    expect(at.y).toBeCloseTo(580.25);
    expect(at.k).toBeCloseTo(0.625);
    // never drawn larger than life, and whole where the page width is unknown
    expect(hintPlacement({ offsetLeft: 0, offsetTop: 0, width: 500, height: 800 }, 390).k).toBe(1);
    expect(hintPlacement({ offsetLeft: 0, offsetTop: 0, width: 244, height: 500 }, 0).k).toBe(1);
  });

  it('cancels a pinch on a touch screen while the page is at full size', () => {
    const page = fakePage();
    installZoomGuard(page.host);
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      expect(page.pinch(type), type).toBe(1);
      // an event that cannot be cancelled is left alone (no console error)
      expect(page.pinch(type, false), type).toBe(0);
    }
    expect(page.classes.has(PAGE_ZOOMED_CLASS)).toBe(false);
  });

  it('installs nothing on a computer: its zoom is its own business', () => {
    const page = fakePage({ touchPoints: 0 });
    const guard = installZoomGuard(page.host);
    expect(page.docListeners.size).toBe(0);
    expect(page.viewportListeners.size).toBe(0);
    page.zoom(1.4);
    expect(page.classes.has(PAGE_ZOOMED_CLASS)).toBe(false);
    expect(guard.isZoomed()).toBe(false);
    expect(page.hints).toHaveLength(0);
  });

  it('opens the way back the moment the page is zoomed: the class goes on and pinches go through', () => {
    const page = fakePage();
    const guard = installZoomGuard(page.host);
    page.zoom(1.6, 146.25, 316.5);
    expect(page.classes.has(PAGE_ZOOMED_CLASS)).toBe(true);
    expect(guard.isZoomed()).toBe(true);
    expect(page.pinch('gesturestart')).toBe(0);
    expect(page.pinch('gesturechange')).toBe(0);
  });

  it('shows the picture and tells the game once the zoom has held, and only once per zoom', () => {
    const page = fakePage();
    const guard = installZoomGuard(page.host);
    let told = 0;
    guard.onZoomedIn = () => void told++;
    page.zoom(1.6, 146.25, 316.5);
    // not yet: a reading that lasts a moment must not pause a game
    expect(told).toBe(0);
    expect(page.hints).toHaveLength(0);
    expect(page.waiting(ZOOM_CONFIRM_MS)).toBe(1);
    page.fire(ZOOM_CONFIRM_MS);
    expect(told).toBe(1);
    expect(page.hints).toHaveLength(1);
    const hint = page.hints[0];
    expect(hint.className).toBe(ZOOM_HINT_CLASS);
    expect(hint.attrs['aria-hidden']).toBe('true');
    expect(hint.hidden).toBe(false);
    expect(hint.innerHTML.replace(/<[^>]*>/g, '').trim()).toBe(''); // no words to translate
    expect(hint.vars).toEqual({ '--zx': '268.1px', '--zy': '580.3px', '--zk': '0.625' });
    // zooming further and panning move the picture; nobody is told twice
    page.zoom(2, 195, 422);
    page.scrolled();
    page.touchEnd();
    expect(told).toBe(1);
    expect(page.hints).toHaveLength(1);
    expect(hint.vars).toEqual({ '--zx': '292.5px', '--zy': '633.0px', '--zk': '0.500' });
    expect(page.waiting(ZOOM_CONFIRM_MS)).toBe(0);
  });

  it('believes full size only after it has held, so a pinch out is never cut short', () => {
    const page = fakePage();
    const guard = installZoomGuard(page.host);
    let told = 0;
    guard.onZoomedIn = () => void told++;
    page.zoom(1.6);
    page.fire(ZOOM_CONFIRM_MS);
    // the pinch out passes full size: still the way back, one timer waiting
    page.zoom(1);
    expect(page.classes.has(PAGE_ZOOMED_CLASS)).toBe(true);
    expect(page.pinch('gesturechange')).toBe(0);
    expect(page.waiting(ZOOM_SETTLE_MS)).toBe(1);
    // ...it wobbles back in: the timer is dropped and nothing is announced again
    page.zoom(1.2);
    expect(page.waiting(ZOOM_SETTLE_MS)).toBe(0);
    expect(told).toBe(1);
    // ...and settles at full size
    page.zoom(1);
    page.fire(ZOOM_SETTLE_MS);
    expect(page.classes.has(PAGE_ZOOMED_CLASS)).toBe(false);
    expect(guard.isZoomed()).toBe(false);
    expect(page.hints[0].hidden).toBe(true);
    expect(page.pinch('gesturestart')).toBe(1);
    // the next zoom is a new one: told again, same picture element
    page.zoom(1.5);
    page.fire(ZOOM_CONFIRM_MS);
    expect(told).toBe(2);
    expect(page.hints).toHaveLength(1);
    expect(page.hints[0].hidden).toBe(false);
  });

  it('stays zoomed when the timer runs out on a page that was zoomed again without a word', () => {
    const page = fakePage();
    const guard = installZoomGuard(page.host);
    page.zoom(1.6);
    page.fire(ZOOM_CONFIRM_MS);
    page.zoom(1);
    // zoomed again, and no viewport event arrived
    page.viewport.width = PAGE_W / 1.4;
    page.fire(ZOOM_SETTLE_MS);
    expect(guard.isZoomed()).toBe(true);
    expect(page.classes.has(PAGE_ZOOMED_CLASS)).toBe(true);
    expect(page.pinch('gesturestart')).toBe(0);
  });

  it('pauses nothing for a reading that went away again, and does not stay stuck on it', () => {
    const page = fakePage();
    const guard = installZoomGuard(page.host);
    let told = 0;
    guard.onZoomedIn = () => void told++;
    page.zoom(1.6);
    // back to full size, and this time no event says so (a phone being turned)
    page.viewport.width = PAGE_W;
    page.fire(ZOOM_CONFIRM_MS);
    expect(told).toBe(0);
    expect(page.hints).toHaveLength(0);
    // the guard noticed by itself and lets go after the usual wait
    expect(page.waiting(ZOOM_SETTLE_MS)).toBe(1);
    page.fire(ZOOM_SETTLE_MS);
    expect(guard.isZoomed()).toBe(false);
    expect(page.classes.has(PAGE_ZOOMED_CLASS)).toBe(false);
    expect(page.pinch('gesturestart')).toBe(1);
  });

  it('is not fooled by Safari text size: a page at 150% with all of it visible plays as usual', () => {
    const page = fakePage();
    page.viewport.scale = 1.5;
    page.viewport.width = 260;
    page.document.documentElement.clientWidth = 260;
    const guard = installZoomGuard(page.host);
    expect(guard.isZoomed()).toBe(false);
    expect(page.classes.has(PAGE_ZOOMED_CLASS)).toBe(false);
    expect(page.pinch('gesturestart')).toBe(1);
    expect(page.waiting(ZOOM_CONFIRM_MS)).toBe(0);
  });

  it('notices a page that loads already zoomed in, and a zoom whose viewport event went missing', () => {
    const page = fakePage();
    page.viewport.scale = 1.5;
    page.viewport.width = PAGE_W / 1.5;
    const guard = installZoomGuard(page.host);
    expect(page.classes.has(PAGE_ZOOMED_CLASS)).toBe(true);
    expect(guard.isZoomed()).toBe(true);

    const quiet = fakePage();
    const quietGuard = installZoomGuard(quiet.host);
    quiet.viewport.width = PAGE_W / 1.3; // zoomed, and nobody said so
    expect(quietGuard.isZoomed()).toBe(false);
    quiet.touchEnd();
    expect(quietGuard.isZoomed()).toBe(true);
    // coming back to the page from another one is checked too
    expect(quiet.hostListeners.has('pageshow')).toBe(true);
  });

  it('with the test door open, never holds zooming off (for trying the way back on a phone)', () => {
    const page = fakePage();
    const guard = installZoomGuard(page.host, { allowZoomForTesting: true });
    expect(page.classes.has(PAGE_ZOOMED_CLASS)).toBe(true); // touches are the browser's from the start
    expect(page.pinch('gesturestart')).toBe(0);
    expect(guard.isZoomed()).toBe(false);
    // the real thing still happens when the page is zoomed
    let told = 0;
    guard.onZoomedIn = () => void told++;
    page.zoom(1.6);
    page.fire(ZOOM_CONFIRM_MS);
    expect(told).toBe(1);
    page.zoom(1);
    page.fire(ZOOM_SETTLE_MS);
    expect(guard.isZoomed()).toBe(false);
    expect(page.classes.has(PAGE_ZOOMED_CLASS)).toBe(true);
  });

  it('is installed once per page, and is harmless without a viewport or without a page', () => {
    const page = fakePage();
    const first = installZoomGuard(page.host);
    const second = installZoomGuard(page.host);
    expect(second).toBe(first);
    expect(page.docListeners.get('gesturestart')).toHaveLength(1);
    expect(page.viewportListeners.get('resize')).toHaveLength(1);

    // an old iPhone: no viewport to read, so pinches are cancelled and that is all
    const old = fakePage({ viewport: false });
    const oldGuard = installZoomGuard(old.host);
    expect(old.pinch('gesturestart')).toBe(1);
    expect(oldGuard.isZoomed()).toBe(false);
    expect(old.docListeners.has('touchend')).toBe(false);

    // no page at all (a test, a script): nothing to do, nothing thrown
    expect(() => installZoomGuard(undefined)).not.toThrow();
    expect(installZoomGuard(undefined).isZoomed()).toBe(false);
  });

  /** Every `selectors { declarations }` block of a stylesheet, comments and at-rule wrappers aside. */
  function cssRules(file: string): Array<{ selectors: string[]; body: string }> {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: m[1].split(',').map((s) => s.trim()).filter(Boolean),
      body: m[2],
    }));
  }
  /** The last simple part of a selector: `.companion-hub .hub-bottom-deck` is about `.hub-bottom-deck`. */
  const subject = (selector: string) => selector.split(/[\s>+~]+/).pop() ?? selector;

  it('gives everything that scrolls its own no-zoom rule (an iPhone forgets the page rule inside a scroller)', () => {
    const rules = [...cssRules('src/styles/main.css'), ...cssRules('src/styles/tutorial.css')];
    const scrollers = new Set<string>();
    const guarded = new Set<string>();
    for (const rule of rules) {
      if (/overflow(-x|-y)?\s*:[^;]*\b(auto|scroll)\b/.test(rule.body)) rule.selectors.forEach((s) => scrollers.add(subject(s)));
      // "pan-y" and "pan-x pan-y" scroll and do not pinch; "none" does neither
      if (/touch-action\s*:\s*(pan-x pan-y|pan-y|pan-x|none)\s*;/.test(rule.body)) rule.selectors.forEach((s) => guarded.add(subject(s)));
    }
    expect([...scrollers].sort()).toEqual(['.city-strip', '.cosmic-beat-copy', '.cosmic-card', '.hub-bottom-deck', '.modal-sheet', '.report-scroll-body', '.tutorial-sheet']);
    for (const s of scrollers) expect(guarded.has(s), `${s} scrolls and has no touch-action of its own`).toBe(true);
    // nothing in the user interface code makes a scroller with an inline style
    for (const file of ['CompanionHubOverlay', 'TelemetryHudOverlay', 'BrushAlongOverlay', 'CosmicIntroOverlay', 'MissionReportOverlay', 'CityFinaleOverlay', 'TutorialOverlay', 'privacyNotice', 'parentGate', 'brushIntroCard', 'graphicsFailureCard']) {
      expect(readFileSync(`src/ui/${file}.ts`, 'utf8'), file).not.toMatch(/overflow(-x|-y)?\s*:\s*(auto|scroll)/);
    }
  });

  it('keeps the touch rules of the page, the game surfaces and the way back in the styles', () => {
    const css = readFileSync('src/styles/main.css', 'utf8');
    const rules = cssRules('src/styles/main.css');
    const touchOf = (selector: string) =>
      rules.filter((r) => r.selectors.includes(selector)).map((r) => /touch-action\s*:\s*([^;]+);/.exec(r.body)?.[1]?.trim()).filter(Boolean);
    // the page: no pinch zoom, no double-tap zoom, scrolling kept
    expect(css).toMatch(/html,\s*body\s*\{[^}]*touch-action:\s*pan-x pan-y;/);
    // ...and no text enlarged by the phone itself when it is turned on its side
    expect(css).toMatch(/html,\s*body\s*\{[^}]*-webkit-text-size-adjust:\s*100%;\s*text-size-adjust:\s*100%;/);
    // buttons: a second quick tap is a tap; the weakest rule, so it can never undo a game surface
    expect(css).toMatch(/:where\(button, \.btn, \[role='button'\]\)\s*\{\s*touch-action:\s*manipulation;/);
    expect(css).not.toMatch(/\.ui-interactive[^{}]*\{\s*touch-action/);
    // the play field, the thumbstick, the Floss ring, the sheet handle and the finale keep every touch
    expect(touchOf('#mouthlife-canvas')).toEqual(['none']);
    expect(touchOf('.virtual-pad')).toEqual(['none']);
    expect(touchOf('.floss-ring')).toEqual(['none']);
    expect(touchOf('.modal-header-sticky')).toEqual(['none']);
    expect(touchOf('.finale-shell')).toEqual(['none']);
    // ...until the page is zoomed in: then every touch may pinch and pan it back
    expect(css).toMatch(new RegExp(`html\\.${PAGE_ZOOMED_CLASS} \\*\\s*\\{\\s*touch-action:\\s*manipulation !important;`));
    // nothing else in the styles is marked important for touch (it would undo the way back)
    expect(css.match(/touch-action:[^;]*!important/g)).toHaveLength(1);
    // the picture: off until asked for, never in the way of a finger, still for those who ask
    expect(css).toMatch(new RegExp(`\\.${ZOOM_HINT_CLASS}\\s*\\{[^}]*pointer-events:\\s*none;`));
    expect(css).toMatch(new RegExp(`\\.${ZOOM_HINT_CLASS}\\[hidden\\]\\s*\\{\\s*display:\\s*none;`));
    expect(css).toMatch(new RegExp(`\\.reduced-motion \\.${ZOOM_HINT_CLASS} span\\s*\\{\\s*animation:\\s*none;`));
  });

  it('is wired into the page: installed first, pauses a stage, and the viewport still stops text fields zooming', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toMatch(/const zoomGuard = installZoomGuard\(window, \{\s*allowZoomForTesting: import\.meta\.env\.DEV && /);
    expect(main).toMatch(/zoomGuard\.onZoomedIn = \(\) => \{[^}]*setPaused\(true\)/);
    expect(main).toMatch(/zoomGuard\.isZoomed\(\)\) activeTelemetryHud\?\.setPaused\(true\)/);
    // a tap on the dim part of the pause card does not resume while zoomed
    const hud = readFileSync('src/ui/TelemetryHudOverlay.ts', 'utf8');
    expect(hud).toMatch(/e\.target === sheet && !document\.documentElement\.classList\.contains\(PAGE_ZOOMED_CLASS\)/);
    // iPhone ignores these two for pinching but still obeys them for the zoom on tapping a small
    // text field (the language pickers and the reminder times are under 16px)
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/<meta\s+name="viewport"\s+content="[^"]*maximum-scale=1\.0[^"]*user-scalable=no[^"]*"/);
  });
});
