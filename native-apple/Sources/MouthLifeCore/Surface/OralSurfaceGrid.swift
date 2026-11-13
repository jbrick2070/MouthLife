import Foundation

private func wrapAngleRad(_ angle: Double) -> Double {
    var a = angle
    let twoPi = Double.pi * 2.0
    while a > Double.pi { a -= twoPi }
    while a < -Double.pi { a += twoPi }
    return a
}

public func distancePointToSegmentSq2D(
    px: Double,
    pz: Double,
    ax: Double,
    az: Double,
    bx: Double,
    bz: Double
) -> Double {
    let vx = bx - ax
    let vz = bz - az
    let wx = px - ax
    let wz = pz - az
    let lenSq = vx * vx + vz * vz
    if lenSq <= 1e-8 {
        return wx * wx + wz * wz
    }
    let t = max(0.0, min(1.0, (wx * vx + wz * vz) / lenSq))
    let projX = ax + t * vx
    let projZ = az + t * vz
    let dx = px - projX
    let dz = pz - projZ
    return dx * dx + dz * dz
}

public func distancePointToSegmentSq2D(_ p: Vec2, _ a: Vec2, _ b: Vec2) -> Double {
    distancePointToSegmentSq2D(px: p.x, pz: p.z, ax: a.x, az: a.z, bx: b.x, bz: b.z)
}

public struct SurfaceDirtyRect: Equatable, Sendable {
    public let x: Int
    public let y: Int
    public let width: Int
    public let height: Int

    public init(x: Int, y: Int, width: Int, height: Int) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}

public final class OralSurfaceGrid {
    public private(set) var worldWidth: Double
    public private(set) var worldDepth: Double
    public private(set) var gridW: Int
    public private(set) var gridH: Int
    public private(set) var cellCount: Int

    public private(set) var biofilmDensity: [Float]
    public var density: [Float] { biofilmDensity }

    public private(set) var flags: [CellFlag]
    public private(set) var districtIdxMap: [Int]
    public private(set) var districtCellIndices: [[Int]]
    public private(set) var rgbaBuffer: [UInt8]

    public private(set) var paintableTotal: Int = 0
    public private(set) var cleanCellsCount: Int = 0
    private var totalPaintableByDistrict: [Int] = []
    private var cleanPaintableByDistrict: [Int] = []

    public private(set) var initialEpsCells: Int = 0
    public private(set) var activeEpsCells: Int = 0
    public private(set) var fluorideSealedCells: Int = 0

    private var dirtyMinX: Int = 0
    private var dirtyMinZ: Int = 0
    private var dirtyMaxX: Int = 0
    private var dirtyMaxZ: Int = 0
    public private(set) var lastSyncedRect: SurfaceDirtyRect?

    public var dirty: Bool = true {
        didSet {
            if dirty && dirtyMinX > dirtyMaxX {
                dirtyMinX = 0
                dirtyMinZ = 0
                dirtyMaxX = max(0, gridW - 1)
                dirtyMaxZ = max(0, gridH - 1)
            }
        }
    }
    public var textureDirty: Bool {
        get { dirty }
        set { dirty = newValue }
    }

    @inline(__always)
    private func markCellDirty(_ idx: Int) {
        let gx = idx % gridW
        let gz = idx / gridW
        if dirtyMinX > dirtyMaxX {
            dirtyMinX = gx
            dirtyMaxX = gx
            dirtyMinZ = gz
            dirtyMaxZ = gz
        } else {
            if gx < dirtyMinX { dirtyMinX = gx }
            if gx > dirtyMaxX { dirtyMaxX = gx }
            if gz < dirtyMinZ { dirtyMinZ = gz }
            if gz > dirtyMaxZ { dirtyMaxZ = gz }
        }
        dirty = true
    }

    @inline(__always)
    private func markAllDirty() {
        dirtyMinX = 0
        dirtyMinZ = 0
        dirtyMaxX = max(0, gridW - 1)
        dirtyMaxZ = max(0, gridH - 1)
        dirty = true
    }

    public init(worldWidth: Double, worldDepth: Double) {
        let w = max(1, Int((worldWidth / GameConfig.cellSize).rounded()))
        let h = max(1, Int((worldDepth / GameConfig.cellSize).rounded()))
        let count = w * h
        self.worldWidth = worldWidth
        self.worldDepth = worldDepth
        self.gridW = w
        self.gridH = h
        self.cellCount = count
        self.biofilmDensity = Array(repeating: 0, count: count)
        self.flags = Array(repeating: .none, count: count)
        self.districtIdxMap = Array(repeating: -1, count: count)
        self.districtCellIndices = []
        self.rgbaBuffer = Array(repeating: 0, count: count * 4)
        self.dirtyMinX = 0
        self.dirtyMinZ = 0
        self.dirtyMaxX = w - 1
        self.dirtyMaxZ = h - 1
    }

