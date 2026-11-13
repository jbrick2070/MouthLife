import Foundation

public struct ZipCandidate: Equatable, Sendable {
    public var zip: ProbeZipState
    public var alley: InterdentalAlleyDef

    public init(zip: ProbeZipState, alley: InterdentalAlleyDef) {
        self.zip = zip
        self.alley = alley
    }
}

public struct ZipMouthHint: Equatable, Sendable {
    public var alley: InterdentalAlleyDef
    public var entry: Vec2
    public var exit: Vec2
    public var distToEntry: Double
    /// True when HYDRA-1 is already inside `flossZipEntryDist` and a Floss fire would zip.
    public var inZipRange: Bool
    /// True when the alley is narrower than the HYDRA-1 hull (`width < probeRadius * 2`), i.e. blocked to walking.
    public var blockedToWalking: Bool

    public init(
        alley: InterdentalAlleyDef,
        entry: Vec2,
        exit: Vec2,
        distToEntry: Double,
        inZipRange: Bool,
        blockedToWalking: Bool
    ) {
        self.alley = alley
        self.entry = entry
        self.exit = exit
        self.distToEntry = distToEntry
        self.inZipRange = inZipRange
        self.blockedToWalking = blockedToWalking
    }
}

public func sampleHillsHeight(hills: [HillDef], x: Double, z: Double) -> Double {
    var y = 0.25
    for h in hills {
        let dx = x - h.cx
        let dz = z - h.cz
        let dSq = dx * dx + dz * dz
        let rSq = h.radius * h.radius
        if dSq < rSq && rSq > 0 {
            let t = 1.0 - dSq / rSq
            y += h.height * t * t
        }
    }
    return y
}

public func sampleTerrainHeight(x: Double, z: Double, cartridge: WorldCartridge) -> Double {
    sampleHillsHeight(hills: cartridge.heightCuspHills, x: x, z: z)
}

public func sampleTerrainHeight(cartridge: WorldCartridge, x: Double, z: Double) -> Double {
    sampleHillsHeight(hills: cartridge.heightCuspHills, x: x, z: z)
}

/// Single-source derivation of flanking collision AABB walls from `interdentalAlleys`.
/// Supports axis-aligned north-south or east-west interproximal alleys.
public func buildAlleyWalls(_ alleys: [InterdentalAlleyDef]) -> [AABB2D] {
    var result: [AABB2D] = []
    for alley in alleys {
        let dx = abs(alley.endpointB.x - alley.endpointA.x)
        let dz = abs(alley.endpointB.z - alley.endpointA.z)
        let halfGap = alley.width * 0.5
        let thick = alley.wallThickness

        if dz >= dx {
            // North-South alley centered around X
            let cx = (alley.endpointA.x + alley.endpointB.x) * 0.5
            let minZ = min(alley.endpointA.z, alley.endpointB.z) + GameConfig.probeRadius * 0.85
            let maxZ = max(alley.endpointA.z, alley.endpointB.z) - GameConfig.probeRadius * 0.85
            if maxZ > minZ {
                result.append(
                    AABB2D(
                        minX: cx - halfGap - thick,
                        minZ: minZ,
                        maxX: cx - halfGap,
                        maxZ: maxZ
                    )
                )
                result.append(
                    AABB2D(
                        minX: cx + halfGap,
                        minZ: minZ,
                        maxX: cx + halfGap + thick,
                        maxZ: maxZ
                    )
                )
            }
        } else {
            // East-West alley centered around Z
            let cz = (alley.endpointA.z + alley.endpointB.z) * 0.5
            let minX = min(alley.endpointA.x, alley.endpointB.x) + GameConfig.probeRadius * 0.85
            let maxX = max(alley.endpointA.x, alley.endpointB.x) - GameConfig.probeRadius * 0.85
            if maxX > minX {
                result.append(
                    AABB2D(
                        minX: minX,
                        minZ: cz - halfGap - thick,
                        maxX: maxX,
                        maxZ: cz - halfGap
                    )
                )
                result.append(
                    AABB2D(
                        minX: minX,
                        minZ: cz + halfGap,
                        maxX: maxX,
                        maxZ: cz + halfGap + thick
                    )
                )
            }
        }
    }
    return result
}

