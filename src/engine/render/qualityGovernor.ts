/**
 * The automatic graphics quality. It watches how many frames a second the game is drawing and
 * steps between three levels (low, medium, ultra): down when the game runs slowly, up when there
 * is room to spare. It is plain arithmetic on a small record that is made once: no clock, no
 * screen, nothing new made per frame, so the tests can play ten minutes of frames through it.
 *
 * Two things it must get right (both found in November 2026):
 *
 * 1. A slow frame rate is not always the picture's fault. An iPhone in Low Power Mode draws 30
 *    frames a second on purpose, whatever is on screen; lowering the quality there costs
 *    sharpness and buys nothing. So every lowering is checked once the new level has shown its
 *    speed. If the rate did not rise by QUALITY_LOWER_MIN_GAIN, the governor goes back up and
 *    leaves the level alone for as long as the rate stays near that value.
 *
 * 2. A phone can be fast enough on one level and too slow on the next. Trying the higher level
 *    again every five seconds resized the picture each time, for as long as the game was open.
 *    So a level that proves too slow soon after being raised to is left alone for a minute, then
 *    two, then four, up to ten.
 *
 * Judgement calls (the numbers are in gameConfig.ts; real phones should have the last word):
 *
 * - 15% is the smallest gain worth a blurrier picture. A capped phone gains nothing at all, and a
 *   graphics chip that is truly overloaded gains far more once it has fewer dots to draw, so the
 *   exact figure matters little; it mainly has to sit above the ordinary wobble of the measure.
 * - The rate "before" a lowering is read from the newest 30 frames, not all 90: at the moment
 *   the average crosses the line it is still a blend of the fast frames before and the slow ones.
 *   Those 30 frames must be slow themselves, too: when a cap has just lifted or a stutter has
 *   just ended, the average is only catching up and there is nothing to fix.
 * - If one level down bought nothing and the game is still slow, the next level down is tried
 *   before giving up. On many laptop screens medium and ultra draw the same number of dots and
 *   only low draws fewer, so judging one step alone would strand such a laptop on ultra. The
 *   price: a capped phone on ultra is taken down two steps (about ten seconds) before the
 *   governor is sure nothing helps and puts it back.
 * - "Near that value" is 15% either side of the best rate seen around the lowering. The memory
 *   is dropped when the rate climbs past that (not at the 42 line itself), so a rate that hovers
 *   around 42 is not tried over and over; below it, lowering is simply tried again.
 * - "Soon after being raised to" is a minute, not just the first check five seconds in: real
 *   frame rates wobble, and a level that passes at 43 and fails at 41 is the same flip-flop.
 * - After a failed try nothing is raised until the wait is over (one wait for all levels, not one
 *   each). The doubling starts again once a level has held for more than that minute.
 * - A level that had held for more than a minute and then turns slow is lowered and tried again
 *   five seconds later, with no wait yet; only if that try fails does the waiting begin. A short
 *   slow spell (a stutter while the game starts) then costs seconds of a plainer picture, not a
 *   minute, at the price of one extra down-and-up when the slowness lasts.
 * - Only frames the game draws count as time: not a hidden tab, the finale, or a lost picture.
 *
 * Known limits. If the rate recovers by itself in the five seconds after a lowering (a capped
 * phone that stutters while the game starts, or keeps stalling), the lowering is believed, as it
 * always was. And a level reached in a slow spell is kept while the rate sits between the two
 * lines (42 and 57), as before.
 */
import {
  FPS_DOWNGRADE_THRESHOLD,
  FPS_UPGRADE_THRESHOLD,
  QUALITY_GOVERNOR_COOLDOWN_SEC,
  QUALITY_LOWER_MIN_GAIN,
  QUALITY_RAISE_RETRY_MAX_SEC,
  QUALITY_RAISE_RETRY_MIN_SEC,
  QUALITY_RAISE_TRIAL_SEC,
  QUALITY_RECENT_FRAMES,
  QUALITY_ROLLING_FRAMES,
} from '../../config/gameConfig';
import type { QualityTier } from '../types';

/** The governor decides nothing in the first seconds, while the game is still settling in. */
const START_DELAY_SEC = 3.0;
/** A frame longer than this is a stall (the game was held up), not a measure of speed. */
const LONGEST_FRAME_SEC = 0.25;

/** Everything the governor remembers. Made once and then only written to, never replaced. */
export interface QualityGovernorState {
  /** The lengths of the newest frames in seconds, written round and round. */
  readonly frameSec: Float32Array;
  /** Where the next frame length goes, and how many are in so far. */
  next: number;
  filled: number;
  /** Seconds before the next decision: a new level needs time to show its speed. */
  cooldownSec: number;
  /** Frames a second at the latest decision (sent out with a change of level). */
  fps: number;
  /** The level a lowering started from, until it is known whether lowering helped. */
  loweredFrom: QualityTier | null;
  /** Frames a second just before that lowering. */
  fpsBeforeLowering: number;
  /** The rate that lowering from the present level could not improve; 0 when there is none. */
  heldFps: number;
  /** Seconds left in which the level just raised to counts as "only just raised to". */
  raiseOnTrialSec: number;
  /** Seconds before anything may be raised again. */
  raiseWaitSec: number;
  /** The wait given after the last failed try; the next one is twice as long. */
  raiseRetrySec: number;
}

export function createQualityGovernor(): QualityGovernorState {
  const g: QualityGovernorState = {
    frameSec: new Float32Array(QUALITY_ROLLING_FRAMES),
    next: 0,
    filled: 0,
    cooldownSec: 0,
    fps: 0,
    loweredFrom: null,
    fpsBeforeLowering: 0,
    heldFps: 0,
    raiseOnTrialSec: 0,
    raiseWaitSec: 0,
    raiseRetrySec: 0,
  };
  resetQualityGovernor(g);
  return g;
}

