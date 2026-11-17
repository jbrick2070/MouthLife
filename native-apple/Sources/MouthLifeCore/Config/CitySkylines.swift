import Foundation

// City skylines: flat vector scenery that stands along the far edge of every stage, drawn from the
// city the stage is set in. Its lights (windows, neon, beacons) come on as the player cleans the
// district in front of them.
//
// This is the Swift half of src/config/citySkylineGeometry.ts, which documents the drawing format.
// The two must build the same triangles: CitySkylineArt (generated from the web's drawings) carries
// the web parser's counts and checksums, and the tests compare this parser against them.

public struct SkylinePiece: Equatable, Sendable {
    /// A light (window, neon, beacon) that brightens as its district gets clean.
    public let isLight: Bool
    /// 0xRRGGBB.
    public let colorHex: UInt32
    /// Paint order within its drawing: later pieces sit in front.
    public let order: Int
    /// Middle of the piece along the horizon; decides which district lights it.
    public let centerX: Double
    /// Triangles as x,y pairs: six numbers per triangle.
    public let triangles: [Double]
}

public struct CityArt: Equatable, Sendable {
    public let skyline: [SkylinePiece]
    public let prop: [SkylinePiece]
}

public enum CitySkyline {
    /// The panorama is drawn 64 units wide and centred on stages of any width.
    public static let artWidth: Double = 64

    // Where the panorama stands: just behind the far gum line, leaning back to face the camera.
    public static let baseZ: Double = 2.2
    public static let baseY: Double = -0.35
    public static let tiltRad: Double = 0.5
    /// Gap between paint layers, so later pieces win the depth test.
    public static let layerStep: Double = 0.004

    // Roadside props: how far outside the stage's left and right edges, and where along its depth.
    public static let propInsetX: Double = 0.6
    public static let propBaseY: Double = -0.45
    public static let propDepthFractions: [Double] = [0.3, 0.47, 0.64, 0.81]

    static let discSegments = 20
    static let domeSegments = 12
    static let crescentSegments = 14
    static let arcStepDeg: Double = 12
    static let starInner: Double = 0.42

    private static let deg = Double.pi / 180

    // MARK: - Shapes

    private static func rect(_ x: Double, _ y: Double, _ w: Double, _ h: Double) -> [Double] {
        [x, y, x + w, y, x + w, y + h, x, y, x + w, y + h, x, y + h]
    }

    private static func fan(_ points: [Double]) -> [Double] {
        var out: [Double] = []
        var i = 1
        while i + 1 < points.count / 2 {
            out += [points[0], points[1], points[i * 2], points[i * 2 + 1], points[i * 2 + 2], points[i * 2 + 3]]
            i += 1
        }
        return out
    }

    private static func disc(_ cx: Double, _ cy: Double, _ r: Double, sweepDeg: Double, segments: Int) -> [Double] {
        var out: [Double] = []
        for i in 0..<segments {
            let a = (sweepDeg * Double(i)) / Double(segments) * deg
            let b = (sweepDeg * Double(i + 1)) / Double(segments) * deg
            out += [cx, cy, cx + cos(a) * r, cy + sin(a) * r, cx + cos(b) * r, cy + sin(b) * r]
        }
        return out
    }

    private static func arcBand(_ cx: Double, _ cy: Double, _ r: Double, _ thick: Double, _ a0: Double, _ a1: Double) -> [Double] {
        let segments = max(2, Int((abs(a1 - a0) / arcStepDeg).rounded(.up)))
        let inner = r - thick
        var out: [Double] = []
        for i in 0..<segments {
            let a = (a0 + ((a1 - a0) * Double(i)) / Double(segments)) * deg
            let b = (a0 + ((a1 - a0) * Double(i + 1)) / Double(segments)) * deg
            let ax = cos(a), ay = sin(a), bx = cos(b), by = sin(b)
            out += [cx + ax * r, cy + ay * r, cx + bx * r, cy + by * r, cx + bx * inner, cy + by * inner]
            out += [cx + ax * r, cy + ay * r, cx + bx * inner, cy + by * inner, cx + ax * inner, cy + ay * inner]
        }
        return out
    }

