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
 * stand-in page with nothing on it. Frames are fed by hand, 60 a second.
 *
 * The last section (W16) uses the same stand-in page to read the summary the brush screen draws.
 */

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
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

type BrushScreen = { mount(root: HTMLElement): void; dispose(): void };
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
  vi.stubGlobal('document', {
    createElement: () => {
      screenBox = blankElement();
      return screenBox;
    },
  });
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
    clock.noteHidden(Date.now());
    perfMs += when.getTime() - wallMs;
    wallMs = when.getTime();
    vi.setSystemTime(when);
    clock.noteVisible(Date.now(), perfMs);
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

  return { clock, saveSys, paid, frames, hiddenUntil, waitUntil, startBrush, tapFinish, screenHtml: () => screenBox.innerHTML };
}

describe('a brush that ended while the page was hidden', () => {
  it('left overnight, it is paid on the evening it ended, and today keeps both its full rewards', () => {
    const room = bathroom(at(2026, 11, 20, 20, 0));
    room.startBrush();
    room.frames(30);
    room.hiddenUntil(at(2026, 11, 21, 6, 50));
    room.frames(1); // back in view: the ritual passes through the steps that ended meanwhile
    expect(room.paid).toHaveLength(1);
    const save = room.saveSys.getSave();
    expect(save.dailySlotsByDate['2026-11-20']).toEqual({ fullRewards: 1, tips: 0 });
    expect(save.dailySlotsByDate['2026-11-21']).toBeUndefined();
    // The tooth is polished as of the morning it was found, as before.
    expect(save.companion.lastEvaluatedEpochMs).toBe(room.paid[0].paidAt.getTime());

    // The real morning brush and the real bedtime brush, neither ever hidden.
    room.waitUntil(at(2026, 11, 21, 7, 30));
    room.startBrush();
    room.frames(166);
    room.waitUntil(at(2026, 11, 21, 19, 30));
    room.startBrush();
    room.frames(166);

    expect(room.paid.map((p) => p.stampAwarded)).toEqual([true, true, true]);
    expect(room.paid.map((p) => p.ionsAwarded)).toEqual([100, 100, 100]);
    expect(save.dailySlotsByDate).toEqual({
      '2026-11-20': { fullRewards: 1, tips: 0 },
      '2026-11-21': { fullRewards: 2, tips: 0 },
    });
    expect(save.totalBrushStamps).toBe(3);
  });

  it('is dated from the end of its last step: the rinse, when the rinse step is on', () => {
    // Started at 23:57:30 on the 20th: brushing ends 23:59:30, floss 00:00:15, the 60 s rinse
    // 00:01:15 on the 21st. Opened again on the 22nd, it belongs to the 21st.
    const room = bathroom(at(2026, 11, 20, 23, 57, 30), { rinse: true });
    room.startBrush();
    room.frames(30);
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
    expect(room.paid[0]).toMatchObject({ ionsAwarded: 100, stampAwarded: true });
    expect(room.saveSys.getSave().dailySlotsByDate).toEqual({ '2026-11-23': { fullRewards: 1, tips: 0 } });
  });
});

describe('a brush that was never hidden', () => {
  it('comes out exactly as it did before', () => {
    const start = at(2026, 11, 20, 20, 0);
    const room = bathroom(start);
    room.startBrush();
    room.frames(166);
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
    // 2:45 of brushing and floss from 23:57:30 ends at 00:00:15.
    const room = bathroom(at(2026, 11, 20, 23, 57, 30));
    room.startBrush();
    room.frames(166);
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
    room.frames(136);
    expect(room.paid).toHaveLength(1);
    expect(room.saveSys.getSave().dailySlotsByDate).toEqual({ '2026-11-21': { fullRewards: 1, tips: 0 } });
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
      // the whole 2 minutes, then Done on the floss step: one extra step of the two
      room.frames(130);
      room.tapFinish(true, false);
    } else {
      // hands-free to the end: floss alone (rinse step off), or floss and the 60 s rinse
      room.frames(badge === 'Floss Bonus' ? 166 : 226);
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
