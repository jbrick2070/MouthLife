import Foundation

/// The brushing ritual's session clock, on real time (H04): 0..120 s brushing, 120..165 s floss,
/// then the 30 or 60 s rinse. It keeps running while the phone is locked or the app is in the
/// background; only the player's Pause stops it (the caller simply stops advancing it).
///
/// It may run past the end of the current stage until the ritual moves on. That overflow carries
/// into the next stage, so 20 s locked at 1:50 of brushing comes back 10 s into floss, and a long
/// lock passes through every stage that ended meanwhile. Web twin: `ClockController`'s
/// `pacerRawSec` / `getPacerOverflowSec`.
public struct PacerSessionClock: Equatable, Sendable {
    /// Seconds since the ritual started, not held at the stage's end.
    public private(set) var rawSec: Double

    public init(rawSec: Double = 0) {
        self.rawSec = max(0, rawSec)
    }

    /// The session-clock second at which `stage` ends.
    public static func stageEndSec(_ stage: PacerStage, mouthwashDurationSec: Double) -> Double {
        let flossEnd = GameConfig.brushAlongTotalSec + GameConfig.brushAlongFlossBonusSec
        switch stage {
        case .brushing: return GameConfig.brushAlongTotalSec
        case .flossBonus: return flossEnd
        case .mouthwashBonus: return flossEnd + mouthwashDurationSec
        }
    }

    /// Where `stage` starts on the session clock.
    public static func stageStartSec(_ stage: PacerStage) -> Double {
        switch stage {
        case .brushing: return 0
        case .flossBonus: return GameConfig.brushAlongTotalSec
        case .mouthwashBonus: return GameConfig.brushAlongTotalSec + GameConfig.brushAlongFlossBonusSec
        }
    }

    /// The clock as shown: held at the end of `stage` until the ritual moves on.
    public func elapsedSec(in stage: PacerStage, mouthwashDurationSec: Double) -> Double {
        min(Self.stageEndSec(stage, mouthwashDurationSec: mouthwashDurationSec), rawSec)
    }

    /// How far the clock has run past the end of `stage` (time spent locked or in the background).
    public func overflowSec(in stage: PacerStage, mouthwashDurationSec: Double) -> Double {
        max(0, rawSec - Self.stageEndSec(stage, mouthwashDurationSec: mouthwashDurationSec))
    }

    /// Real time passed while running. A clock set back never runs it backwards.
    public mutating func advance(by seconds: Double) {
        guard seconds.isFinite, seconds > 0 else { return }
        rawSec += seconds
    }

    /// Moves from `current` into `next`, starting at `next`'s offset plus any time already past the
    /// end of `current`. A jump ahead by the player (before `current` ended) carries nothing.
    public mutating func enter(_ next: PacerStage, from current: PacerStage, mouthwashDurationSec: Double) {
        let carry = overflowSec(in: current, mouthwashDurationSec: mouthwashDurationSec)
        rawSec = Self.stageStartSec(next) + carry
    }

    /// Switching the rinse between 60 s and 30 s mid-rinse keeps the same fraction of it done.
    public mutating func rescaleRinse(from oldDurationSec: Double, to newDurationSec: Double) {
        let start = Self.stageStartSec(.mouthwashBonus)
        let oldDur = max(6.0, oldDurationSec)
        let newDur = max(6.0, newDurationSec)
        let frac = min(0.98, max(0.0, (min(rawSec, start + oldDur) - start) / oldDur))
        rawSec = start + frac * newDur
    }
}
