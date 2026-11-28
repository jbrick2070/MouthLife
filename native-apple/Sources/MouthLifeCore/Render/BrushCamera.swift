import Foundation

// MARK: - The camera: Brush-Along moment by moment, and the numbers every other screen reads
//
// Web twin: `src/engine/render/brushCamera.ts`. Same function names, same numbers; a constant here
// is the same words in SCREAMING_CASE there (`followRateBrush` = `FOLLOW_RATE_BRUSH`). The same test
// cases run on both sides (`BrushCameraTests.swift`, `tests/brushCamera.test.ts`): change both files
// together, then run both suites.
//
// Conventions (both editions). The camera orbits a look point:
// `pos = look + dist * (sin(yaw) cos(pitch), sin(pitch), cos(yaw) cos(pitch))`. It sits on +Z looking
// toward -Z, so +X is screen-right. Positive yaw puts the camera on the patient's right, which is
// screen-right, as in a bathroom mirror (AGENTS.md 2.2): never flip it. Positive pitch looks down
// from above (the lower arch), negative looks up from below (the upper arch). Radians, world units,
// seconds; field of view in degrees. "Arch-local" points are measured from the arch's origin
// (32, 0.4, 16); the upper arch is the lower one mirrored at `y = 3.2`.
//
// Pure: plain Double and SIMD values, no state and nothing allocated, so the 120 Hz render loop may
// call any of it every frame. The brush and floss pick themselves are posed by the renderers; this
// file only supplies the point the camera follows on them (`brushContactLocal`, `flossContactLocal`)
// so both editions follow the same point.

/// One jaw in a Brush-Along view: shown or not, where it sits (arch-local) and how solid it is
/// (1 full, 0.38 a dimmed hint of the opposite jaw).
public struct BrushCameraJaw: Equatable, Sendable {
    public var visible: Bool
    public var offset: SIMD3<Double>
    public var opacity: Double

    public init(visible: Bool, offset: SIMD3<Double>, opacity: Double) {
        self.visible = visible
        self.offset = offset
        self.opacity = opacity
    }
}

/// What the Brush-Along camera reads in one frame.
public struct BrushCameraInput: Sendable {
    /// Where the session is (`BrushPhaseState.evaluate`).
    public var phase: BrushPhaseState
    public var reducedMotion: Bool
    /// The camera's own clock (the rinse's slow sway runs on it). The caller holds it still while
    /// the brush is paused or a Start card is up (`advanceCameraClock`), so the picture stands still.
    public var clockSec: Double
    /// The brush or floss contact the close-up follows, arch-local (`brushContactLocal`,
    /// `flossContactLocal`); nil when there is none (then the close-up looks at the arch's middle).
    public var contactLocal: SIMD3<Double>?
    /// Floss: the two teeth's average outward direction at the gap, as (x, z).
    public var flossOutwardXZ: SIMD2<Double>?
    /// Rinse: how far the phone is in a hand (`GyroSloshSnapshot.handheldBlend01`, 0 lying down).
    public var rinseHandheld01: Double
    /// Rinse: where the swish is, -1 left cheek .. +1 right cheek (`GyroSloshSnapshot.sloshPosition`).
    public var rinseSlosh: Double

    public init(
        phase: BrushPhaseState,
        reducedMotion: Bool,
        clockSec: Double,
        contactLocal: SIMD3<Double>? = nil,
        flossOutwardXZ: SIMD2<Double>? = nil,
        rinseHandheld01: Double = 0,
        rinseSlosh: Double = 0
    ) {
        self.phase = phase
        self.reducedMotion = reducedMotion
        self.clockSec = clockSec
        self.contactLocal = contactLocal
        self.flossOutwardXZ = flossOutwardXZ
        self.rinseHandheld01 = rinseHandheld01
        self.rinseSlosh = rinseSlosh
    }
}

/// Where the Brush-Along camera wants to be. The renderer adds a finger's turn to `yaw` and `pitch`
/// (`brushPitchClamp` on the sum), picks the distance by `isPortrait`, places the camera with
/// `orbitPosition` round the arch origin + `lookLocal`, and follows at `followRate`.
public struct BrushCameraTarget: Equatable, Sendable {
    public var yaw: Double
    public var pitch: Double
    public var distPortrait: Double
    public var distLandscape: Double
    /// The look point, arch-local.
    public var lookLocal: SIMD3<Double>
    /// 1 while a quadrant or floss arch opens zoomed out on the whole mouth, 0 close up.
    public var intro01: Double
    public var upperJaw: BrushCameraJaw
    public var lowerJaw: BrushCameraJaw

