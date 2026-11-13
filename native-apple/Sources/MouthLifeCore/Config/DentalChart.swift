import Foundation

public enum ToothNumberingSystem: String, Codable, CaseIterable, Equatable, Sendable, Identifiable {
    case universal
    case fdi
    case palmer

    public var id: String { rawValue }
}

public enum ToothArch: String, Codable, CaseIterable, Equatable, Sendable, Identifiable {
    case upper
    case lower

    public var id: String { rawValue }
}

public typealias DentalArch = ToothArch

public enum PatientSide: String, Codable, CaseIterable, Equatable, Sendable, Identifiable {
    case right
    case left

    public var id: String { rawValue }
}

public enum ToothCategory: String, Codable, CaseIterable, Equatable, Sendable, Identifiable {
    case incisor
    case canine
    case premolar
    case molar

    public var id: String { rawValue }
}

public struct AdultToothEntry: Codable, Equatable, Sendable, Identifiable {
    public var id: Int { universal }
    /// ADA Universal Number (1..32, clockwise from Upper Right 3rd Molar #1 to Lower Right 3rd Molar #32).
    public var universal: Int
    /// ISO 3950 / FDI two-digit code ("11".."48"), pronounced digit-by-digit (e.g. "16" = "one-six").
    public var fdi: String
    /// Spoken FDI readout so learners do not read "16" as "sixteen".
    public var fdiSpoken: String
    /// Clinical Palmer notation using quadrant bracket + midline index 1..8 (e.g. "6┘", "└1", "┌6", "3┐").
    public var palmer: String
    /// Clinical quadrant 1..4 (1=UR, 2=UL, 3=LL, 4=LR).
    public var quadrant: Int
    /// Tooth position counting distally from the central midline (1 = Central Incisor .. 8 = 3rd Molar).
    public var positionFromMidline: Int
    public var arch: ToothArch
    public var side: PatientSide
    public var category: ToothCategory
    public var isWisdomTooth: Bool
    /// Full clinical name, e.g. "Upper Right 1st Molar".
    public var clinicalName: String
    /// Everyday / historical dental nickname, e.g. "Six-Year Molar" or "Eye Tooth (Cuspid)".
    public var commonNickname: String
    /// Typical permanent eruption window.
    public var eruptionAge: String
    /// Typical root count.
    public var roots: Int
    /// Typical cusp count (0 for chisel-shaped incisal ridges).
    public var cusps: Int
    /// Concise crown/root anatomy note.
    public var anatomyFact: String
    /// Practical daily brushing/flossing tip.
    public var careTip: String
    /// Campaign world spotlighting this tooth class.
    public var worldId: String
    /// Corresponding crown index (0..13) on the 14-tooth 3D Companion Arch, or nil for 3rd molars (wisdom teeth).
    public var companionArchIndex: Int?

    public var funFact: String { anatomyFact }
    public var companionCrownIndex: Int? { companionArchIndex }

    public init(
        universal: Int,
        fdi: String,
        fdiSpoken: String,
        palmer: String,
        quadrant: Int,
        positionFromMidline: Int,
        arch: ToothArch,
        side: PatientSide,
        category: ToothCategory,
        isWisdomTooth: Bool,
        clinicalName: String,
        commonNickname: String,
        eruptionAge: String,
        roots: Int,
        cusps: Int,
        anatomyFact: String,
        careTip: String,
        worldId: String,
        companionArchIndex: Int?
    ) {
        self.universal = universal
        self.fdi = fdi
        self.fdiSpoken = fdiSpoken
        self.palmer = palmer
        self.quadrant = quadrant
        self.positionFromMidline = positionFromMidline
        self.arch = arch
        self.side = side
        self.category = category
        self.isWisdomTooth = isWisdomTooth
        self.clinicalName = clinicalName
        self.commonNickname = commonNickname
        self.eruptionAge = eruptionAge
        self.roots = roots
        self.cusps = cusps
        self.anatomyFact = anatomyFact
        self.careTip = careTip
        self.worldId = worldId
        self.companionArchIndex = companionArchIndex
    }
}

public typealias AdultToothInfo = AdultToothEntry

