import Foundation

public func formatClock(_ totalSec: Double, pad: Bool = false) -> String {
    let s = max(0, Int(floor(totalSec)))
    let m = s / 60
    let r = s % 60
    let mStr = pad ? String(format: "%02d", m) : String(m)
    let rStr = String(format: "%02d", r)
    return "\(mStr):\(rStr)"
}

public struct TimerPillState: Equatable, Sendable {
    public var text: String
    public var warn: Bool

    public init(text: String, warn: Bool) {
        self.text = text
        self.warn = warn
    }
}

/// Pulp Rescue: prominent countdown (amber `< 25s`). Arcade: `elapsed / par`.
public func buildTimerPill(
    mode: ActivePlayMode,
    elapsedSec: Double,
    parSec: Double,
    remainingRescueSec: Double
) -> TimerPillState {
    if mode == .pulpRescue {
        return TimerPillState(
            text: "⏱ \(formatClock(ceil(remainingRescueSec), pad: true))",
            warn: remainingRescueSec < 25.0
        )
    }
    return TimerPillState(
        text: "⏱ \(formatClock(elapsedSec)) / \(formatClock(parSec))",
        warn: elapsedSec > parSec
    )
}

public enum WayfinderKind: String, Codable, CaseIterable, Sendable {
    case site
    case crystal
    case dome
    case district
    case dirtySpot
}

public struct WayfinderTarget: Equatable, Sendable {
    public var x: Double
    public var z: Double
    public var kind: WayfinderKind
    public var label: String

    public init(x: Double, z: Double, kind: WayfinderKind, label: String = "") {
        self.x = x
        self.z = z
        self.kind = kind
        self.label = label.isEmpty ? WayfinderTarget.defaultLabel(for: kind) : label
    }

    public static func defaultLabel(for kind: WayfinderKind) -> String {
        switch kind {
        case .site: return "Colony"
        case .crystal: return "Crystal"
        case .dome: return "EPS Dome"
        case .district: return "District"
        case .dirtySpot: return "Plaque"
        }
    }
}

public struct WayfinderInput: Equatable, Sendable {
    public var sites: [CommensalSiteEntity]
    public var sealedDistricts: [Bool]
    public var crystals: [SucroseCrystalEntity]
    public var domes: [EpsDomeDef]
    public var domesRemaining: Bool
    public var scanActive: Bool
    public var probe: Vec2

    public init(
        sites: [CommensalSiteEntity],
        sealedDistricts: [Bool],
        crystals: [SucroseCrystalEntity],
        domes: [EpsDomeDef],
        domesRemaining: Bool,
        scanActive: Bool,
        probe: Vec2
    ) {
        self.sites = sites
        self.sealedDistricts = sealedDistricts
        self.crystals = crystals
        self.domes = domes
        self.domesRemaining = domesRemaining
        self.scanActive = scanActive
        self.probe = probe
    }
}

/// Remaining-objective wayfinders: unrestored Commensal Sites when `< 3` remain in an unsealed
/// district, or everything (sites, crystals, EPS domes) while the Dye Bio-Scan is active.
public func selectWayfinderTargets(_ inp: WayfinderInput, maxSlots: Int) -> [WayfinderTarget] {
    guard maxSlots > 0 else { return [] }
    var out: [WayfinderTarget] = []
    var byDistrict: [Int: [CommensalSiteEntity]] = [:]
    for s in inp.sites where !s.restored {
        byDistrict[s.districtIdx, default: []].append(s)
    }
    for (d, arr) in byDistrict {
        let open = d < 0 || d >= inp.sealedDistricts.count || !inp.sealedDistricts[d]
        if inp.scanActive || (open && arr.count < 3) {
            for s in arr {
                out.append(WayfinderTarget(x: s.pos.x, z: s.pos.z, kind: .site, label: "Colony"))
            }
        }
    }
    if inp.scanActive {
        for c in inp.crystals where c.intact {
            out.append(WayfinderTarget(x: c.pos.x, z: c.pos.z, kind: .crystal, label: "Crystal"))
        }
        if inp.domesRemaining {
            for d in inp.domes {
                out.append(WayfinderTarget(x: d.cx, z: d.cz, kind: .dome, label: "Slime Dome"))
            }
        }
    }
    out.sort { a, b in
        hypot(a.x - inp.probe.x, a.z - inp.probe.z) < hypot(b.x - inp.probe.x, b.z - inp.probe.z)
    }
    return Array(out.prefix(maxSlots))
}

