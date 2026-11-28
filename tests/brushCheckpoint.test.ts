import { describe, expect, it } from 'vitest';
import { BrushCheckpoint } from '../src/config/brushCheckpoint';
import { BRUSH_ALONG_FULL_BRUSH_GRACE_SEC, BRUSH_ALONG_TOTAL_SEC } from '../src/config/gameConfig';

/**
 * The rule for keeping an interrupted brush. Twin of the BrushCheckpoint cases in
 * native-apple/Tests/MouthLifeCoreTests/BetaFeedbackTests.swift: the same cases, one for one, so
 * both editions keep the same brushes.
 */
describe('BrushCheckpoint', () => {
  it('a brush under twenty seconds is not kept', () => {
    expect(BrushCheckpoint.isWorthKeeping(0)).toBe(false);
    expect(BrushCheckpoint.isWorthKeeping(19.99)).toBe(false);
    expect(BrushCheckpoint.isWorthKeeping(20)).toBe(true);
    expect(BrushCheckpoint.isWorthKeeping(100)).toBe(true);
    expect(BrushCheckpoint.isWorthKeeping(Number.NaN)).toBe(false);
    expect(BrushCheckpoint.isWorthKeeping(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('the first note is due at once, and then every ten seconds', () => {
    expect(BrushCheckpoint.isDue(null, 0)).toBe(true);
    expect(BrushCheckpoint.isDue(30, 30.05)).toBe(false);
    expect(BrushCheckpoint.isDue(30, 39.99)).toBe(false);
    expect(BrushCheckpoint.isDue(30, 40)).toBe(true);
    // The phone slept for a minute between two ticks.
    expect(BrushCheckpoint.isDue(30, 95)).toBe(true);
  });

  it('a clock that stepped back is due', () => {
    expect(BrushCheckpoint.isDue(500, 3)).toBe(true);
  });

  it('a note counts as full by the same grace as a finished stage', () => {
    const total = BRUSH_ALONG_TOTAL_SEC;
    const grace = BRUSH_ALONG_FULL_BRUSH_GRACE_SEC;
    expect(BrushCheckpoint.countsAsFull(100)).toBe(false);
    expect(BrushCheckpoint.countsAsFull(total - grace - 0.01)).toBe(false);
    expect(BrushCheckpoint.countsAsFull(total - grace)).toBe(true);
    expect(BrushCheckpoint.countsAsFull(total)).toBe(true);
  });
});