    public convenience init(cartridge: WorldCartridge) {
        self.init(worldWidth: cartridge.worldWidth, worldDepth: cartridge.worldDepth)
        bake(from: cartridge)
    }

    public func bakeFromCartridge(_ cartridge: WorldCartridge) {
        bake(from: cartridge)
    }

    public func bake(from cartridge: WorldCartridge) {
        let w = max(1, Int((cartridge.worldWidth / GameConfig.cellSize).rounded()))
        let h = max(1, Int((cartridge.worldDepth / GameConfig.cellSize).rounded()))
        let count = w * h
        if count != cellCount || w != gridW || h != gridH {
            worldWidth = cartridge.worldWidth
            worldDepth = cartridge.worldDepth
            gridW = w
            gridH = h
            cellCount = count
            biofilmDensity = Array(repeating: 0, count: count)
            flags = Array(repeating: .none, count: count)
            districtIdxMap = Array(repeating: -1, count: count)
            rgbaBuffer = Array(repeating: 0, count: count * 4)
        } else {
            for i in 0..<count {
                biofilmDensity[i] = 0
                flags[i] = .none
                districtIdxMap[i] = -1
            }
        }

        let districtCount = cartridge.districts.count
        let alleyWallBoxes = buildAlleyWalls(cartridge)
        paintableTotal = 0
        cleanCellsCount = 0
        totalPaintableByDistrict = Array(repeating: 0, count: districtCount)
        cleanPaintableByDistrict = Array(repeating: 0, count: districtCount)
        districtCellIndices = Array(repeating: [], count: districtCount)
        initialEpsCells = 0
        activeEpsCells = 0
        fluorideSealedCells = 0

        for gz in 0..<gridH {
            let wz = (Double(gz) + 0.5) * GameConfig.cellSize
            for gx in 0..<gridW {
                let wx = (Double(gx) + 0.5) * GameConfig.cellSize
                let idx = gz * gridW + gx

                let inPlayable = cartridge.playableMaskBoxes.contains { $0.contains(x: wx, z: wz) }
                if !inPlayable { continue }

                let inSolidWall =
                    cartridge.wallBoxes.contains { $0.contains(x: wx, z: wz) } ||
                    alleyWallBoxes.contains { $0.contains(x: wx, z: wz) }
                if !inPlayable || inSolidWall { continue }

                var f: CellFlag = .paintable
                var d: Float = cartridge.basePellicleDensity

                // Margin / fissure higher-density bands
                for band in cartridge.marginBands {
                    let distSq = distancePointToSegmentSq2D(
                        px: wx,
                        pz: wz,
                        ax: band.a.x,
                        az: band.a.z,
                        bx: band.b.x,
                        bz: band.b.z
                    )
                    if distSq <= band.radius * band.radius {
                        f.insert(.marginFissure)
                        d = max(d, band.initialDensity)
                    }
                }

                // Gingival sulcus margins (World 2)
                if let sulcusBands = cartridge.sulcusBands {
                    for band in sulcusBands {
                        let distSq = distancePointToSegmentSq2D(
                            px: wx,
                            pz: wz,
                            ax: band.a.x,
                            az: band.a.z,
                            bx: band.b.x,
                            bz: band.b.z
                        )
                        if distSq <= band.radius * band.radius {
                            f.insert(.sulcus)
                            d = max(d, band.initialDensity)
                        }
                    }
                }

                // Interdental Alley stamping from cartridge.interdentalAlleys[]
                for alley in cartridge.interdentalAlleys {
                    let halfW = alley.width * 0.5
                    let distSq = distancePointToSegmentSq2D(
                        px: wx,
                        pz: wz,
                        ax: alley.endpointA.x,
                        az: alley.endpointA.z,
                        bx: alley.endpointB.x,
                        bz: alley.endpointB.z
                    )
                    if distSq <= halfW * halfW {
                        f.insert(.interdental)
                        d = max(d, 0.78)
                    }
                }

                // Zero-G quorum-sensing EPS biofilm domes (World 5)
                if let epsDomes = cartridge.epsDomes, !f.contains(.interdental) {
                    for dome in epsDomes {
                        let dx = wx - dome.cx
                        let dz = wz - dome.cz
                        if dx * dx + dz * dz <= dome.radius * dome.radius {
                            f.insert(.epsArmor)
                            d = max(d, dome.initialDensity)
                        }
                    }
                }

                if f.contains(.epsArmor) {
                    initialEpsCells += 1
                    activeEpsCells += 1
                }

                flags[idx] = f
                biofilmDensity[idx] = min(1, max(0, d))

                // Assign district index
                var assignedDistrict = -1
                for di in 0..<districtCount {
                    if cartridge.districts[di].bounds.contains(x: wx, z: wz) {
                        assignedDistrict = di
                        break
                    }
                }
                districtIdxMap[idx] = assignedDistrict

                paintableTotal += 1
                let isClean = biofilmDensity[idx] <= GameConfig.cleanThreshold
                if isClean {
                    cleanCellsCount += 1
                }

                if assignedDistrict >= 0 {
                    districtCellIndices[assignedDistrict].append(idx)
                    totalPaintableByDistrict[assignedDistrict] += 1
                    if isClean {
                        cleanPaintableByDistrict[assignedDistrict] += 1
                    }
                }
            }
        }

        markAllDirty()
    }

