import MouthLifeCore
import MouthLifeWidgetUI
import SwiftUI
import WidgetKit

// MouthLife's widgets: Today (small: Home Screen, StandBy, Apple HomeView), This week (medium) and
// the Lock Screen tooth. They read the anonymous snapshot the app writes into the App Group
// (`WidgetSnapshot`); without it (first run, or a free developer team with no App Group) they show
// a tooth and "Open MouthLife". A tap opens the app; nothing starts by itself.

/// Today and the Lock Screen tooth start the 2-Minute Brush; This week opens Home (see
/// `AppCoordinator.openFromWidget`).
private let brushURL = URL(string: "mouthlife://brush")
private let homeURL = URL(string: "mouthlife://home")

/// The device's language for the widget gallery (the widgets themselves use the coach language).
private var galleryLanguage: CoachLanguage {
    CoachLanguage(rawValue: Locale.current.language.languageCode?.identifier ?? "en") ?? .english
}

struct BrushLogEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

struct BrushLogProvider: TimelineProvider {
    /// The gallery's example: both brushes done, so the gallery shows the happy gold tooth.
    private func sample(_ now: Date) -> WidgetSnapshot {
        let evening = Calendar.current.date(bySettingHour: 19, minute: 51, second: 0, of: now).map { min($0, now) } ?? now
        return WidgetSnapshot(
            days: [HabitBank.localDateKey(for: now): .init(full: 2, tries: 0)],
            language: galleryLanguage.rawValue,
            lastBrushAt: evening,
            lastFullBrushAt: evening
        )
    }

    func placeholder(in context: Context) -> BrushLogEntry {
        BrushLogEntry(date: Date(), snapshot: sample(Date()))
    }

    func getSnapshot(in context: Context, completion: @escaping (BrushLogEntry) -> Void) {
        let now = Date()
        completion(BrushLogEntry(date: now, snapshot: context.isPreview ? sample(now) : WidgetSnapshot.load()))
    }

    /// Now, then each moment the widget changes for a week (midnight, 5 AM, noon, the morning and
    /// evening brush times), so it stays right while the app is closed. The app reloads the
    /// timelines whenever the brush log changes.
    func getTimeline(in context: Context, completion: @escaping (Timeline<BrushLogEntry>) -> Void) {
        let snapshot = WidgetSnapshot.load()
        let entries = WidgetTimeline.entryDates(
            from: Date(),
            morning: snapshot?.morning ?? BrushDays.defaultMorning,
            evening: snapshot?.evening ?? BrushDays.defaultEvening
        ).map { BrushLogEntry(date: $0, snapshot: snapshot) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

/// The Lock Screen tooth never changes by itself (it only follows the coach language, and the app
/// reloads every widget when that changes): one entry, no schedule.
struct LockToothProvider: TimelineProvider {
    func placeholder(in context: Context) -> BrushLogEntry {
        BrushLogEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (BrushLogEntry) -> Void) {
        completion(BrushLogEntry(date: Date(), snapshot: WidgetSnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BrushLogEntry>) -> Void) {
        completion(Timeline(entries: [BrushLogEntry(date: Date(), snapshot: WidgetSnapshot.load())], policy: .never))
    }
}

struct TodayEntryView: View {
    @Environment(\.showsWidgetContainerBackground) private var showsBackground
    let entry: BrushLogEntry

    var body: some View {
        TodayWidgetView(
            snapshot: entry.snapshot,
            now: entry.date,
            language: entry.snapshot?.coachLanguage ?? galleryLanguage,
            distance: !showsBackground
        )
        .containerBackground(for: .widget) { WidgetLook.background }
        .widgetURL(brushURL)
    }
}

struct WeekEntryView: View {
    let entry: BrushLogEntry

    var body: some View {
        WeekWidgetView(
            days: entry.snapshot?.week(endingAt: entry.date),
            language: entry.snapshot?.coachLanguage ?? galleryLanguage
        )
        .containerBackground(for: .widget) { WidgetLook.background }
        .widgetURL(homeURL)
    }
}

struct LockEntryView: View {
    let entry: BrushLogEntry

    var body: some View {
        LockToothView(language: entry.snapshot?.coachLanguage ?? galleryLanguage)
            .containerBackground(for: .widget) { Color.clear }
            .widgetURL(brushURL)
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MouthLifeToday", provider: BrushLogProvider()) { entry in
            TodayEntryView(entry: entry)
        }
        .configurationDisplayName(WidgetCopy.word(.todayName, galleryLanguage))
        .description(WidgetCopy.word(.todayAbout, galleryLanguage))
        .supportedFamilies([.systemSmall])
    }
}

struct WeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MouthLifeWeek", provider: BrushLogProvider()) { entry in
            WeekEntryView(entry: entry)
        }
        .configurationDisplayName(WidgetCopy.word(.weekName, galleryLanguage))
        .description(WidgetCopy.word(.weekAbout, galleryLanguage))
        .supportedFamilies([.systemMedium])
    }
}

struct LockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MouthLifeLock", provider: LockToothProvider()) { entry in
            LockEntryView(entry: entry)
        }
        .configurationDisplayName(WidgetCopy.word(.lockName, galleryLanguage))
        .description(WidgetCopy.word(.lockAbout, galleryLanguage))
        .supportedFamilies([.accessoryCircular])
    }
}

@main
struct MouthLifeWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        WeekWidget()
        LockWidget()
    }
}
