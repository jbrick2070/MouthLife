import Foundation

// The city finale in 3D: where everything stands in the world, how the camera moves, and the shapes
// both editions build (the Golden Molar's crown and roots, the crystal mountain), as pure functions.
//
// This is the Swift half of src/config/finale3d.ts, which explains each part. The show's timing and
// its 2D layout stay in CityFinale.swift; this lifts them into a world with depth. CitySkylineArt
// (generated from the web) carries the web's checksum of everything here and the tests compare.
//
// Units: world units, y up, the camera looks toward -z. The skyline's drawing units are world units.

public enum Finale3D {
    public typealias Vec3 = SIMD3<Double>

    static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double { v < lo ? lo : (v > hi ? hi : v) }
    static func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double { a + (b - a) * t }
    static func easeInCubic(_ x: Double) -> Double {
        let u = clamp(x, 0, 1)
        return u * u * u
    }
    static func backOut(_ x: Double) -> Double {
        let u = clamp(x, 0, 1) - 1
        return 1 + 2.7 * u * u * u + 1.7 * u * u
    }

    // MARK: - Placing things in the world

    /// The skyline bends round the viewer on a circle this big, so its ends sit further back.
    public static let skylineBendRadius = 70.0
    /// Each drawing line stands this much in front of the one before it (a cut-paper relief).
    public static let reliefStep = 0.018
    /// How deep each cut-out piece is.
    public static let reliefDepth = 0.22

    /// A skyline point (drawing units, x 0..64) in the world, `order` lines from the back.
    public static func skylineWorld(_ x: Double, _ y: Double, _ order: Int, back: Double = 0) -> Vec3 {
        let a = (x - 32) / skylineBendRadius
        let z = Double(order) * reliefStep - back
        return Vec3(sin(a) * (skylineBendRadius + z), y, (cos(a) - 1) * skylineBendRadius + z * cos(a))
    }

    /// The skyline's facing at a point: the angle it is turned about the vertical axis.
    public static func skylineAngle(_ x: Double) -> Double { (x - 32) / skylineBendRadius }

    /// The stage in front of the city: the 2D stage units of CityFinale on an upright plane.
    public static let stageOrigin = Vec3(0, 9, 10)
    public static let stageUnit = 5.5

    public static func stageWorld(_ u: Double, _ v: Double, _ depth: Double = 0) -> Vec3 {
        Vec3(stageOrigin.x + u * stageUnit, stageOrigin.y + v * stageUnit, stageOrigin.z + depth)
    }

    /// Where a firework bursts: over its spot in the skyline, some in front of the city, some behind.
    public static func burstWorld(_ burst: FinaleBurst, _ b: Int) -> Vec3 {
        let p = skylineWorld(burst.x, burst.y, 0)
        return Vec3(p.x, p.y, p.z - 3 + 6 * CityFinale.hash(b, 77))
    }

    /// Where each city's sign blooms: high over the middle of the city.
    public static let emblemCenter = Vec3(0, 15, 2)
    public static let emblemUnit = 3.4

    // MARK: - The camera

    public struct CameraShot: Equatable, Sendable {
        public let pos: Vec3
        public let target: Vec3
        /// Vertical field of view in degrees for a 16:9 view (renderers widen it on tall screens).
        public let fov: Double
    }

    /// The camera's path: time, position, target, fov. A Catmull-Rom curve runs through them.
    public static let cameraKeys: [(t: Double, pos: Vec3, target: Vec3, fov: Double)] = [
        (0.0, Vec3(0, 30, 70), Vec3(0, 4, 0), 48),
        (1.0, Vec3(-8, 20, 52), Vec3(-10, 5, 0), 48),
        (2.5, Vec3(-30, 6, 24), Vec3(-24, 6, 0), 46),
        (7.0, Vec3(26, 7, 22), Vec3(28, 6, 0), 46),
        (8.0, Vec3(6, 8, 46), Vec3(0, 11, 0), 48),
        (10.5, Vec3(-18, 7, 42), Vec3(0, 12, 0), 48),
        (13.0, Vec3(12, 8, 43), Vec3(0, 12, 0), 48),
        (14.0, Vec3(0, 10, 32), Vec3(0, 15, 2), 50),
        (16.5, Vec3(0, 12, 30), Vec3(0, 12, 6), 46),
        (18.0, Vec3(3, 11.5, 21), Vec3(0, 10.4, 10), 42),
        (19.5, Vec3(-4, 10.5, 22), Vec3(0, 9.8, 10), 44),
        (21.0, Vec3(5, 11, 23), Vec3(0, 9, 10), 44),
        (22.0, Vec3(0, 10, 31), Vec3(0, 9, 10), 46),
        (24.0, Vec3(-7, 9.5, 31), Vec3(0, 8.5, 10), 46),
        (26.0, Vec3(6, 12.5, 31), Vec3(0, 10.5, 10), 46),
        (28.0, Vec3(0, 12, 32), Vec3(0, 11, 10), 46),
        (30.0, Vec3(0, 9, 31), Vec3(0, 22, 10), 50),
    ]

