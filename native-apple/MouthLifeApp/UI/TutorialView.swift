import MouthLifeCore
import SwiftUI

// The How to Play guide: one card at a time, each with a small looping demo.
// Tapping a demo plays it again with the game's own sound, so the player links the control to what
// it does. The demos are plain shapes moved by `TutorialMotion`, and hold still with Reduce Motion.
// The web edition shows the same cards (`src/ui/TutorialOverlay.ts`).

public struct TutorialView: View {
    public let scheme: TutorialInputScheme
    public let reduceMotion: Bool
    public let onDemoSound: (TutorialPageId) -> Void
    public let onPageTurn: () -> Void
    public let onClose: () -> Void

    @State private var pageIndex: Int = 0
    @State private var demoStart: Date = Date()
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion

    public init(
        scheme: TutorialInputScheme = TutorialView.platformScheme,
        reduceMotion: Bool,
        onDemoSound: @escaping (TutorialPageId) -> Void,
        onPageTurn: @escaping () -> Void,
        onClose: @escaping () -> Void
    ) {
        self.scheme = scheme
        self.reduceMotion = reduceMotion
        self.onDemoSound = onDemoSound
        self.onPageTurn = onPageTurn
        self.onClose = onClose
    }

    /// Fingers on iPhone and iPad, the pointer on a Mac.
    public static var platformScheme: TutorialInputScheme {
        #if os(macOS)
        return .mouse
        #else
        return .touch
        #endif
    }

    private var pages: [TutorialPage] { TutorialGuide.pages }
    private var page: TutorialPage { pages[min(max(pageIndex, 0), pages.count - 1)] }
    private var isFirst: Bool { pageIndex <= 0 }
    private var isLast: Bool { pageIndex >= pages.count - 1 }
    private var holdStill: Bool { reduceMotion || systemReduceMotion }

