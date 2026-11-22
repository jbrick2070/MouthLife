import { MAX_OVERDRIVE_RUNS, MAX_SUPPLY_BEACONS } from '../../config/gameConfig';
import {
  HISTORY_NOTE_IDS,
  HOST_CITIES,
  HOST_CITY_IDS,
  REALISTIC_SKIN_TONES,
} from '../../config/hostsAndHistory';
import { UPGRADE_CATALOG, UPGRADE_IDS } from '../../config/upgrades';
import { CompanionArchSim, createInitialCompanionState } from '../companion/CompanionArchSim';
import type { EventBus } from '../EventBus';
import { formatLocalDateKey } from './HabitBank';
import type {
  MasteryGrade,
  MouthLifeSaveV2,
  QualityTier,
  ScoreBreakdown,
  WorldRecord,
} from '../types';

export const SAVE_STORAGE_KEY = 'mouthlife_save_v2';
export const SYNC_CODE_PREFIX = 'ML2:';
/** Changes on every Erase Save, so another tab knows a fresh save replaced the old one (H01). */
export const SAVE_GENERATION_KEY = 'mouthlife_save_generation';
/** The bytes of a stored save this build could not read, kept before anything replaces them (H02). */
export const SAVE_UNREADABLE_COPY_KEY = 'mouthlife_save_v2_unreadable';
/** A copy of a version-1 save, kept before its first rewrite in the version-2 shape (H02). */
export const SAVE_V1_COPY_KEY = 'mouthlife_save_v1_copy';

const GRADE_ORDER: Record<MasteryGrade, number> = {
  NONE: 0,
  C: 1,
  B: 2,
  A: 3,
  S: 4,
  FLUORAPATITE_GOLD: 5,
};

const CAMPAIGN_UNLOCK_ORDER = ['world_1', 'world_2', 'world_3', 'world_4', 'world_5'] as const;

/**
 * Ensures campaign worlds unlock sequentially when the preceding stage is cleared
 * OR when monotonic Habit Stamp milestones are met (`world_1` is always unlocked).
 */
export function reconcileWorldUnlocks(save: MouthLifeSaveV2): void {
  for (const city of HOST_CITIES) {
    const rec = save.worlds[city.worldId] ?? createDefaultWorldRecord(city.worldId === 'world_1');
    if (
      city.worldId === 'world_1' ||
      rec.completed ||
      save.totalBrushStamps >= city.unlockStampsRequired
    ) {
      rec.unlocked = true;
    }
    save.worlds[city.worldId] = rec;
  }

  for (let i = 1; i < CAMPAIGN_UNLOCK_ORDER.length; i++) {
    const prevId = CAMPAIGN_UNLOCK_ORDER[i - 1];
    const currId = CAMPAIGN_UNLOCK_ORDER[i];
    if (save.worlds[prevId]?.completed) {
      const rec = save.worlds[currId] ?? createDefaultWorldRecord(true);
      rec.unlocked = true;
      save.worlds[currId] = rec;
    }
  }
}

function clampInt(val: unknown, min: number, max = Number.MAX_SAFE_INTEGER, fallback = min): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(val)));
}

function clampFloat(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, val));
}

export function createDefaultWorldRecord(unlocked = false): WorldRecord {
  return {
    unlocked,
    completed: false,
    timesCleared: 0,
    bestScore: 0,
    bestGrade: 'NONE',
    bestCleanlinessPct: 0,
    sitesRestoredMax: 0,
  };
}

export function createDefaultSave(nowEpochMs = Date.now()): MouthLifeSaveV2 {
  const worlds: Record<string, WorldRecord> = {};
  for (const city of HOST_CITIES) {
    worlds[city.worldId] = createDefaultWorldRecord(city.worldId === 'world_1');
  }

  return {
    schemaVersion: 2,
    saveRevision: 1,
    lastSavedEpochMs: nowEpochMs,
    hasSeenCosmicIntro: false,
    playerProfile: {
      displayName: 'Explorer',
      skinToneIndex: 3,
      homeCityId: 'toronto',
    },
    companion: createInitialCompanionState(nowEpochMs),
    totalBrushStamps: 0,
    fluorideIons: 0,
    dailySlotsByDate: {},
    pendingSupplyBeacons: 0,
    remineralizedOverdriveRuns: 0,
    unlockedUpgrades: [],
    equippedUpgrades: {
      brush: null,
      floss: null,
      rinse: null,
    },
    unlockedHistoryNotes: ['cosmic_hydroxyapatite'],
    qualityPreference: 'auto',
    worlds,
  };
}

/** How many brushing days a save keeps: the newest ones (see the day rule in `migrateSave`). */
export const DAILY_LOG_MAX_DAYS = 45;

/**
 * Pure migration & validation pipeline.
 * Supports both schemaVersion: 2 and synthetic legacy schemaVersion: 1 fixtures,
 * strips unknown registry IDs safely, and clamps numeric bounds.
 */
