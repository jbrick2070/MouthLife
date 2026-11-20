import Foundation
import XCTest
@testable import MouthLifeCore

/// The touch-the-teeth toy is rubbed on the main thread while SceneKit's render thread steps it and
/// reads its ripples and splats every frame (review findings H05 and L09, November 2026).
final class CompanionTouchSystemTests: XCTestCase {

    // H05: the renderer steps and reads while the main thread rubs; every splat pays out exactly once.
    func testRubbingWhileTheRendererStepsPaysEachSplatOnce() {
        let touch = CompanionTouchSystem()
        let spawned = touch.spawnTreatSplats(count: 3, seed: 7)
        XCTAssertEqual(spawned.count, 3)

        let renderFinished = DispatchSemaphore(value: 0)
        DispatchQueue.global(qos: .userInteractive).async {
            var splats: [RenderSplat] = []
            var ripples: [ActiveTouchRipple] = []
            splats.reserveCapacity(CompanionTouchSystem.maxSplats)
            ripples.reserveCapacity(CompanionTouchSystem.maxRipples)
            var now = 0.0
            for _ in 0..<30_000 {
                now += 1.0 / 120.0
                touch.step(dt: 1.0 / 120.0, nowSec: now)
                touch.fadeSplatsForPacer(elapsedSec: 0) // caps at 1: exercises the write, changes nothing
                touch.fillActiveRipples(nowSec: now, into: &ripples)
                touch.fillRenderSplats(into: &splats)
            }
            renderFinished.signal()
        }

        var paidOut = 0
        var now = 0.0
        for splat in spawned {
            for k in 0..<2_000 {
                now += 0.001
                let hit = TouchHit(
                    x: splat.x + (k % 2 == 0 ? 0.3 : -0.3),
                    y: splat.y,
                    z: splat.z,
                    crownIndex: splat.crownIndex
                )
                let feedback = touch.registerTouch(
                    hit: hit,
                    phase: k == 0 ? .down : .move,
                    nowSec: now,
                    smoothness: 90
                )
                paidOut += feedback.splatsCleared
            }
        }
        renderFinished.wait()

        XCTAssertEqual(paidOut, 3)
        XCTAssertEqual(touch.splatsClearedTotal, 3)
        XCTAssertEqual(touch.activeSplatCount, 0)
        XCTAssertLessThanOrEqual(touch.ripples.count, CompanionTouchSystem.maxRipples)
    }

    // L09: the renderer's fills give the same values as the arrays and never grow their buffers.
    func testRenderFillsMatchTheArraysAndKeepTheirCapacity() {
        let touch = CompanionTouchSystem()
        touch.spawnTreatSplats(count: 3, seed: 42)
        var splats: [RenderSplat] = []
        var ripples: [ActiveTouchRipple] = []
        splats.reserveCapacity(CompanionTouchSystem.maxSplats)
        ripples.reserveCapacity(CompanionTouchSystem.maxRipples)
        let splatCapacity = splats.capacity
        let rippleCapacity = ripples.capacity

        // A rub stroke along the arch lays more ripples than the ring holds.
        var now = 1.0
        for i in 0..<40 {
            let anchor = CompanionTouchSystem.anchor(forCrownIndex: i % CompanionTouchSystem.crownCount)
            _ = touch.registerTouch(hit: anchor, phase: i == 0 ? .down : .move, nowSec: now, smoothness: 90)
            now += 0.05
            touch.step(dt: 0.05, nowSec: now)
            touch.fillRenderSplats(into: &splats)
            touch.fillActiveRipples(nowSec: now, into: &ripples)
            XCTAssertEqual(splats, touch.getRenderSplats())
            XCTAssertEqual(ripples, touch.activeRipples(nowSec: now))
            XCTAssertEqual(splats.capacity, splatCapacity)
            XCTAssertEqual(ripples.capacity, rippleCapacity)
        }
        XCTAssertFalse(ripples.isEmpty)
        XCTAssertLessThanOrEqual(ripples.count, CompanionTouchSystem.maxRipples)
    }

    // L09: splat size, the pacer fade and ripple age come out as before.
    func testRenderValuesKeepTheirShape() {
        let touch = CompanionTouchSystem()
        touch.spawnTreatSplats(count: 1, seed: 3)
        var splats: [RenderSplat] = []
        touch.fillRenderSplats(into: &splats)
        XCTAssertEqual(splats.count, 1)
        XCTAssertEqual(splats[0].amount, 0, accuracy: 1e-12) // pops in from nothing
        touch.step(dt: 0.35)
        touch.fillRenderSplats(into: &splats)
        XCTAssertEqual(splats[0].amount, 1, accuracy: 1e-12)
        touch.fadeSplatsForPacer(elapsedSec: 20)
        touch.fillRenderSplats(into: &splats)
        XCTAssertEqual(splats[0].amount, 0.5, accuracy: 1e-12)

        // A tap far from the splat: a ripple, no polish.
        _ = touch.registerTouch(hit: TouchHit(x: 0, y: 0, z: 0, crownIndex: 0), phase: .down, nowSec: 10, smoothness: 90)
        var ripples: [ActiveTouchRipple] = []
        touch.fillActiveRipples(nowSec: 10.425, into: &ripples)
        XCTAssertEqual(ripples.count, 1)
        XCTAssertEqual(ripples[0].ageSec, 0.425, accuracy: 1e-9)
        XCTAssertEqual(ripples[0].strength, 0.5, accuracy: 1e-9) // half-way through its 0.85 s
        touch.fillActiveRipples(nowSec: 10.9, into: &ripples)
        XCTAssertTrue(ripples.isEmpty)
        touch.fillRenderSplats(into: &splats)
        XCTAssertEqual(splats[0].amount, 0.5, accuracy: 1e-12)
    }

    // Each entry point takes the (non-recursive) lock once: none of these may hang.
    func testEveryEntryPointWorksUnderTheLock() {
        let touch = CompanionTouchSystem()
        let spawned = touch.spawnTreatSplats(count: 3, seed: 11)
        XCTAssertEqual(touch.activeSplatCount, 3)
        _ = touch.rubSplat(at: 0, phase: .down, nowSec: 1.0, smoothness: 90)
        _ = touch.rubSplat(splatId: spawned[1].id, phase: .down, nowSec: 1.1, smoothness: 90)
        _ = touch.rubTooth(crownIndex: spawned[2].crownIndex, phase: .down, nowSec: 1.2, smoothness: 90)
        _ = touch.registerTouch(
            hit: CompanionTouchSystem.anchor(forCrownIndex: 0),
            phase: .up,
            nowSec: 1.3,
            smoothness: 90
        )
        touch.endTouch()
        XCTAssertEqual(touch.ripples.count, 3) // one per tap
        XCTAssertLessThan(touch.splats.map(\.amount).reduce(0, +), 3.0) // each tap polished a little
        touch.clearAll()
        XCTAssertEqual(touch.activeSplatCount, 0)
        XCTAssertTrue(touch.getRenderSplats().isEmpty)
    }
}
