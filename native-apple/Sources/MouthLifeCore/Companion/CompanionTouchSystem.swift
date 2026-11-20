import Foundation

public struct TouchHit: Codable, Equatable, Sendable {
    public var x: Double
    public var y: Double
    public var z: Double
    public var crownIndex: Int?

    public init(x: Double, y: Double, z: Double, crownIndex: Int? = nil) {
        self.x = x
        self.y = y
        self.z = z
        self.crownIndex = crownIndex
    }
}

public struct SugarSplat: Codable, Equatable, Sendable, Identifiable {
    public var id: Int
    public var crownIndex: Int
    public var x: Double
    public var y: Double
    public var z: Double
    /// Remaining sugar-plaque coverage 0..1 (polished down by rub strokes).
    public var amount: Double
    /// Splat-in animation 0..1 (pops in over ~0.35 s).
    public var grow: Double

    public init(
        id: Int,
        crownIndex: Int,
        x: Double,
        y: Double,
        z: Double,
        amount: Double = 1.0,
        grow: Double = 0.0
    ) {
        self.id = id
        self.crownIndex = crownIndex
        self.x = x
        self.y = y
        self.z = z
        self.amount = amount
        self.grow = grow
    }
}

public struct RenderSplat: Codable, Equatable, Sendable, Identifiable {
    public var id: Int
    public var crownIndex: Int
    public var x: Double
    public var y: Double
    public var z: Double
    public var amount: Double

    public init(id: Int, crownIndex: Int, x: Double, y: Double, z: Double, amount: Double) {
        self.id = id
        self.crownIndex = crownIndex
        self.x = x
        self.y = y
        self.z = z
        self.amount = amount
    }
}

public struct TouchRipple: Codable, Equatable, Sendable, Identifiable {
    public var id: Int
    public var x: Double
    public var y: Double
    public var z: Double
    public var crownIndex: Int?
    /// Scene clock time the ripple started (seconds).
    public var t: Double

    public init(id: Int, x: Double, y: Double, z: Double, crownIndex: Int? = nil, t: Double) {
        self.id = id
        self.x = x
        self.y = y
        self.z = z
        self.crownIndex = crownIndex
        self.t = t
    }
}

public struct ActiveTouchRipple: Codable, Equatable, Sendable, Identifiable {
    public var id: Int
    public var x: Double
    public var y: Double
    public var z: Double
    public var crownIndex: Int?
    public var ageSec: Double
    /// Decayed specular ripple envelope 0..1.
    public var strength: Double

    public init(
        id: Int,
        x: Double,
        y: Double,
        z: Double,
        crownIndex: Int? = nil,
        ageSec: Double,
        strength: Double
    ) {
        self.id = id
        self.x = x
        self.y = y
        self.z = z
        self.crownIndex = crownIndex
        self.ageSec = ageSec
        self.strength = strength
    }
}

public enum TouchPhase: String, Codable, CaseIterable, Equatable, Sendable {
    case down
    case move
    case up
}

public enum TouchSoundKind: String, Codable, CaseIterable, Equatable, Sendable {
    case glass
    case thud
}

public enum TouchHapticStyle: String, Codable, CaseIterable, Equatable, Sendable {
    case none
    case lightCrystal
    case softSquish
    case polishSparkle
}

public struct TouchFeedback: Codable, Equatable, Sendable {
    public var sound: TouchSoundKind?
    /// Rising glass-harp scale step (0 = first note of a stroke).
    public var noteStep: Int
    /// Chime frequency in Hz when `sound != nil` (pentatonic glass-harp note or low squish thud).
    public var frequencyHz: Double?
    public var sparkle: Bool
    public var onSplat: Bool
    public var splatsCleared: Int
    public var smoothnessGained: Double
    public var haptic: TouchHapticStyle

    public init(
        sound: TouchSoundKind? = nil,
        noteStep: Int = 0,
        frequencyHz: Double? = nil,
        sparkle: Bool = false,
        onSplat: Bool = false,
        splatsCleared: Int = 0,
        smoothnessGained: Double = 0.0,
        haptic: TouchHapticStyle = .none
    ) {
        self.sound = sound
        self.noteStep = noteStep
        self.frequencyHz = frequencyHz
        self.sparkle = sparkle
        self.onSplat = onSplat
        self.splatsCleared = splatsCleared
        self.smoothnessGained = smoothnessGained
        self.haptic = haptic
    }
}

