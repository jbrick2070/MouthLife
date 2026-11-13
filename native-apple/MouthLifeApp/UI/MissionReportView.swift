import SwiftUI
import MouthLifeCore

public struct MissionReportView: View {
    public let mode: ActivePlayMode
    public let cartridge: WorldCartridge
    public let won: Bool
    public let breakdown: ScoreBreakdown
    public let unlockedHistoryNoteId: String?
    public let newlyUnlockedUpgradeIds: [String]
    public let nextWorldId: String?

    public let onPlayNextWorld: (String) -> Void
    public let onReplay: () -> Void
    public let onReturnToHub: () -> Void

    public init(
        mode: ActivePlayMode,
        cartridge: WorldCartridge,
        won: Bool,
        breakdown: ScoreBreakdown,
        unlockedHistoryNoteId: String?,
        newlyUnlockedUpgradeIds: [String],
        nextWorldId: String?,
        onPlayNextWorld: @escaping (String) -> Void,
        onReplay: @escaping () -> Void,
        onReturnToHub: @escaping () -> Void
    ) {
        self.mode = mode
        self.cartridge = cartridge
        self.won = won
        self.breakdown = breakdown
        self.unlockedHistoryNoteId = unlockedHistoryNoteId
        self.newlyUnlockedUpgradeIds = newlyUnlockedUpgradeIds
        self.nextWorldId = nextWorldId
        self.onPlayNextWorld = onPlayNextWorld
        self.onReplay = onReplay
        self.onReturnToHub = onReturnToHub
    }

    public var body: some View {
        let lesson = DentalChart.worldLesson(forWorldId: cartridge.id, mode: mode)

        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                // Grade & Total Score Hero
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text(mode == .pulpRescue
                             ? (won ? "PULP RESCUED!" : "SAFE PATCH APPLIED")
                             : (won ? "ARCH RESTORED • \(cartridge.title.uppercased())" : "MISSION REPORT"))
                            .font(.system(.caption, design: .rounded, weight: .heavy))
                            .foregroundStyle(won ? MLTheme.mintClean : MLTheme.amberWarn)
                        Spacer()
                        Text(breakdown.grade.displayLabel)
                            .font(.system(.caption, design: .rounded, weight: .heavy))
                            .foregroundStyle(MLTheme.deepOcean)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(
                                Capsule().fill(
                                    breakdown.grade == .fluorapatiteGold ? MLTheme.fluorapatiteGold : MLTheme.cyanAccent
                                )
                            )
                    }

                    HStack(alignment: .firstTextBaseline) {
                        Text("\(breakdown.totalScore)")
                            .font(.system(size: 42, weight: .heavy, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(MLTheme.textPrimary)
                        Text("/ 10,000 pts")
                            .font(.system(.subheadline, design: .rounded, weight: .semibold))
                            .foregroundStyle(MLTheme.textMuted)
                        Spacer()
                        MLStatChip(
                            icon: "bolt.shield.fill",
                            label: "Earned",
                            value: "+\(mode == .pulpRescue ? (won ? GameConfig.pulpRescueWinIons : 0) : breakdown.ionsEarned) F⁻",
                            tint: MLTheme.fluorapatiteGold
                        )
                    }

                    // 4-Pillar Score Bars
                    VStack(spacing: 8) {
                        pillarRow("Surface Restoration", pts: breakdown.restorationPts, maxPts: 5000, tint: MLTheme.cyanAccent)
                        pillarRow("Gentle Brushing & Combos", pts: breakdown.techniquePts, maxPts: 2500, tint: MLTheme.mintClean)
                        pillarRow("Helper Germs (\(breakdown.sitesRestored)/\(breakdown.sitesTotal))", pts: breakdown.ecologyPts, maxPts: 1500, tint: MLTheme.fluorapatiteGold)
                        pillarRow("Par Time (\(formatClock(breakdown.elapsedSec)))", pts: breakdown.parTimePts, maxPts: 1000, tint: MLTheme.sucroseViolet)
                    }
                }
                .mlGlassCard(borderColor: MLTheme.fluorapatiteGold.opacity(0.45))

                // Newly Unlocked Almanac Note / Upgrade Callouts
                if let noteId = unlockedHistoryNoteId,
                   let note = HostsAndHistory.historicalFieldNotes.first(where: { $0.id == noteId }) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("NEW FIELD NOTE UNLOCKED • \(note.yearLabel.uppercased())")
                            .font(.system(.caption2, design: .rounded, weight: .heavy))
                            .foregroundStyle(MLTheme.fluorapatiteGold)
                        Text(note.title)
                            .font(.system(.subheadline, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.textPrimary)
                        Text(note.enamelLesson)
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(MLTheme.textSecondary)
                    }
                    .mlGlassCard(borderColor: MLTheme.mintClean.opacity(0.45))
                }

                if !newlyUnlockedUpgradeIds.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("HYDRA-1 UPGRADE UNLOCKED & EQUIPPED!")
                            .font(.system(.caption2, design: .rounded, weight: .heavy))
                            .foregroundStyle(MLTheme.mintClean)
                        ForEach(newlyUnlockedUpgradeIds, id: \.self) { id in
                            if let upg = UpgradeCatalog.get(id) {
                                Text("⚡ \(upg.name) — \(upg.tagline)")
                                    .font(.system(.caption, design: .rounded, weight: .semibold))
                                    .foregroundStyle(MLTheme.textPrimary)
                            }
                        }
                    }
                    .mlGlassCard()
                }

                // Clinical Dental Lesson Card
                VStack(alignment: .leading, spacing: 6) {
                    Text(lesson.focusTeethBadge.uppercased())
                        .font(.system(.caption2, design: .rounded, weight: .heavy))
                        .foregroundStyle(MLTheme.cyanAccent)
                    Text(lesson.headline)
                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                        .foregroundStyle(MLTheme.textPrimary)
                    Text(lesson.lesson)
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(MLTheme.textSecondary)
                }
                .mlGlassCard()

                // Action Row
                HStack(spacing: 10) {
                    Button {
                        onReturnToHub()
                    } label: {
                        Label("Arch Hub", systemImage: "house.fill")
                    }
                    .buttonStyle(MLGlassPillButtonStyle())

                    Button {
                        onReplay()
                    } label: {
                        Label("Replay", systemImage: "arrow.counterclockwise")
                    }
                    .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.cyanAccent))

                    Spacer()

                    if won, let nextWorldId {
                        Button {
                            onPlayNextWorld(nextWorldId)
                        } label: {
                            Label("Next World", systemImage: "arrow.right")
                        }
                        .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.mintClean, darkText: true))
                    }
                }
            }
            .padding(16)
        }
    }

    private func pillarRow(_ label: String, pts: Int, maxPts: Int, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(label)
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundStyle(MLTheme.textSecondary)
                Spacer()
                Text("\(pts) / \(maxPts)")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(tint)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.10))
                    Capsule()
                        .fill(tint)
                        .frame(width: geo.size.width * CGFloat(min(1.0, Double(pts) / Double(max(1, maxPts)))))
                }
            }
            .frame(height: 5)
        }
    }
}
