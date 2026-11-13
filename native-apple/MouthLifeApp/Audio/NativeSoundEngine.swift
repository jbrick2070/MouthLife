import AVFoundation
import Foundation
import MouthLifeCore
import os
import simd

// MARK: - Public Audio Types

/// Real-time 3-band spectral envelope + beat onset levels (`0...1`) sampled at 120Hz by Metal shaders
/// and 3D scene controllers. Combines hardware-decoded Suno songs and procedural synth / live SFX.
public struct AudioReactiveBands: Equatable, Sendable {
    public var bass: Float
    public var mid: Float
    public var high: Float
    public var beatPulse: Float

    public static let zero = AudioReactiveBands(bass: 0, mid: 0, high: 0, beatPulse: 0)

    @inline(__always)
    public var simd: SIMD4<Float> {
        SIMD4<Float>(bass, mid, high, beatPulse)
    }

    public init(bass: Float, mid: Float, high: Float, beatPulse: Float) {
        self.bass = bass
        self.mid = mid
        self.high = high
        self.beatPulse = beatPulse
    }
}

public enum PacerAudioCueKind: String, Sendable {
    case surface   // Every 10s surface switch soft wooden tick
    case quadrant  // Every 30s quadrant transition wood + bell chime
    case complete  // 2:00 Brush-Along completion fanfare
}

public enum BrushSonicProfile: Int32, Sendable {
    case standard = 0
    case bass = 1
    case hydroSonic = 2

    public init(upgradeId: String?) {
        guard let id = upgradeId?.lowercased() else {
            self = .standard
            return
        }
        if id.contains("hydro") {
            self = .hydroSonic
        } else if id.contains("bass") {
            self = .bass
        } else {
            self = .standard
        }
    }
}

public struct ScrubAudioState: Equatable, Sendable {
    public var active: Bool
    public var probeSpeed: Double
    public var newlyCleaned: Int
    public var cleanRatio: Double
    public var brushProfile: BrushSonicProfile

    public init(
        active: Bool,
        probeSpeed: Double = 0,
        newlyCleaned: Int = 0,
        cleanRatio: Double = 0,
        brushProfile: BrushSonicProfile = .standard
    ) {
        self.active = active
        self.probeSpeed = probeSpeed
        self.newlyCleaned = newlyCleaned
        self.cleanRatio = cleanRatio
        self.brushProfile = brushProfile
    }
}

// MARK: - Internal Pure Music Theory & Step Generator (Matches musicTheory.ts)

private enum SynthVoiceKind: Int32 {
    case rhodes = 0
    case marimba = 1
    case kalimba = 2
    case celesta = 3
    case bell = 4
    case glassHarp = 5
    case bass = 6
    case pad = 7
    case reed = 8
    case pluck = 9
    case shaker = 10
    case hat = 11
    case rim = 12
    case kick = 13
    case sfxBlip = 14
    case sfxBoing = 15
    case sfxNoiseSweep = 16
}

private struct ChordDef {
    let root: Int
    let tones: [Int]
}

private enum MusicThemeId: String, CaseIterable {
    case hub
    case hubGlobe = "hub_globe"
    case hubReady = "hub_ready"
    case cosmic
    case brushAlong = "brush_along"
    case report
    case world1 = "world_1"
    case world2 = "world_2"
    case world3 = "world_3"
    case world4 = "world_4"
    case world5 = "world_5"
    case pulp
}

private struct MusicThemeDef {
    let id: MusicThemeId
    let bpm: Double
    let swing: Double
    let keyRoot: Int
    let scale: [Int]
    let progressionA: [ChordDef]
    let progressionB: [ChordDef]
    let lead: SynthVoiceKind?
    let leadRhythm: [Int]
    let comp: SynthVoiceKind?
    let compSteps: [Int]
    let arp: SynthVoiceKind?
    let arpEvery: Int
    let bassPattern: [Character]
    let shakerPattern: [Character]
    let rimPattern: [Character]
    let kickPattern: [Character]
    let hatPattern: [Character]
    let pad: Bool
    let seed: UInt32
    let mixGain: Float
}

private enum MusicCatalog {
    static let maj9 = [0, 4, 7, 11, 14]
    static let min9 = [0, 3, 7, 10, 14]
    static let min7 = [0, 3, 7, 10]
    static let maj7 = [0, 4, 7, 11]
    static let dom7 = [0, 4, 7, 10]
    static let maj6 = [0, 4, 7, 9, 14]
    static let sus  = [0, 5, 7, 10]
    static let triad = [0, 4, 7, 12]
    static let minTriad = [0, 3, 7, 12]

    static let majorPent = [0, 2, 4, 7, 9]
    static let major = [0, 2, 4, 5, 7, 9, 11]
    static let lydian = [0, 2, 4, 6, 7, 9, 11]
    static let minorPent = [0, 3, 5, 7, 10]
    static let dorian = [0, 2, 3, 5, 7, 9, 10]
    static let majorBlues = [0, 2, 3, 4, 7, 9]

    static let pacerTranspose = [0, 2, 4, 7]
    static let cosmicBeatBars = [0, 2, 1, 3]

    private static func c(_ r: Int, _ t: [Int]) -> ChordDef { ChordDef(root: r, tones: t) }
    private static func rep(_ arr: [ChordDef], _ n: Int) -> [ChordDef] {
        (0..<n).map { arr[$0 % arr.count] }
    }

    static let themes: [MusicThemeId: MusicThemeDef] = [
        .hub: MusicThemeDef(
            id: .hub, bpm: 84, swing: 0.12, keyRoot: 53, scale: majorPent,
            progressionA: rep([c(0, maj9), c(-1, min7), c(-3, min9), c(-5, maj9)], 8),
            progressionB: rep([c(5, maj7), c(-1, min7), c(-3, min9), c(-5, dom7)], 8),
            lead: .kalimba, leadRhythm: [0, 3, 6, 8, 11, 14],
            comp: .rhodes, compSteps: [0, 3, 6, 10, 13],
            arp: nil, arpEvery: 0,
            bassPattern: Array("r..5..r..3..5.a."),
            shakerPattern: Array("x.x.x.x.x.x.x.x."),
            rimPattern: Array("....x.......x..."),
            kickPattern: Array("x.......x......."),
            hatPattern: Array("................"),
            pad: false, seed: 11, mixGain: 1.0
        ),
        .hubGlobe: MusicThemeDef(
            id: .hubGlobe, bpm: 80, swing: 0.10, keyRoot: 53, scale: majorPent,
            progressionA: rep([c(0, maj9), c(-1, min7), c(-3, min9), c(-5, maj9)], 8),
            progressionB: rep([c(5, maj7), c(-1, min7), c(-3, min9), c(-5, dom7)], 8),
            lead: .celesta, leadRhythm: [0, 4, 8, 12],
            comp: .rhodes, compSteps: [0, 8],
            arp: .celesta, arpEvery: 2,
            bassPattern: Array("r.......5......."),
            shakerPattern: Array("....x.......x..."),
            rimPattern: Array("................"),
            kickPattern: Array("x..............."),
            hatPattern: Array("................"),
            pad: true, seed: 12, mixGain: 1.16
        ),
        .hubReady: MusicThemeDef(
            id: .hubReady, bpm: 76, swing: 0.0, keyRoot: 53, scale: majorPent,
            progressionA: rep([c(0, maj7), c(-3, min7), c(-5, maj7), c(-1, sus)], 8),
            progressionB: rep([c(0, maj7), c(-3, min7), c(-5, maj7), c(-1, sus)], 8),
            lead: .marimba, leadRhythm: [0, 8],
            comp: .rhodes, compSteps: [0, 6],
            arp: nil, arpEvery: 0,
            bassPattern: Array("r.......r......."),
            shakerPattern: Array("....x.......x..."),
            rimPattern: Array("................"),
            kickPattern: Array("x.......x......."),
            hatPattern: Array("................"),
            pad: true, seed: 13, mixGain: 1.16
        ),
        .cosmic: MusicThemeDef(
            id: .cosmic, bpm: 58, swing: 0.0, keyRoot: 48, scale: majorPent,
            progressionA: [c(0, maj9), c(9, min9), c(5, maj7), c(7, sus), c(0, maj9), c(9, min9), c(5, maj7), c(7, dom7)],
            progressionB: [c(0, maj9), c(4, min7), c(5, maj9), c(7, sus), c(0, maj9), c(9, min7), c(5, maj9), c(0, maj9)],
            lead: .bell, leadRhythm: [0, 6, 10],
            comp: nil, compSteps: [],
            arp: .celesta, arpEvery: 2,
            bassPattern: Array("................"),
            shakerPattern: Array("................"),
            rimPattern: Array("................"),
            kickPattern: Array("................"),
            hatPattern: Array("................"),
            pad: true, seed: 21, mixGain: 1.65
        ),
        .brushAlong: MusicThemeDef(
            id: .brushAlong, bpm: 108, swing: 0.08, keyRoot: 55, scale: major,
            progressionA: rep([c(0, maj7), c(4, min7), c(5, maj7), c(7, dom7)], 8),
            progressionB: rep([c(0, maj9), c(9, min7), c(2, min7), c(7, sus)], 8),
            lead: .marimba, leadRhythm: [0, 2, 3, 6, 8, 10, 11, 14],
            comp: .rhodes, compSteps: [0, 3, 6, 8, 11, 14],
            arp: .celesta, arpEvery: 4,
            bassPattern: Array("r..r..5.r..3..a."),
            shakerPattern: Array("x.xxx.xxx.xxx.xx"),
            rimPattern: Array("....x.......x..."),
            kickPattern: Array("x.....x.x......."),
            hatPattern: Array("................"),
            pad: false, seed: 31, mixGain: 1.0
        ),
        .report: MusicThemeDef(
            id: .report, bpm: 76, swing: 0.14, keyRoot: 50, scale: majorPent,
            progressionA: rep([c(0, maj9), c(-3, min7), c(-5, maj9), c(2, dom7)], 8),
            progressionB: rep([c(5, maj9), c(0, maj9), c(2, min7), c(7, dom7)], 8),
            lead: .rhodes, leadRhythm: [0, 3, 8, 11],
            comp: .rhodes, compSteps: [0, 6, 10],
            arp: .celesta, arpEvery: 4,
            bassPattern: Array("r.....5.r.....a."),
            shakerPattern: Array("x.x.x.x.x.x.x.x."),
            rimPattern: Array("....x.......x..."),
            kickPattern: Array("x.......x......."),
            hatPattern: Array("................"),
            pad: true, seed: 41, mixGain: 1.05
        ),
        .world1: MusicThemeDef(
            id: .world1, bpm: 112, swing: 0.06, keyRoot: 48, scale: lydian,
            progressionA: rep([c(0, maj7), c(2, triad), c(4, min7), c(2, triad)], 8),
            progressionB: rep([c(0, maj9), c(7, triad), c(9, min7), c(5, maj7)], 8),
            lead: .marimba, leadRhythm: [0, 2, 4, 7, 8, 10, 12, 15],
            comp: .rhodes, compSteps: [0, 3, 6, 8, 11, 14],
            arp: nil, arpEvery: 0,
            bassPattern: Array("r.r.r.5.r.r.5.a."),
            shakerPattern: Array("x.xxx.xxx.xxx.xx"),
            rimPattern: Array("....x.......x..."),
            kickPattern: Array("x.......x.x....."),
            hatPattern: Array("................"),
            pad: false, seed: 51, mixGain: 1.0
        ),
        .world2: MusicThemeDef(
            id: .world2, bpm: 104, swing: 0.28, keyRoot: 46, scale: majorBlues,
            progressionA: rep([c(0, maj6), c(-3, min7), c(2, min7), c(7, dom7)], 8),
            progressionB: rep([c(5, dom7), c(5, dom7), c(0, maj6), c(-3, min7), c(2, min7), c(7, dom7), c(0, maj6), c(7, dom7)], 8),
            lead: .reed, leadRhythm: [0, 3, 6, 8, 11, 14],
            comp: .rhodes, compSteps: [3, 7, 11, 15],
            arp: nil, arpEvery: 0,
            bassPattern: Array("r...3...5...a..."),
            shakerPattern: Array("x.x.x.x.x.x.x.x."),
            rimPattern: Array("....x.......x..."),
            kickPattern: Array("x.......x......."),
            hatPattern: Array("..x...x...x...x."),
            pad: false, seed: 61, mixGain: 1.0
        ),
        .world3: MusicThemeDef(
            id: .world3, bpm: 108, swing: 0.04, keyRoot: 57, scale: dorian,
            progressionA: rep([c(-4, maj7), c(-2, maj6), c(-5, min7), c(0, min9)], 8),
            progressionB: rep([c(-4, maj7), c(-5, min7), c(-7, maj7), c(-2, dom7)], 8),
            lead: .bell, leadRhythm: [0, 3, 4, 8, 10, 12, 14],
            comp: .rhodes, compSteps: [0, 3, 6, 10, 12],
            arp: .bell, arpEvery: 4,
            bassPattern: Array("r..r.5..r..r.5a."),
            shakerPattern: Array("x.x.x.x.x.x.x.x."),
            rimPattern: Array("....x.......x..."),
            kickPattern: Array("x...x...x...x..."),
            hatPattern: Array("..x...x...x...x."),
            pad: true, seed: 71, mixGain: 1.0
        ),
        .world4: MusicThemeDef(
            id: .world4, bpm: 118, swing: 0.10, keyRoot: 55, scale: majorPent,
            progressionA: rep([c(0, triad), c(5, triad), c(0, triad), c(7, dom7)], 8),
            progressionB: rep([c(0, triad), c(9, minTriad), c(5, triad), c(7, dom7)], 8),
            lead: .kalimba, leadRhythm: [0, 2, 3, 5, 7, 8, 10, 11, 13, 15],
            comp: .pluck, compSteps: [0, 3, 6, 8, 11, 14],
            arp: .marimba, arpEvery: 3,
            bassPattern: Array("r..r..5.r..5..r."),
            shakerPattern: Array("x.xxx.xxx.xxx.xx"),
            rimPattern: Array("..x...x...x...x."),
            kickPattern: Array("x.....x.x......."),
            hatPattern: Array("................"),
            pad: false, seed: 81, mixGain: 1.0
        ),
        .world5: MusicThemeDef(
            id: .world5, bpm: 80, swing: 0.0, keyRoot: 52, scale: lydian,
            progressionA: rep([c(0, maj9), c(-3, min9), c(5, maj9), c(7, sus)], 8),
            progressionB: rep([c(0, maj9), c(4, min7), c(-3, min9), c(7, sus)], 8),
            lead: .celesta, leadRhythm: [0, 5, 8, 13],
            comp: nil, compSteps: [],
            arp: .celesta, arpEvery: 2,
            bassPattern: Array("r.......r.....5."),
            shakerPattern: Array("................"),
            rimPattern: Array("................"),
            kickPattern: Array("x.......x......."),
            hatPattern: Array("................"),
            pad: true, seed: 91, mixGain: 1.22
        ),
        .pulp: MusicThemeDef(
            id: .pulp, bpm: 128, swing: 0.03, keyRoot: 52, scale: minorPent,
            progressionA: rep([c(0, min7), c(0, min7), c(5, dom7), c(7, min7)], 8),
            progressionB: rep([c(0, min7), c(3, maj7), c(5, dom7), c(7, dom7)], 8),
            lead: .reed, leadRhythm: [0, 3, 6, 7, 10, 12, 14],
            comp: .rhodes, compSteps: [2, 5, 7, 10, 13],
            arp: nil, arpEvery: 0,
            bassPattern: Array("r..r.r..5..r.ra."),
            shakerPattern: Array("x.xxx.xxx.xxx.xx"),
            rimPattern: Array("....x.......x..."),
            kickPattern: Array("x..x..x.x..x...."),
            hatPattern: Array("..x...x...x...x."),
            pad: false, seed: 101, mixGain: 1.0
        )
    ]

    static func midiToFreq(_ midi: Int) -> Float {
        440.0 * pow(2.0, Float(midi - 69) / 12.0)
    }

    static func scaleMidi(scale: [Int], base: Int, degree: Int) -> Int {
        let n = max(1, scale.count)
        let oct = Int(floor(Double(degree) / Double(n)))
        let idx = ((degree % n) + n) % n
        return base + oct * 12 + scale[idx]
    }

    static func chordMidis(theme: MusicThemeDef, chord: ChordDef, transpose: Int = 0, baseOct: Int = 12) -> [Int] {
        chord.tones.map { theme.keyRoot + transpose + chord.root + $0 + baseOct }
    }

    static func chordPitchClasses(theme: MusicThemeDef, chord: ChordDef, transpose: Int = 0) -> Set<Int> {
        var s = Set<Int>()
        for t in chord.tones {
            let pc = (((theme.keyRoot + transpose + chord.root + t) % 12) + 12) % 12
            s.insert(pc)
        }
        return s
    }

    static func snapToChord(_ midi: Int, pcs: Set<Int>) -> Int {
        for off in [0, -1, 1, -2, 2] {
            let pc = (((midi + off) % 12) + 12) % 12
            if pcs.contains(pc) { return midi + off }
        }
        return midi
    }

