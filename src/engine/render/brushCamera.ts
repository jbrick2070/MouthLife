/**
 * The camera: Brush-Along moment by moment, and the numbers every other screen reads.
 *
 * Swift twin: `native-apple/Sources/MouthLifeCore/Render/BrushCamera.swift`. Same function names,
 * same numbers; a constant here is the same words in camelCase there (`FOLLOW_RATE_BRUSH` =
 * `followRateBrush`). The same test cases run on both sides (`tests/brushCamera.test.ts`,
 * `BrushCameraTests.swift`): change both files together, then run both suites. The native app is the
 * reference; the browser keeps only its own extras on top (see `SceneManager.ts`: the dive into a
 * city, the stage's shake, double-tap to recentre, the framing round its own panels, and the idle
 * frame below).
 *
 * Conventions (both editions). The camera orbits a look point:
 * `pos = look + dist * (sin(yaw) cos(pitch), sin(pitch), cos(yaw) cos(pitch))`. It sits on +Z looking
 * toward -Z, so +X is screen-right. Positive yaw puts the camera on the patient's right, which is
 * screen-right, as in a bathroom mirror (AGENTS.md 2.2): never flip it. Positive pitch looks down
 * from above (the lower arch), negative looks up from below (the upper arch). Radians, world units,
 * seconds; field of view in degrees. "Arch-local" points are measured from the arch's origin
 * (32, 0.4, 16); the upper arch is the lower one mirrored at `y = 3.2`.
 *
 * Pure functions on plain `{x, y, z}` values. The brush and floss pick themselves are posed by the
 * renderers; this file only supplies the point the camera follows on them (`brushContactLocal`,
 * `flossContactLocal`) so both editions follow the same point.
 */
import { CAMERA_BASE_FOV_DEG, EARTH_BACKDROP_POS } from '../../config/gameConfig';
import type { PacerStage } from '../../config/brushCoach';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A direction on the ground: (x, z). */
export interface VecXZ {
  x: number;
  z: number;
}

/** The slice of `evaluateBrushPhase` the camera reads. */
export interface BrushCameraPhase {
  stage: PacerStage;
  /** 0 upper-right, 1 upper-left, 2 lower-left, 3 lower-right (patient's sides). */
  quadrant: number;
  /** 0 outside, 1 chewing tops, 2 inside. */
  surface: number;
  phaseElapsedSec: number;
  phaseDurationSec: number;
  flossIsUpper: boolean;
  /** 0..12, counted from the patient's right. */
  flossContactIndex: number;
}

/**
 * One jaw in a Brush-Along view: shown or not, where it sits (arch-local) and how solid it is
 * (1 full, 0.38 a dimmed hint of the opposite jaw).
 */
export interface BrushCameraJaw {
  visible: boolean;
  offset: Vec3;
  opacity: number;
}

/** What the Brush-Along camera reads in one frame. */
export interface BrushCameraInput {
  /** Where the session is (`evaluateBrushPhase`). */
  phase: BrushCameraPhase;
  reducedMotion: boolean;
  /**
   * The camera's own clock (the rinse's slow sway runs on it). The caller holds it still while the
   * brush is paused or a Start card is up (`advanceCameraClock`), so the picture stands still.
   */
  clockSec: number;
  /**
   * The brush or floss contact the close-up follows, arch-local (`brushContactLocal`,
   * `flossContactLocal`); null when there is none (then the close-up looks at the arch's middle).
   */
  contactLocal: Vec3 | null;
  /** Floss: the two teeth's average outward direction at the gap. */
  flossOutwardXZ: VecXZ | null;
  /** Rinse: how far the phone is in a hand (`GyroSloshSnapshot.handheldBlend01`, 0 lying down). */
  rinseHandheld01: number;
  /** Rinse: where the swish is, -1 left cheek .. +1 right cheek (`GyroSloshSnapshot.sloshPosition`). */
  rinseSlosh: number;
}

/**
 * Where the Brush-Along camera wants to be. The renderer adds a finger's turn to `yaw` and `pitch`
 * (`BRUSH_PITCH_CLAMP` on the sum), picks the distance by `isPortrait`, places the camera with
 * `orbitPosition` round the arch origin + `lookLocal`, and follows at `followRate`.
 */
