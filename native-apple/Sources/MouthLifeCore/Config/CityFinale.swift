import Foundation

// City finales: the show a city puts on when the player seals its last zone, and the Golden Molar
// its pieces build. Every city ends the same way (hush, rise, wave of light, blaze, show, the city's
// sign in sparks, the prize, the molar, liftoff), and sealing all five plays the ending.
//
// This is the Swift half of src/config/cityFinale.ts, which explains each beat. Everything is a pure
// function of time, so both editions draw and play the same show: CitySkylineArt (generated from the
// web) carries the web's checksum of every position, brightness and note, and the tests compare.

public enum FinaleInstrument: String, CaseIterable, Sendable {
    case rhodes, marimba, kalimba, celesta, bell, pad, reed, pluck
}

public enum FinaleShow: String, CaseIterable, Sendable {
    case fireworks, beads, neon, balloons, meteors
}

public enum FinaleBurstKind: String, CaseIterable, Sendable {
    case peony, ring, willow
}

public struct FinaleBurst: Equatable, Sendable {
    /// Seconds into the show when the rocket goes up (it bursts a moment later).
    public let t: Double
    public let x: Double
    public let y: Double
    public let kind: FinaleBurstKind
    public let colorHex: UInt32
    public let color2Hex: UInt32

    public init(t: Double, x: Double, y: Double, kind: FinaleBurstKind, colorHex: UInt32, color2Hex: UInt32) {
        self.t = t
        self.x = x
        self.y = y
        self.kind = kind
        self.colorHex = colorHex
        self.color2Hex = color2Hex
    }
}

public struct CityFinalePlan: Equatable, Sendable {
    public let voice: FinaleInstrument
    /// MIDI note the city's tunes are built on.
    public let tonic: Int
    public let show: FinaleShow
    public let hostOnLeft: Bool
    public let bursts: [FinaleBurst]
}

/// Every voice a finale score uses: the instruments plus a few effects.
public enum FinaleVoice: String, Sendable {
    case rhodes, marimba, kalimba, celesta, bell, pad, reed, pluck, bass, kick, whistle, boom, sparkle, whoosh

    init(_ instrument: FinaleInstrument) {
        self = FinaleVoice(rawValue: instrument.rawValue) ?? .bell
    }
}

public struct FinaleNote: Equatable, Sendable {
    public let t: Double
    public let voice: FinaleVoice
    public let midi: Int
    public let dur: Double
    public let vel: Double
    public let pan: Double

    public init(t: Double, voice: FinaleVoice, midi: Int, dur: Double, vel: Double, pan: Double) {
        self.t = t
        self.voice = voice
        self.midi = midi
        self.dur = dur
        self.vel = vel
        self.pan = pan
    }
}

public enum MolarFinish: String, CaseIterable, Sendable {
    case empty, pearl, silver, gold
}

public enum FinaleSpace: Sendable {
    case city, stage, hidden
}

public enum FinaleLayer: Sendable {
    case light, scenery, sky
}

public struct FinalePoint: Equatable, Sendable {
    public var x: Double
    public var y: Double
    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

public enum CityFinale {
    // MARK: - Timing (seconds from the moment the last zone seals)

    public static let hushEnd = 1.0
    public static let riseEnd = 2.5
    public static let waveEnd = 7.0
    /// The show starts here; a burst's `t` counts from this moment.
    public static let blazeEnd = 8.0
    public static let showEnd = 13.5
    public static let emblemBurst = 14.0
    public static let emblemEnd = 15.5
    public static let gatherEnd = 16.5
    public static let meet = 18.0
    public static let prizeEnd = 19.5
    public static let slot = 21.0
    /// The molar moves to the top of the mountain as it rises.
    public static let molarEnd = 22.0
    /// The probe lands on its new ledge...
    public static let climbHop = 24.0
    /// ...and, for the city that completes the set, on the summit.
    public static let summitHop = 26.0
    /// A ring of teeth opens in the sky: the wormhole to the next city (Finale3D draws it).
    public static let portalOpen = 26.0
    /// The probe flies up into the ring as the camera lifts to it.
    public static let portalLift = 27.0
    /// The probe goes in and the camera dives through the tunnel of teeth (with the whoosh).
    public static let dive = 28.0
    /// The probe nods hello at the ring of teeth...
    public static let hello = 26.5
    /// ...and its tiny double in the next city's sky nods back on these beats as we fly in.
    public static let helloBack = 28.5
    public static let climbEnd = 28.0
    /// Exactly 30 s, so a recorded song can be made to fit.
    public static let end = 30.0
    /// The Skip button appears after this.
    public static let skipAfter = 1.5
    /// The longest a show runs; a burst must go up inside it.
    public static let showSeconds = 5.5

    /// The ending: exactly 72 s. A recorded ending song is written to 60 s (`songEnd`); the last
    /// 12 s are the Golden Molar's long hug, under the score's own music-box lullaby.
    public enum Ending {
        public static let fadeEnd = 1.0
        public static let firstPiece = 1.5
        public static let pieceGap = 1.0
        public static let pieceFlight = 1.0
        public static let snap = 8.0
        public static let creditsStart = 12.0
        public static let creditSeconds = 8.0
        public static let finaleStart = 52.0
        public static let face = 54.0
        public static let wink = 55.5
        /// A recorded ending song is written to end here; the score's own lullaby carries the rest.
        public static let songEnd = 60.0
        /// All gold: the molar winks once more, to say goodbye.
        public static let goodbyeWink = 69.0
        /// The hug runs from the face to here: 18 s.
        public static let end = 72.0
        public static let skipAfter = 1.0
        /// The hug's gentle squeezes: one just after the wink, then every two bars.
        public static let squeezes: [Double] = [57.0, 61.0, 65.0]
        /// Each squeeze sends up a puff of this many hearts.
        public static let heartsPerSqueeze = 12
        /// Every heart the hug sends up.
        public static let hearts = squeezes.count * heartsPerSqueeze
        /// How long one heart takes to float up and fade.
        public static let heartLife = 2.4
    }

    // MARK: - Songs

    /// Songs for the finales, by file name without extension, from the shared Music folder. First
    /// match wins; nothing falls back to another song. Same lists as the web.
    public static let finaleTrackCandidates: [[String]] = [
        ["finale_toronto", "finale_world_1"],
        ["finale_new_orleans", "finale_nola", "finale_world_2"],
        ["finale_tokyo", "finale_tokyo_chicago", "finale_world_3"],
        ["finale_accra", "finale_accra_colorado", "finale_world_4"],
        ["finale_aurora", "finale_orbit", "finale_world_5"],
    ]
    public static let endingTrackCandidates = ["finale_ending", "grand_finale", "ending"]
    /// Score voices that still play over a recorded song: the show's sound effects.
    public static let effectVoices: Set<FinaleVoice> = [.whistle, .boom, .sparkle, .whoosh]

    /// Whether an ending note still plays over a recorded ending song: the show's sound effects, and
    /// everything from `Ending.songEnd` on, where the song has finished and the lullaby takes over.
    /// (The web's endingNotePlaysOverSong.)
    public static func endingNotePlaysOverSong(_ note: FinaleNote) -> Bool {
        effectVoices.contains(note.voice) || note.t >= Ending.songEnd
    }

    /// The candidate names for a city's finale (0...4) or the ending (-1).
    public static func trackCandidates(_ index: Int) -> [String] {
        index < 0 ? endingTrackCandidates : (index < finaleTrackCandidates.count ? finaleTrackCandidates[index] : [])
    }

    public static let campaignPieces = 5
    /// The campaign's host cities in order (WorldCartridge.hostId of world_1 ... world_5).
    public static let hostIds = ["toronto", "new_orleans", "tokyo", "accra", "orbit_aurora"]
    public static let worldIds = ["world_1", "world_2", "world_3", "world_4", "world_5"]

    // MARK: - Reading a drawing's @finale section

    /// Collects a drawing's finale settings line by line. Lines it does not understand are skipped
    /// (the web tests reject them before they reach the app).
    public struct PlanBuilder {
        var voice: FinaleInstrument?
        var tonic: Int?
        var show: FinaleShow?
        var hostOnLeft: Bool?
        var bursts: [FinaleBurst] = []

        public init() {}

        public mutating func read(_ tokens: [String]) {
            guard let first = tokens.first else { return }
            switch first {
            case "voice":
                guard tokens.count == 3, let v = FinaleInstrument(rawValue: tokens[1]), let n = Double(tokens[2]) else { return }
                voice = v
                tonic = Int(n)
            case "show":
                guard tokens.count == 2, let s = FinaleShow(rawValue: tokens[1]) else { return }
                show = s
            case "host":
                guard tokens.count == 2, tokens[1] == "left" || tokens[1] == "right" else { return }
                hostOnLeft = tokens[1] == "left"
            case "burst":
                guard tokens.count == 7,
                      let t = Double(tokens[1]), let x = Double(tokens[2]), let y = Double(tokens[3]),
                      let kind = FinaleBurstKind(rawValue: tokens[4]),
                      tokens[5].hasPrefix("#"), tokens[6].hasPrefix("#"),
                      let c1 = UInt32(tokens[5].dropFirst(), radix: 16),
                      let c2 = UInt32(tokens[6].dropFirst(), radix: 16)
                else { return }
                bursts.append(FinaleBurst(t: t, x: x, y: y, kind: kind, colorHex: c1, color2Hex: c2))
            default:
                return
            }
        }