    static func chordAtBar(_ theme: MusicThemeDef, bar: Int) -> ChordDef {
        let b = ((bar % 16) + 16) % 16
        return b < 8 ? theme.progressionA[b] : theme.progressionB[b - 8]
    }

    static func harmonicSfxMidi(theme: MusicThemeDef, chord: ChordDef, degree: Int, octaveShift: Int = 36) -> Int {
        let base = theme.keyRoot + octaveShift
        let pcs = chordPitchClasses(theme: theme, chord: chord)
        return snapToChord(scaleMidi(scale: theme.scale, base: base, degree: degree), pcs: pcs)
    }
}

private struct MulberryRNG {
    private var state: UInt32
    init(seed: UInt32) { self.state = seed }
    mutating func nextFloat() -> Float {
        state = state &+ 0x6D2B79F5
        var t = state
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        return Float((t ^ (t >> 14))) / 4294967296.0
    }
}

// MARK: - Lock-Free Real-Time Polyphonic DSP Kernel

private struct SynthCommand {
    var voice: Int32 = 0
    var freq0: Float = 440
    var freq1: Float = 440
    var durationSec: Float = 0.25
    var velocity: Float = 0.5
    var pan: Float = 0.0
    var reverbSend: Float = 0.25
    var delaySend: Float = 0.05
    var filterQ: Float = 1.0
    var isMusicBus: Int32 = 1
    var delaySamples: Int32 = 0
}

private struct ActiveSynthVoice {
    var active: Bool = false
    var kind: Int32 = 0
    var isMusicBus: Bool = true
    var delaySamples: Int32 = 0
    var ageSec: Float = 0
    var holdDurSec: Float = 0.2
    var totalDurSec: Float = 0.5
    var freq0: Float = 440
    var freq1: Float = 440
    var velocity: Float = 0.5
    var panL: Float = 0.707
    var panR: Float = 0.707
    var reverbSend: Float = 0.2
    var delaySend: Float = 0.05
    var filterQ: Float = 1.0
    var phase1: Float = 0
    var phase2: Float = 0
    var phase3: Float = 0
    var phaseMod: Float = 0
    var svfLow: Float = 0
    var svfBand: Float = 0
}

/// Self-contained C-style scalar DSP engine executed inside `AVAudioSourceNode`'s render callback.
/// Uses zero heap allocations, zero Objective-C messaging, and non-blocking `os_unfair_lock_trylock`
/// so real-time CoreAudio rendering never glitches or blocks.
private final class RealtimeSynthKernel {
    private static let ringCapacity = 512
    private static let ringMask = 511
    private static let maxVoices = 48

    let sampleRate: Float
    private let invSampleRate: Float

    private let lockPtr: UnsafeMutablePointer<os_unfair_lock>
    private let ringBuffer: UnsafeMutableBufferPointer<SynthCommand>
    private var writeIndex: Int = 0
    private var readIndex: Int = 0

    // Shared control parameters (updated from control thread, slewed on audio thread)
    private var targetMuted: Float = 0
    private var targetMusicGain: Float = 0.385
    private var targetSfxGain: Float = 0.8075
    private var targetMusicCutoffHz: Float = 16000
    private var targetDelaySec: Float = 0.32

    private var targetScrubActive: Float = 0
    private var targetScrubSpeed01: Float = 0
    private var targetScrubClean01: Float = 0
    private var targetScrubPlaqueBite01: Float = 0
    private var targetScrubHarmonicHz: Float = 523.25
    private var targetScrubBrushProfile: Int32 = 0

    // Audio-thread exclusive DSP state
    private let voices: UnsafeMutableBufferPointer<ActiveSynthVoice>
    private var voiceCursor: Int = 0
    private var smoothMaster: Float = 0.85
    private var smoothMusicGain: Float = 0.385
    private var smoothSfxGain: Float = 0.8075
    private var smoothMusicLpCoeff: Float = 0.85
    private var musicBusLpL: Float = 0
    private var musicBusLpR: Float = 0

    // Pink noise state (Paul Kellet) + PRNG
    private var rngState: UInt32 = 0x12345678
    private var pk0: Float = 0, pk1: Float = 0, pk2: Float = 0
    private var pk3: Float = 0, pk4: Float = 0, pk5: Float = 0, pk6: Float = 0

    // Continuous Nuanced ASMR Bristle, Warm Foam & Singing-Enamel DSP state
    private var smoothScrubGain: Float = 0
    private var smoothScrubSpeed: Float = 0
    private var smoothPlaqueBite: Float = 0
    private var scrubLfoPhase: Float = 0
    private var scrubBreathPhase: Float = 0
    private var scrubSvfLow: Float = 0, scrubSvfBand: Float = 0
    private var scrubShimLow: Float = 0, scrubShimBand: Float = 0
    private var scrubCrystalLow: Float = 0, scrubCrystalBand: Float = 0

    // Ping-pong stereo tape delay buffers (1.5s max)
    private let delayCapacity: Int
    private let delayBufL: UnsafeMutableBufferPointer<Float>
    private let delayBufR: UnsafeMutableBufferPointer<Float>
    private var delayWritePos: Int = 0
    private var delayFbLp: Float = 0

    // Lush Schroeder/Freeverb-inspired stereo reverb (4 parallel damped combs + 2 series allpasses)
    private let combLensL = [1557, 1617, 1491, 1422]
    private let combLensR = [1580, 1640, 1514, 1445]
    private let apLensL = [225, 556]
    private let apLensR = [248, 579]
    private var combBufsL: [UnsafeMutableBufferPointer<Float>] = []
    private var combBufsR: [UnsafeMutableBufferPointer<Float>] = []
    private var combPosL = [0, 0, 0, 0]
    private var combPosR = [0, 0, 0, 0]
    private var combStoreL: [Float] = [0, 0, 0, 0]
    private var combStoreR: [Float] = [0, 0, 0, 0]
    private var apBufsL: [UnsafeMutableBufferPointer<Float>] = []
    private var apBufsR: [UnsafeMutableBufferPointer<Float>] = []
    private var apPosL = [0, 0]
    private var apPosR = [0, 0]

    // Master DC blocker (30Hz HP), reverb tail activity tracker & 3-band reactive envelope follower
    private var dcPrevInL: Float = 0, dcPrevOutL: Float = 0
    private var dcPrevInR: Float = 0, dcPrevOutR: Float = 0
    private var tailFramesRemaining: Int = 0

    private let meterLockPtr: UnsafeMutablePointer<os_unfair_lock>
    private let lpAlphaLow: Float
    private let lpAlphaMid: Float
    private var meterLpLow: Float = 0
    private var meterLpMid: Float = 0
    private var envBass: Float = 0
    private var envMid: Float = 0
    private var envHigh: Float = 0
    private var envBeat: Float = 0
    private var prevRawBass: Float = 0
    private var pubBass: Float = 0
    private var pubMid: Float = 0
    private var pubHigh: Float = 0
    private var pubBeat: Float = 0

    init(sampleRate: Double) {
        let sr = Float(max(22050.0, min(96000.0, sampleRate)))
        self.sampleRate = sr
        self.invSampleRate = 1.0 / sr
        self.lpAlphaLow = min(0.5, 1.0 - exp(-2.0 * .pi * 140.0 / sr))
        self.lpAlphaMid = min(0.85, 1.0 - exp(-2.0 * .pi * 2100.0 / sr))

        self.lockPtr = UnsafeMutablePointer<os_unfair_lock>.allocate(capacity: 1)
        self.lockPtr.initialize(to: os_unfair_lock())
        self.meterLockPtr = UnsafeMutablePointer<os_unfair_lock>.allocate(capacity: 1)
        self.meterLockPtr.initialize(to: os_unfair_lock())

        let ringPtr = UnsafeMutablePointer<SynthCommand>.allocate(capacity: Self.ringCapacity)
        ringPtr.initialize(repeating: SynthCommand(), count: Self.ringCapacity)
        self.ringBuffer = UnsafeMutableBufferPointer(start: ringPtr, count: Self.ringCapacity)

        let vPtr = UnsafeMutablePointer<ActiveSynthVoice>.allocate(capacity: Self.maxVoices)
        vPtr.initialize(repeating: ActiveSynthVoice(), count: Self.maxVoices)
        self.voices = UnsafeMutableBufferPointer(start: vPtr, count: Self.maxVoices)

        let dCap = max(4096, Int(sr * 1.6))
        self.delayCapacity = dCap
        let dL = UnsafeMutablePointer<Float>.allocate(capacity: dCap)
        dL.initialize(repeating: 0, count: dCap)
        self.delayBufL = UnsafeMutableBufferPointer(start: dL, count: dCap)
        let dR = UnsafeMutablePointer<Float>.allocate(capacity: dCap)
        dR.initialize(repeating: 0, count: dCap)
        self.delayBufR = UnsafeMutableBufferPointer(start: dR, count: dCap)

        let scale = Double(sr) / 44100.0
        for i in 0..<4 {
            let nL = max(64, Int(Double(combLensL[i]) * scale))
            let pL = UnsafeMutablePointer<Float>.allocate(capacity: nL)
            pL.initialize(repeating: 0, count: nL)
            combBufsL.append(UnsafeMutableBufferPointer(start: pL, count: nL))

            let nR = max(64, Int(Double(combLensR[i]) * scale))
            let pR = UnsafeMutablePointer<Float>.allocate(capacity: nR)
            pR.initialize(repeating: 0, count: nR)
            combBufsR.append(UnsafeMutableBufferPointer(start: pR, count: nR))
        }
        for i in 0..<2 {
            let nL = max(32, Int(Double(apLensL[i]) * scale))
            let pL = UnsafeMutablePointer<Float>.allocate(capacity: nL)
            pL.initialize(repeating: 0, count: nL)
            apBufsL.append(UnsafeMutableBufferPointer(start: pL, count: nL))

            let nR = max(32, Int(Double(apLensR[i]) * scale))
            let pR = UnsafeMutablePointer<Float>.allocate(capacity: nR)
            pR.initialize(repeating: 0, count: nR)
            apBufsR.append(UnsafeMutableBufferPointer(start: pR, count: nR))
        }
    }

    deinit {
        for b in combBufsL { b.baseAddress?.deallocate() }
        for b in combBufsR { b.baseAddress?.deallocate() }
        for b in apBufsL { b.baseAddress?.deallocate() }
        for b in apBufsR { b.baseAddress?.deallocate() }
        delayBufL.baseAddress?.deallocate()
        delayBufR.baseAddress?.deallocate()
        voices.baseAddress?.deallocate()
        ringBuffer.baseAddress?.deallocate()
        meterLockPtr.deinitialize(count: 1)
        meterLockPtr.deallocate()
        lockPtr.deinitialize(count: 1)
        lockPtr.deallocate()
    }

    func readReactiveBands() -> AudioReactiveBands {
        os_unfair_lock_lock(meterLockPtr)
        let bands = AudioReactiveBands(bass: pubBass, mid: pubMid, high: pubHigh, beatPulse: pubBeat)
        os_unfair_lock_unlock(meterLockPtr)
        return bands
    }

    // MARK: Producer API (Control / Main Thread)

    func enqueue(_ cmd: SynthCommand) {
        os_unfair_lock_lock(lockPtr)
        if writeIndex - readIndex < Self.ringCapacity {
            ringBuffer[writeIndex & Self.ringMask] = cmd
            writeIndex += 1
        }
        os_unfair_lock_unlock(lockPtr)
    }

    func setMixTargets(muted: Bool, musicGain: Float, sfxGain: Float, musicCutoffHz: Float, delaySec: Float) {
        os_unfair_lock_lock(lockPtr)
        targetMuted = muted ? 1.0 : 0.0
        targetMusicGain = musicGain
        targetSfxGain = sfxGain
        targetMusicCutoffHz = musicCutoffHz
        targetDelaySec = min(1.4, max(0.08, delaySec))
        os_unfair_lock_unlock(lockPtr)
    }

    func setScrubTargets(
        active: Bool,
        speed01: Float,
        clean01: Float,
        plaqueBite01: Float,
        harmonicHz: Float,
        profile: BrushSonicProfile
    ) {
        os_unfair_lock_lock(lockPtr)
        targetScrubActive = active ? 1.0 : 0.0
        targetScrubSpeed01 = speed01
        targetScrubClean01 = clean01
        targetScrubPlaqueBite01 = plaqueBite01
        targetScrubHarmonicHz = min(1760.0, max(260.0, harmonicHz))
        targetScrubBrushProfile = profile.rawValue
        os_unfair_lock_unlock(lockPtr)
    }

    // MARK: Real-Time Audio Render Callback

    @inline(__always)
    private func wrapPhase(_ p: Float) -> Float {
        var x = p
        if x >= 1.0 {
            x -= 1.0
            if x >= 1.0 { x -= floor(x) }
        }
        return x
    }

    @inline(__always)
    private func nextWhiteNoise() -> Float {
        rngState = rngState &* 1664525 &+ 1013904223
        return (Float(rngState >> 8) / 8388608.0) - 1.0
    }

    @inline(__always)
    private func nextPinkNoise() -> Float {
        let w = nextWhiteNoise()
        pk0 = 0.99886 * pk0 + w * 0.0555179
        pk1 = 0.99332 * pk1 + w * 0.0750759
        pk2 = 0.96900 * pk2 + w * 0.1538520
        pk3 = 0.86650 * pk3 + w * 0.3104856
        pk4 = 0.55000 * pk4 + w * 0.5329522
        pk5 = -0.7616 * pk5 - w * 0.0168980
        let out = (pk0 + pk1 + pk2 + pk3 + pk4 + pk5 + pk6 + w * 0.5362) * 0.11
        pk6 = w * 0.115926
        return out
    }

    private func spawnVoice(_ cmd: SynthCommand) {
        // Pick an inactive slot or steal the oldest decayed slot
        var chosen = -1
        var oldestRatio: Float = -1.0
        var oldestIdx = voiceCursor % Self.maxVoices
        for offset in 0..<Self.maxVoices {
            let idx = (voiceCursor + offset) % Self.maxVoices
            if !voices[idx].active {
                chosen = idx
                break
            }
            let ratio = voices[idx].ageSec / max(0.05, voices[idx].totalDurSec)
            if ratio > oldestRatio {
                oldestRatio = ratio
                oldestIdx = idx
            }
        }
        if chosen < 0 { chosen = oldestIdx }
        voiceCursor = (chosen + 1) % Self.maxVoices

        let p = min(1.0, max(-1.0, cmd.pan))
        let angle = (p + 1.0) * (.pi * 0.25)
        let hold = max(0.02, cmd.durationSec)
        let release: Float
        switch SynthVoiceKind(rawValue: cmd.voice) ?? .celesta {
        case .rhodes: release = 0.42
        case .marimba: release = 0.36
        case .kalimba: release = 0.72
        case .celesta: release = 0.68
        case .bell, .glassHarp: release = 1.15
        case .bass: release = 0.18
        case .pad: release = 1.10
        case .reed: release = 0.22
        case .pluck: release = 0.34
        case .shaker, .hat, .rim: release = 0.10
        case .kick: release = 0.18
        case .sfxBlip, .sfxBoing, .sfxNoiseSweep: release = 0.08
        }

        voices[chosen] = ActiveSynthVoice(
            active: true,
            kind: cmd.voice,
            isMusicBus: cmd.isMusicBus != 0,
            delaySamples: max(0, cmd.delaySamples),
            ageSec: 0,
            holdDurSec: hold,
            totalDurSec: hold + release,
            freq0: max(20.0, min(sampleRate * 0.45, cmd.freq0)),
            freq1: max(20.0, min(sampleRate * 0.45, cmd.freq1)),
            velocity: min(1.3, max(0.02, cmd.velocity)),
            panL: cos(angle),
            panR: sin(angle),
            reverbSend: cmd.reverbSend,
            delaySend: cmd.delaySend,
            filterQ: max(0.4, cmd.filterQ),
            phase1: 0,
            phase2: 0,
            phase3: 0,
            phaseMod: 0,
            svfLow: 0,
            svfBand: 0
        )
    }

