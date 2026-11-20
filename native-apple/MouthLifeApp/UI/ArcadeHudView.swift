import SwiftUI
import MouthLifeCore
#if canImport(AppKit)
import AppKit
#endif

public struct ArcadeHudView: View {
    public let cartridge: WorldCartridge
    public let snapshot: SessionSnapshot
    public let toastMessage: String?
    public let liveFps: Int
    public let showProMotionBadge: Bool

    public let onFireFlossSmart: () -> Void
    public let onFireFlossDirection: (Vec2) -> Void
    public let onFireRinse: () -> Void
    public let onFireDisclose: () -> Void
    public let onVirtualStickMove: (Double, Double, Bool) -> Void
    public let onExitToHub: () -> Void
    /// Tells the game the pause card is up or down, so the mission really stops while it shows.
    public let onPauseChanged: (Bool) -> Void
    /// The iPhone Duo's two pages (nil on every other screen): the 3D city and the stick on the first,
    /// the city map and the action buttons on the second.
    public let split: DuoSplit?
    /// The Duo was folded, unfolded or turned (the scene clears any held input).
    public let onLayoutChanged: () -> Void

    /// The Floss ring's drag; resets by itself if the touch is cancelled.
    @GestureState private var flossDragOffset: CGSize = .zero
    /// The thumbstick's drag from where the thumb landed (nil = no thumb). Resets by itself when the
    /// touch ends or is cancelled (pause card, app to background, the HUD going away).
    @GestureState private var stickTranslation: CGSize?
    /// Set when the stick is let go while a thumb is still down (pause, focus lost): the rest of that
    /// touch does nothing until it is lifted, as on the web (`releaseThumbPad`).
    @State private var stickLatched: Bool = false
    @State private var isPausedSheet: Bool = false
    @Environment(\.scenePhase) private var scenePhase

    private static let stickReach: CGFloat = 30

    /// The knob's offset inside the ring, clamped to its reach.
    private var stickKnobOffset: CGSize {
        guard let t = stickTranslation, !stickLatched, !isPausedSheet else { return .zero }
        let dist = hypot(t.width, t.height)
        let k = dist > Self.stickReach ? Self.stickReach / dist : 1.0
        return CGSize(width: t.width * k, height: t.height * k)
    }

    /// Tells the game what the stick is doing now (zero and not held when there is no live thumb).
    private func pushStick() {
        let o = stickKnobOffset
        let live = stickTranslation != nil && !stickLatched && !isPausedSheet
        onVirtualStickMove(Double(o.width / Self.stickReach), Double(o.height / Self.stickReach), live)
    }

    /// Lets go of the stick; a thumb still down stays ignored until it lifts.
    private func releaseStick() {
        if stickTranslation != nil { stickLatched = true }
        onVirtualStickMove(0, 0, false)
    }

    /// The stage's pause card: one place, so the stick always lets go with it.
    private func openPauseCard() {
        releaseStick()
        isPausedSheet = true
    }

    /// The mission must not run unattended (web: `visibilityHandler` / `blurHandler`).
    private func pauseIfUnattended() {
        if !isPausedSheet { openPauseCard() }
    }

    #if os(macOS)
    private static let pauseHint = "Click a tooth and drag to steer and scrub. Right-click to Floss, or drag the Floss ring to aim."
    private static let zipReadyText = "🧵 Right-click to Zip!"
    #else
    private static let pauseHint = "Touch any tooth to steer and scrub. Double-tap to Floss, or drag the Floss ring to aim."
    private static let zipReadyText = "🧵 Tap to Zip!"
    #endif