    public var body: some View {
        ZStack {
            Color.black.opacity(0.62)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { onClose() }

            // Upright phones get the tall card; a phone on its side gets the wide one.
            ViewThatFits(in: .vertical) {
                tallCard
                wideCard
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .accessibilityAddTraits(.isModal)
    }

    private var tallCard: some View {
        VStack(spacing: 12) {
            topRow
            stage
            copyBlock
            dots
            navRow
        }
        .frame(maxWidth: 304)
        .mlGlassCard(cornerRadius: 28, borderColor: Color.white.opacity(0.12), padding: 18)
        .gesture(swipe)
    }

    private var wideCard: some View {
        VStack(spacing: 8) {
            topRow
            HStack(alignment: .center, spacing: 16) {
                stage
                VStack(spacing: 10) {
                    copyBlock
                    dots
                    navRow
                }
                .frame(maxWidth: 300)
            }
        }
        .mlGlassCard(cornerRadius: 24, borderColor: Color.white.opacity(0.12), padding: 14)
        .gesture(swipe)
    }

    private var topRow: some View {
        HStack {
            Text("\(pageIndex + 1) / \(pages.count)")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(MLTheme.textMuted)
                .accessibilityHidden(true)
            Spacer(minLength: 8)
            if !isLast {
                Button {
                    onClose()
                } label: {
                    Text(L10n.t(TutorialGuide.Copy.skip))
                        .font(.system(.subheadline, design: .rounded, weight: .semibold))
                        .foregroundStyle(MLTheme.cyanAccent)
                        .padding(.vertical, 6)
                        .padding(.leading, 12)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(minHeight: 30)
    }

    private var stage: some View {
        Button {
            demoStart = Date()
            onDemoSound(page.id)
        } label: {
            TutorialDemoStage(pageId: page.id, start: demoStart, holdStill: holdStill)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(L10n.t(TutorialGuide.Copy.replayDemo)))
    }

    private var copyBlock: some View {
        VStack(spacing: 8) {
            Text(L10n.t(page.title))
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundStyle(MLTheme.textPrimary)
                .multilineTextAlignment(.center)
            Text(L10n.t(page.body))
                .font(.system(size: 15.5, weight: .regular, design: .rounded))
                .foregroundStyle(MLTheme.textSecondary)
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
            hintRow
        }
        .frame(maxWidth: .infinity)
    }

    private var hintRow: some View {
        let hints = TutorialGuide.controls(for: page, scheme: scheme)
        return VStack(spacing: 6) {
            ForEach(Array(hints.enumerated()), id: \.offset) { _, hint in
                HStack(spacing: 6) {
                    ForEach(Array(hint.keys.enumerated()), id: \.offset) { _, key in
                        Text(key)
                            .font(.system(size: 12, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.white)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .fill(Color.white.opacity(0.12))
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .strokeBorder(Color.white.opacity(0.30), lineWidth: 1)
                            )
                    }
                    Text(L10n.t(hint.label))
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundStyle(MLTheme.textPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Capsule().fill(Color.white.opacity(0.07)))
            }
        }
        .frame(minHeight: 30)
    }

    private var dots: some View {
        HStack(spacing: 7) {
            ForEach(0..<pages.count, id: \.self) { idx in
                Circle()
                    .fill(Color.white.opacity(idx == pageIndex ? 1.0 : 0.24))
                    .frame(width: 7, height: 7)
            }
        }
        .accessibilityHidden(true)
    }

    private var navRow: some View {
        HStack(spacing: 10) {
            Button {
                turn(-1)
            } label: {
                Text(L10n.t(TutorialGuide.Copy.back))
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(MLTheme.cyanAccent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.plain)
            .opacity(isFirst ? 0 : 1)
            .disabled(isFirst)

            Button {
                turn(1)
            } label: {
                Text(L10n.t(isLast ? TutorialGuide.Copy.done : TutorialGuide.Copy.next))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.cyanAccent, darkText: true))
        }
    }

    private var swipe: some Gesture {
        DragGesture(minimumDistance: 24)
            .onEnded { value in
                let dx = value.translation.width
                let dy = value.translation.height
                guard abs(dx) > 56, abs(dx) > abs(dy) * 1.6 else { return }
                turn(dx < 0 ? 1 : -1)
            }
    }

    private func turn(_ delta: Int) {
        let next = pageIndex + delta
        if next < 0 { return }
        if next >= pages.count {
            onClose()
            return
        }
        onPageTurn()
        withAnimation(.easeInOut(duration: 0.2)) {
            pageIndex = next
        }
        demoStart = Date()
    }
}

// MARK: - Home screen entry points

/// The round ? that opens the guide. It sits just above the Home screen's bottom deck.
public struct TutorialHelpButton: View {
    public let action: () -> Void

    public init(action: @escaping () -> Void) {
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Image(systemName: "questionmark")
                .font(.system(size: 18, weight: .heavy, design: .rounded))
                .foregroundStyle(MLTheme.textPrimary)
                .frame(width: 44, height: 44)
                .background(Circle().fill(MLTheme.cardElevated))
                .overlay(Circle().strokeBorder(MLTheme.mintClean.opacity(0.6), lineWidth: 1.2))
                .shadow(color: Color.black.opacity(0.35), radius: 8, x: 0, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(L10n.t(TutorialGuide.Copy.buttonLabel)))
    }
}

/// Shown on the first few launches: an offer, never a wall.
public struct TutorialOfferCard: View {
    public let onAccept: () -> Void
    public let onDecline: () -> Void

    public init(onAccept: @escaping () -> Void, onDecline: @escaping () -> Void) {
        self.onAccept = onAccept
        self.onDecline = onDecline
    }

    public var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.t(TutorialGuide.Copy.offerTitle))
                    .font(.system(.subheadline, design: .rounded, weight: .heavy))
                    .foregroundStyle(MLTheme.mintClean)
                Text(L10n.t(TutorialGuide.Copy.offerBody))
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(MLTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 4)
            Button {
                onDecline()
            } label: {
                Text(L10n.t(TutorialGuide.Copy.offerDecline))
                    .lineLimit(1)
                    .fixedSize()
            }
            .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.textSecondary))
            Button {
                onAccept()
            } label: {
                Text(L10n.t(TutorialGuide.Copy.offerAccept))
                    .lineLimit(1)
                    .fixedSize()
            }
            .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.mintClean, darkText: true))
        }
        .mlGlassCard(cornerRadius: 18, borderColor: MLTheme.mintClean.opacity(0.45), padding: 10)
    }
}

// MARK: - Demo stage

/// Draws one card's demo. Every scene is laid out on a 320 x 180 board (the same numbers as the web
/// edition's drawings) and scaled down to fit the card.
struct TutorialDemoStage: View {
    let pageId: TutorialPageId
    let start: Date
    let holdStill: Bool