    func render(frameCount: Int, outL: UnsafeMutablePointer<Float>, outR: UnsafeMutablePointer<Float>?) {
        var locMuted = targetMuted
        var locMusicGain = targetMusicGain
        var locSfxGain = targetSfxGain
        var locCutoff = targetMusicCutoffHz
        var locDelaySec = targetDelaySec
        var locScrubAct = targetScrubActive
        var locScrubSpd = targetScrubSpeed01
        var locScrubCln = targetScrubClean01
        var locPlaqueBite = targetScrubPlaqueBite01
        var locHarmonicHz = targetScrubHarmonicHz
        var locScrubProf = targetScrubBrushProfile

        if os_unfair_lock_trylock(lockPtr) {
            while readIndex < writeIndex {
                let cmd = ringBuffer[readIndex & Self.ringMask]
                readIndex += 1
                spawnVoice(cmd)
            }
            locMuted = targetMuted
            locMusicGain = targetMusicGain
            locSfxGain = targetSfxGain
            locCutoff = targetMusicCutoffHz
            locDelaySec = targetDelaySec
            locScrubAct = targetScrubActive
            locScrubSpd = targetScrubSpeed01
            locScrubCln = targetScrubClean01
            locPlaqueBite = targetScrubPlaqueBite01
            locHarmonicHz = targetScrubHarmonicHz
            locScrubProf = targetScrubBrushProfile
            os_unfair_lock_unlock(lockPtr)
        }

        let desiredMaster: Float = locMuted > 0.5 ? 0.0 : 0.85
        let targetLpCoeff = min(0.98, max(0.04, 1.0 - exp(-2.0 * .pi * locCutoff * invSampleRate)))
        let delaySamples = min(delayCapacity - 4, max(64, Int(locDelaySec * sampleRate)))
        let twoPi = Float.pi * 2.0
        let nyquistSafe = sampleRate * 0.45

        // Whisper-soft movement-gated gain: near-silent when resting, warmer on plaque, delicate silk on clean crystal
        let speedShaped = pow(min(1.0, max(0.0, locScrubSpd)), 0.78)
        let surfaceWeight: Float = 0.024 + 0.048 * locPlaqueBite
        let scrubGoalGain: Float = (locMuted < 0.5 && locScrubAct > 0.5 && locSfxGain > 0.002)
            ? (0.003 + surfaceWeight * speedShaped)
            : 0.0

        // Fast O(1) idle DSP bypass when muted or when Suno hardware AAC is playing with zero active SFX/scrub
        var anyVoiceActive = false
        for vi in 0..<Self.maxVoices where voices[vi].active {
            anyVoiceActive = true
            break
        }
        if anyVoiceActive || scrubGoalGain > 0.0002 || smoothScrubGain > 0.0002 {
            tailFramesRemaining = Int(sampleRate * 2.4)
        }
        if (locMuted > 0.5 && smoothMaster < 0.0001)
            || (!anyVoiceActive && scrubGoalGain <= 0.0002 && smoothScrubGain <= 0.0002 && tailFramesRemaining <= 0)
        {
            envBass = 0; envMid = 0; envHigh = 0; envBeat = 0; prevRawBass = 0
            if os_unfair_lock_trylock(meterLockPtr) {
                pubBass = 0; pubMid = 0; pubHigh = 0; pubBeat = 0
                os_unfair_lock_unlock(meterLockPtr)
            }
            if let outR {
                outL.update(repeating: 0, count: frameCount)
                if outR != outL {
                    outR.update(repeating: 0, count: frameCount)
                }
            } else {
                outL.update(repeating: 0, count: frameCount * 2)
            }
            return
        }
        tailFramesRemaining = max(0, tailFramesRemaining - frameCount)

        let baseScrubTone: Float = (locScrubProf == 1) ? 460.0 : ((locScrubProf == 2) ? 720.0 : 560.0)
        let scrubCenterHz = baseScrubTone + locScrubSpd * 340.0 + locScrubCln * 190.0
        let scrubLfoHz: Float = ((locScrubProf == 2) ? 2.4 : 1.35) + locScrubSpd * 2.8
        let scrubBreathHz: Float = 0.43 + locScrubSpd * 1.15
        let crystalFc = min(0.24, 2.0 * sin(.pi * min(locHarmonicHz, nyquistSafe) * invSampleRate))
        var sumBassSq: Float = 0
        var sumMidSq: Float = 0
        var sumHighSq: Float = 0

        for frame in 0..<frameCount {
            smoothMaster += (desiredMaster - smoothMaster) * 0.0025
            smoothMusicGain += (locMusicGain - smoothMusicGain) * 0.0020
            smoothSfxGain += (locSfxGain - smoothSfxGain) * 0.0025
            smoothMusicLpCoeff += (targetLpCoeff - smoothMusicLpCoeff) * 0.0015
            smoothScrubGain += (scrubGoalGain - smoothScrubGain) * 0.0018

            let pink = nextPinkNoise()
            var musicL: Float = 0, musicR: Float = 0
            var sfxL: Float = 0, sfxR: Float = 0
            var revSendMono: Float = 0
            var delSendMono: Float = 0

            // 1. Synthesize all active polyphonic voices
            for vi in 0..<Self.maxVoices {
                if !voices[vi].active { continue }
                if voices[vi].delaySamples > 0 {
                    voices[vi].delaySamples -= 1
                    continue
                }

                let t = voices[vi].ageSec
                let total = voices[vi].totalDurSec
                if t >= total {
                    voices[vi].active = false
                    continue
                }
                voices[vi].ageSec = t + invSampleRate

                let vel = voices[vi].velocity
                let f0 = voices[vi].freq0
                var sample: Float = 0

                switch SynthVoiceKind(rawValue: voices[vi].kind) ?? .celesta {
                case .rhodes:
                    // Warm 2-op FM Rhodes tine + chorus carrier + sub-octave body
                    let atk = min(1.0, t / 0.006)
                    let dec = exp(-t * 2.4)
                    let rel = t > voices[vi].holdDurSec ? exp(-(t - voices[vi].holdDurSec) * 7.5) : 1.0
                    let env = atk * (0.28 + 0.72 * dec) * rel * 0.16 * vel

                    let modHz = min(nyquistSafe, f0 * 14.0)
                    voices[vi].phaseMod = wrapPhase(voices[vi].phaseMod + modHz * invSampleRate)
                    let modIdx = (0.45 + vel * 1.15) * exp(-t * 9.5)
                    let modSig = sin(voices[vi].phaseMod * twoPi) * modIdx

                    voices[vi].phase1 = wrapPhase(voices[vi].phase1 + f0 * invSampleRate)
                    voices[vi].phase2 = wrapPhase(voices[vi].phase2 + (f0 * 1.0035) * invSampleRate)
                    voices[vi].phase3 = wrapPhase(voices[vi].phase3 + (f0 * 0.5) * invSampleRate)

                    let c1 = sin(voices[vi].phase1 * twoPi + modSig)
                    let c2 = sin(voices[vi].phase2 * twoPi) * 0.5
                    let sub = sin(voices[vi].phase3 * twoPi) * 0.32
                    sample = (c1 + c2 + sub) * env

                case .marimba, .kalimba:
                    let isKal = (voices[vi].kind == SynthVoiceKind.kalimba.rawValue)
                    let atk = min(1.0, t / 0.004)
                    let decRate: Float = isKal ? 3.2 : 6.2
                    let env = atk * exp(-t * decRate) * 0.21 * vel

                    voices[vi].phase1 = wrapPhase(voices[vi].phase1 + f0 * invSampleRate)
                    let baseWave = sin(voices[vi].phase1 * twoPi)
                    let triHarm = isKal ? sin(voices[vi].phase1 * twoPi * 3.0) * 0.12 : 0.0

                    let overMult: Float = isKal ? 5.4 : 4.0
                    var over: Float = 0
                    if f0 * overMult < nyquistSafe {
                        voices[vi].phase2 = wrapPhase(voices[vi].phase2 + (f0 * overMult) * invSampleRate)
                        over = sin(voices[vi].phase2 * twoPi) * exp(-t * 28.0) * 0.38
                    }
                    let woodClick = t < 0.025 ? (pink * exp(-t * 140.0) * 0.25) : 0.0
                    sample = (baseWave + triHarm + over + woodClick) * env

                case .celesta, .bell, .glassHarp:
                    let isBell = (voices[vi].kind != SynthVoiceKind.celesta.rawValue)
                    let isGlass = (voices[vi].kind == SynthVoiceKind.glassHarp.rawValue)
                    let atk = min(1.0, t / (isGlass ? 0.014 : 0.005))
                    let decRate: Float = isBell ? 2.1 : 3.2
                    let shim = isGlass ? (0.86 + 0.14 * sin(t * 36.0)) : 1.0
                    let env = atk * exp(-t * decRate) * shim * 0.145 * vel

                    voices[vi].phase1 = wrapPhase(voices[vi].phase1 + f0 * invSampleRate)
                    var s = sin(voices[vi].phase1 * twoPi)
                    let m2: Float = isBell ? 2.76 : 2.0
                    let m3: Float = isBell ? 5.40 : 4.0
                    if f0 * m2 < nyquistSafe {
                        voices[vi].phase2 = wrapPhase(voices[vi].phase2 + (f0 * m2) * invSampleRate)
                        s += sin(voices[vi].phase2 * twoPi) * (isBell ? 0.28 : 0.18) * exp(-t * 1.8)
                    }
                    if f0 * m3 < nyquistSafe {
                        voices[vi].phase3 = wrapPhase(voices[vi].phase3 + (f0 * m3) * invSampleRate)
                        s += sin(voices[vi].phase3 * twoPi) * 0.11 * exp(-t * 3.5)
                    }
                    sample = s * env

                case .bass:
                    let atk = min(1.0, t / 0.008)
                    let dec = 0.35 + 0.65 * exp(-t * 7.5)
                    let rel = t > voices[vi].holdDurSec ? exp(-(t - voices[vi].holdDurSec) * 16.0) : 1.0
                    let env = atk * dec * rel * 0.28 * vel

                    voices[vi].phase1 = wrapPhase(voices[vi].phase1 + f0 * invSampleRate)
                    let p = voices[vi].phase1
                    let tri = 1.0 - 4.0 * abs(p - 0.5)
                    let sub = sin(p * twoPi)

                    let cutHz = 220.0 + 730.0 * exp(-t * 11.0)
                    let fc = min(0.65, 2.0 * sin(.pi * min(cutHz, nyquistSafe) * invSampleRate))
                    voices[vi].svfLow += fc * voices[vi].svfBand
                    let high = tri - voices[vi].svfLow - 0.85 * voices[vi].svfBand
                    voices[vi].svfBand += fc * high
                    sample = (voices[vi].svfLow * 0.65 + sub * 0.55) * env

                case .pad:
                    let atkDur = min(0.85, voices[vi].holdDurSec * 0.35)
                    let atk = min(1.0, t / max(0.05, atkDur))
                    let rel = t > voices[vi].holdDurSec ? exp(-(t - voices[vi].holdDurSec) * 2.6) : 1.0
                    let env = atk * rel * 0.075 * vel

                    voices[vi].phase1 = wrapPhase(voices[vi].phase1 + f0 * invSampleRate)
                    voices[vi].phase2 = wrapPhase(voices[vi].phase2 + (f0 * 1.004) * invSampleRate)
                    let tri1 = 1.0 - 4.0 * abs(voices[vi].phase1 - 0.5)
                    let tri2 = 1.0 - 4.0 * abs(voices[vi].phase2 - 0.5)

                    let breathHz = 750.0 + 680.0 * sin(min(1.0, t / max(0.2, voices[vi].holdDurSec)) * .pi)
                    let fc = min(0.55, 2.0 * sin(.pi * breathHz * invSampleRate))
                    voices[vi].svfLow += fc * voices[vi].svfBand
                    let high = (tri1 + tri2) * 0.5 - voices[vi].svfLow - 1.2 * voices[vi].svfBand
                    voices[vi].svfBand += fc * high
                    sample = voices[vi].svfLow * env

                case .reed:
                    let atk = min(1.0, t / 0.028)
                    let rel = t > voices[vi].holdDurSec ? exp(-(t - voices[vi].holdDurSec) * 11.0) : 1.0
                    let env = atk * rel * 0.115 * vel

                    let vibDepth = min(1.0, t / 0.25) * 0.0055 * sin(t * twoPi * 5.2)
                    let fInst = f0 * (1.0 + vibDepth)
                    voices[vi].phase1 = wrapPhase(voices[vi].phase1 + fInst * invSampleRate)
                    voices[vi].phase2 = wrapPhase(voices[vi].phase2 + (fInst * 1.003) * invSampleRate)
                    let saw = 2.0 * voices[vi].phase1 - 1.0
                    let tri = 1.0 - 4.0 * abs(voices[vi].phase2 - 0.5)

                    let cutHz = 650.0 + (900.0 + vel * 550.0) * exp(-max(0, t - 0.06) * 3.5)
                    let fc = min(0.65, 2.0 * sin(.pi * min(cutHz, nyquistSafe) * invSampleRate))
                    voices[vi].svfLow += fc * voices[vi].svfBand
                    let high = (saw * 0.55 + tri * 0.45) - voices[vi].svfLow - 0.95 * voices[vi].svfBand
                    voices[vi].svfBand += fc * high
                    sample = voices[vi].svfLow * env

                case .pluck:
                    let atk = min(1.0, t / 0.004)
                    let env = atk * exp(-t * 6.8) * 0.135 * vel
                    voices[vi].phase1 = wrapPhase(voices[vi].phase1 + f0 * invSampleRate)
                    let saw = 2.0 * voices[vi].phase1 - 1.0
                    let cutHz = 620.0 + 2580.0 * exp(-t * 14.0)
                    let fc = min(0.72, 2.0 * sin(.pi * min(cutHz, nyquistSafe) * invSampleRate))
                    voices[vi].svfLow += fc * voices[vi].svfBand
                    let high = saw - voices[vi].svfLow - 1.1 * voices[vi].svfBand
                    voices[vi].svfBand += fc * high
                    sample = voices[vi].svfLow * env

                case .shaker:
                    let atk = min(1.0, t / 0.007)
                    let env = atk * exp(-t * 28.0) * 0.11 * vel
                    let fc = min(0.85, 2.0 * sin(.pi * min(6200.0, nyquistSafe) * invSampleRate))
                    voices[vi].svfLow += fc * voices[vi].svfBand
                    let high = pink - voices[vi].svfLow - 1.2 * voices[vi].svfBand
                    voices[vi].svfBand += fc * high
                    sample = voices[vi].svfBand * env

                case .hat:
                    let atk = min(1.0, t / 0.004)
                    let env = atk * exp(-t * 42.0) * 0.08 * vel
                    let fc = min(0.88, 2.0 * sin(.pi * min(7400.0, nyquistSafe) * invSampleRate))
                    voices[vi].svfLow += fc * voices[vi].svfBand
                    let high = pink - voices[vi].svfLow - 1.0 * voices[vi].svfBand
                    voices[vi].svfBand += fc * high
                    sample = high * env

                case .rim:
                    let atk = min(1.0, t / 0.003)
                    let env = atk * exp(-t * 38.0) * 0.13 * vel
                    let fInst = 700.0 + 220.0 * exp(-t * 55.0)
                    voices[vi].phase1 = wrapPhase(voices[vi].phase1 + fInst * invSampleRate)
                    sample = sin(voices[vi].phase1 * twoPi) * env

                case .kick:
                    let atk = min(1.0, t / 0.006)
                    let env = atk * exp(-t * 14.5) * 0.32 * vel
                    let fInst = 48.0 + 54.0 * exp(-t * 24.0)
                    voices[vi].phase1 = wrapPhase(voices[vi].phase1 + fInst * invSampleRate)
                    sample = sin(voices[vi].phase1 * twoPi) * env

                case .sfxBlip:
                    let progress = min(1.0, t / max(0.01, voices[vi].holdDurSec))
                    let fInst = f0 * pow(max(0.05, voices[vi].freq1 / max(1.0, f0)), progress)
                    let atk = min(1.0, t / 0.006)
                    let env = atk * exp(-progress * 3.8) * vel
                    voices[vi].phase1 = wrapPhase(voices[vi].phase1 + min(nyquistSafe, fInst) * invSampleRate)
                    sample = sin(voices[vi].phase1 * twoPi) * env

                case .sfxBoing:
                    let lift: Float = t < 0.06 ? (1.0 + 0.85 * (t / 0.06)) : (1.15 + 0.70 * exp(-(t - 0.06) * 11.0))
                    let vib = 1.0 + 0.09 * exp(-t * 6.5) * sin(t * twoPi * 16.0)
                    let fInst = min(nyquistSafe, f0 * lift * vib)
                    let atk = min(1.0, t / 0.008)
                    let env = atk * exp(-t * 8.5) * vel
                    voices[vi].phase1 = wrapPhase(voices[vi].phase1 + fInst * invSampleRate)
                    sample = sin(voices[vi].phase1 * twoPi) * env

                case .sfxNoiseSweep:
                    let progress = min(1.0, t / max(0.02, voices[vi].holdDurSec))
                    let fInst = min(nyquistSafe, f0 * pow(max(0.05, voices[vi].freq1 / max(1.0, f0)), progress))
                    let atk = min(1.0, t / min(0.025, voices[vi].holdDurSec * 0.25))
                    let env = atk * (1.0 - progress) * vel
                    let fc = min(0.85, 2.0 * sin(.pi * fInst * invSampleRate))
                    let damp = 1.0 / voices[vi].filterQ
                    voices[vi].svfLow += fc * voices[vi].svfBand
                    let high = pink - voices[vi].svfLow - damp * voices[vi].svfBand
                    voices[vi].svfBand += fc * high
                    sample = voices[vi].svfBand * env
                }

                let l = sample * voices[vi].panL
                let r = sample * voices[vi].panR
                if voices[vi].isMusicBus {
                    musicL += l
                    musicR += r
                    let mMono = (l + r) * 0.5 * smoothMusicGain
                    revSendMono += mMono * voices[vi].reverbSend
                    delSendMono += mMono * voices[vi].delaySend
                } else {
                    sfxL += l
                    sfxR += r
                    let sMono = (l + r) * 0.5 * smoothSfxGain
                    revSendMono += sMono * voices[vi].reverbSend
                    delSendMono += sMono * voices[vi].delaySend
                }
            }

            // 2. Nuanced Multi-Texture Brushing: Warm Plaque Foam + Bristle Tuft Breath + In-Key Crystal Polish
            if smoothScrubGain > 0.00015 {
                let prevSpd = smoothScrubSpeed
                smoothScrubSpeed += (locScrubSpd - smoothScrubSpeed) * 0.0012
                smoothPlaqueBite += (locPlaqueBite - smoothPlaqueBite) * 0.0010
                let bristleFlex = min(1.0, abs(locScrubSpd - prevSpd) * 3.2)

                scrubLfoPhase = wrapPhase(scrubLfoPhase + scrubLfoHz * invSampleRate)
                scrubBreathPhase = wrapPhase(scrubBreathPhase + scrubBreathHz * invSampleRate)
                let lfoA = sin(scrubLfoPhase * twoPi)
                let lfoB = sin(scrubBreathPhase * twoPi)
                let strokeContour = 0.62 + 0.24 * lfoA + 0.14 * lfoB + bristleFlex * 0.35

                // Layer A: Warm velvety micro-foam (dominant when biting into soft plaque)
                let modCenter = min(nyquistSafe, max(240.0, scrubCenterHz + lfoA * 140.0 + lfoB * 75.0))
                let fcMain = min(0.55, 2.0 * sin(.pi * modCenter * invSampleRate))
                scrubSvfLow += fcMain * scrubSvfBand
                let highMain = pink - scrubSvfLow - 1.25 * scrubSvfBand
                scrubSvfBand += fcMain * highMain

                // Layer B: Soft silky bristle tuft air on stroke flex (never harsh)
                let silkHz = min(nyquistSafe, 1550.0 + smoothScrubSpeed * 950.0 + bristleFlex * 500.0)
                let fcShim = min(0.68, 2.0 * sin(.pi * silkHz * invSampleRate))
                scrubShimLow += fcShim * scrubShimBand
                let highShim = pink - scrubShimLow - 1.35 * scrubShimBand
                scrubShimBand += fcShim * highShim

                // Layer C: Singing hydroxyapatite crystal overtone (blooms gently as clean enamel shines, in key!)
                scrubCrystalLow += crystalFc * scrubCrystalBand
                let highCrystal = (pink * 0.09) - scrubCrystalLow - 0.15 * scrubCrystalBand
                scrubCrystalBand += crystalFc * highCrystal

                let foamWeight: Float = 0.45 + 0.55 * smoothPlaqueBite
                let silkWeight: Float = (0.10 + 0.22 * bristleFlex) * (0.5 + 0.5 * smoothScrubSpeed)
                let crystalPolish: Float = max(0.0, locScrubCln - 0.25) * (1.0 - 0.65 * smoothPlaqueBite) * 0.55

                let rawBrush = scrubSvfBand * foamWeight + scrubShimBand * silkWeight + scrubCrystalBand * crystalPolish
                let brushSig = rawBrush * smoothScrubGain * strokeContour
                let stereoSwish = 0.24 * lfoA
                sfxL += brushSig * (1.0 - stereoSwish)
                sfxR += brushSig * (1.0 + stereoSwish)
                revSendMono += (brushSig * 0.14 + scrubCrystalBand * crystalPolish * smoothScrubGain * 0.38) * smoothSfxGain
            }

            // 3. Music Bus Warm Filter (Pause Ducking / World 3 Stephan Acid Tension)
            musicBusLpL += (musicL - musicBusLpL) * smoothMusicLpCoeff
            musicBusLpR += (musicR - musicBusLpR) * smoothMusicLpCoeff

            var dryL = musicBusLpL * smoothMusicGain + sfxL * smoothSfxGain
            var dryR = musicBusLpR * smoothMusicGain + sfxR * smoothSfxGain

            // 4. Shared Warm Ping-Pong Tape Delay
            let readIdx = (delayWritePos - delaySamples + delayCapacity) % delayCapacity
            let delL = delayBufL[readIdx]
            let delR = delayBufR[readIdx]
            delayFbLp += ((delSendMono + delR * 0.34) - delayFbLp) * 0.28
            delayBufL[delayWritePos] = delayFbLp
            delayBufR[delayWritePos] = delL * 0.88
            delayWritePos = (delayWritePos + 1) % delayCapacity

            dryL += (delL * 0.82 + delR * 0.18) * 0.36
            dryR += (delR * 0.82 + delL * 0.18) * 0.36

            // 5. Shared Stereo Velvet Comb + Allpass Reverb
            let revIn = revSendMono * 0.22
            var revOutL: Float = 0
            var revOutR: Float = 0
            for ci in 0..<4 {
                let bL = combBufsL[ci]
                let pL = combPosL[ci]
                let outCombL = bL[pL]
                combStoreL[ci] = outCombL * 0.72 + combStoreL[ci] * 0.28
                bL[pL] = revIn + combStoreL[ci] * 0.78
                combPosL[ci] = (pL + 1) % bL.count
                revOutL += outCombL

                let bR = combBufsR[ci]
                let pR = combPosR[ci]
                let outCombR = bR[pR]
                combStoreR[ci] = outCombR * 0.72 + combStoreR[ci] * 0.28
                bR[pR] = revIn + combStoreR[ci] * 0.78
                combPosR[ci] = (pR + 1) % bR.count
                revOutR += outCombR
            }
            for ai in 0..<2 {
                let abL = apBufsL[ai]
                let apL = apPosL[ai]
                let bufOutL = abL[apL]
                let inL = revOutL
                revOutL = -inL + bufOutL
                abL[apL] = inL + bufOutL * 0.5
                apPosL[ai] = (apL + 1) % abL.count

                let abR = apBufsR[ai]
                let apR = apPosR[ai]
                let bufOutR = abR[apR]
                let inR = revOutR
                revOutR = -inR + bufOutR
                abR[apR] = inR + bufOutR * 0.5
                apPosR[ai] = (apR + 1) % abR.count
            }

            let mixL = (dryL + revOutL * 0.42) * smoothMaster
            let mixR = (dryR + revOutR * 0.42) * smoothMaster

            // 6. 30Hz DC Highpass + Soft Tanh Limiter (Never clips!)
            let hpL = mixL - dcPrevInL + 0.995 * dcPrevOutL
            dcPrevInL = mixL
            dcPrevOutL = hpL

            let hpR = mixR - dcPrevInR + 0.995 * dcPrevOutR
            dcPrevInR = mixR
            dcPrevOutR = hpR

            let limL = tanh(hpL * 0.95)
            let limR = tanh(hpR * 0.95)

            // 7. Inline 3-band spectral energy split (<140Hz bass, 140–2100Hz mid, >2100Hz sparkle)
            let mono = (limL + limR) * 0.5
            meterLpLow += (mono - meterLpLow) * lpAlphaLow
            meterLpMid += (mono - meterLpMid) * lpAlphaMid
            let lowS = meterLpLow
            let midS = meterLpMid - meterLpLow
            let highS = mono - meterLpMid
            sumBassSq += lowS * lowS
            sumMidSq += midS * midS
            sumHighSq += highS * highS

            if let outR {
                outL[frame] = limL
                outR[frame] = limR
            } else {
                // Interleaved 2-channel fallback
                outL[frame * 2] = limL
                outL[frame * 2 + 1] = limR
            }
        }

        // Publish block-rate smoothed 3-band envelope + transient beat flux (wait-free trylock)
        let invFrames = 1.0 / Float(max(1, frameCount))
        let dtBlock = Float(frameCount) * invSampleRate
        let rawB = min(1.0, sqrt(sumBassSq * invFrames) * 5.8)
        let rawM = min(1.0, sqrt(sumMidSq * invFrames) * 5.4)
        let rawH = min(1.0, sqrt(sumHighSq * invFrames) * 8.2)

        let atk = min(1.0, dtBlock * 32.0)
        let rel = min(1.0, dtBlock * 8.5)
        envBass += (rawB - envBass) * (rawB > envBass ? atk : rel)
        envMid += (rawM - envMid) * (rawM > envMid ? atk : rel)
        envHigh += (rawH - envHigh) * (rawH > envHigh ? atk : rel)

        let flux = max(0.0, rawB - prevRawBass) * 3.4
        prevRawBass = rawB
        envBeat = min(1.0, max(envBeat * exp(-dtBlock * 9.5), flux))

        if os_unfair_lock_trylock(meterLockPtr) {
            pubBass = envBass
            pubMid = envMid
            pubHigh = envHigh
            pubBeat = envBeat
            os_unfair_lock_unlock(meterLockPtr)
        }
    }
}

