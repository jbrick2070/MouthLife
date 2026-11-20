import MouthLifeCore
import SwiftUI

/// What to play: one city's finale, the ending alone, or the last city followed by the ending.
public struct CityFinaleRequest: Equatable, Identifiable, Sendable {
    public enum Kind: Sendable {
        case city, ending, cityThenEnding
    }

    public let id = UUID()
    public let kind: Kind
    /// Campaign index (0...4) of the city just cleaned; ignored for `.ending`.
    public let worldIndex: Int
    /// Each campaign piece's finish once this clear is counted.
    public let finishes: [MolarFinish]
    public let reducedMotion: Bool

    public init(kind: Kind, worldIndex: Int, finishes: [MolarFinish], reducedMotion: Bool) {
        self.kind = kind
        self.worldIndex = worldIndex
        self.finishes = finishes
        self.reducedMotion = reducedMotion
    }
}

// MARK: - Prepared drawings

/// One drawing line's worth of shapes, filled in one go so neighbouring triangles never show seams.
struct FinaleRun {
    let path: Path
    let layer: FinaleLayer
    let cx: Double
    let color: SIMD3<Double>
    let top: SIMD3<Double>?
    let minY: Double
    let maxY: Double
    let group: Int
}

struct FinaleCityModel {
    let art: CityArt
    let plan: CityFinalePlan
    let runs: [FinaleRun]
    let emblem: [FinaleRun]
    let targets: [CityFinale.EmblemTarget]
    let cityName: String
    let hostName: String
    let hostRole: String
    let skin: SIMD3<Double>
    let accent: SIMD3<Double>
    let people: Int
}

func finaleRGB(_ hex: UInt32) -> SIMD3<Double> {
    SIMD3(Double((hex >> 16) & 255) / 255, Double((hex >> 8) & 255) / 255, Double(hex & 255) / 255)
}

func finaleRGB(_ hex: String) -> SIMD3<Double> {
    finaleRGB(UInt32(hex.dropFirst(), radix: 16) ?? 0xffffff)
}

func finaleColor(_ c: SIMD3<Double>, level: Double = 1, flash: Double = 0, alpha: Double = 1) -> Color {
    func f(_ v: Double) -> Double {
        let lit = min(1, v * level)
        return min(1, lit + (1 - lit) * flash)
    }
    return Color(.sRGB, red: f(c.x), green: f(c.y), blue: f(c.z), opacity: alpha)
}

@MainActor
enum FinaleModels {
    private static var cache: [Int: FinaleCityModel] = [:]

    static func city(_ index: Int) -> FinaleCityModel? {
        if let hit = cache[index] { return hit }
        guard index >= 0, index < CityFinale.hostIds.count,
              let art = CitySkyline.art(forHost: CityFinale.hostIds[index]),
              let plan = art.finale,
              let host = HostsAndHistory.host(forWorldId: CityFinale.worldIds[index])
        else { return nil }
        var name = host.city
        if let paren = name.range(of: " (") { name = String(name[..<paren.lowerBound]) }
        let model = FinaleCityModel(
            art: art,
            plan: plan,
            runs: buildRuns(art.skyline),
            emblem: buildRuns(art.emblem),
            targets: CityFinale.emblemTargets(art.emblem),
            cityName: name,
            hostName: host.hostName,
            hostRole: host.hostRole,
            skin: finaleRGB(host.hostSkinToneHex),
            accent: finaleRGB(host.hostAccentHex),
            people: host.hostName.contains("&") ? 2 : 1
        )
        cache[index] = model
        return model
    }

    static func buildRuns(_ pieces: [SkylinePiece]) -> [FinaleRun] {
        var runs: [FinaleRun] = []
        var path = Path()
        var current: SkylinePiece?
        var lo = Double.infinity
        var hi = -Double.infinity
        func close() {
            guard let p = current else { return }
            let span = CitySkyline.pieceSpanY(p)
            runs.append(FinaleRun(
                path: path,
                layer: !p.isLight ? .scenery : (p.topColorHex != nil ? .sky : .light),
                cx: (lo + hi) / 2,
                color: finaleRGB(p.colorHex),
                top: p.topColorHex.map { finaleRGB($0) },
                minY: span.minY,
                maxY: span.maxY,
                group: p.group
            ))
        }
        for piece in pieces {
            if current == nil || piece.order != current!.order || piece.group != current!.group {
                close()
                current = piece
                path = Path()
                lo = .infinity
                hi = -.infinity
            }
            let t = piece.triangles
            var i = 0
            while i + 5 < t.count {
                path.move(to: CGPoint(x: t[i], y: t[i + 1]))
                path.addLine(to: CGPoint(x: t[i + 2], y: t[i + 3]))
                path.addLine(to: CGPoint(x: t[i + 4], y: t[i + 5]))
                path.closeSubpath()
                i += 6
            }
            var k = 0
            while k < t.count {
                lo = min(lo, t[k])
                hi = max(hi, t[k])
                k += 2
            }
        }
        close()
        return runs
    }
}

// MARK: - Clock: time, notes, skipping

@MainActor
final class FinaleClock {
    private var start = Date()
    private var lastT = -1.0
    private var noteIdx = 0
    private var finished = false
    let notes: [FinaleNote]
    let cityLength: Double
    let total: Double
    let worldIndex: Int
    /// Whose song is playing: the city's campaign index, -1 for the ending, nil for none.
    private var trackPart: Int?
    /// The same clock for the 3D scene's render thread.
    let sceneClock = FinaleSceneClock()
    var onDone: () -> Void = {}

    init(request: CityFinaleRequest) {
        let hasCity = request.kind != .ending
        let hasEnding = request.kind != .city
        worldIndex = request.worldIndex
        cityLength = hasCity ? CityFinale.end : 0
        total = cityLength + (hasEnding ? CityFinale.Ending.end : 0)
        // With a recorded song for a part, only the score's sound effects play over it.
        let cityHasTrack = hasCity && NativeSoundEngine.shared.hasFinaleTrack(request.worldIndex)
        let endingHasTrack = hasEnding && NativeSoundEngine.shared.hasFinaleTrack(-1)
        var all: [FinaleNote] = []
        if hasCity, let city = FinaleModels.city(request.worldIndex) {
            all += CityFinale.notes(city.plan, finishes: request.finishes, slotIndex: request.worldIndex, reducedMotion: request.reducedMotion)
                .filter { !cityHasTrack || CityFinale.effectVoices.contains($0.voice) }
        }
        if hasEnding {
            let allGold = request.finishes.count == CityFinale.campaignPieces && request.finishes.allSatisfy { $0 == .gold }
            let offset = cityLength
            all += CityFinale.endingNotes(CityFinale.campaignPlans(), allGold: allGold)
                .filter { !endingHasTrack || CityFinale.effectVoices.contains($0.voice) }
                .map { FinaleNote(t: $0.t + offset, voice: $0.voice, midi: $0.midi, dur: $0.dur, vel: $0.vel, pan: $0.pan) }
        }
        notes = all.enumerated().sorted { a, b in a.element.t == b.element.t ? a.offset < b.offset : a.element.t < b.element.t }.map(\.element)
    }

    /// Whether the show has begun (its clock runs, its notes and song play).
    private(set) var started = false

    func time(at date: Date) -> Double {
        started ? date.timeIntervalSince(start) : 0
    }

    /// The show starts now: its clock, and its song (the city's, or the ending's).
    func begin() {
        started = true
        start = Date()
        sceneClock.setStart(start)
        lastT = -1
        startTrack(cityLength > 0 ? worldIndex : -1, offset: 0)
    }

    private func startTrack(_ part: Int, offset: Double) {
        guard trackPart != part else { return }
        trackPart = part
        NativeSoundEngine.shared.playFinaleTrack(part, offset: offset)
    }

    func stopTrack() {
        trackPart = nil
        NativeSoundEngine.shared.stopFinaleTrack()
    }

    func skipAfter(at t: Double) -> Double {
        t < cityLength ? CityFinale.skipAfter : cityLength + CityFinale.Ending.skipAfter
    }

    func advance(to date: Date) {
        guard started, !finished else { return }
        let t = time(at: date)
        if t >= total {
            finish()
            return
        }
        // After a stall only the last moment's notes play, never a pile-up.
        let recent = max(lastT - 0.05, t - 0.25)
        var due: [FinaleNote] = []
        while noteIdx < notes.count && notes[noteIdx].t <= t {
            if notes[noteIdx].t >= recent { due.append(notes[noteIdx]) }
            noteIdx += 1
        }
        if !due.isEmpty {
            NativeSoundEngine.shared.playFinaleNotes(due)
            for n in due {
                if n.voice == .boom { HapticsEngine.shared.playFinaleTap(intensity: Float(0.4 + n.vel * 0.6), sharpness: 0.25) }
                if n.voice == .marimba { HapticsEngine.shared.playFinaleTap(intensity: 0.85, sharpness: 0.85) }
            }
        }
        // the last city's song hands over to the ending's
        if trackPart == worldIndex, cityLength > 0, total > cityLength, t >= cityLength {
            startTrack(-1, offset: t - cityLength)
        }
        lastT = t
    }

    /// Skip jumps over the city's show to the ending, if there is one; otherwise ends.
    func skip(at date: Date) {
        let t = time(at: date)
        // only once Skip shows; a skip anywhere in the city part goes on to the grand finale
        guard t >= skipAfter(at: t) else { return }
        if cityLength > 0 && t < cityLength && total > cityLength {
            start = date.addingTimeInterval(-cityLength)
            sceneClock.setStart(start)
            lastT = cityLength
            while noteIdx < notes.count && notes[noteIdx].t < cityLength { noteIdx += 1 }
            startTrack(-1, offset: 0)
            return
        }
        finish()
    }

    private func finish() {
        guard !finished else { return }
        finished = true
        stopTrack()
        onDone()
    }
}

// MARK: - The view

/// Plays a city's finale (see MouthLifeCore.CityFinale) over the frozen game, and the ending once
/// every city is clean. The web edition draws the same show in src/ui/CityFinaleOverlay.ts.
public struct CityFinaleView: View {
    public let request: CityFinaleRequest
    public let onDone: () -> Void
    @State private var clock: FinaleClock
    /// The show in 3D (SceneKit), built as the finale opens; the 2D layer draws over it.
    @State private var stage: FinaleScene3D?

