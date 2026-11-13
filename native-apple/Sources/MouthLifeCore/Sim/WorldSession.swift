import Foundation

public enum PointerSteerPref: String, Codable, CaseIterable, Sendable {
    case auto
    case on
    case off
}

/// Pure policy helper: in `.auto` mode, touch/pencil pointers steer HYDRA-1 directly across the
/// tooth arch while mouse left-click scrubs in place without yanking.
public func resolvePointerSteer(pref: PointerSteerPref, isTouchOrPen: Bool) -> Bool {
    switch pref {
    case .on: return true
    case .off: return false
    case .auto: return isTouchOrPen
    }
}

/// Converts a ground-plane tooth target into a `-1...1` move vector with dead-zone scrub-in-place and arrival easing.
public func computePointerSteer(
    probePos: Vec2,
    target: Vec2,
    deadZone: Double = 0.55,
    fullSpeedDist: Double = 2.4
) -> (moveX: Double, moveZ: Double) {
    let dx = target.x - probePos.x
    let dz = target.z - probePos.z
    let dist = hypot(dx, dz)
    if dist <= deadZone {
        return (0, 0)
    }
    let mag = min(1.0, (dist - deadZone) / max(0.01, fullSpeedDist - deadZone) + 0.25)
    return ((dx / dist) * mag, (dz / dist) * mag)
}

/// Frame-rate independent exponential steering filter matching a 40% blend at 60 Hz.
public func smoothSteerVector(
    prevMoveX: Double,
    prevMoveZ: Double,
    nextMoveX: Double,
    nextMoveZ: Double,
    dt: Double
) -> (moveX: Double, moveZ: Double) {
    let k = -expm1(log(0.6) * 60.0 * max(0.0, dt))
    return (
        prevMoveX + (nextMoveX - prevMoveX) * k,
        prevMoveZ + (nextMoveZ - prevMoveZ) * k
    )
}

/// True when two taps land close together in time and screen space (double-tap floss trigger).
public func isDoubleTap(
    prevTimeSec: Double?,
    prevX: Double,
    prevY: Double,
    nowTimeSec: Double,
    nowX: Double,
    nowY: Double,
    maxDeltaSec: Double = 0.32,
    maxDistPt: Double = 44.0
) -> Bool {
    guard let prevTimeSec else { return false }
    let dt = nowTimeSec - prevTimeSec
    return dt > 0 && dt <= maxDeltaSec && hypot(nowX - prevX, nowY - prevY) <= maxDistPt
}

public struct SessionInputCommand: Equatable, Sendable {
    public var moveX: Double
    public var moveZ: Double
    public var directTargetWorldPos: Vec2?
    public var scrubHeld: Bool
    public var aimWorldPos: Vec2?
    public var fireFlossRequested: Bool
    public var fireRinseRequested: Bool
    public var fireDiscloseRequested: Bool

    public init(
        moveX: Double = 0,
        moveZ: Double = 0,
        directTargetWorldPos: Vec2? = nil,
        scrubHeld: Bool = false,
        aimWorldPos: Vec2? = nil,
        fireFlossRequested: Bool = false,
        fireRinseRequested: Bool = false,
        fireDiscloseRequested: Bool = false
    ) {
        self.moveX = moveX
        self.moveZ = moveZ
        self.directTargetWorldPos = directTargetWorldPos
        self.scrubHeld = scrubHeld
        self.aimWorldPos = aimWorldPos
        self.fireFlossRequested = fireFlossRequested
        self.fireRinseRequested = fireRinseRequested
        self.fireDiscloseRequested = fireDiscloseRequested
    }

    public static let idle = SessionInputCommand()
}

public struct FlossBeamSegment: Equatable, Sendable {
    public var a: Vec2
    public var b: Vec2

    public init(a: Vec2, b: Vec2) {
        self.a = a
        self.b = b
    }
}

public struct SessionSnapshot: Equatable, Sendable {
    public var activeMode: ActivePlayMode
    public var isRunning: Bool
    public var isCompleted: Bool
    public var missionWon: Bool?
    public var elapsedSec: Double
    public var remainingRescueSec: Double
    public var probePos: Vec2
    public var probeY: Double
    public var probeFacingRad: Double
    public var probeSpeed: Double
    public var probeZip: ProbeZipState?
    public var effectiveBrushRadius: Double
    public var effectiveBrushArcRad: Double
    public var scrubActive: Bool
    public var surgeMeter: Double
    public var flossCooldown: Double
    public var discloseCooldown: Double
    public var discloseActiveRemaining: Double
    public var discloseOrigin: Vec2
    public var rinseWaveRemaining: Double
    public var rinseWaveOrigin: Vec2
    public var flossBeamRemaining: Double
    public var flossBeamSegment: FlossBeamSegment?
    public var worldCleanRatio: Double
    public var districtCleanRatios: [Double]
    public var sealedDistricts: [Bool]
    public var synergyMultiplier: Double
    public var liveScorePreview: ScoreBreakdown
    public var sites: [CommensalSiteEntity]
    public var sucroseCrystals: [SucroseCrystalEntity]
    public var bridges: [BridgeDef]
    public var beacons: [RelayBeaconEntity]
    public var mutans: [MutansEntity]
    public var acidPools: [AcidPoolEntity]
    public var fluorapatiteInfusionSec: Double
    public var fluorapatiteRatio: Double
    public var stephanTimerSec: Double
    public var stephanSipCountdownSec: Double
    public var maxGumIrritation: Float
    public var epsArmorRemainingRatio: Double
    public var nearestZipMouth: ZipMouthHint?
}

public final class WorldSession {
    public private(set) var cartridge: WorldCartridge
    public private(set) var grid: OralSurfaceGrid
    public private(set) var chemistry: OralChemistrySim
    public let scoring = ScoringEngine()
    public let events: EventBus

    public private(set) var activeMode: ActivePlayMode
    private var running: Bool = false
    public private(set) var isCompleted: Bool = false
    public private(set) var missionWon: Bool? = nil
    public private(set) var lastBreakdown: ScoreBreakdown? = nil
    public private(set) var elapsedSec: Double = 0
    public private(set) var lastScrubHeld: Bool = false

    // Probe state
    public var probePos: Vec2 = Vec2(x: 8, z: 16)
    public var probeY: Double = 1.0
    public var probeFacingRad: Double = 0
    public var probeSpeed: Double = 0
    public var probeZip: ProbeZipState? = nil
    private var knockbackVel: Vec2 = .zero
    private var knockbackTimer: Double = 0

    // Actuators & meters
    public var surgeMeter: Double = 0
    public var flossCooldown: Double = 0
    public var discloseCooldown: Double = 0
    public var discloseActiveRemaining: Double = 0
    public var discloseOrigin: Vec2 = .zero
    public var rinseWaveRemaining: Double = 0
    public var rinseWaveOrigin: Vec2 = .zero
    public var flossBeamRemaining: Double = 0
    public var flossBeamSegment: FlossBeamSegment? = nil

