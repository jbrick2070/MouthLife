import MouthLifeCore
import SwiftUI
import WidgetKit

// The Home Screen and Lock Screen widgets, as plain SwiftUI so they also render on a Mac in tests.
// The widget extension (`MouthLifeWidgets`) wraps them with the timeline and the removable
// background. Same purple and gold as the watch. Round, calm shapes only: under StandBy's and
// HomeView's red night tint nothing may look like an alarm.

/// The widgets' colours (the watch's palette: `WatchLook` in MouthLifeWatchUI).
public enum WidgetLook {
    public static let purple = Color(red: 0.333, green: 0.145, blue: 0.514)
    public static let deep = Color(red: 0.05, green: 0.04, blue: 0.07)
    public static let gold = Color(red: 0.992, green: 0.725, blue: 0.153)
    public static let lavender = Color(red: 0.91, green: 0.85, blue: 1.0)
    public static let soft = lavender.opacity(0.6)

    /// The removable background (the extension puts it in `containerBackground(for: .widget)`).
    public static var background: LinearGradient {
        LinearGradient(colors: [purple, deep], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

/// A simple tooth: a rounded crown on two roots.
public struct ToothShape: Shape {
    public init() {}

    public func path(in rect: CGRect) -> Path {
        let w = rect.width, h = rect.height
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * w, y: rect.minY + y * h) }
        var path = Path()
        path.move(to: p(0.5, 0.16))
        path.addCurve(to: p(0.93, 0.22), control1: p(0.66, 0.02), control2: p(0.86, 0.04))
        path.addCurve(to: p(0.8, 0.62), control1: p(1.0, 0.38), control2: p(0.88, 0.5))
        path.addCurve(to: p(0.66, 0.96), control1: p(0.76, 0.76), control2: p(0.74, 0.96))
        path.addCurve(to: p(0.5, 0.66), control1: p(0.58, 0.96), control2: p(0.58, 0.66))
        path.addCurve(to: p(0.34, 0.96), control1: p(0.42, 0.66), control2: p(0.42, 0.96))
        path.addCurve(to: p(0.2, 0.62), control1: p(0.26, 0.96), control2: p(0.24, 0.76))
        path.addCurve(to: p(0.07, 0.22), control1: p(0.12, 0.5), control2: p(0.0, 0.38))
        path.addCurve(to: p(0.5, 0.16), control1: p(0.14, 0.04), control2: p(0.34, 0.02))
        path.closeSubpath()
        return path
    }
}

// MARK: - Teeth

/// A small toothbrush, standing up (rotate it to lean): a handle, a head and four tufts.
public struct MiniBrush: View {
    let length: CGFloat

    public init(length: CGFloat) {
        self.length = length
    }

    public var body: some View {
        let w = length * 0.22
        VStack(spacing: 0) {
            // bristles
            HStack(spacing: w * 0.12) {
                ForEach(0..<4, id: \.self) { _ in
                    Capsule().fill(Color.white).frame(width: w * 0.14, height: length * 0.14)
                }
            }
            // head and handle
            RoundedRectangle(cornerRadius: w * 0.3, style: .continuous)
                .fill(WidgetLook.gold)
                .frame(width: w, height: length * 0.2)
            Capsule()
                .fill(WidgetLook.gold)
                .frame(width: w * 0.42, height: length * 0.66)
        }
        .widgetAccentable()
        .frame(width: w, height: length)
    }
}

/// One tooth of the day, with a face. Calm while it waits, smiling once brushed, beaming at the
/// end of a day with both brushes. Never sad.
public struct DayTooth: View {
    public enum Look: Equatable { case waiting, due, brushed, beaming }

    let look: Look
    let size: CGFloat

    public init(_ look: Look, size: CGFloat) {
        self.look = look
        self.size = size
    }

    private var filled: Bool { look == .brushed || look == .beaming }

    public var body: some View {
        ZStack {
            if filled {
                ToothShape().fill(WidgetLook.gold).widgetAccentable()
                // a little enamel shine
                Capsule()
                    .fill(Color.white.opacity(0.55))
                    .frame(width: size * 0.08, height: size * 0.2)
                    .rotationEffect(.degrees(-25))
                    .offset(x: -size * 0.27, y: -size * 0.22)
            } else {
                ToothShape().fill(WidgetLook.lavender.opacity(0.08))
                if look == .due {
                    ToothShape()
                        .stroke(WidgetLook.gold, style: StrokeStyle(lineWidth: size * 0.065, lineCap: .round, dash: [size * 0.1, size * 0.08]))
                        .widgetAccentable()
                } else {
                    ToothShape().stroke(WidgetLook.lavender.opacity(0.55), lineWidth: size * 0.065)
                }
            }
            face
                .offset(y: -size * 0.1)
            if look == .due {
                MiniBrush(length: size * 0.5)
                    .rotationEffect(.degrees(35))
                    .offset(x: size * 0.42, y: -size * 0.32)
            }
        }
        .frame(width: size, height: size)
    }

