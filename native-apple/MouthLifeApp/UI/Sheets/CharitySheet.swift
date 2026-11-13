import SwiftUI
import MouthLifeCore

public struct CharitySheet: View {
    @Environment(\.dismiss) private var dismiss

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
                                Text(CharityInfo.name)
                                    .font(.system(.title2, design: .rounded, weight: .heavy))
                                    .foregroundStyle(MLTheme.textPrimary)
                                Text(CharityInfo.tagline)
                                    .font(.system(.caption, design: .rounded, weight: .semibold))
                                    .foregroundStyle(MLTheme.cyanAccent)
                            }
                        }

                        Text(CharityInfo.legalStatus)
                            .font(.system(.caption2, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.fluorapatiteGold)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(MLTheme.fluorapatiteGold.opacity(0.14)))

                        Text(CharityInfo.missionSummary)
                            .font(.system(.subheadline, design: .rounded))
                            .foregroundStyle(MLTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)

                        HStack(spacing: 10) {
                            Link(destination: CharityInfo.donateUrl) {
                                Label("Donate in Safari", systemImage: "safari.fill")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.mintClean, darkText: true))

                            Link(destination: CharityInfo.websiteUrl) {
                                Label("SmileOnU.org", systemImage: "arrow.up.right.square")
                            }
                            .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.cyanAccent))
                        }
                        .padding(.top, 4)

                        Text(CharityInfo.einNote)
                            .font(.system(.caption2, design: .rounded))
                            .foregroundStyle(MLTheme.textMuted)
                    }
                    .mlGlassCard(borderColor: MLTheme.coralGum.opacity(0.45))

                    // Global Oral Health Need Stats
                    VStack(alignment: .leading, spacing: 10) {
                        Text("GLOBAL DENTAL RELIEF NEED")
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.cyanAccent)

                        ForEach(CharityInfo.needHighlights) { item in
                            HStack(alignment: .top, spacing: 12) {
                                Text(item.stat)
                                    .font(.system(.subheadline, design: .rounded, weight: .heavy))
                                    .foregroundStyle(MLTheme.fluorapatiteGold)
                                    .frame(width: 112, alignment: .leading)
                                Text(item.detail)
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
                        Text("SMILEONU PROGRAMS")
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.cyanAccent)

                        ForEach(CharityInfo.programs) { program in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text("\(program.emoji) \(program.title)")
                                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                                        .foregroundStyle(MLTheme.textPrimary)
                                    Spacer()
                                    Link(destination: program.url) {
                                        Image(systemName: "arrow.up.right.circle.fill")
                                            .font(.system(size: 18))
                                            .foregroundStyle(MLTheme.cyanAccent)
                                    }
                                }
                                Text(program.regionLabel)
                                    .font(.system(.caption2, design: .rounded, weight: .semibold))
                                    .foregroundStyle(MLTheme.mintClean)
                                Text(program.summary)
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
                        Text("GET INVOLVED (OPENS IN SAFARI)")
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.cyanAccent)

                        FlowLayoutLinks(items: CharityInfo.involvementLinks)
                    }
                    .mlGlassCard()

                    // Independence & Clinical Disclaimer
                    VStack(alignment: .leading, spacing: 8) {
                        Text(CharityInfo.transparencyNote)
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(MLTheme.textSecondary)
                        Divider().overlay(Color.white.opacity(0.12))
                        Text(CharityInfo.clinicalDisclaimer)
                            .font(.system(.caption2, design: .rounded))
                            .foregroundStyle(MLTheme.textMuted)
                    }
                    .mlGlassCard(borderColor: Color.white.opacity(0.14))
                }
                .padding(16)
            }
            .background(MLTheme.deepOcean.ignoresSafeArea())
            .navigationTitle("Dental Relief Charity")
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
}

private struct FlowLayoutLinks: View {
    let items: [CharityLinkItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(items) { item in
                Link(destination: item.url) {
                    HStack {
                        Text(item.label)
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