// MARK: - Hardware-Decoded Suno Background Track Crossfader

/// Plays hardware-decoded `.m4a`/`.mp3`/`.caf`/`.wav` tracks dropped into `MouthLifeApp/Music/`
/// with dual-deck 850ms crossfades. When a recorded track is active for the current theme,
/// procedural music notes sleep (`~0%` CPU) while harmonic chord tracking stays active for in-key SFX.
private final class SunoStreamDeck {
    private static let supportedExtensions = ["m4a", "mp3", "caf", "wav", "aac"]

    private struct SunoEnvelopeTrack {
        let hopHz: Float
        let durationSec: Double
        let frames: [SIMD4<Float>]
    }

    private let lock = NSLock()
    private var resolvedURLCache: [MusicThemeId: URL?] = [:]
    private var envelopeCache: [URL: SunoEnvelopeTrack] = [:]
    private var analyzingURLs: Set<URL> = []
    private var activePlayer: AVAudioPlayer?
    private var activeURL: URL?
    private var fadingOutPlayers: [AVAudioPlayer] = []

    var isPlayingRecordedTrack: Bool {
        lock.lock()
        defer { lock.unlock() }
        return activePlayer != nil
    }

    func sampleReactiveBands() -> AudioReactiveBands {
        lock.lock()
        guard let player = activePlayer,
              player.isPlaying,
              player.volume > 0.001,
              let url = activeURL,
              let env = envelopeCache[url],
              !env.frames.isEmpty
        else {
            lock.unlock()
            return .zero
        }
        let curTime = player.currentTime
        let gainScale = min(1.0, player.volume / 0.48)
        lock.unlock()

        let dur = max(0.02, env.durationSec)
        var wrapped = curTime.truncatingRemainder(dividingBy: dur)
        if wrapped < 0 { wrapped += dur }
        let pos = Float(wrapped) * env.hopHz
        let count = env.frames.count
        let i0 = min(count - 1, max(0, Int(pos)))
        let i1 = (i0 + 1) % count
        let frac = pos - Float(Int(pos))
        let interp = env.frames[i0] * (1.0 - frac) + env.frames[i1] * frac
        let scaled = simd_clamp(interp * gainScale, .zero, SIMD4<Float>(repeating: 1.0))
        return AudioReactiveBands(bass: scaled.x, mid: scaled.y, high: scaled.z, beatPulse: scaled.w)
    }

    func sync(themeId: MusicThemeId, targetVolume: Float, muted: Bool, interrupted: Bool) {
        lock.lock()
        defer { lock.unlock() }

        reapFinishedFadesLocked()
        let nextURL = resolveTrackURLLocked(for: themeId)
        if let url = nextURL {
            triggerEnvelopeAnalysisIfNeededLocked(for: url)
        }
        let clampedGain = min(1.0, max(0.0, targetVolume))

        if nextURL == activeURL {
            applyGainLocked(to: activePlayer, gain: clampedGain, muted: muted, interrupted: interrupted, fadeSec: 0.22)
            return
        }

        if let outgoing = activePlayer {
            outgoing.setVolume(0, fadeDuration: 0.85)
            fadingOutPlayers.append(outgoing)
            scheduleCleanup()
        }
        activePlayer = nil
        activeURL = nextURL

        guard let url = nextURL, let incoming = try? AVAudioPlayer(contentsOf: url) else {
            return
        }
        incoming.numberOfLoops = -1
        incoming.volume = 0
        incoming.prepareToPlay()
        activePlayer = incoming

        if !muted && !interrupted && clampedGain > 0.0005 {
            incoming.play()
            incoming.setVolume(clampedGain, fadeDuration: 0.85)
        }
    }

    func updateMix(targetVolume: Float, muted: Bool, interrupted: Bool) {
        lock.lock()
        defer { lock.unlock() }
        reapFinishedFadesLocked()
        let clampedGain = min(1.0, max(0.0, targetVolume))
        applyGainLocked(to: activePlayer, gain: clampedGain, muted: muted, interrupted: interrupted, fadeSec: 0.20)
    }

    func stopAll() {
        lock.lock()
        let current = activePlayer
        let fading = fadingOutPlayers
        activePlayer = nil
        activeURL = nil
        fadingOutPlayers.removeAll()
        lock.unlock()

        current?.stop()
        for p in fading { p.stop() }
    }

    private func applyGainLocked(
        to player: AVAudioPlayer?,
        gain: Float,
        muted: Bool,
        interrupted: Bool,
        fadeSec: TimeInterval
    ) {
        guard let player else { return }
        if interrupted {
            if player.isPlaying { player.pause() }
            return
        }
        if muted || gain <= 0.0005 {
            player.setVolume(0, fadeDuration: min(0.18, fadeSec))
            return
        }
        if !player.isPlaying {
            player.prepareToPlay()
            if !player.play(), let url = activeURL, let fresh = try? AVAudioPlayer(contentsOf: url) {
                let resumeTime = player.currentTime
                fresh.numberOfLoops = -1
                fresh.currentTime = resumeTime
                fresh.volume = 0
                fresh.prepareToPlay()
                _ = fresh.play()
                activePlayer = fresh
                fresh.setVolume(gain, fadeDuration: fadeSec)
                return
            }
        }
        player.setVolume(gain, fadeDuration: fadeSec)
    }

    private func reapFinishedFadesLocked() {
        guard !fadingOutPlayers.isEmpty else { return }
        fadingOutPlayers.removeAll { player in
            if !player.isPlaying || player.volume <= 0.001 {
                player.stop()
                return true
            }
            return false
        }
    }

    private func scheduleCleanup() {
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 0.95) { [weak self] in
            guard let self else { return }
            self.lock.lock()
            self.reapFinishedFadesLocked()
            self.lock.unlock()
        }
    }

    private func resolveTrackURLLocked(for themeId: MusicThemeId) -> URL? {
        if let cached = resolvedURLCache[themeId] {
            return cached
        }
        var candidates: [String]
        switch themeId {
        case .world1:
            candidates = ["world_1", "toronto"]
        case .world2:
            candidates = ["world_2", "new_orleans", "nola"]
        case .world3:
            candidates = ["world_3", "tokyo", "tokyo_chicago", "chicago"]
        case .world4:
            candidates = ["world_4", "accra", "accra_colorado"]
        case .world5:
            candidates = ["world_5", "aurora", "orbit_aurora", "station_aurora", "orbit"]
        case .hub:
            candidates = ["hub", "sanctuary"]
        case .hubGlobe:
            candidates = ["hub_globe", "hub", "sanctuary"]
        case .hubReady:
            candidates = ["hub_ready", "hub", "sanctuary"]
        case .brushAlong:
            candidates = ["brush_along", "brush"]
        case .cosmic:
            candidates = ["cosmic", "intro"]
        case .pulp:
            candidates = ["pulp", "pulp_rescue", "boss"]
        case .report:
            candidates = ["report", "victory"]
        }
        candidates.append("background")

        let bundle = Bundle.main
        var found: URL?
        outer: for stem in candidates {
            for ext in Self.supportedExtensions {
                if let url = bundle.url(forResource: stem, withExtension: ext, subdirectory: "Music") {
                    found = url
                    break outer
                }
                if let url = bundle.url(forResource: stem, withExtension: ext) {
                    found = url
                    break outer
                }
            }
        }
        resolvedURLCache[themeId] = found
        return found
    }

    private func triggerEnvelopeAnalysisIfNeededLocked(for url: URL) {
        guard envelopeCache[url] == nil, !analyzingURLs.contains(url) else { return }
        analyzingURLs.insert(url)

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let analyzed = Self.analyzeTrackEnvelope(url: url)
            guard let self else { return }
            self.lock.lock()
            self.analyzingURLs.remove(url)
            if let analyzed {
                self.envelopeCache[url] = analyzed
            }
            self.lock.unlock()
        }
    }

    private static func analyzeTrackEnvelope(url: URL) -> SunoEnvelopeTrack? {
        guard let file = try? AVAudioFile(forReading: url) else { return nil }
        let format = file.processingFormat
        let sr = Float(max(8000.0, format.sampleRate))
        let chCount = Int(format.channelCount)
        guard chCount >= 1,
              let chunk = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096)
        else { return nil }

        let targetHopHz: Float = 60.0
        let samplesPerBin = max(1, Int((sr / targetHopHz).rounded()))
        let actualHopHz = sr / Float(samplesPerBin)

        let alphaLow = min(0.5, 1.0 - exp(-2.0 * .pi * 140.0 / sr))
        let alphaMid = min(0.85, 1.0 - exp(-2.0 * .pi * 2100.0 / sr))
        var lpLow: Float = 0
        var lpMid: Float = 0

        var binBassSq: Float = 0
        var binMidSq: Float = 0
        var binHighSq: Float = 0
        var binCount: Int = 0

        var rawBins: [SIMD3<Float>] = []
        rawBins.reserveCapacity(Int(Double(file.length) / Double(samplesPerBin)) + 4)

        while true {
            chunk.frameLength = 0
            guard (try? file.read(into: chunk)) != nil, chunk.frameLength > 0 else { break }
            guard let chData = chunk.floatChannelData else { break }
            let n = Int(chunk.frameLength)
            let c0 = chData[0]
            let c1 = chCount >= 2 ? chData[1] : nil

            for i in 0..<n {
                let mono = c1 != nil ? (c0[i] + c1![i]) * 0.5 : c0[i]
                lpLow += (mono - lpLow) * alphaLow
                lpMid += (mono - lpMid) * alphaMid
                let b = lpLow
                let m = lpMid - lpLow
                let h = mono - lpMid
                binBassSq += b * b
                binMidSq += m * m
                binHighSq += h * h
                binCount += 1

                if binCount >= samplesPerBin {
                    let inv = 1.0 / Float(binCount)
                    rawBins.append(SIMD3<Float>(sqrt(binBassSq * inv), sqrt(binMidSq * inv), sqrt(binHighSq * inv)))
                    binBassSq = 0; binMidSq = 0; binHighSq = 0; binCount = 0
                }
            }
        }
        if binCount > 0 {
            let inv = 1.0 / Float(binCount)
            rawBins.append(SIMD3<Float>(sqrt(binBassSq * inv), sqrt(binMidSq * inv), sqrt(binHighSq * inv)))
        }
        guard !rawBins.isEmpty else { return nil }

        // Auto-normalize each frequency band against its 95th percentile so soft & loud Suno songs both groove naturally
        func p95Scale(_ extract: (SIMD3<Float>) -> Float, fallback: Float) -> Float {
            var active = rawBins.map(extract).filter { $0 > 1e-4 }
            guard !active.isEmpty else { return fallback }
            active.sort()
            let idx = min(active.count - 1, Int(Double(active.count - 1) * 0.95))
            return 0.88 / max(1e-3, active[idx])
        }
        let scaleB = p95Scale({ $0.x }, fallback: 5.5)
        let scaleM = p95Scale({ $0.y }, fallback: 5.2)
        let scaleH = p95Scale({ $0.z }, fallback: 8.0)

        var frames: [SIMD4<Float>] = []
        frames.reserveCapacity(rawBins.count)
        var prevB: Float = 0
        var beatEnv: Float = 0
        let dt = 1.0 / actualHopHz
        let decay = exp(-dt * 9.5)

        for raw in rawBins {
            let nb = min(1.0, raw.x * scaleB)
            let nm = min(1.0, raw.y * scaleM)
            let nh = min(1.0, raw.z * scaleH)
            let flux = max(0.0, nb - prevB) * 2.8
            prevB = nb
            beatEnv = min(1.0, max(beatEnv * decay, flux))
            frames.append(SIMD4<Float>(nb, nm, nh, beatEnv))
        }

        let durationSec = Double(file.length) / Double(sr)
        return SunoEnvelopeTrack(hopHz: actualHopHz, durationSec: durationSec, frames: frames)
    }
}