    public init(request: CityFinaleRequest, onDone: @escaping () -> Void) {
        self.request = request
        self.onDone = onDone
        _clock = State(initialValue: FinaleClock(request: request))
    }

    public var body: some View {
        // The show fills the whole screen; the words keep clear of the notch and the home bar, so the
        // safe area is read here, before the content below ignores it.
        GeometryReader { outer in
            let insets = outer.safeAreaInsets
            TimelineView(.animation) { context in
                let t = clock.time(at: context.date)
                GeometryReader { geo in
                    let painter = FinalePainter(request: request, size: geo.size, clock: clock)
                    ZStack {
                        if let stage {
                            FinaleSceneView(stage: stage)
                                .opacity(painter.coverAlpha(t))
                        }
                        Canvas(opaque: false, colorMode: .nonLinear) { ctx, size in
                            clock.sceneClock.setSize(size)
                            // Until the 3D scene is ready (a moment, during the fade in) nothing is drawn.
                            guard stage != nil else { return }
                            FinalePainter(request: request, size: size, clock: clock).draw3DOverlay(&ctx, t: t)
                        }
                        .opacity(painter.coverAlpha(t))
                        words(painter: painter, t: t, size: geo.size, insets: insets)
                            .frame(width: geo.size.width, height: geo.size.height)
                            .clipped()
                    }
                }
                .onChange(of: context.date) { _, newDate in
                    clock.advance(to: newDate)
                }
            }
            .ignoresSafeArea()
        }
        .contentShape(Rectangle())
        .onAppear {
            clock.onDone = onDone
            NativeSoundEngine.shared.setFinaleDucked(true)
            // Build the 3D scene first, then start the clock and the song together with the picture.
            if stage == nil {
                let request = request
                let sceneClock = clock.sceneClock
                Task.detached(priority: .userInitiated) {
                    let built = FinaleScene3D(request: request, clock: sceneClock)
                    await MainActor.run {
                        stage = built
                        clock.begin()
                    }
                }
            } else {
                clock.begin()
            }
        }
        .onDisappear {
            clock.stopTrack()
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(L10n.t(request.kind == .ending ? "The Golden Molar" : (FinaleModels.city(request.worldIndex)?.cityName ?? ""))))
    }

    // MARK: Words on screen

    private func fade(_ on: Bool, from: Double, to: Double, t: Double) -> Double {
        guard on else { return 0 }
        return CityFinale.smooth01((t - from) / 0.4) * (1 - CityFinale.smooth01((t - (to - 0.4)) / 0.4))
    }

    @ViewBuilder
    private func words(painter: FinalePainter, t: Double, size: CGSize, insets: EdgeInsets) -> some View {
        let inCity = request.kind != .ending && t < clock.cityLength
        let e = t - clock.cityLength
        let finish = request.worldIndex < request.finishes.count ? request.finishes[request.worldIndex] : .pearl
        let pieces = request.finishes.filter { $0 != .empty }.count
        let allGold = painter.allGold
        let city = FinaleModels.city(request.worldIndex)

        let skipShown = t >= clock.skipAfter(at: t)
        let lineWidth = max(0, size.width - 32)
        // Every line hangs off a base exactly the size of the screen, so a long city name in a long
        // language can never push the others (or the Skip button) out of place.
        Color.clear
            .frame(width: size.width, height: size.height)
            .overlay(alignment: .top) {
            VStack(spacing: 6) {
                if inCity, let city {
                    Text(L10n.t(city.cityName).uppercased())
                        .font(.system(size: min(54, max(28, size.width * 0.05)), weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .minimumScaleFactor(0.5)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)
                        .opacity(fade(true, from: CityFinale.cityText.from, to: CityFinale.cityText.to, t: t))
                    Text(L10n.t("Golden Molar: \(pieces) of 5"))
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundStyle(Color(red: 0.99, green: 0.9, blue: 0.54))
                        .opacity(fade(true, from: CityFinale.molarText.from, to: CityFinale.molarText.to, t: t))
                    badge(finish)
                        .opacity(fade(true, from: CityFinale.molarText.from + 0.3, to: CityFinale.molarText.to, t: t))
                } else if !inCity {
                    Text(L10n.t("The Golden Molar").uppercased())
                        .font(.system(size: min(54, max(28, size.width * 0.05)), weight: .black, design: .rounded))
                        .foregroundStyle(Color(red: 0.99, green: 0.9, blue: 0.54))
                        .opacity(fade(true, from: CityFinale.Ending.snap, to: CityFinale.Ending.creditsStart - 0.3, t: e))
                }
            }
            .frame(width: lineWidth)
            .shadow(color: .black.opacity(0.6), radius: 10, y: 2)
            .padding(.top, max(24, size.height * 0.06) + insets.top)
            .allowsHitTesting(false)
            }
            .overlay(alignment: .topLeading) {
            if inCity, let head = painter.hostHead(t: t) {
                let bubbleAlpha = fade(true, from: CityFinale.bubbleText.from, to: CityFinale.bubbleText.to, t: t)
                Text(L10n.t("Thank you!"))
                    .font(.system(size: 17, weight: .heavy, design: .rounded))
                    .foregroundStyle(Color(red: 0.06, green: 0.09, blue: 0.16))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white))
                    .fixedSize()
                    .position(x: head.x + (painter.hostOnLeft ? 40 : -40), y: head.y - 22)
                    .opacity(bubbleAlpha)
                    .allowsHitTesting(false)
            }
            }
            .overlay(alignment: .top) {
            if !inCity {
                let credit = CityFinale.endingCredit(e)
                if credit.index >= 0, let c = FinaleModels.city(credit.index) {
                    VStack(spacing: 4) {
                        Text(L10n.t(c.cityName).uppercased())
                            .font(.system(size: min(44, max(24, size.width * 0.04)), weight: .black, design: .rounded))
                            .foregroundStyle(.white)
                            .lineLimit(2)
                            .minimumScaleFactor(0.5)
                            .multilineTextAlignment(.center)
                        Text(verbatim: c.hostName + " • " + L10n.t(c.hostRole))
                            .font(.system(size: 15, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color(red: 0.89, green: 0.91, blue: 0.94))
                    }
                    .frame(width: lineWidth)
                    .shadow(color: .black.opacity(0.7), radius: 10, y: 2)
                    // just under the small molar at the top (on a tall phone that is lower than 30% down)
                    .padding(.top, max(size.height * 0.3, painter.sy(0.44) + 8))
                    .opacity(credit.alpha)
                    .allowsHitTesting(false)
                }
            }
            }
            .overlay(alignment: .bottom) {
            if !inCity {
                VStack(spacing: 8) {
                    Text(L10n.t("Thanks for playing!"))
                        .font(.system(size: 30, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                        .opacity(fade(true, from: CityFinale.Ending.finaleStart + 0.8, to: CityFinale.Ending.end - 0.5, t: e))
                    if allGold {
                        Text(L10n.t("Perfect smile!"))
                            .font(.system(size: 26, weight: .black, design: .rounded))
                            .foregroundStyle(Color(red: 0.99, green: 0.88, blue: 0.28))
                            .opacity(fade(true, from: CityFinale.Ending.face + 0.3, to: CityFinale.Ending.end - 0.5, t: e))
                    } else {
                        Text(L10n.t("Get gold in every city for a surprise."))
                            .font(.system(size: 16, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color(red: 0.99, green: 0.9, blue: 0.54))
                            .opacity(fade(true, from: CityFinale.Ending.face + 0.5, to: CityFinale.Ending.end - 0.5, t: e))
                    }
                }
                .multilineTextAlignment(.center)
                .frame(width: lineWidth)
                .shadow(color: .black.opacity(0.6), radius: 10, y: 2)
                .padding(.bottom, max(28, size.height * 0.07) + insets.bottom)
                .allowsHitTesting(false)
            }
            }
            .overlay(alignment: .bottom) {
            if inCity {
                let status = CityFinale.climbStatus(request.finishes)
                let line = status.left == 0
                    ? L10n.t("You made it to the top!")
                    : (status.left == 1 ? L10n.t("One more to the top!") : L10n.t("\(status.left) more to the top"))
                VStack(spacing: 6) {
                    Text(line)
                        .font(.system(size: 26, weight: .black, design: .rounded))
                        .foregroundStyle(Color(red: 0.99, green: 0.9, blue: 0.54))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(Color(red: 0.01, green: 0.02, blue: 0.09).opacity(0.62)))
                        .opacity(fade(true, from: CityFinale.climbText.from, to: CityFinale.climbText.to, t: t))
                    if status.left > 0, status.next >= 0, let next = FinaleModels.city(status.next) {
                        Text(L10n.t("Next stop: \(L10n.t(next.cityName))"))
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                            .foregroundStyle(Color(red: 0.89, green: 0.91, blue: 0.94))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 3)
                            .background(Capsule().fill(Color(red: 0.01, green: 0.02, blue: 0.09).opacity(0.55)))
                            .opacity(fade(true, from: CityFinale.climbText.from + 0.5, to: CityFinale.climbText.to, t: t))
                    }
                }
                .frame(width: lineWidth)
                .padding(.bottom, max(28, size.height * 0.07) + insets.bottom)
                .allowsHitTesting(false)
            }
            }
            .overlay(alignment: .topTrailing) {
            if skipShown {
                Button {
                    clock.skip(at: Date())
                } label: {
                    Text(L10n.t("Skip ›"))
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundStyle(Color(red: 0.89, green: 0.91, blue: 0.94))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(Color.black.opacity(0.42)))
                        .overlay(Capsule().strokeBorder(Color.white.opacity(0.3), lineWidth: 1))
                }
                .buttonStyle(.plain)
                .fixedSize()
                .padding(.top, 10 + insets.top)
                .padding(.trailing, 16 + insets.trailing)
            }
            }
    }