public struct WayfinderArrow: Equatable, Sendable {
    public var target: WayfinderTarget
    public var worldAngleRad: Double
    public var distance: Double

    public init(target: WayfinderTarget, worldAngleRad: Double, distance: Double) {
        self.target = target
        self.worldAngleRad = worldAngleRad
        self.distance = distance
    }
}

/// Computes the primary objective wayfinder arrow (sites, scan crystals/domes, unsealed districts, or dirtiest plaque cluster).
public func computeWayfinder(for session: WorldSession) -> WayfinderArrow? {
    let scanActive = session.discloseActiveRemaining > 0
    let domesRem = session.hasEpsDomes && session.grid.epsArmorRemainingRatio > 0
    let inp = WayfinderInput(
        sites: session.sites,
        sealedDistricts: session.sealedDistricts,
        crystals: session.sucroseCrystals,
        domes: session.cartridge.epsDomes ?? [],
        domesRemaining: domesRem,
        scanActive: scanActive,
        probe: session.probePos
    )
    let explicitTargets = selectWayfinderTargets(inp, maxSlots: 1)
    if let first = explicitTargets.first {
        let dx = first.x - session.probePos.x
        let dz = first.z - session.probePos.z
        return WayfinderArrow(
            target: first,
            worldAngleRad: atan2(dz, dx),
            distance: hypot(dx, dz)
        )
    }

    // Fallback 1: any unrestored site in an unsealed district
    let openSites = session.sites.filter { s in
        !s.restored && (s.districtIdx < 0 || s.districtIdx >= session.sealedDistricts.count || !session.sealedDistricts[s.districtIdx])
    }
    if let nearestSite = openSites.min(by: {
        $0.pos.distance(to: session.probePos) < $1.pos.distance(to: session.probePos)
    }) {
        let target = WayfinderTarget(x: nearestSite.pos.x, z: nearestSite.pos.z, kind: .site, label: "Colony")
        let dx = target.x - session.probePos.x
        let dz = target.z - session.probePos.z
        return WayfinderArrow(target: target, worldAngleRad: atan2(dz, dx), distance: hypot(dx, dz))
    }

    // Fallback 2: dirtiest cell cluster in the weakest unsealed district (or global grid in Pulp Rescue)
    let grid = session.grid
    var candidateDistrict: Int? = nil
    for di in session.cartridge.districts.indices {
        if di < session.sealedDistricts.count && session.sealedDistricts[di] { continue }
        if let best = candidateDistrict {
            if grid.districtCleanRatio(di) < grid.districtCleanRatio(best) {
                candidateDistrict = di
            }
        } else {
            candidateDistrict = di
        }
    }

    if let di = candidateDistrict, di < grid.districtCellIndices.count {
        var weightedX = 0.0
        var weightedZ = 0.0
        var weightSum = 0.0
        for idx in grid.districtCellIndices[di] {
            let d = grid.biofilmDensity[idx]
            if d > GameConfig.cleanThreshold {
                let gx = idx % grid.gridW
                let gz = idx / grid.gridW
                let wx = (Double(gx) + 0.5) * GameConfig.cellSize
                let wz = (Double(gz) + 0.5) * GameConfig.cellSize
                let w = Double(d)
                weightedX += wx * w
                weightedZ += wz * w
                weightSum += w
            }
        }
        if weightSum > 0 {
            let tx = weightedX / weightSum
            let tz = weightedZ / weightSum
            let target = WayfinderTarget(
                x: tx,
                z: tz,
                kind: .dirtySpot,
                label: "D\(di + 1) Plaque"
            )
            let dx = tx - session.probePos.x
            let dz = tz - session.probePos.z
            return WayfinderArrow(target: target, worldAngleRad: atan2(dz, dx), distance: hypot(dx, dz))
        }

        let b = session.cartridge.districts[di].bounds
        let cx = (b.minX + b.maxX) * 0.5
        let cz = (b.minZ + b.maxZ) * 0.5
        let target = WayfinderTarget(x: cx, z: cz, kind: .district, label: "D\(di + 1)")
        let dx = cx - session.probePos.x
        let dz = cz - session.probePos.z
        return WayfinderArrow(target: target, worldAngleRad: atan2(dz, dx), distance: hypot(dx, dz))
    }

    return nil
}

