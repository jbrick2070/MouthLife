import { describe, expect, it } from 'vitest';
import { BRUSH_CAMERA_CENTER, brushCameraAim } from '../src/engine/render/brushCamera';

const brushing = (quadrant: number, surface: number) => ({
  stage: 'brushing' as const,
  quadrant,
  surface,
  flossIsUpper: true,
  flossContactIndex: 0,
});

describe('Brush-Along camera aim', () => {
  it('swings toward the cheek for the outside, and across the mouth for the inside', () => {
    // Quadrant 0 is upper right: screen-right in the mirror.
    const outer = brushCameraAim(brushing(0, 0), false);
    const inner = brushCameraAim(brushing(0, 2), false);
    expect(outer.yaw).toBeGreaterThan(0.3);
    expect(inner.yaw).toBeLessThan(-0.1);
    expect(outer.side).toBe(1);
    expect(outer.lift).toBe(1);
    // Lower left mirrors it.
    const lowerLeft = brushCameraAim(brushing(2, 0), false);
    expect(lowerLeft.yaw).toBeCloseTo(-outer.yaw, 6);
    expect(lowerLeft.lift).toBe(-1);
  });

  it('looks down more steeply for the chewing tops', () => {
    const tops = brushCameraAim(brushing(3, 1), false);
    expect(tops.pitchAdd).toBeGreaterThan(brushCameraAim(brushing(3, 0), false).pitchAdd);
    expect(Math.abs(tops.yaw)).toBeLessThan(Math.abs(brushCameraAim(brushing(3, 0), false).yaw));
  });

  it('follows the floss contact from the patient right to left', () => {
    const start = brushCameraAim({ ...brushing(0, 0), stage: 'flossBonus', flossContactIndex: 0 }, false);
    const end = brushCameraAim({ ...brushing(0, 0), stage: 'flossBonus', flossContactIndex: 12, flossIsUpper: false }, false);
    expect(start.side).toBe(1);
    expect(end.side).toBe(-1);
    expect(end.lift).toBe(-1);
  });

  it('centres for the rinse and when nothing is running', () => {
    expect(brushCameraAim({ ...brushing(0, 0), stage: 'mouthwashBonus' }, false)).toEqual(BRUSH_CAMERA_CENTER);
    expect(brushCameraAim(null, false)).toEqual(BRUSH_CAMERA_CENTER);
  });

  it('only slides, never orbits, with reduced motion', () => {
    const aim = brushCameraAim(brushing(0, 2), true);
    expect(aim.yaw).toBe(0);
    expect(aim.pitchAdd).toBe(0);
    expect(aim.dolly).toBe(1);
    expect(aim.side).toBe(1);
  });
});