    private static func thickLine(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ thick: Double) -> [Double] {
        let dx = x2 - x1
        let dy = y2 - y1
        let rawLen = hypot(dx, dy)
        let len = rawLen == 0 ? 1 : rawLen
        let nx = (-dy / len) * thick * 0.5
        let ny = (dx / len) * thick * 0.5
        return [
            x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny,
            x1 + nx, y1 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny,
        ]
    }

    private static func star(_ cx: Double, _ cy: Double, _ r: Double) -> [Double] {
        func point(_ i: Int) -> (Double, Double) {
            let a = Double(90 + i * 36) * deg
            let rr = i % 2 == 0 ? r : r * starInner
            return (cx + cos(a) * rr, cy + sin(a) * rr)
        }
        var out: [Double] = []
        for i in 0..<10 {
            let p = point(i)
            let q = point(i + 1)
            out += [cx, cy, p.0, p.1, q.0, q.1]
        }
        return out
    }

    private static func crescent(_ cx: Double, _ cy: Double, _ r: Double, _ pinch: Double, _ tiltDeg: Double) -> [Double] {
        let t = tiltDeg * deg
        let ct = cos(t)
        let st = sin(t)
        func at(_ i: Int, _ scaleX: Double) -> (Double, Double) {
            let a = (-90 + (180 * Double(i)) / Double(crescentSegments)) * deg
            let lx = cos(a) * r * scaleX
            let ly = sin(a) * r
            return (cx + lx * ct - ly * st, cy + lx * st + ly * ct)
        }
        var out: [Double] = []
        for i in 0..<crescentSegments {
            let o0 = at(i, 1)
            let o1 = at(i + 1, 1)
            let i0 = at(i, pinch)
            let i1 = at(i + 1, pinch)
            out += [o0.0, o0.1, o1.0, o1.1, i1.0, i1.1, o0.0, o0.1, i1.0, i1.1, i0.0, i0.1]
        }
        return out
    }

    /// The triangle lists one drawing line makes (a window grid makes one list per window).
    /// Empty when the line is not a known shape with the right number of values.
    private static func tessellate(op: String, n: [Double]) -> [[Double]] {
        switch (op, n.count) {
        case ("R", 4):
            return [rect(n[0], n[1], n[2], n[3])]
        case ("P", _) where n.count >= 6 && n.count % 2 == 0:
            return [fan(n)]
        case ("C", 3):
            return [disc(n[0], n[1], n[2], sweepDeg: 360, segments: discSegments)]
        case ("H", 3):
            return [disc(n[0], n[1], n[2], sweepDeg: 180, segments: domeSegments)]
        case ("A", 6):
            return [arcBand(n[0], n[1], n[2], n[3], n[4], n[5])]
        case ("L", 5):
            return [thickLine(n[0], n[1], n[2], n[3], n[4])]
        case ("W", 8):
            var out: [[Double]] = []
            for row in 0..<max(0, Int(n[3])) {
                for col in 0..<max(0, Int(n[2])) {
                    out.append(rect(n[0] + Double(col) * (n[4] + n[6]), n[1] + Double(row) * (n[5] + n[7]), n[4], n[5]))
                }
            }
            return out
        case ("S", 3):
            return [star(n[0], n[1], n[2])]
        case ("N", 5):
            return [crescent(n[0], n[1], n[2], n[3], n[4])]
        default:
            return []
        }
    }

    private static func middleX(_ tris: [Double]) -> Double {
        var lo = Double.infinity
        var hi = -Double.infinity
        var i = 0
        while i < tris.count {
            lo = min(lo, tris[i])
            hi = max(hi, tris[i])
            i += 2
        }
        return (lo + hi) * 0.5
    }

    // MARK: - Reading a drawing

