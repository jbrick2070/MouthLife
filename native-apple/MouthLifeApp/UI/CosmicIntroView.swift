import SwiftUI
import MouthLifeCore

public struct CosmicIntroView: View {
    @Binding public var beatIndex: Int
    public let hasSeenBefore: Bool
    public let onComplete: () -> Void
    /// A new device: "Have a Sync Code?" on the first part opens the restore sheet.
    public let onRestoreCode: (() -> Void)?
    /// The specimen picked on the hardness scale (part 2); tapping a chip or a 3D crystal sets it.
    public let mohsIndex: Int
    public let onSelectMohs: (Int) -> Void

    private struct BeatContent {
        let kicker: String
        let title: String
        let body: String
        let mohsHighlight: Bool
    }

    private let beats: [BeatContent] = [
        BeatContent(
            kicker: "BILLIONS OF YEARS AGO → STELLAR FORGE",
            title: "Your Smile Is Made of Stardust",
            body: "The calcium in your teeth was made inside dying stars and spread across space. Special cells in your body built it into enamel, the hardest part of you.",
            mohsHighlight: false
        ),
        BeatContent(
            kicker: "CRYSTALLOGRAPHY • MOHS HARDNESS 5.0",
            title: "Enamel: Harder Than Iron",
            body: "Tooth enamel is almost all crystal. It is the hardest thing in your body, even harder than iron.",
            mohsHighlight: true
        ),
        BeatContent(
            kicker: "CRITICAL pH 5.5 • BIOPHYSICS PARADOX",
            title: "Strong Against Force — Weak Against Acid",
            body: "Even hard enamel melts when germs turn sugar into acid. Spit washes the acid away, and fluoride makes enamel much harder to melt.",
            mohsHighlight: false
        ),
        BeatContent(
            kicker: "5 GLOBAL CITIES + LOW-EARTH ORBIT",
            title: "Steer HYDRA-1 Across Living Teeth",
            body: "Sweep the brush at 45°, zip floss through tight gaps, and fire Fluoride Surges. Then time your real 2-minute brush at the sink.",
            mohsHighlight: false
        )
    ]

    public init(
        beatIndex: Binding<Int>,
        hasSeenBefore: Bool = false,
        onComplete: @escaping () -> Void,
        onRestoreCode: (() -> Void)? = nil,
        mohsIndex: Int = MohsSpecimens.enamelIndex,
        onSelectMohs: @escaping (Int) -> Void = { _ in }
    ) {
        self._beatIndex = beatIndex
        self.hasSeenBefore = hasSeenBefore
        self.onComplete = onComplete
        self.onRestoreCode = onRestoreCode
        self.mohsIndex = mohsIndex
        self.onSelectMohs = onSelectMohs
    }

