import Foundation

public enum VoiceName: String, Codable, CaseIterable, Sendable {
    case rhodes
    case marimba
    case kalimba
    case celesta
    case bass
    case pad
    case reed
    case pluck
    case bell
}

public enum DrumKind: String, Codable, CaseIterable, Sendable {
    case shaker
    case rim
    case kick
    case hat
}

public struct NoteEvent: Equatable, Sendable {
    public var voice: VoiceName
    public var midi: Int
    public var vel: Double
    public var durSteps: Int
    public var pan: Double
    public var send: Double

    public init(
        voice: VoiceName,
        midi: Int,
        vel: Double,
        durSteps: Int,
        pan: Double,
        send: Double
    ) {
        self.voice = voice
        self.midi = midi
        self.vel = vel
        self.durSteps = durSteps
        self.pan = pan
        self.send = send
    }
}

public struct DrumEvent: Equatable, Sendable {
    public var kind: DrumKind
    public var vel: Double

    public init(kind: DrumKind, vel: Double) {
        self.kind = kind
        self.vel = vel
    }
}

public struct ChordDef: Equatable, Sendable {
    public var root: Int
    public var tones: [Int]

    public init(root: Int, tones: [Int]) {
        self.root = root
        self.tones = tones
    }
}

public enum ThemeId: String, Codable, CaseIterable, Sendable {
    case hub = "hub"
    case hubGlobe = "hub_globe"
    case hubReady = "hub_ready"
    case cosmic = "cosmic"
    case brushAlong = "brush_along"
    case report = "report"
    case world1 = "world_1"
    case world2 = "world_2"
    case world3 = "world_3"
    case world4 = "world_4"
    case world5 = "world_5"
    case pulp = "pulp"
}

public struct ThemeDef: Equatable, Sendable {
    public var id: ThemeId
    public var bpm: Double
    public var swing: Double
    public var keyRoot: Int
    public var scale: [Int]
    public var progressionA: [ChordDef]
    public var progressionB: [ChordDef]
    public var lead: VoiceName?
    public var leadRhythm: [Int]
    public var comp: VoiceName?
    public var compSteps: [Int]
    public var arp: VoiceName?
    public var arpEvery: Int
    public var bass: String
    public var bassVoice: VoiceName
    public var shaker: String
    public var rim: String
    public var kick: String
    public var hat: String
    public var pad: Bool
    public var seed: Int
    public var mixGain: Double?

    public init(
        id: ThemeId,
        bpm: Double,
        swing: Double,
        keyRoot: Int,
        scale: [Int],
        progressionA: [ChordDef],
        progressionB: [ChordDef],
        lead: VoiceName?,
        leadRhythm: [Int],
        comp: VoiceName?,
        compSteps: [Int],
        arp: VoiceName?,
        arpEvery: Int,
        bass: String,
        bassVoice: VoiceName,
        shaker: String,
        rim: String,
        kick: String,
        hat: String,
        pad: Bool,
        seed: Int,
        mixGain: Double? = nil
    ) {
        self.id = id
        self.bpm = bpm
        self.swing = swing
        self.keyRoot = keyRoot
        self.scale = scale
        self.progressionA = progressionA
        self.progressionB = progressionB
        self.lead = lead
        self.leadRhythm = leadRhythm
        self.comp = comp
        self.compSteps = compSteps
        self.arp = arp
        self.arpEvery = arpEvery
        self.bass = bass
        self.bassVoice = bassVoice
        self.shaker = shaker
        self.rim = rim
        self.kick = kick
        self.hat = hat
        self.pad = pad
        self.seed = seed
        self.mixGain = mixGain
    }
}

public enum Scales {
    public static let majorPentatonic: [Int] = [0, 2, 4, 7, 9]
    public static let major: [Int] = [0, 2, 4, 5, 7, 9, 11]
    public static let lydian: [Int] = [0, 2, 4, 6, 7, 9, 11]
    public static let minorPentatonic: [Int] = [0, 3, 5, 7, 10]
    public static let dorian: [Int] = [0, 2, 3, 5, 7, 9, 10]
    public static let majorBlues: [Int] = [0, 2, 3, 4, 7, 9]
}

public enum ChordVoicings {
    public static let maj9: [Int] = [0, 4, 7, 11, 14]
    public static let min9: [Int] = [0, 3, 7, 10, 14]
    public static let min7: [Int] = [0, 3, 7, 10]
    public static let maj7: [Int] = [0, 4, 7, 11]
    public static let dom7: [Int] = [0, 4, 7, 10]
    public static let maj6: [Int] = [0, 4, 7, 9, 14]
    public static let sus: [Int] = [0, 5, 7, 10]
    public static let triad: [Int] = [0, 4, 7, 12]
    public static let minTriad: [Int] = [0, 3, 7, 12]
}

private func chord(_ root: Int, _ tones: [Int]) -> ChordDef {
    ChordDef(root: root, tones: tones)
}