public struct CompanionCrownSummary: Codable, Equatable, Sendable, Identifiable {
    public var id: Int { toothIndex }
    public var toothIndex: Int
    public var sideLabel: String
    public var toothTypeLabel: String
    public var upperTooth: AdultToothEntry
    public var lowerTooth: AdultToothEntry

    public init(
        toothIndex: Int,
        sideLabel: String,
        toothTypeLabel: String,
        upperTooth: AdultToothEntry,
        lowerTooth: AdultToothEntry
    ) {
        self.toothIndex = toothIndex
        self.sideLabel = sideLabel
        self.toothTypeLabel = toothTypeLabel
        self.upperTooth = upperTooth
        self.lowerTooth = lowerTooth
    }
}

public struct ToothSurfaceInfo: Codable, Equatable, Sendable, Identifiable {
    public var id: String { code }
    public var code: String
    public var name: String
    public var whereItFaces: String
    public var howToClean: String

    public init(code: String, name: String, whereItFaces: String, howToClean: String) {
        self.code = code
        self.name = name
        self.whereItFaces = whereItFaces
        self.howToClean = howToClean
    }
}

public typealias ToothSurfaceGuide = ToothSurfaceInfo

public struct QuadrantNumberingMeta: Codable, Equatable, Sendable, Identifiable {
    public var id: Int { quadrant }
    public var quadrant: Int
    public var shortCode: String
    public var title: String
    public var universalRange: String
    public var fdiRange: String
    public var palmerSymbol: String
    public var chartOrderUniversal: [Int]

    public init(
        quadrant: Int,
        shortCode: String,
        title: String,
        universalRange: String,
        fdiRange: String,
        palmerSymbol: String,
        chartOrderUniversal: [Int]
    ) {
        self.quadrant = quadrant
        self.shortCode = shortCode
        self.title = title
        self.universalRange = universalRange
        self.fdiRange = fdiRange
        self.palmerSymbol = palmerSymbol
        self.chartOrderUniversal = chartOrderUniversal
    }
}

public enum ToothLayerId: String, Codable, CaseIterable, Equatable, Sendable, Identifiable {
    case enamel
    case dentin
    case pulp
    case ligament

    public var id: String { rawValue }
}

public struct ToothLayerInfo: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var layerKind: ToothLayerId
    public var name: String
    public var emoji: String
    public var mineralPercent: Int?
    public var tagline: String
    public var detail: String
    public var careTip: String
    public var colorHex: String

    public init(
        layerKind: ToothLayerId,
        name: String,
        emoji: String,
        mineralPercent: Int?,
        tagline: String,
        detail: String,
        careTip: String,
        colorHex: String
    ) {
        self.id = layerKind.rawValue
        self.layerKind = layerKind
        self.name = name
        self.emoji = emoji
        self.mineralPercent = mineralPercent
        self.tagline = tagline
        self.detail = detail
        self.careTip = careTip
        self.colorHex = colorHex
    }
}

public struct WorldDentalLesson: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var focusTeethBadge: String
    public var headline: String
    public var lesson: String

    public init(id: String, focusTeethBadge: String, headline: String, lesson: String) {
        self.id = id
        self.focusTeethBadge = focusTeethBadge
        self.headline = headline
        self.lesson = lesson
    }
}

public enum SpotQuizDifficulty: String, Codable, CaseIterable, Equatable, Sendable, Identifiable {
    case full
    case name
    case code

    public var id: String { rawValue }
}

public struct DentalSpotQuestion: Codable, Equatable, Sendable, Identifiable {
    public var id: String { "\(targetUniversal)-\(difficulty.rawValue)" }
    public var targetUniversal: Int
    public var prompt: String
    public var difficulty: SpotQuizDifficulty

    public init(targetUniversal: Int, prompt: String, difficulty: SpotQuizDifficulty) {
        self.targetUniversal = targetUniversal
        self.prompt = prompt
        self.difficulty = difficulty
    }
}

public typealias SpotQuizQuestion = DentalSpotQuestion

public struct DentalSpotAnswerGrade: Codable, Equatable, Sendable, Identifiable {
    public var id: String { "\(targetUniversal)-\(tappedUniversal)-\(nextStreak)" }
    public var targetUniversal: Int
    public var tappedUniversal: Int
    public var correct: Bool
    public var nextStreak: Int
    public var bestStreak: Int
    public var message: String