        public var plan: CityFinalePlan? {
            guard let voice, let tonic, let show, let hostOnLeft else { return nil }
            return CityFinalePlan(voice: voice, tonic: tonic, show: show, hostOnLeft: hostOnLeft, bursts: bursts)
        }
    }

    // MARK: - Helpers

    static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
        v < lo ? lo : (v > hi ? hi : v)
    }

    /// 0 at or before 0, 1 at or after 1, eased in between.
    public static func smooth01(_ x: Double) -> Double {
        if x <= 0 { return 0 }
        if x >= 1 { return 1 }
        return x * x * (3 - 2 * x)
    }

    static func easeOutCubic(_ x: Double) -> Double {
        let u = 1 - clamp(x, 0, 1)
        return 1 - u * u * u
    }

    static func easeInCubic(_ x: Double) -> Double {
        let u = clamp(x, 0, 1)
        return u * u * u
    }

    static func backOut(_ x: Double) -> Double {
        let u = clamp(x, 0, 1) - 1
        return 1 + 2.7 * u * u * u + 1.7 * u * u
    }

    static func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double {
        a + (b - a) * t
    }

    /// A repeatable number in [0, 1) for a pair of integers: the same integer steps as the web, so the
    /// same value.
    public static func hash(_ a: Int, _ b: Int) -> Double {
        let ua = UInt32(truncatingIfNeeded: a)
        let ub = UInt32(truncatingIfNeeded: b)
        var h = (ua &* 0x27d4_eb2d) ^ ((ub &+ 0x9e37_79b9) &* 0x1656_67b1)
        h = (h ^ (h >> 15)) &* 0x85eb_ca6b
        h = (h ^ (h >> 13)) &* 0xc2b2_ae35
        h = h ^ (h >> 16)
        return Double(h) / 4_294_967_296.0
    }

    // MARK: - The city at night, relit

    static let waveFrom = -3.0
    static let waveTo = 67.0

    public static func waveX(_ t: Double) -> Double {
        if t <= riseEnd { return waveFrom }
        if t >= waveEnd { return waveTo }
        return waveFrom + ((waveTo - waveFrom) * (t - riseEnd)) / (waveEnd - riseEnd)
    }

    public static func passTime(_ cx: Double, reducedMotion: Bool) -> Double {
        if reducedMotion { return riseEnd + 1.0 }
        let c = clamp(cx, waveFrom, waveTo)
        return riseEnd + ((c - waveFrom) / (waveTo - waveFrom)) * (waveEnd - riseEnd)
    }

    static func night(_ layer: FinaleLayer) -> Double {
        switch layer {
        case .light: return 0.06
        case .scenery: return 0.3
        case .sky: return 0.12
        }
    }

    static func ramp(_ layer: FinaleLayer) -> Double {
        switch layer {
        case .light: return 0.18
        case .scenery: return 0.7
        case .sky: return 1.2
        }
    }

    public static func backdropDim(_ t: Double) -> Double {
        1 - 0.35 * smooth01((t - 14.0) / 1.0)
    }

    /// Brightness of a panorama piece: (level, flash).
    public static func cityTint(_ t: Double, cx: Double, layer: FinaleLayer, show: FinaleShow, reducedMotion: Bool) -> (level: Double, flash: Double) {
        let age = t - passTime(cx, reducedMotion: reducedMotion)
        let r = ramp(layer) * (reducedMotion ? 3 : 1)
        var level = age <= 0 ? night(layer) : night(layer) + (1 - night(layer)) * smooth01(age / r)
        var flash = 0.0
        if layer == .light && age > 0 && !reducedMotion { flash = 0.75 * exp(-age / 0.16) }
        let showT = t - blazeEnd
        if show == .neon && layer == .light && !reducedMotion && showT >= 0 && t < showEnd {
            level *= 0.84 + 0.16 * cos(Double.pi * 4 * showT)
        }
        level *= backdropDim(t)
        return (level, flash)
    }

    public static func camera(_ t: Double, reducedMotion: Bool) -> (cx: Double, viewW: Double) {
        if reducedMotion { return (32, 64) }
        if t < riseEnd { return (20, 40) }
        if t < waveEnd { return (clamp(waveX(t), 20, 44), 40) }
        let s = smooth01((t - waveEnd) / (blazeEnd - waveEnd))
        return (lerp(44, 32, s), lerp(40, 64, s))
    }

    // MARK: - The probe and the prize

    public struct Probe: Equatable, Sendable {
        public var space: FinaleSpace
        public var x: Double
        public var y: Double
        public var alpha: Double
    }

    static let probeLead = 1.2
    static let probeWaveY = 6.8
    static let riseP0 = FinalePoint(x: 32, y: -3)
    static let riseP1 = FinalePoint(x: 20, y: 11)
    static let riseP2 = FinalePoint(x: -3.0 + 1.2, y: 6.8)
    public static let probePark = FinalePoint(x: 0, y: -0.78)
    /// The middle of the wormhole's ring of teeth, high over the mountain: the probe flies into it.
    public static let portalStage = FinalePoint(x: 0, y: 1.6)

    /// One quick nod (0 up to 1 and back over 0.45 s) starting at `at`; none with Reduce Motion.
    public static func nod(_ t: Double, at: Double, reducedMotion: Bool) -> Double {
        if reducedMotion { return 0 }
        let s = (t - at) / 0.45
        return s <= 0 || s >= 1 ? 0 : sin(Double.pi * s)
    }

    /// "A hug for you" at the very end: once its face is on, the Golden Molar opens its arms wide to
    /// the child and folds them into a hug on the wink. Then it holds the hug for the rest of the
    /// ending (18 s from the face): a gentle squeeze with happy eyes and a puff of hearts at each of
    /// `Ending.squeezes`, breathing softly in between. With Reduce Motion the arms fade in already
    /// hugging and nothing moves. (The web's endingHug.)
    public struct EndingHug: Sendable {
        public let arms: Double
        public let open: Double
        public let fold: Double
        public let squeeze: Double
        public let happyEyes: Bool
        public let hearts: Double
    }

    public static func endingHug(_ t: Double, reducedMotion: Bool) -> EndingHug {
        typealias E = Ending
        if reducedMotion {
            return EndingHug(
                arms: smooth01((t - (E.wink + 0.5)) / 0.8), open: 1, fold: 1, squeeze: 0, happyEyes: false,
                hearts: smooth01((t - (E.wink + 1.5)) / 0.8)
            )
        }
        // between squeezes the hug breathes: a soft pulse once a bar, from where a recorded song ends
        // (so the first 60 s are as they always were) until two seconds before the end
        let breathFrom = E.songEnd
        let breathTo = E.end - 2.0
        let breath = sin((Double.pi * (t - breathFrom)) / 2)
        var squeeze = t > breathFrom && t < breathTo ? 0.3 * breath * breath : 0
        var happyEyes = false
        for at in E.squeezes {
            squeeze = max(squeeze, nod(t, at: at, reducedMotion: false))
            if t >= at - 0.7 && t < at + 0.9 { happyEyes = true }
        }
        return EndingHug(
            arms: smooth01((t - (E.face + 0.2)) / 0.4),
            open: smooth01((t - (E.face + 0.2)) / 0.7),
            fold: smooth01((t - E.wink) / 0.7),
            squeeze: squeeze,
            happyEyes: happyEyes,
            hearts: smooth01((t - E.squeezes[0]) / 0.4)
        )
    }

    /// Heart `k` (0 to `Ending.hearts` - 1) of the hug: how long it has been floating up and how
    /// visible it is (0...1). Each squeeze sends up a puff of `Ending.heartsPerSqueeze`, 0.22 s apart.
    /// With Reduce Motion only the first puff shows, standing still at fixed heights. (The web's endingHeart.)
    public static func endingHeart(_ k: Int, t: Double, reducedMotion: Bool) -> (age: Double, fade: Double) {
        let puff = k / Ending.heartsPerSqueeze
        let j = k % Ending.heartsPerSqueeze
        if reducedMotion { return (0.9 + Double(j % 4) * 0.25, puff == 0 ? 1 : 0) }
        let age = t - (Ending.squeezes[puff] + Double(j) * 0.22)
        if age <= 0 { return (age, 0) }
        return (age, min(1, age / 0.25) * max(0, 1 - age / Ending.heartLife))
    }

    /// How far the five city bubbles over the Golden Molar's pieces have faded in (grand finale, 0..1).
    public static func endingCityBubbles(_ t: Double) -> Double {
        smooth01((t - (Ending.finaleStart + 0.6)) / 0.8)
    }

