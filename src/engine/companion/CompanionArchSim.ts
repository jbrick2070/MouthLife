import {
  IDLE_ION_RESERVOIR_CAP,
  IDLE_IONS_PER_BASK_HR,
  OFFLINE_BASK_SLOPE_PER_HR,
  OFFLINE_SETTLE_SLOPE_PER_HR,
  PULP_RESCUE_STABILIZE_VALUE,
  PULP_RESCUE_WIN_IONS,
  SMOOTH_BASK_THRESHOLD,
  STASIS_FLOOR_SMOOTHNESS,
  TREAT_ACID_LOAD_POINTS,
  TREAT_ACID_THRESHOLD_SMOOTHNESS,
  TREAT_ION_REWARD,
  TREAT_MAX_REWARDED_PER_HOUR,
  TREAT_SMOOTHNESS_DROP,
} from '../../config/gameConfig';
import type { CompanionState } from '../types';

export const MINI_POLISH_SMOOTHNESS_PER_SPLAT = 5;

export function createInitialCompanionState(nowEpochMs = Date.now()): CompanionState {
  return {
    smoothnessIndex: 92,
    enamelShield: 100,
    dentinShield: 100,
    pulpIntegrity: 100,
    unclaimedIdleIons: 12,
    recentTreatTimestampsMs: [],
    lastEvaluatedEpochMs: nowEpochMs,
  };
}

export class CompanionArchSim {
  /**
   * Reconciles offline/elapsed wall-clock time using the deterministic two-slope Smooth Bask curve.
   * NEVER reduces enamelShield, dentinShield, or pulpIntegrity (Saliva Stasis guarantee).
   */
  static reconcileOfflineElapsed(state: CompanionState, nowEpochMs: number): number {
    const elapsedMs = Math.max(0, nowEpochMs - state.lastEvaluatedEpochMs);
    const elapsedHours = elapsedMs / 3_600_000;
    if (elapsedHours <= 0) {
      state.lastEvaluatedEpochMs = Math.max(state.lastEvaluatedEpochMs, nowEpochMs);
      return 0;
    }

    let ionsAdded = 0;

    if (state.smoothnessIndex >= SMOOTH_BASK_THRESHOLD) {
      const maxBaskHours =
        (state.smoothnessIndex - SMOOTH_BASK_THRESHOLD) / OFFLINE_BASK_SLOPE_PER_HR;
      const baskHours = Math.min(elapsedHours, maxBaskHours);

      // Include minimum 12h window when starting right at 100 (exact 15 / 1.25 = 12.0h)
      const rawIons = Math.floor((baskHours + 1e-9) * IDLE_IONS_PER_BASK_HR);
      const nextReservoir = Math.min(
        IDLE_ION_RESERVOIR_CAP,
        state.unclaimedIdleIons + rawIons
      );
      ionsAdded = nextReservoir - state.unclaimedIdleIons;
      state.unclaimedIdleIons = nextReservoir;

      let nextSmooth = state.smoothnessIndex - baskHours * OFFLINE_BASK_SLOPE_PER_HR;
      const remHours = elapsedHours - baskHours;
      if (remHours > 0) {
        nextSmooth = Math.max(
          STASIS_FLOOR_SMOOTHNESS,
          nextSmooth - remHours * OFFLINE_SETTLE_SLOPE_PER_HR
        );
      }
      state.smoothnessIndex = Math.round(nextSmooth * 100) / 100;
    } else if (state.smoothnessIndex > STASIS_FLOOR_SMOOTHNESS) {
      const settled = Math.max(
        STASIS_FLOOR_SMOOTHNESS,
        state.smoothnessIndex - elapsedHours * OFFLINE_SETTLE_SLOPE_PER_HR
      );
      state.smoothnessIndex = Math.round(settled * 100) / 100;
    } else if (elapsedHours >= 18 && state.smoothnessIndex < STASIS_FLOOR_SMOOTHNESS) {
      // Saliva Stasis gently equilibrates surface pellicle to Morning Fuzz floor without touching shields
      state.smoothnessIndex = STASIS_FLOOR_SMOOTHNESS;
    }

    // Prune rolling 1-hour treat timestamps
    state.recentTreatTimestampsMs = state.recentTreatTimestampsMs.filter(
      (ts) => nowEpochMs - ts < 3_600_000
    );
    state.lastEvaluatedEpochMs = nowEpochMs;
    return ionsAdded;
  }