public struct ClampedPoint: Equatable, Sendable {
    public var x: Double
    public var y: Double
    public var onScreen: Bool
    public var angleRad: Double

    public init(x: Double, y: Double, onScreen: Bool, angleRad: Double) {
        self.x = x
        self.y = y
        self.onScreen = onScreen
        self.angleRad = angleRad
    }
}

public struct ScreenBox: Equatable, Sendable {
    public var cx: Double
    public var cy: Double
    public var halfW: Double
    public var halfH: Double

    public init(cx: Double, cy: Double, halfW: Double, halfH: Double) {
        self.cx = cx
        self.cy = cy
        self.halfW = halfW
        self.halfH = halfH
    }
}

/// Keeps the wayfinder pill vertically between the top HUD and bottom thumb deck.
public func wayfinderLabelY(
    projectedY: Double,
    hudBottom: Double,
    labelHeight: Double,
    deckTop: Double = .infinity
) -> Double {
    let minY = hudBottom + labelHeight / 2.0 + 4.0
    let maxY = deckTop - labelHeight / 2.0 - 6.0
    return min(max(minY, maxY), max(minY, projectedY))
}

/// Finds the closest collision-free vertical slot at `anchor`, or returns `nil` if crowded out.
public func findWayfinderLabelY(
    anchor: ScreenBox,
    hudBottom: Double,
    deckTop: Double,
    occupied: [ScreenBox]
) -> Double? {
    let top = hudBottom + anchor.halfH + 4.0
    let bottom = deckTop - anchor.halfH - 6.0
    if top > bottom { return nil }

    let blockers = occupied.filter { box in
        abs(anchor.cx - box.cx) < anchor.halfW + box.halfW + 6.0
    }
    let target = max(top, min(bottom, anchor.cy))
    var candidates: [Double] = [target, top, bottom]
    for box in blockers {
        let gap = box.halfH + anchor.halfH + 5.0
        candidates.append(box.cy - gap)
        candidates.append(box.cy + gap)
    }

    var best: Double? = nil
    for y in candidates {
        if y < top || y > bottom { continue }
        let overlaps = blockers.contains { box in
            abs(y - box.cy) < box.halfH + anchor.halfH + 4.0
        }
        if overlaps { continue }
        if let currentBest = best {
            if abs(y - target) < abs(currentBest - target) {
                best = y
            }
        } else {
            best = y
        }
    }
    return best
}

/// Clamps a floating world callout inside the safe gameplay band, dodging occupied pills.
public func placeWorldCallout(
    x: Double,
    bottomY: Double,
    width: Double,
    height: Double,
    viewportW: Double,
    hudBottom: Double,
    deckTop: Double,
    occupied: [ScreenBox] = []
) -> (x: Double, bottomY: Double) {
    let halfW = min(viewportW * 0.46, max(24.0, width * 0.5))
    let h = max(20.0, height)
    let halfH = h * 0.5
    let clampedX = max(halfW + 8.0, min(viewportW - halfW - 8.0, x))
    let minBottomY = hudBottom + h + 6.0
    let maxBottomY = max(minBottomY, deckTop - 8.0)
    var cy = max(minBottomY, min(maxBottomY, bottomY)) - halfH

    for box in occupied {
        if abs(clampedX - box.cx) < box.halfW + halfW + 6.0 &&
            abs(cy - box.cy) < box.halfH + halfH + 4.0 {
            let aboveCy = box.cy - box.halfH - halfH - 5.0
            let belowCy = box.cy + box.halfH + halfH + 5.0
            if aboveCy - halfH >= hudBottom + 6.0 {
                cy = aboveCy
            } else if belowCy + halfH <= deckTop - 8.0 {
                cy = belowCy
            }
        }
    }
    return (x: clampedX, bottomY: cy + halfH)
}

/// Clamps a projected screen point to the viewport edge (with margin), preserving direction.
public func clampToScreen(
    x: Double,
    y: Double,
    w: Double,
    h: Double,
    margin: Double,
    forceOff: Bool = false
) -> ClampedPoint {
    let cx = w / 2.0
    let cy = h / 2.0
    let dx = x - cx
    let dy = y - cy
    let angleRad = atan2(dy, dx)
    let inside = x >= margin && x <= w - margin && y >= margin && y <= h - margin
    if inside && !forceOff {
        return ClampedPoint(x: x, y: y, onScreen: true, angleRad: angleRad)
    }
    let hx = max(1.0, w / 2.0 - margin)
    let hy = max(1.0, h / 2.0 - margin)
    let sx = dx == 0 ? Double.infinity : hx / abs(dx)
    let sy = dy == 0 ? Double.infinity : hy / abs(dy)
    let k = min(sx, sy)
    let kk = k.isFinite ? k : 0.0
    return ClampedPoint(x: cx + dx * kk, y: cy + dy * kk, onScreen: false, angleRad: angleRad)
}

