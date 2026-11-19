import MouthLifeCore
import SwiftUI

// The Apple Watch faces, as plain SwiftUI with no WatchKit, so the same views run on the watch and
// render on a Mac for checking (the watch app adds the runtime, the taps and the sync).
//
// "Mirror Mouth": a big four-part mouth shows where to brush (screen-right is the brusher's right,
// as in a mirror, the same as the phone's compass), a tooth picture shows which surface, and one big
// word says it. The running face takes no taps (wet hands); one "More" button opens the controls.

// MARK: - Look

/// Purple and gold, like the owner's favourite team colours: gold and purple are easy to tell
/// apart (also for colour-blind eyes), with a soft lavender as the third surface.
public enum WatchLook {
    /// Lakers purple, and a deep purple-black for the background.
    static let purple = Color(red: 0.333, green: 0.145, blue: 0.514)
    public static let background = Color(red: 0.05, green: 0.04, blue: 0.07)
    /// Dark purple tiles and caption pills, with gold outlines (the owner's Fadester look).
    static let panel = Color(red: 0.145, green: 0.102, blue: 0.2)
    static let pill = Color(red: 0.165, green: 0.122, blue: 0.227)
    static let danger = Color(red: 0.94, green: 0.27, blue: 0.27)
    /// Lakers gold.
    static let gold = Color(red: 0.992, green: 0.725, blue: 0.153)
    static let brightPurple = Color(red: 0.76, green: 0.56, blue: 1.0)
    static let lavender = Color(red: 0.91, green: 0.85, blue: 1.0)
    static let outside = gold
    static let chewing = brightPurple
    static let inside = lavender
    static let rinse = brightPurple
    static let idle = Color(red: 0.24, green: 0.18, blue: 0.32)
    static let doneQuarter = gold.opacity(0.45)
    static let text = Color.white
    static let soft = lavender.opacity(0.75)

    static func surfaceColor(_ s: BrushSurface) -> Color {
        switch s {
        case .outerCheek: return outside
        case .chewingGrooves: return chewing
        case .innerTongue: return inside
        }
    }

    static func font(_ size: CGFloat, _ weight: Font.Weight = .heavy) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
}

// MARK: - The mouth

/// The four quarters of the mouth, drawn like the phone's mirror compass.
public struct MirrorMouth: View {
    public enum Mode: Equatable {
        /// Brushing one quarter on one surface (and these quarters already done).
        case brushing(quadrant: BrushQuadrant, surface: BrushSurface, doneMask: Int)
        /// Flossing the top or the bottom arch.
        case floss(upper: Bool)
        /// Rinsing: the whole mouth.
        case rinse
        /// All four quarters bright: a clean smile.
        case smile
    }

    let mode: Mode
    let dimmed: Bool

    public init(mode: Mode, dimmed: Bool = false) {
        self.mode = mode
        self.dimmed = dimmed
    }

    // the phone's quarter arcs (in turns of pi), screen-left = the brusher's left
    static let spans: [BrushQuadrant: (Double, Double)] = [
        .upperLeft: (1.05, 1.45), .upperRight: (1.55, 1.95), .lowerLeft: (0.95, 0.55), .lowerRight: (0.45, 0.05),
    ]

