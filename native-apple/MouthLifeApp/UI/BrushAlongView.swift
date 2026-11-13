import SwiftUI
import MouthLifeCore

public struct BrushAlongView: View {
    public let elapsedSec: Double
    public let isPaused: Bool
    public let inFlossBonus: Bool
    public let onTogglePause: () -> Void
    public let onEnterFlossBonusNow: () -> Void
    public let onCompleteSession: (Bool) -> Void
    public let onCancelToHub: () -> Void

    private let quadrantTitles = [
        "Q1 • Upper Right Arch (#1–#8)",
        "Q2 • Upper Left Arch (#9–#16)",
        "Q3 • Lower Left Arch (#17–#24)",
        "Q4 • Lower Right Arch (#25–#32)"
    ]

    private let surfaceCoaching = [
        ("OUTER CHEEK / LIP SURFACE", "Angle soft bristles 45° gently into the gumline collar (Bass method) with short, calm sweeps."),
        ("CHEWING / BITING SURFACE", "Glide briskly across molar pits, cusps, and grooves where sticky sucrose hides."),
        ("INNER TONGUE / PALATE SURFACE", "Sweep inside collars; tilt brush vertically behind front incisors (#7–#10 & #23–#26)!")
    ]

    public init(
        elapsedSec: Double,
        isPaused: Bool,
        inFlossBonus: Bool,
        onTogglePause: @escaping () -> Void,
        onEnterFlossBonusNow: @escaping () -> Void,
        onCompleteSession: @escaping (Bool) -> Void,
        onCancelToHub: @escaping () -> Void
    ) {
        self.elapsedSec = elapsedSec
        self.isPaused = isPaused
        self.inFlossBonus = inFlossBonus
        self.onTogglePause = onTogglePause
        self.onEnterFlossBonusNow = onEnterFlossBonusNow
        self.onCompleteSession = onCompleteSession
        self.onCancelToHub = onCancelToHub
    }

    public var body: some View {
        let totalTarget = inFlossBonus
            ? (GameConfig.brushAlongTotalSec + GameConfig.brushAlongFlossBonusSec)
            : GameConfig.brushAlongTotalSec
        let remaining = max(0, totalTarget - elapsedSec)
        let qIdx = min(3, max(0, Int(elapsedSec / 30.0)))
        let qElapsed = elapsedSec - Double(qIdx) * 30.0
        let sIdx = min(2, max(0, Int(qElapsed / 10.0)))

        VStack {
            // Top Header
            HStack {
                Button {
                    onCancelToHub()
                } label: {
                    Label("Hub", systemImage: "chevron.left")
                }
                .buttonStyle(MLGlassPillButtonStyle())

                Spacer()

                HStack(spacing: 5) {
                    Image(systemName: "sun.max.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(MLTheme.mintClean)
                    Text("Sink Stay-Awake Active")
                        .font(.system(.caption2, design: .rounded, weight: .bold))
                        .foregroundStyle(MLTheme.mintClean)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(MLTheme.cardBg))

                Spacer()

                Button {
                    onTogglePause()
                } label: {
                    Image(systemName: isPaused ? "play.fill" : "pause.fill")
                }
                .buttonStyle(MLGlassPillButtonStyle(tint: isPaused ? MLTheme.fluorapatiteGold : MLTheme.cyanAccent))
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)

            // Large High-Visibility Sink Countdown Ring
            VStack(spacing: 6) {
                Text(inFlossBonus ? "C-CURVE FLOSS BONUS (+25 F⁻)" : quadrantTitles[qIdx])
                    .font(.system(.subheadline, design: .rounded, weight: .heavy))
                    .foregroundStyle(inFlossBonus ? MLTheme.fluorapatiteGold : MLTheme.cyanAccent)

                Text(formatClock(ceil(remaining), pad: true))
                    .font(.system(size: 54, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(MLTheme.textPrimary)
                    .shadow(color: MLTheme.cyanAccent.opacity(0.45), radius: 14)

                // 4-Quadrant Progress Pips
                HStack(spacing: 8) {
                    ForEach(0..<4, id: \.self) { i in
                        let fill = inFlossBonus ? 1.0 : min(1.0, max(0.0, (elapsedSec - Double(i) * 30.0) / 30.0))
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.white.opacity(0.14))
                                Capsule()
                                    .fill(i == qIdx && !inFlossBonus ? MLTheme.cyanAccent : MLTheme.mintClean)
                                    .frame(width: geo.size.width * CGFloat(fill))
                            }
                        }
                        .frame(height: 7)
                    }
                }
                .frame(maxWidth: 280)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 20)
            .mlGlassCard(cornerRadius: 24)
            .padding(.horizontal, 16)

            // Leave center open so 3D Companion Arch shines & highlights active quadrant!
            Spacer()

            // Bottom Coaching Card
            VStack(alignment: .leading, spacing: 10) {
                if inFlossBonus {
                    Text("SLIDE & HUG IN A C-SHAPE")
                        .font(.system(.caption, design: .rounded, weight: .heavy))
                        .foregroundStyle(MLTheme.fluorapatiteGold)
                    Text("Curve floss gently around each side of the contact under the papilla — reaching the hidden 35% of enamel bristles cannot touch!")
                        .font(.system(.footnote, design: .rounded))
                        .foregroundStyle(MLTheme.textPrimary)
                } else {
                    let coach = surfaceCoaching[sIdx]
                    HStack {
                        Text(coach.0)
                            .font(.system(.caption, design: .rounded, weight: .heavy))
                            .foregroundStyle(MLTheme.mintClean)
                        Spacer()
                        Text("Surface \(sIdx + 1)/3")
                            .font(.system(.caption2, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.textMuted)
                    }
                    Text(coach.1)
                        .font(.system(.footnote, design: .rounded))
                        .foregroundStyle(MLTheme.textPrimary)
                }

                HStack(spacing: 10) {
                    if !inFlossBonus && elapsedSec >= GameConfig.brushAlongTotalSec - 0.2 {
                        Button {
                            onEnterFlossBonusNow()
                        } label: {
                            Label("+20s Floss Bonus (+25 F⁻)", systemImage: "sparkles")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.fluorapatiteGold, darkText: true))

                        Button("Complete (+50 F⁻)") {
                            onCompleteSession(false)
                        }
                        .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.mintClean))
                    } else if inFlossBonus {
                        Button {
                            onCompleteSession(true)
                        } label: {
                            Label("Finish Brush + Floss (+75 F⁻)", systemImage: "checkmark.seal.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.mintClean, darkText: true))
                    } else {
                        Text("Spit excess foam when done — don't rinse away fluoride right away!")
                            .font(.system(.caption2, design: .rounded))
                            .foregroundStyle(MLTheme.textMuted)
                        Spacer()
                        Button("Quick Finish") {
                            onEnterFlossBonusNow()
                        }
                        .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.cyanAccent))
                    }
                }
            }
            .mlGlassCard(cornerRadius: 22)
            .padding(.horizontal, 14)
            .padding(.bottom, 10)
        }
    }
}
