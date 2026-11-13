import SwiftUI
import MouthLifeCore

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

    @State private var flossDragOffset: CGSize = .zero
    @State private var stickDragOffset: CGSize = .zero
    @State private var isPausedSheet: Bool = false

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
        onExitToHub: @escaping () -> Void
    ) {
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
    }

    public var body: some View {
        let timerState = buildTimerPill(
            mode: snapshot.activeMode,
            elapsedSec: snapshot.elapsedSec,
            parSec: cartridge.parTimeSec,
            remainingRescueSec: snapshot.remainingRescueSec
        )
        let cleanPct = Int((snapshot.worldCleanRatio * 100.0).rounded())
        let targetPct = snapshot.activeMode == .pulpRescue ? 85 : 90
        let surgeReady = snapshot.surgeMeter >= GameConfig.surgeMax - 0.01

        ZStack {
            VStack(spacing: 8) {
                // Top Telemetry Strip
                HStack(spacing: 8) {
                    Button {
                        isPausedSheet = true
                    } label: {
                        Image(systemName: "pause.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(MLTheme.textPrimary)
                    }
                    .buttonStyle(.plain)

                    // Cleanliness + District Seal Pips
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text("\(cleanPct)% / \(targetPct)% CLEAN")
                                .font(.system(size: 11, weight: .heavy, design: .rounded))
                                .monospacedDigit()
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

                    Spacer(minLength: 4)

                    // Synergy Pill
                    Text(String(format: "%.2gx", snapshot.synergyMultiplier))
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(snapshot.synergyMultiplier >= 2.0 ? MLTheme.fluorapatiteGold : MLTheme.cyanAccent)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(MLTheme.cardBg))

                    // Timer Pill
                    Text(timerState.text)
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(timerState.warn ? MLTheme.amberWarn : MLTheme.textPrimary)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(MLTheme.cardBg))

                    if showProMotionBadge {
                        Text(liveFps >= 95 ? "\(liveFps)Hz" : "\(max(60, liveFps))/120Hz")
                            .font(.system(size: 10, weight: .heavy, design: .monospaced))
                            .foregroundStyle(MLTheme.mintClean)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 5)
                            .background(Capsule().fill(MLTheme.cardBg))
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(.ultraThinMaterial)
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(MLTheme.cardBg))
                )
                .padding(.horizontal, 10)
                .padding(.top, 4)

                // World Mechanic / Capillary Zip / Toast Sub-Pill
                HStack(spacing: 8) {
                    if let mech = worldMechanicBadge {
                        Text(mech.label)
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(mech.warn ? MLTheme.amberWarn : MLTheme.cyanAccent)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Capsule().fill(MLTheme.cardBg))
                    }

                    if let zipHint = snapshot.nearestZipMouth, zipHint.distToEntry <= GameConfig.zipPromptRadius {
                        Button {
                            onFireFlossSmart()
                        } label: {
                            Label("Floss Zip Ready • Tap Floss!", systemImage: "bolt.horizontal.fill")
                                .font(.system(size: 11, weight: .heavy, design: .rounded))
                                .foregroundStyle(MLTheme.deepOcean)
                                .padding(.horizontal, 11)
                                .padding(.vertical, 5)
                                .background(Capsule().fill(MLTheme.fluorapatiteGold))
                        }
                        .buttonStyle(.plain)
                    }
                }

                if let toastMessage {
                    Text(toastMessage)
                        .font(.system(.caption, design: .rounded, weight: .bold))
                        .foregroundStyle(MLTheme.textPrimary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(MLTheme.cardElevated))
                        .overlay(Capsule().strokeBorder(MLTheme.cyanAccent.opacity(0.45), lineWidth: 1))
                }

                // Unobstructed 3D Metal Stage (Touch directly on teeth to steer & scrub, double-tap to Floss!)
                Spacer()

                // Ergonomic Bottom Thumb Controls
                HStack(alignment: .bottom) {
                    // Left Floating Scrub Stick (optional alternative to direct touch-on-tooth steering!)
                    ZStack {
                        Circle()
                            .fill(MLTheme.cardBg)
                            .frame(width: 82, height: 82)
                            .overlay(Circle().strokeBorder(MLTheme.cyanAccent.opacity(0.32), lineWidth: 1.2))

                        Circle()
                            .fill(MLTheme.cyanAccent.opacity(0.85))
                            .frame(width: 34, height: 34)
                            .offset(stickDragOffset)
                    }
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { val in
                                let maxR: CGFloat = 30
                                let dx = val.translation.width
                                let dy = val.translation.height
                                let dist = hypot(dx, dy)
                                let clamped = dist > maxR ? maxR / dist : 1.0
                                stickDragOffset = CGSize(width: dx * clamped, height: dy * clamped)
                                let nx = Double((dx * clamped) / maxR)
                                let nz = Double((dy * clamped) / maxR)
                                onVirtualStickMove(nx, nz, true)
                            }
                            .onEnded { _ in
                                stickDragOffset = .zero
                                onVirtualStickMove(0, 0, false)
                            }
                    )
                    .accessibilityLabel("Brush Thumbstick")

                    Spacer()

                    // Right Action Cluster: Disclose Scan, Floss / Vector Ring, Ion Rinse Surge
                    HStack(alignment: .bottom, spacing: 12) {
                        // Disclosing Dye Sonar Scan (#ff2ea8)
                        Button {
                            onFireDisclose()
                        } label: {
                            VStack(spacing: 2) {
                                Image(systemName: "waveform.path.ecg")
                                    .font(.system(size: 18, weight: .bold))
                                Text(snapshot.discloseCooldown > 0.05 ? String(format: "%.1fs", snapshot.discloseCooldown) : "SCAN")
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
                                Text(surgeReady ? "SURGE!" : "\(Int(snapshot.surgeMeter.rounded()))%")
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
                                Text("FLOSS")
                                    .font(.system(size: 10, weight: .heavy, design: .rounded))
                            }
                            .foregroundStyle(MLTheme.deepOcean)
                            .offset(flossDragOffset)
                        }
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { val in
                                    let maxR: CGFloat = 24
                                    let dx = val.translation.width
                                    let dy = val.translation.height
                                    let dist = hypot(dx, dy)
                                    let scale = dist > maxR ? maxR / dist : 1.0
                                    flossDragOffset = CGSize(width: dx * scale, height: dy * scale)
                                }
                                .onEnded { val in
                                    let dx = Double(val.translation.width)
                                    let dz = Double(val.translation.height)
                                    let dist = hypot(dx, dz)
                                    flossDragOffset = .zero
                                    if dist < 12.0 {
                                        onFireFlossSmart()
                                    } else {
                                        onFireFlossDirection(Vec2(x: dx / dist, z: dz / dist))
                                    }
                                }
                        )
                        .accessibilityLabel("Floss & Floss Zip")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
            }

            if isPausedSheet {
                Color.black.opacity(0.55)
                    .ignoresSafeArea()
                    .onTapGesture { isPausedSheet = false }

                VStack(spacing: 14) {
                    Text(cartridge.title)
                        .font(.system(.title3, design: .rounded, weight: .heavy))
                        .foregroundStyle(MLTheme.textPrimary)
                    Text("Touch any tooth to steer and scrub. Double-tap to Floss, or drag the Floss ring to aim.")
                        .font(.system(.footnote, design: .rounded))
                        .foregroundStyle(MLTheme.textSecondary)
                        .multilineTextAlignment(.center)

                    HStack(spacing: 12) {
                        Button("Resume") {
                            isPausedSheet = false
                        }
                        .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.cyanAccent))

                        Button("Exit to Hub") {
                            isPausedSheet = false
                            onExitToHub()
                        }
                        .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.coralGum))
                    }
                }
                .mlGlassCard(cornerRadius: 24, padding: 20)
                .padding(28)
            }
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