    public init(
        targetUniversal: Int,
        tappedUniversal: Int,
        correct: Bool,
        nextStreak: Int,
        bestStreak: Int,
        message: String
    ) {
        self.targetUniversal = targetUniversal
        self.tappedUniversal = tappedUniversal
        self.correct = correct
        self.nextStreak = nextStreak
        self.bestStreak = bestStreak
        self.message = message
    }
}

public typealias SpotQuizResult = DentalSpotAnswerGrade

private struct PositionAnatomyTemplate: Sendable {
    let pos: Int
    let category: ToothCategory
    let shortRole: String
    let nicknameUpper: String
    let nicknameLower: String
    let eruptionUpper: String
    let eruptionLower: String
    let rootsUpper: Int
    let rootsLower: Int
    let cuspsUpper: Int
    let cuspsLower: Int
    let worldUpper: String
    let worldLower: String
    let anatomyUpper: String
    let anatomyLower: String
    let careTip: String
}

public enum DentalChart {
    private static let digitWords: [Int: String] = [
        1: "one",
        2: "two",
        3: "three",
        4: "four",
        5: "five",
        6: "six",
        7: "seven",
        8: "eight"
    ]

    private static let positionTemplates: [PositionAnatomyTemplate] = [
        PositionAnatomyTemplate(
            pos: 1,
            category: .incisor,
            shortRole: "Central Incisor",
            nicknameUpper: "Front Smile Tooth",
            nicknameLower: "Lower Front Tooth (Smallest Tooth)",
            eruptionUpper: "7–8 yrs",
            eruptionLower: "6–7 yrs",
            rootsUpper: 1,
            rootsLower: 1,
            cuspsUpper: 0,
            cuspsLower: 0,
            worldUpper: "world_1",
            worldLower: "world_4",
            anatomyUpper: "Broad chisel-shaped crown with a single conical root; erupts with 3 tiny bumps (mamelons) that wear smooth over time.",
            anatomyLower: "Narrowest, most symmetrical crown in the human mouth with 1 slender root; sits right beside salivary ducts under the tongue.",
            careTip: "Hold your brush up and down behind these teeth. Hard tartar builds up here fastest!"
        ),
        PositionAnatomyTemplate(
            pos: 2,
            category: .incisor,
            shortRole: "Lateral Incisor",
            nicknameUpper: "Side Smile Tooth",
            nicknameLower: "Lower Side Front Tooth",
            eruptionUpper: "8–9 yrs",
            eruptionLower: "7–8 yrs",
            rootsUpper: 1,
            rootsLower: 1,
            cuspsUpper: 0,
            cuspsLower: 0,
            worldUpper: "world_1",
            worldLower: "world_4",
            anatomyUpper: "A little thinner than the front tooth, with one rounded corner and a small dent on the back.",
            anatomyLower: "A little wider than the lower front tooth, with 1 root. It helps the front teeth cut food.",
            careTip: "Where these teeth overlap, hug each side with floss in a gentle C-shape."
        ),
        PositionAnatomyTemplate(
            pos: 3,
            category: .canine,
            shortRole: "Canine",
            nicknameUpper: "Cuspid / \"Eye Tooth\"",
            nicknameLower: "Lower Cuspid",
            eruptionUpper: "11–12 yrs",
            eruptionLower: "9–10 yrs",
            rootsUpper: 1,
            rootsLower: 1,
            cuspsUpper: 1,
            cuspsLower: 1,
            worldUpper: "world_2",
            worldLower: "world_2",
            anatomyUpper: "One sharp point and the longest root of any tooth. It holds the corner of your smile and guides your jaw side to side.",
            anatomyLower: "A sharp point with a long, strong root. It works with the upper canine to protect the back teeth.",
            careTip: "Canines sit at the corner of your smile. Slow down here as your brush turns from the front teeth to the back."
        ),
        PositionAnatomyTemplate(
            pos: 4,
            category: .premolar,
            shortRole: "1st Premolar",
            nicknameUpper: "First Bicuspid",
            nicknameLower: "First Bicuspid",
            eruptionUpper: "10–11 yrs",
            eruptionLower: "10–12 yrs",
            rootsUpper: 2,
            rootsLower: 1,
            cuspsUpper: 2,
            cuspsLower: 2,
            worldUpper: "world_1",
            worldLower: "world_2",
            anatomyUpper: "Has 2 sharp points and often 2 roots. It sits between the tearing canines and the grinding molars.",
            anatomyLower: "A small tooth with a big outer point, a small inner point and 1 root.",
            careTip: "Tilt your brush toward the gumline and brush the groove between the two points."
        ),
        PositionAnatomyTemplate(
            pos: 5,
            category: .premolar,
            shortRole: "2nd Premolar",
            nicknameUpper: "Second Bicuspid",
            nicknameLower: "Second Bicuspid",
            eruptionUpper: "10–12 yrs",
            eruptionLower: "11–12 yrs",
            rootsUpper: 1,
            rootsLower: 1,
            cuspsUpper: 2,
            cuspsLower: 3,
            worldUpper: "world_1",
            worldLower: "world_2",
            anatomyUpper: "Two nearly equal-height cusps and usually 1 root; shares heavy chewing forces right in front of the 1st molar.",
            anatomyLower: "A rounded tooth with 1 root. It often has 3 points and is great at crushing tough food.",
            careTip: "The tight gap between this tooth and the first molar is a common hiding spot for cavities. Always floss here!"
        ),
        PositionAnatomyTemplate(
            pos: 6,
            category: .molar,
            shortRole: "1st Molar",
            nicknameUpper: "Six-Year Molar",
            nicknameLower: "Six-Year Molar",
            eruptionUpper: "6–7 yrs",
            eruptionLower: "6–7 yrs",
            rootsUpper: 3,
            rootsLower: 2,
            cuspsUpper: 5,
            cuspsLower: 5,
            worldUpper: "world_3",
            worldLower: "world_3",
            anatomyUpper: "A wide grinding tooth with 4 points (sometimes a tiny 5th one!) and 3 roots.",
            anatomyLower: "Largest lower grinder with 5 cusps (3 outer, 2 inner) and 2 strong roots; erupts around age 6 without replacing any baby tooth.",
            careTip: "First molars do a lot of chewing and have deep grooves. Brush the grooves with short, gentle strokes."
        ),
        PositionAnatomyTemplate(
            pos: 7,
            category: .molar,
            shortRole: "2nd Molar",
            nicknameUpper: "Twelve-Year Molar",
            nicknameLower: "Twelve-Year Molar",
            eruptionUpper: "12–13 yrs",
            eruptionLower: "11–13 yrs",
            rootsUpper: 3,
            rootsLower: 2,
            cuspsUpper: 4,
            cuspsLower: 4,
            worldUpper: "world_3",
            worldLower: "world_3",
            anatomyUpper: "4-cusp maxillary grinder with 3 roots nestled high near the cheek bone; erupts around age 12 behind the 1st molar.",
            anatomyLower: "Has 4 points, 2 roots and a cross-shaped groove on top. It helps the first molar with heavy chewing.",
            careTip: "Close your mouth halfway when you brush the upper back molars. Opening too wide pulls your cheek tight against the brush!"
        ),
        PositionAnatomyTemplate(
            pos: 8,
            category: .molar,
            shortRole: "3rd Molar",
            nicknameUpper: "Upper Wisdom Tooth",
            nicknameLower: "Lower Wisdom Tooth",
            eruptionUpper: "17–25 yrs",
            eruptionLower: "17–25 yrs",
            rootsUpper: 3,
            rootsLower: 2,
            cuspsUpper: 4,
            cuspsLower: 4,
            worldUpper: "world_5",
            worldLower: "world_5",
            anatomyUpper: "Variable 3–4 cusp crown with fused or multi-curved roots; erupts around ages 17–25 (or stays congenitally absent / impacted).",
            anatomyLower: "Farthest back mandibular tooth at the curve of the jawbone; often partially covered by a gum flap (operculum) if space is tight.",
            careTip: "Reach the tip of your brush behind your very last tooth so plaque can’t hide there."
        )
    ]