    // Upgrades & session buffs
    public private(set) var hasBassUpgrade: Bool = false
    public private(set) var hasHydroSonicUpgrade: Bool = false
    public private(set) var hasPtfeFlossUpgrade: Bool = false
    public private(set) var hasBicarbRinseUpgrade: Bool = false
    public private(set) var overdriveActive: Bool = false

    // World entities
    public private(set) var allCollisionWalls: [AABB2D] = []
    public var sealedDistricts: [Bool] = []
    public var sites: [CommensalSiteEntity] = []
    public var sucroseCrystals: [SucroseCrystalEntity] = []
    public var bridges: [BridgeDef] = []
    public var beacons: [RelayBeaconEntity] = []
    public var mutans: [MutansEntity] = []
    public var acidPools: [AcidPoolEntity] = []
    public var springCooldowns: [Double] = []

    // World 3 — 1940 Stephan Curve acid clock
    private var stephanSipTimer: Double = 0
    public private(set) var stephanSipCount: Int = 0
    // World 2 — gum tender warning throttle
    private var gumWarnCooldown: Double = 0
    // World 4 — Hibiscus erosion wash & Miswak/Fluorapatite lattice infusion
    private var erosionPulseTimer: Double = 0
    public private(set) var erosionWashCount: Int = 0
    public var fluorapatiteInfusionSec: Double = 0
    // World 5 — Quorum-sensing EPS armor deflection throttle
    private var epsWarnCooldown: Double = 0

    private var nextEntityId: Int = 1
    private var unsubscribeBus: (() -> Void)?

    public init(
        cartridge: WorldCartridge,
        mode: ActivePlayMode = .arcade,
        equippedUpgrades: EquippedUpgrades = EquippedUpgrades(),
        supplyBeaconsCount: Int = 0,
        overdriveActive: Bool = false,
        events: EventBus = EventBus()
    ) {
        self.cartridge = cartridge
        self.activeMode = mode
        self.events = events
        self.grid = OralSurfaceGrid(worldWidth: cartridge.worldWidth, worldDepth: cartridge.worldDepth)
        self.chemistry = OralChemistrySim(cartridge: cartridge)

        self.unsubscribeBus = events.subscribe { [weak self] event in
            if case .modeChanged(_, let to) = event {
                if to != .arcade && to != .pulpRescue {
                    self?.running = false
                }
            }
        }

        configureSession(
            cartridge: cartridge,
            mode: mode,
            equippedUpgrades: equippedUpgrades,
            supplyBeaconsCount: supplyBeaconsCount,
            overdriveActive: overdriveActive
        )
    }

    public convenience init(
        cartridge: WorldCartridge,
        save: MouthLifeSaveV2,
        mode: ActivePlayMode = .arcade,
        events: EventBus = EventBus()
    ) {
        self.init(
            cartridge: cartridge,
            mode: mode,
            equippedUpgrades: save.equippedUpgrades,
            supplyBeaconsCount: mode == .arcade ? save.pendingSupplyBeacons : 0,
            overdriveActive: mode == .arcade && save.remineralizedOverdriveRuns > 0,
            events: events
        )
    }

    deinit {
        unsubscribeBus?()
    }

    public func loadCartridge(
        _ cartridge: WorldCartridge,
        save: MouthLifeSaveV2,
        mode: ActivePlayMode = .arcade
    ) {
        configureSession(
            cartridge: cartridge,
            mode: mode,
            equippedUpgrades: save.equippedUpgrades,
            supplyBeaconsCount: mode == .arcade ? save.pendingSupplyBeacons : 0,
            overdriveActive: mode == .arcade && save.remineralizedOverdriveRuns > 0
        )
    }

    public func configureSession(
        cartridge: WorldCartridge,
        mode: ActivePlayMode,
        equippedUpgrades: EquippedUpgrades,
        supplyBeaconsCount: Int,
        overdriveActive: Bool
    ) {
        self.cartridge = cartridge
        self.activeMode = mode
        self.grid.bake(from: cartridge)
        self.chemistry.reset(from: cartridge)
        self.scoring.reset()

        self.allCollisionWalls = cartridge.wallBoxes + buildAlleyWalls(cartridge)
        self.sealedDistricts = Array(repeating: false, count: cartridge.districts.count)

        self.probePos = cartridge.probeSpawn
        self.probeY = sampleTerrainHeight(x: probePos.x, z: probePos.z, cartridge: cartridge)
        self.probeFacingRad = 0
        self.probeSpeed = 0
        self.probeZip = nil
        self.knockbackTimer = 0
        self.knockbackVel = .zero
        self.lastScrubHeld = false

        self.hasBassUpgrade = equippedUpgrades.brush == "angled_bass_array"
        self.hasHydroSonicUpgrade = equippedUpgrades.brush == "hydro_sonic_pulse"
        self.hasPtfeFlossUpgrade = equippedUpgrades.floss == "ptfe_ribbon_filament"
        self.hasBicarbRinseUpgrade = equippedUpgrades.rinse == "bicarb_buffer_jet"
        self.overdriveActive = mode == .arcade && overdriveActive

        self.surgeMeter = self.overdriveActive ? GameConfig.surgeMax : 0
        self.flossCooldown = 0
        self.discloseCooldown = 0
        self.discloseActiveRemaining = 0
        self.discloseOrigin = .zero
        self.rinseWaveRemaining = 0
        self.rinseWaveOrigin = .zero
        self.flossBeamRemaining = 0
        self.flossBeamSegment = nil

        self.sites = cartridge.commensalSiteSpawns.map { s in
            CommensalSiteEntity(
                id: s.id,
                pos: s.pos,
                districtIdx: s.districtIdx,
                restored: false,
                localCleanRatio: grid.getAreaCleanRatio(
                    cx: s.pos.x,
                    cz: s.pos.z,
                    radius: GameConfig.siteRestoreRadius
                )
            )
        }

        self.sucroseCrystals = cartridge.sucroseSpawns.map { c in
            SucroseCrystalEntity(
                id: c.id,
                pos: c.pos,
                districtIdx: c.districtIdx,
                hp: 4.0,
                intact: true,
                spawnTimer: 2.2
            )
        }

        self.bridges = cartridge.biofilmBridges.map { b in
            BridgeDef(id: b.id, a: b.a, b: b.b, intact: b.intact)
        }

        let clampedBeacons = mode == .arcade
            ? max(0, min(supplyBeaconsCount, cartridge.beaconDropSlots.count))
            : 0
        self.beacons = cartridge.beaconDropSlots.prefix(clampedBeacons).enumerated().map { idx, pos in
            RelayBeaconEntity(index: idx, pos: pos, collected: false)
        }

        self.mutans = []
        self.acidPools = []
        self.springCooldowns = Array(repeating: 0, count: cartridge.salivaSprings.count)
        self.nextEntityId = 1

        if mode == .pulpRescue {
            // Seed central acidic hazard in Pulp Rescue so players experience Salivary Spring buffering!
            chemistry.applyAcidZone(cx: 16.0, cz: 16.0, radius: 4.5, targetPh: 5.1)
        }

        self.stephanSipTimer = (cartridge.stephanSipIntervalSec ?? 0) > 0 ? 6.0 : 0
        self.stephanSipCount = 0
        self.gumWarnCooldown = 0
        self.erosionWashCount = 0
        self.fluorapatiteInfusionSec = 0
        self.epsWarnCooldown = 0

        if let zones = cartridge.erosionZones, !zones.isEmpty {
            _ = applyActiveErosionZones()
            self.erosionPulseTimer = cartridge.erosionPulseIntervalSec ?? GameConfig.hibiscusDefaultPulseSec
        } else {
            self.erosionPulseTimer = 0
        }

        self.elapsedSec = 0
        self.isCompleted = false
        self.missionWon = nil
        self.lastBreakdown = nil
        self.running = true
    }