/// Direct touch-the-teeth "Smooth Bask" toy interactivity for the 14-crown Companion Arch (HUB & REPORT).
///
/// Thread safety: touches arrive on the main thread (UIKit / AppKit) while SceneKit's render thread
/// steps the animation and reads the ripples and splats every frame. Every public member holds
/// `lock` for its whole call, so each call sees and leaves one consistent state. The lock is held for
/// a few microseconds, never across I/O, and the render-side calls (`step`, `fadeSplatsForPacer`,
/// `fillActiveRipples`, `fillRenderSplats`) do not allocate under it.
public final class CompanionTouchSystem: @unchecked Sendable {
    public static let crownCount: Int = 14
    public static let glassHarpSmoothness: Double = 50.0
    public static let maxSplats: Int = 6
    public static let maxRipples: Int = 4
    public static let rippleLifetimeSec: Double = 0.85

    public static let noteSpacingUnits: Double = 0.55
    public static let noteMinIntervalSec: Double = 0.075
    public static let strokeResetSec: Double = 0.9
    public static let splatPolishRadius: Double = 1.35
    public static let polishPerUnit: Double = 0.32
    public static let polishPerTap: Double = 0.14
    public static let rippleSpacingUnits: Double = 0.9

    /// 14-crown F-major pentatonic glass-harp scale frequencies (Hz), matching the Hub key (F4 = MIDI 65 ascending).
    public static let crownPentatonicFrequenciesHz: [Double] = {
        let majorPentOffsets = [0, 2, 4, 7, 9]
        let baseMidi = 65 // F4 (349.23 Hz)
        return (0..<crownCount).map { idx in
            let octave = idx / majorPentOffsets.count
            let degree = idx % majorPentOffsets.count
            let midi = baseMidi + octave * 12 + majorPentOffsets[degree]
            return 440.0 * pow(2.0, Double(midi - 69) / 12.0)
        }
    }()

    /// 16-step rising stroke pentatonic frequencies (Hz) for multi-crown rub glissandos.
    public static let stepPentatonicFrequenciesHz: [Double] = {
        let majorPentOffsets = [0, 2, 4, 7, 9]
        let baseMidi = 65 // F4
        return (0..<16).map { step in
            let octave = step / majorPentOffsets.count
            let degree = step % majorPentOffsets.count
            let midi = baseMidi + octave * 12 + majorPentOffsets[degree]
            return 440.0 * pow(2.0, Double(midi - 69) / 12.0)
        }
    }()

    /// Canonical 14-crown parabolic 3D arch anchors (Right 2nd Molar `0` -> Left 2nd Molar `13`).
    public static let defaultCrownAnchors: [TouchHit] = (0..<crownCount).map { idx in
        let u = (Double(idx) - 6.5) / 6.5 // -1.0 .. +1.0
        let x = 32.0 + u * 8.4
        let y = 2.0
        let z = 23.2 - (u * u) * 5.8
        return TouchHit(x: x, y: y, z: z, crownIndex: idx)
    }

    public static func frequency(forCrownIndex crownIndex: Int) -> Double {
        let clamped = max(0, min(crownCount - 1, crownIndex))
        return crownPentatonicFrequenciesHz[clamped]
    }

    public static func frequency(forNoteStep step: Int) -> Double {
        let clamped = max(0, min(stepPentatonicFrequenciesHz.count - 1, step))
        return stepPentatonicFrequenciesHz[clamped]
    }

    public static func anchor(forCrownIndex crownIndex: Int) -> TouchHit {
        let clamped = max(0, min(crownCount - 1, crownIndex))
        return defaultCrownAnchors[clamped]
    }

    /// Guards every stored property below (see the type's note on thread safety).
    private let lock = NSLock()
    private var liveSplats: [SugarSplat] = []
    private var liveRipples: [TouchRipple] = []
    private var liveClearedTotal: Int = 0

    private var nextSplatId: Int = 1
    private var nextRippleId: Int = 1
    private var rippleCursor: Int = 0
    private var lastHit: TouchHit?
    private var distSinceNote: Double = 0.0
    private var distSinceRipple: Double = 0.0
    private var noteStep: Int = 0
    private var lastNoteSec: Double = -99.0

