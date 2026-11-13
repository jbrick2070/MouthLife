import SwiftUI
import MouthLifeCore

public struct HistoryAlmanacSheet: View {
    @Environment(\.dismiss) private var dismiss
    public let unlockedNoteIds: Set<String>

    public init(unlockedNoteIds: Set<String>) {
        self.unlockedNoteIds = unlockedNoteIds
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(L10n.t("ORAL SCIENCE & HISTORY ALMANAC"))
                                .font(.system(.caption, design: .rounded, weight: .bold))
                                .foregroundStyle(MLTheme.cyanAccent)
                            Text(L10n.t("From ancient stardust to germs on the Skylab space station."))
                                .font(.system(.footnote, design: .rounded))
                                .foregroundStyle(MLTheme.textSecondary)
                        }
                        Spacer()
                        Text(L10n.t("\(unlockedCount)/\(HostsAndHistory.historicalFieldNotes.count)"))
                            .font(.system(.headline, design: .rounded, weight: .heavy))
                            .monospacedDigit()
                            .foregroundStyle(MLTheme.fluorapatiteGold)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(MLTheme.fluorapatiteGold.opacity(0.16)))
                    }
                    .mlGlassCard()

                    ForEach(HostsAndHistory.historicalFieldNotes) { note in
                        let isUnlocked = unlockedNoteIds.contains(note.id)
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(L10n.t(note.yearLabel))
                                    .font(.system(.caption, design: .rounded, weight: .bold))
                                    .foregroundStyle(isUnlocked ? MLTheme.fluorapatiteGold : MLTheme.textMuted)
                                Spacer()
                                Label(
                                    L10n.t(isUnlocked ? "Unlocked" : "Clear Campaign World"),
                                    systemImage: isUnlocked ? "checkmark.seal.fill" : "lock.fill"
                                )
                                .font(.system(.caption2, design: .rounded, weight: .bold))
                                .foregroundStyle(isUnlocked ? MLTheme.mintClean : MLTheme.textMuted)
                            }

                            Text(L10n.t(isUnlocked ? note.title : "Locked Tooth Science Note"))
                                .font(.system(.headline, design: .rounded, weight: .bold))
                                .foregroundStyle(isUnlocked ? MLTheme.textPrimary : MLTheme.textSecondary)

                            Text(L10n.t(note.locationLabel + " • " + note.scientistOrCulture))
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(MLTheme.cyanAccent.opacity(isUnlocked ? 0.95 : 0.55))

                            if isUnlocked {
                                Text(L10n.t(note.summary))
                                    .font(.system(.footnote, design: .rounded))
                                    .foregroundStyle(MLTheme.textSecondary)
                                    .fixedSize(horizontal: false, vertical: true)

                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: "sparkles")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundStyle(MLTheme.mintClean)
                                        .padding(.top, 2)
                                    Text(L10n.t(note.enamelLesson))
                                        .font(.system(.caption, design: .rounded, weight: .medium))
                                        .foregroundStyle(MLTheme.textPrimary)
                                }
                                .padding(10)
                                .background(
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .fill(MLTheme.mintClean.opacity(0.10))
                                )
                            } else {
                                Text(L10n.t("Finish missions or earn Brush-Along Habit Stamps to unlock this discovery."))
                                    .font(.system(.caption, design: .rounded))
                                    .foregroundStyle(MLTheme.textMuted)
                            }
                        }
                        .mlGlassCard(
                            borderColor: isUnlocked
                                ? MLTheme.cyanAccent.opacity(0.35)
                                : Color.white.opacity(0.10)
                        )
                    }
                }
                .padding(16)
            }
            .background(MLTheme.deepOcean.ignoresSafeArea())
            .navigationTitle(L10n.t("History Almanac"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.t("Done")) { dismiss() }
                        .foregroundStyle(MLTheme.cyanAccent)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private var unlockedCount: Int {
        HostsAndHistory.historicalFieldNotes.filter { unlockedNoteIds.contains($0.id) }.count
    }
}