private func repeatChords(_ a: [ChordDef], _ n: Int) -> [ChordDef] {
    guard !a.isEmpty else { return [] }
    return (0..<n).map { a[$0 % a.count] }
}

public let musicThemes: [ThemeId: ThemeDef] = [
    .hub: ThemeDef(
        id: .hub,
        bpm: 84,
        swing: 0.12,
        keyRoot: 53, // F Smooth Bask
        scale: Scales.majorPentatonic,
        progressionA: repeatChords([
            chord(0, ChordVoicings.maj9),
            chord(-1, ChordVoicings.min7),
            chord(-3, ChordVoicings.min9),
            chord(-5, ChordVoicings.maj9),
        ], 8),
        progressionB: repeatChords([
            chord(5, ChordVoicings.maj7),
            chord(-1, ChordVoicings.min7),
            chord(-3, ChordVoicings.min9),
            chord(-5, ChordVoicings.dom7),
        ], 8),
        lead: .kalimba,
        leadRhythm: [0, 3, 6, 8, 11, 14],
        comp: .rhodes,
        compSteps: [0, 3, 6, 10, 13],
        arp: nil,
        arpEvery: 0,
        bass: "r..5..r..3..5.a.",
        bassVoice: .bass,
        shaker: "x.x.x.x.x.x.x.x.",
        rim: "....x.......x...",
        kick: "x.......x.......",
        hat: "................",
        pad: false,
        seed: 11
    ),
    .hubGlobe: ThemeDef(
        id: .hubGlobe,
        bpm: 80,
        swing: 0.1,
        keyRoot: 53,
        scale: Scales.majorPentatonic,
        progressionA: repeatChords([
            chord(0, ChordVoicings.maj9),
            chord(-1, ChordVoicings.min7),
            chord(-3, ChordVoicings.min9),
            chord(-5, ChordVoicings.maj9),
        ], 8),
        progressionB: repeatChords([
            chord(5, ChordVoicings.maj7),
            chord(-1, ChordVoicings.min7),
            chord(-3, ChordVoicings.min9),
            chord(-5, ChordVoicings.dom7),
        ], 8),
        lead: .celesta,
        leadRhythm: [0, 4, 8, 12],
        comp: .rhodes,
        compSteps: [0, 8],
        arp: .celesta,
        arpEvery: 2,
        bass: "r.......5.......",
        bassVoice: .bass,
        shaker: "....x.......x...",
        rim: "................",
        kick: "x...............",
        hat: "................",
        pad: true,
        seed: 12,
        mixGain: 1.16
    ),
    .hubReady: ThemeDef(
        id: .hubReady,
        bpm: 76,
        swing: 0,
        keyRoot: 53,
        scale: Scales.majorPentatonic,
        progressionA: repeatChords([
            chord(0, ChordVoicings.maj7),
            chord(-3, ChordVoicings.min7),
            chord(-5, ChordVoicings.maj7),
            chord(-1, ChordVoicings.sus),
        ], 8),
        progressionB: repeatChords([
            chord(0, ChordVoicings.maj7),
            chord(-3, ChordVoicings.min7),
            chord(-5, ChordVoicings.maj7),
            chord(-1, ChordVoicings.sus),
        ], 8),
        lead: .marimba,
        leadRhythm: [0, 8],
        comp: .rhodes,
        compSteps: [0, 6],
        arp: nil,
        arpEvery: 0,
        bass: "r.......r.......",
        bassVoice: .bass,
        shaker: "....x.......x...",
        rim: "................",
        kick: "x.......x.......",
        hat: "................",
        pad: true,
        seed: 13,
        mixGain: 1.16
    ),
    .cosmic: ThemeDef(
        id: .cosmic,
        bpm: 58,
        swing: 0,
        keyRoot: 48, // C
        scale: Scales.majorPentatonic,
        progressionA: [
            chord(0, ChordVoicings.maj9),
            chord(9, ChordVoicings.min9),
            chord(5, ChordVoicings.maj7),
            chord(7, ChordVoicings.sus),
            chord(0, ChordVoicings.maj9),
            chord(9, ChordVoicings.min9),
            chord(5, ChordVoicings.maj7),
            chord(7, ChordVoicings.dom7),
        ],
        progressionB: [
            chord(0, ChordVoicings.maj9),
            chord(4, ChordVoicings.min7),
            chord(5, ChordVoicings.maj9),
            chord(7, ChordVoicings.sus),
            chord(0, ChordVoicings.maj9),
            chord(9, ChordVoicings.min7),
            chord(5, ChordVoicings.maj9),
            chord(0, ChordVoicings.maj9),
        ],
        lead: .bell,
        leadRhythm: [0, 6, 10],
        comp: nil,
        compSteps: [],
        arp: .celesta,
        arpEvery: 2,
        bass: "................",
        bassVoice: .bass,
        shaker: "................",
        rim: "................",
        kick: "................",
        hat: "................",
        pad: true,
        seed: 21,
        mixGain: 1.75
    ),
    .brushAlong: ThemeDef(
        id: .brushAlong,
        bpm: 96,
        swing: 0.08,
        keyRoot: 55, // G
        scale: Scales.major,
        progressionA: repeatChords([
            chord(0, ChordVoicings.maj7),
            chord(4, ChordVoicings.min7),
            chord(5, ChordVoicings.maj7),
            chord(7, ChordVoicings.dom7),
        ], 8),
        progressionB: repeatChords([
            chord(0, ChordVoicings.maj9),
            chord(9, ChordVoicings.min7),
            chord(2, ChordVoicings.min7),
            chord(7, ChordVoicings.sus),
        ], 8),
        lead: .marimba,
        leadRhythm: [0, 2, 3, 6, 8, 10, 11, 14],
        comp: .rhodes,
        compSteps: [0, 3, 6, 8, 11, 14],
        arp: .celesta,
        arpEvery: 4,
        bass: "r..r..5.r..3..a.",
        bassVoice: .bass,
        shaker: "x.xxx.xxx.xxx.xx",
        rim: "....x.......x...",
        kick: "x.....x.x.......",
        hat: "................",
        pad: false,
        seed: 31
    ),
    .report: ThemeDef(
        id: .report,
        bpm: 76,
        swing: 0.14,
        keyRoot: 50, // D
        scale: Scales.majorPentatonic,
        progressionA: repeatChords([
            chord(0, ChordVoicings.maj9),
            chord(-3, ChordVoicings.min7),
            chord(-5, ChordVoicings.maj9),
            chord(2, ChordVoicings.dom7),
        ], 8),
        progressionB: repeatChords([
            chord(5, ChordVoicings.maj9),
            chord(0, ChordVoicings.maj9),
            chord(2, ChordVoicings.min7),
            chord(7, ChordVoicings.dom7),
        ], 8),
        lead: .rhodes,
        leadRhythm: [0, 3, 8, 11],
        comp: .rhodes,
        compSteps: [0, 6, 10],
        arp: .celesta,
        arpEvery: 4,
        bass: "r.....5.r.....a.",
        bassVoice: .bass,
        shaker: "x.x.x.x.x.x.x.x.",
        rim: "....x.......x...",
        kick: "x.......x.......",
        hat: "................",
        pad: true,
        seed: 41
    ),
    .world1: ThemeDef(
        id: .world1,
        bpm: 112,
        swing: 0.06,
        keyRoot: 48, // C Lydian (Toronto / San Francisco Pacific-Civic wood & marimba)
        scale: Scales.lydian,
        progressionA: repeatChords([
            chord(0, ChordVoicings.maj7),
            chord(2, ChordVoicings.triad),
            chord(4, ChordVoicings.min7),
            chord(2, ChordVoicings.triad),
        ], 8),
        progressionB: repeatChords([
            chord(0, ChordVoicings.maj9),
            chord(7, ChordVoicings.triad),
            chord(9, ChordVoicings.min7),
            chord(5, ChordVoicings.maj7),
        ], 8),
        lead: .marimba,
        leadRhythm: [0, 2, 4, 7, 8, 10, 12, 15],
        comp: .rhodes,
        compSteps: [0, 3, 6, 8, 11, 14],
        arp: nil,
        arpEvery: 0,
        bass: "r.r.r.5.r.r.5.a.",
        bassVoice: .bass,
        shaker: "x.xxx.xxx.xxx.xx",
        rim: "....x.......x...",
        kick: "x.......x.x.....",
        hat: "................",
        pad: false,
        seed: 51
    ),
    .world2: ThemeDef(
        id: .world2,
        bpm: 104,
        swing: 0.3,
        keyRoot: 46, // Bb Major Blues (New Orleans warm reed swing)
        scale: Scales.majorBlues,
        progressionA: repeatChords([
            chord(0, ChordVoicings.maj6),
            chord(-3, ChordVoicings.min7),
            chord(2, ChordVoicings.min7),
            chord(7, ChordVoicings.dom7),
        ], 8),
        progressionB: repeatChords([
            chord(5, ChordVoicings.dom7),
            chord(5, ChordVoicings.dom7),
            chord(0, ChordVoicings.maj6),
            chord(-3, ChordVoicings.min7),
            chord(2, ChordVoicings.min7),
            chord(7, ChordVoicings.dom7),
            chord(0, ChordVoicings.maj6),
            chord(7, ChordVoicings.dom7),
        ], 8),
        lead: .reed,
        leadRhythm: [0, 3, 6, 8, 11, 14],
        comp: .rhodes,
        compSteps: [3, 7, 11, 15],
        arp: nil,
        arpEvery: 0,
        bass: "r...3...5...a...",
        bassVoice: .bass,
        shaker: "x.x.x.x.x.x.x.x.",
        rim: "....x.......x...",
        kick: "x.......x.......",
        hat: "..x...x...x...x.",
        pad: false,
        seed: 61
    ),
    .world3: ThemeDef(
        id: .world3,
        bpm: 108,
        swing: 0.04,
        keyRoot: 57, // A Dorian (Tokyo / Chicago neon city-pop)
        scale: Scales.dorian,
        progressionA: repeatChords([
            chord(-4, ChordVoicings.maj7),
            chord(-2, ChordVoicings.maj6),
            chord(-5, ChordVoicings.min7),
            chord(0, ChordVoicings.min9),
        ], 8),
        progressionB: repeatChords([
            chord(-4, ChordVoicings.maj7),
            chord(-5, ChordVoicings.min7),
            chord(-7, ChordVoicings.maj7),
            chord(-2, ChordVoicings.dom7),
        ], 8),
        lead: .bell,
        leadRhythm: [0, 3, 4, 8, 10, 12, 14],
        comp: .rhodes,
        compSteps: [0, 3, 6, 10, 12],
        arp: .bell,
        arpEvery: 4,
        bass: "r..r.5..r..r.5a.",
        bassVoice: .bass,
        shaker: "x.x.x.x.x.x.x.x.",
        rim: "....x.......x...",
        kick: "x...x...x...x...",
        hat: "..x...x...x...x.",
        pad: true,
        seed: 71
    ),
    .world4: ThemeDef(
        id: .world4,
        bpm: 118,
        swing: 0.1,
        keyRoot: 55, // G Pentatonic Highlife (Accra / Lagos kalimba & pluck)
        scale: Scales.majorPentatonic,
        progressionA: repeatChords([
            chord(0, ChordVoicings.triad),
            chord(5, ChordVoicings.triad),
            chord(0, ChordVoicings.triad),
            chord(7, ChordVoicings.dom7),
        ], 8),
        progressionB: repeatChords([
            chord(0, ChordVoicings.triad),
            chord(9, ChordVoicings.minTriad),
            chord(5, ChordVoicings.triad),
            chord(7, ChordVoicings.dom7),
        ], 8),
        lead: .kalimba,
        leadRhythm: [0, 2, 3, 5, 7, 8, 10, 11, 13, 15],
        comp: .pluck,
        compSteps: [0, 3, 6, 8, 11, 14],
        arp: .marimba,
        arpEvery: 3,
        bass: "r..r..5.r..5..r.",
        bassVoice: .bass,
        shaker: "x.xxx.xxx.xxx.xx",
        rim: "..x...x...x...x.",
        kick: "x.....x.x.......",
        hat: "................",
        pad: false,
        seed: 81
    ),
    .world5: ThemeDef(
        id: .world5,
        bpm: 80,
        swing: 0,
        keyRoot: 52, // E Lydian (Station Aurora / Reykjavik aurora celesta)
        scale: Scales.lydian,
        progressionA: repeatChords([
            chord(0, ChordVoicings.maj9),
            chord(-3, ChordVoicings.min9),
            chord(5, ChordVoicings.maj9),
            chord(7, ChordVoicings.sus),
        ], 8),
        progressionB: repeatChords([
            chord(0, ChordVoicings.maj9),
            chord(4, ChordVoicings.min7),
            chord(-3, ChordVoicings.min9),
            chord(7, ChordVoicings.sus),
        ], 8),
        lead: .celesta,
        leadRhythm: [0, 5, 8, 13],
        comp: nil,
        compSteps: [],
        arp: .celesta,
        arpEvery: 2,
        bass: "r.......r.....5.",
        bassVoice: .bass,
        shaker: "................",
        rim: "................",
        kick: "x.......x.......",
        hat: "................",
        pad: true,
        seed: 91,
        mixGain: 1.22
    ),
    .pulp: ThemeDef(
        id: .pulp,
        bpm: 128,
        swing: 0.03,
        keyRoot: 52, // E Minor Funk (Pulp Rescue tension motif)
        scale: Scales.minorPentatonic,
        progressionA: repeatChords([
            chord(0, ChordVoicings.min7),
            chord(0, ChordVoicings.min7),
            chord(5, ChordVoicings.dom7),
            chord(7, ChordVoicings.min7),
        ], 8),
        progressionB: repeatChords([
            chord(0, ChordVoicings.min7),
            chord(3, ChordVoicings.maj7),
            chord(5, ChordVoicings.dom7),
            chord(7, ChordVoicings.dom7),
        ], 8),
        lead: .reed,
        leadRhythm: [0, 3, 6, 7, 10, 12, 14],
        comp: .rhodes,
        compSteps: [2, 5, 7, 10, 13],
        arp: nil,
        arpEvery: 0,
        bass: "r..r.r..5..r.ra.",
        bassVoice: .bass,
        shaker: "x.xxx.xxx.xxx.xx",
        rim: "....x.......x...",
        kick: "x..x..x.x..x....",
        hat: "..x...x...x...x.",
        pad: false,
        seed: 101
    ),
]