    /// The tiny probe in the next city's sky nodding back, once on each of three beats as we fly in.
    public static func helloBack(_ t: Double, reducedMotion: Bool) -> Double {
        var n = 0.0
        for k in 0..<3 { n = max(n, nod(t, at: helloBack + 0.5 * Double(k), reducedMotion: reducedMotion)) }
        return n
    }

    static func probeWaveY(_ t: Double) -> Double {
        probeWaveY + 0.5 * sin((Double.pi * 2 * (t - riseEnd)) / 1.6)
    }

    /// The probe's path. `climbTo` is the ledge it climbs to (the city's campaign index); with
    /// `summit` it goes on to the top of the mountain.
    public static func probe(_ t: Double, reducedMotion: Bool, climbTo: Int = 0, summit: Bool = false) -> Probe {
        let hidden = Probe(space: .hidden, x: 0, y: 0, alpha: 0)
        if reducedMotion {
            if t < gatherEnd || t >= end { return hidden }
            if t < molarEnd {
                let fadeIn = smooth01((t - gatherEnd) / 0.6)
                let fadeOut = 1 - smooth01((t - (molarEnd - 0.4)) / 0.4)
                return Probe(space: .stage, x: 0, y: 0, alpha: fadeIn * fadeOut)
            }
            let at = ledge(summit ? campaignPieces : climbTo, t: t, reducedMotion: true)
            let alpha = smooth01((t - molarEnd - 0.4) / 0.6) * (1 - smooth01((t - climbEnd) / 0.8))
            return Probe(space: .stage, x: at.x, y: at.y, alpha: alpha)
        }
        if t < hushEnd { return hidden }
        if t < riseEnd {
            let s = smooth01((t - hushEnd) / (riseEnd - hushEnd))
            let u = 1 - s
            return Probe(
                space: .city,
                x: u * u * riseP0.x + 2 * u * s * riseP1.x + s * s * riseP2.x,
                y: u * u * riseP0.y + 2 * u * s * riseP1.y + s * s * riseP2.y,
                alpha: 1
            )
        }
        if t < waveEnd { return Probe(space: .city, x: waveX(t) + probeLead, y: probeWaveY(t), alpha: 1) }
        if t < waveEnd + 0.6 {
            let s = (t - waveEnd) / 0.6
            return Probe(space: .city, x: lerp(waveTo + probeLead, 76, s), y: lerp(probeWaveY(waveEnd), 9, s), alpha: 1)
        }
        if t < gatherEnd { return hidden }
        if t < meet {
            let s = easeOutCubic((t - gatherEnd) / (meet - gatherEnd))
            return Probe(space: .stage, x: 0, y: lerp(-1.4, 0, s), alpha: 1)
        }
        let bob = 0.015 * sin((Double.pi * 2 * t) / 1.1)
        if t < prizeEnd { return Probe(space: .stage, x: 0, y: bob, alpha: 1) }
        if t < molarEnd {
            let s = smooth01((t - prizeEnd) / 0.8)
            return Probe(space: .stage, x: lerp(0, probePark.x, s), y: lerp(0, probePark.y, s) + bob, alpha: 1)
        }
        if t >= end { return hidden }
        func climbAt(_ time: Double) -> FinalePoint {
            let from = ledge(climbTo - 1, t: time, reducedMotion: false)
            let to = ledge(climbTo, t: time, reducedMotion: false)
            let hopStart = climbHop - 0.8
            if time < hopStart {
                let s = smooth01((time - molarEnd) / (hopStart - molarEnd))
                return FinalePoint(x: lerp(probePark.x, from.x, s), y: lerp(probePark.y, from.y, s))
            }
            if time < climbHop {
                let s = (time - hopStart) / 0.8
                let e = smooth01(s)
                return FinalePoint(x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e) + 0.22 * sin(Double.pi * s))
            }
            let summitStart = summitHop - 0.8
            if !summit || time < summitStart { return to }
            let top = ledge(campaignPieces, t: time, reducedMotion: false)
            if time < summitHop {
                let s = (time - summitStart) / 0.8
                let e = smooth01(s)
                return FinalePoint(x: lerp(to.x, top.x, e), y: lerp(to.y, top.y, e) + 0.22 * sin(Double.pi * s))
            }
            return top
        }
        if t < portalLift {
            let p = climbAt(t)
            let hopping = (t >= climbHop - 0.8 && t < climbHop) || (summit && t >= summitHop - 0.8 && t < summitHop)
            return Probe(space: .stage, x: p.x, y: p.y + (hopping ? 0 : bob), alpha: 1)
        }
        // up into the wormhole's ring of teeth, then in through it as the camera dives after it
        let start = climbAt(portalLift)
        if t < dive {
            let s = smooth01((t - portalLift) / (dive - portalLift))
            return Probe(
                space: .stage,
                x: lerp(start.x, portalStage.x, s) + 0.2 * sin(Double.pi * s),
                y: lerp(start.y, portalStage.y, s),
                alpha: 1
            )
        }
        let inside = 1 - smooth01((t - dive) / 0.3)
        if inside <= 0 { return hidden }
        return Probe(space: .stage, x: portalStage.x, y: portalStage.y, alpha: inside)
    }

    // MARK: - The climb

    /// The mountain the cities climb, in stage units (before it rises into place).
    public enum Mountain {
        public static let outline: [FinalePoint] = [
            FinalePoint(x: -1.5, y: -1.1),
            FinalePoint(x: -1.0, y: -0.62),
            FinalePoint(x: -0.78, y: -0.66),
            FinalePoint(x: -0.42, y: -0.2),
            FinalePoint(x: -0.2, y: 0.22),
            FinalePoint(x: 0, y: 0.5),
            FinalePoint(x: 0.18, y: 0.26),
            FinalePoint(x: 0.4, y: -0.02),
            FinalePoint(x: 0.58, y: -0.1),
            FinalePoint(x: 0.98, y: -0.62),
            FinalePoint(x: 1.5, y: -1.1),
        ]
        public static let snow: [FinalePoint] = [
            FinalePoint(x: -0.2, y: 0.22),
            FinalePoint(x: 0, y: 0.5),
            FinalePoint(x: 0.18, y: 0.26),
            FinalePoint(x: 0.08, y: 0.31),
            FinalePoint(x: 0, y: 0.25),
            FinalePoint(x: -0.1, y: 0.3),
        ]
        public static let ledges: [FinalePoint] = [
            FinalePoint(x: -0.6, y: -0.74),
            FinalePoint(x: 0.52, y: -0.5),
            FinalePoint(x: -0.36, y: -0.24),
            FinalePoint(x: 0.3, y: 0.0),
            FinalePoint(x: -0.12, y: 0.24),
        ]
        public static let foot = FinalePoint(x: 0, y: -0.96)
        public static let summitStand = FinalePoint(x: 0, y: 0.46)
        public static let summit = FinalePoint(x: 0, y: 0.66)
        public static let riseFrom = -1.9
    }

    /// The molar's size on the summit, relative to Molar.scale.
    public static let molarOnSummit = 0.34

    public static func mountain(_ t: Double, reducedMotion: Bool) -> (alpha: Double, dy: Double) {
        if t < molarEnd { return (0, Mountain.riseFrom) }
        let s = (t - molarEnd) / 0.8
        if reducedMotion { return (smooth01(s), 0) }
        return (smooth01(s * 1.5), Mountain.riseFrom * (1 - easeOutCubic(s)))
    }

    /// A ledge's place as the mountain rises: -1 is the foot, 0...4 the cities, 5 the summit.
    public static func ledge(_ index: Int, t: Double, reducedMotion: Bool) -> FinalePoint {
        let p = index < 0 ? Mountain.foot : (index >= campaignPieces ? Mountain.summitStand : Mountain.ledges[index])
        return FinalePoint(x: p.x, y: p.y + mountain(t, reducedMotion: reducedMotion).dy)
    }

    /// How many cities are still to clean, and which comes next (campaign index, or -1).
    public static func climbStatus(_ finishes: [MolarFinish]) -> (left: Int, next: Int) {
        var left = 0
        var next = -1
        for i in 0..<campaignPieces {
            if (i < finishes.count ? finishes[i] : .empty) == .empty {
                left += 1
                if next < 0 { next = i }
            }
        }
        return (left, next)
    }

    /// The finishes the checksum uses: every city up to `slotIndex` cleaned (gold, silver, pearl in turn).
    public static func checksumFinishes(_ slotIndex: Int) -> [MolarFinish] {
        let cycle: [MolarFinish] = [.gold, .silver, .pearl]
        return (0..<campaignPieces).map { $0 <= slotIndex ? cycle[$0 % 3] : .empty }
    }

    /// Radius of the city's piece while the probe holds it (stage units).
    public static let pieceRadius = 0.2
    static let pieceForm = FinalePoint(x: 0, y: 0.42)
    static let pieceHeld = FinalePoint(x: 0, y: 0.22)

    public struct Piece: Equatable, Sendable {
        public var visible: Bool
        public var x: Double
        public var y: Double
        public var scale: Double
        public var spin: Double
        public var glow: Double
        public var alpha: Double

        static let none = Piece(visible: false, x: 0, y: 0, scale: 0, spin: 0, glow: 0, alpha: 0)
    }

    public static func piece(_ t: Double, slotIndex: Int, reducedMotion: Bool) -> Piece {
        if t < emblemEnd || t >= slot { return .none }
        let slotPos = slotPosition(slotIndex)
        let slotScale = (Molar.cuspRadius * Molar.scale) / pieceRadius
        if reducedMotion {
            if t < prizeEnd {
                let a = smooth01((t - emblemEnd) / 0.8)
                return Piece(visible: true, x: pieceHeld.x, y: pieceHeld.y, scale: 1, spin: 0, glow: 1, alpha: a)
            }
            let s = smooth01((t - prizeEnd) / (slot - prizeEnd))
            return Piece(visible: true, x: slotPos.x, y: slotPos.y, scale: slotScale, spin: 0, glow: 1, alpha: s)
        }
        if t < gatherEnd {
            let s = (t - emblemEnd) / (gatherEnd - emblemEnd)
            let scale = s < 0.6 ? 0 : backOut((s - 0.6) / 0.4)
            return Piece(visible: scale > 0, x: pieceForm.x, y: pieceForm.y, scale: scale, spin: s * Double.pi * 10, glow: 1.4, alpha: 1)
        }
        if t < meet {
            let s = (t - gatherEnd) / (meet - gatherEnd)
            let e = smooth01(s)
            return Piece(
                visible: true,
                x: pieceForm.x,
                y: lerp(pieceForm.y, pieceHeld.y, e),
                scale: 1,
                spin: Double.pi * 4 * (1 - (1 - s) * (1 - s)),
                glow: 1.2,
                alpha: 1
            )
        }
        let bob = 0.015 * sin((Double.pi * 2 * t) / 1.1)
        if t < prizeEnd {
            let flare = exp(-(t - meet) / 0.18)
            return Piece(visible: true, x: pieceHeld.x, y: pieceHeld.y + bob, scale: 1 + 0.25 * flare, spin: 0, glow: 1 + 0.6 * flare, alpha: 1)
        }
        let s = (t - prizeEnd) / (slot - prizeEnd)
        let e = smooth01(s)
        let u = 1 - e
        let ctrl = FinalePoint(x: slotPos.x * 0.5, y: 0.62)
        return Piece(
            visible: true,
            x: u * u * pieceHeld.x + 2 * u * e * ctrl.x + e * e * slotPos.x,
            y: u * u * (pieceHeld.y + bob) + 2 * u * e * ctrl.y + e * e * slotPos.y,
            scale: lerp(1, slotScale, e),
            spin: Double.pi * 2 * e,
            glow: 1,
            alpha: 1
        )
    }

    // MARK: - The Golden Molar

    /// A lower first molar seen from above: five cusps, one per city, in campaign order.
    public enum Molar {
        public static let center = FinalePoint(x: 0, y: -0.02)
        public static let scale = 0.5
        public static let cuspRadius = 0.29
        public static let cusps: [FinalePoint] = [
            FinalePoint(x: -0.56, y: -0.3),
            FinalePoint(x: -0.44, y: 0.4),
            FinalePoint(x: 0.06, y: -0.4),
            FinalePoint(x: 0.36, y: 0.42),
            FinalePoint(x: 0.7, y: -0.08),
        ]
        public static let lobeRadius = 0.41
        /// The crown's rounded block: x, y (bottom-left), w, h, corner radius.
        public static let core = (x: -0.62, y: -0.4, w: 1.36, h: 0.82, r: 0.3)
        public static let bodyCenter = FinalePoint(x: 0.06, y: 0.01)
        public static let groove: [FinalePoint] = [
            FinalePoint(x: -0.94, y: 0.04),
            FinalePoint(x: -0.2, y: 0.05),
            FinalePoint(x: 0.22, y: -0.02),
            FinalePoint(x: 1.0, y: 0.06),
        ]
    }

    /// Light and dark colours of each finish.
    public static func finishColors(_ finish: MolarFinish) -> (light: UInt32, dark: UInt32) {
        switch finish {
        case .empty: return (0x1e293b, 0x0f172a)
        case .pearl: return (0xfff7ed, 0xd6d3d1)
        case .silver: return (0xf8fafc, 0x94a3b8)
        case .gold: return (0xfef3c7, 0xd97706)
        }
    }

    public static func finish(for grade: MasteryGrade?, completed: Bool) -> MolarFinish {
        guard completed else { return .empty }
        switch grade {
        case .fluorapatiteGold: return .gold
        case .a, .s: return .silver
        default: return .pearl
        }
    }

    public static func slotPosition(_ index: Int, center: FinalePoint = Molar.center, scale: Double = Molar.scale) -> FinalePoint {
        let c = Molar.cusps[Int(clamp(Double(index), 0, Double(campaignPieces - 1)).rounded())]
        return FinalePoint(x: center.x + c.x * scale, y: center.y + c.y * scale)
    }

    /// The molar: how visible, its size (multiplier on Molar.scale) and where its centre is.
    public static func molar(_ t: Double, reducedMotion: Bool) -> (alpha: Double, scale: Double, x: Double, y: Double) {
        let c = Molar.center
        if t < prizeEnd { return (0, 1, c.x, c.y) }
        let s = (t - prizeEnd) / 0.5
        let alpha = smooth01(s)
        let popped = reducedMotion ? 1 : lerp(0.85, 1, backOut(s))
        if t < molarEnd { return (alpha, popped, c.x, c.y) }
        let top = Mountain.summit
        if reducedMotion {
            if t < molarEnd + 0.4 { return (1 - smooth01((t - molarEnd) / 0.4), 1, c.x, c.y) }
            return (smooth01((t - molarEnd - 0.4) / 0.4), molarOnSummit, top.x, top.y)
        }
        let m = smooth01((t - molarEnd) / 0.8)
        return (alpha, lerp(popped, molarOnSummit, m), lerp(c.x, top.x, m), lerp(c.y, top.y, m))
    }

    public static func slotShine(_ t: Double) -> Double {
        let a = t - slot
        if a < 0 { return 0 }
        return exp(-a / 0.5)
    }

    // MARK: - The emblem in sparks

    public static let emblemCenter = FinalePoint(x: 0, y: 0.3)
    public static let emblemScale = 0.42
    public static let emblemSparks = 120
    static let emblemRocketFromY = -1.3

    public struct EmblemTarget: Equatable, Sendable {
        public let x: Double
        public let y: Double
        public let colorHex: UInt32
    }

    static func luma(_ c: UInt32) -> Double {
        (0.2126 * Double((c >> 16) & 255) + 0.7152 * Double((c >> 8) & 255) + 0.0722 * Double(c & 255)) / 255
    }

    public static func emblemTargets(_ emblem: [SkylinePiece], count: Int = emblemSparks) -> [EmblemTarget] {
        var all: [EmblemTarget] = []
        for piece in emblem {
            let color: UInt32 = luma(piece.colorHex) < 0.12 ? 0xfde047 : piece.colorHex
            let t = piece.triangles
            var i = 0
            while i + 5 < t.count {
                let cx = (t[i] + t[i + 2] + t[i + 4]) / 3
                let cy = (t[i + 1] + t[i + 3] + t[i + 5]) / 3
                all.append(EmblemTarget(x: cx, y: cy, colorHex: color))
                for v in 0..<3 {
                    all.append(EmblemTarget(x: (cx + t[i + v * 2]) * 0.5, y: (cy + t[i + v * 2 + 1]) * 0.5, colorHex: color))
                }
                i += 6
            }
        }
        if all.isEmpty { return [] }
        return (0..<count).map { k in all[(k * all.count) / count] }
    }

    public static func emblemRocket(_ t: Double) -> FinalePoint? {
        if t < showEnd || t >= emblemBurst { return nil }
        let s = easeOutCubic((t - showEnd) / (emblemBurst - showEnd))
        return FinalePoint(x: emblemCenter.x, y: lerp(emblemRocketFromY, emblemCenter.y, s))
    }

    public static func emblemShape(_ t: Double) -> (x: Double, y: Double, scale: Double, alpha: Double) {
        let gatherDone = emblemEnd + 0.6 * (gatherEnd - emblemEnd)
        if t < emblemBurst + 0.45 || t >= gatherDone + 0.15 { return (emblemCenter.x, emblemCenter.y, emblemScale, 0) }
        let appear = smooth01((t - (emblemBurst + 0.45)) / 0.45)
        if t < emblemEnd { return (emblemCenter.x, emblemCenter.y, emblemScale, 0.9 * appear) }
        let s = easeInCubic((t - emblemEnd) / (gatherDone - emblemEnd))
        return (
            lerp(emblemCenter.x, pieceForm.x, s),
            lerp(emblemCenter.y, pieceForm.y, s),
            lerp(emblemScale, pieceRadius * 0.62, s),
            0.9 * (1 - smooth01((t - gatherDone) / 0.15))
        )
    }

    public static func emblemSpark(_ target: EmblemTarget, index i: Int, t: Double) -> (x: Double, y: Double, alpha: Double)? {
        let gatherDone = emblemEnd + 0.6 * (gatherEnd - emblemEnd)
        if t < emblemBurst || t >= gatherDone { return nil }
        let tx = emblemCenter.x + target.x * emblemScale
        let ty = emblemCenter.y + target.y * emblemScale
        if t < emblemBurst + 0.8 {
            let s = (t - emblemBurst) / 0.8
            let e = easeOutCubic(s)
            let curl = sin(Double.pi * s) * 0.08 * (hash(i, 31) - 0.5)
            let dx = tx - emblemCenter.x
            let dy = ty - emblemCenter.y
            return (emblemCenter.x + dx * e - dy * curl, emblemCenter.y + dy * e + dx * curl, 1)
        }
        if t < emblemEnd { return (tx, ty, 0.75 + 0.25 * sin(t * 12 + Double(i))) }
        let s = easeInCubic((t - emblemEnd) / (gatherDone - emblemEnd))
        return (lerp(tx, pieceForm.x, s), lerp(ty, pieceForm.y, s), 1)
    }

    // MARK: - The show

    static func burstShape(_ kind: FinaleBurstKind) -> (sparks: Int, radius: Double, gravity: Double, life: Double) {
        switch kind {
        case .peony: return (40, 3.4, 0.6, 1.8)
        case .ring: return (30, 3.9, 0.4, 1.6)
        case .willow: return (26, 3.0, 1.2, 2.6)
        }
    }

    public static func burstDelay(_ show: FinaleShow) -> Double {
        show == .meteors ? 0 : 0.9
    }

    public static func rocket(_ burst: FinaleBurst, showT: Double, show: FinaleShow) -> FinalePoint? {
        let delay = burstDelay(show)
        if delay == 0 || showT < burst.t || showT >= burst.t + delay { return nil }
        let s = easeOutCubic((showT - burst.t) / delay)
        return FinalePoint(x: burst.x, y: lerp(0, burst.y, s))
    }

    public struct Spark: Equatable, Sendable {
        public var x: Double
        public var y: Double
        public var px: Double
        public var py: Double
        public var alpha: Double
        public var mix: Double
    }

    static func sparkAt(_ burst: FinaleBurst, _ b: Int, _ i: Int, _ age: Double, _ scale: Double, _ gravityOn: Bool) -> FinalePoint {
        let shape = burstShape(burst.kind)
        let jitter = burst.kind == .ring ? 0 : 0.55 * (hash(i, b * 7 + 1) - 0.5)
        let angle = (Double.pi * 2 * Double(i)) / Double(shape.sparks) + jitter
        let speed = burst.kind == .ring ? 1 : 0.55 + 0.45 * hash(i, b * 7 + 2)
        let dist = shape.radius * speed * (1 - exp(-3.2 * age)) * scale
        let drop = gravityOn ? shape.gravity * age * age * scale : 0
        return FinalePoint(x: burst.x + cos(angle) * dist, y: burst.y + sin(angle) * dist - drop)
    }

    public static func burstSparks(_ burst: FinaleBurst, index b: Int, showT: Double, show: FinaleShow, scale: Double = 1) -> [Spark] {
        let shape = burstShape(burst.kind)
        let age = showT - burst.t - burstDelay(show)
        if age < 0 || age >= shape.life { return [] }
        let gravityOn = show != .meteors
        let fade = 1 - (age / shape.life) * (age / shape.life)
        let mix = clamp((age / shape.life - 0.2) / 0.5, 0, 1)
        var out: [Spark] = []
        out.reserveCapacity(shape.sparks)
        for i in 0..<shape.sparks {
            let p = sparkAt(burst, b, i, age, scale, gravityOn)
            let q = sparkAt(burst, b, i, max(0, age - 0.16), scale, gravityOn)
            var alpha = fade
            if burst.kind == .willow { alpha *= 0.65 + 0.35 * hash(i, Int((age * 20).rounded(.down)) + b * 101) }
            out.append(Spark(x: p.x, y: p.y, px: q.x, py: q.y, alpha: alpha, mix: mix))
        }
        return out
    }

    static let beadColors: [UInt32] = [0xa855f7, 0x22c55e, 0xeab308]

    public static func beads(_ showT: Double) -> [(x: Double, y: Double, colorHex: UInt32)] {
        var out: [(x: Double, y: Double, colorHex: UInt32)] = []
        for j in 0..<54 {
            let a = showT - Double(j) * 0.1
            if a < 0 || a > 2.4 { continue }
            let x0 = 2 + 60 * hash(j, 101)
            let vx = (hash(j, 102) - 0.5) * 3
            let vy = 7 + 2.5 * hash(j, 103)
            let y = 0.2 + vy * a - 3.25 * a * a
            if y < -0.5 { continue }
            out.append((x0 + vx * a, y, beadColors[j % 3]))
        }
        return out
    }

    static let balloonDefs: [(x: Double, color: UInt32, color2: UInt32)] = [
        (9, 0xf43f5e, 0xfde047),
        (21, 0x38bdf8, 0xf8fafc),
        (36, 0x22c55e, 0xfbbf24),
        (49, 0xa855f7, 0xf472b6),
        (61, 0xf97316, 0x38bdf8),
    ]

    public static func balloons(_ showT: Double) -> [(x: Double, y: Double, colorHex: UInt32, color2Hex: UInt32)] {
        var out: [(x: Double, y: Double, colorHex: UInt32, color2Hex: UInt32)] = []
        for (i, b) in balloonDefs.enumerated() {
            let a = showT - (0.15 + 0.55 * Double(i))
            if a < 0 { continue }
            out.append((b.x + 0.35 * sin(0.9 * a + Double(i)), -1.2 + 1.05 * a, b.color, b.color2))
        }
        return out
    }

    public static func meteors(_ showT: Double) -> [(x: Double, y: Double, tailX: Double, tailY: Double, alpha: Double)] {
        var out: [(x: Double, y: Double, tailX: Double, tailY: Double, alpha: Double)] = []
        let life = 0.75
        for m in 0..<12 {
            let a = showT - (0.42 * Double(m) + 0.3 * hash(m, 201))
            if a < 0 || a > life { continue }
            let x = 14 + 50 * hash(m, 202) - 11 * a
            let y = 8.2 + 3 * hash(m, 203) - 4.6 * a
            out.append((x, y, x + 11 * 0.14, y + 4.6 * 0.14, sin((Double.pi * a) / life)))
        }
        return out
    }

    static let hostUp = 9.5
    static let hostDown = 13.0

    public static func host(_ t: Double, reducedMotion: Bool) -> (rise: Double, wave: Double) {
        let rise = smooth01((t - hostUp) / 0.5) * (1 - smooth01((t - hostDown) / 0.45))
        let wave = reducedMotion ? 0 : 0.5 * sin(Double.pi * 2 * 1.6 * (t - hostUp))
        return (rise, wave)
    }

    /// When each line of text is on screen: [from, to).
    public static let bubbleText = (from: 9.9, to: 12.9)
    public static let cityText = (from: meet, to: molarEnd)
    public static let molarText = (from: slot, to: molarEnd)
    /// "2 more to the top" / "You made it to the top!", and the next city.
    /// Gone before the dive, so the wormhole is wordless.
    public static let climbText = (from: climbHop, to: dive)

    // MARK: - Music

    static let penta = [0, 2, 4, 7, 9]

    static func penta(_ k: Int) -> Int {
        12 * Int((Double(k) / 5).rounded(.down)) + penta[((k % 5) + 5) % 5]
    }

    static let riff: [Int?] = [0, nil, 4, 7, 9, nil, 7, 4, 7, nil, 9, 12, 14, 12, 9, 7]
    static let step = 0.25
    static let riffStart = 8.0

    static func burstPan(_ x: Double) -> Double {
        clamp((x - 32) / 40, -0.9, 0.9)
    }

    static func sortedStable(_ notes: [FinaleNote]) -> [FinaleNote] {
        notes.enumerated().sorted { a, b in a.element.t == b.element.t ? a.offset < b.offset : a.element.t < b.element.t }.map(\.element)
    }

    public static func notes(_ plan: CityFinalePlan, finishes: [MolarFinish], slotIndex: Int, reducedMotion: Bool) -> [FinaleNote] {
        let tonic = plan.tonic
        let v = FinaleVoice(plan.voice)
        let finish: MolarFinish = slotIndex >= 0 && slotIndex < finishes.count ? finishes[slotIndex] : .pearl
        let atTop = climbStatus(finishes).left == 0
        var notes: [FinaleNote] = []
        func add(_ t: Double, _ voice: FinaleVoice, _ midi: Int, _ dur: Double, _ vel: Double, _ pan: Double = 0) {
            notes.append(FinaleNote(t: t, voice: voice, midi: midi, dur: dur, vel: vel, pan: pan))
        }

        add(0.05, .pad, tonic - 12, 2.6, 0.32)
        add(0.05, .pad, tonic - 5, 2.6, 0.22, -0.2)
        add(0.05, .pad, tonic, 2.6, 0.2, 0.2)

        if !reducedMotion { add(hushEnd + 0.05, .whoosh, tonic, 1.2, 0.5) }
        for k in 0..<5 { add(hushEnd + 0.09 * Double(k), .bell, tonic + 12 + penta(k), 0.5, 0.42, -0.4 + 0.1 * Double(k)) }

        for k in 0..<9 {
            let t = riseEnd + 0.5 * Double(k)
            let pan = reducedMotion ? 0 : -0.8 + (1.6 * Double(k)) / 8
            add(t, v, tonic + penta(k), 0.6, 0.62, pan)
            if k % 3 == 2 { add(t, .bell, tonic + 12 + penta(k), 0.5, 0.3, pan) }
        }

        add(waveEnd, v, tonic, 1.6, 0.7, -0.2)
        add(waveEnd, v, tonic + 4, 1.6, 0.6)
        add(waveEnd, v, tonic + 7, 1.6, 0.6, 0.2)
        add(waveEnd, .bell, tonic + 24, 1.4, 0.45)
        add(waveEnd, .pad, tonic - 12, 2.0, 0.4)
        add(waveEnd, .boom, tonic, 1.0, 0.6)

        for (i, step) in riff.enumerated() {
            if let step { add(riffStart + Double(i) * Self.step, v, tonic + 12 + step, 0.3, 0.5) }
        }
        add(riffStart + Double(riff.count) * step, v, tonic + 12, 1.0, 0.55)
        add(riffStart + Double(riff.count) * step, .bell, tonic + 24, 1.0, 0.35)
        for k in 0..<9 {
            add(riffStart + Double(k) * 0.5, .kick, tonic, 0.2, 0.32)
            add(riffStart + Double(k) * 0.5, .bass, tonic - 24 + (k % 2 == 0 ? 0 : 7), 0.45, 0.5)
        }
        for burst in plan.bursts {
            let at = blazeEnd + burst.t
            let pan = burstPan(burst.x)
            if plan.show == .meteors {
                add(at, .bell, tonic + 12 + penta(Int(burst.y.rounded())), 0.9, 0.4, pan)
                add(at + 0.05, .sparkle, tonic, 0.8, 0.35, pan)
            } else {
                add(at, .whistle, tonic, 0.9, 0.32, pan)
                add(at + 0.9, .boom, tonic, 1.2, 0.5, pan)
                add(at + 1.05, .sparkle, tonic, 0.8, 0.3, pan)
            }
        }

        let hostPan = plan.hostOnLeft ? -0.6 : 0.6
        add(hostUp + 0.1, .kalimba, tonic + 19, 0.3, 0.5, hostPan)
        add(hostUp + 0.3, .kalimba, tonic + 24, 0.5, 0.5, hostPan)

        add(showEnd, .whistle, tonic, 0.6, 0.35)
        add(emblemBurst, .boom, tonic, 1.2, 0.6)
        for k in 0..<8 { add(emblemBurst + 0.05 + 0.07 * Double(k), .celesta, tonic + 24 + penta(k), 0.5, 0.38, -0.5 + Double(k) / 7) }

        for k in 0..<7 { add(emblemEnd + 0.08 * Double(k), .bell, tonic + 36 - penta(k), 0.4, 0.3) }
        add(emblemEnd + 0.8, .sparkle, tonic, 0.8, 0.4)
        for (k, t) in [17.0, 17.25, 17.5, 17.625, 17.75, 17.875].enumerated() { add(t, .kick, tonic, 0.18, 0.25 + 0.05 * Double(k)) }

        let fan = [7, 9, 11, 12]
        for (k, iv) in fan.enumerated() {
            let last = k == fan.count - 1
            add(meet + 0.125 * Double(k), v, tonic + iv, last ? 1.4 : 0.16, 0.8)
            add(meet + 0.125 * Double(k), .bell, tonic + 12 + iv, last ? 1.2 : 0.16, 0.4)
        }
        add(meet, .boom, tonic, 1.0, 0.55)
        for iv in [0, 4, 7] { add(meet + 0.375, .pad, tonic + iv, 2.2, 0.32) }

        add(slot, .marimba, tonic + 12, 0.2, 0.7)
        add(slot + 0.05, .bell, tonic + 19, 0.6, 0.5)
        switch finish {
        case .gold:
            for k in 0..<8 { add(slot + 0.4 + 0.05 * Double(k), .celesta, tonic + 12 + penta(k), 0.4, 0.45) }
            add(slot + 0.45, .sparkle, tonic, 0.9, 0.45)
        case .silver:
            add(slot + 0.4, .bell, tonic + 24, 0.6, 0.4)
            add(slot + 0.55, .bell, tonic + 28, 0.6, 0.4)
        default:
            add(slot + 0.4, .bell, tonic + 24, 0.6, 0.38)
        }

        // the climb: the mountain rises, each ledge rings (cities already cleaned ring brightly)
        if !reducedMotion { add(molarEnd + 0.05, .whoosh, tonic, 0.9, 0.35) }
        for k in 0..<campaignPieces {
            let earned = (k < finishes.count ? finishes[k] : .empty) != .empty && k != slotIndex
            add(molarEnd + 0.25 + 0.125 * Double(k), .bell, tonic + 12 + penta(k), 0.45, earned ? 0.42 : 0.16, -0.5 + Double(k) * 0.25)
        }
        for iv in [0, 4, 7] { add(molarEnd + 0.25, .pad, tonic - 12 + iv, 2.0, 0.22) }
        if !reducedMotion { add(climbHop - 0.8, .whoosh, tonic, 0.7, 0.3) }
        add(climbHop - 0.5, v, tonic + 7, 0.3, 0.45)
        add(climbHop, .kick, tonic, 0.2, 0.4)
        for iv in [7, 11, 14] { add(climbHop, v, tonic + iv, 0.9, 0.55) }
        add(climbHop, .bell, tonic + 19, 0.8, 0.4)

        if atTop {
            if !reducedMotion { add(summitHop - 0.8, .whoosh, tonic, 0.7, 0.35) }
            add(summitHop, .boom, tonic, 1.2, 0.6)
            for (k, iv) in [12, 16, 19, 24].enumerated() { add(summitHop + 0.1 * Double(k), .bell, tonic + iv, k == 3 ? 1.4 : 0.3, 0.5) }
            for iv in [0, 4, 7, 12] { add(summitHop + 0.4, v, tonic + iv, 2.2, 0.6) }
            add(summitHop + 0.4, .pad, tonic - 12, 3.0, 0.4)
            add(summitHop + 0.5, .sparkle, tonic, 0.9, 0.5)
        }

        // liftoff, on a chord that resolves only at the top; until then it hangs, not finished yet
        if !reducedMotion { add(climbEnd + 0.05, .whoosh, tonic, 1.0, 0.5) }
        for k in 0..<6 { add(climbEnd + 0.1 + 0.07 * Double(k), .bell, tonic + 12 + penta(k), 0.5, 0.35) }
        let lastChord = atTop ? [0, 4, 7, 11, 14] : [5, 7, 12, 14]
        for iv in lastChord { add(climbEnd, v, tonic + iv, 1.9, 0.5) }
        add(climbEnd, .pad, tonic - (atTop ? 12 : 5), 2.0, 0.35)

        return sortedStable(notes)
    }

    // MARK: - The ending

    /// How long the molar takes to fade out before, and back in after, each move with Reduce Motion.
    public static let endingMolarSwap = 0.6

    /// Where the molar sits during each part of the ending (stage units) and how big it is. It glides
    /// and shrinks up out of the way of the credits, then comes back for the last scene; with Reduce
    /// Motion it never moves or grows: it fades out where it is just before each cut and fades back in
    /// at its next spot just after. (The web's endingMolarPlace.)
    public static func endingMolarPlace(_ t: Double, reducedMotion: Bool = false) -> (x: Double, y: Double, scale: Double, alpha: Double) {
        let big = (x: 0.0, y: 0.02, scale: Molar.scale * 1.3)
        let small = (x: 0.0, y: 0.66, scale: Molar.scale * 0.5)
        let alpha = smooth01((t - 0.4) / 0.6)
        if reducedMotion {
            func fadeOut(_ cut: Double) -> Double { 1 - smooth01((t - (cut - endingMolarSwap)) / endingMolarSwap) }
            func fadeIn(_ cut: Double) -> Double { smooth01((t - cut) / endingMolarSwap) }
            if t < Ending.creditsStart { return (big.x, big.y, big.scale, alpha * fadeOut(Ending.creditsStart)) }
            if t < Ending.finaleStart {
                return (small.x, small.y, small.scale, alpha * fadeIn(Ending.creditsStart) * fadeOut(Ending.finaleStart))
            }
            return (big.x, big.y, big.scale, alpha * fadeIn(Ending.finaleStart))
        }
        if t < Ending.creditsStart - 0.6 { return (big.x, big.y, big.scale, alpha) }
        if t < Ending.creditsStart + 0.4 {
            let s = smooth01((t - (Ending.creditsStart - 0.6)) / 1.0)
            return (lerp(big.x, small.x, s), lerp(big.y, small.y, s), lerp(big.scale, small.scale, s), alpha)
        }
        if t < Ending.finaleStart { return (small.x, small.y, small.scale, alpha) }
        let s = smooth01((t - Ending.finaleStart) / 1.0)
        return (lerp(small.x, big.x, s), lerp(small.y, big.y, s), lerp(small.scale, big.scale, s), alpha)
    }

    public struct EndingPiece: Equatable, Sendable {
        public var x: Double
        public var y: Double
        public var scale: Double
        public var spin: Double
        public var alpha: Double
        public var arrived: Bool
    }

    public static func endingPiece(_ i: Int, t: Double, reducedMotion: Bool) -> EndingPiece {
        let place = endingMolarPlace(t, reducedMotion: reducedMotion)
        let slotPos = slotPosition(i, center: FinalePoint(x: place.x, y: place.y), scale: place.scale)
        let start = Ending.firstPiece + Double(i) * Ending.pieceGap
        let s = (t - start) / Ending.pieceFlight
        if s >= 1 { return EndingPiece(x: slotPos.x, y: slotPos.y, scale: 1, spin: 0, alpha: 1, arrived: true) }
        if s < 0 { return EndingPiece(x: slotPos.x, y: slotPos.y, scale: 1, spin: 0, alpha: 0, arrived: false) }
        if reducedMotion { return EndingPiece(x: slotPos.x, y: slotPos.y, scale: 1, spin: 0, alpha: smooth01(s), arrived: false) }
        let angle = Double.pi / 2 + (Double.pi * 2 * Double(i)) / Double(campaignPieces)
        let e = easeOutCubic(s)
        return EndingPiece(
            x: lerp(cos(angle) * 1.8, slotPos.x, e),
            y: lerp(sin(angle) * 1.8, slotPos.y, e),
            scale: lerp(2.2, 1, e),
            spin: Double.pi * 4 * e,
            alpha: 1,
            arrived: false
        )
    }

    public static func endingCredit(_ t: Double) -> (index: Int, alpha: Double) {
        let local = t - Ending.creditsStart
        if local < 0 || t >= Ending.finaleStart { return (-1, 0) }
        let index = min(campaignPieces - 1, Int((local / Ending.creditSeconds).rounded(.down)))
        let within = local - Double(index) * Ending.creditSeconds
        let alpha = smooth01(within / 0.6) * (1 - smooth01((within - (Ending.creditSeconds - 0.6)) / 0.6))
        return (index, alpha)
    }

    public static func endingEmblemOrbit(_ i: Int, t: Double, reducedMotion: Bool) -> (x: Double, y: Double, alpha: Double) {
        let alpha = smooth01((t - Ending.finaleStart - 0.6) / 0.6)
        let spinT = reducedMotion ? 0 : t - Ending.finaleStart
        let angle = Double.pi / 2 + (Double.pi * 2 * Double(i)) / Double(campaignPieces) + 0.6 * spinT
        return (cos(angle) * 1.05, 0.05 + sin(angle) * 0.82, alpha)
    }

    /// The molar smiles at everyone who finishes; gold in every city also earns the wink, and a goodbye wink.
    public static func endingFace(_ t: Double, allGold: Bool) -> (alpha: Double, wink: Bool) {
        func winking(_ at: Double) -> Bool { t >= at && t < at + 0.35 }
        return (smooth01((t - Ending.face) / 0.5), allGold && (winking(Ending.wink) || winking(Ending.goodbyeWink)))
    }

    public static let endingBursts: [FinaleBurst] = [
        FinaleBurst(t: 0.3, x: -1.1, y: 0.55, kind: .peony, colorHex: 0xfde047, color2Hex: 0xf97316),
        FinaleBurst(t: 0.9, x: 1.15, y: 0.7, kind: .ring, colorHex: 0x67e8f9, color2Hex: 0xf8fafc),
        FinaleBurst(t: 1.6, x: -0.7, y: 0.95, kind: .willow, colorHex: 0xfef3c7, color2Hex: 0xf59e0b),
        FinaleBurst(t: 2.3, x: 0.8, y: 1.0, kind: .peony, colorHex: 0xf472b6, color2Hex: 0xfde047),
        FinaleBurst(t: 3.0, x: -1.25, y: 0.9, kind: .ring, colorHex: 0x4ade80, color2Hex: 0xfde047),
        FinaleBurst(t: 3.7, x: 1.2, y: 0.4, kind: .peony, colorHex: 0xa78bfa, color2Hex: 0xf8fafc),
        FinaleBurst(t: 4.4, x: -0.4, y: 1.1, kind: .ring, colorHex: 0xfde047, color2Hex: 0xf8fafc),
        FinaleBurst(t: 5.0, x: 0.45, y: 1.15, kind: .willow, colorHex: 0xfef3c7, color2Hex: 0xfbbf24),
        FinaleBurst(t: 5.6, x: -1.2, y: 0.35, kind: .peony, colorHex: 0xf87171, color2Hex: 0xfde047),
        FinaleBurst(t: 6.2, x: 1.25, y: 0.9, kind: .ring, colorHex: 0x5eead4, color2Hex: 0xfde047),
    ]
    public static let endingBurstScale = 0.12

    public static func endingGoldRain(_ t: Double, halfWidth: Double) -> [(x: Double, y: Double, alpha: Double)] {
        let start = Ending.face
        if t < start { return [] }
        var out: [(x: Double, y: Double, alpha: Double)] = []
        for k in 0..<60 {
            let a = t - start - 0.05 * Double(k)
            if a < 0 { continue }
            let fall = (a * (0.45 + 0.35 * hash(k, 301))).truncatingRemainder(dividingBy: 2.6)
            out.append((
                (hash(k, 302) * 2 - 1) * halfWidth + 0.05 * sin(a * 3 + Double(k)),
                1.3 - fall,
                0.6 + 0.4 * sin(a * 9 + Double(k))
            ))
        }
        return out
    }

    public static func endingNotes(_ plans: [CityFinalePlan], allGold: Bool) -> [FinaleNote] {
        var notes: [FinaleNote] = []
        func add(_ t: Double, _ voice: FinaleVoice, _ midi: Int, _ dur: Double, _ vel: Double, _ pan: Double = 0) {
            notes.append(FinaleNote(t: t, voice: voice, midi: midi, dur: dur, vel: vel, pan: pan))
        }
        let home = plans.first?.tonic ?? 60
        add(0.05, .pad, home - 12, 3.0, 0.3)
        add(0.05, .pad, home - 5, 3.0, 0.2)
        for (i, plan) in plans.enumerated() {
            let at = Ending.firstPiece + Double(i) * Ending.pieceGap
            add(at, .whoosh, plan.tonic, 0.8, 0.3)
            add(at + Ending.pieceFlight, FinaleVoice(plan.voice), plan.tonic + 12, 0.5, 0.6)
            add(at + Ending.pieceFlight + 0.1, FinaleVoice(plan.voice), plan.tonic + 19, 0.7, 0.55)
        }
        add(Ending.snap, .boom, home, 1.2, 0.65)
        for (k, iv) in [7, 9, 11, 12, 16, 19, 24].enumerated() {
            let last = k == 6
            add(Ending.snap + 0.13 * Double(k), .bell, home + 12 + iv, last ? 1.6 : 0.2, 0.5)
            add(Ending.snap + 0.13 * Double(k), .rhodes, home + iv, last ? 1.6 : 0.2, 0.6)
        }
        for iv in [0, 4, 7, 11] { add(Ending.snap + 0.9, .pad, home + iv, 2.4, 0.3) }
        for (i, plan) in plans.enumerated() {
            let at = Ending.creditsStart + Double(i) * Ending.creditSeconds
            for (k, step) in riff.enumerated() {
                if let step { add(at + Double(k) * Self.step, FinaleVoice(plan.voice), plan.tonic + 12 + step, 0.3, 0.45) }
            }
            add(at + Double(riff.count) * Self.step, FinaleVoice(plan.voice), plan.tonic + 12, 1.6, 0.45)
            add(at + Double(riff.count) * Self.step, .bell, plan.tonic + 24, 1.2, 0.3)
            for k in 0..<6 { add(at + Double(k), .bass, plan.tonic - 24 + (k % 2 == 0 ? 0 : 7), 0.8, 0.4) }
        }
        add(Ending.finaleStart, .boom, home, 1.2, 0.55)
        for iv in [0, 4, 7, 12] { add(Ending.finaleStart + 0.1, .rhodes, home + iv, 2.2, 0.5) }
        for burst in endingBursts {
            let at = Ending.finaleStart + burst.t
            add(at, .whistle, home, 0.9, 0.28, clamp(burst.x / 1.4, -0.9, 0.9))
            add(at + 0.9, .boom, home, 1.1, 0.45, clamp(burst.x / 1.4, -0.9, 0.9))
        }
        if allGold {
            for k in 0..<10 { add(Ending.face + 0.06 * Double(k), .celesta, home + 12 + penta(k), 0.5, 0.45) }
            add(Ending.wink, .sparkle, home, 0.9, 0.55)
            add(Ending.wink + 0.05, .kalimba, home + 24, 0.4, 0.55)
            add(Ending.wink + 0.2, .kalimba, home + 31, 0.6, 0.55)
            add(Ending.goodbyeWink, .sparkle, home, 0.9, 0.45)
            add(Ending.goodbyeWink + 0.05, .kalimba, home + 24, 0.4, 0.45)
            add(Ending.goodbyeWink + 0.2, .kalimba, home + 31, 0.6, 0.45)
        }
        // where a recorded song ends: the theme resolves
        for iv in [0, 4, 7, 11, 14] { add(Ending.songEnd - 2.0, .rhodes, home + iv, 1.9, 0.45) }
        add(Ending.songEnd - 2.0, .pad, home - 12, 2.0, 0.35)
        // the long hug (bars 31-36): a music-box lullaby, which plays after a recorded song too
        // (endingNotePlaysOverSong): (seconds after songEnd, steps above home + 12, length)
        let lullaby: [(Double, Int, Double)] = [
            (0, 16, 0.5), (0.5, 12, 0.5), (1, 7, 1), (2, 9, 0.5), (2.5, 7, 0.5), (3, 4, 1),
            (4, 16, 0.5), (4.5, 12, 0.5), (5, 7, 1), (6, 5, 0.5), (6.5, 4, 0.5), (7, 2, 1),
            (8, 4, 0.5), (8.5, 7, 0.5), (9, 12, 1),
        ]
        for (at, step, dur) in lullaby { add(Ending.songEnd + at, .celesta, home + 12 + step, dur, 0.32) }
        for (k, chord) in [[0, 4, 7], [5, 9, 12], [0, 4, 7], [7, 11, 14], [0, 4, 7]].enumerated() {
            for iv in chord { add(Ending.songEnd + 2 * Double(k), .pad, home + iv, 2.0, 0.2) }
        }
        for at in Ending.squeezes where at >= Ending.songEnd { add(at, .kalimba, home + 24, 0.5, 0.3) }
        for iv in [0, 4, 7, 11, 14] { add(Ending.end - 2.0, .rhodes, home + iv, 1.9, 0.4) }
        add(Ending.end - 2.0, .pad, home - 12, 2.0, 0.3)
        return sortedStable(notes)
    }

    // MARK: - Parity

    static func sumNotes(_ notes: [FinaleNote]) -> Double {
        var s = 0.0
        for n in notes {
            s += n.t * 3 + Double(n.midi) * 0.7 + n.dur + n.vel * 5 + n.pan * 11 + Double(n.voice.rawValue.count)
        }
        return s
    }

    /// Matches finaleChecksum in src/config/cityFinale.ts (to a hundredth).
    public static func checksum(_ plan: CityFinalePlan, emblem: [SkylinePiece], slotIndex: Int, reducedMotion: Bool) -> Double {
        var sum = 0.0
        let layers: [FinaleLayer] = [.light, .scenery, .sky]
        let targets = emblemTargets(emblem)
        // Cities up to this one cleaned (so the last one climbs to the top), the rest still to do.
        let finishes = checksumFinishes(slotIndex)
        let atTop = climbStatus(finishes).left == 0
        var t = 0.0
        while t <= end {
            let p = probe(t, reducedMotion: reducedMotion, climbTo: slotIndex, summit: atTop)
            sum += p.x * 1.1 + p.y * 1.3 + p.alpha
            let pc = piece(t, slotIndex: slotIndex, reducedMotion: reducedMotion)
            sum += pc.x + pc.y * 1.7 + pc.scale + pc.spin * 0.1 + pc.glow + pc.alpha
            let m = molar(t, reducedMotion: reducedMotion)
            sum += m.alpha + m.scale + m.x * 0.7 + m.y * 0.9
            let mt = mountain(t, reducedMotion: reducedMotion)
            sum += mt.alpha + mt.dy * 0.3
            for i in -1...campaignPieces {
                let l = ledge(i, t: t, reducedMotion: reducedMotion)
                sum += l.x * 0.05 + l.y * 0.07
            }
            let cam = camera(t, reducedMotion: reducedMotion)
            sum += cam.cx * 0.01 + cam.viewW * 0.01
            for cx in [-2.0, 10, 30, 50, 66] {
                for layer in layers {
                    let tint = cityTint(t, cx: cx, layer: layer, show: plan.show, reducedMotion: reducedMotion)
                    sum += tint.level + tint.flash
                }
            }
            let showT = t - blazeEnd
            for (b, burst) in plan.bursts.enumerated() {
                if let r = rocket(burst, showT: showT, show: plan.show) { sum += r.y }
                for s in burstSparks(burst, index: b, showT: showT, show: plan.show) { sum += s.x * 0.01 + s.y * 0.02 + s.alpha + s.mix }
            }
            for bead in beads(showT) { sum += bead.x * 0.01 + bead.y * 0.02 }
            for balloon in balloons(showT) { sum += balloon.x * 0.01 + balloon.y * 0.02 }
            for meteor in meteors(showT) { sum += meteor.x * 0.01 + meteor.y * 0.02 + meteor.alpha }
            let h = host(t, reducedMotion: reducedMotion)
            sum += h.rise + h.wave
            if let r = emblemRocket(t) { sum += r.y }
            let shape = emblemShape(t)
            sum += shape.x + shape.y * 1.3 + shape.scale + shape.alpha
            for (i, target) in targets.enumerated() {
                if let spark = emblemSpark(target, index: i, t: t) { sum += spark.x + spark.y * 1.3 + spark.alpha }
            }
            sum += slotShine(t) + backdropDim(t)
            t += 0.37
        }
        for target in targets { sum += target.x * 0.5 + target.y * 0.25 + Double(target.colorHex % 997) * 0.001 }
        for finish in [MolarFinish.empty, .pearl, .silver, .gold] {
            let withFinish = finishes.enumerated().map { $0.offset == slotIndex ? finish : $0.element }
            sum += sumNotes(notes(plan, finishes: withFinish, slotIndex: slotIndex, reducedMotion: reducedMotion)) * 0.001
        }
        let status = climbStatus(finishes)
        sum += Double(status.left) * 3 + Double(status.next) * 5
        return (sum * 1000).rounded() / 1000
    }

    /// Matches endingChecksum in src/config/cityFinale.ts (to a hundredth).
    public static func endingChecksum(_ plans: [CityFinalePlan], allGold: Bool, reducedMotion: Bool) -> Double {
        var sum = 0.0
        var t = 0.0
        while t <= Ending.end {
            let place = endingMolarPlace(t, reducedMotion: reducedMotion)
            sum += place.x + place.y * 1.3 + place.scale + place.alpha
            for i in 0..<campaignPieces {
                let p = endingPiece(i, t: t, reducedMotion: reducedMotion)
                sum += p.x + p.y * 1.7 + p.scale + p.spin * 0.1 + p.alpha + (p.arrived ? 1 : 0)
                let o = endingEmblemOrbit(i, t: t, reducedMotion: reducedMotion)
                sum += o.x + o.y * 1.1 + o.alpha
            }
            let credit = endingCredit(t)
            sum += Double(credit.index) + credit.alpha
            let face = endingFace(t, allGold: allGold)
            sum += face.alpha + (face.wink ? 1 : 0)
            let showT = t - Ending.finaleStart
            for (b, burst) in endingBursts.enumerated() {
                for s in burstSparks(burst, index: b, showT: showT, show: .fireworks, scale: endingBurstScale) { sum += s.x + s.y * 2 + s.alpha }
            }
            for d in endingGoldRain(t, halfWidth: 1.6) { sum += d.x + d.y * 1.3 + d.alpha }
            t += 0.41
        }
        // the hug, finely, so every beat counts: arms out, the fold on the wink, the squeezes, the eyes, the hearts
        var h = Ending.face
        while h <= Ending.end {
            let hug = endingHug(h, reducedMotion: reducedMotion)
            sum += hug.arms * 1.3 + hug.open * 1.7 + hug.fold * 1.9
            sum += hug.squeeze * 2.3 + (hug.happyEyes ? 1.0 : 0.0) + hug.hearts * 2.9
            for k in 0..<Ending.hearts { sum += endingHeart(k, t: h, reducedMotion: reducedMotion).fade * 0.3 }
            h += 0.1
        }
        sum += sumNotes(endingNotes(plans, allGold: allGold)) * 0.001
        return (sum * 1000).rounded() / 1000
    }

    /// The five campaign cities' finale plans, in order (nil for any city without one).
    public static func campaignPlans() -> [CityFinalePlan] {
        hostIds.compactMap { CitySkyline.art(forHost: $0)?.finale }
    }
}
