import Foundation

public final class OralChemistrySim {
    public private(set) var gridW: Int
    public private(set) var gridH: Int
    public private(set) var baselinePh: Float

    /// Spatial plaque/enamel surface pH buffer (`gridW * gridH`).
    public var localPh: [Float] {
        didSet { hasActiveDeviation = true }
    }

    /// Alias matching TypeScript `spatialPh`.
    public var spatialPh: [Float] {
        get { localPh }
        set { localPh = newValue }
    }

    /// Gingival sulcus irritation buffer (`0...1`, `gridW * gridH`).
    public var gumIrritation: [Float] {
        didSet { hasActiveDeviation = true }
    }

    /// Remaining seconds in the 1940 Stephan Curve 20-second sucrose acid drop window.
    public private(set) var stephanTimerSec: Double = 0

    /// Dirty flag consumed by `OralSurfaceGrid.syncRgbaBuffer` to avoid redundant GPU uploads.
    public var chemistryDirty: Bool = true

    /// Tracks whether any cell currently deviates from neutral pH or zero gum irritation so
    /// equilibrium frames skip the 32,768-cell scan in O(1).
    private var hasActiveDeviation: Bool = false

    private var playableCellIndices: [Int] = []

    public init(
        worldWidth: Double,
        worldDepth: Double,
        baselinePh: Float = GameConfig.neutralSalivaPh
    ) {
        let w = max(1, Int((worldWidth / GameConfig.cellSize).rounded()))
        let h = max(1, Int((worldDepth / GameConfig.cellSize).rounded()))
        self.gridW = w
        self.gridH = h
        self.baselinePh = baselinePh
        let count = w * h
        self.localPh = Array(repeating: baselinePh, count: count)
        self.gumIrritation = Array(repeating: 0, count: count)
    }

    public convenience init(cartridge: WorldCartridge) {
        self.init(
            worldWidth: cartridge.worldWidth,
            worldDepth: cartridge.worldDepth,
            baselinePh: cartridge.baselinePh
        )
        reset(from: cartridge)
    }

    public func reset() {
        for i in localPh.indices {
            localPh[i] = baselinePh
            gumIrritation[i] = 0
        }
        stephanTimerSec = 0
        hasActiveDeviation = false
        chemistryDirty = true
    }

    /// Resets dimensions, baseline pH, playable mask indices, and buffers from a `WorldCartridge`.
    public func reset(from cartridge: WorldCartridge) {
        let w = max(1, Int((cartridge.worldWidth / GameConfig.cellSize).rounded()))
        let h = max(1, Int((cartridge.worldDepth / GameConfig.cellSize).rounded()))
        self.gridW = w
        self.gridH = h
        self.baselinePh = cartridge.baselinePh
        let count = w * h
        if localPh.count == count {
            for i in 0..<count {
                localPh[i] = cartridge.baselinePh
                gumIrritation[i] = 0
            }
        } else {
            localPh = Array(repeating: cartridge.baselinePh, count: count)
            gumIrritation = Array(repeating: 0, count: count)
        }

        playableCellIndices.removeAll(keepingCapacity: true)
        let alleyWalls = buildAlleyWalls(cartridge)
        for gz in 0..<h {
            let wz = (Double(gz) + 0.5) * GameConfig.cellSize
            for gx in 0..<w {
                let wx = (Double(gx) + 0.5) * GameConfig.cellSize
                let inPlayable = cartridge.playableMaskBoxes.contains { $0.contains(x: wx, z: wz) }
                if !inPlayable { continue }
                let inWall =
                    cartridge.wallBoxes.contains { $0.contains(x: wx, z: wz) } ||
                    alleyWalls.contains { $0.contains(x: wx, z: wz) }
                if inWall { continue }
                playableCellIndices.append(gz * w + gx)
            }
        }

        stephanTimerSec = 0
        hasActiveDeviation = false
        chemistryDirty = true
    }

    /// Triggers or resets the 1940 Stephan Curve 20-second sucrose acid drop window.
    public func triggerStephanSip() {
        stephanTimerSec = GameConfig.stephanRecoverySec
        chemistryDirty = true
    }

