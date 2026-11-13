import Foundation

/// Supported spoken & visual coaching languages for MouthLife's hands-free Brush-Along and UI.
/// Auto-detects the player's device locale on first launch and supports instant 1-tap switching.
public enum CoachLanguage: String, Codable, CaseIterable, Equatable, Sendable, Identifiable {
    case english = "en"
    case spanish = "es"
    case french = "fr"
    case japanese = "ja"
    case chinese = "zh"
    case korean = "ko"
    case portuguese = "pt"
    case german = "de"

    public var id: String { rawValue }

    public var bcp47VoiceCode: String {
        switch self {
        case .english: return "en-US"
        case .spanish: return "es-MX"
        case .french: return "fr-CA"
        case .japanese: return "ja-JP"
        case .chinese: return "zh-CN"
        case .korean: return "ko-KR"
        case .portuguese: return "pt-BR"
        case .german: return "de-DE"
        }
    }

    public var shortCode: String {
        rawValue.uppercased()
    }

    public var flagEmoji: String {
        switch self {
        case .english: return "🇺🇸"
        case .spanish: return "🇪🇸"
        case .french: return "🇫🇷"
        case .japanese: return "🇯🇵"
        case .chinese: return "🇨🇳"
        case .korean: return "🇰🇷"
        case .portuguese: return "🇧🇷"
        case .german: return "🇩🇪"
        }
    }

    public var nativeName: String {
        switch self {
        case .english: return "English"
        case .spanish: return "Español"
        case .french: return "Français"
        case .japanese: return "日本語"
        case .chinese: return "中文"
        case .korean: return "한국어"
        case .portuguese: return "Português"
        case .german: return "Deutsch"
        }
    }

    public static func detectSystemDefault(preferredLanguages: [String] = Locale.preferredLanguages) -> CoachLanguage {
        for tag in preferredLanguages {
            let lower = tag.lowercased()
            if lower.hasPrefix("es") { return .spanish }
            if lower.hasPrefix("fr") { return .french }
            if lower.hasPrefix("ja") { return .japanese }
            if lower.hasPrefix("zh") { return .chinese }
            if lower.hasPrefix("ko") { return .korean }
            if lower.hasPrefix("pt") { return .portuguese }
            if lower.hasPrefix("de") { return .german }
            if lower.hasPrefix("en") { return .english }
        }
        return .english
    }
}

/// Canonical body-locked quadrant (`0..3`), independent of camera transforms.
/// In Bathroom Mirror View: `patientRight` (`Q1`, `Q4`) is on **screen-right**, and `patientLeft` (`Q2`, `Q3`) is on **screen-left**.
public enum BrushQuadrant: Int, CaseIterable, Codable, Sendable {
    case upperRight = 0
    case upperLeft = 1
    case lowerLeft = 2
    case lowerRight = 3

    public var isUpper: Bool {
        self == .upperRight || self == .upperLeft
    }

    public var isPatientRight: Bool {
        self == .upperRight || self == .lowerRight
    }
}

/// Canonical tooth surface (`0..2`) within each 30-second quadrant.
public enum BrushSurface: Int, CaseIterable, Codable, Sendable {
    case outerCheek = 0
    case chewingGrooves = 1
    case innerTongue = 2
}

/// Single authoritative timeline snapshot driving the 2D Mirror Arch Compass, 3D SceneKit/Metal shaders,
/// 3-second musical anticipation chimes, and multilingual spoken voice cues in lockstep.
public struct BrushPhaseState: Equatable, Sendable {
    public let stage: PacerStage
    public var inFlossBonus: Bool { stage == .flossBonus }
    public var inMouthwashBonus: Bool { stage == .mouthwashBonus }
    public let quadrant: BrushQuadrant
    public let surface: BrushSurface
    public let phaseIndex12: Int
    public let phaseElapsedSec: Double
    public let phaseDurationSec: Double
    /// `3`, `2`, or `1` during the final 3 seconds before the next surface/arch/completion transition; `nil` otherwise.
    public let countdownPip: Int?
    /// `0...1` smooth pulse ramp during the final `0.85s` before switching surfaces or quadrants (or `0...1` rinse seal progress in mouthwash bonus).
    public let preEcho01: Float
    /// Next quadrant (`0..3`) when a quadrant boundary is within `0.85s`, otherwise `-1`.
    public let upcomingQuadrantIndex: Int
    /// Bitmask (`0...15`) of quadrants already completed (`0b1111` = all 4 crystal-clean during Floss & Mouthwash Bonus).
    public let completedQuadrantsMask: Int
    public let flossIsUpper: Bool
    public let flossContactIndex: Int
    /// `0` = saw-glide past contact, `1` = lean onto wall A, `2` = lean onto wall B & lift.
    public let flossStepIndex: Int
    /// `0` = Pour 10 mL & Swish Cheek-to-Cheek, `1` = Pump Between All 26 Gaps, `2` = Final Swish & Prepare to Spit (No Water 30m).
    public let mouthwashStepIndex: Int
    /// `0...1` overall Purple Total Care Fluoride Rinse progress for progressive Fluorapatite crystal sealing.
    public let mouthwashProgress01: Float

