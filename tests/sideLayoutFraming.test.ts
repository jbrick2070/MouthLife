import { describe, expect, it } from 'vitest';
import {
  compactToastText,
  countAffordableLockedUpgrades,
  formatZipPromptText,
  isCompactViewport,
  pickRecommendedDiveWorld,
  shouldDismissSheetSwipe,
  shouldShowVirtualThumbPad,
  sideLayoutFraming,
} from '../src/ui/hudHelpers';

describe('landscape side-layout framing', () => {
  it('shifts the arch into the free left column and backs the camera off', () => {
    const f = sideLayoutFraming(844, 390, 447);
    expect(f).not.toBeNull();
    expect(f!.shiftX).toBeLessThan(0);
    expect(f!.shiftX).toBeCloseTo(447 / 2 - 422, 5);
    expect(f!.dolly).toBeGreaterThan(1);
  });

  it('ignores portrait and bottom-deck layouts', () => {
    expect(sideLayoutFraming(390, 844, 120)).toBeNull();
    expect(sideLayoutFraming(1280, 800, 200)).toBeNull();
    expect(sideLayoutFraming(844, 390, 900)).toBeNull();
  });
});

describe('mobile gameplay screen-room helpers', () => {
  it('identifies portrait phones and short landscape phones as compact viewports', () => {
    expect(isCompactViewport(375, 667)).toBe(true);
    expect(isCompactViewport(390, 844)).toBe(true);
    expect(isCompactViewport(740, 360)).toBe(true);
    expect(isCompactViewport(844, 390)).toBe(true);
    expect(isCompactViewport(1024, 768)).toBe(false);
    expect(isCompactViewport(1280, 800)).toBe(false);
  });

  it('hides the redundant virtual thumb pad when direct touch-steer is active and reveals it when Steer is OFF', () => {
    expect(shouldShowVirtualThumbPad({ pointerSteerEnabled: true, compactViewport: true })).toBe(false);
    expect(shouldShowVirtualThumbPad({ pointerSteerEnabled: false, compactViewport: true })).toBe(true);
    expect(shouldShowVirtualThumbPad({ pointerSteerEnabled: true, compactViewport: false })).toBe(false);
    expect(shouldShowVirtualThumbPad({ pointerSteerEnabled: false, compactViewport: false })).toBe(true);
  });

  it('shortens the floating interdental Zip prompt on mobile while keeping full hotkey text on desktop', () => {
    expect(formatZipPromptText(true, true)).toBe('🧵 Tap to Zip!');
    expect(formatZipPromptText(false, true)).toBe('🦷 Closer to Zip');
    expect(formatZipPromptText(true, false)).toContain('Right-Click');
    expect(formatZipPromptText(false, false)).toContain('Narrow Alley');
  });

  it('strips desktop keyboard keybind clutter from mobile gameplay toasts', () => {
    const raw = '🌊 Fluoride Surge 100%! Press Q / tap Surge to blast a wave [Q]';
    expect(compactToastText(raw, true)).toBe('🌊 Fluoride Surge 100%! Tap Surge to blast a wave');
    expect(compactToastText(raw, false)).toBe(raw);
    expect(
      compactToastText('🕹️ Drag on the tooth (or WASD + Space) to Sonic Scrub • E / 🧵 Floss slices alleys!', true)
    ).toBe('🕹️ Drag on the tooth to Sonic Scrub • 🧵 Floss slices alleys!');
  });

  it('routes the primary Hub Dive CTA to the next uncleared campaign stage and falls back to Home City once cleared', () => {
    expect(pickRecommendedDiveWorld({}, 'world_3')).toEqual({ worldId: 'world_1', stageNumber: 1 });
    expect(
      pickRecommendedDiveWorld(
        { world_1: { completed: true }, world_2: { completed: true } },
        'world_1'
      )
    ).toEqual({ worldId: 'world_3', stageNumber: 3 });
    expect(
      pickRecommendedDiveWorld(
        {
          world_1: { completed: true },
          world_2: { completed: true },
          world_3: { completed: true },
          world_4: { completed: true },
          world_5: { completed: true },
        },
        'world_4'
      )
    ).toEqual({ worldId: 'world_4', stageNumber: null });
  });

  it('counts affordable locked Lab upgrades for the progressive-disclosure badge', () => {
    const catalog = [
      { id: 'u1', ionCost: 60 },
      { id: 'u2', ionCost: 90 },
      { id: 'u3', ionCost: 140 },
    ];
    expect(countAffordableLockedUpgrades(50, [], catalog)).toBe(0);
    expect(countAffordableLockedUpgrades(95, ['u1'], catalog)).toBe(1);
    expect(countAffordableLockedUpgrades(200, ['u1'], catalog)).toBe(2);
  });

  it('dismisses bottom sheets on deliberate pull-down distance or fast downward flick', () => {
    expect(shouldDismissSheetSwipe(60, 300)).toBe(true);
    expect(shouldDismissSheetSwipe(36, 60)).toBe(true); // 0.6 px/ms flick
    expect(shouldDismissSheetSwipe(20, 250)).toBe(false);
    expect(shouldDismissSheetSwipe(0, 100)).toBe(false);
  });
});