    /// True when the loaded cartridge runs the 1940 Stephan Curve acid clock.
    public var hasStephanClock: Bool {
        (cartridge.stephanSipIntervalSec ?? 0) > 0
    }

    public func hasStephanClockFn() -> Bool { hasStephanClock }

    /// True when the loaded cartridge has tart organic-acid erosion basins + Fluorapatite conversion (World 4).
    public var hasErosionChallenge: Bool {
        !(cartridge.erosionZones ?? []).isEmpty
    }

    /// True when the loaded cartridge has zero-G quorum-sensing EPS biofilm domes (World 5).
    public var hasEpsDomes: Bool {
        !(cartridge.epsDomes ?? []).isEmpty
    }

    /// True when the loaded cartridge has tender gingival sulcus margins (World 2).
    public var hasSulcusCare: Bool {
        !(cartridge.sulcusBands ?? []).isEmpty
    }

    /// Seconds until the next sweet sip (`0` when the sugar supply has been cut off).
    public var stephanSipCountdown: Double {
        guard hasStephanClock else { return 0 }
        guard sucroseCrystals.contains(where: { $0.intact }) else { return 0 }
        return max(0, stephanSipTimer)
    }

    /// Effective sulcus irritation rate given equipped brush upgrades (`0` outside World 2).
    public var sulcusIrritationRate: Double {
        guard hasSulcusCare else { return 0 }
        var rate = GameConfig.sulcusStationaryIrritationPerSec
        if hasBassUpgrade { rate *= GameConfig.sulcusBassIrritationMult }
        if hasHydroSonicUpgrade { rate *= GameConfig.sulcusHydrosonicIrritationMult }
        return rate
    }

    public var effectiveBrushRadius: Double {
        GameConfig.brushBaseRadius *
            (hasHydroSonicUpgrade ? GameConfig.brushHydrosonicRadiusMult : 1.0) *
            (overdriveActive ? GameConfig.brushOverdriveRadiusMult : 1.0)
    }

    public var effectiveBrushArcRad: Double {
        if hasBassUpgrade { return GameConfig.brushBassArcRad }
        if hasHydroSonicUpgrade { return GameConfig.brushHydrosonicArcRad }
        return GameConfig.brushBaseArcRad
    }

    public var nearestZipMouthHint: ZipMouthHint? {
        findNearestZipMouth(
            probePos: probePos,
            alleys: cartridge.interdentalAlleys,
            solidWalls: cartridge.wallBoxes
        )
    }

    public func setRunning(_ running: Bool) {
        self.running = running
    }

    public var isRunning: Bool {
        running && !isCompleted
    }

    public var remainingRescueSec: Double {
        max(0, GameConfig.pulpRescueDurationSec - elapsedSec)
    }

    @discardableResult
    public func addSurge(_ delta: Double) -> Double {
        guard delta > 0 else { return 0 }
        let prev = surgeMeter
        surgeMeter = min(GameConfig.surgeMax, surgeMeter + delta)
        if prev < GameConfig.surgeMax && surgeMeter >= GameConfig.surgeMax {
            events.emit(.surgeReady)
        }
        return surgeMeter - prev
    }