    static func arc(_ q: BrushQuadrant, in rect: CGRect, scale: Double) -> Path {
        let (a0, a1) = spans[q] ?? (1.55, 1.95)
        let cx = rect.midX
        let cy = rect.midY + (q.isUpper ? -1 : 1) * rect.height * 0.04
        let rx = rect.width * 0.42 * scale
        let ry = rect.height * 0.42 * scale
        var p = Path()
        let steps = 24
        for i in 0...steps {
            let ang = (a0 + (a1 - a0) * Double(i) / Double(steps)) * Double.pi
            let pt = CGPoint(x: cx + cos(ang) * rx, y: cy + sin(ang) * ry)
            if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        return p
    }

    public var body: some View {
        Canvas { ctx, size in
            let rect = CGRect(origin: .zero, size: size)
            let w = min(size.width, size.height)
            let core = StrokeStyle(lineWidth: w * 0.1, lineCap: .round)
            let rim = StrokeStyle(lineWidth: w * 0.035, lineCap: .round)
            for q in BrushQuadrant.allCases {
                let path = Self.arc(q, in: rect, scale: 1)
                var color = WatchLook.idle
                var glow = false
                switch mode {
                case let .brushing(active, surface, doneMask):
                    if q == active {
                        color = WatchLook.surfaceColor(surface)
                        glow = true
                        // outside: a rim outside the arch; inside: a dashed rim inside it
                        if surface == .outerCheek {
                            ctx.stroke(Self.arc(q, in: rect, scale: 1.2), with: .color(color.opacity(dimmed ? 0.7 : 0.9)), style: rim)
                        } else if surface == .innerTongue {
                            var dashed = rim
                            dashed.dash = [w * 0.05, w * 0.04]
                            ctx.stroke(Self.arc(q, in: rect, scale: 0.78), with: .color(color.opacity(dimmed ? 0.7 : 0.9)), style: dashed)
                        }
                    } else if doneMask & (1 << q.rawValue) != 0 {
                        color = WatchLook.doneQuarter
                    }
                case let .floss(upper):
                    if q.isUpper == upper {
                        color = WatchLook.gold
                        glow = true
                    }
                case .rinse:
                    color = WatchLook.rinse
                    glow = true
                case .smile:
                    color = WatchLook.gold
                    glow = true
                }
                if dimmed {
                    // Always On: crisp outlines, no glow
                    ctx.stroke(path, with: .color(glow ? color.opacity(0.85) : WatchLook.idle), style: core)
                } else {
                    if glow {
                        var halo = ctx
                        halo.addFilter(.blur(radius: w * 0.04))
                        halo.stroke(path, with: .color(color.opacity(0.55)), style: core)
                    }
                    ctx.stroke(path, with: .color(color), style: core)
                }
            }
            if mode == .smile {
                // a clean mouth smiles: a big curve and two little cheeks of sparkle
                var smile = Path()
                smile.addArc(center: CGPoint(x: rect.midX, y: rect.midY - rect.height * 0.08), radius: w * 0.2, startAngle: .degrees(25), endAngle: .degrees(155), clockwise: false)
                ctx.stroke(smile, with: .color(dimmed ? .white : WatchLook.lavender), style: StrokeStyle(lineWidth: w * 0.07, lineCap: .round))
                for side in [-1.0, 1.0] {
                    let dot = CGRect(x: rect.midX + side * w * 0.17 - w * 0.035, y: rect.midY - rect.height * 0.16, width: w * 0.07, height: w * 0.07)
                    ctx.fill(Path(ellipseIn: dot), with: .color(dimmed ? .white : WatchLook.text))
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// The whole mouth from above, like a dental chart tipped slightly toward the viewer: the upper and
/// the lower jaw (with a gap between their back teeth), seven teeth in each quarter shaped like real
/// ones (two front teeth, a canine, two premolars, two molars) and the tongue. Screen-right is the
/// brusher's right (as in a mirror, like the phone's compass).
///
/// The quarter being brushed lights its own teeth: "outside" adds a gold line along the cheek side,
/// "inside" a dashed line along the tongue side, "chewing" the grooves on top. Floss puts a gold
/// thread in every gap of the arch being flossed. Quarters already brushed get a gold outline. In
/// Always On everything is drawn as outlines, the marks included.
///
/// A camera can move in close on the quarter being brushed (or the arch being flossed), so its teeth
/// fill the face, and pull back to the whole mouth: `zoom` runs from 0 (whole) to 1 (close) and
/// animates.
public struct MouthMap: View, Animatable {
    public enum Mode: Equatable {
        case brushing(quadrant: BrushQuadrant, surface: BrushSurface, doneMask: Int)
        case floss(upper: Bool)
        case rinse
        case clean
    }

    /// What the camera moves in on. (Floss and rinse keep the whole mouth: an arch is too wide to
    /// come closer without losing its back teeth.)
    public enum Focus: Equatable {
        case whole
        case quarter(BrushQuadrant)
    }

    let mode: Mode
    let dimmed: Bool
    let focus: Focus
    var zoom: Double

    public var animatableData: Double {
        get { zoom }
        set { zoom = newValue }
    }

    public init(mode: Mode, dimmed: Bool = false, focus: Focus = .whole, zoom: Double = 0) {
        self.mode = mode
        self.dimmed = dimmed
        self.focus = focus
        self.zoom = zoom
    }

    /// The camera, from the mouth's own drawing to the view: the whole mouth at zoom 0, close on the
    /// focus at zoom 1 (its teeth with room for the side marks and the pacer dot). Close up, the view
    /// stays inside the mouth's frame, so its edge is never empty.
    public static func camera(_ focus: Focus, zoom: Double, size: CGSize) -> CGAffineTransform {
        guard zoom > 0.0005, size.width > 1, size.height > 1 else { return .identity }
        guard case let .quarter(q) = focus else { return .identity }
        let u = min(size.width, size.height * 1.15)
        var box = CGRect.null
        for t in teeth(q, in: size, unit: u) { box = box.union(outline(t).boundingRect) }
        box = box.insetBy(dx: -u * 0.07, dy: -u * 0.07)
        let close = min(2.4, max(1, min(size.width / box.width, size.height / box.height)))
        let halfW = size.width / (2 * close), halfH = size.height / (2 * close)
        let fx = min(max(box.midX, halfW), size.width - halfW)
        let fy = min(max(box.midY, halfH), size.height - halfH)
        let k = 1 + (close - 1) * zoom
        let cx = size.width / 2 + (fx - size.width / 2) * zoom
        let cy = size.height / 2 + (fy - size.height / 2) * zoom
        return CGAffineTransform(translationX: size.width / 2, y: size.height / 2)
            .scaledBy(x: k, y: k)
            .translatedBy(x: -cx, y: -cy)
    }

    static let teethPerQuarter = 7
    /// Each tooth's length along the arch (front to back) and its depth toward the tongue (times its
    /// length): flat front teeth, a canine, two oval premolars, two broad molars.
    static let lengths: [Double] = [1.0, 0.85, 0.9, 0.95, 0.95, 1.3, 1.3]
    static let depths: [Double] = [0.55, 0.6, 0.8, 0.9, 0.9, 0.95, 0.95]

    /// Where a quarter sits on its arch: the angle range (radians, screen space) from the middle front
    /// to the back molar.
    static func angles(_ q: BrushQuadrant) -> (front: Double, back: Double) {
        switch q {
        case .upperRight: return (1.5 * .pi, 2.0 * .pi)
        case .upperLeft: return (1.5 * .pi, 1.0 * .pi)
        case .lowerLeft: return (0.5 * .pi, 1.0 * .pi)
        case .lowerRight: return (0.5 * .pi, 0.0)
        }
    }

    /// One jaw: the line along the cheek side of its teeth.
    struct Arch {
        let cx: Double
        let cy: Double
        let rx: Double
        let ry: Double
        func point(_ a: Double, out d: Double = 0) -> CGPoint {
            let n = normal(a)
            return CGPoint(x: cx + cos(a) * rx + n.dx * d, y: cy + sin(a) * ry + n.dy * d)
        }
        /// Toward the cheek, as a unit vector.
        func normal(_ a: Double) -> CGVector {
            let nx = ry * cos(a), ny = rx * sin(a)
            let l = max(1e-9, (nx * nx + ny * ny).squareRoot())
            return CGVector(dx: nx / l, dy: ny / l)
        }
    }

    /// A tooth: its middle on the cheek-side line, which way the arch runs there, and its size.
    struct Tooth {
        let index: Int
        let edge: CGPoint
        let along: CGVector
        let inward: CGVector
        let length: Double
        let depth: Double
        /// A point in the tooth's own frame: x along the arch (toward the back), y in toward the tongue.
        func at(_ x: Double, _ y: Double) -> CGPoint {
            CGPoint(x: edge.x + along.dx * x + inward.dx * y, y: edge.y + along.dy * x + inward.dy * y)
        }
        var frame: CGAffineTransform {
            CGAffineTransform(a: along.dx, b: along.dy, c: inward.dx, d: inward.dy, tx: edge.x, ty: edge.y)
        }
    }

    /// The two jaws, the upper a touch wider, with a clear gap between their back teeth.
    static func arch(_ upper: Bool, in size: CGSize, unit u: Double) -> Arch {
        let half = u * 0.03
        return Arch(cx: size.width / 2, cy: size.height / 2 + (upper ? -half : half), rx: size.width * (upper ? 0.44 : 0.42), ry: size.height * 0.4)
    }

    /// The seven teeth of a quarter, placed by distance along the arch so the gaps are even.
    static func teeth(_ q: BrushQuadrant, in size: CGSize, unit u: Double) -> [Tooth] {
        let arch = arch(q.isUpper, in: size, unit: u)
        let (front, back) = angles(q)
        let n = 48
        var pts: [CGPoint] = []
        for k in 0...n { pts.append(arch.point(front + (back - front) * Double(k) / Double(n))) }
        var acc: [Double] = [0]
        for k in 1...n {
            let dx = pts[k].x - pts[k - 1].x, dy = pts[k].y - pts[k - 1].y
            acc.append(acc[k - 1] + (dx * dx + dy * dy).squareRoot())
        }
        let gap = max(0.8, u * 0.009)
        let scale = (acc[n] - gap * (Double(teethPerQuarter) - 0.5)) / lengths.reduce(0, +)
        let dir: Double = back > front ? 1 : -1
        var s = gap / 2
        var out: [Tooth] = []
        for i in 0..<teethPerQuarter {
            let len = lengths[i] * scale
            let mid = s + len / 2
            s += len + gap
            var k = 1
            while k < n && acc[k] < mid { k += 1 }
            let f = (mid - acc[k - 1]) / max(1e-9, acc[k] - acc[k - 1])
            let a = front + (back - front) * (Double(k - 1) + f) / Double(n)
            let nrm = arch.normal(a)
            var t = CGVector(dx: -sin(a) * arch.rx * dir, dy: cos(a) * arch.ry * dir)
            let tl = max(1e-9, (t.dx * t.dx + t.dy * t.dy).squareRoot())
            t = CGVector(dx: t.dx / tl, dy: t.dy / tl)
            out.append(Tooth(index: i, edge: arch.point(a), along: t, inward: CGVector(dx: -nrm.dx, dy: -nrm.dy), length: len, depth: len * depths[i]))
        }
        return out
    }

    /// The tooth's outline: flat front teeth, a softly pointed canine, oval premolars, square-ish molars.
    static func outline(_ t: Tooth) -> Path {
        let l = t.length, d = t.depth
        let r = CGRect(x: -l / 2, y: 0, width: l, height: d)
        var p: Path
        switch t.index {
        case 0, 1:
            p = Path(roundedRect: r, cornerRadius: min(l, d) * 0.4)
        case 2:
            p = Path()
            p.move(to: CGPoint(x: 0, y: 0))
            p.addQuadCurve(to: CGPoint(x: l / 2, y: d * 0.6), control: CGPoint(x: l * 0.42, y: d * 0.05))
            p.addQuadCurve(to: CGPoint(x: 0, y: d), control: CGPoint(x: l * 0.5, y: d))
            p.addQuadCurve(to: CGPoint(x: -l / 2, y: d * 0.6), control: CGPoint(x: -l * 0.5, y: d))
            p.addQuadCurve(to: CGPoint(x: 0, y: 0), control: CGPoint(x: -l * 0.42, y: d * 0.05))
            p.closeSubpath()
        case 3, 4:
            p = Path(ellipseIn: r)
        default:
            p = Path(roundedRect: r, cornerRadius: min(l, d) * 0.3)
        }
        return p.applying(t.frame)
    }

    /// A smooth line through points (curves through the midpoints).
    static func smooth(_ pts: [CGPoint]) -> Path {
        var p = Path()
        guard let first = pts.first else { return p }
        p.move(to: first)
        if pts.count < 3 {
            pts.dropFirst().forEach { p.addLine(to: $0) }
            return p
        }
        for i in 1..<(pts.count - 1) {
            let mid = CGPoint(x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2)
            p.addQuadCurve(to: i == pts.count - 2 ? pts[i + 1] : mid, control: pts[i])
        }
        return p
    }

    // colours of the teeth
    static let idleFill = Color(red: 0.36, green: 0.28, blue: 0.5)
    static let idleLine = Color(red: 0.58, green: 0.48, blue: 0.74)
    static let tongue = Color(red: 0.9, green: 0.45, blue: 0.66)

    public var body: some View {
        Canvas { ctx, size in
            ctx.concatenate(Self.camera(focus, zoom: zoom, size: size))
            let u = min(size.width, size.height * 1.15)
            if !dimmed { drawTongue(&ctx, size: size, u: u) }
            for q in BrushQuadrant.allCases {
                drawQuarter(q, ctx: &ctx, size: size, u: u)
            }
        }
        .accessibilityHidden(true)
    }

    /// The tongue: a broad base toward the throat, a rounded tip just behind the lower front teeth.
    private func drawTongue(_ ctx: inout GraphicsContext, size: CGSize, u: Double) {
        let lower = Self.arch(false, in: size, unit: u)
        let frontDepth = Self.teeth(.lowerRight, in: size, unit: u)[0].depth
        let tipY = lower.cy + lower.ry - frontDepth - max(2, u * 0.02)
        let baseY = lower.cy + lower.ry * 0.3
        let bw = lower.rx * 0.38
        let rise = tipY - baseY
        var p = Path()
        p.move(to: CGPoint(x: lower.cx - bw, y: baseY))
        p.addCurve(to: CGPoint(x: lower.cx, y: tipY), control1: CGPoint(x: lower.cx - bw, y: tipY - rise * 0.2), control2: CGPoint(x: lower.cx - bw * 0.6, y: tipY))
        p.addCurve(to: CGPoint(x: lower.cx + bw, y: baseY), control1: CGPoint(x: lower.cx + bw * 0.6, y: tipY), control2: CGPoint(x: lower.cx + bw, y: tipY - rise * 0.2))
        p.addQuadCurve(to: CGPoint(x: lower.cx - bw, y: baseY), control: CGPoint(x: lower.cx, y: baseY - rise * 0.35))
        p.closeSubpath()
        ctx.fill(p, with: .color(Self.tongue.opacity(0.4)))
        var groove = Path()
        groove.move(to: CGPoint(x: lower.cx, y: baseY + rise * 0.05))
        groove.addLine(to: CGPoint(x: lower.cx, y: tipY - rise * 0.35))
        ctx.stroke(groove, with: .color(Self.tongue.opacity(0.5)), style: StrokeStyle(lineWidth: max(1, u * 0.009), lineCap: .round))
    }

    private func drawQuarter(_ q: BrushQuadrant, ctx: inout GraphicsContext, size: CGSize, u: Double) {
        let arch = Self.arch(q.isUpper, in: size, unit: u)
        let teeth = Self.teeth(q, in: size, unit: u)
        let (front, back) = Self.angles(q)
        let thin = max(1, u * 0.009)
        let mark = max(1.3, u * 0.013)

        var fill = Self.idleFill
        var line = Self.idleLine
        var lineWidth = thin
        var lit = false
        var done = false
        var surface: BrushSurface?
        var floss = false
        switch mode {
        case let .brushing(active, s, doneMask):
            if q == active {
                fill = WatchLook.surfaceColor(s)
                line = fill
                lineWidth = mark
                lit = true
                surface = s
            } else if doneMask & (1 << q.rawValue) != 0 {
                done = true
            }
        case let .floss(upper):
            if q.isUpper == upper {
                fill = Color(red: 0.56, green: 0.46, blue: 0.74)
                floss = true
            } else {
                fill = Self.idleFill.opacity(0.55)
            }
        case .rinse:
            fill = WatchLook.rinse.opacity(0.75)
            line = WatchLook.rinse
            lit = true
        case .clean:
            fill = WatchLook.gold
            line = fill
            lit = true
        }

        // outside: a solid gold line just off the cheek side of the teeth
        if surface == .outerCheek {
            let off = max(1.2, u * 0.013) + mark
            var band = Path()
            for k in 0...24 {
                let p = arch.point(front + (back - front) * Double(k) / 24, out: off)
                if k == 0 { band.move(to: p) } else { band.addLine(to: p) }
            }
            ctx.stroke(band, with: .color(WatchLook.outside), style: StrokeStyle(lineWidth: mark * 1.5, lineCap: .round))
        }

        // the quarter being brushed glows: two soft wide outlines (no blur, so the zoom stays smooth)
        if surface != nil && !dimmed {
            for (width, alpha) in [(u * 0.05, 0.18), (u * 0.028, 0.32)] {
                for t in teeth { ctx.stroke(Self.outline(t), with: .color(fill.opacity(alpha)), style: StrokeStyle(lineWidth: width, lineJoin: .round)) }
            }
        }

        let shadow = CGAffineTransform(translationX: 0, y: max(1, u * 0.009))
        for t in teeth {
            let path = Self.outline(t)
            if dimmed {
                // Always On: only the quarter being brushed is bright (done quarters look idle)
                ctx.stroke(path, with: .color(line), lineWidth: lineWidth)
            } else {
                // a solid little tooth: a darker edge below for thickness, a light top
                ctx.fill(path.applying(shadow), with: .color(.black.opacity(0.45)))
                ctx.fill(path, with: .color(fill))
                let b = path.boundingRect
                ctx.fill(path, with: .linearGradient(
                    Gradient(colors: [.white.opacity(lit ? 0.5 : 0.14), .clear]),
                    startPoint: CGPoint(x: b.midX, y: b.minY),
                    endPoint: CGPoint(x: b.midX, y: b.maxY)
                ))
                if done { ctx.stroke(path, with: .color(WatchLook.gold.opacity(0.9)), lineWidth: thin) }
            }
            if surface == .chewingGrooves { drawGroove(t, ctx: &ctx, u: u) }
        }

        // inside: a dashed line along the tongue side of the teeth
        if surface == .innerTongue {
            let off = max(1.2, u * 0.013) + mark / 2
            var pts = [teeth[0].at(-teeth[0].length / 2, teeth[0].depth + off)]
            pts += teeth.map { $0.at(0, $0.depth + off) }
            pts.append(teeth[teeth.count - 1].at(teeth[teeth.count - 1].length / 2, teeth[teeth.count - 1].depth + off))
            var style = StrokeStyle(lineWidth: mark, lineCap: .butt)
            style.dash = [max(2.5, u * 0.026), max(1.7, u * 0.017)]
            ctx.stroke(Self.smooth(pts), with: .color(WatchLook.inside), style: style)
        }

        // floss: a gold thread in every gap (the middle one is drawn by the right-hand quarter)
        if floss {
            let thread = StrokeStyle(lineWidth: max(1.6, u * 0.018), lineCap: .round)
            let over = max(1.5, u * 0.014)
            for i in 0..<(teeth.count - 1) {
                let a = teeth[i], b = teeth[i + 1]
                let outer = CGPoint(x: (a.at(a.length / 2, 0).x + b.at(-b.length / 2, 0).x) / 2, y: (a.at(a.length / 2, 0).y + b.at(-b.length / 2, 0).y) / 2)
                let inward = CGVector(dx: (a.inward.dx + b.inward.dx) / 2, dy: (a.inward.dy + b.inward.dy) / 2)
                let deep = (a.depth + b.depth) / 2 + over
                var g = Path()
                g.move(to: CGPoint(x: outer.x - inward.dx * over, y: outer.y - inward.dy * over))
                g.addLine(to: CGPoint(x: outer.x + inward.dx * deep, y: outer.y + inward.dy * deep))
                ctx.stroke(g, with: .color(WatchLook.gold), style: thread)
            }
            if q == .upperRight || q == .lowerRight {
                let mid = arch.point(front)
                let n = arch.normal(front)
                let deep = teeth[0].depth + over
                var g = Path()
                g.move(to: CGPoint(x: mid.x + n.dx * over, y: mid.y + n.dy * over))
                g.addLine(to: CGPoint(x: mid.x - n.dx * deep, y: mid.y - n.dy * deep))
                ctx.stroke(g, with: .color(WatchLook.gold), style: thread)
            }
        }

    }

    /// The chewing tops: a Y groove on the molars, a short groove on the premolars, a bright edge in front.
    private func drawGroove(_ t: Tooth, ctx: inout GraphicsContext, u: Double) {
        let l = t.length, d = t.depth
        let style = StrokeStyle(lineWidth: max(1, u * 0.009), lineCap: .round, lineJoin: .round)
        let color = Color.white.opacity(0.9)
        var g = Path()
        switch t.index {
        case 5, 6:
            g.move(to: t.at(-l * 0.25, d * 0.22))
            g.addLine(to: t.at(0, d * 0.5))
            g.addLine(to: t.at(l * 0.25, d * 0.22))
            g.move(to: t.at(0, d * 0.5))
            g.addLine(to: t.at(0, d * 0.8))
        case 3, 4:
            g.move(to: t.at(-l * 0.22, d * 0.5))
            g.addLine(to: t.at(l * 0.22, d * 0.5))
        default:
            ctx.stroke(Self.outline(t), with: .color(color), lineWidth: max(1, u * 0.009))
            return
        }
        ctx.stroke(g, with: .color(color), style: style)
    }
}

/// The pacer dot: it steps from tooth to tooth along the quarter being brushed, once a second, there
/// and back, on the side being brushed. It is drawn apart from the mouth, so the mouth itself is only
/// redrawn when the quarter or the surface changes. It follows the mouth's camera (and stays in place,
/// drawing nothing, while it has no step, so it moves with the camera when it comes back).
public struct MouthPacer: View, Animatable {
    let quadrant: BrushQuadrant
    let surface: BrushSurface
    let step: Int?
    let focus: MouthMap.Focus
    var zoom: Double

    public var animatableData: Double {
        get { zoom }
        set { zoom = newValue }
    }

    public init(quadrant: BrushQuadrant, surface: BrushSurface, step: Int?, focus: MouthMap.Focus = .whole, zoom: Double = 0) {
        self.quadrant = quadrant
        self.surface = surface
        self.step = step
        self.focus = focus
        self.zoom = zoom
    }

    public var body: some View {
        Canvas { ctx, size in
            guard let step else { return }
            ctx.concatenate(MouthMap.camera(focus, zoom: zoom, size: size))
            let u = min(size.width, size.height * 1.15)
            let teeth = MouthMap.teeth(quadrant, in: size, unit: u)
            guard teeth.indices.contains(step) else { return }
            let t = teeth[step]
            let mark = max(1.3, u * 0.013)
            let off = max(1.2, u * 0.013)
            let y: Double
            switch surface {
            case .outerCheek: y = -(off + mark)
            case .innerTongue: y = t.depth + off + mark / 2
            case .chewingGrooves: y = t.depth / 2
            }
            let c = t.at(0, y)
            let r = max(2.5, u * 0.026)
            let dot = Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
            // a soft light around it, so the eye finds it at arm's length
            let glow = r * 1.9
            ctx.fill(Path(ellipseIn: CGRect(x: c.x - glow, y: c.y - glow, width: glow * 2, height: glow * 2)), with: .color(.white.opacity(0.22)))
            // white on the gold outside line, gold elsewhere; a dark rim so it never melts into a tooth
            ctx.fill(dot, with: .color(surface == .outerCheek ? .white : WatchLook.gold))
            ctx.stroke(dot, with: .color(WatchLook.background), lineWidth: max(1.2, u * 0.013))
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// On each new quarter the mouth gives a quick nod toward it (10 degrees and back to flat in 0.6 s,
/// with the tap on the wrist), so it is flat and sharp whenever the child looks.
struct QuarterNod: ViewModifier {
    let key: Int
    let axis: (x: CGFloat, y: CGFloat, z: CGFloat)
    let enabled: Bool

    func body(content: Content) -> some View {
        if enabled {
            content.keyframeAnimator(initialValue: 0.0, trigger: key) { view, angle in
                view.rotation3DEffect(.degrees(angle), axis: axis, perspective: 0.45)
            } keyframes: { _ in
                CubicKeyframe(10, duration: 0.22)
                CubicKeyframe(0, duration: 0.38)
            }
        } else {
            content
        }
    }
}

/// One tooth, with a little brush showing the surface: outside, the chewing top, or inside.
public struct ToothPicture: View {
    let surface: BrushSurface
    let dimmed: Bool

    public init(surface: BrushSurface, dimmed: Bool = false) {
        self.surface = surface
        self.dimmed = dimmed
    }

    public var body: some View {
        Canvas { ctx, size in
            let s = min(size.width, size.height)
            let ox = (size.width - s) / 2
            let oy = (size.height - s) / 2
            func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: ox + x * s, y: oy + y * s) }
            // a molar seen from the side: crown with two cusps, two roots
            var tooth = Path()
            tooth.move(to: pt(0.27, 0.5))
            tooth.addLine(to: pt(0.27, 0.27))
            tooth.addQuadCurve(to: pt(0.4, 0.18), control: pt(0.27, 0.16))
            tooth.addQuadCurve(to: pt(0.6, 0.18), control: pt(0.5, 0.27))
            tooth.addQuadCurve(to: pt(0.73, 0.27), control: pt(0.73, 0.16))
            tooth.addLine(to: pt(0.73, 0.5))
            tooth.addQuadCurve(to: pt(0.62, 0.86), control: pt(0.72, 0.78))
            tooth.addQuadCurve(to: pt(0.5, 0.6), control: pt(0.55, 0.62))
            tooth.addQuadCurve(to: pt(0.38, 0.86), control: pt(0.45, 0.62))
            tooth.addQuadCurve(to: pt(0.27, 0.5), control: pt(0.28, 0.78))
            tooth.closeSubpath()
            let color = WatchLook.surfaceColor(surface)
            if dimmed {
                ctx.stroke(tooth, with: .color(.white), lineWidth: s * 0.04)
            } else {
                ctx.fill(tooth, with: .linearGradient(Gradient(colors: [.white, Color(red: 0.82, green: 0.86, blue: 0.9)]), startPoint: pt(0.5, 0.15), endPoint: pt(0.5, 0.9)))
            }
            // the surface being brushed glows, with bristles pointing at it
            var face = Path()
            var bristles = Path()
            switch surface {
            case .outerCheek:
                face.move(to: pt(0.27, 0.27)); face.addLine(to: pt(0.27, 0.52))
                for k in 0..<4 { let y = 0.28 + Double(k) * 0.07; bristles.move(to: pt(0.06, y)); bristles.addLine(to: pt(0.2, y)) }
            case .chewingGrooves:
                face.move(to: pt(0.3, 0.21)); face.addQuadCurve(to: pt(0.7, 0.21), control: pt(0.5, 0.3))
                for k in 0..<4 { let x = 0.33 + Double(k) * 0.11; bristles.move(to: pt(x, 0.02)); bristles.addLine(to: pt(x, 0.12)) }
            case .innerTongue:
                face.move(to: pt(0.73, 0.27)); face.addLine(to: pt(0.73, 0.52))
                for k in 0..<4 { let y = 0.28 + Double(k) * 0.07; bristles.move(to: pt(0.8, y)); bristles.addLine(to: pt(0.94, y)) }
            }
            ctx.stroke(face, with: .color(color), style: StrokeStyle(lineWidth: s * 0.08, lineCap: .round))
            ctx.stroke(bristles, with: .color(color.opacity(0.9)), style: StrokeStyle(lineWidth: s * 0.035, lineCap: .round))
        }
        .accessibilityHidden(true)
    }
}

/// A floss pick, for the floss face and the routine preview.
struct FlossPick: View {
    var body: some View {
        Canvas { ctx, size in
            let s = min(size.width, size.height)
            let o = CGPoint(x: (size.width - s) / 2, y: (size.height - s) / 2)
            func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: o.x + x * s, y: o.y + y * s) }
            var body = Path()
            body.move(to: pt(0.25, 0.2)); body.addLine(to: pt(0.25, 0.42))
            body.addQuadCurve(to: pt(0.55, 0.62), control: pt(0.25, 0.6))
            body.addLine(to: pt(0.86, 0.92))
            ctx.stroke(body, with: .color(WatchLook.brightPurple), style: StrokeStyle(lineWidth: s * 0.1, lineCap: .round, lineJoin: .round))
            var arm = Path()
            arm.move(to: pt(0.25, 0.2)); arm.addLine(to: pt(0.62, 0.2)); arm.addLine(to: pt(0.62, 0.38))
            ctx.stroke(arm, with: .color(WatchLook.brightPurple), style: StrokeStyle(lineWidth: s * 0.1, lineCap: .round, lineJoin: .round))
            var thread = Path()
            thread.move(to: pt(0.25, 0.3)); thread.addLine(to: pt(0.62, 0.3))
            ctx.stroke(thread, with: .color(.white), style: StrokeStyle(lineWidth: s * 0.035, lineCap: .round))
        }
        .accessibilityHidden(true)
    }
}

/// A cup of rinse.
struct RinseCup: View {
    var body: some View {
        Canvas { ctx, size in
            let s = min(size.width, size.height)
            let o = CGPoint(x: (size.width - s) / 2, y: (size.height - s) / 2)
            func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: o.x + x * s, y: o.y + y * s) }
            var cup = Path()
            cup.move(to: pt(0.2, 0.2)); cup.addLine(to: pt(0.8, 0.2)); cup.addLine(to: pt(0.7, 0.88)); cup.addLine(to: pt(0.3, 0.88)); cup.closeSubpath()
            ctx.fill(cup, with: .color(Color.white.opacity(0.18)))
            var liquid = Path()
            liquid.move(to: pt(0.25, 0.48)); liquid.addLine(to: pt(0.75, 0.48)); liquid.addLine(to: pt(0.7, 0.88)); liquid.addLine(to: pt(0.3, 0.88)); liquid.closeSubpath()
            ctx.fill(liquid, with: .color(WatchLook.rinse))
            ctx.stroke(cup, with: .color(.white.opacity(0.8)), lineWidth: s * 0.04)
        }
        .accessibilityHidden(true)
    }
}

/// A little toothbrush, for the routine preview.
struct Toothbrush: View {
    var body: some View {
        Canvas { ctx, size in
            let s = min(size.width, size.height)
            let o = CGPoint(x: (size.width - s) / 2, y: (size.height - s) / 2)
            func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: o.x + x * s, y: o.y + y * s) }
            var handle = Path()
            handle.move(to: pt(0.15, 0.85)); handle.addLine(to: pt(0.7, 0.3))
            ctx.stroke(handle, with: .color(WatchLook.outside), style: StrokeStyle(lineWidth: s * 0.12, lineCap: .round))
            var head = Path()
            head.move(to: pt(0.66, 0.34)); head.addLine(to: pt(0.86, 0.14))
            ctx.stroke(head, with: .color(.white), style: StrokeStyle(lineWidth: s * 0.14, lineCap: .round))
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Faces

/// What a face shows: everything comes from here, so faces are pure and easy to render for checks.
public struct WatchFaceState: Equatable {
    public var ritual: WatchRitual?
    public var language: CoachLanguage
    public var includeRinse: Bool
    public var canResume: Bool
    public var ack: WatchBrushAck?
    public var syncPending: Bool
    public var dimmed: Bool
    public var reduceMotion: Bool

    public init(ritual: WatchRitual? = nil, language: CoachLanguage = .english, includeRinse: Bool = false, canResume: Bool = false, ack: WatchBrushAck? = nil, syncPending: Bool = false, dimmed: Bool = false, reduceMotion: Bool = false) {
        self.ritual = ritual
        self.language = language
        self.includeRinse = includeRinse
        self.canResume = canResume
        self.ack = ack
        self.syncPending = syncPending
        self.dimmed = dimmed
        self.reduceMotion = reduceMotion
    }
}

func clock(_ seconds: Double) -> String {
    let s = max(0, Int(seconds.rounded(.up)))
    return String(format: "%d:%02d", s / 60, s % 60)
}

/// A big, easy button for small, wet fingers.
struct BigButton: View {
    enum Style { case gold, tile, danger }
    let title: String
    var style: Style = .gold
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(WatchLook.font(18))
                .foregroundStyle(style == .gold ? WatchLook.purple : WatchLook.text)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(style == .gold ? WatchLook.gold : style == .danger ? WatchLook.danger : WatchLook.panel)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .strokeBorder(style == .danger ? Color.white : WatchLook.gold, lineWidth: style == .gold ? 0 : 3)
                )
        }
        .buttonStyle(.plain)
    }
}

/// Ready: a smile, the big Start, and a picture of what comes next.
public struct WatchReadyFace: View {
    let state: WatchFaceState
    let onStart: () -> Void
    let onResume: () -> Void

