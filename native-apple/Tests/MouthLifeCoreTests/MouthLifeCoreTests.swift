import XCTest
@testable import MouthLifeCore

final class MouthLifeCoreTests: XCTestCase {

    // MARK: - 1. OralSurfaceGrid & Biophysics Laws

    func testOralSurfaceGridDimensionsAndBoundsSafety() {
        let grid = OralSurfaceGrid(cartridge: WorldRegistry.world1)
        XCTAssertEqual(grid.gridW, 256)
        XCTAssertEqual(grid.gridH, 128)
        XCTAssertEqual(grid.rgbaBuffer.count, 256 * 128 * 4)
        XCTAssertGreaterThan(grid.paintableTotal, 10_000)

        let rescueGrid = OralSurfaceGrid(cartridge: WorldRegistry.pulpRescue)
        XCTAssertEqual(rescueGrid.gridW, 128)
        XCTAssertEqual(rescueGrid.gridH, 128)

        // Out-of-bounds brush strokes must never crash or corrupt state
        let resNeg = grid.applyBrush(
            BrushApplyParams(
                cx: -50,
                cz: -50,
                facingRad: 0,
                arcRad: GameConfig.brushBaseArcRad,
                radius: 2.0,
                removalPerSec: GameConfig.brushMovingRate,
                dt: 0.1,
                hasBassUpgrade: false
            )
        )
        XCTAssertEqual(resNeg.newlyCleanedCells, 0)

        let resFar = grid.applyBrush(
            BrushApplyParams(
                cx: 999,
                cz: 999,
                facingRad: 0,
                arcRad: GameConfig.brushBaseArcRad,
                radius: 2.0,
                removalPerSec: GameConfig.brushMovingRate,
                dt: 0.1,
                hasBassUpgrade: false
            )
        )
        XCTAssertEqual(resFar.newlyCleanedCells, 0)
    }

    func testBrushSweepingBeatsStationaryAndInterdentalBlocksBristles() {
        let gridA = OralSurfaceGrid(cartridge: WorldRegistry.world1)
        let gridB = OralSurfaceGrid(cartridge: WorldRegistry.world1)

        let sweep = gridA.applyBrush(
            BrushApplyParams(
                cx: 12.0,
                cz: 16.0,
                facingRad: 0,
                arcRad: GameConfig.brushBaseArcRad,
                radius: GameConfig.brushBaseRadius,
                removalPerSec: GameConfig.brushMovingRate,
                dt: 0.25,
                hasBassUpgrade: false,
                isMovingSweep: true
            )
        )
        let stationary = gridB.applyBrush(
            BrushApplyParams(
                cx: 12.0,
                cz: 16.0,
                facingRad: 0,
                arcRad: GameConfig.brushBaseArcRad,
                radius: GameConfig.brushBaseRadius,
                removalPerSec: GameConfig.brushStationaryRate,
                dt: 0.25,
                hasBassUpgrade: false,
                isMovingSweep: false
            )
        )
        XCTAssertGreaterThan(sweep.densityRemovedTotal, stationary.densityRemovedTotal)

        // Interdental alley cells block brush bristles (~35% hidden contact law), cleared only by floss
        let alley = WorldRegistry.world1.interdentalAlleys[0]
        let midX = (alley.endpointA.x + alley.endpointB.x) * 0.5
        let midZ = (alley.endpointA.z + alley.endpointB.z) * 0.5
        let beforeFloss = gridA.sampleDensity(atX: midX, z: midZ)
        _ = gridA.applyBrush(
            BrushApplyParams(
                cx: midX,
                cz: midZ,
                facingRad: 0,
                arcRad: .pi * 2,
                radius: 3.0,
                removalPerSec: 10.0,
                dt: 1.0,
                hasBassUpgrade: true,
                isMovingSweep: true
            )
        )
        XCTAssertEqual(gridA.sampleDensity(atX: midX, z: midZ), beforeFloss, accuracy: 1e-5)

        let flossRes = gridA.applyFloss(
            a: alley.endpointA,
            b: alley.endpointB,
            halfWidth: GameConfig.flossPtfeHalfWidth,
            epsCrackHalfWidth: GameConfig.epsFlossCrackHalfWidth
        )
        XCTAssertGreaterThan(flossRes.newlyCleanedCells, 0)
        XCTAssertLessThanOrEqual(gridA.sampleDensity(atX: midX, z: midZ), GameConfig.cleanThreshold)
    }