    /// With Reduce Motion the camera holds still and simply cuts between three framings.
    static let stillShots: [(at: Double, shot: CameraShot)] = [
        (0, CameraShot(pos: Vec3(0, 9, 46), target: Vec3(0, 11, 0), fov: 48)),
        (CityFinale.showEnd, CameraShot(pos: Vec3(0, 10, 32), target: Vec3(0, 15, 2), fov: 50)),
        (CityFinale.gatherEnd, CameraShot(pos: Vec3(0, 10, 25), target: Vec3(0, 9.5, 10), fov: 46)),
    ]

    /// One coordinate of the camera between keys 1 and 2: a Hermite curve whose speed at each key is
    /// taken over the time either side of it, so the camera glides through keys without stopping.
    static func glide(_ p: (Double, Double, Double, Double), _ t: (Double, Double, Double, Double), first: Bool, last: Bool, _ s: Double) -> Double {
        let dt = t.2 - t.1
        let m1 = first ? 0 : ((p.2 - p.0) / (t.2 - t.0)) * dt
        let m2 = last ? 0 : ((p.3 - p.1) / (t.3 - t.1)) * dt
        let s2 = s * s
        let s3 = s2 * s
        return (2 * s3 - 3 * s2 + 1) * p.1 + (s3 - 2 * s2 + s) * m1 + (3 * s2 - 2 * s3) * p.2 + (s3 - s2) * m2
    }

    public static func finaleCamera(_ t: Double, reducedMotion: Bool) -> CameraShot {
        if reducedMotion {
            var shot = stillShots[0].shot
            for s in stillShots where t >= s.at { shot = s.shot }
            return shot
        }
        let keys = cameraKeys
        let last = keys.count - 1
        if t <= keys[0].t { return CameraShot(pos: keys[0].pos, target: keys[0].target, fov: keys[0].fov) }
        if t >= keys[last].t { return CameraShot(pos: keys[last].pos, target: keys[last].target, fov: keys[last].fov) }
        var i = 0
        while i < last - 1 && t >= keys[i + 1].t { i += 1 }
        let k0 = keys[max(0, i - 1)]
        let k1 = keys[i]
        let k2 = keys[i + 1]
        let k3 = keys[min(last, i + 2)]
        let s = (t - k1.t) / (k2.t - k1.t)
        let first = i == 0
        let end = i + 1 == last
        let times = (k0.t, k1.t, k2.t, k3.t)
        var pos = Vec3(0, 0, 0)
        var target = Vec3(0, 0, 0)
        for c in 0..<3 {
            pos[c] = glide((k0.pos[c], k1.pos[c], k2.pos[c], k3.pos[c]), times, first: first, last: end, s)
            target[c] = glide((k0.target[c], k1.target[c], k2.target[c], k3.target[c]), times, first: first, last: end, s)
        }
        return CameraShot(pos: pos, target: target, fov: lerp(k1.fov, k2.fov, CityFinale.smooth01(s)))
    }

    /// The grand finale's camera: in close on the molar as it assembles, round it as it snaps, a slow
    /// orbit of each city during its credit, then back to the finished molar.
    public static func endingCamera(_ t: Double, reducedMotion: Bool) -> CameraShot {
        typealias E = CityFinale.Ending
        let m = stageOrigin
        if t < E.creditsStart || t >= E.finaleStart {
            let local = t < E.creditsStart ? t : t - E.finaleStart
            let a = reducedMotion ? 0 : (t < E.creditsStart ? max(0, local - E.snap) * 0.12 : sin(local * 0.35) * 0.32)
            let r = t < E.creditsStart ? lerp(15, 13, CityFinale.smooth01(local / E.snap)) : 15
            // looking a little below the molar's middle, so it sits above the words at the bottom
            return CameraShot(
                pos: Vec3(m.x + sin(a) * r, m.y + 0.2, m.z + cos(a) * r),
                target: Vec3(m.x, m.y - 1.2, m.z),
                fov: 46
            )
        }
        let local = t - E.creditsStart
        let within = clamp(local - floor(local / E.creditSeconds) * E.creditSeconds, 0, E.creditSeconds)
        let a = reducedMotion ? 0 : -0.35 + (0.7 * within) / E.creditSeconds
        return CameraShot(pos: Vec3(sin(a) * 46, 9, cos(a) * 46), target: Vec3(0, 10, 0), fov: 48)
    }