export interface BrushCameraTarget {
  yaw: number;
  pitch: number;
  distPortrait: number;
  distLandscape: number;
  /** The look point, arch-local. */
  lookLocal: Vec3;
  /** 1 while a quadrant or floss arch opens zoomed out on the whole mouth, 0 close up. */
  intro01: number;
  upperJaw: BrushCameraJaw;
  lowerJaw: BrushCameraJaw;
}

/** A camera's place and the point it looks at, in world space. */
export interface CameraPose {
  pos: Vec3;
  look: Vec3;
}

/**
 * The floss's motion through one gap (`flossGapMotion`): how deep it is in the gap (along the arch's
 * gum direction), which tooth wall it leans on (+1 the right-hand tooth, -1 the left) and its small
 * saw toward the cheek.
 */
export interface FlossGapMotion {
  depthIntoGap: number;
  leanSide: number;
  sawZ: number;
}

// ---------------------------------------------------------------- the picture (every screen)

/**
 * Narrower than this (width / height) is a portrait picture: a phone or an iPad upright. A
 * foldable's near-square inner screen (about 0.9) gets the landscape framing.
 */
export const PORTRAIT_ASPECT = 0.85;
/** Degrees of field of view added per unit of aspect below PORTRAIT_ASPECT ... */
export const PORTRAIT_FOV_GAIN_DEG = 46.0;
/** ... up to this. */
export const MAX_FOV_DEG = 64.5;

// ---------------------------------------------------------------- following

export const FOLLOW_RATE_BRUSH = 6.8;
/** Reduce Motion while brushing, flossing and rinsing: a slow, calm follow. */
export const FOLLOW_RATE_BRUSH_REDUCED_MOTION = 2.4;
/** Arrival, Home, a city stage and the score screen. */
export const FOLLOW_RATE_OTHER = 7.5;

// ---------------------------------------------------------------- a finger turning the view

/** Home and Brush-Along, per point (a CSS pixel on the web). */
export const DRAG_YAW_PER_POINT = -0.0055;
export const DRAG_PITCH_PER_POINT = 0.0035;
/** Brush-Along: how far a finger may turn the view from the guided angle. */
export const BRUSH_ORBIT_YAW_LIMIT = 0.85;
export const BRUSH_ORBIT_PITCH_LIMIT = 0.45;
/** Brush-Along: the guided pitch plus the finger's never goes past this either way. */
export const BRUSH_PITCH_CLAMP = 0.92;
/** Brush-Along: let go, the finger's turn eases back by `exp(-EASE_BACK_RATE * dt)` a frame. */
export const EASE_BACK_RATE = 2.2;

// ---------------------------------------------------------------- Home (the companion arch)

export const HUB_CENTER: Readonly<Vec3> = Object.freeze({ x: 32.0, y: 1.4, z: 15.6 });
export const HUB_DIST_PORTRAIT = 36.5;
export const HUB_DIST_LANDSCAPE = 22.0;
/** The look point sits this far above the orbit centre (portrait / landscape) and 1 behind it. */
export const HUB_LOOK_LIFT_PORTRAIT = 1.8;
export const HUB_LOOK_LIFT_LANDSCAPE = 0.9;
export const HUB_LOOK_BACK = -1.0;
export const HUB_REST_YAW = 0.0;
export const HUB_REST_PITCH = 0.34;
export const HUB_YAW_LIMIT = 0.85;
export const HUB_PITCH_MIN = 0.18;
export const HUB_PITCH_MAX = 0.82;
/** The phone's tilt in a hand (parallax -1..1) turns Home a little (the native app; the web has none). */
export const HUB_GYRO_YAW_GAIN = 0.085;
export const HUB_GYRO_PITCH_GAIN = 0.048;
export const HUB_GYRO_PITCH_MIN = 0.08;
export const HUB_GYRO_PITCH_MAX = 0.88;

// ---------------------------------------------------------------- arrival

export const ARRIVAL_YAW_LIMIT = 0.75;
export const ARRIVAL_DRAG_YAW_PER_POINT = -0.005;
/** The crystal showcase floats this far above the Earth. */
export const ARRIVAL_SHOWCASE_LIFT = 38.0;
export const ARRIVAL_GYRO_YAW_GAIN = 0.085;
export const ARRIVAL_GYRO_LIFT_GAIN = 0.85;