    public func step(dt: Double, input: SessionInputCommand = .idle) {
        guard running && !isCompleted, dt > 0 else { return }

        elapsedSec += dt
        flossCooldown = max(0, flossCooldown - dt)
        discloseCooldown = max(0, discloseCooldown - dt)
        discloseActiveRemaining = max(0, discloseActiveRemaining - dt)
        rinseWaveRemaining = max(0, rinseWaveRemaining - dt)
        flossBeamRemaining = max(0, flossBeamRemaining - dt)
        if flossBeamRemaining <= 0 {
            flossBeamSegment = nil
        }

        for i in springCooldowns.indices {
            springCooldowns[i] = max(0, springCooldowns[i] - dt)
        }

        chemistry.step(dt: dt)
        scoring.step(dt: dt)
        gumWarnCooldown = max(0, gumWarnCooldown - dt)
        fluorapatiteInfusionSec = max(0, fluorapatiteInfusionSec - dt)
        epsWarnCooldown = max(0, epsWarnCooldown - dt)
        stepStephanClock(dt: dt)
        stepErosionWash(dt: dt)

        // 1. Probe Movement or Capillary Tether-Zip
        if var zip = probeZip {
            let zipStep = stepCapillaryZip(&zip, dt: dt)
            probePos = zipStep.pos
            probeSpeed = GameConfig.probeMoveSpeed * 1.8
            probeZip = zipStep.done ? nil : zip
        } else {
            let prevX = probePos.x
            let prevZ = probePos.z

            let inAcidPool = acidPools.contains { p in
                hypot(probePos.x - p.pos.x, probePos.z - p.pos.z) <= p.radius
            }
            let speedMult = inAcidPool ? GameConfig.acidPoolSlowMult : 1.0

            var mx = input.moveX
            var mz = input.moveZ
            if hypot(mx, mz) <= 1e-4, let directTarget = input.directTargetWorldPos {
                let steered = computePointerSteer(probePos: probePos, target: directTarget)
                mx = steered.moveX
                mz = steered.moveZ
            }

            let mLen = hypot(mx, mz)
            if mLen > 1.0 {
                mx /= mLen
                mz /= mLen
            }

            var vx = mx * GameConfig.probeMoveSpeed * speedMult
            var vz = mz * GameConfig.probeMoveSpeed * speedMult

            if knockbackTimer > 0 {
                let kRatio = knockbackTimer / GameConfig.probeKnockbackSec
                vx += knockbackVel.x * kRatio
                vz += knockbackVel.z * kRatio
                knockbackTimer = max(0, knockbackTimer - dt)
            }

            probePos = moveCircleWithSlide(
                pos: probePos,
                delta: Vec2(x: vx * dt, z: vz * dt),
                radius: GameConfig.probeRadius,
                worldWidth: cartridge.worldWidth,
                worldDepth: cartridge.worldDepth,
                walls: allCollisionWalls
            )

            let movedDist = hypot(probePos.x - prevX, probePos.z - prevZ)
            probeSpeed = movedDist / dt

            let effectiveAim = input.aimWorldPos ?? input.directTargetWorldPos
            if mLen > 0.08 {
                probeFacingRad = atan2(mz, mx)
            } else if let aim = effectiveAim {
                let adx = aim.x - probePos.x
                let adz = aim.z - probePos.z
                if hypot(adx, adz) > 0.25 {
                    probeFacingRad = atan2(adz, adx)
                }
            }
        }

        probeY = sampleTerrainHeight(x: probePos.x, z: probePos.z, cartridge: cartridge)

        // 2. Salivary Bicarbonate Springs & Relay Beacons proximity
        for si in cartridge.salivaSprings.indices {
            if springCooldowns[si] > 0 { continue }
            let sp = cartridge.salivaSprings[si]
            if hypot(probePos.x - sp.x, probePos.z - sp.z) <= 1.6 {
                springCooldowns[si] = 3.0
                events.emit(.springTriggered(pos: sp))
                chemistry.triggerSalivaSpring(
                    cx: sp.x,
                    cz: sp.z,
                    radius: GameConfig.salivaSpringRadius,
                    targetPh: GameConfig.salivaSpringPhBoost,
                    sootheGumAmount: hasSulcusCare ? GameConfig.salivaSpringGumSoothe : 0
                )
                if chemistry.stephanTimerSec > 0 {
                    let remainingSec = chemistry.bufferStephanWithSpring()
                    events.emit(.stephanBuffered(pos: sp, remainingSec: remainingSec))
                }
                if hasErosionChallenge {
                    let cellsConverted = grid.convertCircleToFluorapatite(
                        cx: sp.x,
                        cz: sp.z,
                        radius: GameConfig.miswakSpringConvertRadius
                    )
                    fluorapatiteInfusionSec = GameConfig.miswakInfusionDurationSec
                    events.emit(
                        .fluorapatiteInfused(
                            pos: sp,
                            cellsConverted: cellsConverted,
                            durationSec: GameConfig.miswakInfusionDurationSec
                        )
                    )
                }
            }
        }

        for bi in beacons.indices {
            if beacons[bi].collected { continue }
            let bPos = beacons[bi].pos
            if hypot(probePos.x - bPos.x, probePos.z - bPos.z) <= 1.5 {
                beacons[bi].collected = true
                let surgeDelta = addSurge(GameConfig.surgePerBeacon)
                events.emit(
                    .beaconCollected(
                        beaconIndex: beacons[bi].index,
                        pos: bPos,
                        surgeDelta: surgeDelta
                    )
                )
            }
        }

        // 3. Sonic Bristle Actuator
        lastScrubHeld = input.scrubHeld && probeZip == nil
        if input.scrubHeld && probeZip == nil {
            let isMoving = probeSpeed >= GameConfig.probeSweepSpeedThreshold
            let removalPerSec = isMoving ? GameConfig.brushMovingRate : GameConfig.brushStationaryRate
            let radius = effectiveBrushRadius
            let arcRad = effectiveBrushArcRad

            let res = grid.applyBrush(
                BrushApplyParams(
                    cx: probePos.x,
                    cz: probePos.z,
                    facingRad: probeFacingRad,
                    arcRad: arcRad,
                    radius: radius,
                    removalPerSec: removalPerSec,
                    dt: dt,
                    hasBassUpgrade: hasBassUpgrade,
                    hasHydroSonicUpgrade: hasHydroSonicUpgrade,
                    sulcusIrritationPerSec: sulcusIrritationRate,
                    isMovingSweep: isMoving,
                    convertToFluorapatite: fluorapatiteInfusionSec > 0
                ),
                chemistry: chemistry
            )

            // Brush also chips adjacent Mutans & Sucrose Crystals
            applyBrushEntityHits(radius: radius, dt: dt)

            let surgeDelta = addSurge(
                Double(res.newlyCleanedCells) * GameConfig.surgePerCleanedCell +
                res.densityRemovedTotal * 0.04
            )
            if res.newlyCleanedCells > 0 {
                scoring.recordSweepingCellsCleaned(res.newlyCleanedCells, isMovingSweep: isMoving)
            }
            if res.acidAbrasionWarnings > 0 {
                scoring.recordAcidAbrasionWarning(1)
            }
            if res.gumTenderWarnings > 0 && gumWarnCooldown <= 0 {
                gumWarnCooldown = 0.6
                scoring.recordGumTenderWarning(1)
                events.emit(.gumTender(pos: probePos, warnings: res.gumTenderWarnings))
            }
            if res.epsDeflectWarnings > 0 && epsWarnCooldown <= 0 {
                epsWarnCooldown = 0.7
                events.emit(.epsDeflected(pos: probePos, warnings: res.epsDeflectWarnings))
            }

            if res.newlyCleanedCells > 0 || res.acidAbrasionWarnings > 0 || res.fluorapatiteConverted > 0 {
                events.emit(
                    .actuatorScrub(
                        cleanRatio: grid.worldCleanRatio,
                        newlyCleaned: res.newlyCleanedCells,
                        surgeDelta: surgeDelta,
                        acidWarn: res.acidAbrasionWarnings > 0
                    )
                )
            }
        }

        // 4. Polymer Floss Filament & Capillary Tether-Zip
        if input.fireFlossRequested && flossCooldown <= 0 {
            fireFlossActuator(aimWorldPos: input.aimWorldPos)
        }

        // 5. Fluoride-Bicarb Ion Rinse
        if input.fireRinseRequested && surgeMeter >= GameConfig.surgeMax {
            fireIonRinseActuator()
        }

        // 6. Erythrosine Disclosing Bio-Scan
        if input.fireDiscloseRequested && discloseCooldown <= 0 {
            discloseCooldown = GameConfig.discloseCooldownSec
            discloseActiveRemaining = GameConfig.discloseDurationSec
            discloseOrigin = probePos
            events.emit(
                .disclosePulsed(
                    origin: discloseOrigin,
                    durationSec: GameConfig.discloseDurationSec
                )
            )
        }

        // 7. Ecology: Sucrose Spawners, Mutans Cocci, Acid Pools
        stepEcology(dt: dt)

        // 8. Commensal Sites & Soft-Lock-Proof District Remineralization
        evaluateSitesAndDistricts()

        // 9. Mode Completion Checks
        evaluateMissionCompletion()
    }

