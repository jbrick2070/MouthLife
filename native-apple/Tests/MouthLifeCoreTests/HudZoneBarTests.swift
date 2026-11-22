import XCTest
@testable import MouthLifeCore

/// The stage HUD's zone bar and goal line. The same cases run on the web
/// (tests/zoneBar.test.ts, tests/objectiveBreadcrumb.test.ts), so both editions show the same thing.
final class HudZoneBarTests: XCTestCase {

    private let zones = WorldRegistry.world1.districts

    func testZoneIndexNamesTheZoneAPointIsInside() {
        XCTAssertEqual(zoneIndexAt(x: 7.5, z: 16, districts: zones), 0)
        XCTAssertEqual(zoneIndexAt(x: 22.01, z: 16, districts: zones), 1)
        XCTAssertEqual(zoneIndexAt(x: 50, z: 16, districts: zones), 2)
    }

    func testZoneIndexGivesASharedEdgeToTheFirstZoneAndOffTheToothToTheNearest() {
        XCTAssertEqual(zoneIndexAt(x: 22, z: 16, districts: zones), 0)
        XCTAssertEqual(zoneIndexAt(x: 1, z: 16, districts: zones), 0)
        XCTAssertEqual(zoneIndexAt(x: 32, z: 1, districts: zones), 1)
        XCTAssertEqual(zoneIndexAt(x: 63, z: 30, districts: zones), 2)
        XCTAssertEqual(zoneIndexAt(x: 5, z: 5, districts: []), -1)
    }

    func testZoneBarFillsTowardTheSealAndMarksWhereHydraIs() {
        let bar = zoneBarModel(districtClean: [0.45, 0.9, 0.2], sealed: [false, false, false], hereIndex: 1, sealRatio: 0.9)
        XCTAssertEqual(bar.map(\.sealed), [false, false, false])
        XCTAssertEqual(bar.map(\.here), [false, true, false])
        XCTAssertEqual(bar[0].fill, 0.5, accuracy: 1e-6)
        XCTAssertEqual(bar[1].fill, 1)
        XCTAssertEqual(bar[2].fill, 0.2222222, accuracy: 1e-6)
    }

    func testASealedZoneIsFullWhateverItsCleanShareReads() {
        let bar = zoneBarModel(districtClean: [0.5, 0.95], sealed: [true, false], hereIndex: -1, sealRatio: 0.9)
        XCTAssertEqual(bar[0], ZoneBarSegment(fill: 1, sealed: true, here: false))
        XCTAssertEqual(bar[1], ZoneBarSegment(fill: 1, sealed: false, here: false))
    }

    func testZoneBarNeverLeavesZeroToOne() {
        let bar = zoneBarModel(districtClean: [1.2, -0.1, .nan], sealed: [false, false, false], hereIndex: 0, sealRatio: 0.9)
        XCTAssertEqual(bar.map(\.fill), [1, 0, 0])
        XCTAssertEqual(GameConfig.districtSealCleanRatio, 0.9)
        XCTAssertEqual(zoneBarModel(districtClean: [0.45], sealed: [false], hereIndex: 0)[0].fill, 0.5, accuracy: 1e-6)
        XCTAssertTrue(zoneBarModel(districtClean: [], sealed: [], hereIndex: 0).isEmpty)
    }

    // MARK: - Goal line

    private func input(sites: Int, clean: [Double] = [0.3, 0.3], sealed: [Bool] = [false, false], surge: Bool = false) -> ObjectiveInput {
        ObjectiveInput(mode: .arcade, worldCleanRatio: 0.3, districtClean: clean, sealed: sealed, sitesLeftOpen: sites, domesRemaining: false, surgeReady: surge)
    }

    func testThePhoneGoalLineKeepsJustTheGoal() {
        XCTAssertEqual(compactObjectiveBreadcrumb(input(sites: 10)), "Restore 10 colonies")
        XCTAssertEqual(compactObjectiveBreadcrumb(input(sites: 1)), "1 colony left — follow ➤")
        // Every other goal is the full line.
        let others = [
            input(sites: 0),
            input(sites: 0, surge: true),
            input(sites: 0, clean: [0.85, 0.85]),
            input(sites: 0, clean: [0.95, 0.95], sealed: [true, true])
        ]
        for inp in others {
            XCTAssertEqual(compactObjectiveBreadcrumb(inp), computeObjectiveBreadcrumb(inp))
        }
    }

    func testTheGoalLineFromASnapshotMatchesTheLiveSession() {
        let save = SaveSystem.createDefaultSave(nowEpochMs: 1_700_000_000_000)
        for cart in WorldRegistry.allWorlds {
            let mode: ActivePlayMode = cart.id == "pulp_rescue" ? .pulpRescue : .arcade
            let session = WorldSession(cartridge: cart, save: save, mode: mode, events: EventBus())
            XCTAssertEqual(
                computeObjectiveBreadcrumb(snapshot: session.makeSnapshot(), cartridge: cart),
                computeObjectiveBreadcrumb(for: session),
                cart.id
            )
        }
    }

