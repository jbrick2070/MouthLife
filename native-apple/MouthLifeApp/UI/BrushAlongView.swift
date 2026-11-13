import SwiftUI
import MouthLifeCore

public struct BrushAlongView: View {
    public let elapsedSec: Double
    public let isPaused: Bool
    public let inFlossBonus: Bool
    public let stationLabel: String
    public let onCycleStation: () -> Void
    public let onTogglePause: () -> Void
    public let onEnterFlossBonusNow: () -> Void
    public let onCompleteSession: (Bool) -> Void
    public let onCancelToHub: () -> Void

    private let quadrantTitles = [
        "Q1 • Upper Right Arch (#2–#8)",
        "Q2 • Upper Left Arch (#9–#15)",
        "Q3 • Lower Left Arch (#18–#24)",
        "Q4 • Lower Right Arch (#25–#31)"
    ]

    private let crownTypeNames = [
        "2nd Molar",
        "1st Molar",
        "2nd Premolar",
        "1st Premolar",
        "Canine",
        "Lateral Incisor",
        "Central Incisor",
        "Central Incisor",
        "Lateral Incisor",
        "Canine",
        "1st Premolar",
        "2nd Premolar",
        "1st Molar",
        "2nd Molar"
    ]

    private let surfaceShortLabels = [
        "Outer Cheek 45°",
        "Chewing Grooves",
        "Inner Tongue / Palate"
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
        stationLabel: String,
        onCycleStation: @escaping () -> Void,
        onTogglePause: @escaping () -> Void,
        onEnterFlossBonusNow: @escaping () -> Void,
        onCompleteSession: @escaping (Bool) -> Void,
        onCancelToHub: @escaping () -> Void
    ) {
        self.elapsedSec = elapsedSec
        self.isPaused = isPaused
        self.inFlossBonus = inFlossBonus
        self.stationLabel = stationLabel
        self.onCycleStation = onCycleStation
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

                Button {
                    onCycleStation()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: stationLabel == "Sanctuary" ? "moon.stars.fill" : "dot.radiowaves.left.and.right")
                            .font(.system(size: 11, weight: .bold))
                        Text(stationLabel)
                            .font(.system(.caption2, design: .rounded, weight: .bold))
                        Image(systemName: "sun.max.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(MLTheme.mintClean)
                            .accessibilityLabel("Sink Stay-Awake Active")
                    }
                }
                .buttonStyle(
                    MLGlassPillButtonStyle(
                        tint: stationLabel == "Sanctuary" ? MLTheme.mintClean : MLTheme.cyanAccent
                    )
                )

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

            // Large High-Visibility Sink Countdown Ring + Live Active Tooth Spotlight Badge
            VStack(spacing: 5) {
                Text(inFlossBonus ? "C-CURVE FLOSS BONUS (+25 F⁻)" : quadrantTitles[qIdx])
                    .font(.system(.subheadline, design: .rounded, weight: .heavy))
                    .foregroundStyle(inFlossBonus ? MLTheme.fluorapatiteGold : MLTheme.cyanAccent)

                Text(formatClock(ceil(remaining), pad: true))
                    .font(.system(size: 46, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(isPaused ? MLTheme.fluorapatiteGold : MLTheme.textPrimary)
                    .shadow(color: (isPaused ? MLTheme.fluorapatiteGold : MLTheme.cyanAccent).opacity(0.45), radius: 14)

                if isPaused {
                    Button {
                        onTogglePause()
                    } label: {
                        Label("PAUSED • TAP TO RESUME", systemImage: "play.circle.fill")
                            .font(.system(.caption, design: .rounded, weight: .heavy))
                    }
                    .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.fluorapatiteGold, darkText: true))
                    .padding(.vertical, 2)
                } else {
                    Text(liveTargetToothCaption(qIdx: qIdx, qElapsed: qElapsed, sIdx: sIdx))
                        .font(.system(.caption, design: .rounded, weight: .bold))
                        .foregroundStyle(MLTheme.fluorapatiteGold)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }

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
                .padding(.top, 2)
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 18)
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

    private func liveTargetToothCaption(qIdx: Int, qElapsed: Double, sIdx: Int) -> String {
        if inFlossBonus {
            let flossElapsed = max(0.0, elapsedSec - GameConfig.brushAlongTotalSec)
            let bonusTotal = max(1.0, GameConfig.brushAlongFlossBonusSec)
            let norm = min(0.999, max(0.0, flossElapsed / bonusTotal))
            let isUpper = norm < 0.5
            let halfNorm = isUpper ? (norm * 2.0) : ((norm - 0.5) * 2.0)
            let cIdx = min(12, max(0, Int((halfNorm * 12.0).rounded())))
            let numA = isUpper ? (2 + cIdx) : (31 - cIdx)
            let numB = isUpper ? (3 + cIdx) : (30 - cIdx)
            return "✨ C-Curve Contact #\(numA)–#\(numB) • \(isUpper ? "Upper Arch" : "Lower Arch")"
        }

        let isUpper = (qIdx < 2)
        let isRightSide = (qIdx == 0 || qIdx == 3)
        let sFrac = min(0.999, max(0.0, (qElapsed - Double(sIdx) * 10.0) / 10.0))
        let u = (sIdx == 1) ? (1.0 - sFrac) : sFrac
        let crownProg = isRightSide ? (u * 6.0) : (13.0 - u * 6.0)
        let ti = min(13, max(0, Int(crownProg.rounded())))
        let adaNum = isUpper ? (2 + ti) : (31 - ti)
        let sideWord = isRightSide ? "Right" : "Left"
        let jawWord = isUpper ? "Upper" : "Lower"
        let surfWord: String
        if sIdx == 2 && (4...9).contains(ti) {
            surfWord = "Vertical Heel-to-Toe"
        } else {
            surfWord = surfaceShortLabels[min(2, max(0, sIdx))]
        }
        return "🦷 #\(adaNum) \(jawWord) \(sideWord) \(crownTypeNames[ti]) • \(surfWord)"
    }
}
