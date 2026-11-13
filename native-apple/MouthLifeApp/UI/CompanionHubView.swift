import SwiftUI
import MouthLifeCore

public enum HubSheetKind: String, Identifiable {
    case dentalChart
    case upgradeLab
    case historyAlmanac
    case syncSave
    case charity
    case settings

    public var id: String { rawValue }
}

public struct CompanionHubView: View {
    public let save: MouthLifeSaveV2
    public let selectedWorldId: String
    public let hubRadioStation: RadioStation
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

    public init(
        save: MouthLifeSaveV2,
        selectedWorldId: String,
        hubRadioStation: RadioStation,
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
        onOpenSheet: @escaping (HubSheetKind) -> Void
    ) {
        self.save = save
        self.selectedWorldId = selectedWorldId
        self.hubRadioStation = hubRadioStation
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
    }

    public var body: some View {
        let comp = save.companion
        let isBasking = comp.smoothnessIndex >= GameConfig.smoothBaskThreshold
        let needsPulpRescue = comp.pulpIntegrity <= 0.01

        VStack(spacing: 8) {
            // Top Economy & Utility Strip
            VStack(spacing: 8) {
                HStack(spacing: 8) {
                    MLStatChip(
                        icon: "bolt.shield.fill",
                        label: "Fluoride",
                        value: "\(save.fluorideIons) F⁻",
                        tint: MLTheme.cyanAccent
                    )
                    MLStatChip(
                        icon: "checkmark.seal.fill",
                        label: "Stamps",
                        value: "\(save.totalBrushStamps)",
                        tint: MLTheme.mintClean
                    )
                    MLStatChip(
                        icon: isBasking ? "sparkles" : "drop.fill",
                        label: isBasking ? "Smooth Bask" : "Saliva Stasis",
                        value: "\(Int(comp.smoothnessIndex.rounded()))%",
                        tint: isBasking ? MLTheme.fluorapatiteGold : MLTheme.cyanAccent
                    )
                    Spacer(minLength: 0)

                    if showProMotionBadge {
                        Text(liveFps >= 95 ? "\(liveFps)Hz PRO" : "\(max(60, liveFps))/120Hz")
                            .font(.system(size: 10, weight: .heavy, design: .monospaced))
                            .foregroundStyle(MLTheme.mintClean)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(Capsule().fill(MLTheme.cardBg))
                            .overlay(Capsule().strokeBorder(MLTheme.mintClean.opacity(0.45), lineWidth: 1))
                    }
                }

                // Quick Navigation Pill Strip
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 7) {
                        if comp.unclaimedIdleIons > 0 {
                            Button {
                                onClaimIdleIons()
                            } label: {
                                Label("Claim +\(comp.unclaimedIdleIons) F⁻ Bask", systemImage: "sparkles")
                            }
                            .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.fluorapatiteGold, darkText: true))
                        }

                        sheetPill("32-Tooth Atlas", icon: "mouth.fill", sheet: .dentalChart, tint: MLTheme.cyanAccent)
                        Button {
                            onReplayIntro()
                        } label: {
                            Label("Cosmic Intro", systemImage: "sparkles")
                        }
                        .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.fluorapatiteGold))
                        sheetPill(
                            "Upgrades",
                            icon: "wrench.and.screwdriver.fill",
                            sheet: .upgradeLab,
                            tint: MLTheme.mintClean
                        )
                        sheetPill("Almanac", icon: "book.closed.fill", sheet: .historyAlmanac, tint: MLTheme.fluorapatiteGold)
                        sheetPill("ML2: Sync", icon: "arrow.triangle.2.circlepath", sheet: .syncSave, tint: MLTheme.cyanAccent)
                        sheetPill("SmileOnU", icon: "heart.fill", sheet: .charity, tint: MLTheme.coralGum)
                        sheetPill("Settings", icon: "slider.horizontal.3", sheet: .settings, tint: MLTheme.textSecondary)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 6)

            // Tapped Crown / Toast Floating Callout (Non-blocking!)
            if let statusToast {
                Text(statusToast)
                    .font(.system(.caption, design: .rounded, weight: .bold))
                    .foregroundStyle(MLTheme.textPrimary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(Capsule().fill(MLTheme.cardElevated))
                    .overlay(Capsule().strokeBorder(MLTheme.mintClean.opacity(0.55), lineWidth: 1))
                    .transition(.opacity.combined(with: .scale))
            } else if let crown = tappedCrownSummary {
                Button {
                    onOpenSheet(.dentalChart)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "sparkle.magnifyingglass")
                            .foregroundStyle(MLTheme.cyanAccent)
                        Text("\(crown.toothTypeLabel) • Upper #\(crown.upperTooth.universal) (FDI \(crown.upperTooth.fdi))")
                            .font(.system(.caption2, design: .rounded, weight: .bold))
                            .foregroundStyle(MLTheme.textPrimary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(MLTheme.cardBg))
                    .overlay(Capsule().strokeBorder(MLTheme.cyanAccent.opacity(0.40), lineWidth: 1))
                }
                .buttonStyle(.plain)
            } else {
                Text("Rub teeth to play glass-harp notes & polish • Drag sky to orbit")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundStyle(MLTheme.textSecondary.opacity(0.85))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Color.black.opacity(0.24)))
                    .allowsHitTesting(false)
            }

            // Wide-open interactive 3D Arch & Orbital Earth space!
            Spacer(minLength: 0)

            // Bottom Thumb Deck: Shield Health + Campaign Selector + Dive / Brush-Along CTAs
            VStack(alignment: .leading, spacing: 10) {
                // Compact 3-Layer Shield Bar Row
                HStack(spacing: 10) {
                    MLShieldBar(label: "Enamel", value: comp.enamelShield, tint: MLTheme.cyanAccent)
                    MLShieldBar(label: "Dentin", value: comp.dentinShield, tint: MLTheme.fluorapatiteGold)
                    MLShieldBar(label: "Pulp", value: comp.pulpIntegrity, tint: MLTheme.coralGum)
                }

                if needsPulpRescue {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("PULP RESCUE SCRAMBLE READY")
                                .font(.system(.caption, design: .rounded, weight: .heavy))
                                .foregroundStyle(MLTheme.coralGum)
                            Text("90s endodontic rescue (+40 F⁻ win, zero permadeath!)")
                                .font(.system(.caption2, design: .rounded))
                                .foregroundStyle(MLTheme.textSecondary)
                        }
                        Spacer()
                        Button("Launch Rescue") {
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
                                Text("Sanctuary")
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
                                Text("Planet")
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
                                    Text(host.city)
                                        .font(.system(.caption, design: .rounded, weight: .bold))
                                        .foregroundStyle(selected ? MLTheme.deepOcean : (unlocked ? MLTheme.textPrimary : MLTheme.textMuted))
                                    if let grade = rec?.bestGrade, grade != .none {
                                        Text(grade == .fluorapatiteGold ? "★" : grade.rawValue)
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

                HStack(alignment: .center, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(activeCart.title) • \(activeHost.city)")
                            .font(.system(.subheadline, design: .rounded, weight: .heavy))
                            .foregroundStyle(MLTheme.textPrimary)
                            .lineLimit(1)
                        Text(activeUnlocked ? activeCart.subtitle : "Requires \(activeHost.unlockStampsRequired) Brush Stamps or prior world clear")
                            .font(.system(.caption2, design: .rounded))
                            .foregroundStyle(activeUnlocked ? MLTheme.textSecondary : MLTheme.amberWarn)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)

                    Button {
                        onFeedTreat()
                    } label: {
                        Text("\(activeHost.signatureTreat.emoji) Treat")
                    }
                    .buttonStyle(MLGlassPillButtonStyle(tint: MLTheme.fluorapatiteGold))
                }

                HStack(spacing: 10) {
                    Button {
                        onStartBrushAlong()
                    } label: {
                        Label("2-Min Brush", systemImage: "timer")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(MLPrimaryButtonStyle(accent: MLTheme.mintClean, darkText: true))

                    Button {
                        onLaunchWorld(activeHost.worldId)
                    } label: {
                        Label(activeUnlocked ? "Dive Arch" : "Locked", systemImage: activeUnlocked ? "play.fill" : "lock.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(MLPrimaryButtonStyle(accent: activeUnlocked ? MLTheme.cyanAccent : MLTheme.textMuted, darkText: true))
                    .disabled(!activeUnlocked)
                }
            }
            .mlGlassCard(cornerRadius: 22, borderColor: MLTheme.cyanAccent.opacity(0.38), padding: 13)
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
    }

    private func isWorldUnlocked(_ host: HostCityDef) -> Bool {
        if host.worldId == "world_1" { return true }
        if save.worlds[host.worldId]?.unlocked == true { return true }
        return save.totalBrushStamps >= host.unlockStampsRequired
    }

    private func sheetPill(_ label: String, icon: String, sheet: HubSheetKind, tint: Color) -> some View {
        Button {
            onOpenSheet(sheet)
        } label: {
            Label(label, systemImage: icon)
        }
        .buttonStyle(MLGlassPillButtonStyle(tint: tint))
    }
}