    public init(
        yaw: Double,
        pitch: Double,
        distPortrait: Double,
        distLandscape: Double,
        lookLocal: SIMD3<Double>,
        intro01: Double,
        upperJaw: BrushCameraJaw,
        lowerJaw: BrushCameraJaw
    ) {
        self.yaw = yaw
        self.pitch = pitch
        self.distPortrait = distPortrait
        self.distLandscape = distLandscape
        self.lookLocal = lookLocal
        self.intro01 = intro01
        self.upperJaw = upperJaw
        self.lowerJaw = lowerJaw
    }
}

/// A camera's place and the point it looks at, in world space.
public struct CameraPose: Equatable, Sendable {
    public var pos: SIMD3<Double>
    public var look: SIMD3<Double>

    public init(pos: SIMD3<Double>, look: SIMD3<Double>) {
        self.pos = pos
        self.look = look
    }
}

/// The floss's motion through one gap (`flossGapMotion`): how deep it is in the gap (along the
/// arch's gum direction), which tooth wall it leans on (+1 the right-hand tooth, -1 the left) and
/// its small saw toward the cheek.
public struct FlossGapMotion: Equatable, Sendable {
    public var depthIntoGap: Double
    public var leanSide: Double
    public var sawZ: Double

    public init(depthIntoGap: Double, leanSide: Double, sawZ: Double) {
        self.depthIntoGap = depthIntoGap
        self.leanSide = leanSide
        self.sawZ = sawZ
    }
}

public enum BrushCamera {
    // MARK: The picture (every screen)

    /// Narrower than this (width / height) is a portrait picture: a phone or an iPad upright. A
    /// foldable's near-square inner screen (about 0.9) gets the landscape framing.
    public static let portraitAspect: Double = 0.85
    /// Degrees of field of view added per unit of aspect below `portraitAspect`, so an upright phone
    /// still shows the whole arch ...
    public static let portraitFovGainDeg: Double = 46.0
    /// ... up to this.
    public static let maxFovDeg: Double = 64.5

    // MARK: Following (each frame: `pos += (target - pos) * followFactor`)

    public static let followRateBrush: Double = 6.8
    /// Reduce Motion while brushing, flossing and rinsing: a slow, calm follow.
    public static let followRateBrushReducedMotion: Double = 2.4
    /// Arrival, Home, a city stage and the score screen.
    public static let followRateOther: Double = 7.5

    // MARK: A finger turning the view (Home and Brush-Along; points, or CSS pixels on the web)

    public static let dragYawPerPoint: Double = -0.0055
    public static let dragPitchPerPoint: Double = 0.0035
    /// Brush-Along: how far a finger may turn the view from the guided angle.
    public static let brushOrbitYawLimit: Double = 0.85
    public static let brushOrbitPitchLimit: Double = 0.45
    /// Brush-Along: the guided pitch plus the finger's never goes past this either way.
    public static let brushPitchClamp: Double = 0.92
    /// Brush-Along: let go, the finger's turn eases back by `exp(-easeBackRate * dt)` a frame.
    public static let easeBackRate: Double = 2.2

    // MARK: Home (the companion arch)

    public static let hubCenter = SIMD3<Double>(32.0, 1.4, 15.6)
    public static let hubDistPortrait: Double = 36.5
    public static let hubDistLandscape: Double = 22.0
    /// The look point sits this far above the orbit centre (portrait / landscape) and 1 behind it.
    public static let hubLookLiftPortrait: Double = 1.8
    public static let hubLookLiftLandscape: Double = 0.9
    public static let hubLookBack: Double = -1.0
    public static let hubRestYaw: Double = 0.0
    public static let hubRestPitch: Double = 0.34
    public static let hubYawLimit: Double = 0.85
    public static let hubPitchMin: Double = 0.18
    public static let hubPitchMax: Double = 0.82
    /// The phone's tilt in a hand (`GyroSloshSnapshot.parallaxX/Y`, -1..1) turns Home a little.
    public static let hubGyroYawGain: Double = 0.085
    public static let hubGyroPitchGain: Double = 0.048
    public static let hubGyroPitchMin: Double = 0.08
    public static let hubGyroPitchMax: Double = 0.88

