import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClockController } from '../src/engine/ClockController';
import { EventBus } from '../src/engine/EventBus';
import { GamepadInput, type GamepadLike } from '../src/engine/GamepadInput';
import { InputManager, readGamepads } from '../src/engine/InputManager';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A clock driven by hand: frames on the page's own timer, and hide/show with wall-clock times. */
function ritualClock() {
  const clock = new ClockController(new EventBus());
  let perfMs = 0;
  let wallMs = 1_800_000_000_000;
  clock.tickFrame(perfMs);
  const frames = (sec: number): void => {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) {
      perfMs += 1000 / 60;
      wallMs += 1000 / 60;
      clock.tickFrame(perfMs);
    }
  };
  const lock = (sec: number, wallJumpSec = sec): void => {
    clock.noteHidden(wallMs);
    perfMs += sec * 1000;
    wallMs += wallJumpSec * 1000;
    clock.noteVisible(wallMs, perfMs);
  };
  return { clock, frames, lock };
}

describe('H04: the ritual follows the clock on the wall through a locked phone', () => {
  it('20 s locked at 1:50 of brushing comes back 10 s into floss', () => {
    const { clock, frames, lock } = ritualClock();
    clock.startPacer();
    frames(110);
    lock(20);
    expect(clock.getPacerElapsedSec()).toBe(120);
    expect(clock.getPacerOverflowSec()).toBeCloseTo(10, 1);
    clock.enterFlossBonus(); // what BrushAlongOverlay does on the next tick
    expect(clock.getPacerStage()).toBe('flossBonus');
    expect(clock.getPacerElapsedSec()).toBeCloseTo(130, 1);
  });

  it('115 s to 180 s passes floss and lands 15 s into the rinse', () => {
    const { clock, frames, lock } = ritualClock();
    clock.setPacerMouthwashDurationSec(60);
    clock.startPacer();
    frames(115);
    lock(65);
    clock.enterFlossBonus();
    expect(clock.getPacerOverflowSec()).toBeCloseTo(15, 1); // floss ended while locked too
    clock.enterMouthwashBonus();
    expect(clock.getPacerElapsedSec()).toBeCloseTo(180, 1);
    expect(clock.getPacerOverflowSec()).toBe(0);
  });

  it('finishes exactly at 165, 195 or 225 seconds', () => {
    for (const [rinse, end] of [
      [0, 165],
      [30, 195],
      [60, 225],
    ] as const) {
      const { clock, frames } = ritualClock();
      if (rinse) clock.setPacerMouthwashDurationSec(rinse);
      clock.startPacer();
      frames(121);
      clock.enterFlossBonus();
      frames(46);
      if (rinse) {
        clock.enterMouthwashBonus();
        frames(rinse + 1);
      }
      expect(clock.getPacerElapsedSec()).toBe(end);
    }
  });

  it('only the player’s Pause stops it, also while locked', () => {
    const { clock, frames, lock } = ritualClock();
    clock.startPacer();
    frames(30);
    clock.setPacerPaused(true);
    lock(40);
    frames(10);
    expect(clock.getPacerElapsedSec()).toBeCloseTo(30, 1);
    clock.setPacerPaused(false);
    frames(5);
    expect(clock.getPacerElapsedSec()).toBeCloseTo(35, 1);
  });

  it('never runs backwards when the device clock is set back while locked', () => {
    const { clock, frames, lock } = ritualClock();
    clock.startPacer();
    frames(50);
    lock(5, -3600);
    expect(clock.getPacerElapsedSec()).toBeCloseTo(50, 1);
  });

  it('a stalled frame counts in full instead of being cut to half a second', () => {
    const clock = new ClockController(new EventBus());
    clock.tickFrame(0);
    clock.startPacer();
    clock.tickFrame(300);
    clock.tickFrame(10_300);
    expect(clock.getPacerElapsedSec()).toBeCloseTo(10.3, 6);
  });

  it('a manual jump ahead carries nothing over', () => {
    const { clock, frames } = ritualClock();
    clock.startPacer();
    frames(60);
    clock.enterFlossBonus();
    expect(clock.getPacerElapsedSec()).toBe(120);
  });
});