    public func makeSnapshot() -> SessionSnapshot {
        let districtRatios = cartridge.districts.indices.map { grid.districtCleanRatio($0) }
        let preview = scoring.evaluateBreakdown(
            worldCleanRatio: grid.worldCleanRatio,
            sitesTotal: sites.count,
            elapsedSec: elapsedSec,
            parTimeSec: cartridge.parTimeSec
        )
        return SessionSnapshot(
            activeMode: activeMode,
            isRunning: isRunning,
            isCompleted: isCompleted,
            missionWon: missionWon,
            elapsedSec: elapsedSec,
            remainingRescueSec: remainingRescueSec,
            probePos: probePos,
            probeY: probeY,
            probeFacingRad: probeFacingRad,
            probeSpeed: probeSpeed,
            probeZip: probeZip,
            effectiveBrushRadius: effectiveBrushRadius,
            effectiveBrushArcRad: effectiveBrushArcRad,
            scrubActive: lastScrubHeld,
            surgeMeter: surgeMeter,
            flossCooldown: flossCooldown,
            discloseCooldown: discloseCooldown,
            discloseActiveRemaining: discloseActiveRemaining,
            discloseOrigin: discloseOrigin,
            rinseWaveRemaining: rinseWaveRemaining,
            rinseWaveOrigin: rinseWaveOrigin,
            flossBeamRemaining: flossBeamRemaining,
            flossBeamSegment: flossBeamSegment,
            worldCleanRatio: grid.worldCleanRatio,
            districtCleanRatios: districtRatios,
            sealedDistricts: sealedDistricts,
            synergyMultiplier: scoring.synergyMultiplier,
            liveScorePreview: preview,
            sites: sites,
            sucroseCrystals: sucroseCrystals,
            bridges: bridges,
            beacons: beacons,
            mutans: mutans,
            acidPools: acidPools,
            fluorapatiteInfusionSec: fluorapatiteInfusionSec,
            fluorapatiteRatio: grid.fluorapatiteRatio,
            stephanTimerSec: chemistry.stephanTimerSec,
            stephanSipCountdownSec: stephanSipCountdown,
            maxGumIrritation: chemistry.maxGumIrritation,
            epsArmorRemainingRatio: grid.epsArmorRemainingRatio,
            nearestZipMouth: nearestZipMouthHint
        )
    }

    private func applyBrushEntityHits(radius: Double, dt: Double) {
        // Knock back & pop S. mutans within brush sweep radius
        var i = mutans.count - 1
        while i >= 0 {
            let dx = mutans[i].pos.x - probePos.x
            let dz = mutans[i].pos.z - probePos.z
            let dist = hypot(dx, dz)
            if dist <= radius + 0.45 {
                mutans[i].hp -= 3.2 * dt
                if dist > 0.05 {
                    mutans[i].pos.x += (dx / dist) * 5.0 * dt
                    mutans[i].pos.z += (dz / dist) * 5.0 * dt
                }
                if mutans[i].hp <= 0 {
                    let poppedPos = mutans[i].pos
                    mutans.remove(at: i)
                    events.emit(.mutansPopped(pos: poppedPos, via: "brush"))
                }
            }
            i -= 1
        }

        // Gradual brush chipping on Sucrose Crystals (4 sweeps vs instant 1 Floss slice)
        for ci in sucroseCrystals.indices {
            if !sucroseCrystals[ci].intact { continue }
            let cPos = sucroseCrystals[ci].pos
            if hypot(cPos.x - probePos.x, cPos.z - probePos.z) <= radius + 0.5 {
                sucroseCrystals[ci].hp -= 1.4 * dt
                if sucroseCrystals[ci].hp <= 0 {
                    sucroseCrystals[ci].intact = false
                    scoring.recordSucroseCleared(1)
                    events.emit(
                        .sucroseShattered(
                            crystalId: sucroseCrystals[ci].id,
                            pos: cPos,
                            via: .brush
                        )
                    )
                }
            }
        }
    }