public struct RegionalMotif: Equatable, Sendable {
    public var regionId: String
    public var label: String
    public var themeId: ThemeId
    public var signatureNotesMidi: [Int]

    public init(regionId: String, label: String, themeId: ThemeId, signatureNotesMidi: [Int]) {
        self.regionId = regionId
        self.label = label
        self.themeId = themeId
        self.signatureNotesMidi = signatureNotesMidi
    }
}

/// Regional motif lookup supporting all campaign cities & regional aliases.
public let regionalMotifs: [String: RegionalMotif] = [
    "toronto": RegionalMotif(regionId: "toronto", label: "Toronto Civic Lydian", themeId: .world1, signatureNotesMidi: [60, 64, 66, 67, 71]),
    "san_francisco": RegionalMotif(regionId: "san_francisco", label: "San Francisco Bay Lydian", themeId: .world1, signatureNotesMidi: [60, 62, 66, 67, 72]),
    "new_orleans": RegionalMotif(regionId: "new_orleans", label: "Crescent Sulcus Reed Swing", themeId: .world2, signatureNotesMidi: [58, 61, 62, 65, 67]),
    "tokyo": RegionalMotif(regionId: "tokyo", label: "Tokyo Neon City-Pop", themeId: .world3, signatureNotesMidi: [69, 71, 72, 76, 79]),
    "chicago": RegionalMotif(regionId: "chicago", label: "1940 Stephan Acid Clock", themeId: .world3, signatureNotesMidi: [69, 72, 74, 76, 81]),
    "accra": RegionalMotif(regionId: "accra", label: "Accra Fluorapatite Highlife", themeId: .world4, signatureNotesMidi: [67, 69, 71, 74, 76]),
    "lagos": RegionalMotif(regionId: "lagos", label: "Lagos Coastal Highlife", themeId: .world4, signatureNotesMidi: [67, 71, 74, 76, 79]),
    "reykjavik": RegionalMotif(regionId: "reykjavik", label: "Reykjavik Sub-Arctic Shimmer", themeId: .world5, signatureNotesMidi: [64, 68, 70, 71, 76]),
    "orbit_aurora": RegionalMotif(regionId: "orbit_aurora", label: "Station Aurora Zero-G Celesta", themeId: .world5, signatureNotesMidi: [64, 66, 70, 71, 75]),
    "station_aurora": RegionalMotif(regionId: "station_aurora", label: "Station Aurora Zero-G Celesta", themeId: .world5, signatureNotesMidi: [64, 66, 70, 71, 75]),
]