    @ViewBuilder
    private var face: some View {
        let ink = filled ? WidgetLook.purple : WidgetLook.lavender.opacity(0.8)
        VStack(spacing: size * 0.06) {
            HStack(spacing: size * 0.16) {
                ForEach(0..<2, id: \.self) { _ in
                    if look == .beaming {
                        SmileArc()
                            .stroke(ink, style: StrokeStyle(lineWidth: size * 0.045, lineCap: .round))
                            .frame(width: size * 0.11, height: size * 0.05)
                            .rotationEffect(.degrees(180))
                    } else {
                        Circle().fill(ink).frame(width: size * 0.075, height: size * 0.075)
                    }
                }
            }
            if filled {
                SmileArc()
                    .stroke(ink, style: StrokeStyle(lineWidth: size * 0.05, lineCap: .round))
                    .frame(width: size * (look == .beaming ? 0.3 : 0.22), height: size * (look == .beaming ? 0.11 : 0.07))
            } else {
                Capsule().fill(ink).frame(width: size * 0.14, height: size * 0.04)
            }
        }
    }
}

/// Today's big tooth: its face follows the day (`ToothMood`) and is drawn like the smiling Golden
/// Molar at the end of the game (`CityFinaleView.paintFaceAt`): big eyes with a shine, a wide smile,
/// pink cheeks. Happy at the end of the day = the gold molar itself. It holds a toothbrush while a
/// brush is due.
public struct MoodTooth: View {
    @Environment(\.widgetRenderingMode) private var renderingMode
    let mood: ToothMood
    let due: Bool
    let size: CGFloat

    public init(mood: ToothMood, due: Bool, size: CGFloat) {
        self.mood = mood
        self.due = due
        self.size = size
    }

    private var gold: Bool { mood == .happy }

    public var body: some View {
        ZStack {
            if renderingMode == .accented {
                // a tinted or clear Home Screen paints each layer in one colour: an outline with a
                // see-through body keeps the face readable
                ToothShape().fill(Color.white.opacity(gold ? 0.3 : 0.14)).widgetAccentable(gold)
                ToothShape().stroke(Color.white, lineWidth: size * 0.045).widgetAccentable(gold)
                MolarFace(mood: mood, mono: true)
                    .frame(width: size * 0.62, height: size * 0.4)
                    .offset(y: -size * 0.06)
            } else {
                ToothShape().fill(gold ? WidgetLook.gold : Color.white)
                ToothShape().stroke(gold ? MolarFace.brown.opacity(0.35) : WidgetLook.lavender, lineWidth: size * 0.035)
                if gold {
                    // enamel shine
                    Capsule()
                        .fill(Color.white.opacity(0.6))
                        .frame(width: size * 0.07, height: size * 0.18)
                        .rotationEffect(.degrees(-25))
                        .offset(x: -size * 0.27, y: -size * 0.22)
                }
                MolarFace(mood: mood)
                    .frame(width: size * 0.62, height: size * 0.4)
                    .offset(y: -size * 0.06)
            }
            if gold && !due {
                ZStack {
                    Image(systemName: "sparkle").font(.system(size: size * 0.22, weight: .bold)).offset(x: size * 0.42, y: -size * 0.42)
                    Image(systemName: "sparkle").font(.system(size: size * 0.15, weight: .bold)).offset(x: -size * 0.46, y: -size * 0.36)
                    Image(systemName: "sparkle").font(.system(size: size * 0.12, weight: .bold)).offset(x: size * 0.47, y: size * 0.02)
                }
                .foregroundStyle(WidgetLook.gold)
                .widgetAccentable()
            }
            if due {
                MiniBrush(length: size * 0.55)
                    .rotationEffect(.degrees(35))
                    .offset(x: size * 0.46, y: -size * 0.3)
            }
        }
        .frame(width: size, height: size)
    }
}

/// The Golden Molar's face from the game's ending, in four moods. Drawn in a unit box whose width is
/// about two face units (the eyes sit at ±0.3 units, as in `CityFinaleView.paintFaceAt`).
public struct MolarFace: View {
    static let brown = Color(red: 0.26, green: 0.13, blue: 0.02)
    static let cream = Color(red: 1, green: 0.98, blue: 0.92)
    static let blush = Color(red: 0.98, green: 0.44, blue: 0.52)

