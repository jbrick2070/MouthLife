import { describe, expect, it } from 'vitest';
import { ClockController, FIXED_DT } from '../src/engine/ClockController';
import { EventBus } from '../src/engine/EventBus';
import { GamepadInput, applyStickDeadzone, type GamepadLike } from '../src/engine/GamepadInput';

function pad(axes: number[] = [0, 0, 0, 0], pressed: number[] = [], triggers: Record<number, number> = {}): GamepadLike {
  const buttons = Array.from({ length: 17 }, (_, i) => ({
    pressed: pressed.includes(i),
    value: pressed.includes(i) ? 1 : (triggers[i] ?? 0),
  }));
  return { axes, buttons, connected: true };
}

describe('game controller input', () => {
  it('ignores stick drift and rescales the rest', () => {
    expect(applyStickDeadzone(0.1, 0.05)).toEqual({ x: 0, y: 0 });
    const full = applyStickDeadzone(1, 0);
    expect(full.x).toBeCloseTo(1, 6);
    const half = applyStickDeadzone(0.59, 0);
    expect(half.x).toBeCloseTo(0.5, 2);
    expect(applyStickDeadzone(NaN, 0)).toEqual({ x: 0, y: 0 });
  });

  it('is idle with no controller, and with only empty slots', () => {
    const input = new GamepadInput();
    expect(input.poll([]).connected).toBe(false);
    expect(input.poll([null, undefined]).connected).toBe(false);
    input.rumble(1, 100); // must not throw without a controller
  });

  it('steers with the left stick or D-pad and never exceeds full speed', () => {
    const input = new GamepadInput();
    const stick = input.poll([pad([0.9, 0, 0, 0])]);
    expect(stick.moveX).toBeGreaterThan(0.8);
    expect(stick.moveZ).toBe(0);

    const dpad = input.poll([pad([0, 0, 0, 0], [12, 15])]); // up + right
    expect(dpad.moveX).toBeCloseTo(Math.SQRT1_2, 5);
    expect(dpad.moveZ).toBeCloseTo(-Math.SQRT1_2, 5);

    const both = input.poll([pad([1, 0, 0, 0], [15])]);
    expect(Math.hypot(both.moveX, both.moveZ)).toBeCloseTo(1, 5);
  });

  it('scrubs while A or the right trigger is held', () => {
    const input = new GamepadInput();
    expect(input.poll([pad([0, 0, 0, 0], [0])]).scrubHeld).toBe(true);
    expect(input.poll([pad([0, 0, 0, 0], [], { 7: 0.6 })]).scrubHeld).toBe(true);
    expect(input.poll([pad([0, 0, 0, 0], [], { 7: 0.1 })]).scrubHeld).toBe(false);
  });

  it('fires floss, surge, scan and pause once per press, not every frame', () => {
    const input = new GamepadInput();
    const first = input.poll([pad([0, 0, 0, 0], [2, 3, 1, 9])]);
    expect([first.flossPressed, first.rinsePressed, first.scanPressed, first.pausePressed]).toEqual([true, true, true, true]);
    const held = input.poll([pad([0, 0, 0, 0], [2, 3, 1, 9])]);
    expect([held.flossPressed, held.rinsePressed, held.scanPressed, held.pausePressed]).toEqual([false, false, false, false]);
    input.poll([pad()]);
    expect(input.poll([pad([0, 0, 0, 0], [5])]).flossPressed).toBe(true); // right bumper also flosses
  });

  it('aims with the right stick only when it is pushed', () => {
    const input = new GamepadInput();
    const rest = input.poll([pad([0, 0, 0.1, 0.1])]);
    expect(rest.aimX).toBe(0);
    expect(rest.anyInput).toBe(false);
    const aimed = input.poll([pad([0, 0, 0, -1])]);
    expect(aimed.aimZ).toBeLessThan(-0.9);
    expect(aimed.anyInput).toBe(true);
  });

  it('rumbles the active controller and survives one that rejects', () => {
    const calls: Array<{ type: string; duration: number }> = [];
    const input = new GamepadInput();
    const withRumble: GamepadLike = {
      ...pad(),
      vibrationActuator: {
        playEffect: (type: string, params: { duration: number }) => {
          calls.push({ type, duration: params.duration });
          return Promise.reject(new Error('busy'));
        },
      },
    };
    input.poll([withRumble]);
    input.rumble(0.8, 5000);
    expect(calls).toEqual([{ type: 'dual-rumble', duration: 400 }]);
  });
});

describe('hit-stop', () => {
  function run(): { clock: ClockController; steps: () => number; frame: () => void } {
    const clock = new ClockController(new EventBus());
    let steps = 0;
    let now = 0;
    clock.setCallbacks(
      () => {
        steps += 1;
      },
      () => {}
    );
    clock.tickFrame(0);
    return {
      clock,
      steps: () => steps,
      frame: () => {
        now += FIXED_DT * 1000;
        clock.tickFrame(now);
      },
    };
  }

  it('freezes the simulation briefly, then carries on without a catch-up burst', () => {
    const { clock, steps, frame } = run();
    for (let i = 0; i < 10; i++) frame();
    const before = steps();
    expect(before).toBeGreaterThanOrEqual(9);

    clock.requestHitStop(0.05); // three 60 Hz frames
    for (let i = 0; i < 3; i++) frame();
    expect(steps()).toBe(before);

    for (let i = 0; i < 6; i++) frame();
    const after = steps() - before;
    expect(after).toBeGreaterThanOrEqual(5);
    expect(after).toBeLessThanOrEqual(7);
  });

  it('is capped so a bad request can never look like a hang', () => {
    const { clock, steps, frame } = run();
    frame();
    const before = steps();
    clock.requestHitStop(30);
    for (let i = 0; i < 12; i++) frame(); // 0.2s
    expect(steps()).toBeGreaterThan(before);
  });
});
