import MouthLifeCore
import MouthLifeWatchUI
import SwiftUI

/// The overview beside the 3D close-up on a wide screen (iPad in landscape, a wide Mac window): the
/// whole mouth from above, as on the Apple Watch, in the same mirror view as the compass (screen-right
/// is the child's right). The toothbrush steps along the quarter being brushed and reaches every
/// tooth; finished quarters are outlined in gold, and the next one is outlined just before it starts.
/// Floss shows the pick stepping gap by gap, the rinse shows the water. One tap folds it away for a
/// full-screen close-up (not on the iPhone Duo, where it has a page of its own: `onHide` is nil).
struct BrushOverviewPanel: View {
    let elapsedSec: Double
    let pacerStage: PacerStage
    let mouthwashDurationSec: Double
    let isPaused: Bool
    let language: CoachLanguage
    let onHide: (() -> Void)?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let phase = BrushPhaseState.evaluate(elapsedSec: elapsedSec, stage: pacerStage, mouthwashDurationSec: mouthwashDurationSec)
        let glide: Animation? = reduceMotion ? nil : .easeInOut(duration: 0.3)
        VStack(spacing: 18) {
            HStack {
                Text(WatchCopy.word(stageWord, language))
                    .font(.system(size: 28, weight: .heavy, design: .rounded))
                    .foregroundStyle(MLTheme.fluorapatiteGold)
                Spacer()
                if let onHide {
                    Button(action: onHide) {
                        Image(systemName: "arrow.right.to.line")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(MLTheme.textSecondary)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.t("Full screen"))
                }
            }
            Spacer(minLength: 0)
            MouthMap(mode: mode(phase), focus: .whole, zoom: 0)
                .overlay {
                    if pacerStage == .brushing {
                        MouthPacer(quadrant: phase.quadrant, surface: phase.surface,
                                   position: Double(MouthPacer.tooth(atSurfaceSecond: phase.phaseElapsedSec)))
                            .animation(isPaused ? nil : glide, value: MouthPacer.tooth(atSurfaceSecond: phase.phaseElapsedSec))
                            .id(phase.quadrant.rawValue * 3 + phase.surface.rawValue)
                            .transition(.identity)
                    } else if pacerStage == .flossBonus {
                        FlossPacer(upper: phase.flossIsUpper, position: Double(phase.flossContactIndex))
                            .animation(glide, value: phase.flossContactIndex)
                            .id(phase.flossIsUpper)
                            .transition(.identity)
                    }
                }
                .aspectRatio(1.25, contentMode: .fit)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(accessibility(phase))
            if pacerStage == .brushing {
                quarterRow(phase)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(WatchLook.background.opacity(0.94))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(Color.white.opacity(0.12), lineWidth: 1)
        )
    }

    private var stageWord: WatchWord {
        switch pacerStage {
        case .brushing: return .brush
        case .flossBonus: return .floss
        case .mouthwashBonus: return .rinse
        }
    }

    /// What the chart shows: the quarter and side being brushed (and, in the quarter's last three
    /// seconds, the next one), the arch and gap being flossed, or the rinse.
    private func mode(_ p: BrushPhaseState) -> MouthMap.Mode {
        switch pacerStage {
        case .brushing:
            let quarter = GameConfig.brushAlongTotalSec / 4
            let inQuarter = elapsedSec.truncatingRemainder(dividingBy: quarter)
            let next = inQuarter >= quarter - 3 ? BrushQuadrant(rawValue: p.quadrant.rawValue + 1) : nil
            return .brushing(quadrant: p.quadrant, surface: p.surface, doneMask: p.completedQuadrantsMask, next: next)
        case .flossBonus:
            return .floss(upper: p.flossIsUpper, contact: p.flossContactIndex)
        case .mouthwashBonus:
            return .rinse(step: p.mouthwashStepIndex)
        }
    }

    /// The four quarters in brushing order: gold once brushed, ringed while brushing, dim ahead.
    private func quarterRow(_ p: BrushPhaseState) -> some View {
        HStack(spacing: 14) {
            ForEach(BrushQuadrant.allCases, id: \.rawValue) { q in
                let done = p.completedQuadrantsMask & (1 << q.rawValue) != 0
                let active = q == p.quadrant
                Text("\(q.rawValue + 1)")
                    .font(.system(size: 20, weight: .heavy, design: .rounded))
                    .foregroundStyle(done ? Color.black.opacity(0.75) : active ? .white : MLTheme.textSecondary)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(done ? MLTheme.fluorapatiteGold : Color.white.opacity(active ? 0.12 : 0.04)))
                    .overlay(Circle().strokeBorder(active ? MLTheme.fluorapatiteGold : Color.white.opacity(0.15), lineWidth: active ? 3 : 1))
            }
        }
        .accessibilityHidden(true)
    }

    private func accessibility(_ p: BrushPhaseState) -> String {
        switch pacerStage {
        case .brushing: return WatchCopy.brushingAccessibility(p.quadrant, p.surface, language)
        case .flossBonus: return WatchCopy.word(.floss, language) + ", " + WatchCopy.word(p.flossIsUpper ? .top : .bottom, language)
        case .mouthwashBonus: return WatchCopy.word(.rinse, language) + ", " + WatchCopy.rinseStep(p.mouthwashStepIndex, language)
        }
    }
}