    public static func evaluate(
        elapsedSec: Double,
        inFlossBonus: Bool
    ) -> BrushPhaseState {
        evaluate(elapsedSec: elapsedSec, stage: inFlossBonus ? .flossBonus : .brushing)
    }

    public static func evaluate(
        elapsedSec: Double,
        stage: PacerStage,
        mouthwashDurationSec: Double = GameConfig.brushAlongMouthwashBonusSec
    ) -> BrushPhaseState {
        switch stage {
        case .mouthwashBonus:
            let mwStart = GameConfig.brushAlongTotalSec + GameConfig.brushAlongFlossBonusSec
            let mwTotal = max(6.0, mouthwashDurationSec)
            let mwElapsed = min(mwTotal - 0.001, max(0.0, elapsedSec - mwStart))
            let prog01 = Float(min(1.0, max(0.0, mwElapsed / mwTotal)))
            let subDur = mwTotal / 3.0
            let stepIdx = min(2, max(0, Int(floor(mwElapsed / subDur))))
            let subElapsed = mwElapsed - Double(stepIdx) * subDur
            let remInSub = max(0.0, subDur - subElapsed)
            let pip: Int? = (remInSub <= 3.0 && remInSub > 0.05) ? max(1, min(3, Int(ceil(remInSub)))) : nil

            // Alternate active mirror side pulse left/right smoothly for compass landmark balance
            let sloshRight = sin(mwElapsed * 2.4) >= 0
            let activeQuad: BrushQuadrant = sloshRight ? .upperRight : .upperLeft

            return BrushPhaseState(
                stage: .mouthwashBonus,
                quadrant: activeQuad,
                surface: .outerCheek,
                phaseIndex12: 14 + stepIdx,
                phaseElapsedSec: subElapsed,
                phaseDurationSec: subDur,
                countdownPip: pip,
                preEcho01: prog01,
                upcomingQuadrantIndex: -1,
                completedQuadrantsMask: 0b1111,
                flossIsUpper: true,
                flossContactIndex: 0,
                flossStepIndex: 0,
                mouthwashStepIndex: stepIdx,
                mouthwashProgress01: prog01
            )

        case .flossBonus:
            let flossElapsed = max(0.0, elapsedSec - GameConfig.brushAlongTotalSec)
            let bonusTotal = max(2.0, GameConfig.brushAlongFlossBonusSec)
            let halfDur = bonusTotal * 0.5
            let isUpper = flossElapsed < halfDur
            let archElapsed = isUpper ? flossElapsed : min(halfDur, flossElapsed - halfDur)
            let halfNorm = min(0.999, max(0.0, archElapsed / halfDur))
            let contactProg = min(12.999, max(0.0, halfNorm * 13.0))
            let cIdx = min(12, max(0, Int(floor(contactProg))))
            let gapFrac = contactProg - Double(cIdx)
            let stepIdx: Int
            if gapFrac < 0.30 {
                stepIdx = 0
            } else if gapFrac < 0.65 {
                stepIdx = 1
            } else {
                stepIdx = 2
            }

            let remInHalf = max(0.0, halfDur - archElapsed)
            let pip: Int? = (remInHalf <= 3.0 && remInHalf > 0.05) ? max(1, min(3, Int(ceil(remInHalf)))) : nil
            let preEcho: Float = remInHalf < 0.85 ? Float(min(1.0, max(0.0, (0.85 - remInHalf) / 0.85))) : 0.0

            // Mirror-Right (`cIdx < 6`) -> Q1/Q4; Mirror-Left (`cIdx >= 6`) -> Q2/Q3
            let activeQuad: BrushQuadrant
            if isUpper {
                activeQuad = cIdx < 6 ? .upperRight : .upperLeft
            } else {
                activeQuad = cIdx < 6 ? .lowerRight : .lowerLeft
            }

            return BrushPhaseState(
                stage: .flossBonus,
                quadrant: activeQuad,
                surface: .outerCheek,
                phaseIndex12: isUpper ? 12 : 13,
                phaseElapsedSec: archElapsed,
                phaseDurationSec: halfDur,
                countdownPip: pip,
                preEcho01: preEcho,
                upcomingQuadrantIndex: -1,
                completedQuadrantsMask: 0b1111,
                flossIsUpper: isUpper,
                flossContactIndex: cIdx,
                flossStepIndex: stepIdx,
                mouthwashStepIndex: 0,
                mouthwashProgress01: 0
            )

        case .brushing:
            let clamped = min(GameConfig.brushAlongTotalSec - 0.001, max(0.0, elapsedSec))
            let qRaw = min(3, max(0, Int(clamped / 30.0)))
            let qElapsed = clamped - Double(qRaw) * 30.0
            let sRaw = min(2, max(0, Int(qElapsed / 10.0)))
            let sElapsed = qElapsed - Double(sRaw) * 10.0
            let remSurface = max(0.0, 10.0 - sElapsed)

            let pip: Int? = (remSurface <= 3.0 && remSurface > 0.05) ? max(1, min(3, Int(ceil(remSurface)))) : nil
            let preEcho: Float = remSurface < 0.85 ? Float(min(1.0, max(0.0, (0.85 - remSurface) / 0.85))) : 0.0
            let upcomingQuad: Int = (sRaw == 2 && remSurface < 0.85 && qRaw < 3) ? (qRaw + 1) : -1

            var completedMask = 0
            for i in 0..<qRaw {
                completedMask |= (1 << i)
            }

            return BrushPhaseState(
                stage: .brushing,
                quadrant: BrushQuadrant(rawValue: qRaw) ?? .upperRight,
                surface: BrushSurface(rawValue: sRaw) ?? .outerCheek,
                phaseIndex12: qRaw * 3 + sRaw,
                phaseElapsedSec: sElapsed,
                phaseDurationSec: 10.0,
                countdownPip: pip,
                preEcho01: preEcho,
                upcomingQuadrantIndex: upcomingQuad,
                completedQuadrantsMask: completedMask,
                flossIsUpper: true,
                flossContactIndex: 0,
                flossStepIndex: 0,
                mouthwashStepIndex: 0,
                mouthwashProgress01: 0
            )
        }
    }
}

