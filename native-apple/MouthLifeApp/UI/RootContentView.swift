import MouthLifeCore
import SwiftUI

public struct RootContentView: View {
    @Bindable public var coordinator: AppCoordinator

    public init(coordinator: AppCoordinator) {
        self.coordinator = coordinator
    }

    public var body: some View {
        ZStack {
            // Full-screen 120Hz Native Metal SceneKit 3D Viewport
            MouthLife3DViewport(controller: coordinator.sceneController)
                .ignoresSafeArea()

            // Streamlined Liquid-Glass Mode Overlays
            switch coordinator.mode {
            case .cosmicIntro:
                CosmicIntroView(
                    beatIndex: $coordinator.cosmicBeatIndex,
                    hasSeenBefore: coordinator.save.hasSeenCosmicIntro,
                    onComplete: { coordinator.completeCosmicIntro() }
                )
                .transition(.opacity)

            case .hub:
                CompanionHubView(
                    save: coordinator.save,
                    selectedWorldId: coordinator.selectedWorldId,
                    hubRadioStation: coordinator.hubRadioStation,
                    coachLanguage: coordinator.coachLanguage,
                    tappedCrownSummary: coordinator.tappedCrownSummary,
                    statusToast: coordinator.hubToast,
                    liveFps: coordinator.liveFps,
                    showProMotionBadge: coordinator.showProMotionBadge,
                    onSelectCity: { wid in coordinator.selectHubCity(wid) },
                    onSelectSanctuary: { coordinator.selectSanctuaryRadio() },
                    onSelectPlanet: { coordinator.selectPlanetRadio() },
                    onClaimIdleIons: { coordinator.claimIdleIons() },
                    onFeedTreat: { coordinator.feedRegionalTreat() },
                    onStartBrushAlong: { coordinator.startBrushAlong() },
                    onLaunchWorld: { wid in coordinator.launchArcadeWorld(wid) },
                    onLaunchPulpRescue: { coordinator.launchPulpRescue() },
                    onReplayIntro: { coordinator.replayCosmicIntro() },
                    onOpenSheet: { kind in
                        NativeSoundEngine.shared.playUiTap()
                        coordinator.activeSheet = kind
                    }
                )
                .transition(.opacity)

            case .brushAlong:
                BrushAlongView(
                    elapsedSec: coordinator.pacerElapsedSec,
                    isPaused: coordinator.pacerIsPaused,
                    pacerStage: coordinator.pacerStage,
                    didCompleteFloss: coordinator.pacerCompletedFlossStage,
                    flossToolStyle: coordinator.flossToolStyle,
                    mouthwashDurationStyle: coordinator.mouthwashDurationStyle,
                    mouthwashGyro: coordinator.mouthwashGyro,
                    voiceCoachEnabled: coordinator.voiceCoachEnabled,
                    coachLanguage: coordinator.coachLanguage,
                    stationLabel: coordinator.currentRadioStationLabel,
                    onCycleStation: { coordinator.cycleRadioStation() },
                    onToggleVoiceCoach: { coordinator.toggleVoiceCoach() },
                    onSelectLanguage: { lang in coordinator.setCoachLanguage(lang) },
                    onTogglePause: { coordinator.togglePacerPause() },
                    onSelectFlossToolStyle: { style in coordinator.setFlossToolStyle(style) },
                    onSelectMouthwashDuration: { style in coordinator.setMouthwashDurationStyle(style) },
                    onEnterFlossBonusNow: { coordinator.enterFlossBonusNow() },
                    onEnterMouthwashBonusNow: { didFloss in coordinator.enterMouthwashBonusNow(completedFloss: didFloss) },
                    onCompleteSession: { withFloss, withRinse in
                        coordinator.completeBrushAlongSession(
                            withFlossBonus: withFloss,
                            withMouthwashBonus: withRinse
                        )
                    },
                    onCancelToHub: { coordinator.returnToHub() }
                )
                .transition(.opacity)

            case .arcade, .pulpRescue:
                if let snap = coordinator.latestSnapshot {
                    ArcadeHudView(
                        cartridge: coordinator.activeCartridge,
                        snapshot: snap,
                        toastMessage: coordinator.arcadeToast,
                        liveFps: coordinator.liveFps,
                        showProMotionBadge: coordinator.showProMotionBadge,
                        onFireFlossSmart: { coordinator.sceneController.requestSmartFloss() },
                        onFireFlossDirection: { dir in coordinator.sceneController.requestDirectionalFloss(dir: dir) },
                        onFireRinse: { coordinator.sceneController.requestIonRinse() },
                        onFireDisclose: { coordinator.sceneController.requestDiscloseScan() },
                        onVirtualStickMove: { mx, mz, held in
                            coordinator.sceneController.setVirtualStick(moveX: mx, moveZ: mz, held: held)
                        },
                        onExitToHub: { coordinator.returnToHub() }
                    )
                    .transition(.opacity)
                }

            case .report:
                if let breakdown = coordinator.lastBreakdown {
                    MissionReportView(
                        mode: coordinator.lastReportMode,
                        cartridge: coordinator.activeCartridge,
                        won: coordinator.lastReportWon,
                        breakdown: breakdown,
                        unlockedHistoryNoteId: coordinator.lastUnlockedNoteId,
                        newlyUnlockedUpgradeIds: coordinator.lastUnlockedUpgradeIds,
                        nextWorldId: coordinator.lastReportMode == .arcade
                            ? WorldRegistry.nextWorldId(after: coordinator.activeCartridge.id)
                            : nil,
                        onPlayNextWorld: { nextId in coordinator.launchArcadeWorld(nextId) },
                        onReplay: {
                            if coordinator.lastReportMode == .pulpRescue {
                                coordinator.launchPulpRescue()
                            } else {
                                coordinator.launchArcadeWorld(coordinator.activeCartridge.id)
                            }
                        },
                        onReturnToHub: { coordinator.returnToHub() }
                    )
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .preferredColorScheme(.dark)
        .sheet(item: $coordinator.activeSheet) { sheet in
            Group {
                switch sheet {
                case .dentalChart:
                    DentalChartSheet(
                        initialUniversal: coordinator.tappedCrownSummary?.upperTooth.universal ?? 8,
                        onHighlightCompanionCrown: { idx in
                            coordinator.sceneController.highlightedCrownIndex = idx
                        },
                        onPlayChimeForCrown: { idx in
                            NativeSoundEngine.shared.playCrownRub(
                                crownIndex: idx,
                                smoothnessIndex: coordinator.save.companion.smoothnessIndex
                            )
                        }
                    )
                case .upgradeLab:
                    UpgradeLabSheet(
                        fluorideIons: coordinator.save.fluorideIons,
                        totalBrushStamps: coordinator.save.totalBrushStamps,
                        unlockedUpgrades: Set(coordinator.save.unlockedUpgrades),
                        equippedUpgrades: coordinator.save.equippedUpgrades,
                        onPurchase: { id in coordinator.purchaseUpgrade(id) },
                        onEquipToggle: { slot, id in coordinator.setEquipped(slot: slot, upgradeId: id) }
                    )
                case .historyAlmanac:
                    HistoryAlmanacSheet(unlockedNoteIds: Set(coordinator.save.unlockedHistoryNotes))
                case .syncSave:
                    SyncSaveSheet(
                        exportedCode: SaveSystem.encodeSaveToSyncCode(coordinator.save),
                        onImportCode: { code in coordinator.importSyncCode(code) }
                    )
                case .charity:
                    CharitySheet()
                case .settings:
                    ProfileAndSettingsSheet(
                        profile: coordinator.save.playerProfile,
                        qualityPref: coordinator.save.qualityPreference,
                        isMuted: NativeSoundEngine.shared.isMuted,
                        musicVolume: NativeSoundEngine.shared.musicVolume,
                        sfxVolume: NativeSoundEngine.shared.sfxVolume,
                        voiceCoachEnabled: coordinator.voiceCoachEnabled,
                        coachLanguage: coordinator.coachLanguage,
                        reducedMotion: coordinator.reducedMotion,
                        showProMotionTelemetry: coordinator.showProMotionBadge,
                        onSaveProfile: { name, tone, city in
                            coordinator.updateProfile(name: name, skinTone: tone, homeCity: city)
                        },
                        onChangeQuality: { pref in coordinator.updateQuality(pref) },
                        onChangeAudio: { muted, music, sfx in
                            coordinator.updateAudio(muted: muted, music: music, sfx: sfx)
                        },
                        onChangeVoiceCoach: { enabled in coordinator.setVoiceCoachEnabled(enabled) },
                        onChangeLanguage: { lang in coordinator.setCoachLanguage(lang) },
                        onChangeReducedMotion: { red in coordinator.reducedMotion = red },
                        onToggleProMotionTelemetry: { show in coordinator.showProMotionBadge = show },
                        onReplayCosmicIntro: { coordinator.replayCosmicIntro() }
                    )
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }
}