// ---------------------------------------------------------------- a city stage: from the south, never turns

export const STAGE_HEIGHT_PORTRAIT = 24.0;
export const STAGE_BACK_PORTRAIT = 16.0;
export const STAGE_HEIGHT_LANDSCAPE = 18.0;
export const STAGE_BACK_LANDSCAPE = 12.2;
export const STAGE_LOOK_Y = 0.6;
export const STAGE_LOOK_AHEAD = -1.0;

// ---------------------------------------------------------------- the score screen: circles the city stage

export const REPORT_RADIUS = 22.0;
export const REPORT_HEIGHT = 24.0;
export const REPORT_LOOK_Y = 0.5;
export const REPORT_TURN_RATE = 0.22;
/** Reduce Motion: the score screen holds this angle instead of circling. */
export const REPORT_REDUCED_MOTION_YAW = 0.2;

// ---------------------------------------------------------------- small helpers

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t) };
}

function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

// ---------------------------------------------------------------- the picture

export function isPortrait(aspect: number): boolean {
  return aspect < PORTRAIT_ASPECT;
}

export function fovDeg(aspect: number): number {
  return Math.min(MAX_FOV_DEG, CAMERA_BASE_FOV_DEG + Math.max(0, PORTRAIT_ASPECT - aspect) * PORTRAIT_FOV_GAIN_DEG);
}

/** The camera's place on its orbit round `look`. */
export function orbitPosition(look: Vec3, yaw: number, pitch: number, dist: number): Vec3 {
  return {
    x: look.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    y: look.y + Math.sin(pitch) * dist,
    z: look.z + Math.cos(yaw) * Math.cos(pitch) * dist,
  };
}

// ---------------------------------------------------------------- following

export function followRate(brushAlong: boolean, reducedMotion: boolean): number {
  if (brushAlong) return reducedMotion ? FOLLOW_RATE_BRUSH_REDUCED_MOTION : FOLLOW_RATE_BRUSH;
  return FOLLOW_RATE_OTHER;
}

/**
 * How much of the way to its target the camera moves in a frame of `dt` seconds. A change of screen
 * is a cut instead (the renderer snaps to the target).
 */
export function followFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * Math.max(0.001, dt));
}

/**
 * The camera's own clock: runs with the frame, stands still while `held` (the brush paused, a Start
 * card up), so nothing the camera follows moves then.
 */
export function advanceCameraClock(clockSec: number, dt: number, held: boolean): number {
  return held ? clockSec : clockSec + dt;
}

// ---------------------------------------------------------------- a finger turning the view

/** Brush-Along: the finger's turn after a drag of (dx, dy) points, within its limits. */
export function brushOrbitDrag(yaw: number, pitch: number, dxPoints: number, dyPoints: number): { yaw: number; pitch: number } {
  return {
    yaw: clamp(yaw + dxPoints * DRAG_YAW_PER_POINT, -BRUSH_ORBIT_YAW_LIMIT, BRUSH_ORBIT_YAW_LIMIT),
    pitch: clamp(pitch + dyPoints * DRAG_PITCH_PER_POINT, -BRUSH_ORBIT_PITCH_LIMIT, BRUSH_ORBIT_PITCH_LIMIT),
  };
}

/** Brush-Along: the finger's turn after a frame with no finger on the screen. */
export function easeBackOffset(offset: number, dt: number): number {
  return offset * Math.exp(-EASE_BACK_RATE * Math.max(0.001, dt));
}

/** Home: the view's turn and tilt after a drag of (dx, dy) points across open space. */
export function hubOrbitDrag(yaw: number, pitch: number, dxPoints: number, dyPoints: number): { yaw: number; pitch: number } {
  return {
    yaw: clamp(yaw + dxPoints * DRAG_YAW_PER_POINT, -HUB_YAW_LIMIT, HUB_YAW_LIMIT),
    pitch: clamp(pitch + dyPoints * DRAG_PITCH_PER_POINT, HUB_PITCH_MIN, HUB_PITCH_MAX),
  };
}

/** Arrival: the turn round the crystal (or the Earth) after a drag of `dx` points. */
export function arrivalOrbitDrag(yaw: number, dxPoints: number): number {
  return clamp(yaw + dxPoints * ARRIVAL_DRAG_YAW_PER_POINT, -ARRIVAL_YAW_LIMIT, ARRIVAL_YAW_LIMIT);
}

