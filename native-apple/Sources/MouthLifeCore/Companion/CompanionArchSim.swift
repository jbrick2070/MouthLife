import Foundation

public struct TreatFeedOutcome: Codable, Equatable, Sendable {
    public var ionsGranted: Int
    public var triggeredPulpRescue: Bool

    public var ionsAwarded: Int { ionsGranted }

    public init(ionsGranted: Int, triggeredPulpRescue: Bool) {
        self.ionsGranted = ionsGranted
        self.triggeredPulpRescue = triggeredPulpRescue
    }
}

public func createInitialCompanionState(
    nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
) -> CompanionState {
    CompanionState(
        smoothnessIndex: 92.0,
        enamelShield: 100.0,
        dentinShield: 100.0,
        pulpIntegrity: 100.0,
        unclaimedIdleIons: 12,
        recentTreatTimestampsMs: [],
        lastEvaluatedEpochMs: nowEpochMs
    )
}

public enum CompanionArchSim {
    public static let miniPolishSmoothnessPerSplat: Double = 5.0
    public static let treatSmoothnessFloor: Double = 10.0
    public static let pulpRescueStabilizeSmoothnessFloor: Double = 65.0
    private static let oneHourMs: Int64 = 3_600_000

    public static func currentEpochMs() -> Int64 {
        Int64((Date().timeIntervalSince1970 * 1000.0).rounded())
    }

    public static func createInitialState(nowEpochMs: Int64 = currentEpochMs()) -> CompanionState {
        createInitialCompanionState(nowEpochMs: nowEpochMs)
    }

    /// Reconciles offline/elapsed wall-clock time using the deterministic two-slope Smooth Bask curve.
    /// NEVER reduces `enamelShield`, `dentinShield`, or `pulpIntegrity` (Saliva Stasis guarantee).
    @discardableResult
    public static func reconcileOfflineElapsed(_ state: inout CompanionState, nowEpochMs: Int64) -> Int {
        let elapsedMs = max(Int64(0), nowEpochMs - state.lastEvaluatedEpochMs)
        let elapsedHours = Double(elapsedMs) / 3_600_000.0
        if elapsedHours <= 0 {
            state.lastEvaluatedEpochMs = max(state.lastEvaluatedEpochMs, nowEpochMs)
            return 0
        }

        var ionsAdded = 0

        if state.smoothnessIndex >= GameConfig.smoothBaskThreshold {
            let maxBaskHours = (state.smoothnessIndex - GameConfig.smoothBaskThreshold) / GameConfig.offlineBaskSlopePerHr
            let baskHours = min(elapsedHours, maxBaskHours)

            // Include minimum 12h window when starting right at 100 (exact 15 / 1.25 = 12.0h)
            let rawIons = Int(floor((baskHours + 1e-9) * GameConfig.idleIonsPerBaskHr))
            let nextReservoir = min(
                GameConfig.idleIonReservoirCap,
                state.unclaimedIdleIons + rawIons
            )
            ionsAdded = nextReservoir - state.unclaimedIdleIons
            state.unclaimedIdleIons = nextReservoir

            var nextSmooth = state.smoothnessIndex - baskHours * GameConfig.offlineBaskSlopePerHr
            let remHours = elapsedHours - baskHours
            if remHours > 0 {
                nextSmooth = max(
                    GameConfig.stasisFloorSmoothness,
                    nextSmooth - remHours * GameConfig.offlineSettleSlopePerHr
                )
            }
            state.smoothnessIndex = (nextSmooth * 100.0).rounded() / 100.0
        } else if state.smoothnessIndex > GameConfig.stasisFloorSmoothness {
            let settled = max(
                GameConfig.stasisFloorSmoothness,
                state.smoothnessIndex - elapsedHours * GameConfig.offlineSettleSlopePerHr
            )
            state.smoothnessIndex = (settled * 100.0).rounded() / 100.0
        } else if elapsedHours >= 18.0 && state.smoothnessIndex < GameConfig.stasisFloorSmoothness {
            // Saliva Stasis gently equilibrates surface pellicle to Morning Fuzz floor without touching shields
            state.smoothnessIndex = GameConfig.stasisFloorSmoothness
        }

        state.recentTreatTimestampsMs = state.recentTreatTimestampsMs.filter { ts in
            nowEpochMs - ts < oneHourMs
        }
        state.lastEvaluatedEpochMs = nowEpochMs
        return ionsAdded
    }

    @discardableResult
    public static func evaluateOffline(_ state: inout CompanionState, nowEpochMs: Int64) -> Int {
        reconcileOfflineElapsed(&state, nowEpochMs: nowEpochMs)
    }

    @discardableResult
    public static func claimIdleIons(_ state: inout CompanionState) -> Int {
        let claimed = max(0, state.unclaimedIdleIons)
        state.unclaimedIdleIons = 0
        return claimed
    }

    @discardableResult
    public static func claimIdleReservoir(_ state: inout CompanionState) -> Int {
        claimIdleIons(&state)
    }

