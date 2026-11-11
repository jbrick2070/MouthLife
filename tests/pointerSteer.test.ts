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

import { isDoubleTap, isModalDialogOpen, smoothSteerVector } from '../src/engine/InputManager';

describe('Phase 3 steering helpers', () => {
  it('detects double taps by time and distance only', () => {
    const a = { t: 1000, x: 100, y: 100 };
    expect(isDoubleTap(null, a)).toBe(false);
    expect(isDoubleTap(a, { t: 1200, x: 120, y: 110 })).toBe(true);
    expect(isDoubleTap(a, { t: 1500, x: 100, y: 100 })).toBe(false);
    expect(isDoubleTap(a, { t: 1100, x: 300, y: 100 })).toBe(false);
  });

  it('produces the same steering response for equal elapsed time at 30 and 120 Hz', () => {
    const start = { moveX: 0, moveZ: 0 };
    const target = { moveX: 0.9, moveZ: -0.4 };
    let v = start;
    for (let i = 0; i < 4; i++) v = smoothSteerVector(v, target, 1 / 120);
    const slow = smoothSteerVector(start, target, 1 / 30);
    expect(v.moveX).toBeCloseTo(slow.moveX, 12);
    expect(v.moveZ).toBeCloseTo(slow.moveZ, 12);
    expect(smoothSteerVector(start, target, 0)).toEqual(start);
  });

  it('detects visible modal dialogs so Tab/Shift+Tab inside Pause Sheet never fire gameplay hotkeys', () => {
    const hiddenDoc = {
      documentElement: { clientWidth: 390 },
      querySelectorAll: () => [{ getClientRects: () => [] }],
    } as unknown as Document;
    const openDoc = {
      documentElement: { clientWidth: 390 },
      querySelectorAll: () => [{ getClientRects: () => [{ width: 320, height: 420 }] }],
    } as unknown as Document;
    expect(isModalDialogOpen(undefined)).toBe(false);
    expect(isModalDialogOpen(hiddenDoc)).toBe(false);
    expect(isModalDialogOpen(openDoc)).toBe(true);
  });
});
