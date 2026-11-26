/**
 * Brush-Along camera choreography:
 * - Quadrant Zoom-Out -> Zoom-In establishing beat: whenever a new quadrant begins (surface 0),
 *   the camera briefly pulls out to a full-mouth view showing BOTH jaws so the player sees where
 *   the newly highlighted quadrant sits, then smoothly glides in close onto the active molars.
 * - Detailed iOS-parity cutaway angles: Outer (45° cheek framing with dimmed opposite jaw),
 *   Chewing (steep overhead/underneath cutaway into biting fissures, opposite jaw hidden),
 *   Inner (cross-arch cutaway behind lingual/palatal walls, opposite jaw hidden),
 *   Floss (oblique contact-by-contact closeup with gentle arch establish), and
 *   Mouthwash Rinse (both jaws open together).
 * - Under Reduce Motion: calm steady framing — gentle slide toward active side, never orbiting,
 *   tilting, or zooming dramatically.
 */
import type { PacerVisualState } from './PacerPropRig';

export interface BrushCameraAim {
  /** Orbit around the mouth in radians; positive swings toward screen-right (patient's right). */
  yaw: number;
  /** Extra downward tilt added to the base pitch, in radians. */
  pitchAdd: number;
  /** -1 screen-left to 1 screen-right: which side the look point slides toward. */
  side: number;
  /** 1 upper arch, -1 lower arch, 0 the whole mouth. */
  lift: number;
  /** Multiplier on camera distance; below 1 moves closer. */
  dolly: number;
}

export const BRUSH_CAMERA_CENTER: Readonly<BrushCameraAim> = { yaw: 0, pitchAdd: 0, side: 0, lift: 0, dolly: 1 };

/** Share of the native swing used by the compact summary aim helper. */
const WEB_YAW_SHARE = 0.75;
const FRONT_PROGRESS = 0.4;
const FOCUS_DOLLY = 0.97;

type AimInput = Pick<PacerVisualState, 'stage' | 'quadrant' | 'surface' | 'flossIsUpper' | 'flossContactIndex'>;

export function brushCameraAim(state: AimInput | null, reducedMotion: boolean): BrushCameraAim {
  const aim = rawAim(state);
  // Reduced motion: keep the gentle slide toward the active teeth, but no orbiting or tilting.
  return reducedMotion ? { ...aim, yaw: 0, pitchAdd: 0, dolly: 1 } : aim;
}