    public init(state: WatchFaceState, onStart: @escaping () -> Void, onResume: @escaping () -> Void) {
        self.state = state
        self.onStart = onStart
        self.onResume = onResume
    }

    public var body: some View {
        GeometryReader { geo in
            // sized by the smaller of width and height, so it fits from the 40 mm watch up
            let w = min(geo.size.width, geo.size.height * 0.85)
            VStack(spacing: w * 0.03) {
                MirrorMouth(mode: .smile, dimmed: state.dimmed)
                    .frame(width: w * 0.58, height: w * 0.44)
                Text("2:00")
                    .font(WatchLook.font(w * 0.16))
                    .monospacedDigit()
                    .foregroundStyle(WatchLook.text)
                    .accessibilityLabel(WatchCopy.word(.brush, state.language) + " 2:00")
                HStack(spacing: w * 0.04) {
                    Toothbrush().frame(width: w * 0.12, height: w * 0.12)
                    Image(systemName: "chevron.right").font(.system(size: w * 0.06, weight: .bold)).foregroundStyle(WatchLook.soft)
                    FlossPick().frame(width: w * 0.12, height: w * 0.12)
                    if state.includeRinse {
                        Image(systemName: "chevron.right").font(.system(size: w * 0.06, weight: .bold)).foregroundStyle(WatchLook.soft)
                        RinseCup().frame(width: w * 0.12, height: w * 0.12)
                    }
                }
                .accessibilityHidden(true)
                if state.canResume {
                    BigButton(title: WatchCopy.word(.keepGoing, state.language), style: .tile, action: onResume)
                } else {
                    BigButton(title: WatchCopy.word(.start, state.language), action: onStart)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }
}

/// The running face: brushing, flossing or rinsing. It takes no taps except the small More button.
public struct WatchActiveFace: View {
    let state: WatchFaceState
    let onMore: () -> Void

    public init(state: WatchFaceState, onMore: @escaping () -> Void) {
        self.state = state
        self.onMore = onMore
    }

    public var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            if let ritual = state.ritual {
                let phase = ritual.phase
                let lang = state.language
                let pip = state.dimmed ? nil : phase.countdownPip
                VStack(spacing: 0) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(clock(ritual.remainingSec))
                            .font(WatchLook.font(w * 0.13))
                            .monospacedDigit()
                            .foregroundStyle(ritual.paused ? WatchLook.gold : WatchLook.text)
                        Spacer(minLength: 0)
                        if ritual.stage == .brushing {
                            Text("\(phase.quadrant.rawValue + 1)/4")
                                .font(WatchLook.font(w * 0.09, .bold))
                                .foregroundStyle(WatchLook.lavender)
                        }
                    }
                    .padding(.horizontal, w * 0.04)
                    // one line for VoiceOver: where and how to brush, and the time left
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(accessibility(ritual, phase, lang) + ", " + clock(ritual.remainingSec))
                    let mouthSize = CGSize(width: w, height: h * 0.54)
                    let zoomed = zoomedIn(ritual)
                    let focus = cameraFocus(ritual, phase)
                    let zoom: Double = zoomed ? 1 : 0
                    ZStack {
                        // the mouth: close on the teeth being brushed, pulled back to the whole mouth
                        // (tipped away a little, for depth) around each new quarter
                        MouthMap(mode: mapMode(ritual, phase), dimmed: state.dimmed, focus: focus, zoom: zoom)
                            .overlay {
                                MouthPacer(quadrant: phase.quadrant, surface: phase.surface, step: pacerStep(ritual, pip: pip), focus: focus, zoom: zoom)
                            }
                            .clipped()
                            .rotation3DEffect(.degrees(zoomed ? 0 : 16), axis: (x: 1, y: 0, z: 0), perspective: 0.5)
                            // with Reduce Motion the two views cross-fade instead of the camera moving
                            .id(state.reduceMotion ? zoom : 0)
                            .transition(.opacity)
                            .modifier(QuarterNod(key: nodKey(ritual, phase), axis: nodAxis(ritual, phase), enabled: !state.dimmed && !state.reduceMotion))
                        if let pip {
                            Text("\(pip)")
                                .font(WatchLook.font(w * 0.24))
                                .foregroundStyle(WatchLook.gold)
                                .shadow(color: .black.opacity(0.9), radius: 3)
                                .offset(pipOffset(focus, zoomed: zoomed, size: mouthSize))
                                .transition(state.reduceMotion ? .identity : .scale.combined(with: .opacity))
                        }
                    }
                    .frame(width: mouthSize.width, height: mouthSize.height)
                    .animation(state.dimmed ? nil : .easeInOut(duration: state.reduceMotion ? 0.35 : 0.9), value: zoomed)
                    .accessibilityHidden(true)
                    // how far through this step: a gold bar on a dark purple track
                    GeometryReader { bar in
                        ZStack(alignment: .leading) {
                            Capsule().fill(WatchLook.panel)
                            Capsule().fill(WatchLook.gold)
                                .frame(width: bar.size.width * min(1, ritual.stageElapsed / max(1, ritual.stageLength)))
                        }
                    }
                    .frame(height: max(5, h * 0.03))
                    .padding(.horizontal, w * 0.06)
                    .padding(.bottom, h * 0.02)
                    .accessibilityHidden(true)
                    HStack(spacing: w * 0.03) {
                        Text(bigWord(ritual, phase, lang))
                            .font(WatchLook.font(w * 0.12))
                            .foregroundStyle(wordColor(ritual, phase))
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                            .padding(.horizontal, w * 0.04)
                            .frame(maxWidth: .infinity, minHeight: w * 0.2, alignment: .leading)
                            .background(RoundedRectangle(cornerRadius: w * 0.06, style: .continuous).fill(WatchLook.pill))
                            .accessibilityHidden(true)
                        Button(action: onMore) {
                            Image(systemName: ritual.paused ? "play.fill" : "ellipsis")
                                .font(.system(size: w * 0.08, weight: .heavy))
                                .foregroundStyle(WatchLook.gold)
                                .frame(width: w * 0.2, height: w * 0.2)
                                .background(RoundedRectangle(cornerRadius: w * 0.06, style: .continuous).fill(WatchLook.panel))
                                .overlay(RoundedRectangle(cornerRadius: w * 0.06, style: .continuous).strokeBorder(WatchLook.gold, lineWidth: 2))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(WatchCopy.word(.more, lang))
                    }
                    .padding(.horizontal, w * 0.04)
                }
                .frame(width: w, height: h)
            }
        }
    }

