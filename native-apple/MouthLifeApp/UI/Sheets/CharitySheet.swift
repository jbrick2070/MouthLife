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

/// A times-table question with four answers, which a young child cannot answer yet. The web does the
/// same in src/ui/parentGate.ts.
struct ParentGateView: View {
    let onPass: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var a = Int.random(in: 3...9)
    @State private var b = Int.random(in: 3...9)
    @State private var choices: [Int] = []

    var body: some View {
        VStack(spacing: 14) {
            Text(L10n.t("For grown-ups"))
                .font(.system(.title3, design: .rounded, weight: .heavy))
                .foregroundStyle(MLTheme.textPrimary)
            Text(verbatim: "\(a) × \(b) = ?")
                .font(.system(size: 34, weight: .heavy, design: .rounded))
                .foregroundStyle(MLTheme.textPrimary)
                .accessibilityLabel(Text(verbatim: "\(a) × \(b)"))
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(choices, id: \.self) { n in
                    Button {
                        let right = n == a * b
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
            Button(L10n.t("Not now")) { dismiss() }
                .foregroundStyle(MLTheme.cyanAccent)
        }
        .padding(22)
        .frame(maxWidth: 360)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(MLTheme.deepOcean.ignoresSafeArea())
        .onAppear {
            guard choices.isEmpty else { return }
            let answer = a * b
            var set: Set<Int> = [answer]
            while set.count < 4 {
                let step = Bool.random() ? 1 : a
                let near = answer + (Int.random(in: -4...4)) * step
                if near > 0 && near != answer { set.insert(near) }
            }
            choices = set.shuffled()
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
