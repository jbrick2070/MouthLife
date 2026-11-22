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

    // Tooth seams and the start heading (web twin: tests/cartridgeNative.test.ts).
    func testToothSeamsComeOnlyFromZoneBoundariesAndNarrowDividers() {
        // Written out, not worked out: a change to the rule or to a city must be made on purpose.
        XCTAssertEqual(ToothSeams.seamsX(WorldRegistry.world1), [22, 32, 42])
        // City 2's two dividers stand on its zone boundaries; its ridge stands free, so it is no seam.
        XCTAssertEqual(ToothSeams.seamsX(WorldRegistry.world2), [22, 42])
        // Cities 3 to 5 have sideways walls, a jetty on a zone boundary and a walled core: no extra seams.
        XCTAssertEqual(ToothSeams.seamsX(WorldRegistry.world3), [20, 44])
        XCTAssertEqual(ToothSeams.seamsX(WorldRegistry.world4), [24, 42])
        XCTAssertEqual(ToothSeams.seamsX(WorldRegistry.world5), [19, 45])
        XCTAssertEqual(ToothSeams.seamsX(WorldRegistry.pulpRescue), [])
        // A wall up to 3.5 wide that reaches the gum is a divider; a wider or free-standing one is not.
        XCTAssertEqual(ToothSeams.maxWallWidth, 3.5)
        XCTAssertEqual(ToothSeams.gumReach, 1)
        var edge = WorldRegistry.pulpRescue
        edge.districts = []
        edge.playableMaskBoxes = [AABB2D(minX: 3, minZ: 5, maxX: 61, maxZ: 27)]
        func wall(_ maxX: Double, _ minZ: Double, _ maxZ: Double) -> [Double] {
            edge.wallBoxes = [AABB2D(minX: 10, minZ: minZ, maxX: maxX, maxZ: maxZ)]
            return ToothSeams.seamsX(edge)
        }
        XCTAssertEqual(wall(13.5, 5, 15), [11.8])
        XCTAssertEqual(wall(13.6, 5, 15), [])
        XCTAssertEqual(wall(13, 20, 27), [11.5])
        XCTAssertEqual(wall(13, 6, 15), [11.5])
        XCTAssertEqual(wall(13, 6.1, 25.9), [])
        var cart = WorldRegistry.world1
        cart.wallBoxes = [
            AABB2D(minX: 8, minZ: 13, maxX: 50, maxZ: 15.5),    // a sideways wall
            AABB2D(minX: 21, minZ: 10, maxX: 43, maxZ: 22),     // an island
            AABB2D(minX: 30.6, minZ: 11, maxX: 33.4, maxZ: 21)  // a spur standing free of the gum
        ]
        XCTAssertEqual(ToothSeams.seamsX(cart), [22, 42])
        cart.wallBoxes = [AABB2D(minX: 10.6, minZ: 5, maxX: 13.4, maxZ: 15)]
        XCTAssertEqual(ToothSeams.seamsX(cart), [12, 22, 42])
        cart.districts = []
        cart.wallBoxes = []
        XCTAssertEqual(ToothSeams.seamsX(cart), [])
    }

    func testHydraFacesEastUnlessTheStageSaysOtherwise() {
        let save = SaveSystem.createDefaultSave(nowEpochMs: 1_700_000_000_000)
        let east = WorldSession(cartridge: WorldRegistry.world1, save: save, mode: .arcade, events: EventBus())
        XCTAssertEqual(east.probeFacingRad, 0)
        var cart = WorldRegistry.world1
        cart.probeSpawnFacingRad = Double.pi
        let west = WorldSession(cartridge: cart, save: save, mode: .arcade, events: EventBus())
        XCTAssertEqual(west.probeFacingRad, Double.pi)
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

    // Home's Dive names the city and its place in the campaign (web twin: tests/qaParity.test.ts).
    func testDiveLabelNamesTheCityAndItsPlace() {
        XCTAssertEqual(campaignStageNumber(worldId: "world_1"), 1)
        XCTAssertEqual(campaignStageNumber(worldId: "world_4"), 4)
        XCTAssertNil(campaignStageNumber(worldId: "pulp_rescue"))
        XCTAssertEqual(shortCityName("Accra & Colorado Springs"), "Accra")
        XCTAssertEqual(shortCityName("Station Aurora (408 km LEO)"), "Station Aurora")
        XCTAssertEqual(shortCityName("Tokyo & Chicago"), "Tokyo")
        XCTAssertEqual(shortCityName("New Orleans"), "New Orleans")
        for host in HostsAndHistory.hostCities {
            XCTAssertNotNil(campaignStageNumber(worldId: host.worldId), host.worldId)
        }
    }

    // "Have a Sync Code?" on a brand-new device: the code's tooth comes across, although the fresh
    // save was written later; counts still merge (web twin: tests/qaParity.test.ts).
    func testPrologueRestoreKeepsTheCodesToothOnABrandNewSave() {
        var fromOtherPhone = SaveSystem.createDefaultSave(nowEpochMs: 1_700_000_000_000)
        fromOtherPhone.companion.enamelShield = 41
        fromOtherPhone.fluorideIons = 300
        fromOtherPhone.hasSeenCosmicIntro = true
        var fresh = SaveSystem.createDefaultSave(nowEpochMs: 1_700_000_900_000)
        fresh.fluorideIons = 5
        let restored = SaveSystem.mergeSaves(current: fresh, imported: fromOtherPhone, preferImported: true)
        XCTAssertEqual(restored.companion.enamelShield, 41)
        XCTAssertEqual(restored.fluorideIons, 300)
        XCTAssertTrue(restored.hasSeenCosmicIntro)
        // An ordinary import still keeps this device's newer tooth.
        let merged = SaveSystem.mergeSaves(current: fresh, imported: fromOtherPhone)
        XCTAssertEqual(merged.companion.enamelShield, fresh.companion.enamelShield)
        XCTAssertEqual(merged.fluorideIons, 300)
    }

    // The Prologue's hardness scale: the web's five specimens, softest first, enamel picked first.
    func testMohsSpecimensMatchTheWeb() {
        XCTAssertEqual(MohsSpecimens.all.map(\.name), ["Pure Gold", "Iron / Mild Steel", "Tooth Enamel", "Crystalline Quartz", "Diamond"])
        XCTAssertEqual(MohsSpecimens.all.map(\.hardness), ["2.5", "4.0", "5.0", "7.0", "10.0"])
        XCTAssertEqual(MohsSpecimens.all.map(\.shortName), ["Gold", "Iron", "Enamel", "Quartz", "Diamond"])
        XCTAssertTrue(MohsSpecimens.all[MohsSpecimens.enamelIndex].isEnamel)
        XCTAssertEqual(MohsSpecimens.all.filter(\.isEnamel).count, 1)
    }
}