    private func fireFlossActuator(aimWorldPos: Vec2?) {
        flossCooldown = GameConfig.flossCooldownSec

        let travelDir = Vec2(x: cos(probeFacingRad), z: sin(probeFacingRad))
        var aimDir: Vec2
        if let aimWorldPos {
            let dx = aimWorldPos.x - probePos.x
            let dz = aimWorldPos.z - probePos.z
            let len = hypot(dx, dz)
            aimDir = len > 0.15
                ? Vec2(x: dx / len, z: dz / len)
                : travelDir
        } else {
            aimDir = findSmartFlossDirection()
        }

        probeFacingRad = atan2(aimDir.z, aimDir.x)

        var zipCandidate = tryStartCapillaryZip(
            probePos: probePos,
            aimDir: aimDir,
            alleys: cartridge.interdentalAlleys,
            allWalls: cartridge.wallBoxes,
            maxAngleRad: GameConfig.flossZipAssistAngleRad,
            entryDist: GameConfig.flossZipAssistEntryDist
        )

        // Fall back to travel heading when parked cursor misses every mouth
        if zipCandidate == nil && aimWorldPos != nil {
            zipCandidate = tryStartCapillaryZip(
                probePos: probePos,
                aimDir: travelDir,
                alleys: cartridge.interdentalAlleys,
                allWalls: cartridge.wallBoxes,
                maxAngleRad: GameConfig.flossZipAssistAngleRad,
                entryDist: GameConfig.flossZipAssistEntryDist
            )
            if zipCandidate != nil {
                aimDir = travelDir
            }
        }

        // Wall-sliding or steep diagonal approaches into a narrow alley mouth
        if zipCandidate == nil {
            if let nearMouth = findNearestZipMouth(
                probePos: probePos,
                alleys: cartridge.interdentalAlleys,
                solidWalls: cartridge.wallBoxes,
                maxDist: GameConfig.flossZipAssistEntryDist
            ) {
                let rayEnd = Vec2(
                    x: probePos.x + aimDir.x * GameConfig.flossLength,
                    z: probePos.z + aimDir.z * GameConfig.flossLength
                )
                let aimingAtCrystal = sucroseCrystals.contains { c in
                    c.intact &&
                    distancePointToSegmentSq2D(c.pos, probePos, rayEnd) <= 0.85
                }
                let aimingAtBridge = bridges.contains { b in
                    guard b.intact else { return false }
                    let mid = Vec2(x: (b.a.x + b.b.x) * 0.5, z: (b.a.z + b.b.z) * 0.5)
                    return segmentsIntersect2D(probePos, rayEnd, b.a, b.b) ||
                        distancePointToSegmentSq2D(mid, probePos, rayEnd) <= 0.65
                }
                let aimingAtOtherTarget = (aimWorldPos != nil) && (aimingAtCrystal || aimingAtBridge)
                if !aimingAtOtherTarget {
                    let vx = nearMouth.exit.x - nearMouth.entry.x
                    let vz = nearMouth.exit.z - nearMouth.entry.z
                    let vLen = hypot(vx, vz)
                    if vLen > 1e-4 {
                        let alleyDir = Vec2(x: vx / vLen, z: vz / vLen)
                        zipCandidate = tryStartCapillaryZip(
                            probePos: probePos,
                            aimDir: alleyDir,
                            alleys: cartridge.interdentalAlleys,
                            allWalls: cartridge.wallBoxes,
                            maxAngleRad: GameConfig.flossZipAssistAngleRad,
                            entryDist: GameConfig.flossZipAssistEntryDist
                        )
                        if zipCandidate != nil {
                            aimDir = alleyDir
                            probeFacingRad = atan2(aimDir.z, aimDir.x)
                        }
                    }
                }
            }
        }

        let segStart = probePos
        let segEnd: Vec2
        if let zipCandidate {
            segEnd = zipCandidate.zip.to
        } else {
            segEnd = Vec2(
                x: probePos.x + aimDir.x * GameConfig.flossLength,
                z: probePos.z + aimDir.z * GameConfig.flossLength
            )
        }

        let baseHalfW = hasPtfeFlossUpgrade
            ? GameConfig.flossPtfeHalfWidth
            : GameConfig.flossBaseHalfWidth
        let effectiveHalfW = zipCandidate != nil
            ? max(baseHalfW, zipCandidate!.alley.width * 0.55)
            : baseHalfW

        let gridRes = grid.applyFloss(a: segStart, b: segEnd, halfWidth: effectiveHalfW)

        var targetsHit = 0

        // Sever Biofilm Bridges
        for bi in bridges.indices {
            if !bridges[bi].intact { continue }
            let b = bridges[bi]
            let mid = Vec2(x: (b.a.x + b.b.x) * 0.5, z: (b.a.z + b.b.z) * 0.5)
            if segmentsIntersect2D(segStart, segEnd, b.a, b.b) ||
                distancePointToSegmentSq2D(mid, segStart, segEnd) <= 0.65 {
                bridges[bi].intact = false
                targetsHit += 1
                scoring.recordSucroseCleared(1)
            }
        }

        // Fracture Sucrose Crystals instantly with Floss!
        for ci in sucroseCrystals.indices {
            if !sucroseCrystals[ci].intact { continue }
            let cPos = sucroseCrystals[ci].pos
            if distancePointToSegmentSq2D(cPos, segStart, segEnd) <= 0.85 {
                sucroseCrystals[ci].intact = false
                sucroseCrystals[ci].hp = 0
                targetsHit += 1
                scoring.recordSucroseCleared(1)
                events.emit(
                    .sucroseShattered(
                        crystalId: sucroseCrystals[ci].id,
                        pos: cPos,
                        via: .floss
                    )
                )
            }
        }

        // Pop Mutans along filament line
        var mi = mutans.count - 1
        while mi >= 0 {
            if distancePointToSegmentSq2D(mutans[mi].pos, segStart, segEnd) <= 0.55 {
                let poppedPos = mutans[mi].pos
                mutans.remove(at: mi)
                events.emit(.mutansPopped(pos: poppedPos, via: "floss"))
            }
            mi -= 1
        }

        if let zipCandidate {
            probeZip = zipCandidate.zip
        }

        let epsCracked = gridRes.epsCellsCracked
        let perTargetSurge = GameConfig.surgePerFlossTarget *
            (hasPtfeFlossUpgrade ? GameConfig.ptfeSurgeMultiplier : 1.0)
        let rawSurge =
            Double(targetsHit) * perTargetSurge +
            Double(gridRes.newlyCleanedCells) * GameConfig.surgePerCleanedCell +
            Double(epsCracked) * GameConfig.surgePerEpsCellCracked
        let surgeDelta = addSurge(rawSurge)

        scoring.recordFlossSlice(targetsHit: targetsHit, cellsCleaned: gridRes.newlyCleanedCells)

        flossBeamRemaining = 0.22
        flossBeamSegment = FlossBeamSegment(a: segStart, b: segEnd)

        if epsCracked > 0 {
            let mid = Vec2(x: (segStart.x + segEnd.x) * 0.5, z: (segStart.z + segEnd.z) * 0.5)
            events.emit(.epsCracked(pos: mid, cellsCracked: epsCracked, via: .floss))
        }

        events.emit(
            .flossSliced(
                from: segStart,
                to: segEnd,
                targetsHit: targetsHit,
                surgeDelta: surgeDelta,
                zipped: zipCandidate != nil,
                epsCellsCracked: epsCracked
            )
        )
    }

    public func findSmartFlossDirection() -> Vec2 {
        if let nearMouth = findNearestZipMouth(
            probePos: probePos,
            alleys: cartridge.interdentalAlleys,
            solidWalls: cartridge.wallBoxes,
            maxDist: GameConfig.flossZipAssistEntryDist
        ) {
            let vx = nearMouth.exit.x - nearMouth.entry.x
            let vz = nearMouth.exit.z - nearMouth.entry.z
            let l = hypot(vx, vz)
            if l > 0.1 {
                return Vec2(x: vx / l, z: vz / l)
            }
        }

        var bestDir: Vec2? = nil
        var bestDist = 4.4

        for c in sucroseCrystals where c.intact {
            let d = hypot(c.pos.x - probePos.x, c.pos.z - probePos.z)
            if d < bestDist && d > 0.1 {
                bestDist = d
                bestDir = Vec2(x: (c.pos.x - probePos.x) / d, z: (c.pos.z - probePos.z) / d)
            }
        }

        for b in bridges where b.intact {
            let mx = (b.a.x + b.b.x) * 0.5
            let mz = (b.a.z + b.b.z) * 0.5
            let d = hypot(mx - probePos.x, mz - probePos.z)
            if d < bestDist && d > 0.1 {
                bestDist = d
                bestDir = Vec2(x: (mx - probePos.x) / d, z: (mz - probePos.z) / d)
            }
        }

        if bestDir == nil, let epsDomes = cartridge.epsDomes {
            var bestDomeDist = 5.2
            for dome in epsDomes {
                if !grid.isEpsArmoredAt(x: dome.cx, z: dome.cz) { continue }
                let d = hypot(dome.cx - probePos.x, dome.cz - probePos.z)
                if d < bestDomeDist && d > 0.1 {
                    bestDomeDist = d
                    bestDir = Vec2(x: (dome.cx - probePos.x) / d, z: (dome.cz - probePos.z) / d)
                }
            }
        }

        if let bestDir {
            return bestDir
        }
        return Vec2(x: cos(probeFacingRad), z: sin(probeFacingRad))
    }

