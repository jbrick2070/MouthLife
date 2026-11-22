import XCTest
@testable import MouthLifeCore

/// A 2-Minute Brush whose timer ran out while the app was away is dated when it really ended, not
/// when the app came back (H04 keeps the ritual's clock running through a locked phone).
final class BrushEndTimeTests: XCTestCase {
    private let cal = Calendar.current

    private func at(_ y: Int, _ mo: Int, _ d: Int, _ h: Int, _ mi: Int = 0) -> Date {
        cal.date(from: DateComponents(year: y, month: mo, day: d, hour: h, minute: mi))!
    }

    func testABrushThatWasNeverLeftEndedNow() {
        let now = at(2026, 11, 20, 20, 3)
        XCTAssertEqual(BrushEndTime.endedAt(now: now, overflowSec: 0), now)
        XCTAssertEqual(BrushEndTime.rewardDay(endedAt: now, now: now), now)
        // nothing but a real, positive overrun moves the time
        XCTAssertEqual(BrushEndTime.endedAt(now: now, overflowSec: -5), now)
        XCTAssertEqual(BrushEndTime.endedAt(now: now, overflowSec: .nan), now)
        XCTAssertEqual(BrushEndTime.endedAt(now: now, overflowSec: .infinity), now)

        // the pacer's own numbers: a session that runs to the end of floss without a lock
        var clock = PacerSessionClock()
        clock.advance(by: 120)
        XCTAssertEqual(BrushEndTime.endedAt(now: now, overflowSec: clock.overflowSec(in: .brushing, mouthwashDurationSec: 60)), now)
        clock.enter(.flossBonus, from: .brushing, mouthwashDurationSec: 60)
        clock.advance(by: 45)
        XCTAssertEqual(BrushEndTime.endedAt(now: now, overflowSec: clock.overflowSec(in: .flossBonus, mouthwashDurationSec: 60)), now)
    }

    // Brushed at 20:00, phone locked 110 s in, app opened again at 06:50: the steps the pacer takes
    // on its way back (brushing, floss, done; the rinse step is off).
    func testABrushLeftOvernightIsPaidForTheEveningItWasBrushed() {
        let start = at(2026, 11, 20, 20)
        let now = start.addingTimeInterval(10 * 3600 + 50 * 60)
        var clock = PacerSessionClock()
        clock.advance(by: 110)
        clock.advance(by: now.timeIntervalSince(start) - 110) // locked until morning

        // brushing ended two minutes after the start, however long the phone stayed locked
        let brushingEnded = BrushEndTime.endedAt(now: now, overflowSec: clock.overflowSec(in: .brushing, mouthwashDurationSec: 60))
        XCTAssertEqual(brushingEnded.timeIntervalSince(start), 120, accuracy: 1e-6)
        clock.enter(.flossBonus, from: .brushing, mouthwashDurationSec: 60)
        // and the ritual ended when the floss time ran out
        let endedAt = BrushEndTime.endedAt(now: now, overflowSec: clock.overflowSec(in: .flossBonus, mouthwashDurationSec: 60))
        XCTAssertEqual(endedAt.timeIntervalSince(start), 165, accuracy: 1e-6)

        let evening = HabitBank.localDateKey(for: start)
        let morning = HabitBank.localDateKey(for: now)
        XCTAssertNotEqual(evening, morning)
        let sys = SaveSystem(bus: EventBus(), storage: InMemorySaveStorage())
        _ = sys.load()
        let outcome = sys.recordBrushAlongCompletion(
            withFlossBonus: true,
            fullBrush: true,
            rinseStepOff: true,
            date: now,
            rewardDay: BrushEndTime.rewardDay(endedAt: endedAt, now: now)
        )
        XCTAssertEqual(outcome.dateKey, evening)
        XCTAssertEqual(outcome.slotType, .full)
        XCTAssertEqual(sys.getSave().dailySlotsByDate[evening]?.fullRewards, 1)
        // this morning keeps both of its rewards and its reminders
        XCTAssertNil(sys.getSave().dailySlotsByDate[morning])
        XCTAssertTrue(BrushDays.wanted(.morning, fullToday: sys.getSave().dailySlotsByDate[morning]?.fullRewards ?? 0))

        // with the rinse step on, the ritual ends when the rinse time runs out
        clock.enter(.mouthwashBonus, from: .flossBonus, mouthwashDurationSec: 30)
        let rinseEnded = BrushEndTime.endedAt(now: now, overflowSec: clock.overflowSec(in: .mouthwashBonus, mouthwashDurationSec: 30))
        XCTAssertEqual(rinseEnded.timeIntervalSince(start), 195, accuracy: 1e-6)
    }

    // A short lock: 20 s away at 1:50 comes back 10 s into floss, and brushing ended 10 s ago.
    func testAShortLockDatesTheEndOfBrushingNotTheReturn() {
        let now = at(2026, 11, 20, 20, 3)
        var clock = PacerSessionClock()
        clock.advance(by: 110)
        clock.advance(by: 20)
        let brushingEnded = BrushEndTime.endedAt(now: now, overflowSec: clock.overflowSec(in: .brushing, mouthwashDurationSec: 60))
        XCTAssertEqual(now.timeIntervalSince(brushingEnded), 10, accuracy: 1e-9)
    }

    // The same limits as a brush arriving late from the Apple Watch.
    func testHowFarBackABrushIsDatedFollowsTheWatchRule() {
        let now = at(2026, 11, 21, 6, 50)
        let limit = WatchImportLedger.backdateLimit
        let atLimit = now.addingTimeInterval(-limit)
        XCTAssertEqual(BrushEndTime.rewardDay(endedAt: atLimit, now: now), atLimit)
        XCTAssertEqual(BrushEndTime.rewardDay(endedAt: atLimit.addingTimeInterval(-1), now: now), now)
        XCTAssertEqual(BrushEndTime.rewardDay(endedAt: now.addingTimeInterval(60), now: now), now)

        // the watch import and the phone agree on the day, inside the limit and past it
        let secondsAgo: [TimeInterval] = [0, 3600, limit - 60, limit + 60, 5 * 86_400]
        for ago in secondsAgo {
            let ended = now.addingTimeInterval(-ago)
            let watch = SaveSystem(bus: EventBus(), storage: InMemorySaveStorage())
            _ = watch.load()
            var ledger = WatchImportLedger()
            let record = WatchBrushRecord(sessionId: "s", brushedSec: 120, floss: .skipped, rinse: .notOffered, rinseOffered: false, completedAt: ended)
            _ = ledger.apply(record, to: watch, now: now)

            let phone = SaveSystem(bus: EventBus(), storage: InMemorySaveStorage())
            _ = phone.load()
            let outcome = phone.recordBrushAlongCompletion(
                withFlossBonus: false,
                fullBrush: true,
                rinseStepOff: true,
                date: now,
                rewardDay: BrushEndTime.rewardDay(endedAt: ended, now: now)
            )
            XCTAssertEqual(Set(watch.getSave().dailySlotsByDate.keys), [outcome.dateKey], "\(ago) s ago")
        }
    }
}
