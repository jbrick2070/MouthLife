import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClockController } from '../src/engine/ClockController';
import { EventBus } from '../src/engine/EventBus';
import { INCLUDE_RINSE_KEY } from '../src/engine/persistence/pacerPrefs';
import {
  BRUSH_LOCK_NAME,
  PAID_BRUSH_SESSIONS_KEY,
  PENDING_BRUSH_KEY,
  type PendingBrush,
  recoverPendingBrush,
  settleBrush,
} from '../src/engine/persistence/pendingBrush';
import { SaveSystem } from '../src/engine/persistence/SaveSystem';
import type { AppEventMap } from '../src/engine/types';
import { BrushAlongOverlay } from '../src/ui/BrushAlongOverlay';

/**
 * Sprint 2 of docs/beta-feedback-sprint-plan.md: a brush the browser (or the Android app) never got
 * to finish is kept, as the native app keeps it (`AppCoordinator.checkpointBrushing`,
 * `storePendingBrush`, `finishPendingBrush`). The brush screen writes a note under the native name;
 * the next start pays it once, unless another tab is still brushing.
 *
 * The real brush screen, clock, bank and save run on a stand-in page with nothing on it; frames are
 * fed by hand, 60 a second. Buttons are pressed by calling what they call.
 */

const ROOT = join(__dirname, '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
const GOOD_TRY_WORDS = '🌱 Good try! +5 F⁻ • Brush the whole 2 minutes to earn a Habit Stamp.';
const RINSE_HINT = 'A grown-up can turn on the rinse in Settings.';

const screens: BrushAlongOverlay[] = [];

afterEach(() => {
  for (const screen of screens.splice(0)) screen.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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
 * Web Locks as two tabs see them: the lock is free, or held (by the brush in this tab, or by
 * `heldElsewhere`, another tab). A request that would wait never gets the lock here.
 */
class FakeLocks {
  held: string | null = null;
  readonly requests: Array<{ name: string; ifAvailable: boolean }> = [];

  request(name: string, options: { ifAvailable?: boolean }, callback: (lock: unknown) => unknown): Promise<unknown> {
    this.requests.push({ name, ifAvailable: options.ifAvailable ?? false });
    if (this.held !== null) {
      return options.ifAvailable ? Promise.resolve(callback(null)) : new Promise(() => {});
    }
    this.held = name;
    return Promise.resolve(callback({ name })).finally(() => {
      this.held = null;
    });
  }

  heldElsewhere(): void {
    this.held = BRUSH_LOCK_NAME;
  }
}

/** Lets promises that are already settled run their callbacks. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
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

/** One device: its storage, clock, save, and brushes started on it, at `start` (20:00 on 20 November). */
function device(options: { start?: Date; rinse?: boolean; locks?: FakeLocks } = {}) {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(options.start ?? new Date(2026, 10, 20, 20, 0, 0));
  const stored = new Map<string, string>();
  if (options.rinse) stored.set(INCLUDE_RINSE_KEY, '1');
  let box = blankElement();
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    createElement: () => (box = blankElement()),
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal('window', {
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, String(value));
      },
      removeItem: (key: string) => {
        stored.delete(key);
      },
    },
  });
  // No Web Locks unless the test brings its own (never the test runner's real ones).
  vi.stubGlobal('navigator', options.locks ? { locks: options.locks } : {});

  const bus = new EventBus();
  const clock = new ClockController(bus);
  const saveSys = new SaveSystem(bus, memoryStorage());
  saveSys.load(Date.now());
  const paid: Array<AppEventMap['pacer:complete']> = [];
  bus.on('pacer:complete', (p) => paid.push(p));

  let perfMs = 0;
  let wallMs = Date.now();
  clock.tickFrame(perfMs);
  const frames = (sec: number): void => {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) {
      perfMs += 1000 / 60;
      wallMs += 1000 / 60;
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

  let screen: BrushAlongOverlay | null = null;
  let exits = 0;
  let hubNote: string | undefined;
  const startBrush = (): void => {
    screen?.dispose();
    screen = new BrushAlongOverlay(bus, clock, saveSys, quietVoice as never, {
      onActiveQuadrantChanged: () => {},
      onPlayCue: () => {},
      onExitToHub: (note?: string) => {
        exits++;
        hubNote = note;
      },
    });
    screens.push(screen);
    screen.mount(blankElement() as unknown as HTMLElement);
  };
  /** Calls what one of the brush screen's buttons calls. */
  const press = (method: 'exitToHub' | 'tapSkipToFloss' | 'startFloss' | 'startRinse' | 'skipStageWait' | 'togglePause'): void => {
    (screen as unknown as Record<string, () => void>)[method]();
  };

  return {
    stored,
    note: (): PendingBrush | null => {
      const raw = stored.get(PENDING_BRUSH_KEY);
      return raw ? (JSON.parse(raw) as PendingBrush) : null;
    },
    paidList: (): string[] => JSON.parse(stored.get(PAID_BRUSH_SESSIONS_KEY) ?? '[]') as string[],
    clock,
    saveSys,
    bus,
    paid,
    frames,
    lock,
    startBrush,
    screen: () => screen!,
    press,
    tapFloss: () => {
      press('tapSkipToFloss');
      press('tapSkipToFloss');
    },
    finish: (withFloss: boolean, withRinse: boolean) =>
      (screen as unknown as { completeSession(floss: boolean, rinse: boolean): void }).completeSession(withFloss, withRinse),
    html: () => box.innerHTML,
    exits: () => exits,
    hubNote: () => hubNote,
  };
}

/** A note as the brush screen writes it; `id` keeps each test's brushes apart. */
function note(id: string, fields: Partial<PendingBrush> = {}): PendingBrush {
  const t = new Date(2026, 10, 20, 20, 1, 0).getTime();
  return {
    sessionId: id,
    brushedSec: 45,
    brushingEndedAtMs: t,
    stageEndedAtMs: t,
    fullBrush: false,
    flossDone: false,
    rinseStepOff: true,
    ...fields,
  };
}

describe('the note of a brush not yet paid', () => {
  it('nothing in the first 20 s; then a note every 10 s, as a good try', () => {
    const d = device();
    d.startBrush();
    d.frames(19.8);
    expect(d.note()).toBeNull();
    d.frames(0.5);
    const first = d.note()!;
    expect(first.brushedSec).toBeGreaterThanOrEqual(20);
    expect(first.brushedSec).toBeLessThan(20.4);
    expect(first).toMatchObject({ fullBrush: false, flossDone: false, rinseStepOff: true });
    expect(first.sessionId).not.toBe('');
    expect(first.stageEndedAtMs).toBe(first.brushingEndedAtMs);
    d.frames(5);
    expect(d.note()).toEqual(first); // not due yet
    d.frames(5.2);
    expect(d.note()!.brushedSec).toBeGreaterThanOrEqual(30);
    expect(d.note()!.sessionId).toBe(first.sessionId);
  });

  it('Pause notes it at once', () => {
    const d = device();
    d.startBrush();
    d.frames(27);
    d.press('togglePause');
    expect(d.note()!.brushedSec).toBeCloseTo(27, 0);
  });

  it('main.ts notes it when the page is hidden or closed and when the Android app goes to the background (source text)', () => {
    const d = device();
    d.startBrush();
    d.frames(23);
    d.screen().checkpointNow();
    expect(d.note()!.brushedSec).toBeCloseTo(23, 0);

    // One hook for all three, the one that already flushes the save.
    const main = read('src/main.ts');
    expect(main).toMatch(/const flushSaveOnLifecycleExit = \(\) => \{\n\s*activeBrushAlong\?\.checkpointNow\(\);/);
    expect(main).toContain("window.addEventListener('pagehide', flushSaveOnLifecycleExit);");
    expect(main).toMatch(/if \(document\.visibilityState === 'hidden'\) \{\n\s*flushSaveOnLifecycleExit\(\);/);
    expect(main).toMatch(/onNativeLifecycleChanged\(\(active\) => \{\n\s*if \(!active\) \{[\s\S]*?flushSaveOnLifecycleExit\(\);/);
  });

  it('a Start card notes the brush as it stands, dated when brushing ended', () => {
    const start = new Date(2026, 10, 20, 20, 0, 0);
    const d = device({ start, rinse: true });
    d.startBrush();
    d.frames(121);
    const onFlossCard = d.note()!;
    expect(onFlossCard).toMatchObject({ fullBrush: true, flossDone: false, rinseStepOff: false });
    expect(onFlossCard.brushedSec).toBeCloseTo(120, 0);
    expect(Math.abs(onFlossCard.stageEndedAtMs - (start.getTime() + 120_000))).toBeLessThan(100);
    expect(onFlossCard.brushingEndedAtMs).toBe(onFlossCard.stageEndedAtMs);

    d.press('startFloss');
    d.frames(46);
    const onRinseCard = d.note()!;
    expect(onRinseCard).toMatchObject({ sessionId: onFlossCard.sessionId, brushedSec: onFlossCard.brushedSec, flossDone: true });
    expect(onRinseCard.brushingEndedAtMs).toBe(onFlossCard.brushingEndedAtMs);
    // floss was started a second after the card went up, at 2:01, and ran its 45 s
    expect(Math.abs(onRinseCard.stageEndedAtMs - (start.getTime() + 166_000))).toBeLessThan(100);
  });

  it('the early two-tap "Floss ›" keeps the brush whatever the seconds, read before floss starts', () => {
    const d = device();
    d.startBrush();
    d.frames(5);
    d.tapFloss();
    expect(d.clock.getPacerStage()).toBe('flossBonus');
    const kept = d.note()!;
    expect(kept.brushedSec).toBeCloseTo(5, 0);
    expect(kept).toMatchObject({ fullBrush: false, flossDone: false });
    expect(Math.abs(kept.stageEndedAtMs - Date.now())).toBeLessThan(50);
  });

  it('locked past the Start card’s wait: paid once on return, and the note goes', () => {
    const d = device();
    d.startBrush();
    d.frames(100);
    d.lock(20 + 600 + 5);
    d.frames(0.1);
    expect(d.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 50, stampAwarded: true }]);
    expect(d.note()).toBeNull();
  });

  it('paid, the note goes and the brush is listed as paid; a new brush leaves an older note alone', () => {
    const d = device();
    d.startBrush();
    d.frames(121);
    const id = d.note()!.sessionId;
    d.press('skipStageWait');
    expect(d.paid).toHaveLength(1);
    expect(d.note()).toBeNull();
    expect(d.paidList()).toEqual([id]);

    // Another tab's brush, or one waiting to be paid at the next start: starting a brush here does
    // not erase it; this brush's own note replaces it once 20 s are brushed.
    d.stored.set(PENDING_BRUSH_KEY, JSON.stringify(note('left-over')));
    d.startBrush();
    expect(d.note()!.sessionId).toBe('left-over');
    d.frames(21);
    expect(d.note()!.sessionId).not.toBe('left-over');
  });
});

describe('Home in the middle of brushing (the owner’s decision 1)', () => {
  it('after 20 s, a good try, with the kind words the early "Floss ›" earns', () => {
    const d = device();
    d.startBrush();
    d.frames(30);
    d.press('exitToHub');
    expect(d.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 5, stampAwarded: false }]);
    expect(d.hubNote()).toBe(GOOD_TRY_WORDS);
    expect(d.exits()).toBe(1);
    expect(d.note()).toBeNull();
    expect(d.saveSys.getSave().dailySlotsByDate).toEqual({ '2026-11-20': { fullRewards: 0, tips: 1 } });
  });

  it('paused after 20 s, the same', () => {
    const d = device();
    d.startBrush();
    d.frames(40);
    d.press('togglePause');
    d.frames(30);
    d.press('exitToHub');
    expect(d.paid).toHaveLength(1);
    expect(d.hubNote()).toBe(GOOD_TRY_WORDS);
  });

  it('under 20 s, nothing, and this brush leaves no note; another brush\'s note stays', () => {
    const d = device();
    d.startBrush();
    d.frames(15);
    d.press('exitToHub');
    expect(d.paid).toEqual([]);
    expect(d.hubNote()).toBeUndefined();
    expect(d.exits()).toBe(1);
    expect(d.note()).toBeNull();

    // A note from another tab's brush (or one waiting for the next start) is not this brush's to erase.
    d.startBrush();
    d.frames(15);
    d.stored.set(PENDING_BRUSH_KEY, JSON.stringify(note('another-tab')));
    d.press('exitToHub');
    expect(d.paid).toEqual([]);
    expect(d.note()!.sessionId).toBe('another-tab');
  });

  it('within the grace of the 2 minutes, by the early Floss’s rule, it is a full brush', () => {
    const d = device();
    d.startBrush();
    d.frames(118.5);
    d.press('exitToHub');
    expect(d.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 50, stampAwarded: true }]);
    expect(d.hubNote()).toBe('🦷 Fresh Mint Smooth Bask! +50 F⁻ & +1 Habit Stamp!');
  });
});