    private func stepStephanClock(dt: Double) {
        guard let sipInterval = cartridge.stephanSipIntervalSec, sipInterval > 0 else { return }
        // Cutting off every Sucrose Crystal ends the repeated sweet sips for good
        guard sucroseCrystals.contains(where: { $0.intact }) else { return }
        stephanSipTimer -= dt
        if stephanSipTimer <= 0 {
            stephanSipTimer = sipInterval > 0 ? sipInterval : GameConfig.stephanDefaultSipIntervalSec
            chemistry.triggerStephanSip()
            stephanSipCount += 1
            events.emit(
                .stephanSip(
                    sipIndex: stephanSipCount,
                    recoverySec: GameConfig.stephanRecoverySec
                )
            )
        }
    }

    private func applyActiveErosionZones() -> (count: Int, minPh: Float) {
        guard let zones = cartridge.erosionZones, !zones.isEmpty else {
            return (0, cartridge.baselinePh)
        }
        return chemistry.triggerErosionWash(
            zones: zones,
            districts: cartridge.districts,
            sealedDistricts: sealedDistricts
        )
    }

    private func stepErosionWash(dt: Double) {
        guard let zones = cartridge.erosionZones, !zones.isEmpty else { return }
        erosionPulseTimer -= dt
        if erosionPulseTimer <= 0 {
            erosionPulseTimer = cartridge.erosionPulseIntervalSec ?? GameConfig.hibiscusDefaultPulseSec
            let (count, minPh) = applyActiveErosionZones()
            if count > 0 {
                erosionWashCount += 1
                events.emit(.erosionWash(washIndex: erosionWashCount, targetPh: minPh))
            }
        }
    }

    private func fireIonRinseActuator() {
        surgeMeter = 0
        // Fluoride-Bicarb surge neutralizes the Stephan acid window immediately
        chemistry.bufferStephan(GameConfig.stephanRecoverySec * 2.0)
        rinseWaveRemaining = GameConfig.rinseWaveDurationSec
        rinseWaveOrigin = probePos

        let res = grid.applyIonRinse(
            origin: probePos,
            radius: GameConfig.rinseWaveRadius,
            chemistry: chemistry,
            hasBicarbUpgrade: hasBicarbRinseUpgrade
        )

        var extraConverted = 0
        if hasErosionChallenge {
            extraConverted = grid.convertCircleToFluorapatite(
                cx: probePos.x,
                cz: probePos.z,
                radius: GameConfig.rinseWaveRadius * 0.85
            )
            fluorapatiteInfusionSec = GameConfig.miswakInfusionDurationSec
            events.emit(
                .fluorapatiteInfused(
                    pos: probePos,
                    cellsConverted: extraConverted,
                    durationSec: GameConfig.miswakInfusionDurationSec
                )
            )
        }

        if res.epsCellsCracked > 0 {
            events.emit(
                .epsCracked(
                    pos: probePos,
                    cellsCracked: res.epsCellsCracked,
                    via: .rinse
                )
            )
        }

        // Clear Acid Pools & Stun S. mutans inside Rinse Wave
        acidPools.removeAll { p in
            hypot(p.pos.x - probePos.x, p.pos.z - probePos.z) <= GameConfig.rinseWaveRadius
        }

        for mi in mutans.indices {
            if hypot(mutans[mi].pos.x - probePos.x, mutans[mi].pos.z - probePos.z) <= GameConfig.rinseWaveRadius {
                mutans[mi].stunRemaining = GameConfig.mutansStunSec
            }
        }

        let sealed = res.cellsSealed + extraConverted
        scoring.recordIonRinseSeal(sealed)
        events.emit(.rinseSurged(origin: rinseWaveOrigin, cellsSealed: sealed))
    }

    private func stepEcology(dt: Double) {
        // Sucrose Crystal spawners
        for ci in sucroseCrystals.indices {
            if !sucroseCrystals[ci].intact { continue }
            let dIdx = sucroseCrystals[ci].districtIdx
            if dIdx >= 0 && dIdx < sealedDistricts.count && sealedDistricts[dIdx] {
                sucroseCrystals[ci].intact = false
                scoring.recordSucroseCleared(1)
                continue
            }
            sucroseCrystals[ci].spawnTimer -= dt
            if sucroseCrystals[ci].spawnTimer <= 0 {
                sucroseCrystals[ci].spawnTimer = GameConfig.sucroseSpawnIntervalSec
                let crystalId = sucroseCrystals[ci].id
                let cPos = sucroseCrystals[ci].pos
                let activeFromCrystal = mutans.filter { $0.parentSucroseId == crystalId }.count
                if activeFromCrystal < GameConfig.maxMutansPerCrystal &&
                    mutans.count < GameConfig.maxMutansGlobal {
                    let eid = nextEntityId
                    nextEntityId += 1
                    let angle = (Double(eid) * 2.39996).truncatingRemainder(dividingBy: Double.pi * 2.0)
                    mutans.append(
                        MutansEntity(
                            id: eid,
                            pos: Vec2(
                                x: cPos.x + cos(angle) * 0.9,
                                z: cPos.z + sin(angle) * 0.9
                            ),
                            vel: Vec2(
                                x: cos(angle) * GameConfig.mutansMoveSpeed,
                                z: sin(angle) * GameConfig.mutansMoveSpeed
                            ),
                            hopPhase: 0,
                            hp: 2.0,
                            stunRemaining: 0,
                            acidDropCooldown: 4.5,
                            parentSucroseId: crystalId
                        )
                    )
                }
            }
        }

        // S. mutans cocci movement, biofilm trail & playful Slime-Boing bump
        for mi in mutans.indices {
            if mutans[mi].stunRemaining > 0 {
                mutans[mi].stunRemaining = max(0, mutans[mi].stunRemaining - dt)
                continue
            }
            mutans[mi].hopPhase += dt * 7.5
            let curPos = mutans[mi].pos
            let curVel = mutans[mi].vel
            var nextPos = resolveCircleCollisions(
                pos: Vec2(x: curPos.x + curVel.x * dt, z: curPos.z + curVel.z * dt),
                radius: 0.45,
                worldWidth: cartridge.worldWidth,
                worldDepth: cartridge.worldDepth,
                walls: allCollisionWalls
            )
            if abs(nextPos.x - (curPos.x + curVel.x * dt)) > 1e-4 {
                mutans[mi].vel.x *= -1
            }
            if abs(nextPos.z - (curPos.z + curVel.z * dt)) > 1e-4 {
                mutans[mi].vel.z *= -1
            }
            if isInsideSealedDistrict(x: nextPos.x, z: curPos.z) {
                mutans[mi].vel.x *= -1
                nextPos.x = curPos.x
            }
            if isInsideSealedDistrict(x: nextPos.x, z: nextPos.z) {
                mutans[mi].vel.z *= -1
                nextPos.z = curPos.z
            }
            mutans[mi].pos = nextPos

            let onSealedCrown = isInsideSealedDistrict(x: nextPos.x, z: nextPos.z)
            if !onSealedCrown {
                grid.depositPlaqueCircle(
                    cx: nextPos.x,
                    cz: nextPos.z,
                    radius: GameConfig.mutansTrailRadius,
                    ratePerSec: GameConfig.mutansDepositRate,
                    dt: dt
                )

                mutans[mi].acidDropCooldown -= dt
                if mutans[mi].acidDropCooldown <= 0 && acidPools.count < 8 {
                    mutans[mi].acidDropCooldown = 7.0
                    let pid = nextEntityId
                    nextEntityId += 1
                    acidPools.append(
                        AcidPoolEntity(
                            id: pid,
                            pos: nextPos,
                            radius: GameConfig.acidPoolRadius,
                            remainingSec: GameConfig.acidPoolLifetimeSec
                        )
                    )
                }
            }

            // Playful Slime-Boing bump against HYDRA-1 (zero HP bar!)
            let dx = probePos.x - nextPos.x
            let dz = probePos.z - nextPos.z
            let dist = hypot(dx, dz)
            if dist < GameConfig.probeRadius + 0.45 && dist > 0.01 && knockbackTimer <= 0 {
                knockbackTimer = GameConfig.probeKnockbackSec
                events.emit(.mutansBumped(pos: nextPos))
                knockbackVel = Vec2(x: (dx / dist) * 8.5, z: (dz / dist) * 8.5)
                mutans[mi].vel = Vec2(
                    x: -(dx / dist) * GameConfig.mutansMoveSpeed,
                    z: -(dz / dist) * GameConfig.mutansMoveSpeed
                )
            }
        }

        // Acid pools lifetime
        var pi = acidPools.count - 1
        while pi >= 0 {
            acidPools[pi].remainingSec -= dt
            if acidPools[pi].remainingSec <= 0 {
                acidPools.remove(at: pi)
            }
            pi -= 1
        }
    }

