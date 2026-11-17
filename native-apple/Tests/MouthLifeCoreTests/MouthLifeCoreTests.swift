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

        // Feed 8 treats within 1 hour: only first 3 grant +5 Ions (= 15 total), cascade triggers Pulp Rescue
        for i in 0..<8 {
            let outcome = CompanionArchSim.feedRegionalTreat(&state, nowEpochMs: 10_000 + Int64(i * 1000))
            totalTreatIons += outcome.ionsGranted
            if outcome.triggeredPulpRescue {
                rescueTriggered = true
            }
        }
        XCTAssertEqual(totalTreatIons, 15)
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

        // Further dental charities: every link is https and stays on that charity's own site.
        XCTAssertFalse(CharityInfo.moreCharities.isEmpty)
        XCTAssertEqual(Set(CharityInfo.moreCharities.map(\.id)).count, CharityInfo.moreCharities.count)
        for charity in CharityInfo.moreCharities {
            XCTAssertTrue(charity.legalStatus.contains("501(c)(3)"))
            XCTAssertNotEqual(charity.donateUrl, charity.websiteUrl)
            for url in [charity.websiteUrl, charity.donateUrl] + charity.links.map(\.url) {
                XCTAssertEqual(url.scheme, "https")
                XCTAssertEqual(url.host, charity.websiteUrl.host)
                XCTAssertNotEqual(url.host, "smileonu.org")
            }
        }
        XCTAssertEqual(CharityInfo.moreCharities.first { $0.id == "remote_area_medical" }?.donateUrl.absoluteString, "https://www.ramusa.org/donate/")
        XCTAssertEqual(CharityInfo.moreCharities.first { $0.id == "mission_of_mercy_adcf" }?.donateUrl.absoluteString, "https://adcf.net/donate/")
        XCTAssertTrue(CharityInfo.notEndorsedNote.contains("not affiliated with, sponsored by or endorsed by"))
        let partnerLinkIds = CharityInfo.moreCharities.flatMap { $0.links.map(\.id) }
        XCTAssertEqual(Set(partnerLinkIds).count, partnerLinkIds.count)
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

    func testDirtySubRectRgbaSyncParityAndEquilibriumChemistryFastPath() {
        let cart = WorldRegistry.world1
        let grid = OralSurfaceGrid(cartridge: cart)
        let chem = OralChemistrySim(cartridge: cart)

        // Initial full sync
        XCTAssertTrue(grid.syncRgbaBuffer(bChannelMode: .localPh, chemistry: chem))
        XCTAssertEqual(grid.lastSyncedRect?.width, grid.gridW)
        XCTAssertEqual(grid.lastSyncedRect?.height, grid.gridH)

        // Neutral equilibrium step is O(1) and does not dirty chemistry
        chem.step(dt: 1.0 / 60.0)
        XCTAssertFalse(chem.consumeDirtyFlag())

        // Localized brush sweep should only dirty and sync a small bounding sub-rectangle
        _ = grid.applyBrush(
            BrushApplyParams(
                cx: 12.0,
                cz: 16.0,
                facingRad: 0.4,
                arcRad: GameConfig.brushBaseArcRad,
                radius: GameConfig.brushBaseRadius,
                removalPerSec: GameConfig.brushMovingRate,
                dt: 0.1,
                hasBassUpgrade: false,
                isMovingSweep: true
            ),
            chemistry: chem
        )
        XCTAssertTrue(grid.syncRgbaBuffer(bChannelMode: .localPh, chemistry: chem))
        guard let subRect = grid.lastSyncedRect else {
            return XCTFail("Expected non-nil lastSyncedRect after localized brush stroke")
        }
        XCTAssertLessThan(subRect.width * subRect.height, (grid.gridW * grid.gridH) / 8)

        // Verify byte-for-byte RGBA parity against a forced full-grid chemistry sync
        let subRectBytes = grid.rgbaBuffer
        chem.applyAcidZone(cx: 12.0, cz: 16.0, radius: 0.01, targetPh: cart.baselinePh)
        _ = grid.syncRgbaBuffer(bChannelMode: .localPh, chemistry: chem)
        XCTAssertEqual(subRectBytes, grid.rgbaBuffer)

        // Acid + gum irritation recover cleanly back to neutral equilibrium
        chem.applyAcidZone(cx: 14.0, cz: 14.0, radius: 3.0, targetPh: 5.1)
        chem.addGumIrritation(cx: 14.0, cz: 14.0, radius: 2.5, amount: 0.4)
        for _ in 0..<600 {
            chem.step(dt: 0.1)
        }
        XCTAssertEqual(chem.samplePh(atX: 14.0, z: 14.0), cart.baselinePh, accuracy: 0.02)
        XCTAssertEqual(chem.maxGumIrritation, 0.0, accuracy: 0.01)
    }

    // MARK: - 8. Hands-Free BrushPhaseState Mirror Timeline & 8-Language Coach System

    func testBrushPhaseMirrorTimelineAndMultilingualCoachCopy() {
        // Phase 0 (0.5s): Upper Right, Outer Cheek, 0 completed, no countdown pip yet
        let p0 = BrushPhaseState.evaluate(elapsedSec: 0.5, inFlossBonus: false)
        XCTAssertEqual(p0.quadrant, .upperRight)
        XCTAssertTrue(p0.quadrant.isUpper)
        XCTAssertTrue(p0.quadrant.isPatientRight)
        XCTAssertEqual(p0.surface, .outerCheek)
        XCTAssertEqual(p0.phaseIndex12, 0)
        XCTAssertEqual(p0.completedQuadrantsMask, 0)
        XCTAssertNil(p0.countdownPip)
        XCTAssertEqual(p0.preEcho01, 0.0, accuracy: 1e-5)

        // Final 3 seconds of Surface 0: 3 -> 2 -> 1 musical anticipation pips
        XCTAssertEqual(BrushPhaseState.evaluate(elapsedSec: 7.4, inFlossBonus: false).countdownPip, 3)
        XCTAssertEqual(BrushPhaseState.evaluate(elapsedSec: 8.4, inFlossBonus: false).countdownPip, 2)
        XCTAssertEqual(BrushPhaseState.evaluate(elapsedSec: 9.4, inFlossBonus: false).countdownPip, 1)

        // Pre-echo 0.85s before Q1 -> Q2 boundary (t = 29.5s) previews upcomingQuadrantIndex = 1
        let preQ2 = BrushPhaseState.evaluate(elapsedSec: 29.5, inFlossBonus: false)
        XCTAssertEqual(preQ2.quadrant, .upperRight)
        XCTAssertEqual(preQ2.surface, .innerTongue)
        XCTAssertEqual(preQ2.upcomingQuadrantIndex, 1)
        XCTAssertGreaterThan(preQ2.preEcho01, 0.35)

        // Q3 Lower Left Chewing (t = 72.0s): Q1 & Q2 completed (0b0011)
        let q3Chew = BrushPhaseState.evaluate(elapsedSec: 72.0, inFlossBonus: false)
        XCTAssertEqual(q3Chew.quadrant, .lowerLeft)
        XCTAssertFalse(q3Chew.quadrant.isUpper)
        XCTAssertFalse(q3Chew.quadrant.isPatientRight)
        XCTAssertEqual(q3Chew.surface, .chewingGrooves)
        XCTAssertEqual(q3Chew.completedQuadrantsMask, 0b0011)

        // Floss Pick Bonus Round: all 4 quadrants crystal-completed (0b1111), upper -> lower arch
        let flossTop = BrushPhaseState.evaluate(elapsedSec: 122.0, inFlossBonus: true)
        XCTAssertTrue(flossTop.inFlossBonus)
        XCTAssertTrue(flossTop.flossIsUpper)
        XCTAssertEqual(flossTop.completedQuadrantsMask, 0b1111)

        let flossBot = BrushPhaseState.evaluate(elapsedSec: 150.0, inFlossBonus: true)
        XCTAssertTrue(flossBot.inFlossBonus)
        XCTAssertFalse(flossBot.flossIsUpper)
        XCTAssertEqual(flossBot.completedQuadrantsMask, 0b1111)

        // Locale auto-detection & 8-language glanceable/spoken copy coverage
        XCTAssertEqual(CoachLanguage.detectSystemDefault(preferredLanguages: ["es-US", "en-US"]), .spanish)
        XCTAssertEqual(CoachLanguage.detectSystemDefault(preferredLanguages: ["ja-JP"]), .japanese)
        XCTAssertEqual(CoachLanguage.detectSystemDefault(preferredLanguages: ["zh-Hans-CN"]), .chinese)
        XCTAssertEqual(CoachLanguage.detectSystemDefault(preferredLanguages: ["ko-KR"]), .korean)
        XCTAssertEqual(CoachLanguage.detectSystemDefault(preferredLanguages: ["it-IT"]), .english)

        for lang in CoachLanguage.allCases {
            let sides = BrushCoachCopy.mirrorSideLabels(for: lang)
            XCTAssertFalse(sides.left.isEmpty)
            XCTAssertFalse(sides.right.isEmpty)
            XCTAssertFalse(BrushCoachCopy.hubStartBrushLabel(for: lang).isEmpty)

            // Minimal spoken script: a number per quadrant and one word per stage, all distinct single words.
            var spoken: [String] = []
            for q in BrushQuadrant.allCases {
                XCTAssertFalse(BrushCoachCopy.quadrantLabel(q, lang: lang).isEmpty)
                spoken.append(BrushCoachCopy.spokenQuadrantNumber(q, lang: lang))
                for s in BrushSurface.allCases {
                    let badge = BrushCoachCopy.surfaceActionBadge(s, lang: lang)
                    XCTAssertFalse(badge.headline.isEmpty)
                    XCTAssertFalse(badge.angleTag.isEmpty)
                }
            }
            for word in BrushCoachCopy.SpokenStageWord.allCases {
                spoken.append(BrushCoachCopy.spokenStageWord(word, lang: lang))
            }
            XCTAssertEqual(Set(spoken).count, 7)
            for cue in spoken {
                XCTAssertFalse(cue.isEmpty)
                XCTAssertFalse(cue.contains(" "))
            }
        }
        XCTAssertEqual(BrushQuadrant.allCases.map { BrushCoachCopy.spokenQuadrantNumber($0, lang: .english) }, ["One", "Two", "Three", "Four"])
        XCTAssertEqual(BrushCoachCopy.spokenStageWord(.floss, lang: .english), "Floss")
        XCTAssertEqual(BrushCoachCopy.spokenStageWord(.rinse, lang: .english), "Rinse")
        XCTAssertEqual(BrushCoachCopy.spokenStageWord(.done, lang: .german), "Fertig")
    }

    func testPurpleTotalCareMouthwashBonusStageAndRewards() {
        let mwStart = GameConfig.brushAlongTotalSec + GameConfig.brushAlongFlossBonusSec // 165s

        // 1. Default 60s ADA / Purple Listerine Total Care timeline (3 x 20s sub-phases)
        let step0 = BrushPhaseState.evaluate(elapsedSec: mwStart + 4.0, stage: .mouthwashBonus, mouthwashDurationSec: 60.0)
        XCTAssertTrue(step0.inMouthwashBonus)
        XCTAssertFalse(step0.inFlossBonus)
        XCTAssertEqual(step0.mouthwashStepIndex, 0)
        XCTAssertEqual(step0.phaseIndex12, 14)
        XCTAssertEqual(step0.completedQuadrantsMask, 0b1111)
        XCTAssertNil(step0.countdownPip)
        XCTAssertEqual(step0.mouthwashProgress01, Float(4.0 / 60.0), accuracy: 0.002)

        // 3-2-1 anticipation pips right before Step 0 -> Step 1 boundary (at mwStart + 20s)
        XCTAssertEqual(BrushPhaseState.evaluate(elapsedSec: mwStart + 17.5, stage: .mouthwashBonus, mouthwashDurationSec: 60.0).countdownPip, 3)
        XCTAssertEqual(BrushPhaseState.evaluate(elapsedSec: mwStart + 18.5, stage: .mouthwashBonus, mouthwashDurationSec: 60.0).countdownPip, 2)
        XCTAssertEqual(BrushPhaseState.evaluate(elapsedSec: mwStart + 19.5, stage: .mouthwashBonus, mouthwashDurationSec: 60.0).countdownPip, 1)

        // Step 1 (Pump Between All 26 Gaps) & Step 2 (Final Swish • Do Not Swallow • No Water 30m)
        let step1 = BrushPhaseState.evaluate(elapsedSec: mwStart + 30.0, stage: .mouthwashBonus, mouthwashDurationSec: 60.0)
        XCTAssertEqual(step1.mouthwashStepIndex, 1)
        XCTAssertEqual(step1.phaseIndex12, 15)
        XCTAssertEqual(step1.mouthwashProgress01, 0.50, accuracy: 0.002)

        let step2 = BrushPhaseState.evaluate(elapsedSec: mwStart + 54.0, stage: .mouthwashBonus, mouthwashDurationSec: 60.0)
        XCTAssertEqual(step2.mouthwashStepIndex, 2)
        XCTAssertEqual(step2.phaseIndex12, 16)
        XCTAssertGreaterThan(step2.mouthwashProgress01, 0.88)

        // 2. Quick 30s rinse option (3 x 10s sub-phases)
        let quickStep2 = BrushPhaseState.evaluate(
            elapsedSec: mwStart + 22.0,
            stage: .mouthwashBonus,
            mouthwashDurationSec: MouthwashDurationStyle.quick30s.durationSec
        )
        XCTAssertEqual(quickStep2.mouthwashStepIndex, 2)
        XCTAssertEqual(quickStep2.phaseDurationSec, 10.0, accuracy: 1e-5)

        // 3. HabitBank & SaveSystem 3-Stage Reward Math: 50 Brush + 25 Floss Pick + 25 Purple Fluoride Rinse = 100 F⁻
        let mem = InMemorySaveStorage()
        let sys = SaveSystem(bus: EventBus(), storage: mem)
        _ = sys.load(nowEpochMs: 1_700_000_000_000)
        let d1 = Date(timeIntervalSince1970: 1_700_000_000)
        let fullTriple = sys.recordBrushAlongCompletion(withFlossBonus: true, withMouthwashBonus: true, date: d1)
        XCTAssertEqual(fullTriple.ionsAwarded, 100)
        XCTAssertTrue(fullTriple.stampAwarded)

        let brushPlusRinseOnly = sys.recordBrushAlongCompletion(withFlossBonus: false, withMouthwashBonus: true, date: d1)
        XCTAssertEqual(brushPlusRinseOnly.ionsAwarded, 75)
        XCTAssertTrue(brushPlusRinseOnly.stampAwarded)

        // 4. 8-Language Purple Total Care Headlines & 30-Minute Post-Rinse On-Screen Guidance
        for lang in CoachLanguage.allCases {
            let btnsFull = BrushCoachCopy.mouthwashButtonLabels(didFloss: true, lang: lang)
            XCTAssertFalse(btnsFull.rinseJump.isEmpty)
            XCTAssertTrue(btnsFull.doneRinse.contains("100"))
            let btnsNoFloss = BrushCoachCopy.mouthwashButtonLabels(didFloss: false, lang: lang)
            XCTAssertTrue(btnsNoFloss.doneRinse.contains("75"))

            for sIdx in 0..<3 {
                let hl = BrushCoachCopy.mouthwashHeadline(stepIndex: sIdx, lang: lang)
                XCTAssertFalse(hl.archTitle.isEmpty)
                XCTAssertFalse(hl.actionBadge.isEmpty)
                XCTAssertFalse(hl.ruleTag.isEmpty)
            }
        }
    }

    func testImportedCountersAreClampedSoLaterRewardsCannotOverflow() {
        // A hand-edited or hostile sync code can carry absurd numbers. They must be clamped on import,
        // otherwise the next `+= reward` traps on integer overflow every time the app runs.
        let hostile: [String: Any] = [
            "schemaVersion": 2,
            "saveRevision": 1e19,
            "fluorideIons": 1e19,
            "totalBrushStamps": 1e300
        ]
        var save = SaveSystem.migrateSave(jsonObject: hostile, nowEpochMs: 1_700_000_000_000)
        XCTAssertLessThanOrEqual(save.saveRevision, 1_000_000_000)
        XCTAssertLessThanOrEqual(save.fluorideIons, 1_000_000_000)
        XCTAssertLessThanOrEqual(save.totalBrushStamps, 1_000_000_000)

        let before = save.fluorideIons
        HabitBank.completeBrushAlong(
            save: &save,
            withFlossBonus: true,
            withMouthwashBonus: true,
            date: Date(timeIntervalSince1970: 1_700_000_000)
        )
        XCTAssertEqual(save.fluorideIons, before + 100)
    }

    // MARK: - Translations (same rules as the web edition's uiTranslator)

    func testL10nMatcherTranslatesExactPatternsNamesAndIconPrefixes() {
        let m = L10nMatcher(catalog: [
            "Save Player": "Guardar jugador",
            "Restore {0} colonies — scrub glowing rings!": "¡Recupera {0} colonias: frota los anillos!",
            "{0} Treat: {1} (+{2} Ions)": "{0} Golosina: {1} (+{2} iones)",
            "Sites {0}/{1}": "Sitios {0}/{1}",
            "Sites 0/{0}": "Sitios 0/{0}",
            "{0}%": "nunca",
            "Dive (W1): {0}": "Inmersión (W1): {0}",
            "Plaque City": "Ciudad Placa"
        ])
        XCTAssertEqual(m.translate("Save Player"), "Guardar jugador")
        XCTAssertEqual(m.translate("Restore 10 colonies — scrub glowing rings!"), "¡Recupera 10 colonias: frota los anillos!")
        XCTAssertEqual(m.translate("☕ Treat: Maple Oat Cortado (+5 Ions)"), "☕ Golosina: Maple Oat Cortado (+5 iones)")
        XCTAssertEqual(m.translate("Sites 0/10"), "Sitios 0/10")
        XCTAssertEqual(m.translate("Sites 3/10"), "Sitios 3/10")
        XCTAssertEqual(m.translate("45%"), "45%")
        XCTAssertEqual(m.translate("0:15 / 4:30"), "0:15 / 4:30")
        XCTAssertEqual(m.translate("Dive (W1): Plaque City"), "Inmersión (W1): Ciudad Placa")
        XCTAssertEqual(m.translate("🎯 Restore 10 colonies — scrub glowing rings!"), "🎯 ¡Recupera 10 colonias: frota los anillos!")
        XCTAssertEqual(m.translate("Something new"), "Something new")
    }

    func testL10nLoadsEveryBundledLanguageAndFallsBackToEnglish() {
        for code in ["es", "fr", "de", "pt", "ja", "zh", "ko"] {
            L10n.setLanguage(code)
            XCTAssertEqual(L10n.languageCode, code)
            XCTAssertNotEqual(L10n.t("Tooth Atlas"), "Tooth Atlas", "\(code) should translate a common label")
        }
        L10n.setLanguage("xx")
        XCTAssertEqual(L10n.languageCode, "en")
        XCTAssertEqual(L10n.t("Tooth Atlas"), "Tooth Atlas")
        L10n.setLanguage("en")
    }

    // MARK: - 9. 120Hz GyroSloshSim Counter-vs-Handheld Auto-Detection & Liquid Spirit-Level Physics

    func testGyroSloshCounterVsHandheldAndLiquidPhysics() {
        var sim = GyroSloshSim()

        // 1. Phone resting dead-still on the bathroom counter (hands-free mode): stays in auto mode with 0 splashes
        var snap = GyroSloshSnapshot.idle
        for _ in 0..<120 {
            snap = sim.step(
                dt: 1.0 / 120.0,
                gravityX: 0.0,
                gravityY: -0.70,
                rotationRateMag: 0.004,
                userAccelX: 0.0,
                userAccelY: 0.0,
                sensorAvailable: true,
                reducedMotion: false
            )
            XCTAssertFalse(snap.didTriggerSplash)
        }
        XCTAssertFalse(snap.isHandheld)
        XCTAssertEqual(snap.handheldBlend01, 0.0, accuracy: 1e-4)
        XCTAssertEqual(snap.swishCount, 0)

        // 2. Pick up phone and tilt toward Right Cheek (+X): wakes handheld slosh, charges Right Cheek & pans splash right
        var sawRightSplash = false
        for _ in 0..<90 {
            snap = sim.step(
                dt: 1.0 / 120.0,
                gravityX: 0.46,
                gravityY: -0.62,
                rotationRateMag: 0.65,
                userAccelX: 0.12,
                userAccelY: 0.04,
                sensorAvailable: true,
                reducedMotion: false
            )
            if snap.didTriggerSplash && snap.splashPan > 0.25 {
                sawRightSplash = true
            }
        }
        XCTAssertTrue(snap.isHandheld)
        XCTAssertGreaterThan(snap.sloshPosition, 0.55)
        XCTAssertGreaterThan(snap.rightCheekCharge01, 0.15)
        XCTAssertTrue(sawRightSplash)
        XCTAssertNotEqual(snap.parallaxX, 0.0)

        // 3. Tilt briskly across center into Left Cheek (-X): sloshes left, charges Left Cheek & pans splash left
        var sawLeftSplash = false
        for _ in 0..<90 {
            snap = sim.step(
                dt: 1.0 / 120.0,
                gravityX: -0.48,
                gravityY: -0.68,
                rotationRateMag: 0.70,
                userAccelX: -0.14,
                userAccelY: 0.05,
                sensorAvailable: true,
                reducedMotion: false
            )
            if snap.didTriggerSplash && snap.splashPan < -0.25 {
                sawLeftSplash = true
            }
        }
        XCTAssertTrue(snap.isHandheld)
        XCTAssertLessThan(snap.sloshPosition, -0.55)
        XCTAssertGreaterThan(snap.leftCheekCharge01, 0.15)
        XCTAssertTrue(sawLeftSplash)
        XCTAssertGreaterThanOrEqual(snap.swishCount, 2)

        // 4. Reduce Motion immediately zeroes handheld slosh & parallax while preserving banked cheek progress
        let reduced = sim.step(
            dt: 1.0 / 120.0,
            gravityX: -0.48,
            gravityY: -0.68,
            rotationRateMag: 0.80,
            userAccelX: -0.20,
            userAccelY: 0.10,
            sensorAvailable: true,
            reducedMotion: true
        )
        XCTAssertFalse(reduced.isHandheld)
        XCTAssertEqual(reduced.sloshPosition, 0.0)
        XCTAssertEqual(reduced.parallaxX, 0.0)
        XCTAssertEqual(reduced.parallaxY, 0.0)
        XCTAssertGreaterThanOrEqual(reduced.swishCount, 2)

        // 5. Reset clears mouthwash session counters cleanly + 8-language status badges are non-empty
        sim.resetMouthwashSession()
        XCTAssertEqual(sim.swishCount, 0)
        XCTAssertEqual(sim.leftCheekCharge01, 0.0)
        XCTAssertEqual(sim.rightCheekCharge01, 0.0)

        for lang in CoachLanguage.allCases {
            let live = BrushCoachCopy.gyroSwishStatusLabel(isHandheld: true, lang: lang)
            let auto = BrushCoachCopy.gyroSwishStatusLabel(isHandheld: false, lang: lang)
            XCTAssertFalse(live.isEmpty)
            XCTAssertFalse(auto.isEmpty)
            XCTAssertNotEqual(live, auto)
        }
    }

    // MARK: - Landmark Colours

    func testSupplyBeaconColourStandsOutFromPlaqueInEveryCity() {
        // The beacon used to be this fixed yellow, which all but vanished on yellow plaque.
        let oldYellow: UInt32 = 0xFDE047
        var palettes = ["world_1", "world_2", "world_3", "world_4", "world_5"].map {
            WorldRegistry.cartridgeOrDefault(forId: $0).palette
        }
        palettes.append(WorldRegistry.pulpRescue.palette)
        for palette in palettes {
            let tint = pickSupplyBeaconTint(palette)
            XCTAssertTrue(supplyBeaconCandidates.contains(tint))
            let onPlaque = contrastRatio(tint, palette.pellicleSlimeHex)
            XCTAssertGreaterThan(onPlaque, 2.4)
            XCTAssertGreaterThan(onPlaque, contrastRatio(oldYellow, palette.pellicleSlimeHex))
            XCTAssertGreaterThan(contrastRatio(tint, palette.enamelBaseHex), 3.0)
            // A pickup is never the colour of another landmark.
            XCTAssertNotEqual(tint, pickSpringTint(palette))
            XCTAssertNotEqual(tint, pickAcidPoolTint(palette))
            XCTAssertNotEqual(tint, pickColonyRestoredTint(palette))
            XCTAssertNotEqual(tint, pickSucroseTint(palette))
        }
    }

    // MARK: - How to Play Guide

    func testTutorialGuideCardsAndControls() {
        XCTAssertEqual(
            TutorialGuide.pages.map(\.id),
            [.home, .brush, .dive, .cleaner, .buttons, .floss, .surge, .scan, .enemies, .helpers, .cities, .ready]
        )
        XCTAssertEqual(TutorialGuide.pageIndex(of: .surge), 6)

        for page in TutorialGuide.pages {
            XCTAssertLessThanOrEqual(page.title.count, 18, page.id.rawValue)
            XCTAssertLessThanOrEqual(page.body.count, 125, page.id.rawValue)
            for row in page.rows {
                XCTAssertLessThanOrEqual(row.name.count, 24, row.name)
                XCTAssertLessThanOrEqual(row.tip.count, 50, row.name)
            }
            for row in page.buttonRows {
                XCTAssertLessThanOrEqual(row.name.count, 24, row.name)
                XCTAssertLessThanOrEqual(row.tip.count, 50, row.name)
            }
            guard !page.isList else { continue }
            for scheme in TutorialInputScheme.allCases {
                let hints = TutorialGuide.controls(for: page, scheme: scheme)
                XCTAssertFalse(hints.isEmpty, "\(page.id.rawValue)/\(scheme.rawValue)")
                for hint in hints {
                    XCTAssertFalse(hint.label.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }

        let dive = TutorialGuide.pages[TutorialGuide.pageIndex(of: .dive)]
        XCTAssertEqual(TutorialGuide.controls(for: dive, scheme: .keys).flatMap(\.keys), ["W", "A", "S", "D", "Space"])
        XCTAssertEqual(TutorialGuide.controls(for: dive, scheme: .touch).map(\.label), ["Drag on the tooth"])

        XCTAssertEqual(TutorialGuide.pickInputScheme(coarsePointer: true, gamepadConnected: false), .touch)
        XCTAssertEqual(TutorialGuide.pickInputScheme(coarsePointer: false, gamepadConnected: false), .keys)
        XCTAssertEqual(TutorialGuide.pickInputScheme(coarsePointer: true, gamepadConnected: true), .pad)
    }

    func testTutorialGuidePicturesFieldGuidesAndControls() {
        // Real game pictures: the dive and each tool are flipbooks, the closing card is a drawing.
        let frames: [TutorialPageId: [String]] = [
            .home: ["home"],
            .brush: ["brush-1", "brush-2"],
            .dive: ["dive-1", "dive-2", "dive-3"],
            .cleaner: ["cleaner"],
            .floss: ["floss-1", "floss-2", "floss-3"],
            .surge: ["surge-1", "surge-2", "surge-3"],
            .scan: ["scan-1", "scan-2"],
            .cities: ["cities"],
            .ready: []
        ]
        for (id, names) in frames {
            XCTAssertEqual(TutorialGuide.pages[TutorialGuide.pageIndex(of: id)].frames, names, id.rawValue)
        }
        XCTAssertEqual(TutorialGuide.imageNames.count, 26)
        XCTAssertEqual(Set(TutorialGuide.imageNames).count, 26)

        let enemies = TutorialGuide.pages[TutorialGuide.pageIndex(of: .enemies)]
        XCTAssertEqual(enemies.rows.map(\.name), ["Plaque", "Sugar crystal", "Slime", "Acid puddle", "Slime dome"])
        XCTAssertTrue(enemies.isList)
        let helpers = TutorialGuide.pages[TutorialGuide.pageIndex(of: .helpers)]
        XCTAssertEqual(
            helpers.rows.map(\.name),
            ["Sleeping helper germs", "Awake helper germs", "Gold seal", "Saliva spring", "Supply beacon"]
        )

        let controls = TutorialGuide.pages[TutorialGuide.pageIndex(of: .buttons)]
        XCTAssertEqual(controls.buttonRows.map(\.action), [.move, .floss, .surge, .scan, .pause])
        XCTAssertEqual(TutorialGuide.buttonKeys(for: .move, scheme: .keys), ["W", "A", "S", "D", "Space"])
        XCTAssertEqual(TutorialGuide.buttonKeys(for: .pause, scheme: .pad), ["Start"])
        XCTAssertTrue(TutorialGuide.buttonKeys(for: .floss, scheme: .touch).isEmpty)
        XCTAssertTrue(TutorialGuide.buttonKeys(for: .floss, scheme: .mouse).isEmpty)
    }

    func testTutorialFlipbookTakesTurnsAndFades() {
        // One picture is always fully shown.
        XCTAssertEqual(TutorialGuide.flipbookOpacities(count: 1, elapsedSec: 12.3), [1])
        XCTAssertEqual(TutorialGuide.flipbookOpacities(count: 0, elapsedSec: 1), [])

        // Three pictures: each holds, then the next fades in over it.
        XCTAssertEqual(TutorialGuide.flipbookOpacities(count: 3, elapsedSec: 0.2), [1, 0, 0])
        XCTAssertEqual(TutorialGuide.flipbookOpacities(count: 3, elapsedSec: 1.7), [0, 1, 0])
        XCTAssertEqual(TutorialGuide.flipbookOpacities(count: 3, elapsedSec: 3.3), [0, 0, 1])
        let midFade = TutorialGuide.flipbookOpacities(count: 3, elapsedSec: 1.6 - 0.175)
        XCTAssertEqual(midFade[0], 1, accuracy: 1e-9)
        XCTAssertEqual(midFade[1], 0.5, accuracy: 1e-6)
        XCTAssertEqual(midFade[2], 0, accuracy: 1e-9)
        // The last picture fades back into the first, and the loop repeats.
        let wrap = TutorialGuide.flipbookOpacities(count: 3, elapsedSec: 4.8 - 0.07)
        XCTAssertEqual(wrap[2], 1, accuracy: 1e-9)
        XCTAssertGreaterThan(wrap[0], 0.5)
        XCTAssertEqual(
            TutorialGuide.flipbookOpacities(count: 2, elapsedSec: 0.4),
            TutorialGuide.flipbookOpacities(count: 2, elapsedSec: 0.4 + 3.2 * 5)
        )
        for step in 0...200 {
            let values = TutorialGuide.flipbookOpacities(count: 3, elapsedSec: Double(step) * 0.05)
            XCTAssertEqual(values.count, 3)
            XCTAssertEqual(values.max() ?? 0, 1, accuracy: 1e-9)
            XCTAssertTrue(values.allSatisfy { $0 >= 0 && $0 <= 1 })
        }

        // With motion off, show the picture of the action itself.
        XCTAssertEqual(TutorialGuide.stillFrameIndex(count: 3), 1)
        XCTAssertEqual(TutorialGuide.stillFrameIndex(count: 2), 1)
        XCTAssertEqual(TutorialGuide.stillFrameIndex(count: 1), 0)

        XCTAssertEqual(TutorialMotion.loopPhase(elapsedSec: 9, periodSec: 6), 0.5, accuracy: 1e-9)
        XCTAssertEqual(TutorialMotion.loopPhase(elapsedSec: -1.5, periodSec: 6), 0.75, accuracy: 1e-9)
        XCTAssertEqual(TutorialMotion.loopPhase(elapsedSec: 3, periodSec: 0), 0)
        XCTAssertEqual(TutorialMotion.twinkle(0.5), 1, accuracy: 1e-9)
        XCTAssertEqual(TutorialMotion.twinkle(1.0), 0, accuracy: 1e-9)
    }

    func testTutorialOfferShowsOnFirstThreeLaunchesThenStops() {
        // Three launches offer the guide; the fourth leaves it to the ? button.
        var saved = TutorialProgress()
        var seen: [Bool] = []
        for _ in 0..<5 {
            var gate = TutorialGate(progress: saved)
            gate.enterHome()
            seen.append(gate.isOfferVisible)
            // Coming back to Home in the same launch never counts twice.
            XCTAssertFalse(gate.enterHome())
            saved = gate.progress
        }
        XCTAssertEqual(seen, [true, true, true, false, false])
        XCTAssertEqual(saved, TutorialProgress(offers: TutorialGuide.maxOffers, opened: false))

        // Declining, or starting a game, puts the offer away for that launch.
        var declined = TutorialGate()
        declined.enterHome()
        XCTAssertTrue(declined.isOfferVisible)
        declined.dismissOffer()
        declined.enterHome()
        XCTAssertFalse(declined.isOfferVisible)

        // Opening the guide once (offer or ? button) ends the offers for good.
        var first = TutorialGate()
        first.enterHome()
        XCTAssertTrue(first.markOpened())
        XCTAssertFalse(first.markOpened())
        XCTAssertFalse(first.isOfferVisible)
        var second = TutorialGate(progress: first.progress)
        XCTAssertFalse(second.enterHome())
        XCTAssertFalse(second.isOfferVisible)

        // Saved numbers out of range are pulled back in.
        XCTAssertEqual(TutorialProgress(offers: 99).offers, TutorialGuide.maxOffers)
        XCTAssertEqual(TutorialProgress(offers: -4).offers, 0)
    }

    func testCitySkylineReaderBuildsTheSameShapesAsTheWeb() {
        // CitySkylineArt is generated from the web's drawings and carries what the web parser made
        // of each one. The same triangles here means both editions show the same skyline.
        XCTAssertEqual(CitySkylineArt.hostIds, ["accra", "new_orleans", "orbit_aurora", "tokyo", "toronto"])
        for host in CitySkylineArt.hostIds {
            guard let art = CitySkyline.art(forHost: host),
                  let wantSkyline = CitySkylineArt.expectedSkyline(forHost: host),
                  let wantProp = CitySkylineArt.expectedProp(forHost: host)
            else {
                XCTFail("\(host): no drawing")
                continue
            }
            let checks: [([SkylinePiece], CitySkylineArt.Expected, String)] = [
                (art.skyline, wantSkyline, "skyline"),
                (art.prop, wantProp, "prop"),
            ]
            for (pieces, want, label) in checks {
                XCTAssertEqual(pieces.count, want.pieces, "\(host) \(label) pieces")
                XCTAssertEqual(pieces.filter { $0.isLight }.count, want.lightPieces, "\(host) \(label) lights")
                XCTAssertEqual(pieces.reduce(0) { $0 + $1.triangles.count / 6 }, want.triangles, "\(host) \(label) triangles")
                XCTAssertEqual(CitySkyline.checksum(pieces), want.checksum, accuracy: 0.01, "\(host) \(label) checksum")
            }
        }
        XCTAssertNil(CitySkyline.art(forHost: "atlantis"))

        // Every stage has a skyline, and every district has lights to switch on.
        for cart in WorldRegistry.allWorlds {
            guard let art = CitySkyline.art(forHost: cart.hostId) else {
                XCTFail("\(cart.id): no skyline for host \(cart.hostId)")
                continue
            }
            let offsetX = (cart.worldWidth - CitySkyline.artWidth) / 2
            var counts = Array(repeating: 0, count: cart.districts.count)
            for piece in art.skyline where piece.isLight {
                counts[CitySkyline.districtIndex(districts: cart.districts, worldX: piece.centerX + offsetX)] += 1
            }
            for (i, n) in counts.enumerated() {
                XCTAssertGreaterThanOrEqual(n, 4, "\(cart.id) district \(i) has lights")
            }
            XCTAssertTrue(art.prop.contains { $0.isLight }, "\(cart.id) prop has a light")
        }
    }

    func testCitySkylineShapesPlacementAndLights() {
        let art = CitySkyline.parse("""
        ; a note
        @skyline
        R 1 2 3 4 #112233
        P 0 0 4 0 4 2 0 2 #445566
        C 5 5 1 #000001
        H 5 5 1 #000002
        A 0 0 2 0.5 0 90 #000003
        L 0 0 3 4 0.2 #000004
        S 0 0 1 #000005
        N 0 0 1 0.4 20 #000006
        w 0 0 3 2 0.5 0.4 0.1 0.2 #ffee00
        Z 9 9 9 9 #000000
        R 1 2 3 #000000
        @prop
        c 0 1 0.2 #abcdef
        """)
        XCTAssertEqual(art.skyline.prefix(8).map { $0.triangles.count / 6 }, [2, 2, 20, 12, 16, 2, 10, 28])
        XCTAssertEqual(art.skyline[0].triangles, [1, 2, 4, 2, 4, 6, 1, 2, 4, 6, 1, 6])
        XCTAssertEqual(art.skyline[0].colorHex, 0x112233)
        XCTAssertEqual(art.skyline[0].centerX, 2.5)
        XCTAssertFalse(art.skyline[0].isLight)

        // A window grid is one piece per window, all lights sharing one paint order. The two bad
        // lines after it are skipped.
        let windows = Array(art.skyline.dropFirst(8))
        XCTAssertEqual(windows.count, 6)
        XCTAssertTrue(windows.allSatisfy { $0.isLight && $0.order == 8 && $0.colorHex == 0xFFEE00 })
        XCTAssertEqual(art.prop.count, 1)
        XCTAssertEqual(art.prop[0].order, 0)
        XCTAssertTrue(art.prop[0].isLight)

        // Stands behind the far gum line, leaning back; later pieces sit in front.
        let foot = CitySkyline.point(x: 10, y: 0, order: 0, worldWidth: 64)
        XCTAssertEqual(foot, SIMD3<Double>(10, CitySkyline.baseY, CitySkyline.baseZ))
        let top = CitySkyline.point(x: 10, y: 4, order: 0, worldWidth: 64)
        XCTAssertGreaterThan(top.y, foot.y + 3)
        XCTAssertLessThan(top.z, foot.z - 1.5)
        XCTAssertGreaterThan(CitySkyline.point(x: 10, y: 0, order: 50, worldWidth: 64).z, foot.z)
        XCTAssertEqual(CitySkyline.point(x: 32, y: 0, order: 0, worldWidth: 32).x, 16)

        let anchors = CitySkyline.propAnchors(worldWidth: 64, worldDepth: 32)
        XCTAssertEqual(anchors.count, 8)
        XCTAssertEqual(anchors[0], Vec2(x: 0.6, z: 32 * 0.3))
        XCTAssertEqual(anchors[1].x, 63.4, accuracy: 1e-9)

        // Lights follow the district in front of them and stay dim until it is sealed.
        let districts = world1AnteriorIncisors.districts
        XCTAssertEqual(CitySkyline.districtIndex(districts: districts, worldX: -5), 0)
        XCTAssertEqual(CitySkyline.districtIndex(districts: districts, worldX: 30), 1)
        XCTAssertEqual(CitySkyline.districtIndex(districts: districts, worldX: 70), 2)
        XCTAssertEqual(CitySkyline.lightLevel(cleanRatio: 0, sealed: false), 0.14, accuracy: 1e-9)
        XCTAssertGreaterThan(
            CitySkyline.lightLevel(cleanRatio: 0.5, sealed: false),
            CitySkyline.lightLevel(cleanRatio: 0.2, sealed: false)
        )
        XCTAssertLessThan(CitySkyline.lightLevel(cleanRatio: 1, sealed: false), 0.7)
        XCTAssertEqual(CitySkyline.lightLevel(cleanRatio: 0.1, sealed: true), 1)
    }
}