public func buildAlleyWalls(_ cartridge: WorldCartridge) -> [AABB2D] {
    buildAlleyWalls(cartridge.interdentalAlleys)
}

public func circleIntersectsAABB(
    cx: Double,
    cz: Double,
    radius: Double,
    box: AABB2D
) -> Bool {
    let closestX = max(box.minX, min(cx, box.maxX))
    let closestZ = max(box.minZ, min(cz, box.maxZ))
    let dx = cx - closestX
    let dz = cz - closestZ
    return dx * dx + dz * dz < radius * radius - 1e-7
}

public func resolveCircleCollisions(
    pos: Vec2,
    radius: Double,
    worldWidth: Double,
    worldDepth: Double,
    walls: [AABB2D]
) -> Vec2 {
    var x = max(radius + 0.5, min(worldWidth - radius - 0.5, pos.x))
    var z = max(radius + 0.5, min(worldDepth - radius - 0.5, pos.z))
    let rSq = radius * radius

    for _ in 0..<3 {
        for box in walls {
            let closestX = max(box.minX, min(x, box.maxX))
            let closestZ = max(box.minZ, min(z, box.maxZ))
            let dx = x - closestX
            let dz = z - closestZ
            let distSq = dx * dx + dz * dz

            if distSq < rSq {
                if distSq > 1e-8 {
                    let dist = sqrt(distSq)
                    let push = radius - dist
                    x += (dx / dist) * push
                    z += (dz / dist) * push
                } else {
                    // Center inside AABB: push out via nearest edge
                    let penLeft = abs(x - box.minX)
                    let penRight = abs(box.maxX - x)
                    let penTop = abs(z - box.minZ)
                    let penBottom = abs(box.maxZ - z)
                    let minPen = min(penLeft, penRight, penTop, penBottom)
                    if minPen == penLeft {
                        x = box.minX - radius
                    } else if minPen == penRight {
                        x = box.maxX + radius
                    } else if minPen == penTop {
                        z = box.minZ - radius
                    } else {
                        z = box.maxZ + radius
                    }
                }
            }
        }
    }

    x = max(radius + 0.5, min(worldWidth - radius - 0.5, x))
    z = max(radius + 0.5, min(worldDepth - radius - 0.5, z))
    return Vec2(x: x, z: z)
}

/// Small steps let the circle follow the rounded ends of ridges without crossing a wall.
public func moveCircleWithSlide(
    pos: Vec2,
    delta: Vec2,
    radius: Double,
    worldWidth: Double,
    worldDepth: Double,
    walls: [AABB2D]
) -> Vec2 {
    let stepDenom = max(1e-4, radius * 0.12)
    let steps = max(1, Int(ceil(hypot(delta.x, delta.z) / stepDenom)))
    let dx = delta.x / Double(steps)
    let dz = delta.z / Double(steps)
    var next = pos
    for _ in 0..<steps {
        next = resolveCircleCollisions(
            pos: Vec2(x: next.x + dx, z: next.z + dz),
            radius: radius,
            worldWidth: worldWidth,
            worldDepth: worldDepth,
            walls: walls
        )
    }
    return next
}

