import SwiftUI
import MouthLifeCore

private let totalCarePurple = Color(red: 0.66, green: 0.30, blue: 0.98)
private let totalCareLavender = Color(red: 0.85, green: 0.70, blue: 1.0)

/// Permanent Body-Locked 2D Mirror Arch Compass.
/// Screen-Left = Patient Left (`Q2` Top-Left, `Q3` Bottom-Left) and Screen-Right = Patient Right (`Q1` Top-Right, `Q4` Bottom-Right),
/// matching your reflection in the bathroom mirror and NEVER flipping when the 3D cutaway camera moves.
private struct MirrorArchCompassView: View {
    let phase: BrushPhaseState
    let language: CoachLanguage
    let gyro: GyroSloshSnapshot

    var body: some View {
        let sides = BrushCoachCopy.mirrorSideLabels(for: language)
        let tiltLeft = phase.inMouthwashBonus && gyro.isHandheld && gyro.sloshPosition < -0.18
        let tiltRight = phase.inMouthwashBonus && gyro.isHandheld && gyro.sloshPosition > 0.18

        HStack(spacing: 5) {
            Text(L10n.t(sides.left))
                .font(.system(size: 9, weight: .heavy, design: .rounded))
                .foregroundStyle(
                    phase.inMouthwashBonus
                        ? (tiltLeft ? MLTheme.fluorapatiteGold : totalCareLavender)
                        : (!phase.quadrant.isPatientRight ? MLTheme.fluorapatiteGold : MLTheme.textMuted)
                )
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(width: 34, alignment: .trailing)

            Canvas { ctx, size in
                let cx = size.width * 0.5
                let cy = size.height * 0.5
                let rx = size.width * 0.38
                let ry = size.height * 0.39

                // Subtle center nose/smile mirror landmark
                var nose = Path()
                nose.move(to: CGPoint(x: cx - 4, y: cy - 2))
                nose.addLine(to: CGPoint(x: cx, y: cy - 6))
                nose.addLine(to: CGPoint(x: cx + 4, y: cy - 2))
                ctx.stroke(nose, with: .color(Color.white.opacity(0.28)), style: StrokeStyle(lineWidth: 1.4, lineCap: .round, lineJoin: .round))

                var smile = Path()
                smile.move(to: CGPoint(x: cx - 5, y: cy + 3))
                smile.addQuadCurve(to: CGPoint(x: cx + 5, y: cy + 3), control: CGPoint(x: cx, y: cy + 6.5))
                ctx.stroke(smile, with: .color(Color.white.opacity(0.26)), style: StrokeStyle(lineWidth: 1.4, lineCap: .round))

                for q in BrushQuadrant.allCases {
                    let qBit = (1 << q.rawValue)
                    let isCompleted = (phase.completedQuadrantsMask & qBit) != 0
                    let isActive: Bool = {
                        if phase.inMouthwashBonus {
                            return true
                        }
                        if phase.inFlossBonus {
                            return phase.flossIsUpper ? q.isUpper : !q.isUpper
                        }
                        return phase.quadrant == q
                    }()
                    let isPreEcho = (phase.stage == .brushing && phase.upcomingQuadrantIndex == q.rawValue && phase.preEcho01 > 0.02)

                    let arcPath = quadrantArcPath(q: q, cx: cx, cy: cy, rx: rx, ry: ry)

                    if phase.inMouthwashBonus {
                        let seal = Double(phase.mouthwashProgress01)
                        let sideBoost: Double = {
                            guard gyro.isHandheld else { return 0.35 }
                            let raw = q.isPatientRight ? Double(gyro.sloshPosition) : Double(-gyro.sloshPosition)
                            return min(1.0, max(0.0, raw))
                        }()
                        ctx.stroke(
                            arcPath,
                            with: .color(totalCarePurple.opacity(0.32 + 0.52 * sideBoost)),
                            style: StrokeStyle(lineWidth: 10.5 + 4.5 * sideBoost, lineCap: .round)
                        )
                        ctx.stroke(
                            arcPath,
                            with: .color(sideBoost > 0.45 ? MLTheme.fluorapatiteGold : totalCareLavender),
                            style: StrokeStyle(lineWidth: 6.2 + 1.2 * sideBoost, lineCap: .round)
                        )
                        let rimPath = quadrantArcPath(q: q, cx: cx, cy: cy, rx: rx * 1.18, ry: ry * 1.18)
                        ctx.stroke(
                            rimPath,
                            with: .color(MLTheme.fluorapatiteGold.opacity(0.30 + 0.64 * max(seal, sideBoost * 0.85))),
                            style: StrokeStyle(lineWidth: 2.2, lineCap: .round, dash: phase.mouthwashStepIndex == 1 ? [3, 2.5] : [])
                        )
                    } else if isActive {
                        // Outer warm gold halo + vivid surface core
                        ctx.stroke(
                            arcPath,
                            with: .color(MLTheme.fluorapatiteGold.opacity(0.38)),
                            style: StrokeStyle(lineWidth: 12, lineCap: .round)
                        )
                        let coreColor: Color = {
                            if phase.inFlossBonus { return MLTheme.fluorapatiteGold }
                            switch phase.surface {
                            case .outerCheek: return MLTheme.cyanAccent
                            case .chewingGrooves: return MLTheme.fluorapatiteGold
                            case .innerTongue: return MLTheme.mintClean
                            }
                        }()
                        ctx.stroke(
                            arcPath,
                            with: .color(coreColor),
                            style: StrokeStyle(lineWidth: 6.5, lineCap: .round)
                        )

                        // Surface rim indicator (Outer = outer halo arc, Inner = inner portal arc)
                        if !phase.inFlossBonus && phase.surface != .chewingGrooves {
                            let offsetScale: CGFloat = (phase.surface == .outerCheek) ? 1.18 : 0.78
                            let rimPath = quadrantArcPath(q: q, cx: cx, cy: cy, rx: rx * offsetScale, ry: ry * offsetScale)
                            ctx.stroke(
                                rimPath,
                                with: .color(MLTheme.fluorapatiteGold.opacity(0.92)),
                                style: StrokeStyle(lineWidth: 2.2, lineCap: .round, dash: phase.surface == .innerTongue ? [3, 2.5] : [])
                            )
                        }
                    } else if isCompleted {
                        ctx.stroke(
                            arcPath,
                            with: .color(MLTheme.mintClean.opacity(0.90)),
                            style: StrokeStyle(lineWidth: 5.5, lineCap: .round)
                        )
                    } else if isPreEcho {
                        let pulse = Double(phase.preEcho01)
                        ctx.stroke(
                            arcPath,
                            with: .color(MLTheme.fluorapatiteGold.opacity(0.30 + 0.55 * pulse)),
                            style: StrokeStyle(lineWidth: 5.8, lineCap: .round)
                        )
                    } else {
                        // Frosted porcelain upcoming state
                        ctx.stroke(
                            arcPath,
                            with: .color(Color.white.opacity(0.20)),
                            style: StrokeStyle(lineWidth: 5.0, lineCap: .round)
                        )
                    }
                }
            }
            .frame(width: 78, height: 74)

            Text(L10n.t(sides.right))
                .font(.system(size: 9, weight: .heavy, design: .rounded))
                .foregroundStyle(
                    phase.inMouthwashBonus
                        ? (tiltRight ? MLTheme.fluorapatiteGold : totalCareLavender)
                        : (phase.quadrant.isPatientRight ? MLTheme.fluorapatiteGold : MLTheme.textMuted)
                )
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(width: 34, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.t("Mirror Mouth Compass"))
    }

    private func quadrantArcPath(q: BrushQuadrant, cx: CGFloat, cy: CGFloat, rx: CGFloat, ry: CGFloat) -> Path {
        var path = Path()
        let steps = 14
        // Angles in screen coords (0 = right, -pi/2 = top, pi = left, +pi/2 = bottom):
        // Upper-Left (Q2): pi*1.04 -> pi*1.46
        // Upper-Right (Q1): pi*1.54 -> pi*1.96
        // Lower-Left (Q3): pi*0.96 -> pi*0.54
        // Lower-Right (Q4): pi*0.46 -> pi*0.04
        let (a0, a1): (CGFloat, CGFloat) = {
            switch q {
            case .upperLeft: return (.pi * 1.05, .pi * 1.45)
            case .upperRight: return (.pi * 1.55, .pi * 1.95)
            case .lowerLeft: return (.pi * 0.95, .pi * 0.55)
            case .lowerRight: return (.pi * 0.45, .pi * 0.05)
            }
        }()
        let yShift: CGFloat = q.isUpper ? -3.0 : 3.0
        for i in 0...steps {
            let t = CGFloat(i) / CGFloat(steps)
            let ang = a0 + (a1 - a0) * t
            let pt = CGPoint(x: cx + cos(ang) * rx, y: cy + yShift + sin(ang) * ry)
            if i == 0 {
                path.move(to: pt)
            } else {
                path.addLine(to: pt)
            }
        }
        return path
    }
}

/// Cheek-to-cheek Royal Amethyst Spirit-Level Bubble Gauge.
/// Auto-swishes hands-free while sitting on the bathroom counter, and switches immediately into
/// live 120Hz gyroscope liquid slosh physics the moment the user picks up their phone during the 60s rinse.
private struct MouthwashGyroLevelBar: View {
    let gyro: GyroSloshSnapshot
    let elapsedSec: Double
    let language: CoachLanguage

