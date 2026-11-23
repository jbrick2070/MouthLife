import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/engine/EventBus';
import { HabitBank, formatLocalDateKey } from '../src/engine/persistence/HabitBank';
import {
  DAILY_LOG_MAX_DAYS,
  DISPLAY_NAME_MAX_CHARS,
  DISPLAY_NAME_MAX_UNITS,
  SAVE_GENERATION_KEY,
  SAVE_STORAGE_KEY,
  SAVE_UNREADABLE_COPY_KEY,
  SAVE_V1_COPY_KEY,
  SaveSystem,
  createDefaultSave,
  decodeSaveFromText,
  encodeSaveToSyncCode,
  migrateSave,
  truncateDisplayName,
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

/** A Sync Code built by hand from any JSON, the way an outsider would craft one. */
function craftCode(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'ML2:' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('W8: a crafted code cannot leave a grade that is not a grade', () => {
  const gold: ScoreBreakdown = { ...win, totalScore: 9999, grade: 'FLUORAPATITE_GOLD', cleanlinessPct: 100 };
  const craftedGrade = (grade: string) =>
    craftCode({ schemaVersion: 2, saveRevision: 1, lastSavedEpochMs: 1, worlds: { world_1: { completed: true, bestGrade: grade } } });

  it('accepts the six grades and refuses every name an object inherits', () => {
    for (const grade of ['NONE', 'C', 'B', 'A', 'S', 'FLUORAPATITE_GOLD']) {
      const save = migrateSave({ schemaVersion: 2, worlds: { world_1: { completed: true, bestGrade: grade } } }, T0);
      expect(save.worlds.world_1.bestGrade).toBe(grade);
    }
    const inherited = Object.getOwnPropertyNames(Object.prototype);
    for (const known of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(inherited).toContain(known);
    }
    for (const name of [...inherited, 'gold', 'a', '']) {
      // A cleared city falls back to B, one not cleared yet to no grade, as for any unknown word.
      const cleared = migrateSave({ schemaVersion: 2, worlds: { world_1: { completed: true, bestGrade: name } } }, T0);
      expect(cleared.worlds.world_1.bestGrade, name).toBe('B');
      const open = migrateSave({ schemaVersion: 2, worlds: { world_1: { completed: false, bestGrade: name } } }, T0);
      expect(open.worlds.world_1.bestGrade, name).toBe('NONE');
    }
  });

  it('keeps an earned grade when the crafted code is imported, and a later win still counts', () => {
    const storage = new SharedStorage();
    const sys = tab(storage);
    sys.recordMissionCompletion({ mode: 'ARCADE', worldId: 'world_1', won: true, breakdown: win, historyNoteIds: [], nowEpochMs: T0 + 10 });
    expect(sys.getSave().worlds.world_1.bestGrade).toBe('A');

    for (const name of ['constructor', 'toString', '__proto__']) {
      sys.importSyncCode(craftedGrade(name), T0 + 20);
      expect(sys.getSave().worlds.world_1.bestGrade, name).toBe('A');
      expect(stored(storage).worlds.world_1.bestGrade, name).toBe('A');
    }

    sys.recordMissionCompletion({ mode: 'ARCADE', worldId: 'world_1', won: true, breakdown: gold, historyNoteIds: [], nowEpochMs: T0 + 30 });
    expect(sys.getSave().worlds.world_1.bestGrade).toBe('FLUORAPATITE_GOLD');
    expect(tab(storage, T0 + 40).getSave().worlds.world_1.bestGrade).toBe('FLUORAPATITE_GOLD');
  });

  it('a save already spoiled this way repairs itself at load', () => {
    const spoiled = createDefaultSave(T0);
    spoiled.worlds.world_1 = { ...spoiled.worlds.world_1, completed: true, timesCleared: 3, bestScore: 9100 };
    (spoiled.worlds.world_1 as { bestGrade: string }).bestGrade = 'constructor';
    const storage = new SharedStorage({ [SAVE_STORAGE_KEY]: JSON.stringify(spoiled) });

    const sys = tab(storage, T0 + 10);
    expect(sys.getSave().worlds.world_1.bestGrade).toBe('B');
    // What main.ts does right after loading: the repaired save is written back.
    sys.save(sys.getSave(), T0 + 20);
    expect(stored(storage).worlds.world_1.bestGrade).toBe('B');
    // And play can beat it again, which the spoiled word never allowed.
    sys.recordMissionCompletion({ mode: 'ARCADE', worldId: 'world_1', won: true, breakdown: gold, historyNoteIds: [], nowEpochMs: T0 + 30 });
    expect(sys.getSave().worlds.world_1.bestGrade).toBe('FLUORAPATITE_GOLD');
  });
});

describe('W8: a name is never longer than 24 characters or 256 UTF-16 units', () => {
  /** A combining accent: it stacks on the letter before it, and any number of them is one character. */
  const MARK = '́';
  const utf16Units = (name: string) => name.length;

  it('names the two limits', () => {
    expect(DISPLAY_NAME_MAX_CHARS).toBe(24);
    expect(DISPLAY_NAME_MAX_UNITS).toBe(256);
  });

  it('leaves ordinary names alone and still cuts at 24 whole characters', () => {
    expect(truncateDisplayName('Explorer')).toBe('Explorer');
    expect(truncateDisplayName('Zoë 🦷 Ōkafor')).toBe('Zoë 🦷 Ōkafor');
    expect(truncateDisplayName('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijklmnopqrstuvwx');
    expect(truncateDisplayName(`a${'😀'.repeat(30)}`)).toBe(`a${'😀'.repeat(23)}`);
    // An accented name written with stacked marks is far inside the limit.
    const stacked = 'Zoe' + MARK + ' Nguye' + '̂' + MARK + 'n';
    expect(truncateDisplayName(stacked)).toBe(stacked);
  });

  it('one letter carrying 20,000 marks leaves nothing, so the save uses the usual name', () => {
    const monster = 'a' + MARK.repeat(20_000);
    expect(truncateDisplayName(monster)).toBe('');
    const fromCode = decodeSaveFromText(craftCode({ schemaVersion: 2, playerProfile: { displayName: monster } }), T0);
    expect(fromCode.playerProfile.displayName).toBe('Explorer');
    // An empty or all-space name falls back the same way, as before.
    expect(migrateSave({ schemaVersion: 2, playerProfile: { displayName: '   ' } }, T0).playerProfile.displayName).toBe('Explorer');
  });

  it('keeps the whole characters that fit and stops before the 257th unit', () => {
    // 23 plain letters, then a 24th character that is 19,978 units long by itself.
    const tail = 'a'.repeat(23) + 'e' + MARK.repeat(19_977);
    expect(truncateDisplayName(tail)).toBe('a'.repeat(23));

    // Characters of 16 units each: sixteen of them are exactly 256 units and all stay...
    const sixteenUnits = 'e' + MARK.repeat(15);
    expect(utf16Units(truncateDisplayName(sixteenUnits.repeat(16)))).toBe(256);
    // ...a seventeenth would pass the limit, so the cut comes before it, at a whole character.
    expect(truncateDisplayName(sixteenUnits.repeat(17))).toBe(sixteenUnits.repeat(16));

    // Characters of 13 units: nineteen fit (247 units), the twentieth would make 260.
    const thirteenUnits = 'e' + MARK.repeat(12);
    expect(truncateDisplayName(thirteenUnits.repeat(24))).toBe(thirteenUnits.repeat(19));

    // At 255 units one more plain letter still fits (256). A two-unit character would make 257, so
    // the name ends there: the cut never skips a character to fit a smaller one after it.
    const first255 = ('e' + MARK.repeat(16)).repeat(15);
    expect(utf16Units(first255)).toBe(255);
    expect(truncateDisplayName(first255 + 'zq')).toBe(first255 + 'z');
    expect(truncateDisplayName(first255 + 'e' + MARK + 'z')).toBe(first255);
  });

  it('a crafted name can no longer make the save’s own Sync Code too long to read back', () => {
    // The backup-file path takes far more text than a code does: a 200,001-unit name.
    const text = JSON.stringify({ schemaVersion: 2, playerProfile: { displayName: 'e' + MARK.repeat(200_000) } });
    const storage = new SharedStorage();
    const sys = tab(storage);
    sys.importSyncCode(text, T0 + 2);
    expect(sys.getSave().playerProfile.displayName).toBe('Explorer');
    const own = sys.exportSyncCode();
    expect(own.length).toBeLessThan(4096);
    expect(decodeSaveFromText(own, T0 + 3).playerProfile.displayName).toBe('Explorer');
  });

  it('a save already holding such a name repairs itself at load', () => {
    const spoiled = createDefaultSave(T0);
    spoiled.playerProfile.displayName = 'a' + MARK.repeat(20_000);
    const storage = new SharedStorage({ [SAVE_STORAGE_KEY]: JSON.stringify(spoiled) });
    const sys = tab(storage, T0 + 10);
    expect(sys.getSave().playerProfile.displayName).toBe('Explorer');
    sys.save(sys.getSave(), T0 + 20);
    expect(stored(storage).playerProfile.displayName).toBe('Explorer');
    expect(() => decodeSaveFromText(sys.exportSyncCode(), T0 + 30)).not.toThrow();

    // A long name with real letters in front keeps those letters.
    spoiled.playerProfile.displayName = 'Mia' + 'e' + MARK.repeat(19_977);
    const second = tab(new SharedStorage({ [SAVE_STORAGE_KEY]: JSON.stringify(spoiled) }), T0 + 10);
    expect(second.getSave().playerProfile.displayName).toBe('Mia');
  });

  it('trims a name of exactly the spaces String.prototype.trim does (the Swift twin pins the same cases)', () => {
    const name = (raw: string) => migrateSave({ schemaVersion: 2, playerProfile: { displayName: raw } }, T0).playerProfile.displayName;
    expect(name('\uFEFFMia\u3000')).toBe('Mia');
    expect(name('\uFEFF')).toBe('Explorer');
    expect(name('\u2007\u00A0Mia\u2028\t')).toBe('Mia');
    expect(name('\u200B')).toBe('\u200B');
    expect(name('\u0085Mia')).toBe('\u0085Mia');

    // Codes and backup text are trimmed the same way (the Swift twin pins these too).
    const json = '{"schemaVersion":2,"totalBrushStamps":7}';
    expect(decodeSaveFromText('﻿﻿' + json + '﻿\n', T0).totalBrushStamps).toBe(7);
    expect(() => decodeSaveFromText('\u0085' + json, T0)).toThrow();
    const code = encodeSaveToSyncCode(migrateSave({ schemaVersion: 2, totalBrushStamps: 9 }, T0));
    const wrapped = '﻿' + code.slice(0, 12) + ' ' + code.slice(12) + '　';
    expect(decodeSaveFromText(wrapped, T0).totalBrushStamps).toBe(9);
    expect(() => decodeSaveFromText(code.slice(0, 12) + '​' + code.slice(12), T0)).toThrow();
  });

  it('keeps both limits in a browser that cannot tell whole characters apart', () => {
    const segmenter = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
    delete (Intl as { Segmenter?: unknown }).Segmenter;
    try {
      // Whole code points: an emoji is never split, and 24 is still the most.
      expect(truncateDisplayName(`a${'😀'.repeat(30)}`)).toBe(`a${'😀'.repeat(23)}`);
      expect(utf16Units(truncateDisplayName('a' + MARK.repeat(20_000)))).toBe(24);
      // With a higher character limit the unit limit is the one that stops it: 128 emoji.
      expect(truncateDisplayName('😀'.repeat(300), 300)).toBe('😀'.repeat(128));
    } finally {
      if (segmenter) Object.defineProperty(Intl, 'Segmenter', segmenter);
    }
    expect('Segmenter' in Intl).toBe(true);
  });
});

describe('W8: days that have not happened yet cannot push out the real ones', () => {
  const DAY = 86_400_000;
  /** Midday on 21 November 2026, local time: far from midnight, so a clock change cannot move the date. */
  const NOON = new Date(2026, 10, 21, 12, 0, 0);
  const day = (offset: number) => formatLocalDateKey(new Date(NOON.getTime() + offset * DAY));
  const pad = (n: number) => String(n).padStart(2, '0');
  /** 45 days in the year 9999, as the crafted code carries them: all of January and 14 days of February. */
  const farFuture = (): Record<string, { fullRewards: number; tips: number }> => {
    const days: Record<string, { fullRewards: number; tips: number }> = {};
    for (let d = 1; d <= 31; d++) days[`9999-01-${pad(d)}`] = { fullRewards: 0, tips: 0 };
    for (let d = 1; d <= 14; d++) days[`9999-02-${pad(d)}`] = { fullRewards: 0, tips: 0 };
    return days;
  };

  it('keeps 45 days', () => {
    expect(DAILY_LOG_MAX_DAYS).toBe(45);
    expect(Object.keys(farFuture())).toHaveLength(45);
  });

  it('takes days up to tomorrow first; later days only fill the room that is left', () => {
    const daily = farFuture();
    for (let back = 7; back >= 0; back--) daily[day(-back)] = { fullRewards: 2, tips: 0 };
    const keys = Object.keys(migrateSave({ schemaVersion: 2, dailySlotsByDate: daily }, NOON.getTime()).dailySlotsByDate);
    expect(keys).toHaveLength(45);
    for (let back = 7; back >= 0; back--) expect(keys).toContain(day(-back));
    // Eight real days leave room for 37: the newest 37 of the later ones.
    const later = keys.filter((k) => k.startsWith('9999'));
    expect(later).toHaveLength(37);
    expect(later).not.toContain('9999-01-08');
    expect(later).toContain('9999-01-09');
    expect(later).toContain('9999-02-14');
    // Still listed oldest first.
    expect(keys).toEqual([...keys].sort());
  });

  it('counts tomorrow as a day that can have happened, and the day after as later', () => {
    const daily: Record<string, { fullRewards: number; tips: number }> = {};
    for (let back = 43; back >= 0; back--) daily[day(-back)] = { fullRewards: 1, tips: 0 }; // 44 days, today the last
    daily[day(1)] = { fullRewards: 1, tips: 0 }; // from a device a time zone ahead
    daily[day(2)] = { fullRewards: 1, tips: 0 };
    const keys = Object.keys(migrateSave({ schemaVersion: 2, dailySlotsByDate: daily }, NOON.getTime()).dailySlotsByDate);
    expect(keys).toHaveLength(45);
    expect(keys).toContain(day(-43));
    expect(keys).toContain(day(1));
    expect(keys).not.toContain(day(2));

    // With more than 45 days that can have happened, the oldest of those go, as before.
    daily[day(-44)] = { fullRewards: 1, tips: 0 };
    daily[day(-45)] = { fullRewards: 1, tips: 0 };
    const full = Object.keys(migrateSave({ schemaVersion: 2, dailySlotsByDate: daily }, NOON.getTime()).dailySlotsByDate);
    expect(full).toHaveLength(45);
    expect(full[0]).toBe(day(-43));
    expect(full[44]).toBe(day(1));
  });

  it('keeps a list where a day belongs as an empty day, and drops a true (the Swift twin does the same)', () => {
    const days = migrateSave({ schemaVersion: 2, dailySlotsByDate: { '2026-11-20': [1, 2], '2026-11-19': true } }, NOON.getTime()).dailySlotsByDate;
    expect(days['2026-11-20']).toEqual({ fullRewards: 0, tips: 0 });
    expect(days['2026-11-19']).toBeUndefined();
  });

  it('a device whose clock is behind still keeps its newest days', () => {
    // Every day here is "later" for a clock that still says 2023 (T0), and nothing is thrown away
    // for that: the newest 45 stay, as in M01.
    const daily: Record<string, { fullRewards: number; tips: number }> = {};
    for (let d = 1; d <= 30; d++) daily[`2026-09-${pad(d)}`] = { fullRewards: 1, tips: 0 };
    for (let d = 1; d <= 31; d++) daily[`2026-10-${pad(d)}`] = { fullRewards: 1, tips: 0 };
    const keys = Object.keys(migrateSave({ schemaVersion: 2, dailySlotsByDate: daily }, T0).dailySlotsByDate);
    expect(keys).toHaveLength(45);
    expect(keys[0]).toBe('2026-09-17');
    expect(keys[44]).toBe('2026-10-31');
  });

  it('the crafted code with 45 days dated 9999: the real days stay and the daily cap holds', () => {
    const storage = new SharedStorage();
    const sys = tab(storage, NOON.getTime() - 8 * DAY);
    const s = sys.getSave();
    // A week of real brushing, then today's two full brushes.
    for (let back = 7; back >= 1; back--) s.dailySlotsByDate[day(-back)] = { fullRewards: 2, tips: 0 };
    expect(HabitBank.completeBrushAlong(s, { withFlossBonus: true, date: NOON }).slotType).toBe('full');
    expect(HabitBank.completeBrushAlong(s, { withFlossBonus: true, date: NOON }).slotType).toBe('full');
    sys.save(s, NOON.getTime());
    const stamps = sys.getSave().totalBrushStamps;

    sys.importSyncCode(
      craftCode({ schemaVersion: 2, saveRevision: 1, lastSavedEpochMs: 1, dailySlotsByDate: farFuture() }),
      NOON.getTime() + 1000
    );
    // Importing drops no day: the cut to 45 is made when a save is read.
    expect(Object.keys(sys.getSave().dailySlotsByDate)).toHaveLength(8 + 45);

    const reloaded = tab(storage, NOON.getTime() + 2000);
    const after = reloaded.getSave();
    expect(Object.keys(after.dailySlotsByDate)).toHaveLength(45);
    for (let back = 7; back >= 0; back--) expect(after.dailySlotsByDate[day(-back)], day(-back)).toEqual({ fullRewards: 2, tips: 0 });

    // A third full brush today is a courtesy tip, not a third full reward.
    const third = HabitBank.completeBrushAlong(after, { withFlossBonus: true, date: NOON });
    expect(third.slotType).toBe('tip');
    expect(third.stampAwarded).toBe(false);
    reloaded.save(after, NOON.getTime() + 3000);

    // And it stays that way at the launch after that.
    const again = tab(storage, NOON.getTime() + 4000).getSave();
    expect(again.totalBrushStamps).toBe(stamps);
    expect(again.dailySlotsByDate[day(0)]).toEqual({ fullRewards: 2, tips: 1 });
  });

  it('a save already spoiled this way repairs itself at load: real days are kept from then on', () => {
    // What the old rule left in storage: the 45 crafted days, every earlier real day pushed out,
    // and today's two brushes written since the last launch.
    const spoiled = createDefaultSave(NOON.getTime() - 1000);
    spoiled.totalBrushStamps = 20;
    spoiled.dailySlotsByDate = { ...farFuture(), [day(0)]: { fullRewards: 2, tips: 0 } };
    const storage = new SharedStorage({ [SAVE_STORAGE_KEY]: JSON.stringify(spoiled) });

    const sys = tab(storage, NOON.getTime());
    const save = sys.getSave();
    expect(save.dailySlotsByDate[day(0)]).toEqual({ fullRewards: 2, tips: 0 });
    expect(Object.keys(save.dailySlotsByDate)).toHaveLength(45);
    expect(HabitBank.completeBrushAlong(save, { withFlossBonus: true, date: NOON }).slotType).toBe('tip');
    expect(save.totalBrushStamps).toBe(20);

    // The next day is kept beside today, launch after launch.
    const nextNoon = new Date(NOON.getTime() + DAY);
    expect(HabitBank.completeBrushAlong(save, { withFlossBonus: true, date: nextNoon }).slotType).toBe('full');
    sys.save(save, nextNoon.getTime());
    const next = tab(storage, nextNoon.getTime() + 1000).getSave();
    expect(next.dailySlotsByDate[day(0)]).toEqual({ fullRewards: 2, tips: 1 });
    expect(next.dailySlotsByDate[day(1)]).toEqual({ fullRewards: 1, tips: 0 });
    expect(next.totalBrushStamps).toBe(21);
  });
});
