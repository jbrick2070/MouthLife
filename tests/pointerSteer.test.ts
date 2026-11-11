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