/** Back to the start: nothing measured and nothing remembered. */
function resetQualityGovernor(g: QualityGovernorState): void {
  g.next = 0;
  g.filled = 0;
  g.cooldownSec = START_DELAY_SEC;
  g.fps = 0;
  g.loweredFrom = null;
  g.fpsBeforeLowering = 0;
  g.heldFps = 0;
  g.raiseOnTrialSec = 0;
  g.raiseWaitSec = 0;
  g.raiseRetrySec = 0;
}

/**
 * Takes one drawn frame of `dt` seconds on level `tier`. Returns the level to change to, or null
 * to stay. `auto` is false while a level has been picked by hand.
 */
export function governQuality(
  g: QualityGovernorState,
  dt: number,
  tier: QualityTier,
  auto: boolean
): QualityTier | null {
  if (!auto) {
    // A level picked by hand is not the governor's to judge, and nothing it learned on its own
    // levels applies to it: it starts afresh when the choice is handed back.
    resetQualityGovernor(g);
    return null;
  }
  if (dt <= 0 || dt > LONGEST_FRAME_SEC) return null;

  g.frameSec[g.next] = dt;
  g.next = (g.next + 1) % QUALITY_ROLLING_FRAMES;
  if (g.filled < QUALITY_ROLLING_FRAMES) g.filled++;
  g.cooldownSec = Math.max(0, g.cooldownSec - dt);
  g.raiseWaitSec = Math.max(0, g.raiseWaitSec - dt);
  g.raiseOnTrialSec = Math.max(0, g.raiseOnTrialSec - dt);
  if (g.filled < QUALITY_ROLLING_FRAMES || g.cooldownSec > 0) return null;

  const fps = framesPerSecond(g, QUALITY_ROLLING_FRAMES);
  g.fps = fps;

  // A lowering is waiting to be judged: did it buy anything?
  if (g.loweredFrom !== null) {
    if (fps >= g.fpsBeforeLowering * (1 + QUALITY_LOWER_MIN_GAIN)) {
      // Yes: the lower level stays, and the usual rules below carry on from here.
      g.loweredFrom = null;
      g.heldFps = 0;
    } else if (fps < FPS_DOWNGRADE_THRESHOLD && tier !== 'low') {
      // Not yet, and the game is still slow: the next level down may be the one that helps.
      return changeLevel(g, lowerLevel(tier));
    } else {
      // No. Something other than the picture holds the rate (a 30-a-second cap, a busy
      // processor). Go back to where it started and remember the rate, so it is left alone.
      const back = g.loweredFrom;
      g.loweredFrom = null;
      g.heldFps = Math.max(g.fpsBeforeLowering, fps);
      return changeLevel(g, back);
    }
  }

  // The rate has clearly risen: whatever held it has let go.
  if (g.heldFps > 0 && fps > g.heldFps * (1 + QUALITY_LOWER_MIN_GAIN)) g.heldFps = 0;

  if (fps < FPS_DOWNGRADE_THRESHOLD) {
    if (tier === 'low') return null;
    // Still the rate that lowering could not improve: leave the level alone.
    if (g.heldFps > 0 && fps >= g.heldFps * (1 - QUALITY_LOWER_MIN_GAIN)) return null;
    // The newest frames are fast enough already and the average is only catching up (a cap has
    // just lifted, a stutter has just ended): nothing to fix.
    const recentFps = framesPerSecond(g, QUALITY_RECENT_FRAMES);
    if (recentFps >= FPS_DOWNGRADE_THRESHOLD) return null;
    if (g.raiseOnTrialSec > 0) {
      // This level was only just raised to: wait before raising again, twice as long each time.
      g.raiseRetrySec = Math.min(
        QUALITY_RAISE_RETRY_MAX_SEC,
        Math.max(QUALITY_RAISE_RETRY_MIN_SEC, g.raiseRetrySec * 2)
      );
      g.raiseWaitSec = g.raiseRetrySec;
      g.raiseOnTrialSec = 0;
    } else {
      // It had held for a while, so this is a new situation: the doubling starts again.
      g.raiseRetrySec = 0;
    }
    g.loweredFrom = tier;
    g.fpsBeforeLowering = recentFps;
    return changeLevel(g, lowerLevel(tier));
  }

  if (fps > FPS_UPGRADE_THRESHOLD && tier !== 'ultra' && g.raiseWaitSec <= 0) {
    g.heldFps = 0;
    g.raiseOnTrialSec = QUALITY_RAISE_TRIAL_SEC;
    return changeLevel(g, tier === 'low' ? 'medium' : 'ultra');
  }
  return null;
}

function lowerLevel(tier: QualityTier): QualityTier {
  return tier === 'ultra' ? 'medium' : 'low';
}

/** Every change starts the measuring again, so a level is judged on its own frames only. */
function changeLevel(g: QualityGovernorState, to: QualityTier): QualityTier {
  g.cooldownSec = QUALITY_GOVERNOR_COOLDOWN_SEC;
  g.next = 0;
  g.filled = 0;
  return to;
}

/** Frames a second over the newest `count` frames. */
function framesPerSecond(g: QualityGovernorState, count: number): number {
  let sum = 0;
  for (let i = 1; i <= count; i++) {
    sum += g.frameSec[(g.next - i + QUALITY_ROLLING_FRAMES) % QUALITY_ROLLING_FRAMES];
  }
  return count / Math.max(0.001, sum);
}
