import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockController } from '../src/engine/ClockController';
import { EventBus } from '../src/engine/EventBus';
import { BRUSH_BACKDATE_LIMIT_SEC, HabitBank, brushRewardDay } from '../src/engine/persistence/HabitBank';
import { INCLUDE_RINSE_KEY } from '../src/engine/persistence/pacerPrefs';
import { SaveSystem, createDefaultSave } from '../src/engine/persistence/SaveSystem';
import type { AppEventMap } from '../src/engine/types';
import { uiTranslator } from '../src/i18n/uiTranslator';
import { BrushAlongOverlay } from '../src/ui/BrushAlongOverlay';

/**
 * N5: a brush whose timer ran out while the page was hidden (the phone was locked, or another app
 * was in front) is paid on the day it really ended, not the day the page was opened again.
 *
 * The real brush screen, clock, bank and save run here against a made-up calendar clock and a
 * stand-in page with nothing on it. Frames are fed by hand, 60 a second. Floss and the rinse each
 * wait for a tap, made here by calling what the screen's buttons call.
 *
 * The last section (W16) uses the same stand-in page to read the summary the brush screen draws.
 */

beforeEach(() => {
  // The waiting card between stages checks its wait once a second; those checks run on this clock too.
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const at = (y: number, mo: number, d: number, h = 12, mi = 0, s = 0): Date => new Date(y, mo - 1, d, h, mi, s);

/** A page element on which nothing is ever found: the brush screen then skips all its drawing. */
function blankElement() {
  return {
    className: '',
    innerHTML: '',
    appendChild: () => {},
    remove: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

const quietVoice = {
  getLanguage: () => 'en',
  speak: () => {},
  stop: () => {},
  pause: () => {},
  resume: () => {},
  isEnabled: () => false,
  isSupported: () => false,
  setEnabled: () => {},
  setLanguage: () => {},
};

const quietCallbacks = {
  onActiveQuadrantChanged: () => {},
  onPlayCue: () => {},
  onExitToHub: () => {},
};

type BrushScreen = {
  mount(root: HTMLElement): void;
  dispose(): void;
  // What the buttons on the card between stages call.
  startFloss(): void;
  startRinse(): void;
  skipStageWait(): void;
};
const BrushScreenClass = BrushAlongOverlay as unknown as new (...args: unknown[]) => BrushScreen;

/** Where a test's save is kept instead of the browser's storage. */
function memoryStorage() {
  const stored = new Map<string, string>();
  return {
    getItem: (key: string): string | null => stored.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      stored.set(key, value);
    },
  };
}

/**
 * One device for a test: one clock, one save, and brush sessions started on it one after another,
 * the way the game does. `start` is the calendar time the test begins at.
 */
function bathroom(start: Date, options: { rinse?: boolean } = {}) {
  vi.setSystemTime(start);
  // The brush screen builds itself inside one element of its own; the newest one is kept so a test
  // can read what the screen last drew into it.
  let screenBox = blankElement();
  const visibilityListeners = new Set<() => void>();
  const page = {
    visibilityState: 'visible' as 'visible' | 'hidden',
    createElement: () => {
      screenBox = blankElement();
      return screenBox;
    },
    addEventListener: (type: string, cb: () => void) => {
      if (type === 'visibilitychange') visibilityListeners.add(cb);
    },
    removeEventListener: (type: string, cb: () => void) => {
      if (type === 'visibilitychange') visibilityListeners.delete(cb);
    },
  };
  vi.stubGlobal('document', page);
  vi.stubGlobal('window', {
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: {
      getItem: (key: string) => (options.rinse && key === INCLUDE_RINSE_KEY ? '1' : null),
      setItem: () => {},
    },
  });
  const bus = new EventBus();
  const clock = new ClockController(bus);
  const saveSys = new SaveSystem(bus, memoryStorage());
  saveSys.load(start.getTime());

  /** What each finished brush was paid, with the calendar time it was paid at. */
  const paid: Array<AppEventMap['pacer:complete'] & { paidAt: Date }> = [];
  bus.on('pacer:complete', (payload) => paid.push({ ...payload, paidAt: new Date() }));

  let perfMs = 0;
  let wallMs = start.getTime();
  clock.tickFrame(perfMs);

  /** The page in view for this long: 60 frames a second, the calendar clock moving with them. */
  const frames = (sec: number): void => {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) {
      perfMs += 1000 / 60;
      wallMs += 1000 / 60;
      vi.setSystemTime(Math.round(wallMs));
      clock.tickFrame(perfMs);
    }
  };

  /** The page hidden (phone locked) until `when`, then back in view. No frames run meanwhile. */
  const hiddenUntil = (when: Date): void => {
    page.visibilityState = 'hidden';
    clock.noteHidden(Date.now());
    perfMs += when.getTime() - wallMs;
    wallMs = when.getTime();
    vi.setSystemTime(when);
    page.visibilityState = 'visible';
    clock.noteVisible(Date.now(), perfMs);
    for (const cb of [...visibilityListeners]) cb();
  };

  /**
   * The page in view for this many whole seconds with a waiting card up: the clock holds, and the
   * card checks its wait each second.
   */
  const cardUp = (sec: number): void => {
    for (let i = 0; i < sec; i++) {
      perfMs += 1000;
      wallMs += 1000;
      vi.advanceTimersByTime(1000);
      vi.setSystemTime(Math.round(wallMs));
      clock.tickFrame(perfMs);
    }
  };

  /** The page left in view until `when`, with no brush running. */
  const waitUntil = (when: Date): void => {
    perfMs += when.getTime() - wallMs;
    wallMs = when.getTime();
    vi.setSystemTime(when);
    clock.tickFrame(perfMs);
  };

  let screen: BrushScreen | null = null;
  /** Taps 2-Min Brush: a fresh brush screen, as the game makes one each time. */
  const startBrush = (): void => {
    screen?.dispose();
    screen = new BrushScreenClass(bus, clock, saveSys, quietVoice, quietCallbacks);
    screen.mount(blankElement() as unknown as HTMLElement);
  };

  /** Taps a finishing button on the brush screen (Done or Skip), which the stand-in page cannot show. */
  const tapFinish = (withFloss: boolean, withRinse: boolean): void => {
    (screen as unknown as { completeSession(floss: boolean, rinse: boolean): void }).completeSession(withFloss, withRinse);
  };

  /** Taps a button on the card between stages. */
  const tap = (button: 'Start Flossing' | 'Start Rinse' | 'Skip'): void => {
    if (button === 'Start Flossing') screen?.startFloss();
    else if (button === 'Start Rinse') screen?.startRinse();
    else screen?.skipStageWait();
  };

  /** The whole 2 minutes and a second on the floss card, a tap, then the whole floss: 2:46 in all. */
  const brushAndFloss = (): void => {
    frames(121);
    tap('Start Flossing');
    frames(46);
  };

  return {
    clock,
    saveSys,
    paid,
    frames,
    hiddenUntil,
    waitUntil,
    cardUp,
    startBrush,
    tap,
    brushAndFloss,
    tapFinish,
    screenHtml: () => screenBox.innerHTML,
  };
}

describe('a brush that ended while the page was hidden', () => {
  it('left overnight, it is paid on the evening it ended, and today keeps both its full rewards', () => {
    const room = bathroom(at(2026, 11, 20, 20, 0));
    room.startBrush();
    room.frames(30);
    room.hiddenUntil(at(2026, 11, 21, 6, 50));
    // Back in view: brushing ended last night, and its floss card's wait ran out long ago, so the
    // brush finishes at once with what was done. Floss was never started, so it earns nothing.
    room.frames(1);
    expect(room.paid).toHaveLength(1);
    expect(room.paid[0]).toMatchObject({ withFlossBonus: false, withMouthwashBonus: false });
    const save = room.saveSys.getSave();
    expect(save.dailySlotsByDate['2026-11-20']).toEqual({ fullRewards: 1, tips: 0 });
    expect(save.dailySlotsByDate['2026-11-21']).toBeUndefined();
    // The tooth is polished as of the morning it was found, as before.
    expect(save.companion.lastEvaluatedEpochMs).toBe(room.paid[0].paidAt.getTime());

    // The real morning brush and the real bedtime brush, neither ever hidden, floss started on the tap.
    room.waitUntil(at(2026, 11, 21, 7, 30));
    room.startBrush();
    room.brushAndFloss();
    room.waitUntil(at(2026, 11, 21, 19, 30));
    room.startBrush();
    room.brushAndFloss();

    expect(room.paid.map((p) => p.stampAwarded)).toEqual([true, true, true]);
    expect(room.paid.map((p) => p.ionsAwarded)).toEqual([50, 100, 100]);
    expect(save.dailySlotsByDate).toEqual({
      '2026-11-20': { fullRewards: 1, tips: 0 },
      '2026-11-21': { fullRewards: 2, tips: 0 },
    });
    expect(save.totalBrushStamps).toBe(3);
  });

  it('is dated from the end of its last step: the rinse, when the rinse step is on', () => {
    // Started at 23:57:00 on the 20th: brushing ends 23:59:00, floss is started a second later and
    // ends 23:59:46, the 60 s rinse is started a second after that and ends 00:00:47 on the 21st.
    // The phone is locked 10 s into the rinse and opened again on the 22nd: it belongs to the 21st.
    const room = bathroom(at(2026, 11, 20, 23, 57, 0), { rinse: true });
    room.startBrush();
    room.brushAndFloss();
    expect(room.paid).toHaveLength(0); // the rinse waits for its tap
    room.tap('Start Rinse');
    room.frames(10);
    room.hiddenUntil(at(2026, 11, 22, 6, 50));
    room.frames(1);
    expect(room.paid).toHaveLength(1);
    expect(room.paid[0]).toMatchObject({ withFlossBonus: true, withMouthwashBonus: true, ionsAwarded: 100, stampAwarded: true });
    expect(room.saveSys.getSave().dailySlotsByDate).toEqual({ '2026-11-21': { fullRewards: 1, tips: 0 } });
  });

  it('when that evening already had its two full rewards, it gets a small tip there and today is untouched', () => {
    const room = bathroom(at(2026, 11, 20, 20, 0));
    const save = room.saveSys.getSave();
    save.dailySlotsByDate['2026-11-20'] = { fullRewards: 2, tips: 0 };
    room.startBrush();
    room.frames(30);
    room.hiddenUntil(at(2026, 11, 21, 6, 50));
    room.frames(1);
    expect(room.paid[0]).toMatchObject({ ionsAwarded: 5, stampAwarded: false });
    expect(save.dailySlotsByDate).toEqual({ '2026-11-20': { fullRewards: 2, tips: 1 } });
  });

  it('just under two days late is still paid on the day it ended', () => {
    const room = bathroom(at(2026, 11, 20, 20, 0));
    room.startBrush();
    room.frames(30);
    room.hiddenUntil(at(2026, 11, 22, 20, 0));
    room.frames(1);
    expect(room.paid).toHaveLength(1);
    expect(Object.keys(room.saveSys.getSave().dailySlotsByDate)).toEqual(['2026-11-20']);
  });

  it('more than two days late, it is paid today', () => {
    const room = bathroom(at(2026, 11, 20, 20, 0));
    room.startBrush();
    room.frames(30);
    room.hiddenUntil(at(2026, 11, 23, 6, 50));
    room.frames(1);
    expect(room.paid).toHaveLength(1);
    expect(room.paid[0]).toMatchObject({ withFlossBonus: false, ionsAwarded: 50, stampAwarded: true });
    expect(room.saveSys.getSave().dailySlotsByDate).toEqual({ '2026-11-23': { fullRewards: 1, tips: 0 } });
  });
});

describe('a brush that was never hidden', () => {
  it('comes out exactly as it did before', () => {
    const start = at(2026, 11, 20, 20, 0);
    const room = bathroom(start);
    room.startBrush();
    room.brushAndFloss();
    expect(room.paid).toHaveLength(1);
    expect(room.paid[0]).toMatchObject({ withFlossBonus: true, withMouthwashBonus: false, ionsAwarded: 100, stampAwarded: true });

    // The same brush paid the old way, at the same moment: no reward day, just "now".
    vi.setSystemTime(room.paid[0].paidAt);
    const oldWay = new SaveSystem(new EventBus(), memoryStorage());
    const control = oldWay.load(start.getTime());
    HabitBank.completeBrushAlong(control, { withFlossBonus: true, withMouthwashBonus: false, fullBrush: true, rinseStepOff: true });
    oldWay.save(control);
    expect(room.saveSys.getSave()).toEqual(oldWay.getSave());
    expect(Object.keys(control.dailySlotsByDate)).toEqual(['2026-11-20']);
  });

  it('ending just after midnight, it is paid on the new day', () => {
    // From 23:57:30: brushing ends 23:59:30, floss is started at 23:59:31 and ends at 00:00:16.
    const room = bathroom(at(2026, 11, 20, 23, 57, 30));
    room.startBrush();
    room.brushAndFloss();
    expect(room.paid).toHaveLength(1);
    expect(room.saveSys.getSave().dailySlotsByDate).toEqual({ '2026-11-21': { fullRewards: 1, tips: 0 } });
  });

  it('paused by the player and left hidden overnight, it is paid when it is finished', () => {
    const room = bathroom(at(2026, 11, 20, 20, 0));
    room.startBrush();
    room.frames(30);
    room.clock.setPacerPaused(true);
    room.hiddenUntil(at(2026, 11, 21, 6, 50));
    room.clock.setPacerPaused(false);
    room.frames(91);
    room.tap('Start Flossing');
    room.frames(46);
    expect(room.paid).toHaveLength(1);
    expect(room.saveSys.getSave().dailySlotsByDate).toEqual({ '2026-11-21': { fullRewards: 1, tips: 0 } });
  });
});

describe('a brush finished from the card between stages', () => {
  it('Skip after midnight is dated when brushing ended, not at the tap', () => {
    // Brushing ends at 23:59:00; the floss card stays up five minutes, past midnight.
    const room = bathroom(at(2026, 11, 20, 23, 57, 0));
    room.startBrush();
    room.frames(121);
    room.cardUp(300);
    expect(room.paid).toHaveLength(0);
    room.tap('Skip');
    expect(room.paid).toHaveLength(1);
    expect(room.paid[0]).toMatchObject({ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 50, stampAwarded: true });
    expect(room.paid[0].paidAt.getDate()).toBe(21);
    expect(room.saveSys.getSave().dailySlotsByDate).toEqual({ '2026-11-20': { fullRewards: 1, tips: 0 } });
  });

  it('the rinse card’s Skip is dated when the floss ended, with the floss counted', () => {
    // Floss ends at 23:59:46; the rinse card waits until after midnight.
    const room = bathroom(at(2026, 11, 20, 23, 57, 0), { rinse: true });
    room.startBrush();
    room.brushAndFloss();
    room.cardUp(120);
    room.tap('Skip');
    expect(room.paid).toHaveLength(1);
    expect(room.paid[0]).toMatchObject({ withFlossBonus: true, withMouthwashBonus: false, ionsAwarded: 75, stampAwarded: true });
    expect(room.saveSys.getSave().dailySlotsByDate).toEqual({ '2026-11-20': { fullRewards: 1, tips: 0 } });
  });

  it('left up for ten minutes, it finishes by itself, dated when brushing ended', () => {
    const room = bathroom(at(2026, 11, 20, 23, 55, 0));
    room.startBrush();
    room.frames(120); // brushing ends at 23:57:00
    room.cardUp(599);
    expect(room.paid).toHaveLength(0);
    room.cardUp(1);
    expect(room.paid).toHaveLength(1);
    expect(room.paid[0]).toMatchObject({ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 50 });
    // ten minutes after brushing ended, to within a frame or two
    expect(Math.abs(room.paid[0].paidAt.getTime() - at(2026, 11, 21, 0, 7, 0).getTime())).toBeLessThan(100);
    expect(room.saveSys.getSave().dailySlotsByDate).toEqual({ '2026-11-20': { fullRewards: 1, tips: 0 } });
  });

  it('left up and the phone locked, it finishes as soon as the page is back in view', () => {
    const room = bathroom(at(2026, 11, 20, 20, 0), { rinse: true });
    room.startBrush();
    room.brushAndFloss(); // the rinse card goes up at 20:02:47
    room.cardUp(60);
    room.hiddenUntil(at(2026, 11, 20, 20, 15)); // no frame runs: the check on coming back does it
    expect(room.paid).toHaveLength(1);
    expect(room.paid[0]).toMatchObject({ withFlossBonus: true, withMouthwashBonus: false, ionsAwarded: 75 });
  });

  it('locked for less than ten minutes, the card is still there, and the rinse still waits', () => {
    const room = bathroom(at(2026, 11, 20, 20, 0), { rinse: true });
    room.startBrush();
    room.brushAndFloss();
    room.hiddenUntil(at(2026, 11, 20, 20, 10));
    room.frames(5);
    expect(room.paid).toHaveLength(0);
    expect(room.clock.isPacerWaiting()).toBe(true);
    room.tap('Start Rinse');
    room.frames(61);
    expect(room.paid).toHaveLength(1);
    expect(room.paid[0]).toMatchObject({ withFlossBonus: true, withMouthwashBonus: true, ionsAwarded: 100 });
  });
});

describe('the reward day rule', () => {
  const now = at(2026, 11, 21, 6, 50);
  const secondsAgo = (sec: number): Date => new Date(now.getTime() - sec * 1000);

  it('uses the same two-day limit as a brush arriving late from the Apple Watch', () => {
    expect(BRUSH_BACKDATE_LIMIT_SEC).toBe(2 * 86_400);
  });

  it('dates a brush to when it ended, up to two days back', () => {
    expect(brushRewardDay(now, now)).toBe(now);
    expect(brushRewardDay(secondsAgo(38_835), now).getTime()).toBe(now.getTime() - 38_835_000);
    expect(brushRewardDay(secondsAgo(2 * 86_400), now).getTime()).toBe(now.getTime() - 2 * 86_400_000);
  });

  it('counts an older brush, one from the future, or an unreadable time as now', () => {
    expect(brushRewardDay(secondsAgo(2 * 86_400 + 1), now)).toBe(now);
    expect(brushRewardDay(secondsAgo(400 * 86_400), now)).toBe(now);
    expect(brushRewardDay(secondsAgo(-1), now)).toBe(now);
    expect(brushRewardDay(new Date(Number.NaN), now)).toBe(now);
  });

  it('the bank pays on the reward day and does everything else as of now', () => {
    const save = createDefaultSave(now.getTime());
    save.dailySlotsByDate['2026-10-10'] = { fullRewards: 1, tips: 0 }; // 42 days old
    const outcome = HabitBank.completeBrushAlong(save, {
      withFlossBonus: true,
      rinseStepOff: true,
      date: now,
      rewardDay: at(2026, 11, 20, 20, 2, 45),
    });
    expect(outcome).toMatchObject({ slotType: 'full', stampAwarded: true, ionsAwarded: 100 });
    // old days are cleared out counting from now, and the tooth is polished as of now
    expect(save.dailySlotsByDate).toEqual({ '2026-11-20': { fullRewards: 1, tips: 0 } });
    expect(save.companion.lastEvaluatedEpochMs).toBe(now.getTime());
  });

  it('with no reward day the bank pays on the day it is called, as always', () => {
    const save = createDefaultSave(now.getTime());
    HabitBank.completeBrushAlong(save, { withFlossBonus: false, date: now });
    expect(save.dailySlotsByDate).toEqual({ '2026-11-21': { fullRewards: 1, tips: 0 } });
  });
});

describe('W16: the bonus badge on the brush summary follows the page language', () => {
  const german: Record<string, string> = JSON.parse(
    readFileSync(join(__dirname, '..', 'src/i18n/locales/de.json'), 'utf8')
  );

  afterEach(async () => {
    vi.unstubAllGlobals();
    await uiTranslator.setLanguage('en');
  });

  /** Brushes to the summary so that it shows the given badge, and returns what the screen drew. */
  function summaryWith(badge: 'Floss Bonus' | 'Floss + Rinse' | 'Bonus Step'): string {
    const room = bathroom(at(2026, 11, 20, 20, 0), { rinse: badge !== 'Floss Bonus' });
    room.startBrush();
    if (badge === 'Bonus Step') {
      // the whole 2 minutes, floss started, then Done on the floss step: one extra step of the two
      room.frames(121);
      room.tap('Start Flossing');
      room.frames(10);
      room.tapFinish(true, false);
    } else {
      // floss to its end (rinse step off), or floss and the 60 s rinse, each started on its tap
      room.brushAndFloss();
      if (badge === 'Floss + Rinse') {
        room.tap('Start Rinse');
        room.frames(61);
      }
    }
    expect(room.paid).toHaveLength(1);
    return room.screenHtml();
  }

  const times = { 'Floss Bonus': '×2', 'Floss + Rinse': '×2', 'Bonus Step': '×1.5' } as const;

  it.each(['Floss Bonus', 'Floss + Rinse', 'Bonus Step'] as const)('English page: "%s" reads as before', (badge) => {
    expect(summaryWith(badge)).toContain(`<span class="pill-badge">${times[badge]} ${badge}</span>`);
  });

  it.each(['Floss Bonus', 'Floss + Rinse', 'Bonus Step'] as const)('German page: "%s" is in German', async (badge) => {
    await uiTranslator.setLanguage('de');
    expect(german[badge]).toBeTruthy();
    const html = summaryWith(badge);
    expect(html).toContain(`<span class="pill-badge">${times[badge]} ${german[badge]}</span>`);
    expect(html).not.toContain(`${times[badge]} ${badge}<`);
  });
});