describe('a brush is paid once', () => {
  it('a second payment of the same brush pays nothing', () => {
    const d = device();
    const brush = {
      sessionId: 'once-1',
      withFlossBonus: true,
      withMouthwashBonus: false,
      fullBrush: true,
      rinseStepOff: true,
      stageEndedAtMs: Date.now(),
    };
    expect(settleBrush(d.saveSys, d.bus, brush)).toMatchObject({ ionsAwarded: 100, stampAwarded: true });
    expect(settleBrush(d.saveSys, d.bus, brush)).toBeNull();
    expect(d.paid).toHaveLength(1);
    expect(d.saveSys.getSave().totalBrushStamps).toBe(1);
  });

  it('Done tapped as the timer ends the brush does not pay it again', () => {
    const d = device();
    d.startBrush();
    d.frames(121);
    d.press('startFloss');
    d.frames(46); // floss ran out: paid (the rinse step is off)
    d.finish(true, false);
    expect(d.paid).toHaveLength(1);
  });

  it('the list keeps the last 20 brushes paid', () => {
    const d = device();
    for (let i = 0; i < 25; i++) {
      settleBrush(d.saveSys, d.bus, {
        sessionId: `list-${i}`,
        withFlossBonus: false,
        withMouthwashBonus: false,
        fullBrush: false,
        rinseStepOff: true,
        stageEndedAtMs: Date.now(),
      });
    }
    expect(d.paidList()).toEqual(Array.from({ length: 20 }, (_, i) => `list-${i + 5}`));
  });
});