public func themeForRegionOrWorld(_ id: String) -> ThemeDef {
    let key = id.lowercased()
    if let motif = regionalMotifs[key], let t = musicThemes[motif.themeId] {
        return t
    }
    if let tid = ThemeId(rawValue: key), let t = musicThemes[tid] {
        return t
    }
    return musicThemes[.world1]!
}

public struct ThemeSelectContext: Equatable, Sendable {
    public var mode: AppMode
    public var worldId: String?
    public var hubGlobe: Bool
    public var pulpZero: Bool

    public init(
        mode: AppMode,
        worldId: String? = nil,
        hubGlobe: Bool = false,
        pulpZero: Bool = false
    ) {
        self.mode = mode
        self.worldId = worldId
        self.hubGlobe = hubGlobe
        self.pulpZero = pulpZero
    }
}

public func selectTheme(_ ctx: ThemeSelectContext) -> ThemeId {
    switch ctx.mode {
    case .cosmicIntro:
        return .cosmic
    case .brushAlong:
        return .brushAlong
    case .report:
        return .report
    case .pulpRescue:
        return .pulp
    case .arcade:
        let w = ctx.worldId ?? "world_1"
        switch w {
        case "world_2": return .world2
        case "world_3": return .world3
        case "world_4": return .world4
        case "world_5": return .world5
        default:
            if let motif = regionalMotifs[w.lowercased()] {
                return motif.themeId
            }
            return .world1
        }
    case .hub:
        if ctx.pulpZero { return .hubReady }
        return ctx.hubGlobe ? .hubGlobe : .hub
    }
}