    var body: some View {
        let sides = BrushCoachCopy.mirrorSideLabels(for: language)
        let displaySlosh: Double = gyro.isHandheld
            ? Double(max(-1.0, min(1.0, gyro.sloshPosition)))
            : sin(elapsedSec * 3.2) * 0.68
        let leftCharge = Double(gyro.leftCheekCharge01)
        let rightCharge = Double(gyro.rightCheekCharge01)
        let leftLit = displaySlosh < -0.22
        let rightLit = displaySlosh > 0.22

        VStack(spacing: 5) {
            HStack(spacing: 8) {
                cheekPill(label: sides.left, charge: leftCharge, isLit: leftLit)

                GeometryReader { geo in
                    let trackW = max(44.0, geo.size.width)
                    let bubbleW: CGFloat = 28.0
                    let travel = max(0.0, (trackW - bubbleW - 6.0) * 0.5)
                    let bubbleOffset = CGFloat(displaySlosh) * travel

                    ZStack {
                        Capsule()
                            .fill(Color.white.opacity(0.09))

                        // Left & right cheek fluoride soak fill
                        HStack(spacing: 0) {
                            Capsule()
                                .fill(totalCarePurple.opacity(0.18 + 0.36 * leftCharge))
                                .frame(width: trackW * 0.42 * CGFloat(max(0.12, leftCharge)))
                            Spacer(minLength: 0)
                            Capsule()
                                .fill(totalCarePurple.opacity(0.18 + 0.36 * rightCharge))
                                .frame(width: trackW * 0.42 * CGFloat(max(0.12, rightCharge)))
                        }
                        .clipShape(Capsule())

                        // Spirit-level center calibration hairlines
                        HStack(spacing: 28) {
                            Rectangle()
                                .fill(Color.white.opacity(0.28))
                                .frame(width: 1.2, height: 11)
                            Rectangle()
                                .fill(Color.white.opacity(0.28))
                                .frame(width: 1.2, height: 11)
                        }

                        // Glowing Royal Amethyst liquid spirit bubble
                        ZStack(alignment: .top) {
                            Capsule()
                                .fill(
                                    LinearGradient(
                                        colors: [totalCareLavender, totalCarePurple],
                                        startPoint: .top,
                                        endPoint: .bottom
                                    )
                                )
                            Capsule()
                                .fill(Color.white.opacity(0.55))
                                .frame(width: 14, height: 3.5)
                                .padding(.top, 2.2)
                        }
                        .frame(width: bubbleW, height: 13)
                        .shadow(
                            color: (gyro.isHandheld ? MLTheme.fluorapatiteGold : totalCarePurple).opacity(0.72),
                            radius: 6
                        )
                        .offset(x: bubbleOffset)
                    }
                    .overlay(
                        Capsule().strokeBorder(
                            (gyro.isHandheld ? MLTheme.mintClean : totalCareLavender).opacity(0.52),
                            lineWidth: 1.1
                        )
                    )
                }
                .frame(height: 18)

                cheekPill(label: sides.right, charge: rightCharge, isLit: rightLit)
            }

            HStack(spacing: 5) {
                Image(systemName: "gyroscope")
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundStyle(gyro.isHandheld ? MLTheme.mintClean : totalCareLavender)
                Text(L10n.t(BrushCoachCopy.gyroSwishStatusLabel(isHandheld: gyro.isHandheld, lang: language)))
                    .font(.system(size: 9.5, weight: .heavy, design: .rounded))
                    .foregroundStyle(gyro.isHandheld ? MLTheme.mintClean : MLTheme.textMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)

                Spacer(minLength: 4)

                if gyro.swishCount > 0 {
                    Text(L10n.t("×\(gyro.swishCount)"))
                        .font(.system(size: 10, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Color.black)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(MLTheme.fluorapatiteGold))
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.t(BrushCoachCopy.gyroSwishStatusLabel(isHandheld: gyro.isHandheld, lang: language)))
    }

    private func cheekPill(label: String, charge: Double, isLit: Bool) -> some View {
        let complete = charge >= 0.95
        let fg: Color = complete
            ? Color.black
            : (isLit ? Color.black : totalCareLavender)
        let bg: Color = complete
            ? MLTheme.mintClean
            : (isLit ? MLTheme.fluorapatiteGold : Color.white.opacity(0.08))
        return Text(L10n.t(label))
            .font(.system(size: 9.5, weight: .heavy, design: .rounded))
            .foregroundStyle(fg)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(Capsule().fill(bg))
    }
}

public struct BrushAlongView: View {
    public let elapsedSec: Double
    public let isPaused: Bool
    public let pacerStage: PacerStage
    public let didCompleteFloss: Bool
    public let flossToolStyle: FlossToolStyle
    public let mouthwashDurationStyle: MouthwashDurationStyle
    public let mouthwashGyro: GyroSloshSnapshot
    public let voiceCoachEnabled: Bool
    public let coachLanguage: CoachLanguage
    public let stationLabel: String
    public let onCycleStation: () -> Void
    public let onToggleVoiceCoach: () -> Void
    public let onSelectLanguage: (CoachLanguage) -> Void
    public let onTogglePause: () -> Void
    public let onSelectFlossToolStyle: (FlossToolStyle) -> Void
    public let onSelectMouthwashDuration: (MouthwashDurationStyle) -> Void
    public let onEnterFlossBonusNow: () -> Void
    public let onEnterMouthwashBonusNow: (Bool) -> Void
    public let onCompleteSession: (Bool, Bool) -> Void
    public let onCancelToHub: () -> Void

    public init(
        elapsedSec: Double,
        isPaused: Bool,
        pacerStage: PacerStage = .brushing,
        didCompleteFloss: Bool = false,
        flossToolStyle: FlossToolStyle = .flossPick,
        mouthwashDurationStyle: MouthwashDurationStyle = .totalCare60s,
        mouthwashGyro: GyroSloshSnapshot = .idle,
        voiceCoachEnabled: Bool = true,
        coachLanguage: CoachLanguage = .english,
        stationLabel: String,
        onCycleStation: @escaping () -> Void,
        onToggleVoiceCoach: @escaping () -> Void = {},
        onSelectLanguage: @escaping (CoachLanguage) -> Void = { _ in },
        onTogglePause: @escaping () -> Void,
        onSelectFlossToolStyle: @escaping (FlossToolStyle) -> Void = { _ in },
        onSelectMouthwashDuration: @escaping (MouthwashDurationStyle) -> Void = { _ in },
        onEnterFlossBonusNow: @escaping () -> Void,
        onEnterMouthwashBonusNow: @escaping (Bool) -> Void = { _ in },
        onCompleteSession: @escaping (Bool, Bool) -> Void,
        onCancelToHub: @escaping () -> Void
    ) {
        self.elapsedSec = elapsedSec
        self.isPaused = isPaused
        self.pacerStage = pacerStage
        self.didCompleteFloss = didCompleteFloss
        self.flossToolStyle = flossToolStyle
        self.mouthwashDurationStyle = mouthwashDurationStyle
        self.mouthwashGyro = mouthwashGyro
        self.voiceCoachEnabled = voiceCoachEnabled
        self.coachLanguage = coachLanguage
        self.stationLabel = stationLabel
        self.onCycleStation = onCycleStation
        self.onToggleVoiceCoach = onToggleVoiceCoach
        self.onSelectLanguage = onSelectLanguage
        self.onTogglePause = onTogglePause
        self.onSelectFlossToolStyle = onSelectFlossToolStyle
        self.onSelectMouthwashDuration = onSelectMouthwashDuration
        self.onEnterFlossBonusNow = onEnterFlossBonusNow
        self.onEnterMouthwashBonusNow = onEnterMouthwashBonusNow
        self.onCompleteSession = onCompleteSession
        self.onCancelToHub = onCancelToHub
    }

    public var body: some View {
        let flossEnd = GameConfig.brushAlongTotalSec + GameConfig.brushAlongFlossBonusSec
        let mwDur = mouthwashDurationStyle.durationSec
        let totalTarget: Double = {
            switch pacerStage {
            case .brushing: return GameConfig.brushAlongTotalSec
            case .flossBonus: return flossEnd
            case .mouthwashBonus: return flossEnd + mwDur
            }
        }()
        let remaining = max(0, totalTarget - elapsedSec)
        let phase = BrushPhaseState.evaluate(
            elapsedSec: elapsedSec,
            stage: pacerStage,
            mouthwashDurationSec: mwDur
        )
        let buttons = BrushCoachCopy.actionButtonLabels(for: coachLanguage)
        let mwButtons = BrushCoachCopy.mouthwashButtonLabels(didFloss: didCompleteFloss, lang: coachLanguage)
        let clockGlow: Color = {
            if isPaused { return MLTheme.fluorapatiteGold }
            if phase.inMouthwashBonus { return totalCarePurple }
            return MLTheme.cyanAccent
        }()

        VStack(spacing: 8) {
            // Top Utility Bar: Hub | Radio | Voice Coach | Language | Pause
            HStack(spacing: 6) {
                Button {
                    onCancelToHub()
                } label: {
                    Label(L10n.t("Hub"), systemImage: "chevron.left")
                        .font(.system(.caption, design: .rounded, weight: .bold))
                }
                .buttonStyle(MLGlassPillButtonStyle())

                Spacer(minLength: 2)

                Button {
                    onCycleStation()
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: stationLabel == "Sanctuary" ? "moon.stars.fill" : "dot.radiowaves.left.and.right")
                            .font(.system(size: 11, weight: .bold))
                        Text(L10n.t(stationLabel))
                            .font(.system(.caption2, design: .rounded, weight: .bold))
                            .lineLimit(1)
                    }
                }
                .buttonStyle(
                    MLGlassPillButtonStyle(
                        tint: stationLabel == "Sanctuary" ? MLTheme.mintClean : MLTheme.cyanAccent
                    )
                )

                Button {
                    onToggleVoiceCoach()
                } label: {
                    Image(systemName: voiceCoachEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill")
                        .font(.system(size: 12, weight: .bold))
                }
                .buttonStyle(
                    MLGlassPillButtonStyle(tint: voiceCoachEnabled ? MLTheme.mintClean : MLTheme.textMuted)
                )
                .accessibilityLabel(L10n.t(voiceCoachEnabled ? "Voice Coach On" : "Voice Coach Off"))

                Menu {
                    ForEach(CoachLanguage.allCases) { lang in
                        Button {
                            onSelectLanguage(lang)
                        } label: {
                            HStack {
                                Text(L10n.t("\(lang.flagEmoji) \(lang.nativeName)"))
                                if lang == coachLanguage {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    HStack(spacing: 3) {
                        Text(L10n.t(coachLanguage.flagEmoji))
                            .font(.system(size: 12))
                        Text(L10n.t(coachLanguage.shortCode))
                            .font(.system(size: 11, weight: .heavy, design: .rounded))
                    }
                    .foregroundStyle(MLTheme.textPrimary)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 7)
                    .background(Capsule().fill(MLTheme.cardBg))
                    .overlay(Capsule().strokeBorder(MLTheme.cyanAccent.opacity(0.42), lineWidth: 1))
                }

                Button {
                    onTogglePause()
                } label: {
                    Image(systemName: isPaused ? "play.fill" : "pause.fill")
                        .font(.system(size: 12, weight: .bold))
                }
                .buttonStyle(MLGlassPillButtonStyle(tint: isPaused ? MLTheme.fluorapatiteGold : MLTheme.cyanAccent))
            }
            .padding(.horizontal, 14)
            .padding(.top, 6)

            // Permanent Body-Locked Mirror Arch Compass + 3-Foot Countdown & 3-2-1 Musical Anticipation
            HStack(spacing: 10) {
                MirrorArchCompassView(phase: phase, language: coachLanguage, gyro: mouthwashGyro)

                VStack(alignment: .leading, spacing: 4) {
                    Text(L10n.t(formatClock(ceil(remaining), pad: true)))
                        .font(.system(size: 44, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        // Never wrap the timer; shrink a little instead on narrow screens.
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .fixedSize(horizontal: false, vertical: true)
                        .layoutPriority(1)
                        .foregroundStyle(
                            isPaused
                                ? MLTheme.fluorapatiteGold
                                : (phase.inMouthwashBonus ? totalCareLavender : MLTheme.textPrimary)
                        )
                        .shadow(color: clockGlow.opacity(0.50), radius: 12)

                    if isPaused {
                        Button {
                            onTogglePause()
                        } label: {
                            Label(L10n.t("TAP TO RESUME"), systemImage: "play.circle.fill")
                                .font(.system(.caption2, design: .rounded, weight: .heavy))
                        }
                        .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.fluorapatiteGold, darkText: true))
                    } else if let pip = phase.countdownPip {
                        // Final 3-second musical anticipation indicator ("3 • 2 • 1")
                        HStack(spacing: 6) {
                            ForEach([3, 2, 1], id: \.self) { step in
                                Circle()
                                    .fill(step >= pip ? MLTheme.fluorapatiteGold : Color.white.opacity(0.18))
                                    .frame(width: step == pip ? 10 : 7, height: step == pip ? 10 : 7)
                                    .shadow(color: step == pip ? MLTheme.fluorapatiteGold : .clear, radius: 6)
                            }
                            Text(L10n.t("\(pip)…"))
                                .font(.system(.caption, design: .rounded, weight: .heavy))
                                .monospacedDigit()
                                .foregroundStyle(MLTheme.fluorapatiteGold)
                        }
                    } else {
                        // Clean surface / arch / swish sub-phase progress bar
                        let subFill = min(1.0, max(0.0, phase.phaseElapsedSec / max(0.5, phase.phaseDurationSec)))
                        let barColor: Color = {
                            if phase.inMouthwashBonus { return totalCarePurple }
                            if phase.inFlossBonus { return MLTheme.fluorapatiteGold }
                            return MLTheme.cyanAccent
                        }()
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.white.opacity(0.15))
                                Capsule()
                                    .fill(barColor)
                                    .frame(width: geo.size.width * CGFloat(subFill))
                            }
                        }
                        .frame(height: 7)
                        .frame(maxWidth: 132)
                    }
                }
            }
            .padding(.vertical, 9)
            .padding(.horizontal, 16)
            .mlGlassCard(cornerRadius: 24)
            .padding(.horizontal, 14)

            // Wide-open center viewport for the 3D Enamel Awakening Arch, Floss Pick & Purple Total Care Swish!
            Spacer(minLength: 0)

            // Glanceable 3-Foot Bottom Action Banner (Zero Instructional Paragraphs!)
            VStack(alignment: .leading, spacing: 9) {
                switch pacerStage {
                case .mouthwashBonus:
                    let mwHl = BrushCoachCopy.mouthwashHeadline(
                        stepIndex: phase.mouthwashStepIndex,
                        lang: coachLanguage
                    )
                    HStack(alignment: .center, spacing: 8) {
                        Text(L10n.t(mwHl.archTitle))
                            .font(.system(size: 19, weight: .heavy, design: .rounded))
                            .foregroundStyle(totalCareLavender)
                            .lineLimit(1)
                            .minimumScaleFactor(0.70)
                        Spacer(minLength: 4)
                        mouthwashDurationPicker
                    }

                    HStack(spacing: 7) {
                        Image(systemName: phase.mouthwashStepIndex == 2 ? "shield.lefthalf.filled.badge.checkmark" : "drop.fill")
                            .font(.system(size: 13, weight: .heavy))
                            .foregroundStyle(totalCarePurple)
                        Text(L10n.t(mwHl.actionBadge))
                            .font(.system(size: 15, weight: .heavy, design: .rounded))
                            .foregroundStyle(MLTheme.textPrimary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)

                        Spacer(minLength: 4)

                        Text(L10n.t(mwHl.ruleTag))
                            .font(.system(size: 10, weight: .heavy, design: .rounded))
                            .foregroundStyle(Color.black)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3.5)
                            .background(Capsule().fill(phase.mouthwashStepIndex == 2 ? MLTheme.fluorapatiteGold : totalCareLavender))
                    }

                    MouthwashGyroLevelBar(
                        gyro: mouthwashGyro,
                        elapsedSec: elapsedSec,
                        language: coachLanguage
                    )

                    HStack(spacing: 10) {
                        Button {
                            onCompleteSession(didCompleteFloss, true)
                        } label: {
                            Label(L10n.t(mwButtons.doneRinse), systemImage: "checkmark.seal.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(MLPrimaryButtonStyle(accent: totalCareLavender, darkText: true))

                        Button(L10n.t(mwButtons.skipRinse)) {
                            onCompleteSession(didCompleteFloss, false)
                        }
                        .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.cyanAccent))
                    }

                case .flossBonus:
                    let hl = BrushCoachCopy.flossHeadline(
                        isUpper: phase.flossIsUpper,
                        style: flossToolStyle,
                        stepIndex: phase.flossStepIndex,
                        lang: coachLanguage
                    )
                    let flossMwButtons = BrushCoachCopy.mouthwashButtonLabels(didFloss: true, lang: coachLanguage)

                    HStack(alignment: .center, spacing: 8) {
                        Text(L10n.t(hl.archTitle))
                            .font(.system(size: 20, weight: .heavy, design: .rounded))
                            .foregroundStyle(MLTheme.fluorapatiteGold)
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                        Spacer(minLength: 4)
                        flossToolPicker
                    }

                    HStack(spacing: 7) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 13, weight: .heavy))
                            .foregroundStyle(MLTheme.mintClean)
                        Text(L10n.t(hl.actionBadge))
                            .font(.system(size: 15, weight: .heavy, design: .rounded))
                            .foregroundStyle(MLTheme.textPrimary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }

                    HStack(spacing: 8) {
                        Button {
                            onEnterMouthwashBonusNow(true)
                        } label: {
                            Label(L10n.t(flossMwButtons.rinseJump), systemImage: "drop.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(MLPrimaryButtonStyle(accent: totalCareLavender, darkText: true))

                        Button(L10n.t(buttons.doneFloss)) {
                            onCompleteSession(true, false)
                        }
                        .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.mintClean))

                        Button(L10n.t(buttons.skipFloss)) {
                            onEnterMouthwashBonusNow(false)
                        }
                        .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.cyanAccent))
                    }