describe('the next start pays what the last visit left', () => {
  it('a brush closed mid-brush: a good try, on the day its note was written, quietly', async () => {
    const d = device({ start: new Date(2026, 10, 21, 7, 0, 0) });
    d.stored.set(PENDING_BRUSH_KEY, JSON.stringify(note('mid-1')));
    const outcome = await recoverPendingBrush(d.saveSys, d.bus);
    expect(outcome).toMatchObject({ ionsAwarded: 5, stampAwarded: false, slotType: 'tip' });
    expect(d.paid).toEqual([{ withFlossBonus: false, withMouthwashBonus: false, ionsAwarded: 5, stampAwarded: false }]);
    expect(d.saveSys.getSave().dailySlotsByDate).toEqual({ '2026-11-20': { fullRewards: 0, tips: 1 } });
    expect(d.note()).toBeNull();
    expect(d.paidList()).toEqual(['mid-1']);
  });

  it('closed on the floss card: the full brush, without floss', async () => {
    const d = device({ start: new Date(2026, 10, 20, 21, 0, 0) });
    d.stored.set(PENDING_BRUSH_KEY, JSON.stringify(note('card-1', { brushedSec: 120, fullBrush: true })));
    expect(await recoverPendingBrush(d.saveSys, d.bus)).toMatchObject({ ionsAwarded: 50, stampAwarded: true });
  });

  it('closed on the rinse card: floss counts, the rinse never does', async () => {
    const d = device({ start: new Date(2026, 10, 20, 21, 0, 0) });
    d.stored.set(
      PENDING_BRUSH_KEY,
      JSON.stringify(note('card-2', { brushedSec: 120, fullBrush: true, flossDone: true, rinseStepOff: false }))
    );
    await recoverPendingBrush(d.saveSys, d.bus);
    expect(d.paid).toEqual([{ withFlossBonus: true, withMouthwashBonus: false, ionsAwarded: 75, stampAwarded: true }]);
  });

  it('a brush closed mid-brush and noted then, from start to finish', async () => {
    const d = device();
    d.startBrush();
    d.frames(45);
    d.screen().checkpointNow(); // the tab closes
    const before = d.saveSys.getSave().fluorideIons;
    d.screen().dispose(); // and the page is gone
    await recoverPendingBrush(d.saveSys, d.bus);
    expect(d.saveSys.getSave().fluorideIons).toBe(before + 5);
    expect(d.note()).toBeNull();
  });

  it('a brush already paid is never paid again, even if its note comes back', async () => {
    const d = device();
    d.stored.set(PENDING_BRUSH_KEY, JSON.stringify(note('again-1')));
    await recoverPendingBrush(d.saveSys, d.bus);
    d.stored.set(PENDING_BRUSH_KEY, JSON.stringify(note('again-1')));
    expect(await recoverPendingBrush(d.saveSys, d.bus)).toBeNull();
    expect(d.paid).toHaveLength(1);
    expect(d.note()).toBeNull();
  });

  it('an older copy of the game in front of a newer save leaves the note for a version that can save it', async () => {
    const d = device();
    const storage = memoryStorage();
    storage.setItem('mouthlife_save_v2', JSON.stringify({ schemaVersion: 3 }));
    const older = new SaveSystem(d.bus, storage);
    older.load(Date.now());
    expect(older.isPersistenceSuspended()).toBe(true);
    d.stored.set(PENDING_BRUSH_KEY, JSON.stringify(note('newer-save')));
    expect(await recoverPendingBrush(older, d.bus)).toBeNull();
    expect(d.note()?.sessionId).toBe('newer-save');
  });

  it('a brush finished on an older copy that cannot save keeps its note and is not listed as paid', () => {
    const d = device();
    const storage = memoryStorage();
    storage.setItem('mouthlife_save_v2', JSON.stringify({ schemaVersion: 3 }));
    const older = new SaveSystem(d.bus, storage);
    older.load(Date.now());
    expect(older.isPersistenceSuspended()).toBe(true);
    d.stored.set(PENDING_BRUSH_KEY, JSON.stringify(note('on-older-copy')));
    settleBrush(older, d.bus, {
      sessionId: 'on-older-copy',
      withFlossBonus: false,
      withMouthwashBonus: false,
      fullBrush: true,
      rinseStepOff: true,
      stageEndedAtMs: Date.now(),
    });
    expect(d.note()?.sessionId).toBe('on-older-copy');
    expect(d.paidList()).not.toContain('on-older-copy');
  });

  it('a note that cannot be read is dropped', async () => {
    const d = device();
    d.stored.set(PENDING_BRUSH_KEY, '{"sessionId": 7');
    expect(await recoverPendingBrush(d.saveSys, d.bus)).toBeNull();
    expect(d.paid).toEqual([]);
    expect(d.stored.has(PENDING_BRUSH_KEY)).toBe(false);
  });

  it('with no note, nothing asks for the lock', async () => {
    const locks = new FakeLocks();
    const d = device({ locks });
    expect(await recoverPendingBrush(d.saveSys, d.bus)).toBeNull();
    expect(locks.requests).toEqual([]);
  });

  it('pays under the brush lock, asking only if it is free', async () => {
    const locks = new FakeLocks();
    const d = device({ locks });
    d.stored.set(PENDING_BRUSH_KEY, JSON.stringify(note('lock-1')));
    await recoverPendingBrush(d.saveSys, d.bus);
    expect(locks.requests).toEqual([{ name: 'mouthlife-brush', ifAvailable: true }]);
    expect(d.paid).toHaveLength(1);
  });

  it('a brush still running in another tab keeps its note', async () => {
    const locks = new FakeLocks();
    const d = device({ locks });
    locks.heldElsewhere();
    d.stored.set(PENDING_BRUSH_KEY, JSON.stringify(note('other-tab')));
    expect(await recoverPendingBrush(d.saveSys, d.bus)).toBeNull();
    expect(d.paid).toEqual([]);
    expect(d.note()?.sessionId).toBe('other-tab');
  });

  it('the brush running in a tab holds the lock until it is paid or left', async () => {
    const locks = new FakeLocks();
    const d = device({ locks });
    d.startBrush();
    expect(locks.requests).toEqual([{ name: 'mouthlife-brush', ifAvailable: false }]);
    d.frames(25);
    await settle();
    expect(locks.held).toBe(BRUSH_LOCK_NAME);
    // a second tab opening now leaves this brush's note alone
    expect(await recoverPendingBrush(d.saveSys, d.bus)).toBeNull();
    expect(d.note()).not.toBeNull();

    d.press('exitToHub'); // a good try, paid
    await settle();
    expect(locks.held).toBeNull();

    d.startBrush();
    d.frames(5);
    d.press('exitToHub'); // left with nothing to keep
    await settle();
    expect(locks.held).toBeNull();

    d.startBrush();
    d.screen().dispose(); // the screen goes
    await settle();
    expect(locks.held).toBeNull();
  });

  it('main.ts pays it before Home is put up (source text)', () => {
    const main = read('src/main.ts');
    expect(main).toMatch(/void recoverPendingBrush\(saveSys, bus\);\n\s*switchMode\(currentMode\);/);
  });
});

