import { describe, expect, it } from 'vitest';
import {
  BRUSH_CAMERA_CENTER,
  brushCameraAim,
  computeDetailedBrushCamera,
  flossArchIntroZoom01,
  quadrantIntroZoom01,
} from '../src/engine/render/brushCamera';
import type { PacerVisualState } from '../src/engine/render/PacerPropRig';

const brushing = (quadrant: number, surface: number, phaseElapsedSec = 5): PacerVisualState => ({
  stage: 'brushing',
  quadrant,
  surface,
  flossIsUpper: true,
  flossContactIndex: 0,
  flossStepIndex: 0,
  mouthwashProgress01: 0,
  paused: false,
  phaseElapsedSec,
  phaseDurationSec: 10,
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

describe('Detailed 3D Brush-Along cutaway camera & quadrant zoom-out/zoom-in', () => {
  it('starts every quadrant zoomed out to both jaws, then zooms in close', () => {
    expect(quadrantIntroZoom01(0, 0.0, false)).toBe(1);
    expect(quadrantIntroZoom01(0, 0.9, false)).toBe(1);
    expect(quadrantIntroZoom01(0, 1.9, false)).toBeGreaterThan(0.1);
    expect(quadrantIntroZoom01(0, 1.9, false)).toBeLessThan(0.9);
    expect(quadrantIntroZoom01(0, 3.0, false)).toBe(0);
    // Chewing & Inner stay zoomed in (no mid-quadrant zoom-out)
    expect(quadrantIntroZoom01(1, 0.2, false)).toBe(0);
    expect(quadrantIntroZoom01(2, 0.2, false)).toBe(0);
    // Reduce Motion skips the zoom-out -> zoom-in motion
    expect(quadrantIntroZoom01(0, 0.2, true)).toBe(0);

    for (const q of [0, 1, 2, 3]) {
      const start = computeDetailedBrushCamera(brushing(q, 0, 0.2), 1, false);
      const close = computeDetailedBrushCamera(brushing(q, 0, 4.0), 5, false);
      expect(start.distPortrait).toBeGreaterThan(close.distPortrait + 8);
      expect(start.distLandscape).toBeGreaterThan(close.distLandscape + 6);
      expect(start.showUpperJaw && start.showLowerJaw).toBe(true);
      expect(start.introBlend01).toBe(1);
      expect(close.introBlend01).toBe(0);
    }
  });

  it('uses steep signed cutaway pitches and hides the opposite jaw on chewing & inner surfaces', () => {
    const upperChew = computeDetailedBrushCamera(brushing(0, 1, 5), 10, false);
    const lowerChew = computeDetailedBrushCamera(brushing(3, 1, 5), 10, false);
    const upperInner = computeDetailedBrushCamera(brushing(1, 2, 5), 10, false);
    const lowerInner = computeDetailedBrushCamera(brushing(2, 2, 5), 10, false);

    // Upper arch tilts underneath (negative pitch); lower arch tilts from above (positive pitch)
    expect(upperChew.pitch).toBeLessThan(-0.6);
    expect(lowerChew.pitch).toBeGreaterThan(0.6);
    expect(upperInner.pitch).toBeLessThan(-0.5);
    expect(lowerInner.pitch).toBeGreaterThan(0.5);

    // Opposite jaw hidden on chewing & inner for unobstructed cutaway views
    expect(upperChew.showUpperJaw).toBe(true);
    expect(upperChew.showLowerJaw).toBe(false);
    expect(lowerChew.showLowerJaw).toBe(true);
    expect(lowerChew.showUpperJaw).toBe(false);
    expect(upperInner.showUpperJaw).toBe(true);
    expect(upperInner.showLowerJaw).toBe(false);
    expect(lowerInner.showLowerJaw).toBe(true);
    expect(lowerInner.showUpperJaw).toBe(false);
  });

  it('briefly establishes each floss arch before zooming in on contacts', () => {
    expect(flossArchIntroZoom01(0.2, false)).toBe(1);
    expect(flossArchIntroZoom01(2.2, false)).toBe(0);
    expect(flossArchIntroZoom01(0.2, true)).toBe(0);

    const flossStart = computeDetailedBrushCamera(
      { ...brushing(0, 0, 0.2), stage: 'flossBonus', flossIsUpper: false, flossContactIndex: 0 },
      1,
      false
    );
    const flossClose = computeDetailedBrushCamera(
      { ...brushing(0, 0, 3.0), stage: 'flossBonus', flossIsUpper: false, flossContactIndex: 3 },
      4,
      false
    );
    expect(flossStart.distPortrait).toBeGreaterThan(flossClose.distPortrait + 6);
    expect(flossClose.showLowerJaw).toBe(true);
    expect(flossClose.showUpperJaw).toBe(false);
  });
});