/// Glanceable 3-foot visual headlines (zero paragraph reading!) + concise natural spoken voice cues across 8 languages.
public enum BrushCoachCopy {

    // MARK: - Mirror Compass Side Labels

    public static func mirrorSideLabels(for lang: CoachLanguage) -> (left: String, right: String) {
        switch lang {
        case .english: return ("LEFT", "RIGHT")
        case .spanish: return ("IZQ", "DER")
        case .french: return ("GAUCHE", "DROITE")
        case .japanese: return ("左", "右")
        case .chinese: return ("左", "右")
        case .korean: return ("왼쪽", "오른쪽")
        case .portuguese: return ("ESQ", "DIR")
        case .german: return ("LINKS", "RECHTS")
        }
    }

    // MARK: - Giant 3-Foot Glanceable Headlines

    public static func quadrantLabel(_ q: BrushQuadrant, lang: CoachLanguage) -> String {
        switch (lang, q) {
        case (.english, .upperRight): return "TOP RIGHT"
        case (.english, .upperLeft): return "TOP LEFT"
        case (.english, .lowerLeft): return "BOTTOM LEFT"
        case (.english, .lowerRight): return "BOTTOM RIGHT"

        case (.spanish, .upperRight): return "ARRIBA DERECHA"
        case (.spanish, .upperLeft): return "ARRIBA IZQUIERDA"
        case (.spanish, .lowerLeft): return "ABAJO IZQUIERDA"
        case (.spanish, .lowerRight): return "ABAJO DERECHA"

        case (.french, .upperRight): return "HAUT DROITE"
        case (.french, .upperLeft): return "HAUT GAUCHE"
        case (.french, .lowerLeft): return "BAS GAUCHE"
        case (.french, .lowerRight): return "BAS DROITE"

        case (.japanese, .upperRight): return "右上"
        case (.japanese, .upperLeft): return "左上"
        case (.japanese, .lowerLeft): return "左下"
        case (.japanese, .lowerRight): return "右下"

        case (.chinese, .upperRight): return "右上"
        case (.chinese, .upperLeft): return "左上"
        case (.chinese, .lowerLeft): return "左下"
        case (.chinese, .lowerRight): return "右下"

        case (.korean, .upperRight): return "오른쪽 위"
        case (.korean, .upperLeft): return "왼쪽 위"
        case (.korean, .lowerLeft): return "왼쪽 아래"
        case (.korean, .lowerRight): return "오른쪽 아래"

        case (.portuguese, .upperRight): return "CIMA DIREITA"
        case (.portuguese, .upperLeft): return "CIMA ESQUERDA"
        case (.portuguese, .lowerLeft): return "BAIXO ESQUERDA"
        case (.portuguese, .lowerRight): return "BAIXO DIREITA"

        case (.german, .upperRight): return "OBEN RECHTS"
        case (.german, .upperLeft): return "OBEN LINKS"
        case (.german, .lowerLeft): return "UNTEN LINKS"
        case (.german, .lowerRight): return "UNTEN RECHTS"
        }
    }

