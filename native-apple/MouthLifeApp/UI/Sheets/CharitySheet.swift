import SwiftUI
import MouthLifeCore

public struct CharitySheet: View {
    @Environment(\.dismiss) private var dismiss
    /// The system's way to open a link; every link in this sheet goes through the grown-up check first.
    @Environment(\.openURL) private var systemOpenURL
    @State private var gate: GateTarget?

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    // Hero Banner
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 10) {
                            Image(systemName: "heart.circle.fill")
                                .font(.system(size: 30))
                                .foregroundStyle(MLTheme.coralGum)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(L10n.t(CharityInfo.name))
                                    .font(.system(.title2, design: .rounded, weight: .heavy))
                                    .foregroundStyle(MLTheme.textPrimary)
                                Text(L10n.t(CharityInfo.tagline))
                                    .font(.system(.caption, design: .rounded, weight: .semibold))
                                    .foregroundStyle(MLTheme.cyanAccent)
                            }
                        }

                        Text(L10n.t(CharityInfo.legalStatus))
                            .font(.system(.caption2, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.fluorapatiteGold)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(MLTheme.fluorapatiteGold.opacity(0.14)))

                        Text(L10n.t(CharityInfo.missionSummary))
                            .font(.system(.subheadline, design: .rounded))
                            .foregroundStyle(MLTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)

                        HStack(spacing: 10) {
                            Link(destination: CharityInfo.donateUrl) {
                                Label(L10n.t("Donate in Safari"), systemImage: "safari.fill")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.mintClean, darkText: true))

                            Link(destination: CharityInfo.websiteUrl) {
                                Label(L10n.t("SmileOnU.org"), systemImage: "arrow.up.right.square")
                            }
                            .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.cyanAccent))
                        }
                        .padding(.top, 4)

                        Text(L10n.t(CharityInfo.einNote))
                            .font(.system(.caption2, design: .rounded))
                            .foregroundStyle(MLTheme.textMuted)
                    }
                    .mlGlassCard(borderColor: MLTheme.coralGum.opacity(0.45))

                    // Global Oral Health Need Stats
                    VStack(alignment: .leading, spacing: 10) {
                        Text(L10n.t("GLOBAL DENTAL RELIEF NEED"))
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.cyanAccent)

                        ForEach(CharityInfo.needHighlights) { item in
                            HStack(alignment: .top, spacing: 12) {
                                Text(L10n.t(item.stat))
                                    .font(.system(.subheadline, design: .rounded, weight: .heavy))
                                    .foregroundStyle(MLTheme.fluorapatiteGold)
                                    .frame(width: 112, alignment: .leading)
                                Text(L10n.t(item.detail))
                                    .font(.system(.footnote, design: .rounded))
                                    .foregroundStyle(MLTheme.textPrimary)
                                Spacer(minLength: 0)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .mlGlassCard()

                    // Humanitarian Programs
                    VStack(alignment: .leading, spacing: 12) {
                        Text(L10n.t("SMILEONU PROGRAMS"))
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.cyanAccent)

                        ForEach(CharityInfo.programs) { program in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(L10n.t("\(program.emoji) \(program.title)"))
                                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                                        .foregroundStyle(MLTheme.textPrimary)
                                    Spacer()
                                    Link(destination: program.url) {
                                        Image(systemName: "arrow.up.right.circle.fill")
                                            .font(.system(size: 18))
                                            .foregroundStyle(MLTheme.cyanAccent)
                                    }
                                }
                                Text(L10n.t(program.regionLabel))
                                    .font(.system(.caption2, design: .rounded, weight: .semibold))
                                    .foregroundStyle(MLTheme.mintClean)
                                Text(L10n.t(program.summary))
                                    .font(.system(.footnote, design: .rounded))
                                    .foregroundStyle(MLTheme.textSecondary)
                            }
                            .padding(12)
                            .background(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(Color.white.opacity(0.04))
                            )
                        }
                    }
                    .mlGlassCard()

                    // Volunteer & Partner Links (All external Safari)
                    VStack(alignment: .leading, spacing: 10) {
                        Text(L10n.t("GET INVOLVED (OPENS IN SAFARI)"))
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.cyanAccent)

                        FlowLayoutLinks(items: CharityInfo.involvementLinks)
                    }
                    .mlGlassCard()

                    // More free-dental-care charities (all external Safari)
                    VStack(alignment: .leading, spacing: 12) {
                        Text(L10n.t("MORE FREE DENTAL CARE CHARITIES"))
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.cyanAccent)

                        ForEach(CharityInfo.moreCharities) { charity in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(L10n.t("\(charity.emoji) \(charity.name)"))
                                    .font(.system(.subheadline, design: .rounded, weight: .bold))
                                    .foregroundStyle(MLTheme.textPrimary)
                                Text(L10n.t(charity.legalStatus))
                                    .font(.system(.caption2, design: .rounded, weight: .semibold))
                                    .foregroundStyle(MLTheme.fluorapatiteGold)
                                Text(L10n.t(charity.summary))
                                    .font(.system(.footnote, design: .rounded))
                                    .foregroundStyle(MLTheme.textSecondary)
                                    .fixedSize(horizontal: false, vertical: true)

                                HStack(spacing: 10) {
                                    Link(destination: charity.donateUrl) {
                                        Label(L10n.t("Donate in Safari"), systemImage: "safari.fill")
                                            .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.mintClean, darkText: true))

                                    Link(destination: charity.websiteUrl) {
                                        Label(L10n.t("Website"), systemImage: "arrow.up.right.square")
                                    }
                                    .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.cyanAccent))
                                }

                                FlowLayoutLinks(items: charity.links)
                            }
                            .padding(12)
                            .background(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(Color.white.opacity(0.04))
                            )
                        }

                        Text(L10n.t(CharityInfo.moreCharitiesNote))
                            .font(.system(.caption2, design: .rounded))
                            .foregroundStyle(MLTheme.textMuted)
                    }
                    .mlGlassCard()

                    // Independence & Clinical Disclaimer
                    VStack(alignment: .leading, spacing: 8) {
                        Text(L10n.t(CharityInfo.notEndorsedNote))
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(MLTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                        Divider().overlay(Color.white.opacity(0.12))
                        Text(L10n.t(CharityInfo.transparencyNote))
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(MLTheme.textSecondary)
                        Divider().overlay(Color.white.opacity(0.12))
                        Text(L10n.t(CharityInfo.clinicalDisclaimer))
                            .font(.system(.caption2, design: .rounded))
                            .foregroundStyle(MLTheme.textMuted)
                    }
                    .mlGlassCard(borderColor: Color.white.opacity(0.14))
                }
                .padding(16)
            }
            .background(MLTheme.deepOcean.ignoresSafeArea())
            .navigationTitle(L10n.t("Dental Relief Charity"))
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
        // Links that leave the app wait for a grown-up (Apple's Kids Category asks for this).
        .environment(\.openURL, OpenURLAction { url in
            gate = GateTarget(url: url)
            return .handled
        })
        .sheet(item: $gate) { target in
            ParentGateView {
                systemOpenURL(target.url)
            }
            .presentationDetents([.medium])
        }
        .preferredColorScheme(.dark)
    }
}