    private func badge(_ finish: MolarFinish) -> some View {
        let label: String
        switch finish {
        case .gold: label = "★ " + L10n.t("Gold piece")
        case .silver: label = L10n.t("Silver piece")
        default: label = L10n.t("Pearl piece")
        }
        let colors = CityFinale.finishColors(finish)
        return Text(label)
            .font(.system(size: 13, weight: .heavy, design: .rounded))
            .foregroundStyle(finish == .gold ? Color(red: 0.26, green: 0.13, blue: 0.02) : Color(red: 0.06, green: 0.09, blue: 0.16))
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(
                Capsule().fill(LinearGradient(
                    colors: [finaleColor(finaleRGB(colors.light)), finaleColor(finaleRGB(colors.dark))],
                    startPoint: .top,
                    endPoint: .bottom
                ))
            )
    }
}

// MARK: - Painting

/// Draws one frame of the show. A plain value: everything comes from the request, the size and t.
@MainActor
struct FinalePainter {
    let request: CityFinaleRequest
    let size: CGSize
    let clock: FinaleClock

    var w: Double { Double(size.width) }
    var h: Double { Double(size.height) }
    var unit: Double { min(w, h) / 2 }
    var rm: Bool { request.reducedMotion }
    var city: FinaleCityModel? { request.kind == .ending ? nil : FinaleModels.city(request.worldIndex) }
    var allGold: Bool { request.finishes.count == CityFinale.campaignPieces && request.finishes.allSatisfy { $0 == .gold } }
    /// Every city is clean once this one is: the probe climbs to the top.
    var atTop: Bool { CityFinale.climbStatus(request.finishes).left == 0 }
    var hostOnLeft: Bool { city?.plan.hostOnLeft ?? true }

    func finish(_ i: Int) -> MolarFinish {
        i >= 0 && i < request.finishes.count ? request.finishes[i] : .empty
    }

    func sx(_ x: Double) -> Double { w / 2 + x * unit }
    func sy(_ y: Double) -> Double { h / 2 - y * unit }

    func coverAlpha(_ t: Double) -> Double {
        CityFinale.smooth01(t / (request.kind == .ending ? CityFinale.Ending.fadeEnd : CityFinale.hushEnd - 0.2))
    }

    struct CityView {
        let s: Double
        let ox: Double
        let oy: Double
    }

    func cityView(cx: Double, viewW: Double) -> CityView {
        let s = max(w / viewW, h / 34)
        let halfVisible = w / s / 2
        let center = halfVisible >= 32 ? 32 : max(halfVisible - 2, min(66 - halfVisible, cx))
        return CityView(s: s, ox: w / 2 - center * s, oy: h * 0.84)
    }

    func draw(_ ctx: inout GraphicsContext, t: Double) {
        if request.kind != .ending && t < clock.cityLength {
            drawCity(&ctx, t: t)
        } else {
            drawEnding(&ctx, t: t - clock.cityLength)
        }
    }

    // MARK: Shared pieces

    func paintSky(_ ctx: inout GraphicsContext, t: Double) {
        let rect = Path(CGRect(x: 0, y: 0, width: w, height: h))
        ctx.fill(rect, with: .linearGradient(
            Gradient(stops: [
                .init(color: Color(red: 0.004, green: 0.012, blue: 0.047), location: 0),
                .init(color: Color(red: 0.031, green: 0.071, blue: 0.169), location: 0.62),
                .init(color: Color(red: 0.063, green: 0.114, blue: 0.239), location: 0.84),
                .init(color: Color(red: 0.012, green: 0.027, blue: 0.071), location: 1),
            ]),
            startPoint: .zero,
            endPoint: CGPoint(x: 0, y: h)
        ))
        for i in 0..<110 {
            let a = sin(Double(i) * 12.9898) * 43758.5453
            let b = sin(Double(i) * 78.233) * 12543.1234
            let x = (a - a.rounded(.down)) * w
            let y = (b - b.rounded(.down)) * h * 0.8
            let r = 0.6 + Double((i * 7) % 5) * 0.25
            let tw = rm ? 0.8 : 0.55 + 0.45 * sin(t * 1.7 + Double(i) * 1.7)
            ctx.fill(Path(CGRect(x: x, y: y, width: r, height: r)), with: .color(Color(red: 0.89, green: 0.91, blue: 0.94).opacity(tw * 0.85)))
        }
    }

    func paintCity(
        _ ctx: inout GraphicsContext,
        _ city: FinaleCityModel,
        view: CityView,
        tint: (FinaleRun) -> (level: Double, flash: Double),
        motionTime: (FinaleRun) -> Double?
    ) {
        ctx.fill(
            Path(CGRect(x: 0, y: view.oy, width: w, height: max(0, h - view.oy))),
            with: .linearGradient(
                Gradient(colors: [Color(red: 0.043, green: 0.075, blue: 0.141), Color(red: 0.008, green: 0.024, blue: 0.09)]),
                startPoint: CGPoint(x: 0, y: view.oy),
                endPoint: CGPoint(x: 0, y: h)
            )
        )
        for run in city.runs {
            let tn = tint(run)
            var glow = 1.0
            var transform = CGAffineTransform(translationX: view.ox, y: view.oy)
            if run.group > 0, run.group - 1 < city.art.motions.count {
                let motion = city.art.motions[run.group - 1]
                let state = CitySkyline.motionState(motion, timeSec: motionTime(run))
                let pivot = CitySkyline.motionPivot(motion)
                glow = state.glow
                let px = pivot?.x ?? 0
                let py = pivot?.y ?? 0
                transform = transform
                    .translatedBy(x: (px + state.dx) * view.s, y: -py * view.s)
                    .rotated(by: -state.angleRad)
                    .scaledBy(x: view.s, y: -view.s)
                    .translatedBy(x: -px, y: -py)
            } else {
                transform = transform.scaledBy(x: view.s, y: -view.s)
            }
            let level = run.layer == .scenery ? tn.level : tn.level * glow
            var c = ctx
            c.concatenate(transform)
            if let top = run.top {
                let blackTop = top.x + top.y + top.z < 0.02
                c.fill(run.path, with: .linearGradient(
                    Gradient(colors: [
                        finaleColor(run.color, level: level, flash: tn.flash),
                        blackTop ? Color.black.opacity(0) : finaleColor(top, level: level, flash: tn.flash),
                    ]),
                    startPoint: CGPoint(x: 0, y: run.minY),
                    endPoint: CGPoint(x: 0, y: run.maxY)
                ))
            } else {
                c.fill(run.path, with: .color(finaleColor(run.color, level: level, flash: run.layer == .light ? tn.flash : 0)))
            }
        }
    }

