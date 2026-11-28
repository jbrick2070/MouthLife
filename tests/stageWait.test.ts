import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CoachLanguage } from '../src/config/brushCoach';
import { BRUSH_ALONG_STAGE_WAIT_SEC } from '../src/config/gameConfig';
import { ClockController } from '../src/engine/ClockController';
import { EventBus } from '../src/engine/EventBus';
import { INCLUDE_RINSE_KEY } from '../src/engine/persistence/pacerPrefs';
import { SaveSystem } from '../src/engine/persistence/SaveSystem';
import type { AppEventMap } from '../src/engine/types';
import { BrushAlongOverlay } from '../src/ui/BrushAlongOverlay';

/**
 * Floss and the fluoride rinse each wait for a tap. When brushing reaches 2:00 the clock holds, one
 * chime sounds and a card asks "READY TO FLOSS?" with Start Flossing and Skip; floss ending (with
 * the rinse step on) does the same for the rinse. A card left up for ten minutes finishes the brush
 * with what was done. The native app (BrushAlongView) does exactly the same.
 *
 * The real brush screen, clock, bank and save run here on a stand-in page that keeps what the
 * screen draws by element id, so its buttons can be read and tapped. Frames are fed by hand.
 */

/** The id of the element that last took the focus on the stand-in page. */
let focusedId: string | null = null;

/** One element of the stand-in page: its text, attributes, data-* values, hidden flag and listeners. */
class FakeElement {
  textContent = '';
  hidden: boolean;
  disabled = false;
  readonly dataset: Record<string, string> = {};
  private readonly attributes = new Map<string, string>();
  readonly style: Record<string, unknown> = { setProperty: () => {}, removeProperty: () => {} };
  private readonly classes = new Set<string>();
  readonly classList = {
    toggle: (name: string, on?: boolean): void => {
      if (on ?? !this.classes.has(name)) this.classes.add(name);
      else this.classes.delete(name);
    },
    contains: (name: string): boolean => this.classes.has(name),
  };
  private readonly listeners: Array<{ type: string; cb: (e: unknown) => void }> = [];
  value = '';

  constructor(
    readonly id: string | null,
    attributes: string
  ) {
    this.hidden = /(^|\s)hidden(\s|$)/.test(attributes);
    for (const [, name, value] of attributes.matchAll(/([\w-]+)="([^"]*)"/g)) {
      this.attributes.set(name, value);
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = value;
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  focus(): void {
    focusedId = this.id;
  }
  querySelector(): null {
    return null;
  }
  querySelectorAll(): never[] {
    return [];
  }
  addEventListener(type: string, cb: (e: unknown) => void): void {
    this.listeners.push({ type, cb });
  }
  fire(type: string): void {
    for (const l of this.listeners) if (l.type === type) l.cb({ target: this });
  }
  click(): void {
    this.fire('click');
  }
}

/** The element the brush screen draws into. Each new drawing replaces every element in it. */
class FakeScreenBox {
  className = '';
  private html = '';
  private elements = new Map<string, FakeElement>();

  get innerHTML(): string {
    return this.html;
  }
  set innerHTML(value: string) {
    this.html = value;
    this.elements = new Map();
  }
  appendChild(): void {}
  remove(): void {}
  /** Only "[data-name]" (the floss and rinse chips); the same elements each time until the next drawing. */
  querySelectorAll(selector: string): FakeElement[] {
    const name = /^\[(data-[\w-]+)\]$/.exec(selector)?.[1];
    if (!name) return [];
    const found: FakeElement[] = [];
    let i = 0;
    for (const tag of this.html.matchAll(new RegExp(`<\\w+([^>]*\\s${name}="[^"]*"[^>]*)>`, 'g'))) {
      const key = `${name}#${i++}`;
      let el = this.elements.get(key);
      if (!el) {
        el = new FakeElement(null, tag[1]);
        this.elements.set(key, el);
      }
      found.push(el);
    }
    return found;
  }
  querySelector(selector: string): FakeElement | null {
    const id = /^#([\w-]+)$/.exec(selector)?.[1];
    if (!id) return null;
    let el = this.elements.get(id);
    if (!el) {
      const tag = new RegExp(`<\\w+([^>]*?)\\sid="${id}"([^>]*)>`).exec(this.html);
      if (!tag) return null;
      el = new FakeElement(id, `${tag[1]} ${tag[2]}`);
      this.elements.set(id, el);
    }
    return el;
  }
}

function memoryStorage() {
  const stored = new Map<string, string>();
  return {
    getItem: (key: string): string | null => stored.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      stored.set(key, value);
    },
  };
}

const screens: BrushAlongOverlay[] = [];