    private static func buildToothRecord(quadrant: Int, pos: Int) -> AdultToothEntry {
        let tmpl = positionTemplates[pos - 1]
        let arch: ToothArch = quadrant <= 2 ? .upper : .lower
        let side: PatientSide = (quadrant == 1 || quadrant == 4) ? .right : .left

        let universal: Int
        let palmer: String
        switch quadrant {
        case 1:
            universal = 9 - pos
            palmer = "\(pos)┘"
        case 2:
            universal = 8 + pos
            palmer = "└\(pos)"
        case 3:
            universal = 25 - pos
            palmer = "┌\(pos)"
        default:
            universal = 24 + pos
            palmer = "\(pos)┐"
        }

        let fdi = "\(quadrant)\(pos)"
        let qWord = digitWords[quadrant] ?? "\(quadrant)"
        let pWord = digitWords[pos] ?? "\(pos)"
        let fdiSpoken = "\(qWord)-\(pWord)"

        let companionArchIndex: Int?
        if pos <= 7 {
            companionArchIndex = (side == .right) ? (7 - pos) : (6 + pos)
        } else {
            companionArchIndex = nil
        }

        let archWord = (arch == .upper) ? "Upper" : "Lower"
        let sideWord = (side == .right) ? "Right" : "Left"

        return AdultToothEntry(
            universal: universal,
            fdi: fdi,
            fdiSpoken: fdiSpoken,
            palmer: palmer,
            quadrant: quadrant,
            positionFromMidline: pos,
            arch: arch,
            side: side,
            category: tmpl.category,
            isWisdomTooth: pos == 8,
            clinicalName: "\(archWord) \(sideWord) \(tmpl.shortRole)",
            commonNickname: arch == .upper ? tmpl.nicknameUpper : tmpl.nicknameLower,
            eruptionAge: arch == .upper ? tmpl.eruptionUpper : tmpl.eruptionLower,
            roots: arch == .upper ? tmpl.rootsUpper : tmpl.rootsLower,
            cusps: arch == .upper ? tmpl.cuspsUpper : tmpl.cuspsLower,
            anatomyFact: arch == .upper ? tmpl.anatomyUpper : tmpl.anatomyLower,
            careTip: tmpl.careTip,
            worldId: arch == .upper ? tmpl.worldUpper : tmpl.worldLower,
            companionArchIndex: companionArchIndex
        )
    }