    /// The camera is close on the teeth being brushed and pulls back to the whole mouth for each new
    /// quarter: from the quarter's last 3-2-1 to 2 s into the next (and the first 2 s). It stays
    /// back while paused, for floss and for the rinse.
    func zoomedIn(_ r: WatchRitual) -> Bool {
        guard !r.paused, r.stage == .brushing else { return false }
        let quarter = WatchRitual.brushSec / 4
        let t = r.stageElapsed.truncatingRemainder(dividingBy: quarter)
        return t >= 2 && t < quarter - 3
    }

    func cameraFocus(_ r: WatchRitual, _ p: BrushPhaseState) -> MouthMap.Focus {
        r.stage == .brushing ? .quarter(p.quadrant) : .whole
    }

    /// Close up, the 3-2-1 sits inside the arch, off the teeth being brushed.
    func pipOffset(_ focus: MouthMap.Focus, zoomed: Bool, size: CGSize) -> CGSize {
        guard zoomed else { return CGSize(width: 0, height: -size.height * 0.04) }
        let mid = CGPoint(x: size.width / 2, y: size.height / 2)
        let c = mid.applying(MouthMap.camera(focus, zoom: 1, size: size))
        return CGSize(width: (c.x - mid.x) * 0.6, height: (c.y - mid.y) * 0.6)
    }

