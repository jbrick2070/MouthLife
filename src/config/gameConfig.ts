import type { QualityTier } from '../engine/types';

// Spatial & Surface Grid Constants
export const CELL_SIZE = 0.25;
export const CLEAN_THRESHOLD = 0.10;
export const RINSE_SLURRY_THRESHOLD = 0.35;
export const PROBE_RADIUS = 0.65; // Diameter 1.30u > narrow < 1.20u interdental alleys
export const PROBE_MOVE_SPEED = 9.2;
export const PROBE_SWEEP_SPEED_THRESHOLD = 1.5;

// Biophysical Chemistry Constants
export const NEUTRAL_SALIVA_PH = 7.0;
export const CRITICAL_PH_HYDROXYAPATITE = 5.5;
export const CRITICAL_PH_FLUORAPATITE = 4.5;
export const STEPHAN_DROP_PH = 4.8;
export const STEPHAN_RECOVERY_SEC = 20.0;
export const SALIVA_SPRING_RADIUS = 5.0;
export const SALIVA_SPRING_PH_BOOST = 7.15;
export const STEPHAN_SPRING_BUFFER_SEC = 7.0; // Salivary bicarbonate spring shortens the acid clock
export const STEPHAN_DEFAULT_SIP_INTERVAL_SEC = 24.0;

// 1819 Parmly / 1948 Bass Gingival Sulcus Care (World 2)
export const SULCUS_STATIONARY_IRRITATION_PER_SEC = 0.95;
export const SULCUS_MOVING_IRRITATION_MULT = 0.12; // gentle moving sweeps barely irritate
export const SULCUS_BASS_IRRITATION_MULT = 0.65;
export const SULCUS_HYDROSONIC_IRRITATION_MULT = 0.5; // "Reduces sulcus pressure buildup by 50%"
export const GUM_TENDER_THRESHOLD = 0.72;
export const SALIVA_SPRING_GUM_SOOTHE = 0.6;

// Ancient Miswak & 1901–1945 Fluorapatite Conversion (World 4)
export const HIBISCUS_EROSION_PH = 4.95; // < 5.5 Hydroxyapatite, > 4.5 Fluorapatite!
export const HIBISCUS_DEFAULT_PULSE_SEC = 14.0;
export const MISWAK_INFUSION_DURATION_SEC = 9.0;
export const MISWAK_SPRING_CONVERT_RADIUS = 4.6;

// 1973 Skylab & 1978 Costerton Quorum-Sensing EPS Biofilm Domes (World 5)
export const EPS_FLOSS_CRACK_HALF_WIDTH = 2.25; // Floss quorum-fracture shockwave through EPS matrix
export const EPS_CRACKED_SLURRY_CAP = 0.52;
export const EPS_RINSE_BIOFILM_CHIP = 0.28;
export const SURGE_PER_EPS_CELL_CRACKED = 0.08;

// Sonic Bristle Actuator
export const BRUSH_BASE_RADIUS = 1.75;
export const BRUSH_HYDROSONIC_RADIUS_MULT = 1.16; // +16% acoustic micro-bubble reach beyond filament tips
export const BRUSH_OVERDRIVE_RADIUS_MULT = 1.25;
export const BRUSH_BASE_ARC_RAD = (95 * Math.PI) / 180;
export const BRUSH_HYDROSONIC_ARC_RAD = (115 * Math.PI) / 180;
export const BRUSH_BASS_ARC_RAD = (130 * Math.PI) / 180;
export const BRUSH_MOVING_RATE = 2.65;
export const BRUSH_STATIONARY_RATE = 0.85;
export const MARGIN_BASE_PENALTY = 0.65;
export const HYDROSONIC_MARGIN_BOOST = 1.30; // +30% acoustic fluid shear in fissures/margins
export const BASS_UPGRADE_MARGIN_BOOST = 1.45; // 0.65 * 1.45 = 0.9425x
export const FLUORIDE_SEAL_RESOIL_MULT = 0.40;

// Polymer Floss Actuator & Capillary Tether-Zip
export const FLOSS_LENGTH = 4.0;
export const FLOSS_BASE_HALF_WIDTH = 0.16;
export const FLOSS_PTFE_HALF_WIDTH = 0.24;
export const FLOSS_COOLDOWN_SEC = 0.32;
export const FLOSS_ZIP_ENTRY_DIST = 1.65;
export const FLOSS_ZIP_MAX_ANGLE_RAD = (24 * Math.PI) / 180;
export const FLOSS_ZIP_DURATION_SEC = 0.22;
// Forgiving assist: a tap/double-tap near an alley mouth snaps to the alley even with a loose aim
export const FLOSS_ZIP_ASSIST_ANGLE_RAD = (62 * Math.PI) / 180;
export const FLOSS_ZIP_ASSIST_ENTRY_DIST = 2.2;
export const ZIP_PROMPT_RADIUS = 2.9; // contextual "Press E / Right-Click / Tap Floss to Zip!" prompt

// Fluoride-Bicarb Ion Rinse & Disclosing Scan
export const RINSE_WAVE_RADIUS = 9.2;
export const RINSE_WAVE_DURATION_SEC = 1.0;
export const RINSE_THICK_BIOFILM_CHIP = 0.04;
export const DISCLOSE_WAVE_RADIUS = 19.0;
export const DISCLOSE_DURATION_SEC = 3.8;
export const DISCLOSE_COOLDOWN_SEC = 5.5;

// Surge Meter Economy (0..100)
export const SURGE_MAX = 100;
export const SURGE_PER_CLEANED_CELL = 0.12;
export const SURGE_PER_FLOSS_TARGET = 15;
export const PTFE_SURGE_MULTIPLIER = 1.25;
export const SURGE_PER_SITE_RESTORED = 30;
export const SURGE_PER_BEACON = 50;