public func midiToFreq(_ midi: Int) -> Double {
    440.0 * pow(2.0, Double(midi - 69) / 12.0)
}

public func midiToFreq(_ midi: Double) -> Double {
    440.0 * pow(2.0, (midi - 69.0) / 12.0)
}

/// MIDI note of scale degree `degree` (may be negative) counted from `base`.
public func scaleMidi(_ scale: [Int], base: Int, degree: Int) -> Int {
    guard !scale.isEmpty else { return base }
    let n = scale.count
    let oct = Int(floor(Double(degree) / Double(n)))
    let idx = ((degree % n) + n) % n
    return base + oct * 12 + scale[idx]
}

public func chordMidis(
    _ theme: ThemeDef,
    chord: ChordDef,
    transpose: Int = 0,
    baseOct: Int = 12
) -> [Int] {
    chord.tones.map { t in
        theme.keyRoot + transpose + chord.root + t + baseOct
    }
}

public func chordPitchClasses(
    _ theme: ThemeDef,
    chord: ChordDef,
    transpose: Int = 0
) -> Set<Int> {
    var s = Set<Int>()
    for t in chord.tones {
        let pc = (((theme.keyRoot + transpose + chord.root + t) % 12) + 12) % 12
        s.insert(pc)
    }
    return s
}