public func tryStartCapillaryZip(
    probePos: Vec2,
    aimDir: Vec2,
    alleys: [InterdentalAlleyDef],
    allWalls: [AABB2D],
    maxAngleRad: Double = GameConfig.flossZipMaxAngleRad,
    entryDist: Double = GameConfig.flossZipEntryDist
) -> ZipCandidate? {
    let aimLen = hypot(aimDir.x, aimDir.z)
    guard aimLen >= 1e-5 else { return nil }
    let ax = aimDir.x / aimLen
    let az = aimDir.z / aimLen
    let cosLimit = cos(maxAngleRad)

    var best: ZipCandidate? = nil
    var bestDist = Double.infinity

    for alley in alleys {
        let pairs: [(Vec2, Vec2)] = [
            (alley.endpointA, alley.endpointB),
            (alley.endpointB, alley.endpointA),
        ]
        for (startEp, endEp) in pairs {
            let distToEntry = hypot(probePos.x - startEp.x, probePos.z - startEp.z)
            if distToEntry > entryDist || distToEntry >= bestDist { continue }

            let distToExit = hypot(probePos.x - endEp.x, probePos.z - endEp.z)
            if distToExit < distToEntry { continue }

            let vx = endEp.x - startEp.x
            let vz = endEp.z - startEp.z
            let vLen = hypot(vx, vz)
            if vLen < 1e-5 { continue }

            let dot = (vx / vLen) * ax + (vz / vLen) * az
            if dot < cosLimit { continue }

            // Confirm destination circle is clear of solid walls
            let blocked = allWalls.contains { w in
                circleIntersectsAABB(
                    cx: endEp.x,
                    cz: endEp.z,
                    radius: GameConfig.probeRadius * 0.95,
                    box: w
                )
            }
            if blocked { continue }

            bestDist = distToEntry
            best = ZipCandidate(
                zip: ProbeZipState(
                    from: probePos,
                    to: endEp,
                    elapsed: 0,
                    duration: GameConfig.flossZipDurationSec
                ),
                alley: alley
            )
        }
    }

    return best
}

/// Finds the nearest interdental alley mouth around HYDRA-1 for the contextual Zip prompt & 3D reticle.
/// Only reports mouths whose far exit is clear of solid walls.
public func findNearestZipMouth(
    probePos: Vec2,
    alleys: [InterdentalAlleyDef],
    solidWalls: [AABB2D],
    maxDist: Double = GameConfig.zipPromptRadius
) -> ZipMouthHint? {
    var best: ZipMouthHint? = nil
    for alley in alleys {
        let pairs: [(Vec2, Vec2)] = [
            (alley.endpointA, alley.endpointB),
            (alley.endpointB, alley.endpointA),
        ]
        for (entry, exit) in pairs {
            let d = hypot(probePos.x - entry.x, probePos.z - entry.z)
            if d > maxDist { continue }
            let dExit = hypot(probePos.x - exit.x, probePos.z - exit.z)
            if dExit < d { continue }
            if let currentBest = best, d >= currentBest.distToEntry { continue }
            let blockedExit = solidWalls.contains { w in
                circleIntersectsAABB(
                    cx: exit.x,
                    cz: exit.z,
                    radius: GameConfig.probeRadius * 0.95,
                    box: w
                )
            }
            if blockedExit { continue }
            best = ZipMouthHint(
                alley: alley,
                entry: entry,
                exit: exit,
                distToEntry: d,
                inZipRange: d <= GameConfig.flossZipEntryDist,
                blockedToWalking: alley.width < GameConfig.probeRadius * 2.0
            )
        }
    }
    return best
}

public func stepCapillaryZip(
    _ zip: inout ProbeZipState,
    dt: Double
) -> (pos: Vec2, done: Bool) {
    zip.elapsed = min(zip.duration, zip.elapsed + dt)
    let u = zip.duration > 0 ? zip.elapsed / zip.duration : 1.0
    // Cubic ease-in-out
    let ease: Double
    if u < 0.5 {
        ease = 4.0 * u * u * u
    } else {
        ease = 1.0 - pow(-2.0 * u + 2.0, 3.0) / 2.0
    }
    let pos = Vec2(
        x: zip.from.x + (zip.to.x - zip.from.x) * ease,
        z: zip.from.z + (zip.to.z - zip.from.z) * ease
    )
    let done = zip.elapsed >= zip.duration - 1e-6
    return (pos: pos, done: done)
}

public func stepCapillaryZip(
    zip: ProbeZipState,
    dt: Double
) -> (zip: ProbeZipState, pos: Vec2, done: Bool) {
    var mutable = zip
    let res = stepCapillaryZip(&mutable, dt: dt)
    return (zip: mutable, pos: res.pos, done: res.done)
}

private func ccw(
    ax: Double,
    az: Double,
    bx: Double,
    bz: Double,
    cx: Double,
    cz: Double
) -> Double {
    (cz - az) * (bx - ax) - (bz - az) * (cx - ax)
}

