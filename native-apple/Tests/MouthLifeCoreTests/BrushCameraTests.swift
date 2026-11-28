import XCTest
@testable import MouthLifeCore

/// The camera's numbers (`BrushCamera`). Twin: `tests/brushCamera.test.ts` runs the same cases on
/// the web's `brushCamera.ts`, so both editions put the camera in the same place. Change both test
/// files together with both camera files. The web file has two cases of its own: the browser's idle
/// frame (the app has none) and an older "every quadrant starts zoomed out" check, whose numbers the
/// brushing targets below already pin.
final class BrushCameraTests: XCTestCase {

    private let tol = 1e-4

    private func phase(_ elapsedSec: Double, _ stage: PacerStage) -> BrushPhaseState {
        BrushPhaseState.evaluate(elapsedSec: elapsedSec, stage: stage, mouthwashDurationSec: 60)
    }

    private func target(
        _ elapsedSec: Double,
        _ stage: PacerStage = .brushing,
        reducedMotion: Bool = false,
        clockSec: Double = 0,
        contact: SIMD3<Double>? = nil,
        outward: SIMD2<Double>? = nil,
        handheld: Double = 0,
        slosh: Double = 0
    ) -> BrushCameraTarget {
        BrushCamera.brushCameraTarget(BrushCameraInput(
            phase: phase(elapsedSec, stage),
            reducedMotion: reducedMotion,
            clockSec: clockSec,
            contactLocal: contact,
            flossOutwardXZ: outward,
            rinseHandheld01: handheld,
            rinseSlosh: slosh
        ))
    }

    private func outward(_ baseYaw: Double) -> SIMD2<Double> {
        SIMD2<Double>(sin(baseYaw), cos(baseYaw))
    }

    private func assertVec(_ a: SIMD3<Double>, _ b: SIMD3<Double>, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(a.x, b.x, accuracy: tol, "x", file: file, line: line)
        XCTAssertEqual(a.y, b.y, accuracy: tol, "y", file: file, line: line)
        XCTAssertEqual(a.z, b.z, accuracy: tol, "z", file: file, line: line)
    }

    // MARK: - Intro envelopes

    func testQuadrantZoomOutHoldsThenEasesIn() {
        XCTAssertEqual(BrushCamera.quadrantIntro01(surface: 0, phaseElapsedSec: 0.0, reducedMotion: false), 1, accuracy: tol)
        XCTAssertEqual(BrushCamera.quadrantIntro01(surface: 0, phaseElapsedSec: 1.05, reducedMotion: false), 1, accuracy: tol)
        XCTAssertEqual(BrushCamera.quadrantIntro01(surface: 0, phaseElapsedSec: 1.475, reducedMotion: false), 0.84375, accuracy: tol)
        XCTAssertEqual(BrushCamera.quadrantIntro01(surface: 0, phaseElapsedSec: 1.9, reducedMotion: false), 0.5, accuracy: tol)
        XCTAssertEqual(BrushCamera.quadrantIntro01(surface: 0, phaseElapsedSec: 2.325, reducedMotion: false), 0.15625, accuracy: tol)
        XCTAssertEqual(BrushCamera.quadrantIntro01(surface: 0, phaseElapsedSec: 2.75, reducedMotion: false), 0, accuracy: tol)
        // only the outside step opens zoomed out, and never under Reduce Motion
        XCTAssertEqual(BrushCamera.quadrantIntro01(surface: 1, phaseElapsedSec: 0.2, reducedMotion: false), 0)
        XCTAssertEqual(BrushCamera.quadrantIntro01(surface: 2, phaseElapsedSec: 0.2, reducedMotion: false), 0)
        XCTAssertEqual(BrushCamera.quadrantIntro01(surface: 0, phaseElapsedSec: 0.2, reducedMotion: true), 0)
    }

    func testFlossArchZoomOutHoldsThenEasesIn() {
        XCTAssertEqual(BrushCamera.flossArchIntro01(archElapsedSec: 0.55, reducedMotion: false), 1, accuracy: tol)
        XCTAssertEqual(BrushCamera.flossArchIntro01(archElapsedSec: 0.85, reducedMotion: false), 0.84375, accuracy: tol)
        XCTAssertEqual(BrushCamera.flossArchIntro01(archElapsedSec: 1.15, reducedMotion: false), 0.5, accuracy: tol)
        XCTAssertEqual(BrushCamera.flossArchIntro01(archElapsedSec: 1.75, reducedMotion: false), 0, accuracy: tol)
        XCTAssertEqual(BrushCamera.flossArchIntro01(archElapsedSec: 0.2, reducedMotion: true), 0)
    }