// ---------------------------------------------------------------- the other screens

/**
 * Home: orbits the companion arch. `parallaxX/Y` is the phone's tilt in a hand (0 without a
 * gyroscope: always 0 on the web); `dolly` lets the web back off to fit its own panels.
 */
export function hubCamera(
  yaw: number,
  pitch: number,
  portrait: boolean,
  parallaxX = 0,
  parallaxY = 0,
  dolly = 1
): CameraPose {
  const dist = (portrait ? HUB_DIST_PORTRAIT : HUB_DIST_LANDSCAPE) * dolly;
  const effYaw = yaw + parallaxX * HUB_GYRO_YAW_GAIN;
  const effPitch = clamp(pitch - parallaxY * HUB_GYRO_PITCH_GAIN, HUB_GYRO_PITCH_MIN, HUB_GYRO_PITCH_MAX);
  return {
    pos: orbitPosition(HUB_CENTER, effYaw, effPitch, dist),
    look: vec3(
      HUB_CENTER.x,
      HUB_CENTER.y + (portrait ? HUB_LOOK_LIFT_PORTRAIT : HUB_LOOK_LIFT_LANDSCAPE),
      HUB_CENTER.z + HUB_LOOK_BACK
    ),
  };
}

/**
 * Arrival, one framing per beat (0 the crystal, 1 the hardness line-up, 2 fluorapatite, 3 the
 * Earth). `yaw` is the finger's turn; `parallaxX/Y` the phone's tilt in a hand (0 without a
 * gyroscope). On the line-up the turn only slides the camera sideways a little (0.45 of the way), so
 * all five specimens stay in view.
 */
export function arrivalCamera(beat: number, yaw: number, portrait: boolean, parallaxX = 0, parallaxY = 0): CameraPose {
  const earth = EARTH_BACKDROP_POS;
  const sx = earth.x;
  const sy = earth.y + ARRIVAL_SHOWCASE_LIFT;
  const sz = earth.z;
  const lift = parallaxY * ARRIVAL_GYRO_LIFT_GAIN;
  const turn = yaw + parallaxX * ARRIVAL_GYRO_YAW_GAIN;
  const s = Math.sin(turn);
  const c = Math.cos(turn);
  if (beat === 0) {
    // The hydroxyapatite crystal, centred about a quarter of the way down (the top third).
    const dist = portrait ? 20.0 : 15.5;
    return {
      pos: vec3(sx + s * dist, sy + (portrait ? -4.2 : 0.4) + lift, sz + c * dist),
      look: vec3(sx, sy + (portrait ? -6.2 : -1.8), sz),
    };
  }
  if (beat === 1) {
    // The crystal and the five Mohs specimens, from about 13% to 36% down, above the story card.
    const dist = portrait ? 21.5 : 15.0;
    return {
      pos: vec3(sx + s * dist * 0.45, sy + (portrait ? -6.4 : -2.6) + lift, sz + 2.2 + c * dist),
      look: vec3(sx, sy + (portrait ? -8.4 : -4.8), sz + 2.2),
    };
  }
  if (beat === 2) {
    // Fluorapatite close up, in the upper third (about 14% to 37% down).
    const dist = portrait ? 17.5 : 13.5;
    return {
      pos: vec3(sx + s * dist, sy + (portrait ? -3.6 : 0.2) + lift, sz + c * dist),
      look: vec3(sx, sy + (portrait ? -5.4 : -1.5), sz),
    };
  }
  // The whole Earth with its aurora and Station Aurora, filling about 10% to 51% down.
  const dist = portrait ? 74.0 : 48.0;
  return {
    pos: vec3(earth.x + s * dist, earth.y + (portrait ? -11.5 : -1.0) + lift * 2.0, earth.z + c * dist),
    look: vec3(earth.x, earth.y + (portrait ? -18.5 : -6.5), earth.z),
  };
}

/** A city stage, upright or sideways: south of the ship, looking down and a little ahead of it. */
export function stageCamera(probeX: number, probeZ: number, portrait: boolean): CameraPose {
  return {
    pos: vec3(
      probeX,
      portrait ? STAGE_HEIGHT_PORTRAIT : STAGE_HEIGHT_LANDSCAPE,
      probeZ + (portrait ? STAGE_BACK_PORTRAIT : STAGE_BACK_LANDSCAPE)
    ),
    look: vec3(probeX, STAGE_LOOK_Y, probeZ + STAGE_LOOK_AHEAD),
  };
}

