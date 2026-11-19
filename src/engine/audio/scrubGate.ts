import type { AppMode } from '../types';

export interface ScrubGateState {
  mode: AppMode;
  /** A city's finale is on screen (or its music is ducking the game). */
  finale: boolean;
  paused: boolean;
  /** The tab is hidden. */
  hidden: boolean;
  /** The stage is still being played (false once the last zone is sealed or the time runs out). */
  stageLive: boolean;
}

/**
 * The brushing sound belongs to a stage that is being played: never over a finale, a score screen,
 * a pause or the main menu. Both the game loop and the sound engine ask this, so a stray update
 * after a city ends cannot leave the brush running. Swift twin: `NativeSoundEngine.scrubMayPlay`.
 */
export function scrubMayPlay(s: ScrubGateState): boolean {
  return (s.mode === 'ARCADE' || s.mode === 'PULP_RESCUE') && s.stageLive && !s.finale && !s.paused && !s.hidden;
}