private struct GateTarget: Identifiable {
    let id = UUID()
    let url: URL
}

/// The grown-up question: a sum with four answers, which a young child cannot work out yet. A wrong
/// answer closes it and locks it for half a minute wherever it is asked next, so it cannot be guessed
/// by tapping again and again. The rules (the sum, the answers, how long the lock lasts) are
/// `ParentGate` in MouthLifeCore. The web does the same in src/ui/parentGate.ts.
struct ParentGateView: View {
    /// An optional line under the title saying what the grown-up is agreeing to.
    var note: String? = nil
    let onPass: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var question = ParentGate.question()
    /// Whole seconds of lock left. Above 0 the card counts down where the sum would be.
    @State private var secondsLeft = ParentGateView.lockSecondsLeft()
    /// Set by the first answer: the card takes one answer and then closes.
    @State private var answered = false

    /// When the lock set by the last wrong answer ends. One lock for every use of the question, kept
    /// in memory only. It is a time on the clock that counts the seconds since the device started,
    /// which changing the date in Settings cannot set back.
    @MainActor private static var lockEndUptime: TimeInterval?

    @MainActor private static func lockSecondsLeft() -> Int {
        ParentGate.secondsLeft(lockEnd: lockEndUptime, at: ProcessInfo.processInfo.systemUptime)
    }