    @discardableResult
    private func setCellDensity(_ idx: Int, _ nextRaw: Float) -> Bool {
        let f = flags[idx]
        guard f.contains(.paintable) else { return false }

        let prev = biofilmDensity[idx]
        let next = min(Float(1), max(Float(0), nextRaw))
        if abs(next - prev) < 1e-6 { return false }

        let wasClean = prev <= GameConfig.cleanThreshold
        let nowClean = next <= GameConfig.cleanThreshold
        biofilmDensity[idx] = next
        markCellDirty(idx)

        if !wasClean && nowClean {
            cleanCellsCount += 1
            let di = districtIdxMap[idx]
            if di >= 0 && di < cleanPaintableByDistrict.count {
                cleanPaintableByDistrict[di] += 1
            }
            return true
        } else if wasClean && !nowClean {
            cleanCellsCount = max(0, cleanCellsCount - 1)
            let di = districtIdxMap[idx]
            if di >= 0 && di < cleanPaintableByDistrict.count {
                cleanPaintableByDistrict[di] = max(0, cleanPaintableByDistrict[di] - 1)
            }
        }
        return false
    }

    @discardableResult
    private func sealCellFluorapatite(_ idx: Int) -> Bool {
        let f = flags[idx]
        guard f.contains(.paintable), !f.contains(.fluorideSealed) else { return false }
        flags[idx] = f.union(.fluorideSealed)
        fluorideSealedCells += 1
        markCellDirty(idx)
        return true
    }

    @discardableResult
    private func crackCellEpsArmor(_ idx: Int) -> Bool {
        let f = flags[idx]
        guard f.contains(.epsArmor) else { return false }
        flags[idx] = f.subtracting(.epsArmor)
        activeEpsCells = max(0, activeEpsCells - 1)
        markCellDirty(idx)
        return true
    }