public func segmentsIntersect2D(
    _ a0: Vec2,
    _ a1: Vec2,
    _ b0: Vec2,
    _ b1: Vec2
) -> Bool {
    let d1 = ccw(ax: b0.x, az: b0.z, bx: b1.x, bz: b1.z, cx: a0.x, cz: a0.z)
    let d2 = ccw(ax: b0.x, az: b0.z, bx: b1.x, bz: b1.z, cx: a1.x, cz: a1.z)
    let d3 = ccw(ax: a0.x, az: a0.z, bx: a1.x, bz: a1.z, cx: b0.x, cz: b0.z)
    let d4 = ccw(ax: a0.x, az: a0.z, bx: a1.x, bz: a1.z, cx: b1.x, cz: b1.z)
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

public enum CollisionSystem {
    public static func sampleTerrainHeight(x: Double, z: Double, cartridge: WorldCartridge) -> Double {
        MouthLifeCore.sampleTerrainHeight(x: x, z: z, cartridge: cartridge)
    }

    public static func sampleHillsHeight(hills: [HillDef], x: Double, z: Double) -> Double {
        MouthLifeCore.sampleHillsHeight(hills: hills, x: x, z: z)
    }

    public static func buildAlleyWalls(_ cartridge: WorldCartridge) -> [AABB2D] {
        MouthLifeCore.buildAlleyWalls(cartridge)
    }

    public static func buildAlleyWalls(_ alleys: [InterdentalAlleyDef]) -> [AABB2D] {
        MouthLifeCore.buildAlleyWalls(alleys)
    }

    public static func circleIntersectsAABB(cx: Double, cz: Double, radius: Double, box: AABB2D) -> Bool {
        MouthLifeCore.circleIntersectsAABB(cx: cx, cz: cz, radius: radius, box: box)
    }

    public static func resolveCircleCollisions(
        pos: Vec2,
        radius: Double,
        worldWidth: Double,
        worldDepth: Double,
        walls: [AABB2D]
    ) -> Vec2 {
        MouthLifeCore.resolveCircleCollisions(
            pos: pos,
            radius: radius,
            worldWidth: worldWidth,
            worldDepth: worldDepth,
            walls: walls
        )
    }

    public static func moveCircleWithSlide(
        pos: Vec2,
        delta: Vec2,
        radius: Double,
        worldWidth: Double,
        worldDepth: Double,
        walls: [AABB2D]
    ) -> Vec2 {
        MouthLifeCore.moveCircleWithSlide(
            pos: pos,
            delta: delta,
            radius: radius,
            worldWidth: worldWidth,
            worldDepth: worldDepth,
            walls: walls
        )
    }

    public static func tryStartCapillaryZip(
        probePos: Vec2,
        aimDir: Vec2,
        alleys: [InterdentalAlleyDef],
        allWalls: [AABB2D],
        maxAngleRad: Double = GameConfig.flossZipMaxAngleRad,
        entryDist: Double = GameConfig.flossZipEntryDist
    ) -> ZipCandidate? {
        MouthLifeCore.tryStartCapillaryZip(
            probePos: probePos,
            aimDir: aimDir,
            alleys: alleys,
            allWalls: allWalls,
            maxAngleRad: maxAngleRad,
            entryDist: entryDist
        )
    }

    public static func findNearestZipMouth(
        probePos: Vec2,
        alleys: [InterdentalAlleyDef],
        solidWalls: [AABB2D],
        maxDist: Double = GameConfig.zipPromptRadius
    ) -> ZipMouthHint? {
        MouthLifeCore.findNearestZipMouth(
            probePos: probePos,
            alleys: alleys,
            solidWalls: solidWalls,
            maxDist: maxDist
        )
    }

    public static func stepCapillaryZip(
        _ zip: inout ProbeZipState,
        dt: Double
    ) -> (pos: Vec2, done: Bool) {
        MouthLifeCore.stepCapillaryZip(&zip, dt: dt)
    }

    public static func segmentsIntersect2D(_ a0: Vec2, _ a1: Vec2, _ b0: Vec2, _ b1: Vec2) -> Bool {
        MouthLifeCore.segmentsIntersect2D(a0, a1, b0, b1)
    }
}
