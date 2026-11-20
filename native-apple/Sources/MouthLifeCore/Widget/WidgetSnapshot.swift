import Foundation

/// What the Home Screen widgets know: an anonymous copy of the brush log, written by the app into
/// the App Group and read by the widget extension. No name, no city, no settings beyond the language.
/// Nothing leaves the device.
public struct WidgetSnapshot: Codable, Equatable, Sendable {
    public struct DayCount: Codable, Equatable, Sendable {
        public var full: Int
        public var tries: Int

        public init(full: Int, tries: Int) {
            self.full = full
            self.tries = tries
        }
    }

    /// Bumped if the shape ever changes; a widget that finds another version shows "Open MouthLife".
    public static let currentVersion = 1
    /// The App Group both the app and the widget extension join.
    public static let appGroup = "group.org.mouthlife.plaque"
    public static let fileName = "widget-snapshot.json"
    /// Days kept: a week to show, a week of slack for a phone left closed.
    public static let daysKept = 14

    public var version: Int
    /// Local "yyyy-MM-dd" (as `HabitBank.localDateKey`) to that day's counts.
    public var days: [String: DayCount]
    /// The coach language's two-letter code (`CoachLanguage.rawValue`).
    public var language: String
    /// When the last brush on this device ended (any brush), if known. Kept on the device only
    /// (not in the save or the Sync Code).
    public var lastBrushAt: Date?
    /// When the last full 2-minute brush ended (the tooth's face follows full brushes only).
    public var lastFullBrushAt: Date?
    /// The grown-up's two brush times, in minutes after midnight (`BrushDays.defaultMorning` /
    /// `defaultEvening` unless changed in Settings).
    public var morning: Int
    public var evening: Int

    public init(
        version: Int = WidgetSnapshot.currentVersion,
        days: [String: DayCount],
        language: String,
        lastBrushAt: Date? = nil,
        lastFullBrushAt: Date? = nil,
        morning: Int = BrushDays.defaultMorning,
        evening: Int = BrushDays.defaultEvening
    ) {
        self.version = version
        self.days = days
        self.language = language
        self.lastBrushAt = lastBrushAt
        self.lastFullBrushAt = lastFullBrushAt
        // the grown-up's two times in order (Settings lets them be set either way round)
        self.morning = min(morning, evening)
        self.evening = max(morning, evening)
    }

    /// The last `daysKept` days of the save's brush log (empty days left out), the last brush and
    /// the brush times.
    public static func from(
        slots: [String: DailySlotLog],
        language: CoachLanguage,
        lastBrushAt: Date? = nil,
        lastFullBrushAt: Date? = nil,
        morning: Int = BrushDays.defaultMorning,
        evening: Int = BrushDays.defaultEvening,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> WidgetSnapshot {
        var days: [String: DayCount] = [:]
        for day in BrushDays.week(slots, today: now, days: daysKept, calendar: calendar) where day.full > 0 || day.tries > 0 {
            days[day.dateKey] = DayCount(full: day.full, tries: day.tries)
        }
        return WidgetSnapshot(days: days, language: language.rawValue, lastBrushAt: lastBrushAt, lastFullBrushAt: lastFullBrushAt, morning: morning, evening: evening)
    }

    /// When the next brush is due: today's morning time while no full brush is done yet, today's
    /// evening time while fewer than two are, otherwise tomorrow morning (the same rule as the
    /// reminders, `BrushDays.wanted`). A time already past is skipped, never shown as late.
    public func nextBrush(after now: Date, calendar: Calendar = .current) -> Date {
        let start = calendar.startOfDay(for: now)
        let fullToday = count(on: now, calendar: calendar).full
        func at(_ minutes: Int, dayOffset: Int) -> Date? {
            guard let day = calendar.date(byAdding: .day, value: dayOffset, to: start) else { return nil }
            return calendar.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: day)
        }
        var candidates: [Date] = []
        if BrushDays.wanted(.morning, fullToday: fullToday), let m = at(morning, dayOffset: 0), m > now { candidates.append(m) }
        if BrushDays.wanted(.evening, fullToday: fullToday), let e = at(evening, dayOffset: 0), e > now { candidates.append(e) }
        if let tomorrow = at(morning, dayOffset: 1) { candidates.append(tomorrow) }
        return candidates.min() ?? now
    }