public func snapToChord(_ midi: Int, pcs: Set<Int>) -> Int {
    for off in [0, -1, 1, -2, 2] {
        let pc = (((midi + off) % 12) + 12) % 12
        if pcs.contains(pc) {
            return midi + off
        }
    }
    return midi
}

/// Deterministic PRNG (Mulberry32) matching TypeScript `rng(seed)` bit-for-bit.
public struct Mulberry32Rng: Sendable {
    private var a: UInt32

    public init(seed: Int) {
        self.a = UInt32(truncatingIfNeeded: seed)
    }

    public mutating func next() -> Double {
        a = a &+ 0x6D2B79F5
        var t = a
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        return Double(t ^ (t >> 14)) / 4294967296.0
    }
}

public func rng(_ seed: Int) -> () -> Double {
    var gen = Mulberry32Rng(seed: seed)
    return {
        gen.next()
    }
}

public func chordAtBar(_ theme: ThemeDef, bar: Int) -> ChordDef {
    let b = ((bar % 16) + 16) % 16
    if b < 8 {
        return theme.progressionA[b % max(1, theme.progressionA.count)]
    } else {
        let idx = (b - 8) % max(1, theme.progressionB.count)
        return theme.progressionB[idx]
    }
}

public struct LayerMask: Equatable, Sendable {
    public var lead: Bool
    public var comp: Bool
    public var arp: Bool
    public var bass: Bool
    public var drums: Bool
    public var pad: Bool

    public init(
        lead: Bool = true,
        comp: Bool = true,
        arp: Bool = true,
        bass: Bool = true,
        drums: Bool = true,
        pad: Bool = true
    ) {
        self.lead = lead
        self.comp = comp
        self.arp = arp
        self.bass = bass
        self.drums = drums
        self.pad = pad
    }
}

public struct GenerateOptions: Equatable, Sendable {
    public var transpose: Int
    public var intensity: Double
    public var urgency: Bool
    public var coda: Bool
    public var layers: LayerMask
    public var chordOverride: ChordDef?

    public init(
        transpose: Int = 0,
        intensity: Double = 1.0,
        urgency: Bool = false,
        coda: Bool = false,
        layers: LayerMask = LayerMask(),
        chordOverride: ChordDef? = nil
    ) {
        self.transpose = transpose
        self.intensity = intensity
        self.urgency = urgency
        self.coda = coda
        self.layers = layers
        self.chordOverride = chordOverride
    }
}

public struct StepResult: Equatable, Sendable {
    public var notes: [NoteEvent]
    public var drums: [DrumEvent]
    public var chord: ChordDef
    public var bar: Int
    public var step: Int

    public init(
        notes: [NoteEvent],
        drums: [DrumEvent],
        chord: ChordDef,
        bar: Int,
        step: Int
    ) {
        self.notes = notes
        self.drums = drums
        self.chord = chord
        self.bar = bar
        self.step = step
    }
}

private func charAt(_ str: String, index: Int) -> Character? {
    let utf8 = Array(str.utf8)
    guard index >= 0 && index < utf8.count else { return nil }
    return Character(UnicodeScalar(utf8[index]))
}