    /// All 32 adult permanent teeth ordered by ADA Universal Number (#1 through #32).
    public static let adultTeeth: [AdultToothEntry] = {
        var records: [AdultToothEntry] = []
        records.reserveCapacity(32)
        for q in 1...4 {
            for p in 1...8 {
                records.append(buildToothRecord(quadrant: q, pos: p))
            }
        }
        return records.sorted { $0.universal < $1.universal }
    }()

    public static func tooth(byUniversal universal: Int) -> AdultToothEntry {
        let clamped = max(1, min(32, universal))
        return adultTeeth[clamped - 1]
    }

    public static func tooth(byFdi fdi: String) -> AdultToothEntry? {
        let trimmed = fdi.trimmingCharacters(in: .whitespacesAndNewlines)
        return adultTeeth.first { $0.fdi == trimmed }
    }

    public static func tooth(byPalmer palmer: String) -> AdultToothEntry? {
        let trimmed = palmer.trimmingCharacters(in: .whitespacesAndNewlines)
        return adultTeeth.first { $0.palmer == trimmed }
    }

    public static func formatBadge(for tooth: AdultToothEntry, system: ToothNumberingSystem) -> String {
        switch system {
        case .universal:
            return "#\(tooth.universal)"
        case .fdi:
            return tooth.fdi
        case .palmer:
            return tooth.palmer
        }
    }

    public static func companionCrownSummary(forToothIndex toothIndex: Int) -> CompanionCrownSummary {
        let idx = max(0, min(13, toothIndex))
        let upperTooth = adultTeeth.first { $0.arch == .upper && $0.companionArchIndex == idx } ?? adultTeeth[7]
        let lowerTooth = adultTeeth.first { $0.arch == .lower && $0.companionArchIndex == idx } ?? adultTeeth[24]
        let sideLabel = upperTooth.side == .right ? "Right" : "Left"
        let tmpl = positionTemplates[upperTooth.positionFromMidline - 1]
        return CompanionCrownSummary(
            toothIndex: idx,
            sideLabel: sideLabel,
            toothTypeLabel: "\(sideLabel) \(tmpl.shortRole)",
            upperTooth: upperTooth,
            lowerTooth: lowerTooth
        )
    }