    // MARK: Arrival (the crystal, the hardness line-up, fluorapatite, the Earth)

    public static let arrivalYawLimit: Double = 0.75
    public static let arrivalDragYawPerPoint: Double = -0.005
    /// The crystal showcase floats this far above the Earth.
    public static let arrivalShowcaseLift: Double = 38.0
    public static let arrivalGyroYawGain: Double = 0.085
    public static let arrivalGyroLiftGain: Double = 0.85

    // MARK: A city stage (upright and sideways): looks down from the south, never turns

    public static let stageHeightPortrait: Double = 24.0
    public static let stageBackPortrait: Double = 16.0
    public static let stageHeightLandscape: Double = 18.0
    public static let stageBackLandscape: Double = 12.2
    public static let stageLookY: Double = 0.6
    public static let stageLookAhead: Double = -1.0

    // MARK: The score screen: circles the city stage

    public static let reportRadius: Double = 22.0
    public static let reportHeight: Double = 24.0
    public static let reportLookY: Double = 0.5
    public static let reportTurnRate: Double = 0.22
    /// Reduce Motion: the score screen holds this angle instead of circling.
    public static let reportReducedMotionYaw: Double = 0.2

    // MARK: - The picture

    public static func isPortrait(aspect: Double) -> Bool {
        aspect < portraitAspect
    }

    public static func fovDeg(aspect: Double) -> Double {
        min(maxFovDeg, GameConfig.cameraBaseFovDeg + max(0, portraitAspect - aspect) * portraitFovGainDeg)
    }

    /// The camera's place on its orbit round `look`.
    public static func orbitPosition(look: SIMD3<Double>, yaw: Double, pitch: Double, dist: Double) -> SIMD3<Double> {
        look + SIMD3<Double>(
            sin(yaw) * cos(pitch) * dist,
            sin(pitch) * dist,
            cos(yaw) * cos(pitch) * dist
        )
    }

    // MARK: - Following

    public static func followRate(brushAlong: Bool, reducedMotion: Bool) -> Double {
        if brushAlong { return reducedMotion ? followRateBrushReducedMotion : followRateBrush }
        return followRateOther
    }

    /// How much of the way to its target the camera moves in a frame of `dt` seconds. A change of
    /// screen is a cut instead (the renderer snaps to the target).
    public static func followFactor(rate: Double, dt: Double) -> Double {
        1.0 - exp(-rate * max(0.001, dt))
    }

    /// The camera's own clock: runs with the frame, stands still while `held` (the brush paused, a
    /// Start card up), so nothing the camera follows moves then.
    public static func advanceCameraClock(_ clockSec: Double, dt: Double, held: Bool) -> Double {
        held ? clockSec : clockSec + dt
    }

    // MARK: - A finger turning the view

    /// Brush-Along: the finger's turn after a drag of (dx, dy) points, within its limits.
    public static func brushOrbitDrag(yaw: Double, pitch: Double, dxPoints: Double, dyPoints: Double) -> (yaw: Double, pitch: Double) {
        (
            clamp(yaw + dxPoints * dragYawPerPoint, -brushOrbitYawLimit, brushOrbitYawLimit),
            clamp(pitch + dyPoints * dragPitchPerPoint, -brushOrbitPitchLimit, brushOrbitPitchLimit)
        )
    }

    /// Brush-Along: the finger's turn after a frame with no finger on the screen.
    public static func easeBackOffset(_ offset: Double, dt: Double) -> Double {
        offset * exp(-easeBackRate * max(0.001, dt))
    }

    /// Home: the view's turn and tilt after a drag of (dx, dy) points across open space.
    public static func hubOrbitDrag(yaw: Double, pitch: Double, dxPoints: Double, dyPoints: Double) -> (yaw: Double, pitch: Double) {
        (
            clamp(yaw + dxPoints * dragYawPerPoint, -hubYawLimit, hubYawLimit),
            clamp(pitch + dyPoints * dragPitchPerPoint, hubPitchMin, hubPitchMax)
        )
    }