    func testCriticalPhAbrasionLockAndFluorapatiteShield() {
        let cart = WorldRegistry.world3
        let grid = OralSurfaceGrid(cartridge: cart)
        let chem = OralChemistrySim(cartridge: cart)

        // Drop local pH to 5.0 (below Hydroxyapatite 5.5, above Fluorapatite 4.5)
        chem.applyAcidZone(cx: 10.0, cz: 16.0, radius: 4.0, targetPh: 5.0)
        let blocked = grid.applyBrush(
            BrushApplyParams(
                cx: 10.0,
                cz: 16.0,
                facingRad: 0,
                arcRad: .pi,
                radius: 2.0,
                removalPerSec: GameConfig.brushMovingRate,
                dt: 0.25,
                hasBassUpgrade: false,
                isMovingSweep: true
            ),
            chemistry: chem
        )
        XCTAssertGreaterThan(blocked.acidAbrasionWarnings, 0)
        XCTAssertEqual(blocked.densityRemovedTotal, 0, accuracy: 1e-6)

        // Convert to Fluorapatite (critical pH 4.5) — now pH 5.0 is safe to brush!
        _ = grid.convertCircleToFluorapatite(cx: 10.0, cz: 16.0, radius: 4.0)
        let safeNow = grid.applyBrush(
            BrushApplyParams(
                cx: 10.0,
                cz: 16.0,
                facingRad: 0,
                arcRad: .pi,
                radius: 2.0,
                removalPerSec: GameConfig.brushMovingRate,
                dt: 0.35,
                hasBassUpgrade: false,
                isMovingSweep: true
            ),
            chemistry: chem
        )
        XCTAssertEqual(safeNow.acidAbrasionWarnings, 0)
        XCTAssertGreaterThan(safeNow.densityRemovedTotal, 0)
    }

    func testLeeuwenhoekRinseLawAndEpsDomeCracking() {
        // World 5 EPS Domes deflect bristles until cracked by Floss or Ion Rinse
        let cart5 = WorldRegistry.world5
        let grid5 = OralSurfaceGrid(cartridge: cart5)
        guard let dome = cart5.epsDomes?.first else {
            return XCTFail("Expected World 5 EPS domes")
        }

        let deflected = grid5.applyBrush(
            BrushApplyParams(
                cx: dome.cx,
                cz: dome.cz,
                facingRad: 0,
                arcRad: .pi * 2,
                radius: 2.0,
                removalPerSec: GameConfig.brushMovingRate,
                dt: 0.4,
                hasBassUpgrade: true,
                isMovingSweep: true
            )
        )
        XCTAssertGreaterThan(deflected.epsDeflectWarnings, 0)

        let cracked = grid5.applyFloss(
            a: Vec2(x: dome.cx - dome.radius, z: dome.cz),
            b: Vec2(x: dome.cx + dome.radius, z: dome.cz),
            halfWidth: GameConfig.flossPtfeHalfWidth,
            epsCrackHalfWidth: GameConfig.epsFlossCrackHalfWidth
        )
        XCTAssertGreaterThan(cracked.epsCellsCracked, 0)

        // RGBA texture sync runs only when dirty
        let chem5 = OralChemistrySim(cartridge: cart5)
        XCTAssertTrue(grid5.syncRgbaBuffer(bChannelMode: .epsArmor, chemistry: chem5))
        XCTAssertFalse(grid5.syncRgbaBuffer(bChannelMode: .epsArmor, chemistry: chem5))
    }

    // MARK: - 2. OralChemistrySim Stephan Curve

