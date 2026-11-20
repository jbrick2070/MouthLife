import XCTest
@testable import MouthLifeCore

/// The widgets' data: what the app writes into the App Group and what the widget works out from it.
final class WidgetSnapshotTests: XCTestCase {
    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return c
    }

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12) -> Date {
        calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
    }

    func testSnapshotKeepsTwoWeeksOfNonEmptyDaysAndTheLanguage() {
        let now = date(2026, 11, 19)
        var slots: [String: DailySlotLog] = [:]
        slots["2026-11-19"] = DailySlotLog(fullRewards: 1, tips: 0)
        slots["2026-11-18"] = DailySlotLog(fullRewards: 2, tips: 1)
        slots["2026-11-06"] = DailySlotLog(fullRewards: 2, tips: 0) // 13 days back: kept
        slots["2026-11-05"] = DailySlotLog(fullRewards: 2, tips: 0) // 14 days back: dropped
        slots["2026-11-10"] = DailySlotLog(fullRewards: 0, tips: 0) // empty: dropped
        let snap = WidgetSnapshot.from(slots: slots, language: .german, now: now, calendar: calendar)
        XCTAssertEqual(Set(snap.days.keys), ["2026-11-19", "2026-11-18", "2026-11-06"])
        XCTAssertEqual(snap.days["2026-11-18"], .init(full: 2, tries: 1))
        XCTAssertEqual(snap.language, "de")
        XCTAssertEqual(snap.coachLanguage, .german)
    }

    func testFourStatesAndTheGoodTryRule() {
        XCTAssertEqual(WidgetDayState(.init(full: 0, tries: 0)), .ready)
        XCTAssertEqual(WidgetDayState(.init(full: 0, tries: 2)), .goodTry)
        XCTAssertEqual(WidgetDayState(.init(full: 1, tries: 0)), .one(withTry: false))
        XCTAssertEqual(WidgetDayState(.init(full: 1, tries: 1)), .one(withTry: true))
        // a third full brush is paid as a tip: two full brushes always win
        XCTAssertEqual(WidgetDayState(.init(full: 2, tries: 1)), .done)
        XCTAssertEqual(WidgetDayState(.init(full: 5, tries: 0)), .done)
        XCTAssertTrue(WidgetDayState.goodTry.glows)
        XCTAssertFalse(WidgetDayState.done.glows)
        XCTAssertEqual(WidgetDayState.one(withTry: true).full, 1)
    }

    func testTodayRollsOverAtMidnightWithoutTheApp() {
        let snap = WidgetSnapshot(days: ["2026-11-19": .init(full: 2, tries: 0)], language: "en")
        XCTAssertEqual(snap.today(at: date(2026, 11, 19, 23), calendar: calendar), .done)
        XCTAssertEqual(snap.today(at: date(2026, 11, 20, 0), calendar: calendar), .ready)
    }

    func testWeekIsSevenDaysOldestFirstTodayLast() {
        let snap = WidgetSnapshot(days: ["2026-11-19": .init(full: 1, tries: 0), "2026-11-13": .init(full: 0, tries: 1)], language: "en")
        let week = snap.week(endingAt: date(2026, 11, 19), calendar: calendar)
        XCTAssertEqual(week.count, 7)
        XCTAssertEqual(week.first?.state, .goodTry)
        XCTAssertEqual(week.last?.state, .one(withTry: false))
        XCTAssertEqual(week.filter(\.isToday).count, 1)
        XCTAssertTrue(week.last!.isToday)
    }

    func testNextBrushFollowsTheReminderRuleAndNeverLooksLate() {
        func at(_ h: Int, _ m: Int = 0, day: Int = 19) -> Date {
            calendar.date(from: DateComponents(year: 2026, month: 11, day: day, hour: h, minute: m))!
        }
        var snap = WidgetSnapshot(days: [:], language: "en")
        // nothing yet: morning, then (morning passed) evening, then (evening passed) tomorrow morning
        XCTAssertEqual(snap.nextBrush(after: at(6), calendar: calendar), at(7, 30))
        XCTAssertEqual(snap.nextBrush(after: at(10), calendar: calendar), at(19, 30))
        XCTAssertEqual(snap.nextBrush(after: at(21), calendar: calendar), at(7, 30, day: 20))
        // one done early: the morning is no longer wanted
        snap.days["2026-11-19"] = .init(full: 1, tries: 0)
        XCTAssertEqual(snap.nextBrush(after: at(6), calendar: calendar), at(19, 30))
        // both done: tomorrow morning
        snap.days["2026-11-19"] = .init(full: 2, tries: 0)
        XCTAssertEqual(snap.nextBrush(after: at(12), calendar: calendar), at(7, 30, day: 20))
        // the grown-up's own times
        let custom = WidgetSnapshot(days: [:], language: "en", morning: 6 * 60 + 45, evening: 20 * 60)
        XCTAssertEqual(custom.nextBrush(after: at(12), calendar: calendar), at(20))
    }

    func testTimelineIsNowThenMidnightsAndBrushTimes() {
        let now = date(2026, 11, 19, 15)
        let dates = WidgetTimeline.entryDates(from: now, calendar: calendar)
        XCTAssertEqual(dates[0], now)
        XCTAssertEqual(dates, dates.sorted())
        XCTAssertEqual(Set(dates).count, dates.count)
        // today 19:30, then tomorrow 00:00, 07:30, 19:30, ...
        XCTAssertEqual(calendar.component(.hour, from: dates[1]), 19)
        XCTAssertEqual(dates[2], calendar.startOfDay(for: date(2026, 11, 20)))
        // today 19:30, then each day 00:00, 05:00, 07:30, 12:00, 19:30
        XCTAssertEqual(dates.count, 1 + 1 + 7 * 5)
        XCTAssertTrue(dates.contains(calendar.date(from: DateComponents(year: 2026, month: 11, day: 20, hour: 12))!))
        XCTAssertTrue(dates.contains(calendar.date(from: DateComponents(year: 2026, month: 11, day: 20, hour: 5))!))
        // across the end of daylight saving time (Nov 1 2026 in California) midnights stay midnights
        let dst = WidgetTimeline.entryDates(from: date(2026, 10, 30, 9), days: 3, calendar: calendar)
        for d in dst.dropFirst() {
            XCTAssertTrue([0, 5, 7, 12, 19].contains(calendar.component(.hour, from: d)), "\(d)")
        }
    }

    func testFileRoundTripAndVersionGuard() {
        let snap = WidgetSnapshot(days: ["2026-11-19": .init(full: 1, tries: 1)], language: "ja", lastBrushAt: date(2026, 11, 19, 8), morning: 400, evening: 1200)
        let data = try! XCTUnwrap(snap.encoded())
        XCTAssertEqual(WidgetSnapshot.decode(data), snap)
        var future = snap
        future.version = 99
        XCTAssertNil(WidgetSnapshot.decode(future.encoded()!))
        XCTAssertNil(WidgetSnapshot.decode(Data("not json".utf8)))
        // no App Group in the test runner: nothing to load, and saving says so
        XCTAssertNil(WidgetSnapshot.load())
        XCTAssertFalse(snap.save())
    }

    func testTodayStatusIsDueNextOrAllDoneNeverLate() {
        func at(_ h: Int, _ m: Int = 0, day: Int = 19) -> Date {
            calendar.date(from: DateComponents(year: 2026, month: 11, day: day, hour: h, minute: m))!
        }
        var snap = WidgetSnapshot(days: [:], language: "en")
        XCTAssertEqual(snap.todayStatus(at: at(6), calendar: calendar), .next(at(7, 30), bedtime: false))
        XCTAssertEqual(snap.todayStatus(at: at(9), calendar: calendar), .due(bedtime: false))
        XCTAssertEqual(snap.todayStatus(at: at(20), calendar: calendar), .due(bedtime: true))
        snap.days["2026-11-19"] = .init(full: 1, tries: 3)
        XCTAssertEqual(snap.todayStatus(at: at(9), calendar: calendar), .next(at(19, 30), bedtime: true))
        XCTAssertEqual(snap.todayStatus(at: at(21), calendar: calendar), .due(bedtime: true))
        snap.days["2026-11-19"] = .init(full: 2, tries: 0)
        XCTAssertEqual(snap.todayStatus(at: at(21), calendar: calendar), .allDone)
        // only the bedtime brush today: done for the day, the next one is tomorrow morning
        let bedOnly = WidgetSnapshot(days: ["2026-11-19": .init(full: 1, tries: 0)], language: "en", lastBrushAt: at(19, 50), lastFullBrushAt: at(19, 50))
        XCTAssertEqual(bedOnly.todayStatus(at: at(21), calendar: calendar), .next(at(7, 30, day: 20), bedtime: false))
        // a brush in the afternoon is not the bedtime brush
        let afternoon = WidgetSnapshot(days: ["2026-11-19": .init(full: 1, tries: 0)], language: "en", lastBrushAt: at(15), lastFullBrushAt: at(15))
        XCTAssertEqual(afternoon.todayStatus(at: at(20), calendar: calendar), .due(bedtime: true))
        // a bedtime brush just after midnight still counts for last night: next is this morning
        let lateNight = WidgetSnapshot(days: ["2026-11-20": .init(full: 1, tries: 0)], language: "en", lastBrushAt: at(0, 20, day: 20), lastFullBrushAt: at(0, 20, day: 20))
        XCTAssertEqual(lateNight.todayStatus(at: at(0, 40, day: 20), calendar: calendar), .next(at(7, 30, day: 20), bedtime: false))
        XCTAssertEqual(lateNight.toothMood(at: at(0, 40, day: 20), calendar: calendar), .happy)
        // times set the wrong way round in Settings are put in order
        let swapped = WidgetSnapshot(days: [:], language: "en", morning: 20 * 60, evening: 8 * 60)
        XCTAssertEqual(swapped.morning, 8 * 60)
        XCTAssertEqual(swapped.evening, 20 * 60)
        XCTAssertEqual(swapped.todayStatus(at: at(8, 5), calendar: calendar), .due(bedtime: false))
    }

    func testToothMoodFollowsTheDayFromFiveToFive() {
        func at(_ h: Int, _ m: Int = 0, day: Int = 19) -> Date {
            calendar.date(from: DateComponents(year: 2026, month: 11, day: day, hour: h, minute: m))!
        }
        func mood(last: Date?, now: Date, full: Int = 0) -> ToothMood {
            WidgetSnapshot(days: full > 0 ? [HabitBank.localDateKey(for: now, calendar: calendar): .init(full: full, tries: 0)] : [:], language: "en", lastBrushAt: last, lastFullBrushAt: last)
                .toothMood(at: now, calendar: calendar)
        }
        let lastNight = at(21, day: 18)
        XCTAssertEqual(mood(last: lastNight, now: at(3)), .happy)        // still last night's happy tooth
        XCTAssertEqual(mood(last: lastNight, now: at(6)), .neutral)      // a new day at 5 AM
        XCTAssertEqual(mood(last: at(7, 40), now: at(9)), .smiling)      // brushed this morning
        XCTAssertEqual(mood(last: at(7, 40), now: at(15)), .meh)         // the afternoon wears it off
        XCTAssertEqual(mood(last: lastNight, now: at(14)), .meh)         // no brush yet today, afternoon
        XCTAssertEqual(mood(last: at(19, 50), now: at(21)), .happy)      // brushed before bed
        XCTAssertEqual(mood(last: at(19, 50), now: at(2, day: 20)), .happy)
        XCTAssertEqual(mood(last: at(19, 50), now: at(5, 30, day: 20)), .neutral)
        // no time known: the count decides
        XCTAssertEqual(mood(last: nil, now: at(9), full: 1), .smiling)
        XCTAssertEqual(mood(last: nil, now: at(21), full: 2), .happy)
        XCTAssertEqual(mood(last: nil, now: at(9)), .neutral)
        // a stale time (yesterday) with two full brushes today from elsewhere: happy
        let synced = WidgetSnapshot(days: ["2026-11-19": .init(full: 2, tries: 0)], language: "en", lastBrushAt: lastNight, lastFullBrushAt: lastNight)
        XCTAssertEqual(synced.toothMood(at: at(10), calendar: calendar), .happy)
        // a short brush moves "Last brush" but not the face
        let short = WidgetSnapshot(days: [:], language: "en", lastBrushAt: at(17, 42), lastFullBrushAt: lastNight)
        XCTAssertEqual(short.toothMood(at: at(18), calendar: calendar), .meh)
        // a first brush after noon (a late morning): smiling until the evening time, never gold
        // while the bedtime brush is still to come
        XCTAssertEqual(mood(last: at(12, 5), now: at(12, 30), full: 1), .smiling)
        XCTAssertEqual(mood(last: at(12, 5), now: at(19), full: 1), .smiling)
        XCTAssertEqual(mood(last: at(12, 5), now: at(19, 45), full: 1), .meh)
        // an evening time before noon ends the morning smile there
        let early = WidgetSnapshot(days: ["2026-11-19": .init(full: 1, tries: 0)], language: "en", lastBrushAt: at(7, 40), lastFullBrushAt: at(7, 40), morning: 7 * 60, evening: 11 * 60)
        XCTAssertEqual(early.toothMood(at: at(10), calendar: calendar), .smiling)
        XCTAssertEqual(early.toothMood(at: at(11, 30), calendar: calendar), .meh)
        // after midnight the tooth's day is still yesterday's: two brushes from a Sync Code stay happy
        let restored = WidgetSnapshot(days: ["2026-11-18": .init(full: 2, tries: 0)], language: "en")
        XCTAssertEqual(restored.toothMood(at: at(1, day: 19), calendar: calendar), .happy)
        XCTAssertEqual(restored.toothMood(at: at(6, day: 19), calendar: calendar), .neutral)
    }

    /// The tooth is never gold while a brush is due, so its sparkles and the toothbrush never meet.
    func testTheGoldToothAndADueBrushNeverMeet() {
        var c = calendar
        c.locale = Locale(identifier: "en_US")
        let start = c.date(from: DateComponents(year: 2026, month: 11, day: 19, hour: 0))!
        let cases: [(Int, Date?)] = [(0, nil), (1, nil), (2, nil)]
            + [7, 11, 12, 15, 19, 20, 23].map { (1, c.date(byAdding: .hour, value: $0, to: start)) }
            + [8, 20].map { (2, c.date(byAdding: .hour, value: $0, to: start)) }
        for (full, last) in cases {
            let snap = WidgetSnapshot(days: full > 0 ? ["2026-11-19": .init(full: full, tries: 0)] : [:], language: "en", lastBrushAt: last, lastFullBrushAt: last)
            for minute in stride(from: 5 * 60, to: 24 * 60, by: 15) {
                let now = c.date(byAdding: .minute, value: minute, to: start)!
                if let last, last > now { continue }
                if case .due = snap.todayStatus(at: now, calendar: c) {
                    XCTAssertNotEqual(snap.toothMood(at: now, calendar: c), .happy, "full \(full) last \(String(describing: last)) at \(now)")
                }
            }
        }
    }

    func testWordsExistInEveryLanguageAndNeverScold() {
        let now = date(2026, 11, 19, 12)
        for lang in CoachLanguage.allCases {
            for w in WidgetWord.allCases {
                XCTAssertFalse(WidgetCopy.word(w, lang).isEmpty, "\(w) \(lang)")
            }
            let letters = WidgetCopy.weekdayLetters(lang)
            XCTAssertEqual(letters.count, 7, "\(lang)")
            XCTAssertEqual(Set(letters).count, 7, "\(lang): \(letters)")
            XCTAssertTrue(WidgetCopy.weekAccessibility(fullBrushes: 9, lang).contains("9"))
            XCTAssertNotNil(WidgetCopy.when(date(2026, 11, 18, 20), now: now, lang, calendar: calendar))
            XCTAssertTrue(WidgetCopy.status(.next(date(2026, 11, 19, 19), bedtime: true), now: now, lang, calendar: calendar).contains(WidgetCopy.word(.bedtime, lang)))
        }
        XCTAssertEqual(WidgetCopy.status(.due(bedtime: true), now: now, .english), "Brush before bed")
        XCTAssertEqual(WidgetCopy.status(.due(bedtime: false), now: now, .german), "Zeit zum Zähneputzen!")
        // a week-old brush leaves the line out (never "8 days ago")
        XCTAssertNil(WidgetCopy.when(date(2026, 11, 11, 20), now: now, .english, calendar: calendar))
        XCTAssertTrue(WidgetCopy.when(date(2026, 11, 18, 20), now: now, .english, calendar: calendar)!.hasPrefix("Yesterday"))
        let voice = WidgetCopy.todayAccessibility(full: 1, lastBrush: date(2026, 11, 19, 7), status: .next(date(2026, 11, 19, 19), bedtime: true), now: now, .english, calendar: calendar)
        XCTAssertTrue(voice.hasPrefix("Brushes today: 1 of 2. Last brush"), voice)
        let banned = ["missed", "miss", "fail", "streak", "lost", "late"]
        for w in WidgetWord.allCases {
            let text = WidgetCopy.word(w, .english).lowercased()
            for b in banned { XCTAssertFalse(text.contains(b), "\(w): \(text)") }
        }
    }
}
