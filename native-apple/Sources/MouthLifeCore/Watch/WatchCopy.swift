import Foundation

/// The Apple Watch's words: one or two per screen, big enough to read at arm's length in a mirror,
/// in the same eight languages as the brushing coach. (Kept here, like BrushCoachCopy, rather than
/// in the web's string list: the web has no watch.)
public enum WatchWord: String, CaseIterable, Sendable {
    case brush, floss, rinse, start
    case outside, chewing, inside
    case top, bottom
    case swish, betweenTeeth, lastSwish, spitOut
    case done, goodTry
    case savedOnWatch, sending
    case pause, resume, next, skip, end, tapAgain, keepGoing, more
}

public enum WatchCopy {
    public static func word(_ w: WatchWord, _ lang: CoachLanguage) -> String {
        table[lang]?[w] ?? table[.english]![w]!
    }

    /// The surface being brushed, as one word.
    public static func surface(_ s: BrushSurface, _ lang: CoachLanguage) -> String {
        switch s {
        case .outerCheek: return word(.outside, lang)
        case .chewingGrooves: return word(.chewing, lang)
        case .innerTongue: return word(.inside, lang)
        }
    }

    /// The rinse step (0, 1, 2) as one or two words.
    public static func rinseStep(_ step: Int, _ lang: CoachLanguage) -> String {
        switch step {
        case 0: return word(.swish, lang)
        case 1: return word(.betweenTeeth, lang)
        default: return word(.lastSwish, lang)
        }
    }

    /// What VoiceOver reads for the brushing face, e.g. "Top right, outside. Step 1 of 4."
    public static func brushingAccessibility(_ q: BrushQuadrant, _ s: BrushSurface, _ lang: CoachLanguage) -> String {
        "\(BrushCoachCopy.quadrantLabel(q, lang: lang)), \(surface(s, lang)). \(q.rawValue + 1) / 4"
    }