    public func applyBrush(
        _ params: BrushApplyParams,
        chemistry: OralChemistrySim? = nil
    ) -> ToolApplyResult {
        guard gridW > 0, gridH > 0, params.radius > 0, params.dt > 0 else {
            return ToolApplyResult()
        }
        let minGx = max(0, Int(floor((params.cx - params.radius) / GameConfig.cellSize)))
        let maxGx = min(gridW - 1, Int(ceil((params.cx + params.radius) / GameConfig.cellSize)))
        let minGz = max(0, Int(floor((params.cz - params.radius) / GameConfig.cellSize)))
        let maxGz = min(gridH - 1, Int(ceil((params.cz + params.radius) / GameConfig.cellSize)))
        if minGx > maxGx || minGz > maxGz {
            return ToolApplyResult()
        }

        let rSq = params.radius * params.radius
        let halfArc = params.arcRad * 0.5
        let closeCoreSq = 0.42 * 0.42

        var newlyCleanedCells = 0
        var densityRemovedTotal: Double = 0
        var acidAbrasionWarnings = 0
        var gumTenderWarnings = 0
        var epsDeflectWarnings = 0
        var fluorapatiteConverted = 0

        let sulcusRate = params.sulcusIrritationPerSec
        let sulcusMotionMult = params.isMovingSweep ? GameConfig.sulcusMovingIrritationMult : 1.0

        for gz in minGz...maxGz {
            if gz < 0 || gz >= gridH { continue }
            let wz = (Double(gz) + 0.5) * GameConfig.cellSize
            let dz = wz - params.cz
            for gx in minGx...maxGx {
                if gx < 0 || gx >= gridW { continue }
                let wx = (Double(gx) + 0.5) * GameConfig.cellSize
                let dx = wx - params.cx
                let dSq = dx * dx + dz * dz
                if dSq > rSq { continue }

                if dSq > closeCoreSq {
                    let cellAngle = atan2(dz, dx)
                    if abs(wrapAngleRad(cellAngle - params.facingRad)) > halfArc {
                        continue
                    }
                }

                let idx = gz * gridW + gx
                var f = flags[idx]
                if !f.contains(.paintable) { continue }
                if f.contains(.interdental) { continue }
                if f.contains(.epsArmor) {
                    epsDeflectWarnings += 1
                    continue
                }

                // World 4 Miswak + F⁻ lattice infusion converts brushed enamel into Fluorapatite (pH 4.5 stable!)
                if params.convertToFluorapatite && !f.contains(.fluorideSealed) {
                    if sealCellFluorapatite(idx) {
                        fluorapatiteConverted += 1
                        f = flags[idx]
                    }
                }

                let prev = biofilmDensity[idx]
                if prev <= 0 { continue }

                // Enamel Chemistry Check: 4.5 for Fluorapatite vs 5.5 for Hydroxyapatite
                let criticalPh = f.contains(.fluorideSealed)
                    ? GameConfig.criticalPhFluorapatite
                    : GameConfig.criticalPhHydroxyapatite
                let cellPh = chemistry?.cellPh(at: idx) ?? GameConfig.neutralSalivaPh
                if cellPh < criticalPh {
                    acidAbrasionWarnings += 1
                    continue
                }

                // 1948 Bass Sulcus Care: tender inflamed gingiva refuses heavy-handed scrubbing
                if sulcusRate > 0 && f.contains(.sulcus), let chemistry {
                    if chemistry.gumIrritationCell(at: idx) >= GameConfig.gumTenderThreshold {
                        gumTenderWarnings += 1
                        continue
                    }
                    chemistry.addGumIrritationCell(
                        idx,
                        amount: Float(sulcusRate * sulcusMotionMult * params.dt)
                    )
                }

                let isMargin = f.contains(.marginFissure)
                let marginMult: Double
                if isMargin {
                    if params.hasBassUpgrade {
                        marginMult = GameConfig.marginBasePenalty * GameConfig.bassUpgradeMarginBoost
                    } else if params.hasHydroSonicUpgrade {
                        marginMult = GameConfig.marginBasePenalty * GameConfig.hydrosonicMarginBoost
                    } else {
                        marginMult = GameConfig.marginBasePenalty
                    }
                } else {
                    marginMult = 1.0
                }

                let falloff = 1.0 - 0.22 * (dSq / max(0.01, rSq))
                let delta = Float(params.removalPerSec * marginMult * falloff * params.dt)
                let next = max(Float(0), prev - delta)
                densityRemovedTotal += Double(prev - next)

                if setCellDensity(idx, next) {
                    newlyCleanedCells += 1
                }
            }
        }

        return ToolApplyResult(
            newlyCleanedCells: newlyCleanedCells,
            densityRemovedTotal: densityRemovedTotal,
            acidAbrasionWarnings: acidAbrasionWarnings,
            cellsSealed: 0,
            gumTenderWarnings: gumTenderWarnings,
            epsDeflectWarnings: epsDeflectWarnings,
            epsCellsCracked: 0,
            fluorapatiteConverted: fluorapatiteConverted
        )
    }

    /// Converts paintable non-EPS cells inside world circle `(cx, cz, radius)` into Fluorapatite.
    @discardableResult
    public func convertCircleToFluorapatite(cx: Double, cz: Double, radius: Double) -> Int {
        guard gridW > 0, gridH > 0, radius >= 0 else { return 0 }
        let minGx = max(0, Int(floor((cx - radius) / GameConfig.cellSize)))
        let maxGx = min(gridW - 1, Int(ceil((cx + radius) / GameConfig.cellSize)))
        let minGz = max(0, Int(floor((cz - radius) / GameConfig.cellSize)))
        let maxGz = min(gridH - 1, Int(ceil((cz + radius) / GameConfig.cellSize)))
        if minGx > maxGx || minGz > maxGz { return 0 }
        let rSq = radius * radius
        var converted = 0

        for gz in minGz...maxGz {
            let wz = (Double(gz) + 0.5) * GameConfig.cellSize
            let dz = wz - cz
            for gx in minGx...maxGx {
                let wx = (Double(gx) + 0.5) * GameConfig.cellSize
                let dx = wx - cx
                if dx * dx + dz * dz > rSq { continue }
                let idx = gz * gridW + gx
                let f = flags[idx]
                if !f.contains(.paintable) || f.contains(.epsArmor) { continue }
                if sealCellFluorapatite(idx) {
                    converted += 1
                }
            }
        }
        return converted
    }