/**
 * The score screen circles the city stage just played (`stageWidth` x `stageDepth`, 64 x 32).
 * `dolly` lets the web back off to fit its own panels, keeping the angle.
 */
export function reportCamera(
  stageWidth: number,
  stageDepth: number,
  clockSec: number,
  reducedMotion: boolean,
  dolly = 1
): CameraPose {
  const look = vec3(stageWidth * 0.5, REPORT_LOOK_Y, stageDepth * 0.5);
  const turn = reducedMotion ? REPORT_REDUCED_MOTION_YAW : clockSec * REPORT_TURN_RATE;
  return {
    pos: vec3(
      look.x + Math.sin(turn) * REPORT_RADIUS * dolly,
      look.y + (REPORT_HEIGHT - REPORT_LOOK_Y) * dolly,
      look.z + Math.cos(turn) * REPORT_RADIUS * dolly
    ),
    look,
  };
}

// ---------------------------------------------------------------- Brush-Along: the moments

/**
 * The zoom-out as each quadrant starts (its outside step): 1 whole mouth, 0 close up. Holds wide for
 * 1.05 s, then eases in by 2.75 s. Never under Reduce Motion.
 */
export function quadrantIntro01(surface: number, phaseElapsedSec: number, reducedMotion: boolean): number {
  if (reducedMotion || surface !== 0) return 0;
  if (phaseElapsedSec <= 1.05) return 1;
  if (phaseElapsedSec >= 2.75) return 0;
  return 1 - smoothstep(1.05, 2.75, phaseElapsedSec);
}

/** The zoom-out as each floss arch starts: holds 0.55 s, eased in by 1.75 s. Never under Reduce Motion. */
export function flossArchIntro01(archElapsedSec: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  if (archElapsedSec <= 0.55) return 1;
  if (archElapsedSec >= 1.75) return 0;
  return 1 - smoothstep(0.55, 1.75, archElapsedSec);
}

/**
 * Floss: the close-up's turn at the gap after crown `contactCIdx` (0 the patient's left back tooth
 * .. 12 the right; the floss starts at 12, on screen-right), seen about 24 degrees off the teeth's own
 * outward direction.
 */
export function flossCloseYaw(contactCIdx: number, outwardXZ: VecXZ): number {
  const baseYaw = Math.atan2(outwardXZ.x, outwardXZ.z);
  if (contactCIdx >= 7) return clamp(baseYaw - 0.42, -0.85, 0.92);
  if (contactCIdx === 6) return 0.38;
  return clamp(baseYaw + 0.42, -0.92, 0.85);
}

/**
 * Where the brush touches the tooth the camera follows, arch-local. `toothCenter`, `outwardXZ` (unit),
 * `halfDepth` and `halfHeight` describe the tooth under the brush (the upper arch already mirrored);
 * `distFromBack` counts teeth from the back molar (0..6). The brush's small scrub runs on `clockSec`
 * (none under Reduce Motion).
 */
export function brushContactLocal(
  toothCenter: Vec3,
  outwardXZ: VecXZ,
  halfDepth: number,
  halfHeight: number,
  surface: number,
  isUpper: boolean,
  distFromBack: number,
  clockSec: number,
  reducedMotion: boolean
): Vec3 {
  const ox = outwardXZ.x;
  const oz = outwardXZ.z;
  // Along the arch: (oz, 0, -ox).
  const gum = isUpper ? 1 : -1;
  const microSweep = reducedMotion ? 0 : Math.sin(clockSec * 9.0) * 0.26;
  const microVert = reducedMotion ? 0 : Math.cos(clockSec * 9.0) * 0.08;
  if (surface === 0) {
    // Outside: tucked into the gumline at the 45-degree angle.
    const out = halfDepth * 0.98;
    return {
      x: toothCenter.x + ox * out + oz * microSweep,
      y: toothCenter.y + gum * (halfHeight * 0.38) + microVert,
      z: toothCenter.z + oz * out - ox * microSweep,
    };
  }
  if (surface === 1) {
    // Chewing tops: flat on the biting surface.
    const sweep = microSweep * 1.35;
    return {
      x: toothCenter.x + oz * sweep,
      y: toothCenter.y - gum * (halfHeight * 1.02),
      z: toothCenter.z - ox * sweep,
    };
  }
  // Inside: the inner gumline; behind the front teeth the brush stands upright.
  const frontBlend = smoothstep(2.8, 4.5, distFromBack);
  const inward = halfDepth * 0.96;
  const sweep = microSweep * (1 - 0.5 * frontBlend);
  return {
    x: toothCenter.x - ox * inward + oz * sweep,
    y: toothCenter.y + gum * (halfHeight * 0.28) + microVert,
    z: toothCenter.z - oz * inward - ox * sweep,
  };
}