    /// Arrival: the turn round the crystal (or the Earth) after a drag of `dx` points.
    public static func arrivalOrbitDrag(yaw: Double, dxPoints: Double) -> Double {
        clamp(yaw + dxPoints * arrivalDragYawPerPoint, -arrivalYawLimit, arrivalYawLimit)
    }

    // MARK: - The other screens

    /// Home: orbits the companion arch. `parallaxX/Y` is the phone's tilt in a hand (0 without a
    /// gyroscope); `dolly` (1 here) lets the web back off to fit its own panels.
    public static func hubCamera(
        yaw: Double,
        pitch: Double,
        portrait: Bool,
        parallaxX: Double = 0,
        parallaxY: Double = 0,
        dolly: Double = 1
    ) -> CameraPose {
        let dist = (portrait ? hubDistPortrait : hubDistLandscape) * dolly
        let effYaw = yaw + parallaxX * hubGyroYawGain
        let effPitch = clamp(pitch - parallaxY * hubGyroPitchGain, hubGyroPitchMin, hubGyroPitchMax)
        return CameraPose(
            pos: orbitPosition(look: hubCenter, yaw: effYaw, pitch: effPitch, dist: dist),
            look: hubCenter + SIMD3<Double>(0, portrait ? hubLookLiftPortrait : hubLookLiftLandscape, hubLookBack)
        )
    }

    /// Arrival, one framing per beat (0 the crystal, 1 the hardness line-up, 2 fluorapatite, 3 the
    /// Earth). `yaw` is the finger's turn; `parallaxX/Y` the phone's tilt in a hand (0 without a
    /// gyroscope). On the line-up the turn only slides the camera sideways a little (0.45 of the
    /// way), so all five specimens stay in view.
    public static func arrivalCamera(
        beat: Int,
        yaw: Double,
        portrait: Bool,
        parallaxX: Double = 0,
        parallaxY: Double = 0
    ) -> CameraPose {
        let earth = SIMD3<Double>(GameConfig.earthBackdropPos.x, GameConfig.earthBackdropPos.y, GameConfig.earthBackdropPos.z)
        let showcase = earth + SIMD3<Double>(0, arrivalShowcaseLift, 0)
        let lift = parallaxY * arrivalGyroLiftGain
        let turn = yaw + parallaxX * arrivalGyroYawGain
        let s = sin(turn)
        let c = cos(turn)
        switch beat {
        case 0:
            // The hydroxyapatite crystal, centred about a quarter of the way down (the top third).
            let dist = portrait ? 20.0 : 15.5
            return CameraPose(
                pos: showcase + SIMD3<Double>(s * dist, (portrait ? -4.2 : 0.4) + lift, c * dist),
                look: showcase + SIMD3<Double>(0, portrait ? -6.2 : -1.8, 0)
            )
        case 1:
            // The crystal and the five Mohs specimens, from about 13% to 36% down, above the story card.
            let dist = portrait ? 21.5 : 15.0
            return CameraPose(
                pos: showcase + SIMD3<Double>(s * dist * 0.45, (portrait ? -6.4 : -2.6) + lift, 2.2 + c * dist),
                look: showcase + SIMD3<Double>(0, portrait ? -8.4 : -4.8, 2.2)
            )
        case 2:
            // Fluorapatite close up, in the upper third (about 14% to 37% down).
            let dist = portrait ? 17.5 : 13.5
            return CameraPose(
                pos: showcase + SIMD3<Double>(s * dist, (portrait ? -3.6 : 0.2) + lift, c * dist),
                look: showcase + SIMD3<Double>(0, portrait ? -5.4 : -1.5, 0)
            )
        default:
            // The whole Earth with its aurora and Station Aurora, filling about 10% to 51% down.
            let dist = portrait ? 74.0 : 48.0
            return CameraPose(
                pos: earth + SIMD3<Double>(s * dist, (portrait ? -11.5 : -1.0) + lift * 2.0, c * dist),
                look: earth + SIMD3<Double>(0, portrait ? -18.5 : -6.5, 0)
            )
        }
    }