// District & Site Thresholds
export const SITE_RESTORE_RADIUS = 2.0;
export const SITE_RESTORE_CLEAN_RATIO = 0.85;
export const DISTRICT_SEAL_CLEAN_RATIO = 0.90;
export const PULP_RESCUE_DURATION_SEC = 90;
export const PULP_RESCUE_WIN_CLEAN_RATIO = 0.85;

// Ecology & Mutans Constants
export const SUCROSE_SPAWN_INTERVAL_SEC = 5.5;
export const MAX_MUTANS_PER_CRYSTAL = 3;
export const MAX_MUTANS_GLOBAL = 12;
export const MUTANS_MOVE_SPEED = 2.8;
export const MUTANS_TRAIL_RADIUS = 0.75;
export const MUTANS_DEPOSIT_RATE = 0.11;
export const MUTANS_STUN_SEC = 3.0;
export const ACID_POOL_RADIUS = 1.25;
export const ACID_POOL_LIFETIME_SEC = 6.0;
export const ACID_POOL_SLOW_MULT = 0.70;
export const PROBE_KNOCKBACK_SEC = 0.25;

// Companion Smooth Bask & Saliva Stasis Constants
export const SMOOTH_BASK_THRESHOLD = 85;
export const STASIS_FLOOR_SMOOTHNESS = 45;
export const OFFLINE_BASK_SLOPE_PER_HR = 1.25; // 100 -> 85 over 12.0 hours
export const OFFLINE_SETTLE_SLOPE_PER_HR = 6.67; // 85 -> 45 over hours 12..18
export const IDLE_IONS_PER_BASK_HR = 6;
export const IDLE_ION_RESERVOIR_CAP = 72; // 12h * 6 Ions/hr
export const TREAT_SMOOTHNESS_DROP = 35;
export const TREAT_ACID_THRESHOLD_SMOOTHNESS = 50;
export const TREAT_ACID_LOAD_POINTS = 45;
// Brushing is the main way to earn Fluoride Ions. Everything else pays a small fraction of one brush.
export const TREAT_ION_REWARD = 5;
export const TREAT_MAX_REWARDED_PER_HOUR = 3;
export const PULP_RESCUE_WIN_IONS = 20;
export const PULP_RESCUE_STABILIZE_VALUE = 50;

// Habit Bank & Pacer Constants
export const BRUSH_ALONG_TOTAL_SEC = 120;
export const BRUSH_ALONG_FLOSS_BONUS_SEC = 45;
export const BRUSH_ALONG_MOUTHWASH_BONUS_SEC = 60;
export const BRUSH_ALONG_MOUTHWASH_QUICK_SEC = 30;
export const DAILY_FULL_REWARD_CAP = 2;
export const DAILY_COURTESY_TIP_CAP = 3;
export const BRUSH_ALONG_FULL_IONS = 50;
/** Brushing alone pays the base. One extra step (floss or rinse) pays x1.5, both pay x2. */
export const BRUSH_ALONG_ONE_EXTRA_MULT = 1.5;
export const BRUSH_ALONG_BOTH_EXTRAS_MULT = 2;
/** A dive pays between these, scaled by score: at most half of a plain brush. */
export const DIVE_MIN_IONS = 5;
export const DIVE_MAX_IONS = 25;
export const BRUSH_ALONG_FLOSS_IONS = 25;
export const BRUSH_ALONG_MOUTHWASH_IONS = 25;
export const BRUSH_ALONG_TIP_IONS = 5;
export const MAX_SUPPLY_BEACONS = 4;
export const MAX_OVERDRIVE_RUNS = 4;

// 4-Pillar Scoring Constants
export const SCORE_MAX_RESTORATION = 5000;
export const SCORE_MAX_TECHNIQUE = 2500;
export const SCORE_MAX_ECOLOGY = 1500;
export const SCORE_MAX_PARTIME = 1000;
export const SCORE_MIN_PARTIME_FLOOR = 250;
export const SYNERGY_MIN = 1.0;
export const SYNERGY_MAX = 3.0;
export const SYNERGY_STEP = 0.25;
export const SYNERGY_IDLE_DECAY_DELAY_SEC = 4.0;
export const SYNERGY_DECAY_PER_SEC = 0.15;

// Hitch-Free 3-Tier GPU Quality Governor Constants
export const MAX_PARTICLES_ULTRA = 400;
export const QUALITY_TIER_SPECS: Record<
  QualityTier,
  { maxDpr: number; renderScale: number; particleCap: number }
> = {
  low: { maxDpr: 1.0, renderScale: 0.9, particleCap: 60 },
  medium: { maxDpr: 1.5, renderScale: 1.0, particleCap: 180 },
  ultra: { maxDpr: 2.0, renderScale: 1.0, particleCap: 400 },
};
export const FPS_DOWNGRADE_THRESHOLD = 42;
export const FPS_UPGRADE_THRESHOLD = 57;
export const QUALITY_GOVERNOR_COOLDOWN_SEC = 5.0;
export const QUALITY_ROLLING_FRAMES = 90;

//Bounded Powers-of-Ten Camera Rig Constants
export const CAMERA_NEAR = 0.5;
export const CAMERA_FAR = 320.0;
export const CAMERA_BASE_FOV_DEG = 46;
export const EARTH_BACKDROP_POS = { x: 32, y: 110, z: 16 };
export const EARTH_BACKDROP_RADIUS = 18;
export const ZOOM_TRANSITION_SEC = 1.35;