// MARK: - Multilingual Hands-Free Speech Coach Delegate

private final class SpeechCoachBox: NSObject, AVSpeechSynthesizerDelegate, @unchecked Sendable {
    private let synthesizer = AVSpeechSynthesizer()
    private var voiceCache: [CoachLanguage: AVSpeechSynthesisVoice] = [:]
    private weak var currentUtterance: AVSpeechUtterance?
    private var activeToken: UInt64 = 0
    var onDuckingChanged: ((Bool) -> Void)?

    override init() {
        super.init()
        synthesizer.delegate = self
        #if os(iOS)
        synthesizer.usesApplicationAudioSession = true
        #endif
    }

    func speak(text: String, language: CoachLanguage, volume: Float) {
        let work = { [weak self] in
            guard let self, !text.isEmpty else { return }
            self.activeToken &+= 1
            let token = self.activeToken

            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = self.resolveVoice(for: language)
            utterance.rate = 0.49
            utterance.pitchMultiplier = 1.03
            utterance.postUtteranceDelay = 0.02
            utterance.volume = min(1.0, max(0.55, volume))

            self.currentUtterance = utterance
            if self.synthesizer.isSpeaking {
                self.synthesizer.stopSpeaking(at: .immediate)
            }
            self.onDuckingChanged?(true)
            self.synthesizer.speak(utterance)

            // Safety fallback so music ducking can never remain stuck if OS speech interrupts silently
            DispatchQueue.main.asyncAfter(deadline: .now() + 5.5) { [weak self] in
                guard let self, self.activeToken == token, self.currentUtterance != nil else { return }
                self.currentUtterance = nil
                self.onDuckingChanged?(false)
            }
        }
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }

    func stop() {
        let work = { [weak self] in
            guard let self else { return }
            self.activeToken &+= 1
            self.currentUtterance = nil
            if self.synthesizer.isSpeaking {
                self.synthesizer.stopSpeaking(at: .immediate)
            }
            self.onDuckingChanged?(false)
        }
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        guard utterance === currentUtterance else { return }
        currentUtterance = nil
        onDuckingChanged?(false)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        guard utterance === currentUtterance else { return }
        currentUtterance = nil
        onDuckingChanged?(false)
    }

    private func resolveVoice(for language: CoachLanguage) -> AVSpeechSynthesisVoice? {
        if let cached = voiceCache[language] {
            return cached
        }
        let targetCode = language.bcp47VoiceCode.lowercased()
        let prefix = language.rawValue.lowercased()
        let candidates = AVSpeechSynthesisVoice.speechVoices().filter { voice in
            guard !voice.voiceTraits.contains(.isNoveltyVoice) else { return false }
            let code = voice.language.lowercased()
            return code == targetCode || code.hasPrefix(prefix + "-") || code == prefix
        }
        let best = candidates.max { a, b in
            let aExact = a.language.lowercased() == targetCode ? 1 : 0
            let bExact = b.language.lowercased() == targetCode ? 1 : 0
            if a.quality.rawValue != b.quality.rawValue {
                return a.quality.rawValue < b.quality.rawValue
            }
            return aExact < bExact
        } ?? AVSpeechSynthesisVoice(language: language.bcp47VoiceCode)
          ?? AVSpeechSynthesisVoice(language: language.rawValue)

        if let best {
            voiceCache[language] = best
        }
        return best
    }
}

// MARK: - Public NativeSoundEngine

public enum RadioStation: Equatable, Sendable {
    case sanctuary
    case planetOfEnamel
    case livingClock
    case city(String)
}

/// Real-time procedural `AVAudioEngine` + `AVAudioSourceNode` polyphonic synthesizer & adaptive
/// music/SFX director for MouthLife on iOS 17+ and macOS 14+ (with automatic hardware Suno track crossfading).
public final class NativeSoundEngine {
    public static let shared = NativeSoundEngine()

    private static let mutedKey = "mouthlife.nativeAudio.muted"
    private static let musicVolKey = "mouthlife.nativeAudio.musicVolume"
    private static let sfxVolKey = "mouthlife.nativeAudio.sfxVolume"
    private static let earthRadioKey = "mouthlife.nativeAudio.earthRadio"
    private static let voiceCoachKey = "mouthlife.nativeAudio.voiceCoach"
    private static let coachLangKey = "mouthlife.nativeAudio.coachLanguage"

    public private(set) var isMuted: Bool
    public private(set) var musicVolume: Float
    public private(set) var sfxVolume: Float
    public private(set) var isEarthRadioEnabled: Bool
    public private(set) var isVoiceCoachEnabled: Bool
    public private(set) var coachLanguage: CoachLanguage
    public private(set) var tunedRadioWorldId: String = "world_1"
    public var onPreferencesChanged: ((Bool, Float, Float) -> Void)?

    private let engine = AVAudioEngine()
    private var sourceNode: AVAudioSourceNode?
    private var kernel: RealtimeSynthKernel?
    private let sunoDeck = SunoStreamDeck()
    private let speechCoach = SpeechCoachBox()
    private let duckLock = NSLock()
    private var isVoiceDuckingStorage: Bool = false
    private let sequencerQueue = DispatchQueue(label: "com.mouthlife.audio.sequencer", qos: .userInteractive)
    private var sequencerTimer: DispatchSourceTimer?

    private var isEngineStarted: Bool = false
    private var isPaused: Bool = false
    private var isInterrupted: Bool = false

    // Adaptive soundtrack state
    private var currentMode: AppMode = .cosmicIntro
    private var currentWorldId: String = "world_1"
    private var earthRadioActive: Bool = true
    private var radioWorldId: String = "world_1"
    private var hubRadioStation: RadioStation = .city("world_1")
    private var brushRadioStation: RadioStation = .livingClock
    private var hubGlobeActive: Bool = false
    private var pulpZeroActive: Bool = false
    private var urgencyActive: Bool = false
    private var acidTensionActive: Bool = false
    private var pacerQuadrant: Int = 0
    private var pacerInFlossBonus: Bool = false
    private var cosmicBeatIndex: Int = 0

    private var activeTheme: MusicThemeDef = MusicCatalog.themes[.cosmic]!
    private var currentChord: ChordDef = MusicCatalog.themes[.cosmic]!.progressionA[0]
    private var globalStep: Int = 0
    private var nextStepHostTimeSec: Double = 0

    private var throttles: [String: Double] = [:]
    private let throttleLock = NSLock()
    private var scrubPlaqueHold: Float = 0
    private var scrubMelodyStep: Int = 0
    private var scrubSparkleCellsAccum: Int = 0

    public init(defaults: UserDefaults = .standard) {
        if defaults.object(forKey: Self.mutedKey) != nil {
            self.isMuted = defaults.bool(forKey: Self.mutedKey)
        } else {
            self.isMuted = false
        }
        if defaults.object(forKey: Self.musicVolKey) != nil {
            self.musicVolume = min(1.0, max(0.0, defaults.float(forKey: Self.musicVolKey)))
        } else {
            self.musicVolume = 0.70
        }
        if defaults.object(forKey: Self.sfxVolKey) != nil {
            self.sfxVolume = min(1.0, max(0.0, defaults.float(forKey: Self.sfxVolKey)))
        } else {
            self.sfxVolume = 0.85
        }
        if defaults.object(forKey: Self.earthRadioKey) != nil {
            self.isEarthRadioEnabled = defaults.bool(forKey: Self.earthRadioKey)
        } else {
            self.isEarthRadioEnabled = true
        }
        if defaults.object(forKey: Self.voiceCoachKey) != nil {
            self.isVoiceCoachEnabled = defaults.bool(forKey: Self.voiceCoachKey)
        } else {
            self.isVoiceCoachEnabled = true
        }
        if let rawLang = defaults.string(forKey: Self.coachLangKey),
           let savedLang = CoachLanguage(rawValue: rawLang) {
            self.coachLanguage = savedLang
        } else {
            self.coachLanguage = CoachLanguage.detectSystemDefault()
        }
        self.earthRadioActive = self.isEarthRadioEnabled
        self.hubRadioStation = self.isEarthRadioEnabled ? .city("world_1") : .sanctuary

        self.speechCoach.onDuckingChanged = { [weak self] ducking in
            guard let self else { return }
            self.duckLock.lock()
            let changed = (self.isVoiceDuckingStorage != ducking)
            self.isVoiceDuckingStorage = ducking
            self.duckLock.unlock()
            if changed {
                self.pushMixStateToKernel()
            }
        }

        configureAudioSessionIfNeeded()
        setupAudioGraph()
        registerLifecycleObservers()
        startSequencerTimer()
    }

