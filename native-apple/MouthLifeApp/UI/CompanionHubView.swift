import SwiftUI
import MouthLifeCore

public enum HubSheetKind: String, Identifiable {
    case dentalChart
    case upgradeLab
    case historyAlmanac
    case syncSave
    /// The Prologue's "Have a Sync Code?" for a returning player on a new device.
    case restoreCode
    case charity
    case settings

    public var id: String { rawValue }
}

public struct CompanionHubView: View {
    public let save: MouthLifeSaveV2
    public let selectedWorldId: String
    public let hubRadioStation: RadioStation
    public let coachLanguage: CoachLanguage
    public let tappedCrownSummary: CompanionCrownSummary?
    public let statusToast: String?
    public let liveFps: Int
    public let showProMotionBadge: Bool

    public let onSelectCity: (String) -> Void
    public let onSelectSanctuary: () -> Void
    public let onSelectPlanet: () -> Void
    public let onClaimIdleIons: () -> Void
    public let onFeedTreat: () -> Void
    public let onStartBrushAlong: () -> Void
    public let onLaunchWorld: (String) -> Void
    public let onLaunchPulpRescue: () -> Void
    public let onReplayIntro: () -> Void
    public let onOpenSheet: (HubSheetKind) -> Void
    /// True on the first few launches, while the How to Play offer is up.
    public let showTutorialOffer: Bool
    public let onOpenTutorial: () -> Void
    public let onDismissTutorialOffer: () -> Void
    /// Each campaign city's piece of the Golden Molar.
    public let molarFinishes: [MolarFinish]
    public let onTapGoldenMolar: () -> Void
    /// The iPhone Duo's two pages (nil on every other screen): the companion and the sky on the first,
    /// the control deck on the second, so a city or a treat picked on one page shows on the other.
    public let split: DuoSplit?

    @State private var showHint = true

    public init(
        save: MouthLifeSaveV2,
        selectedWorldId: String,
        hubRadioStation: RadioStation,
        coachLanguage: CoachLanguage = .english,
        tappedCrownSummary: CompanionCrownSummary?,
        statusToast: String?,
        liveFps: Int,
        showProMotionBadge: Bool,
        onSelectCity: @escaping (String) -> Void,
        onSelectSanctuary: @escaping () -> Void,
        onSelectPlanet: @escaping () -> Void,
        onClaimIdleIons: @escaping () -> Void,
        onFeedTreat: @escaping () -> Void,
        onStartBrushAlong: @escaping () -> Void,
        onLaunchWorld: @escaping (String) -> Void,
        onLaunchPulpRescue: @escaping () -> Void,
        onReplayIntro: @escaping () -> Void,
        onOpenSheet: @escaping (HubSheetKind) -> Void,
        showTutorialOffer: Bool = false,
        onOpenTutorial: @escaping () -> Void = {},
        onDismissTutorialOffer: @escaping () -> Void = {},
        molarFinishes: [MolarFinish] = [],
        onTapGoldenMolar: @escaping () -> Void = {},
        split: DuoSplit? = nil
    ) {
        self.split = split
        self.molarFinishes = molarFinishes
        self.onTapGoldenMolar = onTapGoldenMolar
        self.save = save
        self.selectedWorldId = selectedWorldId
        self.hubRadioStation = hubRadioStation
        self.coachLanguage = coachLanguage
        self.tappedCrownSummary = tappedCrownSummary
        self.statusToast = statusToast
        self.liveFps = liveFps
        self.showProMotionBadge = showProMotionBadge
        self.onSelectCity = onSelectCity
        self.onSelectSanctuary = onSelectSanctuary
        self.onSelectPlanet = onSelectPlanet
        self.onClaimIdleIons = onClaimIdleIons
        self.onFeedTreat = onFeedTreat
        self.onStartBrushAlong = onStartBrushAlong
        self.onLaunchWorld = onLaunchWorld
        self.onLaunchPulpRescue = onLaunchPulpRescue
        self.onReplayIntro = onReplayIntro
        self.onOpenSheet = onOpenSheet
        self.showTutorialOffer = showTutorialOffer
        self.onOpenTutorial = onOpenTutorial
        self.onDismissTutorialOffer = onDismissTutorialOffer
    }