    /// Alias matching TypeScript `triggerSucroseStephanHit()`.
    public func triggerSucroseStephanHit() {
        triggerStephanSip()
    }

    public func getStephanTimerSec() -> Double {
        stephanTimerSec
    }

    public var stephanGlobalPhOffset: Float {
        guard stephanTimerSec > 0 else { return 0 }
        let ratio = Float(stephanTimerSec / GameConfig.stephanRecoverySec)
        return (GameConfig.stephanDropPh - baselinePh) * ratio
    }

    public func getStephanGlobalPhOffset() -> Float {
        stephanGlobalPhOffset
    }

    /// Salivary bicarbonate buffering: shortens the remaining Stephan Curve recovery window.
    /// Returns the remaining acid-clock seconds.
    @discardableResult
    public func bufferStephan(_ seconds: Double) -> Double {
        if stephanTimerSec > 0 && seconds > 0 {
            stephanTimerSec = max(0, stephanTimerSec - seconds)
            chemistryDirty = true
        }
        return stephanTimerSec
    }

    /// Convenience helper for Salivary Spring Stephan buffering (`stephanSpringBufferSec` = 7.0s).
    @discardableResult
    public func bufferStephanWithSpring(
        seconds: Double = GameConfig.stephanSpringBufferSec
    ) -> Double {
        bufferStephan(seconds)
    }

    public func cellPh(at idx: Int) -> Float {
        guard idx >= 0 && idx < localPh.count else { return baselinePh }
        let raw = localPh[idx] + stephanGlobalPhOffset
        return min(7.6, max(4.0, raw))
    }

    public func getCellPh(_ idx: Int) -> Float {
        cellPh(at: idx)
    }

    /// Samples clamped plaque/enamel pH (`4.0...7.6`) at world coordinates `(x, z)`.
    public func samplePh(atX x: Double, z: Double) -> Float {
        let gx = Int(floor(x / GameConfig.cellSize))
        let gz = Int(floor(z / GameConfig.cellSize))
        guard gx >= 0, gz >= 0, gx < gridW, gz < gridH else {
            return min(7.6, max(4.0, baselinePh + stephanGlobalPhOffset))
        }
        return cellPh(at: gz * gridW + gx)
    }

    /// Mean pH across playable cells (or all grid cells when initialized without a cartridge).
    public var meanPlayablePh: Float {
        let offset = stephanGlobalPhOffset
        if !playableCellIndices.isEmpty {
            var sum: Double = 0
            for idx in playableCellIndices {
                let p = min(Float(7.6), max(Float(4.0), localPh[idx] + offset))
                sum += Double(p)
            }
            return Float(sum / Double(playableCellIndices.count))
        }
        return averagePh
    }

    /// Full-grid average pH matching TypeScript `getAveragePh()`.
    public var averagePh: Float {
        let len = localPh.count
        guard len > 0 else { return baselinePh }
        let offset = stephanGlobalPhOffset
        var sum: Double = 0
        for i in 0..<len {
            let p = min(Float(7.6), max(Float(4.0), localPh[i] + offset))
            sum += Double(p)
        }
        return Float(sum / Double(len))
    }

    public func getAveragePh() -> Float {
        averagePh
    }

    public func applyAcidZone(cx: Double, cz: Double, radius: Double, targetPh: Float) {
        guard gridW > 0, gridH > 0, radius >= 0 else { return }
        let minGx = max(0, Int(floor((cx - radius) / GameConfig.cellSize)))
        let maxGx = min(gridW - 1, Int(ceil((cx + radius) / GameConfig.cellSize)))
        let minGz = max(0, Int(floor((cz - radius) / GameConfig.cellSize)))
        let maxGz = min(gridH - 1, Int(ceil((cz + radius) / GameConfig.cellSize)))
        if minGx > maxGx || minGz > maxGz { return }
        let rSq = radius * radius

        for gz in minGz...maxGz {
            let worldZ = (Double(gz) + 0.5) * GameConfig.cellSize
            let dz = worldZ - cz
            for gx in minGx...maxGx {
                let worldX = (Double(gx) + 0.5) * GameConfig.cellSize
                let dx = worldX - cx
                if dx * dx + dz * dz <= rSq {
                    let idx = gz * gridW + gx
                    if targetPh < localPh[idx] {
                        localPh[idx] = max(4.0, targetPh)
                        chemistryDirty = true
                    }
                }
            }
        }
    }