    public var coachLanguage: CoachLanguage { CoachLanguage(rawValue: language) ?? .english }

    public func count(on date: Date, calendar: Calendar = .current) -> DayCount {
        days[HabitBank.localDateKey(for: date, calendar: calendar)] ?? DayCount(full: 0, tries: 0)
    }

    public func today(at now: Date, calendar: Calendar = .current) -> WidgetDayState {
        WidgetDayState(count(on: now, calendar: calendar))
    }

    /// The last 7 days, oldest first, today last.
    public func week(endingAt now: Date, calendar: Calendar = .current) -> [WidgetWeekDay] {
        let start = calendar.startOfDay(for: now)
        return (0..<7).reversed().map { back in
            let date = calendar.date(byAdding: .day, value: -back, to: start) ?? start
            return WidgetWeekDay(date: date, state: WidgetDayState(count(on: date, calendar: calendar)), isToday: back == 0)
        }
    }

    // MARK: - File in the App Group

    public func encoded() -> Data? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try? encoder.encode(self)
    }

    public static func decode(_ data: Data) -> WidgetSnapshot? {
        guard let snap = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
              snap.version == currentVersion else { return nil }
        return snap
    }

    /// The snapshot file, or nil when the App Group is not available (a free developer team, the Mac).
    public static func fileURL(fileManager: FileManager = .default) -> URL? {
        fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?.appendingPathComponent(fileName)
    }

    public static func load(fileManager: FileManager = .default) -> WidgetSnapshot? {
        guard let url = fileURL(fileManager: fileManager), let data = try? Data(contentsOf: url) else { return nil }
        return decode(data)
    }

    /// Writes the file; false when there is no App Group or the write failed.
    @discardableResult
    public func save(fileManager: FileManager = .default) -> Bool {
        guard let url = Self.fileURL(fileManager: fileManager), let data = encoded() else { return false }
        do {
            try data.write(to: url, options: [.atomic])
            // the widgets rebuild it from the save; a restored backup must not bring back old days
            // (set after each write: an atomic write replaces the file)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var target = url
            try? target.setResourceValues(values)
            return true
        } catch {
            return false
        }
    }
}

/// One day as the widgets draw it: two marks, filled left to right. Never a failure look: an empty
/// day is two calm outlines.
public enum WidgetDayState: Equatable, Sendable {
    /// Nothing yet today.
    case ready
    /// Only shorter brushes so far: the first mark glows, a sparkle says "Good try!".
    case goodTry
    /// One full brush; `withTry` when a shorter brush also happened (the second mark glows).
    case one(withTry: Bool)
    /// Both full brushes.
    case done

    public init(_ count: WidgetSnapshot.DayCount) {
        let full = min(BrushDays.goalPerDay, max(0, count.full))
        // A third full brush is paid as a tip too (`HabitBank`), so tries only count below the goal.
        let tried = count.tries > 0
        switch full {
        case 2...: self = .done
        case 1: self = .one(withTry: tried)
        default: self = tried ? .goodTry : .ready
        }
    }

    /// Full brushes, 0-2.
    public var full: Int {
        switch self {
        case .ready, .goodTry: return 0
        case .one: return 1
        case .done: return 2
        }
    }

    /// Whether a mark shows the "good try" glow (the first one, or the second after one full brush).
    public var glows: Bool {
        switch self {
        case .goodTry, .one(withTry: true): return true
        default: return false
        }
    }
}

/// What the Today widget says under the teeth.
public enum WidgetTodayStatus: Equatable, Sendable {
    /// A brush is due now: the morning time has passed with no full brush yet ("Time to brush!"),
    /// or the evening time has passed with fewer than two (`bedtime`: "Brush before bed").
    case due(bedtime: Bool)
    /// Not due yet: the next brush time (`bedtime` when it is the evening one).
    case next(Date, bedtime: Bool)
    /// Both brushes done today.
    case allDone
}

