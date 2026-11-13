/**
 * Game controller support (Xbox / PlayStation / Switch-style "standard" layout).
 *
 *   Left stick or D-pad .... steer HYDRA-1
 *   Right stick ............ aim the floss
 *   A or right trigger ..... scrub (hold)
 *   X or right bumper ...... floss
 *   Y or left bumper ....... Fluoride Surge
 *   B ...................... dye scan
 *   Start .................. pause
 */

export interface GamepadButtonLike {
  pressed: boolean;
  value: number;
}

export interface GamepadLike {
  axes: readonly number[];
  buttons: readonly GamepadButtonLike[];
  connected?: boolean;
  vibrationActuator?: {
    // Typed loosely so both the browser's Gamepad type and test doubles fit.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    playEffect?: (type: any, params?: any) => Promise<unknown>;
  } | null;
}

export interface GamepadSnapshot {
  connected: boolean;
  moveX: number;
  moveZ: number;
  /** Right-stick aim, zero when the stick is at rest. */
  aimX: number;
  aimZ: number;
  scrubHeld: boolean;
  /** True only on the frame the button goes down. */
  flossPressed: boolean;
  rinsePressed: boolean;
  scanPressed: boolean;
  pausePressed: boolean;
  /** Any button or stick in use this frame (unlocks audio, hides touch hints). */
  anyInput: boolean;
}

export const GAMEPAD_IDLE: Readonly<GamepadSnapshot> = Object.freeze({
  connected: false,
  moveX: 0,
  moveZ: 0,
  aimX: 0,
  aimZ: 0,
  scrubHeld: false,
  flossPressed: false,
  rinsePressed: false,
  scanPressed: false,
  pausePressed: false,
  anyInput: false,
});

const STICK_DEADZONE = 0.18;
const AIM_DEADZONE = 0.3;
const TRIGGER_THRESHOLD = 0.35;

/** Radial deadzone: ignores stick drift near the centre and rescales the rest to 0..1. */
export function applyStickDeadzone(x: number, y: number, deadzone = STICK_DEADZONE): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (!Number.isFinite(mag) || mag <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (mag - deadzone) / (1 - deadzone));
  return { x: (x / mag) * scaled, y: (y / mag) * scaled };
}

function down(pad: GamepadLike, index: number, threshold = 0.5): boolean {
  const b = pad.buttons[index];
  return !!b && (b.pressed || b.value > threshold);
}

export class GamepadInput {
  private prevFloss = false;
  private prevRinse = false;
  private prevScan = false;
  private prevPause = false;
  private activePad: GamepadLike | null = null;

  /** Read the first connected controller. Call once per rendered frame. */
  poll(pads: ReadonlyArray<GamepadLike | null | undefined>): GamepadSnapshot {
    let pad: GamepadLike | null = null;
    for (const p of pads) {
      if (p && p.connected !== false && p.buttons.length > 0) {
        pad = p;
        break;
      }
    }
    this.activePad = pad;
    if (!pad) {
      this.prevFloss = this.prevRinse = this.prevScan = this.prevPause = false;
      return GAMEPAD_IDLE;
    }

    const stick = applyStickDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    let moveX = stick.x;
    let moveZ = stick.y;
    if (down(pad, 14)) moveX -= 1;
    if (down(pad, 15)) moveX += 1;
    if (down(pad, 12)) moveZ -= 1;
    if (down(pad, 13)) moveZ += 1;
    const moveMag = Math.hypot(moveX, moveZ);
    if (moveMag > 1) {
      moveX /= moveMag;
      moveZ /= moveMag;
    }

    const aim = applyStickDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, AIM_DEADZONE);

    const scrubHeld = down(pad, 0) || down(pad, 7, TRIGGER_THRESHOLD);
    const floss = down(pad, 2) || down(pad, 5);
    const rinse = down(pad, 3) || down(pad, 4);
    const scan = down(pad, 1);
    const pause = down(pad, 9);

    const snap: GamepadSnapshot = {
      connected: true,
      moveX,
      moveZ,
      aimX: aim.x,
      aimZ: aim.y,
      scrubHeld,
      flossPressed: floss && !this.prevFloss,
      rinsePressed: rinse && !this.prevRinse,
      scanPressed: scan && !this.prevScan,
      pausePressed: pause && !this.prevPause,
      anyInput: moveMag > 0 || aim.x !== 0 || aim.y !== 0 || scrubHeld || floss || rinse || scan || pause,
    };
    this.prevFloss = floss;
    this.prevRinse = rinse;
    this.prevScan = scan;
    this.prevPause = pause;
    return snap;
  }

  /** Short rumble on the active controller. Silently does nothing where rumble is unsupported. */
  rumble(strength01: number, durationMs: number): void {
    const actuator = this.activePad?.vibrationActuator;
    if (!actuator?.playEffect) return;
    const k = Math.max(0, Math.min(1, strength01));
    try {
      void actuator
        .playEffect('dual-rumble', {
          startDelay: 0,
          duration: Math.max(10, Math.min(400, durationMs)),
          weakMagnitude: k,
          strongMagnitude: k * 0.7,
        })
        ?.catch(() => {});
    } catch {
      // Some browsers throw instead of rejecting.
    }
  }
}