    public func isSulcusAt(x: Double, z: Double) -> Bool {
        let gx = Int(floor(x / GameConfig.cellSize))
        let gz = Int(floor(z / GameConfig.cellSize))
        guard gx >= 0, gz >= 0, gx < gridW, gz < gridH else { return false }
        return flags[gz * gridW + gx].contains(.sulcus)
    }

    public func isEpsArmoredAt(x: Double, z: Double) -> Bool {
        let gx = Int(floor(x / GameConfig.cellSize))
        let gz = Int(floor(z / GameConfig.cellSize))
        guard gx >= 0, gz >= 0, gx < gridW, gz < gridH else { return false }
        return flags[gz * gridW + gx].contains(.epsArmor)
    }

    public func isFluorideSealedAt(x: Double, z: Double) -> Bool {
        let gx = Int(floor(x / GameConfig.cellSize))
        let gz = Int(floor(z / GameConfig.cellSize))
        guard gx >= 0, gz >= 0, gx < gridW, gz < gridH else { return false }
        return flags[gz * gridW + gx].contains(.fluorideSealed)
    }

    public func sampleDensity(atX x: Double, z: Double) -> Float {
        let gx = Int(floor(x / GameConfig.cellSize))
        let gz = Int(floor(z / GameConfig.cellSize))
        guard gx >= 0, gz >= 0, gx < gridW, gz < gridH else { return 0 }
        return biofilmDensity[gz * gridW + gx]
    }

    public func sampleFlags(atX x: Double, z: Double) -> CellFlag {
        let gx = Int(floor(x / GameConfig.cellSize))
        let gz = Int(floor(z / GameConfig.cellSize))
        guard gx >= 0, gz >= 0, gx < gridW, gz < gridH else { return .none }
        return flags[gz * gridW + gx]
    }

    public var epsArmorCount: Int { activeEpsCells }
    public func getEpsArmorCount() -> Int { activeEpsCells }

    public var initialEpsArmorCount: Int { initialEpsCells }
    public func getInitialEpsArmorCount() -> Int { initialEpsCells }

    public var epsArmorRemainingRatio: Double {
        guard initialEpsCells > 0 else { return 0 }
        return Double(activeEpsCells) / Double(initialEpsCells)
    }
    public func getEpsArmorRemainingRatio() -> Double { epsArmorRemainingRatio }

    public var fluorapatiteRatio: Double {
        guard paintableTotal > 0 else { return 0 }
        return Double(fluorideSealedCells) / Double(paintableTotal)
    }
    public func getFluorapatiteRatio() -> Double { fluorapatiteRatio }

    public func applyFloss(
        a: Vec2,
        b: Vec2,
        halfWidth: Double,
        epsCrackHalfWidth: Double = GameConfig.epsFlossCrackHalfWidth
    ) -> ToolApplyResult {
        applyFlossSegment(
            x0: a.x,
            z0: a.z,
            x1: b.x,
            z1: b.z,
            halfWidth: halfWidth,
            epsCrackHalfWidth: epsCrackHalfWidth
        )
    }

