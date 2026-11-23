import Foundation

/// When a 2-Minute Brush on this device really ended.
///
/// The ritual's clock keeps real time while the phone is locked or the app is away (H04,
/// `PacerSessionClock`), so its timer can run out with nobody looking. The app only finds out when
/// it is opened again, which may be the next morning. The brush is then dated at the moment its
/// timer ran out, not at the moment the app came back. Otherwise last night's brush takes one of
/// this morning's two rewards, and the widget and Apple Health show a brush at a time nobody brushed.
///
/// Web twin: `brushRewardDay` in src/engine/persistence/HabitBank.ts, which the web's
/// `completeSession` (BrushAlongOverlay.ts) feeds from `getPacerOverflowSec()`, with the same
/// two-day limit.
public enum BrushEndTime {
    /// The moment a stage's time ran out: `overflowSec` before `now`
    /// (`PacerSessionClock.overflowSec`). A brush that was never left has no overflow: it ended now.
    public static func endedAt(now: Date, overflowSec: Double) -> Date {
        guard overflowSec.isFinite, overflowSec > 0 else { return now }
        return now.addingTimeInterval(-overflowSec)
    }

    /// The day a brush that ended at `endedAt` is paid for: the day it ended. The same limits as
    /// for a brush that arrives late from the Apple Watch (`WatchImportLedger.apply`): one from
    /// the future (a wrong clock) or older than `WatchImportLedger.backdateLimit` counts as now.
    public static func rewardDay(endedAt: Date, now: Date) -> Date {
        endedAt > now || endedAt < now.addingTimeInterval(-WatchImportLedger.backdateLimit) ? now : endedAt
    }
}
