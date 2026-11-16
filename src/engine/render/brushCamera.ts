/**
 * Where the Brush-Along camera looks for the current step, so the teeth being brushed are turned
 * toward the viewer: the cheek side from that side, the chewing tops from higher up, and the
 * inside from across the mouth. Follows the native coaching camera
 * (ProceduralMeshBuilder.updatePacerCoaching) at three-quarter strength, because the web keeps
 * both arches on screen (the upper arch is drawn as a mirror of the lower one, so the camera
 * always stays above the teeth and only the tilt grows for the tops).
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

/** Share of the native swing the web uses, since it frames both arches from further back. */
const WEB_YAW_SHARE = 0.75;
/** The web brush sweeps the whole quadrant, so aim at a point a little behind the middle. */
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