    public func applyFlossSegment(
        x0: Double,
        z0: Double,
        x1: Double,
        z1: Double,
        halfWidth: Double,
        epsCrackHalfWidth: Double = GameConfig.epsFlossCrackHalfWidth
    ) -> ToolApplyResult {
        guard gridW > 0, gridH > 0 else { return ToolApplyResult() }
        let outerHw = activeEpsCells > 0 ? max(halfWidth, epsCrackHalfWidth) : halfWidth
        let minX = min(x0, x1) - outerHw
        let maxX = max(x0, x1) + outerHw
        let minZ = min(z0, z1) - outerHw
        let maxZ = max(z0, z1) + outerHw

        let minGx = max(0, Int(floor(minX / GameConfig.cellSize)))
        let maxGx = min(gridW - 1, Int(ceil(maxX / GameConfig.cellSize)))
        let minGz = max(0, Int(floor(minZ / GameConfig.cellSize)))
        let maxGz = min(gridH - 1, Int(ceil(maxZ / GameConfig.cellSize)))
        if minGx > maxGx || minGz > maxGz {
            return ToolApplyResult()
        }

        let hwSq = halfWidth * halfWidth
        let outerHwSq = outerHw * outerHw

        var newlyCleanedCells = 0
        var densityRemovedTotal: Double = 0
        var epsCellsCracked = 0

        for gz in minGz...maxGz {
            let wz = (Double(gz) + 0.5) * GameConfig.cellSize
            for gx in minGx...maxGx {
                let wx = (Double(gx) + 0.5) * GameConfig.cellSize
                let distSq = distancePointToSegmentSq2D(
                    px: wx,
                    pz: wz,
                    ax: x0,
                    az: z0,
                    bx: x1,
                    bz: z1
                )
                if distSq > outerHwSq { continue }

                let idx = gz * gridW + gx
                let f = flags[idx]
                if !f.contains(.paintable) { continue }

                let cracked = crackCellEpsArmor(idx)
                if cracked { epsCellsCracked += 1 }

                let prev = biofilmDensity[idx]
                if distSq <= hwSq {
                    if prev <= 0 { continue }
                    densityRemovedTotal += Double(prev)
                    if setCellDensity(idx, 0) {
                        newlyCleanedCells += 1
                    }
                } else if cracked && prev > GameConfig.epsCrackedSlurryCap {
                    densityRemovedTotal += Double(prev - GameConfig.epsCrackedSlurryCap)
                    if setCellDensity(idx, GameConfig.epsCrackedSlurryCap) {
                        newlyCleanedCells += 1
                    }
                }
            }
        }

        return ToolApplyResult(
            newlyCleanedCells: newlyCleanedCells,
            densityRemovedTotal: densityRemovedTotal,
            acidAbrasionWarnings: 0,
            epsCellsCracked: epsCellsCracked
        )
    }

    public func applyIonRinse(
        origin: Vec2,
        radius: Double,
        chemistry: OralChemistrySim? = nil,
        hasBicarbUpgrade: Bool = false
    ) -> ToolApplyResult {
        applyIonRinse(
            cx: origin.x,
            cz: origin.z,
            radius: radius,
            chemistry: chemistry,
            hasBicarbUpgrade: hasBicarbUpgrade
        )
    }

    public func applyIonRinse(
        cx: Double,
        cz: Double,
        radius: Double,
        chemistry: OralChemistrySim? = nil,
        hasBicarbUpgrade: Bool = false
    ) -> ToolApplyResult {
        guard gridW > 0, gridH > 0, radius >= 0 else { return ToolApplyResult() }
        chemistry?.triggerSalivaSpring(
            cx: cx,
            cz: cz,
            radius: radius,
            targetPh: hasBicarbUpgrade ? 7.2 : 7.05,
            sootheGumAmount: 0
        )

        let minGx = max(0, Int(floor((cx - radius) / GameConfig.cellSize)))
        let maxGx = min(gridW - 1, Int(ceil((cx + radius) / GameConfig.cellSize)))
        let minGz = max(0, Int(floor((cz - radius) / GameConfig.cellSize)))
        let maxGz = min(gridH - 1, Int(ceil((cz + radius) / GameConfig.cellSize)))
        if minGx > maxGx || minGz > maxGz {
            return ToolApplyResult()
        }
        let rSq = radius * radius

        var newlyCleanedCells = 0
        var densityRemovedTotal: Double = 0
        var cellsSealed = 0
        var epsCellsCracked = 0

        for gz in minGz...maxGz {
            let wz = (Double(gz) + 0.5) * GameConfig.cellSize
            let dz = wz - cz
            for gx in minGx...maxGx {
                let wx = (Double(gx) + 0.5) * GameConfig.cellSize
                let dx = wx - cx
                if dx * dx + dz * dz > rSq { continue }

                let idx = gz * gridW + gx
                let f = flags[idx]
                if !f.contains(.paintable) { continue }

                let wasArmored = crackCellEpsArmor(idx)
                if wasArmored { epsCellsCracked += 1 }

                let prev = biofilmDensity[idx]
                if prev <= GameConfig.rinseSlurryThreshold {
                    if prev > 0 {
                        densityRemovedTotal += Double(prev)
                        if setCellDensity(idx, 0) {
                            newlyCleanedCells += 1
                        }
                    }
                    if sealCellFluorapatite(idx) {
                        cellsSealed += 1
                    }
                } else {
                    let chip = wasArmored ? GameConfig.epsRinseBiofilmChip : GameConfig.rinseThickBiofilmChip
                    let next = max(Float(0), prev - chip)
                    densityRemovedTotal += Double(prev - next)
                    if setCellDensity(idx, next) {
                        newlyCleanedCells += 1
                    }
                }
            }
        }

        return ToolApplyResult(
            newlyCleanedCells: newlyCleanedCells,
            densityRemovedTotal: densityRemovedTotal,
            acidAbrasionWarnings: 0,
            cellsSealed: cellsSealed,
            epsCellsCracked: epsCellsCracked
        )
    }