    public init(
        cartridge: WorldCartridge,
        snapshot: SessionSnapshot,
        toastMessage: String?,
        liveFps: Int,
        showProMotionBadge: Bool,
        onFireFlossSmart: @escaping () -> Void,
        onFireFlossDirection: @escaping (Vec2) -> Void,
        onFireRinse: @escaping () -> Void,
        onFireDisclose: @escaping () -> Void,
        onVirtualStickMove: @escaping (Double, Double, Bool) -> Void,
        onExitToHub: @escaping () -> Void,
        onPauseChanged: @escaping (Bool) -> Void = { _ in },
        split: DuoSplit? = nil,
        onLayoutChanged: @escaping () -> Void = {}
    ) {
        self.split = split
        self.onLayoutChanged = onLayoutChanged
        self.cartridge = cartridge
        self.snapshot = snapshot
        self.toastMessage = toastMessage
        self.liveFps = liveFps
        self.showProMotionBadge = showProMotionBadge
        self.onFireFlossSmart = onFireFlossSmart
        self.onFireFlossDirection = onFireFlossDirection
        self.onFireRinse = onFireRinse
        self.onFireDisclose = onFireDisclose
        self.onVirtualStickMove = onVirtualStickMove
        self.onExitToHub = onExitToHub
        self.onPauseChanged = onPauseChanged
    }

    private var timerState: TimerPillState {
        buildTimerPill(
            mode: snapshot.activeMode,
            elapsedSec: snapshot.elapsedSec,
            parSec: cartridge.parTimeSec,
            remainingRescueSec: snapshot.remainingRescueSec
        )
    }
    private var cleanPct: Int { Int((snapshot.worldCleanRatio * 100.0).rounded()) }
    private var targetPct: Int { snapshot.activeMode == .pulpRescue ? 85 : 90 }
    private var surgeReady: Bool { snapshot.surgeMeter >= GameConfig.surgeMax - 0.01 }