export function migrateSave(raw: unknown, nowEpochMs = Date.now()): MouthLifeSaveV2 {
  const base = createDefaultSave(nowEpochMs);
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const obj = raw as Record<string, unknown>;
  const version = obj.schemaVersion;

  if (version !== 1 && version !== 2) {
    return base;
  }

  base.saveRevision = clampInt(obj.saveRevision, 1, Number.MAX_SAFE_INTEGER, 1);
  base.lastSavedEpochMs = clampInt(
    obj.lastSavedEpochMs,
    0,
    Number.MAX_SAFE_INTEGER,
    nowEpochMs
  );
  base.hasSeenCosmicIntro =
    typeof obj.hasSeenCosmicIntro === 'boolean' ? obj.hasSeenCosmicIntro : version === 1;

  // Monotonic stamps & currency (map V1 fluorideCrystals -> fluorideIons)
  base.totalBrushStamps = clampInt(obj.totalBrushStamps, 0);
  const rawIons = version === 1 ? obj.fluorideCrystals : obj.fluorideIons;
  base.fluorideIons = clampInt(rawIons, 0);

  // Beacons & Overdrive (map V1 remineralizedBuffRunsRemaining -> remineralizedOverdriveRuns)
  base.pendingSupplyBeacons = clampInt(obj.pendingSupplyBeacons, 0, MAX_SUPPLY_BEACONS, 0);
  const rawOverdrive =
    version === 1 ? obj.remineralizedBuffRunsRemaining : obj.remineralizedOverdriveRuns;
  base.remineralizedOverdriveRuns = clampInt(rawOverdrive, 0, MAX_OVERDRIVE_RUNS, 0);

  // Daily slots (V1 stored numbers; V2 stores { fullRewards, tips })
  if (obj.dailySlotsByDate && typeof obj.dailySlotsByDate === 'object') {
    // Keep the 45 most recent days by date, not by the order the keys happen to be stored in:
    // a merged Sync Code can list an old day after a new one (M01).
    const dated = Object.entries(obj.dailySlotsByDate as Record<string, unknown>)
      .filter(([dateKey]) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    // Days that can have happened come first: everything up to tomorrow (tomorrow, because a code
    // may come from a device a time zone ahead). Days dated later only fill the room that is left.
    // A crafted code full of days in the year 9999 can then never push the real days out, and a
    // device whose own clock is set too early still keeps its newest days. The Swift twin has to
    // follow the same rule, or the two editions keep different days from one code.
    const tomorrow = formatLocalDateKey(new Date(nowEpochMs + 86_400_000));
    const happened = dated.filter(([dateKey]) => dateKey <= tomorrow).slice(-DAILY_LOG_MAX_DAYS);
    const room = DAILY_LOG_MAX_DAYS - happened.length;
    const later = room > 0 ? dated.filter(([dateKey]) => dateKey > tomorrow).slice(-room) : [];
    for (const [dateKey, val] of [...happened, ...later]) {
      if (typeof val === 'number') {
        base.dailySlotsByDate[dateKey] = {
          fullRewards: clampInt(val, 0, 2, 0),
          tips: 0,
        };
      } else if (val && typeof val === 'object') {
        const vObj = val as Record<string, unknown>;
        base.dailySlotsByDate[dateKey] = {
          fullRewards: clampInt(vObj.fullRewards, 0, 2, 0),
          tips: clampInt(vObj.tips, 0, 3, 0),
        };
      }
    }
  }

  // Player profile
  if (obj.playerProfile && typeof obj.playerProfile === 'object') {
    const p = obj.playerProfile as Record<string, unknown>;
    const rawName = typeof p.displayName === 'string' ? p.displayName.trim() : '';
    base.playerProfile = {
      // Nothing left after the cut (no name, or one "letter" too long to keep): the usual name.
      displayName: truncateDisplayName(rawName) || 'Explorer',
      skinToneIndex: clampInt(p.skinToneIndex, 0, REALISTIC_SKIN_TONES.length - 1, 3),
      homeCityId:
        typeof p.homeCityId === 'string' && HOST_CITY_IDS.has(p.homeCityId)
          ? p.homeCityId
          : 'toronto',
    };
  }

  // Companion hydration
  if (obj.companion && typeof obj.companion === 'object') {
    const c = obj.companion as Record<string, unknown>;
    const rawTreats = Array.isArray(c.recentTreatTimestampsMs)
      ? c.recentTreatTimestampsMs
          .filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
          .slice(-12)
      : [];
    base.companion = {
      smoothnessIndex: clampFloat(c.smoothnessIndex, 0, 100, 90),
      enamelShield: clampFloat(c.enamelShield, 0, 100, 100),
      dentinShield: clampFloat(c.dentinShield, 0, 100, 100),
      pulpIntegrity: clampFloat(c.pulpIntegrity, 0, 100, 100),
      unclaimedIdleIons: clampInt(c.unclaimedIdleIons, 0, 72, 0),
      recentTreatTimestampsMs: rawTreats,
      lastEvaluatedEpochMs: clampInt(
        c.lastEvaluatedEpochMs,
        0,
        Number.MAX_SAFE_INTEGER,
        nowEpochMs
      ),
    };
  } else if (version === 1) {
    base.companion = {
      smoothnessIndex: 90,
      enamelShield: 100,
      dentinShield: 100,
      pulpIntegrity: 100,
      unclaimedIdleIons: 0,
      recentTreatTimestampsMs: [],
      lastEvaluatedEpochMs: nowEpochMs,
    };
  }

  // Registry-sanitized upgrades
  if (Array.isArray(obj.unlockedUpgrades)) {
    const valid = new Set<string>();
    for (const id of obj.unlockedUpgrades) {
      if (typeof id === 'string') {
        // Support V1 alias 'angled_bass_bristles' -> 'angled_bass_array'
        const mapped = id === 'angled_bass_bristles' ? 'angled_bass_array' : id;
        if (UPGRADE_IDS.has(mapped)) valid.add(mapped);
      }
    }
    base.unlockedUpgrades = Array.from(valid);
  }

  if (version === 1 && typeof obj.equippedBrushUpgrade === 'string') {
    const mapped =
      obj.equippedBrushUpgrade === 'angled_bass_bristles'
        ? 'angled_bass_array'
        : obj.equippedBrushUpgrade;
    if (UPGRADE_IDS.has(mapped) && base.unlockedUpgrades.includes(mapped)) {
      base.equippedUpgrades.brush = mapped;
    }
  } else if (obj.equippedUpgrades && typeof obj.equippedUpgrades === 'object') {
    const eq = obj.equippedUpgrades as Record<string, unknown>;
    for (const slot of ['brush', 'floss', 'rinse'] as const) {
      const val = eq[slot];
      if (
        typeof val === 'string' &&
        UPGRADE_IDS.has(val) &&
        base.unlockedUpgrades.includes(val)
      ) {
        base.equippedUpgrades[slot] = val;
      }
    }
  }

  // Registry-sanitized history notes
  if (Array.isArray(obj.unlockedHistoryNotes)) {
    const notes = new Set<string>(['cosmic_hydroxyapatite']);
    for (const nId of obj.unlockedHistoryNotes) {
      if (typeof nId === 'string' && HISTORY_NOTE_IDS.has(nId)) {
        notes.add(nId);
      }
    }
    base.unlockedHistoryNotes = Array.from(notes);
  }

  if (
    obj.qualityPreference === 'auto' ||
    obj.qualityPreference === 'low' ||
    obj.qualityPreference === 'medium' ||
    obj.qualityPreference === 'ultra'
  ) {
    base.qualityPreference = obj.qualityPreference;
  }

  // Worlds migration (V1 worldProgress vs V2 worlds)
  const rawWorlds =
    version === 1
      ? (obj.worldProgress as Record<string, unknown> | undefined)
      : (obj.worlds as Record<string, unknown> | undefined);

  if (rawWorlds && typeof rawWorlds === 'object') {
    for (const city of HOST_CITIES) {
      const wid = city.worldId;
      const entry = rawWorlds[wid];
      if (entry && typeof entry === 'object') {
        const w = entry as Record<string, unknown>;
        const completed = Boolean(w.completed);
        const bestGradeRaw = w.bestGrade;
        // Only the six grade names themselves count. A plain `in` test also says yes to names
        // every object inherits ("constructor", "toString"), and a crafted code could use one to
        // replace a real grade with a word that no later win can beat. (Not Object.hasOwn: older
        // Safari lacks it.)
        const bestGrade: MasteryGrade =
          typeof bestGradeRaw === 'string' && Object.prototype.hasOwnProperty.call(GRADE_ORDER, bestGradeRaw)
            ? (bestGradeRaw as MasteryGrade)
            : completed
              ? 'B'
              : 'NONE';
        base.worlds[wid] = {
          unlocked: wid === 'world_1' || Boolean(w.unlocked) || completed,
          completed,
          timesCleared: clampInt(w.timesCleared, 0, 999999, completed ? 1 : 0),
          bestScore: clampInt(w.bestScore, 0, 999999, 0),
          bestGrade,
          bestCleanlinessPct: clampFloat(w.bestCleanlinessPct, 0, 100, 0),
          sitesRestoredMax: clampInt(
            w.sitesRestoredMax ?? w.citizensRescuedMax,
            0,
            999,
            0
          ),
        };
      }
    }
  }

  reconcileWorldUnlocks(base);
  return base;
}

export function encodeSaveToSyncCode(save: MouthLifeSaveV2): string {
  const bytes = new TextEncoder().encode(JSON.stringify(save));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${SYNC_CODE_PREFIX}${b64}`;
}

/**
 * First 24 visible characters of a name. Cutting by UTF-16 units can split an emoji in half and
 * leave a broken character that the native app then refuses to import, so cut by whole characters.
 *
 * One visible character can carry any number of stacked marks, so 24 of them can still be very
 * long: a crafted name made a save's own Sync Code too long to be read back. So the name also stops
 * before it passes 256 UTF-16 units, still at a whole character. A first character that is too long
 * by itself leaves nothing, and the caller then uses the usual name. The Swift twin has to cut the
 * same way, or one code gives two different names.
 */
export function truncateDisplayName(
  name: string,
  maxChars = DISPLAY_NAME_MAX_CHARS,
  maxUnits = DISPLAY_NAME_MAX_UNITS
): string {
  const out: string[] = [];
  let units = 0;
  /** Adds one whole character, or says no when either limit would be passed. */
  const take = (character: string): boolean => {
    if (out.length >= maxChars || units + character.length > maxUnits) return false;
    out.push(character);
    units += character.length;
    return true;
  };
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name)) {
      if (!take(segment)) break;
    }
  } else {
    // An older browser: whole code points, so an emoji is still never split in half.
    for (const codePoint of name) {
      if (!take(codePoint)) break;
    }
  }
  return out.join('');
}

/** The most visible characters a name keeps. */
export const DISPLAY_NAME_MAX_CHARS = 24;
/** The most UTF-16 units a name keeps, whatever its characters are made of. */
export const DISPLAY_NAME_MAX_UNITS = 256;

export function decodeSaveFromSyncCode(
  code: string,
  nowEpochMs = Date.now()
): MouthLifeSaveV2 {
  const trimmed = code.trim();
  if (!trimmed.startsWith(SYNC_CODE_PREFIX)) {
    throw new Error('This is not a MouthLife code. It should start with ML2:');
  }
  // Codes get line-wrapped by mail and chat apps, and some tools re-pad them: strip whitespace,
  // allow trailing '=' padding and the standard Base64 '+' '/' alphabet as well as Base64URL.
  const compact = trimmed.slice(SYNC_CODE_PREFIX.length).replace(/\s+/g, '');
  // A code cut short or mistyped gets one plain message (as in the native app), never a decoder's.
  const damaged = 'This code is damaged and can’t be read.';
  if (compact.length === 0 || compact.length > 65536 || !/^[A-Za-z0-9\-_+/]+=*$/.test(compact)) {
    throw new Error(damaged);
  }
  const body = compact.replace(/=+$/, '');
  if (body.length % 4 === 1) {
    throw new Error(damaged);
  }
  let stdB64 = body.replace(/-/g, '+').replace(/_/g, '/');
  while (stdB64.length % 4 !== 0) {
    stdB64 += '=';
  }
  let parsed: unknown;
  try {
    const bin = atob(stdB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    const jsonText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(damaged);
  }
  return migrateCheckedSave(parsed, nowEpochMs);
}

function migrateCheckedSave(parsed: unknown, nowEpochMs: number): MouthLifeSaveV2 {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('schemaVersion' in parsed)) {
    throw new Error('This code is missing its version number.');
  }
  const v = (parsed as { schemaVersion?: unknown }).schemaVersion;
  if (v !== 1 && v !== 2) {
    throw new Error('This code is from a version this app can’t read.');
  }
  return migrateSave(parsed, nowEpochMs);
}

/**
 * What the Import box and the backup-file button accept: an `ML2:` Sync Code, or the text of a
 * `backup.mouthlife.json` file from the Download button (H08). Both go through the same checks
 * and migration. The Swift twin is `SaveSystem.decodeSaveFromText`.
 */
export function decodeSaveFromText(text: string, nowEpochMs = Date.now()): MouthLifeSaveV2 {
  const trimmed = text.trim().replace(/^﻿/, '');
  if (!trimmed.startsWith('{')) {
    return decodeSaveFromSyncCode(trimmed, nowEpochMs);
  }
  if (trimmed.length > 262144) {
    throw new Error('This code is damaged and can’t be read.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('This code is damaged and can’t be read.');
  }
  return migrateCheckedSave(parsed, nowEpochMs);
}

/** A save as read back from storage: readable, damaged, or written by a newer version (H02). */
export type StoredSaveRead =
  | { kind: 'ok'; save: MouthLifeSaveV2; schemaVersion: 1 | 2 }
  | { kind: 'unreadable' }
  | { kind: 'newer-version'; schemaVersion: number };

export function readStoredSave(rawText: string, nowEpochMs = Date.now()): StoredSaveRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { kind: 'unreadable' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'unreadable' };
  const v = (parsed as { schemaVersion?: unknown }).schemaVersion;
  if (v === 1 || v === 2) return { kind: 'ok', save: migrateSave(parsed, nowEpochMs), schemaVersion: v };
  if (typeof v === 'number' && Number.isFinite(v) && v > 2) return { kind: 'newer-version', schemaVersion: v };
  return { kind: 'unreadable' };
}

/** How `SaveSystem.load` found the stored save. */
export type SaveLoadOutcome = 'new' | 'loaded' | 'unreadable' | 'newer-version';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * One player's save, kept in `localStorage`, which every open tab of the game shares.
 *
 * Tabs never trust their own copy blindly (H01). Before every write, a tab folds in any save
 * another tab stored since it last looked, merging with `mergeConcurrentSaves` so that one tab's
 * city clear and another's profile edit both survive. Erase Save changes the generation key, and
 * a tab that sees a new generation takes the fresh save as it is, so closing an old tab can never
 * write erased progress back. Page hide writes only when this tab holds something the store lacks.
 */
export class SaveSystem {
  private memoryStore = new Map<string, string>();
  private currentSave: MouthLifeSaveV2;
  /** The stored text this tab last read or wrote, and that save as parsed: the common ancestor
   *  when another tab's newer write has to be merged in. */
  private lastSeenRaw: string | null = null;
  private lastSeenSave: MouthLifeSaveV2 | null = null;
  private generation = '';
  /** True while the stored save came from a newer version: play continues, nothing is written. */
  private persistenceSuspended = false;
  private outcome: SaveLoadOutcome = 'new';

  constructor(
    private readonly bus: EventBus,
    private readonly customStorage?: StorageLike
  ) {
    this.currentSave = createDefaultSave();
  }

  private getStorage(): StorageLike {
    if (this.customStorage) return this.customStorage;
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    return {
      getItem: (k) => this.memoryStore.get(k) ?? null,
      setItem: (k, v) => {
        this.memoryStore.set(k, v);
      },
    };
  }

  /** Storage can be missing or throw (private browsing, blocked site data): treat that as empty. */
  private readKey(key: string): string | null {
    try {
      return this.getStorage().getItem(key);
    } catch {
      return null;
    }
  }

  private writeKey(key: string, value: string): boolean {
    try {
      this.getStorage().setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  /** Keeps the first copy only, so a later problem never overwrites the bytes worth recovering. */
  private keepCopy(key: string, rawText: string): void {
    if (this.readKey(key) === null) this.writeKey(key, rawText);
  }

  private markSeen(rawText: string, save: MouthLifeSaveV2): void {
    this.lastSeenRaw = rawText;
    this.lastSeenSave = cloneSave(save);
  }

  load(nowEpochMs = Date.now()): MouthLifeSaveV2 {
    this.persistenceSuspended = false;
    this.generation = this.readKey(SAVE_GENERATION_KEY) ?? '';
    const rawText = this.readKey(SAVE_STORAGE_KEY);
    if (!rawText) {
      // Only a missing save starts a new one in storage (H02).
      this.outcome = 'new';
      this.currentSave = createDefaultSave(nowEpochMs);
      this.persistInternal(nowEpochMs);
      return this.currentSave;
    }
    const read = readStoredSave(rawText, nowEpochMs);
    if (read.kind === 'ok') {
      if (read.schemaVersion === 1) this.keepCopy(SAVE_V1_COPY_KEY, rawText);
      this.outcome = 'loaded';
      this.currentSave = read.save;
      this.markSeen(rawText, read.save);
      this.checkThresholdAutoUnlocks();
      return this.currentSave;
    }
    this.keepCopy(SAVE_UNREADABLE_COPY_KEY, rawText);
    this.currentSave = createDefaultSave(nowEpochMs);
    if (read.kind === 'newer-version') {
      // A newer version wrote this save, and an older copy of the app is running (an old cached
      // page, say). Play goes on with a fresh save in memory, and the stored one is left exactly
      // as it is until the player imports a code or erases on purpose.
      this.outcome = 'newer-version';
      this.persistenceSuspended = true;
      this.lastSeenRaw = rawText;
      this.lastSeenSave = null;
      return this.currentSave;
    }
    // Damaged past reading, by any version: its bytes are kept under SAVE_UNREADABLE_COPY_KEY and
    // a fresh save takes its place, so progress is saved again from now on.
    this.outcome = 'unreadable';
    this.persistInternal(nowEpochMs);
    return this.currentSave;
  }

  /** How the last `load` found the stored save. */
  getLoadOutcome(): SaveLoadOutcome {
    return this.outcome;
  }

  /** True while nothing is written because the stored save came from a newer version. */
  isPersistenceSuspended(): boolean {
    return this.persistenceSuspended;
  }

  getSave(): MouthLifeSaveV2 {
    return this.currentSave;
  }

  /**
   * Folds a save another tab stored since this tab last looked into this tab's save, in place
   * (references to the save object stay valid). Returns false when there is nothing new.
   */
  private absorbStoredSave(nowEpochMs: number): boolean {
    if (this.persistenceSuspended) return false;
    const rawText = this.readKey(SAVE_STORAGE_KEY);
    if (rawText === null || rawText === this.lastSeenRaw) return false;
    const read = readStoredSave(rawText, nowEpochMs);
    // Never adopt a write this version cannot read; the next write replaces it.
    if (read.kind !== 'ok') return false;
    const generation = this.readKey(SAVE_GENERATION_KEY) ?? '';
    const next =
      generation !== this.generation || !this.lastSeenSave
        ? read.save
        : mergeConcurrentSaves(this.lastSeenSave, this.currentSave, read.save);
    this.generation = generation;
    assignInPlace(
      this.currentSave as unknown as Record<string, unknown>,
      next as unknown as Record<string, unknown>
    );
    this.markSeen(rawText, read.save);
    return true;
  }

  /** Another tab wrote the save, or this tab came back into view: pick up what changed. */
  refreshFromStorage(nowEpochMs = Date.now()): boolean {
    if (!this.absorbStoredSave(nowEpochMs)) return false;
    this.checkThresholdAutoUnlocks();
    this.bus.emit('save:updated', { save: this.currentSave });
    return true;
  }

  save(mutatedSave = this.currentSave, nowEpochMs = Date.now()): MouthLifeSaveV2 {
    const stampsBefore = this.currentSave.totalBrushStamps;
    const revisionBefore = this.currentSave.saveRevision;
    const generationBefore = this.generation;
    this.currentSave = mutatedSave;
    // Another tab may have saved since this one last looked: merge its progress in first.
    this.absorbStoredSave(nowEpochMs);
    const next = this.currentSave;
    // Enforce monotonic totalBrushStamps invariant (an erase in another tab starts a new count)
    if (this.generation === generationBefore) {
      next.totalBrushStamps = Math.max(stampsBefore, Math.floor(next.totalBrushStamps));
    }
    next.saveRevision =
      Math.max(revisionBefore, next.saveRevision, this.lastSeenSave?.saveRevision ?? 0) + 1;
    next.lastSavedEpochMs = nowEpochMs;

    this.checkThresholdAutoUnlocks();
    this.persistInternal(nowEpochMs);
    this.bus.emit('save:updated', { save: this.currentSave });
    return this.currentSave;
  }

  /**
   * Page hide or a hidden tab: write only if this tab holds changes the store lacks, after taking
   * in what other tabs stored. A stale tab therefore never writes old progress over a newer save
   * or over an erase (H01).
   */
  flushIfChanged(nowEpochMs = Date.now()): void {
    if (this.persistenceSuspended) return;
    const absorbed = this.absorbStoredSave(nowEpochMs);
    if (this.lastSeenSave && savesMatch(this.currentSave, this.lastSeenSave)) {
      if (absorbed) {
        this.checkThresholdAutoUnlocks();
        this.bus.emit('save:updated', { save: this.currentSave });
      }
      return;
    }
    this.save(this.currentSave, nowEpochMs);
  }

  /**
   * Resets local progress to a brand-new Day-1 save (for beta testing or fresh-start requests).
   * A new generation tells every other open tab to take the fresh save rather than merge into it.
   */
  resetToFreshSave(nowEpochMs = Date.now()): MouthLifeSaveV2 {
    const revisionBefore = Math.max(this.currentSave.saveRevision, this.lastSeenSave?.saveRevision ?? 0);
    this.persistenceSuspended = false;
    this.generation = newGenerationId();
    this.writeKey(SAVE_GENERATION_KEY, this.generation);
    this.currentSave = createDefaultSave(nowEpochMs);
    this.currentSave.saveRevision = revisionBefore + 1;
    this.persistInternal(nowEpochMs);
    this.bus.emit('save:updated', { save: this.currentSave });
    return this.currentSave;
  }

  private persistInternal(nowEpochMs: number): void {
    this.currentSave.lastSavedEpochMs = nowEpochMs;
    // A save from a newer version stays untouched until the player imports or erases (H02).
    if (this.persistenceSuspended) return;
    const serialized = JSON.stringify(this.currentSave);
    if (this.writeKey(SAVE_STORAGE_KEY, serialized)) {
      this.markSeen(serialized, this.currentSave);
    }
  }

  consumeSingleSupplyBeacon(nowEpochMs = Date.now()): void {
    if (this.currentSave.pendingSupplyBeacons > 0) {
      this.currentSave.pendingSupplyBeacons -= 1;
      this.save(this.currentSave, nowEpochMs);
    }
  }

  recordMissionCompletion(params: {
    mode: 'ARCADE' | 'PULP_RESCUE';
    worldId: string;
    won: boolean;
    breakdown: ScoreBreakdown;
    historyNoteIds: string[];
    nowEpochMs?: number;
  }): { unlockedHistoryNoteId: string | null } {
    const now = params.nowEpochMs ?? Date.now();
    let unlockedHistoryNoteId: string | null = null;

    if (params.mode === 'ARCADE' && params.won) {
      const prevRec =
        this.currentSave.worlds[params.worldId] ?? createDefaultWorldRecord(true);
      const isFirstClear = !prevRec.completed;

      prevRec.unlocked = true;
      prevRec.completed = true;
      prevRec.timesCleared += 1;
      prevRec.bestScore = Math.max(prevRec.bestScore, params.breakdown.totalScore);
      if (GRADE_ORDER[params.breakdown.grade] > GRADE_ORDER[prevRec.bestGrade]) {
        prevRec.bestGrade = params.breakdown.grade;
      }
      prevRec.bestCleanlinessPct = Math.max(
        prevRec.bestCleanlinessPct,
        params.breakdown.cleanlinessPct
      );
      prevRec.sitesRestoredMax = Math.max(
        prevRec.sitesRestoredMax,
        params.breakdown.sitesRestored
      );
      this.currentSave.worlds[params.worldId] = prevRec;

      // First-time world clear grants +1 monotonic Habit Stamp
      if (isFirstClear) {
        this.currentSave.totalBrushStamps += 1;
      }

      this.currentSave.fluorideIons += params.breakdown.ionsEarned;

      // Consume 1 Overdrive charge ONLY on completed Arcade run
      if (this.currentSave.remineralizedOverdriveRuns > 0) {
        this.currentSave.remineralizedOverdriveRuns -= 1;
      }

      for (const noteId of params.historyNoteIds) {
        if (
          HISTORY_NOTE_IDS.has(noteId) &&
          !this.currentSave.unlockedHistoryNotes.includes(noteId)
        ) {
          this.currentSave.unlockedHistoryNotes.push(noteId);
          unlockedHistoryNoteId = noteId;
        }
      }
    }

    this.save(this.currentSave, now);
    return { unlockedHistoryNoteId };
  }

  checkThresholdAutoUnlocks(): string[] {
    const newlyUnlocked: string[] = [];
    for (const upg of UPGRADE_CATALOG) {
      if (this.currentSave.unlockedUpgrades.includes(upg.id)) continue;

      const byStamps =
        upg.stampUnlockThreshold !== null &&
        this.currentSave.totalBrushStamps >= upg.stampUnlockThreshold;
      const byWorld =
        upg.worldClearUnlockId !== null &&
        Boolean(this.currentSave.worlds[upg.worldClearUnlockId]?.completed);

      if (byStamps || byWorld) {
        this.currentSave.unlockedUpgrades.push(upg.id);
        if (!this.currentSave.equippedUpgrades[upg.slot]) {
          this.currentSave.equippedUpgrades[upg.slot] = upg.id;
        }
        newlyUnlocked.push(upg.id);
        this.bus.emit('upgrade:unlocked', {
          upgradeId: upg.id,
          via: byWorld ? 'world_clear' : 'stamps',
          costPaid: 0,
        });
      }
    }

    // Unlock campaign worlds sequentially on stage clear OR when Stamp milestones are met
    reconcileWorldUnlocks(this.currentSave);

    return newlyUnlocked;
  }

  purchaseUpgradeWithIons(upgradeId: string, nowEpochMs = Date.now()): boolean {
    const upg = UPGRADE_CATALOG.find((u) => u.id === upgradeId);
    if (!upg) return false;
    if (this.currentSave.unlockedUpgrades.includes(upg.id)) return false;
    if (this.currentSave.fluorideIons < upg.ionCost) return false;

    this.currentSave.fluorideIons -= upg.ionCost;
    this.currentSave.unlockedUpgrades.push(upg.id);
    this.currentSave.equippedUpgrades[upg.slot] = upg.id;
    this.save(this.currentSave, nowEpochMs);
    this.bus.emit('upgrade:unlocked', {
      upgradeId: upg.id,
      via: 'ions',
      costPaid: upg.ionCost,
    });
    return true;
  }

  equipUpgrade(upgradeId: string, nowEpochMs = Date.now()): boolean {
    const upg = UPGRADE_CATALOG.find((u) => u.id === upgradeId);
    if (!upg) return false;
    if (!this.currentSave.unlockedUpgrades.includes(upg.id)) return false;
    this.currentSave.equippedUpgrades[upg.slot] =
      this.currentSave.equippedUpgrades[upg.slot] === upg.id ? null : upg.id;
    this.save(this.currentSave, nowEpochMs);
    return true;
  }

  setQualityPreference(pref: 'auto' | QualityTier, nowEpochMs = Date.now()): void {
    this.currentSave.qualityPreference = pref;
    this.save(this.currentSave, nowEpochMs);
  }

  exportSyncCode(): string {
    return encodeSaveToSyncCode(this.currentSave);
  }

  /** `preferImported`: see `mergeSaves` (the Prologue's restore on a brand-new save). */
  importSyncCode(code: string, nowEpochMs = Date.now(), preferImported = false): MouthLifeSaveV2 {
    // An ML2: code, or the text of a downloaded backup.mouthlife.json (H08).
    const imported = decodeSaveFromText(code, nowEpochMs);
    // Merge into the newest stored save, not a stale copy in this tab (H01).
    this.absorbStoredSave(nowEpochMs);
    // "Import & Merge" merges: nothing either device earned is lost (see mergeSaves).
    const merged = mergeSaves(this.currentSave, imported, preferImported);
    CompanionArchSim.reconcileOfflineElapsed(merged.companion, nowEpochMs);
    merged.saveRevision =
      Math.max(this.currentSave.saveRevision, imported.saveRevision, this.lastSeenSave?.saveRevision ?? 0) + 1;
    this.currentSave = merged;
    // Importing on purpose is the player's choice to replace a save this version can't read.
    this.persistenceSuspended = false;
    this.checkThresholdAutoUnlocks();
    this.persistInternal(nowEpochMs);
    this.bus.emit('save:updated', { save: this.currentSave });
    return this.currentSave;
  }
}

/**
 * Two saves of the same player (this device's and an imported Sync Code) made into one, so that an
 * older code never erases newer progress: each city keeps its best record, counts keep the higher
 * value, unlocks are combined, each day's reward slots keep the higher count (a daily cap is never
 * earned twice), the companion comes from whichever save is newer, and this device keeps its own
 * graphics setting. The Swift twin is SaveSystem.mergeSaves.
 */
export function mergeSaves(
  current: MouthLifeSaveV2,
  imported: MouthLifeSaveV2,
  /**
   * This device's save is brand new (the Prologue's "Have a Sync Code?"), so the code's tooth,
   * settings and choices win even though the fresh save was written more recently. Counts and
   * unlocks still merge the same way. Native twin: `SaveSystem.mergeSaves(preferImported:)`.
   */
  preferImported = false
): MouthLifeSaveV2 {
  const newer = preferImported || imported.lastSavedEpochMs >= current.lastSavedEpochMs ? imported : current;
  const union = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];
  const worlds: Record<string, WorldRecord> = {};
  for (const id of new Set([...Object.keys(current.worlds), ...Object.keys(imported.worlds)])) {
    const a = current.worlds[id];
    const b = imported.worlds[id];
    if (!a || !b) {
      worlds[id] = { ...(a ?? b) } as WorldRecord;
      continue;
    }
    worlds[id] = {
      unlocked: a.unlocked || b.unlocked,
      completed: a.completed || b.completed,
      timesCleared: Math.max(a.timesCleared, b.timesCleared),
      bestScore: Math.max(a.bestScore, b.bestScore),
      bestGrade: GRADE_ORDER[a.bestGrade] >= GRADE_ORDER[b.bestGrade] ? a.bestGrade : b.bestGrade,
      bestCleanlinessPct: Math.max(a.bestCleanlinessPct, b.bestCleanlinessPct),
      sitesRestoredMax: Math.max(a.sitesRestoredMax, b.sitesRestoredMax),
    };
  }
  const daily: Record<string, { fullRewards: number; tips: number }> = {};
  for (const day of new Set([...Object.keys(current.dailySlotsByDate), ...Object.keys(imported.dailySlotsByDate)])) {
    const a = current.dailySlotsByDate[day] ?? { fullRewards: 0, tips: 0 };
    const b = imported.dailySlotsByDate[day] ?? { fullRewards: 0, tips: 0 };
    daily[day] = { fullRewards: Math.max(a.fullRewards, b.fullRewards), tips: Math.max(a.tips, b.tips) };
  }
  const unlockedUpgrades = union(current.unlockedUpgrades, imported.unlockedUpgrades);
  const pick = (slot: 'brush' | 'floss' | 'rinse'): string | null => {
    const want = newer.equippedUpgrades[slot] ?? current.equippedUpgrades[slot] ?? imported.equippedUpgrades[slot];
    return want && unlockedUpgrades.includes(want) ? want : null;
  };
  // A code that brings nothing new is an older copy of this save (M03): spent ions, beacons and
  // Overdrive charges stay spent instead of coming back with it.
  const keepWallet = !preferImported && isSupersededBy(imported, current);
  const wallet = (a: number, b: number): number => (keepWallet ? a : Math.max(a, b));
  return {
    ...newer,
    hasSeenCosmicIntro: current.hasSeenCosmicIntro || imported.hasSeenCosmicIntro,
    playerProfile: { ...imported.playerProfile },
    companion: structuredCloneSafe(newer.companion),
    totalBrushStamps: Math.max(current.totalBrushStamps, imported.totalBrushStamps),
    fluorideIons: wallet(current.fluorideIons, imported.fluorideIons),
    dailySlotsByDate: daily,
    pendingSupplyBeacons: wallet(current.pendingSupplyBeacons, imported.pendingSupplyBeacons),
    remineralizedOverdriveRuns: wallet(current.remineralizedOverdriveRuns, imported.remineralizedOverdriveRuns),
    unlockedUpgrades,
    equippedUpgrades: { brush: pick('brush'), floss: pick('floss'), rinse: pick('rinse') },
    unlockedHistoryNotes: union(current.unlockedHistoryNotes, imported.unlockedHistoryNotes),
    qualityPreference: current.qualityPreference,
    worlds,
    lastSavedEpochMs: Math.max(current.lastSavedEpochMs, imported.lastSavedEpochMs),
  };
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneSave(save: MouthLifeSaveV2): MouthLifeSaveV2 {
  return structuredCloneSafe(save);
}

function newGenerationId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Equal values, ignoring the order of object keys (a stored save and a merged one list keys differently). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

/** The same progress and settings, whatever the revision number and save time. */
function savesMatch(a: MouthLifeSaveV2, b: MouthLifeSaveV2): boolean {
  return deepEqual(
    { ...a, saveRevision: 0, lastSavedEpochMs: 0 },
    { ...b, saveRevision: 0, lastSavedEpochMs: 0 }
  );
}

/** Makes `target` hold `source`'s contents without replacing nested objects that callers may hold. */
function assignInPlace(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(target)) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) delete target[key];
  }
  for (const [key, value] of Object.entries(source)) {
    const cur = target[key];
    if (isPlainObject(cur) && isPlainObject(value)) assignInPlace(cur, value);
    else target[key] = value;
  }
}

/**
 * True when `older` holds nothing that `newer` lacks: every city record, brushing day, unlock and
 * history note is matched or beaten, and no more stamps. Replaying such a code must not refill
 * what `newer` has spent since (M03). Days `newer` has already let go of (it keeps 45) are not
 * counted against it. The Swift twin is `SaveSystem.isSuperseded`.
 */
export function isSupersededBy(older: MouthLifeSaveV2, newer: MouthLifeSaveV2): boolean {
  // An earlier copy was saved earlier and has a lower revision: every save and import raises it.
  if (older.saveRevision >= newer.saveRevision || older.lastSavedEpochMs > newer.lastSavedEpochMs) return false;
  if (older.totalBrushStamps > newer.totalBrushStamps) return false;
  // Treats pay ions too; they leave their times on the tooth (newer keeps the latest 12).
  const newerTreats = newer.companion.recentTreatTimestampsMs;
  const oldestTreatKept = newerTreats.length >= 12 ? Math.min(...newerTreats) : -Infinity;
  if (older.companion.recentTreatTimestampsMs.some((ts) => ts >= oldestTreatKept && !newerTreats.includes(ts))) {
    return false;
  }
  for (const [id, a] of Object.entries(older.worlds)) {
    const b = newer.worlds[id];
    if (!b) {
      if (a.completed || a.timesCleared > 0 || a.bestScore > 0) return false;
      continue;
    }
    if (
      (a.completed && !b.completed) ||
      (a.unlocked && !b.unlocked) ||
      a.timesCleared > b.timesCleared ||
      a.bestScore > b.bestScore ||
      GRADE_ORDER[a.bestGrade] > GRADE_ORDER[b.bestGrade] ||
      a.bestCleanlinessPct > b.bestCleanlinessPct ||
      a.sitesRestoredMax > b.sitesRestoredMax
    ) {
      return false;
    }
  }
  const newerDays = Object.keys(newer.dailySlotsByDate).sort();
  const oldestKept = newerDays.length >= DAILY_LOG_MAX_DAYS ? newerDays[0] : '';
  for (const [day, a] of Object.entries(older.dailySlotsByDate)) {
    if (day < oldestKept) continue;
    const b = newer.dailySlotsByDate[day];
    if (a.fullRewards > (b?.fullRewards ?? 0) || a.tips > (b?.tips ?? 0)) return false;
  }
  const upgrades = new Set(newer.unlockedUpgrades);
  if (older.unlockedUpgrades.some((id) => !upgrades.has(id))) return false;
  const notes = new Set(newer.unlockedHistoryNotes);
  if (older.unlockedHistoryNotes.some((id) => !notes.has(id))) return false;
  return true;
}

/**
 * Two tabs changed the same save at once (H01): `base` is the save both started from, `ours` this
 * tab's version, `theirs` the one the other tab stored. A setting changed on one side only keeps
 * that change, and this tab's choice wins when both changed it. City records and unlocks only
 * ever grow, so the best of each is kept. Ions, beacons and Overdrive charges add up both tabs'
 * gains and spending against the starting balance, so neither a purchase nor a payout is undone.
 */
export function mergeConcurrentSaves(
  base: MouthLifeSaveV2,
  ours: MouthLifeSaveV2,
  theirs: MouthLifeSaveV2
): MouthLifeSaveV2 {
  const pick = <T>(b: T, o: T, t: T): T => (deepEqual(o, b) ? t : o);
  const shift = (b: number, o: number, t: number, max = Number.MAX_SAFE_INTEGER): number =>
    Math.max(0, Math.min(max, t + (o - b)));
  const union = (t: readonly string[], o: readonly string[]): string[] => [...new Set([...t, ...o])];

  const worlds: Record<string, WorldRecord> = {};
  for (const id of new Set([...Object.keys(theirs.worlds), ...Object.keys(ours.worlds)])) {
    const o = ours.worlds[id];
    const t = theirs.worlds[id];
    if (!o || !t) {
      worlds[id] = { ...(t ?? o) } as WorldRecord;
      continue;
    }
    worlds[id] = {
      unlocked: o.unlocked || t.unlocked,
      completed: o.completed || t.completed,
      timesCleared: Math.max(o.timesCleared, t.timesCleared),
      bestScore: Math.max(o.bestScore, t.bestScore),
      bestGrade: GRADE_ORDER[o.bestGrade] >= GRADE_ORDER[t.bestGrade] ? o.bestGrade : t.bestGrade,
      bestCleanlinessPct: Math.max(o.bestCleanlinessPct, t.bestCleanlinessPct),
      sitesRestoredMax: Math.max(o.sitesRestoredMax, t.sitesRestoredMax),
    };
  }

  const daily: Record<string, { fullRewards: number; tips: number }> = {};
  for (const day of new Set([...Object.keys(theirs.dailySlotsByDate), ...Object.keys(ours.dailySlotsByDate)])) {
    const o = ours.dailySlotsByDate[day] ?? { fullRewards: 0, tips: 0 };
    const t = theirs.dailySlotsByDate[day] ?? { fullRewards: 0, tips: 0 };
    daily[day] = { fullRewards: Math.max(o.fullRewards, t.fullRewards), tips: Math.max(o.tips, t.tips) };
  }

  const unlockedUpgrades = union(theirs.unlockedUpgrades, ours.unlockedUpgrades);
  const equip = (slot: 'brush' | 'floss' | 'rinse'): string | null => {
    const want = pick(base.equippedUpgrades[slot], ours.equippedUpgrades[slot], theirs.equippedUpgrades[slot]);
    return want && unlockedUpgrades.includes(want) ? want : null;
  };

  let companion = theirs.companion;
  if (!deepEqual(ours.companion, base.companion)) {
    companion =
      deepEqual(theirs.companion, base.companion) ||
      ours.companion.lastEvaluatedEpochMs >= theirs.companion.lastEvaluatedEpochMs
        ? ours.companion
        : theirs.companion;
  }

  return {
    schemaVersion: 2,
    saveRevision: Math.max(ours.saveRevision, theirs.saveRevision),
    lastSavedEpochMs: Math.max(ours.lastSavedEpochMs, theirs.lastSavedEpochMs),
    hasSeenCosmicIntro: ours.hasSeenCosmicIntro || theirs.hasSeenCosmicIntro,
    playerProfile: {
      displayName: pick(base.playerProfile.displayName, ours.playerProfile.displayName, theirs.playerProfile.displayName),
      skinToneIndex: pick(base.playerProfile.skinToneIndex, ours.playerProfile.skinToneIndex, theirs.playerProfile.skinToneIndex),
      homeCityId: pick(base.playerProfile.homeCityId, ours.playerProfile.homeCityId, theirs.playerProfile.homeCityId),
    },
    companion: structuredCloneSafe(companion),
    totalBrushStamps: Math.max(ours.totalBrushStamps, theirs.totalBrushStamps),
    fluorideIons: shift(base.fluorideIons, ours.fluorideIons, theirs.fluorideIons),
    dailySlotsByDate: daily,
    pendingSupplyBeacons: shift(
      base.pendingSupplyBeacons,
      ours.pendingSupplyBeacons,
      theirs.pendingSupplyBeacons,
      MAX_SUPPLY_BEACONS
    ),
    remineralizedOverdriveRuns: shift(
      base.remineralizedOverdriveRuns,
      ours.remineralizedOverdriveRuns,
      theirs.remineralizedOverdriveRuns,
      MAX_OVERDRIVE_RUNS
    ),
    unlockedUpgrades,
    equippedUpgrades: { brush: equip('brush'), floss: equip('floss'), rinse: equip('rinse') },
    unlockedHistoryNotes: union(theirs.unlockedHistoryNotes, ours.unlockedHistoryNotes),
    qualityPreference: pick(base.qualityPreference, ours.qualityPreference, theirs.qualityPreference),
    worlds,
  };
}
