import Foundation

public final class ScoringEngine {
    public private(set) var techniqueRawPts: Double = 0
    public private(set) var sitesRestored: Int = 0
    public private(set) var sucroseHazardsCleared: Int = 0
    public private(set) var acidWarnings: Int = 0
    public private(set) var gumWarnings: Int = 0
    public private(set) var synergyMultiplier: Double = GameConfig.synergyMin
    public private(set) var lastActuatorKind: ActuatorKind? = nil
    public private(set) var idleSinceLastActionSec: Double = 0

    public init() {}

    public func reset() {
        techniqueRawPts = 0
        sitesRestored = 0
        sucroseHazardsCleared = 0
        acidWarnings = 0
        gumWarnings = 0
        synergyMultiplier = GameConfig.synergyMin
        lastActuatorKind = nil
        idleSinceLastActionSec = 0
    }

    public func getSynergyMultiplier() -> Double {
        synergyMultiplier
    }

    private func registerActuatorUse(_ kind: ActuatorKind) {
        if let last = lastActuatorKind, last != kind {
            synergyMultiplier = min(GameConfig.synergyMax, synergyMultiplier + GameConfig.synergyStep)
        }
        lastActuatorKind = kind
        idleSinceLastActionSec = 0
    }

    public func recordSweepingCellsCleaned(_ cellCount: Int, isMovingSweep: Bool) {
        guard cellCount > 0 else { return }
        registerActuatorUse(.brush)
        let basePerCell = isMovingSweep ? 1.5 : 0.6
        techniqueRawPts = min(
            Double(GameConfig.scoreMaxTechnique),
            techniqueRawPts + Double(cellCount) * basePerCell * synergyMultiplier
        )
    }

    public func recordSweepingCellsCleaned(cellCount: Int, isMovingSweep: Bool) {
        recordSweepingCellsCleaned(cellCount, isMovingSweep: isMovingSweep)
    }

    public func recordAcidAbrasionWarning(_ count: Int = 1) {
        guard count > 0 else { return }
        acidWarnings += count
    }

    public func recordGumTenderWarning(_ count: Int = 1) {
        guard count > 0 else { return }
        gumWarnings += count
    }

    public func recordFlossSlice(targetsHit: Int, cellsCleaned: Int) {
        guard targetsHit > 0 || cellsCleaned > 0 else { return }
        registerActuatorUse(.floss)
        let pts = (Double(targetsHit) * 150.0 + Double(cellsCleaned) * 1.8) * synergyMultiplier
        techniqueRawPts = min(Double(GameConfig.scoreMaxTechnique), techniqueRawPts + pts)
    }

    public func recordSucroseCleared(_ count: Int = 1) {
        guard count > 0 else { return }
        sucroseHazardsCleared += count
    }

    public func recordIonRinseSeal(_ cellsSealed: Int) {
        guard cellsSealed > 0 else { return }
        registerActuatorUse(.rinse)
        // Cap per-wave seal points so synergy stays balanced across 3 districts
        let wavePts = min(450.0, Double(cellsSealed) * 0.8) * synergyMultiplier
        techniqueRawPts = min(Double(GameConfig.scoreMaxTechnique), techniqueRawPts + wavePts)
    }

    public func recordIonRinseSeal(cellsSealed: Int) {
        recordIonRinseSeal(cellsSealed)
    }

    public func recordCommensalSiteRestored() {
        sitesRestored += 1
    }

    public func step(dt: Double) {
        guard dt > 0 else { return }
        idleSinceLastActionSec += dt
        if idleSinceLastActionSec > GameConfig.synergyIdleDecayDelaySec &&
            synergyMultiplier > GameConfig.synergyMin {
            synergyMultiplier = max(
                GameConfig.synergyMin,
                synergyMultiplier - GameConfig.synergyDecayPerSec * dt
            )
        }
    }

    public func evaluateBreakdown(
        worldCleanRatio: Double,
        sitesTotal: Int,
        elapsedSec: Double,
        parTimeSec: Double
    ) -> ScoreBreakdown {
        let cleanClamped = max(0.0, min(1.0, worldCleanRatio))
        let restorationPts = Int((cleanClamped * Double(GameConfig.scoreMaxRestoration)).rounded())

        let totalCareWarnings = acidWarnings + gumWarnings
        let careBonus = totalCareWarnings == 0 ? 250 : max(0, 250 - totalCareWarnings * 25)
        let techniquePts = min(
            GameConfig.scoreMaxTechnique,
            Int((techniqueRawPts + Double(careBonus)).rounded())
        )

        let ecologyPts = min(
            GameConfig.scoreMaxEcology,
            sitesRestored * 120 + sucroseHazardsCleared * 50
        )

        var parTimePts = GameConfig.scoreMaxPartime
        if parTimeSec > 0 && elapsedSec > parTimeSec {
            let overRatio = min(1.0, (elapsedSec - parTimeSec) / parTimeSec)
            parTimePts = Int(
                (Double(GameConfig.scoreMaxPartime) -
                 Double(GameConfig.scoreMaxPartime - GameConfig.scoreMinPartimeFloor) * overRatio)
                .rounded()
            )
        }
        parTimePts = max(GameConfig.scoreMinPartimeFloor, min(GameConfig.scoreMaxPartime, parTimePts))

        let totalScore = restorationPts + techniquePts + ecologyPts + parTimePts
        let allSitesRestored = sitesTotal == 0 || sitesRestored >= sitesTotal

        let grade = ScoringEngine.computeGrade(
            totalScore: totalScore,
            cleanRatio: cleanClamped,
            allSitesRestored: allSitesRestored
        )
        let ionsEarned = ScoringEngine.computeIonsEarned(totalScore: totalScore)

        return ScoreBreakdown(
            restorationPts: restorationPts,
            techniquePts: techniquePts,
            ecologyPts: ecologyPts,
            parTimePts: parTimePts,
            totalScore: totalScore,
            grade: grade,
            cleanlinessPct: (cleanClamped * 1000.0).rounded() / 10.0,
            sitesRestored: sitesRestored,
            sitesTotal: sitesTotal,
            elapsedSec: (max(0.0, elapsedSec) * 10.0).rounded() / 10.0,
            ionsEarned: ionsEarned
        )
    }

    public static func computeGrade(
        totalScore: Int,
        cleanRatio: Double = 1.0,
        allSitesRestored: Bool
    ) -> MasteryGrade {
        if totalScore >= 9000 && cleanRatio >= 0.95 && allSitesRestored {
            return .fluorapatiteGold
        }
        if totalScore >= 8500 { return .s }
        if totalScore >= 7200 { return .a }
        if totalScore >= 5500 { return .b }
        return .c
    }

    public static func computeIonsEarned(totalScore: Int) -> Int {
        max(15, Int((Double(totalScore) / 100.0).rounded()))
    }
}