// MARK: - World Signature Mechanic Pill (Worlds 2–5)

public enum WorldMechanicKind: String, Codable, CaseIterable, Sendable {
    case gumComfort
    case stephanPh
    case miswakFluorapatite
    case epsDomes
}

public struct WorldMechanicPill: Equatable, Sendable {
    public var kind: WorldMechanicKind
    public var text: String
    public var warn: Bool
    public var borderHex: UInt32
    public var textHex: UInt32

    public init(
        kind: WorldMechanicKind,
        text: String,
        warn: Bool,
        borderHex: UInt32,
        textHex: UInt32
    ) {
        self.kind = kind
        self.text = text
        self.warn = warn
        self.borderHex = borderHex
        self.textHex = textHex
    }
}

public func formatWorldMechanicPill(
    hasStephanClock: Bool = false,
    stephanTimerSec: Double = 0,
    nextSipCountdownSec: Double = 0,
    hasSulcusCare: Bool = false,
    maxGumIrritation: Float = 0,
    hasErosionChallenge: Bool = false,
    fluorapatiteInfusionSec: Double = 0,
    fluorapatiteRatio: Double = 0,
    hasEpsDomes: Bool = false,
    epsArmorRemainingRatio: Double = 0
) -> WorldMechanicPill? {
    if hasStephanClock {
        if stephanTimerSec > 0 {
            return WorldMechanicPill(
                kind: .stephanPh,
                text: "⚠️ Acid Clock \(Int(ceil(stephanTimerSec)))s",
                warn: true,
                borderHex: 0xF59E0B,
                textHex: 0xFDE68A
            )
        } else if nextSipCountdownSec > 0 {
            return WorldMechanicPill(
                kind: .stephanPh,
                text: "🥤 Next Sip \(Int(ceil(nextSipCountdownSec)))s",
                warn: false,
                borderHex: 0xC084FC,
                textHex: 0xE9D5FF
            )
        } else {
            return WorldMechanicPill(
                kind: .stephanPh,
                text: "✓ Sugar Cut Off!",
                warn: false,
                borderHex: 0x38BDF8,
                textHex: 0xBAE6FD
            )
        }
    } else if hasSulcusCare {
        let pct = Int(((Double(maxGumIrritation) / Double(GameConfig.gumTenderThreshold)) * 100.0).rounded())
        let warn = maxGumIrritation >= GameConfig.gumTenderThreshold * 0.7
        let text = maxGumIrritation >= GameConfig.gumTenderThreshold
            ? "⚠️ Gums Tender!"
            : "🩷 Gum \(min(99, max(0, pct)))%"
        return WorldMechanicPill(
            kind: .gumComfort,
            text: text,
            warn: warn,
            borderHex: warn ? 0xF59E0B : 0x38BDF8,
            textHex: warn ? 0xFDE68A : 0xE0F2FE
        )
    } else if hasErosionChallenge {
        let faPct = Int((fluorapatiteRatio * 100.0).rounded())
        if fluorapatiteInfusionSec > 0 {
            return WorldMechanicPill(
                kind: .miswakFluorapatite,
                text: "💎 F⁻ \(Int(ceil(fluorapatiteInfusionSec)))s • \(faPct)%",
                warn: false,
                borderHex: 0x38BDF8,
                textHex: 0xBAE6FD
            )
        } else {
            return WorldMechanicPill(
                kind: .miswakFluorapatite,
                text: "🌺 Hibiscus • 💎 \(faPct)%",
                warn: true,
                borderHex: 0xF59E0B,
                textHex: 0xFDE68A
            )
        }
    } else if hasEpsDomes {
        let epsPct = Int((epsArmorRemainingRatio * 100.0).rounded())
        if epsPct > 0 {
            return WorldMechanicPill(
                kind: .epsDomes,
                text: "🛡️ Slime dome \(epsPct)%",
                warn: false,
                borderHex: 0xC084FC,
                textHex: 0xE9D5FF
            )
        } else {
            return WorldMechanicPill(
                kind: .epsDomes,
                text: "✓ Domes Cracked!",
                warn: false,
                borderHex: 0x38BDF8,
                textHex: 0xBAE6FD
            )
        }
    }
    return nil
}

