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
    /// Water for the rinse: the one colour outside purple and gold, so a rinse never looks like chewing.
    static let rinse = Color(red: 0.42, green: 0.8, blue: 1.0)
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
        /// Brushing one quarter; `next`, when set, gets a faint dashed outline ("here next").
        case brushing(quadrant: BrushQuadrant, surface: BrushSurface, doneMask: Int, next: BrushQuadrant? = nil)
        /// Flossing one arch: `contact` is the gap being flossed, 0 at the back right (as the child
        /// sees it in a mirror), 6 between the front teeth, 12 at the back left.
        case floss(upper: Bool, contact: Int)
        /// Rinsing: `step` 0 swish, 1 between the teeth, 2 last swish.
        case rinse(step: Int)
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
        // (from the cache: the brush calls this on every frame of its glide)
        let box = PacerGeometryCache.shared.quarter(q, in: size, unit: u).box
        let close = min(2.0, max(1, min(size.width / box.width, size.height / box.height)))
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
    static let depths: [Double] = [0.55, 0.6, 0.8, 0.88, 0.88, 0.82, 0.82]

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
            if case .rinse = mode { drawWater(&ctx, size: size, u: u) }
            for q in BrushQuadrant.allCases {
                drawQuarter(q, ctx: &ctx, size: size, u: u)
            }
        }
        .accessibilityHidden(true)
    }

    /// The rinse: still water filling the lower mouth, with one clear wavy waterline (an outline only
    /// in Always On).
    private func drawWater(_ ctx: inout GraphicsContext, size: CGSize, u: Double) {
        let cx = size.width / 2, cy = size.height / 2
        let rx = size.width * 0.42 - u * 0.1, ry = size.height * 0.4 - u * 0.1
        guard rx > 4, ry > 4 else { return }
        let mouth = Path(ellipseIn: CGRect(x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2))
        let level = cy - ry * 0.15
        let amp = max(1.2, u * 0.018)
        var wave = Path()
        let steps = 32
        for k in 0...steps {
            let x = cx - rx + 2 * rx * Double(k) / Double(steps)
            let y = level + sin(Double(k) / Double(steps) * .pi * 5) * amp
            if k == 0 { wave.move(to: CGPoint(x: x, y: y)) } else { wave.addLine(to: CGPoint(x: x, y: y)) }
        }
        var water = wave
        water.addLine(to: CGPoint(x: cx + rx, y: cy + ry))
        water.addLine(to: CGPoint(x: cx - rx, y: cy + ry))
        water.closeSubpath()
        var inside = ctx
        inside.clip(to: mouth)
        if !dimmed {
            inside.fill(water, with: .color(WatchLook.rinse.opacity(0.32)))
            // a few still bubbles
            for (fx, fy, fr) in [(-0.35, 0.3, 0.022), (0.1, 0.5, 0.016), (0.4, 0.25, 0.019)] {
                let r = u * fr
                let c = CGPoint(x: cx + rx * fx, y: level + (cy + ry - level) * fy)
                inside.stroke(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2)), with: .color(.white.opacity(0.7)), lineWidth: max(1, u * 0.008))
            }
        }
        inside.stroke(wave, with: .color(dimmed ? .white : WatchLook.rinse), style: StrokeStyle(lineWidth: max(1.5, u * 0.018), lineCap: .round))
    }

    /// The tongue: a broad base toward the throat, a rounded tip just behind the lower front teeth.
    private func drawTongue(_ ctx: inout GraphicsContext, size: CGSize, u: Double) {
        let lower = Self.arch(false, in: size, unit: u)
        let frontDepth = PacerGeometryCache.shared.teeth(.lowerRight, in: size, unit: u)[0].depth
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
        // the quarter's teeth and their outlines, built once per size (the mouth redraws on every
        // frame of a camera move)
        let geometry = PacerGeometryCache.shared.quarter(q, in: size, unit: u)
        let teeth = geometry.teeth
        let outlines = geometry.outlines
        let (front, back) = Self.angles(q)
        let thin = max(1, u * 0.009)
        let mark = max(1.3, u * 0.013)

        var fill = Self.idleFill
        var line = Self.idleLine
        var lineWidth = thin
        var lit = false
        var done = false
        var surface: BrushSurface?
        var isNext = false
        var flossContact: Int?
        var rinseStep: Int?
        switch mode {
        case let .brushing(active, s, doneMask, next):
            if q == active {
                fill = WatchLook.surfaceColor(s)
                line = fill
                lineWidth = mark
                lit = true
                surface = s
            } else if doneMask & (1 << q.rawValue) != 0 {
                done = true
            }
            isNext = q == next
        case let .floss(upper, contact):
            if q.isUpper == upper {
                fill = Color(red: 0.56, green: 0.46, blue: 0.74)
                line = Self.idleLine
                flossContact = contact
            } else {
                fill = Self.idleFill.opacity(0.55)
                line = Self.idleLine.opacity(0.35)
            }
        case let .rinse(step):
            rinseStep = step
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
                for path in outlines { ctx.stroke(path, with: .color(fill.opacity(alpha)), style: StrokeStyle(lineWidth: width, lineJoin: .round)) }
            }
        }

        let shadow = CGAffineTransform(translationX: 0, y: max(1, u * 0.009))
        for (t, path) in zip(teeth, outlines) {
            if dimmed {
                // Always On: only the quarter being brushed is bright (done quarters look idle), in a
                // bold line so it still reads at arm's length
                ctx.stroke(path, with: .color(line), lineWidth: lit ? lineWidth * 1.5 : lineWidth)
            } else {
                // a solid little tooth: a darker edge below for thickness, a light top
                ctx.fill(path.applying(shadow), with: .color(.black.opacity(0.45)))
                ctx.fill(path, with: .color(fill))
                let b = path.boundingRect
                ctx.fill(path, with: .linearGradient(
                    Gradient(colors: [.white.opacity(lit ? 0.36 : 0.14), .clear]),
                    startPoint: CGPoint(x: b.midX, y: b.minY),
                    endPoint: CGPoint(x: b.midX, y: b.maxY)
                ))
                if done { ctx.stroke(path, with: .color(WatchLook.gold.opacity(0.9)), lineWidth: thin) }
            }
            if surface == .chewingGrooves { drawGroove(t, outline: path, ctx: &ctx, u: u) }
        }

        // inside: a dashed line along the tongue side of the teeth
        if surface == .innerTongue {
            let off = max(1.2, u * 0.013) + mark / 2
            var pts = [teeth[0].at(-teeth[0].length / 2, teeth[0].depth + off)]
            pts += teeth.map { $0.at(0, $0.depth + off) }
            pts.append(teeth[teeth.count - 1].at(teeth[teeth.count - 1].length / 2, teeth[teeth.count - 1].depth + off))
            var style = StrokeStyle(lineWidth: mark * 1.35, lineCap: .butt)
            style.dash = [max(3, u * 0.03), max(1.8, u * 0.018)]
            ctx.stroke(Self.smooth(pts), with: .color(WatchLook.inside), style: style)
        }

        // here next: a faint dashed outline round the next quarter, while the mouth is pulled back
        if isNext {
            var style = StrokeStyle(lineWidth: thin * 1.3, lineCap: .round, lineJoin: .round)
            style.dash = [max(2, u * 0.02), max(1.5, u * 0.015)]
            for path in outlines { ctx.stroke(path, with: .color(WatchLook.gold.opacity(dimmed ? 0.5 : 0.6)), style: style) }
        }

        // floss: a thread in every gap (gold once flossed, white where the pick is, faint ahead); the
        // pick itself is the FlossPacer overlay; the middle gap belongs to the right-hand quarter
        if let contact = flossContact {
            let thread = StrokeStyle(lineWidth: max(1.6, u * 0.018), lineCap: .round)
            let over = max(1.5, u * 0.014)
            let isRight = q == .upperRight || q == .lowerRight
            for gap in Self.gaps(q, teeth: teeth, arch: arch, over: over) {
                let k = Self.contactIndex(gap: gap.index, right: isRight)
                // (in Always On too, a little dimmer, so the dimmed face still shows the way)
                let color: Color = k < contact ? WatchLook.gold.opacity(dimmed ? 0.75 : 1)
                    : k == contact ? .white : WatchLook.gold.opacity(dimmed ? 0.25 : 0.32)
                var g = Path()
                g.move(to: gap.outer)
                g.addLine(to: gap.inner)
                ctx.stroke(g, with: .color(color), style: thread)
            }
        }

        // rinse, the middle step: little drops pushed between the teeth
        if rinseStep == 1 && !dimmed {
            let r = max(1.2, u * 0.012)
            for gap in Self.gaps(q, teeth: teeth, arch: arch, over: 0) {
                let c = CGPoint(x: (gap.outer.x + gap.inner.x) / 2, y: (gap.outer.y + gap.inner.y) / 2)
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2)), with: .color(WatchLook.rinse))
            }
        }
    }

    /// A gap between two teeth: where it opens on the cheek side and where it ends on the tongue side.
    struct Gap {
        /// 0 between the two front teeth of this quarter ... 5 between the two back molars; -1 is
        /// the middle gap between the two front teeth of the arch (drawn with the right quarter).
        let index: Int
        let outer: CGPoint
        let inner: CGPoint
    }

    static func gaps(_ q: BrushQuadrant, teeth: [Tooth], arch: Arch, over: Double) -> [Gap] {
        var out: [Gap] = []
        for i in 0..<(teeth.count - 1) {
            let a = teeth[i], b = teeth[i + 1]
            let pa = a.at(a.length / 2, 0), pb = b.at(-b.length / 2, 0)
            let edge = CGPoint(x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2)
            let inward = CGVector(dx: (a.inward.dx + b.inward.dx) / 2, dy: (a.inward.dy + b.inward.dy) / 2)
            let deep = (a.depth + b.depth) / 2 + over
            out.append(Gap(index: i,
                           outer: CGPoint(x: edge.x - inward.dx * over, y: edge.y - inward.dy * over),
                           inner: CGPoint(x: edge.x + inward.dx * deep, y: edge.y + inward.dy * deep)))
        }
        if q == .upperRight || q == .lowerRight {
            let (front, _) = angles(q)
            let mid = arch.point(front)
            let n = arch.normal(front)
            let deep = teeth[0].depth + over
            out.append(Gap(index: -1,
                           outer: CGPoint(x: mid.x + n.dx * over, y: mid.y + n.dy * over),
                           inner: CGPoint(x: mid.x - n.dx * deep, y: mid.y - n.dy * deep)))
        }
        return out
    }

    /// The floss order along an arch, as the phone flosses it: 0 the back gap on the right (screen
    /// right, the child's right in the mirror), 6 the middle gap, 12 the back gap on the left.
    static func contactIndex(gap: Int, right: Bool) -> Int {
        if gap < 0 { return 6 }
        return right ? 5 - gap : 7 + gap
    }

    /// A floss pick on a gap: a little prong at each end of the thread, and the handle reaching in
    /// toward the tongue.
    static func drawFlossPick(_ gap: Gap, dimmed: Bool, ctx: inout GraphicsContext, u: Double) {
        let dx = gap.inner.x - gap.outer.x, dy = gap.inner.y - gap.outer.y
        let len = max(1e-6, (dx * dx + dy * dy).squareRoot())
        let dir = CGVector(dx: dx / len, dy: dy / len)
        let handleEnd = CGPoint(x: gap.inner.x + dir.dx * u * 0.13, y: gap.inner.y + dir.dy * u * 0.13)
        let r = max(1.6, u * 0.02)
        var handle = Path()
        handle.move(to: gap.inner)
        handle.addLine(to: handleEnd)
        var prongs = Path()
        for p in [gap.outer, gap.inner] { prongs.addEllipse(in: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)) }
        if dimmed {
            ctx.stroke(handle, with: .color(.white), style: StrokeStyle(lineWidth: max(1, u * 0.012), lineCap: .round))
            ctx.stroke(prongs, with: .color(.white), lineWidth: max(1, u * 0.01))
        } else {
            // a dark rim first, so the pick never melts into the teeth
            ctx.stroke(handle, with: .color(WatchLook.background), style: StrokeStyle(lineWidth: u * 0.05, lineCap: .round))
            ctx.stroke(handle, with: .color(WatchLook.brightPurple), style: StrokeStyle(lineWidth: u * 0.032, lineCap: .round))
            ctx.stroke(prongs, with: .color(WatchLook.background), lineWidth: u * 0.016)
            ctx.fill(prongs, with: .color(WatchLook.brightPurple))
        }
    }

    /// The chewing tops: a Y groove on the molars, a short groove on the premolars, a bright edge in front.
    private func drawGroove(_ t: Tooth, outline: Path, ctx: inout GraphicsContext, u: Double) {
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
            ctx.stroke(outline, with: .color(color), lineWidth: max(1, u * 0.009))
            return
        }
        ctx.stroke(g, with: .color(color), style: style)
    }
}