    /// A city stage, upright or sideways: south of the ship, looking down and a little ahead of it.
    public static func stageCamera(probeX: Double, probeZ: Double, portrait: Bool) -> CameraPose {
        CameraPose(
            pos: SIMD3<Double>(
                probeX,
                portrait ? stageHeightPortrait : stageHeightLandscape,
                probeZ + (portrait ? stageBackPortrait : stageBackLandscape)
            ),
            look: SIMD3<Double>(probeX, stageLookY, probeZ + stageLookAhead)
        )
    }

    /// The score screen circles the city stage just played (`stageWidth` x `stageDepth`, 64 x 32).
    /// `dolly` (1 here) lets the web back off to fit its own panels, keeping the angle.
    public static func reportCamera(
        stageWidth: Double,
        stageDepth: Double,
        clockSec: Double,
        reducedMotion: Bool,
        dolly: Double = 1
    ) -> CameraPose {
        let look = SIMD3<Double>(stageWidth * 0.5, reportLookY, stageDepth * 0.5)
        let turn = reducedMotion ? reportReducedMotionYaw : clockSec * reportTurnRate
        let offset = SIMD3<Double>(sin(turn) * reportRadius, reportHeight - reportLookY, cos(turn) * reportRadius)
        return CameraPose(pos: look + offset * dolly, look: look)
    }

    // MARK: - Brush-Along: the moments

    /// The zoom-out as each quadrant starts (its outside step): 1 whole mouth, 0 close up. Holds
    /// wide for 1.05 s, then eases in by 2.75 s. Never under Reduce Motion.
    public static func quadrantIntro01(surface: Int, phaseElapsedSec: Double, reducedMotion: Bool) -> Double {
        if reducedMotion || surface != 0 { return 0 }
        if phaseElapsedSec <= 1.05 { return 1 }
        if phaseElapsedSec >= 2.75 { return 0 }
        return 1.0 - smoothstep(1.05, 2.75, phaseElapsedSec)
    }

    /// The zoom-out as each floss arch starts: holds 0.55 s, eased in by 1.75 s. Never under Reduce
    /// Motion.
    public static func flossArchIntro01(archElapsedSec: Double, reducedMotion: Bool) -> Double {
        if reducedMotion { return 0 }
        if archElapsedSec <= 0.55 { return 1 }
        if archElapsedSec >= 1.75 { return 0 }
        return 1.0 - smoothstep(0.55, 1.75, archElapsedSec)
    }

    /// Floss: the close-up's turn at the gap after crown `contactCIdx` (0 the patient's left back
    /// tooth .. 12 the right; the floss starts at 12, on screen-right), seen about 24 degrees off the
    /// teeth's own outward direction.
    public static func flossCloseYaw(contactCIdx: Int, outwardXZ: SIMD2<Double>) -> Double {
        let baseYaw = atan2(outwardXZ.x, outwardXZ.y)
        if contactCIdx >= 7 { return clamp(baseYaw - 0.42, -0.85, 0.92) }
        if contactCIdx == 6 { return 0.38 }
        return clamp(baseYaw + 0.42, -0.92, 0.85)
    }

    /// Where the brush touches the tooth the camera follows, arch-local. `toothCenter`, `outwardXZ`
    /// (unit, x and z), `halfDepth` and `halfHeight` describe the tooth under the brush (the upper
    /// arch already mirrored); `distFromBack` counts teeth from the back molar (0..6). The brush's
    /// small scrub runs on `clockSec` (none under Reduce Motion).
    public static func brushContactLocal(
        toothCenter: SIMD3<Double>,
        outwardXZ: SIMD2<Double>,
        halfDepth: Double,
        halfHeight: Double,
        surface: Int,
        isUpper: Bool,
        distFromBack: Double,
        clockSec: Double,
        reducedMotion: Bool
    ) -> SIMD3<Double> {
        let outward = SIMD3<Double>(outwardXZ.x, 0, outwardXZ.y)
        let tangent = SIMD3<Double>(outwardXZ.y, 0, -outwardXZ.x)
        let gum: Double = isUpper ? 1 : -1
        let microSweep = reducedMotion ? 0 : sin(clockSec * 9.0) * 0.26
        let microVert = reducedMotion ? 0 : cos(clockSec * 9.0) * 0.08
        switch surface {
        case 0:
            // Outside: tucked into the gumline at the 45-degree angle.
            return toothCenter
                + outward * (halfDepth * 0.98)
                + SIMD3<Double>(0, gum * (halfHeight * 0.38) + microVert, 0)
                + tangent * microSweep
        case 1:
            // Chewing tops: flat on the biting surface.
            return toothCenter
                + SIMD3<Double>(0, -gum * (halfHeight * 1.02), 0)
                + tangent * (microSweep * 1.35)
        default:
            // Inside: the inner gumline; behind the front teeth the brush stands upright.
            let frontBlend = smoothstep(2.8, 4.5, distFromBack)
            return toothCenter
                - outward * (halfDepth * 0.96)
                + SIMD3<Double>(0, gum * (halfHeight * 0.28) + microVert, 0)
                + tangent * (microSweep * (1.0 - 0.5 * frontBlend))
        }
    }