function pad(pressed: number[] = []): GamepadLike {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
  return { axes: [0, 0, 0, 0], buttons, connected: true };
}

function inputWithoutDom(): InputManager {
  vi.stubGlobal('window', {
    addEventListener: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
    innerWidth: 390,
    innerHeight: 844,
  });
  return new InputManager({ addEventListener: () => {} } as unknown as HTMLCanvasElement);
}

describe('H07: a page that may not use controllers keeps running', () => {
  it('reads no controllers when getGamepads is disallowed', () => {
    vi.stubGlobal('navigator', {
      getGamepads: () => {
        throw new DOMException('Access to the feature "gamepad" is disallowed by permissions policy.', 'SecurityError');
      },
    });
    expect(readGamepads()).toEqual([]);
  });

  it('the frame loop and the brushing timer go on after a refusal', () => {
    vi.stubGlobal('navigator', {
      getGamepads: () => {
        throw new DOMException('disallowed', 'SecurityError');
      },
    });
    const input = inputWithoutDom();
    const clock = new ClockController(new EventBus());
    let frames = 0;
    clock.setCallbacks(
      () => {},
      () => {
        input.pollGamepad();
        frames++;
      }
    );
    clock.tickFrame(0);
    clock.startPacer();
    for (let i = 1; i <= 120; i++) clock.tickFrame((i * 1000) / 60);
    expect(frames).toBe(121);
    expect(clock.getPacerElapsedSec()).toBeCloseTo(2, 3);
    expect(input.isGamepadConnected()).toBe(false);
  });

  it('works with no Gamepad API at all', () => {
    vi.stubGlobal('navigator', {});
    expect(readGamepads()).toEqual([]);
  });
});

describe('M12: presses on the Pause card do not fire after Resume', () => {
  const camera = new THREE.PerspectiveCamera();
  const sample = (input: InputManager) => input.sampleSessionCommand(camera, { x: 0, z: 0 }, 0, false, 1 / 60);

  it('Start, Y, release, Start leaves the surge untouched', () => {
    const input = inputWithoutDom();
    let paused = false;
    input.setHooks({ onUserGesture: () => {}, onOrbitDrag: () => {}, getMode: () => 'ARCADE', isGameplayPaused: () => paused });
    const pad0 = new GamepadInput();
    paused = true;
    input.applyGamepadSnapshot(pad0.poll([pad([3])])); // Y (surge) pressed on Pause
    input.applyGamepadSnapshot(pad0.poll([pad()]));
    paused = false;
    input.applyGamepadSnapshot(pad0.poll([pad()]));
    expect(sample(input).fireRinseRequested).toBe(false);
  });

  it('Y held across Resume needs a fresh press', () => {
    const input = inputWithoutDom();
    let paused = true;
    input.setHooks({ onUserGesture: () => {}, onOrbitDrag: () => {}, getMode: () => 'ARCADE', isGameplayPaused: () => paused });
    const pad0 = new GamepadInput();
    input.applyGamepadSnapshot(pad0.poll([pad([3])]));
    paused = false;
    input.applyGamepadSnapshot(pad0.poll([pad([3])]));
    expect(sample(input).fireRinseRequested).toBe(false);
    input.applyGamepadSnapshot(pad0.poll([pad()]));
    input.applyGamepadSnapshot(pad0.poll([pad([3])]));
    expect(sample(input).fireRinseRequested).toBe(true);
  });

  it('floss and scan pressed on the Pause card are dropped too', () => {
    const input = inputWithoutDom();
    let paused = true;
    input.setHooks({ onUserGesture: () => {}, onOrbitDrag: () => {}, getMode: () => 'ARCADE', isGameplayPaused: () => paused });
    const pad0 = new GamepadInput();
    input.applyGamepadSnapshot(pad0.poll([pad([2, 1])]));
    input.applyGamepadSnapshot(pad0.poll([pad()]));
    paused = false;
    input.applyGamepadSnapshot(pad0.poll([pad()]));
    const cmd = sample(input);
    expect(cmd.fireFlossRequested).toBe(false);
    expect(cmd.fireDiscloseRequested).toBe(false);
  });
});