/// The toothbrush: it glides from tooth to tooth along the quarter being brushed, one tooth a second,
/// and in every 10 s surface it reaches the back molar (0, 1 ... 6, then 5, 4, 3). Seen from the side
/// on the outside and the inside (bristles against the teeth) and from above on the chewing tops. It
/// is drawn apart from the mouth, so the mouth itself is only redrawn when the quarter or the surface
/// changes, and it follows the mouth's camera. In Always On it is an outline that steps without gliding.
public struct MouthPacer: View, Animatable {
    let quadrant: BrushQuadrant
    let surface: BrushSurface
    /// The tooth under the brush, 0 (front) to 6 (back molar), in between while gliding; nil hides it.
    var position: Double?
    let focus: MouthMap.Focus
    var zoom: Double
    let dimmed: Bool

    public var animatableData: AnimatablePair<Double, Double> {
        get { AnimatablePair(zoom, position ?? 0) }
        set {
            zoom = newValue.first
            if position != nil { position = newValue.second }
        }
    }

    public init(quadrant: BrushQuadrant, surface: BrushSurface, position: Double?, focus: MouthMap.Focus = .whole, zoom: Double = 0, dimmed: Bool = false) {
        self.quadrant = quadrant
        self.surface = surface
        self.position = position
        self.focus = focus
        self.zoom = zoom
        self.dimmed = dimmed
    }