    @discardableResult
    public func sealDistrict(_ districtIndex: Int) -> Int {
        guard districtIndex >= 0 && districtIndex < districtCellIndices.count else { return 0 }
        var newlySealed = 0
        for idx in districtCellIndices[districtIndex] {
            if !flags[idx].contains(.paintable) { continue }
            crackCellEpsArmor(idx)
            setCellDensity(idx, 0)
            if sealCellFluorapatite(idx) {
                newlySealed += 1
            }
        }
        dirty = true
        return newlySealed
    }

    public func depositMutansTrail(
        cx: Double,
        cz: Double,
        radius: Double = GameConfig.mutansTrailRadius,
        amount: Double
    ) {
        guard gridW > 0, gridH > 0, radius >= 0, amount > 0 else { return }
        let minGx = max(0, Int(floor((cx - radius) / GameConfig.cellSize)))
        let maxGx = min(gridW - 1, Int(ceil((cx + radius) / GameConfig.cellSize)))
        let minGz = max(0, Int(floor((cz - radius) / GameConfig.cellSize)))
        let maxGz = min(gridH - 1, Int(ceil((cz + radius) / GameConfig.cellSize)))
        if minGx > maxGx || minGz > maxGz { return }
        let rSq = radius * radius

        for gz in minGz...maxGz {
            let wz = (Double(gz) + 0.5) * GameConfig.cellSize
            let dz = wz - cz
            for gx in minGx...maxGx {
                let wx = (Double(gx) + 0.5) * GameConfig.cellSize
                let dx = wx - cx
                if dx * dx + dz * dz > rSq { continue }

                let idx = gz * gridW + gx
                let f = flags[idx]
                if !f.contains(.paintable) { continue }

                let mult = f.contains(.fluorideSealed) ? GameConfig.fluorideSealResoilMult : 1.0
                let next = min(Float(0.95), biofilmDensity[idx] + Float(amount * mult))
                setCellDensity(idx, next)
            }
        }
    }

    public func depositPlaqueCircle(
        cx: Double,
        cz: Double,
        radius: Double,
        ratePerSec: Double,
        dt: Double
    ) {
        depositMutansTrail(cx: cx, cz: cz, radius: radius, amount: ratePerSec * dt)
    }

    public var worldCleanRatio: Double {
        guard paintableTotal > 0 else { return 1.0 }
        return Double(cleanCellsCount) / Double(paintableTotal)
    }

    public func getWorldCleanRatio() -> Double {
        worldCleanRatio
    }

    public func districtCleanRatio(_ districtIndex: Int) -> Double {
        guard districtIndex >= 0 && districtIndex < totalPaintableByDistrict.count else {
            return 1.0
        }
        let total = totalPaintableByDistrict[districtIndex]
        guard total > 0 else { return 1.0 }
        return Double(cleanPaintableByDistrict[districtIndex]) / Double(total)
    }

    public func getDistrictCleanRatio(_ districtIndex: Int) -> Double {
        districtCleanRatio(districtIndex)
    }

    public func cleanRatio(inCircleAt center: Vec2, radius: Double) -> Double {
        getAreaCleanRatio(cx: center.x, cz: center.z, radius: radius)
    }