    public var body: some View {
        ZStack {
            if let split {
                duoLayout(split)
            } else {
                VStack(spacing: 8) {
                    topStrip
                    subPills
                    toastPill

                    // Unobstructed 3D Metal Stage (Touch directly on teeth to steer & scrub, double-tap to Floss!)
                    Spacer()

                    // Ergonomic Bottom Thumb Controls
                    HStack(alignment: .bottom) {
                        stick
                        Spacer()
                        actionCluster
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                }
            }

            if isPausedSheet {
                Color.black.opacity(0.55)
                    .onAppear { onPauseChanged(true) }
                    .onDisappear { onPauseChanged(false) }
                    .ignoresSafeArea()
                    .onTapGesture { isPausedSheet = false }

                VStack(spacing: 14) {
                    Text(L10n.t(cartridge.title))
                        .font(.system(.title3, design: .rounded, weight: .heavy))
                        .foregroundStyle(MLTheme.textPrimary)
                    Text(L10n.t(Self.pauseHint))
                        .font(.system(.footnote, design: .rounded))
                        .foregroundStyle(MLTheme.textSecondary)
                        .multilineTextAlignment(.center)

                    HStack(spacing: 12) {
                        Button(L10n.t("Resume")) {
                            isPausedSheet = false
                        }
                        .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.cyanAccent))

                        Button {
                            isPausedSheet = false
                            onExitToHub()
                        } label: {
                            Label(L10n.t("Exit to Hub"), systemImage: "house.fill")
                        }
                        .buttonStyle(MLHomeButtonStyle())
                    }
                }
                .mlGlassCard(cornerRadius: 24, padding: 20)
                .padding(split == nil ? 28 : 16)
                // on the Duo the card sits on the 3D page; the dimming covers both pages
                .placed(inOptional: split?.firstRect)
            }
        }
        .onChange(of: stickTranslation) { _, now in
            // A lifted (or cancelled) thumb clears the latch for the next touch.
            if now == nil { stickLatched = false }
            pushStick()
        }
        // Folding, unfolding or turning the Duo rebuilds the controls: let go of everything held.
        .onChange(of: split?.axis) { _, _ in
            releaseStick()
            onLayoutChanged()
        }
        // Leaving the screen (Home button, call, lock, another app) pauses the stage; the HUD going
        // away (finale, score) always lets go of the stick.
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { pauseIfUnattended() }
        }
        #if os(macOS)
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didResignActiveNotification)) { _ in
            pauseIfUnattended()
        }
        #endif
        .onDisappear { onVirtualStickMove(0, 0, false) }
    }

    /// The Duo's two pages. Open like a book: the left thumb steers on the 3D page, the right thumb
    /// acts beside the map. Tabletop: the 3D city stands upright; the map lies on the flat page with
    /// the stick and the buttons under it, like a handheld console.
    @ViewBuilder
    private func duoLayout(_ split: DuoSplit) -> some View {
        switch split.axis {
        case .sideBySide:
            VStack(spacing: 8) {
                compactTopStrip
                toastPill
                Spacer()
                HStack {
                    stick
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
            }
            .placed(in: split.firstRect)
            VStack(spacing: 12) {
                StageMapView(cartridge: cartridge, snapshot: snapshot)
                    .padding(.top, 14)
                missionPanel
                Spacer(minLength: 0)
                HStack {
                    Spacer()
                    actionCluster
                }
                .padding(.bottom, 12)
            }
            .padding(.horizontal, 14)
            .placed(in: split.secondRect)
        case .stacked:
            VStack(spacing: 8) {
                topStrip
                subPills
                toastPill
                Spacer()
            }
            .placed(in: split.firstRect)
            VStack(spacing: 10) {
                StageMapView(cartridge: cartridge, snapshot: snapshot)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                HStack(alignment: .bottom) {
                    stick
                    Spacer()
                    actionCluster
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 12)
            .placed(in: split.secondRect)
        }
    }

    @ViewBuilder
    private var topStrip: some View {
        // Top Telemetry Strip
        HStack(spacing: 6) {
            homeButton
            pauseButton
            cleanGauge
                .frame(maxWidth: 165)
            Spacer(minLength: 4)
            synergyPill
            timerPill
            fpsBadge
        }
        .modifier(StripBackground())
    }

    /// The Duo's 3D page keeps only the way out and the pause; the readouts move beside the map.
    private var compactTopStrip: some View {
        HStack(spacing: 6) {
            homeButton
            pauseButton
        }
        .modifier(StripBackground())
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The way back to the main menu: the one bright button, always the house. It pauses first, so a
    /// stray thumb never ends a dive; the pause card then offers the same house beside Resume.
    private var homeButton: some View {
        Button {
            openPauseCard()
        } label: {
            Image(systemName: "house.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(MLTheme.deepOcean)
                .frame(width: 28, height: 28)
                .background(Circle().fill(Color.white))
                .overlay(Circle().stroke(MLTheme.mintClean.opacity(0.75), lineWidth: 2))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L10n.t("Exit to Hub"))
    }

    private var pauseButton: some View {
        Button {
            openPauseCard()
        } label: {
            Image(systemName: "pause.circle.fill")
                .font(.system(size: 22))
                .foregroundStyle(MLTheme.textPrimary)
        }
        .buttonStyle(.plain)
    }

    /// Cleanliness and the district seal pips.
    private var cleanGauge: some View {
        // Cleanliness + District Seal Pips
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Text(L10n.t("\(cleanPct)% / \(targetPct)% CLEAN"))
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .foregroundStyle(cleanPct >= targetPct ? MLTheme.mintClean : MLTheme.textPrimary)

                HStack(spacing: 4) {
                    ForEach(0..<snapshot.sealedDistricts.count, id: \.self) { idx in
                        Circle()
                            .fill(snapshot.sealedDistricts[idx] ? MLTheme.fluorapatiteGold : Color.white.opacity(0.22))
                            .frame(width: 7, height: 7)
                    }
                }
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.14))
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [MLTheme.cyanAccent, MLTheme.mintClean],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * CGFloat(min(1.0, snapshot.worldCleanRatio / (Double(targetPct) / 100.0))))
                }
            }
            .frame(height: 6)
        }
        .frame(maxWidth: 165)
    }

    private var synergyPill: some View {
        // Synergy Pill
        Text(L10n.t(String(format: "%.2gx", snapshot.synergyMultiplier)))
            .font(.system(size: 11, weight: .heavy, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(snapshot.synergyMultiplier >= 2.0 ? MLTheme.fluorapatiteGold : MLTheme.cyanAccent)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Capsule().fill(MLTheme.cardBg))
    }

    private var timerPill: some View {
        // Timer Pill
        Text(L10n.t(timerState.text))
            .font(.system(size: 11, weight: .bold, design: .rounded))
            .monospacedDigit()
            .lineLimit(1)
            .fixedSize()
            .foregroundStyle(timerState.warn ? MLTheme.amberWarn : MLTheme.textPrimary)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(Capsule().fill(MLTheme.cardBg))
    }

    @ViewBuilder
    private var fpsBadge: some View {
        if showProMotionBadge {
            Text(L10n.t(liveFps >= 95 ? "\(liveFps)Hz" : "\(max(60, liveFps))/120Hz"))
                .font(.system(size: 10, weight: .heavy, design: .monospaced))
                .foregroundStyle(MLTheme.mintClean)
                .padding(.horizontal, 7)
                .padding(.vertical, 5)
                .background(Capsule().fill(MLTheme.cardBg))
        }
    }

    /// The Duo's mission panel under the map (open like a book): how clean the city is, each
    /// district with its own share and a gold seal, the timer, the multiplier and the city's own
    /// readout (helper germs, gum comfort...), where the open page has room for them.
    private var missionPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                cleanGauge
                Spacer(minLength: 4)
                synergyPill
                timerPill
            }
            HStack(alignment: .top, spacing: 6) {
                ForEach(cartridge.districts.indices, id: \.self) { i in
                    districtChip(i)
                }
            }
            subPills
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(MLTheme.cardBg))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(MLTheme.cyanAccent.opacity(0.25), lineWidth: 1))
    }

    /// One district: its name, how clean it is, and a gold seal once sealed.
    private func districtChip(_ i: Int) -> some View {
        let clean = i < snapshot.districtCleanRatios.count ? min(1, max(0, snapshot.districtCleanRatios[i])) : 0
        let sealed = i < snapshot.sealedDistricts.count && snapshot.sealedDistricts[i]
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                if sealed {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(MLTheme.fluorapatiteGold)
                }
                Text("\(Int((clean * 100).rounded()))%")
                    .font(.system(size: 13, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(sealed ? MLTheme.fluorapatiteGold : MLTheme.textPrimary)
            }
            Text(L10n.t(cartridge.districts[i].name))
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .foregroundStyle(MLTheme.textSecondary)
                .lineLimit(2)
                .minimumScaleFactor(0.65)
                .fixedSize(horizontal: false, vertical: true)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.14))
                    Capsule()
                        .fill(sealed ? MLTheme.fluorapatiteGold : MLTheme.mintClean)
                        .frame(width: geo.size.width * CGFloat(clean))
                }
            }
            .frame(height: 4)
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(sealed ? 0.10 : 0.05)))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var subPills: some View {
        // World Mechanic / Capillary Zip / Toast Sub-Pill
        HStack(spacing: 8) {
            if let mech = worldMechanicBadge {
                Text(L10n.t(mech.label))
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundStyle(mech.warn ? MLTheme.amberWarn : MLTheme.cyanAccent)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(MLTheme.cardBg))
            }

            // Only for a gap too narrow to drive through, and not mid-zip: "closer" until the
            // floss can reach, then the button (web twin: `tickZipPrompt`).
            if let zipHint = snapshot.nearestZipMouth, zipHint.blockedToWalking, snapshot.probeZip == nil {
                let ready = zipHint.inZipRange
                Button {
                    onFireFlossSmart()
                } label: {
                    Text(L10n.t(ready ? Self.zipReadyText : "🦷 Closer to Zip"))
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                        .foregroundStyle(ready ? MLTheme.deepOcean : MLTheme.textPrimary)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(ready ? MLTheme.fluorapatiteGold : MLTheme.cardBg))
                }
                .buttonStyle(.plain)
                .disabled(!ready)
            }
        }
    }

    @ViewBuilder
    private var toastPill: some View {
        if let toastMessage {
            Text(L10n.t(toastMessage))
                .font(.system(.caption, design: .rounded, weight: .bold))
                .foregroundStyle(MLTheme.textPrimary)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(Capsule().fill(MLTheme.cardElevated))
                .overlay(Capsule().strokeBorder(MLTheme.cyanAccent.opacity(0.45), lineWidth: 1))
        }
    }

    private var stick: some View {
        // Left Floating Scrub Stick (optional alternative to direct touch-on-tooth steering!)
        ZStack {
            Circle()
                .fill(MLTheme.cardBg)
                .frame(width: 82, height: 82)
                .overlay(Circle().strokeBorder(MLTheme.cyanAccent.opacity(0.32), lineWidth: 1.2))

            Circle()
                .fill(MLTheme.cyanAccent.opacity(0.85))
                .frame(width: 34, height: 34)
                .offset(stickKnobOffset)
        }
        .gesture(
            DragGesture(minimumDistance: 0)
                .updating($stickTranslation) { val, state, _ in
                    state = val.translation
                }
        )
        .accessibilityLabel(L10n.t("Brush Thumbstick"))
    }

    private var actionCluster: some View {
        // Right Action Cluster: Disclose Scan, Floss / Vector Ring, Ion Rinse Surge
        HStack(alignment: .bottom, spacing: 12) {
            // Disclosing Dye Sonar Scan (#ff2ea8)
            Button {
                onFireDisclose()
            } label: {
                VStack(spacing: 2) {
                    Image(systemName: "waveform.path.ecg")
                        .font(.system(size: 18, weight: .bold))
                    Text(L10n.t(snapshot.discloseCooldown > 0.05 ? String(format: "%.1fs", snapshot.discloseCooldown) : "SCAN"))
                        .font(.system(size: 9, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                }
                .foregroundStyle(snapshot.discloseCooldown > 0.05 ? MLTheme.textMuted : MLTheme.discloseMagenta)
                .frame(width: 54, height: 54)
                .background(Circle().fill(MLTheme.cardElevated))
                .overlay(Circle().strokeBorder(MLTheme.discloseMagenta.opacity(0.55), lineWidth: 1.4))
            }
            .buttonStyle(.plain)
            .disabled(snapshot.discloseCooldown > 0.05)

            // Ion Rinse Surge Wave
            Button {
                onFireRinse()
            } label: {
                VStack(spacing: 2) {
                    Image(systemName: "drop.triangle.fill")
                        .font(.system(size: 20, weight: .bold))
                    Text(L10n.t(surgeReady ? "SURGE!" : "\(Int(snapshot.surgeMeter.rounded()))%"))
                        .font(.system(size: 9, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                }
                .foregroundStyle(surgeReady ? MLTheme.deepOcean : MLTheme.cyanAccent)
                .frame(width: 62, height: 62)
                .background(
                    Circle().fill(
                        surgeReady ? MLTheme.mintClean : MLTheme.cardElevated
                    )
                )
                .overlay(
                    Circle().strokeBorder(
                        surgeReady ? Color.white : MLTheme.cyanAccent.opacity(0.45),
                        lineWidth: surgeReady ? 2.2 : 1.3
                    )
                )
                .shadow(color: surgeReady ? MLTheme.mintClean.opacity(0.75) : .clear, radius: 12)
            }
            .buttonStyle(.plain)
            .disabled(!surgeReady)

            // Smart Tap + Drag-Aim Polymer Floss Ring
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [MLTheme.fluorapatiteGold, MLTheme.cyanAccent],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 72, height: 72)
                    .shadow(color: MLTheme.cyanAccent.opacity(0.45), radius: 10)

                VStack(spacing: 2) {
                    Image(systemName: "line.diagonal.arrow")
                        .font(.system(size: 22, weight: .heavy))
                    Text(L10n.t("FLOSS"))
                        .font(.system(size: 10, weight: .heavy, design: .rounded))
                }
                .foregroundStyle(MLTheme.deepOcean)
                .offset(flossDragOffset)
            }
            .gesture(
                DragGesture(minimumDistance: 0)
                    .updating($flossDragOffset) { val, state, _ in
                        let maxR: CGFloat = 24
                        let dx = val.translation.width
                        let dy = val.translation.height
                        let dist = hypot(dx, dy)
                        let scale = dist > maxR ? maxR / dist : 1.0
                        state = CGSize(width: dx * scale, height: dy * scale)
                    }
                    .onEnded { val in
                        let dx = Double(val.translation.width)
                        let dz = Double(val.translation.height)
                        let dist = hypot(dx, dz)
                        if dist < 12.0 {
                            onFireFlossSmart()
                        } else {
                            onFireFlossDirection(Vec2(x: dx / dist, z: dz / dist))
                        }
                    }
            )
            .accessibilityLabel(L10n.t("Floss & Floss Zip"))
        }
    }

    private var worldMechanicBadge: (label: String, warn: Bool)? {
        switch cartridge.bChannelMode {
        case .gumIrritation:
            let pct = Int(((1.0 - min(1.0, Double(snapshot.maxGumIrritation))) * 100.0).rounded())
            return ("Gum Comfort \(pct)% • Sweep Gently", snapshot.maxGumIrritation >= GameConfig.gumTenderThreshold * 0.85)
        case .localPh:
            if cartridge.id == "world_4" {
                let faPct = Int((snapshot.fluorapatiteRatio * 100.0).rounded())
                let inf = snapshot.fluorapatiteInfusionSec > 0 ? String(format: " • Miswak %.0fs", snapshot.fluorapatiteInfusionSec) : ""
                return ("Fluoride armor \(faPct)%\(inf)", false)
            } else {
                if snapshot.stephanTimerSec > 0.1 {
                    return (String(format: "Acid %.0fs • Hit Saliva Spring!", snapshot.stephanTimerSec), true)
                }
                return ("Plaque pH Safe (≥ 5.5)", false)
            }
        case .epsArmor:
            let rem = Int((snapshot.epsArmorRemainingRatio * 100.0).rounded())
            return ("Slime dome \(rem)% • Crack it with Floss or Surge", rem > 25)
        case .marginDensity:
            let restored = snapshot.sites.filter(\.restored).count
            return ("Helper Germs \(restored)/\(snapshot.sites.count)", false)
        }
    }
}

/// The city from above, on the Duo's second page: where the scrubber is, how clean each district is
/// (dim to mint, a gold check once sealed) and Scan's ring. Read-only, and oriented like the stage
/// camera, which sits behind the scrubber looking ahead (`computeCameraTargets`): the city's x runs
/// to the right and its z downward, so "up" on the map is "ahead" in 3D. It redraws with the HUD (the
/// game's snapshot, about 20 times a second), never in the 3D render loop.
struct StageMapView: View {
    let cartridge: WorldCartridge
    let snapshot: SessionSnapshot

    var body: some View {
        let area = Self.area(cartridge)
        Canvas { c, size in
            let w = area.maxX - area.minX, d = area.maxZ - area.minZ
            guard w > 0, d > 0 else { return }
            // explicit Double: Swift 6.1 finds CGFloat/Double division ambiguous here
            let scale: Double = min(Double(size.width) / w, Double(size.height) / d)
            let ox = (size.width - w * scale) / 2 - area.minX * scale, oy = (size.height - d * scale) / 2 - area.minZ * scale
            func pt(_ x: Double, _ z: Double) -> CGPoint { CGPoint(x: ox + x * scale, y: oy + z * scale) }
            func rect(_ b: AABB2D) -> CGRect {
                CGRect(x: ox + b.minX * scale, y: oy + b.minZ * scale, width: (b.maxX - b.minX) * scale, height: (b.maxZ - b.minZ) * scale)
            }
            // the ground the scrubber can reach
            var ground = Path()
            for b in cartridge.playableMaskBoxes {
                ground.addRoundedRect(in: rect(b), cornerSize: CGSize(width: 3, height: 3))
            }
            c.fill(ground, with: .color(Color.white.opacity(0.10)))
            // districts, clipped to the ground: dim to mint as they get clean, gold once sealed
            c.drawLayer { layer in
                layer.clip(to: ground)
                for (i, district) in cartridge.districts.enumerated() {
                    let clean = i < snapshot.districtCleanRatios.count ? snapshot.districtCleanRatios[i] : 0
                    let sealed = i < snapshot.sealedDistricts.count && snapshot.sealedDistricts[i]
                    let tint = sealed ? MLTheme.fluorapatiteGold.opacity(0.42) : MLTheme.mintClean.opacity(0.08 + 0.42 * min(1, max(0, clean)))
                    layer.fill(Path(rect(district.bounds)), with: .color(tint))
                }
            }
            for (i, district) in cartridge.districts.enumerated() {
                let r = rect(district.bounds)
                c.stroke(Path(roundedRect: r.insetBy(dx: 1, dy: 1), cornerRadius: 4), with: .color(Color.white.opacity(0.18)), lineWidth: 1)
                guard i < snapshot.sealedDistricts.count, snapshot.sealedDistricts[i] else { continue }
                // a gold check in the middle of a sealed district
                let s = max(10, min(r.width, r.height) * 0.28)
                var check = Path()
                check.move(to: CGPoint(x: r.midX - s * 0.5, y: r.midY))
                check.addLine(to: CGPoint(x: r.midX - s * 0.12, y: r.midY + s * 0.38))
                check.addLine(to: CGPoint(x: r.midX + s * 0.55, y: r.midY - s * 0.4))
                c.stroke(check, with: .color(MLTheme.fluorapatiteGold), style: StrokeStyle(lineWidth: max(2.5, s * 0.16), lineCap: .round, lineJoin: .round))
            }
            // the gaps between teeth (floss zips)
            for alley in cartridge.interdentalAlleys {
                var line = Path()
                line.move(to: pt(alley.endpointA.x, alley.endpointA.z))
                line.addLine(to: pt(alley.endpointB.x, alley.endpointB.z))
                c.stroke(line, with: .color(MLTheme.cyanAccent.opacity(0.35)), style: StrokeStyle(lineWidth: max(1.5, alley.width * scale * 0.5), lineCap: .round))
            }
            // Scan's ring grows from where it was fired, as in 3D
            if snapshot.discloseActiveRemaining > 0 {
                let progress = 1 - snapshot.discloseActiveRemaining / GameConfig.discloseDurationSec
                let r = max(0, progress) * GameConfig.discloseWaveRadius * scale
                let o = pt(snapshot.discloseOrigin.x, snapshot.discloseOrigin.z)
                c.stroke(Path(ellipseIn: CGRect(x: o.x - r, y: o.y - r, width: r * 2, height: r * 2)),
                         with: .color(MLTheme.discloseMagenta.opacity(0.85 * (1 - max(0, progress) * 0.6))), lineWidth: 3)
            }
            // the scrubber, pointing where it heads
            let p = pt(snapshot.probePos.x, snapshot.probePos.z)
            let heading = CGPoint(x: cos(snapshot.probeFacingRad), y: sin(snapshot.probeFacingRad))
            let r = max(6, scale * 1.1)
            var wedge = Path()
            wedge.move(to: CGPoint(x: p.x + heading.x * r * 2.1, y: p.y + heading.y * r * 2.1))
            wedge.addLine(to: CGPoint(x: p.x - heading.y * r * 0.9, y: p.y + heading.x * r * 0.9))
            wedge.addLine(to: CGPoint(x: p.x + heading.y * r * 0.9, y: p.y - heading.x * r * 0.9))
            wedge.closeSubpath()
            c.fill(wedge, with: .color(MLTheme.cyanAccent.opacity(0.75)))
            c.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)), with: .color(MLTheme.cyanAccent))
            c.stroke(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)), with: .color(Color.white), lineWidth: 2)
        }
        .aspectRatio((area.maxX - area.minX) / max(1, area.maxZ - area.minZ), contentMode: .fit)
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(MLTheme.cardBg))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(MLTheme.cyanAccent.opacity(0.25), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .allowsHitTesting(false)
        // the HUD's top strip already says how clean the city is
        .accessibilityHidden(true)
    }

    /// The part of the city worth showing: the ground the scrubber can reach (the whole world if the
    /// city lists none), with a little margin.
    static func area(_ cartridge: WorldCartridge) -> AABB2D {
        guard let first = cartridge.playableMaskBoxes.first else {
            return AABB2D(minX: 0, minZ: 0, maxX: max(1, cartridge.worldWidth), maxZ: max(1, cartridge.worldDepth))
        }
        var a = first
        for b in cartridge.playableMaskBoxes.dropFirst() {
            a = AABB2D(minX: min(a.minX, b.minX), minZ: min(a.minZ, b.minZ), maxX: max(a.maxX, b.maxX), maxZ: max(a.maxZ, b.maxZ))
        }
        return AABB2D(minX: a.minX - 1, minZ: a.minZ - 1, maxX: a.maxX + 1, maxZ: a.maxZ + 1)
    }
}

/// The stage's glass strip behind the top readouts.
private struct StripBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(MLTheme.cardBg))
            )
            .padding(.horizontal, 10)
            .padding(.top, 4)
    }
}