afterEach(() => {
  for (const screen of screens.splice(0)) screen.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Taps 2-Min Brush on a fresh device: the brush screen, its clock and a save, at `start` (20:00 on 20 November). */
function brushScreen(options: { rinse?: boolean; lang?: CoachLanguage; start?: Date } = {}) {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(options.start ?? new Date(2026, 10, 20, 20, 0, 0));
  let box = new FakeScreenBox();
  focusedId = null;
  let rinseOn = options.rinse ?? false;
  const keyListeners: Array<(e: unknown) => void> = [];
  vi.stubGlobal('Element', class {});
  const page = {
    visibilityState: 'visible' as 'visible' | 'hidden',
    // Reduce Motion on: the rinse gauge stays still and no tilt is read.
    documentElement: { classList: { contains: () => true } },
    createElement: () => (box = new FakeScreenBox()),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  vi.stubGlobal('document', page);
  vi.stubGlobal('window', {
    addEventListener: (type: string, cb: (e: unknown) => void) => {
      if (type === 'keydown') keyListeners.push(cb);
    },
    removeEventListener: () => {},
    localStorage: {
      getItem: (key: string) => (rinseOn && key === INCLUDE_RINSE_KEY ? '1' : null),
      setItem: () => {},
    },
  });

  const bus = new EventBus();
  const clock = new ClockController(bus);
  const saveSys = new SaveSystem(bus, memoryStorage());
  saveSys.load(Date.now());
  const paid: Array<AppEventMap['pacer:complete']> = [];
  bus.on('pacer:complete', (p) => paid.push(p));

  /** Every chime and countdown pip, in order; and every word the voice says. */
  const sounds: string[] = [];
  const spoken: string[] = [];
  /** How many times the screen asked to go back to the hub, and the banner it asked the hub to show. */
  let exits = 0;
  let hubNote: string | undefined;
  /** Every pause or resume the screen passed on to the music. */
  const pauseChanges: boolean[] = [];
  let lang: CoachLanguage = options.lang ?? 'en';
  const voice = {
    getLanguage: () => lang,
    speak: (text: string) => spoken.push(text),
    stop: () => {},
    pause: () => {},
    resume: () => {},
    isEnabled: () => true,
    isSupported: () => true,
    setEnabled: () => {},
    setLanguage: (next: CoachLanguage) => {
      lang = next;
    },
  };
  const callbacks = {
    onActiveQuadrantChanged: () => {},
    onPlayCue: (kind: string) => sounds.push(kind),
    onPlayPip: (secondsLeft: number) => sounds.push(`pip${secondsLeft}`),
    onExitToHub: (note?: string) => {
      exits++;
      hubNote = note;
    },
    onPauseChanged: (paused: boolean) => pauseChanges.push(paused),
  };

  let perfMs = 0;
  let wallMs = Date.now();
  clock.tickFrame(perfMs);
  const screen = new BrushAlongOverlay(bus, clock, saveSys, voice as never, callbacks);
  screens.push(screen);
  screen.mount({ appendChild: () => {} } as unknown as HTMLElement);

  /** The page in view for this long, 60 frames a second. */
  const frames = (sec: number): void => {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) {
      perfMs += 1000 / 60;
      wallMs += 1000 / 60;
      vi.setSystemTime(Math.round(wallMs));
      clock.tickFrame(perfMs);
    }
  };
  /** The page in view for whole seconds (a card up, or the skip button armed): timers run each second. */
  const cardUp = (sec: number): void => {
    for (let i = 0; i < sec; i++) {
      perfMs += 1000;
      wallMs += 1000;
      vi.advanceTimersByTime(1000);
      vi.setSystemTime(Math.round(wallMs));
      clock.tickFrame(perfMs);
    }
  };
  /** The phone locked for this long, then back in view. */
  const lock = (sec: number): void => {
    clock.noteHidden(wallMs);
    perfMs += sec * 1000;
    wallMs += sec * 1000;
    vi.setSystemTime(Math.round(wallMs));
    clock.noteVisible(wallMs, perfMs);
  };

  const el = (id: string): FakeElement | null => box.querySelector(`#${id}`);
  const text = (id: string): string | null => el(id)?.textContent ?? null;
  const tap = (id: string): void => {
    const button = el(id);
    if (!button) throw new Error(`no #${id} on the screen`);
    button.click();
  };
  const pressKey = (key: ' ' | 'Escape'): void => {
    const code = key === ' ' ? 'Space' : 'Escape';
    for (const cb of keyListeners) cb({ key, code, repeat: false, target: null, preventDefault: () => {} });
  };
  const pressSpace = (): void => pressKey(' ');
  /** The floss or rinse chip with this value ("stringFloss", "quick30s"...). */
  const chip = (value: string): FakeElement => {
    const all = [...box.querySelectorAll('[data-floss]'), ...box.querySelectorAll('[data-rinse]')];
    const found = all.find((c) => c.dataset.floss === value || c.dataset.rinse === value);
    if (!found) throw new Error(`no ${value} chip on the screen`);
    return found;
  };
  /** Picks a coach language in the brush screen's menu. */
  const pickLanguage = (next: CoachLanguage): void => {
    const menu = el('sel-pacer-lang');
    if (!menu) throw new Error('no language menu');
    menu.value = next;
    menu.fire('change');
  };
  /** Clears what was heard so far, so a test reads only what follows. */
  const hush = (): void => {
    sounds.length = 0;
    spoken.length = 0;
  };

  return {
    clock,
    saveSys,
    paid,
    sounds,
    spoken,
    exits: () => exits,
    hubNote: () => hubNote,
    pauseChanges,
    focused: () => focusedId,
    clearFocus: () => {
      focusedId = null;
    },
    setHidden: (hidden: boolean) => {
      page.visibilityState = hidden ? 'hidden' : 'visible';
    },
    setRinseStep: (on: boolean) => {
      rinseOn = on;
    },
    chip,
    pickLanguage,
    frames,
    cardUp,
    lock,
    el,
    text,
    tap,
    pressKey,
    pressSpace,
    hush,
  };
}

describe('brushing done: floss waits for a tap', () => {
  it('holds at 2:00 with one chime and no words, and never starts floss by itself', () => {
    const s = brushScreen();
    s.frames(119.5); // past the last 3-2-1
    s.hush();
    s.frames(1);
    expect(s.clock.isPacerWaiting()).toBe(true);
    expect(s.clock.getPacerStage()).toBe('brushing');
    expect(s.clock.getPacerElapsedSec()).toBe(120);
    expect(s.sounds).toEqual(['quadrant']);
    expect(s.spoken).toEqual([]);

    expect(s.text('pacer-title')).toBe('READY TO FLOSS?');
    expect(s.text('btn-pacer-start-floss')).toBe('Start Flossing');
    expect(s.text('btn-pacer-skip-wait')).toBe('Skip (+50 F⁻)'); // the floss stage's own Skip
    expect(s.text('pacer-clock')).toBe('00:00');
    expect(s.el('pacer-pips')?.hidden).toBe(true);
    // nothing to pause: no Pause button, and Space does nothing
    expect(s.el('btn-pacer-pause')).toBeNull();
    s.pressSpace();
    expect(s.clock.isPacerPaused()).toBe(false);

    // A minute later nothing has moved, and nothing more was heard.
    s.frames(60);
    expect(s.clock.isPacerWaiting()).toBe(true);
    expect(s.clock.getPacerStage()).toBe('brushing');
    expect(s.clock.getPacerElapsedSec()).toBe(120);
    expect(s.sounds).toEqual(['quadrant']);
    expect(s.spoken).toEqual([]);
    expect(s.paid).toHaveLength(0);
  });

  it('time past 2:00 with the phone locked is dropped: floss starts at 0:00 on the tap', () => {
    const s = brushScreen();
    s.frames(110);
    s.lock(20); // back 10 s after brushing ended
    s.frames(0.1);
    expect(s.clock.isPacerWaiting()).toBe(true);
    expect(s.clock.getPacerElapsedSec()).toBe(120);
    expect(s.clock.getPacerOverflowSec()).toBe(0);
    s.frames(5);
    s.hush();

    s.tap('btn-pacer-start-floss');
    expect(s.clock.isPacerWaiting()).toBe(false);
    expect(s.clock.getPacerStage()).toBe('flossBonus');
    expect(s.clock.getPacerElapsedSec()).toBe(120);
    // the same chime and the same one word as floss always began with
    expect(s.sounds).toEqual(['quadrant']);
    expect(s.spoken).toEqual(['Floss']);
    expect(s.text('pacer-title')).toContain('FLOSS PICK');
    expect(s.el('btn-pacer-pause')).not.toBeNull();
    s.frames(5);
    expect(s.clock.getPacerElapsedSec()).toBeCloseTo(125, 1);
  });
});

describe('floss done: the rinse waits for its own tap', () => {
  it('with the rinse step on, floss counts as done and the rinse card waits', () => {
    const s = brushScreen({ rinse: true });
    s.frames(121);
    s.tap('btn-pacer-start-floss');
    s.hush();
    s.frames(46);
    expect(s.clock.isPacerWaiting()).toBe(true);
    expect(s.clock.getPacerStage()).toBe('flossBonus');
    expect(s.clock.getPacerElapsedSec()).toBe(165);
    expect(s.sounds.filter((k) => !k.startsWith('pip')).at(-1)).toBe('quadrant');
    expect(s.spoken).toEqual([]);
    expect(s.text('pacer-title')).toBe('READY TO RINSE?');
    expect(s.text('btn-pacer-start-rinse')).toBe('Start Rinse');
    expect(s.text('btn-pacer-skip-wait')).toBe('Skip (+75 F⁻)'); // the rinse stage's own Skip, floss counted
    expect(s.el('btn-pacer-pause')).toBeNull();
    s.frames(30);
    expect(s.clock.getPacerStage()).toBe('flossBonus');
    expect(s.paid).toHaveLength(0);

    s.tap('btn-pacer-start-rinse');
    expect(s.clock.getPacerStage()).toBe('mouthwashBonus');
    expect(s.clock.getPacerElapsedSec()).toBe(165);
    expect(s.spoken).toEqual(['Rinse']);
    s.frames(61);
    expect(s.paid).toEqual([{ withFlossBonus: true, withMouthwashBonus: true, ionsAwarded: 100, stampAwarded: true }]);
  });

  it('with the rinse step off, floss running out finishes the brush, as before', () => {
    const s = brushScreen();
    s.frames(121);
    s.tap('btn-pacer-start-floss');
    s.frames(46);
    expect(s.clock.isPacerActive()).toBe(false);
    expect(s.paid).toEqual([{ withFlossBonus: true, withMouthwashBonus: false, ionsAwarded: 100, stampAwarded: true }]);
  });

  it('floss’s Skip goes to the rinse card instead of starting the rinse', () => {
    const s = brushScreen({ rinse: true });
    s.frames(121);
    s.tap('btn-pacer-start-floss');
    s.frames(10);
    s.hush();
    s.tap('btn-pacer-skip-floss');
    expect(s.clock.isPacerWaiting()).toBe(true);
    expect(s.clock.getPacerStage()).toBe('flossBonus');
    expect(s.text('pacer-title')).toBe('READY TO RINSE?');
    expect(s.text('btn-pacer-skip-wait')).toBe('Skip (+50 F⁻)'); // floss skipped: not counted
    expect(s.spoken).toEqual([]);
    s.frames(30);
    expect(s.clock.getPacerStage()).toBe('flossBonus');

    s.tap('btn-pacer-skip-wait');
    expect(s.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 50, stampAwarded: true }]);
  });

  it('the Fluoride Rinse button during floss still starts the rinse at once', () => {
    const s = brushScreen({ rinse: true });
    s.frames(121);
    s.tap('btn-pacer-start-floss');
    s.frames(10);
    s.hush();
    s.tap('btn-pacer-to-rinse');
    expect(s.clock.isPacerWaiting()).toBe(false);
    expect(s.clock.getPacerStage()).toBe('mouthwashBonus');
    expect(s.clock.getPacerElapsedSec()).toBe(165);
    expect(s.sounds).toEqual(['quadrant']);
    expect(s.spoken).toEqual(['Rinse']);
    s.frames(61);
    expect(s.paid).toEqual([{ withFlossBonus: true, withMouthwashBonus: true, ionsAwarded: 100, stampAwarded: true }]);
  });
});