    /// Floss: how far through the current gap the floss is, 0..1 (`phase` in the floss stage).
    public static func flossGapFrac(_ phase: BrushPhaseState) -> Double {
        let halfNorm = clamp(phase.phaseElapsedSec / max(0.001, phase.phaseDurationSec), 0, 0.999)
        let contactProg = clamp(halfNorm * 13.0, 0, 12.999)
        return contactProg - floor(contactProg)
    }

    /// The floss's motion through one gap, `gapFrac` 0..1: slide in with a gentle saw (to 0.30),
    /// lean on the right-hand tooth (to 0.65), lean on the left-hand one, then lift out.
    public static func flossGapMotion(gapFrac: Double, halfHeight: Double, reducedMotion: Bool) -> FlossGapMotion {
        if gapFrac < 0.30 {
            let t = gapFrac / 0.30
            let ease = smoothstep(0.0, 1.0, t)
            return FlossGapMotion(
                depthIntoGap: mix(-(halfHeight + 0.18), halfHeight * 0.10, ease),
                leanSide: 0,
                sawZ: reducedMotion ? 0 : sin(t * .pi * 4.0) * 0.15
            )
        }
        if gapFrac < 0.65 {
            let t = (gapFrac - 0.30) / 0.35
            return FlossGapMotion(
                depthIntoGap: halfHeight * (0.10 + 0.28 * sin(t * .pi)),
                leanSide: smoothstep(0.0, 0.22, t) * (1.0 - 0.35 * smoothstep(0.80, 1.0, t)),
                sawZ: reducedMotion ? 0 : sin(t * .pi * 2.0) * 0.05
            )
        }
        let t = (gapFrac - 0.65) / 0.35
        if t < 0.72 {
            let sub = t / 0.72
            return FlossGapMotion(
                depthIntoGap: halfHeight * (0.10 + 0.28 * sin(sub * .pi)),
                leanSide: -smoothstep(0.0, 0.25, sub),
                sawZ: reducedMotion ? 0 : sin(sub * .pi * 2.0) * 0.05
            )
        }
        let lift = smoothstep(0.0, 1.0, (t - 0.72) / 0.28)
        return FlossGapMotion(
            depthIntoGap: mix(halfHeight * 0.10, -(halfHeight + 0.20), lift),
            leanSide: -(1.0 - lift),
            sawZ: 0
        )
    }

    /// Where the floss is in the gap, arch-local: `gapMid` between the two crowns (upper arch already
    /// mirrored), `outwardXZ` their average outward direction, `archDirXZ` along the arch toward the
    /// right-hand tooth.
    public static func flossContactLocal(
        gapMid: SIMD3<Double>,
        outwardXZ: SIMD2<Double>,
        archDirXZ: SIMD2<Double>,
        isUpper: Bool,
        motion: FlossGapMotion
    ) -> SIMD3<Double> {
        let gum: Double = isUpper ? 1 : -1
        return gapMid
            + SIMD3<Double>(0, gum * motion.depthIntoGap, 0)
            + SIMD3<Double>(archDirXZ.x, 0, archDirXZ.y) * (motion.leanSide * 0.15)
            + SIMD3<Double>(outwardXZ.x, 0, outwardXZ.y) * motion.sawZ
    }

    /// The Brush-Along camera for this moment: brushing, floss or the rinse.
    public static func brushCameraTarget(_ input: BrushCameraInput) -> BrushCameraTarget {
        switch input.phase.stage {
        case .mouthwashBonus:
            return rinseTarget(input)
        case .flossBonus:
            return flossTarget(input)
        case .brushing:
            return brushingTarget(input)
        }
    }