    // MARK: - 3D fireworks, each spark splitting once

    static func shape3D(_ kind: FinaleBurstKind) -> (sparks: Int, radius: Double, gravity: Double, life: Double, split: Double, children: Int, childRadius: Double) {
        switch kind {
        case .peony: return (40, 7.0, 1.1, 1.9, 0.55, 5, 1.8)
        case .ring: return (34, 8.0, 0.8, 1.7, 0.6, 4, 1.5)
        case .willow: return (28, 6.2, 2.2, 2.7, 0.5, 6, 1.9)
        }
    }

    static let goldenAngle = 2.399963229728653

    public struct Spark3D: Equatable, Sendable {
        public let x: Double
        public let y: Double
        public let z: Double
        /// 0 = burst's first colour, 1 = its second.
        public let mix: Double
        public let alpha: Double
        /// 0 for a first spark, 1 for one of the smaller sparks it split into.
        public let gen: Int
    }

    static func sparkDirection(_ kind: FinaleBurstKind, _ i: Int, _ n: Int, _ b: Int) -> Vec3 {
        if kind == .ring {
            let a = (Double.pi * 2 * Double(i)) / Double(n)
            let tilt = (CityFinale.hash(b, 91) - 0.5) * 1.2
            let x = cos(a)
            let y = sin(a)
            return Vec3(x, y * cos(tilt), y * sin(tilt))
        }
        let y = 1 - (2 * (Double(i) + 0.5)) / Double(n)
        let r = sqrt(max(0, 1 - y * y))
        let phi = Double(i) * goldenAngle + CityFinale.hash(b, 92) * Double.pi * 2
        return Vec3(r * cos(phi), y, r * sin(phi))
    }

    /// Burst `b` `showT` seconds into the show, round `center`. At `split` of its life every spark
    /// bursts again into a few smaller sparks: a firework made of fireworks.
    public static func burstSparks(_ burst: FinaleBurst, _ b: Int, showT: Double, show: FinaleShow, center: Vec3, scale: Double = 1) -> [Spark3D] {
        let shape = shape3D(burst.kind)
        let delay = show == .meteors ? 0 : 0.9
        let age = showT - burst.t - delay
        if age < 0 || age >= shape.life { return [] }
        let gravity = show == .meteors ? 0 : shape.gravity
        let splitAt = shape.split * shape.life
        var out: [Spark3D] = []
        func reach(_ speed: Double, _ a: Double, _ radius: Double) -> Double { radius * speed * (1 - exp(-3.2 * a)) * scale }
        for i in 0..<shape.sparks {
            let d = sparkDirection(burst.kind, i, shape.sparks, b)
            let speed = burst.kind == .ring ? 1 : 0.6 + 0.4 * CityFinale.hash(i, b * 7 + 2)
            let a = min(age, splitAt)
            let dist = reach(speed, a, shape.radius)
            let drop = gravity * a * a * scale
            let px = center.x + d.x * dist
            let py = center.y + d.y * dist - drop
            let pz = center.z + d.z * dist
            if age < splitAt {
                let fade = 1 - (age / shape.life) * 0.4
                out.append(Spark3D(x: px, y: py, z: pz, mix: clamp(age / splitAt, 0, 1) * 0.5, alpha: fade, gen: 0))
                continue
            }
            // the split: a small burst from where the spark had got to
            let ca = age - splitAt
            let cl = shape.life - splitAt
            let fade = 1 - (ca / cl) * (ca / cl)
            for c in 0..<shape.children {
                let cd = sparkDirection(.peony, c, shape.children, b * 31 + i)
                let cdist = reach(1, ca, shape.childRadius)
                let cdrop = gravity * (a + ca) * (a + ca) * scale - drop
                out.append(Spark3D(
                    x: px + cd.x * cdist,
                    y: py + cd.y * cdist - cdrop,
                    z: pz + cd.z * cdist,
                    mix: 0.5 + 0.5 * clamp(ca / cl, 0, 1),
                    alpha: fade,
                    gen: 1
                ))
            }
        }
        return out
    }

    // MARK: - Each city's sign, as a fractal of itself