    func testStephanCurveAndSalivaSpringBuffering() {
        let chem = OralChemistrySim(cartridge: WorldRegistry.world3)
        XCTAssertEqual(chem.samplePh(atX: 16, z: 16), WorldRegistry.world3.baselinePh, accuracy: 0.05)

        chem.triggerStephanSip()
        XCTAssertLessThan(chem.samplePh(atX: 16, z: 16), GameConfig.criticalPhHydroxyapatite)

        chem.bufferStephanWithSpring(seconds: GameConfig.stephanSpringBufferSec)
        chem.step(dt: 14.0)
        XCTAssertEqual(chem.stephanTimerSec, 0.0, accuracy: 1e-4)
        XCTAssertGreaterThanOrEqual(chem.samplePh(atX: 16, z: 16), GameConfig.criticalPhHydroxyapatite)
    }

    // MARK: - 3. CollisionSystem & Capillary Tether-Zip

    func testAlleyWallsBlockProbeAndAllowCapillaryZip() {
        let cart = WorldRegistry.world1
        let walls = cart.wallBoxes + buildAlleyWalls(cart)
        let alley = cart.interdentalAlleys[0]
        XCTAssertLessThan(alley.width, GameConfig.probeRadius * 2.0)

        // Probe starting near endpointA aimed into endpointB triggers 0.22s Capillary Tether-Zip
        let dx = alley.endpointB.x - alley.endpointA.x
        let dz = alley.endpointB.z - alley.endpointA.z
        let len = hypot(dx, dz)
        let aim = Vec2(x: dx / len, z: dz / len)

        let candidate = tryStartCapillaryZip(
            probePos: alley.endpointA,
            aimDir: aim,
            alleys: cart.interdentalAlleys,
            allWalls: walls,
            maxAngleRad: GameConfig.flossZipMaxAngleRad,
            entryDist: GameConfig.flossZipEntryDist
        )
        XCTAssertNotNil(candidate)
        if var zip = candidate?.zip {
            XCTAssertEqual(zip.duration, GameConfig.flossZipDurationSec, accuracy: 1e-6)
            let finished = stepCapillaryZip(&zip, dt: 0.25)
            XCTAssertTrue(finished.done)
            XCTAssertEqual(finished.pos.x, alley.endpointB.x, accuracy: 1e-5)
            XCTAssertEqual(finished.pos.z, alley.endpointB.z, accuracy: 1e-5)
        }
    }

    // MARK: - 4. 4-Pillar ScoringEngine

    func testScoringBreakdownParFloorAndFluorapatiteGold() {
        let scoring = ScoringEngine()
        XCTAssertEqual(scoring.synergyMultiplier, 1.0, accuracy: 1e-6)
        scoring.recordSweepingCellsCleaned(100, isMovingSweep: true)
        scoring.recordFlossSlice(targetsHit: 2, cellsCleaned: 40)
        XCTAssertEqual(scoring.synergyMultiplier, 1.25, accuracy: 1e-6)
        scoring.recordIonRinseSeal(200)
        XCTAssertEqual(scoring.synergyMultiplier, 1.50, accuracy: 1e-6)

        for _ in 0..<8 { scoring.recordCommensalSiteRestored() }
        scoring.recordSucroseCleared(6)

        // Slow run still earns >= 250 Par Time floor (never 0!)
        let slow = scoring.evaluateBreakdown(
            worldCleanRatio: 0.92,
            sitesTotal: 8,
            elapsedSec: 999.0,
            parTimeSec: 120.0
        )
        XCTAssertGreaterThanOrEqual(slow.parTimePts, GameConfig.scoreMinPartimeFloor)

        // Perfect run earns FLUORAPATITE_GOLD
        for _ in 0..<10 {
            scoring.recordSweepingCellsCleaned(250, isMovingSweep: true)
            scoring.recordFlossSlice(targetsHit: 2, cellsCleaned: 50)
        }
        let gold = scoring.evaluateBreakdown(
            worldCleanRatio: 0.98,
            sitesTotal: 8,
            elapsedSec: 95.0,
            parTimeSec: 120.0
        )
        XCTAssertGreaterThanOrEqual(gold.totalScore, 9000)
        XCTAssertEqual(gold.grade, .fluorapatiteGold)
    }

    // MARK: - 5. CompanionArchSim Smooth Bask, 90-Day Saliva Stasis & Zero-Permadeath Pulp Rescue

