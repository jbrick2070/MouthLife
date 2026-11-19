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

    func testRemindersCoverAWeekAndStayQuietOnceBrushed() {
        let m = BrushDays.defaultMorning, e = BrushDays.defaultEvening
        let plan = BrushDays.plan(now: at(2026, 11, 19, 8), morning: m, evening: e, fullToday: 0)
        XCTAssertEqual(plan.count, 13)
        XCTAssertEqual(plan[0].at, at(2026, 11, 19, 19, 30))
        XCTAssertEqual(plan[0].slot, .evening)
        XCTAssertEqual(plan[1].at, at(2026, 11, 20, 7, 30))
        // brushed once early: no morning nudge today, the evening one stays
        XCTAssertEqual(BrushDays.plan(now: at(2026, 11, 19, 6), morning: m, evening: e, fullToday: 1).prefix(2).map(\.slot), [.evening, .morning])
        // brushed twice already: nothing more today
        let done = BrushDays.plan(now: at(2026, 11, 19, 6), morning: m, evening: e, fullToday: 2)
        XCTAssertEqual(done.first?.at, at(2026, 11, 20, 7, 30))
    }
}