/** Floss: how far through the current gap the floss is, 0..1 (`phase` in the floss stage). */
export function flossGapFrac(phase: Pick<BrushCameraPhase, 'phaseElapsedSec' | 'phaseDurationSec'>): number {
  const halfNorm = clamp(phase.phaseElapsedSec / Math.max(0.001, phase.phaseDurationSec), 0, 0.999);
  const contactProg = clamp(halfNorm * 13.0, 0, 12.999);
  return contactProg - Math.floor(contactProg);
}

/**
 * The floss's motion through one gap, `gapFrac` 0..1: slide in with a gentle saw (to 0.30), lean on
 * the right-hand tooth (to 0.65), lean on the left-hand one, then lift out.
 */
export function flossGapMotion(gapFrac: number, halfHeight: number, reducedMotion: boolean): FlossGapMotion {
  if (gapFrac < 0.3) {
    const t = gapFrac / 0.3;
    const ease = smoothstep(0, 1, t);
    return {
      depthIntoGap: mix(-(halfHeight + 0.18), halfHeight * 0.1, ease),
      leanSide: 0,
      sawZ: reducedMotion ? 0 : Math.sin(t * Math.PI * 4.0) * 0.15,
    };
  }
  if (gapFrac < 0.65) {
    const t = (gapFrac - 0.3) / 0.35;
    return {
      depthIntoGap: halfHeight * (0.1 + 0.28 * Math.sin(t * Math.PI)),
      leanSide: smoothstep(0, 0.22, t) * (1 - 0.35 * smoothstep(0.8, 1.0, t)),
      sawZ: reducedMotion ? 0 : Math.sin(t * Math.PI * 2.0) * 0.05,
    };
  }
  const t = (gapFrac - 0.65) / 0.35;
  if (t < 0.72) {
    const sub = t / 0.72;
    return {
      depthIntoGap: halfHeight * (0.1 + 0.28 * Math.sin(sub * Math.PI)),
      leanSide: -smoothstep(0, 0.25, sub),
      sawZ: reducedMotion ? 0 : Math.sin(sub * Math.PI * 2.0) * 0.05,
    };
  }
  const lift = smoothstep(0, 1, (t - 0.72) / 0.28);
  return {
    depthIntoGap: mix(halfHeight * 0.1, -(halfHeight + 0.2), lift),
    leanSide: -(1 - lift),
    sawZ: 0,
  };
}

/**
 * Where the floss is in the gap, arch-local: `gapMid` between the two crowns (upper arch already
 * mirrored), `outwardXZ` their average outward direction, `archDirXZ` along the arch toward the
 * right-hand tooth.
 */
export function flossContactLocal(
  gapMid: Vec3,
  outwardXZ: VecXZ,
  archDirXZ: VecXZ,
  isUpper: boolean,
  motion: FlossGapMotion
): Vec3 {
  const gum = isUpper ? 1 : -1;
  const lean = motion.leanSide * 0.15;
  return {
    x: gapMid.x + archDirXZ.x * lean + outwardXZ.x * motion.sawZ,
    y: gapMid.y + gum * motion.depthIntoGap,
    z: gapMid.z + archDirXZ.z * lean + outwardXZ.z * motion.sawZ,
  };
}

/** The Brush-Along camera for this moment: brushing, floss or the rinse. */
export function brushCameraTarget(input: BrushCameraInput): BrushCameraTarget {
  if (input.phase.stage === 'mouthwashBonus') return rinseTarget(input);
  if (input.phase.stage === 'flossBonus') return flossTarget(input);
  return brushingTarget(input);
}

