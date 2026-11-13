import SwiftUI
import MouthLifeCore

public struct CosmicIntroView: View {
    @Binding public var beatIndex: Int
    public let onComplete: () -> Void

    private struct BeatContent {
        let kicker: String
        let title: String
        let body: String
        let mohsHighlight: Bool
    }

    private let beats: [BeatContent] = [
        BeatContent(
            kicker: "13.8 BILLION YEARS AGO → STELLAR FORGE",
            title: "Your Smile Is Woven From Supernova Stardust",
            body: "Every calcium (²⁰Ca) and phosphorus (¹⁵P) atom in your teeth was forged inside dying stars, scattered across our galaxy, and crystallized by your ameloblast cells into living armor.",
            mohsHighlight: false
        ),
        BeatContent(
            kicker: "CRYSTALLOGRAPHY • MOHS HARDNESS 5.0",
            title: "Hydroxyapatite: Harder Than Iron & Steel",
            body: "Human tooth enamel is 96% pure mineral crystal — the hardest substance in the human body, outranking iron and steel (4.0) on the Mohs mineral scale.",
            mohsHighlight: true
        ),
        BeatContent(
            kicker: "CRITICAL pH 5.5 • BIOPHYSICS PARADOX",
            title: "Unbeatable by Force — Vulnerable to Acid",
            body: "Even Mohs 5 crystal dissolves when oral bacteria ferment sugar into lactic acid below pH 5.5 — unless saliva buffers the pH and fluoride (⁹F) locks in Fluorapatite (stable to pH 4.5!).",
            mohsHighlight: false
        ),
        BeatContent(
            kicker: "5 GLOBAL CITIES + LOW-EARTH ORBIT",
            title: "Pilot HYDRA-1 Across Living Dental Arches",
            body: "Sweep Sonic Bristles at 45°, zip through tight interdental contacts on Polymer Floss, and unleash Fluoride-Bicarb Surges — then pace your real-life 2-minute brush at the bathroom sink.",
            mohsHighlight: false
        )
    ]

    public init(beatIndex: Binding<Int>, onComplete: @escaping () -> Void) {
        self._beatIndex = beatIndex
        self.onComplete = onComplete
    }

    public var body: some View {
        let idx = max(0, min(beats.count - 1, beatIndex))
        let beat = beats[idx]

        VStack {
            // Top Skip Bar
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
                Button("Skip Intro") {
                    onComplete()
                }
                .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.cyanAccent))
            }
            .padding(.horizontal, 18)
            .padding(.top, 10)

            Spacer()

            // Bottom Story Card leaving the 3D Orbital Earth & Mohs Crystals unobstructed above
            VStack(alignment: .leading, spacing: 12) {
                Text(beat.kicker)
                    .font(.system(.caption2, design: .rounded, weight: .heavy))
                    .foregroundStyle(MLTheme.fluorapatiteGold)

                Text(beat.title)
                    .font(.system(.title3, design: .rounded, weight: .heavy))
                    .foregroundStyle(MLTheme.textPrimary)

                Text(beat.body)
                    .font(.system(.subheadline, design: .rounded))
                    .foregroundStyle(MLTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)

                if beat.mohsHighlight {
                    mohsScaleBar
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
                            Text(idx + 1 < beats.count ? "Next Scale" : "Dive Into Your Arch")
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

    private var mohsScaleBar: some View {
        HStack(spacing: 6) {
            mohsChip("Talc", "1", active: false)
            mohsChip("Gypsum", "2", active: false)
            mohsChip("Calcite", "3", active: false)
            mohsChip("Fluorite", "4", active: false)
            mohsChip("Enamel", "5★", active: true)
        }
        .padding(.vertical, 4)
    }

    private func mohsChip(_ name: String, _ rank: String, active: Bool) -> some View {
        VStack(spacing: 2) {
            Text(rank)
                .font(.system(size: 12, weight: .heavy, design: .rounded))
                .foregroundStyle(active ? MLTheme.deepOcean : MLTheme.cyanAccent)
            Text(name)
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(active ? MLTheme.deepOcean : MLTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(active ? MLTheme.fluorapatiteGold : Color.white.opacity(0.07))
        )
    }
}
