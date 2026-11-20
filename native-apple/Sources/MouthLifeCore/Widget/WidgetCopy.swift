import Foundation

/// The few words on the Home Screen and Lock Screen widgets, in the 8 coach languages (like
/// `WatchCopy`, whose "Good try!" and "Done!" they reuse). One or two words on the widget itself;
/// sentences only for the widget gallery and VoiceOver. Never a scolding word.
public enum WidgetWord: String, CaseIterable, Sendable {
    /// Gallery names and descriptions.
    case todayName, weekName, lockName
    case todayAbout, weekAbout, lockAbout
    /// Before the first brush of the day (a friendly question, not an order).
    case ready
    /// No brush log yet (first run, or no App Group on this device).
    case openApp
    /// Today's lines: when the last brush was, and what comes next.
    case lastBrush, timeToBrush, beforeBed, bedtime, next, allDone, yesterday, tomorrow
    /// VoiceOver: what a tap does.
    case startsBrush
}

public enum WidgetCopy {
    public static func word(_ w: WidgetWord, _ lang: CoachLanguage) -> String {
        table[lang]?[w] ?? table[.english]![w]!
    }

    /// The line under the teeth.
    public static func status(_ status: WidgetTodayStatus, now: Date, _ lang: CoachLanguage, calendar: Calendar = .current) -> String {
        switch status {
        case .due(let bedtime): return word(bedtime ? .beforeBed : .timeToBrush, lang)
        case .allDone: return word(.allDone, lang)
        case .next(let date, let bedtime):
            let when = Self.when(date, now: now, lang, calendar: calendar) ?? ""
            return "\(word(bedtime ? .bedtime : .next, lang)) · \(when)"
        }
    }

    /// VoiceOver for Today, e.g. "Brushes today: 1 of 2. Last brush 7:42 AM. Brush before bed."
    public static func todayAccessibility(full: Int, lastBrush: Date?, status: WidgetTodayStatus, now: Date, _ lang: CoachLanguage, calendar: Calendar = .current) -> String {
        var parts = [String(format: format(\.today, lang), min(2, max(0, full)))]
        if let lastBrush, let when = Self.when(lastBrush, now: now, lang, calendar: calendar) {
            parts.append("\(word(.lastBrush, lang)) \(when)")
        }
        parts.append(Self.status(status, now: now, lang, calendar: calendar))
        return parts.joined(separator: ". ")
    }

    /// VoiceOver for the week widget, e.g. "Brushes this week: 9" (never "of 14").
    public static func weekAccessibility(fullBrushes: Int, _ lang: CoachLanguage) -> String {
        String(format: format(\.week, lang), fullBrushes)
    }

