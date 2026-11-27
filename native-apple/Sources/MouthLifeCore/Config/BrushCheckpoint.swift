import Foundation

/// A brush still inside its 2 minutes is noted on the device every few seconds, so one the app
/// never got to finish (closed, crashed or frozen mid-brush) is still paid at the next launch
/// with the seconds really brushed: as a "good try", or as a full brush when the note was
/// written within the grace of the whole 2 minutes (`countsAsFull`, the rule of a finished stage).
///
/// Only the seconds on the note count. A phone locked mid-brush keeps its time for as long as the
/// app lives (H04, `PacerSessionClock`), but a brush whose app was closed is not assumed to have
/// gone on: at the next launch nothing tells a swipe-away from the system ending the app, and
/// counting the time since the start would turn a swipe and a 2-minute wait into a full brush.
///
/// Phone only, on purpose. The watch keeps its own note and offers to resume instead
/// (`WatchController`), and the web keeps nothing mid-brush.
public enum BrushCheckpoint {
    /// Under this, no note is written: a brush that only got this far and was never finished
    /// earns nothing (a start by mistake). A tap on "Floss ›" is the player's own choice and is
    /// kept whatever the time (`AppCoordinator.skipToFlossNow`).
    public static let minBrushedSec: Double = 20
    /// Seconds between notes while brushing runs.
    public static let intervalSec: Double = 10

    /// Whether brushing has gone on long enough to be worth keeping.
    public static func isWorthKeeping(brushedSec: Double) -> Bool {
        brushedSec.isFinite && brushedSec >= minBrushedSec
    }

    /// Whether the next note is due. Both times are on the session's clock, the one that keeps
    /// counting while the phone sleeps; `nil` means this brush has no note yet. A clock that
    /// stepped backwards (a restart) is due at once.
    public static func isDue(lastWriteClockSec: Double?, nowClockSec: Double) -> Bool {
        guard let last = lastWriteClockSec else { return true }
        return nowClockSec < last || nowClockSec - last >= intervalSec
    }

    /// The rule of a finished brushing stage: within the grace of the whole 2 minutes.
    public static func countsAsFull(brushedSec: Double) -> Bool {
        brushedSec >= GameConfig.brushAlongTotalSec - GameConfig.brushAlongFullBrushGraceSec
    }
}