    public static func surfaceActionBadge(_ s: BrushSurface, lang: CoachLanguage) -> (headline: String, angleTag: String) {
        switch (lang, s) {
        case (.english, .outerCheek): return ("OUTSIDE • GUMLINE", "45° ANGLE")
        case (.english, .chewingGrooves): return ("CHEWING GROOVES", "FLAT SCRUB")
        case (.english, .innerTongue): return ("INSIDE • TILT FRONT", "VERTICAL TIP")

        case (.spanish, .outerCheek): return ("AFUERA • ENCÍA", "ÁNGULO 45°")
        case (.spanish, .chewingGrooves): return ("MUELAS • ARRIBA", "PLANO")
        case (.spanish, .innerTongue): return ("ADENTRO • VERTICAL", "PUNTA 90°")

        case (.french, .outerCheek): return ("EXTÉRIEUR • GENCIVE", "ANGLE 45°")
        case (.french, .chewingGrooves): return ("DESSUS • SILLONS", "À PLAT")
        case (.french, .innerTongue): return ("INTÉRIEUR • VERTICAL", "VERTICAL 90°")

        case (.japanese, .outerCheek): return ("外側 • 歯ぐき", "45°斜め")
        case (.japanese, .chewingGrooves): return ("かみ合わせの溝", "水平")
        case (.japanese, .innerTongue): return ("内側 • 前歯は縦", "縦磨き")

        case (.chinese, .outerCheek): return ("外侧 • 牙龈线", "45°斜角")
        case (.chinese, .chewingGrooves): return ("咬合面沟槽", "平刷")
        case (.chinese, .innerTongue): return ("内侧 • 前牙竖刷", "竖立刷头")

        case (.korean, .outerCheek): return ("바깥쪽 • 잇몸선", "45° 각도")
        case (.korean, .chewingGrooves): return ("씹는 면 홈", "수평")
        case (.korean, .innerTongue): return ("안쪽 • 앞니 세우기", "수직 칫솔질")

        case (.portuguese, .outerCheek): return ("FORA • GENGIVA", "ÂNGULO 45°")
        case (.portuguese, .chewingGrooves): return ("TOPO • SULCOS", "PLANO")
        case (.portuguese, .innerTongue): return ("DENTRO • VERTICAL", "PONTA 90°")

        case (.german, .outerCheek): return ("AUSSEN • ZAHNFLEISCH", "45° WINKEL")
        case (.german, .chewingGrooves): return ("KAUFLÄCHEN", "FLACH")
        case (.german, .innerTongue): return ("INNEN • HOCHKANT", "VERTIKAL")
        }
    }

    public static func flossHeadline(isUpper: Bool, style: FlossToolStyle, stepIndex: Int, lang: CoachLanguage) -> (archTitle: String, actionBadge: String) {
        let usePick = (style == .flossPick)
        switch lang {
        case .english:
            let arch = isUpper ? "FLOSS PICK • TOP TEETH" : "FLOSS PICK • BOTTOM TEETH"
            let silk = isUpper ? "STRING FLOSS • TOP TEETH" : "STRING FLOSS • BOTTOM TEETH"
            let step: String
            if !usePick {
                step = "HUG BOTH SIDES IN A C-CURVE"
            } else if stepIndex == 0 {
                step = "WIGGLE GENTLY IN (DON'T SNAP)"
            } else if stepIndex == 1 {
                step = "LEAN RIGHT • HUG TOOTH WALL"
            } else {
                step = "LEAN LEFT • HUG OTHER WALL"
            }
            return (usePick ? arch : silk, step)

        case .spanish:
            let arch = isUpper ? "ARCO HILO • DIENTES ARRIBA" : "ARCO HILO • DIENTES ABAJO"
            let step = stepIndex == 0 ? "DESLIZA SUAVE SIN GOLPEAR" : "INCLINA A CADA LADO DEL DIENTE"
            return (arch, step)

        case .french:
            let arch = isUpper ? "PORTE-FIL • DENTS DU HAUT" : "PORTE-FIL • DENTS DU BAS"
            let step = stepIndex == 0 ? "GLISSEZ DOUCEMENT" : "INCLINEZ SUR CHAQUE PAROI"
            return (arch, step)

        case .japanese:
            let arch = isUpper ? "フロスピック • 上の歯" : "フロスピック • 下の歯"
            let step = stepIndex == 0 ? "やさしく前後にスライド" : "左右の歯の面に沿わせる"
            return (arch, step)

        case .chinese:
            let arch = isUpper ? "牙线棒 • 上排牙齿" : "牙线棒 • 下排牙齿"
            let step = stepIndex == 0 ? "轻轻锯动滑入牙缝" : "左右倾斜贴紧两侧牙面"
            return (arch, step)

        case .korean:
            let arch = isUpper ? "치실 픽 • 윗니" : "치실 픽 • 아랫니"
            let step = stepIndex == 0 ? "살살 앞뒤로 미끄러지듯 넣기" : "양쪽 치아 벽에 기대어 쓸기"
            return (arch, step)

        case .portuguese:
            let arch = isUpper ? "FIO COM HASTE • DENTES DE CIMA" : "FIO COM HASTE • DENTES DE BAIXO"
            let step = stepIndex == 0 ? "DESLIZE SUAVE SEM FORÇAR" : "INCLINE NOS DOIS LADOS"
            return (arch, step)

        case .german:
            let arch = isUpper ? "ZAHNSEIDESTICK • OBEN" : "ZAHNSEIDESTICK • UNTEN"
            let step = stepIndex == 0 ? "SANFT HINEINGLEITEN" : "LINKS & RECHTS ANLEHNEN"
            return (arch, step)
        }
    }