    public static let quadrants: [QuadrantNumberingMeta] = [
        QuadrantNumberingMeta(
            quadrant: 1,
            shortCode: "UR",
            title: "Q1 • Upper Right (Maxillary Right)",
            universalRange: "US #1–#8",
            fdiRange: "FDI 18–11",
            palmerSymbol: "8┘–1┘",
            chartOrderUniversal: [1, 2, 3, 4, 5, 6, 7, 8]
        ),
        QuadrantNumberingMeta(
            quadrant: 2,
            shortCode: "UL",
            title: "Q2 • Upper Left (Maxillary Left)",
            universalRange: "US #9–#16",
            fdiRange: "FDI 21–28",
            palmerSymbol: "└1–└8",
            chartOrderUniversal: [9, 10, 11, 12, 13, 14, 15, 16]
        ),
        QuadrantNumberingMeta(
            quadrant: 3,
            shortCode: "LL",
            title: "Q3 • Lower Left (Mandibular Left)",
            universalRange: "US #17–#24",
            fdiRange: "FDI 38–31",
            palmerSymbol: "┌8–┌1",
            chartOrderUniversal: [24, 23, 22, 21, 20, 19, 18, 17]
        ),
        QuadrantNumberingMeta(
            quadrant: 4,
            shortCode: "LR",
            title: "Q4 • Lower Right (Mandibular Right)",
            universalRange: "US #25–#32",
            fdiRange: "FDI 41–48",
            palmerSymbol: "1┐–8┐",
            chartOrderUniversal: [32, 31, 30, 29, 28, 27, 26, 25]
        )
    ]

    public static let surfaces: [ToothSurfaceInfo] = [
        ToothSurfaceInfo(
            code: "B / F",
            name: "Buccal / Facial",
            whereItFaces: "The outside, facing your cheeks (back teeth) or lips (front teeth).",
            howToClean: "45° Bass sweep along the gumline collar."
        ),
        ToothSurfaceInfo(
            code: "L / P",
            name: "Lingual / Palatal",
            whereItFaces: "The inside, facing your tongue (lower teeth) or the roof of your mouth (upper teeth).",
            howToClean: "Brush the inside of the back teeth. Hold the brush up and down behind the front teeth."
        ),
        ToothSurfaceInfo(
            code: "O / I",
            name: "Occlusal / Incisal",
            whereItFaces: "The chewing tops of back teeth (O) or the biting edges of front teeth (I).",
            howToClean: "Short, quick strokes into the grooves of the back teeth."
        ),
        ToothSurfaceInfo(
            code: "M",
            name: "Mesial",
            whereItFaces: "The tight side that faces the FRONT middle of your mouth.",
            howToClean: "Slide floss gently under the gum and hug the tooth in a C-shape."
        ),
        ToothSurfaceInfo(
            code: "D",
            name: "Distal",
            whereItFaces: "The tight side that faces the BACK of your mouth.",
            howToClean: "Hug with floss in a C-shape, and wrap the brush behind your last molar."
        )
    ]