    /// The nod's axis: it brings the new quarter (or the arch to floss) toward the child.
    func nodAxis(_ r: WatchRitual, _ p: BrushPhaseState) -> (x: CGFloat, y: CGFloat, z: CGFloat) {
        switch r.stage {
        case .brushing:
            let up: CGFloat = p.quadrant.isUpper ? 1 : -1
            let right: CGFloat = p.quadrant == .upperRight || p.quadrant == .lowerRight ? 1 : -1
            // (around x, a positive turn tips the top away; around y, it tips the right away)
            return (x: -up, y: -right, z: 0)
        case .floss:
            return (x: p.flossIsUpper ? -1 : 1, y: 0, z: 0)
        case .rinse, .done:
            return (x: 1, y: 0, z: 0)
        }
    }

    func nodKey(_ r: WatchRitual, _ p: BrushPhaseState) -> Int {
        switch r.stage {
        case .brushing: return p.quadrant.rawValue
        case .floss: return p.flossIsUpper ? 10 : 11
        case .rinse, .done: return 20
        }
    }

    /// The pacer dot's tooth: one a second along the quarter, there and back, a calm brushing pace
    /// (none in Always On, with Reduce Motion, while paused or while the 3-2-1 shows).
    func pacerStep(_ r: WatchRitual, pip: Int?) -> Int? {
        guard r.stage == .brushing, pip == nil, !state.dimmed, !state.reduceMotion, !r.paused else { return nil }
        let k = Int(r.stageElapsed) % 12
        return k < 7 ? k : 12 - k
    }

