import MouthLifeCore
import SwiftUI
#if canImport(UIKit)
import UIKit
private typealias TutorialPlatformImage = UIImage
#elseif canImport(AppKit)
import AppKit
private typealias TutorialPlatformImage = NSImage
#endif

// The How to Play guide: one card at a time.
//
// Most cards show real pictures of the game, photographed from the running game and played one
// after another like a flipbook (the bundled `guide` folder, shared with the web edition). Two cards
// are field guides: a real close-up of each thing on the tooth, its name, and what to do about it.
// One card shows the on-screen controls. Tapping a flipbook plays it again with that control's own
// game sound, and Reduce Motion holds every picture still.
// The web edition shows the same cards (`src/ui/TutorialOverlay.ts`).

public struct TutorialView: View {
    public let scheme: TutorialInputScheme
    public let reduceMotion: Bool
    public let onDemoSound: (TutorialPageId) -> Void
    public let onPageTurn: () -> Void
    public let onClose: () -> Void

    @State private var pageIndex: Int
    @State private var demoStart: Date = Date()
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion

    public init(
        startPage: TutorialPageId = .home,
        scheme: TutorialInputScheme = TutorialView.platformScheme,
        reduceMotion: Bool,
        onDemoSound: @escaping (TutorialPageId) -> Void,
        onPageTurn: @escaping () -> Void,
        onClose: @escaping () -> Void
    ) {
        _pageIndex = State(initialValue: TutorialGuide.pageIndex(of: startPage))
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
            if page.isList {
                titleBlock
                rowsBlock(compact: false)
            } else {
                stage
                titleBlock
                hintRow
            }
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
                if page.isList {
                    rowsBlock(compact: true)
                        .frame(maxWidth: 300)
                } else {
                    stage
                }
                VStack(spacing: 10) {
                    titleBlock
                    if !page.isList {
                        hintRow
                    }
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
            TutorialDemoStage(page: page, start: demoStart, holdStill: holdStill)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(L10n.t(TutorialGuide.Copy.replayDemo)))
    }