    /// World 4 Hibiscus / organic-acid erosion wash at a single basin.
    public func triggerErosionWash(
        cx: Double,
        cz: Double,
        radius: Double,
        targetPh: Float = GameConfig.hibiscusErosionPh
    ) {
        applyAcidZone(cx: cx, cz: cz, radius: radius, targetPh: targetPh)
    }

    /// World 4 Hibiscus / organic-acid erosion wash across unsealed cartridge erosion zones.
    @discardableResult
    public func triggerErosionWash(
        zones: [ErosionZoneDef],
        districts: [DistrictDef] = [],
        sealedDistricts: [Bool] = []
    ) -> (count: Int, minPh: Float) {
        guard !zones.isEmpty else { return (0, baselinePh) }
        var count = 0
        var minPh = baselinePh
        for z in zones {
            if !districts.isEmpty {
                if let di = districts.firstIndex(where: { $0.bounds.contains(x: z.cx, z: z.cz) }),
                   di < sealedDistricts.count,
                   sealedDistricts[di] {
                    continue
                }
            }
            applyAcidZone(cx: z.cx, cz: z.cz, radius: z.radius, targetPh: z.targetPh)
            count += 1
            if z.targetPh < minPh {
                minPh = z.targetPh
            }
        }
        return (count, minPh)
    }

    /// Salivary Bicarbonate Spring burst: buffers local pH upward and optionally soothes gingival sulcus irritation.
    public func triggerSalivaSpring(
        cx: Double,
        cz: Double,
        radius: Double = GameConfig.salivaSpringRadius,
        targetPh: Float = GameConfig.salivaSpringPhBoost,
        sootheGumAmount: Float = GameConfig.salivaSpringGumSoothe
    ) {
        guard gridW > 0, gridH > 0, radius >= 0 else { return }
        let minGx = max(0, Int(floor((cx - radius) / GameConfig.cellSize)))
        let maxGx = min(gridW - 1, Int(ceil((cx + radius) / GameConfig.cellSize)))
        let minGz = max(0, Int(floor((cz - radius) / GameConfig.cellSize)))
        let maxGz = min(gridH - 1, Int(ceil((cz + radius) / GameConfig.cellSize)))
        if minGx > maxGx || minGz > maxGz { return }
        let rSq = radius * radius

        for gz in minGz...maxGz {
            let worldZ = (Double(gz) + 0.5) * GameConfig.cellSize
            let dz = worldZ - cz
            for gx in minGx...maxGx {
                let worldX = (Double(gx) + 0.5) * GameConfig.cellSize
                let dx = worldX - cx
                if dx * dx + dz * dz <= rSq {
                    let idx = gz * gridW + gx
                    if localPh[idx] < targetPh {
                        localPh[idx] = min(7.5, targetPh)
                        chemistryDirty = true
                    }
                    if sootheGumAmount > 0 && gumIrritation[idx] > 0 {
                        gumIrritation[idx] = max(0, gumIrritation[idx] - sootheGumAmount)
                        chemistryDirty = true
                    }
                }
            }
        }
    }

    public func addGumIrritation(cx: Double, cz: Double, radius: Double, amount: Float) {
        guard gridW > 0, gridH > 0, radius >= 0, amount != 0 else { return }
        let minGx = max(0, Int(floor((cx - radius) / GameConfig.cellSize)))
        let maxGx = min(gridW - 1, Int(ceil((cx + radius) / GameConfig.cellSize)))
        let minGz = max(0, Int(floor((cz - radius) / GameConfig.cellSize)))
        let maxGz = min(gridH - 1, Int(ceil((cz + radius) / GameConfig.cellSize)))
        if minGx > maxGx || minGz > maxGz { return }
        let rSq = radius * radius

        for gz in minGz...maxGz {
            let worldZ = (Double(gz) + 0.5) * GameConfig.cellSize
            let dz = worldZ - cz
            for gx in minGx...maxGx {
                let worldX = (Double(gx) + 0.5) * GameConfig.cellSize
                let dx = worldX - cx
                if dx * dx + dz * dz <= rSq {
                    let idx = gz * gridW + gx
                    gumIrritation[idx] = min(1, max(0, gumIrritation[idx] + amount))
                    chemistryDirty = true
                }
            }
        }
    }

