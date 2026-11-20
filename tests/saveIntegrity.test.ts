import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/engine/EventBus';
import {
  SAVE_GENERATION_KEY,
  SAVE_STORAGE_KEY,
  SAVE_UNREADABLE_COPY_KEY,
  SAVE_V1_COPY_KEY,
  SaveSystem,
  createDefaultSave,
  decodeSaveFromText,
  migrateSave,
  type StorageLike,
} from '../src/engine/persistence/SaveSystem';
import type { ScoreBreakdown } from '../src/engine/types';

/** One localStorage shared by every "tab" (SaveSystem) in a test, as in a real browser. */
class SharedStorage implements StorageLike {
  readonly map = new Map<string, string>();
  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.map.set(k, v);
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const T0 = 1_700_000_000_000;

const win: ScoreBreakdown = {
  restorationPts: 4000,
  techniquePts: 2000,
  ecologyPts: 1500,
  parTimePts: 1000,
  totalScore: 8500,
  grade: 'A',
  cleanlinessPct: 92,
  sitesRestored: 10,
  sitesTotal: 10,
  elapsedSec: 140,
  ionsEarned: 60,
};

function tab(storage: StorageLike, now = T0): SaveSystem {
  const sys = new SaveSystem(new EventBus(), storage);
  sys.load(now);
  return sys;
}

function stored(storage: SharedStorage) {
  return JSON.parse(storage.getItem(SAVE_STORAGE_KEY) ?? 'null');
}

describe('H01: two tabs share one save', () => {
  it('keeps a city clear and a profile edit made from the same starting save', () => {
    const storage = new SharedStorage();
    const a = tab(storage);
    const b = tab(storage);
    expect(a.getSave().saveRevision).toBe(b.getSave().saveRevision);

    a.recordMissionCompletion({ mode: 'ARCADE', worldId: 'world_1', won: true, breakdown: win, historyNoteIds: [], nowEpochMs: T0 + 1000 });
    const bSave = b.getSave();
    bSave.playerProfile.displayName = 'Renamed In B';
    b.save(bSave, T0 + 2000);

    const reloaded = tab(storage, T0 + 3000).getSave();
    expect(reloaded.worlds.world_1.completed).toBe(true);
    expect(reloaded.fluorideIons).toBe(60);
    expect(reloaded.playerProfile.displayName).toBe('Renamed In B');
  });

  it('adds up a purchase in one tab and a payout in the other instead of undoing either', () => {
    const storage = new SharedStorage();
    const a = tab(storage);
    const s = a.getSave();
    s.fluorideIons = 500;
    a.save(s, T0 + 10);
    const b = tab(storage, T0 + 20);
    const before = b.getSave().fluorideIons;
    expect(before).toBe(500);

    expect(a.purchaseUpgradeWithIons('angled_bass_array', T0 + 30)).toBe(true);
    const spent = 500 - a.getSave().fluorideIons;
    const bSave = b.getSave();
    bSave.fluorideIons += 25; // a ritual payout computed in the stale tab
    b.save(bSave, T0 + 40);

    const reloaded = tab(storage, T0 + 50).getSave();
    expect(reloaded.fluorideIons).toBe(500 - spent + 25);
    expect(reloaded.unlockedUpgrades).toContain('angled_bass_array');
  });

  it('lets the other tab pick up a save through a storage event', () => {
    const storage = new SharedStorage();
    const a = tab(storage);
    const b = tab(storage);
    a.recordMissionCompletion({ mode: 'ARCADE', worldId: 'world_1', won: true, breakdown: win, historyNoteIds: [], nowEpochMs: T0 + 1000 });
    expect(b.getSave().worlds.world_1.completed).toBe(false);
    expect(b.refreshFromStorage(T0 + 1100)).toBe(true);
    expect(b.getSave().worlds.world_1.completed).toBe(true);
    expect(b.refreshFromStorage(T0 + 1200)).toBe(false);
  });

  it('never lets an old tab write erased progress back when it closes', () => {
    const storage = new SharedStorage();
    const a = tab(storage);
    a.recordMissionCompletion({ mode: 'ARCADE', worldId: 'world_1', won: true, breakdown: win, historyNoteIds: [], nowEpochMs: T0 + 1000 });
    const stale = tab(storage, T0 + 1500);
    stale.getSave().companion.lastEvaluatedEpochMs = T0 + 1600; // its tooth kept ticking
    expect(stale.getSave().worlds.world_1.completed).toBe(true);

    a.resetToFreshSave(T0 + 2000);
    const freshProfile = a.getSave();
    freshProfile.playerProfile.displayName = 'New Kid';
    a.save(freshProfile, T0 + 2100);

    // The old tab wakes and is closed: page hide flushes it.
    stale.flushIfChanged(T0 + 3000);

    const after = tab(storage, T0 + 4000).getSave();
    expect(after.worlds.world_1.completed).toBe(false);
    expect(after.fluorideIons).toBe(0);
    expect(after.playerProfile.displayName).toBe('New Kid');
  });

  it('page hide writes nothing when this tab holds nothing new', () => {
    const storage = new SharedStorage();
    const a = tab(storage);
    const raw = storage.getItem(SAVE_STORAGE_KEY);
    a.flushIfChanged(T0 + 5000);
    expect(storage.getItem(SAVE_STORAGE_KEY)).toBe(raw);
  });

  it('an erase raises the revision and changes the generation', () => {
    const storage = new SharedStorage();
    const a = tab(storage);
    for (let i = 0; i < 4; i++) a.save(a.getSave(), T0 + i);
    const revision = a.getSave().saveRevision;
    const generation = storage.getItem(SAVE_GENERATION_KEY);
    a.resetToFreshSave(T0 + 100);
    expect(a.getSave().saveRevision).toBeGreaterThan(revision);
    expect(storage.getItem(SAVE_GENERATION_KEY)).not.toBe(generation);
  });
});

describe('H02: a save this version cannot read is never overwritten', () => {
  const progress = { totalBrushStamps: 73, fluorideIons: 421 };

  it('leaves a newer-version save exactly as stored after startup and page hide', () => {
    const raw = JSON.stringify({ schemaVersion: 3, ...progress, somethingNew: { a: 1 } });
    const storage = new SharedStorage({ [SAVE_STORAGE_KEY]: raw });
    const sys = new SaveSystem(new EventBus(), storage);
    const save = sys.load(T0);
    expect(sys.getLoadOutcome()).toBe('newer-version');
    expect(sys.isPersistenceSuspended()).toBe(true);
    // What main.ts does at startup, then while playing, then on page hide:
    sys.save(save, T0 + 1);
    sys.recordMissionCompletion({ mode: 'ARCADE', worldId: 'world_1', won: true, breakdown: win, historyNoteIds: [], nowEpochMs: T0 + 2 });
    sys.flushIfChanged(T0 + 3);
    expect(storage.getItem(SAVE_STORAGE_KEY)).toBe(raw);
    expect(storage.getItem(SAVE_UNREADABLE_COPY_KEY)).toBe(raw);
    // Play went on in memory.
    expect(sys.getSave().worlds.world_1.completed).toBe(true);
  });

  it('an explicit erase replaces it on purpose', () => {
    const raw = JSON.stringify({ schemaVersion: 3, ...progress });
    const storage = new SharedStorage({ [SAVE_STORAGE_KEY]: raw });
    const sys = new SaveSystem(new EventBus(), storage);
    sys.load(T0);
    sys.resetToFreshSave(T0 + 1);
    expect(sys.isPersistenceSuspended()).toBe(false);
    expect(stored(storage).schemaVersion).toBe(2);
    expect(storage.getItem(SAVE_UNREADABLE_COPY_KEY)).toBe(raw);
  });

  it('keeps the bytes of a damaged save before starting fresh', () => {
    const raw = '{"schemaVersion":2,"totalBrushStamps":73,"fluori';
    const storage = new SharedStorage({ [SAVE_STORAGE_KEY]: raw });
    const sys = new SaveSystem(new EventBus(), storage);
    sys.load(T0);
    expect(sys.getLoadOutcome()).toBe('unreadable');
    expect(storage.getItem(SAVE_UNREADABLE_COPY_KEY)).toBe(raw);
    expect(stored(storage).schemaVersion).toBe(2);
    expect(sys.isPersistenceSuspended()).toBe(false);
  });

  it('only a missing save starts a new stored save', () => {
    const storage = new SharedStorage();
    const sys = new SaveSystem(new EventBus(), storage);
    sys.load(T0);
    expect(sys.getLoadOutcome()).toBe('new');
    expect(stored(storage).schemaVersion).toBe(2);
    expect(storage.getItem(SAVE_UNREADABLE_COPY_KEY)).toBeNull();
  });

  it('keeps a copy of a version-1 save before it is rewritten', () => {
    const raw = JSON.stringify({ schemaVersion: 1, totalBrushStamps: 12, fluorideCrystals: 300 });
    const storage = new SharedStorage({ [SAVE_STORAGE_KEY]: raw });
    const sys = new SaveSystem(new EventBus(), storage);
    const save = sys.load(T0);
    expect(save.fluorideIons).toBe(300);
    sys.save(save, T0 + 1);
    expect(storage.getItem(SAVE_V1_COPY_KEY)).toBe(raw);
    expect(stored(storage).fluorideIons).toBe(300);
  });
});

describe('H08: the downloaded backup file can be imported', () => {
  it('restores the exact bytes the Download button writes', () => {
    const src = tab(new SharedStorage());
    const s = src.getSave();
    s.playerProfile.displayName = 'Zoë 🦷 Ōkafor';
    s.totalBrushStamps = 14;
    s.fluorideIons = 777;
    s.worlds.world_2 = { ...s.worlds.world_2, unlocked: true, completed: true, timesCleared: 3, bestScore: 9100, bestGrade: 'S' };
    src.save(s, T0 + 10);
    const downloaded = JSON.stringify(src.getSave(), null, 2); // what CompanionHubOverlay downloads

    const dst = tab(new SharedStorage(), T0 + 20);
    const merged = dst.importSyncCode(downloaded, T0 + 30);
    expect(merged.playerProfile.displayName).toBe('Zoë 🦷 Ōkafor');
    expect(merged.totalBrushStamps).toBe(14);
    expect(merged.fluorideIons).toBe(777);
    expect(merged.worlds.world_2.completed).toBe(true);
    expect(merged.worlds.world_2.bestGrade).toBe('S');
  });

  it('accepts a version-1 backup and a byte-order mark', () => {
    const v1 = '﻿' + JSON.stringify({ schemaVersion: 1, totalBrushStamps: 4, fluorideCrystals: 90 });
    expect(decodeSaveFromText(v1, T0).fluorideIons).toBe(90);
  });

  it('a damaged or future backup leaves the current save untouched', () => {
    const storage = new SharedStorage();
    const sys = tab(storage);
    const before = storage.getItem(SAVE_STORAGE_KEY);
    expect(() => sys.importSyncCode('{"schemaVersion":2,"totalBrush', T0 + 1)).toThrow();
    expect(() => sys.importSyncCode(JSON.stringify({ schemaVersion: 3 }), T0 + 2)).toThrow();
    expect(() => sys.importSyncCode('[1,2,3]', T0 + 3)).toThrow();
    expect(storage.getItem(SAVE_STORAGE_KEY)).toBe(before);
  });
});

describe('M01: the newest brushing days survive a merge', () => {
  it('keeps the 45 latest dates whatever order they are stored in', () => {
    const daily: Record<string, { fullRewards: number; tips: number }> = {};
    // Recent days first, then an old archive, as a merge can list them.
    for (let d = 1; d <= 31; d++) daily[`2026-10-${String(d).padStart(2, '0')}`] = { fullRewards: 1, tips: 0 };
    for (let d = 1; d <= 28; d++) daily[`2026-03-${String(d).padStart(2, '0')}`] = { fullRewards: 2, tips: 0 };
    daily['not-a-date'] = { fullRewards: 2, tips: 0 };
    const save = migrateSave({ ...createDefaultSave(T0), dailySlotsByDate: daily }, T0);
    const keys = Object.keys(save.dailySlotsByDate);
    expect(keys).toHaveLength(45);
    expect(keys).toContain('2026-10-30');
    expect(keys).toContain('2026-10-31');
    expect(keys).not.toContain('2026-03-01');
    expect(keys).not.toContain('not-a-date');
  });
});

describe('M03: an old Sync Code does not refund what was spent', () => {
  it('keeps the spent balance when an earlier code of the same save comes back', () => {
    const sys = tab(new SharedStorage());
    const s = sys.getSave();
    s.fluorideIons = 500;
    s.pendingSupplyBeacons = 2;
    sys.save(s, T0 + 10);
    const oldCode = sys.exportSyncCode();

    expect(sys.purchaseUpgradeWithIons('angled_bass_array', T0 + 20)).toBe(true);
    const afterPurchase = sys.getSave().fluorideIons;
    expect(afterPurchase).toBeLessThan(500);
    sys.consumeSingleSupplyBeacon(T0 + 30);

    const merged = sys.importSyncCode(oldCode, T0 + 40);
    expect(merged.fluorideIons).toBe(afterPurchase);
    expect(merged.pendingSupplyBeacons).toBe(1);
    expect(merged.unlockedUpgrades).toContain('angled_bass_array');
    // Importing it again changes nothing either.
    expect(sys.importSyncCode(oldCode, T0 + 50).fluorideIons).toBe(afterPurchase);
  });

  it('still brings over a bigger wallet from a code with new progress', () => {
    const other = tab(new SharedStorage());
    const o = other.getSave();
    o.fluorideIons = 900;
    o.worlds.world_1 = { ...o.worlds.world_1, completed: true, timesCleared: 1, bestScore: 5000, bestGrade: 'B' };
    other.save(o, T0 + 10);

    const mine = tab(new SharedStorage(), T0 + 20);
    const m = mine.getSave();
    m.fluorideIons = 40;
    for (let i = 0; i < 5; i++) mine.save(m, T0 + 30 + i);
    expect(mine.importSyncCode(other.exportSyncCode(), T0 + 100).fluorideIons).toBe(900);
  });
});