    public struct EmblemInstance: Equatable, Sendable {
        public let x: Double
        public let y: Double
        public let z: Double
        /// Turn in the sign's own plane (radians).
        public let roll: Double
        /// Turn about the vertical axis (radians): the fractal revolves in 3D.
        public let yaw: Double
        public let scale: Double
        public let alpha: Double
        /// 0 for the sign itself, 1, 2, ... for each smaller copy.
        public let level: Int
    }

    public struct FractalNode: Equatable, Sendable {
        public let x: Double
        public let y: Double
        public let z: Double
        public let roll: Double
        public let scale: Double
        public let level: Int
    }

    /// The fractal's resting shape, in emblem units round its centre: each city grows its own way
    /// (a maple tree, a rosette of fleurs-de-lis, clocks within a clock, stars on a star, a galaxy).
    public static func emblemFractalNodes(_ cityIndex: Int) -> [FractalNode] {
        var nodes: [FractalNode] = []
        if cityIndex == 4 {
            nodes.append(FractalNode(x: 0, y: 0, z: 0, roll: 0, scale: 1, level: 0))
            for k in 1...144 {
                let r = 0.55 * sqrt(Double(k))
                let a = Double(k) * goldenAngle
                nodes.append(FractalNode(
                    x: r * cos(a),
                    y: r * sin(a) * 0.62,
                    z: r * sin(a) * 0.35,
                    roll: a,
                    scale: 0.2 * (1 - Double(k) / 220),
                    level: 1 + k / 48
                ))
            }
            return nodes
        }
        typealias Rule = (children: Int, spread: Double, dist: Double, shrink: Double, levels: Int, ring: Bool, start: Double, startScale: Double)
        let rules: [Rule] = [
            (3, 0.78, 1.25, 0.56, 4, false, -1.6, 1.1),
            (6, 0, 1.55, 0.4, 4, true, 0, 1),
            (12, 0, 1.35, 0.24, 3, true, 0, 1),
            (5, 0, 1.15, 0.42, 4, true, 0, 1),
        ]
        let rule: Rule = cityIndex >= 0 && cityIndex < rules.count ? rules[cityIndex] : (5, 0, 1.15, 0.42, 3, true, 0, 1)
        func grow(_ n: FractalNode) {
            nodes.append(n)
            if n.level + 1 >= rule.levels { return }
            for c in 0..<rule.children {
                let angle = rule.ring
                    ? n.roll + Double.pi / 2 + (Double.pi * 2 * Double(c)) / Double(rule.children) + (cityIndex == 2 ? 0 : Double(n.level) * 0.4)
                    : n.roll + Double.pi / 2 + (Double(c) - Double(rule.children - 1) / 2) * rule.spread
                let d = rule.dist * n.scale
                grow(FractalNode(
                    x: n.x + cos(angle) * d,
                    y: n.y + sin(angle) * d,
                    z: n.z + (n.level % 2 == 0 ? 0.12 : -0.12) * n.scale,
                    roll: angle - Double.pi / 2,
                    scale: n.scale * rule.shrink,
                    level: n.level + 1
                ))
            }
        }
        grow(FractalNode(x: 0, y: rule.start, z: 0, roll: 0, scale: rule.startScale, level: 0))
        return nodes
    }

    nonisolated(unsafe) private static var nodeCache: [Int: [FractalNode]] = [:]
    private static let nodeCacheLock = NSLock()

    static func cachedNodes(_ cityIndex: Int) -> [FractalNode] {
        nodeCacheLock.lock()
        defer { nodeCacheLock.unlock() }
        if let n = nodeCache[cityIndex] { return n }
        let n = emblemFractalNodes(cityIndex)
        nodeCache[cityIndex] = n
        return n
    }

    /// Where the coin forms after the sparks gather (world units).
    public static func coinFormWorld() -> Vec3 { stageWorld(0, 0.42, 0.4) }