    public var body: some View {
        let idx = max(0, min(beats.count - 1, beatIndex))
        let beat = beats[idx]

        VStack {
            // Top Skip / Enter Bar
            HStack {
                HStack(spacing: 6) {
                    ForEach(0..<beats.count, id: \.self) { step in
                        Capsule()
                            .fill(step <= idx ? MLTheme.cyanAccent : Color.white.opacity(0.22))
                            .frame(width: step == idx ? 26 : 10, height: 5)
                            .animation(.spring(response: 0.30, dampingFraction: 0.78), value: idx)
                    }
                }
                Spacer()
                Button {
                    onComplete()
                } label: {
                    Label(
                        L10n.t(hasSeenBefore ? "Enter Arch" : "Skip Intro"),
                        systemImage: hasSeenBefore ? "arrow.right.circle.fill" : "forward.fill"
                    )
                }
                .buttonStyle(MLGlassPillButtonStyle(tint: hasSeenBefore ? MLTheme.mintClean : MLTheme.cyanAccent))
            }
            .padding(.horizontal, 18)
            .padding(.top, 10)

            Spacer()

            // Bottom Story Card leaving the 3D Orbital Earth & Mohs Crystals unobstructed above
            VStack(alignment: .leading, spacing: 12) {
                Text(L10n.t(beat.kicker))
                    .font(.system(.caption2, design: .rounded, weight: .heavy))
                    .foregroundStyle(MLTheme.fluorapatiteGold)

                Text(L10n.t(beat.title))
                    .font(.system(.title3, design: .rounded, weight: .heavy))
                    .foregroundStyle(MLTheme.textPrimary)

                Text(L10n.t(beat.body))
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(MLTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)

                if beat.mohsHighlight {
                    mohsScaleBar
                }

                // Only a brand-new save is offered this: a returning player already has their progress.
                // The picture is a document with an arrow, not a cloud: Apple keeps its cloud symbols
                // for iCloud, and the app does not use iCloud.
                if idx == 0, !hasSeenBefore, let onRestoreCode {
                    Button {
                        onRestoreCode()
                    } label: {
                        Label(L10n.t("Have a Sync Code?"), systemImage: "arrow.down.doc")
                            .font(.system(.footnote, design: .rounded, weight: .semibold))
                            .underline()
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(MLTheme.cyanAccent)
                }

                HStack(spacing: 12) {
                    if idx > 0 {
                        Button {
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                beatIndex = idx - 1
                            }
                        } label: {
                            Image(systemName: "chevron.left")
                        }
                        .buttonStyle(MLGlassPillButtonStyle())
                    }

                    Spacer()

                    Button {
                        if idx + 1 < beats.count {
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                beatIndex = idx + 1
                            }
                        } else {
                            onComplete()
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Text(L10n.t(idx + 1 < beats.count ? "Next Scale" : "Dive Into Your Arch"))
                            Image(systemName: idx + 1 < beats.count ? "arrow.right" : "sparkles")
                        }
                    }
                    .buttonStyle(MLPrimaryButtonStyle(accent: idx + 1 < beats.count ? MLTheme.cyanAccent : MLTheme.mintClean))
                }
                .padding(.top, 2)
            }
            .mlGlassCard(cornerRadius: 24, borderColor: MLTheme.cyanAccent.opacity(0.45), padding: 18)
            .padding(.horizontal, 16)
            .padding(.bottom, 14)
        }
    }

    /// Five specimens from soft to hard, the same as the 3D crystals and the web; the picked one's
    /// line sits underneath (name and note translated, the formula as written).
    private var mohsScaleBar: some View {
        let picked = MohsSpecimens.all[min(max(0, mohsIndex), MohsSpecimens.all.count - 1)]
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                ForEach(Array(MohsSpecimens.all.enumerated()), id: \.offset) { idx, specimen in
                    mohsChip(specimen, selected: idx == mohsIndex) { onSelectMohs(idx) }
                }
            }
            (Text("\(L10n.t(picked.name)) (\(picked.formula)): ").bold() + Text(L10n.t(picked.note)))
                .font(.system(.caption, design: .rounded))
                .foregroundStyle(MLTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.black.opacity(0.28)))
                .accessibilityAddTraits(.updatesFrequently)
        }
        .padding(.vertical, 4)
    }

    private func mohsChip(_ specimen: MohsSpecimen, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Text(specimen.hardness)
                    .font(.system(size: 12, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(selected ? MLTheme.deepOcean : (specimen.isEnamel ? MLTheme.mintClean : MLTheme.cyanAccent))
                Text(L10n.t(specimen.shortName))
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(selected ? MLTheme.deepOcean : MLTheme.textSecondary)
            }
            .frame(maxWidth: .infinity, minHeight: 40)
            .padding(.vertical, 5)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(selected ? MLTheme.fluorapatiteGold : Color.white.opacity(0.07))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(specimen.isEnamel && !selected ? MLTheme.mintClean.opacity(0.6) : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Mohs \(specimen.hardness) \(L10n.t(specimen.name))")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