    public static let layers: [ToothLayerInfo] = [
        ToothLayerInfo(
            layerKind: .enamel,
            name: "Enamel",
            emoji: "💎",
            mineralPercent: 96,
            tagline: "The hardest part of your body",
            detail: "Enamel is almost all mineral, packed in tiny rods. It has no living cells, so it can’t grow back. But spit and fluoride can harden early soft spots.",
            careTip: "Fluoride toothpaste and a calm 2-minute brush keep this shield smooth.",
            colorHex: "#e0f2fe"
        ),
        ToothLayerInfo(
            layerKind: .dentin,
            name: "Dentin",
            emoji: "🟡",
            mineralPercent: 70,
            tagline: "Tiny tubes • the bendy core",
            detail: "Dentin has millions of tiny tubes that lead toward the nerve. When enamel wears thin, cold air can reach them. That is the zing you feel.",
            careTip: "Soft bristles and a gentle touch protect dentin near the gumline.",
            colorHex: "#fde68a"
        ),
        ToothLayerInfo(
            layerKind: .pulp,
            name: "Living Pulp",
            emoji: "❤️",
            mineralPercent: nil,
            tagline: "Nerves & blood vessels • the tooth’s heart",
            detail: "A soft space with nerves and blood vessels. It feeds the tooth and feels hot, cold and pressure. Healthy pulp keeps a tooth alive.",
            careTip: "Catching cavities while they are small keeps germs far from the pulp.",
            colorHex: "#fb7185"
        ),
        ToothLayerInfo(
            layerKind: .ligament,
            name: "Root Cover & Tooth Cushion",
            emoji: "🪢",
            mineralPercent: 45,
            tagline: "The cushion around the root",
            detail: "A thin layer covers the root. Thousands of tiny fibers hold the tooth in its socket like a hammock. They cushion every bite.",
            careTip: "Flossing every day keeps the gums around this cushion calm and healthy.",
            colorHex: "#c4b5fd"
        )
    ]

    public static func layer(byId id: String) -> ToothLayerInfo {
        layers.first { $0.id == id } ?? layers[0]
    }

    public static func layer(_ kind: ToothLayerId) -> ToothLayerInfo {
        layers.first { $0.layerKind == kind } ?? layers[0]
    }

    public static let worldLessons: [String: WorldDentalLesson] = [
        "world_1": WorldDentalLesson(
            id: "world_1",
            focusTeethBadge: "Teeth #8–#9, #4–#5 & #3 (FDI 11–21, 15–14 & 16)",
            headline: "Hidden Gaps & Six-Year Molars",
            lesson: "A brush reaches 3 of a tooth’s 5 sides. About a third of each tooth hides in the tight gaps until you floss."
        ),
        "world_2": WorldDentalLesson(
            id: "world_2",
            focusTeethBadge: "Gumline • Teeth #21–#28 (FDI 34–44)",
            headline: "Healthy Gums & the 45° Brush Tilt",
            lesson: "Dentists measure the tiny pocket around each tooth. 1–3 mm is healthy! Tilting the brush toward the gumline cleans it gently."
        ),
        "world_3": WorldDentalLesson(
            id: "world_3",
            focusTeethBadge: "Posterior Molars #2–#3 & #14–#15 (FDI 17–16 & 26–27)",
            headline: "The 20-Minute Acid Clock",
            lesson: "Every sugary sip makes acid for about 20 minutes. Acid pulls minerals out of enamel. Spit washes acid away, and fluoride helps rebuild stronger enamel."
        ),
        "world_4": WorldDentalLesson(
            id: "world_4",
            focusTeethBadge: "Lower Incisors #24–#25 (FDI 31–41) & Upper #3, #14",
            headline: "Why Tartar Has Favorite Teeth",
            lesson: "Spit flows in behind the lower front teeth and beside the upper back teeth. Its minerals fight acid, but they can also turn old plaque into hard tartar!"
        ),
        "world_5": WorldDentalLesson(
            id: "world_5",
            focusTeethBadge: "Full Arch #1–#32 (FDI 11–48) & Wisdom Teeth #1, #16, #17, #32",
            headline: "Germ Slime Domes & Space Dentistry",
            lesson: "In 1–2 days, germs left alone build sticky slime domes that rinses can’t wash off. Brushing and flossing break them. That matters in space, where there is no dentist nearby!"
        ),
        "pulp_rescue": WorldDentalLesson(
            id: "pulp_rescue",
            focusTeethBadge: "Inside a Tooth: Enamel → Dentin → Living Pulp",
            headline: "How Dentists Save a Hurt Tooth",
            lesson: "Hard outer enamel has no nerves. The dentin under it has tiny tubes that lead to the living pulp. A gentle dental liner calms the pulp and helps it heal."
        )
    ]

    public static func worldLesson(forWorldId worldId: String, mode: ActivePlayMode = .arcade) -> WorldDentalLesson {
        if mode == .pulpRescue {
            return worldLessons["pulp_rescue"]!
        }
        return worldLessons[worldId] ?? worldLessons["world_1"]!
    }