    /// The fractal sign at time t: the levels pop out one after another from the emblem burst, the
    /// whole thing revolves, then everything folds into the coin.
    public static func emblemFractal(_ cityIndex: Int, _ t: Double, reducedMotion: Bool) -> [EmblemInstance] {
        typealias T = CityFinale
        let gatherDone = T.emblemEnd + 0.6 * (T.gatherEnd - T.emblemEnd)
        if t < T.emblemBurst || t >= gatherDone { return [] }
        let nodes = cachedNodes(cityIndex)
        let c = emblemCenter
        let u = emblemUnit
        let spin = reducedMotion ? 0 : (t - T.emblemBurst) * 0.9
        let coin = coinFormWorld()
        var out: [EmblemInstance] = []
        for (i, n) in nodes.enumerated() {
            let appearAt = T.emblemBurst + (reducedMotion ? 0.3 : 0.18 * Double(n.level) + 0.08 * CityFinale.hash(i, 61))
            let grow = reducedMotion ? CityFinale.smooth01((t - appearAt) / 0.4) : backOut((t - appearAt) / 0.35)
            if grow <= 0 { continue }
            let cs = cos(spin)
            let sn = sin(spin)
            // turned by +spin about the vertical, as each copy is (yaw): one sculpture revolving
            // a hair of depth each, so overlapping copies never flicker against each other
            let nz = n.z + (CityFinale.hash(i, 63) - 0.5) * 0.03
            var x = c.x + (n.x * cs + nz * sn) * u
            var y = c.y + n.y * u
            var z = c.z + (nz * cs - n.x * sn) * u
            var scale = n.scale * u * grow
            var alpha = reducedMotion ? grow : 1
            if t >= T.emblemEnd {
                let g = (t - T.emblemEnd) / (gatherDone - T.emblemEnd)
                if reducedMotion {
                    alpha *= 1 - CityFinale.smooth01(g)
                } else {
                    let e = easeInCubic(g + 0.15 * CityFinale.hash(i, 62) * (1 - g))
                    x = lerp(x, coin.x, e)
                    y = lerp(y, coin.y, e)
                    z = lerp(z, coin.z, e)
                    scale *= 1 - e
                }
            }
            let gear = cityIndex == 2 && !reducedMotion ? (n.level % 2 == 0 ? 1 : -1.6) * (t - T.emblemBurst) * 1.4 : 0
            out.append(EmblemInstance(x: x, y: y, z: z, roll: n.roll + gear, yaw: spin, scale: scale, alpha: alpha, level: n.level))
        }
        return out
    }

    // MARK: - The Golden Molar's crown, as a mesh

    public struct MeshData: Sendable {
        public var positions: [Double] = []
        public var normals: [Double] = []
        public var indices: [Int] = []
    }