    public static func hubStartBrushLabel(for lang: CoachLanguage) -> String {
        switch lang {
        case .english: return "2m Brush • Pick • Rinse"
        case .spanish: return "2m Cepillo • Hilo • Enjuague"
        case .french: return "2m Brosse • Fil • Rinçage"
        case .japanese: return "2分 歯みがき・ピック・洗口液"
        case .chinese: return "2分钟 刷牙·牙线·漱口水"
        case .korean: return "2분 양치·치실픽·가글"
        case .portuguese: return "2m Escova • Fio • Enxágue"
        case .german: return "2m Putzen • Stick • Spülung"
        }
    }

    public static func actionButtonLabels(for lang: CoachLanguage) -> (flossJump: String, doneFloss: String, skipFloss: String) {
        switch lang {
        case .english: return ("Floss Pick", "Done (+75 F⁻)", "Skip (+50 F⁻)")
        case .spanish: return ("Usar Hilo", "Listo (+75 F⁻)", "Saltar (+50 F⁻)")
        case .french: return ("Porte-Fil", "Fini (+75 F⁻)", "Passer (+50 F⁻)")
        case .japanese: return ("フロスピック", "完了 (+75 F⁻)", "スキップ (+50 F⁻)")
        case .chinese: return ("牙线棒", "完成 (+75 F⁻)", "跳过 (+50 F⁻)")
        case .korean: return ("치실 픽", "완료 (+75 F⁻)", "건너뛰기 (+50 F⁻)")
        case .portuguese: return ("Fio Pick", "Pronto (+75 F⁻)", "Pular (+50 F⁻)")
        case .german: return ("Stick-Runde", "Fertig (+75 F⁻)", "Weiter (+50 F⁻)")
        }
    }

    public static func mouthwashButtonLabels(didFloss: Bool, lang: CoachLanguage) -> (rinseJump: String, doneRinse: String, skipRinse: String) {
        let fullIons = didFloss ? 100 : 75
        let skipIons = didFloss ? 75 : 50
        switch lang {
        case .english: return ("Purple Rinse", "Done (+\(fullIons) F⁻)", "Skip (+\(skipIons) F⁻)")
        case .spanish: return ("Enjuague Flúor", "Listo (+\(fullIons) F⁻)", "Saltar (+\(skipIons) F⁻)")
        case .french: return ("Bain Fluoré", "Fini (+\(fullIons) F⁻)", "Passer (+\(skipIons) F⁻)")
        case .japanese: return ("フッ素洗口", "完了 (+\(fullIons) F⁻)", "スキップ (+\(skipIons) F⁻)")
        case .chinese: return ("紫色含氟漱口", "完成 (+\(fullIons) F⁻)", "跳过 (+\(skipIons) F⁻)")
        case .korean: return ("보라 불소가글", "완료 (+\(fullIons) F⁻)", "건너뛰기 (+\(skipIons) F⁻)")
        case .portuguese: return ("Enxágue Flúor", "Pronto (+\(fullIons) F⁻)", "Pular (+\(skipIons) F⁻)")
        case .german: return ("Fluorid-Spülung", "Fertig (+\(fullIons) F⁻)", "Weiter (+\(skipIons) F⁻)")
        }
    }