    // MARK: - Brushing, moment by moment

    func testBrushingTargetsAtEveryListedSecond() {
        // (session second, yaw, pitch, portrait distance, landscape distance, zoom-out)
        let rows: [(Double, Double, Double, Double, Double, Double)] = [
            (0.0, 0.2200, -0.0400, 29.80, 22.40, 1),     // Q0 outside, zoomed out
            (1.9, 0.4544, -0.0950, 24.70, 18.60, 0.5),   // Q0 outside, half way in
            (5.0, 0.5400, -0.1500, 19.60, 14.80, 0),     // Q0 outside
            (15.0, 0.2600, -0.7200, 19.00, 14.20, 0),    // Q0 chewing tops
            (25.0, -0.3100, -0.5800, 19.40, 14.60, 0),   // Q0 inside
            (30.0, -0.2200, -0.0400, 29.80, 22.40, 1),   // Q1 outside, zoomed out
            (35.0, -0.5400, -0.1500, 19.60, 14.80, 0),
            (45.0, -0.2600, -0.7200, 19.00, 14.20, 0),
            (55.0, 0.3100, -0.5800, 19.40, 14.60, 0),
            (60.0, -0.2200, 0.0800, 29.80, 22.40, 1),    // Q2 outside, zoomed out
            (65.0, -0.5400, 0.2200, 19.60, 14.80, 0),
            (75.0, -0.2600, 0.7600, 19.00, 14.20, 0),
            (85.0, 0.3100, 0.6200, 19.40, 14.60, 0),
            (90.0, 0.2200, 0.0800, 29.80, 22.40, 1),     // Q3 outside, zoomed out
            (95.0, 0.5400, 0.2200, 19.60, 14.80, 0),
            (105.0, 0.2600, 0.7600, 19.00, 14.20, 0),
            (115.0, -0.3100, 0.6200, 19.40, 14.60, 0),
            (10.0, 0.1600, -0.7200, 19.00, 14.20, 0),    // Q0 chewing starts
            (19.999, 0.3598, -0.7200, 19.00, 14.20, 0),  // Q0 chewing ends
            (20.0, -0.4800, -0.5800, 19.40, 14.60, 0),   // Q0 inside starts
            (9.999, 0.3005, -0.1500, 19.60, 14.80, 0),   // Q0 outside ends
            (120.0, -0.1403, 0.6200, 19.40, 14.60, 0),   // held at 2:00 (floss Start card)
        ]
        for (sec, yaw, pitch, distP, distL, intro) in rows {
            let t = target(sec)
            XCTAssertEqual(t.yaw, yaw, accuracy: tol, "yaw at \(sec)")
            XCTAssertEqual(t.pitch, pitch, accuracy: tol, "pitch at \(sec)")
            XCTAssertEqual(t.distPortrait, distP, accuracy: tol, "portrait distance at \(sec)")
            XCTAssertEqual(t.distLandscape, distL, accuracy: tol, "landscape distance at \(sec)")
            XCTAssertEqual(t.intro01, intro, accuracy: tol, "zoom-out at \(sec)")
        }
    }

    func testBrushingLookPointLeansToTheContactOrSitsWide() {
        let contact = SIMD3<Double>(5, 1.6, 4)
        // zoomed out, the look is the wide point on the active side, whatever the contact
        assertVec(target(0.0, contact: contact).lookLocal, SIMD3(1.35, 0.25, 0.8))
        assertVec(target(60.0, contact: contact).lookLocal, SIMD3(-1.35, 3.05, 0.8))
        // close up: 62% of the way from the arch's middle to the contact
        assertVec(target(5.0, contact: contact).lookLocal, SIMD3(3.1, 1.714, 2.822))
        assertVec(target(65.0, contact: contact).lookLocal, SIMD3(3.1, 1.486, 2.822))
        // no contact: the arch's middle
        assertVec(target(5.0).lookLocal, SIMD3(0, 1.9, 0.9))
    }

