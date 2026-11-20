import Foundation

/// The brush log ("This week") and the grown-up brush reminders: which days had brushes, and when to
/// give a gentle nudge. Pure, and the same rules as the web edition (src/config/brushDays.ts).
/// Never a scolding: a missed day is simply an empty day.
public enum BrushDays {
    /// Full 2-minute brushes a day that count toward the goal (morning and evening).
    public static let goalPerDay = 2
    /// How many days ahead reminders are scheduled (refreshed whenever the app opens).
    public static let daysAhead = 7
    /// 07:30 and 19:30, in minutes after midnight.
    public static let defaultMorning = 7 * 60 + 30
    public static let defaultEvening = 19 * 60 + 30

    public struct Day: Equatable, Sendable {
        public let dateKey: String
        public let date: Date
        /// Full 2-minute brushes, at most the goal.
        public let full: Int
        /// Shorter brushes ("good try").
        public let tries: Int
        public let isToday: Bool
    }

    public enum Slot: String, CaseIterable, Sendable {
        case morning, evening

        /// The words of the reminder (English key; the app shows it in the chosen language).
        public var text: String {
            switch self {
            case .morning: return "Time to brush! 🦷"
            case .evening: return "Time to brush before bed! 🌙"
            }
        }
    }

    /// The last `days` days, oldest first, today last.
    public static func week(_ slots: [String: DailySlotLog], today: Date = Date(), days: Int = 7, calendar: Calendar = .current) -> [Day] {
        let start = calendar.startOfDay(for: today)
        return (0..<days).reversed().map { back in
            let date = calendar.date(byAdding: .day, value: -back, to: start) ?? start
            let key = HabitBank.localDateKey(for: date, calendar: calendar)
            let slot = slots[key]
            return Day(
                dateKey: key,
                date: date,
                full: min(goalPerDay, max(0, slot?.fullRewards ?? 0)),
                tries: max(0, slot?.tips ?? 0),
                isToday: back == 0
            )
        }
    }

    /// Full brushes in those days (each day counts up to the goal).
    public static func count(_ week: [Day]) -> Int { week.reduce(0) { $0 + $1.full } }

    /// Whether today's reminder at this slot is still wanted: the morning one only if nothing is
    /// brushed yet today, the evening one only while today's brushes are not all done.
    public static func wanted(_ slot: Slot, fullToday: Int) -> Bool {
        slot == .morning ? fullToday < 1 : fullToday < goalPerDay
    }

    /// The reminders to schedule from `now`: each morning and evening for the next days, leaving out
    /// today's when the time has passed or that brush is already done.
    /// The grown-up's two times in order. Settings lets them be set either way round; the earlier
    /// one is the morning brush and the later one the evening brush, for the reminders and the
    /// Today widget alike (M19).
    public static func orderedTimes(morning: Int, evening: Int) -> (morning: Int, evening: Int) {
        (min(morning, evening), max(morning, evening))
    }

    public static func plan(now: Date, morning: Int, evening: Int, fullToday: Int, days: Int = daysAhead, calendar: Calendar = .current) -> [(at: Date, slot: Slot)] {
        let (morning, evening) = orderedTimes(morning: morning, evening: evening)
        let start = calendar.startOfDay(for: now)
        var out: [(at: Date, slot: Slot)] = []
        for day in 0..<days {
            guard let dayStart = calendar.date(byAdding: .day, value: day, to: start) else { continue }
            for slot in Slot.allCases {
                let minutes = slot == .morning ? morning : evening
                guard let at = calendar.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: dayStart),
                      at > now else { continue }
                if day == 0 && !wanted(slot, fullToday: fullToday) { continue }
                out.append((at, slot))
            }
        }
        return out
    }
}
