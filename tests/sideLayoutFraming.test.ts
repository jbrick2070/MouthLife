import { describe, expect, it } from 'vitest';
import {
  compactToastText,
  countAffordableLockedUpgrades,
  formatZipPromptText,
  isCampaignWorldUnlocked,
  isCompactViewport,
  pickRecommendedDiveWorld,
  shouldDismissSheetSwipe,
  shouldShowVirtualThumbPad,
  sideLayoutFraming,
} from '../src/ui/hudHelpers';

describe('landscape side-layout framing', () => {
  it('shifts the arch into the free left column and backs the camera off', () => {
    const f = sideLayoutFraming(844, 390, 447, 836);
    expect(f).not.toBeNull();
    expect(f!.shiftX).toBeLessThan(0);
    expect(f!.shiftX).toBeCloseTo(447 / 2 - 422, 5);
    expect(f!.dolly).toBeGreaterThan(1);
  });

  it('ignores portrait and bottom-deck layouts', () => {
    expect(sideLayoutFraming(390, 844, 120, 270)).toBeNull();
    expect(sideLayoutFraming(1280, 800, 200, 1080)).toBeNull();
    expect(sideLayoutFraming(844, 390, 900, 1200)).toBeNull();
  });

  it('keeps the mouth centred under a centred bottom card on a wide desktop window', () => {
    // 2000x1091 browser window with the Brush-Along card centred at the bottom (left 714, right 1302).
    expect(sideLayoutFraming(2000, 1091, 714, 1302)).toBeNull();
    // The same card parked against the right edge is a real side column.
    expect(sideLayoutFraming(2000, 1091, 1240, 1990)).not.toBeNull();
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

  it('always shows the thumbstick on a touch screen, and with a mouse only when Steer is OFF', () => {
    for (const compactViewport of [true, false]) {
      for (const pointerSteerEnabled of [true, false]) {
        expect(shouldShowVirtualThumbPad({ pointerSteerEnabled, compactViewport, coarsePointer: true })).toBe(true);
      }
      expect(shouldShowVirtualThumbPad({ pointerSteerEnabled: true, compactViewport, coarsePointer: false })).toBe(false);
      expect(shouldShowVirtualThumbPad({ pointerSteerEnabled: false, compactViewport, coarsePointer: false })).toBe(true);
    }
  });

  it('drops key names from the current plain-language toasts on phones', () => {
    expect(compactToastText('🌊 Surge is full! Press Q or tap Surge to blast a fluoride wave.', true)).toBe(
      '🌊 Surge is full! Tap Surge to blast a fluoride wave.'
    );
    expect(
      compactToastText('🕹️ Drag on the tooth (or WASD + Space) to scrub • E / 🧵 Floss cleans the narrow gaps!', true)
    ).toBe('🕹️ Drag on the tooth to scrub • 🧵 Floss cleans the narrow gaps!');
    expect(compactToastText('🛡️ Slime dome blocks the brush! Crack it with Floss (E) or Surge (Q).', true)).toBe(
      '🛡️ Slime dome blocks the brush! Crack it with Floss or Surge.'
    );
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

  it('gates locked Globe campaign worlds on Day-1 saves while unlocking via sequential clear or stamps', () => {
    const day1 = {
      world_1: { unlocked: true, completed: false },
      world_2: { unlocked: false, completed: false },
      world_5: { unlocked: false, completed: false },
    };
    expect(isCampaignWorldUnlocked('world_1', day1, 0, 0)).toBe(true);
    expect(isCampaignWorldUnlocked('world_2', day1, 0, 4)).toBe(false);
    expect(isCampaignWorldUnlocked('world_5', day1, 0, 20)).toBe(false);

    // Unlocks via prior stage completion OR Habit Stamp milestone
    const afterW1 = { ...day1, world_1: { unlocked: true, completed: true } };
    expect(isCampaignWorldUnlocked('world_2', afterW1, 1, 4)).toBe(true);
    expect(isCampaignWorldUnlocked('world_2', day1, 4, 4)).toBe(true);
  });
});