    private func evaluateSitesAndDistricts() {
        for si in sites.indices {
            let sPos = sites[si].pos
            let ratio = grid.getAreaCleanRatio(
                cx: sPos.x,
                cz: sPos.z,
                radius: GameConfig.siteRestoreRadius
            )
            sites[si].localCleanRatio = ratio
            if !sites[si].restored && ratio >= GameConfig.siteRestoreCleanRatio {
                sites[si].restored = true
                scoring.recordCommensalSiteRestored()
                let surgeDelta = addSurge(GameConfig.surgePerSiteRestored)
                events.emit(
                    .siteRestored(
                        siteId: sites[si].id,
                        pos: sPos,
                        districtIdx: sites[si].districtIdx,
                        surgeDelta: surgeDelta
                    )
                )
            }
        }

        for di in cartridge.districts.indices {
            if sealedDistricts[di] { continue }
            let ratio = grid.districtCleanRatio(di)
            let allDistrictSitesRestored = sites
                .filter { $0.districtIdx == di }
                .allSatisfy { $0.restored }

            if ratio >= GameConfig.districtSealCleanRatio && allDistrictSitesRestored {
                sealedDistricts[di] = true
                grid.sealDistrict(di)
                purgeSealedDistrictEcology(di: di)
                events.emit(
                    .districtSealed(
                        districtIdx: di,
                        districtName: cartridge.districts[di].name,
                        worldCleanRatio: grid.worldCleanRatio
                    )
                )
            }
        }
    }

    private func isPointInSealedSector(di: Int, x: Double, z: Double) -> Bool {
        guard di >= 0 && di < cartridge.districts.count else { return false }
        let b = cartridge.districts[di].bounds
        let ds = cartridge.districts
        let hasWestNeighbor = ds.enumerated().contains { j, d in j != di && d.bounds.maxX <= b.minX + 0.5 }
        let hasEastNeighbor = ds.enumerated().contains { j, d in j != di && d.bounds.minX >= b.maxX - 0.5 }
        let hasNorthNeighbor = ds.enumerated().contains { j, d in j != di && d.bounds.maxZ <= b.minZ + 0.5 }
        let hasSouthNeighbor = ds.enumerated().contains { j, d in j != di && d.bounds.minZ >= b.maxZ - 0.5 }

        let minX = hasWestNeighbor ? b.minX : 0
        let maxX = hasEastNeighbor ? b.maxX : cartridge.worldWidth
        let minZ = hasNorthNeighbor ? b.minZ : 0
        let maxZ = hasSouthNeighbor ? b.maxZ : cartridge.worldDepth
        return x >= minX && x <= maxX && z >= minZ && z <= maxZ
    }

    private func isInsideSealedDistrict(x: Double, z: Double) -> Bool {
        for di in cartridge.districts.indices {
            if !sealedDistricts[di] { continue }
            if isPointInSealedSector(di: di, x: x, z: z) { return true }
        }
        return false
    }

    private func purgeSealedDistrictEcology(di: Int) {
        guard di >= 0 && di < cartridge.districts.count else { return }
        for ci in sucroseCrystals.indices {
            if sucroseCrystals[ci].districtIdx == di && sucroseCrystals[ci].intact {
                sucroseCrystals[ci].intact = false
                scoring.recordSucroseCleared(1)
            }
        }
        acidPools.removeAll { pool in
            isPointInSealedSector(di: di, x: pool.pos.x, z: pool.pos.z)
        }
        var mi = mutans.count - 1
        while mi >= 0 {
            let p = mutans[mi].pos
            if isPointInSealedSector(di: di, x: p.x, z: p.z) {
                mutans.remove(at: mi)
                events.emit(.mutansPopped(pos: p, via: "seal"))
            }
            mi -= 1
        }
    }

    private func evaluateMissionCompletion() {
        switch activeMode {
        case .arcade:
            if !sealedDistricts.isEmpty && sealedDistricts.allSatisfy({ $0 }) {
                finishMission(won: true)
            }
        case .pulpRescue:
            let cleanRatio = grid.worldCleanRatio
            if cleanRatio >= GameConfig.pulpRescueWinCleanRatio {
                grid.sealDistrict(0)
                finishMission(won: true)
            } else if elapsedSec >= GameConfig.pulpRescueDurationSec {
                finishMission(won: false)
            }
        }
    }

    private func finishMission(won: Bool) {
        isCompleted = true
        running = false
        missionWon = won
        let breakdown = scoring.evaluateBreakdown(
            worldCleanRatio: grid.worldCleanRatio,
            sitesTotal: sites.count,
            elapsedSec: elapsedSec,
            parTimeSec: cartridge.parTimeSec
        )
        lastBreakdown = breakdown
        let unlockedHistoryNoteId = won ? cartridge.historyNoteIds.first : nil

        events.emit(
            .missionComplete(
                mode: activeMode,
                worldId: cartridge.id,
                won: won,
                breakdown: breakdown,
                unlockedHistoryNoteId: unlockedHistoryNoteId
            )
        )
    }
}