    let mood: ToothMood
    /// One colour only (a tinted Home Screen): outlined eyes, no cheeks.
    let mono: Bool

    public init(mood: ToothMood, mono: Bool = false) {
        self.mood = mood
        self.mono = mono
    }

    public var body: some View {
        Canvas { c, size in
            let ink = mono ? Color.white : Self.brown
            let u = size.width / 1.3
            let x = size.width / 2
            let y = size.height * 0.45
            let line = max(1.2, u * 0.06)
            func eye(_ ex: Double) {
                // relaxed lids for "meh": the top of the eye is simply not drawn (waiting, not sad)
                var e = c
                if mood == .meh {
                    e.clip(to: Path(CGRect(x: ex - u * 0.2, y: y - u * 0.11, width: u * 0.4, height: u * 0.4)))
                }
                let white = Path(ellipseIn: CGRect(x: ex - u * 0.12, y: y - u * 0.22, width: u * 0.24, height: u * 0.28))
                if !mono { e.fill(white, with: .color(Self.cream)) }
                e.stroke(white, with: .color(ink), lineWidth: max(1, u * 0.045))
                e.fill(Path(ellipseIn: CGRect(x: ex + u * 0.02 - u * 0.065, y: y - u * 0.06 - u * 0.065, width: u * 0.13, height: u * 0.13)), with: .color(ink))
                if !mono {
                    e.fill(Path(ellipseIn: CGRect(x: ex - u * 0.026, y: y - u * 0.11, width: u * 0.044, height: u * 0.044)), with: .color(Self.cream))
                }
                if mood == .meh {
                    var edge = Path()
                    edge.move(to: CGPoint(x: ex - u * 0.13, y: y - u * 0.11))
                    edge.addLine(to: CGPoint(x: ex + u * 0.13, y: y - u * 0.11))
                    c.stroke(edge, with: .color(ink), style: StrokeStyle(lineWidth: max(1, u * 0.045), lineCap: .round))
                }
            }
            eye(x - u * 0.3)
            eye(x + u * 0.3)
            var mouth = Path()
            switch mood {
            case .neutral:
                mouth.move(to: CGPoint(x: x - u * 0.13, y: y + u * 0.2))
                mouth.addLine(to: CGPoint(x: x + u * 0.13, y: y + u * 0.2))
            case .meh:
                mouth.move(to: CGPoint(x: x - u * 0.08, y: y + u * 0.22))
                mouth.addLine(to: CGPoint(x: x + u * 0.14, y: y + u * 0.18))
            case .smiling:
                mouth.addArc(center: CGPoint(x: x, y: y + u * 0.08), radius: u * 0.2, startAngle: .radians(0.2 * Double.pi), endAngle: .radians(0.8 * Double.pi), clockwise: false)
            case .happy:
                // the ending's wide smile
                mouth.addArc(center: CGPoint(x: x, y: y + u * 0.05), radius: u * 0.3, startAngle: .radians(0.15 * Double.pi), endAngle: .radians(0.85 * Double.pi), clockwise: false)
            }
            c.stroke(mouth, with: .color(ink), style: StrokeStyle(lineWidth: line, lineCap: .round))
            if !mono && (mood == .happy || mood == .smiling) {
                let a = mood == .happy ? 0.45 : 0.3
                c.fill(Path(ellipseIn: CGRect(x: x - u * 0.59, y: y + u * 0.03, width: u * 0.18, height: u * 0.18)), with: .color(Self.blush.opacity(a)))
                c.fill(Path(ellipseIn: CGRect(x: x + u * 0.41, y: y + u * 0.03, width: u * 0.18, height: u * 0.18)), with: .color(Self.blush.opacity(a)))
            }
        }
    }
}

/// Two small teeth counting today's full brushes (gold = done), for children who cannot read yet.
public struct BrushPips: View {
    let full: Int
    let size: CGFloat

    public init(full: Int, size: CGFloat) {
        self.full = min(2, max(0, full))
        self.size = size
    }

    public var body: some View {
        HStack(spacing: size * 0.35) {
            ForEach(0..<2, id: \.self) { i in
                if i < full {
                    ToothShape().fill(WidgetLook.gold).widgetAccentable().frame(width: size, height: size)
                } else {
                    ToothShape().stroke(WidgetLook.lavender.opacity(0.55), lineWidth: size * 0.1).frame(width: size, height: size)
                }
            }
        }
    }
}

// MARK: - Today

/// The small "Today" widget: the tooth of the day, when you last brushed, and what comes next.
/// `snapshot` nil = no brush log yet on this device (a tooth and "Open MouthLife"). `distance`: no
/// background (StandBy, HomeView's shared screen): only the big tooth and the pips, no words.
public struct TodayWidgetView: View {
    @Environment(\.widgetRenderingMode) private var renderingMode
    let snapshot: WidgetSnapshot?
    let now: Date
    let language: CoachLanguage
    let distance: Bool
    let calendar: Calendar