                case .brushing:
                    let qHeadline = BrushCoachCopy.quadrantLabel(phase.quadrant, lang: coachLanguage)
                    let badge = BrushCoachCopy.surfaceActionBadge(phase.surface, lang: coachLanguage)

                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(L10n.t(qHeadline))
                            .font(.system(size: 23, weight: .heavy, design: .rounded))
                            .foregroundStyle(MLTheme.textPrimary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)

                        Spacer(minLength: 4)

                        Text(L10n.t(badge.angleTag))
                            .font(.system(size: 12, weight: .heavy, design: .rounded))
                            .foregroundStyle(Color.black)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(MLTheme.fluorapatiteGold))
                    }

                    HStack(spacing: 8) {
                        Image(systemName: surfaceIconName(phase.surface))
                            .font(.system(size: 14, weight: .heavy))
                            .foregroundStyle(surfaceAccentColor(phase.surface))
                        Text(L10n.t(badge.headline))
                            .font(.system(size: 16, weight: .heavy, design: .rounded))
                            .foregroundStyle(surfaceAccentColor(phase.surface))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)

                        Spacer(minLength: 4)

                        Button {
                            onEnterFlossBonusNow()
                        } label: {
                            Label(L10n.t(buttons.flossJump), systemImage: "sparkles")
                                .font(.system(.caption2, design: .rounded, weight: .bold))
                        }
                        .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.fluorapatiteGold))
                    }
                }
            }
            .mlGlassCard(cornerRadius: 22)
            .padding(.horizontal, 14)
            .padding(.bottom, 10)
        }
    }

    private func surfaceIconName(_ surface: BrushSurface) -> String {
        switch surface {
        case .outerCheek: return "wave.3.right"
        case .chewingGrooves: return "circle.grid.2x2.fill"
        case .innerTongue: return "arrow.up.and.down.circle.fill"
        }
    }

    private func surfaceAccentColor(_ surface: BrushSurface) -> Color {
        switch surface {
        case .outerCheek: return MLTheme.cyanAccent
        case .chewingGrooves: return MLTheme.fluorapatiteGold
        case .innerTongue: return MLTheme.mintClean
        }
    }

    private var flossToolPicker: some View {
        HStack(spacing: 4) {
            flossStyleChip(title: "Pick", style: .flossPick)
            flossStyleChip(title: "String", style: .stringFloss)
        }
        .padding(3)
        .background(Capsule().fill(Color.white.opacity(0.08)))
    }

    private func flossStyleChip(title: String, style: FlossToolStyle) -> some View {
        let selected = (flossToolStyle == style)
        return Button {
            onSelectFlossToolStyle(style)
        } label: {
            Text(L10n.t(title))
                .font(.system(.caption2, design: .rounded, weight: .heavy))
                .foregroundStyle(selected ? Color.black : MLTheme.textMuted)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule().fill(selected ? MLTheme.fluorapatiteGold : Color.clear)
                )
        }
        .buttonStyle(.plain)
    }

    private var mouthwashDurationPicker: some View {
        HStack(spacing: 4) {
            mouthwashDurationChip(title: "60s", style: .totalCare60s)
            mouthwashDurationChip(title: "30s", style: .quick30s)
        }
        .padding(3)
        .background(Capsule().fill(Color.white.opacity(0.08)))
    }

    private func mouthwashDurationChip(title: String, style: MouthwashDurationStyle) -> some View {
        let selected = (mouthwashDurationStyle == style)
        return Button {
            onSelectMouthwashDuration(style)
        } label: {
            Text(L10n.t(title))
                .font(.system(.caption2, design: .rounded, weight: .heavy))
                .foregroundStyle(selected ? Color.black : MLTheme.textMuted)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule().fill(selected ? totalCareLavender : Color.clear)
                )
        }
        .buttonStyle(.plain)
    }
}
