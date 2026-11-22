import XCTest
@testable import MouthLifeCore

/// The brush log and reminder rules (the same as the web's tests/brushDays.test.ts).
final class BrushDaysTests: XCTestCase {
    let cal = Calendar.current

    func at(_ y: Int, _ mo: Int, _ d: Int, _ h: Int = 12, _ mi: Int = 0) -> Date {
        cal.date(from: DateComponents(year: y, month: mo, day: d, hour: h, minute: mi))!
    }

    func testTheWeekShowsSevenDaysOldestFirstAndCountsUpToTwo() {
        let week = BrushDays.week([
            "2026-11-19": DailySlotLog(fullRewards: 1, tips: 0),
            "2026-11-18": DailySlotLog(fullRewards: 3, tips: 1),
            "2026-11-13": DailySlotLog(fullRewards: 2, tips: 0),
            "2026-11-12": DailySlotLog(fullRewards: 2, tips: 0),
        ], today: at(2026, 11, 19, 9))
        XCTAssertEqual(week.map(\.dateKey), ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"])
        XCTAssertEqual(week.map(\.full), [2, 0, 0, 0, 0, 2, 1])
        XCTAssertEqual(week[5].tries, 1)
        XCTAssertTrue(week[6].isToday)
        XCTAssertEqual(BrushDays.count(week), 5)
        // across a new year
        let newYear = BrushDays.week([:], today: at(2027, 1, 2))
        XCTAssertEqual(newYear.first?.dateKey, "2026-12-27")
        XCTAssertEqual(newYear.last?.dateKey, "2027-01-02")
    }

    func testRemindersCoverThirtyDaysAndStayQuietOnceBrushed() {
        let m = BrushDays.defaultMorning, e = BrushDays.defaultEvening
        let plan = BrushDays.plan(now: at(2026, 11, 19, 8), morning: m, evening: e, fullToday: 0)
        // 30 days of two, less this morning's (07:30 has passed)
        XCTAssertEqual(plan.count, 59)
        XCTAssertEqual(plan.last?.at, at(2026, 12, 18, 19, 30))
        XCTAssertEqual(plan[0].at, at(2026, 11, 19, 19, 30))
        XCTAssertEqual(plan[0].slot, .evening)
        XCTAssertEqual(plan[1].at, at(2026, 11, 20, 7, 30))
        // brushed once early: no morning nudge today, the evening one stays
        XCTAssertEqual(BrushDays.plan(now: at(2026, 11, 19, 6), morning: m, evening: e, fullToday: 1).prefix(2).map(\.slot), [.evening, .morning])
        // brushed twice already: nothing more today
        let done = BrushDays.plan(now: at(2026, 11, 19, 6), morning: m, evening: e, fullToday: 2)
        XCTAssertEqual(done.first?.at, at(2026, 11, 20, 7, 30))
    }

    // A family that stops opening the app is still reminded for 30 days, and the plan never asks
    // for more notifications than the system keeps waiting for one app (64).
    func testThePlanIsThirtyDaysLongAndStaysUnderTheSystemLimit() {
        let m = BrushDays.defaultMorning, e = BrushDays.defaultEvening
        XCTAssertEqual(BrushDays.daysAhead, 30)
        // the fullest plan: early morning, nothing brushed yet
        let fullest = BrushDays.plan(now: at(2026, 11, 19, 0, 0), morning: m, evening: e, fullToday: 0)
        XCTAssertEqual(fullest.count, BrushDays.daysAhead * BrushDays.Slot.allCases.count)
        XCTAssertEqual(fullest.count, 60)
        XCTAssertLessThanOrEqual(fullest.count, 64)
        // nearest first, each one later than the one before (the scheduler adds them in this order)
        XCTAssertEqual(fullest.map(\.at), fullest.map(\.at).sorted())
        XCTAssertEqual(Set(fullest.map(\.at)).count, fullest.count)
    }

    // M19: times set the wrong way round (Morning 20:00, Evening 08:00) mean the same to the
    // reminders and to the Today widget: the 08:00 brush is the morning one.
    func testReversedTimesMeanTheSameToRemindersAndTheWidget() {
        let morning = 20 * 60, evening = 8 * 60
        let plan = BrushDays.plan(now: at(2026, 11, 19, 6), morning: morning, evening: evening, fullToday: 0)
        XCTAssertEqual(plan[0].at, at(2026, 11, 19, 8))
        XCTAssertEqual(plan[0].slot, .morning)
        XCTAssertEqual(plan[1].at, at(2026, 11, 19, 20))
        XCTAssertEqual(plan[1].slot, .evening)
        let widget = WidgetSnapshot(days: [:], language: "en", morning: morning, evening: evening)
        XCTAssertEqual(widget.morning, 8 * 60)
        XCTAssertEqual(widget.evening, 20 * 60)
        // one brush done before 08:00: the morning reminder is dropped in both
        let afterOne = BrushDays.plan(now: at(2026, 11, 19, 6), morning: morning, evening: evening, fullToday: 1)
        XCTAssertEqual(afterOne[0].slot, .evening)
        XCTAssertEqual(afterOne[0].at, at(2026, 11, 19, 20))
    }
}
