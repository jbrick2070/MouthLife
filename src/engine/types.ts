export type AppMode =
  | 'COSMIC_INTRO'
  | 'HUB'
  | 'ARCADE'
  | 'PULP_RESCUE'
  | 'BRUSH_ALONG'
  | 'REPORT';

export type QualityTier = 'low' | 'medium' | 'ultra';
export type BChannelMode = 'marginDensity' | 'gumIrritation' | 'localPh' | 'epsArmor';
export type ActuatorKind = 'brush' | 'floss' | 'rinse';
export type MasteryGrade = 'NONE' | 'C' | 'B' | 'A' | 'S' | 'FLUORAPATITE_GOLD';

export interface Vec2 {
  x: number;
  z: number;
}

export interface AABB2D {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface Capsule2D {
  a: Vec2;
  b: Vec2;
  radius: number;
  initialDensity: number;
}

export interface HillDef {
  cx: number;
  cz: number;
  radius: number;
  height: number;
}

export const enum CellFlag {
  NONE = 0,
  PAINTABLE = 1 << 0,
  INTERDENTAL = 1 << 1,
  FLUORIDE_SEALED = 1 << 2,
  MARGIN_FISSURE = 1 << 3,
  SULCUS = 1 << 4,
  EPS_ARMOR = 1 << 5,
}

export interface InterdentalAlleyDef {
  id: string;
  endpointA: Vec2;
  endpointB: Vec2;
  width: number;
  wallThickness: number;
  bridgeId: string | null;
}

export interface BridgeDef {
  id: string;
  a: Vec2;
  b: Vec2;
  intact: boolean;
}

export interface DistrictDef {
  id: string;
  name: string;
  subtitle: string;
  bounds: AABB2D;
}

export interface WorldVisualPalette {
  enamelBaseHex: number;
  pellicleSlimeHex: number;
  matureBiofilmHex: number;
  gingivaHex: number;
  skyTopHex: number;
  skyHorizonHex: number;
}

export interface CommensalSpawnDef {
  id: string;
  pos: Vec2;
  districtIdx: number;
}

export interface SucroseSpawnDef {
  id: string;
  pos: Vec2;
  districtIdx: number;
}

export interface WorldCartridge {
  id: string;
  title: string;
  subtitle: string;
  hostId: string;
  historyNoteIds: string[];
  worldWidth: number;
  worldDepth: number;
  bChannelMode: BChannelMode;
  parTimeSec: number;
  basePellicleDensity: number;
  baselinePh: number;
  probeSpawn: Vec2;
  districts: DistrictDef[];
  playableMaskBoxes: AABB2D[];
  wallBoxes: AABB2D[];
  interdentalAlleys: InterdentalAlleyDef[];
  marginBands: Capsule2D[];
  heightCuspHills: HillDef[];
  commensalSiteSpawns: CommensalSpawnDef[];
  sucroseSpawns: SucroseSpawnDef[];
  biofilmBridges: BridgeDef[];
  salivaSprings: Vec2[];
  beaconDropSlots: Vec2[];
  palette: WorldVisualPalette;
  /**
   * Optional gingival sulcus margins (World 2 `gumIrritation`). Heavy-handed stationary scrubbing
   * here inflames tender gum tissue; gentle moving 45° Bass sweeps clean without irritation.
   */
  sulcusBands?: Capsule2D[];
  /**
   * Optional 1940 Stephan Curve acid clock (World 3 `localPh`). While any Sucrose Crystal is intact,
   * a sweet sip fires every N seconds, plunging plaque pH below 5.5 for the recovery window.
   */
  stephanSipIntervalSec?: number;
  /** Short HUD/Hub blurb describing this cartridge's signature biophysical challenge. */
  challengeBlurb?: string;
}

export interface BrushApplyParams {
  cx: number;
  cz: number;
  facingRad: number;
  arcRad: number;
  radius: number;
  removalPerSec: number;
  dt: number;
  hasBassUpgrade: boolean;
  /** Gum irritation added per second on SULCUS cells while scrubbing stationary (0 disables). */
  sulcusIrritationPerSec?: number;
  /** True when HYDRA-1 is sweeping above PROBE_SWEEP_SPEED_THRESHOLD (gentle Bass motion). */
  isMovingSweep?: boolean;
}

export interface ToolApplyResult {
  newlyCleanedCells: number;
  densityRemovedTotal: number;
  acidAbrasionWarnings: number;
  cellsSealed?: number;
  gumTenderWarnings?: number;
}

export interface ScoreBreakdown {
  restorationPts: number;
  techniquePts: number;
  ecologyPts: number;
  parTimePts: number;
  totalScore: number;
  grade: MasteryGrade;
  cleanlinessPct: number;
  sitesRestored: number;
  sitesTotal: number;
  elapsedSec: number;
  ionsEarned: number;
}

export interface CompanionState {
  smoothnessIndex: number;
  enamelShield: number;
  dentinShield: number;
  pulpIntegrity: number;
  unclaimedIdleIons: number;
  recentTreatTimestampsMs: number[];
  lastEvaluatedEpochMs: number;
}

export interface WorldRecord {
  unlocked: boolean;
  completed: boolean;
  timesCleared: number;
  bestScore: number;
  bestGrade: MasteryGrade;
  bestCleanlinessPct: number;
  sitesRestoredMax: number;
}

export interface PlayerHostProfile {
  displayName: string;
  skinToneIndex: number;
  homeCityId: string;
}

export interface MouthLifeSaveV2 {
  schemaVersion: 2;
  saveRevision: number;
  lastSavedEpochMs: number;
  hasSeenCosmicIntro: boolean;
  playerProfile: PlayerHostProfile;
  companion: CompanionState;
  totalBrushStamps: number;
  fluorideIons: number;
  dailySlotsByDate: Record<string, { fullRewards: number; tips: number }>;
  pendingSupplyBeacons: number;
  remineralizedOverdriveRuns: number;
  unlockedUpgrades: string[];
  equippedUpgrades: {
    brush: string | null;
    floss: string | null;
    rinse: string | null;
  };
  unlockedHistoryNotes: string[];
  qualityPreference: 'auto' | QualityTier;
  worlds: Record<string, WorldRecord>;
}

export interface UpgradeDef {
  id: string;
  slot: ActuatorKind;
  name: string;
  tagline: string;
  scientificNote: string;
  stampUnlockThreshold: number | null;
  worldClearUnlockId: string | null;
  ionCost: number;
}

export interface RegionalTreatDef {
  id: string;
  name: string;
  city: string;
  emoji: string;
  phDropNote: string;
}

export interface HostCityDef {
  id: string;
  worldId: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  isOrbital?: boolean;
  hostName: string;
  hostRole: string;
  hostSkinToneHex: string;
  hostAccentHex: string;
  unlockStampsRequired: number;
  playableInSlice: boolean;
  scenarioSummary: string;
  historyNoteId: string;
  signatureTreat: RegionalTreatDef;
}

export interface HistoricalFieldNote {
  id: string;
  yearLabel: string;
  locationLabel: string;
  title: string;
  scientistOrCulture: string;
  summary: string;
  enamelLesson: string;
}

export interface OverlayView {
  mount(root: HTMLElement): void;
  dispose(): void;
}

export interface ProbeZipState {
  from: Vec2;
  to: Vec2;
  elapsed: number;
  duration: number;
}

export interface MutansEntity {
  id: number;
  pos: Vec2;
  vel: Vec2;
  hopPhase: number;
  hp: number;
  stunRemaining: number;
  acidDropCooldown: number;
  parentSucroseId: string;
}

export interface AcidPoolEntity {
  id: number;
  pos: Vec2;
  radius: number;
  remainingSec: number;
}

export interface CommensalSiteEntity {
  id: string;
  pos: Vec2;
  districtIdx: number;
  restored: boolean;
  localCleanRatio: number;
}

export interface SucroseCrystalEntity {
  id: string;
  pos: Vec2;
  districtIdx: number;
  hp: number;
  intact: boolean;
  spawnTimer: number;
}

export interface RelayBeaconEntity {
  index: number;
  pos: Vec2;
  collected: boolean;
}

export interface AppEventMap {
  'mode:changed': { from: AppMode; to: AppMode };
  'actuator:scrub': {
    cleanRatio: number;
    newlyCleaned: number;
    surgeDelta: number;
    acidWarn: boolean;
  };
  'floss:sliced': {
    from: Vec2;
    to: Vec2;
    targetsHit: number;
    surgeDelta: number;
    zipped: boolean;
  };
  'rinse:surged': {
    origin: Vec2;
    cellsSealed: number;
  };
  'disclose:pulsed': {
    origin: Vec2;
    durationSec: number;
  };
  'site:restored': {
    siteId: string;
    pos: Vec2;
    districtIdx: number;
    surgeDelta: number;
  };
  'district:sealed': {
    districtIdx: number;
    districtName: string;
    worldCleanRatio: number;
  };
  'beacon:collected': {
    beaconIndex: number;
    pos: Vec2;
    surgeDelta: number;
  };
  'mission:complete': {
    mode: 'ARCADE' | 'PULP_RESCUE';
    worldId: string;
    won: boolean;
    breakdown: ScoreBreakdown;
    unlockedHistoryNoteId: string | null;
  };
  'upgrade:unlocked': {
    upgradeId: string;
    via: 'stamps' | 'world_clear' | 'ions';
    costPaid: number;
  };
  'companion:updated': {
    state: CompanionState;
  };
  'pacer:tick': {
    elapsedSec: number;
    quadrantIdx: number;
    surfaceIdx: number;
    inFlossBonus: boolean;
  };
  'pacer:complete': {
    withFlossBonus: boolean;
    ionsAwarded: number;
    stampAwarded: boolean;
  };
  'quality:changed': {
    tier: QualityTier;
    fps: number;
  };
  'sucrose:shattered': {
    crystalId: string;
    pos: Vec2;
    via: 'brush' | 'floss';
  };
  'gum:tender': {
    pos: Vec2;
    warnings: number;
  };
  'stephan:sip': {
    sipIndex: number;
    recoverySec: number;
  };
  'stephan:buffered': {
    pos: Vec2;
    remainingSec: number;
  };
  'webgl:restored': Record<string, never>;
  'save:updated': {
    save: MouthLifeSaveV2;
  };
}