    public init(snapshot: WidgetSnapshot?, now: Date, language: CoachLanguage, distance: Bool, calendar: Calendar = .current) {
        self.snapshot = snapshot
        self.now = now
        self.language = language
        self.distance = distance
        self.calendar = calendar
    }

    public var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            Group {
                if let snapshot {
                    today(snapshot, side: side)
                } else {
                    noLog(side: side)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityHint(snapshot == nil ? "" : WidgetCopy.word(.startsBrush, language))
    }

    private var accessibilityText: String {
        guard let snapshot else { return WidgetCopy.word(.openApp, language) }
        return WidgetCopy.todayAccessibility(
            full: snapshot.count(on: now, calendar: calendar).full,
            lastBrush: snapshot.lastBrushAt,
            status: snapshot.todayStatus(at: now, calendar: calendar),
            now: now,
            language,
            calendar: calendar
        )
    }

    @ViewBuilder
    private func today(_ snapshot: WidgetSnapshot, side: CGFloat) -> some View {
        let full = min(2, snapshot.count(on: now, calendar: calendar).full)
        let status = snapshot.todayStatus(at: now, calendar: calendar)
        let isDue: Bool = { if case .due = status { return true } else { return false } }()
        let mood = snapshot.toothMood(at: now, calendar: calendar)
        let last = snapshot.lastBrushAt.flatMap { WidgetCopy.whenParts($0, now: now, language, calendar: calendar) }
        if distance {
            VStack(spacing: side * 0.08) {
                MoodTooth(mood: mood, due: isDue, size: side * 0.62)
                BrushPips(full: full, size: side * 0.13)
            }
        } else {
            VStack(spacing: side * 0.06) {
                HStack(alignment: .center, spacing: side * 0.06) {
                    MoodTooth(mood: mood, due: isDue, size: side * 0.48)
                        .padding(.trailing, isDue || mood == .happy ? side * 0.05 : 0)
                    VStack(alignment: last == nil ? .center : .leading, spacing: side * 0.05) {
                        if let last {
                            VStack(alignment: .leading, spacing: 0) {
                                // may wrap (Portuguese, French on the smallest phones) rather than shrink
                                Text(WidgetCopy.word(.lastBrush, language))
                                    .font(.system(size: side * 0.075, weight: .semibold, design: .rounded))
                                    .foregroundStyle(WidgetLook.lavender.opacity(0.75))
                                    .lineLimit(2)
                                    .minimumScaleFactor(0.85)
                                    .fixedSize(horizontal: false, vertical: true)
                                if let day = last.day {
                                    Text(day)
                                        .font(.system(size: side * 0.085, weight: .bold, design: .rounded))
                                        .foregroundStyle(Color.white.opacity(0.9))
                                }
                                Text(last.time)
                                    .font(.system(size: side * 0.115, weight: .heavy, design: .rounded))
                                    .foregroundStyle(Color.white)
                            }
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        }
                        BrushPips(full: full, size: side * 0.1)
                    }
                    .frame(maxWidth: .infinity, alignment: last == nil ? .center : .leading)
                }
                statusPill(status, side: side)
            }
        }
    }

    @ViewBuilder
    private func statusPill(_ status: WidgetTodayStatus, side: CGFloat) -> some View {
        let text = WidgetCopy.status(status, now: now, language, calendar: calendar)
        let accented = renderingMode == .accented
        let moon: Bool = {
            switch status {
            case .due(let bedtime), .next(_, let bedtime): return bedtime
            case .allDone: return false
            }
        }()
        let label = HStack(spacing: side * 0.03) {
            if moon { Image(systemName: "moon.fill") }
            Text(text)
        }
        .font(.system(size: side * 0.085, weight: .heavy, design: .rounded))
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        .padding(.horizontal, side * 0.07)
        .frame(height: side * 0.17)
        switch status {
        case .due:
            if accented {
                label.widgetAccentable()
                    .overlay(Capsule().strokeBorder(lineWidth: 1.5).widgetAccentable())
            } else {
                label.foregroundStyle(WidgetLook.purple).background(Capsule().fill(WidgetLook.gold))
            }
        case .next:
            label.foregroundStyle(WidgetLook.lavender).background(Capsule().fill(WidgetLook.lavender.opacity(0.14)))
        case .allDone:
            label.foregroundStyle(WidgetLook.gold).widgetAccentable()
                .background(Capsule().fill(WidgetLook.gold.opacity(0.18)))
                .overlay(Capsule().strokeBorder(WidgetLook.gold.opacity(0.45), lineWidth: 1))
        }
    }

    private func noLog(side: CGFloat) -> some View {
        VStack(spacing: side * 0.07) {
            DayTooth(.waiting, size: side * (distance ? 0.5 : 0.38))
            if !distance {
                Text(WidgetCopy.word(.openApp, language))
                    .font(.system(size: side * 0.1, weight: .bold, design: .rounded))
                    .foregroundStyle(WidgetLook.lavender)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, side * 0.06)
            }
        }
    }
}

// MARK: - This week

/// The medium "This week" widget: seven columns of two small teeth (gold = a full brush), oldest
/// first, today in a ring. Empty days are calm outlines.
public struct WeekWidgetView: View {
    let days: [WidgetWeekDay]?
    let language: CoachLanguage
    let calendar: Calendar