    private var titleBlock: some View {
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
        }
        .frame(maxWidth: .infinity)
    }

    private var hintRow: some View {
        let hints = TutorialGuide.controls(for: page, scheme: scheme)
        return VStack(spacing: 6) {
            ForEach(Array(hints.enumerated()), id: \.offset) { _, hint in
                HStack(spacing: 6) {
                    TutorialKeycaps(keys: hint.keys)
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

    /// Field guides show a real close-up per row; the controls card shows the on-screen button.
    private func rowsBlock(compact: Bool) -> some View {
        let side: CGFloat = compact ? 36 : 50
        return VStack(spacing: compact ? 4 : 7) {
            ForEach(page.rows) { row in
                TutorialRowView(name: row.name, tip: row.tip, compact: compact) {
                    TutorialPicture(name: row.image)
                        .frame(width: side, height: side)
                        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                }
            }
            ForEach(page.buttonRows) { row in
                TutorialRowView(name: row.name, tip: row.tip, compact: compact) {
                    TutorialButtonPicture(action: row.action, scheme: scheme)
                        .frame(minWidth: side, minHeight: side)
                }
            }
        }
    }

    private var dots: some View {
        HStack(spacing: 6) {
            ForEach(0..<pages.count, id: \.self) { idx in
                Circle()
                    .fill(Color.white.opacity(idx == pageIndex ? 1.0 : 0.24))
                    .frame(width: 6, height: 6)
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

// MARK: - Real pictures of the game

/// Loads the guide's pictures from the bundled `guide` folder, once each.
enum TutorialGuideImages {
    private static let cache = NSCache<NSString, TutorialPlatformImage>()

    static func image(named name: String) -> Image? {
        let key = name as NSString
        if let hit = cache.object(forKey: key) {
            return wrap(hit)
        }
        let bundle = Bundle.main
        guard let url = bundle.url(forResource: name, withExtension: "jpg", subdirectory: "guide")
            ?? bundle.url(forResource: name, withExtension: "jpg") else {
            return nil
        }
        guard let loaded = load(url) else { return nil }
        cache.setObject(loaded, forKey: key)
        return wrap(loaded)
    }

    private static func load(_ url: URL) -> TutorialPlatformImage? {
        #if canImport(UIKit)
        return UIImage(contentsOfFile: url.path)
        #elseif canImport(AppKit)
        return NSImage(contentsOf: url)
        #endif
    }

    private static func wrap(_ image: TutorialPlatformImage) -> Image {
        #if canImport(UIKit)
        return Image(uiImage: image)
        #elseif canImport(AppKit)
        return Image(nsImage: image)
        #endif
    }
}

/// One real picture, filling whatever frame it is given.
struct TutorialPicture: View {
    let name: String

    var body: some View {
        if let image = TutorialGuideImages.image(named: name) {
            image
                .resizable()
                .scaledToFill()
        } else {
            Color(red: 0.027, green: 0.114, blue: 0.173)
        }
    }
}

/// The picture area of a card: a flipbook of real game frames, or the closing card's drawing.
struct TutorialDemoStage: View {
    let page: TutorialPage
    let start: Date
    let holdStill: Bool

    private static let shownWidth: CGFloat = 300
    private static let shownHeight: CGFloat = 169

    var body: some View {
        ZStack {
            if page.frames.isEmpty {
                drawing
            } else if holdStill {
                picture(page.frames[TutorialGuide.stillFrameIndex(count: min(3, page.frames.count))])
            } else {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                    flipbook(elapsed: timeline.date.timeIntervalSince(start))
                }
            }
        }
        .frame(width: Self.shownWidth, height: Self.shownHeight)
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

    private func picture(_ name: String) -> some View {
        TutorialPicture(name: name)
            .frame(width: Self.shownWidth, height: Self.shownHeight)
            .clipped()
    }

    /// Up to three real frames taking turns. A single frame simply drifts a little closer.
    private func flipbook(elapsed: Double) -> some View {
        let frames = Array(page.frames.prefix(3))
        let opacities = TutorialGuide.flipbookOpacities(count: frames.count, elapsedSec: elapsed)
        let drift = frames.count == 1 ? 1 + 0.07 * TutorialMotion.twinkle(elapsed / 18) : 1.0
        return ZStack {
            ForEach(Array(frames.enumerated()), id: \.offset) { index, name in
                let shown = index < opacities.count ? opacities[index] : 0
                picture(name)
                    .opacity(shown)
                    .zIndex(shown < 1 ? 1 : 0)
            }
        }
        .scaleEffect(CGFloat(drift))
    }

    private var drawing: some View {
        let scale = Self.shownWidth / 320
        return TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: holdStill)) { timeline in
            TutorialReadyScene(
                phase: holdStill
                    ? 0.25
                    : TutorialMotion.loopPhase(elapsedSec: timeline.date.timeIntervalSince(start), periodSec: 5.4)
            )
            .frame(width: 320, height: 180)
        }
        .scaleEffect(scale)
    }
}

// MARK: - Field-guide rows and the controls card

private struct TutorialRowView<Picture: View>: View {
    let name: String
    let tip: String
    let compact: Bool
    let picture: Picture

    init(name: String, tip: String, compact: Bool, @ViewBuilder picture: () -> Picture) {
        self.name = name
        self.tip = tip
        self.compact = compact
        self.picture = picture()
    }

    var body: some View {
        HStack(spacing: 11) {
            picture
            VStack(alignment: .leading, spacing: 1) {
                Text(L10n.t(name))
                    .font(.system(size: compact ? 13 : 15, weight: .bold, design: .rounded))
                    .foregroundStyle(MLTheme.textPrimary)
                Text(L10n.t(tip))
                    .font(.system(size: compact ? 11.5 : 13, weight: .regular, design: .rounded))
                    .foregroundStyle(MLTheme.textSecondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, compact ? 3 : 5)
        .padding(.leading, 6)
        .padding(.trailing, 10)
        .background(
            RoundedRectangle(cornerRadius: 15, style: .continuous)
                .fill(Color.white.opacity(0.06))
        )
    }
}

/// Key or button names drawn as keycaps.
private struct TutorialKeycaps: View {
    let keys: [String]

    var body: some View {
        ForEach(Array(keys.enumerated()), id: \.offset) { _, key in
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
    }
}

/// A small copy of the real on-screen control (see `ArcadeHudView`), or its keys on a keyboard.
private struct TutorialButtonPicture: View {
    let action: TutorialButtonAction
    let scheme: TutorialInputScheme

    var body: some View {
        let keys = TutorialGuide.buttonKeys(for: action, scheme: scheme)
        if keys.isEmpty {
            replica
        } else {
            VStack(spacing: 3) {
                HStack(spacing: 3) {
                    TutorialKeycaps(keys: Array(keys.prefix(4)))
                }
                if keys.count > 4 {
                    HStack(spacing: 3) {
                        TutorialKeycaps(keys: Array(keys.dropFirst(4)))
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var replica: some View {
        switch action {
        case .move:
            ZStack {
                Circle()
                    .fill(MLTheme.cardBg)
                    .overlay(Circle().strokeBorder(MLTheme.cyanAccent.opacity(0.32), lineWidth: 1.2))
                    .frame(width: 46, height: 46)
                Circle()
                    .fill(MLTheme.cyanAccent.opacity(0.85))
                    .frame(width: 19, height: 19)
            }
        case .floss:
            Image(systemName: "line.diagonal.arrow")
                .font(.system(size: 17, weight: .heavy))
                .foregroundStyle(MLTheme.deepOcean)
                .frame(width: 44, height: 44)
                .background(
                    Circle().fill(
                        LinearGradient(
                            colors: [MLTheme.fluorapatiteGold, MLTheme.cyanAccent],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                )
        case .surge:
            Image(systemName: "drop.triangle.fill")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(MLTheme.deepOcean)
                .frame(width: 44, height: 44)
                .background(Circle().fill(MLTheme.mintClean))
                .overlay(Circle().strokeBorder(Color.white, lineWidth: 1.6))
        case .scan:
            Image(systemName: "waveform.path.ecg")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(MLTheme.discloseMagenta)
                .frame(width: 44, height: 44)
                .background(Circle().fill(MLTheme.cardElevated))
                .overlay(Circle().strokeBorder(MLTheme.discloseMagenta.opacity(0.55), lineWidth: 1.4))
        case .pause:
            Image(systemName: "pause.circle.fill")
                .font(.system(size: 30))
                .foregroundStyle(MLTheme.textPrimary)
                .frame(width: 44, height: 44)
        }
    }
}

// MARK: - The closing card's drawing

/// A happy tooth, and the ? that brings the guide back. Laid out on a 320 x 180 board.
private struct TutorialReadyScene: View {
    let phase: Double

    private static let tooth = Color(red: 0.957, green: 0.984, blue: 1.0)
    private static let ink = Color(red: 0.043, green: 0.165, blue: 0.239)
    private static let sparkle = Color(red: 0.992, green: 0.902, blue: 0.541)

    var body: some View {
        let badge = 1 + 0.14 * TutorialMotion.twinkle(phase * 3)
        return ZStack {
            toothPart(x: 131, y: 94, width: 22, height: 46, radius: 11)
            toothPart(x: 167, y: 94, width: 22, height: 46, radius: 11)
            toothPart(x: 114, y: 32, width: 92, height: 84, radius: 34)
            Circle().fill(Self.ink).frame(width: 9, height: 9).position(x: 143, y: 68)
            Circle().fill(Self.ink).frame(width: 9, height: 9).position(x: 177, y: 68)
            Path { path in
                path.move(to: CGPoint(x: 144, y: 84))
                path.addQuadCurve(to: CGPoint(x: 176, y: 84), control: CGPoint(x: 160, y: 98))
            }
            .stroke(Self.ink, style: StrokeStyle(lineWidth: 4, lineCap: .round))
            twinkle(x: 84, y: 50, size: 18, glow: TutorialMotion.twinkle(phase * 3))
            twinkle(x: 238, y: 112, size: 15, glow: TutorialMotion.twinkle(phase * 3 + 0.33))
            twinkle(x: 92, y: 124, size: 12, glow: TutorialMotion.twinkle(phase * 3 + 0.66))
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

    private func toothPart(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat, radius: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(Self.tooth)
            .frame(width: width, height: height)
            .position(x: x + width / 2, y: y + height / 2)
    }

    private func twinkle(x: CGFloat, y: CGFloat, size: CGFloat, glow: Double) -> some View {
        let g = min(1, max(0, glow))
        return Image(systemName: "sparkle")
            .font(.system(size: size, weight: .bold))
            .foregroundStyle(Self.sparkle)
            .scaleEffect(CGFloat(0.45 + 0.65 * g))
            .opacity(0.25 + 0.75 * g)
            .position(x: x, y: y)
    }
}