    /// A brush time for the widget in two parts: the day (nil for today; "Yesterday", "Tomorrow", or
    /// the weekday for other days of the past week) and the time ("7:42 AM"). Nil when older than a
    /// week (the line is then left out, never a "days ago" count).
    public static func whenParts(_ date: Date, now: Date, _ lang: CoachLanguage, calendar: Calendar = .current) -> (day: String?, time: String)? {
        let locale = Locale(identifier: lang.rawValue)
        let time = DateFormatter()
        time.locale = locale
        time.calendar = calendar
        time.timeZone = calendar.timeZone
        time.dateStyle = .none
        time.timeStyle = .short
        let clock = time.string(from: date)
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: date)).day ?? 0
        switch days {
        case 0: return (nil, clock)
        case -1: return (word(.yesterday, lang), clock)
        case 1: return (word(.tomorrow, lang), clock)
        case -6 ... -2:
            let weekday = DateFormatter()
            weekday.locale = locale
            weekday.calendar = calendar
            weekday.timeZone = calendar.timeZone
            weekday.setLocalizedDateFormatFromTemplate("EEE")
            return (weekday.string(from: date), clock)
        default: return nil
        }
    }

    /// The same on one line: "7:42 AM", "Yesterday 8:05 PM", "Mon 8:05 PM".
    public static func when(_ date: Date, now: Date, _ lang: CoachLanguage, calendar: Calendar = .current) -> String? {
        guard let parts = whenParts(date, now: now, lang, calendar: calendar) else { return nil }
        return parts.day.map { "\($0) \(parts.time)" } ?? parts.time
    }

    /// One-letter weekday names in the coach language, Sunday first (as `Calendar.weekday` - 1).
    public static func weekdayLetters(_ lang: CoachLanguage) -> [String] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = Locale(identifier: lang.rawValue)
        let one = calendar.veryShortStandaloneWeekdaySymbols
        if Set(one).count == one.count { return one }
        // one letter would repeat (F S S M T W T): the fewest letters that tell the days apart
        let short = calendar.shortStandaloneWeekdaySymbols.map { $0.replacingOccurrences(of: ".", with: "") }
        for n in 2...4 {
            let cut = short.map { String($0.prefix(n)) }
            if Set(cut).count == cut.count { return cut }
        }
        return short
    }

    private struct Formats {
        let today: String
        let week: String
    }

    private static func format(_ key: KeyPath<Formats, String>, _ lang: CoachLanguage) -> String {
        (formats[lang] ?? formats[.english]!)[keyPath: key]
    }

    private static let formats: [CoachLanguage: Formats] = [
        .english: Formats(today: "Brushes today: %d of 2", week: "Brushes this week: %d"),
        .spanish: Formats(today: "Cepillados de hoy: %d de 2", week: "Cepillados esta semana: %d"),
        .french: Formats(today: "Brossages aujourd’hui : %d sur 2", week: "Brossages cette semaine : %d"),
        .japanese: Formats(today: "きょうのはみがき：2回中%d回", week: "今週のはみがき：%d回"),
        .chinese: Formats(today: "今天刷牙：%d/2 次", week: "本周刷牙：%d 次"),
        .korean: Formats(today: "오늘 양치: 2번 중 %d번", week: "이번 주 양치: %d번"),
        .portuguese: Formats(today: "Escovações de hoje: %d de 2", week: "Escovações nesta semana: %d"),
        .german: Formats(today: "Heute geputzt: %d von 2", week: "Diese Woche geputzt: %d"),
    ]

    private static let table: [CoachLanguage: [WidgetWord: String]] = [
        .english: [
            .todayName: "Today", .weekName: "This week", .lockName: "MouthLife",
            .todayAbout: "Your last brush and the next one.", .weekAbout: "Your brushes this week.", .lockAbout: "Starts the 2-minute brush.",
            .ready: "Ready?", .openApp: "Open MouthLife",
            .lastBrush: "Last brush", .timeToBrush: "Time to brush!", .beforeBed: "Brush before bed", .bedtime: "Before bed", .startsBrush: "Starts the 2-minute brush.", .next: "Next", .allDone: "All done today!", .yesterday: "Yesterday", .tomorrow: "Tomorrow",
        ],
        .spanish: [
            .todayName: "Hoy", .weekName: "Esta semana", .lockName: "MouthLife",
            .todayAbout: "Tu último cepillado y el próximo.", .weekAbout: "Tus cepillados de esta semana.", .lockAbout: "Empieza el cepillado de 2 minutos.",
            .ready: "¡Vamos!", .openApp: "Abrir MouthLife",
            .lastBrush: "Último cepillado", .timeToBrush: "¡Hora de cepillarse!", .beforeBed: "¡Cepillo y a dormir!", .bedtime: "Antes de dormir", .startsBrush: "Empieza el cepillado de 2 minutos.", .next: "Próximo", .allDone: "¡Listo por hoy!", .yesterday: "Ayer", .tomorrow: "Mañana",
        ],
        .french: [
            .todayName: "Aujourd’hui", .weekName: "Cette semaine", .lockName: "MouthLife",
            .todayAbout: "Ton dernier brossage et le prochain.", .weekAbout: "Tes brossages de la semaine.", .lockAbout: "Lance le brossage de 2 minutes.",
            .ready: "Prêt ?", .openApp: "Ouvrir MouthLife",
            .lastBrush: "Dernier brossage", .timeToBrush: "L’heure du brossage !", .beforeBed: "Les dents avant dodo !", .bedtime: "Avant dodo", .startsBrush: "Lance le brossage de 2 minutes.", .next: "Prochain", .allDone: "Fini pour aujourd’hui !", .yesterday: "Hier", .tomorrow: "Demain",
        ],
        .japanese: [
            .todayName: "きょう", .weekName: "こんしゅう", .lockName: "MouthLife",
            .todayAbout: "さいごのはみがきと、つぎのはみがき。", .weekAbout: "今週のはみがき。", .lockAbout: "2分間のはみがきをはじめます。",
            .ready: "じゅんびOK？", .openApp: "MouthLifeをひらく",
            .lastBrush: "さいごのはみがき", .timeToBrush: "はみがきのじかんだよ！", .beforeBed: "ねる前にはみがき", .bedtime: "ねる前", .startsBrush: "2分間のはみがきをはじめます。", .next: "つぎ", .allDone: "きょうはバッチリ！", .yesterday: "きのう", .tomorrow: "あした",
        ],
        .chinese: [
            .todayName: "今天", .weekName: "本周", .lockName: "MouthLife",
            .todayAbout: "上次刷牙和下次刷牙。", .weekAbout: "本周的刷牙。", .lockAbout: "开始两分钟刷牙。",
            .ready: "准备好了吗？", .openApp: "打开 MouthLife",
            .lastBrush: "上次刷牙", .timeToBrush: "刷牙时间到啦！", .beforeBed: "睡前记得刷牙", .bedtime: "睡前", .startsBrush: "开始两分钟刷牙。", .next: "下次", .allDone: "今天完成啦！", .yesterday: "昨天", .tomorrow: "明天",
        ],
        .korean: [
            .todayName: "오늘", .weekName: "이번 주", .lockName: "MouthLife",
            .todayAbout: "마지막 양치와 다음 양치.", .weekAbout: "이번 주 양치.", .lockAbout: "2분 양치를 시작해요.",
            .ready: "준비됐니?", .openApp: "MouthLife 열기",
            .lastBrush: "마지막 양치", .timeToBrush: "양치할 시간이에요!", .beforeBed: "자기 전에 양치해요", .bedtime: "자기 전", .startsBrush: "2분 양치를 시작해요.", .next: "다음", .allDone: "오늘 다 했어요!", .yesterday: "어제", .tomorrow: "내일",
        ],
        .portuguese: [
            .todayName: "Hoje", .weekName: "Esta semana", .lockName: "MouthLife",
            .todayAbout: "Sua última escovação e a próxima.", .weekAbout: "Suas escovações desta semana.", .lockAbout: "Começa a escovação de 2 minutos.",
            .ready: "Vamos lá!", .openApp: "Abrir o MouthLife",
            .lastBrush: "Última escovação", .timeToBrush: "Hora de escovar!", .beforeBed: "Escova e cama!", .bedtime: "Antes de dormir", .startsBrush: "Começa a escovação de 2 minutos.", .next: "Próxima", .allDone: "Tudo pronto hoje!", .yesterday: "Ontem", .tomorrow: "Amanhã",
        ],
        .german: [
            .todayName: "Heute", .weekName: "Diese Woche", .lockName: "MouthLife",
            .todayAbout: "Wann du zuletzt geputzt hast und wann als Nächstes.", .weekAbout: "Deine Putzrunden diese Woche.", .lockAbout: "Startet das 2-Minuten-Putzen.",
            .ready: "Bereit?", .openApp: "MouthLife öffnen",
            .lastBrush: "Zuletzt geputzt", .timeToBrush: "Zeit zum Zähneputzen!", .beforeBed: "Vorm Schlafen putzen", .bedtime: "Abends", .startsBrush: "Startet das 2-Minuten-Putzen.", .next: "Nächstes", .allDone: "Heute alles geputzt!", .yesterday: "Gestern", .tomorrow: "Morgen",
        ],
    ]
}
