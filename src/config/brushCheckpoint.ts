/**
 * A brush still inside its 2 minutes is noted on the device every few seconds, so one the page never
 * got to finish (the tab closed, the Android app ended in the background, a crash) is still paid at
 * the next start with the seconds really brushed: as a "good try", or as a full brush when the note
 * was written within the grace of the whole 2 minutes (`countsAsFull`, the rule of a finished stage).
 *
 * Only the seconds on the note count: nothing at the next start tells a closed tab from one the
 * system ended, and counting the time since the start would turn a closed tab and a 2-minute wait
 * into a full brush.
 *
 * Pure, the same numbers and rules as its Swift twin `BrushCheckpoint.swift`;
 * `tests/brushCheckpoint.test.ts` and the BrushCheckpoint cases of `BetaFeedbackTests.swift` match
 * one for one. The note itself is kept by `engine/persistence/pendingBrush.ts`.
 */
import { BRUSH_ALONG_FULL_BRUSH_GRACE_SEC, BRUSH_ALONG_TOTAL_SEC } from './gameConfig';

/**
 * Under this, no note is written: a brush that only got this far and was never finished earns
 * nothing (a start by mistake). A tap on "Floss ›" is the player's own choice and is kept whatever
 * the time.
 */
const MIN_BRUSHED_SEC = 20;
/** Seconds between notes while brushing runs. */
const INTERVAL_SEC = 10;

export const BrushCheckpoint = {
  minBrushedSec: MIN_BRUSHED_SEC,
  intervalSec: INTERVAL_SEC,

  /** Whether brushing has gone on long enough to be worth keeping. */
  isWorthKeeping(brushedSec: number): boolean {
    return Number.isFinite(brushedSec) && brushedSec >= MIN_BRUSHED_SEC;
  },

  /**
   * Whether the next note is due. Both times are seconds on the same clock (the web uses the wall
   * clock); `null` means this brush has no note yet. A clock that stepped backwards is due at once.
   */
  isDue(lastWriteClockSec: number | null, nowClockSec: number): boolean {
    if (lastWriteClockSec === null) return true;
    return nowClockSec < lastWriteClockSec || nowClockSec - lastWriteClockSec >= INTERVAL_SEC;
  },

  /** The rule of a finished brushing stage: within the grace of the whole 2 minutes. */
  countsAsFull(brushedSec: number): boolean {
    return brushedSec >= BRUSH_ALONG_TOTAL_SEC - BRUSH_ALONG_FULL_BRUSH_GRACE_SEC;
  },
} as const;