    func testSmoothBaskAndNinetyDaySalivaStasisGuarantee() {
        var state = CompanionState(
            smoothnessIndex: 100.0,
            enamelShield: 100.0,
            dentinShield: 100.0,
            pulpIntegrity: 100.0,
            unclaimedIdleIons: 0,
            recentTreatTimestampsMs: [],
            lastEvaluatedEpochMs: 1_000_000
        )

        // 12 hours in Smooth Bask banks full 72 Fluoride Ions reservoir
        let twelveHoursMs: Int64 = 12 * 3_600_000
        let added = CompanionArchSim.reconcileOfflineElapsed(&state, nowEpochMs: 1_000_000 + twelveHoursMs)
        XCTAssertEqual(added, 72)
        XCTAssertEqual(state.unclaimedIdleIons, 72)
        XCTAssertEqual(state.smoothnessIndex, 85.0, accuracy: 0.05)

        // 90 days away: Saliva Stasis holds >= 45 smoothness and NEVER damages shields or pulp!
        let ninetyDaysMs: Int64 = 90 * 24 * 3_600_000
        _ = CompanionArchSim.reconcileOfflineElapsed(&state, nowEpochMs: 1_000_000 + twelveHoursMs + ninetyDaysMs)
        XCTAssertEqual(state.smoothnessIndex, GameConfig.stasisFloorSmoothness, accuracy: 0.01)
        XCTAssertEqual(state.enamelShield, 100.0)
        XCTAssertEqual(state.dentinShield, 100.0)
        XCTAssertEqual(state.pulpIntegrity, 100.0)
    }

    func testTreatCascadeAndZeroPermadeathPulpRescue() {
        var state = createInitialCompanionState(nowEpochMs: 10_000)
        var rescueTriggered = false
        var totalTreatIons = 0

        // Feed 8 treats within 1 hour: only first 3 grant +20 Ions (= 60 total), cascade triggers Pulp Rescue
        for i in 0..<8 {
            let outcome = CompanionArchSim.feedRegionalTreat(&state, nowEpochMs: 10_000 + Int64(i * 1000))
            totalTreatIons += outcome.ionsGranted
            if outcome.triggeredPulpRescue {
                rescueTriggered = true
            }
        }
        XCTAssertEqual(totalTreatIons, 60)
        XCTAssertTrue(rescueTriggered)
        XCTAssertEqual(state.pulpIntegrity, 0.0)

        // Timeout stabilization: Ca(OH)₂ liner stabilizes shields & pulp to 50% (zero permadeath!)
        let timeoutIons = CompanionArchSim.resolvePulpRescue(&state, won: false, nowEpochMs: 50_000)
        XCTAssertEqual(timeoutIons, 0)
        XCTAssertEqual(state.pulpIntegrity, 50.0)
        XCTAssertEqual(state.enamelShield, 50.0)
        XCTAssertEqual(state.dentinShield, 50.0)
        XCTAssertGreaterThanOrEqual(state.smoothnessIndex, 65.0)
    }

    // MARK: - 6. SaveSystem V1->V2 Migration, HabitBank & Cross-Platform ML2: Sync Codes