    public func getAreaCleanRatio(cx: Double, cz: Double, radius: Double) -> Double {
        guard gridW > 0, gridH > 0, radius >= 0 else { return 1.0 }
        let minGx = max(0, Int(floor((cx - radius) / GameConfig.cellSize)))
        let maxGx = min(gridW - 1, Int(ceil((cx + radius) / GameConfig.cellSize)))
        let minGz = max(0, Int(floor((cz - radius) / GameConfig.cellSize)))
        let maxGz = min(gridH - 1, Int(ceil((cz + radius) / GameConfig.cellSize)))
        if minGx > maxGx || minGz > maxGz { return 1.0 }
        let rSq = radius * radius

        var total = 0
        var clean = 0

        for gz in minGz...maxGz {
            let wz = (Double(gz) + 0.5) * GameConfig.cellSize
            let dz = wz - cz
            for gx in minGx...maxGx {
                let wx = (Double(gx) + 0.5) * GameConfig.cellSize
                let dx = wx - cx
                if dx * dx + dz * dz > rSq { continue }

                let idx = gz * gridW + gx
                if !flags[idx].contains(.paintable) { continue }
                total += 1
                if biofilmDensity[idx] <= GameConfig.cleanThreshold {
                    clean += 1
                }
            }
        }

        return total == 0 ? 1.0 : Double(clean) / Double(total)
    }

    @discardableResult
    public func syncRgbaBuffer(
        bChannelMode: BChannelMode,
        chemistry: OralChemistrySim? = nil
    ) -> Bool {
        let chemDirty = chemistry?.consumeDirtyFlag() ?? false
        if !dirty && !chemDirty {
            return false
        }
        if chemDirty || dirtyMinX > dirtyMaxX {
            dirtyMinX = 0
            dirtyMinZ = 0
            dirtyMaxX = max(0, gridW - 1)
            dirtyMaxZ = max(0, gridH - 1)
        }

        let minX = max(0, min(gridW - 1, dirtyMinX))
        let maxX = max(minX, min(gridW - 1, dirtyMaxX))
        let minZ = max(0, min(gridH - 1, dirtyMinZ))
        let maxZ = max(minZ, min(gridH - 1, dirtyMaxZ))
        let w = gridW
        let stephanOffset = chemistry?.stephanGlobalPhOffset ?? 0

        rgbaBuffer.withUnsafeMutableBufferPointer { rgbaPtr in
            biofilmDensity.withUnsafeBufferPointer { densPtr in
                flags.withUnsafeBufferPointer { flagsPtr in
                    for gz in minZ...maxZ {
                        let rowBase = gz * w
                        for gx in minX...maxX {
                            let idx = rowBase + gx
                            let base = idx &* 4
                            let f = flagsPtr[idx]
                            let paintable = f.contains(.paintable)

                            let dClamped = min(Float(1), max(Float(0), densPtr[idx]))
                            rgbaPtr[base] = UInt8(dClamped * 255.0 + 0.5)
                            rgbaPtr[base &+ 1] = f.contains(.fluorideSealed) ? 255 : 0

                            let bVal: UInt8
                            switch bChannelMode {
                            case .marginDensity:
                                bVal = f.contains(.marginFissure) ? 220 : 0
                            case .gumIrritation:
                                let sulcusBase: Float = f.contains(.sulcus) ? 0.16 : 0
                                let gum = chemistry?.gumIrritationCell(at: idx) ?? 0
                                let gClamped = min(Float(1), max(Float(0), max(sulcusBase, gum)))
                                bVal = UInt8(gClamped * 255.0 + 0.5)
                            case .localPh:
                                let rawPh = (chemistry != nil && idx < chemistry!.localPh.count)
                                    ? min(Float(7.6), max(Float(4.0), chemistry!.localPh[idx] + stephanOffset))
                                    : GameConfig.neutralSalivaPh
                                let acidNorm = min(Float(1), max(Float(0), (6.5 - rawPh) / 2.2))
                                bVal = UInt8(acidNorm * 255.0 + 0.5)
                            case .epsArmor:
                                bVal = f.contains(.epsArmor) ? 255 : 0
                            }
                            rgbaPtr[base &+ 2] = bVal
                            rgbaPtr[base &+ 3] = paintable ? 255 : 0
                        }
                    }
                }
            }
        }

        lastSyncedRect = SurfaceDirtyRect(
            x: minX,
            y: minZ,
            width: maxX - minX + 1,
            height: maxZ - minZ + 1
        )
        dirtyMinX = 1
        dirtyMaxX = 0
        dirtyMinZ = 1
        dirtyMaxZ = 0
        dirty = false
        return true
    }

    @discardableResult
    public func syncRgbaBuffer(
        chemistry: OralChemistrySim,
        bChannelMode: BChannelMode
    ) -> Bool {
        syncRgbaBuffer(bChannelMode: bChannelMode, chemistry: chemistry)
    }
}