    public var body: some View {
        let comp = save.companion
        let isBasking = comp.smoothnessIndex >= GameConfig.smoothBaskThreshold
        let needsPulpRescue = comp.pulpIntegrity <= 0.01

        ZStack {
            if let split {
                duoLayout(split, comp: comp, isBasking: isBasking, needsPulpRescue: needsPulpRescue)
            } else {
                VStack(spacing: 8) {
                    topRow(isBasking: isBasking)
                    hubBelowTopRow(comp: comp, isBasking: isBasking, needsPulpRescue: needsPulpRescue)
                }
            }
        }
        .task {
            // The how-to line is a first-glance hint, not a fixture: let it go so the sky is clear.
            try? await Task.sleep(nanoseconds: 7_000_000_000)
            withAnimation(.easeOut(duration: 0.6)) { showHint = false }
        }
    }

    /// The top strip: one row. Wide screens show every shortcut; phones fold them into a menu.
    private func topRow(isBasking: Bool) -> some View {
        let comp = save.companion
        return Group {
                // Top strip: ONE row. Wide screens show every shortcut; phones fold them into a menu
                // so the mouth and the sky get the room instead.
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 7) {
                        statChips(isBasking: isBasking)
                        if comp.unclaimedIdleIons > 0 {
                            Button {
                                onClaimIdleIons()
                            } label: {
                                Label(L10n.t("Claim +\(comp.unclaimedIdleIons) F⁻ Bask"), systemImage: "sparkles")
                            }
                            .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.fluorapatiteGold, darkText: true))
                        }
                        Spacer(minLength: 8)
                        ForEach(HubShortcut.allCases) { shortcut in
                            Button {
                                open(shortcut)
                            } label: {
                                Label(L10n.t(shortcut.title), systemImage: shortcut.icon)
                                    .lineLimit(1)
                                    .fixedSize()
                            }
                            .buttonStyle(MLGlassPillButtonStyle(tint: shortcut.tint))
                        }
                    }

                    // Phones: the same row, dropping a chip at a time until it fits, so the row never
                    // grows wider than the screen (which would push the whole Home screen off its edges).
                    compactTopRow(isBasking: isBasking, keep: 3, iconOnlyMenu: false)
                    compactTopRow(isBasking: isBasking, keep: 2, iconOnlyMenu: false)
                    compactTopRow(isBasking: isBasking, keep: 1, iconOnlyMenu: false)
                    compactTopRow(isBasking: isBasking, keep: 1, iconOnlyMenu: true)
                }
                .padding(.horizontal, 14)
                .padding(.top, 6)
                .frame(maxWidth: .infinity)

        }
    }

    /// The Duo: the companion arch and the sky (with the hint or a toast) fill the first page; the
    /// second page is the control deck: the readouts and Menu at the top, the tapped crown's card
    /// (which opens the Dental Chart), How to Play, and the deck. In Tabletop the deck page lies flat
    /// and scrolls if it has to (large text, Pulp Rescue).
    @ViewBuilder
    private func duoLayout(_ split: DuoSplit, comp: CompanionState, isBasking: Bool, needsPulpRescue: Bool) -> some View {
        VStack(spacing: 8) {
            callout(crownHere: false)
                .padding(.top, 10)
            Spacer(minLength: 0)
        }
        .placed(in: split.firstRect)
        switch split.axis {
        case .sideBySide:
            VStack(spacing: 10) {
                topRow(isBasking: isBasking)
                if statusToast == nil, let crown = tappedCrownSummary {
                    crownButton(crown)
                }
                Spacer(minLength: 0)
                campaignPanel
                    .padding(.horizontal, 12)
                Spacer(minLength: 0)
                tutorialRow
                thumbDeck(comp: comp, needsPulpRescue: needsPulpRescue)
            }
            .placed(in: split.secondRect)
        case .stacked:
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 8) {
                    topRow(isBasking: isBasking)
                    if statusToast == nil, let crown = tappedCrownSummary {
                        crownButton(crown)
                    }
                    tutorialRow
                    thumbDeck(comp: comp, needsPulpRescue: needsPulpRescue)
                }
                .padding(.top, 8)
            }
            .scrollBounceBehavior(.basedOnSize)
            .placed(in: split.secondRect)
        }
    }

    @ViewBuilder
    private func compactTopRow(isBasking: Bool, keep: Int, iconOnlyMenu: Bool) -> some View {
        let comp = save.companion
                HStack(spacing: 6) {
                    statChips(isBasking: isBasking, keep: keep)
                    Spacer(minLength: 4)
                    if comp.unclaimedIdleIons > 0 {
                        Button {
                            onClaimIdleIons()
                        } label: {
                            Label("+\(comp.unclaimedIdleIons) F⁻", systemImage: "sparkles")
                                .font(.system(size: 13, weight: .heavy, design: .rounded))
                                .foregroundStyle(MLTheme.deepOcean)
                                .lineLimit(1)
                                .fixedSize()
                                .padding(.horizontal, 10)
                                .padding(.vertical, 7)
                                .background(Capsule().fill(MLTheme.fluorapatiteGold))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(Text(L10n.t("Claim +\(comp.unclaimedIdleIons) F⁻ Bask")))
                    }
                    Menu {
                        ForEach(HubShortcut.allCases) { shortcut in
                            Button {
                                open(shortcut)
                            } label: {
                                Label(L10n.t(shortcut.title), systemImage: shortcut.icon)
                            }
                        }
                    } label: {
                        Group {
                            if iconOnlyMenu {
                                Image(systemName: "line.3.horizontal")
                            } else {
                                Label(L10n.t("Menu"), systemImage: "line.3.horizontal")
                            }
                        }
                            .font(.system(.footnote, design: .rounded, weight: .semibold))
                            .foregroundStyle(MLTheme.textPrimary)
                            .lineLimit(1)
                            .fixedSize()
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(Capsule().fill(MLTheme.cardBg))
                            .overlay(Capsule().strokeBorder(MLTheme.cyanAccent.opacity(0.42), lineWidth: 1))
                    }
                    .menuStyle(.button)
                    .buttonStyle(.plain)
                    .menuIndicator(.hidden)
                    .fixedSize()
                    .accessibilityLabel(Text(L10n.t("Menu")))
                }
    }

    @ViewBuilder
    private func hubBelowTopRow(comp: CompanionState, isBasking: Bool, needsPulpRescue: Bool) -> some View {
        callout(crownHere: true)

        // Wide-open interactive 3D Arch & Orbital Earth space!
        Spacer(minLength: 0)

        tutorialRow
        thumbDeck(comp: comp, needsPulpRescue: needsPulpRescue)
    }

    /// The Duo deck page's journey so far: the five cities of the campaign, each with its check and
    /// best grade, its place in the campaign, or a lock. A tap picks the city, as in the city row.
    private var campaignPanel: some View {
        let campaign = HostsAndHistory.hostCities.filter { campaignStageNumber(worldId: $0.worldId) != nil }
        return HStack(spacing: 6) {
            ForEach(campaign) { host in
                let unlocked = isWorldUnlocked(host)
                let rec = save.worlds[host.worldId]
                let done = rec?.completed == true
                let selected = selectedWorldId == host.worldId
                Button {
                    onSelectCity(host.worldId)
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: !unlocked ? "lock.fill" : (done ? "checkmark.seal.fill" : "globe.americas.fill"))
                            .font(.system(size: 20, weight: .bold))
                            .foregroundStyle(!unlocked ? MLTheme.textMuted : (done ? MLTheme.fluorapatiteGold : MLTheme.cyanAccent))
                        Text(L10n.t(shortCityName(host.city)))
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(unlocked ? MLTheme.textPrimary : MLTheme.textMuted)
                            .lineLimit(1)
                            .minimumScaleFactor(0.65)
                        if let grade = rec?.bestGrade, grade != .none {
                            Text(L10n.t(grade == .fluorapatiteGold ? "★" : grade.rawValue))
                                .font(.system(size: 11, weight: .heavy, design: .rounded))
                                .foregroundStyle(MLTheme.fluorapatiteGold)
                        } else if let stage = campaignStageNumber(worldId: host.worldId) {
                            Text("\(stage)/5")
                                .font(.system(size: 10, weight: .heavy, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(MLTheme.textSecondary)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(selected ? MLTheme.cyanAccent.opacity(0.18) : Color.white.opacity(0.05)))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(selected ? MLTheme.cyanAccent : Color.clear, lineWidth: 1.5))
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
            }
        }
    }

    /// The toast, the tapped crown's card (`crownHere`: on the Duo it moves to the deck page) or the
    /// first-glance hint.
    @ViewBuilder
    private func callout(crownHere: Bool) -> some View {
            // Tapped Crown / Toast Floating Callout (Non-blocking!)
            if let statusToast {
                Text(L10n.t(statusToast))
                    .font(.system(.caption, design: .rounded, weight: .bold))
                    .foregroundStyle(MLTheme.textPrimary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(Capsule().fill(MLTheme.cardElevated))
                    .overlay(Capsule().strokeBorder(MLTheme.mintClean.opacity(0.55), lineWidth: 1))
                    .transition(.opacity.combined(with: .scale))
            } else if crownHere, let crown = tappedCrownSummary {
                crownButton(crown)
            } else if showHint {
                Text(L10n.t("Rub teeth to play notes & polish • Drag sky to turn"))
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundStyle(MLTheme.textSecondary.opacity(0.85))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Color.black.opacity(0.24)))
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }
    }

    /// The tapped crown: its name and numbers; a tap opens the Dental Chart.
    private func crownButton(_ crown: CompanionCrownSummary) -> some View {
            Button {
                onOpenSheet(.dentalChart)
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "sparkle.magnifyingglass")
                        .foregroundStyle(MLTheme.cyanAccent)
                    Text(L10n.t("\(crown.toothTypeLabel) • Upper #\(crown.upperTooth.universal) (FDI \(crown.upperTooth.fdi))"))
                        .font(.system(.caption2, design: .rounded, weight: .bold))
                        .foregroundStyle(MLTheme.textPrimary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Capsule().fill(MLTheme.cardBg))
                .overlay(Capsule().strokeBorder(MLTheme.cyanAccent.opacity(0.40), lineWidth: 1))
            }
            .buttonStyle(.plain)
    }

    /// How to Play: an offer on the first few launches, then a ? that always sits here.
    @ViewBuilder
    private var tutorialRow: some View {
            // How to Play: an offer on the first few launches, then a ? that always sits here.
            if showTutorialOffer {
                TutorialOfferCard(onAccept: onOpenTutorial, onDecline: onDismissTutorialOffer)
                    .padding(.horizontal, 12)
                    .transition(.opacity)
            } else {
                HStack {
                    Spacer(minLength: 0)
                    TutorialHelpButton(action: onOpenTutorial)
                }
                .padding(.horizontal, 14)
            }
    }

    /// The bottom thumb deck: shields, Pulp Rescue, the radio and city row, the city card with Treat,
    /// the 2-minute Brush and Dive.
    private func thumbDeck(comp: CompanionState, needsPulpRescue: Bool) -> some View {
            // Bottom Thumb Deck: Shield Health + Campaign Selector + Dive / Brush-Along CTAs
            VStack(alignment: .leading, spacing: 8) {
                // Compact 3-Layer Shield Bar Row
                HStack(spacing: 10) {
                    MLShieldBar(label: "Enamel", value: comp.enamelShield, tint: MLTheme.cyanAccent)
                    MLShieldBar(label: "Dentin", value: comp.dentinShield, tint: MLTheme.fluorapatiteGold)
                    MLShieldBar(label: "Pulp", value: comp.pulpIntegrity, tint: MLTheme.coralGum)
                }

                if needsPulpRescue {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L10n.t("PULP RESCUE SCRAMBLE READY"))
                                .font(.system(.caption, design: .rounded, weight: .heavy))
                                .foregroundStyle(MLTheme.coralGum)
                            Text(L10n.t("90s tooth rescue (+\(GameConfig.pulpRescueWinIons) F⁻ if you win, and you can’t lose the tooth!)"))
                                .font(.system(.caption2, design: .rounded))
                                .foregroundStyle(MLTheme.textSecondary)
                        }
                        Spacer()
                        Button(L10n.t("Launch Rescue")) {
                            onLaunchPulpRescue()
                        }
                        .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.coralGum, darkText: false))
                    }
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(MLTheme.coralGum.opacity(0.16)))
                }

                // Live Earth Radio & World Selector Pills
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        let isSanctuaryActive = (hubRadioStation == .sanctuary)
                        Button {
                            onSelectSanctuary()
                        } label: {
                            HStack(spacing: 5) {
                                Image(systemName: isSanctuaryActive ? "waveform" : "moon.stars.fill")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(isSanctuaryActive ? MLTheme.deepOcean : MLTheme.mintClean)
                                Text(L10n.t("Sanctuary"))
                                    .font(.system(.caption, design: .rounded, weight: .bold))
                                    .foregroundStyle(isSanctuaryActive ? MLTheme.deepOcean : MLTheme.textPrimary)
                            }
                            .padding(.horizontal, 11)
                            .padding(.vertical, 7)
                            .background(
                                Capsule().fill(isSanctuaryActive ? MLTheme.mintClean : Color.white.opacity(0.09))
                            )
                        }
                        .buttonStyle(.plain)

                        let isPlanetActive = (hubRadioStation == .planetOfEnamel)
                        Button {
                            onSelectPlanet()
                        } label: {
                            HStack(spacing: 5) {
                                Image(systemName: isPlanetActive ? "waveform" : "sparkles")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(isPlanetActive ? MLTheme.deepOcean : MLTheme.fluorapatiteGold)
                                Text(L10n.t("Planet"))
                                    .font(.system(.caption, design: .rounded, weight: .bold))
                                    .foregroundStyle(isPlanetActive ? MLTheme.deepOcean : MLTheme.textPrimary)
                            }
                            .padding(.horizontal, 11)
                            .padding(.vertical, 7)
                            .background(
                                Capsule().fill(isPlanetActive ? MLTheme.fluorapatiteGold : Color.white.opacity(0.09))
                            )
                        }
                        .buttonStyle(.plain)

                        ForEach(HostsAndHistory.hostCities) { host in
                            let unlocked = isWorldUnlocked(host)
                            let selected = selectedWorldId == host.worldId
                            let isTuning = (hubRadioStation == .city(host.worldId)) && unlocked
                            let rec = save.worlds[host.worldId]
                            let iconName: String = {
                                if !unlocked { return "lock.fill" }
                                if isTuning { return "waveform" }
                                return rec?.completed == true ? "checkmark.circle.fill" : "globe.americas.fill"
                            }()

                            Button {
                                onSelectCity(host.worldId)
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: iconName)
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundStyle(selected ? MLTheme.deepOcean : (unlocked ? MLTheme.cyanAccent : MLTheme.textMuted))
                                    Text(L10n.t(host.city))
                                        .font(.system(.caption, design: .rounded, weight: .bold))
                                        .foregroundStyle(selected ? MLTheme.deepOcean : (unlocked ? MLTheme.textPrimary : MLTheme.textMuted))
                                    if let grade = rec?.bestGrade, grade != .none {
                                        Text(L10n.t(grade == .fluorapatiteGold ? "★" : grade.rawValue))
                                            .font(.system(size: 10, weight: .heavy, design: .rounded))
                                            .foregroundStyle(selected ? MLTheme.deepOcean : MLTheme.fluorapatiteGold)
                                    }
                                }
                                .padding(.horizontal, 11)
                                .padding(.vertical, 7)
                                .background(
                                    Capsule().fill(
                                        selected ? MLTheme.cyanAccent : Color.white.opacity(unlocked ? 0.09 : 0.04)
                                    )
                                )
                                .overlay(
                                    Capsule().strokeBorder(
                                        isTuning && !selected ? MLTheme.cyanAccent.opacity(0.65) : Color.clear,
                                        lineWidth: 1
                                    )
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                // Selected World Summary + Primary Actions
                let activeHost = HostsAndHistory.hostCities.first { $0.worldId == selectedWorldId } ?? HostsAndHistory.hostCities[0]
                let activeUnlocked = isWorldUnlocked(activeHost)
                let activeCart = WorldRegistry.cartridgeOrDefault(forId: activeHost.worldId)
                // Dive names its city and the city's place in the campaign, from the world it launches
                // (web twin: btn-launch-arcade in CompanionHubOverlay.ts).
                let diveCity = L10n.t(shortCityName(activeHost.city))
                let diveStage = campaignStageNumber(worldId: activeHost.worldId)
                let diveWords = diveStage.map { L10n.t("Dive \($0) of 5") } ?? L10n.t("Dive")

                HStack(alignment: .center, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        // The Dive button names the city; a locked card says which city it is here.
                        Text(activeUnlocked ? L10n.t(activeCart.title) : "\(L10n.t(activeCart.title)) • \(L10n.t(activeHost.city))")
                            .font(.system(.subheadline, design: .rounded, weight: .heavy))
                            .foregroundStyle(MLTheme.textPrimary)
                            .lineLimit(1)
                        // The story line lives in the Almanac; here it only shows when it tells you
                        // something you need (how to unlock this world).
                        if !activeUnlocked {
                            Text(L10n.t("Needs \(activeHost.unlockStampsRequired) Brush Stamps, or clear the world before it"))
                                .font(.system(.caption2, design: .rounded))
                                .foregroundStyle(MLTheme.amberWarn)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                    }
                    Spacer(minLength: 0)

                    Button {
                        onFeedTreat()
                    } label: {
                        Text(L10n.t("\(activeHost.signatureTreat.emoji) Treat"))
                    }
                    .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.fluorapatiteGold))
                }

                HStack(spacing: 10) {
                    Button {
                        onStartBrushAlong()
                    } label: {
                        // One line whenever it fits (SwiftUI would otherwise wrap before it shrinks);
                        // only long languages fall back to two lines.
                        let brushLabel = L10n.t(BrushCoachCopy.hubStartBrushLabel(for: coachLanguage))
                        ViewThatFits(in: .horizontal) {
                            Label(brushLabel, systemImage: "timer")
                                .lineLimit(1)
                                .fixedSize()
                            Label(brushLabel, systemImage: "timer")
                                .font(.system(size: 12.5, weight: .bold, design: .rounded))
                                .lineLimit(1)
                                .fixedSize()
                            Label(brushLabel, systemImage: "timer")
                                .lineLimit(2)
                                .minimumScaleFactor(0.8)
                                .multilineTextAlignment(.leading)
                        }
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.mintClean, darkText: true))

                    Button {
                        onLaunchWorld(activeHost.worldId)
                    } label: {
                        if activeUnlocked {
                            // "Dive 4 of 5 · Accra"; on a narrow phone "Accra" over "4/5"; then the city alone.
                            ViewThatFits(in: .horizontal) {
                                Label("\(diveWords) · \(diveCity)", systemImage: "play.fill")
                                    .lineLimit(1)
                                    .fixedSize()
                                Label {
                                    VStack(alignment: .leading, spacing: 0) {
                                        Text(diveCity).lineLimit(1)
                                        if let diveStage {
                                            Text("\(diveStage)/5")
                                                .font(.system(size: 10, weight: .heavy, design: .rounded))
                                                .monospacedDigit()
                                                .opacity(0.8)
                                        }
                                    }
                                } icon: {
                                    Image(systemName: "play.fill")
                                }
                                .fixedSize()
                                Label(diveCity, systemImage: "play.fill")
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.75)
                            }
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(diveWords) · \(diveCity)")
                        } else {
                            Label(L10n.t("Locked"), systemImage: "lock.fill")
                                .lineLimit(1)
                                .fixedSize()
                        }
                    }
                    .buttonStyle(MLPrimaryButtonStyle(accent: activeUnlocked ? MLTheme.cyanAccent : MLTheme.textMuted, darkText: true))
                    .disabled(!activeUnlocked)
                }
            }
            .mlGlassCard(cornerRadius: 22, borderColor: MLTheme.cyanAccent.opacity(0.38), padding: 11)
            .padding(.horizontal, 12)
            .padding(.bottom, 6)
    }

    private func isWorldUnlocked(_ host: HostCityDef) -> Bool {
        if host.worldId == "world_1" { return true }
        if save.worlds[host.worldId]?.unlocked == true { return true }
        return save.totalBrushStamps >= host.unlockStampsRequired
    }

    /// The top strip's readouts. `keep` drops the least important ones on narrow phones (3 = all);
    /// the Golden Molar always stays.
    @ViewBuilder
    private func statChips(isBasking: Bool, keep: Int = 3) -> some View {
        MLStatChip(
            icon: "bolt.shield.fill",
            label: "Fluoride",
            value: "\(save.fluorideIons) F⁻",
            tint: MLTheme.cyanAccent,
            compact: true
        )
        if keep >= 2 {
            MLStatChip(
                icon: "checkmark.seal.fill",
                label: "Stamps",
                value: "\(save.totalBrushStamps)",
                tint: MLTheme.mintClean,
                compact: true
            )
        }
        if keep >= 3 {
            MLStatChip(
                icon: isBasking ? "sparkles" : "drop.fill",
                label: isBasking ? "Smooth Bask" : "Saliva Stasis",
                value: "\(Int(save.companion.smoothnessIndex.rounded()))%",
                tint: isBasking ? MLTheme.fluorapatiteGold : MLTheme.cyanAccent,
                compact: true
            )
        }
        goldenMolarChip
    }

    /// The Golden Molar: a piece for every city cleaned. Complete, it replays the ending.
    private var goldenMolarChip: some View {
        let count = molarFinishes.filter { $0 != .empty }.count
        let complete = count == CityFinale.campaignPieces
        return Button(action: onTapGoldenMolar) {
            HStack(spacing: 4) {
                GoldenMolarBadge(finishes: molarFinishes)
                Text(verbatim: "\(count)/5")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(complete ? MLTheme.fluorapatiteGold : MLTheme.textPrimary)
                    .fixedSize()
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(Capsule(style: .continuous).fill(MLTheme.cardBg))
            .overlay(Capsule(style: .continuous).strokeBorder(complete ? MLTheme.fluorapatiteGold : Color.white.opacity(0.12), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(L10n.t(complete ? "Watch the ending" : "Golden Molar: \(count) of 5")))
    }

    private func open(_ shortcut: HubShortcut) {
        if let sheet = shortcut.sheet {
            onOpenSheet(sheet)
        } else {
            onReplayIntro()
        }
    }
}

/// The hub's secondary destinations. One list feeds both the wide pill row and the phone menu.
enum HubShortcut: String, CaseIterable, Identifiable {
    case atlas, upgrades, almanac, sync, intro, charity, settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .atlas: return "32-Tooth Atlas"
        case .upgrades: return "Upgrades"
        case .almanac: return "Almanac"
        case .sync: return "ML2: Sync"
        case .intro: return "Cosmic Intro"
        case .charity: return "SmileOnU"
        case .settings: return "Settings"
        }
    }

    var icon: String {
        switch self {
        case .atlas: return "mouth.fill"
        case .upgrades: return "wrench.and.screwdriver.fill"
        case .almanac: return "book.closed.fill"
        case .sync: return "arrow.triangle.2.circlepath"
        case .intro: return "sparkles"
        case .charity: return "heart.fill"
        case .settings: return "slider.horizontal.3"
        }
    }

    var tint: Color {
        switch self {
        case .atlas, .sync: return MLTheme.cyanAccent
        case .upgrades: return MLTheme.mintClean
        case .almanac, .intro: return MLTheme.fluorapatiteGold
        case .charity: return MLTheme.coralGum
        case .settings: return MLTheme.textSecondary
        }
    }

    /// nil = replay the Cosmic Intro instead of opening a sheet.
    var sheet: HubSheetKind? {
        switch self {
        case .atlas: return .dentalChart
        case .upgrades: return .upgradeLab
        case .almanac: return .historyAlmanac
        case .sync: return .syncSave
        case .intro: return nil
        case .charity: return .charity
        case .settings: return .settings
        }
    }
}