    var body: some View {
        VStack(spacing: 14) {
            Text(L10n.t("For grown-ups"))
                .font(.system(.title3, design: .rounded, weight: .heavy))
                .foregroundStyle(MLTheme.textPrimary)
            if let note {
                Text(note)
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(MLTheme.textSecondary)
                    .multilineTextAlignment(.center)
            }
            if secondsLeft > 0 {
                // Locked after a wrong answer: an hourglass and the seconds left, so there are no
                // words to translate. VoiceOver reads the seconds as a plain number, never a sum.
                Text(verbatim: "⏳ \(secondsLeft)")
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(MLTheme.textPrimary)
                    .accessibilityLabel(Text(verbatim: "\(secondsLeft)"))
                    .accessibilityAddTraits(.updatesFrequently)
            } else {
                Text(verbatim: "\(question.a) × \(question.b) = ?")
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                    .foregroundStyle(MLTheme.textPrimary)
                    .accessibilityLabel(Text(verbatim: "\(question.a) × \(question.b)"))
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(question.choices, id: \.self) { n in
                    Button {
                        // One answer per card, and none while locked: a second tap while the card
                        // is still closing after a wrong answer must not count.
                        guard !answered, Self.lockSecondsLeft() == 0 else { return }
                        answered = true
                        let right = n == question.answer
                        if !right {
                            Self.lockEndUptime = ParentGate.lockEnd(wrongAnswerAt: ProcessInfo.processInfo.systemUptime)
                        }
                        dismiss()
                        if right { onPass() }
                    } label: {
                        Text(verbatim: "\(n)")
                            .font(.system(.title2, design: .rounded, weight: .heavy))
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white.opacity(0.08)))
                            .foregroundStyle(MLTheme.textPrimary)
                    }
                    .buttonStyle(.plain)
                }
            }
            // While locked the answers keep their place, so the card does not jump when they come
            // back, but they are not shown, cannot be tapped and are not read out.
            .opacity(secondsLeft > 0 ? 0 : 1)
            .disabled(secondsLeft > 0)
            .accessibilityHidden(secondsLeft > 0)
            Button(L10n.t("Not now")) { dismiss() }
                .foregroundStyle(MLTheme.cyanAccent)
        }
        .padding(22)
        .frame(maxWidth: 360)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(MLTheme.deepOcean.ignoresSafeArea())
        .task {
            // Count the lock down. The clock is read four times a second, so the number shown is
            // never more than a moment behind and none is skipped. At 0 a new sum is drawn and can
            // be answered.
            while secondsLeft > 0 {
                do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
                let left = Self.lockSecondsLeft()
                if left == 0 { question = ParentGate.question() }
                if left != secondsLeft { secondsLeft = left }
            }
        }
    }
}

private struct FlowLayoutLinks: View {
    let items: [CharityLinkItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(items) { item in
                Link(destination: item.url) {
                    HStack {
                        Text(L10n.t(item.label))
                            .font(.system(.footnote, design: .rounded, weight: .semibold))
                            .foregroundStyle(MLTheme.textPrimary)
                        Spacer()
                        Image(systemName: "safari")
                            .font(.system(size: 14))
                            .foregroundStyle(MLTheme.cyanAccent)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color.white.opacity(0.05))
                    )
                }
            }
        }
    }
}