    func mapMode(_ r: WatchRitual, _ p: BrushPhaseState) -> MouthMap.Mode {
        switch r.stage {
        case .brushing: return .brushing(quadrant: p.quadrant, surface: p.surface, doneMask: p.completedQuadrantsMask)
        case .floss: return .floss(upper: p.flossIsUpper)
        case .rinse: return .rinse
        case .done: return .clean
        }
    }

    func bigWord(_ r: WatchRitual, _ p: BrushPhaseState, _ lang: CoachLanguage) -> String {
        switch r.stage {
        case .brushing: return WatchCopy.surface(p.surface, lang)
        case .floss: return WatchCopy.word(p.flossIsUpper ? .top : .bottom, lang)
        case .rinse: return WatchCopy.rinseStep(p.mouthwashStepIndex, lang)
        case .done: return WatchCopy.word(.done, lang)
        }
    }

    func wordColor(_ r: WatchRitual, _ p: BrushPhaseState) -> Color {
        switch r.stage {
        case .brushing: return WatchLook.surfaceColor(p.surface)
        case .floss: return WatchLook.gold
        case .rinse: return WatchLook.rinse
        case .done: return WatchLook.gold
        }
    }

    func accessibility(_ r: WatchRitual, _ p: BrushPhaseState, _ lang: CoachLanguage) -> String {
        switch r.stage {
        case .brushing: return WatchCopy.brushingAccessibility(p.quadrant, p.surface, lang)
        case .floss: return WatchCopy.word(.floss, lang) + ", " + WatchCopy.word(p.flossIsUpper ? .top : .bottom, lang)
        case .rinse: return WatchCopy.word(.rinse, lang) + ", " + WatchCopy.rinseStep(p.mouthwashStepIndex, lang)
        case .done: return WatchCopy.word(.done, lang)
        }
    }
}

/// The controls, one tap away from the running face: Pause or Resume, Done and Skip (floss and rinse
/// only), End. Done, Skip and End ask for a second tap, so a splash or a curious finger never ends a brush.
public struct WatchControlsFace: View {
    let state: WatchFaceState
    let armed: String?
    let onPause: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void
    let onEnd: () -> Void
    let onClose: () -> Void
    /// Off only for rendering checks (a Mac snapshot cannot draw a scrolling view).
    let scrollable: Bool