/// Generates everything that should sound on global sixteenth `gs`.
public func generateStep(
    _ theme: ThemeDef,
    gs: Int,
    opts: GenerateOptions = GenerateOptions()
) -> StepResult {
    let step = ((gs % 16) + 16) % 16
    let bar = Int(floor(Double(gs) / 16.0))
    let barInLoop = ((bar % 16) + 16) % 16
    let currentChord = opts.chordOverride ?? chordAtBar(theme, bar: bar)
    let nextChord = opts.chordOverride ?? chordAtBar(theme, bar: bar + 1)
    let tr = opts.transpose
    let k = opts.intensity
    let L = opts.layers

    var notes: [NoteEvent] = []
    var drums: [DrumEvent] = []
    let pcs = chordPitchClasses(theme, chord: currentChord, transpose: tr)
    let section = barInLoop < 8 ? 0 : 1
    let phraseBar = barInLoop % 4

    // Pad swell on the downbeat of each bar
    if L.pad && theme.pad && step == 0 {
        let tones = Array(chordMidis(theme, chord: currentChord, transpose: tr, baseOct: 12).prefix(4))
        for (i, m) in tones.enumerated() {
            notes.append(
                NoteEvent(
                    voice: .pad,
                    midi: m,
                    vel: 0.35 * k,
                    durSteps: 16,
                    pan: (Double(i) - 1.5) * 0.35,
                    send: 0.6
                )
            )
        }
    }

    // Chord comp stabs
    if L.comp, let compVoice = theme.comp, theme.compSteps.contains(step) {
        let tones = Array(chordMidis(theme, chord: currentChord, transpose: tr, baseOct: 12).prefix(4))
        let strong = step == 0 || step == 8
        for (i, m) in tones.enumerated() {
            notes.append(
                NoteEvent(
                    voice: compVoice,
                    midi: m,
                    vel: (strong ? 0.5 : 0.36) * k * (0.9 + 0.1 * Double((i + step) % 3)),
                    durSteps: strong ? 4 : 2,
                    pan: -0.25 + Double(i) * 0.15,
                    send: 0.35
                )
            )
        }
    }

    // Arpeggio
    if L.arp, let arpVoice = theme.arp, theme.arpEvery > 0, step % theme.arpEvery == 0 {
        let tones = chordMidis(theme, chord: currentChord, transpose: tr, baseOct: 24)
        if !tones.isEmpty {
            let rawIdx = (step / theme.arpEvery) + bar
            let idx = ((rawIdx % tones.count) + tones.count) % tones.count
            let pan = sin(Double(gs + theme.seed) * 0.7) * 0.6
            notes.append(
                NoteEvent(
                    voice: arpVoice,
                    midi: tones[idx],
                    vel: 0.3 * k,
                    durSteps: 3,
                    pan: pan,
                    send: 0.7
                )
            )
        }
    }

    // Lead melody (A/B sections, 4-bar phrases with repeat & resolve)
    if L.lead, let leadVoice = theme.lead, let rhythmIdx = theme.leadRhythm.firstIndex(of: step) {
        let motifBar = phraseBar == 2 ? 0 : (phraseBar == 3 ? 1 : phraseBar)
        var rand = Mulberry32Rng(seed: theme.seed * 977 + section * 131 + motifBar * 17 + step * 3)
        let gate = rand.next()
        let density = opts.coda ? 1.0 : 0.78
        if gate < density {
            var walkRand = Mulberry32Rng(seed: theme.seed * 31 + section * 7 + motifBar * 101)
            var deg = section == 0 ? 2 : 4
            for _ in 0...rhythmIdx {
                let stepDeg = Int(floor(walkRand.next() * 5.0)) - 2 // -2..2
                deg += stepDeg
                deg = max(-2, min(theme.scale.count + 3, deg))
            }
            let base = theme.keyRoot + tr + 24
            var midi = scaleMidi(theme.scale, base: base, degree: deg)
            let strong = step % 4 == 0
            if strong {
                midi = snapToChord(midi, pcs: pcs)
            }
            if phraseBar == 3 && rhythmIdx == theme.leadRhythm.count - 1 {
                midi = theme.keyRoot + tr + currentChord.root + 24
            }
            while midi > theme.keyRoot + tr + 40 {
                midi -= 12
            }
            let velRand = rand.next()
            let panRand = rand.next()
            notes.append(
                NoteEvent(
                    voice: leadVoice,
                    midi: midi,
                    vel: (strong ? 0.62 : 0.5) * k * (0.92 + velRand * 0.16),
                    durSteps: strong ? 3 : 2,
                    pan: 0.25 + (panRand - 0.5) * 0.3,
                    send: 0.4
                )
            )
        }
    }

    // Bass
    if L.bass, let ch = charAt(theme.bass, index: step), ch != "." {
        let rootMidi = theme.keyRoot + tr + currentChord.root
        var low = rootMidi
        while low > theme.keyRoot + tr + 7 { low -= 12 }
        while low < theme.keyRoot + tr - 8 { low += 12 }
        var m = low
        if ch == "5" {
            m = low + 7
        } else if ch == "3" {
            let third = currentChord.tones.count > 1 ? currentChord.tones[1] : 4
            m = low + third
        } else if ch == "o" {
            m = low + 12
        } else if ch == "a" {
            let nextRoot = theme.keyRoot + tr + nextChord.root
            var n = nextRoot
            while n > low + 7 { n -= 12 }
            while n < low - 5 { n += 12 }
            m = n + (n >= low ? -1 : 1)
        }
        notes.append(
            NoteEvent(
                voice: theme.bassVoice,
                midi: m,
                vel: (step == 0 ? 0.7 : 0.55) * k,
                durSteps: 2,
                pan: 0,
                send: 0.05
            )
        )
    }

    // Soft brushed percussion
    if L.drums {
        if let ch = charAt(theme.shaker, index: step), ch != "." {
            drums.append(DrumEvent(kind: .shaker, vel: (ch == "X" ? 0.8 : 0.5) * k))
        }
        if let ch = charAt(theme.rim, index: step), ch != "." {
            drums.append(DrumEvent(kind: .rim, vel: 0.5 * k))
        }
        if let ch = charAt(theme.kick, index: step), ch != "." {
            drums.append(DrumEvent(kind: .kick, vel: 0.65 * k))
        }
        if let ch = charAt(theme.hat, index: step), ch != "." {
            drums.append(DrumEvent(kind: .hat, vel: 0.35 * k))
        }
        if opts.urgency && step % 2 == 0 && !drums.contains(where: { $0.kind == .hat }) {
            drums.append(DrumEvent(kind: .hat, vel: 0.32 * k))
        }
    }

    return StepResult(notes: notes, drums: drums, chord: currentChord, bar: bar, step: step)
}