    public init(days: [WidgetWeekDay]?, language: CoachLanguage, calendar: Calendar = .current) {
        self.days = days
        self.language = language
        self.calendar = calendar
    }

    public var body: some View {
        GeometryReader { geo in
            let h = geo.size.height
            VStack(alignment: .leading, spacing: h * 0.05) {
                Text(WidgetCopy.word(.weekName, language))
                    .font(.system(size: h * 0.12, weight: .heavy, design: .rounded))
                    .foregroundStyle(WidgetLook.lavender)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let days {
                    let letters = WidgetCopy.weekdayLetters(language)
                    HStack(spacing: 0) {
                        ForEach(Array(days.enumerated()), id: \.offset) { _, day in
                            column(day, letters: letters, height: h)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .frame(maxHeight: .infinity)
                } else {
                    HStack(spacing: h * 0.06) {
                        DayTooth(.waiting, size: h * 0.32)
                        Text(WidgetCopy.word(.openApp, language))
                            .font(.system(size: h * 0.12, weight: .bold, design: .rounded))
                            .foregroundStyle(WidgetLook.lavender)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(days.map { WidgetCopy.weekAccessibility(fullBrushes: $0.reduce(0) { $0 + $1.state.full }, language) } ?? WidgetCopy.word(.openApp, language))
    }

    private func column(_ day: WidgetWeekDay, letters: [String], height h: CGFloat) -> some View {
        let index = (calendar.component(.weekday, from: day.date) - 1 + 7) % 7
        let full = day.state.full
        let t = h * 0.2
        return VStack(spacing: h * 0.035) {
            Text(letters.indices.contains(index) ? letters[index] : "")
                .font(.system(size: h * 0.09, weight: day.isToday ? .heavy : .semibold, design: .rounded))
                .foregroundStyle(day.isToday ? WidgetLook.gold : WidgetLook.soft)
                .widgetAccentable(day.isToday)
            VStack(spacing: h * 0.035) {
                weekTooth(filled: full >= 1, size: t)
                weekTooth(filled: full >= 2, size: t)
            }
            .padding(.vertical, h * 0.035)
            .padding(.horizontal, h * 0.03)
            .background(Capsule().fill(day.isToday ? WidgetLook.gold.opacity(0.08) : .clear))
            .overlay(
                Capsule()
                    .strokeBorder(day.isToday ? WidgetLook.gold.opacity(0.8) : .clear, lineWidth: h * 0.01)
                    .widgetAccentable()
            )
        }
    }

    @ViewBuilder
    private func weekTooth(filled: Bool, size: CGFloat) -> some View {
        if filled {
            ToothShape().fill(WidgetLook.gold).widgetAccentable().frame(width: size, height: size)
        } else {
            ToothShape().stroke(WidgetLook.lavender.opacity(0.5), lineWidth: size * 0.08).frame(width: size, height: size)
        }
    }
}

// MARK: - Lock Screen

/// The Lock Screen's circular widget: the neutral tooth (no progress, because a locked phone shows
/// its widgets to anyone). A tap starts the 2-Minute Brush.
public struct LockToothView: View {
    let language: CoachLanguage

    public init(language: CoachLanguage) {
        self.language = language
    }

    public var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            ToothShape()
                .fill(.primary)
                .padding(11)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("MouthLife")
        .accessibilityHint(WidgetCopy.word(.startsBrush, language))
    }
}

/// A shallow smile: the lower half of an ellipse.
public struct SmileArc: Shape {
    public init() {}
    public func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.minY), control: CGPoint(x: rect.midX, y: rect.maxY * 2 - rect.minY))
        return p
    }
}
