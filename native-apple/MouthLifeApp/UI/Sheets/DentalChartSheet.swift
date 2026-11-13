import SwiftUI
import MouthLifeCore

public struct DentalChartSheet: View {
    @Environment(\.dismiss) private var dismiss

    @State private var numberingSystem: ToothNumberingSystem = .universal
    @State private var selectedUniversal: Int = 8
    @State private var activeTab: ChartTab = .arch32
    @State private var selectedLayer: ToothLayerId = .enamel

    // Spot Quiz State
    @State private var quizActive: Bool = false
    @State private var currentQuestion: DentalSpotQuestion = DentalChart.generateSpotQuizQuestion()
    @State private var quizFeedback: DentalSpotAnswerGrade?
    @State private var currentStreak: Int = 0
    @State private var bestStreak: Int = 0

    public let onHighlightCompanionCrown: ((Int) -> Void)?
    public let onPlayChimeForCrown: ((Int) -> Void)?

    public enum ChartTab: String, CaseIterable, Identifiable {
        case arch32 = "32-Tooth Chart"
        case layers = "4-Layer Anatomy"
        case surfaces = "5 Surfaces"
        public var id: String { rawValue }
    }

    public init(
        initialUniversal: Int = 8,
        onHighlightCompanionCrown: ((Int) -> Void)? = nil,
        onPlayChimeForCrown: ((Int) -> Void)? = nil
    ) {
        _selectedUniversal = State(initialValue: max(1, min(32, initialUniversal)))
        self.onHighlightCompanionCrown = onHighlightCompanionCrown
        self.onPlayChimeForCrown = onPlayChimeForCrown
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Picker("Section", selection: $activeTab) {
                        ForEach(ChartTab.allCases) { tab in
                            Text(tab.rawValue).tag(tab)
                        }
                    }
                    .pickerStyle(.segmented)

                    switch activeTab {
                    case .arch32:
                        arch32Section
                    case .layers:
                        crossSectionView
                    case .surfaces:
                        surfacesSection
                    }

                    Text(CharityInfo.clinicalDisclaimer)
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(MLTheme.textMuted)
                        .padding(.top, 4)
                }
                .padding(16)
            }
            .background(MLTheme.deepOcean.ignoresSafeArea())
            .navigationTitle("Tooth Atlas")
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

    // MARK: - 32-Tooth Interactive Horseshoe Arch + Spot Quiz
    private var arch32Section: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Notation Switcher + Spot Quiz Toggle
            HStack(spacing: 8) {
                Picker("Notation", selection: $numberingSystem) {
                    Text("US #1–32").tag(ToothNumberingSystem.universal)
                    Text("FDI 11–48").tag(ToothNumberingSystem.fdi)
                    Text("Palmer").tag(ToothNumberingSystem.palmer)
                }
                .pickerStyle(.segmented)

                Button {
                    quizActive.toggle()
                    if quizActive {
                        quizFeedback = nil
                        currentQuestion = DentalChart.generateSpotQuizQuestion()
                    }
                } label: {
                    Label(quizActive ? "Exit Quiz" : "Spot Quiz", systemImage: "target")
                }
                .buttonStyle(MLGlassPillButtonStyle(tint: quizActive ? MLTheme.fluorapatiteGold : MLTheme.cyanAccent))
            }

            if quizActive {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("SPOT QUIZ CHALLENGE")
                            .font(.system(.caption2, design: .rounded, weight: .heavy))
                            .foregroundStyle(MLTheme.fluorapatiteGold)
                        Spacer()
                        Text("Streak \(currentStreak) • Best \(bestStreak)")
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(MLTheme.mintClean)
                    }

                    Text(currentQuestion.prompt)
                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                        .foregroundStyle(MLTheme.textPrimary)

                    if let feedback = quizFeedback {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: feedback.correct ? "checkmark.circle.fill" : "arrow.uturn.backward.circle.fill")
                                .foregroundStyle(feedback.correct ? MLTheme.mintClean : MLTheme.amberWarn)
                            Text(feedback.message)
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(MLTheme.textPrimary)
                            Spacer()
                            if feedback.correct {
                                Button("Next") {
                                    quizFeedback = nil
                                    currentQuestion = DentalChart.generateSpotQuizQuestion(
                                        excludingUniversalNumbers: [currentQuestion.targetUniversal]
                                    )
                                }
                                .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.mintClean, darkText: true))
                            }
                        }
                    }
                }
                .mlGlassCard(borderColor: MLTheme.fluorapatiteGold.opacity(0.55))
            }

            // Horseshoe Arch Diagram
            InteractiveHorseshoeArchView(
                numberingSystem: numberingSystem,
                selectedUniversal: selectedUniversal,
                quizCorrectUniversal: (quizFeedback?.correct == true) ? quizFeedback?.targetUniversal : nil
            ) { tappedUniversal in
                selectedUniversal = tappedUniversal
                let tooth = DentalChart.tooth(byUniversal: tappedUniversal)
                if let crownIdx = tooth.companionArchIndex {
                    onHighlightCompanionCrown?(crownIdx)
                    onPlayChimeForCrown?(crownIdx)
                } else {
                    onPlayChimeForCrown?(tappedUniversal % 14)
                }

                if quizActive {
                    let grade = DentalChart.gradeSpotAnswer(
                        question: currentQuestion,
                        tappedUniversal: tappedUniversal,
                        currentStreak: currentStreak,
                        bestStreak: bestStreak
                    )
                    currentStreak = grade.nextStreak
                    bestStreak = grade.bestStreak
                    quizFeedback = grade
                }
            }
            .frame(height: 350)
            .mlGlassCard()

            // Selected Tooth Clinical Inspector
            let tooth = DentalChart.tooth(byUniversal: selectedUniversal)
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tooth.clinicalName)
                            .font(.system(.headline, design: .rounded, weight: .heavy))
                            .foregroundStyle(MLTheme.textPrimary)
                        Text("\(tooth.commonNickname) • Erupts \(tooth.eruptionAge)")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .foregroundStyle(MLTheme.cyanAccent)
                    }
                    Spacer()
                    if tooth.isWisdomTooth {
                        Text("WISDOM")
                            .font(.system(size: 10, weight: .heavy, design: .rounded))
                            .foregroundStyle(MLTheme.deepOcean)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(MLTheme.sucroseViolet))
                    }
                }

                HStack(spacing: 8) {
                    MLStatChip(icon: "number", label: "Universal", value: "#\(tooth.universal)", tint: MLTheme.cyanAccent)
                    MLStatChip(icon: "globe", label: "ISO FDI", value: "\(tooth.fdi) (\(tooth.fdiSpoken))", tint: MLTheme.mintClean)
                    MLStatChip(icon: "squareshape.split.2x2", label: "Palmer", value: tooth.palmer, tint: MLTheme.fluorapatiteGold)
                }

                HStack(spacing: 14) {
                    Label("\(tooth.roots) root\(tooth.roots == 1 ? "" : "s")", systemImage: "arrow.down.to.line")
                    Label(tooth.cusps == 0 ? "Incisal ridge" : "\(tooth.cusps) cusps", systemImage: "mountain.2.fill")
                    Label(tooth.category.rawValue.capitalized, systemImage: "sparkles")
                }
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .foregroundStyle(MLTheme.textSecondary)

                Text(tooth.anatomyFact)
                    .font(.system(.footnote, design: .rounded))
                    .foregroundStyle(MLTheme.textPrimary)

                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "hand.sparkles.fill")
                        .foregroundStyle(MLTheme.mintClean)
                    Text(tooth.careTip)
                        .font(.system(.caption, design: .rounded, weight: .medium))
                        .foregroundStyle(MLTheme.textSecondary)
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.05)))
            }
            .mlGlassCard()
        }
    }

    // MARK: - 4-Layer Anatomical Cross-Section
    private var crossSectionView: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Interactive Concentric Molar Cutaway Graphic
            ZStack {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color.black.opacity(0.28))

                VStack(spacing: 10) {
                    Text("TAP ANY TISSUE LAYER")
                        .font(.system(.caption2, design: .rounded, weight: .bold))
                        .foregroundStyle(MLTheme.textMuted)

                    ZStack {
                        // Outer Root Cover & Tooth Cushion Sling
                        RoundedRectangle(cornerRadius: 44, style: .continuous)
                            .fill(MLTheme.color(hexString: "#c4b5fd").opacity(selectedLayer == .ligament ? 0.48 : 0.22))
                            .overlay(
                                RoundedRectangle(cornerRadius: 44, style: .continuous)
                                    .strokeBorder(MLTheme.color(hexString: "#c4b5fd"), lineWidth: selectedLayer == .ligament ? 3 : 1.2)
                            )
                            .frame(width: 240, height: 210)
                            .onTapGesture { selectedLayer = .ligament }

                        // Enamel Crown Cap
                        RoundedRectangle(cornerRadius: 38, style: .continuous)
                            .fill(MLTheme.color(hexString: "#e0f2fe").opacity(selectedLayer == .enamel ? 0.92 : 0.62))
                            .overlay(
                                RoundedRectangle(cornerRadius: 38, style: .continuous)
                                    .strokeBorder(MLTheme.cyanAccent, lineWidth: selectedLayer == .enamel ? 3 : 1.2)
                            )
                            .frame(width: 204, height: 174)
                            .onTapGesture { selectedLayer = .enamel }

                        // Dentin Tubule Core
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .fill(MLTheme.color(hexString: "#fde68a").opacity(selectedLayer == .dentin ? 0.92 : 0.65))
                            .overlay(
                                RoundedRectangle(cornerRadius: 28, style: .continuous)
                                    .strokeBorder(MLTheme.fluorapatiteGold, lineWidth: selectedLayer == .dentin ? 3 : 1.2)
                            )
                            .frame(width: 152, height: 130)
                            .onTapGesture { selectedLayer = .dentin }

                        // Living Neurovascular Pulp Chamber
                        Capsule(style: .continuous)
                            .fill(MLTheme.color(hexString: "#fb7185").opacity(selectedLayer == .pulp ? 0.96 : 0.78))
                            .overlay(
                                Capsule(style: .continuous)
                                    .strokeBorder(Color.white, lineWidth: selectedLayer == .pulp ? 2.5 : 1)
                            )
                            .frame(width: 78, height: 74)
                            .onTapGesture { selectedLayer = .pulp }

                        Text("❤️ PULP")
                            .font(.system(size: 11, weight: .heavy, design: .rounded))
                            .foregroundStyle(.white)
                            .allowsHitTesting(false)
                    }
                }
                .padding(.vertical, 16)
            }
            .frame(height: 265)

            // Layer Selector Pills
            HStack(spacing: 8) {
                ForEach(DentalChart.layers) { layer in
                    let active = selectedLayer == layer.layerKind
                    Button {
                        selectedLayer = layer.layerKind
                    } label: {
                        Text("\(layer.emoji) \(layer.layerKind.rawValue.capitalized)")
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(active ? MLTheme.deepOcean : MLTheme.textPrimary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(
                                Capsule().fill(active ? MLTheme.color(hexString: layer.colorHex) : Color.white.opacity(0.08))
                            )
                    }
                }
            }

            let info = DentalChart.layer(selectedLayer)
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("\(info.emoji) \(info.name)")
                        .font(.system(.headline, design: .rounded, weight: .heavy))
                        .foregroundStyle(MLTheme.textPrimary)
                    Spacer()
                    if let pct = info.mineralPercent {
                        Text("\(pct)% Mineral")
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.cyanAccent)
                    } else {
                        Text("Living Tissue")
                            .font(.system(.caption, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.coralGum)
                    }
                }
                Text(info.tagline)
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(MLTheme.fluorapatiteGold)
                Text(info.detail)
                    .font(.system(.footnote, design: .rounded))
                    .foregroundStyle(MLTheme.textSecondary)
                Text("Care tip: \(info.careTip)")
                    .font(.system(.caption, design: .rounded, weight: .semibold))
                    .foregroundStyle(MLTheme.mintClean)
            }
            .mlGlassCard()
        }
    }

    // MARK: - 5 Clinical Crown Surfaces
    private var surfacesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Every tooth has 5 sides. A brush reaches 3. Floss reaches the 2 hidden sides between teeth, about a third of the tooth!")
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(MLTheme.textSecondary)
                .mlGlassCard()

            ForEach(DentalChart.surfaces) { surface in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(surface.code)
                            .font(.system(.subheadline, design: .rounded, weight: .heavy))
                            .foregroundStyle(MLTheme.deepOcean)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(MLTheme.cyanAccent))
                        Text(surface.name)
                            .font(.system(.headline, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.textPrimary)
                    }
                    Text(surface.whereItFaces)
                        .font(.system(.footnote, design: .rounded))
                        .foregroundStyle(MLTheme.textSecondary)
                    Text("Technique: \(surface.howToClean)")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(MLTheme.mintClean)
                }
                .mlGlassCard()
            }
        }
    }
}

