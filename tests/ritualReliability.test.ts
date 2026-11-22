import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

/** The browser's frame timer, run by hand: each queued callback is one frame it would draw. */
function handFrames() {
  const queued: Array<(nowMs: number) => void> = [];
  vi.stubGlobal('requestAnimationFrame', (cb: (nowMs: number) => void) => {
    queued.push(cb);
    return queued.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  let nowMs = -1;
  /** Runs the next frame, 1/60 s after the last. False when no frame was asked for. */
  const runFrame = (): boolean => {
    const cb = queued.shift();
    if (!cb) return false;
    if (nowMs < 0) nowMs = performance.now();
    nowMs += 1000 / 60;
    cb(nowMs);
    return true;
  };
  return { runFrame, pending: () => queued.length };
}

describe('W5: one bad frame does not end the frame loop, or the brushing timer with it', () => {
  it('a frame that throws leaves the next one asked for, and the timer keeps counting', () => {
    const { runFrame, pending } = handFrames();
    const clock = new ClockController(new EventBus());
    let renders = 0;
    let failNext = false;
    clock.setCallbacks(
      () => {},
      () => {
        renders++;
        if (failNext) {
          failNext = false;
          throw new Error('one bad frame');
        }
      }
    );
    clock.start();
    clock.startPacer();
    for (let i = 0; i < 60; i++) expect(runFrame()).toBe(true);
    const before = clock.getPacerElapsedSec();
    expect(before).toBeGreaterThan(0.9);

    failNext = true;
    expect(() => runFrame()).toThrow('one bad frame');
    // The browser reports the error and carries on, because the next frame was already asked for.
    expect(pending()).toBe(1);
    for (let i = 0; i < 60; i++) expect(runFrame()).toBe(true);
    expect(renders).toBe(121);
    expect(clock.getPacerElapsedSec()).toBeCloseTo(before + 61 / 60, 3);
  });

  it('a tick listener that throws once does not silence the ticks after it', () => {
    const { runFrame, pending } = handFrames();
    const bus = new EventBus();
    const clock = new ClockController(bus);
    let ticks = 0;
    bus.on('pacer:tick', () => {
      ticks++;
      if (ticks === 3) throw new Error('listener failed once');
    });
    clock.start();
    clock.startPacer();
    for (let i = 0; i < 120; i++) {
      try {
        runFrame();
      } catch {
        // The browser would report this one frame's error and go on to the next frame.
      }
    }
    expect(pending()).toBe(1);
    // a tick every tenth of a second, for two seconds
    expect(ticks).toBeGreaterThanOrEqual(19);
    expect(clock.getPacerElapsedSec()).toBeCloseTo(2, 1);
  });
});

/**
 * A stand-in for the browser's screen wake lock: it counts what was asked for and what is still
 * held, and can let go of everything the way a browser does when the page is hidden.
 */
function fakeWakeLock() {
  interface Lock {
    released: boolean;
    release(): Promise<void>;
    addEventListener(type: 'release', cb: () => void): void;
    drop(): void;
  }
  const locks: Lock[] = [];
  vi.stubGlobal('navigator', {
    wakeLock: {
      request: (): Promise<Lock> => {
        let onRelease: (() => void) | null = null;
        const lock: Lock = {
          released: false,
          release: () => {
            lock.drop();
            return Promise.resolve();
          },
          addEventListener: (_type, cb) => {
            onRelease = cb;
          },
          drop: () => {
            if (lock.released) return;
            lock.released = true;
            onRelease?.();
          },
        };
        locks.push(lock);
        return Promise.resolve(lock);
      },
    },
  });
  return {
    asked: () => locks.length,
    held: () => locks.filter((l) => !l.released).length,
    pageHidden: () => locks.forEach((l) => l.drop()),
  };
}

/** Lets the browser's answers to wake-lock requests arrive. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('W14: a city finale keeps the screen awake', () => {
  it('holds the screen on from the start of the show to its end', async () => {
    const wake = fakeWakeLock();
    const clock = new ClockController(new EventBus());
    clock.setShowAwake(true);
    await settle();
    expect(wake.asked()).toBe(1);
    expect(wake.held()).toBe(1);
    clock.setShowAwake(false);
    await settle();
    expect(wake.held()).toBe(0);
  });

  it('asks again when the page comes back into view mid-show, and not once the show is over', async () => {
    const wake = fakeWakeLock();
    const clock = new ClockController(new EventBus());
    clock.setShowAwake(true);
    await settle();
    clock.noteHidden(1_800_000_000_000);
    wake.pageHidden();
    expect(wake.held()).toBe(0);
    clock.noteVisible(1_800_000_020_000, 20_000);
    await settle();
    expect(wake.asked()).toBe(2);
    expect(wake.held()).toBe(1);

    clock.setShowAwake(false);
    await settle();
    expect(wake.held()).toBe(0);
    clock.noteHidden(1_800_000_030_000);
    clock.noteVisible(1_800_000_040_000, 40_000);
    await settle();
    expect(wake.asked()).toBe(2);
  });

  it('a brush that pauses or ends during a show does not take the show’s lock', async () => {
    const wake = fakeWakeLock();
    const clock = new ClockController(new EventBus());
    clock.setShowAwake(true);
    clock.startPacer();
    await settle();
    expect(wake.held()).toBe(1);
    clock.setPacerPaused(true);
    await settle();
    expect(wake.held()).toBe(1);
    clock.stopPacer();
    await settle();
    expect(wake.held()).toBe(1);
    clock.setShowAwake(false);
    await settle();
    expect(wake.held()).toBe(0);
  });

  it('the show ending leaves a running brush its lock, but not a paused one', async () => {
    const wake = fakeWakeLock();
    const clock = new ClockController(new EventBus());
    clock.startPacer();
    clock.setShowAwake(true);
    await settle();
    clock.setShowAwake(false);
    await settle();
    expect(wake.held()).toBe(1);
    clock.stopPacer();
    await settle();
    expect(wake.held()).toBe(0);

    clock.startPacer();
    clock.setPacerPaused(true);
    await settle();
    expect(wake.held()).toBe(0);
    clock.setShowAwake(true);
    await settle();
    expect(wake.held()).toBe(1);
    clock.setShowAwake(false);
    await settle();
    expect(wake.held()).toBe(0);
  });

  it('the game turns it on when a finale starts and off on both ways out of one', () => {
    const main = readFileSync(join(__dirname, '..', 'src/main.ts'), 'utf8').replace(/\r\n/g, '\n');
    // On: straight after the finale is marked as playing.
    expect(main).toMatch(/finaleActive = true;\n(\s*\/\/[^\n]*\n)*\s*clock\.setShowAwake\(true\);/);
    // Off: when the show ends by itself or is skipped...
    const onDone = /onDone: \(\) => \{[\s\S]*?\n {6}\},/.exec(main)?.[0] ?? '';
    expect(onDone).toContain('overlay.dispose();');
    expect(onDone).toContain('clock.setShowAwake(false);');
    // ...and when another screen takes over while it plays.
    const takenOver = /if \(finaleOverlay\) \{\n\s*finaleOverlay\.dispose\(\);[\s\S]*?\n {4}\}/.exec(main)?.[0] ?? '';
    expect(takenOver).toContain('clock.setShowAwake(false);');
    expect(main.match(/clock\.setShowAwake\(true\)/g)).toHaveLength(1);
    expect(main.match(/clock\.setShowAwake\(false\)/g)).toHaveLength(2);
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