describe('Skip on the floss card', () => {
  it('goes on to the rinse card when the rinse step is on, and that card waits its own ten minutes', () => {
    const s = brushScreen({ rinse: true });
    s.frames(121);
    s.cardUp(500);
    s.hush();
    s.tap('btn-pacer-skip-wait');
    expect(s.clock.isPacerWaiting()).toBe(true);
    expect(s.text('pacer-title')).toBe('READY TO RINSE?');
    expect(s.text('btn-pacer-start-rinse')).toBe('Start Rinse');
    expect(s.text('btn-pacer-skip-wait')).toBe('Skip (+50 F⁻)');
    expect(s.sounds).toEqual([]); // a card reached by a tap comes up quietly
    s.cardUp(500);
    expect(s.paid).toHaveLength(0);
    s.cardUp(100);
    expect(s.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 50, stampAwarded: true }]);
  });

  it('finishes with the brush alone when the rinse step is off', () => {
    const s = brushScreen();
    s.frames(121);
    s.tap('btn-pacer-skip-wait');
    expect(s.clock.isPacerActive()).toBe(false);
    expect(s.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 50, stampAwarded: true }]);
  });
});

describe('the safety finish', () => {
  it('waits ten minutes', () => {
    expect(BRUSH_ALONG_STAGE_WAIT_SEC).toBe(600);
  });

  it('a floss card left up for ten minutes finishes with the brush alone', () => {
    const s = brushScreen({ rinse: true });
    s.frames(120);
    s.cardUp(BRUSH_ALONG_STAGE_WAIT_SEC - 1);
    expect(s.paid).toHaveLength(0);
    s.cardUp(1);
    expect(s.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 50, stampAwarded: true }]);
    expect(s.el('btn-done-pacer')).not.toBeNull(); // the summary
  });

  it('a rinse card left up for ten minutes finishes with the floss counted and no rinse', () => {
    const s = brushScreen({ rinse: true });
    s.frames(121);
    s.tap('btn-pacer-start-floss');
    s.frames(45);
    s.cardUp(BRUSH_ALONG_STAGE_WAIT_SEC - 1);
    expect(s.paid).toHaveLength(0);
    s.cardUp(1);
    expect(s.paid).toEqual([{ withFlossBonus: true, withMouthwashBonus: false, ionsAwarded: 75, stampAwarded: true }]);
  });

  it('back after a lock longer than the wait, the brush finishes on the first frame', () => {
    const s = brushScreen();
    s.frames(100);
    s.lock(20 + BRUSH_ALONG_STAGE_WAIT_SEC + 5); // brushing ended 605 s ago
    s.hush();
    s.frames(0.1);
    expect(s.clock.isPacerActive()).toBe(false);
    expect(s.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 50, stampAwarded: true }]);
    expect(s.sounds).toEqual(['complete']); // the card never came up
  });
});