    public static func mouthwashHeadline(stepIndex: Int, lang: CoachLanguage) -> (archTitle: String, actionBadge: String, ruleTag: String) {
        switch lang {
        case .english:
            let title = "PURPLE TOTAL CARE RINSE"
            if stepIndex == 0 {
                return (title, "SWISH CHEEK TO CHEEK • 10 mL", "ADA FLUORIDE")
            } else if stepIndex == 1 {
                return (title, "PUMP VIGOROUSLY BETWEEN TEETH", "ALL 26 GAPS")
            } else {
                return (title, "FINAL SWISH • DO NOT SWALLOW", "NO WATER 30m")
            }

        case .spanish:
            let title = "ENJUAGUE MORADO TOTAL CARE"
            if stepIndex == 0 {
                return (title, "BUCHES DE MEJILLA A MEJILLA • 10 mL", "FLÚOR ADA")
            } else if stepIndex == 1 {
                return (title, "EMPUJA FUERTE ENTRE LOS DIENTES", "26 ESPACIOS")
            } else {
                return (title, "RECTA FINAL • NO TRAGAR", "SIN AGUA 30m")
            }

        case .french:
            let title = "BAIN DE BOUCHE VIOLET TOTAL CARE"
            if stepIndex == 0 {
                return (title, "AGITEZ JOUE À JOUE • 10 mL", "FLUOR ADA")
            } else if stepIndex == 1 {
                return (title, "FAITES PASSER ENTRE LES DENTS", "26 ESPACES")
            } else {
                return (title, "DERNIER TOUR • NE PAS AVALER", "SANS EAU 30m")
            }

        case .japanese:
            let title = "パープル・トータルケア洗口液"
            if stepIndex == 0 {
                return (title, "10mLを左右の頬へブクブク", "フッ素コート")
            } else if stepIndex == 1 {
                return (title, "歯と歯の間へ強く通す", "全26箇所")
            } else {
                return (title, "仕上げ • 飲み込まないで吐き出す", "30分飲食なし")
            }

        case .chinese:
            let title = "紫色全效含氟漱口水"
            if stepIndex == 0 {
                return (title, "10毫升 左右脸颊鼓漱", "含氟护釉")
            } else if stepIndex == 1 {
                return (title, "用力把液体冲过所有牙缝", "26处牙缝")
            } else {
                return (title, "最后冲刺 • 切勿吞咽", "30分钟禁水食")
            }

        case .korean:
            let title = "퍼플 토탈케어 불소 가글"
            if stepIndex == 0 {
                return (title, "10mL 양볼로 힘차게 가글", "불소 코팅")
            } else if stepIndex == 1 {
                return (title, "치아 사이사이로 강하게 통과", "26개 틈새")
            } else {
                return (title, "마무리 가글 • 삼키지 마세요", "30분 물·음식 금지")
            }

        case .portuguese:
            let title = "ENXÁGUE ROXO TOTAL CARE"
            if stepIndex == 0 {
                return (title, "BOCHECHE DE LADO A LADO • 10 mL", "FLÚOR ADA")
            } else if stepIndex == 1 {
                return (title, "PASSE FORTE ENTRE OS DENTES", "26 ESPAÇOS")
            } else {
                return (title, "RETA FINAL • NÃO ENGULA", "SEM ÁGUA 30m")
            }

        case .german:
            let title = "LILA TOTAL CARE FLUORID-SPÜLUNG"
            if stepIndex == 0 {
                return (title, "KRÄFTIG HIN UND HER SPÜLEN • 10 mL", "ADA FLUORID")
            } else if stepIndex == 1 {
                return (title, "ZWISCHEN ALLE ZÄHNE PRESSEN", "26 LÜCKEN")
            } else {
                return (title, "ENDSPURT • NICHT SCHLUCKEN", "30m KEIN WASSER")
            }
        }
    }

    // MARK: - Concise Hands-Free Spoken Audio Cues

    public static func spokenBrushCue(quadrant: BrushQuadrant, surface: BrushSurface, lang: CoachLanguage) -> String {
        if surface == .outerCheek {
            switch (lang, quadrant) {
            case (.english, .upperRight): return "Top right, outside. Angle gently to the gumline."
            case (.english, .upperLeft): return "Switch. Top left, outside."
            case (.english, .lowerLeft): return "Bottom left, outside."
            case (.english, .lowerRight): return "Final section. Bottom right, outside."

            case (.spanish, .upperRight): return "Arriba a la derecha, por fuera. Inclina hacia la encía."
            case (.spanish, .upperLeft): return "Cambio. Arriba a la izquierda, por fuera."
            case (.spanish, .lowerLeft): return "Abajo a la izquierda, por fuera."
            case (.spanish, .lowerRight): return "Última zona. Abajo a la derecha, por fuera."

            case (.french, .upperRight): return "En haut à droite, extérieur. Inclinez vers la gencive."
            case (.french, .upperLeft): return "Changez. En haut à gauche, extérieur."
            case (.french, .lowerLeft): return "En bas à gauche, extérieur."
            case (.french, .lowerRight): return "Dernière zone. En bas à droite, extérieur."

            case (.japanese, .upperRight): return "右上、外側。歯ぐきに斜めにあてます。"
            case (.japanese, .upperLeft): return "チェンジ。左上、外側。"
            case (.japanese, .lowerLeft): return "左下、外側。"
            case (.japanese, .lowerRight): return "最後です。右下、外側。"

            case (.chinese, .upperRight): return "右上，外侧。斜向牙龈轻刷。"
            case (.chinese, .upperLeft): return "换边。左上，外侧。"
            case (.chinese, .lowerLeft): return "左下，外侧。"
            case (.chinese, .lowerRight): return "最后一段。右下，外侧。"

            case (.korean, .upperRight): return "오른쪽 위, 바깥쪽. 잇몸선으로 살짝 기울이세요."
            case (.korean, .upperLeft): return "바꿔서, 왼쪽 위 바깥쪽."
            case (.korean, .lowerLeft): return "왼쪽 아래, 바깥쪽."
            case (.korean, .lowerRight): return "마지막 구역, 오른쪽 아래 바깥쪽."

            case (.portuguese, .upperRight): return "Em cima à direita, por fora. Incline na gengiva."
            case (.portuguese, .upperLeft): return "Troque. Em cima à esquerda, por fora."
            case (.portuguese, .lowerLeft): return "Embaixo à esquerda, por fora."
            case (.portuguese, .lowerRight): return "Última parte. Embaixo à direita, por fora."

            case (.german, .upperRight): return "Oben rechts, außen. Sanft zum Zahnfleisch neigen."
            case (.german, .upperLeft): return "Wechsel. Oben links, außen."
            case (.german, .lowerLeft): return "Unten links, außen."
            case (.german, .lowerRight): return "Letzter Abschnitt. Unten rechts, außen."
            }
        } else if surface == .chewingGrooves {
            switch lang {
            case .english: return "Chewing surfaces."
            case .spanish: return "Superficies de masticar."
            case .french: return "Surfaces de mastication."
            case .japanese: return "かみ合わせの面。"
            case .chinese: return "咬合面沟槽。"
            case .korean: return "씹는 면."
            case .portuguese: return "Topo dos dentes."
            case .german: return "Kauflächen."
            }
        } else {
            switch lang {
            case .english: return "Inside. Tilt brush vertical behind front teeth."
            case .spanish: return "Por dentro. Cepillo vertical en los dientes frontales."
            case .french: return "Intérieur. Brosse verticale derrière les dents de devant."
            case .japanese: return "内側。前歯の裏はブラシを縦にします。"
            case .chinese: return "内侧。前牙内侧请把牙刷竖起来。"
            case .korean: return "안쪽. 앞니 뒤는 칫솔을 세워주세요."
            case .portuguese: return "Por dentro. Escova na vertical nos dentes da frente."
            case .german: return "Innen. Hinter den Schneidezähnen Bürste hochkant halten."
            }
        }
    }