// ---------------------------------------------------------------- Brush-Along, stage by stage

/** How far the opposite jaw is swung open, so it never hides the teeth being cleaned. */
const OPPOSITE_JAW_GAP_Y = 3.8;

function shownJaw(): BrushCameraJaw {
  return { visible: true, offset: vec3(0, 0, 0), opacity: 1 };
}

/** The 2-minute brush: 4 quadrants x outside, chewing tops, inside (10 s each). */
function brushingTarget(input: BrushCameraInput): BrushCameraTarget {
  const phase = input.phase;
  const q = clamp(phase.quadrant, 0, 3);
  const isUpper = q <= 1;
  // Patient's right (quadrants 0 and 3) is screen-right: positive yaw.
  const side = q === 0 || q === 3 ? 1 : -1;
  const surface = clamp(phase.surface, 0, 2);
  const sFrac = clamp(phase.phaseElapsedSec / Math.max(1, phase.phaseDurationSec), 0, 0.999);
  // 0 at the back molar .. 1 at the front tooth (the chewing tops sweep front to back).
  const frontProg = surface === 1 ? 1 - sFrac : sFrac;
  const archMid = vec3(0, isUpper ? 1.9 : 1.3, 0.9);
  const intro = quadrantIntro01(surface, phase.phaseElapsedSec, input.reducedMotion);

  // On the outside step the opposite jaw stays in view, swung open (brighter while zoomed out); on
  // the chewing tops and the inside it is hidden so the steep views stay clear.
  const opposite: BrushCameraJaw = {
    visible: surface === 0,
    offset: vec3(0, isUpper ? -OPPOSITE_JAW_GAP_Y : OPPOSITE_JAW_GAP_Y, -0.7 + 0.25 * intro),
    opacity: 0.38 + 0.48 * intro,
  };
  const upperJaw = isUpper ? shownJaw() : opposite;
  const lowerJaw = isUpper ? opposite : shownJaw();

  if (input.reducedMotion) {
    // Reduce Motion fades and never flies: straight on (no swing between steps, no sweep), a little
    // further back, the look leaning only a quarter of the way to the brush.
    return {
      yaw: 0,
      pitch: isUpper ? -0.1 : 0.2,
      distPortrait: 22.8,
      distLandscape: 16.8,
      lookLocal: input.contactLocal ? mix3(archMid, input.contactLocal, 0.25) : archMid,
      intro01: 0,
      upperJaw,
      lowerJaw,
    };
  }

  let closeYaw: number;
  let closePitch: number;
  let closeDistP: number;
  let closeDistL: number;
  if (surface === 0) {
    // Outside: from the cheek's side (never flips left and right).
    closeYaw = side * (0.78 - 0.48 * frontProg);
    closePitch = isUpper ? -0.15 : 0.22;
    closeDistP = 19.6;
    closeDistL = 14.8;
  } else if (surface === 1) {
    // Chewing tops: steeply from below (upper) or above (lower), into the grooves.
    closeYaw = side * (0.36 - 0.2 * frontProg);
    closePitch = isUpper ? -0.72 : 0.76;
    closeDistP = 19.0;
    closeDistL = 14.2;
  } else {
    // Inside: from across the mouth, onto the inner wall.
    closeYaw = -side * (0.48 - 0.34 * frontProg);
    closePitch = isUpper ? -0.58 : 0.62;
    closeDistP = 19.4;
    closeDistL = 14.6;
  }

  const closeLook = input.contactLocal ? mix3(archMid, input.contactLocal, 0.62) : archMid;
  const wideLook = vec3(side * 1.35, isUpper ? 0.25 : 3.05, 0.8);
  return {
    yaw: mix(closeYaw, side * 0.22, intro),
    pitch: mix(closePitch, isUpper ? -0.04 : 0.08, intro),
    distPortrait: mix(closeDistP, 29.8, intro),
    distLandscape: mix(closeDistL, 22.4, intro),
    lookLocal: mix3(closeLook, wideLook, intro),
    intro01: intro,
    upperJaw,
    lowerJaw,
  };
}