    /// The sweep through one 10 s surface: one tooth a second, front to back molar and part way back.
    public static func tooth(atSurfaceSecond t: Double) -> Int {
        let k = min(9, max(0, Int(t)))
        return k < 7 ? k : 12 - k
    }

    public var body: some View {
        Canvas { ctx, size in
            guard let position else { return }
            ctx.concatenate(MouthMap.camera(focus, zoom: zoom, size: size))
            let u = min(size.width, size.height * 1.15)
            let teeth = PacerGeometryCache.shared.teeth(quadrant, in: size, unit: u)
            guard teeth.count == MouthMap.teethPerQuarter else { return }
            // where the brush is: between two teeth while it glides
            let p = min(Double(teeth.count - 1), max(0, position))
            let i0 = Int(p.rounded(.down)), i1 = min(teeth.count - 1, i0 + 1), f = p - Double(i0)
            let a = teeth[i0], b = teeth[i1]
            func mix(_ x: Double, _ y: Double) -> Double { x + (y - x) * f }
            func unit(_ v: CGVector) -> CGVector {
                let l = max(1e-9, (v.dx * v.dx + v.dy * v.dy).squareRoot())
                return CGVector(dx: v.dx / l, dy: v.dy / l)
            }
            let edge = CGPoint(x: mix(a.edge.x, b.edge.x), y: mix(a.edge.y, b.edge.y))
            let along = unit(CGVector(dx: mix(a.along.dx, b.along.dx), dy: mix(a.along.dy, b.along.dy)))
            let inward = unit(CGVector(dx: mix(a.inward.dx, b.inward.dx), dy: mix(a.inward.dy, b.inward.dy)))
            let depth = mix(a.depth, b.depth)
            // x runs toward the back of the mouth, y in toward the tongue
            func pt(_ x: Double, _ y: Double) -> CGPoint {
                CGPoint(x: edge.x + along.dx * x + inward.dx * y, y: edge.y + along.dy * x + inward.dy * y)
            }
            // sized by the quarter's average tooth, so it does not grow on the molars
            let s = teeth.map(\.length).reduce(0, +) / Double(teeth.count)
            let headL = s * 1.45
            let gap = u * 0.004
            var head = Path()
            var neck = Path()
            var bristles = Path()
            var tufts = Path()
            switch surface {
            case .outerCheek, .innerTongue:
                // from the side: the bristles touch the cheek side or the tongue side of the teeth
                let outside = surface == .outerCheek
                let headT = s * 0.42, bristleL = s * 0.38
                let sign: Double = outside ? -1 : 1
                let base = outside ? -gap : depth + gap
                let y0 = base + sign * bristleL, y1 = y0 + sign * headT
                head = Path(roundedRect: CGRect(x: -headL / 2, y: min(y0, y1), width: headL, height: headT), cornerRadius: headT * 0.45)
                    .applying(Self.frame(edge, along, inward))
                let mid = (y0 + y1) / 2
                neck.move(to: pt(-headL / 2, mid))
                neck.addLine(to: pt(-headL / 2 - s * 0.95, mid + sign * s * 0.28))
                for k in 0..<4 {
                    let x = (Double(k) - 1.5) * headL * 0.24
                    bristles.move(to: pt(x, base))
                    bristles.addLine(to: pt(x, y0))
                }
            case .chewingGrooves:
                // from above: the head lies on the chewing tops, its tufts showing
                let headW = s * 0.62
                let cy = depth / 2
                head = Path(roundedRect: CGRect(x: -headL / 2, y: cy - headW / 2, width: headL, height: headW), cornerRadius: headW * 0.4)
                    .applying(Self.frame(edge, along, inward))
                neck.move(to: pt(-headL / 2, cy))
                neck.addLine(to: pt(-headL / 2 - s * 0.95, cy))
                let r = s * 0.085
                for row in [-1.0, 1.0] {
                    for k in 0..<4 {
                        let c = pt((Double(k) - 1.5) * headL * 0.22, cy + row * headW * 0.22)
                        tufts.addEllipse(in: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
                    }
                }
            }
            let neckW = s * 0.22, bristleW = s * 0.15
            if dimmed {
                let line = max(1.3, u * 0.015)
                ctx.stroke(head, with: .color(.white), lineWidth: line)
                ctx.stroke(neck, with: .color(.white), style: StrokeStyle(lineWidth: line, lineCap: .round))
                ctx.stroke(bristles, with: .color(.white), style: StrokeStyle(lineWidth: line, lineCap: .round))
                ctx.stroke(tufts, with: .color(.white), lineWidth: line * 0.8)
                return
            }
            // a dark rim round everything, so the brush never melts into a tooth
            let rim = max(1.2, u * 0.012) * 2
            let dark = Color(red: 0.05, green: 0.04, blue: 0.07)
            ctx.stroke(neck, with: .color(dark), style: StrokeStyle(lineWidth: neckW + rim, lineCap: .round))
            ctx.stroke(bristles, with: .color(dark), style: StrokeStyle(lineWidth: bristleW + rim, lineCap: .round))
            ctx.stroke(head, with: .color(dark), lineWidth: rim)
            let bristle = Color(red: 0.86, green: 0.92, blue: 1.0)
            ctx.stroke(bristles, with: .color(bristle), style: StrokeStyle(lineWidth: bristleW, lineCap: .round))
            ctx.stroke(neck, with: .color(.white), style: StrokeStyle(lineWidth: neckW, lineCap: .round))
            if surface == .chewingGrooves {
                // a see-through head, so the grooves still show between the tufts
                ctx.fill(head, with: .color(dark.opacity(0.4)))
                ctx.stroke(head, with: .color(.white), lineWidth: max(1.2, u * 0.012))
                ctx.fill(tufts, with: .color(bristle))
            } else {
                ctx.fill(head, with: .color(.white))
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// The tooth's own frame at the brush: x toward the back, y in toward the tongue.
    static func frame(_ edge: CGPoint, _ along: CGVector, _ inward: CGVector) -> CGAffineTransform {
        CGAffineTransform(a: along.dx, b: along.dy, c: inward.dx, d: inward.dy, tx: edge.x, ty: edge.y)
    }
}

/// The floss pick: it glides from gap to gap along the arch being flossed, from the back right to the
/// back left, as `BrushPhaseState.flossContactIndex` moves (about one gap every 1.7 s). Drawn apart
/// from the mouth like the brush; in Always On it is an outline that steps without gliding.
public struct FlossPacer: View, Animatable {
    let upper: Bool
    /// The gap (0 back right ... 6 middle ... 12 back left), in between while gliding.
    var position: Double
    let dimmed: Bool

    public var animatableData: Double {
        get { position }
        set { position = newValue }
    }

    public init(upper: Bool, position: Double, dimmed: Bool = false) {
        self.upper = upper
        self.position = position
        self.dimmed = dimmed
    }

    /// The arch's 13 gaps in floss order (kept between frames: the pacer redraws while it glides).
    static func gapsInOrder(upper: Bool, size: CGSize, unit u: Double) -> [MouthMap.Gap] {
        PacerGeometryCache.shared.gaps(upper: upper, size: size, unit: u) { buildGapsInOrder(upper: upper, size: size, unit: u) }
    }

    private static func buildGapsInOrder(upper: Bool, size: CGSize, unit u: Double) -> [MouthMap.Gap] {
        let over = max(1.5, u * 0.014)
        var byContact: [Int: MouthMap.Gap] = [:]
        for q in BrushQuadrant.allCases where q.isUpper == upper {
            let right = q == .upperRight || q == .lowerRight
            let arch = MouthMap.arch(upper, in: size, unit: u)
            for gap in MouthMap.gaps(q, teeth: MouthMap.teeth(q, in: size, unit: u), arch: arch, over: over) {
                byContact[MouthMap.contactIndex(gap: gap.index, right: right)] = gap
            }
        }
        return (0...12).compactMap { byContact[$0] }
    }

    public var body: some View {
        Canvas { ctx, size in
            let u = min(size.width, size.height * 1.15)
            let gaps = Self.gapsInOrder(upper: upper, size: size, unit: u)
            guard gaps.count == 13 else { return }
            let p = min(12, max(0, position))
            let i0 = Int(p.rounded(.down)), i1 = min(12, i0 + 1), f = p - Double(i0)
            func mix(_ a: CGPoint, _ b: CGPoint) -> CGPoint { CGPoint(x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f) }
            let gap = MouthMap.Gap(index: 0, outer: mix(gaps[i0].outer, gaps[i1].outer), inner: mix(gaps[i0].inner, gaps[i1].inner))
            MouthMap.drawFlossPick(gap, dimmed: dimmed, ctx: &ctx, u: u)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// On each new quarter the mouth gives a quick nod toward it (10 degrees and back to flat in 0.6 s,
/// with the tap on the wrist), so it is flat and sharp whenever the child looks. Turned off (Always
/// On, Reduce Motion) it stays flat, in the same view: raising or lowering the wrist must not
/// rebuild the mouth.
struct QuarterNod: ViewModifier {
    let key: Int
    let axis: (x: CGFloat, y: CGFloat, z: CGFloat)
    let enabled: Bool

    func body(content: Content) -> some View {
        content.keyframeAnimator(initialValue: 0.0, trigger: key) { view, angle in
            view.rotation3DEffect(.degrees(enabled ? angle : 0), axis: axis, perspective: 0.45)
        } keyframes: { _ in
            CubicKeyframe(10, duration: 0.22)
            CubicKeyframe(0, duration: 0.38)
        }
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

/// A cup of rinse (in Always On, the cup and its waterline as outlines).
struct RinseCup: View {
    var dimmed = false

    var body: some View {
        Canvas { ctx, size in
            let s = min(size.width, size.height)
            let o = CGPoint(x: (size.width - s) / 2, y: (size.height - s) / 2)
            func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: o.x + x * s, y: o.y + y * s) }
            var cup = Path()
            cup.move(to: pt(0.2, 0.2)); cup.addLine(to: pt(0.8, 0.2)); cup.addLine(to: pt(0.7, 0.88)); cup.addLine(to: pt(0.3, 0.88)); cup.closeSubpath()
            if dimmed {
                var waterline = Path()
                waterline.move(to: pt(0.25, 0.48)); waterline.addLine(to: pt(0.75, 0.48))
                ctx.stroke(waterline, with: .color(WatchLook.rinse), style: StrokeStyle(lineWidth: s * 0.05, lineCap: .round))
                ctx.stroke(cup, with: .color(.white.opacity(0.8)), lineWidth: s * 0.04)
                return
            }
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
    /// The clock just moved on by more than a second (a stalled tick): the brush jumps, not glides.
    public var skippedAhead: Bool

    public init(ritual: WatchRitual? = nil, language: CoachLanguage = .english, includeRinse: Bool = false, canResume: Bool = false, ack: WatchBrushAck? = nil, syncPending: Bool = false, dimmed: Bool = false, reduceMotion: Bool = false, skippedAhead: Bool = false) {
        self.ritual = ritual
        self.language = language
        self.includeRinse = includeRinse
        self.canResume = canResume
        self.ack = ack
        self.syncPending = syncPending
        self.dimmed = dimmed
        self.reduceMotion = reduceMotion
        self.skippedAhead = skippedAhead
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
                        RinseCup(dimmed: state.dimmed).frame(width: w * 0.12, height: w * 0.12)
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

/// The card that names a stage as it starts: its picture and one big word.
struct StageCard: View {
    let word: WatchWord
    let lang: CoachLanguage
    let width: CGFloat
    let dimmed: Bool

    var color: Color {
        switch word {
        case .floss: return WatchLook.brightPurple
        case .rinse: return WatchLook.rinse
        default: return WatchLook.gold
        }
    }

    var body: some View {
        let w = width
        VStack(spacing: w * 0.015) {
            Group {
                switch word {
                case .floss: FlossPick()
                case .rinse: RinseCup(dimmed: dimmed)
                default: Toothbrush()
                }
            }
            .frame(width: w * 0.2, height: w * 0.2)
            .opacity(dimmed ? 0.7 : 1)
            Text(WatchCopy.word(word, lang))
                .font(WatchLook.font(w * 0.16))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
        .padding(.vertical, w * 0.03)
        .padding(.horizontal, w * 0.07)
        .background(RoundedRectangle(cornerRadius: w * 0.08, style: .continuous).fill(dimmed ? Color.black : WatchLook.background.opacity(0.9)))
        .overlay(RoundedRectangle(cornerRadius: w * 0.08, style: .continuous).strokeBorder(color, lineWidth: 2))
        .frame(maxWidth: w * 0.8)
    }
}

/// The running face: brushing, flossing or rinsing. It takes no taps except the "…" button (and,
/// while paused, a big Resume; on a Start card before floss or rinse, a big Start).
public struct WatchActiveFace: View {
    let state: WatchFaceState
    let onMore: () -> Void
    let onResume: () -> Void
    let onStart: () -> Void

    public init(state: WatchFaceState, onMore: @escaping () -> Void, onResume: @escaping () -> Void = {}, onStart: @escaping () -> Void = {}) {
        self.state = state
        self.onMore = onMore
        self.onResume = onResume
        self.onStart = onStart
    }

    public var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            if let ritual = state.ritual {
                let phase = ritual.phase
                let lang = state.language
                let dim = state.dimmed
                // the big 3-2-1 only when the wrist taps it (also in Always On, without the pop)
                let digit = ritual.countdownDigit
                let button = max(44, w * 0.2)
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
                    .accessibilityLabel((ritual.paused ? WatchCopy.word(.pause, lang) + ", " : "") + accessibility(ritual, phase, lang) + ", " + clock(ritual.remainingSec))
                    let mouthSize = CGSize(width: w, height: h * 0.54)
                    let zoomed = zoomedIn(ritual)
                    let focus = cameraFocus(ritual, phase)
                    let zoom: Double = zoomed ? 1 : 0
                    let cameraMove: Animation? = dim ? nil : .easeInOut(duration: state.reduceMotion ? 0.35 : 0.7)
                    let position = brushTooth(ritual, phase).map(Double.init)
                    // after a stalled tick the brush and pick jump to their place, as with Reduce Motion
                    let glide: Animation? = dim || state.reduceMotion || state.skippedAhead ? nil : .easeInOut(duration: 0.3)
                    ZStack {
                        // the mouth: close on the teeth being brushed, pulled back to the whole mouth
                        // (tipped away a little, for depth) around each new quarter
                        MouthMap(mode: mapMode(ritual, phase), dimmed: dim, focus: focus, zoom: zoom)
                            .overlay {
                                // the brush glides tooth to tooth (it jumps to a new surface, and with
                                // Reduce Motion); the camera's own move wins when both change at once.
                                // Only while brushing: the rinse swings its quarter to and fro, and an
                                // empty brush would be rebuilt with every swing.
                                if ritual.stage == .brushing {
                                    MouthPacer(quadrant: phase.quadrant, surface: phase.surface, position: position, focus: focus, zoom: zoom, dimmed: dim)
                                        .animation(cameraMove, value: zoomed)
                                        .animation(glide, value: position)
                                        .id(phase.quadrant.rawValue * 3 + phase.surface.rawValue)
                                        .transition(.identity)
                                }
                                if ritual.stage == .floss {
                                    // the floss pick glides gap to gap (it jumps to the other arch)
                                    FlossPacer(upper: phase.flossIsUpper, position: Double(phase.flossContactIndex), dimmed: dim)
                                        .animation(glide, value: phase.flossContactIndex)
                                        .id(phase.flossIsUpper)
                                        .transition(.identity)
                                }
                            }
                            .clipped()
                            .rotation3DEffect(.degrees(zoomed ? 0 : 8), axis: (x: 1, y: 0, z: 0), perspective: 0.5)
                            // with Reduce Motion the two views cross-fade instead of the camera moving
                            .id(state.reduceMotion ? zoom : 0)
                            .transition(.opacity)
                            .modifier(QuarterNod(key: nodKey(ritual, phase), axis: nodAxis(ritual, phase), enabled: !dim && !state.reduceMotion))
                        if let digit {
                            // the countdown comes with the mouth pulled back, so it sits in the middle
                            Text("\(digit)")
                                .font(WatchLook.font(w * 0.24))
                                .foregroundStyle(WatchLook.gold)
                                .shadow(color: .black.opacity(0.9), radius: 3)
                                .offset(y: -mouthSize.height * 0.04)
                                // each digit is its own view, so 3, 2 and 1 each pop in
                                .id(digit)
                                .transition(state.reduceMotion || dim ? .identity : AnyTransition.scale.combined(with: .opacity).animation(.easeInOut(duration: 0.2)))
                        }
                        if let card = stageCard(ritual) {
                            // each stage announces itself: "Brush", "Floss", "Rinse", with its picture
                            StageCard(word: card, lang: lang, width: w, dimmed: dim)
                                .transition(state.reduceMotion || dim ? .identity : AnyTransition.scale(scale: 0.8).combined(with: .opacity).animation(.easeInOut(duration: 0.25)))
                        }
                    }
                    .frame(width: mouthSize.width, height: mouthSize.height)
                    .animation(cameraMove, value: zoomed)
                    .accessibilityHidden(true)
                    // how far through this step: a gold bar on a dark purple track (outlines in Always On)
                    GeometryReader { bar in
                        let filled = bar.size.width * min(1, ritual.stageElapsed / max(1, ritual.stageLength))
                        ZStack(alignment: .leading) {
                            if dim {
                                Capsule().strokeBorder(WatchLook.idle, lineWidth: 1)
                                Capsule().strokeBorder(WatchLook.gold.opacity(0.8), lineWidth: 1.5)
                                    .frame(width: max(bar.size.height, filled))
                            } else {
                                Capsule().fill(WatchLook.panel)
                                Capsule().fill(WatchLook.gold)
                                    .frame(width: filled)
                            }
                        }
                    }
                    .frame(height: max(5, h * 0.03))
                    .padding(.horizontal, w * 0.06)
                    .padding(.bottom, h * 0.02)
                    .accessibilityHidden(true)
                    HStack(spacing: w * 0.03) {
                        if ritual.awaitingStart {
                            // floss or rinse waits for this tap (Skip and End are under the "…")
                            Button(action: onStart) {
                                Label(WatchCopy.word(ritual.stage == .rinse ? .rinse : .floss, lang), systemImage: "play.fill")
                                    .labelStyle(.titleAndIcon)
                                    .font(WatchLook.font(w * 0.1))
                                    .foregroundStyle(dim ? WatchLook.gold : WatchLook.purple)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.5)
                                    .padding(.horizontal, w * 0.03)
                                    .frame(maxWidth: .infinity, minHeight: button)
                                    .background(RoundedRectangle(cornerRadius: w * 0.06, style: .continuous).fill(dim ? Color.clear : WatchLook.gold))
                                    .overlay(RoundedRectangle(cornerRadius: w * 0.06, style: .continuous).strokeBorder(dim ? WatchLook.gold : Color.clear, lineWidth: 1.5))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(WatchCopy.word(.start, lang) + ", " + WatchCopy.word(ritual.stage == .rinse ? .rinse : .floss, lang))
                        } else if ritual.paused {
                            // paused: one big Resume (the "…" still holds End); an outline in Always On
                            Button(action: onResume) {
                                Label(WatchCopy.word(.resume, lang), systemImage: "play.fill")
                                    .labelStyle(.titleAndIcon)
                                    .font(WatchLook.font(w * 0.1))
                                    .foregroundStyle(dim ? WatchLook.gold : WatchLook.purple)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.5)
                                    .padding(.horizontal, w * 0.03)
                                    .frame(maxWidth: .infinity, minHeight: button)
                                    .background(RoundedRectangle(cornerRadius: w * 0.06, style: .continuous).fill(dim ? Color.clear : WatchLook.gold))
                                    .overlay(RoundedRectangle(cornerRadius: w * 0.06, style: .continuous).strokeBorder(dim ? WatchLook.gold : Color.clear, lineWidth: 1.5))
                            }
                            .buttonStyle(.plain)
                        } else {
                            // one big word; a long one ("Zwischen den Zähnen") may take two lines
                            Text(bigWord(ritual, phase, lang))
                                .font(WatchLook.font(w * 0.12))
                                .foregroundStyle(wordColor(ritual, phase).opacity(dim ? 0.85 : 1))
                                .lineLimit(2)
                                .minimumScaleFactor(0.5)
                                .multilineTextAlignment(.leading)
                                .padding(.horizontal, w * 0.04)
                                .frame(maxWidth: .infinity, minHeight: button, alignment: .leading)
                                .background(RoundedRectangle(cornerRadius: w * 0.06, style: .continuous).fill(dim ? Color.clear : WatchLook.pill))
                                .overlay(RoundedRectangle(cornerRadius: w * 0.06, style: .continuous).strokeBorder(dim ? WatchLook.idle : Color.clear, lineWidth: 1))
                                .accessibilityHidden(true)
                        }
                        // quiet while brushing, so it does not draw curious taps away from the mouth
                        Button(action: onMore) {
                            Image(systemName: "ellipsis")
                                .font(.system(size: w * 0.08, weight: .heavy))
                                .foregroundStyle(WatchLook.lavender.opacity(dim ? 0.7 : 1))
                                .frame(width: button, height: button)
                                .background(RoundedRectangle(cornerRadius: w * 0.06, style: .continuous).fill(dim ? Color.clear : WatchLook.panel))
                                .overlay(RoundedRectangle(cornerRadius: w * 0.06, style: .continuous).strokeBorder(MouthMap.idleLine.opacity(dim ? 0.6 : 1), lineWidth: 1.5))
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
    /// quarter: from the quarter's last 3-2-1 to 2 s into the next (and the first 2 s; the face only
    /// changes on whole seconds). It stays back while paused, for floss and for the rinse.
    func zoomedIn(_ r: WatchRitual) -> Bool {
        guard !r.paused, r.stage == .brushing else { return false }
        let quarter = WatchRitual.brushSec / 4
        let t = r.stageElapsed.truncatingRemainder(dividingBy: quarter)
        return t >= 2 && t < quarter - 3
    }

    /// The first moments of each stage show its name in a card, so floss never just "starts".
    func stageCard(_ r: WatchRitual) -> WatchWord? {
        guard !r.paused, r.stageElapsed < 2.5 else { return nil }
        switch r.stage {
        case .brushing: return .brush
        case .floss: return .floss
        case .rinse: return .rinse
        case .done: return nil
        }
    }

    func cameraFocus(_ r: WatchRitual, _ p: BrushPhaseState) -> MouthMap.Focus {
        r.stage == .brushing ? .quarter(p.quadrant) : .whole
    }

    /// While pulled back before a new quarter, the next one (Q2-Q4) gets a faint "here next" outline.
    func nextQuarter(_ r: WatchRitual, _ p: BrushPhaseState) -> BrushQuadrant? {
        guard r.stage == .brushing, !r.paused else { return nil }
        let quarter = WatchRitual.brushSec / 4
        guard r.stageElapsed.truncatingRemainder(dividingBy: quarter) >= quarter - 3 else { return nil }
        return BrushQuadrant(rawValue: p.quadrant.rawValue + 1)
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

    /// The brush's tooth: one a second through each 10 s surface, reaching the back molar every time.
    /// It keeps stepping in Always On (the dimmed face is what a brushing child sees most), just
    /// without the glide.
    func brushTooth(_ r: WatchRitual, _ p: BrushPhaseState) -> Int? {
        guard r.stage == .brushing else { return nil }
        return MouthPacer.tooth(atSurfaceSecond: p.phaseElapsedSec)
    }

    func mapMode(_ r: WatchRitual, _ p: BrushPhaseState) -> MouthMap.Mode {
        switch r.stage {
        case .brushing: return .brushing(quadrant: p.quadrant, surface: p.surface, doneMask: p.completedQuadrantsMask, next: nextQuarter(r, p))
        case .floss: return .floss(upper: p.flossIsUpper, contact: p.flossContactIndex)
        case .rinse: return .rinse(step: p.mouthwashStepIndex)
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
    let onFloss: () -> Void
    let onClose: () -> Void
    /// Off only for rendering checks (a Mac snapshot cannot draw a scrolling view).
    let scrollable: Bool

    public init(state: WatchFaceState, armed: String?, onPause: @escaping () -> Void, onNext: @escaping () -> Void, onSkip: @escaping () -> Void, onEnd: @escaping () -> Void, onClose: @escaping () -> Void, onFloss: @escaping () -> Void = {}, scrollable: Bool = true) {
        self.onFloss = onFloss
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
        // on a Start card nothing runs: no Pause, no Done (Start is on the face; Skip and End stay)
        let waiting = state.ritual?.awaitingStart ?? false
        return VStack(spacing: 8) {
                if !waiting {
                    BigButton(title: WatchCopy.word(paused ? .resume : .pause, lang), style: .tile, action: onPause)
                }
                // While brushing, a deliberate two-tap "Floss" moves on early. Done and Skip are only
                // for floss and rinse; anyone without a floss pick just skips it.
                if stage == .brushing && !paused {
                    BigButton(title: armed == "floss" ? WatchCopy.word(.tapAgain, lang) : WatchCopy.word(.floss, lang), style: .tile, action: onFloss)
                }
                if stage == .floss || stage == .rinse {
                    if !waiting {
                        BigButton(title: armed == "next" ? WatchCopy.word(.tapAgain, lang) : WatchCopy.word(.done, lang), action: onNext)
                    }
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

/// The mouth's tooth and gap layouts for the last size drawn. The mouth redraws on every frame of a
/// camera move and a pacer on every frame of its glide (the watch, the iPad and Duo overview), and
/// the layout only changes with the size, so the teeth, their outlines and the camera's framing are
/// built once instead of every frame. Locked, because a Canvas may draw off the main thread.
final class PacerGeometryCache: @unchecked Sendable {
    static let shared = PacerGeometryCache()

    /// One quarter at one size: its seven teeth, their outlines, and the box the camera frames
    /// when it is close on them.
    struct Quarter {
        let size: CGSize
        let unit: Double
        let teeth: [MouthMap.Tooth]
        let outlines: [Path]
        let box: CGRect
    }

    private let lock = NSLock()
    private var quarterBy: [BrushQuadrant: Quarter] = [:]
    private var gapsBy: [Bool: (size: CGSize, unit: Double, gaps: [MouthMap.Gap])] = [:]

    func quarter(_ q: BrushQuadrant, in size: CGSize, unit u: Double) -> Quarter {
        lock.lock()
        defer { lock.unlock() }
        if let hit = quarterBy[q], hit.size == size, hit.unit == u { return hit }
        let teeth = MouthMap.teeth(q, in: size, unit: u)
        let outlines = teeth.map(MouthMap.outline)
        var box = CGRect.null
        for path in outlines { box = box.union(path.boundingRect) }
        let built = Quarter(size: size, unit: u, teeth: teeth, outlines: outlines, box: box.insetBy(dx: -u * 0.1, dy: -u * 0.1))
        quarterBy[q] = built
        return built
    }

    func teeth(_ q: BrushQuadrant, in size: CGSize, unit u: Double) -> [MouthMap.Tooth] {
        quarter(q, in: size, unit: u).teeth
    }

    func gaps(upper: Bool, size: CGSize, unit u: Double, build: () -> [MouthMap.Gap]) -> [MouthMap.Gap] {
        lock.lock()
        if let hit = gapsBy[upper], hit.size == size, hit.unit == u {
            lock.unlock()
            return hit.gaps
        }
        lock.unlock()
        let gaps = build()
        lock.lock()
        gapsBy[upper] = (size, u, gaps)
        lock.unlock()
        return gaps
    }
}