describe('Exit to Hub', () => {
  it('from the floss card, saves the brush alone, dated when brushing ended, and goes to the hub', () => {
    // Brushing ends at 23:59:00; the card is left up past midnight, then the house button is tapped.
    const s = brushScreen({ start: new Date(2026, 10, 20, 23, 57, 0), rinse: true });
    s.frames(121);
    s.cardUp(300);
    s.hush();
    s.tap('btn-pacer-exit');
    expect(s.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 50, stampAwarded: true }]);
    expect(s.saveSys.getSave().dailySlotsByDate).toEqual({ '2026-11-20': { fullRewards: 1, tips: 0 } });
    expect(s.clock.isPacerActive()).toBe(false);
    expect(s.exits()).toBe(1);
    // the hub says it was kept, in the native app's words; no summary is drawn, no "Done" spoken
    expect(s.hubNote()).toBe('🦷 Fresh Mint Smooth Bask! +50 F⁻ & +1 Habit Stamp!');
    expect(s.el('btn-done-pacer')).toBeNull();
    expect(s.spoken).toEqual([]);
    expect(s.sounds).toEqual(['complete']);
  });

  it('from the rinse card, saves the brush with the floss counted and no rinse, and goes to the hub', () => {
    const s = brushScreen({ rinse: true });
    s.frames(121);
    s.tap('btn-pacer-start-floss');
    s.frames(46);
    s.cardUp(30);
    s.tap('btn-pacer-exit');
    expect(s.paid).toEqual([{ withFlossBonus: true, withMouthwashBonus: false, ionsAwarded: 75, stampAwarded: true }]);
    expect(s.exits()).toBe(1);
    expect(s.hubNote()).toBe('🦷 Fresh Mint Smooth Bask! +75 F⁻ & +1 Habit Stamp!');
  });

  it('when the day’s two full rewards are used, the hub says what the small tip was', () => {
    const s = brushScreen();
    s.saveSys.getSave().dailySlotsByDate['2026-11-20'] = { fullRewards: 2, tips: 0 };
    s.frames(121);
    s.tap('btn-pacer-exit');
    expect(s.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 5, stampAwarded: false }]);
    expect(s.hubNote()).toBe('🦷 Fresh Mint Smooth Bask! +5 F⁻');
  });

  it('main.ts shows that note in the hub’s banner', () => {
    const main = readFileSync(join(__dirname, '..', 'src/main.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(main).toMatch(/onExitToHub: \(hubNote\) => \{\n\s*switchMode\('HUB'\);[\s\S]*?if \(hubNote\) activeHub\?\.setStatusBanner\(hubNote\);/);
  });

  it('Escape on a card does the same', () => {
    const s = brushScreen({ rinse: true });
    s.frames(121);
    s.tap('btn-pacer-start-floss');
    s.frames(10);
    s.tap('btn-pacer-skip-floss'); // floss skipped: the rinse card, floss not counted
    s.pressKey('Escape');
    expect(s.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 50, stampAwarded: true }]);
    expect(s.exits()).toBe(1);
  });

  it('in the first 20 s of brushing, saves nothing, as before', () => {
    const s = brushScreen({ rinse: true });
    s.frames(19.5);
    s.tap('btn-pacer-exit');
    expect(s.paid).toEqual([]);
    expect(s.clock.isPacerActive()).toBe(false);
    expect(s.exits()).toBe(1);
    expect(s.hubNote()).toBeUndefined();
  });

  it('later in brushing, saves a good try, quietly, with the kind words the early "Floss ›" earns', () => {
    const s = brushScreen({ rinse: true });
    s.frames(60);
    s.hush();
    s.tap('btn-pacer-exit');
    expect(s.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 5, stampAwarded: false }]);
    expect(s.clock.isPacerActive()).toBe(false);
    expect(s.exits()).toBe(1);
    expect(s.hubNote()).toBe('🌱 Good try! +5 F⁻ • Brush the whole 2 minutes to earn a Habit Stamp.');
    expect(s.el('btn-done-pacer')).toBeNull();
    expect(s.spoken).toEqual([]);
  });

  it('during floss, saves the brush alone, quietly, and the hub says so', () => {
    const s = brushScreen({ rinse: true });
    s.frames(121);
    s.tap('btn-pacer-start-floss');
    s.frames(10);
    s.hush();
    s.tap('btn-pacer-exit');
    expect(s.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 50, stampAwarded: true }]);
    expect(s.clock.isPacerActive()).toBe(false);
    expect(s.exits()).toBe(1);
    expect(s.hubNote()).toBe('🦷 Fresh Mint Smooth Bask! +50 F⁻ & +1 Habit Stamp!');
    expect(s.el('btn-done-pacer')).toBeNull();
    expect(s.spoken).toEqual([]);
    expect(s.sounds).toEqual(['complete']);
  });

  it('during floss with the rinse step off, still saves the brush alone (floss unfinished)', () => {
    const s = brushScreen();
    s.frames(121);
    s.tap('btn-pacer-start-floss');
    s.frames(30);
    s.pressKey('Escape');
    expect(s.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 50, stampAwarded: true }]);
    expect(s.exits()).toBe(1);
  });

  it('during the rinse after floss ran to its end, saves brush and floss, never the rinse', () => {
    const s = brushScreen({ rinse: true });
    s.frames(121);
    s.tap('btn-pacer-start-floss');
    s.frames(46);
    s.tap('btn-pacer-start-rinse');
    s.frames(20);
    s.hush();
    s.tap('btn-pacer-exit');
    expect(s.paid).toEqual([{ withFlossBonus: true, withMouthwashBonus: false, ionsAwarded: 75, stampAwarded: true }]);
    expect(s.exits()).toBe(1);
    expect(s.hubNote()).toBe('🦷 Fresh Mint Smooth Bask! +75 F⁻ & +1 Habit Stamp!');
    expect(s.spoken).toEqual([]);
  });

  it('during the rinse started from floss’s rinse button, the floss counts as done, as the rinse’s Done would', () => {
    const s = brushScreen({ rinse: true });
    s.frames(121);
    s.tap('btn-pacer-start-floss');
    s.frames(10);
    s.tap('btn-pacer-to-rinse');
    s.frames(5);
    s.tap('btn-pacer-exit');
    expect(s.paid).toEqual([{ withFlossBonus: true, withMouthwashBonus: false, ionsAwarded: 75, stampAwarded: true }]);
  });

  it('during the rinse after floss was skipped, saves the brush alone', () => {
    const s = brushScreen({ rinse: true });
    s.frames(121);
    s.tap('btn-pacer-start-floss');
    s.frames(10);
    s.tap('btn-pacer-skip-floss');
    s.tap('btn-pacer-start-rinse');
    s.frames(5);
    s.tap('btn-pacer-exit');
    expect(s.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 50, stampAwarded: true }]);
  });
});