    /// A round window onto city `cityIndex` (-1: the way to the Golden Molar), lit up under its own
    /// sky. In that sky float little rings of teeth, each holding another city with its own ring:
    /// wormholes to every city, `depth` rings down. The web's paintWormholeWindow draws the same.
    func paintWormholeWindow(_ ctx: inout GraphicsContext, x cx: Double, y cy: Double, r: Double, cityIndex: Int, depth: Int, t: Double, alpha: Double, branches: Int = 3, withProbe: Bool = false) {
        guard r >= 1.5, alpha > 0.01 else { return }
        let model = cityIndex >= 0 ? FinaleModels.city(cityIndex) : nil
        var c = ctx
        c.opacity = alpha
        c.clip(to: Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2)))
        // once the window is bigger than the screen the picture inside stops growing: we have arrived
        let rc = min(r, max(w, h) * 0.6)
        let glowRGB = model?.accent ?? SIMD3(0.99, 0.88, 0.28)
        c.fill(Path(CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2)), with: .linearGradient(
            Gradient(stops: [
                .init(color: Color(red: 0.008, green: 0.024, blue: 0.09), location: 0),
                .init(color: Color(red: 0.043, green: 0.102, blue: 0.227), location: 0.5),
                .init(color: Color(red: (30 + glowRGB.x * 90) / 255, green: (30 + glowRGB.y * 70) / 255, blue: (60 + glowRGB.z * 80) / 255), location: 0.74),
                .init(color: Color(red: 0.012, green: 0.027, blue: 0.071), location: 1),
            ]),
            startPoint: CGPoint(x: cx, y: cy - rc),
            endPoint: CGPoint(x: cx, y: cy + rc)
        ))
        for k in 0..<28 {
            let sx = cx + (CityFinale.hash(k, 31) * 2 - 1) * rc
            let sy = cy - rc + CityFinale.hash(k, 37) * rc * 1.1
            let size = min(2, max(1, rc * 0.006))
            var s = c
            s.opacity = alpha * (0.4 + 0.5 * CityFinale.hash(k, 41))
            s.fill(Path(CGRect(x: sx, y: sy, width: size, height: size)), with: .color(Color(red: 0.89, green: 0.91, blue: 0.94)))
        }
        if let model {
            if r >= 8 {
                let s = rc * 2 / 46
                paintCity(&c, model, view: CityView(s: s, ox: cx - 32 * s, oy: cy + rc * 0.52), tint: { _ in (level: 1, flash: 0) }, motionTime: { _ in rm ? nil : t })
            }
        } else {
            // the last city leads to the Golden Molar: a warm golden light at the end
            paintGlow(&c, x: cx, y: cy, radius: rc * 0.9, color: Color(red: 0.99, green: 0.88, blue: 0.28), alpha: 0.85)
            paintGlow(&c, x: cx, y: cy, radius: rc * 0.35, color: Color(red: 1, green: 0.98, blue: 0.92), alpha: 0.95)
        }
        if depth > 0, cityIndex >= 0 {
            // little wormholes in this city's sky: to the next city, and (at the top) the ones after it
            let spots: [(dx: Double, dy: Double, size: Double)] = [(0.32, -0.36, 0.17), (-0.4, -0.42, 0.12), (0.0, -0.66, 0.09)]
            let spin = rm ? 0 : t * 0.9
            for (n, spot) in spots.prefix(max(1, branches)).enumerated() {
                let ir = rc * spot.size
                guard ir >= 3 else { continue }
                let ix = cx + rc * spot.dx
                let iy = cy + rc * spot.dy
                paintWormholeWindow(&c, x: ix, y: iy, r: ir * 0.8, cityIndex: (cityIndex + 1 + n) % CityFinale.campaignPieces, depth: depth - 1, t: t, alpha: alpha, branches: 1)
                paintToothRing(&c, x: ix, y: iy, r: ir, spin: n % 2 == 0 ? spin : -spin, alpha: alpha)
            }
        }
        if withProbe, model != nil {
            // our probe's tiny double, waiting in the next city's sky: it nods back as we fly in
            let nod = CityFinale.helloBack(t, reducedMotion: rm)
            paintProbe(&c, x: cx - rc * 0.14, y: cy - rc * 0.05 + nod * rc * 0.03, radius: rc * 0.07, alpha: alpha, t: t)
        }
    }

    /// The glassy edge of a city bubble: a gold-and-pearl rim and a little shine at the top left.
    func paintBubbleRim(_ ctx: inout GraphicsContext, x: Double, y: Double, r: Double, alpha: Double) {
        guard r >= 2, alpha > 0.01 else { return }
        var c = ctx
        c.opacity = alpha
        let circle = Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
        c.stroke(circle, with: .linearGradient(
            Gradient(colors: [Color(red: 1, green: 0.97, blue: 0.84), Color(red: 0.95, green: 0.75, blue: 0.31), Color(red: 0.99, green: 0.9, blue: 0.54)]),
            startPoint: CGPoint(x: x - r, y: y - r),
            endPoint: CGPoint(x: x + r, y: y + r)
        ), lineWidth: max(1, r * 0.09))
        var shine = Path()
        shine.addArc(center: CGPoint(x: x, y: y), radius: r * 0.72, startAngle: .radians(Double.pi * 1.08), endAngle: .radians(Double.pi * 1.42), clockwise: false)
        c.opacity = alpha * 0.55
        c.stroke(shine, with: .color(.white), style: StrokeStyle(lineWidth: max(1, r * 0.07), lineCap: .round))
    }

    /// A ring of little teeth, crowns pointing in, every third one gold.
    func paintToothRing(_ ctx: inout GraphicsContext, x cx: Double, y cy: Double, r: Double, spin: Double, alpha: Double) {
        guard r >= 2, alpha > 0.01 else { return }
        var tooth = Path()
        tooth.move(to: CGPoint(x: -0.5, y: 0.05))
        tooth.addLine(to: CGPoint(x: -0.5, y: -0.32))
        tooth.addQuadCurve(to: CGPoint(x: -0.24, y: -0.6), control: CGPoint(x: -0.5, y: -0.62))
        tooth.addQuadCurve(to: CGPoint(x: 0.24, y: -0.6), control: CGPoint(x: 0, y: -0.44))
        tooth.addQuadCurve(to: CGPoint(x: 0.5, y: -0.32), control: CGPoint(x: 0.5, y: -0.62))
        tooth.addLine(to: CGPoint(x: 0.5, y: 0.05))
        tooth.addQuadCurve(to: CGPoint(x: 0.26, y: 0.68), control: CGPoint(x: 0.46, y: 0.55))
        tooth.addQuadCurve(to: CGPoint(x: 0, y: 0.26), control: CGPoint(x: 0.12, y: 0.36))
        tooth.addQuadCurve(to: CGPoint(x: -0.26, y: 0.68), control: CGPoint(x: -0.12, y: 0.36))
        tooth.addQuadCurve(to: CGPoint(x: -0.5, y: 0.05), control: CGPoint(x: -0.46, y: 0.55))
        tooth.closeSubpath()
        let u = r * 0.3
        for j in 0..<12 {
            let a = spin + Double(j) / 12 * Double.pi * 2
            var c = ctx
            c.opacity = alpha
            c.concatenate(CGAffineTransform(translationX: cx + cos(a) * r, y: cy + sin(a) * r).rotated(by: a - Double.pi / 2).scaledBy(x: u, y: u))
            let gold = j % 3 == 0
            c.fill(tooth, with: .linearGradient(
                Gradient(colors: gold
                    ? [Color(red: 0.99, green: 0.9, blue: 0.54), Color(red: 0.72, green: 0.47, blue: 0.12)]
                    : [Color.white, Color(red: 0.8, green: 0.84, blue: 0.88)]),
                startPoint: CGPoint(x: 0, y: -0.6),
                endPoint: CGPoint(x: 0, y: 0.7)
            ))
            c.stroke(tooth, with: .color(gold ? Color(red: 0.47, green: 0.31, blue: 0.04).opacity(0.7) : Color(red: 0.39, green: 0.45, blue: 0.55).opacity(0.6)), lineWidth: 0.06)
        }
    }

    func paintEmblem(_ ctx: inout GraphicsContext, _ city: FinaleCityModel, x: Double, y: Double, radius: Double, widthScale: Double = 1, alpha: Double = 1) {
        guard alpha > 0.01 else { return }
        var c = ctx
        c.opacity = alpha
        c.concatenate(CGAffineTransform(translationX: x, y: y).scaledBy(x: radius * widthScale, y: -radius))
        for run in city.emblem {
            c.fill(run.path, with: .color(finaleColor(run.color)))
        }
    }

    func paintGlow(_ ctx: inout GraphicsContext, x: Double, y: Double, radius: Double, color: Color, alpha: Double) {
        guard alpha > 0.01, radius > 0 else { return }
        var c = ctx
        c.opacity = alpha
        c.fill(
            Path(ellipseIn: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2)),
            with: .radialGradient(Gradient(colors: [color, color.opacity(0)]), center: CGPoint(x: x, y: y), startRadius: 0, endRadius: radius)
        )
    }

    func paintPiece(_ ctx: inout GraphicsContext, _ city: FinaleCityModel?, finish: MolarFinish, x: Double, y: Double, radius: Double, spin: Double = 0, alpha: Double = 1, shine: Double = 0) {
        let width = cos(spin)
        let wx = max(0.04, abs(width))
        let colors = CityFinale.finishColors(finish)
        var c = ctx
        c.opacity = alpha
        let rect = CGRect(x: x - radius * wx, y: y - radius, width: radius * 2 * wx, height: radius * 2)
        let disc = Path(ellipseIn: rect)
        c.fill(disc, with: .radialGradient(
            Gradient(colors: [finaleColor(finaleRGB(colors.light)), finaleColor(finaleRGB(colors.dark))]),
            center: CGPoint(x: x - radius * 0.35 * wx, y: y - radius * 0.4),
            startRadius: radius * 0.1,
            endRadius: radius
        ))
        let rim: Color = finish == .gold ? Color(red: 0.98, green: 0.75, blue: 0.14) : (finish == .silver ? Color(red: 0.8, green: 0.84, blue: 0.88) : Color(red: 0.91, green: 0.9, blue: 0.89))
        c.stroke(disc, with: .color(rim), lineWidth: max(1, radius * 0.08))
        if shine > 0.01 { c.fill(disc, with: .color(.white.opacity(0.75 * shine))) }
        if width >= 0, let city { paintEmblem(&ctx, city, x: x, y: y, radius: radius * 0.62, widthScale: wx, alpha: alpha) }
    }

    func paintMolar(
        _ ctx: inout GraphicsContext,
        cx: Double,
        cy: Double,
        scale: Double,
        alpha: Double,
        placed: (Int) -> MolarFinish,
        shineIndex: Int = -1,
        shine: Double = 0,
        bodyFinish: MolarFinish = .empty
    ) {
        guard alpha > 0.01 else { return }
        let k = scale * unit
        func px(_ x: Double) -> Double { sx(cx + x * scale) }
        func py(_ y: Double) -> Double { sy(cy + y * scale) }
        func crown(_ grow: Double) -> Path {
            var p = Path()
            let core = CityFinale.Molar.core
            p.addRoundedRect(
                in: CGRect(x: px(core.x) - grow * k, y: py(core.y + core.h) - grow * k, width: (core.w + grow * 2) * k, height: (core.h + grow * 2) * k),
                cornerSize: CGSize(width: (core.r + grow) * k, height: (core.r + grow) * k)
            )
            for cusp in CityFinale.Molar.cusps {
                let r = (CityFinale.Molar.lobeRadius + grow) * k
                p.addEllipse(in: CGRect(x: px(cusp.x) - r, y: py(cusp.y) - r, width: r * 2, height: r * 2))
            }
            return p
        }
        var c = ctx
        c.opacity = alpha
        c.fill(crown(0.05), with: .color(Color(red: 0.98, green: 0.75, blue: 0.14)))
        let bx = px(CityFinale.Molar.bodyCenter.x)
        let by = py(CityFinale.Molar.bodyCenter.y)
        if bodyFinish == .empty {
            c.fill(crown(0), with: .color(Color(red: 0.06, green: 0.09, blue: 0.16)))
        } else {
            let colors = CityFinale.finishColors(bodyFinish)
            c.fill(crown(0), with: .radialGradient(
                Gradient(colors: [finaleColor(finaleRGB(colors.light)), finaleColor(finaleRGB(colors.dark))]),
                center: CGPoint(x: bx - k * 0.35, y: by - k * 0.35),
                startRadius: k * 0.1,
                endRadius: k * 1.2
            ))
        }
        var groove = Path()
        for (i, p) in CityFinale.Molar.groove.enumerated() {
            if i == 0 { groove.move(to: CGPoint(x: px(p.x), y: py(p.y))) } else { groove.addLine(to: CGPoint(x: px(p.x), y: py(p.y))) }
        }
        c.stroke(groove, with: .color(Color(red: 0.58, green: 0.64, blue: 0.72).opacity(0.55)), lineWidth: max(1, k * 0.025))
        let r = CityFinale.Molar.cuspRadius * k
        for (i, cusp) in CityFinale.Molar.cusps.enumerated() {
            let f = placed(i)
            let x = px(cusp.x)
            let y = py(cusp.y)
            if f == .empty {
                c.stroke(
                    Path(ellipseIn: CGRect(x: x - r * 0.92, y: y - r * 0.92, width: r * 1.84, height: r * 1.84)),
                    with: .color(Color(red: 0.89, green: 0.91, blue: 0.94).opacity(0.42)),
                    style: StrokeStyle(lineWidth: max(1, r * 0.07), dash: [max(2, r * 0.18), max(2, r * 0.14)])
                )
            } else {
                paintPiece(&ctx, FinaleModels.city(i), finish: f, x: x, y: y, radius: r, alpha: alpha, shine: i == shineIndex ? shine : 0)
            }
        }
    }

    func paintProbe(_ ctx: inout GraphicsContext, x: Double, y: Double, radius: Double, alpha: Double, t: Double) {
        guard alpha > 0.01 else { return }
        paintGlow(&ctx, x: x, y: y, radius: radius * 3.2, color: Color(red: 0.37, green: 0.92, blue: 0.83).opacity(0.55), alpha: alpha)
        var c = ctx
        c.opacity = alpha
        for k in -1...1 {
            var tuft = Path()
            tuft.move(to: CGPoint(x: x + Double(k) * radius * 0.3, y: y + radius * 0.7))
            tuft.addLine(to: CGPoint(x: x + Double(k) * radius * 0.42, y: y + radius * 1.25 + sin(t * 20 + Double(k)) * radius * 0.06))
            c.stroke(tuft, with: .color(Color(red: 0.97, green: 0.98, blue: 0.99)), style: StrokeStyle(lineWidth: max(1, radius * 0.16), lineCap: .round))
        }
        let body = Path(ellipseIn: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2))
        c.fill(body, with: .radialGradient(
            Gradient(stops: [
                .init(color: Color(red: 0.8, green: 0.98, blue: 0.95), location: 0),
                .init(color: Color(red: 0.18, green: 0.83, blue: 0.75), location: 0.45),
                .init(color: Color(red: 0.06, green: 0.46, blue: 0.43), location: 1),
            ]),
            center: CGPoint(x: x - radius * 0.3, y: y - radius * 0.35),
            startRadius: radius * 0.1,
            endRadius: radius
        ))
        c.stroke(body, with: .color(Color(red: 0.65, green: 0.95, blue: 0.82)), lineWidth: max(1, radius * 0.14))
        c.fill(Path(ellipseIn: CGRect(x: x + radius * 0.06, y: y - radius * 0.34, width: radius * 0.44, height: radius * 0.44)), with: .color(.white))
    }

    func paintSpark(_ ctx: inout GraphicsContext, x: Double, y: Double, px: Double, py: Double, color: Color, size: Double, alpha: Double) {
        guard alpha > 0.01 else { return }
        var c = ctx
        c.blendMode = .plusLighter
        c.opacity = alpha * 0.22
        c.fill(Path(ellipseIn: CGRect(x: x - size * 2.6, y: y - size * 2.6, width: size * 5.2, height: size * 5.2)), with: .color(color))
        c.opacity = alpha
        var streak = Path()
        streak.move(to: CGPoint(x: px, y: py))
        streak.addLine(to: CGPoint(x: x, y: y))
        c.stroke(streak, with: .color(color), style: StrokeStyle(lineWidth: size, lineCap: .round))
        c.fill(Path(ellipseIn: CGRect(x: x - size * 0.9, y: y - size * 0.9, width: size * 1.8, height: size * 1.8)), with: .color(color))
    }

    /// Where the host's head is on screen (for the speech bubble), or nil while they are hidden.
    func hostHead(t: Double) -> CGPoint? {
        let host = CityFinale.host(t, reducedMotion: rm)
        guard host.rise > 0.01 else { return nil }
        let halfW = w / 2 / unit
        let halfH = h / 2 / unit
        let baseX = hostOnLeft ? -halfW + 0.42 : halfW - 0.42
        let baseY = -halfH - (1 - host.rise) * 0.8
        let inner = (hostOnLeft ? 1 : -1) * Double((city?.people ?? 1) - 1) * 0.34
        return CGPoint(x: sx(baseX + inner), y: sy(baseY) - 0.76 * unit)
    }

    /// A host (or two) rising at the bottom edge in a gold-rimmed cameo, one hand waving out past
    /// its frame. The web draws the same in CityFinaleOverlay.paintHost.
    func paintHost(_ ctx: inout GraphicsContext, _ city: FinaleCityModel, onLeft: Bool, rise: Double, wave: Double) {
        guard rise > 0.01 else { return }
        let halfW = w / 2 / unit
        let halfH = h / 2 / unit
        let baseX = onLeft ? -halfW + 0.42 : halfW - 0.42
        let baseY = -halfH - (1 - rise) * 0.8
        let navy = Color(red: 0.043, green: 0.082, blue: 0.188)
        let gold = Color(red: 0.95, green: 0.75, blue: 0.31)
        for p in (0..<city.people).reversed() {
            // the one who waves stands nearer the middle; a second host stands behind, nearer the edge
            let x = baseX + (onLeft ? 1 : -1) * Double(city.people - 1 - p) * 0.34
            let s = unit * (p == 0 ? 1 : 0.9)
            let cx = sx(x)
            let foot = sy(baseY)
            let cy = foot - 0.4 * s
            let r = 0.3 * s
            let disc = Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2))
            ctx.fill(disc, with: .color(navy))
            ctx.fill(disc, with: .radialGradient(
                Gradient(colors: [finaleColor(city.accent).opacity(0.55), finaleColor(city.accent).opacity(0)]),
                center: CGPoint(x: cx, y: cy - 0.08 * s), startRadius: 0, endRadius: r
            ))
            // the portrait, inside the frame
            var inner = ctx
            inner.clip(to: Path(ellipseIn: CGRect(x: cx - r * 0.96, y: cy - r * 0.96, width: r * 1.92, height: r * 1.92)))
            inner.fill(
                Path(roundedRect: CGRect(x: cx - 0.2 * s, y: cy + 0.08 * s, width: 0.4 * s, height: 0.4 * s), cornerRadius: 0.14 * s),
                with: .color(finaleColor(city.accent))
            )
            let skin = finaleColor(city.skin)
            let headY = cy - 0.04 * s
            inner.fill(Path(ellipseIn: CGRect(x: cx - 0.12 * s, y: headY - 0.12 * s, width: 0.24 * s, height: 0.24 * s)), with: .color(skin))
            var hair = Path()
            hair.addArc(center: CGPoint(x: cx, y: headY - 0.02 * s), radius: 0.125 * s, startAngle: .degrees(180), endAngle: .degrees(360), clockwise: false)
            hair.closeSubpath()
            inner.fill(hair, with: .color(Color(red: 0.12, green: 0.16, blue: 0.22)))
            let eye = Color(red: 0.06, green: 0.09, blue: 0.16)
            inner.fill(Path(ellipseIn: CGRect(x: cx - 0.057 * s, y: headY + 0.004 * s, width: 0.03 * s, height: 0.03 * s)), with: .color(eye))
            inner.fill(Path(ellipseIn: CGRect(x: cx + 0.027 * s, y: headY + 0.004 * s, width: 0.03 * s, height: 0.03 * s)), with: .color(eye))
            var smile = Path()
            smile.addArc(center: CGPoint(x: cx, y: headY + 0.042 * s), radius: 0.046 * s, startAngle: .degrees(27), endAngle: .degrees(153), clockwise: false)
            inner.stroke(smile, with: .color(eye), lineWidth: 0.017 * s)
            // the frame
            ctx.stroke(disc, with: .color(gold), lineWidth: 0.035 * s)
            ctx.stroke(
                Path(ellipseIn: CGRect(x: cx - r + 0.03 * s, y: cy - r + 0.03 * s, width: (r - 0.03 * s) * 2, height: (r - 0.03 * s) * 2)),
                with: .color(Color(red: 1, green: 0.97, blue: 0.84).opacity(0.6)), lineWidth: 0.008 * s
            )
            // the waving arm, reaching out past the frame toward the middle of the screen
            let toward: Double = (onLeft ? 1 : -1) * (p == 0 ? 1 : -1)
            let shoulder = CGPoint(x: cx + toward * 0.17 * s, y: cy + 0.14 * s)
            let a = -1.0 + (p == 0 ? wave : -wave * 0.8)
            let hand = CGPoint(x: shoulder.x + toward * cos(a) * 0.3 * s, y: shoulder.y + sin(a) * 0.3 * s)
            var arm = Path()
            arm.move(to: shoulder)
            arm.addLine(to: hand)
            ctx.stroke(arm, with: .color(skin), style: StrokeStyle(lineWidth: 0.07 * s, lineCap: .round))
            ctx.fill(Path(ellipseIn: CGRect(x: hand.x - 0.05 * s, y: hand.y - 0.05 * s, width: 0.1 * s, height: 0.1 * s)), with: .color(skin))
        }
    }

    /// The mountain the campaign climbs: a ledge per city with its coin once cleaned, a path that
    /// turns gold as far as the player has climbed, and the Golden Molar waiting on the peak.
    func paintMountain(_ ctx: inout GraphicsContext, t: Double) {
        let m = CityFinale.mountain(t, reducedMotion: rm)
        guard m.alpha > 0.01 else { return }
        func X(_ x: Double) -> Double { sx(x) }
        func Y(_ y: Double) -> Double { sy(y + m.dy) }
        let topReached = atTop && t >= CityFinale.summitHop
        let blaze = topReached ? min(1, 0.6 + exp(-(t - CityFinale.summitHop) / 0.5)) : 0.35 + (rm ? 0 : 0.1 * sin(t * 3))
        paintGlow(
            &ctx,
            x: X(CityFinale.Mountain.summit.x),
            y: Y(CityFinale.Mountain.summit.y),
            radius: (topReached ? 0.9 : 0.5) * unit,
            color: Color(red: 0.99, green: 0.9, blue: 0.54).opacity(0.55),
            alpha: m.alpha * blaze
        )
        var c = ctx
        c.opacity = m.alpha
        var body = Path()
        for (i, p) in CityFinale.Mountain.outline.enumerated() {
            if i == 0 { body.move(to: CGPoint(x: X(p.x), y: Y(p.y))) } else { body.addLine(to: CGPoint(x: X(p.x), y: Y(p.y))) }
        }
        body.closeSubpath()
        c.fill(body, with: .linearGradient(
            Gradient(stops: [
                .init(color: Color(red: 0.36, green: 0.42, blue: 0.55), location: 0),
                .init(color: Color(red: 0.15, green: 0.2, blue: 0.3), location: 0.45),
                .init(color: Color(red: 0.04, green: 0.07, blue: 0.13), location: 1),
            ]),
            startPoint: CGPoint(x: 0, y: Y(0.5)),
            endPoint: CGPoint(x: 0, y: Y(-1.1))
        ))
        c.stroke(body, with: .color(Color(red: 0.8, green: 0.84, blue: 0.88).opacity(0.45)), lineWidth: max(1.5, unit * 0.008))
        var snow = Path()
        for (i, p) in CityFinale.Mountain.snow.enumerated() {
            if i == 0 { snow.move(to: CGPoint(x: X(p.x), y: Y(p.y))) } else { snow.addLine(to: CGPoint(x: X(p.x), y: Y(p.y))) }
        }
        snow.closeSubpath()
        c.fill(snow, with: .color(Color(red: 0.89, green: 0.91, blue: 0.94)))

        let here = request.worldIndex
        func earned(_ i: Int) -> Bool { i == here ? t >= CityFinale.climbHop : finish(i) != .empty }
        let stops = [CityFinale.Mountain.foot] + CityFinale.Mountain.ledges + [CityFinale.Mountain.summitStand]
        for k in 0..<(stops.count - 1) {
            let done = k < CityFinale.campaignPieces ? earned(k) : topReached
            var seg = Path()
            seg.move(to: CGPoint(x: X(stops[k].x), y: Y(stops[k].y)))
            seg.addLine(to: CGPoint(x: X(stops[k + 1].x), y: Y(stops[k + 1].y)))
            c.stroke(
                seg,
                with: .color(done ? Color(red: 0.98, green: 0.75, blue: 0.14) : Color(red: 0.89, green: 0.91, blue: 0.94).opacity(0.45)),
                style: StrokeStyle(
                    lineWidth: max(2, unit * (done ? 0.014 : 0.009)),
                    lineCap: .round,
                    dash: done ? [] : [max(2, unit * 0.012), max(3, unit * 0.02)]
                )
            )
        }

        let coinR = 0.072 * unit
        for (i, p) in CityFinale.Mountain.ledges.enumerated() {
            c.fill(
                Path(ellipseIn: CGRect(x: X(p.x) - unit * 0.1, y: Y(p.y) + unit * 0.075 - unit * 0.025, width: unit * 0.2, height: unit * 0.05)),
                with: .color(earned(i) ? Color(red: 0.99, green: 0.9, blue: 0.54) : Color(red: 0.28, green: 0.33, blue: 0.41))
            )
            let side: Double = p.x < 0 ? -1 : 1
            let cx = X(p.x + side * 0.17)
            let cy = Y(p.y + 0.02)
            if earned(i) {
                let pop: Double
                if i == here && !rm {
                    let u = max(0, min(1, (t - CityFinale.climbHop) / 0.35)) - 1
                    pop = 1 + 2.7 * u * u * u + 1.7 * u * u
                } else {
                    pop = 1
                }
                paintPiece(&ctx, FinaleModels.city(i), finish: finish(i) == .empty ? .pearl : finish(i), x: cx, y: cy, radius: coinR * pop, alpha: m.alpha)
            } else {
                c.stroke(
                    Path(ellipseIn: CGRect(x: cx - coinR * 0.9, y: cy - coinR * 0.9, width: coinR * 1.8, height: coinR * 1.8)),
                    with: .color(Color(red: 0.89, green: 0.91, blue: 0.94).opacity(0.5)),
                    style: StrokeStyle(lineWidth: max(1, coinR * 0.12), dash: [max(2, coinR * 0.25), max(2, coinR * 0.2)])
                )
            }
        }
    }

    /// A city's celebration over its skyline: fireworks and its own special (beads, balloons, shooting stars).
    func paintShow(_ ctx: inout GraphicsContext, _ city: FinaleCityModel, view: CityView, showT: Double, dim: Double) {
        let plan = city.plan
        func toX(_ x: Double) -> Double { view.ox + x * view.s }
        func toY(_ y: Double) -> Double { view.oy - y * view.s }
        if showT >= 0 {
            switch plan.show {
            case .beads:
                var c = ctx
                c.opacity = dim
                for bead in CityFinale.beads(showT) {
                    let r = max(2, 0.17 * view.s)
                    c.fill(Path(ellipseIn: CGRect(x: toX(bead.x) - r, y: toY(bead.y) - r, width: r * 2, height: r * 2)), with: .color(finaleColor(finaleRGB(bead.colorHex))))
                }
            case .balloons:
                var c = ctx
                c.opacity = dim
                for b in CityFinale.balloons(showT) {
                    let bx = toX(b.x)
                    let by = toY(b.y)
                    let r = 0.75 * view.s
                    c.fill(Path(ellipseIn: CGRect(x: bx - r, y: by - r, width: r * 2, height: r * 2)), with: .color(finaleColor(finaleRGB(b.colorHex))))
                    c.fill(Path(ellipseIn: CGRect(x: bx - r * 0.36, y: by - r, width: r * 0.72, height: r * 2)), with: .color(finaleColor(finaleRGB(b.color2Hex))))
                    var ropes = Path()
                    ropes.move(to: CGPoint(x: bx - r * 0.45, y: by + r * 0.85))
                    ropes.addLine(to: CGPoint(x: bx - r * 0.25, y: by + r * 1.45))
                    ropes.move(to: CGPoint(x: bx + r * 0.45, y: by + r * 0.85))
                    ropes.addLine(to: CGPoint(x: bx + r * 0.25, y: by + r * 1.45))
                    c.stroke(ropes, with: .color(Color(red: 0.89, green: 0.91, blue: 0.94)), lineWidth: max(1, 0.04 * view.s))
                    c.fill(Path(CGRect(x: bx - r * 0.3, y: by + r * 1.45, width: r * 0.6, height: r * 0.38)), with: .color(Color(red: 0.55, green: 0.37, blue: 0.2)))
                }
            case .meteors:
                for m in CityFinale.meteors(showT) {
                    var streak = Path()
                    streak.move(to: CGPoint(x: toX(m.tailX), y: toY(m.tailY)))
                    streak.addLine(to: CGPoint(x: toX(m.x), y: toY(m.y)))
                    ctx.stroke(streak, with: .linearGradient(
                        Gradient(colors: [.white.opacity(0), .white.opacity(m.alpha)]),
                        startPoint: CGPoint(x: toX(m.tailX), y: toY(m.tailY)),
                        endPoint: CGPoint(x: toX(m.x), y: toY(m.y))
                    ), style: StrokeStyle(lineWidth: max(1.5, 0.08 * view.s), lineCap: .round))
                }
            default:
                break
            }
            for (b, burst) in plan.bursts.enumerated() {
                if let r = CityFinale.rocket(burst, showT: showT, show: plan.show), !rm {
                    paintGlow(&ctx, x: toX(r.x), y: toY(r.y), radius: 0.6 * view.s, color: Color(red: 1, green: 0.95, blue: 0.78).opacity(0.9), alpha: 1)
                }
                if rm { continue }
                let c1 = finaleRGB(burst.colorHex)
                let c2 = finaleRGB(burst.color2Hex)
                for s in CityFinale.burstSparks(burst, index: b, showT: showT, show: plan.show) {
                    paintSpark(&ctx, x: toX(s.x), y: toY(s.y), px: toX(s.px), py: toY(s.py), color: finaleColor(c1 + (c2 - c1) * s.mix), size: max(1.6, 0.075 * view.s), alpha: s.alpha * dim)
                }
            }
        }
    }

    func paintRays(_ ctx: inout GraphicsContext, x: Double, y: Double, radius: Double, t: Double) {
        var c = ctx
        c.opacity = 0.28
        c.concatenate(CGAffineTransform(translationX: x, y: y).rotated(by: t * 0.6))
        for k in 0..<12 {
            var ray = Path()
            ray.move(to: .zero)
            ray.addLine(to: CGPoint(x: radius, y: -radius * 0.09))
            ray.addLine(to: CGPoint(x: radius, y: radius * 0.09))
            ray.closeSubpath()
            c.fill(ray.applying(CGAffineTransform(rotationAngle: Double(k + 1) * Double.pi * 2 / 12)), with: .color(Color(red: 0.99, green: 0.9, blue: 0.54)))
        }
    }

    func fillScreen(_ ctx: inout GraphicsContext, color: Color, alpha: Double) {
        guard alpha > 0.01 else { return }
        var c = ctx
        c.opacity = alpha
        c.fill(Path(CGRect(x: 0, y: 0, width: w, height: h)), with: .color(color))
    }

    // MARK: The city finale

    func drawCity(_ ctx: inout GraphicsContext, t: Double) {
        guard let city else { return }
        let plan = city.plan
        paintSky(&ctx, t: t)
        let cam = CityFinale.camera(t, reducedMotion: rm)
        let view = cityView(cx: cam.cx, viewW: cam.viewW)
        let showT = t - CityFinale.blazeEnd
        paintCity(
            &ctx,
            city,
            view: view,
            tint: { run in CityFinale.cityTint(t, cx: run.cx, layer: run.layer, show: plan.show, reducedMotion: rm) },
            motionTime: { run in
                if rm { return nil }
                let pass = CityFinale.passTime(run.cx, reducedMotion: false)
                return t > pass ? t - pass : nil
            }
        )
        func toX(_ x: Double) -> Double { view.ox + x * view.s }
        func toY(_ y: Double) -> Double { view.oy - y * view.s }
        let dim = CityFinale.backdropDim(t)

        paintShow(&ctx, city, view: view, showT: showT, dim: rm ? 0 : dim)

        // the mountain the cities climb
        paintMountain(&ctx, t: t)

        // the probe, with a short trail (in front of the molar once it lifts off from the summit)
        func drawProbe(_ ctx: inout GraphicsContext) {
            let probe = CityFinale.probe(t, reducedMotion: rm, climbTo: request.worldIndex, summit: atTop)
            if probe.space != .hidden {
                func toScreen(_ p: CityFinale.Probe) -> CGPoint {
                    p.space == .city ? CGPoint(x: toX(p.x), y: toY(p.y)) : CGPoint(x: sx(p.x), y: sy(p.y))
                }
                let radius = probe.space == .city ? 0.42 * view.s : 0.075 * unit
                if !rm {
                    for k in stride(from: 8, through: 1, by: -1) {
                        let past = CityFinale.probe(t - Double(k) * 0.035, reducedMotion: rm, climbTo: request.worldIndex, summit: atTop)
                        if past.space != probe.space { continue }
                        let p = toScreen(past)
                        let r = radius * (0.6 - Double(k) * 0.04)
                        ctx.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)), with: .color(Color(red: 0.37, green: 0.92, blue: 0.83).opacity(0.5 * (1 - Double(k) / 9))))
                    }
                }
                let p = toScreen(probe)
                paintProbe(&ctx, x: p.x, y: p.y, radius: radius, alpha: probe.alpha, t: t)
            }
        }
        if t < CityFinale.climbEnd { drawProbe(&ctx) }

        let host = CityFinale.host(t, reducedMotion: rm)
        paintHost(&ctx, city, onLeft: plan.hostOnLeft, rise: host.rise, wave: host.wave)

        if let r = CityFinale.emblemRocket(t), !rm {
            paintGlow(&ctx, x: sx(r.x), y: sy(r.y), radius: 0.06 * unit, color: Color(red: 1, green: 0.95, blue: 0.78).opacity(0.95), alpha: 1)
        }
        if t >= CityFinale.emblemBurst && t < CityFinale.gatherEnd {
            let shape = CityFinale.emblemShape(t)
            if shape.alpha > 0.01 {
                let ex = sx(rm ? CityFinale.emblemCenter.x : shape.x)
                let ey = sy(rm ? CityFinale.emblemCenter.y : shape.y)
                let r = (rm ? CityFinale.emblemScale : shape.scale) * unit
                paintGlow(&ctx, x: ex, y: ey, radius: r * 1.7, color: Color(red: 1, green: 0.98, blue: 0.92).opacity(0.4), alpha: shape.alpha)
                paintEmblem(&ctx, city, x: ex, y: ey, radius: r, alpha: shape.alpha)
            }
            if !rm {
                for (i, target) in city.targets.enumerated() {
                    guard let s = CityFinale.emblemSpark(target, index: i, t: t) else { continue }
                    let x = sx(s.x)
                    let y = sy(s.y)
                    paintSpark(&ctx, x: x, y: y, px: x, py: y, color: finaleColor(finaleRGB(target.colorHex)), size: max(1.6, 0.0085 * unit), alpha: s.alpha)
                }
            }
        }

        let molar = CityFinale.molar(t, reducedMotion: rm)
        let finishHere = finish(request.worldIndex)
        if molar.alpha > 0 {
            let center = FinalePoint(x: molar.x, y: molar.y)
            paintGlow(&ctx, x: sx(center.x), y: sy(center.y), radius: 1.1 * molar.scale * unit, color: Color(red: 0.99, green: 0.9, blue: 0.54).opacity(0.22), alpha: molar.alpha)
            paintMolar(
                &ctx,
                cx: center.x,
                cy: center.y,
                scale: CityFinale.Molar.scale * molar.scale,
                alpha: molar.alpha,
                placed: { i in i == request.worldIndex ? (t >= CityFinale.slot ? finishHere : .empty) : finish(i) },
                shineIndex: request.worldIndex,
                shine: CityFinale.slotShine(t)
            )
        }

        let piece = CityFinale.piece(t, slotIndex: request.worldIndex, reducedMotion: rm)
        if piece.visible {
            let px = sx(piece.x)
            let py = sy(piece.y)
            let r = CityFinale.pieceRadius * piece.scale * unit
            if t >= CityFinale.meet && t < CityFinale.prizeEnd && !rm { paintRays(&ctx, x: px, y: py, radius: r * 3.2, t: t) }
            let glowColor = finishHere == .gold ? Color(red: 0.99, green: 0.88, blue: 0.28).opacity(0.7) : Color(red: 0.89, green: 0.91, blue: 0.94).opacity(0.6)
            paintGlow(&ctx, x: px, y: py, radius: r * 2.6 * piece.glow, color: glowColor, alpha: piece.alpha)
            paintPiece(&ctx, city, finish: finishHere, x: px, y: py, radius: r, spin: piece.spin, alpha: piece.alpha)
        }

        if t >= CityFinale.climbEnd { drawProbe(&ctx) }

        let flash = t >= CityFinale.meet && !rm ? exp(-(t - CityFinale.meet) / 0.12) * 0.7 : 0
        let endingFollows = clock.total > clock.cityLength
        let toLight = endingFollows ? 0 : CityFinale.smooth01((t - (CityFinale.end - 0.8)) / 0.8)
        let toDark = endingFollows ? CityFinale.smooth01((t - (CityFinale.end - 0.8)) / 0.8) : 0
        fillScreen(&ctx, color: Color(red: 1, green: 0.98, blue: 0.92), alpha: flash)
        fillScreen(&ctx, color: Color(red: 0.9, green: 1, blue: 0.98), alpha: toLight)
        fillScreen(&ctx, color: Color(red: 0.004, green: 0.012, blue: 0.047), alpha: toDark)
    }

    // MARK: The ending

    func drawEnding(_ ctx: inout GraphicsContext, t: Double) {
        typealias E = CityFinale.Ending
        paintSky(&ctx, t: t)
        let credit = CityFinale.endingCredit(t)
        if credit.index >= 0, let c = FinaleModels.city(credit.index) {
            let within = t - E.creditsStart - Double(credit.index) * E.creditSeconds
            let view = cityView(cx: rm ? 32 : 29 + within * 1.5, viewW: 64)
            paintCity(&ctx, c, view: view, tint: { _ in (credit.alpha, 0) }, motionTime: { _ in rm ? nil : t })
            // each city's own celebration plays again under its credit
            paintShow(&ctx, c, view: view, showT: within - 0.6, dim: rm ? 0 : credit.alpha)
            paintHost(&ctx, c, onLeft: c.plan.hostOnLeft, rise: credit.alpha, wave: rm ? 0 : 0.5 * sin(Double.pi * 2 * 1.4 * t))
        }

        let place = CityFinale.endingMolarPlace(t, reducedMotion: rm)
        let snapped = t >= E.snap
        let bodyFinish: MolarFinish = snapped ? (allGold ? .gold : .pearl) : .empty
        if place.alpha > 0 {
            paintGlow(&ctx, x: sx(place.x), y: sy(place.y), radius: place.scale * 2.2 * unit, color: Color(red: 0.99, green: 0.9, blue: 0.54).opacity(0.25), alpha: place.alpha * (snapped ? 1 : 0.5))
            paintMolar(
                &ctx,
                cx: place.x,
                cy: place.y,
                scale: place.scale,
                alpha: place.alpha,
                placed: { i in CityFinale.endingPiece(i, t: t, reducedMotion: rm).arrived ? finish(i) : .empty },
                bodyFinish: bodyFinish
            )
        }
        for i in 0..<CityFinale.campaignPieces {
            let p = CityFinale.endingPiece(i, t: t, reducedMotion: rm)
            if p.arrived || p.alpha <= 0 { continue }
            let r = CityFinale.Molar.cuspRadius * place.scale * p.scale * unit
            paintGlow(&ctx, x: sx(p.x), y: sy(p.y), radius: r * 2.4, color: Color(red: 0.99, green: 0.9, blue: 0.54).opacity(0.6), alpha: p.alpha)
            paintPiece(&ctx, FinaleModels.city(i), finish: finish(i), x: sx(p.x), y: sy(p.y), radius: r, spin: p.spin, alpha: p.alpha)
        }

        if t >= E.finaleStart {
            let showT = t - E.finaleStart
            if !rm {
                for (b, burst) in CityFinale.endingBursts.enumerated() {
                    let c1 = finaleRGB(burst.colorHex)
                    let c2 = finaleRGB(burst.color2Hex)
                    for s in CityFinale.burstSparks(burst, index: b, showT: showT, show: .fireworks, scale: CityFinale.endingBurstScale) {
                        paintSpark(&ctx, x: sx(s.x), y: sy(s.y), px: sx(s.px), py: sy(s.py), color: finaleColor(c1 + (c2 - c1) * s.mix), size: max(1.5, 0.011 * unit), alpha: s.alpha)
                    }
                }
            }
            for i in 0..<CityFinale.campaignPieces {
                let o = CityFinale.endingEmblemOrbit(i, t: t, reducedMotion: rm)
                guard let c = FinaleModels.city(i), o.alpha > 0 else { continue }
                paintGlow(&ctx, x: sx(o.x), y: sy(o.y), radius: 0.2 * unit, color: Color(red: 0.99, green: 0.9, blue: 0.54).opacity(0.45), alpha: o.alpha)
                paintEmblem(&ctx, c, x: sx(o.x), y: sy(o.y), radius: 0.11 * unit, alpha: o.alpha)
            }
            if allGold {
                let face = CityFinale.endingFace(t, allGold: allGold)
                if face.alpha > 0 { paintFace(&ctx, cx: place.x, cy: place.y, scale: place.scale, alpha: face.alpha, wink: face.wink) }
                if !rm {
                    for drop in CityFinale.endingGoldRain(t, halfWidth: w / 2 / unit) {
                        ctx.fill(Path(CGRect(x: sx(drop.x), y: sy(drop.y), width: 3, height: 3)), with: .color(Color(red: 0.99, green: 0.88, blue: 0.28).opacity(drop.alpha)))
                    }
                }
            }
        }

        let snapFlash = t >= E.snap && !rm ? exp(-(t - E.snap) / 0.15) * 0.75 : 0
        fillScreen(&ctx, color: Color(red: 1, green: 0.98, blue: 0.92), alpha: snapFlash)
        fillScreen(&ctx, color: Color(red: 0.004, green: 0.012, blue: 0.047), alpha: CityFinale.smooth01((t - (E.end - 0.6)) / 0.6))
    }

    func paintFace(_ ctx: inout GraphicsContext, cx: Double, cy: Double, scale: Double, alpha: Double, wink: Bool) {
        paintFaceAt(&ctx, x: sx(cx + CityFinale.Molar.bodyCenter.x * scale), y: sy(cy + CityFinale.Molar.bodyCenter.y * scale), u: unit * scale, alpha: alpha, wink: wink)
    }

    /// The molar's face round screen point (x, y); `u` is one molar unit in points.
    /// The Golden Molar's arms for "a hug for you" (as the web's paintHugArms): from its sides they
    /// open wide toward the child, then fold round its middle, peach mittens landing just below its
    /// cheeks, and squeeze. `u` is the face's size.
    func paintHugArms(_ ctx: inout GraphicsContext, x: Double, y: Double, u: Double, hug: CityFinale.EndingHug, alpha: Double, gold: Bool) {
        let a = hug.arms * alpha
        guard a > 0.01, u >= 4 else { return }
        func mix(_ p: Double, _ q: Double, _ k: Double) -> Double { p + (q - p) * k }
        var c = ctx
        c.opacity = a
        for side in [-1.0, 1.0] {
            // shoulder, elbow (the curve's pull) and hand, in face units: tucked, wide open, hugging
            let sx = x + side * 1.0 * u
            let sy = y + 0.36 * u
            let hx = x + side * mix(mix(1.05, 1.78, hug.open), 0.44 - 0.07 * hug.squeeze, hug.fold) * u
            let hy = y + mix(mix(0.6, -0.32, hug.open), 0.44, hug.fold) * u
            let ex = x + side * mix(mix(1.15, 1.55, hug.open), 1.22, hug.fold) * u
            let ey = y + mix(mix(0.75, 0.42, hug.open), 1.0, hug.fold) * u
            var arm = Path()
            arm.move(to: CGPoint(x: sx, y: sy))
            arm.addQuadCurve(to: CGPoint(x: hx, y: hy), control: CGPoint(x: ex, y: ey))
            c.stroke(arm, with: .linearGradient(
                Gradient(colors: gold
                    ? [Color(red: 0.79, green: 0.6, blue: 0.18), Color(red: 0.95, green: 0.75, blue: 0.31)]
                    : [Color(red: 0.81, green: 0.78, blue: 0.71), Color(red: 0.93, green: 0.9, blue: 0.84)]),
                startPoint: CGPoint(x: sx, y: sy), endPoint: CGPoint(x: hx, y: hy)
            ), style: StrokeStyle(lineWidth: u * (0.2 + 0.02 * hug.squeeze), lineCap: .round))
            // a little peach mitten with a thumb
            let mitten = GraphicsContext.Shading.radialGradient(
                Gradient(colors: [Color(red: 1, green: 0.93, blue: 0.84), Color(red: 0.98, green: 0.57, blue: 0.24)]),
                center: CGPoint(x: hx - u * 0.05, y: hy - u * 0.06), startRadius: u * 0.02, endRadius: u * 0.17
            )
            c.fill(Path(ellipseIn: CGRect(x: hx - u * 0.16, y: hy - u * 0.16, width: u * 0.32, height: u * 0.32)), with: mitten)
            c.fill(Path(ellipseIn: CGRect(x: hx - side * u * 0.12 - u * 0.065, y: hy - u * 0.1 - u * 0.065, width: u * 0.13, height: u * 0.13)), with: mitten)
        }
    }

    /// Little hearts floating up from the hug, swaying as they rise (still, with Reduce Motion).
    func paintHearts(_ ctx: inout GraphicsContext, x: Double, y: Double, u: Double, t: Double, amount: Double) {
        guard amount > 0.01, u >= 4 else { return }
        let colors: [Color] = [
            Color(red: 0.98, green: 0.44, blue: 0.52), Color(red: 0.96, green: 0.45, blue: 0.71),
            Color(red: 0.99, green: 0.88, blue: 0.28), Color(red: 0.99, green: 0.64, blue: 0.69),
        ]
        var heart = Path()
        heart.move(to: CGPoint(x: 0, y: 0.35))
        heart.addCurve(to: CGPoint(x: 0, y: -0.45), control1: CGPoint(x: -1.1, y: -0.35), control2: CGPoint(x: -0.45, y: -1.15))
        heart.addCurve(to: CGPoint(x: 0, y: 0.35), control1: CGPoint(x: 0.45, y: -1.15), control2: CGPoint(x: 1.1, y: -0.35))
        heart.closeSubpath()
        for k in 0..<12 {
            let start = CityFinale.Ending.wink + 1.5 + Double(k) * 0.22
            let age = rm ? 0.9 + Double(k % 4) * 0.25 : t - start
            if age <= 0 { continue }
            let life = rm ? 1.0 : 2.4
            let fade = rm ? amount : min(1, age / 0.25) * max(0, 1 - age / life)
            if fade <= 0.01 { continue }
            let hx = x + (CityFinale.hash(k, 71) - 0.5) * 3.0 * u + (rm ? 0 : sin(age * 3 + Double(k)) * 0.12 * u)
            let hy = y + 0.3 * u - age * 0.95 * u
            let s = u * (0.14 + 0.08 * CityFinale.hash(k, 73))
            var c = ctx
            c.opacity = fade * amount
            c.concatenate(CGAffineTransform(translationX: hx, y: hy).scaledBy(x: s, y: s))
            c.fill(heart, with: .color(colors[k % colors.count]))
        }
    }

    func paintFaceAt(_ ctx: inout GraphicsContext, x: Double, y: Double, u: Double, alpha: Double, wink: Bool, happy: Bool = false) {
        let brown = Color(red: 0.26, green: 0.13, blue: 0.02)
        var c = ctx
        c.opacity = alpha
        func eye(_ ex: Double, closed: Bool) {
            if closed {
                var lid = Path()
                lid.addArc(center: CGPoint(x: ex, y: y - u * 0.04), radius: u * 0.11, startAngle: .radians(1.15 * Double.pi), endAngle: .radians(1.85 * Double.pi), clockwise: false)
                c.stroke(lid, with: .color(brown), style: StrokeStyle(lineWidth: max(2, u * 0.045), lineCap: .round))
                return
            }
            let white = Path(ellipseIn: CGRect(x: ex - u * 0.12, y: y - u * 0.22, width: u * 0.24, height: u * 0.28))
            c.fill(white, with: .color(Color(red: 1, green: 0.98, blue: 0.92)))
            c.stroke(white, with: .color(brown), lineWidth: max(2, u * 0.045))
            c.fill(Path(ellipseIn: CGRect(x: ex + u * 0.02 - u * 0.065, y: y - u * 0.06 - u * 0.065, width: u * 0.13, height: u * 0.13)), with: .color(brown))
            c.fill(Path(ellipseIn: CGRect(x: ex - u * 0.026, y: y - u * 0.11, width: u * 0.044, height: u * 0.044)), with: .color(Color(red: 1, green: 0.98, blue: 0.92)))
        }
        // `happy`: both eyes curve shut for a moment during the hug's squeeze
        eye(x - u * 0.3, closed: happy)
        eye(x + u * 0.3, closed: wink || happy)
        var smile = Path()
        smile.addArc(center: CGPoint(x: x, y: y + u * 0.05), radius: u * 0.3, startAngle: .radians(0.15 * Double.pi), endAngle: .radians(0.85 * Double.pi), clockwise: false)
        c.stroke(smile, with: .color(brown), style: StrokeStyle(lineWidth: max(2, u * 0.06), lineCap: .round))
        c.fill(Path(ellipseIn: CGRect(x: x - u * 0.59, y: y + u * 0.03, width: u * 0.18, height: u * 0.18)), with: .color(Color(red: 0.98, green: 0.44, blue: 0.52).opacity(0.45)))
        c.fill(Path(ellipseIn: CGRect(x: x + u * 0.41, y: y + u * 0.03, width: u * 0.18, height: u * 0.18)), with: .color(Color(red: 0.98, green: 0.44, blue: 0.52).opacity(0.45)))
    }
}