function rawAim(state: AimInput | null): BrushCameraAim {
  if (!state) return { ...BRUSH_CAMERA_CENTER };
  if (state.stage === 'flossBonus') {
    // Contacts count 0..12 from the patient's right (screen-right in the mirror).
    const side = Math.max(-1, Math.min(1, 1 - state.flossContactIndex / 6));
    return { yaw: side * 0.42, pitchAdd: 0.06, side, lift: state.flossIsUpper ? 1 : -1, dolly: FOCUS_DOLLY };
  }
  if (state.stage !== 'brushing' || state.quadrant < 0) return { ...BRUSH_CAMERA_CENTER };

  const side = state.quadrant === 0 || state.quadrant === 3 ? 1 : -1;
  const lift = state.quadrant <= 1 ? 1 : -1;
  const fp = FRONT_PROGRESS;
  let yaw: number;
  let pitchAdd: number;
  if (state.surface === 0) {
    // Outside: swing toward the cheek of the active side.
    yaw = side * (0.78 - 0.48 * fp);
    pitchAdd = -0.04;
  } else if (state.surface === 1) {
    // Chewing tops: a smaller swing and a steeper look down into the grooves.
    yaw = side * (0.36 - 0.2 * fp);
    pitchAdd = 0.13;
  } else {
    // Inside: swing to the far side and look back across the tongue at the inner wall.
    yaw = -side * (0.48 - 0.34 * fp);
    pitchAdd = 0.07;
  }
  return { yaw: yaw * WEB_YAW_SHARE, pitchAdd, side, lift, dolly: FOCUS_DOLLY };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Quadrant establishing zoom-out -> zoom-in envelope (1 = wide whole-mouth overview, 0 = close-up).
 * Fires at the start of every brushing quadrant (surface 0): holds wide briefly so the player sees
 * the newly highlighted quadrant across both jaws, then smoothly glides into the close-up view.
 */
export function quadrantIntroZoom01(
  surface: number,
  phaseElapsedSec: number | undefined,
  reducedMotion: boolean
): number {
  if (reducedMotion || surface !== 0 || phaseElapsedSec === undefined) return 0;
  if (phaseElapsedSec <= 1.05) return 1;
  if (phaseElapsedSec >= 2.75) return 0;
  return 1 - smoothstep(1.05, 2.75, phaseElapsedSec);
}

/**
 * Brief arch-switch establish zoom-out -> zoom-in when starting Upper Floss or switching to Lower Floss.
 */
export function flossArchIntroZoom01(
  phaseElapsedSec: number | undefined,
  reducedMotion: boolean
): number {
  if (reducedMotion || phaseElapsedSec === undefined) return 0;
  if (phaseElapsedSec <= 0.55) return 1;
  if (phaseElapsedSec >= 1.75) return 0;
  return 1 - smoothstep(0.55, 1.75, phaseElapsedSec);
}

export interface DetailedBrushCameraTarget {
  /** Signed yaw around the active focus in radians (+ = screen-right / patient's right). */
  yaw: number;
  /** Signed pitch in radians (negative looks UP at the upper arch; positive looks DOWN at lower arch). */
  pitch: number;
  /** Portrait camera distance from focus. */
  distPortrait: number;
  /** Landscape camera distance from focus (slightly roomier than native's tightest crop). */
  distLandscape: number;
  /** 1 during quadrant/arch zoom-out overview, 0 during close-up tracking. */
  introBlend01: number;
  /** 0 at back molar -> 1 at front incisor along the active quadrant. */
  frontProgress01: number;
  /** Active jaw for arch-midpoint calculation. */
  isUpper: boolean;
  /** 0..1 blend between arch-midpoint (0) and live brush/floss contact point (1) in close-up. */
  focusBiasToContact: number;
  /** Arch-local overview look offset when zoomed out (or rinsing). */
  overviewOffsetX: number;
  overviewOffsetY: number;
  overviewOffsetZ: number;
  /** Lower jaw visibility, local Y/Z offset and brightness dimming (1 = full, ~0.38 = ghost context). */
  showLowerJaw: boolean;
  lowerJawOffsetY: number;
  lowerJawOffsetZ: number;
  lowerJawDim: number;
  /** Upper jaw visibility, local Y/Z offset and brightness dimming. */
  showUpperJaw: boolean;
  upperJawOffsetY: number;
  upperJawOffsetZ: number;
  upperJawDim: number;
}

export interface DetailedCameraOptions {
  /** Optional live tooth-outward XZ normal (for floss oblique framing). */
  outwardX?: number;
  outwardZ?: number;
  /** Guaranteed vertical jaw separation that clears the central incisors cleanly. */
  incisorClearanceY?: number;
}

/**
 * Computes full iOS-parity 3D cutaway camera & jaw choreography for Brush-Along, including the
 * quadrant zoom-out -> zoom-in establish beat and roomier landscape framing.
 */
export function computeDetailedBrushCamera(
  state: PacerVisualState | null,
  nowSec: number,
  reducedMotion: boolean,
  opts: DetailedCameraOptions = {}
): DetailedBrushCameraTarget {
  const clearY = Math.max(3.8, opts.incisorClearanceY ?? 4.0);

  // Idle / waiting card or Mouthwash Rinse: frame BOTH open crystal-clean jaws together.
  if (!state || state.stage === 'mouthwashBonus') {
    const isRinse = state?.stage === 'mouthwashBonus';
    const camYaw = reducedMotion || !isRinse ? 0 : Math.sin(nowSec * 0.52) * 0.16;
    return {
      yaw: camYaw,
      pitch: isRinse ? 0.04 : 0.12,
      distPortrait: isRinse ? 23.4 : 26.5,
      distLandscape: isRinse ? 16.8 : 19.5,
      introBlend01: 1,
      frontProgress01: 0,
      isUpper: false,
      focusBiasToContact: 0,
      overviewOffsetX: 0,
      overviewOffsetY: 1.65,
      overviewOffsetZ: 0.9,
      showLowerJaw: true,
      lowerJawOffsetY: -clearY * 0.48,
      lowerJawOffsetZ: 0,
      lowerJawDim: 1,
      showUpperJaw: true,
      upperJawOffsetY: clearY * 0.52,
      upperJawOffsetZ: 0,
      upperJawDim: 1,
    };
  }

  // Floss Bonus: follow each contact 0..12 right-to-left on the active arch at ~24° oblique angle,
  // with a brief zoom-out -> zoom-in beat when starting Upper Floss or switching to Lower Floss.
  if (state.stage === 'flossBonus') {
    const isUpper = state.flossIsUpper;
    const cIdx = 12 - clamp(Math.round(state.flossContactIndex), 0, 12);
    const side = clamp(1 - state.flossContactIndex / 6, -1, 1);
    const intro = flossArchIntroZoom01(state.phaseElapsedSec, reducedMotion);

    let closeYaw = side * 0.42;
    if (opts.outwardX !== undefined && opts.outwardZ !== undefined) {
      const baseYaw = Math.atan2(opts.outwardX, opts.outwardZ);
      if (cIdx >= 7) closeYaw = clamp(baseYaw - 0.42, -0.85, 0.92);
      else if (cIdx === 6) closeYaw = 0.38;
      else closeYaw = clamp(baseYaw + 0.42, -0.92, 0.85);
    }
    const closePitch = isUpper ? -0.26 : 0.3;
    const wideYaw = side * 0.18;
    const widePitch = isUpper ? -0.06 : 0.1;

    const showOpposite = intro > 0.04;
    const oppDim = showOpposite ? lerp(0.18, 0.72, intro) : 0;
    const oppOffsetY = isUpper ? -clearY : clearY;

    return {
      yaw: reducedMotion ? 0 : lerp(closeYaw, wideYaw, intro),
      pitch: reducedMotion ? (isUpper ? -0.14 : 0.18) : lerp(closePitch, widePitch, intro),
      distPortrait: reducedMotion ? 22.0 : lerp(19.6, 28.0, intro),
      distLandscape: reducedMotion ? 16.0 : lerp(14.8, 21.0, intro),
      introBlend01: intro,
      frontProgress01: 1 - Math.abs(side),
      isUpper,
      focusBiasToContact: reducedMotion ? 0.28 : 0.68,
      overviewOffsetX: side * 1.1,
      overviewOffsetY: isUpper ? 1.8 : 1.4,
      overviewOffsetZ: 0.9,
      showLowerJaw: !isUpper || showOpposite,
      lowerJawOffsetY: !isUpper ? 0 : oppOffsetY,
      lowerJawOffsetZ: !isUpper ? 0 : -0.6,
      lowerJawDim: !isUpper ? 1 : oppDim,
      showUpperJaw: isUpper || showOpposite,
      upperJawOffsetY: isUpper ? 0 : oppOffsetY,
      upperJawOffsetZ: isUpper ? 0 : -0.6,
      upperJawDim: isUpper ? 1 : oppDim,
    };
  }

  // Standard 2-Minute Brushing (4 Quadrants x 3 Surfaces)
  const qIdx = clamp(state.quadrant, 0, 3);
  const isUpper = qIdx <= 1;
  const isRightSide = qIdx === 0 || qIdx === 3;
  const side = isRightSide ? 1 : -1;
  const sIdx = clamp(state.surface, 0, 2);

  // Tooth-by-tooth sweep progress within the 10s surface phase (chewing sweeps front -> back).
  const dur = Math.max(1, state.phaseDurationSec ?? 10);
  const sFrac = state.phaseElapsedSec !== undefined ? clamp(state.phaseElapsedSec / dur, 0, 0.999) : FRONT_PROGRESS;
  const frontProg = sIdx === 1 ? 1 - sFrac : sFrac;

  let closeYaw: number;
  let closePitch: number;
  let closeDistP: number;
  let closeDistL: number;
  if (sIdx === 0) {
    // OUTER: cheek-side framing (45° Bass angle), slightly roomier than Mac's tightest crop.
    closeYaw = side * (0.78 - 0.48 * frontProg);
    closePitch = isUpper ? -0.15 : 0.22;
    closeDistP = 20.4;
    closeDistL = 15.2;
  } else if (sIdx === 1) {
    // CHEWING: steep overhead/underneath cutaway straight into biting fissures!
    closeYaw = side * (0.36 - 0.2 * frontProg);
    closePitch = isUpper ? -0.72 : 0.76;
    closeDistP = 19.6;
    closeDistL = 14.6;
  } else {
    // INNER: cross-arch cutaway revealing lingual/palatal wall & vertical heel-to-toe front brush!
    closeYaw = -side * (0.48 - 0.34 * frontProg);
    closePitch = isUpper ? -0.58 : 0.62;
    closeDistP = 20.0;
    closeDistL = 15.0;
  }

  // Quadrant Zoom-Out -> Zoom-In establishing beat at the start of every quadrant (surface 0).
  const intro = quadrantIntroZoom01(sIdx, state.phaseElapsedSec, reducedMotion);
  const wideYaw = side * 0.22;
  const widePitch = isUpper ? -0.04 : 0.08;
  const wideDistP = 31.2;
  const wideDistL = 23.2;

  // Opposite jaw choreography:
  // - Outer (sIdx === 0): opposite jaw hinged open for instant Top vs. Bottom context (bright
  //   during the full-mouth quadrant zoom-out, then softly dimmed to 0.38 as we zoom in close!).
  // - Chewing & Inner (sIdx === 1 | 2): opposite jaw hidden so steep cutaway angles stay clear!
  const showOpposite = sIdx === 0;
  const oppDim = showOpposite ? lerp(0.38, 0.86, intro) : 0;
  const oppOffsetY = isUpper ? -clearY : clearY;
  const oppOffsetZ = lerp(-0.7, -0.45, intro);

  if (reducedMotion) {
    return {
      yaw: 0,
      pitch: isUpper ? -0.1 : 0.2,
      distPortrait: 22.8,
      distLandscape: 16.8,
      introBlend01: 0,
      frontProgress01: frontProg,
      isUpper,
      focusBiasToContact: 0.25,
      overviewOffsetX: side * 1.4,
      overviewOffsetY: isUpper ? 1.9 : 1.3,
      overviewOffsetZ: 0.9,
      showLowerJaw: !isUpper || showOpposite,
      lowerJawOffsetY: !isUpper ? 0 : oppOffsetY,
      lowerJawOffsetZ: !isUpper ? 0 : oppOffsetZ,
      lowerJawDim: !isUpper ? 1 : 0.38,
      showUpperJaw: isUpper || showOpposite,
      upperJawOffsetY: isUpper ? 0 : oppOffsetY,
      upperJawOffsetZ: isUpper ? 0 : oppOffsetZ,
      upperJawDim: isUpper ? 1 : 0.38,
    };
  }

  // Overview look sits cleanly between the active jaw (y~1.6) and the parted opposite jaw.
  const overviewY = isUpper ? 0.25 : 3.05;
  return {
    yaw: lerp(closeYaw, wideYaw, intro),
    pitch: lerp(closePitch, widePitch, intro),
    distPortrait: lerp(closeDistP, wideDistP, intro),
    distLandscape: lerp(closeDistL, wideDistL, intro),
    introBlend01: intro,
    frontProgress01: frontProg,
    isUpper,
    focusBiasToContact: 0.62,
    overviewOffsetX: side * 1.35,
    overviewOffsetY: overviewY,
    overviewOffsetZ: 0.8,
    showLowerJaw: !isUpper || showOpposite,
    lowerJawOffsetY: !isUpper ? 0 : oppOffsetY,
    lowerJawOffsetZ: !isUpper ? 0 : oppOffsetZ,
    lowerJawDim: !isUpper ? 1 : oppDim,
    showUpperJaw: isUpper || showOpposite,
    upperJawOffsetY: isUpper ? 0 : oppOffsetY,
    upperJawOffsetZ: isUpper ? 0 : oppOffsetZ,
    upperJawDim: isUpper ? 1 : oppDim,
  };
}