    // MARK: - Brush-Along, stage by stage

    private static let shownJaw = BrushCameraJaw(visible: true, offset: .zero, opacity: 1)
    /// How far the opposite jaw is swung open, so it never hides the teeth being cleaned.
    private static let oppositeJawGapY: Double = 3.8

    /// The 2-minute brush: 4 quadrants x outside, chewing tops, inside (10 s each).
    private static func brushingTarget(_ input: BrushCameraInput) -> BrushCameraTarget {
        let phase = input.phase
        let isUpper = phase.quadrant.isUpper
        // Patient's right (quadrants 0 and 3) is screen-right: positive yaw.
        let side: Double = phase.quadrant.isPatientRight ? 1 : -1
        let surface = phase.surface.rawValue
        let sFrac = clamp(phase.phaseElapsedSec / max(1.0, phase.phaseDurationSec), 0, 0.999)
        // 0 at the back molar .. 1 at the front tooth (the chewing tops sweep front to back).
        let frontProg = surface == 1 ? 1.0 - sFrac : sFrac
        let archMid = SIMD3<Double>(0, isUpper ? 1.9 : 1.3, 0.9)
        let intro = quadrantIntro01(surface: surface, phaseElapsedSec: phase.phaseElapsedSec, reducedMotion: input.reducedMotion)

        // On the outside step the opposite jaw stays in view, swung open (brighter while zoomed out);
        // on the chewing tops and the inside it is hidden so the steep views stay clear.
        let opposite = BrushCameraJaw(
            visible: surface == 0,
            offset: SIMD3<Double>(0, isUpper ? -oppositeJawGapY : oppositeJawGapY, -0.7 + 0.25 * intro),
            opacity: 0.38 + 0.48 * intro
        )
        let upperJaw = isUpper ? shownJaw : opposite
        let lowerJaw = isUpper ? opposite : shownJaw

        if input.reducedMotion {
            // Reduce Motion fades and never flies: straight on (no swing between steps, no sweep),
            // a little further back, the look leaning only a quarter of the way to the brush.
            var look = archMid
            if let contact = input.contactLocal { look = mix(archMid, contact, 0.25) }
            return BrushCameraTarget(
                yaw: 0,
                pitch: isUpper ? -0.10 : 0.20,
                distPortrait: 22.8,
                distLandscape: 16.8,
                lookLocal: look,
                intro01: 0,
                upperJaw: upperJaw,
                lowerJaw: lowerJaw
            )
        }

        let closeYaw: Double
        let closePitch: Double
        let closeDistP: Double
        let closeDistL: Double
        switch surface {
        case 0:
            // Outside: from the cheek's side (never flips left and right).
            closeYaw = side * (0.78 - 0.48 * frontProg)
            closePitch = isUpper ? -0.15 : 0.22
            closeDistP = 19.6
            closeDistL = 14.8
        case 1:
            // Chewing tops: steeply from below (upper) or above (lower), into the grooves.
            closeYaw = side * (0.36 - 0.20 * frontProg)
            closePitch = isUpper ? -0.72 : 0.76
            closeDistP = 19.0
            closeDistL = 14.2
        default:
            // Inside: from across the mouth, onto the inner wall.
            closeYaw = -side * (0.48 - 0.34 * frontProg)
            closePitch = isUpper ? -0.58 : 0.62
            closeDistP = 19.4
            closeDistL = 14.6
        }

        var closeLook = archMid
        if let contact = input.contactLocal { closeLook = mix(archMid, contact, 0.62) }
        let wideLook = SIMD3<Double>(side * 1.35, isUpper ? 0.25 : 3.05, 0.8)
        return BrushCameraTarget(
            yaw: mix(closeYaw, side * 0.22, intro),
            pitch: mix(closePitch, isUpper ? -0.04 : 0.08, intro),
            distPortrait: mix(closeDistP, 29.8, intro),
            distLandscape: mix(closeDistL, 22.4, intro),
            lookLocal: mix(closeLook, wideLook, intro),
            intro01: intro,
            upperJaw: upperJaw,
            lowerJaw: lowerJaw
        )
    }