    /// Reads one city's drawing. Lines it does not understand are skipped (the web tests reject them
    /// before they ever reach the app).
    public static func parse(_ text: String) -> CityArt {
        var skyline: [SkylinePiece] = []
        var prop: [SkylinePiece] = []
        var intoProp = false
        var order = 0
        for rawLine in text.split(whereSeparator: \.isNewline) {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty || line.hasPrefix(";") { continue }
            if line == "@skyline" || line == "@prop" {
                intoProp = line == "@prop"
                order = 0
                continue
            }
            let tokens = line.split(whereSeparator: { $0 == " " || $0 == "\t" }).map(String.init)
            guard tokens.count >= 3, tokens[0].count == 1, tokens[tokens.count - 1].hasPrefix("#"),
                  let color = UInt32(tokens[tokens.count - 1].dropFirst(), radix: 16)
            else { continue }
            let nums = tokens[1..<(tokens.count - 1)].compactMap { Double($0) }
            guard nums.count == tokens.count - 2 else { continue }
            let op = tokens[0].uppercased()
            let lists = tessellate(op: op, n: nums)
            if lists.isEmpty { continue }
            let isLight = tokens[0] != op
            for tris in lists {
                let piece = SkylinePiece(isLight: isLight, colorHex: color, order: order, centerX: middleX(tris), triangles: tris)
                if intoProp { prop.append(piece) } else { skyline.append(piece) }
            }
            order += 1
        }
        return CityArt(skyline: skyline, prop: prop)
    }

    /// The skyline for a host city (WorldCartridge.hostId), or nil for a host with no drawing.
    public static func art(forHost hostId: String) -> CityArt? {
        CitySkylineArt.text(forHost: hostId).map(parse)
    }

    /// One number that changes if any triangle moves; matches skylineChecksum in the web generator.
    public static func checksum(_ pieces: [SkylinePiece]) -> Double {
        var sum = 0.0
        for piece in pieces {
            var i = 0
            while i < piece.triangles.count {
                sum += piece.triangles[i] + piece.triangles[i + 1] * 1.37
                i += 2
            }
        }
        return (sum * 1000).rounded() / 1000
    }

    // MARK: - Placing it in the stage

    /// World position of a panorama point (x along the horizon, y up the drawing).
    public static func point(x: Double, y: Double, order: Int, worldWidth: Double) -> SIMD3<Double> {
        let c = cos(tiltRad)
        let s = sin(tiltRad)
        let lift = Double(order) * layerStep
        return SIMD3<Double>(
            x + (worldWidth - artWidth) * 0.5,
            baseY + y * c + lift * s,
            baseZ - y * s + lift * c
        )
    }

    /// World position of a prop point, for a prop standing at (anchorX, anchorZ).
    public static func propPoint(x: Double, y: Double, order: Int, anchorX: Double, anchorZ: Double) -> SIMD3<Double> {
        let c = cos(tiltRad)
        let s = sin(tiltRad)
        let lift = Double(order) * layerStep
        return SIMD3<Double>(anchorX + x, propBaseY + y * c + lift * s, anchorZ - y * s + lift * c)
    }

    /// Where the roadside props stand: a row down each side of the stage.
    public static func propAnchors(worldWidth: Double, worldDepth: Double) -> [Vec2] {
        var out: [Vec2] = []
        for f in propDepthFractions {
            out.append(Vec2(x: propInsetX, z: worldDepth * f))
            out.append(Vec2(x: worldWidth - propInsetX, z: worldDepth * f))
        }
        return out
    }

    /// The district a world x belongs to: the one it is inside, else the nearest.
    public static func districtIndex(districts: [DistrictDef], worldX: Double) -> Int {
        var best = 0
        var bestDist = Double.infinity
        for (i, district) in districts.enumerated() {
            let b = district.bounds
            let d = worldX < b.minX ? b.minX - worldX : (worldX > b.maxX ? worldX - b.maxX : 0)
            if d < bestDist {
                bestDist = d
                best = i
            }
        }
        return best
    }

    /// How brightly a district's lights burn (0...1): a dim glow at first, full once it is sealed.
    public static func lightLevel(cleanRatio: Double, sealed: Bool) -> Double {
        if sealed { return 1 }
        let r = max(0, min(1, cleanRatio))
        return 0.14 + 0.46 * r * r
    }
}
