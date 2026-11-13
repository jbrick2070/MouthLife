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
                            Text("ORAL SCIENCE & HISTORY ALMANAC")
                                .font(.system(.caption, design: .rounded, weight: .bold))
                                .foregroundStyle(MLTheme.cyanAccent)
                            Text("From 13.8B-year-old stellar calcium to 1973 Skylab microgravity biofilms.")
                                .font(.system(.footnote, design: .rounded))
                                .foregroundStyle(MLTheme.textSecondary)
                        }
                        Spacer()
                        Text("\(unlockedCount)/\(HostsAndHistory.historicalFieldNotes.count)")
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
                                Text(note.yearLabel)
                                    .font(.system(.caption, design: .rounded, weight: .bold))
                                    .foregroundStyle(isUnlocked ? MLTheme.fluorapatiteGold : MLTheme.textMuted)
                                Spacer()
                                Label(
                                    isUnlocked ? "Unlocked" : "Clear Campaign World",
                                    systemImage: isUnlocked ? "checkmark.seal.fill" : "lock.fill"
                                )
                                .font(.system(.caption2, design: .rounded, weight: .bold))
                                .foregroundStyle(isUnlocked ? MLTheme.mintClean : MLTheme.textMuted)
                            }

                            Text(isUnlocked ? note.title : "Uncharted Oral Science Field Note")
                                .font(.system(.headline, design: .rounded, weight: .bold))
                                .foregroundStyle(isUnlocked ? MLTheme.textPrimary : MLTheme.textSecondary)

                            Text(note.locationLabel + " • " + note.scientistOrCulture)
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(MLTheme.cyanAccent.opacity(isUnlocked ? 0.95 : 0.55))

                            if isUnlocked {
                                Text(note.summary)
                                    .font(.system(.footnote, design: .rounded))
                                    .foregroundStyle(MLTheme.textSecondary)
                                    .fixedSize(horizontal: false, vertical: true)

                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: "sparkles")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundStyle(MLTheme.mintClean)
                                        .padding(.top, 2)
                                    Text(note.enamelLesson)
                                        .font(.system(.caption, design: .rounded, weight: .medium))
                                        .foregroundStyle(MLTheme.textPrimary)
                                }
                                .padding(10)
                                .background(
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .fill(MLTheme.mintClean.opacity(0.10))
                                )
                            } else {
                                Text("Complete global Plaque City missions or collect Brush-Along Habit Stamps to unlock this historical discovery.")
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
            .navigationTitle("History Almanac")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
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