    func testBrushingJawsShowTheOppositeJawOnlyOnTheOutsideStep() {
        let wide = target(0.0)
        XCTAssertTrue(wide.upperJaw.visible)
        XCTAssertEqual(wide.upperJaw.offset, .zero)
        XCTAssertTrue(wide.lowerJaw.visible)
        assertVec(wide.lowerJaw.offset, SIMD3(0, -3.8, -0.45))
        XCTAssertEqual(wide.lowerJaw.opacity, 0.86, accuracy: tol)
        let close = target(5.0)
        assertVec(close.lowerJaw.offset, SIMD3(0, -3.8, -0.7))
        XCTAssertEqual(close.lowerJaw.opacity, 0.38, accuracy: tol)
        XCTAssertFalse(target(15.0).lowerJaw.visible)
        XCTAssertFalse(target(25.0).lowerJaw.visible)
        // lower quadrants: the upper jaw swings up out of the way
        let lower = target(65.0)
        XCTAssertTrue(lower.lowerJaw.visible)
        assertVec(lower.upperJaw.offset, SIMD3(0, 3.8, -0.7))
        XCTAssertFalse(target(75.0).upperJaw.visible)
    }

    // MARK: - Floss

    func testFlossCloseYawPerGap() {
        XCTAssertEqual(BrushCamera.flossCloseYaw(contactCIdx: 12, outwardXZ: outward(1.6050)), 0.9200, accuracy: tol)
        XCTAssertEqual(BrushCamera.flossCloseYaw(contactCIdx: 9, outwardXZ: outward(0.6854)), 0.2654, accuracy: tol)
        XCTAssertEqual(BrushCamera.flossCloseYaw(contactCIdx: 7, outwardXZ: outward(0.2325)), -0.1875, accuracy: tol)
        XCTAssertEqual(BrushCamera.flossCloseYaw(contactCIdx: 6, outwardXZ: outward(1.0)), 0.3800, accuracy: tol)
        XCTAssertEqual(BrushCamera.flossCloseYaw(contactCIdx: 5, outwardXZ: outward(-0.2325)), 0.1875, accuracy: tol)
        XCTAssertEqual(BrushCamera.flossCloseYaw(contactCIdx: 0, outwardXZ: outward(-1.6050)), -0.9200, accuracy: tol)
    }

    func testFlossTargetsThroughBothArches() {
        // upper arch opens zoomed out
        let start = target(120.0, .flossBonus, outward: outward(1.6050))
        XCTAssertEqual(start.yaw, 0.18, accuracy: tol)
        XCTAssertEqual(start.pitch, -0.06, accuracy: tol)
        XCTAssertEqual(start.distPortrait, 27.0, accuracy: tol)
        XCTAssertEqual(start.distLandscape, 20.6, accuracy: tol)
        XCTAssertEqual(start.intro01, 1, accuracy: tol)
        assertVec(start.lookLocal, SIMD3(1.1, 1.8, 0.9))
        // half way in on the first gap
        let half = target(121.15, .flossBonus, outward: outward(1.6050))
        XCTAssertEqual(half.yaw, 0.55, accuracy: tol)
        XCTAssertEqual(half.pitch, -0.16, accuracy: tol)
        XCTAssertEqual(half.distPortrait, 23.0, accuracy: tol)
        XCTAssertEqual(half.distLandscape, 17.5, accuracy: tol)
        XCTAssertEqual(half.intro01, 0.5, accuracy: tol)
        // gap 7|8 (the sixth stop)
        let mid = target(130.0, .flossBonus, outward: outward(0.2325))
        XCTAssertEqual(mid.yaw, -0.1875, accuracy: tol)
        XCTAssertEqual(mid.pitch, -0.26, accuracy: tol)
        XCTAssertEqual(mid.distPortrait, 19.0, accuracy: tol)
        XCTAssertEqual(mid.distLandscape, 14.4, accuracy: tol)
        XCTAssertEqual(mid.intro01, 0, accuracy: tol)
        // the lower arch opens zoomed out again
        let lowerStart = target(142.5, .flossBonus, outward: outward(1.6050))
        XCTAssertEqual(lowerStart.yaw, 0.18, accuracy: tol)
        XCTAssertEqual(lowerStart.pitch, 0.10, accuracy: tol)
        XCTAssertEqual(lowerStart.distPortrait, 27.0, accuracy: tol)
        XCTAssertEqual(lowerStart.distLandscape, 20.6, accuracy: tol)
        XCTAssertEqual(lowerStart.intro01, 1, accuracy: tol)
        assertVec(lowerStart.lookLocal, SIMD3(1.1, 1.4, 0.9))
        // held at the end of floss (rinse Start card): the last gap, lower left
        let held = target(165.0, .flossBonus, outward: outward(-1.6050))
        XCTAssertEqual(held.yaw, -0.92, accuracy: tol)
        XCTAssertEqual(held.pitch, 0.30, accuracy: tol)
        XCTAssertEqual(held.distPortrait, 19.0, accuracy: tol)
        XCTAssertEqual(held.distLandscape, 14.4, accuracy: tol)
    }