    public static func spokenFlossStartCue(style: FlossToolStyle, lang: CoachLanguage) -> String {
        let usePick = (style == .flossPick)
        switch lang {
        case .english:
            return usePick
                ? "Great brushing! Bonus round: Floss Pick, top teeth. Wiggle gently in, lean left and right."
                : "Great brushing! Bonus round: Floss top teeth, hugging each side."
        case .spanish:
            return "Muy bien. Ronda extra con hilo, dientes de arriba. Desliza suave e inclina a cada lado."
        case .french:
            return "Bravo. Bonus porte-fil, dents du haut. Glissez doucement sur chaque côté."
        case .japanese:
            return "ブラッシング完了！ボーナス、フロスピックで上の歯。やさしく入れて左右に沿わせましょう。"
        case .chinese:
            return "刷得真棒！加分环节，牙线棒清洁上排牙齿，轻轻滑入，左右贴紧牙面。"
        case .korean:
            return "잘하셨어요! 보너스 치실 픽, 윗니부터 살살 넣어 양쪽 벽을 쓸어주세요."
        case .portuguese:
            return "Ótima escovação! Bônus com fio, dentes de cima. Deslize suave nos dois lados."
        case .german:
            return "Super geputzt! Bonusrunde Zahnseidestick, obere Zähne. Sanft gleiten und beidseitig anlehnen."
        }
    }

    public static func spokenFlossLowerCue(lang: CoachLanguage) -> String {
        switch lang {
        case .english: return "Halfway. Bottom teeth."
        case .spanish: return "Mitad. Dientes de abajo."
        case .french: return "À mi-chemin. Dents du bas."
        case .japanese: return "半分です。下の歯へ。"
        case .chinese: return "过半啦，换下排牙齿。"
        case .korean: return "절반 완료. 이제 아랫니입니다."
        case .portuguese: return "Metade. Dentes de baixo."
        case .german: return "Halbzeit. Untere Zähne."
        }
    }

    public static func spokenMouthwashStartCue(durationSec: Int, lang: CoachLanguage) -> String {
        let is60 = (durationSec >= 45)
        switch lang {
        case .english:
            return is60
                ? "Final bonus: Purple Total Care Fluoride Rinse! Pour ten milliliters and swish cheek to cheek for one minute. Do not swallow."
                : "Final bonus: Purple Fluoride Rinse! Pour ten milliliters and swish cheek to cheek for thirty seconds."
        case .spanish:
            return is60
                ? "Ronda final: Enjuague morado con flúor. Toma diez mililitros y haz buches por un minuto sin tragar."
                : "Ronda final: Enjuague morado con flúor. Haz buches por treinta segundos sin tragar."
        case .french:
            return is60
                ? "Bonus final : bain de bouche violet au fluor. Prenez dix millilitres et agitez pendant une minute sans avaler."
                : "Bonus final : bain de bouche violet au fluor pendant trente secondes, sans avaler."
        case .japanese:
            return is60
                ? "最後のボーナス、紫のトータルケア洗口液！10ミリリットルを口に含み、1分間ブクブクゆすぎます。"
                : "最後のボーナス、紫のフッ素洗口液！30秒間しっかりブクブクゆすぎます。"
        case .chinese:
            return is60
                ? "最后一关：紫色全效含氟漱口水！倒十毫升，左右鼓漱一分钟，不要吞咽。"
                : "最后一关：紫色含氟漱口水！左右鼓漱三十秒，不要吞咽。"
        case .korean:
            return is60
                ? "마지막 보너스, 퍼플 토탈케어 불소 가글! 10밀리리터를 머금고 1분 동안 양볼로 힘차게 가글하세요."
                : "마지막 보너스, 퍼플 불소 가글! 30초 동안 힘차게 가글하세요."
        case .portuguese:
            return is60
                ? "Bônus final: enxágue roxo Total Care com flúor! Bocheche dez mililitros por um minuto, sem engolir."
                : "Bônus final: enxágue roxo com flúor por trinta segundos, sem engolir."
        case .german:
            return is60
                ? "Letzte Bonusrunde: Lila Total Care Fluorid-Spülung! Zehn Milliliter eine Minute kräftig spülen, nicht schlucken."
                : "Letzte Bonusrunde: Lila Fluorid-Spülung dreißig Sekunden kräftig spülen, nicht schlucken."
        }
    }

