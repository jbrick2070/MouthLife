import MouthLifeCore
@testable import MouthLifeWidgetUI
import SwiftUI
import XCTest

/// Renders every widget state on a Mac, so each can be looked at. Pictures go to $WIDGET_RENDER_DIR
/// when it is set; otherwise the views are only drawn, which still catches layouts that fail.
@MainActor
final class WidgetRenderTests: XCTestCase {
    /// iPhone 18 Pro sizes in points (small, medium, Lock Screen circular).
    static let small = CGSize(width: 170, height: 170)
    /// The smallest small widget iOS 17 runs on (iPhone SE).
    static let smallest = CGSize(width: 148, height: 148)
    static let medium = CGSize(width: 364, height: 170)
    static let circular = CGSize(width: 72, height: 72)

    func render<V: View>(_ name: String, size: CGSize, background: Bool = true, accented: Bool = false, _ view: V) {
        let framed = ZStack {
            if background {
                WidgetLook.background
            } else {
                Color.black
            }
            view.padding(background ? 14 : 4)
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: size.width < 100 ? size.width / 2 : 22, style: .continuous))
        .environment(\.colorScheme, .dark)
        .environment(\.widgetRenderingMode, accented ? .accented : .fullColor)
        let renderer = ImageRenderer(content: framed)
        renderer.scale = 2
        guard let image = renderer.cgImage else {
            XCTFail("could not render \(name)")
            return
        }
        XCTAssertEqual(image.width, Int(size.width * 2))
        guard let dir = ProcessInfo.processInfo.environment["WIDGET_RENDER_DIR"] else { return }
        let url = URL(fileURLWithPath: dir).appendingPathComponent("\(name).png")
        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else { return }
        CGImageDestinationAddImage(dest, image, nil)
        CGImageDestinationFinalize(dest)
    }

    var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return c
    }

    func at(_ h: Int, _ m: Int = 0, day: Int = 19) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 11, day: day, hour: h, minute: m))!
    }

    /// The day's moments: (name, brushes today, last brush, the clock).
    var moments: [(String, Int, Date?, Date)] {
        [
            ("1-early", 0, at(20, 5, day: 18), at(6, 50)),     // before the morning time
            ("2-due-morning", 0, at(20, 5, day: 18), at(8, 10)), // morning passed: time to brush
            ("3a-smiling", 1, at(7, 42), at(9, 30)),             // brushed this morning, before noon
            ("3-one", 1, at(7, 42), at(12)),                    // brushed this morning: before bed later
            ("4-due-bed", 1, at(7, 42), at(20)),                // evening: brush before bed
            ("5-done", 2, at(19, 51), at(21)),                  // both done: beaming
            ("6-old", 0, nil, at(10)),                          // last brush unknown
            ("7-bed-only", 1, at(19, 50), at(21)),              // only the bedtime brush: happy, next tomorrow
        ]
    }

    func snapshot(full: Int, last: Date?, lang: CoachLanguage) -> WidgetSnapshot {
        WidgetSnapshot(days: full > 0 ? ["2026-11-19": .init(full: full, tries: 0)] : [:], language: lang.rawValue, lastBrushAt: last, lastFullBrushAt: last)
    }

    func testTodayAtEachMomentLanguageAndWithoutBackground() {
        for (tag, full, last, now) in moments {
            for lang in CoachLanguage.allCases {
                render("today-\(tag)-\(lang.rawValue)", size: Self.small, TodayWidgetView(snapshot: snapshot(full: full, last: last, lang: lang), now: now, language: lang, distance: false, calendar: calendar))
            }
            render("today-\(tag)-standby", size: Self.small, background: false, TodayWidgetView(snapshot: snapshot(full: full, last: last, lang: .english), now: now, language: .english, distance: true, calendar: calendar))
            render("today-\(tag)-tinted", size: Self.small, background: false, accented: true, TodayWidgetView(snapshot: snapshot(full: full, last: last, lang: .english), now: now, language: .english, distance: false, calendar: calendar))
        }
        // the longest "Last brush" words on the smallest phone
        for lang in [CoachLanguage.portuguese, .french, .spanish, .german, .japanese] {
            render("today-se-\(lang.rawValue)", size: Self.smallest, TodayWidgetView(snapshot: snapshot(full: 1, last: at(20, 5, day: 18), lang: lang), now: at(20), language: lang, distance: false, calendar: calendar))
        }
        render("today-nolog-en", size: Self.small, TodayWidgetView(snapshot: nil, now: at(12), language: .english, distance: false, calendar: calendar))
    }

    func testWeekAndLockScreen() {
        let snap = WidgetSnapshot(days: [
            "2026-11-19": .init(full: 1, tries: 0), "2026-11-18": .init(full: 2, tries: 0),
            "2026-11-17": .init(full: 0, tries: 1), "2026-11-15": .init(full: 2, tries: 1),
            "2026-11-14": .init(full: 1, tries: 1),
        ], language: "en")
        let week = snap.week(endingAt: at(12), calendar: calendar)
        for lang in [CoachLanguage.english, .german, .japanese, .korean] {
            render("week-\(lang.rawValue)", size: Self.medium, WeekWidgetView(days: week, language: lang, calendar: calendar))
        }
        render("week-nolog", size: Self.medium, WeekWidgetView(days: nil, language: .english, calendar: calendar))
        render("lock-tooth", size: Self.circular, background: false, LockToothView(language: .english))
    }
}
