import XCTest
@testable import MouthLifeCore

/// Fixes from the November 2026 web QA pass, kept identical in both editions.
final class QAFixTests: XCTestCase {

    // The brushing sound belongs to a stage being played (web twin: tests/scrubGate.test.ts).
    func testScrubGatePlaysOnlyDuringALiveStage() {
        XCTAssertTrue(ScrubGate.mayPlay(mode: .arcade, finale: false, paused: false, stageLive: true))
        XCTAssertTrue(ScrubGate.mayPlay(mode: .pulpRescue, finale: false, paused: false, stageLive: true))
        // The city just ended: the last snapshot may still say "scrubbing".
        XCTAssertFalse(ScrubGate.mayPlay(mode: .arcade, finale: false, paused: false, stageLive: false))
        XCTAssertFalse(ScrubGate.mayPlay(mode: .arcade, finale: true, paused: false, stageLive: true))
        XCTAssertFalse(ScrubGate.mayPlay(mode: .arcade, finale: false, paused: true, stageLive: true))
        for mode in [AppMode.report, .hub, .cosmicIntro, .brushAlong] {
            XCTAssertFalse(ScrubGate.mayPlay(mode: mode, finale: false, paused: false, stageLive: true))
        }
    }

    // The gum is solid (web twin: tests/multiCityCartridges.test.ts).
    func testHydraCannotDriveAlongTheGumRoundADivider() {
        let cart = WorldRegistry.world1
        let walls = cart.wallBoxes + buildAlleyWalls(cart) + buildGumWalls(cart)
        let b = playableBounds(cart)
        var pos = Vec2(x: 28.5, z: 6)
        for _ in 0..<400 {
            pos = moveCircleWithSlide(
                pos: pos,
                delta: Vec2(x: 0.08, z: -0.04),
                radius: GameConfig.probeRadius,
                worldWidth: cart.worldWidth,
                worldDepth: cart.worldDepth,
                walls: walls
            )
            XCTAssertGreaterThanOrEqual(pos.z - GameConfig.probeRadius, b.minZ - 1e-6)
        }
        XCTAssertLessThan(pos.x, 30.59)
    }

    func testFlossGapsLandOnTheToothSurface() {
        for cart in [WorldRegistry.world1, WorldRegistry.world2, WorldRegistry.world3, WorldRegistry.world4, WorldRegistry.world5] {
            let b = playableBounds(cart)
            XCTAssertEqual(b.minX, 3); XCTAssertEqual(b.maxX, 61); XCTAssertEqual(b.minZ, 5); XCTAssertEqual(b.maxZ, 27)
            for alley in cart.interdentalAlleys {
                for end in [alley.endpointA, alley.endpointB] {
                    XCTAssertTrue(end.x - GameConfig.probeRadius >= b.minX && end.x + GameConfig.probeRadius <= b.maxX, alley.id)
                    XCTAssertTrue(end.z - GameConfig.probeRadius >= b.minZ && end.z + GameConfig.probeRadius <= b.maxZ, alley.id)
                }
            }
        }
    }

    func testGermsBounceOffTheGumEdge() {
        let save = SaveSystem.createDefaultSave(nowEpochMs: 1_700_000_000_000)
        let session = WorldSession(cartridge: WorldRegistry.world1, save: save, mode: .arcade, events: EventBus())
        let b = playableBounds(WorldRegistry.world1)
        session.mutans = [
            MutansEntity(
                id: 999,
                pos: Vec2(x: 12, z: b.maxZ - 0.6),
                vel: Vec2(x: 0, z: 1.5),
                hopPhase: 0,
                hp: 99,
                stunRemaining: 0,
                acidDropCooldown: 99,
                parentSucroseId: "none"
            )
        ]
        var maxZ = 0.0
        for _ in 0..<180 {
            session.step(dt: 1.0 / 60.0)
            if let germ = session.mutans.first(where: { $0.id == 999 }) { maxZ = max(maxZ, germ.pos.z) }
        }
        let germ = session.mutans.first(where: { $0.id == 999 })
        XCTAssertNotNil(germ)
        XCTAssertLessThanOrEqual(maxZ + 0.45, b.maxZ + 1e-6)
        XCTAssertLessThan(germ?.vel.z ?? 1, 0)
        XCTAssertLessThan(germ?.pos.z ?? b.maxZ, b.maxZ - 1)
    }

    func testBrushKnockbackCannotPushAGermOntoTheGum() {
        let save = SaveSystem.createDefaultSave(nowEpochMs: 1_700_000_000_000)
        let session = WorldSession(cartridge: WorldRegistry.world1, save: save, mode: .arcade, events: EventBus())
        let b = playableBounds(WorldRegistry.world1)
        // Stunned, so only the brush moves it: right between HYDRA-1 and the gum edge.
        session.mutans = [
            MutansEntity(
                id: 998,
                pos: Vec2(x: 12, z: b.maxZ - 0.6),
                vel: Vec2(x: 0, z: 0),
                hopPhase: 0,
                hp: 999,
                stunRemaining: 999,
                acidDropCooldown: 99,
                parentSucroseId: "none"
            )
        ]
        var maxZ = 0.0
        for _ in 0..<120 {
            session.probePos = Vec2(x: 12, z: b.maxZ - 1.5)
            session.step(dt: 1.0 / 60.0, input: SessionInputCommand(scrubHeld: true))
            if let germ = session.mutans.first(where: { $0.id == 998 }) { maxZ = max(maxZ, germ.pos.z) }
        }
        XCTAssertLessThan(session.mutans.first(where: { $0.id == 998 })?.hp ?? 999, 999) // the brush hit it
        XCTAssertLessThanOrEqual(maxZ + 0.45, b.maxZ + 1e-6)
    }

    // A damaged code reads the same plain message as on the web (shown on the Prologue's restore sheet).
    func testDamagedSyncCodesGetOnePlainMessage() {
        XCTAssertEqual(SyncCodeError.malformedPayload.errorDescription, "This code is damaged and can’t be read.")
        XCTAssertEqual(SyncCodeError.invalidUtf8.errorDescription, "This code is damaged and can’t be read.")
        XCTAssertThrowsError(try SaveSystem.decodeSaveFromSyncCode("ML2:abc$$"))
    }
}