    public init(state: WatchFaceState, armed: String?, onPause: @escaping () -> Void, onNext: @escaping () -> Void, onSkip: @escaping () -> Void, onEnd: @escaping () -> Void, onClose: @escaping () -> Void, scrollable: Bool = true) {
        self.state = state
        self.armed = armed
        self.onPause = onPause
        self.onNext = onNext
        self.onSkip = onSkip
        self.onEnd = onEnd
        self.onClose = onClose
        self.scrollable = scrollable
    }

    public var body: some View {
        if scrollable {
            ScrollView { buttons }
        } else {
            buttons
        }
    }

    private var buttons: some View {
        let lang = state.language
        let paused = state.ritual?.paused ?? false
        let stage = state.ritual?.stage ?? .brushing
        return VStack(spacing: 8) {
                BigButton(title: WatchCopy.word(paused ? .resume : .pause, lang), style: .tile, action: onPause)
                // Floss waits for the whole brush (the clock rolls into it), so Done and Skip are only
                // for floss and rinse; anyone without a floss pick just skips it.
                if stage == .floss || stage == .rinse {
                    BigButton(title: armed == "next" ? WatchCopy.word(.tapAgain, lang) : WatchCopy.word(.done, lang), action: onNext)
                    BigButton(title: armed == "skip" ? WatchCopy.word(.tapAgain, lang) : WatchCopy.word(.skip, lang), style: .tile, action: onSkip)
                }
                BigButton(title: armed == "end" ? WatchCopy.word(.tapAgain, lang) : WatchCopy.word(.end, lang), style: .danger, action: onEnd)
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(WatchLook.soft)
                        .frame(maxWidth: .infinity, minHeight: 36)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 4)
    }
}

/// Done: a clean smile, "Done!" (or a kind "Good try!" after an early finish), and what it earned
/// once the iPhone has answered; until then, a quiet line that it is saved or on its way.
public struct WatchDoneFace: View {
    let state: WatchFaceState
    let onClose: () -> Void