describe('Erase Save', () => {
  it('clears the note and the list of paid brushes, at the reset itself', () => {
    const d = device();
    d.stored.set(PENDING_BRUSH_KEY, JSON.stringify(note('erased')));
    d.stored.set(PAID_BRUSH_SESSIONS_KEY, JSON.stringify(['old']));
    d.saveSys.resetToFreshSave();
    expect(d.stored.has(PENDING_BRUSH_KEY)).toBe(false);
    expect(d.stored.has(PAID_BRUSH_SESSIONS_KEY)).toBe(false);
  });
});

describe('the rinse hint on the floss card (the owner’s decision 4)', () => {
  it('while the rinse is off, one line under Skip on "READY TO FLOSS?"', () => {
    const d = device();
    d.startBrush();
    d.frames(121);
    const html = d.html();
    expect(html).toContain(RINSE_HINT);
    expect(html.indexOf(RINSE_HINT)).toBeGreaterThan(html.indexOf('id="btn-pacer-skip-wait"'));
  });

  it('not while the rinse is on, and not on the rinse card', () => {
    const d = device({ rinse: true });
    d.startBrush();
    d.frames(121);
    expect(d.html()).not.toContain(RINSE_HINT);
    d.press('skipStageWait');
    expect(d.html()).not.toContain(RINSE_HINT);
  });

  it('the native card says the same, and every language has it, on the web and in the app (source text)', () => {
    const native = read('native-apple/MouthLifeApp/UI/BrushAlongView.swift');
    expect(native).toContain(`L10n.t("${RINSE_HINT}")`);
    const nativeCatalogs = read('native-apple/Sources/MouthLifeCore/Config/L10nCatalogs.swift');
    for (const lang of ['de', 'es', 'fr', 'ja', 'ko', 'pt', 'zh']) {
      const catalog = JSON.parse(read(`src/i18n/locales/${lang}.json`)) as Record<string, string>;
      expect(catalog[RINSE_HINT], lang).toBeTruthy();
      // the app's catalog carries the same translation
      expect(nativeCatalogs, lang).toContain(JSON.stringify(catalog[RINSE_HINT]).slice(1, -1));
    }
  });
});