describe('review fixes', () => {
  it('Pause during floss, then Skip with the rinse on: the rinse card is not left paused', () => {
    const s = brushScreen({ rinse: true });
    s.frames(121);
    s.tap('btn-pacer-start-floss');
    s.frames(10);
    s.pressSpace();
    expect(s.clock.isPacerPaused()).toBe(true);
    expect(s.pauseChanges.at(-1)).toBe(true);
    s.tap('btn-pacer-skip-floss');
    expect(s.clock.isPacerWaiting()).toBe(true);
    expect(s.clock.isPacerPaused()).toBe(false);
    expect(s.pauseChanges.at(-1)).toBe(false); // the music comes back up
    expect(s.el('btn-pacer-resume')?.hidden).toBe(true); // no dead "TAP TO RESUME"
    s.tap('btn-pacer-start-rinse');
    s.frames(5);
    expect(s.clock.getPacerElapsedSec()).toBeCloseTo(170, 1);
  });

  it('after midnight, the card’s Ion amounts follow the day the brush is paid on (yesterday used up)', () => {
    // Brushing ends 23:59:00 on the 20th, which already had its two full rewards; the rinse card
    // is drawn after midnight, when the 21st still has both.
    const s = brushScreen({ start: new Date(2026, 10, 20, 23, 57, 0), rinse: true });
    s.saveSys.getSave().dailySlotsByDate['2026-11-20'] = { fullRewards: 2, tips: 0 };
    s.frames(121);
    s.cardUp(300);
    s.tap('btn-pacer-skip-wait');
    expect(s.text('btn-pacer-skip-wait')).toBe('Skip');
    s.tap('btn-pacer-skip-wait');
    expect(s.paid[0]).toMatchObject({ ionsAwarded: 5, stampAwarded: false });
  });

  it('after midnight, the card’s Ion amounts follow the day the brush is paid on (today used up)', () => {
    const s = brushScreen({ start: new Date(2026, 10, 20, 23, 57, 0), rinse: true });
    s.saveSys.getSave().dailySlotsByDate['2026-11-21'] = { fullRewards: 2, tips: 0 };
    s.frames(121);
    s.cardUp(300);
    s.tap('btn-pacer-skip-wait');
    expect(s.text('btn-pacer-skip-wait')).toBe('Skip (+50 F⁻)');
    s.tap('btn-pacer-skip-wait');
    expect(s.paid[0]).toMatchObject({ ionsAwarded: 50, stampAwarded: true });
  });

  it('the safety finish in a hidden tab saves the brush without a chime or a word', () => {
    const s = brushScreen();
    s.frames(121);
    s.hush();
    s.setHidden(true);
    s.cardUp(BRUSH_ALONG_STAGE_WAIT_SEC);
    expect(s.paid).toHaveLength(1);
    expect(s.sounds).toEqual([]);
    expect(s.spoken).toEqual([]);
  });

  it('floss’s Skip asks again whether the rinse step is on (M06)', () => {
    const s = brushScreen({ rinse: true });
    s.frames(121);
    s.tap('btn-pacer-start-floss');
    s.frames(10);
    s.setRinseStep(false); // turned off in another tab meanwhile
    s.tap('btn-pacer-skip-floss');
    expect(s.clock.isPacerActive()).toBe(false);
    expect(s.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 50, stampAwarded: true }]);
  });

  it('the clock is no pause button on a card, and the Start button takes the focus when the card goes up', () => {
    const s = brushScreen({ rinse: true });
    s.frames(60);
    expect(s.el('pacer-clock')?.getAttribute('title')).toBe('Tap timer to Pause or Resume');
    expect(s.focused()).toBeNull();
    s.frames(61);
    expect(s.el('pacer-clock')?.getAttribute('title')).toBeNull();
    expect(s.focused()).toBe('btn-pacer-start-floss');
    // a redraw for a new language does not move the focus
    s.clearFocus();
    s.pickLanguage('de');
    expect(s.text('pacer-title')).toBe('BEREIT FÜR DEN STICK?');
    expect(s.focused()).toBeNull();
    s.tap('btn-pacer-skip-wait');
    expect(s.focused()).toBe('btn-pacer-start-rinse');
  });

  it('Start is coloured by the stage it starts, however the card was reached', () => {
    const css = readFileSync(join(__dirname, '..', 'src/styles/main.css'), 'utf8');
    const startRule = (stage: string) =>
      new RegExp(`\\.pacer-card\\[data-wait="${stage}"\\] \\.pacer-actions \\.btn-primary \\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(startRule('floss')).toContain('background: var(--gold);');
    expect(startRule('rinse')).toContain('background: #d9b3ff;');
    // after the stage colours, so a rinse card reached by Skip from the floss card looks the same
    expect(css.indexOf('[data-wait="rinse"] .pacer-actions .btn-primary')).toBeGreaterThan(
      css.indexOf('[data-stage="flossBonus"] .pacer-actions .btn-primary')
    );
    expect(css).toMatch(/\.pacer-card\[data-wait\] #pacer-clock \{\s*cursor: default;/);
  });
});

describe('the floss tool and rinse length can be chosen on the cards', () => {
  it('Pick | String on the floss card', () => {
    const s = brushScreen();
    s.frames(121);
    s.chip('stringFloss').click();
    expect(s.clock.isPacerWaiting()).toBe(true);
    expect(s.text('pacer-title')).toBe('READY TO FLOSS?');
    s.tap('btn-pacer-start-floss');
    expect(s.text('pacer-title')).toBe('STRING FLOSS • TOP TEETH');
  });

  it('60s | 30s on the rinse card', () => {
    const s = brushScreen({ rinse: true });
    s.frames(121);
    s.tap('btn-pacer-skip-wait');
    s.chip('quick30s').click();
    expect(s.clock.isPacerWaiting()).toBe(true);
    expect(s.text('pacer-title')).toBe('READY TO RINSE?');
    s.tap('btn-pacer-start-rinse');
    expect(s.clock.getPacerStageEndSec()).toBe(195);
    s.frames(31);
    expect(s.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: true, ionsAwarded: 75, stampAwarded: true }]);
  });
});

describe('skip to floss: the small two-tap button while brushing', () => {
  const SKIP = 'btn-pacer-skip-to-floss';
  /** Not on the screen, or there but hidden. */
  const notShown = (b: FakeElement | null): boolean => b === null || b.hidden;

  it('shows "Floss ›", named "Floss" for screen readers, while brushing', () => {
    const s = brushScreen();
    s.frames(5);
    expect(s.text(SKIP)).toBe('Floss ›');
    expect(s.el(SKIP)?.getAttribute('aria-label')).toBe('Floss');
    expect(s.el(SKIP)?.hidden).toBe(false);
  });

  it('one tap only arms it: "Tap again", and brushing goes on', () => {
    const s = brushScreen();
    s.frames(30);
    s.hush();
    s.tap(SKIP);
    expect(s.text(SKIP)).toBe('Tap again');
    expect(s.el(SKIP)?.getAttribute('aria-label')).toBe('Tap again');
    expect(s.clock.getPacerStage()).toBe('brushing');
    expect(s.spoken).toEqual([]);
    s.frames(1);
    expect(s.clock.getPacerElapsedSec()).toBeCloseTo(31, 1);
  });

  it('a second tap within 3 s goes straight into floss at 0:00, a good try rather than a full brush', () => {
    const s = brushScreen({ rinse: true });
    s.frames(30);
    s.tap(SKIP);
    s.frames(2);
    s.hush();
    s.tap(SKIP);
    expect(s.clock.getPacerStage()).toBe('flossBonus');
    expect(s.clock.isPacerWaiting()).toBe(false); // the tap is the start: no card
    expect(s.clock.getPacerElapsedSec()).toBe(120);
    expect(s.sounds).toEqual(['quadrant']);
    expect(s.spoken).toEqual(['Floss']);
    expect(s.el(SKIP)).toBeNull();
    // not the full 2 minutes: the floss buttons promise no amounts, and the brush pays a good-try tip
    expect(s.text('btn-pacer-skip-floss')).toBe('Skip');
    s.frames(46);
    s.tap('btn-pacer-start-rinse');
    s.frames(61);
    expect(s.paid).toEqual([{ withFlossBonus: true, withMouthwashBonus: true, ionsAwarded: 5, stampAwarded: false }]);
  });

  it('the arm runs out after 3 s: back to "Floss ›", and the next tap only arms it again', () => {
    const s = brushScreen();
    s.frames(30);
    s.tap(SKIP);
    s.cardUp(2);
    expect(s.text(SKIP)).toBe('Tap again');
    s.cardUp(2);
    expect(s.text(SKIP)).toBe('Floss ›');
    expect(s.el(SKIP)?.getAttribute('aria-label')).toBe('Floss');
    s.tap(SKIP);
    expect(s.clock.getPacerStage()).toBe('brushing');
    expect(s.text(SKIP)).toBe('Tap again');
  });

  it('hidden while paused, and pausing lets go of a first tap', () => {
    const s = brushScreen();
    s.frames(30);
    s.tap(SKIP);
    s.pressSpace();
    expect(notShown(s.el(SKIP))).toBe(true);
    s.pressSpace();
    expect(s.el(SKIP)?.hidden).toBe(false);
    expect(s.text(SKIP)).toBe('Floss ›');
    s.tap(SKIP);
    expect(s.clock.getPacerStage()).toBe('brushing'); // that was a fresh first tap
  });

  it('not on the waiting cards, during floss, or during the rinse', () => {
    const s = brushScreen({ rinse: true });
    s.frames(121);
    expect(notShown(s.el(SKIP))).toBe(true);
    s.tap('btn-pacer-start-floss');
    s.frames(5);
    expect(notShown(s.el(SKIP))).toBe(true);
    s.frames(41);
    expect(notShown(s.el(SKIP))).toBe(true);
    s.tap('btn-pacer-start-rinse');
    s.frames(5);
    expect(notShown(s.el(SKIP))).toBe(true);
  });

  it('a first tap left armed as brushing runs out does not carry onto the card', () => {
    const s = brushScreen();
    s.frames(119);
    s.tap(SKIP);
    s.frames(2);
    expect(s.clock.isPacerWaiting()).toBe(true);
    expect(s.text('pacer-title')).toBe('READY TO FLOSS?');
  });

  it('follows the coach language', () => {
    const s = brushScreen({ lang: 'de' });
    s.frames(5);
    expect(s.text(SKIP)).toBe('Zahnseide ›');
    s.tap(SKIP);
    expect(s.text(SKIP)).toBe('Nochmal tippen');
    s.pickLanguage('ja');
    expect(s.text(SKIP)).toBe('もういちどタップ'); // still armed after the redraw
  });

  it('Exit during floss after skipping ahead saves the good try, and the hub says so', () => {
    const s = brushScreen();
    s.frames(60);
    s.tap(SKIP);
    s.tap(SKIP);
    s.frames(10);
    s.tap('btn-pacer-exit');
    expect(s.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 5, stampAwarded: false }]);
    expect(s.hubNote()).toBe('🌱 Good try! +5 F⁻ • Brush the whole 2 minutes to earn a Habit Stamp.');
  });
});

describe('the card between stages speaks the coach language', () => {
  it('Spanish', () => {
    const s = brushScreen({ lang: 'es', rinse: true });
    s.frames(121);
    expect(s.text('pacer-title')).toBe('¿LISTO PARA EL HILO?');
    expect(s.text('btn-pacer-start-floss')).toBe('Empezar Hilo');
    expect(s.text('btn-pacer-skip-wait')).toBe('Saltar (+50 F⁻)');
    s.tap('btn-pacer-skip-wait');
    expect(s.text('pacer-title')).toBe('¿LISTO PARA ENJUAGAR?');
    expect(s.text('btn-pacer-start-rinse')).toBe('Empezar Enjuague');
  });
});