private struct InteractiveHorseshoeArchView: View {
    let numberingSystem: ToothNumberingSystem
    let selectedUniversal: Int
    let quizCorrectUniversal: Int?
    let onTapTooth: (Int) -> Void

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let cx = w * 0.5
            let rx = min(w * 0.42, 152.0)
            let upperCenterY = h * 0.44
            let lowerCenterY = h * 0.56
            let ry = min(h * 0.36, 122.0)

            ZStack {
                // Midline & Arch Labels
                VStack {
                    Text("UPPER ARCH (MAXILLARY)")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundStyle(MLTheme.textMuted)
                    Spacer()
                    HStack {
                        Text("PATIENT\nRIGHT")
                            .multilineTextAlignment(.center)
                        Spacer()
                        Text("32 ADULT\nTEETH")
                            .multilineTextAlignment(.center)
                            .foregroundStyle(MLTheme.cyanAccent.opacity(0.8))
                        Spacer()
                        Text("PATIENT\nLEFT")
                            .multilineTextAlignment(.center)
                    }
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .foregroundStyle(MLTheme.textMuted)
                    .padding(.horizontal, 36)
                    Spacer()
                    Text("LOWER ARCH (MANDIBULAR)")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundStyle(MLTheme.textMuted)
                }
                .padding(.vertical, 4)

                // Upper Teeth #1..#16 along top horseshoe arc (left-to-right = Patient Right #1 -> #8 -> #9 -> Patient Left #16)
                ForEach(1...16, id: \.self) { u in
                    let t = Double(u - 1) / 15.0 // 0..1
                    let angle = Double.pi * (1.0 - t) // pi (left) -> pi/2 (top) -> 0 (right)
                    let x = cx + cos(angle) * rx
                    let y = upperCenterY - sin(angle) * ry
                    toothButton(universal: u)
                        .position(x: x, y: y)
                }

                // Lower Teeth #32..#17 along bottom horseshoe arc (left = Patient Right #32 -> bottom #25/#24 -> right = Patient Left #17)
                ForEach(17...32, id: \.self) { u in
                    // u=32 -> left (t=0), u=17 -> right (t=1)
                    let t = Double(32 - u) / 15.0
                    let angle = Double.pi * (1.0 - t)
                    let x = cx + cos(angle) * rx
                    let y = lowerCenterY + sin(angle) * ry
                    toothButton(universal: u)
                        .position(x: x, y: y)
                }
            }
        }
    }

    @ViewBuilder
    private func toothButton(universal: Int) -> some View {
        let tooth = DentalChart.tooth(byUniversal: universal)
        let isSelected = selectedUniversal == universal
        let isQuizHit = quizCorrectUniversal == universal
        let size: CGFloat = tooth.category == .molar ? 28 : (tooth.category == .premolar ? 25 : 23)

        Button {
            onTapTooth(universal)
        } label: {
            Text(DentalChart.formatBadge(for: tooth, system: numberingSystem))
                .font(.system(size: 9, weight: .heavy, design: .rounded))
                .minimumScaleFactor(0.65)
                .lineLimit(1)
                .foregroundStyle(
                    (isSelected || isQuizHit) ? MLTheme.deepOcean : MLTheme.textPrimary
                )
                .frame(width: size, height: size)
                .background(
                    RoundedRectangle(cornerRadius: tooth.category == .molar ? 8 : 11, style: .continuous)
                        .fill(
                            isQuizHit ? MLTheme.mintClean :
                            isSelected ? MLTheme.cyanAccent :
                            tooth.isWisdomTooth ? MLTheme.sucroseViolet.opacity(0.28) :
                            Color.white.opacity(0.13)
                        )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: tooth.category == .molar ? 8 : 11, style: .continuous)
                        .strokeBorder(
                            isSelected ? Color.white : MLTheme.cyanAccent.opacity(0.45),
                            lineWidth: isSelected ? 1.8 : 0.9
                        )
                )
                .shadow(color: isSelected ? MLTheme.cyanAccent.opacity(0.6) : .clear, radius: 6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(tooth.clinicalName), Universal \(tooth.universal), FDI \(tooth.fdi)")
    }
}