    public static func spokenMouthwashStepCue(stepIndex: Int, lang: CoachLanguage) -> String {
        if stepIndex == 1 {
            switch lang {
            case .english: return "Pump the rinse vigorously between all your teeth."
            case .spanish: return "Empuja el líquido con fuerza entre todos los dientes."
            case .french: return "Faites passer le liquide vigoureusement entre toutes les dents."
            case .japanese: return "歯と歯の間へ、液体を強く通しましょう。"
            case .chinese: return "用力把漱口水冲过每一处牙缝。"
            case .korean: return "치아 사이사이로 가글액을 힘차게 통과시키세요."
            case .portuguese: return "Passe o líquido com força entre todos os dentes."
            case .german: return "Spülung kräftig zwischen alle Zähne pressen."
            }
        } else {
            switch lang {
            case .english: return "Final stretch! Keep swishing, and remember: after spitting, no water or food for thirty minutes."
            case .spanish: return "Últimos segundos. Al escupir, no tomes agua ni comas por treinta minutos."
            case .french: return "Dernière ligne droite ! Après avoir craché, ni eau ni repas pendant trente minutes."
            case .japanese: return "あと少し！吐き出した後は、30分間水ですすいだり飲食しないでください。"
            case .chinese: return "最后冲刺！吐掉后三十分钟内不要用水漱口或进食。"
            case .korean: return "거의 다 됐어요! 뱉은 뒤 30분 동안 물로 헹구거나 드시지 마세요."
            case .portuguese: return "Reta final! Depois de cuspir, fique trinta minutos sem água ou comida."
            case .german: return "Endspurt! Nach dem Ausspucken dreißig Minuten kein Wasser und nichts essen."
            }
        }
    }

    public static func spokenSessionCompleteCue(includedMouthwash: Bool = false, lang: CoachLanguage) -> String {
        if includedMouthwash {
            switch lang {
            case .english:
                return "Total Care complete! Spit out completely. Do not rinse with water, eat, or drink for thirty minutes so your fluoride shield locks in."
            case .spanish:
                return "¡Total Care completo! Escupe todo. No enjuagues con agua ni comas o bebas por treinta minutos para fijar el flúor."
            case .french:
                return "Soin complet terminé ! Crachez tout. Ne rincez pas à l'eau et ne mangez ni buvez pendant trente minutes."
            case .japanese:
                return "トータルケア完了！しっかり吐き出して、フッ素が定着するよう30分間は水ゆすぎや飲食を控えてください。"
            case .chinese:
                return "全效护理完成！请完全吐出，三十分钟内不要用水漱口、喝水或进食，让氟保护层牢牢锁住。"
            case .korean:
                return "토탈케어 완료! 완전히 뱉어내시고, 불소막이 고정되도록 30분 동안 물로 헹구거나 드시지 마세요."
            case .portuguese:
                return "Total Care concluído! Cuspa tudo. Não enxágue com água nem coma ou beba por trinta minutos."
            case .german:
                return "Total Care geschafft! Komplett ausspucken und dreißig Minuten nicht mit Wasser nachspülen, essen oder trinken."
            }
        }
        switch lang {
        case .english: return "All sparkling clean! Spit excess foam, don't rinse right away."
        case .spanish: return "Todo brillante. Escupe la espuma sin enjuagar todavía."
        case .french: return "Tout est propre ! Crachez la mousse sans rincer tout de suite."
        case .japanese: return "ピカピカです！泡を吐き出して、すぐにはゆすがないでくださいね。"
        case .chinese: return "全部亮晶晶！吐掉多余泡沫，先别马上漱口哦。"
        case .korean: return "반짝반짝 깨끗해졌어요! 거품만 뱉고 바로 헹구지 마세요."
        case .portuguese: return "Tudo brilhando! Cuspa a espuma sem enxaguar agora."
        case .german: return "Alles blitzblank! Schaum ausspucken, noch nicht direkt nachspülen."
        }
    }
}
