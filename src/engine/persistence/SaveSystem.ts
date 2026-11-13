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
import type {
  MasteryGrade,
  MouthLifeSaveV2,
  QualityTier,
  ScoreBreakdown,
  WorldRecord,
} from '../types';

export const SAVE_STORAGE_KEY = 'mouthlife_save_v2';
export const SYNC_CODE_PREFIX = 'ML2:';

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
    const entries = Object.entries(obj.dailySlotsByDate as Record<string, unknown>).slice(-45);
    for (const [dateKey, val] of entries) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
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
      displayName: rawName.length > 0 ? truncateDisplayName(rawName) : 'Explorer',
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
        const bestGrade: MasteryGrade =
          typeof bestGradeRaw === 'string' && bestGradeRaw in GRADE_ORDER
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
 */
export function truncateDisplayName(name: string, maxChars = DISPLAY_NAME_MAX_CHARS): string {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const out: string[] = [];
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name)) {
      if (out.length >= maxChars) break;
      out.push(segment);
    }
    return out.join('');
  }
  return Array.from(name).slice(0, maxChars).join('');
}

export const DISPLAY_NAME_MAX_CHARS = 24;

export function decodeSaveFromSyncCode(
  code: string,
  nowEpochMs = Date.now()
): MouthLifeSaveV2 {
  const trimmed = code.trim();
  if (!trimmed.startsWith(SYNC_CODE_PREFIX)) {
    throw new Error('Invalid Sync Code prefix (expected ML2:).');
  }
  // Codes get line-wrapped by mail and chat apps, and some tools re-pad them: strip whitespace,
  // allow trailing '=' padding and the standard Base64 '+' '/' alphabet as well as Base64URL.
  const compact = trimmed.slice(SYNC_CODE_PREFIX.length).replace(/\s+/g, '');
  if (compact.length === 0 || compact.length > 65536 || !/^[A-Za-z0-9\-_+/]+=*$/.test(compact)) {
    throw new Error('Malformed Base64URL Sync Code payload.');
  }
  const body = compact.replace(/=+$/, '');
  if (body.length % 4 === 1) {
    throw new Error('Malformed Base64URL Sync Code payload.');
  }
  let stdB64 = body.replace(/-/g, '+').replace(/_/g, '/');
  while (stdB64.length % 4 !== 0) {
    stdB64 += '=';
  }
  const bin = atob(stdB64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  const jsonText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const parsed: unknown = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object' || !('schemaVersion' in parsed)) {
    throw new Error('Sync Code JSON is missing schemaVersion.');
  }
  const v = (parsed as { schemaVersion?: unknown }).schemaVersion;
  if (v !== 1 && v !== 2) {
    throw new Error('Unsupported Sync Code schemaVersion.');
  }
  return migrateSave(parsed, nowEpochMs);
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class SaveSystem {
  private memoryStore = new Map<string, string>();
  private currentSave: MouthLifeSaveV2;

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

  load(nowEpochMs = Date.now()): MouthLifeSaveV2 {
    try {
      const rawText = this.getStorage().getItem(SAVE_STORAGE_KEY);
      if (!rawText) {
        this.currentSave = createDefaultSave(nowEpochMs);
        this.persistInternal(nowEpochMs);
        return this.currentSave;
      }
      const parsed: unknown = JSON.parse(rawText);
      this.currentSave = migrateSave(parsed, nowEpochMs);
      this.checkThresholdAutoUnlocks();
      return this.currentSave;
    } catch {
      this.currentSave = createDefaultSave(nowEpochMs);
      return this.currentSave;
    }
  }

  getSave(): MouthLifeSaveV2 {
    return this.currentSave;
  }

  save(mutatedSave = this.currentSave, nowEpochMs = Date.now()): MouthLifeSaveV2 {
    // Enforce monotonic totalBrushStamps invariant
    mutatedSave.totalBrushStamps = Math.max(
      this.currentSave.totalBrushStamps,
      Math.floor(mutatedSave.totalBrushStamps)
    );
    mutatedSave.saveRevision = Math.max(this.currentSave.saveRevision, mutatedSave.saveRevision) + 1;
    mutatedSave.lastSavedEpochMs = nowEpochMs;
    this.currentSave = mutatedSave;

    this.checkThresholdAutoUnlocks();
    this.persistInternal(nowEpochMs);
    this.bus.emit('save:updated', { save: this.currentSave });
    return this.currentSave;
  }

  /**
   * Resets local progress to a brand-new Day-1 save (for beta testing or fresh-start requests).
   */
  resetToFreshSave(nowEpochMs = Date.now()): MouthLifeSaveV2 {
    this.currentSave = createDefaultSave(nowEpochMs);
    this.persistInternal(nowEpochMs);
    this.bus.emit('save:updated', { save: this.currentSave });
    return this.currentSave;
  }

  private persistInternal(nowEpochMs: number): void {
    this.currentSave.lastSavedEpochMs = nowEpochMs;
    const serialized = JSON.stringify(this.currentSave);
    this.memoryStore.set(SAVE_STORAGE_KEY, serialized);
    try {
      this.getStorage().setItem(SAVE_STORAGE_KEY, serialized);
    } catch {
      // Fallback already retained in memoryStore
    }
  }

  reconcileExternalStorageEvent(rawJson: string | null, nowEpochMs = Date.now()): boolean {
    if (!rawJson) return false;
    try {
      const incoming = migrateSave(JSON.parse(rawJson), nowEpochMs);
      if (incoming.saveRevision > this.currentSave.saveRevision) {
        incoming.totalBrushStamps = Math.max(
          incoming.totalBrushStamps,
          this.currentSave.totalBrushStamps
        );
        this.currentSave = incoming;
        this.checkThresholdAutoUnlocks();
        this.bus.emit('save:updated', { save: this.currentSave });
        return true;
      }
    } catch {
      // Ignore malformed external writes
    }
    return false;
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

  importSyncCode(code: string, nowEpochMs = Date.now()): MouthLifeSaveV2 {
    const imported = decodeSaveFromSyncCode(code, nowEpochMs);
    // Preserve monotonic stamps across merges if player imports on existing device
    imported.totalBrushStamps = Math.max(
      imported.totalBrushStamps,
      this.currentSave.totalBrushStamps
    );
    CompanionArchSim.reconcileOfflineElapsed(imported.companion, nowEpochMs);
    imported.saveRevision = Math.max(this.currentSave.saveRevision, imported.saveRevision) + 1;
    this.currentSave = imported;
    this.checkThresholdAutoUnlocks();
    this.persistInternal(nowEpochMs);
    this.bus.emit('save:updated', { save: this.currentSave });
    return this.currentSave;
  }
}