    /// Floss: the upper arch then the lower, 13 gaps each from the patient's right to the left.
    private static func flossTarget(_ input: BrushCameraInput) -> BrushCameraTarget {
        let phase = input.phase
        let isUpper = phase.flossIsUpper
        let cIdx = 12 - min(12, max(0, phase.flossContactIndex))
        // Which half of the arch the floss is on: the patient's right (screen-right) first.
        let wideSide: Double = cIdx >= 6 ? 1 : -1
        let archMid = SIMD3<Double>(0, isUpper ? 1.85 : 1.35, 1.0)
        let intro = flossArchIntro01(archElapsedSec: phase.phaseElapsedSec, reducedMotion: input.reducedMotion)

        // The opposite jaw shows only while the arch opens zoomed out.
        let opposite = BrushCameraJaw(
            visible: intro > 0.04,
            offset: SIMD3<Double>(0, isUpper ? -oppositeJawGapY : oppositeJawGapY, -0.6),
            opacity: 0.18 + 0.56 * intro
        )
        let upperJaw = isUpper ? shownJaw : opposite
        let lowerJaw = isUpper ? opposite : shownJaw

        if input.reducedMotion {
            // Straight on, a little further back; the look leans only 28% of the way to the floss.
            var look = archMid
            if let contact = input.contactLocal { look = mix(archMid, contact, 0.28) }
            return BrushCameraTarget(
                yaw: 0,
                pitch: isUpper ? -0.14 : 0.18,
                distPortrait: 22.0,
                distLandscape: 16.0,
                lookLocal: look,
                intro01: 0,
                upperJaw: upperJaw,
                lowerJaw: lowerJaw
            )
        }

        let closeYaw: Double
        if let outward = input.flossOutwardXZ {
            closeYaw = flossCloseYaw(contactCIdx: cIdx, outwardXZ: outward)
        } else {
            closeYaw = wideSide * 0.42
        }
        var closeLook = archMid
        if let contact = input.contactLocal { closeLook = mix(archMid, contact, 0.68) }
        let wideLook = SIMD3<Double>(wideSide * 1.1, isUpper ? 1.8 : 1.4, 0.9)
        return BrushCameraTarget(
            yaw: mix(closeYaw, wideSide * 0.18, intro),
            pitch: mix(isUpper ? -0.26 : 0.30, isUpper ? -0.06 : 0.10, intro),
            distPortrait: mix(19.0, 27.0, intro),
            distLandscape: mix(14.4, 20.6, intro),
            lookLocal: mix(closeLook, wideLook, intro),
            intro01: intro,
            upperJaw: upperJaw,
            lowerJaw: lowerJaw
        )
    }

    /// The rinse: both jaws open a little, a slow sway; a phone held in a hand swings the view
    /// toward the cheek the rinse has sloshed to (right cheek, screen-right).
    private static func rinseTarget(_ input: BrushCameraInput) -> BrushCameraTarget {
        let yaw: Double
        if input.reducedMotion {
            yaw = 0
        } else {
            let handheld = clamp(input.rinseHandheld01, 0, 1)
            let sway = sin(input.clockSec * 0.52) * 0.16
            yaw = sway * (1.0 - handheld * 0.65) + input.rinseSlosh * handheld * 0.10
        }
        return BrushCameraTarget(
            yaw: yaw,
            pitch: 0.04,
            distPortrait: 21.4,
            distLandscape: 16.0,
            lookLocal: SIMD3<Double>(0, 1.85, 1.1),
            intro01: 0,
            upperJaw: BrushCameraJaw(visible: true, offset: SIMD3<Double>(0, 1.05, 0), opacity: 1),
            lowerJaw: BrushCameraJaw(visible: true, offset: SIMD3<Double>(0, -0.55, 0), opacity: 1)
        )
    }

    // MARK: - Small helpers

    private static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
        min(hi, max(lo, v))
    }

    private static func smoothstep(_ e0: Double, _ e1: Double, _ x: Double) -> Double {
        let t = clamp((x - e0) / (e1 - e0), 0, 1)
        return t * t * (3 - 2 * t)
    }

    private static func mix(_ a: Double, _ b: Double, _ t: Double) -> Double {
        a + (b - a) * t
    }

    private static func mix(_ a: SIMD3<Double>, _ b: SIMD3<Double>, _ t: Double) -> SIMD3<Double> {
        a + (b - a) * t
    }
}