public func formatWorldMechanicPill(for session: WorldSession) -> WorldMechanicPill? {
    formatWorldMechanicPill(
        hasStephanClock: session.hasStephanClock,
        stephanTimerSec: session.chemistry.stephanTimerSec,
        nextSipCountdownSec: session.stephanSipCountdown,
        hasSulcusCare: session.hasSulcusCare,
        maxGumIrritation: session.chemistry.maxGumIrritation,
        hasErosionChallenge: session.hasErosionChallenge,
        fluorapatiteInfusionSec: session.fluorapatiteInfusionSec,
        fluorapatiteRatio: session.grid.fluorapatiteRatio,
        hasEpsDomes: session.hasEpsDomes,
        epsArmorRemainingRatio: session.grid.epsArmorRemainingRatio
    )
}

// MARK: - Objective Breadcrumb & Onboarding Helpers

public struct ObjectiveInput: Equatable, Sendable {
    public var mode: ActivePlayMode
    public var worldCleanRatio: Double
    public var districtClean: [Double]
    public var sealed: [Bool]
    public var sitesLeftOpen: Int
    public var domesRemaining: Bool
    public var surgeReady: Bool
    public var sealRatio: Double
    public var rescueTargetRatio: Double
    public var rescueRemainingSec: Double?
    public var acidLockSec: Double

    public init(
        mode: ActivePlayMode,
        worldCleanRatio: Double,
        districtClean: [Double],
        sealed: [Bool],
        sitesLeftOpen: Int,
        domesRemaining: Bool,
        surgeReady: Bool,
        sealRatio: Double = GameConfig.districtSealCleanRatio,
        rescueTargetRatio: Double = GameConfig.pulpRescueWinCleanRatio,
        rescueRemainingSec: Double? = nil,
        acidLockSec: Double = 0
    ) {
        self.mode = mode
        self.worldCleanRatio = worldCleanRatio
        self.districtClean = districtClean
        self.sealed = sealed
        self.sitesLeftOpen = sitesLeftOpen
        self.domesRemaining = domesRemaining
        self.surgeReady = surgeReady
        self.sealRatio = sealRatio
        self.rescueTargetRatio = rescueTargetRatio
        self.rescueRemainingSec = rescueRemainingSec
        self.acidLockSec = acidLockSec
    }
}

public func computeObjectiveBreadcrumb(_ inp: ObjectiveInput) -> String {
    if inp.mode == .pulpRescue {
        let left = max(0, Int(ceil((inp.rescueTargetRatio - inp.worldCleanRatio) * 100.0)))
        if left > 0 {
            let secSuffix: String
            if let rem = inp.rescueRemainingSec {
                secSuffix = " • \(max(0, Int(ceil(rem))))s left"
            } else {
                secSuffix = ""
            }
            return "Pulp: \(left)% more\(secSuffix) — scrub!"
        }
        return "Patching… the pulp is safe!"
    }

    let openIdx = inp.sealed.enumerated().compactMap { !$0.element ? $0.offset : nil }
    if !inp.sealed.isEmpty && openIdx.isEmpty {
        return "✨ All zones sealed — you did it!"
    }
    if inp.acidLockSec > 0 {
        return "Acid clock \(Int(ceil(inp.acidLockSec)))s — use Saliva Spring!"
    }
    if inp.domesRemaining {
        return "🛡️ Crack the dome: Floss [E] or Surge [Q]!"
    }
    if inp.sitesLeftOpen == 1 {
        return "1 helper colony left — follow ➤ Colony!"
    }
    if inp.sitesLeftOpen > 1 {
        return "Restore \(inp.sitesLeftOpen) colonies — scrub glowing rings!"
    }

    let worst = openIdx.reduce(openIdx.first ?? 0) { best, i in
        let ci = i < inp.districtClean.count ? inp.districtClean[i] : 0
        let cb = best < inp.districtClean.count ? inp.districtClean[best] : 0
        return ci < cb ? i : best
    }
    let worstVal = worst < inp.districtClean.count ? inp.districtClean[worst] : 0
    let worstPct = Int((worstVal * 100.0).rounded())
    let nearly = openIdx.allSatisfy { i in
        let c = i < inp.districtClean.count ? inp.districtClean[i] : 0
        return c >= inp.sealRatio - 0.12
    }
    if nearly && inp.surgeReady {
        return openIdx.count > 1
            ? "Almost clean! Fire Fluoride Surge [Q] to seal!"
            : "Fire Fluoride Surge [Q] to seal final district!"
    }
    if nearly {
        return "Sweep D\(worst + 1) (\(worstPct)% → \(Int((inp.sealRatio * 100.0).rounded()))%) to seal it!"
    }
    return inp.surgeReady
        ? "Scrub enamel → fire Surge [Q] to seal!"
        : "Scrub enamel → bring back colonies → Surge [Q]!"
}