    static let table: [CoachLanguage: [WatchWord: String]] = [
        .english: [
            .brush: "Brush", .floss: "Floss", .rinse: "Rinse", .start: "Start",
            .outside: "Outside", .chewing: "Chewing", .inside: "Inside",
            .top: "Top", .bottom: "Bottom",
            .swish: "Swish", .betweenTeeth: "Between teeth", .lastSwish: "Last swish", .spitOut: "Spit out",
            .done: "Done!", .goodTry: "Good try!",
            .savedOnWatch: "Saved on watch", .sending: "Sending to iPhone",
            .pause: "Pause", .resume: "Resume", .next: "Next", .skip: "Skip", .end: "End",
            .tapAgain: "Tap again", .keepGoing: "Keep going", .more: "More",
        ],
        .spanish: [
            .brush: "Cepillar", .floss: "Hilo", .rinse: "Enjuague", .start: "Empezar",
            .outside: "Fuera", .chewing: "Muelas", .inside: "Dentro",
            .top: "Arriba", .bottom: "Abajo",
            .swish: "Enjuaga", .betweenTeeth: "Entre dientes", .lastSwish: "Último", .spitOut: "Escupe",
            .done: "¡Listo!", .goodTry: "¡Buen intento!",
            .savedOnWatch: "Guardado en el reloj", .sending: "Enviando al iPhone",
            .pause: "Pausa", .resume: "Seguir", .next: "Siguiente", .skip: "Saltar", .end: "Terminar",
            .tapAgain: "Toca otra vez", .keepGoing: "Continuar", .more: "Más",
        ],
        .french: [
            .brush: "Brosser", .floss: "Fil", .rinse: "Rinçage", .start: "Go",
            .outside: "Dehors", .chewing: "Dessus", .inside: "Dedans",
            .top: "En haut", .bottom: "En bas",
            .swish: "Gargarise", .betweenTeeth: "Entre les dents", .lastSwish: "Dernier", .spitOut: "Crache",
            .done: "Fini !", .goodTry: "Bel essai !",
            .savedOnWatch: "Gardé sur la montre", .sending: "Envoi à l'iPhone",
            .pause: "Pause", .resume: "Reprendre", .next: "Suivant", .skip: "Passer", .end: "Arrêter",
            .tapAgain: "Touche encore", .keepGoing: "Continuer", .more: "Plus",
        ],
        .japanese: [
            .brush: "みがく", .floss: "フロス", .rinse: "うがい", .start: "スタート",
            .outside: "そとがわ", .chewing: "かむところ", .inside: "うちがわ",
            .top: "うえ", .bottom: "した",
            .swish: "ぶくぶく", .betweenTeeth: "はのあいだ", .lastSwish: "さいご", .spitOut: "ぺっとだす",
            .done: "できた！", .goodTry: "がんばったね！",
            .savedOnWatch: "ウォッチにほぞん", .sending: "iPhoneにおくっています",
            .pause: "いちじていし", .resume: "つづける", .next: "つぎへ", .skip: "スキップ", .end: "おわる",
            .tapAgain: "もういちどタップ", .keepGoing: "つづける", .more: "その他",
        ],
        .chinese: [
            .brush: "刷牙", .floss: "牙线", .rinse: "漱口", .start: "开始",
            .outside: "外侧", .chewing: "咬合面", .inside: "内侧",
            .top: "上排", .bottom: "下排",
            .swish: "漱一漱", .betweenTeeth: "牙缝", .lastSwish: "最后一次", .spitOut: "吐出来",
            .done: "完成！", .goodTry: "做得不错！",
            .savedOnWatch: "已存在手表上", .sending: "正在发送到 iPhone",
            .pause: "暂停", .resume: "继续", .next: "下一步", .skip: "跳过", .end: "结束",
            .tapAgain: "再点一下", .keepGoing: "继续", .more: "更多",
        ],
        .korean: [
            .brush: "양치", .floss: "치실", .rinse: "가글", .start: "시작",
            .outside: "바깥쪽", .chewing: "씹는 면", .inside: "안쪽",
            .top: "위", .bottom: "아래",
            .swish: "가글가글", .betweenTeeth: "이 사이", .lastSwish: "마지막", .spitOut: "뱉어요",
            .done: "끝!", .goodTry: "좋은 시작이에요!",
            .savedOnWatch: "워치에 저장됨", .sending: "iPhone으로 보내는 중",
            .pause: "일시정지", .resume: "계속", .next: "다음", .skip: "건너뛰기", .end: "끝내기",
            .tapAgain: "한 번 더 탭", .keepGoing: "계속하기", .more: "더보기",
        ],
        .portuguese: [
            .brush: "Escovar", .floss: "Fio", .rinse: "Enxágue", .start: "Começar",
            .outside: "Fora", .chewing: "Em cima", .inside: "Dentro",
            .top: "Em cima", .bottom: "Embaixo",
            .swish: "Bochecha", .betweenTeeth: "Entre os dentes", .lastSwish: "Último", .spitOut: "Cuspa",
            .done: "Pronto!", .goodTry: "Boa tentativa!",
            .savedOnWatch: "Salvo no relógio", .sending: "Enviando ao iPhone",
            .pause: "Pausar", .resume: "Continuar", .next: "Próximo", .skip: "Pular", .end: "Terminar",
            .tapAgain: "Toque de novo", .keepGoing: "Continuar", .more: "Mais",
        ],
        .german: [
            .brush: "Putzen", .floss: "Zahnseide", .rinse: "Spülen", .start: "Los",
            .outside: "Außen", .chewing: "Kauflächen", .inside: "Innen",
            .top: "Oben", .bottom: "Unten",
            .swish: "Spülen", .betweenTeeth: "Zwischen den Zähnen", .lastSwish: "Zum Schluss", .spitOut: "Ausspucken",
            .done: "Fertig!", .goodTry: "Guter Anfang!",
            .savedOnWatch: "Auf der Uhr gespeichert", .sending: "Wird ans iPhone gesendet",
            .pause: "Pause", .resume: "Weiter", .next: "Weiter", .skip: "Überspringen", .end: "Beenden",
            .tapAgain: "Nochmal tippen", .keepGoing: "Weitermachen", .more: "Mehr",
        ],
    ]
}