    private static let boardWidth: CGFloat = 320
    private static let boardHeight: CGFloat = 180
    private static let shownWidth: CGFloat = 300

    var body: some View {
        let scale = Self.shownWidth / Self.boardWidth
        return TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: holdStill)) { timeline in
            scene(elapsed: holdStill ? nil : timeline.date.timeIntervalSince(start))
                .frame(width: Self.boardWidth, height: Self.boardHeight)
        }
        .scaleEffect(scale)
        .frame(width: Self.shownWidth, height: Self.boardHeight * scale)
        .background(
            LinearGradient(
                colors: [
                    Color(red: 0.063, green: 0.251, blue: 0.369),
                    Color(red: 0.027, green: 0.114, blue: 0.173)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    /// Loop position for a scene, or its resting pose when motion is off.
    private func phase(_ elapsed: Double?, period: Double, rest: Double) -> Double {
        guard let elapsed else { return rest }
        return TutorialMotion.loopPhase(elapsedSec: elapsed, periodSec: period)
    }

    @ViewBuilder
    private func scene(elapsed: Double?) -> some View {
        switch pageId {
        case .home:
            TutorialHomeScene(phase: phase(elapsed, period: 5.6, rest: 0.25))
        case .brush:
            TutorialBrushScene(phase: phase(elapsed, period: 6.0, rest: 0.08))
        case .dive:
            TutorialDiveScene(phase: phase(elapsed, period: 6.0, rest: 0.30))
        case .floss:
            TutorialFlossScene(phase: phase(elapsed, period: 3.6, rest: 0.50))
        case .surge:
            TutorialSurgeScene(phase: phase(elapsed, period: 4.8, rest: 0.60))
        case .scan:
            TutorialScanScene(phase: phase(elapsed, period: 4.4, rest: 0.50))
        case .cities:
            TutorialCitiesScene(phase: phase(elapsed, period: 6.4, rest: 0.50))
        case .ready:
            TutorialReadyScene(phase: phase(elapsed, period: 5.4, rest: 0.25))
        }
    }
}

private enum TutorialPalette {
    static let tooth = Color(red: 0.957, green: 0.984, blue: 1.0)
    static let toothDim = Color(red: 0.561, green: 0.663, blue: 0.722)
    static let gum = Color(red: 0.949, green: 0.545, blue: 0.659)
    static let mouth = Color(red: 0.290, green: 0.102, blue: 0.180)
    static let plaque = Color(red: 0.851, green: 0.890, blue: 0.357)
    static let robot = Color(red: 0.220, green: 0.741, blue: 0.973)
    static let floss = Color(red: 0.404, green: 0.910, blue: 0.976)
    static let mint = Color(red: 0.176, green: 0.831, blue: 0.749)
    static let gold = Color(red: 0.984, green: 0.749, blue: 0.141)
    static let sparkle = Color(red: 0.992, green: 0.902, blue: 0.541)
    static let dye = Color(red: 0.957, green: 0.447, blue: 0.714)
    static let ink = Color(red: 0.043, green: 0.165, blue: 0.239)
}

// MARK: - Scene parts (x and y are the top-left corner, as in the web drawings)

private struct TutorialTooth: View {
    let x: CGFloat
    let y: CGFloat
    let width: CGFloat
    let height: CGFloat
    let radius: CGFloat
    var color: Color = TutorialPalette.tooth

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(color)
            .frame(width: width, height: height)
            .position(x: x + width / 2, y: y + height / 2)
    }
}

private struct TutorialRobot: View {
    let x: Double
    let y: Double

    var body: some View {
        ZStack {
            Circle()
                .fill(TutorialPalette.robot.opacity(0.30))
                .frame(width: 30, height: 30)
            Circle()
                .fill(TutorialPalette.robot)
                .frame(width: 17, height: 17)
                .overlay(Circle().stroke(Color.white.opacity(0.9), lineWidth: 2.5))
        }
        .position(x: CGFloat(x), y: CGFloat(y))
    }
}

private struct TutorialBlob: View {
    let x: Double
    let y: Double
    var width: CGFloat = 30
    var height: CGFloat = 22
    var color: Color = TutorialPalette.plaque
    let opacity: Double

    var body: some View {
        Ellipse()
            .fill(color)
            .frame(width: width, height: height)
            .position(x: CGFloat(x), y: CGFloat(y))
            .opacity(min(1, max(0, opacity)))
    }
}

private struct TutorialSparkle: View {
    let x: CGFloat
    let y: CGFloat
    var size: CGFloat = 14
    /// 0 = hidden and small, 1 = bright and full size.
    let glow: Double

    var body: some View {
        let g = min(1, max(0, glow))
        return Image(systemName: "sparkle")
            .font(.system(size: size, weight: .bold))
            .foregroundStyle(TutorialPalette.sparkle)
            .scaleEffect(CGFloat(0.45 + 0.65 * g))
            .opacity(0.25 + 0.75 * g)
            .position(x: x, y: y)
    }
}

private struct TutorialMeter: View {
    let x: CGFloat
    let y: CGFloat
    let width: CGFloat
    let height: CGFloat
    /// 0...1
    let fill: Double
    let color: Color

    var body: some View {
        let f = CGFloat(min(1, max(0, fill)))
        return ZStack(alignment: .leading) {
            Capsule().fill(Color.white.opacity(0.16))
            Capsule().fill(color).frame(width: max(height, width * f))
        }
        .frame(width: width, height: height)
        .position(x: x + width / 2, y: y + height / 2)
    }
}

private struct TutorialRing: View {
    let x: CGFloat
    let y: CGFloat
    let diameter: Double
    let color: Color
    let opacity: Double

    var body: some View {
        Circle()
            .fill(color.opacity(0.14))
            .overlay(Circle().stroke(color, lineWidth: 3))
            .frame(width: CGFloat(diameter), height: CGFloat(diameter))
            .position(x: x, y: y)
            .opacity(min(1, max(0, opacity)))
    }
}

// MARK: - The scenes, one per card

/// Home: a finger rubs the teeth; the two games wait at the bottom.
private struct TutorialHomeScene: View {
    let phase: Double

    var body: some View {
        let there = phase < 0.5 ? phase * 2 : (1 - phase) * 2
        let fingerX = 72 + 176 * TutorialMotion.ease(there)
        let pillA = 0.55 + 0.45 * TutorialMotion.window(phase, 0.0, 0.12, 0.25, 0.45)
        let pillB = 0.55 + 0.45 * TutorialMotion.window(phase, 0.5, 0.62, 0.75, 0.95)
        return ZStack {
            TutorialTooth(x: 44, y: 22, width: 232, height: 34, radius: 17, color: TutorialPalette.gum)
            ForEach(0..<6, id: \.self) { i in
                TutorialTooth(x: 55 + CGFloat(i) * 36, y: 44, width: 30, height: 50, radius: 10)
            }
            TutorialSparkle(x: 88, y: 34, glow: TutorialMotion.twinkle(phase * 3))
            TutorialSparkle(x: 160, y: 28, size: 17, glow: TutorialMotion.twinkle(phase * 3 + 0.33))
            TutorialSparkle(x: 232, y: 34, glow: TutorialMotion.twinkle(phase * 3 + 0.66))
            Circle()
                .fill(TutorialPalette.robot.opacity(0.42))
                .overlay(Circle().stroke(Color(red: 0.008, green: 0.518, blue: 0.780), lineWidth: 2.5))
                .frame(width: 26, height: 26)
                .position(x: CGFloat(fingerX), y: 72)
            gamePill(symbol: "🪥", x: 108, glow: pillA)
            gamePill(symbol: "🚀", x: 212, glow: pillB)
        }
    }

    private func gamePill(symbol: String, x: CGFloat, glow: Double) -> some View {
        Text(symbol)
            .font(.system(size: 18))
            .frame(width: 92, height: 36)
            .background(Capsule().fill(Color.white.opacity(0.10)))
            .overlay(Capsule().strokeBorder(Color.white.opacity(0.30), lineWidth: 1.5))
            .opacity(glow)
            .position(x: x, y: 142)
    }
}

/// 2-Min Brush: the glow moves round the mouth, and a chime marks each move.
/// The order is the coach's: top right, top left, bottom left, bottom right, as in a mirror.
private struct TutorialBrushScene: View {
    let phase: Double

    private static let quarterStartDeg: [Double] = [-90, -180, 90, 0]

    var body: some View {
        let quarterTime = phase * 4
        let active = min(3, Int(quarterTime))
        let local = quarterTime - Double(active)
        let lit = local < 0.92
        let noteGlow = TutorialMotion.window(local, 0.0, 0.14, 0.45, 0.75)
        let noteRise = 12 * TutorialMotion.ramp(local, 0.14, 0.75)
        return ZStack {
            Ellipse()
                .fill(TutorialPalette.mouth)
                .frame(width: 156, height: 116)
                .position(x: 160, y: 86)
            ForEach(0..<16, id: \.self) { n in
                brushTooth(index: n, isLit: lit && (n / 4) == active)
            }
            Text("🪥")
                .font(.system(size: 34))
                .position(x: 160, y: 86)
            Text("♪")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundStyle(TutorialPalette.sparkle)
                .opacity(noteGlow)
                .position(x: 196, y: CGFloat(62 - noteRise))
        }
    }

    private func brushTooth(index: Int, isLit: Bool) -> some View {
        let quarter = index / 4
        let slot = index % 4
        let degrees = Self.quarterStartDeg[quarter] + 11.25 + Double(slot) * 22.5
        let radians = degrees * Double.pi / 180
        let cx = 160 + cos(radians) * 78
        let cy = 86 + sin(radians) * 58
        return Circle()
            .fill(isLit ? Color.white : TutorialPalette.toothDim)
            .overlay(Circle().stroke(TutorialPalette.mint, lineWidth: isLit ? 4 : 0))
            .frame(width: 21, height: 21)
            .position(x: CGFloat(cx), y: CGFloat(cy))
    }
}

/// Dive: the robot scrubs each patch of plaque, and the bar climbs to 90%.
private struct TutorialDiveScene: View {
    let phase: Double

    private static let blobs: [(x: Double, y: Double, at: Double)] = [
        (108, 50, 0.14),
        (156, 42, 0.28),
        (206, 56, 0.42),
        (192, 98, 0.56),
        (124, 96, 0.70)
    ]
    private static let path: [TutorialMotion.Stop] = [
        TutorialMotion.Stop(at: 0.00, x: 92, y: 118),
        TutorialMotion.Stop(at: 0.14, x: 108, y: 50),
        TutorialMotion.Stop(at: 0.28, x: 156, y: 42),
        TutorialMotion.Stop(at: 0.42, x: 206, y: 56),
        TutorialMotion.Stop(at: 0.56, x: 192, y: 98),
        TutorialMotion.Stop(at: 0.70, x: 124, y: 96),
        TutorialMotion.Stop(at: 0.86, x: 124, y: 96),
        TutorialMotion.Stop(at: 1.00, x: 92, y: 118)
    ]

    var body: some View {
        let robot = TutorialMotion.along(phase, stops: Self.path)
        let comeBack = TutorialMotion.ramp(phase, 0.94, 1.0)
        let done = phase >= 0.73 && phase < 0.94
        let progress = phase >= 0.94 ? 0.1 : 0.1 + 0.9 * TutorialMotion.ramp(phase, 0.12, 0.73)
        return ZStack {
            TutorialTooth(x: 70, y: 14, width: 180, height: 118, radius: 36)
            ForEach(0..<Self.blobs.count, id: \.self) { i in
                let blob = Self.blobs[i]
                TutorialBlob(
                    x: blob.x,
                    y: blob.y,
                    opacity: 1 - TutorialMotion.ramp(phase, blob.at - 0.02, blob.at + 0.03) + comeBack
                )
            }
            TutorialRobot(x: robot.x, y: robot.y)
            TutorialMeter(
                x: 84,
                y: 150,
                width: 130,
                height: 9,
                fill: progress,
                color: done ? TutorialPalette.gold : TutorialPalette.mint
            )
            Text("90%")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundStyle(TutorialPalette.gold)
                .position(x: 236, y: 154)
        }
    }
}

/// Floss: a thread shoots through the gap and clears it.
private struct TutorialFlossScene: View {
    let phase: Double

    private static let dots: [(y: Double, at: Double)] = [(104, 0.29), (80, 0.31), (56, 0.33)]

    var body: some View {
        let reach = TutorialMotion.ramp(phase, 0.26, 0.36)
        let lineHeight = 134 * reach
        let lineGlow = 1 - TutorialMotion.ramp(phase, 0.60, 0.76)
        let kick = 5 * TutorialMotion.window(phase, 0.26, 0.31, 0.31, 0.42)
        let comeBack = TutorialMotion.ramp(phase, 0.92, 1.0)
        return ZStack {
            TutorialTooth(x: 70, y: 26, width: 83, height: 106, radius: 28)
            TutorialTooth(x: 167, y: 26, width: 83, height: 106, radius: 28)
            ForEach(0..<Self.dots.count, id: \.self) { i in
                let dot = Self.dots[i]
                TutorialBlob(
                    x: 160,
                    y: dot.y,
                    width: 11,
                    height: 11,
                    opacity: 1 - TutorialMotion.ramp(phase, dot.at, dot.at + 0.03) + comeBack
                )
            }
            Rectangle()
                .fill(TutorialPalette.floss)
                .frame(width: 3, height: CGFloat(max(0.5, lineHeight)))
                .position(x: 160, y: CGFloat(150 - lineHeight / 2))
                .opacity(reach > 0 ? lineGlow : 0)
            TutorialSparkle(x: 160, y: 20, size: 16, glow: TutorialMotion.window(phase, 0.36, 0.46, 0.46, 0.66))
                .opacity(phase > 0.36 && phase < 0.66 ? 1 : 0)
            TutorialRobot(x: 160, y: 158 + kick)
        }
    }
}

/// Surge: the meter fills, then a wave washes the tooth clean.
private struct TutorialSurgeScene: View {
    let phase: Double

    private static let blobs: [(x: Double, y: Double)] = [
        (112, 62), (150, 50), (206, 64), (202, 110), (150, 122), (110, 104)
    ]

    var body: some View {
        let full = phase >= 0.45 && phase < 0.52
        let meter = phase < 0.45 ? 0.04 + 0.96 * TutorialMotion.ramp(phase, 0.0, 0.44) : (full ? 1.0 : 0.04)
        let spread = TutorialMotion.ease(TutorialMotion.ramp(phase, 0.50, 0.78))
        let ringGlow = phase < 0.49 ? 0.0 : 1 - TutorialMotion.ramp(phase, 0.52, 0.78)
        let plaque = 1 - TutorialMotion.ramp(phase, 0.55, 0.66) + TutorialMotion.ramp(phase, 0.93, 1.0)
        return ZStack {
            TutorialTooth(x: 70, y: 30, width: 180, height: 118, radius: 36)
            ForEach(0..<Self.blobs.count, id: \.self) { i in
                TutorialBlob(x: Self.blobs[i].x, y: Self.blobs[i].y, width: 26, height: 20, opacity: plaque)
            }
            TutorialRing(x: 160, y: 88, diameter: 24 * (0.9 + 7.6 * spread), color: TutorialPalette.mint, opacity: ringGlow)
            TutorialRobot(x: 160, y: 88)
            TutorialMeter(
                x: 100,
                y: 8,
                width: 120,
                height: 10,
                fill: meter,
                color: full ? TutorialPalette.gold : TutorialPalette.mint
            )
        }
    }
}

/// Dye Scan: a pink wave shows plaque that was hard to see.
private struct TutorialScanScene: View {
    let phase: Double

    private static let blobs: [(x: Double, y: Double)] = [
        (108, 68), (156, 60), (206, 74), (192, 116), (124, 114)
    ]

    var body: some View {
        let spread = TutorialMotion.ease(TutorialMotion.ramp(phase, 0.12, 0.56))
        let ringGlow = phase < 0.10 ? 0.0 : 1 - TutorialMotion.ramp(phase, 0.20, 0.56)
        let shown = TutorialMotion.window(phase, 0.20, 0.36, 0.84, 0.96)
        return ZStack {
            TutorialTooth(x: 70, y: 30, width: 180, height: 118, radius: 36)
            ForEach(0..<Self.blobs.count, id: \.self) { i in
                TutorialBlob(x: Self.blobs[i].x, y: Self.blobs[i].y, color: TutorialPalette.dye, opacity: shown)
            }
            TutorialRing(x: 160, y: 92, diameter: 24 * (0.9 + 7.6 * spread), color: TutorialPalette.dye, opacity: ringGlow)
            TutorialRobot(x: 160, y: 92)
        }
    }
}

/// Cities: the route reaches one city after another, and each lights up as it unlocks.
private struct TutorialCitiesScene: View {
    let phase: Double

    /// Where each city sits, and the moment in the loop the route reaches it.
    private static let pins: [(x: Double, y: Double, at: Double)] = [
        (118, 66, 0.0),
        (150, 98, 0.203),
        (198, 84, 0.338),
        (172, 118, 0.454),
        (226, 36, 0.72)
    ]

    var body: some View {
        let drawn = phase >= 0.94
            ? 1 - TutorialMotion.ramp(phase, 0.94, 1.0)
            : TutorialMotion.ramp(phase, 0.08, 0.72)
        return ZStack {
            Circle()
                .fill(Color(red: 0.043, green: 0.365, blue: 0.541))
                .overlay(Circle().stroke(Color.white.opacity(0.35), lineWidth: 2))
                .frame(width: 144, height: 144)
                .position(x: 160, y: 92)
            land(x: 132, y: 70, width: 52, height: 32)
            land(x: 186, y: 96, width: 60, height: 36)
            land(x: 146, y: 126, width: 36, height: 20)
            Path { path in
                path.move(to: CGPoint(x: Self.pins[0].x, y: Self.pins[0].y))
                for i in 1..<Self.pins.count {
                    path.addLine(to: CGPoint(x: Self.pins[i].x, y: Self.pins[i].y))
                }
            }
            .trim(from: 0, to: CGFloat(drawn))
            .stroke(TutorialPalette.gold, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
            ForEach(0..<Self.pins.count, id: \.self) { i in
                cityPin(index: i)
            }
        }
    }

    private func land(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat) -> some View {
        Ellipse()
            .fill(Color(red: 0.184, green: 0.620, blue: 0.431))
            .frame(width: width, height: height)
            .position(x: x, y: y)
    }

    private func cityPin(index: Int) -> some View {
        let pin = Self.pins[index]
        let isOpen = index == 0 || (phase >= pin.at && phase < 0.97)
        let pop = index == 0 ? 0.0 : TutorialMotion.window(phase, pin.at, pin.at + 0.02, pin.at + 0.02, pin.at + 0.08)
        return Circle()
            .fill(isOpen ? TutorialPalette.gold : TutorialPalette.toothDim)
            .overlay(Circle().stroke(TutorialPalette.ink, lineWidth: 2))
            .frame(width: 14, height: 14)
            .scaleEffect(CGFloat(1 + 0.5 * pop))
            .position(x: CGFloat(pin.x), y: CGFloat(pin.y))
    }
}

/// Ready: a happy tooth, and where to find the guide again.
private struct TutorialReadyScene: View {
    let phase: Double

    var body: some View {
        let badge = 1 + 0.14 * TutorialMotion.twinkle(phase * 3)
        return ZStack {
            TutorialTooth(x: 131, y: 94, width: 22, height: 46, radius: 11)
            TutorialTooth(x: 167, y: 94, width: 22, height: 46, radius: 11)
            TutorialTooth(x: 114, y: 32, width: 92, height: 84, radius: 34)
            Circle().fill(TutorialPalette.ink).frame(width: 9, height: 9).position(x: 143, y: 68)
            Circle().fill(TutorialPalette.ink).frame(width: 9, height: 9).position(x: 177, y: 68)
            Path { path in
                path.move(to: CGPoint(x: 144, y: 84))
                path.addQuadCurve(to: CGPoint(x: 176, y: 84), control: CGPoint(x: 160, y: 98))
            }
            .stroke(TutorialPalette.ink, style: StrokeStyle(lineWidth: 4, lineCap: .round))
            TutorialSparkle(x: 84, y: 50, size: 18, glow: TutorialMotion.twinkle(phase * 3))
            TutorialSparkle(x: 238, y: 112, size: 15, glow: TutorialMotion.twinkle(phase * 3 + 0.33))
            TutorialSparkle(x: 92, y: 124, size: 12, glow: TutorialMotion.twinkle(phase * 3 + 0.66))
            Text("?")
                .font(.system(size: 22, weight: .heavy, design: .rounded))
                .foregroundStyle(Color.white)
                .frame(width: 34, height: 34)
                .background(Circle().fill(Color(red: 0.008, green: 0.518, blue: 0.780)))
                .overlay(Circle().stroke(Color.white.opacity(0.9), lineWidth: 2))
                .scaleEffect(CGFloat(badge))
                .position(x: 240, y: 44)
        }
    }
}