    func testFlossLookPointLeansToTheFloss() {
        let contact = SIMD3<Double>(2, 2.5, 5)
        assertVec(target(130.0, .flossBonus, contact: contact, outward: outward(0.2325)).lookLocal, SIMD3(1.36, 2.292, 3.72))
        assertVec(target(150.0, .flossBonus, contact: contact, outward: outward(0.2325)).lookLocal, SIMD3(1.36, 2.132, 3.72))
    }

    func testFlossJawsOpenOnlyWhileZoomedOut() {
        let start = target(120.0, .flossBonus)
        XCTAssertTrue(start.lowerJaw.visible)
        assertVec(start.lowerJaw.offset, SIMD3(0, -3.8, -0.6))
        XCTAssertEqual(start.lowerJaw.opacity, 0.74, accuracy: tol)
        XCTAssertFalse(target(130.0, .flossBonus).lowerJaw.visible)
        XCTAssertTrue(target(150.0, .flossBonus).lowerJaw.visible)
        XCTAssertFalse(target(150.0, .flossBonus).upperJaw.visible)
    }

    func testFlossGapMotionAndContact() {
        XCTAssertEqual(BrushCamera.flossGapFrac(phase(130.0, .flossBonus)), 0.77778, accuracy: tol)
        let slide = BrushCamera.flossGapMotion(gapFrac: 0.0375, halfHeight: 0.7, reducedMotion: false)
        XCTAssertEqual(slide.depthIntoGap, -0.83918, accuracy: tol)
        XCTAssertEqual(slide.leanSide, 0, accuracy: tol)
        XCTAssertEqual(slide.sawZ, 0.15, accuracy: tol)
        XCTAssertEqual(BrushCamera.flossGapMotion(gapFrac: 0.0375, halfHeight: 0.7, reducedMotion: true).sawZ, 0)
        let right = BrushCamera.flossGapMotion(gapFrac: 0.475, halfHeight: 0.7, reducedMotion: false)
        XCTAssertEqual(right.depthIntoGap, 0.266, accuracy: tol)
        XCTAssertEqual(right.leanSide, 1, accuracy: tol)
        let left = BrushCamera.flossGapMotion(gapFrac: 0.776, halfHeight: 0.7, reducedMotion: false)
        XCTAssertEqual(left.depthIntoGap, 0.266, accuracy: tol)
        XCTAssertEqual(left.leanSide, -1, accuracy: tol)
        let lift = BrushCamera.flossGapMotion(gapFrac: 0.951, halfHeight: 0.7, reducedMotion: false)
        XCTAssertEqual(lift.depthIntoGap, -0.415, accuracy: tol)
        XCTAssertEqual(lift.leanSide, -0.5, accuracy: tol)
        XCTAssertEqual(lift.sawZ, 0, accuracy: tol)

        let motion = FlossGapMotion(depthIntoGap: 0.266, leanSide: 1, sawZ: 0.15)
        let mid = SIMD3<Double>(1, 2, 3)
        let out = SIMD2<Double>(0.6, 0.8)
        let along = SIMD2<Double>(0.8, -0.6)
        assertVec(BrushCamera.flossContactLocal(gapMid: mid, outwardXZ: out, archDirXZ: along, isUpper: true, motion: motion), SIMD3(1.21, 2.266, 3.03))
        assertVec(BrushCamera.flossContactLocal(gapMid: mid, outwardXZ: out, archDirXZ: along, isUpper: false, motion: motion), SIMD3(1.21, 1.734, 3.03))
    }

    // MARK: - The contact the close-up follows while brushing