// MARK: - The Golden Molar badge on the main menu

/// The small Golden Molar: each cusp in its city's finish.
public struct GoldenMolarBadge: View {
    public let finishes: [MolarFinish]

    public init(finishes: [MolarFinish]) {
        self.finishes = finishes
    }

    public var body: some View {
        Canvas { ctx, size in
            let k = min(size.width / 2.4, size.height / 2.0)
            let cx = size.width / 2 - CityFinale.Molar.bodyCenter.x * k
            let cy = size.height / 2
            func px(_ x: Double) -> Double { cx + x * k }
            func py(_ y: Double) -> Double { cy - y * k }
            func crown(_ grow: Double) -> Path {
                var p = Path()
                let core = CityFinale.Molar.core
                p.addRoundedRect(
                    in: CGRect(x: px(core.x - grow), y: py(core.y + core.h + grow), width: (core.w + grow * 2) * k, height: (core.h + grow * 2) * k),
                    cornerSize: CGSize(width: (core.r + grow) * k, height: (core.r + grow) * k)
                )
                for cusp in CityFinale.Molar.cusps {
                    let r = (CityFinale.Molar.lobeRadius + grow) * k
                    p.addEllipse(in: CGRect(x: px(cusp.x) - r, y: py(cusp.y) - r, width: r * 2, height: r * 2))
                }
                return p
            }
            ctx.fill(crown(0.09), with: .color(Color(red: 0.98, green: 0.75, blue: 0.14)))
            ctx.fill(crown(0), with: .color(Color(red: 0.06, green: 0.09, blue: 0.16)))
            let r = CityFinale.Molar.cuspRadius * k
            for (i, cusp) in CityFinale.Molar.cusps.enumerated() {
                let f = i < finishes.count ? finishes[i] : .empty
                let rect = CGRect(x: px(cusp.x) - r, y: py(cusp.y) - r, width: r * 2, height: r * 2)
                if f == .empty {
                    ctx.stroke(Path(ellipseIn: rect.insetBy(dx: r * 0.1, dy: r * 0.1)), with: .color(Color.white.opacity(0.5)), style: StrokeStyle(lineWidth: 0.9, dash: [1.6, 1.2]))
                } else {
                    let colors = CityFinale.finishColors(f)
                    ctx.fill(Path(ellipseIn: rect), with: .color(finaleColor(finaleRGB(colors.light))))
                    ctx.stroke(Path(ellipseIn: rect), with: .color(finaleColor(finaleRGB(colors.dark))), lineWidth: 0.9)
                }
            }
        }
        .frame(width: 26, height: 22)
        .accessibilityHidden(true)
    }
}