extension WidgetSnapshot {
    /// Today's full brushes (0-2) and the line under the teeth. Never "late": a passed time simply
    /// makes the brush due.
    public func todayStatus(at now: Date, calendar: Calendar = .current) -> WidgetTodayStatus {
        let full = min(BrushDays.goalPerDay, count(on: now, calendar: calendar).full)
        if full >= BrushDays.goalPerDay { return .allDone }
        let start = calendar.startOfDay(for: now)
        func at(_ minutes: Int, on day: Date) -> Date {
            calendar.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: day) ?? day
        }
        func at(_ minutes: Int) -> Date { at(minutes, on: start) }
        // the bedtime brush is done (a full brush after the evening time, by the tooth's 5 AM day,
        // so a brush at 00:20 still counts for last night): the day's brushing is over, and the next
        // one is the coming morning, never "brush again"
        let toothDay = toothDayStart(at: now, calendar: calendar)
        if let last = lastFullBrushAt, last <= now, last >= at(evening, on: toothDay) {
            let morningDay = toothDay == start ? (calendar.date(byAdding: .day, value: 1, to: start) ?? start) : start
            return .next(at(morning, on: morningDay), bedtime: false)
        }
        if now >= at(evening) { return .due(bedtime: true) }
        if full == 0 && now >= at(morning) { return .due(bedtime: false) }
        return .next(nextBrush(after: now, calendar: calendar), bedtime: full == 1)
    }
}

/// The Today tooth's face, following the day like the advice to brush in the morning and before
/// bed: neutral when the day starts (5 AM), smiling after a brush (until noon for a morning brush,
/// until the evening time for a later one), "meh" while the next brush waits, happy after the
/// bedtime brush (or both brushes) until 5 AM. Never sad.
public enum ToothMood: Equatable, Sendable {
    case neutral, smiling, meh, happy

    /// The tooth's day starts at 5 AM, so a late brush keeps it happy through the night.
    public static let dayStartHour = 5
    public static let noonHour = 12
}

extension WidgetSnapshot {
    /// Midnight of the date the tooth's day belongs to: yesterday before 5 AM, else today.
    func toothDayStart(at now: Date, calendar: Calendar) -> Date {
        let today = calendar.startOfDay(for: now)
        return calendar.component(.hour, from: now) < ToothMood.dayStartHour
            ? (calendar.date(byAdding: .day, value: -1, to: today) ?? today)
            : today
    }

    public func toothMood(at now: Date, calendar: Calendar = .current) -> ToothMood {
        // the tooth's day: from 5 AM to 5 AM
        let day = toothDayStart(at: now, calendar: calendar)
        func at(minutes: Int) -> Date {
            calendar.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: day) ?? day
        }
        let dayStart = at(minutes: ToothMood.dayStartHour * 60)
        let eveningTime = at(minutes: evening)
        // a morning smile lasts until noon (or the evening time, if a grown-up set it earlier)
        let noon = min(at(minutes: ToothMood.noonHour * 60), eveningTime)
        // the day's full brushes: the tooth's day may have started on yesterday's date
        let full = max(count(on: dayStart, calendar: calendar).full, count(on: now, calendar: calendar).full)
        if full >= BrushDays.goalPerDay { return .happy }
        if let last = lastFullBrushAt, last <= now, last >= dayStart {
            if last >= eveningTime { return .happy }
            return now < (last < noon ? noon : eveningTime) ? .smiling : .meh
        }
        // no full brush timed on this device today (a Sync Code import, a brush from elsewhere):
        // go by the count
        if full == 1 { return now < noon ? .smiling : .meh }
        return now < noon ? .neutral : .meh
    }
}

public struct WidgetWeekDay: Equatable, Sendable {
    public let date: Date
    public let state: WidgetDayState
    public let isToday: Bool
}

/// When the widgets must redraw by themselves: now, each local midnight (a new day), each brush
/// time (the "next brush" moves on) and 5 AM and noon (the tooth's face), for the next `days` days.
public enum WidgetTimeline {
    public static func entryDates(
        from now: Date,
        morning: Int = BrushDays.defaultMorning,
        evening: Int = BrushDays.defaultEvening,
        days: Int = 7,
        calendar: Calendar = .current
    ) -> [Date] {
        let start = calendar.startOfDay(for: now)
        var dates: Set<Date> = []
        for offset in 0...max(1, days) {
            guard let day = calendar.date(byAdding: .day, value: offset, to: start) else { continue }
            if offset > 0 { dates.insert(day) }
            // the brush times move "next" on; 5 AM and noon change the tooth's face
            for minutes in [morning, evening, ToothMood.dayStartHour * 60, ToothMood.noonHour * 60] {
                if let t = calendar.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: day), t > now {
                    dates.insert(t)
                }
            }
        }
        return [now] + dates.filter { $0 > now }.sorted()
    }
}