    func testBrushContactPerSurface() {
        let center = SIMD3<Double>(1, 2, 3)
        let out = SIMD2<Double>(0.6, 0.8)
        func contact(_ surface: Int, upper: Bool = true, dist: Double = 1, clock: Double = 0, rm: Bool = false) -> SIMD3<Double> {
            BrushCamera.brushContactLocal(
                toothCenter: center, outwardXZ: out, halfDepth: 0.5, halfHeight: 0.7, surface: surface,
                isUpper: upper, distFromBack: dist, clockSec: clock, reducedMotion: rm
            )
        }
        assertVec(contact(0), SIMD3(1.294, 2.346, 3.392))
        assertVec(contact(0, upper: false), SIMD3(1.294, 1.814, 3.392))
        assertVec(contact(1), SIMD3(1, 1.286, 3))
        assertVec(contact(2, dist: 5), SIMD3(0.712, 2.276, 2.616))
        // the scrub, a quarter turn in: along the arch, no lift
        assertVec(contact(0, clock: .pi / 18), SIMD3(1.502, 2.266, 3.236))
        // no scrub under Reduce Motion
        assertVec(contact(0, clock: .pi / 18, rm: true), SIMD3(1.294, 2.266, 3.392))
    }

    // MARK: - Rinse

    func testRinseCameraAndTheTiltOfAHeldPhone() {
        let still = target(170, .mouthwashBonus)
        XCTAssertEqual(still.yaw, 0, accuracy: tol)
        XCTAssertEqual(still.pitch, 0.04, accuracy: tol)
        XCTAssertEqual(still.distPortrait, 21.4, accuracy: tol)
        XCTAssertEqual(still.distLandscape, 16.0, accuracy: tol)
        assertVec(still.lookLocal, SIMD3(0, 1.85, 1.1))
        XCTAssertEqual(target(200, .mouthwashBonus, clockSec: 3.0208).yaw, 0.16, accuracy: tol)
        XCTAssertEqual(target(200, .mouthwashBonus, clockSec: 3.0208, handheld: 1, slosh: 1).yaw, 0.156, accuracy: tol)
        XCTAssertEqual(target(220, .mouthwashBonus, clockSec: 0, handheld: 1, slosh: -1).yaw, -0.10, accuracy: tol)
        XCTAssertEqual(target(220, .mouthwashBonus, clockSec: 0, handheld: 0.5, slosh: 1).yaw, 0.05, accuracy: tol)
        // both jaws open a little
        assertVec(still.upperJaw.offset, SIMD3(0, 1.05, 0))
        assertVec(still.lowerJaw.offset, SIMD3(0, -0.55, 0))
        XCTAssertTrue(still.upperJaw.visible && still.lowerJaw.visible)
        // Reduce Motion: no sway and no tilt
        XCTAssertEqual(target(200, .mouthwashBonus, reducedMotion: true, clockSec: 3.0208).yaw, 0)
        XCTAssertEqual(target(200, .mouthwashBonus, reducedMotion: true, clockSec: 3.0208, handheld: 1, slosh: 1).yaw, 0)
        XCTAssertEqual(target(220, .mouthwashBonus, reducedMotion: true, handheld: 1, slosh: -1).yaw, 0)
        // the three swish steps share one camera
        XCTAssertEqual(target(170, .mouthwashBonus, clockSec: 2), target(190, .mouthwashBonus, clockSec: 2))
        XCTAssertEqual(target(170, .mouthwashBonus, clockSec: 2), target(210, .mouthwashBonus, clockSec: 2))
    }

    // MARK: - Reduce Motion: straight on, never flying

    func testReduceMotionKeepsBrushingAndFlossStraightOn() {
        let contact = SIMD3<Double>(5, 1.6, 4)
        let upper = target(5.0, reducedMotion: true, contact: contact)
        XCTAssertEqual(upper.yaw, 0)
        XCTAssertEqual(upper.pitch, -0.10, accuracy: tol)
        XCTAssertEqual(upper.distPortrait, 22.8, accuracy: tol)
        XCTAssertEqual(upper.distLandscape, 16.8, accuracy: tol)
        XCTAssertEqual(upper.intro01, 0)
        // a quarter of the way to the contact
        assertVec(upper.lookLocal, SIMD3(1.25, 1.825, 1.675))
        let lower = target(65.0, reducedMotion: true, contact: contact)
        XCTAssertEqual(lower.yaw, 0)
        XCTAssertEqual(lower.pitch, 0.20, accuracy: tol)
        // no zoom-out as a quadrant starts, and the opposite jaw stays dimmed
        let opening = target(0.0, reducedMotion: true)
        XCTAssertEqual(opening.yaw, 0)
        XCTAssertEqual(opening.distPortrait, 22.8, accuracy: tol)
        XCTAssertEqual(opening.lowerJaw.opacity, 0.38, accuracy: tol)
        // every step looks the same way
        for sec in stride(from: 0.0, to: 120.0, by: 2.5) {
            XCTAssertEqual(target(sec, reducedMotion: true).yaw, 0, "yaw at \(sec)")
        }
        // floss: straight on, 28% of the way to the floss
        let floss = target(130.0, .flossBonus, reducedMotion: true, contact: SIMD3(2, 2.5, 5), outward: outward(0.2325))
        XCTAssertEqual(floss.yaw, 0)
        XCTAssertEqual(floss.pitch, -0.14, accuracy: tol)
        XCTAssertEqual(floss.distPortrait, 22.0, accuracy: tol)
        XCTAssertEqual(floss.distLandscape, 16.0, accuracy: tol)
        assertVec(floss.lookLocal, SIMD3(0.56, 2.032, 2.12))
        XCTAssertEqual(target(150.0, .flossBonus, reducedMotion: true).pitch, 0.18, accuracy: tol)
        XCTAssertEqual(target(120.0, .flossBonus, reducedMotion: true).intro01, 0)
        // and a slow follow
        XCTAssertEqual(BrushCamera.followRate(brushAlong: true, reducedMotion: true), 2.4)
    }