    /// Restores the Companion Arch to 100% Glassy-Smooth Fresh-Mint Bask!
    public static func restoreFullSmoothBask(_ state: inout CompanionState, nowEpochMs: Int64? = nil) {
        state.smoothnessIndex = 100.0
        state.enamelShield = 100.0
        state.dentinShield = 100.0
        state.pulpIntegrity = 100.0
        if let nowEpochMs {
            state.lastEvaluatedEpochMs = nowEpochMs
        }
    }

    /// Feeds the Host a Regional Treat.
    /// Applies 3-treat rolling 1h reward cap (+20 Ions), -35 smoothness drop to floor 10,
    /// and deterministic 45-point Acid Load cascade (enamel -> dentin -> pulp) when smoothness < 50.
    @discardableResult
    public static func feedRegionalTreat(
        _ state: inout CompanionState,
        nowEpochMs: Int64 = currentEpochMs()
    ) -> TreatFeedOutcome {
        reconcileOfflineElapsed(&state, nowEpochMs: nowEpochMs)

        var activeWindow = state.recentTreatTimestampsMs.filter { ts in
            nowEpochMs - ts < oneHourMs
        }
        let canReward = activeWindow.count < GameConfig.treatMaxRewardedPerHour
        let ionsGranted = canReward ? GameConfig.treatIonReward : 0
        activeWindow.append(nowEpochMs)
        state.recentTreatTimestampsMs = Array(activeWindow.suffix(12))

        state.smoothnessIndex = max(
            treatSmoothnessFloor,
            state.smoothnessIndex - GameConfig.treatSmoothnessDrop
        )

        if state.smoothnessIndex < GameConfig.treatAcidThresholdSmoothness {
            var remainingAcid = GameConfig.treatAcidLoadPoints

            let enamelAbsorbed = min(state.enamelShield, remainingAcid)
            state.enamelShield -= enamelAbsorbed
            remainingAcid -= enamelAbsorbed

            if remainingAcid > 0 {
                let dentinAbsorbed = min(state.dentinShield, remainingAcid)
                state.dentinShield -= dentinAbsorbed
                remainingAcid -= dentinAbsorbed
            }

            if remainingAcid > 0 {
                state.pulpIntegrity = max(0.0, state.pulpIntegrity - remainingAcid)
            }
        }

        state.lastEvaluatedEpochMs = nowEpochMs
        return TreatFeedOutcome(
            ionsGranted: ionsGranted,
            triggeredPulpRescue: state.pulpIntegrity <= 0.0
        )
    }

    /// Restores full 100% Smooth Bask & shields after a 2-Minute Brush-Along session.
    public static func applyBrushAlongPolish(
        _ state: inout CompanionState,
        includedFlossBonus: Bool,
        nowEpochMs: Int64? = nil
    ) {
        _ = includedFlossBonus
        restoreFullSmoothBask(&state, nowEpochMs: nowEpochMs)
    }

    /// Restores full 100% Smooth Bask & shields after clearing an Arcade Dive world.
    public static func applyArcadeWorldClearPolish(
        _ state: inout CompanionState,
        nowEpochMs: Int64? = nil
    ) {
        restoreFullSmoothBask(&state, nowEpochMs: nowEpochMs)
    }

    /// HUB mini-polish: each sugar splat rubbed off the 3D Companion teeth restores a little surface
    /// smoothness. Never touches enamel/dentin/pulp shields (only Brush-Along or a dive heals those).
    @discardableResult
    public static func applyMiniPolish(
        _ state: inout CompanionState,
        splatsCleared: Int,
        nowEpochMs: Int64? = nil
    ) -> Double {
        guard splatsCleared > 0 else { return 0.0 }
        let before = state.smoothnessIndex
        state.smoothnessIndex = min(100.0, before + miniPolishSmoothnessPerSplat * Double(splatsCleared))
        if let nowEpochMs {
            state.lastEvaluatedEpochMs = max(state.lastEvaluatedEpochMs, nowEpochMs)
        }
        return state.smoothnessIndex - before
    }

    /// Resolves the 90s Pulp Rescue Scramble without permadeath on either outcome.
    /// Returns bonus Fluoride Ions awarded (`40` on win, `0` on stabilization).
    @discardableResult
    public static func resolvePulpRescue(
        _ state: inout CompanionState,
        won: Bool,
        nowEpochMs: Int64? = nil
    ) -> Int {
        if won {
            restoreFullSmoothBask(&state, nowEpochMs: nowEpochMs)
            return GameConfig.pulpRescueWinIons
        }
        // Non-punitive Emergency Calcium-Hydroxide Ca(OH)₂ Stabilization
        state.smoothnessIndex = max(state.smoothnessIndex, pulpRescueStabilizeSmoothnessFloor)
        state.enamelShield = max(state.enamelShield, GameConfig.pulpRescueStabilizeValue)
        state.dentinShield = max(state.dentinShield, GameConfig.pulpRescueStabilizeValue)
        state.pulpIntegrity = GameConfig.pulpRescueStabilizeValue
        if let nowEpochMs {
            state.lastEvaluatedEpochMs = nowEpochMs
        }
        return 0
    }
}