  static claimIdleReservoir(state: CompanionState): number {
    const claimed = Math.max(0, Math.floor(state.unclaimedIdleIons));
    state.unclaimedIdleIons = 0;
    return claimed;
  }

  /**
   * Restores the Companion Arch to 100% Glassy-Smooth Fresh-Mint Bask!
   */
  static restoreFullSmoothBask(state: CompanionState, nowEpochMs = Date.now()): void {
    state.smoothnessIndex = 100;
    state.enamelShield = 100;
    state.dentinShield = 100;
    state.pulpIntegrity = 100;
    state.lastEvaluatedEpochMs = nowEpochMs;
  }

  /**
   * Feeds the Host a Regional Treat.
   * Applies deterministic 45-point Acid Load cascade (enamel -> dentin -> pulp) when smoothness < 50.
   */
  static feedRegionalTreat(
    state: CompanionState,
    nowEpochMs = Date.now()
  ): {
    ionsGranted: number;
    triggeredPulpRescue: boolean;
  } {
    CompanionArchSim.reconcileOfflineElapsed(state, nowEpochMs);

    const activeWindow = state.recentTreatTimestampsMs.filter(
      (ts) => nowEpochMs - ts < 3_600_000
    );
    const canReward = activeWindow.length < TREAT_MAX_REWARDED_PER_HOUR;
    const ionsGranted = canReward ? TREAT_ION_REWARD : 0;
    activeWindow.push(nowEpochMs);
    state.recentTreatTimestampsMs = activeWindow.slice(-12);

    state.smoothnessIndex = Math.max(0, state.smoothnessIndex - TREAT_SMOOTHNESS_DROP);

    if (state.smoothnessIndex < TREAT_ACID_THRESHOLD_SMOOTHNESS) {
      let remainingAcid = TREAT_ACID_LOAD_POINTS;

      const enamelAbsorbed = Math.min(state.enamelShield, remainingAcid);
      state.enamelShield -= enamelAbsorbed;
      remainingAcid -= enamelAbsorbed;

      if (remainingAcid > 0) {
        const dentinAbsorbed = Math.min(state.dentinShield, remainingAcid);
        state.dentinShield -= dentinAbsorbed;
        remainingAcid -= dentinAbsorbed;
      }

      if (remainingAcid > 0) {
        state.pulpIntegrity = Math.max(0, state.pulpIntegrity - remainingAcid);
      }
    }

    state.lastEvaluatedEpochMs = nowEpochMs;
    return {
      ionsGranted,
      triggeredPulpRescue: state.pulpIntegrity <= 0,
    };
  }

  /**
   * HUB mini-polish: each sugar splat rubbed off the 3D Companion teeth restores a little surface
   * smoothness. Never touches enamel/dentin/pulp shields (only Brush-Along or a dive heals those).
   */
  static applyMiniPolish(state: CompanionState, splatsCleared: number, nowEpochMs = Date.now()): number {
    if (splatsCleared <= 0) return 0;
    const before = state.smoothnessIndex;
    state.smoothnessIndex = Math.min(100, before + MINI_POLISH_SMOOTHNESS_PER_SPLAT * splatsCleared);
    state.lastEvaluatedEpochMs = Math.max(state.lastEvaluatedEpochMs, nowEpochMs);
    return state.smoothnessIndex - before;
  }

  /**
   * Resolves the 90s Pulp Rescue Scramble without permadeath on either outcome.
   */
  static resolvePulpRescue(
    state: CompanionState,
    won: boolean,
    nowEpochMs = Date.now()
  ): { ionsAwarded: number } {
    if (won) {
      CompanionArchSim.restoreFullSmoothBask(state, nowEpochMs);
      return { ionsAwarded: PULP_RESCUE_WIN_IONS };
    }
    // Non-punitive Emergency Calcium-Hydroxide Stabilization
    state.smoothnessIndex = PULP_RESCUE_STABILIZE_VALUE;
    state.enamelShield = PULP_RESCUE_STABILIZE_VALUE;
    state.dentinShield = PULP_RESCUE_STABILIZE_VALUE;
    state.pulpIntegrity = PULP_RESCUE_STABILIZE_VALUE;
    state.lastEvaluatedEpochMs = nowEpochMs;
    return { ionsAwarded: 0 };
  }
}