    private static func makePrompt(for tooth: AdultToothEntry, styleIndex: Int) -> DentalSpotQuestion {
        switch styleIndex {
        case 0:
            return DentalSpotQuestion(
                targetUniversal: tooth.universal,
                prompt: "Can you tap the \(tooth.clinicalName) (\(tooth.commonNickname)) — #\(tooth.universal) / FDI \(tooth.fdi)?",
                difficulty: .full
            )
        case 1:
            return DentalSpotQuestion(
                targetUniversal: tooth.universal,
                prompt: "Find the \(tooth.clinicalName)!",
                difficulty: .name
            )
        case 2:
            return DentalSpotQuestion(
                targetUniversal: tooth.universal,
                prompt: "Find FDI \(tooth.fdi) (“\(tooth.fdiSpoken)”)!",
                difficulty: .code
            )
        default:
            return DentalSpotQuestion(
                targetUniversal: tooth.universal,
                prompt: "Tap US tooth #\(tooth.universal)!",
                difficulty: .code
            )
        }
    }

    public static func buildSpotQuizQuestion(
        avoidUniversal: Int? = nil,
        rand: () -> Double = { Double.random(in: 0..<1) }
    ) -> DentalSpotQuestion {
        var n = 1 + Int(floor(max(0.0, min(0.999999, rand())) * 32.0))
        if n > 32 { n = 32 }
        if let avoidUniversal, n == avoidUniversal {
            n = (n % 32) + 1
        }
        let target = tooth(byUniversal: n)
        let style = max(0, min(3, Int(floor(max(0.0, min(0.999999, rand())) * 4.0))))
        return makePrompt(for: target, styleIndex: style)
    }

    public static func generateSpotQuizQuestion(
        excludingUniversalNumbers excluded: Set<Int> = [],
        seed: UInt64? = nil
    ) -> DentalSpotQuestion {
        let filtered = (1...32).filter { !excluded.contains($0) }
        let candidates = filtered.isEmpty ? Array(1...32) : filtered

        var state = (seed ?? UInt64.random(in: 1...UInt64.max)) &+ 0x9E3779B97F4A7C15
        func nextUnit() -> Double {
            state &+= 0x6D2B79F5
            var z = state
            z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
            z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
            z = z ^ (z >> 31)
            return Double(z >> 11) / Double(1 << 53)
        }

        let pickIdx = min(candidates.count - 1, Int(floor(nextUnit() * Double(candidates.count))))
        let target = tooth(byUniversal: candidates[pickIdx])
        let style = min(3, Int(floor(nextUnit() * 4.0)))
        return makePrompt(for: target, styleIndex: style)
    }

    public static func gradeSpotAnswer(
        targetUniversal: Int,
        tappedUniversal: Int,
        currentStreak: Int = 0,
        bestStreak: Int = 0
    ) -> DentalSpotAnswerGrade {
        let target = tooth(byUniversal: targetUniversal)
        let tapped = tooth(byUniversal: tappedUniversal)
        if target.universal == tapped.universal {
            let nextStreak = max(0, currentStreak) + 1
            return DentalSpotAnswerGrade(
                targetUniversal: target.universal,
                tappedUniversal: tapped.universal,
                correct: true,
                nextStreak: nextStreak,
                bestStreak: max(bestStreak, nextStreak),
                message: "Yes! \(target.clinicalName) = #\(target.universal) • FDI \(target.fdi) • Palmer \(target.palmer)"
            )
        }
        return DentalSpotAnswerGrade(
            targetUniversal: target.universal,
            tappedUniversal: tapped.universal,
            correct: false,
            nextStreak: 0,
            bestStreak: bestStreak,
            message: "Close! That one is \(tapped.clinicalName) (#\(tapped.universal)). Try again — you’ve got this!"
        )
    }

    public static func gradeSpotAnswer(
        question: DentalSpotQuestion,
        tappedUniversal: Int,
        currentStreak: Int = 0,
        bestStreak: Int = 0
    ) -> DentalSpotAnswerGrade {
        gradeSpotAnswer(
            targetUniversal: question.targetUniversal,
            tappedUniversal: tappedUniversal,
            currentStreak: currentStreak,
            bestStreak: bestStreak
        )
    }
}