    deinit {
        sequencerTimer?.cancel()
        sequencerTimer = nil
        speechCoach.stop()
        sunoDeck.stopAll()
        if engine.isRunning {
            engine.stop()
        }
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: Engine & Session Setup

    private func configureAudioSessionIfNeeded() {
        #if os(iOS)
        do {
            let session = AVAudioSession.sharedInstance()
            // .playback + .mixWithOthers ensures hands-free voice & musical coaching play on the bathroom
            // counter even when the hardware Silent Mode bell is on, while still mixing politely with external audio!
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            // Non-fatal in headless test / simulator environments
        }
        #endif
    }

    private func setupAudioGraph() {
        let hwFormat = engine.outputNode.inputFormat(forBus: 0)
        let sr = hwFormat.sampleRate > 8000 ? hwFormat.sampleRate : 48000.0
        guard let renderFormat = AVAudioFormat(standardFormatWithSampleRate: sr, channels: 2) else { return }

        let synthKernel = RealtimeSynthKernel(sampleRate: sr)
        self.kernel = synthKernel

        let srcNode = AVAudioSourceNode(format: renderFormat) { _, _, frameCount, audioBufferList -> OSStatus in
            let abl = UnsafeMutableAudioBufferListPointer(audioBufferList)
            let frames = Int(frameCount)
            guard frames > 0, abl.count > 0 else { return noErr }

            if abl.count >= 2,
               let ptrL = abl[0].mData?.assumingMemoryBound(to: Float.self),
               let ptrR = abl[1].mData?.assumingMemoryBound(to: Float.self) {
                synthKernel.render(frameCount: frames, outL: ptrL, outR: ptrR)
            } else if let ptrInterleaved = abl[0].mData?.assumingMemoryBound(to: Float.self),
                      abl[0].mNumberChannels == 2 {
                synthKernel.render(frameCount: frames, outL: ptrInterleaved, outR: nil)
            } else if let ptrMono = abl[0].mData?.assumingMemoryBound(to: Float.self) {
                // Mono hardware safety fallback
                synthKernel.render(frameCount: frames, outL: ptrMono, outR: ptrMono)
            }
            return noErr
        }

        self.sourceNode = srcNode
        engine.attach(srcNode)
        engine.connect(srcNode, to: engine.mainMixerNode, format: renderFormat)
        pushMixStateToKernel()
        startEngineIfNeeded()
    }

    public func startEngineIfNeeded() {
        guard !isInterrupted else { return }
        if !engine.isRunning {
            do {
                configureAudioSessionIfNeeded()
                try engine.start()
                isEngineStarted = true
            } catch {
                isEngineStarted = false
            }
        }
    }

    /// Re-activates `AVAudioSession`, restarts `AVAudioEngine`, and resumes any hardware-decoded
    /// Suno `.m4a` soundtrack that iOS paused during screen lock / background suspension.
    public func resumeFromForeground() {
        isInterrupted = false
        configureAudioSessionIfNeeded()
        if !isMuted {
            startEngineIfNeeded()
        }
        pushMixStateToKernel()
    }

    private func registerLifecycleObservers() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleEngineConfigurationChange(_:)),
            name: .AVAudioEngineConfigurationChange,
            object: engine
        )

        #if os(iOS)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAudioSessionInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
        #endif
    }

    @objc private func handleEngineConfigurationChange(_ notification: Notification) {
        // AirPods / Bluetooth route switch: cleanly reconnect if sample rate changed & resume
        guard !isInterrupted, !isMuted else { return }
        if !engine.isRunning {
            startEngineIfNeeded()
        }
        pushMixStateToKernel()
    }

    #if os(iOS)
    @objc private func handleAudioSessionInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let typeRaw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeRaw) else { return }

        switch type {
        case .began:
            isInterrupted = true
            stopScrub()
            stopVoiceCoach()
            pushMixStateToKernel()
        case .ended:
            isInterrupted = false
            configureAudioSessionIfNeeded()
            if !isMuted {
                startEngineIfNeeded()
                pushMixStateToKernel()
            }
        @unknown default:
            break
        }
    }
    #endif

    // MARK: Volume, Voice Coach & Preferences API

    public func setMuted(_ muted: Bool) {
        isMuted = muted
        persistPreferences()
        if muted {
            stopScrub()
            stopVoiceCoach()
        } else {
            startEngineIfNeeded()
        }
        pushMixStateToKernel()
        if !muted {
            playUiTap()
        }
    }

    public func setMusicVolume(_ volume: Float) {
        musicVolume = min(1.0, max(0.0, volume))
        persistPreferences()
        pushMixStateToKernel()
    }

    public func setSfxVolume(_ volume: Float) {
        sfxVolume = min(1.0, max(0.0, volume))
        persistPreferences()
        if sfxVolume <= 0.001 {
            stopScrub()
        }
        pushMixStateToKernel()
    }

    public func setVoiceCoachEnabled(_ enabled: Bool) {
        isVoiceCoachEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: Self.voiceCoachKey)
        if !enabled {
            stopVoiceCoach()
        }
    }

    public func setCoachLanguage(_ language: CoachLanguage) {
        coachLanguage = language
        UserDefaults.standard.set(language.rawValue, forKey: Self.coachLangKey)
    }

    /// Speaks a concise hands-free coaching cue in the selected language while smoothly ducking background music.
    public func speakCoachingPhrase(_ text: String, language: CoachLanguage? = nil) {
        guard !isMuted, !isPaused, !isInterrupted, isVoiceCoachEnabled, !text.isEmpty else { return }
        configureAudioSessionIfNeeded()
        speechCoach.speak(text: text, language: language ?? coachLanguage, volume: sfxVolume)
    }

    public func stopVoiceCoach() {
        speechCoach.stop()
    }

    public func setPaused(_ paused: Bool) {
        isPaused = paused
        if paused {
            stopScrub()
            stopVoiceCoach()
        }
        pushMixStateToKernel()
    }

    private var isVoiceDucking: Bool {
        duckLock.lock()
        defer { duckLock.unlock() }
        return isVoiceDuckingStorage
    }

    /// Lock-free / O(1) 120Hz query returning real-time 3-band `(bass, mid, high, beatPulse)` energy
    /// across both hardware-decoded Suno songs and procedural synth + live interactive SFX.
    public func sampleAudioReactiveBands() -> AudioReactiveBands {
        guard !isMuted, !isInterrupted else { return .zero }
        let synth = kernel?.readReactiveBands() ?? .zero
        let suno = sunoDeck.sampleReactiveBands()
        return AudioReactiveBands(
            bass: max(synth.bass, suno.bass),
            mid: max(synth.mid, suno.mid),
            high: max(synth.high, suno.high),
            beatPulse: max(synth.beatPulse, suno.beatPulse)
        )
    }

    private func persistPreferences() {
        let d = UserDefaults.standard
        d.set(isMuted, forKey: Self.mutedKey)
        d.set(musicVolume, forKey: Self.musicVolKey)
        d.set(sfxVolume, forKey: Self.sfxVolKey)
        onPreferencesChanged?(isMuted, musicVolume, sfxVolume)
    }

    private func currentTempoScale() -> Double {
        if activeTheme.id == .pulp && urgencyActive { return 1.10 }
        if currentMode == .brushAlong && pacerInFlossBonus { return 1.12 }
        return 1.0
    }

    private func currentStepDurationSec() -> Double {
        60.0 / (activeTheme.bpm * currentTempoScale()) / 4.0
    }

    private func pushMixStateToKernel() {
        let ducking = isVoiceDucking
        let duckScale: Float = ducking ? 0.36 : 1.0
        let hubRadioAtten: Float = (currentMode == .hub && earthRadioActive && !pulpZeroActive) ? 0.86 : 1.0
        let baseMusic = musicVolume <= 0.001 ? Float(0) : (musicVolume * 0.55 * activeTheme.mixGain * hubRadioAtten)
        let effectiveMusic = (isPaused ? (baseMusic * 0.42) : baseMusic) * duckScale
        let effectiveSfx = sfxVolume <= 0.001 ? Float(0) : (sfxVolume * 0.95)
        let cutoff: Float
        if isPaused {
            cutoff = 720.0
        } else if ducking {
            cutoff = 4800.0
        } else if acidTensionActive && activeTheme.id == .world3 {
            cutoff = 2400.0
        } else {
            cutoff = 16500.0
        }
        let dotted8th = Float(currentStepDurationSec() * 3.0)
        kernel?.setMixTargets(
            muted: isMuted,
            musicGain: effectiveMusic,
            sfxGain: effectiveSfx,
            musicCutoffHz: cutoff,
            delaySec: dotted8th
        )

        let sunoDuckScale: Float = ducking ? 0.38 : 1.0
        let baseSuno = musicVolume <= 0.001 ? Float(0) : min(1.0, musicVolume * 0.72 * hubRadioAtten)
        let effectiveSuno: Float
        if isPaused {
            effectiveSuno = baseSuno * 0.38
        } else if acidTensionActive && activeTheme.id == .world3 {
            effectiveSuno = baseSuno * 0.82 * sunoDuckScale
        } else {
            effectiveSuno = baseSuno * sunoDuckScale
        }
        sunoDeck.sync(
            themeId: activeTheme.id,
            targetVolume: effectiveSuno,
            muted: isMuted,
            interrupted: isInterrupted
        )
    }

    // MARK: Adaptive Music Director API

    public func setEarthRadio(enabled: Bool, tunedUnlockedWorldId: String? = nil) {
        isEarthRadioEnabled = enabled
        if let wid = tunedUnlockedWorldId {
            tunedRadioWorldId = wid
        }
        UserDefaults.standard.set(enabled, forKey: Self.earthRadioKey)
        sequencerQueue.async { [weak self] in
            guard let self else { return }
            self.earthRadioActive = enabled
            if let wid = tunedUnlockedWorldId {
                self.radioWorldId = wid
            }
            self.hubRadioStation = enabled ? .city(self.radioWorldId) : .sanctuary
            self.refreshActiveTheme()
        }
    }

    public func setHubRadioStation(_ station: RadioStation) {
        let isCity: Bool
        switch station {
        case let .city(wid):
            isCity = true
            tunedRadioWorldId = wid
        case .sanctuary, .planetOfEnamel, .livingClock:
            isCity = false
        }
        isEarthRadioEnabled = isCity
        UserDefaults.standard.set(isCity, forKey: Self.earthRadioKey)
        sequencerQueue.async { [weak self] in
            guard let self else { return }
            self.earthRadioActive = isCity
            if case let .city(wid) = station {
                self.radioWorldId = wid
            }
            self.hubRadioStation = station
            self.refreshActiveTheme()
        }
    }

    public func setBrushRadioStation(_ station: RadioStation) {
        sequencerQueue.async { [weak self] in
            guard let self else { return }
            self.brushRadioStation = station
            self.refreshActiveTheme()
        }
    }

    public func setAmbientMode(_ mode: AppMode) {
        sequencerQueue.async { [weak self] in
            guard let self else { return }
            let enteringBrush = (mode == .brushAlong && self.currentMode != .brushAlong)
            self.currentMode = mode
            if enteringBrush {
                self.brushRadioStation = .livingClock
            }
            if mode != .brushAlong {
                self.pacerQuadrant = 0
                self.pacerInFlossBonus = false
            }
            if mode != .arcade && mode != .pulpRescue {
                self.urgencyActive = false
                self.acidTensionActive = false
            }
            if mode != .cosmicIntro {
                self.cosmicBeatIndex = 0
            }
            self.refreshActiveTheme()
        }
    }

    public func setWorldContext(_ worldId: String) {
        sequencerQueue.async { [weak self] in
            guard let self else { return }
            self.currentWorldId = worldId
            self.refreshActiveTheme()
        }
    }

    public func setHubFocus(isGlobe: Bool) {
        sequencerQueue.async { [weak self] in
            guard let self else { return }
            self.hubGlobeActive = isGlobe
            self.refreshActiveTheme()
        }
    }

    public func setPulpReadiness(pulpIntegrity: Double) {
        let zero = pulpIntegrity <= 0.0
        sequencerQueue.async { [weak self] in
            guard let self, self.pulpZeroActive != zero else { return }
            self.pulpZeroActive = zero
            self.refreshActiveTheme()
        }
    }

    public func setCosmicBeat(_ beatIndex: Int) {
        sequencerQueue.async { [weak self] in
            self?.cosmicBeatIndex = beatIndex
        }
    }

    public func setPacerState(quadrantIdx: Int, inFlossBonus: Bool) {
        sequencerQueue.async { [weak self] in
            guard let self else { return }
            self.pacerQuadrant = min(3, max(0, quadrantIdx))
            self.pacerInFlossBonus = inFlossBonus
            self.pushMixStateToKernel()
        }
    }

    public func setUrgency(_ active: Bool) {
        sequencerQueue.async { [weak self] in
            guard let self, self.urgencyActive != active else { return }
            self.urgencyActive = active
            self.pushMixStateToKernel()
        }
    }

    public func setAcidTension(_ active: Bool) {
        sequencerQueue.async { [weak self] in
            guard let self, self.acidTensionActive != active else { return }
            self.acidTensionActive = active
            self.pushMixStateToKernel()
        }
    }

    private func themeForWorld(_ worldId: String) -> MusicThemeId {
        let w = worldId.lowercased()
        if w.contains("2") || w.contains("orleans") || w.contains("nola") || w.contains("lagos_2") { return .world2 }
        if w.contains("3") || w.contains("tokyo") || w.contains("chicago") { return .world3 }
        if w.contains("4") || w.contains("accra") || w.contains("lagos") { return .world4 }
        if w.contains("5") || w.contains("aurora") || w.contains("orbit") || w.contains("reykjavik") { return .world5 }
        return .world1
    }

    private func themeForStation(_ station: RadioStation) -> MusicThemeId {
        switch station {
        case .sanctuary:
            return .hub
        case .planetOfEnamel:
            return .cosmic
        case .livingClock:
            return .brushAlong
        case let .city(wid):
            return themeForWorld(wid)
        }
    }

    private func resolveThemeId() -> MusicThemeId {
        switch currentMode {
        case .cosmicIntro:
            return .cosmic
        case .brushAlong:
            return themeForStation(brushRadioStation)
        case .report:
            return .report
        case .pulpRescue:
            return .pulp
        case .arcade:
            return themeForWorld(currentWorldId)
        case .hub:
            if pulpZeroActive { return .hubReady }
            if hubRadioStation == .sanctuary {
                return hubGlobeActive ? .hubGlobe : .hub
            }
            return themeForStation(hubRadioStation)
        }
    }

    private func refreshActiveTheme() {
        let nextId = resolveThemeId()
        guard nextId != activeTheme.id, let nextTheme = MusicCatalog.themes[nextId] else {
            pushMixStateToKernel()
            return
        }
        activeTheme = nextTheme
        globalStep = 0
        currentChord = MusicCatalog.chordAtBar(nextTheme, bar: 0)
        nextStepHostTimeSec = ProcessInfo.processInfo.systemUptime + 0.06
        pushMixStateToKernel()
    }

    // MARK: Lookahead Sequencer (45ms Tick, Sample-Accurate Voice Offsets)

    private func startSequencerTimer() {
        nextStepHostTimeSec = ProcessInfo.processInfo.systemUptime + 0.08
        let timer = DispatchSource.makeTimerSource(queue: sequencerQueue)
        timer.schedule(deadline: .now() + .milliseconds(45), repeating: .milliseconds(45), leeway: .milliseconds(5))
        timer.setEventHandler { [weak self] in
            self?.tickSequencer()
        }
        timer.resume()
        self.sequencerTimer = timer
    }

    private func tickSequencer() {
        guard !isMuted, !isInterrupted, musicVolume > 0.001, engine.isRunning, let kernel else { return }

        let now = ProcessInfo.processInfo.systemUptime
        if nextStepHostTimeSec < now - 0.25 {
            nextStepHostTimeSec = now + 0.05
        }

        let lookaheadSec = 0.14
        var guardSteps = 0
        while nextStepHostTimeSec < now + lookaheadSec && guardSteps < 16 {
            let offsetFromNow = max(0.0, nextStepHostTimeSec - now)
            scheduleMusicalStep(gs: globalStep, baseOffsetSec: offsetFromNow, kernel: kernel)
            nextStepHostTimeSec += currentStepDurationSec()
            globalStep += 1
            guardSteps += 1
        }
    }

    private func scheduleMusicalStep(gs: Int, baseOffsetSec: Double, kernel: RealtimeSynthKernel) {
        let theme = activeTheme
        let bar = Int(floor(Double(gs) / 16.0))

        let chord: ChordDef
        let nextChord: ChordDef
        if theme.id == .cosmic {
            let bIdx = MusicCatalog.cosmicBeatBars[((cosmicBeatIndex % 4) + 4) % 4]
            chord = MusicCatalog.chordAtBar(theme, bar: bIdx)
            nextChord = chord
        } else {
            chord = MusicCatalog.chordAtBar(theme, bar: bar)
            nextChord = MusicCatalog.chordAtBar(theme, bar: bar + 1)
        }
        self.currentChord = chord

        // When a hardware-decoded Suno track is active for this theme, skip procedural synth notes
        // (`~0%` synth CPU) while keeping `currentChord` updated above for in-key glass-harp & chime SFX.
        if sunoDeck.isPlayingRecordedTrack {
            return
        }

        let step = ((gs % 16) + 16) % 16
        let barInLoop = ((bar % 16) + 16) % 16
        let section = barInLoop < 8 ? 0 : 1
        let phraseBar = barInLoop % 4

        let tr = (currentMode == .brushAlong) ? MusicCatalog.pacerTranspose[pacerQuadrant] : 0
        let intensity: Float = (acidTensionActive && theme.id == .world3) ? 0.85 : 1.0
        let stepSec = currentStepDurationSec()
        let swingSec = (step % 2 == 1) ? (theme.swing * stepSec) : 0.0
        let stepStartSec = baseOffsetSec + swingSec
        let sr = Double(kernel.sampleRate)
        let pcs = MusicCatalog.chordPitchClasses(theme: theme, chord: chord, transpose: tr)

        func pushMusicNote(voice: SynthVoiceKind, midi: Int, vel: Float, durSteps: Double, pan: Float, send: Float, humanSec: Double = 0) {
            let delaySamples = Int32(max(0.0, (stepStartSec + humanSec) * sr))
            let cmd = SynthCommand(
                voice: voice.rawValue,
                freq0: MusicCatalog.midiToFreq(midi),
                freq1: MusicCatalog.midiToFreq(midi),
                durationSec: Float(durSteps * stepSec),
                velocity: min(1.2, max(0.05, vel)),
                pan: pan,
                reverbSend: send,
                delaySend: (voice == .celesta || voice == .bell || voice == .kalimba) ? 0.16 : 0.05,
                filterQ: 1.0,
                isMusicBus: 1,
                delaySamples: delaySamples
            )
            kernel.enqueue(cmd)
        }

        // 1. Pad swell on bar downbeat
        if theme.pad && step == 0 {
            let tones = Array(MusicCatalog.chordMidis(theme: theme, chord: chord, transpose: tr, baseOct: 12).prefix(4))
            for (i, m) in tones.enumerated() {
                pushMusicNote(voice: .pad, midi: m, vel: 0.35 * intensity, durSteps: 16, pan: (Float(i) - 1.5) * 0.35, send: 0.60)
            }
        }

        // 2. Chord comping stabs
        if let compVoice = theme.comp, theme.compSteps.contains(step) {
            let tones = Array(MusicCatalog.chordMidis(theme: theme, chord: chord, transpose: tr, baseOct: 12).prefix(4))
            let strong = (step == 0 || step == 8)
            for (i, m) in tones.enumerated() {
                let v = (strong ? Float(0.50) : Float(0.36)) * intensity * (0.90 + 0.10 * Float((i + step) % 3))
                pushMusicNote(voice: compVoice, midi: m, vel: v, durSteps: strong ? 4 : 2, pan: -0.25 + Float(i) * 0.15, send: 0.35)
            }
        }

        // 3. Sparkling arpeggio
        let arpAllowed = (theme.id != .brushAlong) || pacerInFlossBonus || pacerQuadrant >= 2
        if arpAllowed, let arpVoice = theme.arp, theme.arpEvery > 0, step % theme.arpEvery == 0 {
            let tones = MusicCatalog.chordMidis(theme: theme, chord: chord, transpose: tr, baseOct: 24)
            if !tones.isEmpty {
                let idx = ((step / theme.arpEvery) + bar) % tones.count
                let pan = sin(Float(gs + Int(theme.seed)) * 0.7) * 0.6
                pushMusicNote(voice: arpVoice, midi: tones[idx], vel: 0.30 * intensity, durSteps: 3, pan: pan, send: 0.70)
            }
        }

        // 4. Deterministic 4-bar phrase lead melody
        if let leadVoice = theme.lead, let rhythmIdx = theme.leadRhythm.firstIndex(of: step) {
            let motifBar = (phraseBar == 2) ? 0 : ((phraseBar == 3) ? 1 : phraseBar)
            let seedA = theme.seed &* 977 &+ UInt32(section * 131 + motifBar * 17 + step * 3)
            var rand = MulberryRNG(seed: seedA)
            let gate = rand.nextFloat()
            let density: Float = pacerInFlossBonus ? 1.0 : 0.78
            if gate < density {
                var walkRand = MulberryRNG(seed: theme.seed &* 31 &+ UInt32(section * 7 + motifBar * 101))
                var deg = (section == 0) ? 2 : 4
                for _ in 0...rhythmIdx {
                    let stepDeg = Int(floor(walkRand.nextFloat() * 5.0)) - 2
                    deg = min(theme.scale.count + 3, max(-2, deg + stepDeg))
                }
                let base = theme.keyRoot + tr + 24
                var midi = MusicCatalog.scaleMidi(scale: theme.scale, base: base, degree: deg)
                let strong = (step % 4 == 0)
                if strong { midi = MusicCatalog.snapToChord(midi, pcs: pcs) }
                if phraseBar == 3 && rhythmIdx == theme.leadRhythm.count - 1 {
                    midi = theme.keyRoot + tr + chord.root + 24
                }
                while midi > theme.keyRoot + tr + 40 { midi -= 12 }
                let v = (strong ? Float(0.62) : Float(0.50)) * intensity * (0.92 + rand.nextFloat() * 0.16)
                let pan = 0.25 + (rand.nextFloat() - 0.5) * 0.30
                let human = Double(rand.nextFloat() - 0.5) * 0.010
                pushMusicNote(voice: leadVoice, midi: midi, vel: v, durSteps: strong ? 3 : 2, pan: pan, send: 0.40, humanSec: human)
            }
        }

        // 5. Bass line
        if step < theme.bassPattern.count {
            let ch = theme.bassPattern[step]
            if ch != "." {
                let rootMidi = theme.keyRoot + tr + chord.root
                var low = rootMidi
                while low > theme.keyRoot + tr + 7 { low -= 12 }
                while low < theme.keyRoot + tr - 8 { low += 12 }
                var m = low
                if ch == "5" {
                    m = low + 7
                } else if ch == "3" {
                    m = low + (chord.tones.count > 1 ? chord.tones[1] : 4)
                } else if ch == "o" {
                    m = low + 12
                } else if ch == "a" {
                    let nextRoot = theme.keyRoot + tr + nextChord.root
                    var n = nextRoot
                    while n > low + 7 { n -= 12 }
                    while n < low - 5 { n += 12 }
                    m = n + (n >= low ? -1 : 1)
                }
                pushMusicNote(voice: .bass, midi: m, vel: (step == 0 ? 0.70 : 0.55) * intensity, durSteps: 2, pan: 0, send: 0.05)
            }
        }

        // 6. Soft brushed percussion
        let drumDelay = Int32(max(0.0, stepStartSec * sr))
        func pushDrum(_ kind: SynthVoiceKind, vel: Float, pan: Float = 0, send: Float = 0.05) {
            kernel.enqueue(
                SynthCommand(
                    voice: kind.rawValue,
                    freq0: 440, freq1: 440,
                    durationSec: 0.12,
                    velocity: vel * intensity,
                    pan: pan,
                    reverbSend: send,
                    delaySend: 0,
                    filterQ: 1.0,
                    isMusicBus: 1,
                    delaySamples: drumDelay
                )
            )
        }

        if step < theme.shakerPattern.count, theme.shakerPattern[step] != "." {
            pushDrum(.shaker, vel: theme.shakerPattern[step] == "X" ? 0.80 : 0.50, pan: 0.15)
        }
        if step < theme.rimPattern.count, theme.rimPattern[step] != "." {
            pushDrum(.rim, vel: 0.50, pan: -0.15, send: 0.12)
        }
        if step < theme.kickPattern.count, theme.kickPattern[step] != "." {
            pushDrum(.kick, vel: 0.65, pan: 0.0, send: 0.0)
        }
        var hatPlayed = false
        if step < theme.hatPattern.count, theme.hatPattern[step] != "." {
            pushDrum(.hat, vel: 0.35, pan: 0.22, send: 0.03)
            hatPlayed = true
        }
        if urgencyActive && theme.id == .pulp && step % 2 == 0 && !hatPlayed {
            pushDrum(.hat, vel: 0.32, pan: 0.22, send: 0.03)
        }
    }

    // MARK: Harmonic SFX Helpers

    private func canPlaySfx() -> Bool {
        guard !isMuted, !isInterrupted, sfxVolume > 0.001 else { return false }
        startEngineIfNeeded()
        return kernel != nil
    }

    private func throttle(_ key: String, minGapSec: Double) -> Bool {
        let now = ProcessInfo.processInfo.systemUptime
        throttleLock.lock()
        defer { throttleLock.unlock() }
        if let last = throttles[key], now - last < minGapSec {
            return false
        }
        throttles[key] = now
        return true
    }

    private func harmonicMidi(degree: Int, octaveShift: Int = 36) -> Int {
        MusicCatalog.harmonicSfxMidi(theme: activeTheme, chord: currentChord, degree: degree, octaveShift: octaveShift)
    }

    private func emitSfxVoice(
        _ kind: SynthVoiceKind,
        midi: Int,
        offsetSec: Double = 0,
        durationSec: Float = 0.28,
        vel: Float = 0.70,
        pan: Float = 0.0,
        reverb: Float = 0.50,
        delay: Float = 0.12
    ) {
        guard let kernel else { return }
        let hz = MusicCatalog.midiToFreq(midi)
        kernel.enqueue(
            SynthCommand(
                voice: kind.rawValue,
                freq0: hz,
                freq1: hz,
                durationSec: durationSec,
                velocity: vel,
                pan: pan,
                reverbSend: reverb,
                delaySend: delay,
                filterQ: 1.0,
                isMusicBus: 0,
                delaySamples: Int32(max(0.0, offsetSec * Double(kernel.sampleRate)))
            )
        )
    }

    private func emitBlip(
        f0: Float,
        f1: Float,
        offsetSec: Double = 0,
        durSec: Float = 0.14,
        peak: Float = 0.16,
        pan: Float = 0
    ) {
        guard let kernel else { return }
        kernel.enqueue(
            SynthCommand(
                voice: SynthVoiceKind.sfxBlip.rawValue,
                freq0: f0,
                freq1: f1,
                durationSec: durSec,
                velocity: peak,
                pan: pan,
                reverbSend: 0.15,
                delaySend: 0.0,
                filterQ: 1.0,
                isMusicBus: 0,
                delaySamples: Int32(max(0.0, offsetSec * Double(kernel.sampleRate)))
            )
        )
    }

    private func emitNoiseSweep(
        f0: Float,
        f1: Float,
        offsetSec: Double = 0,
        durSec: Float = 0.28,
        peak: Float = 0.08,
        q: Float = 1.2
    ) {
        guard let kernel else { return }
        kernel.enqueue(
            SynthCommand(
                voice: SynthVoiceKind.sfxNoiseSweep.rawValue,
                freq0: f0,
                freq1: f1,
                durationSec: durSec,
                velocity: peak,
                pan: 0,
                reverbSend: 0.22,
                delaySend: 0.0,
                filterQ: q,
                isMusicBus: 0,
                delaySamples: Int32(max(0.0, offsetSec * Double(kernel.sampleRate)))
            )
        )
    }

    // MARK: - Continuous Nuanced ASMR Brushing & Singing-Enamel Polish

    public func updateScrub(_ state: ScrubAudioState) {
        let live = state.active && !isMuted && !isPaused && !isInterrupted && sfxVolume > 0.001
        if live { startEngineIfNeeded() }

        let speed01 = Float(min(1.0, max(0.0, state.probeSpeed / 7.0)))
        let clean01 = Float(min(1.0, max(0.0, state.cleanRatio)))

        if live && state.newlyCleaned > 0 {
            let fresh = min(1.0, Float(state.newlyCleaned) / 6.0)
            scrubPlaqueHold = max(scrubPlaqueHold * 0.88, fresh)
            scrubSparkleCellsAccum += state.newlyCleaned
        } else {
            scrubPlaqueHold *= 0.88
            if !live { scrubSparkleCellsAccum = 0 }
        }

        // Tune the subtle crystal-enamel polish overtone to the active song's harmonic fifth
        let singMidi = harmonicMidi(degree: 4, octaveShift: 48)
        let singHz = MusicCatalog.midiToFreq(singMidi)

        kernel?.setScrubTargets(
            active: live,
            speed01: speed01,
            clean01: clean01,
            plaqueBite01: scrubPlaqueHold,
            harmonicHz: singHz,
            profile: state.brushProfile
        )

        guard live else { return }

        // Delicate water-droplet micro-pearls only when moving briskly into soft plaque
        if speed01 > 0.14 && scrubPlaqueHold > 0.16 {
            let popProb = Double(0.9 + speed01 * 3.8 * scrubPlaqueHold) / 60.0
            if Double.random(in: 0..<1) < popProb, throttle("scrub-bubble", minGapSec: 0.095) {
                let f = Float.random(in: 390...860)
                emitBlip(f0: f, f1: f * 1.42, durSec: 0.042, peak: Float.random(in: 0.007...0.016))
            }
        }

        // Gentle ascending kalimba / glass-harp grace note only as meaningful patches of plaque dissolve
        if scrubSparkleCellsAccum >= 7, throttle("scrub-chime", minGapSec: 0.42) {
            scrubSparkleCellsAccum = 0
            let scaleSteps = [0, 2, 4, 5, 7, 9, 7, 4]
            let deg = scaleSteps[scrubMelodyStep % scaleSteps.count]
            scrubMelodyStep += 1
            let voice: SynthVoiceKind = (clean01 > 0.65) ? .glassHarp : .kalimba
            let vel = Float.random(in: 0.13...0.19)
            let pan = sin(Float(scrubMelodyStep) * 0.85) * 0.28
            emitSfxVoice(
                voice,
                midi: harmonicMidi(degree: deg, octaveShift: 60),
                durationSec: 0.34,
                vel: vel,
                pan: pan,
                reverb: 0.62
            )
        }
    }

    public func updateScrub(
        active: Bool,
        probeSpeed: Double,
        newlyCleaned: Int,
        cleanRatio: Double,
        brushUpgradeId: String? = nil
    ) {
        updateScrub(
            ScrubAudioState(
                active: active,
                probeSpeed: probeSpeed,
                newlyCleaned: newlyCleaned,
                cleanRatio: cleanRatio,
                brushProfile: BrushSonicProfile(upgradeId: brushUpgradeId)
            )
        )
    }

    public func stopScrub() {
        scrubPlaqueHold = 0
        scrubSparkleCellsAccum = 0
        kernel?.setScrubTargets(
            active: false,
            speed01: 0,
            clean01: 0,
            plaqueBite01: 0,
            harmonicHz: 523.25,
            profile: .standard
        )
    }

    // MARK: - Complete Procedural Gameplay & UI SFX Suite

    public func playUiTap() {
        guard canPlaySfx() else { return }
        emitSfxVoice(.bell, midi: harmonicMidi(degree: 2, octaveShift: 48), vel: 0.48, reverb: 0.30)
    }

    /// Capillary Tether-Zip high-velocity magnetic whoosh + harmonic snap.
    public func playTetherZip() {
        playFlossSnap(targetsHit: 1, zipped: true, ribbon: true)
    }

    /// Polymer Floss silk twang (+ optional Capillary Tether-Zip whoosh-snap).
    public func playFlossSnap(targetsHit: Int = 1, zipped: Bool = false, ribbon: Bool = false) {
        guard canPlaySfx() else { return }
        let m = harmonicMidi(degree: targetsHit > 0 ? 3 : 1, octaveShift: 48)
        emitSfxVoice(.pluck, midi: m, vel: 0.72, reverb: 0.24)
        emitSfxVoice(.marimba, midi: m + 7, offsetSec: 0.035, vel: 0.48, reverb: 0.22)
        if ribbon {
            emitNoiseSweep(f0: 2400, f1: 1000, durSec: 0.16, peak: 0.07, q: 1.5)
        }
        if zipped {
            emitNoiseSweep(f0: 1650, f1: 6800, durSec: 0.26, peak: 0.09, q: 1.4)
            emitSfxVoice(.bell, midi: harmonicMidi(degree: 6, octaveShift: 48), offsetSec: 0.095, vel: 0.58, reverb: 0.55)
        }
    }

    /// Fluoride-Bicarb Surge crystalline cascade (+ effervescent buffered echo).
    public func playFluorideSurge(buffered: Bool = false) {
        guard canPlaySfx() else { return }
        for i in 0..<7 {
            emitSfxVoice(
                .bell,
                midi: harmonicMidi(degree: i, octaveShift: 48),
                offsetSec: Double(i) * 0.055,
                vel: 0.56,
                pan: Float(i - 3) * 0.12,
                reverb: 0.65
            )
        }
        emitNoiseSweep(f0: 1200, f1: 5200, durSec: 0.55, peak: 0.08, q: 0.85)
        if buffered {
            emitNoiseSweep(f0: 2800, f1: 720, offsetSec: 0.14, durSec: 0.40, peak: 0.09, q: 1.2)
        }
    }

    public func playIonRinseWave(buffered: Bool = false) {
        playFluorideSurge(buffered: buffered)
    }

    /// Disclosing Bio-Scan vivid sonar ping.
    public func playDisclosingScan() {
        guard canPlaySfx() else { return }
        emitSfxVoice(.bell, midi: harmonicMidi(degree: 2, octaveShift: 60), vel: 0.62, reverb: 0.65)
        emitSfxVoice(.bell, midi: harmonicMidi(degree: 4, octaveShift: 60), offsetSec: 0.10, vel: 0.52, reverb: 0.68)
    }

    public func playDisclosePulse() {
        playDisclosingScan()
    }

    /// Commensal S. sanguinis Site restored rising triad.
    public func playSiteRestored() {
        guard canPlaySfx() else { return }
        for (i, d) in [0, 2, 4].enumerated() {
            emitSfxVoice(
                .bell,
                midi: harmonicMidi(degree: d, octaveShift: 60),
                offsetSec: Double(i) * 0.06,
                vel: 0.65,
                pan: Float(i - 1) * 0.22,
                reverb: 0.60
            )
        }
    }

    /// District 24k Gold Seal warm Rhodes brass/bell fanfare!
    public func playDistrictSealed() {
        guard canPlaySfx() else { return }
        for (i, d) in [0, 1, 2, 3, 4].enumerated() {
            emitSfxVoice(
                .bell,
                midi: harmonicMidi(degree: d, octaveShift: 60),
                offsetSec: Double(i) * 0.07,
                vel: 0.62,
                pan: Float(i - 2) * 0.16,
                reverb: 0.70
            )
        }
        let chordTones = Array(MusicCatalog.chordMidis(theme: activeTheme, chord: currentChord, baseOct: 12).prefix(3))
        for m in chordTones {
            emitSfxVoice(.rhodes, midi: m, offsetSec: 0.20, durationSec: 0.90, vel: 0.58, reverb: 0.52)
        }
    }

    /// Sucrose Crystal high-glass harmonic shatter.
    public func playSucroseShatter() {
        guard canPlaySfx() else { return }
        for (i, d) in [7, 9, 6, 11].enumerated() {
            emitSfxVoice(
                .bell,
                midi: harmonicMidi(degree: d, octaveShift: 60),
                offsetSec: Double(i) * 0.028,
                vel: 0.48,
                pan: (Float(i) - 1.5) * 0.28,
                reverb: 0.60
            )
        }
        emitNoiseSweep(f0: 7000, f1: 3500, durSec: 0.13, peak: 0.06, q: 0.75)
    }

    public func playCrystalShatter() {
        playSucroseShatter()
    }

    /// S. mutans pop & playful jelly bump boing.
    public func playMutansPop() {
        guard throttle("mutans-pop", minGapSec: 0.055), canPlaySfx() else { return }
        let startHz = Float.random(in: 700...1000)
        emitBlip(f0: startHz, f1: 1620, durSec: 0.065, peak: 0.14)
    }

    public func playMutansBoing() {
        guard throttle("mutans-boing", minGapSec: 0.28), canPlaySfx(), let kernel else { return }
        kernel.enqueue(
            SynthCommand(
                voice: SynthVoiceKind.sfxBoing.rawValue,
                freq0: 260, freq1: 260,
                durationSec: 0.30,
                velocity: 0.16,
                pan: 0,
                reverbSend: 0.18,
                delaySend: 0,
                filterQ: 1.0,
                isMusicBus: 0,
                delaySamples: 0
            )
        )
    }

    /// Saliva Spring bubbly aqua harp glissando.
    public func playSalivaSpring() {
        guard canPlaySfx() else { return }
        for i in 0..<8 {
            emitSfxVoice(
                .bell,
                midi: harmonicMidi(degree: i, octaveShift: 48),
                offsetSec: Double(i) * 0.045,
                vel: 0.46,
                pan: Float(i - 4) * 0.10,
                reverb: 0.70
            )
        }
        for i in 0..<4 {
            let base = Float(700 + i * 180)
            emitBlip(f0: base, f1: base + 620, offsetSec: Double(i) * 0.07, durSec: 0.05, peak: 0.045)
        }
    }

    /// EPS Quorum Dome crack & rubbery deflection.
    public func playEpsCrack() {
        guard canPlaySfx() else { return }
        for (i, d) in [5, 7, 9].enumerated() {
            emitSfxVoice(.bell, midi: harmonicMidi(degree: d, octaveShift: 60), offsetSec: Double(i) * 0.03, vel: 0.52, pan: Float(i - 1) * 0.30)
        }
        emitBlip(f0: 210, f1: 90, durSec: 0.14, peak: 0.13)
    }

    public func playEpsDeflect() {
        guard throttle("eps-deflect", minGapSec: 0.48), canPlaySfx(), let kernel else { return }
        kernel.enqueue(
            SynthCommand(
                voice: SynthVoiceKind.sfxBoing.rawValue,
                freq0: 210, freq1: 210,
                durationSec: 0.32,
                velocity: 0.18,
                pan: 0,
                reverbSend: 0.16,
                delaySend: 0,
                filterQ: 1.0,
                isMusicBus: 0,
                delaySamples: 0
            )
        )
    }

    /// Gentle non-punitive Acid / Gum warnings.
    public func playAcidWarning() {
        guard throttle("acid-warn", minGapSec: 0.68), canPlaySfx() else { return }
        emitNoiseSweep(f0: 5200, f1: 8200, durSec: 0.14, peak: 0.055, q: 1.0)
        let m = harmonicMidi(degree: 0, octaveShift: 36)
        emitSfxVoice(.marimba, midi: m, vel: 0.46, pan: -0.1, reverb: 0.12)
        emitSfxVoice(.marimba, midi: m, offsetSec: 0.09, vel: 0.38, pan: 0.1, reverb: 0.12)
    }

    public func playGumWarning() {
        guard throttle("gum-warn", minGapSec: 0.68), canPlaySfx() else { return }
        emitBlip(f0: 132, f1: 82, durSec: 0.26, peak: 0.18)
        emitBlip(f0: 196, f1: 110, offsetSec: 0.015, durSec: 0.20, peak: 0.06)
    }

    public func playAcidSip() {
        guard canPlaySfx() else { return }
        emitNoiseSweep(f0: 3000, f1: 7500, durSec: 0.30, peak: 0.07, q: 0.9)
        emitSfxVoice(.marimba, midi: harmonicMidi(degree: 4, octaveShift: 48), vel: 0.58)
        emitSfxVoice(.marimba, midi: harmonicMidi(degree: 1, octaveShift: 48), offsetSec: 0.11, vel: 0.52)
    }

    public func playErosionWash() {
        guard canPlaySfx() else { return }
        emitNoiseSweep(f0: 900, f1: 2600, durSec: 0.35, peak: 0.065, q: 0.75)
        emitSfxVoice(.marimba, midi: harmonicMidi(degree: 3, octaveShift: 48), vel: 0.50)
        emitSfxVoice(.marimba, midi: harmonicMidi(degree: 1, octaveShift: 48), offsetSec: 0.10, vel: 0.45)
    }

    public func playFluorapatiteInfuse() {
        guard canPlaySfx() else { return }
        for (i, d) in [2, 4, 5, 7].enumerated() {
            emitSfxVoice(.bell, midi: harmonicMidi(degree: d, octaveShift: 60), offsetSec: Double(i) * 0.045, vel: 0.52, pan: (Float(i) - 1.5) * 0.20, reverb: 0.70)
        }
    }

    /// Spot Quiz correct / incorrect chimes.
    public func playSpotQuiz(correct: Bool) {
        if correct {
            playSpotQuizCorrect()
        } else {
            playSpotQuizIncorrect()
        }
    }

    public func playSpotQuizCorrect() {
        guard canPlaySfx() else { return }
        for (i, d) in [0, 2, 4, 6].enumerated() {
            emitSfxVoice(
                .glassHarp,
                midi: harmonicMidi(degree: d, octaveShift: 60),
                offsetSec: Double(i) * 0.055,
                vel: 0.65,
                pan: (Float(i) - 1.5) * 0.18,
                reverb: 0.68
            )
        }
    }

    public func playSpotQuizIncorrect() {
        guard canPlaySfx() else { return }
        let m = harmonicMidi(degree: 2, octaveShift: 48)
        emitSfxVoice(.marimba, midi: m, vel: 0.52, pan: -0.10, reverb: 0.25)
        emitSfxVoice(.marimba, midi: m - 2, offsetSec: 0.11, vel: 0.44, pan: 0.10, reverb: 0.28)
    }

    // MARK: - 14-Crown Companion Rubbing, Sink Pacer & Cosmic Cues

    /// Plays sparkling Glass-Harp harmonic note when smooth (>= 65%) or squishy thud when plaque-fuzzy!
    public func playCrownRub(crownIndex: Int, smoothnessIndex: Double) {
        if smoothnessIndex >= 65.0 {
            playGlassHarpNote(step: crownIndex)
        } else {
            playSquishThud()
        }
    }

    public func playGlassHarpNote(step: Int) {
        guard throttle("glass-harp-\(step)", minGapSec: 0.085), canPlaySfx() else { return }
        let deg = min(13, max(0, step))
        let pan = (Float(deg) / 13.0 - 0.5) * 0.60
        emitSfxVoice(.glassHarp, midi: harmonicMidi(degree: deg, octaveShift: 60), durationSec: 0.42, vel: 0.38, pan: pan, reverb: 0.72)
    }

    public func playSquishThud() {
        guard throttle("squish-thud", minGapSec: 0.11), canPlaySfx() else { return }
        emitBlip(f0: 142, f1: 72, durSec: 0.13, peak: 0.085)
    }

    public func playTreatSnack() {
        guard canPlaySfx() else { return }
        emitSfxVoice(.marimba, midi: harmonicMidi(degree: 3, octaveShift: 48), vel: 0.68, pan: -0.20)
        emitSfxVoice(.marimba, midi: harmonicMidi(degree: 5, octaveShift: 48), offsetSec: 0.09, vel: 0.64, pan: 0.10)
        emitSfxVoice(.kalimba, midi: harmonicMidi(degree: 2, octaveShift: 60), offsetSec: 0.18, vel: 0.60, pan: 0.25)
        emitNoiseSweep(f0: 4200, f1: 7200, durSec: 0.22, peak: 0.055, q: 0.85)
    }

    public func playSugarSplat() {
        guard canPlaySfx() else { return }
        emitBlip(f0: 380, f1: 160, durSec: 0.12, peak: 0.15)
        emitBlip(f0: 240, f1: 110, offsetSec: 0.06, durSec: 0.14, peak: 0.11)
        emitNoiseSweep(f0: 2000, f1: 900, durSec: 0.11, peak: 0.05, q: 0.9)
    }

    public func playSmoothBaskSparkle() {
        guard canPlaySfx() else { return }
        for (i, d) in [3, 4, 5, 7].enumerated() {
            emitSfxVoice(.glassHarp, midi: harmonicMidi(degree: d, octaveShift: 60), offsetSec: Double(i) * 0.065, vel: 0.54, pan: (Float(i) - 1.5) * 0.20, reverb: 0.72)
        }
    }

    /// 2-Minute Sink Brush-Along Pacer cues: 10s surface soft-tick, 30s quadrant chime, 2:00 fanfare!
    public func playPacerCue(_ kind: PacerAudioCueKind) {
        guard canPlaySfx() else { return }
        switch kind {
        case .surface:
            emitSfxVoice(.marimba, midi: harmonicMidi(degree: 3, octaveShift: 48), vel: 0.68, reverb: 0.22)
        case .quadrant:
            emitSfxVoice(.marimba, midi: harmonicMidi(degree: 2, octaveShift: 48), vel: 0.72, reverb: 0.30)
            emitSfxVoice(.bell, midi: harmonicMidi(degree: 5, octaveShift: 60), offsetSec: 0.08, vel: 0.65, reverb: 0.62)
        case .complete:
            playDistrictSealed()
        }
    }

    /// 4D Eyes-Optional Surface Earcons:
    /// - Upper Jaw plays in a sparkling higher octave (`60`), Lower Jaw in a warm grounded register (`48`).
    /// - Subtle mirror stereo panning (`+0.24` Right, `-0.24` Left).
    /// - Distinct timbre per surface: **Outer** = Flowing Glass-Harp Crescent, **Chewing** = Wooden Marimba Double-Tap, **Inner** = Rising Crystal Bell Portal.
    public func playPacerSurfaceMotif(quadrant: BrushQuadrant, surface: BrushSurface, isNewQuadrant: Bool) {
        guard canPlaySfx() else { return }
        let oct = quadrant.isUpper ? 60 : 48
        let pan: Float = quadrant.isPatientRight ? 0.24 : -0.24

        if isNewQuadrant {
            emitSfxVoice(.rhodes, midi: harmonicMidi(degree: 0, octaveShift: oct - 12), durationSec: 0.48, vel: 0.54, pan: pan * 0.5, reverb: 0.44)
            emitSfxVoice(.bell, midi: harmonicMidi(degree: 4, octaveShift: oct), offsetSec: 0.055, durationSec: 0.42, vel: 0.56, pan: pan, reverb: 0.60)
        }

        let baseOffset = isNewQuadrant ? 0.13 : 0.0
        switch surface {
        case .outerCheek:
            emitSfxVoice(.glassHarp, midi: harmonicMidi(degree: 0, octaveShift: oct), offsetSec: baseOffset, durationSec: 0.46, vel: 0.58, pan: pan, reverb: 0.68)
            emitSfxVoice(.glassHarp, midi: harmonicMidi(degree: 4, octaveShift: oct), offsetSec: baseOffset + 0.075, durationSec: 0.50, vel: 0.52, pan: pan * 0.7, reverb: 0.72)
        case .chewingGrooves:
            emitSfxVoice(.marimba, midi: harmonicMidi(degree: 2, octaveShift: oct - 12), offsetSec: baseOffset, durationSec: 0.24, vel: 0.68, pan: pan, reverb: 0.24)
            emitSfxVoice(.marimba, midi: harmonicMidi(degree: 4, octaveShift: oct - 12), offsetSec: baseOffset + 0.085, durationSec: 0.26, vel: 0.64, pan: pan, reverb: 0.26)
        case .innerTongue:
            emitSfxVoice(.bell, midi: harmonicMidi(degree: 1, octaveShift: oct), offsetSec: baseOffset, durationSec: 0.36, vel: 0.56, pan: pan * 0.6, reverb: 0.64)
            emitSfxVoice(.bell, midi: harmonicMidi(degree: 5, octaveShift: oct), offsetSec: baseOffset + 0.095, durationSec: 0.46, vel: 0.64, pan: pan, reverb: 0.70)
        }
    }

    /// Final 3-second musical anticipation pickup (`3... 2... 1...`) before each surface or arch transition,
    /// letting the user prepare to move while watching their reflection in the bathroom mirror.
    public func playPacerAnticipationPip(secondsLeft: Int, isUpper: Bool) {
        guard (1...3).contains(secondsLeft), canPlaySfx() else { return }
        let deg = (3 - secondsLeft) * 2 // 3s -> 0, 2s -> 2, 1s -> 4 (rising triad!)
        let oct = isUpper ? 60 : 48
        let voice: SynthVoiceKind = (secondsLeft == 1) ? .celesta : .kalimba
        let vel: Float = (secondsLeft == 1) ? 0.42 : 0.32
        emitSfxVoice(
            voice,
            midi: harmonicMidi(degree: deg, octaveShift: oct),
            durationSec: 0.20,
            vel: vel,
            pan: 0,
            reverb: 0.45,
            delay: 0.06
        )
    }

    /// Effervescent Purple Total Care Fluoride Mouthwash swish earcon:
    /// Filtered aqua-violet liquid wave + micro-bubble sparkle + rising Glass-Harp & Celesta Fluorapatite triad.
    public func playMouthwashSwishMotif(stepIndex: Int) {
        guard canPlaySfx() else { return }
        let clampedStep = min(2, max(0, stepIndex))
        emitNoiseSweep(
            f0: 950 + Float(clampedStep) * 320,
            f1: 2800 + Float(clampedStep) * 450,
            durSec: 0.42,
            peak: 0.055,
            q: 0.85
        )
        for b in 0..<3 {
            let baseHz = Float(640 + clampedStep * 140 + b * 190)
            emitBlip(f0: baseHz, f1: baseHz + 520, offsetSec: Double(b) * 0.055, durSec: 0.045, peak: 0.042)
        }
        let degrees: [[Int]] = [
            [0, 4, 7],
            [2, 5, 9],
            [4, 7, 11]
        ]
        for (i, deg) in degrees[clampedStep].enumerated() {
            let pan = Float(i - 1) * 0.26
            emitSfxVoice(
                i == 2 ? .celesta : .glassHarp,
                midi: harmonicMidi(degree: deg, octaveShift: 60),
                offsetSec: 0.05 + Double(i) * 0.065,
                durationSec: 0.52,
                vel: 0.54,
                pan: pan,
                reverb: 0.72,
                delay: 0.12
            )
        }
    }

    public func playOrbitalDive() {
        guard canPlaySfx() else { return }
        for i in 0..<7 {
            emitSfxVoice(.bell, midi: harmonicMidi(degree: i, octaveShift: 48), offsetSec: Double(i) * 0.07, vel: 0.52, pan: Float(i - 3) * 0.12, reverb: 0.65)
        }
        emitNoiseSweep(f0: 600, f1: 3600, durSec: 0.70, peak: 0.08, q: 0.75)
    }

    public func playCosmicBeatChime(_ beatIdx: Int) {
        guard canPlaySfx(), let cosmicTheme = MusicCatalog.themes[.cosmic] else { return }
        let bar = MusicCatalog.cosmicBeatBars[((beatIdx % 4) + 4) % 4]
        let chord = MusicCatalog.chordAtBar(cosmicTheme, bar: bar)
        let midis = MusicCatalog.chordMidis(theme: cosmicTheme, chord: chord, baseOct: 24)
        for (i, m) in midis.enumerated() {
            emitSfxVoice(.bell, midi: m, offsetSec: Double(i) * 0.09, vel: 0.56, pan: Float(i - 2) * 0.18, reverb: 0.72)
        }
    }

    public func playMohsSpecimenTone(_ mohsIndex: Int) {
        guard canPlaySfx() else { return }
        let degs = [0, 1, 2, 3, 5]
        let i = min(4, max(0, mohsIndex))
        let m = harmonicMidi(degree: degs[i], octaveShift: 48)
        emitSfxVoice(.bell, midi: m, vel: 0.74, reverb: 0.60)
        if i == 2 {
            // Special shimmering fifth + octave triad on Hydroxyapatite Enamel 5.0!
            emitSfxVoice(.glassHarp, midi: m + 7, offsetSec: 0.07, vel: 0.56, pan: -0.20, reverb: 0.68)
            emitSfxVoice(.glassHarp, midi: m + 12, offsetSec: 0.14, vel: 0.52, pan: 0.20, reverb: 0.72)
        }
    }

    public func playSurgeReady() {
        guard canPlaySfx() else { return }
        for (i, d) in [0, 2, 4, 7].enumerated() {
            emitSfxVoice(.bell, midi: harmonicMidi(degree: d, octaveShift: 60), offsetSec: Double(i) * 0.08, vel: 0.65, pan: (Float(i) - 1.5) * 0.15, reverb: 0.70)
        }
    }

    public func playSynergyRankUp(_ rankIndex: Int) {
        guard canPlaySfx() else { return }
        let r = min(3, max(0, rankIndex))
        let base = harmonicMidi(degree: 1 + r, octaveShift: 60)
        emitSfxVoice(.bell, midi: base, vel: 0.60)
        emitSfxVoice(.bell, midi: base + (r >= 2 ? 12 : 7), offsetSec: 0.09, vel: 0.65, pan: 0.15)
        if r >= 3 {
            emitSfxVoice(.glassHarp, midi: base + 16, offsetSec: 0.18, vel: 0.60, pan: -0.15)
        }
    }

    public func playMissionEnd(won: Bool) {
        guard canPlaySfx() else { return }
        let key = activeTheme.keyRoot + 12
        if won {
            let prog = [[0, 4, 7, 11], [5, 9, 12, 16], [7, 11, 14, 17], [0, 4, 7, 11, 14]]
            for (bi, chord) in prog.enumerated() {
                for (i, iv) in chord.enumerated() {
                    emitSfxVoice(.rhodes, midi: key + iv, offsetSec: Double(bi) * 0.28, durationSec: 0.72, vel: 0.58, pan: Float(i - 2) * 0.12, reverb: 0.52)
                }
            }
            for (i, iv) in [12, 16, 19, 24].enumerated() {
                emitSfxVoice(.bell, midi: key + iv + 12, offsetSec: 0.84 + Double(i) * 0.07, vel: 0.56, pan: (Float(i) - 1.5) * 0.20, reverb: 0.75)
            }
        } else {
            let prog = [[5, 9, 12, 16], [0, 4, 7, 11, 14]]
            for (bi, chord) in prog.enumerated() {
                for (i, iv) in chord.enumerated() {
                    emitSfxVoice(.rhodes, midi: key + iv - 12, offsetSec: Double(bi) * 0.55, durationSec: 1.10, vel: 0.45, pan: Float(i - 2) * 0.10, reverb: 0.55)
                }
            }
        }
    }

    // MARK: - Direct EventBus Convenience Dispatcher

    public func handleGameEvent(_ event: GameEvent) {
        switch event {
        case let .modeChanged(_, to):
            setAmbientMode(to)
        case let .actuatorScrub(_, _, _, acidWarn):
            if acidWarn { playAcidWarning() }
        case let .flossSliced(_, _, targetsHit, _, zipped, _):
            playFlossSnap(targetsHit: targetsHit, zipped: zipped)
        case .rinseSurged:
            playFluorideSurge(buffered: false)
        case .disclosePulsed:
            playDisclosingScan()
        case .siteRestored:
            playSiteRestored()
        case .districtSealed:
            playDistrictSealed()
        case .beaconCollected:
            playSiteRestored()
        case let .missionComplete(_, _, won, _, _):
            stopScrub()
            playMissionEnd(won: won)
        case .sucroseShattered:
            playSucroseShatter()
        case .gumTender:
            playGumWarning()
        case .stephanSip:
            setAcidTension(true)
            playAcidSip()
        case .stephanBuffered:
            setAcidTension(false)
            playFluorideSurge(buffered: true)
        case .erosionWash:
            playErosionWash()
        case .fluorapatiteInfused:
            playFluorapatiteInfuse()
        case .epsDeflected:
            playEpsDeflect()
        case .epsCracked:
            playEpsCrack()
        case .springTriggered:
            playSalivaSpring()
        case .mutansBumped:
            playMutansBoing()
        case .mutansPopped:
            playMutansPop()
        case .surgeReady:
            playSurgeReady()
        case let .pacerPaused(paused):
            setPaused(paused)
        case .pacerComplete:
            playPacerCue(.complete)
        default:
            break
        }
    }
}