    // MARK: - Pause and a Start card: the picture stands still

    func testPausedOrStartCardGivesAStillLookPoint() {
        let center = SIMD3<Double>(4, 1.5, 2)
        let out = SIMD2<Double>(0.6, 0.8)
        func look(atClock clock: Double, elapsed: Double) -> SIMD3<Double> {
            let contact = BrushCamera.brushContactLocal(
                toothCenter: center, outwardXZ: out, halfDepth: 0.5, halfHeight: 0.7, surface: 0,
                isUpper: true, distFromBack: 2, clockSec: clock, reducedMotion: false
            )
            return target(elapsed, clockSec: clock, contact: contact).lookLocal
        }
        // paused at 0:05 (or held at 2:00 on the floss Start card): the session clock stops and so
        // does the camera's, while frames keep coming
        var clock = 7.3
        let before = look(atClock: clock, elapsed: 5.0)
        for _ in 0..<90 {
            clock = BrushCamera.advanceCameraClock(clock, dt: 1.0 / 60.0, held: true)
            assertVec(look(atClock: clock, elapsed: 5.0), before)
        }
        XCTAssertEqual(clock, 7.3)
        // running, the scrub moves the look point
        let running = BrushCamera.advanceCameraClock(clock, dt: 0.05, held: false)
        XCTAssertEqual(running, 7.35, accuracy: 1e-12)
        let moved = look(atClock: running, elapsed: 5.0) - before
        XCTAssertGreaterThan((moved * moved).sum().squareRoot(), 1e-3)
        // the rinse's sway follows the same clock: held, it holds; running, it sways
        XCTAssertNotEqual(target(200, .mouthwashBonus, clockSec: clock).yaw, target(200, .mouthwashBonus, clockSec: clock + 0.5).yaw)
    }

    // MARK: - The bathroom mirror: the patient's right is screen-right

    func testPatientRightIsScreenRightForEveryQuadrantAndForFloss() {
        // quadrants 0 (upper right) and 3 (lower right) are the patient's right: positive yaw and a
        // look point on +X; 1 and 2 are the left
        for quadrant in 0..<4 {
            let right = quadrant == 0 || quadrant == 3
            let start = Double(quadrant) * 30.0
            let wide = target(start)
            XCTAssertEqual(wide.yaw > 0, right, "zoomed-out yaw, quadrant \(quadrant)")
            XCTAssertEqual(wide.lookLocal.x > 0, right, "zoomed-out look, quadrant \(quadrant)")
            XCTAssertEqual(target(start + 5).yaw > 0, right, "outside, quadrant \(quadrant)")
            XCTAssertEqual(target(start + 15).yaw > 0, right, "chewing tops, quadrant \(quadrant)")
            // the inside is seen from across the mouth
            XCTAssertEqual(target(start + 25).yaw < 0, right, "inside, quadrant \(quadrant)")
        }
        // floss starts on the patient's right of each arch and ends on the left
        for archStart in [120.0, 142.5] {
            let opening = target(archStart, .flossBonus)
            XCTAssertGreaterThan(opening.yaw, 0)
            XCTAssertGreaterThan(opening.lookLocal.x, 0)
        }
        XCTAssertGreaterThan(BrushCamera.flossCloseYaw(contactCIdx: 12, outwardXZ: outward(1.6050)), 0)
        XCTAssertLessThan(BrushCamera.flossCloseYaw(contactCIdx: 0, outwardXZ: outward(-1.6050)), 0)
        XCTAssertLessThan(target(165.0, .flossBonus, outward: outward(-1.6050)).yaw, 0)
        // the rinse swings toward the cheek the rinse went to: right cheek, screen-right
        XCTAssertGreaterThan(target(170, .mouthwashBonus, handheld: 1, slosh: 1).yaw, 0)
    }