/// Quadrant (`0...3`) -> transposition used by the Brush-Along pacer so the groove evolves (`~108` BPM feel in Floss Coda).
public let pacerTranspose: [Int] = [0, 2, 4, 7]

/// Effective Brush-Along tempo in BPM (`96` base groove -> `~109.4` / `108` energetic pacer coda).
public func pacerEffectiveBpm(inFlossCoda: Bool) -> Double {
    let base = musicThemes[.brushAlong]?.bpm ?? 96.0
    return inFlossCoda ? base * 1.125 : base
}

/// Distinct chord bar index per Cosmic Intro prologue beat (`Cmaj9` -> `Fmaj7` -> `Amin9` -> `Gsus`).
public let cosmicBeatBars: [Int] = [0, 2, 1, 3]

/// Intervals for harmonic quantization of gameplay SFX.
public func harmonicSfxMidi(
    _ theme: ThemeDef,
    chord: ChordDef,
    degree: Int,
    octaveShift: Int = 36
) -> Int {
    let base = theme.keyRoot + octaveShift
    let pcs = chordPitchClasses(theme, chord: chord)
    return snapToChord(scaleMidi(theme.scale, base: base, degree: degree), pcs: pcs)
}

// MARK: - Squeaky-Clean Glass-Harp Pentatonic Helpers

public func glassHarpMidi(
    step: Int,
    theme: ThemeDef = musicThemes[.hub]!,
    chord: ChordDef? = nil
) -> Int {
    let deg = max(0, min(11, step))
    let activeChord = chord ?? chordAtBar(theme, bar: 0)
    return harmonicSfxMidi(theme, chord: activeChord, degree: deg, octaveShift: 60)
}

public func glassHarpFrequency(
    step: Int,
    theme: ThemeDef = musicThemes[.hub]!,
    chord: ChordDef? = nil
) -> Double {
    midiToFreq(glassHarpMidi(step: step, theme: theme, chord: chord))
}

public func glassHarpPentatonicFrequencies(
    baseMidi: Int = 72,
    count: Int = 12
) -> [Double] {
    guard count > 0 else { return [] }
    return (0..<count).map { step in
        let m = scaleMidi(Scales.majorPentatonic, base: baseMidi, degree: step)
        return midiToFreq(m)
    }
}

// MARK: - Audio Preferences & Synergy Ranks

public struct AudioPrefs: Codable, Equatable, Sendable {
    public var muted: Bool
    public var musicVolume: Float
    public var sfxVolume: Float

    public init(muted: Bool = false, musicVolume: Float = 0.7, sfxVolume: Float = 0.85) {
        self.muted = muted
        self.musicVolume = musicVolume
        self.sfxVolume = sfxVolume
    }
}

public let audioPrefsKey = "mouthlife.audioPrefs"
public let defaultAudioPrefs = AudioPrefs(muted: false, musicVolume: 0.7, sfxVolume: 0.85)

public func sanitizeAudioPrefs(_ raw: AudioPrefs) -> AudioPrefs {
    let music = raw.musicVolume.isFinite ? min(1.0, max(0.0, raw.musicVolume)) : defaultAudioPrefs.musicVolume
    let sfx = raw.sfxVolume.isFinite ? min(1.0, max(0.0, raw.sfxVolume)) : defaultAudioPrefs.sfxVolume
    return AudioPrefs(muted: raw.muted, musicVolume: music, sfxVolume: sfx)
}

public let synergyRanks: [Double] = [1.5, 2.0, 2.5, 3.0]

public func synergyRankIndex(_ mult: Double) -> Int {
    var r = -1
    for (i, threshold) in synergyRanks.enumerated() where mult >= threshold - 1e-6 {
        r = i
    }
    return r
}

public enum MusicTheory {
    public static let themes = musicThemes
    public static let regionalMotifs = MouthLifeCore.regionalMotifs
    public static let pacerTranspose = MouthLifeCore.pacerTranspose
    public static let cosmicBeatBars = MouthLifeCore.cosmicBeatBars
    public static let synergyRanks = MouthLifeCore.synergyRanks

    public static func midiToFreq(_ midi: Int) -> Double {
        MouthLifeCore.midiToFreq(midi)
    }

    public static func scaleMidi(_ scale: [Int], base: Int, degree: Int) -> Int {
        MouthLifeCore.scaleMidi(scale, base: base, degree: degree)
    }

    public static func selectTheme(_ ctx: ThemeSelectContext) -> ThemeId {
        MouthLifeCore.selectTheme(ctx)
    }

    public static func generateStep(
        _ theme: ThemeDef,
        gs: Int,
        opts: GenerateOptions = GenerateOptions()
    ) -> StepResult {
        MouthLifeCore.generateStep(theme, gs: gs, opts: opts)
    }

    public static func glassHarpPentatonicFrequencies(baseMidi: Int = 72, count: Int = 12) -> [Double] {
        MouthLifeCore.glassHarpPentatonicFrequencies(baseMidi: baseMidi, count: count)
    }
}
