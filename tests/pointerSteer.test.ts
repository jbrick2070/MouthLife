import { describe, expect, it } from 'vitest';
import { computePointerSteer, resolvePointerSteerForType } from '../src/engine/InputManager';

describe('Pointer drag/click-to-steer', () => {
  it('defaults to ON for touch/pen and OFF for mouse in auto mode, while honoring explicit overrides', () => {
    expect(resolvePointerSteerForType('auto', 'touch')).toBe(true);
    expect(resolvePointerSteerForType('auto', 'pen')).toBe(true);
    expect(resolvePointerSteerForType('auto', 'mouse')).toBe(false);

    expect(resolvePointerSteerForType('on', 'mouse')).toBe(true);
    expect(resolvePointerSteerForType('on', 'touch')).toBe(true);
    expect(resolvePointerSteerForType('off', 'touch')).toBe(false);
    expect(resolvePointerSteerForType('off', 'mouse')).toBe(false);
  });

  it('holds still inside the dead zone so tapping on HYDRA-1 scrubs in place', () => {
    expect(computePointerSteer({ x: 10, z: 10 }, { x: 10.3, z: 10.2 })).toEqual({ moveX: 0, moveZ: 0 });
  });

  it('steers toward the touched tooth surface with arrival easing and full speed far away', () => {
    const near = computePointerSteer({ x: 10, z: 10 }, { x: 11, z: 10 });
    const far = computePointerSteer({ x: 10, z: 10 }, { x: 20, z: 10 });
    expect(near.moveX).toBeGreaterThan(0);
    expect(near.moveX).toBeLessThan(far.moveX);
    expect(far.moveX).toBeCloseTo(1, 5);
    expect(Math.abs(far.moveZ)).toBeLessThan(1e-9);

    const diag = computePointerSteer({ x: 0, z: 0 }, { x: -5, z: -5 });
    expect(Math.hypot(diag.moveX, diag.moveZ)).toBeCloseTo(1, 5);
    expect(diag.moveX).toBeLessThan(0);
    expect(diag.moveZ).toBeLessThan(0);
  });
});

import { isDoubleTap, smoothSteerVector } from '../src/engine/InputManager';

describe('Phase 3 steering helpers', () => {
  it('detects double taps by time and distance only', () => {
    const a = { t: 1000, x: 100, y: 100 };
    expect(isDoubleTap(null, a)).toBe(false);
    expect(isDoubleTap(a, { t: 1200, x: 120, y: 110 })).toBe(true);
    expect(isDoubleTap(a, { t: 1500, x: 100, y: 100 })).toBe(false);
    expect(isDoubleTap(a, { t: 1100, x: 300, y: 100 })).toBe(false);
  });

  it('smooths steering toward the target and settles to exact zero', () => {
    let v = { moveX: 0, moveZ: 0 };
    v = smoothSteerVector(v, { moveX: 1, moveZ: 0 }, 0.5);
    expect(v.moveX).toBeCloseTo(0.5);
    for (let i = 0; i < 30; i++) v = smoothSteerVector(v, { moveX: 0, moveZ: 0 }, 0.5);
    expect(v).toEqual({ moveX: 0, moveZ: 0 });
  });
});