    /// The snapshot must carry every input the goal needs, not only the ones a fresh stage shows.
    func testTheSnapshotCarriesEveryGoalInput() {
        let cart = WorldRegistry.world1
        let fresh = WorldSession(cartridge: cart, save: SaveSystem.createDefaultSave(nowEpochMs: 1_700_000_000_000), mode: .arcade, events: EventBus()).makeSnapshot()

        // every helper spot back, zones nearly clean, Surge full
        var snap = fresh
        for i in snap.sites.indices { snap.sites[i].restored = true }
        snap.districtCleanRatios = [0.85, 0.86, 0.84]
        snap.surgeMeter = GameConfig.surgeMax
        XCTAssertEqual(computeObjectiveBreadcrumb(snapshot: snap, cartridge: cart), "Almost clean! Fire Fluoride Surge [Q] to seal!")
        XCTAssertEqual(computeObjectiveBreadcrumb(snapshot: snap, cartridge: cart, keys: false), "Almost clean! Fire Fluoride Surge to seal!")
        snap.surgeMeter = GameConfig.surgeMax - 1
        XCTAssertEqual(computeObjectiveBreadcrumb(snapshot: snap, cartridge: cart), "Sweep D3 (84% → 90%) to seal it!")

        // a helper spot in a sealed zone no longer counts
        snap = fresh
        snap.sealedDistricts = [true, false, false]
        let openSites = snap.sites.filter { $0.districtIdx != 0 }.count
        XCTAssertEqual(objectiveInput(snapshot: snap, cartridge: cart).sitesLeftOpen, openSites)

        // all sealed
        snap.sealedDistricts = [true, true, true]
        XCTAssertEqual(computeObjectiveBreadcrumb(snapshot: snap, cartridge: cart), "✨ All zones sealed — you did it!")

        // the acid clock (city 3) and the slime domes (city 5) come from the snapshot too
        let tokyo = WorldRegistry.world3
        var acid = WorldSession(cartridge: tokyo, save: SaveSystem.createDefaultSave(nowEpochMs: 1_700_000_000_000), mode: .arcade, events: EventBus()).makeSnapshot()
        acid.stephanTimerSec = 12.2
        XCTAssertEqual(computeObjectiveBreadcrumb(snapshot: acid, cartridge: tokyo), "Acid clock 13s — use Saliva Spring!")
        // the same reading means nothing in a city without the clock
        var noClock = fresh
        noClock.stephanTimerSec = 12.2
        XCTAssertFalse(computeObjectiveBreadcrumb(snapshot: noClock, cartridge: cart).hasPrefix("Acid clock"))

        let orbit = WorldRegistry.world5
        var domes = WorldSession(cartridge: orbit, save: SaveSystem.createDefaultSave(nowEpochMs: 1_700_000_000_000), mode: .arcade, events: EventBus()).makeSnapshot()
        domes.epsArmorRemainingRatio = 0.4
        XCTAssertEqual(computeObjectiveBreadcrumb(snapshot: domes, cartridge: orbit, keys: false), "🛡️ Crack the dome: Floss or Surge!")
        domes.epsArmorRemainingRatio = 0
        XCTAssertFalse(computeObjectiveBreadcrumb(snapshot: domes, cartridge: orbit).contains("dome"))
    }

    func testGoalLinesWithoutKeyboardHintsAreWholeSentences() {
        let done = input(sites: 0)
        XCTAssertEqual(computeObjectiveBreadcrumb(done, keys: false), "Scrub enamel → bring back colonies → Surge!")
        XCTAssertEqual(computeObjectiveBreadcrumb(input(sites: 0, surge: true), keys: false), "Scrub enamel → fire Surge to seal!")
        XCTAssertEqual(computeObjectiveBreadcrumb(input(sites: 0, clean: [0.95, 0.85], sealed: [true, false], surge: true), keys: false), "Fire Fluoride Surge to seal final district!")
        for inp in [done, input(sites: 0, surge: true), input(sites: 3), input(sites: 1)] {
            XCTAssertFalse(computeObjectiveBreadcrumb(inp, keys: false).contains("["))
            XCTAssertFalse(compactObjectiveBreadcrumb(inp, keys: false).contains("["))
        }
        // The rescue line is one sentence with its numbers, so it translates whole.
        var rescue = ObjectiveInput(mode: .pulpRescue, worldCleanRatio: 0.73, districtClean: [0.73], sealed: [false], sitesLeftOpen: 0, domesRemaining: false, surgeReady: false, rescueRemainingSec: 39.2)
        XCTAssertEqual(computeObjectiveBreadcrumb(rescue), "Pulp: 12% more • 40s left — scrub!")
        rescue.rescueRemainingSec = nil
        XCTAssertEqual(computeObjectiveBreadcrumb(rescue), "Pulp: 12% more — scrub!")
        rescue.worldCleanRatio = 0.9
        XCTAssertEqual(computeObjectiveBreadcrumb(rescue), "Patching… the pulp is safe!")
    }