    public init() {
        liveSplats.reserveCapacity(Self.maxSplats)
        liveRipples.reserveCapacity(Self.maxRipples)
    }

    public var splats: [SugarSplat] {
        lock.lock()
        defer { lock.unlock() }
        return liveSplats
    }

    public var ripples: [TouchRipple] {
        lock.lock()
        defer { lock.unlock() }
        return liveRipples
    }

    public var splatsClearedTotal: Int {
        lock.lock()
        defer { lock.unlock() }
        return liveClearedTotal
    }

    public var activeSplatCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return liveSplats.count
    }

    /// Splats localized sticky sugar-plaque onto up to `count` tooth anchor points.
    @discardableResult
    public func spawnTreatSplats(
        anchors: [TouchHit] = CompanionTouchSystem.defaultCrownAnchors,
        count: Int = 3,
        seed: Int64 = CompanionArchSim.currentEpochMs()
    ) -> [SugarSplat] {
        lock.lock()
        defer { lock.unlock() }
        var added: [SugarSplat] = []
        guard !anchors.isEmpty, count > 0 else { return added }

        let absSeed = seed == Int64.min ? Int64.max : abs(seed)
        var r = Int(absSeed % 2_147_483_647)
        if r == 0 { r = 1 }
        func rand() -> Double {
            r = Int((Int64(r) * 48_271) % 2_147_483_647)
            return Double(r) / 2_147_483_647.0
        }

        var used = Set<Int>()
        let limit = min(count, anchors.count)
        for _ in 0..<limit {
            var idx = min(anchors.count - 1, Int(floor(rand() * Double(anchors.count))))
            var tries = 0
            while tries < anchors.count && used.contains(idx) {
                idx = (idx + 1) % anchors.count
                tries += 1
            }
            used.insert(idx)
            let a = anchors[idx]
            let splat = SugarSplat(
                id: nextSplatId,
                crownIndex: a.crownIndex ?? (idx % Self.crownCount),
                x: a.x,
                y: a.y,
                z: a.z,
                amount: 1.0,
                grow: 0.0
            )
            nextSplatId += 1
            if liveSplats.count >= Self.maxSplats {
                liveSplats.removeFirst()
            }
            liveSplats.append(splat)
            added.append(splat)
        }
        return added
    }

    /// Effective (animated) splat coverage for shader upload.
    public func getRenderSplats() -> [RenderSplat] {
        var out: [RenderSplat] = []
        fillRenderSplats(into: &out)
        return out
    }

    /// Returns active ripples with smooth linear/cosine decay over `rippleLifetimeSec`.
    public func activeRipples(nowSec: Double) -> [ActiveTouchRipple] {
        var out: [ActiveTouchRipple] = []
        fillActiveRipples(nowSec: nowSec, into: &out)
        return out
    }

    /// `getRenderSplats()` for the 120 Hz renderer: empties `out` (keeping its capacity) and appends
    /// the same values in the same order. Reserve `maxSplats` once and no frame allocates.
    public func fillRenderSplats(into out: inout [RenderSplat]) {
        lock.lock()
        defer { lock.unlock() }
        out.removeAll(keepingCapacity: true)
        for s in liveSplats {
            out.append(Self.renderSplat(for: s))
        }
    }

    /// `activeRipples(nowSec:)` for the 120 Hz renderer: empties `out` (keeping its capacity) and
    /// appends the same values in the same order. Reserve `maxRipples` once and no frame allocates.
    public func fillActiveRipples(nowSec: Double, into out: inout [ActiveTouchRipple]) {
        lock.lock()
        defer { lock.unlock() }
        out.removeAll(keepingCapacity: true)
        for r in liveRipples {
            if let active = Self.activeRipple(for: r, nowSec: nowSec) {
                out.append(active)
            }
        }
    }

    private static func renderSplat(for s: SugarSplat) -> RenderSplat {
        let pop: Double
        if s.grow < 1.0 {
            pop = sin(s.grow * .pi * 0.5) * (1.0 + 0.25 * sin(s.grow * .pi))
        } else {
            pop = 1.0
        }
        return RenderSplat(
            id: s.id,
            crownIndex: s.crownIndex,
            x: s.x,
            y: s.y,
            z: s.z,
            amount: s.amount * pop
        )
    }

    private static func activeRipple(for r: TouchRipple, nowSec: Double) -> ActiveTouchRipple? {
        let age = nowSec - r.t
        guard age >= 0.0, age < rippleLifetimeSec else { return nil }
        let norm = age / rippleLifetimeSec
        let strength = 0.5 * (1.0 + cos(norm * .pi))
        return ActiveTouchRipple(
            id: r.id,
            x: r.x,
            y: r.y,
            z: r.z,
            crownIndex: r.crownIndex,
            ageSec: age,
            strength: strength
        )
    }

    private static func distance3D(_ a: TouchHit, _ b: TouchHit) -> Double {
        let dx = a.x - b.x
        let dy = a.y - b.y
        let dz = a.z - b.z
        return (dx * dx + dy * dy + dz * dz).squareRoot()
    }

    /// Registers a pointer touch / rub sample on the crowns.
    public func registerTouch(
        hit: TouchHit,
        phase: TouchPhase,
        nowSec: Double,
        smoothness: Double
    ) -> TouchFeedback {
        lock.lock()
        defer { lock.unlock() }
        return registerTouchLocked(hit: hit, phase: phase, nowSec: nowSec, smoothness: smoothness)
    }

    /// `registerTouch` with `lock` already held.
    private func registerTouchLocked(
        hit: TouchHit,
        phase: TouchPhase,
        nowSec: Double,
        smoothness: Double
    ) -> TouchFeedback {
        if phase == .up {
            endTouchLocked()
            return TouchFeedback()
        }

        var feedback = TouchFeedback()

        var travelled = 0.0
        if phase == .move, let prev = lastHit {
            travelled = Self.distance3D(hit, prev)
            // Ignore teleports between distant crowns (pointer slid off and back on)
            if travelled > 3.0 {
                travelled = 0.0
            }
        }
        lastHit = hit

        if nowSec - lastNoteSec > Self.strokeResetSec {
            noteStep = 0
        }

        // Mini-polish strokes scrub nearby sugar splats
        let polish = (phase == .down) ? Self.polishPerTap : (travelled * Self.polishPerUnit)
        for idx in liveSplats.indices.reversed() {
            let s = liveSplats[idx]
            let dx = hit.x - s.x
            let dy = hit.y - s.y
            let dz = hit.z - s.z
            let d = (dx * dx + dy * dy + dz * dz).squareRoot()
            if d > Self.splatPolishRadius { continue }
            feedback.onSplat = true
            liveSplats[idx].amount -= polish * (1.0 - 0.5 * (d / Self.splatPolishRadius))
            if liveSplats[idx].amount <= 0.04 {
                liveSplats.remove(at: idx)
                feedback.splatsCleared += 1
                liveClearedTotal += 1
            }
        }

        if feedback.splatsCleared > 0 {
            feedback.smoothnessGained = Double(feedback.splatsCleared) * CompanionArchSim.miniPolishSmoothnessPerSplat
        }

        // Specular ripple + note cadence
        distSinceNote += travelled
        distSinceRipple += travelled
        let wantsNote =
            (phase == .down || distSinceNote >= Self.noteSpacingUnits) &&
            (nowSec - lastNoteSec >= Self.noteMinIntervalSec)

        if phase == .down || distSinceRipple >= Self.rippleSpacingUnits {
            distSinceRipple = 0.0
            let ripple = TouchRipple(
                id: nextRippleId,
                x: hit.x,
                y: hit.y,
                z: hit.z,
                crownIndex: hit.crownIndex,
                t: nowSec
            )
            nextRippleId += 1
            if liveRipples.count < Self.maxRipples {
                liveRipples.append(ripple)
            } else {
                liveRipples[rippleCursor] = ripple
            }
            rippleCursor = (rippleCursor + 1) % Self.maxRipples
        }

        if wantsNote {
            distSinceNote = 0.0
            lastNoteSec = nowSec
            let glassy = smoothness >= Self.glassHarpSmoothness && !feedback.onSplat
            feedback.sound = glassy ? .glass : .thud
            feedback.noteStep = noteStep
            if glassy {
                if phase == .down, let crownIndex = hit.crownIndex {
                    feedback.frequencyHz = Self.frequency(forCrownIndex: crownIndex)
                } else {
                    feedback.frequencyHz = Self.frequency(forNoteStep: noteStep)
                }
                feedback.haptic = feedback.splatsCleared > 0 ? .polishSparkle : .lightCrystal
            } else {
                feedback.frequencyHz = 150.0
                feedback.haptic = feedback.splatsCleared > 0 ? .polishSparkle : .softSquish
            }
            feedback.sparkle = glassy || feedback.splatsCleared > 0
            noteStep = min(noteStep + 1, 15)
        } else if feedback.splatsCleared > 0 {
            feedback.sparkle = true
            feedback.haptic = .polishSparkle
        }

        return feedback
    }

    /// Convenience direct-rub entry point for a specific sculpted crown (`0..13`).
    public func rubTooth(
        crownIndex: Int,
        hit: TouchHit? = nil,
        phase: TouchPhase = .move,
        nowSec: Double,
        smoothness: Double
    ) -> TouchFeedback {
        var resolved = hit ?? Self.anchor(forCrownIndex: crownIndex)
        resolved.crownIndex = max(0, min(Self.crownCount - 1, crownIndex))
        return registerTouch(hit: resolved, phase: phase, nowSec: nowSec, smoothness: smoothness)
    }

    /// Convenience direct-rub entry point targeting an active sugar splat by its `id`.
    public func rubSplat(
        splatId: Int,
        strokeOffset: Double = 0.35,
        phase: TouchPhase = .move,
        nowSec: Double,
        smoothness: Double
    ) -> TouchFeedback {
        lock.lock()
        defer { lock.unlock() }
        return rubSplatLocked(
            splatId: splatId,
            strokeOffset: strokeOffset,
            phase: phase,
            nowSec: nowSec,
            smoothness: smoothness
        )
    }

    /// Convenience direct-rub entry point targeting an active sugar splat by array index.
    public func rubSplat(
        at index: Int,
        strokeOffset: Double = 0.35,
        phase: TouchPhase = .move,
        nowSec: Double,
        smoothness: Double
    ) -> TouchFeedback {
        lock.lock()
        defer { lock.unlock() }
        guard liveSplats.indices.contains(index) else {
            return TouchFeedback()
        }
        return rubSplatLocked(
            splatId: liveSplats[index].id,
            strokeOffset: strokeOffset,
            phase: phase,
            nowSec: nowSec,
            smoothness: smoothness
        )
    }

    /// `rubSplat(splatId:...)` with `lock` already held.
    private func rubSplatLocked(
        splatId: Int,
        strokeOffset: Double,
        phase: TouchPhase,
        nowSec: Double,
        smoothness: Double
    ) -> TouchFeedback {
        guard let target = liveSplats.first(where: { $0.id == splatId }) else {
            return TouchFeedback()
        }
        let jitterX = (phase == .move) ? sin(nowSec * 24.0) * strokeOffset : 0.0
        let hit = TouchHit(
            x: target.x + jitterX,
            y: target.y,
            z: target.z,
            crownIndex: target.crownIndex
        )
        return registerTouchLocked(hit: hit, phase: phase, nowSec: nowSec, smoothness: smoothness)
    }

    public func endTouch() {
        lock.lock()
        defer { lock.unlock() }
        endTouchLocked()
    }

    private func endTouchLocked() {
        lastHit = nil
        distSinceNote = 0.0
        distSinceRipple = 0.0
    }

    public func step(dt: Double, nowSec: Double? = nil) {
        guard dt > 0 else { return }
        lock.lock()
        defer { lock.unlock() }
        for idx in liveSplats.indices where liveSplats[idx].grow < 1.0 {
            liveSplats[idx].grow = min(1.0, liveSplats[idx].grow + dt / 0.35)
        }
        if let nowSec {
            liveRipples.removeAll { nowSec - $0.t > Self.rippleLifetimeSec * 4.0 }
            if rippleCursor >= max(1, liveRipples.count) {
                rippleCursor = liveRipples.count % Self.maxRipples
            }
        }
    }

    public func fadeSplatsForPacer(elapsedSec: Double) {
        let cap = max(0.0, 1.0 - elapsedSec / 40.0)
        lock.lock()
        defer { lock.unlock() }
        for idx in liveSplats.indices {
            liveSplats[idx].amount = min(liveSplats[idx].amount, cap)
        }
    }

    public func clearAll() {
        lock.lock()
        defer { lock.unlock() }
        liveSplats.removeAll(keepingCapacity: true)
        endTouchLocked()
    }
}