    /// Adds gum irritation to a single grid cell (used by heavy-handed sulcus scrubbing).
    public func addGumIrritationCell(_ idx: Int, amount: Float) {
        guard idx >= 0, idx < gumIrritation.count, amount != 0 else { return }
        gumIrritation[idx] = min(1, max(0, gumIrritation[idx] + amount))
        chemistryDirty = true
    }

    public func gumIrritationCell(at idx: Int) -> Float {
        guard idx >= 0, idx < gumIrritation.count else { return 0 }
        return gumIrritation[idx]
    }

    public func getGumIrritationCell(_ idx: Int) -> Float {
        gumIrritationCell(at: idx)
    }

    /// Samples gingival sulcus irritation (`0...1`) at world coordinates `(x, z)`.
    public func sampleGumIrritation(atX x: Double, z: Double) -> Float {
        let gx = Int(floor(x / GameConfig.cellSize))
        let gz = Int(floor(z / GameConfig.cellSize))
        guard gx >= 0, gz >= 0, gx < gridW, gz < gridH else { return 0 }
        return gumIrritation[gz * gridW + gx]
    }

    public var maxGumIrritation: Float {
        var maxVal: Float = 0
        for g in gumIrritation where g > maxVal {
            maxVal = g
        }
        return maxVal
    }

    public func getMaxGumIrritation() -> Float {
        maxGumIrritation
    }

    public var meanGumIrritation: Float {
        if !playableCellIndices.isEmpty {
            var sum: Double = 0
            for idx in playableCellIndices {
                sum += Double(gumIrritation[idx])
            }
            return Float(sum / Double(playableCellIndices.count))
        }
        guard !gumIrritation.isEmpty else { return 0 }
        var sum: Double = 0
        for g in gumIrritation {
            sum += Double(g)
        }
        return Float(sum / Double(gumIrritation.count))
    }

    public func step(dt: Double) {
        guard dt > 0 else { return }
        if stephanTimerSec > 0 {
            stephanTimerSec = max(0, stephanTimerSec - dt)
            chemistryDirty = true
        }

        guard hasActiveDeviation else { return }

        let phRecoveryStep = Float(0.08 * dt)
        let gumCoolStep = Float(0.12 * dt)
        let basePh = baselinePh
        var stillDeviated = false
        var didMutate = false

        localPh.withUnsafeMutableBufferPointer { phBuf in
            gumIrritation.withUnsafeMutableBufferPointer { gumBuf in
                let len = min(phBuf.count, gumBuf.count)
                for i in 0..<len {
                    let ph = phBuf[i]
                    if abs(ph - basePh) > 0.001 {
                        let nextPh: Float
                        if ph < basePh {
                            nextPh = min(basePh, ph + phRecoveryStep)
                        } else {
                            nextPh = max(basePh, ph - phRecoveryStep * 0.5)
                        }
                        phBuf[i] = nextPh
                        didMutate = true
                        if abs(nextPh - basePh) > 0.001 {
                            stillDeviated = true
                        }
                    }
                    let gum = gumBuf[i]
                    if gum > 0 {
                        let nextGum = max(0, gum - gumCoolStep)
                        gumBuf[i] = nextGum
                        didMutate = true
                        if nextGum > 0 {
                            stillDeviated = true
                        }
                    }
                }
            }
        }

        if didMutate {
            chemistryDirty = true
        }
        hasActiveDeviation = stillDeviated
    }

    public func consumeDirtyFlag() -> Bool {
        let wasDirty = chemistryDirty
        chemistryDirty = false
        return wasDirty
    }
}