    // MARK: - The picture and the rig

    func testViewportFieldOfViewAndPortraitCutOff() {
        XCTAssertEqual(BrushCamera.fovDeg(aspect: 0.40), 64.5, accuracy: tol)
        XCTAssertEqual(BrushCamera.fovDeg(aspect: 0.4615), 63.871, accuracy: tol)
        XCTAssertEqual(BrushCamera.fovDeg(aspect: 0.5), 62.10, accuracy: tol)
        XCTAssertEqual(BrushCamera.fovDeg(aspect: 0.75), 50.60, accuracy: tol)
        XCTAssertEqual(BrushCamera.fovDeg(aspect: 0.90), 46.0, accuracy: tol)
        XCTAssertEqual(BrushCamera.fovDeg(aspect: 1.6), 46.0, accuracy: tol)
        XCTAssertTrue(BrushCamera.isPortrait(aspect: 0.849))
        XCTAssertFalse(BrushCamera.isPortrait(aspect: 0.85))
    }

    func testRigOrbitEaseBackAndFollow() {
        assertVec(BrushCamera.orbitPosition(look: .zero, yaw: 0.5, pitch: -0.15, dist: 20), SIMD3(9.4808, -2.9888, 17.3546))
        XCTAssertEqual(BrushCamera.easeBackOffset(0.85, dt: 0.5), 0.28294, accuracy: tol)
        XCTAssertEqual(BrushCamera.easeBackOffset(0.85, dt: 1.0), 0.09418, accuracy: tol)
        XCTAssertEqual(BrushCamera.followFactor(rate: 6.8, dt: 1.0 / 60.0), 0.10715, accuracy: tol)
        XCTAssertEqual(BrushCamera.followRate(brushAlong: true, reducedMotion: false), 6.8)
        XCTAssertEqual(BrushCamera.followRate(brushAlong: false, reducedMotion: false), 7.5)
        XCTAssertEqual(BrushCamera.followRate(brushAlong: false, reducedMotion: true), 7.5)
    }

    func testFingerLimitsAndGains() {
        let far = BrushCamera.brushOrbitDrag(yaw: 0, pitch: 0, dxPoints: -1000, dyPoints: 1000)
        XCTAssertEqual(far.yaw, 0.85, accuracy: tol)
        XCTAssertEqual(far.pitch, 0.45, accuracy: tol)
        let near = BrushCamera.brushOrbitDrag(yaw: 0, pitch: 0, dxPoints: 100, dyPoints: -100)
        XCTAssertEqual(near.yaw, -0.55, accuracy: tol)
        XCTAssertEqual(near.pitch, -0.35, accuracy: tol)
        let hubFar = BrushCamera.hubOrbitDrag(yaw: 0, pitch: 0.34, dxPoints: -1000, dyPoints: 1000)
        XCTAssertEqual(hubFar.yaw, 0.85, accuracy: tol)
        XCTAssertEqual(hubFar.pitch, 0.82, accuracy: tol)
        let hubLow = BrushCamera.hubOrbitDrag(yaw: 0, pitch: 0.34, dxPoints: 1000, dyPoints: -1000)
        XCTAssertEqual(hubLow.yaw, -0.85, accuracy: tol)
        XCTAssertEqual(hubLow.pitch, 0.18, accuracy: tol)
        let hubStep = BrushCamera.hubOrbitDrag(yaw: 0, pitch: 0.34, dxPoints: 20, dyPoints: 20)
        XCTAssertEqual(hubStep.yaw, -0.11, accuracy: tol)
        XCTAssertEqual(hubStep.pitch, 0.41, accuracy: tol)
        XCTAssertEqual(BrushCamera.arrivalOrbitDrag(yaw: 0, dxPoints: -1000), 0.75, accuracy: tol)
        XCTAssertEqual(BrushCamera.arrivalOrbitDrag(yaw: 0, dxPoints: 100), -0.5, accuracy: tol)
    }

    // MARK: - The other screens