/** Floss: the upper arch then the lower, 13 gaps each from the patient's right to the left. */
function flossTarget(input: BrushCameraInput): BrushCameraTarget {
  const phase = input.phase;
  const isUpper = phase.flossIsUpper;
  const cIdx = 12 - clamp(Math.floor(phase.flossContactIndex), 0, 12);
  // Which half of the arch the floss is on: the patient's right (screen-right) first.
  const wideSide = cIdx >= 6 ? 1 : -1;
  const archMid = vec3(0, isUpper ? 1.85 : 1.35, 1.0);
  const intro = flossArchIntro01(phase.phaseElapsedSec, input.reducedMotion);

  // The opposite jaw shows only while the arch opens zoomed out.
  const opposite: BrushCameraJaw = {
    visible: intro > 0.04,
    offset: vec3(0, isUpper ? -OPPOSITE_JAW_GAP_Y : OPPOSITE_JAW_GAP_Y, -0.6),
    opacity: 0.18 + 0.56 * intro,
  };
  const upperJaw = isUpper ? shownJaw() : opposite;
  const lowerJaw = isUpper ? opposite : shownJaw();

  if (input.reducedMotion) {
    // Straight on, a little further back; the look leans only 28% of the way to the floss.
    return {
      yaw: 0,
      pitch: isUpper ? -0.14 : 0.18,
      distPortrait: 22.0,
      distLandscape: 16.0,
      lookLocal: input.contactLocal ? mix3(archMid, input.contactLocal, 0.28) : archMid,
      intro01: 0,
      upperJaw,
      lowerJaw,
    };
  }

  const closeYaw = input.flossOutwardXZ ? flossCloseYaw(cIdx, input.flossOutwardXZ) : wideSide * 0.42;
  const closeLook = input.contactLocal ? mix3(archMid, input.contactLocal, 0.68) : archMid;
  const wideLook = vec3(wideSide * 1.1, isUpper ? 1.8 : 1.4, 0.9);
  return {
    yaw: mix(closeYaw, wideSide * 0.18, intro),
    pitch: mix(isUpper ? -0.26 : 0.3, isUpper ? -0.06 : 0.1, intro),
    distPortrait: mix(19.0, 27.0, intro),
    distLandscape: mix(14.4, 20.6, intro),
    lookLocal: mix3(closeLook, wideLook, intro),
    intro01: intro,
    upperJaw,
    lowerJaw,
  };
}

/**
 * The rinse: both jaws open a little, a slow sway; a phone held in a hand swings the view toward the
 * cheek the rinse has sloshed to (right cheek, screen-right).
 */
function rinseTarget(input: BrushCameraInput): BrushCameraTarget {
  let yaw = 0;
  if (!input.reducedMotion) {
    const handheld = clamp(input.rinseHandheld01, 0, 1);
    const sway = Math.sin(input.clockSec * 0.52) * 0.16;
    yaw = sway * (1 - handheld * 0.65) + input.rinseSlosh * handheld * 0.1;
  }
  return {
    yaw,
    pitch: 0.04,
    distPortrait: 21.4,
    distLandscape: 16.0,
    lookLocal: vec3(0, 1.85, 1.1),
    intro01: 0,
    upperJaw: { visible: true, offset: vec3(0, 1.05, 0), opacity: 1 },
    lowerJaw: { visible: true, offset: vec3(0, -0.55, 0), opacity: 1 },
  };
}

// ---------------------------------------------------------------- browser only

/**
 * The browser's frame for the brush screen before any stage runs (no pacer and no active quadrant):
 * both jaws open on the whole mouth. The native app has none (it opens on the first quadrant's
 * zoomed-out view), so this one has no Swift twin; it is kept as the browser had it.
 * `incisorClearanceY` is the arch mesh's own opening (`CompanionArchBuild.incisorClearanceY`).
 */
export function idleBrushCameraTarget(incisorClearanceY = 4.0): BrushCameraTarget {
  const clearY = Math.max(3.8, incisorClearanceY);
  return {
    yaw: 0,
    pitch: 0.12,
    distPortrait: 26.5,
    distLandscape: 19.5,
    lookLocal: vec3(0, 1.65, 0.9),
    intro01: 1,
    upperJaw: { visible: true, offset: vec3(0, clearY * 0.52, 0), opacity: 1 },
    lowerJaw: { visible: true, offset: vec3(0, -clearY * 0.48, 0), opacity: 1 },
  };
}