    public init(state: WatchFaceState, onClose: @escaping () -> Void) {
        self.state = state
        self.onClose = onClose
    }

    public var body: some View {
        GeometryReader { geo in
            let w = min(geo.size.width, geo.size.height * 0.85)
            let lang = state.language
            let full = state.ritual?.fullBrush ?? true
            let rinsed = state.ritual?.rinseOutcome.earnsBonus ?? false
            VStack(spacing: w * 0.03) {
                MirrorMouth(mode: .smile, dimmed: state.dimmed)
                    .frame(width: w * 0.5, height: w * 0.36)
                Text(WatchCopy.word(full ? .done : .goodTry, lang))
                    .font(WatchLook.font(w * 0.15))
                    .foregroundStyle(full ? WatchLook.gold : WatchLook.lavender)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                if let ack = state.ack {
                    HStack(spacing: 6) {
                        if ack.ionsAwarded > 0 {
                            Text("+\(ack.ionsAwarded) F⁻").font(WatchLook.font(w * 0.09, .bold)).foregroundStyle(WatchLook.gold)
                        }
                        if ack.stampAwarded {
                            Image(systemName: "star.fill").font(.system(size: w * 0.08)).foregroundStyle(WatchLook.gold)
                        }
                        if ack.ionsAwarded == 0 && !ack.stampAwarded {
                            // saved on the iPhone, nothing more to earn today: just a check mark
                            Image(systemName: "checkmark.circle.fill").font(.system(size: w * 0.09)).foregroundStyle(WatchLook.gold)
                        }
                    }
                } else {
                    Text(WatchCopy.word(state.syncPending ? .sending : .savedOnWatch, lang))
                        .font(WatchLook.font(w * 0.07, .semibold))
                        .foregroundStyle(WatchLook.soft)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .minimumScaleFactor(0.6)
                }
                if rinsed {
                    Text(WatchCopy.word(.spitOut, lang))
                        .font(WatchLook.font(w * 0.08, .bold))
                        .foregroundStyle(WatchLook.rinse)
                }
                BigButton(title: "OK", action: onClose)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }
}