    func testHabitBankCapsAndCrossPlatformMl2SyncRoundTrip() throws {
        let mem = InMemorySaveStorage()
        let bus = EventBus()
        let sys = SaveSystem(bus: bus, storage: mem)
        _ = sys.load(nowEpochMs: 1_700_000_000_000)

        let fixedDate = Date(timeIntervalSince1970: 1_700_000_000)
        // 2 full rewards (75 each w/ floss) + 3 courtesy tips (5 each) + 6th capped (0)
        let r1 = sys.recordBrushAlongCompletion(withFlossBonus: true, date: fixedDate)
        let r2 = sys.recordBrushAlongCompletion(withFlossBonus: true, date: fixedDate)
        let r3 = sys.recordBrushAlongCompletion(withFlossBonus: true, date: fixedDate)
        let r4 = sys.recordBrushAlongCompletion(withFlossBonus: false, date: fixedDate)
        let r5 = sys.recordBrushAlongCompletion(withFlossBonus: false, date: fixedDate)
        let r6 = sys.recordBrushAlongCompletion(withFlossBonus: true, date: fixedDate)

        XCTAssertEqual(r1.ionsAwarded, 75)
        XCTAssertTrue(r1.stampAwarded)
        XCTAssertEqual(r2.ionsAwarded, 75)
        XCTAssertTrue(r2.stampAwarded)
        XCTAssertEqual(r3.ionsAwarded, 5)
        XCTAssertFalse(r3.stampAwarded)
        XCTAssertEqual(r4.ionsAwarded, 5)
        XCTAssertEqual(r5.ionsAwarded, 5)
        XCTAssertEqual(r6.ionsAwarded, 0)
        XCTAssertEqual(sys.getSave().totalBrushStamps, 2)

        // Export ML2: Sync Code and import into a second SaveSystem
        let syncCode = SaveSystem.encodeSaveToSyncCode(sys.getSave())
        XCTAssertTrue(syncCode.hasPrefix("ML2:"))
        XCTAssertFalse(syncCode.contains("="))

        let decoded = try SaveSystem.decodeSaveFromSyncCode(syncCode, nowEpochMs: 1_700_000_005_000)
        XCTAssertEqual(decoded.totalBrushStamps, 2)
        XCTAssertEqual(decoded.fluorideIons, sys.getSave().fluorideIons)
        XCTAssertEqual(decoded.schemaVersion, 2)

        // Verify V1 legacy JSON + unknown upgrade stripping
        let legacyV1 = """
        {
          "schemaVersion": 1,
          "totalBrushStamps": 4,
          "fluorideCrystals": 320,
          "unlockedUpgrades": ["angled_bass_bristles", "bogus_future_laser"],
          "equippedBrushUpgrade": "angled_bass_bristles",
          "worldProgress": {
            "world_1": { "completed": true, "bestScore": 8450 }
          }
        }
        """
        let migrated = SaveSystem.migrateSave(jsonString: legacyV1, nowEpochMs: 1_700_000_010_000)
        XCTAssertEqual(migrated.schemaVersion, 2)
        XCTAssertEqual(migrated.totalBrushStamps, 4)
        XCTAssertEqual(migrated.fluorideIons, 320)
        XCTAssertEqual(migrated.unlockedUpgrades, ["angled_bass_array"])
        XCTAssertEqual(migrated.equippedUpgrades.brush, "angled_bass_array")
        XCTAssertEqual(migrated.worlds["world_1"]?.completed, true)
        XCTAssertEqual(migrated.worlds["world_2"]?.unlocked, true)
    }

    // MARK: - 7. 32-Tooth DentalChart, CharityInfo, Cartridges & WorldSession Smoke

    func testDentalChartCharityAndWorldSessionStep() {
        XCTAssertEqual(DentalChart.adultTeeth.count, 32)
        XCTAssertEqual(DentalChart.surfaces.count, 5)
        XCTAssertEqual(DentalChart.layers.count, 4)

        let upperRightFirstMolar = DentalChart.tooth(byUniversal: 3)
        XCTAssertEqual(upperRightFirstMolar.fdi, "16")

        let q = DentalChart.generateSpotQuizQuestion(seed: 42)
        let rightAns = DentalChart.gradeSpotAnswer(question: q, tappedUniversal: q.targetUniversal)
        XCTAssertTrue(rightAns.correct)
        XCTAssertEqual(rightAns.nextStreak, 1)

        XCTAssertEqual(CharityInfo.donateUrl.scheme, "https")
        XCTAssertEqual(CharityInfo.websiteUrl.host, "smileonu.org")
        XCTAssertEqual(WorldRegistry.allWorlds.count, 6)

        // Step WorldSession deterministically
        let bus = EventBus()
        let save = SaveSystem.createDefaultSave(nowEpochMs: 1_700_000_000_000)
        let session = WorldSession(cartridge: WorldRegistry.world1, save: save, mode: .arcade, events: bus)
        let initialClean = session.grid.worldCleanRatio

        for i in 0..<45 {
            session.step(
                dt: 1.0 / 60.0,
                input: SessionInputCommand(
                    moveX: cos(Double(i) * 0.08),
                    moveZ: sin(Double(i) * 0.08),
                    scrubHeld: true
                )
            )
        }
        let snap = session.makeSnapshot()
        XCTAssertGreaterThan(snap.worldCleanRatio, initialClean)
    }
}