public func computeObjectiveBreadcrumb(for session: WorldSession) -> String {
    let districtClean = session.cartridge.districts.indices.map { session.grid.districtCleanRatio($0) }
    let sitesLeftOpen = session.sites.filter { s in
        !s.restored && (s.districtIdx < 0 || s.districtIdx >= session.sealedDistricts.count || !session.sealedDistricts[s.districtIdx])
    }.count
    let surgeReady = session.surgeMeter >= GameConfig.surgeMax
    return computeObjectiveBreadcrumb(
        ObjectiveInput(
            mode: session.activeMode,
            worldCleanRatio: session.grid.worldCleanRatio,
            districtClean: districtClean,
            sealed: session.sealedDistricts,
            sitesLeftOpen: sitesLeftOpen,
            domesRemaining: session.hasEpsDomes && session.grid.epsArmorRemainingRatio > 0,
            surgeReady: surgeReady,
            rescueRemainingSec: session.activeMode == .pulpRescue ? session.remainingRescueSec : nil,
            acidLockSec: session.hasStephanClock ? session.chemistry.stephanTimerSec : 0
        )
    )
}

public let hintsStorageKey = "mouthlife.hintsSeen"

public func decodeSeenHints(from jsonString: String?) -> Set<String> {
    guard let jsonString, let data = jsonString.data(using: .utf8) else { return [] }
    guard let arr = try? JSONDecoder().decode([String].self, from: data) else { return [] }
    return Set(arr)
}

public func encodeSeenHints(_ seen: Set<String>) -> String {
    let sorted = seen.sorted()
    guard let data = try? JSONEncoder().encode(sorted),
          let str = String(data: data, encoding: .utf8) else {
        return "[]"
    }
    return str
}

public func shouldShowHubWelcome(
    seenHints: Set<String>,
    totalBrushStamps: Int,
    world1Completed: Bool
) -> Bool {
    !seenHints.contains("hub_welcome") && totalBrushStamps == 0 && !world1Completed
}

public func shouldShowDiveIntroToast(
    mode: ActivePlayMode,
    worldId: String,
    world1Completed: Bool
) -> Bool {
    if mode == .pulpRescue { return true }
    if worldId != "world_1" { return true }
    return world1Completed
}

public func shouldHintFlossMiss(
    zipped: Bool,
    targetsHit: Int,
    epsCellsCracked: Int,
    zipPromptActive: Bool = false
) -> Bool {
    !zipped && targetsHit == 0 && epsCellsCracked == 0 && !zipPromptActive
}

public struct SideLayoutFraming: Equatable, Sendable {
    public var sideFrac: Double
    public var shiftX: Double
    public var dolly: Double

    public init(sideFrac: Double, shiftX: Double, dolly: Double) {
        self.sideFrac = sideFrac
        self.shiftX = shiftX
        self.dolly = dolly
    }
}

public func sideLayoutFraming(
    viewW: Double,
    viewH: Double,
    deckLeft: Double,
    archFraction: Double = 0.52
) -> SideLayoutFraming? {
    guard viewW > viewH, deckLeft > viewW * 0.3, deckLeft < viewW else { return nil }
    let sideFrac = deckLeft / viewW
    return SideLayoutFraming(
        sideFrac: sideFrac,
        shiftX: deckLeft * 0.5 - viewW * 0.5,
        dolly: max(1.0, archFraction / (sideFrac * 0.92))
    )
}

public func isCompactViewport(viewW: Double, viewH: Double) -> Bool {
    viewW <= 700.0 || (viewW > viewH && viewH <= 520.0)
}