    // MARK: - Direction arrow and the cleaned-cell count

    /// The HUD's one-pass arrow must point at what the full target list would put first.
    func testTheSnapshotArrowPointsAtTheNearestTarget() {
        let save = SaveSystem.createDefaultSave(nowEpochMs: 1_700_000_000_000)
        for cart in WorldRegistry.campaignWorlds {
            let fresh = WorldSession(cartridge: cart, save: save, mode: .arcade, events: EventBus()).makeSnapshot()
            var cases: [SessionSnapshot] = [fresh]
            var scanning = fresh
            scanning.discloseActiveRemaining = 5
            scanning.epsArmorRemainingRatio = 0.6
            cases.append(scanning)
            var nearlyDone = fresh
            for i in nearlyDone.sites.indices where i != 1 { nearlyDone.sites[i].restored = true }
            cases.append(nearlyDone)
            var sealedZone = nearlyDone
            sealedZone.sealedDistricts = sealedZone.sealedDistricts.map { _ in true }
            cases.append(sealedZone)
            for (n, snap) in cases.enumerated() {
                let domes = cart.epsDomes ?? []
                let expected = selectWayfinderTargets(
                    WayfinderInput(
                        sites: snap.sites,
                        sealedDistricts: snap.sealedDistricts,
                        crystals: snap.sucroseCrystals,
                        domes: domes,
                        domesRemaining: !domes.isEmpty && snap.epsArmorRemainingRatio > 0,
                        scanActive: snap.discloseActiveRemaining > 0,
                        probe: snap.probePos
                    ),
                    maxSlots: 1
                ).first
                let arrow = computeWayfinder(snapshot: snap, cartridge: cart)
                XCTAssertEqual(arrow?.target.kind, expected?.kind, "\(cart.id) case \(n)")
                if let arrow, let expected {
                    XCTAssertEqual(arrow.distance, hypot(expected.x - snap.probePos.x, expected.z - snap.probePos.z), accuracy: 1e-9, "\(cart.id) case \(n)")
                    XCTAssertEqual(arrow.worldAngleRad, atan2(arrow.target.z - snap.probePos.z, arrow.target.x - snap.probePos.x), accuracy: 1e-9)
                }
            }
            // A fresh city has three or more helper spots left in every zone: nothing to point at yet.
            XCTAssertNil(computeWayfinder(snapshot: fresh, cartridge: cart), cart.id)
            XCTAssertNotNil(computeWayfinder(snapshot: nearlyDone, cartridge: cart), cart.id)
            XCTAssertNil(computeWayfinder(snapshot: sealedZone, cartridge: cart), cart.id)
        }
    }

    /// The brush sound takes the difference of this count between snapshots.
    func testTheSnapshotCountsEveryCleanedCellOnce() {
        let bus = EventBus()
        var fromEvents = 0
        _ = bus.subscribe { event in
            if case let .actuatorScrub(_, newlyCleaned, _, _) = event { fromEvents += newlyCleaned }
        }
        let session = WorldSession(cartridge: WorldRegistry.world1, save: SaveSystem.createDefaultSave(nowEpochMs: 1_700_000_000_000), mode: .arcade, events: bus)
        XCTAssertEqual(session.makeSnapshot().cellsCleanedTotal, 0)
        var last = 0
        for _ in 0..<120 {
            session.step(dt: 1.0 / 60.0, input: SessionInputCommand(moveX: 1, scrubHeld: true))
            let total = session.makeSnapshot().cellsCleanedTotal
            XCTAssertGreaterThanOrEqual(total, last)
            last = total
        }
        XCTAssertGreaterThan(last, 50)
        XCTAssertEqual(last, fromEvents)
    }

    func testToastsDropKeyboardHintsOnTouchScreens() {
        XCTAssertEqual(compactToastText("Fire Fluoride Surge [Q] to seal final district!", compactViewport: true), "Fire Fluoride Surge to seal final district!")
        XCTAssertEqual(compactToastText("Press Q or tap Surge", compactViewport: true), "Tap Surge")
        XCTAssertEqual(compactToastText("Press Q / tap Surge", compactViewport: true), "Tap Surge")
        XCTAssertEqual(compactToastText("Surge [Q]!", compactViewport: false), "Surge [Q]!")
    }
}