    func testHomeFraming() {
        let portrait = BrushCamera.hubCamera(yaw: BrushCamera.hubRestYaw, pitch: BrushCamera.hubRestPitch, portrait: true)
        assertVec(portrait.pos, SIMD3(32, 13.5723, 50.0106))
        assertVec(portrait.look, SIMD3(32, 3.2, 14.6))
        let landscape = BrushCamera.hubCamera(yaw: 0, pitch: 0.34, portrait: false)
        assertVec(landscape.pos, SIMD3(32, 8.7367, 36.3406))
        assertVec(landscape.look, SIMD3(32, 2.3, 14.6))
        // a held phone's tilt turns it a little
        let tilted = BrushCamera.hubCamera(yaw: 0, pitch: 0.34, portrait: false, parallaxX: 1, parallaxY: 1)
        assertVec(tilted.pos, BrushCamera.orbitPosition(look: BrushCamera.hubCenter, yaw: 0.085, pitch: 0.292, dist: 22))
        // the web's own fit backs off along the same line
        let backed = BrushCamera.hubCamera(yaw: 0, pitch: 0.34, portrait: false, dolly: 1.5)
        assertVec(backed.pos, BrushCamera.orbitPosition(look: BrushCamera.hubCenter, yaw: 0, pitch: 0.34, dist: 33))
    }

    func testArrivalFramingPerBeat() {
        let rows: [(Int, Bool, SIMD3<Double>, SIMD3<Double>)] = [
            (0, true, SIMD3(32, 143.8, 36), SIMD3(32, 141.8, 16)),
            (0, false, SIMD3(32, 148.4, 31.5), SIMD3(32, 146.2, 16)),
            (1, true, SIMD3(32, 141.6, 39.7), SIMD3(32, 139.6, 18.2)),
            (1, false, SIMD3(32, 145.4, 33.2), SIMD3(32, 143.2, 18.2)),
            (2, true, SIMD3(32, 144.4, 33.5), SIMD3(32, 142.6, 16)),
            (2, false, SIMD3(32, 148.2, 29.5), SIMD3(32, 146.5, 16)),
            (3, true, SIMD3(32, 98.5, 90), SIMD3(32, 91.5, 16)),
            (3, false, SIMD3(32, 109, 64), SIMD3(32, 103.5, 16)),
        ]
        for (beat, portrait, pos, look) in rows {
            let pose = BrushCamera.arrivalCamera(beat: beat, yaw: 0, portrait: portrait)
            assertVec(pose.pos, pos)
            assertVec(pose.look, look)
        }
        // the hardness line-up only slides sideways when turned
        let turned = BrushCamera.arrivalCamera(beat: 1, yaw: 0.5, portrait: true)
        assertVec(turned.pos, SIMD3(36.6384, 141.6, 37.0680))
    }

    func testStageAndScoreScreen() {
        let upright = BrushCamera.stageCamera(probeX: 10, probeZ: 12, portrait: true)
        assertVec(upright.pos, SIMD3(10, 24, 28))
        assertVec(upright.look, SIMD3(10, 0.6, 11))
        let sideways = BrushCamera.stageCamera(probeX: 10, probeZ: 12, portrait: false)
        assertVec(sideways.pos, SIMD3(10, 18, 24.2))
        assertVec(sideways.look, SIMD3(10, 0.6, 11))

        // the score screen circles the stage
        let report = BrushCamera.reportCamera(stageWidth: 64, stageDepth: 32, clockSec: 0, reducedMotion: false)
        assertVec(report.pos, SIMD3(32, 24, 38))
        assertVec(report.look, SIMD3(32, 0.5, 16))
        assertVec(BrushCamera.reportCamera(stageWidth: 64, stageDepth: 32, clockSec: 10, reducedMotion: false).pos, SIMD3(49.7869, 24, 3.0530))
        // Reduce Motion holds one angle
        let still = SIMD3<Double>(36.3707, 24, 37.5615)
        assertVec(BrushCamera.reportCamera(stageWidth: 64, stageDepth: 32, clockSec: 0, reducedMotion: true).pos, still)
        assertVec(BrushCamera.reportCamera(stageWidth: 64, stageDepth: 32, clockSec: 99, reducedMotion: true).pos, still)
        // the web's own fit backs off keeping the angle
        assertVec(BrushCamera.reportCamera(stageWidth: 64, stageDepth: 32, clockSec: 0, reducedMotion: false, dolly: 2).pos, SIMD3(32, 47.5, 60))
    }
}