public func shouldShowVirtualThumbPad(
    pointerSteerEnabled: Bool,
    compactViewport: Bool
) -> Bool {
    _ = compactViewport
    return !pointerSteerEnabled
}

public func formatZipPromptText(
    inZipRange: Bool,
    compactViewport: Bool,
    desktopReadyText: String = "Press E / Right-Click / Tap Floss to Zip!"
) -> String {
    if compactViewport {
        return inZipRange ? "🧵 Tap to Zip!" : "🦷 Closer to Zip"
    }
    return inZipRange ? desktopReadyText : "🦷 Narrow Alley — Move Closer to Zip"
}

public func compactToastText(_ msg: String, compactViewport: Bool) -> String {
    guard compactViewport, !msg.isEmpty else { return msg }
    var out = msg
    let replacements: [(String, String, NSRegularExpression.Options)] = [
        ("\\s*\\(or WASD \\+ Space\\)", "", [.caseInsensitive]),
        ("Press Q\\s*/\\s*tap Surge", "Tap Surge", [.caseInsensitive]),
        ("E\\s*/\\s*🧵 Floss", "🧵 Floss", []),
        ("\\s*\\[[A-Z]\\]", "", []),
        ("\\s*\\([EQ]\\)", "", []),
        ("\\s{2,}", " ", []),
    ]
    for (pattern, rep, opts) in replacements {
        if let regex = try? NSRegularExpression(pattern: pattern, options: opts) {
            let range = NSRange(out.startIndex..<out.endIndex, in: out)
            out = regex.stringByReplacingMatches(in: out, options: [], range: range, withTemplate: rep)
        }
    }
    return out.trimmingCharacters(in: .whitespacesAndNewlines)
}

public struct RecommendedDiveChoice: Equatable, Sendable {
    public var worldId: String
    public var stageNumber: Int?

    public init(worldId: String, stageNumber: Int?) {
        self.worldId = worldId
        self.stageNumber = stageNumber
    }
}

public func isCampaignWorldUnlocked(
    worldId: String,
    worlds: [String: WorldRecord],
    totalBrushStamps: Int = 0,
    unlockStampsRequired: Int = Int.max,
    campaignWorldIds: [String] = ["world_1", "world_2", "world_3", "world_4", "world_5"]
) -> Bool {
    if worldId == "world_1" { return true }
    if let rec = worlds[worldId], rec.unlocked || rec.completed { return true }
    if totalBrushStamps >= unlockStampsRequired { return true }
    if let idx = campaignWorldIds.firstIndex(of: worldId), idx > 0 {
        let prevId = campaignWorldIds[idx - 1]
        if worlds[prevId]?.completed == true { return true }
    }
    return false
}

public func pickRecommendedDiveWorld(
    completedWorlds: [String: WorldRecord],
    homeWorldId: String,
    campaignWorldIds: [String] = ["world_1", "world_2", "world_3", "world_4", "world_5"]
) -> RecommendedDiveChoice {
    for (i, id) in campaignWorldIds.enumerated() {
        if completedWorlds[id]?.completed != true &&
            isCampaignWorldUnlocked(
                worldId: id,
                worlds: completedWorlds,
                totalBrushStamps: 0,
                unlockStampsRequired: Int.max,
                campaignWorldIds: campaignWorldIds
            ) {
            return RecommendedDiveChoice(worldId: id, stageNumber: i + 1)
        }
    }
    let homeUnlocked = isCampaignWorldUnlocked(
        worldId: homeWorldId,
        worlds: completedWorlds,
        totalBrushStamps: 0,
        unlockStampsRequired: Int.max,
        campaignWorldIds: campaignWorldIds
    )
    return RecommendedDiveChoice(
        worldId: homeUnlocked ? homeWorldId : (campaignWorldIds.first ?? "world_1"),
        stageNumber: nil
    )
}

public func countAffordableLockedUpgrades(
    fluorideIons: Int,
    unlockedIds: [String],
    catalog: [UpgradeDef]
) -> Int {
    let unlocked = Set(unlockedIds)
    var count = 0
    for item in catalog where !unlocked.contains(item.id) && fluorideIons >= item.ionCost {
        count += 1
    }
    return count
}

public func shouldDismissSheetSwipe(deltaY: Double, elapsedMs: Double) -> Bool {
    if deltaY >= 56.0 { return true }
    if deltaY >= 28.0 && elapsedMs > 0 && deltaY / elapsedMs >= 0.45 { return true }
    return false
}
