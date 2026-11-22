/**
 * The first city teaches while you play: a new player's goal line names one thing to try at a
 * time, and ticks it off when they do it. Nothing pauses or blocks, steps can be done in any
 * order, and the coach is gone for good after the first sealed zone and the first zip.
 *
 * Pure (no DOM, no timers), so both editions run the same coach. Swift twin:
 * `FirstCityCoach.swift`; `tests/firstCityCoach.test.ts` and `FirstCityCoachTests.swift` share cases.
 */

/** The city that teaches. */
export const COACH_WORLD_ID = 'world_1';
/** Kept with the other one-time hints (`mouthlife.hintsSeen`), outside the save and its Sync Code. */
export const COACH_DONE_HINT_KEY = 'coach_city1';
/** Film cleaned (grid cells) before the first step counts as done: a real sweep, not a touch. */
export const COACH_SWEEP_CELLS = 4;

export type CoachStepId = 'sweep' | 'helper' | 'scan' | 'surge' | 'seal' | 'floss';

export const COACH_STEP_ORDER: readonly CoachStepId[] = ['sweep', 'helper', 'scan', 'surge', 'seal', 'floss'];

/** What the player has done so far. */
export interface CoachState {
  cleanedCells: number;
  done: Readonly<Record<CoachStepId, boolean>>;
}

/** What the game just reported. */
export type CoachEvent =
  | { type: 'scrub'; newlyCleaned: number }
  | { type: 'helperRestored' }
  | { type: 'scanPulsed' }
  | { type: 'surgeFired' }
  | { type: 'zoneSealed' }
  | { type: 'zipped' };

/** What is true right now, from the stage. */
export interface CoachContext {
  /** The Surge meter is full. */
  surgeReady: boolean;
  /** HYDRA-1 is at a gap too narrow to drive through. */
  nearGap: boolean;
}

export function newCoachState(): CoachState {
  return {
    cleanedCells: 0,
    done: { sweep: false, helper: false, scan: false, surge: false, seal: false, floss: false },
  };
}

function mark(state: CoachState, step: CoachStepId): CoachState {
  return state.done[step] ? state : { ...state, done: { ...state.done, [step]: true } };
}

/** Ticks off whatever the event shows the player has done. Never un-ticks anything. */
export function coachAdvance(state: CoachState, event: CoachEvent): CoachState {
  switch (event.type) {
    case 'scrub': {
      const add = Number.isFinite(event.newlyCleaned) ? Math.max(0, event.newlyCleaned) : 0;
      if (add === 0 || state.done.sweep) return state;
      const cleanedCells = state.cleanedCells + add;
      const next = { ...state, cleanedCells };
      return cleanedCells >= COACH_SWEEP_CELLS ? mark(next, 'sweep') : next;
    }
    case 'helperRestored':
      return mark(state, 'helper');
    case 'scanPulsed':
      return mark(state, 'scan');
    case 'surgeFired':
      return mark(state, 'surge');
    case 'zoneSealed':
      return mark(state, 'seal');
    case 'zipped':
      return mark(state, 'floss');
  }
}

/** The coach has nothing left to teach: a zone is sealed and a gap has been flossed. */
export function coachFinished(state: CoachState): boolean {
  return state.done.seal && state.done.floss;
}

/**
 * The one thing to try now, or null when the stage's own goal line should show.
 * - Floss is taught at a gap, wherever the player is in the list (the first zone has none).
 * - Surge is taught only once it is full; Scan only before Surge or the first seal.
 * - After the first seal the coach waits quietly until the player reaches a gap.
 */
export function coachCurrentStep(state: CoachState, ctx: CoachContext): CoachStepId | null {
  if (coachFinished(state)) return null;
  if (!state.done.sweep) return 'sweep';
  if (ctx.nearGap && !state.done.floss) return 'floss';
  if (state.done.seal) return null;
  if (!state.done.helper) return 'helper';
  if (ctx.surgeReady && !state.done.surge) return 'surge';
  if (!state.done.scan && !state.done.surge) return 'scan';
  return 'seal';
}

/** The coach's words: the whole line, and the short one a phone's single-line HUD can hold. */
export const COACH_LINES: Readonly<Record<CoachStepId, { full: string; short: string }>> = {
  sweep: { full: 'Steer over the yellow plaque to scrub it off', short: 'Scrub the plaque' },
  helper: { full: 'Scrub a glowing ring to bring a helper back', short: 'Scrub a glowing ring' },
  scan: { full: 'Try Scan. It shows the plaque you missed', short: 'Try Scan' },
  surge: { full: 'Surge is full. Fire it for a big wave!', short: 'Fire Surge!' },
  seal: { full: 'Clean the whole zone to seal it gold', short: 'Clean the whole zone' },
  floss: { full: 'Floss through the narrow gap', short: 'Floss through the gap' },
};

/** Who gets the coach: a new player's city 1, until it has finished once on this device. */
export function coachApplies(worldId: string, mode: 'ARCADE' | 'PULP_RESCUE', cityCompleted: boolean, seenHints: ReadonlySet<string>): boolean {
  return mode === 'ARCADE' && worldId === COACH_WORLD_ID && !cityCompleted && !seenHints.has(COACH_DONE_HINT_KEY);
}