    static func smoothMin(_ a: Double, _ b: Double, _ k: Double) -> Double {
        let h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1)
        return lerp(b, a, h) - k * h * (1 - h)
    }

    /// Signed distance (molar units) to the crown's outline: negative inside.
    public static func molarOutlineDistance(_ x: Double, _ y: Double) -> Double {
        let c = CityFinale.Molar.core
        let cx = c.x + c.w / 2
        let cy = c.y + c.h / 2
        let qx = abs(x - cx) - (c.w / 2 - c.r)
        let qy = abs(y - cy) - (c.h / 2 - c.r)
        var d = hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - c.r
        for p in CityFinale.Molar.cusps { d = smoothMin(d, hypot(x - p.x, y - p.y) - CityFinale.Molar.lobeRadius, 0.16) }
        return d
    }

    /// The crown's height above its rim at a point inside the outline: five low cusps, grooves between.
    public static func molarHeight(_ x: Double, _ y: Double) -> Double {
        var h = 0.0
        for p in CityFinale.Molar.cusps {
            let d = hypot(x - p.x, y - p.y) / 0.5
            if d < 1 { h = max(h, 0.17 * (1 - d * d)) }
        }
        var groove = Double.infinity
        let g = CityFinale.Molar.groove
        for i in 0..<(g.count - 1) {
            let ax = g[i].x
            let ay = g[i].y
            let bx = g[i + 1].x - ax
            let by = g[i + 1].y - ay
            let s = clamp(((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by), 0, 1)
            groove = min(groove, hypot(x - ax - bx * s, y - ay - by * s))
        }
        return 0.16 + h - 0.05 * exp(-(groove / 0.06) * (groove / 0.06))
    }

    /// How far the outline is from the crown's middle in direction `a` (molar units).
    public static func molarOutlineRadius(_ a: Double) -> Double {
        let o = CityFinale.Molar.bodyCenter
        var lo = 0.0
        var hi = 2.5
        for _ in 0..<28 {
            let mid = (lo + hi) / 2
            if molarOutlineDistance(o.x + cos(a) * mid, o.y + sin(a) * mid) < 0 { lo = mid } else { hi = mid }
        }
        return (lo + hi) / 2
    }

    static func pushNormals(_ mesh: inout MeshData) {
        let p = mesh.positions
        var n = [Double](repeating: 0, count: p.count)
        let idx = mesh.indices
        var i = 0
        while i < idx.count {
            let a = idx[i] * 3
            let b = idx[i + 1] * 3
            let c = idx[i + 2] * 3
            let ux = p[b] - p[a]
            let uy = p[b + 1] - p[a + 1]
            let uz = p[b + 2] - p[a + 2]
            let vx = p[c] - p[a]
            let vy = p[c + 1] - p[a + 1]
            let vz = p[c + 2] - p[a + 2]
            let nx = uy * vz - uz * vy
            let ny = uz * vx - ux * vz
            let nz = ux * vy - uy * vx
            for k in [a, b, c] {
                n[k] += nx
                n[k + 1] += ny
                n[k + 2] += nz
            }
            i += 3
        }
        var j = 0
        while j < n.count {
            let len = hypot(hypot(n[j], n[j + 1]), n[j + 2])
            let l = len == 0 ? 1 : len
            n[j] /= l
            n[j + 1] /= l
            n[j + 2] /= l
            j += 3
        }
        mesh.normals = n
    }

    /// The Golden Molar's crown as a closed mesh in molar units: x, y across the chewing surface, z up
    /// out of it. The top follows the cusps and grooves; the sides narrow toward the roots.
    public static func goldenMolarMesh(segments: Int = 72, rings: Int = 14) -> MeshData {
        var mesh = MeshData()
        let o = CityFinale.Molar.bodyCenter
        var radii: [Double] = []
        for s in 0..<segments { radii.append(molarOutlineRadius((Double.pi * 2 * Double(s)) / Double(segments))) }
        // top: one middle vertex, then rings out to the rim
        mesh.positions += [o.x, o.y, molarHeight(o.x, o.y)]
        for r in 1...rings {
            let f = Double(r) / Double(rings)
            for s in 0..<segments {
                let a = (Double.pi * 2 * Double(s)) / Double(segments)
                let rr = radii[s] * f
                let x = o.x + cos(a) * rr
                let y = o.y + sin(a) * rr
                let edge = CityFinale.smooth01((1 - f) / 0.14)
                mesh.positions += [x, y, molarHeight(x, y) * edge + (1 - edge) * 0.05]
            }
        }
        let sideSteps: [(down: Double, out: Double)] = [(0.12, 1.02), (0.3, 1.0), (0.52, 0.9), (0.74, 0.74)]
        for step in sideSteps {
            for s in 0..<segments {
                let a = (Double.pi * 2 * Double(s)) / Double(segments)
                let rr = radii[s] * step.out
                mesh.positions += [o.x + cos(a) * rr, o.y + sin(a) * rr, 0.05 - step.down]
            }
        }
        let rowCount = rings + sideSteps.count
        for s in 0..<segments { mesh.indices += [0, 1 + s, 1 + (s + 1) % segments] }
        for row in 0..<(rowCount - 1) {
            for s in 0..<segments {
                let a = 1 + row * segments + s
                let b = 1 + row * segments + (s + 1) % segments
                let c = 1 + (row + 1) * segments + s
                let d = 1 + (row + 1) * segments + (s + 1) % segments
                mesh.indices += [a, c, b, b, c, d]
            }
        }
        // the flat bottom gets its own copy of the lowest ring, so the sides keep a crisp edge
        let lastRow = 1 + (rowCount - 1) * segments
        let capRow = mesh.positions.count / 3
        for s in 0..<segments {
            let k = (lastRow + s) * 3
            mesh.positions += [mesh.positions[k], mesh.positions[k + 1], mesh.positions[k + 2]]
        }
        let centreBottom = mesh.positions.count / 3
        mesh.positions += [o.x, o.y, 0.05 - 0.74]
        for s in 0..<segments { mesh.indices += [centreBottom, capRow + (s + 1) % segments, capRow + s] }
        pushNormals(&mesh)
        return mesh
    }

    /// Where a cusp's top is on the crown (molar units), for setting a coin into it.
    public static func molarCuspTop(_ index: Int) -> Vec3 {
        let p = CityFinale.Molar.cusps[Int(clamp(Double(index), 0, Double(CityFinale.campaignPieces - 1)))]
        return Vec3(p.x, p.y, molarHeight(p.x, p.y))
    }

    /// One of the molar's two roots (side -1 or 1) in molar units: a tube that leaves the underside of
    /// the crown, bows outward and tapers to a rounded tip.
    public static func molarRootMesh(side: Double, segments: Int = 18, rings: Int = 12) -> MeshData {
        var mesh = MeshData()
        let o = CityFinale.Molar.bodyCenter
        let s: Double = side < 0 ? -1 : 1
        let p0 = Vec3(o.x + s * 0.32, o.y, -0.5)
        let p1 = Vec3(o.x + s * 0.62, o.y, -1.05)
        let p2 = Vec3(o.x + s * 0.4, o.y, -1.62)
        for r in 0...rings {
            let u = Double(r) / Double(rings)
            let a = (1 - u) * (1 - u)
            let b = 2 * (1 - u) * u
            let c = u * u
            let cx = a * p0.x + b * p1.x + c * p2.x
            let cy = a * p0.y + b * p1.y + c * p2.y
            let cz = a * p0.z + b * p1.z + c * p2.z
            let radius = lerp(0.36, 0.05, pow(u, 1.4)) * (r == rings ? 0.2 : 1)
            for k in 0..<segments {
                let t = (Double.pi * 2 * Double(k)) / Double(segments)
                mesh.positions += [cx + cos(t) * radius, cy + sin(t) * radius * 0.8, cz]
            }
        }
        let tip = mesh.positions.count / 3
        mesh.positions += [p2.x, p2.y, p2.z - 0.04]
        for r in 0..<rings {
            for k in 0..<segments {
                let a = r * segments + k
                let b = r * segments + (k + 1) % segments
                let c = (r + 1) * segments + k
                let d = (r + 1) * segments + (k + 1) % segments
                mesh.indices += [a, c, b, b, c, d]
            }
        }
        let last = rings * segments
        for k in 0..<segments { mesh.indices += [last + k, tip, last + (k + 1) % segments] }
        pushNormals(&mesh)
        return mesh
    }

    // MARK: - The mountain: a spire of crystal columns

    /// Smooth value noise from the shared hash, 0..1.
    static func valueNoise(_ x: Double, _ y: Double, _ seed: Int) -> Double {
        let ix = floor(x)
        let iy = floor(y)
        let fx = x - ix
        let fy = y - iy
        let ux = fx * fx * (3 - 2 * fx)
        let uy = fy * fy * (3 - 2 * fy)
        func h(_ a: Double, _ b: Double) -> Double { CityFinale.hash(Int(a) * 73 + seed, Int(b) * 151 + seed * 7) }
        return lerp(lerp(h(ix, iy), h(ix + 1, iy), ux), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), ux), uy)
    }

    /// Ridged noise: sharp crests where the value noise folds over, three octaves.
    static func ridged(_ x: Double, _ y: Double) -> Double {
        var sum = 0.0
        var amp = 0.5
        var f = 1.0
        for o in 0..<3 {
            sum += amp * (1 - abs(valueNoise(x * f, y * f, o + 1) * 2 - 1))
            f *= 2.1
            amp *= 0.5
        }
        return sum
    }

    /// The mountain's height above the stage floor (stage units) and how far out its foot reaches.
    public static let mountainPeakY = 0.5
    public static let mountainFootY = -1.1
    public static let mountainFootRadius = 1.45
    public static let mountainDepthScale = 0.7

    /// The mountain's radius at a height (stage units) in direction `a`, ridged so it looks like rock.
    public static func mountainRadius(_ y: Double, _ a: Double) -> Double {
        let f = clamp((y - mountainFootY) / (mountainPeakY - mountainFootY), 0, 1)
        let base = mountainFootRadius * pow(1 - f, 0.85)
        // sampled round a circle, so the ridges join up where the angle wraps
        return base * (0.86 + 0.28 * ridged(cos(a) * 1.6, sin(a) * 1.6 + f * 3.2))
    }

    /// How far in front of the stage plane the mountain's face is at stage point (u, v).
    public static func mountainFront(_ u: Double, _ v: Double) -> Double {
        // the radius depends on the direction, which depends on the depth: settle it in a few steps
        var a = Double.pi / 2
        var z = 0.0
        for _ in 0..<4 {
            let r = mountainRadius(v, a)
            z = sqrt(max(0, r * r - u * u))
            a = atan2(z, u)
        }
        return z * mountainDepthScale
    }

    /// One hexagonal crystal column of the mountain (stage units): its middle, top and width.
    public struct MountainColumn: Equatable, Sendable {
        public let x: Double
        public let z: Double
        public let top: Double
        public let radius: Double
        /// 0 at the foot, 1 at the peak: renderers colour by it.
        public let height: Double
    }

    /// The mountain's column spacing (stage units): enamel is made of hexagonal rods like these.
    public static let mountainColumnStep = 0.1

    /// The mountain as hexagonal crystal columns on a hex grid, each rising to the mountain's height
    /// where it stands, a little lower or higher at random, so the slopes step like a staircase.
    public static func mountainColumns() -> [MountainColumn] {
        var out: [MountainColumn] = []
        let step = mountainColumnStep
        let reach = Int(ceil((mountainFootRadius * 1.2) / step))
        let span = mountainPeakY - mountainFootY
        for row in -reach...reach {
            for col in -reach...reach {
                let x = (Double(col) + ((row & 1) != 0 ? 0.5 : 0)) * step
                let z = Double(row) * step * 0.866
                let a = atan2(z / mountainDepthScale, x)
                let rho = hypot(x, z / mountainDepthScale)
                if rho > mountainRadius(mountainFootY, a) { continue }
                var lo = mountainFootY
                var hi = mountainPeakY
                for _ in 0..<18 {
                    let mid = (lo + hi) / 2
                    if mountainRadius(mid, a) > rho { lo = mid } else { hi = mid }
                }
                let jitter = (CityFinale.hash(row + 40, col + 40) - 0.5) * 0.05
                let top = min(mountainPeakY, lo + jitter)
                out.append(MountainColumn(x: x, z: z, top: top, radius: step * 0.56, height: clamp((top - mountainFootY) / span, 0, 1)))
            }
        }
        return out
    }

    /// A ledge (or the foot, or the summit) on the mountain's face, in stage units with depth.
    public static func ledge(_ index: Int) -> Vec3 {
        let p = index < 0
            ? CityFinale.Mountain.foot
            : (index >= CityFinale.campaignPieces ? CityFinale.Mountain.summitStand : CityFinale.Mountain.ledges[index])
        return Vec3(p.x, p.y, mountainFront(p.x, p.y) + 0.06)
    }

    // MARK: - Parity

    static func sumMesh(_ m: MeshData) -> Double {
        var s = 0.0
        for i in 0..<m.positions.count { s += m.positions[i] * Double(i % 3 + 1) * 0.01 }
        for v in m.normals { s += v * 0.003 }
        var i = 0
        while i < m.indices.count {
            s += Double(m.indices[i]) * 0.0001
            i += 7
        }
        return s
    }

    /// One number over everything here, matched against the web's (CitySkylineArt.expectedFinale3D).
    public static func checksum(bursts: [FinaleBurst], show: FinaleShow, cityIndex: Int) -> Double {
        var sum = 0.0
        var t = 0.0
        while t <= CityFinale.end {
            for rm in [false, true] {
                let cam = finaleCamera(t, reducedMotion: rm)
                sum += cam.pos.x * 0.1 + cam.pos.y * 0.2 + cam.pos.z * 0.03 + cam.target.x * 0.05 + cam.target.y * 0.07 + cam.fov * 0.01
                for e in emblemFractal(cityIndex, t, reducedMotion: rm) {
                    sum += e.x * 0.01 + e.y * 0.02 + e.z * 0.03 + e.roll * 0.001 + e.scale + e.alpha
                }
            }
            let showT = t - CityFinale.blazeEnd
            for (b, burst) in bursts.enumerated() {
                for s in burstSparks(burst, b, showT: showT, show: show, center: burstWorld(burst, b)) {
                    sum += s.x * 0.003 + s.y * 0.005 + s.z * 0.007 + s.alpha + s.mix + Double(s.gen)
                }
            }
            t += 0.29
        }
        t = 0
        while t <= CityFinale.Ending.end {
            for rm in [false, true] {
                let cam = endingCamera(t, reducedMotion: rm)
                sum += cam.pos.x * 0.1 + cam.pos.y * 0.2 + cam.pos.z * 0.03 + cam.target.y * 0.07 + cam.fov * 0.01
            }
            t += 0.53
        }
        for x in [0.0, 10, 32, 50, 64] {
            let p = skylineWorld(x, 3, 12)
            sum += p.x + p.y + p.z
        }
        sum += sumMesh(goldenMolarMesh())
        sum += sumMesh(molarRootMesh(side: -1)) + sumMesh(molarRootMesh(side: 1)) * 2
        for c in mountainColumns() { sum += c.x * 0.01 + c.z * 0.02 + c.top * 0.03 + c.radius + c.height * 0.001 }
        for i in -1...CityFinale.campaignPieces {
            let l = ledge(i)
            sum += l.x + l.y * 2 + l.z * 3
        }
        for i in 0..<CityFinale.campaignPieces { sum += molarCuspTop(i).z * 10 }
        return (sum * 1000).rounded() / 1000
    }
}
