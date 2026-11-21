import MouthLifeCore
import SwiftUI

public struct RootContentView: View {
    @Bindable public var coordinator: AppCoordinator
    /// The system's Reduce Motion setting; the game follows it (the in-app switch can still turn it on).
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    /// On a wide screen the 2-minute brush shows the whole mouth beside the 3D close-up (the "duo");
    /// one tap folds it away for a full-screen close-up, and the choice is remembered.
    @AppStorage("mouthlife.brushOverview") private var showBrushOverview = true

    public init(coordinator: AppCoordinator) {
        self.coordinator = coordinator
    }

    public var body: some View {
        GeometryReader { geo in
            // The iPhone Duo's inner screen: two pages, each doing its own job (nil everywhere else).
            let split = Self.duoSplit(geo, mode: coordinator.mode, finale: coordinator.finale != nil)
            let wide = split == nil && coordinator.mode == .brushAlong && geo.size.width >= 900 && geo.size.width > geo.size.height * 1.15
            let panel: CGFloat = wide && showBrushOverview ? min(460, geo.size.width * 0.36) : 0
            let viewport = split.map { EdgeInsets(top: 0, leading: 0, bottom: $0.viewportBottom, trailing: $0.viewportTrailing) }
                ?? EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: panel)
            ZStack(alignment: .trailing) {
                modes(viewport: viewport, split: split)
                if let split, coordinator.mode == .brushAlong {
                    // "where": the whole mouth on the second page, beside (or below) the 3D "how". It
                    // takes no touches (in Tabletop it lies flat by the sink, where splashes land).
                    duoBrushPage(split)
                        .placed(in: split.secondRect)
                        .allowsHitTesting(false)
                }
                if wide {
                    if showBrushOverview {
                        BrushOverviewPanel(
                            elapsedSec: coordinator.pacerElapsedSec,
                            pacerStage: coordinator.pacerStage,
                            mouthwashDurationSec: coordinator.mouthwashDurationStyle.durationSec,
                            isPaused: coordinator.pacerIsPaused,
                            language: coordinator.coachLanguage,
                            onHide: { showBrushOverview = false }
                        )
                        .frame(width: panel - 24)
                        .padding(.vertical, 16)
                        .padding(.trailing, 16)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                    } else {
                        // a tab on the edge brings the overview back
                        Button { showBrushOverview = true } label: {
                            Image(systemName: "arrow.left.to.line")
                                .font(.system(size: 17, weight: .bold))
                                .foregroundStyle(MLTheme.textSecondary)
                                .frame(width: 44, height: 64)
                                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.black.opacity(0.45)))
                        }
                        .buttonStyle(.plain)
                        .padding(.trailing, 10)
                        .accessibilityLabel(L10n.t("Whole mouth"))
                        .transition(.opacity)
                    }
                }
            }
            .animation(systemReduceMotion ? nil : .easeInOut(duration: 0.3), value: panel)
            .background(MLTheme.deepOcean.ignoresSafeArea())
        }
        .ignoresSafeArea(.keyboard)
        // a Home Screen or Lock Screen widget was tapped
        .onOpenURL { coordinator.openFromWidget($0) }
        #if os(iOS)
        // a new time zone or a clock change: the widgets' timeline moves with it
        .onReceive(NotificationCenter.default.publisher(for: .NSSystemTimeZoneDidChange)) { _ in coordinator.clockChangedForWidgets() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in coordinator.clockChangedForWidgets() }
        #endif
    }

    /// The 2-Minute Brush's second page on the Duo: the whole mouth; in Tabletop also the words of the
    /// step (which leave the upright page there).
    @ViewBuilder
    private func duoBrushPage(_ split: DuoSplit) -> some View {
        let panel = BrushOverviewPanel(
            elapsedSec: coordinator.pacerElapsedSec,
            pacerStage: coordinator.pacerStage,
            mouthwashDurationSec: coordinator.mouthwashDurationStyle.durationSec,
            isPaused: coordinator.pacerIsPaused,
            language: coordinator.coachLanguage,
            onHide: nil
        )
        if split.axis == .stacked {
            HStack(alignment: .center, spacing: 14) {
                panel
                BrushCueRows(
                    phase: BrushPhaseState.evaluate(
                        elapsedSec: coordinator.pacerElapsedSec,
                        stage: coordinator.pacerStage,
                        mouthwashDurationSec: coordinator.mouthwashDurationStyle.durationSec
                    ),
                    stage: coordinator.pacerStage,
                    flossToolStyle: coordinator.flossToolStyle,
                    gyro: coordinator.mouthwashGyro,
                    elapsedSec: coordinator.pacerElapsedSec,
                    language: coordinator.coachLanguage,
                    showsTitle: true,
                    reducedMotion: coordinator.reducedMotion
                )
                .mlGlassCard(cornerRadius: 22)
                .frame(maxWidth: .infinity)
            }
            .padding(12)
        } else {
            panel.padding(12)
        }
    }

    /// The Duo's two pages for the modes that use them (Home, the 2-Minute Brush, a city stage). A
    /// city's finale and the ending play on one big screen across both pages (the split is off while
    /// they run, so the scene behind them is whole too); the Prologue, the score and the sheets keep
    /// the whole screen as well.
    private static func duoSplit(_ geo: GeometryProxy, mode: AppMode, finale: Bool) -> DuoSplit? {
        if finale { return nil }
        switch mode {
        case .hub, .brushAlong, .arcade, .pulpRescue: break
        default: return nil
        }
        // `reservedRegions` is in the iOS 27.1 SDK (Xcode 27, Swift 6.4). Older Xcodes, such as
        // GitHub's Mac runner, build without the Duo split so the rest of the app is still checked.
        #if os(iOS) && compiler(>=6.4)
        if #available(iOS 27.1, *) {
            let folds = geo.reservedRegions(kind: .division, options: .includeInactive, layoutDirectionBehavior: .fixed).map(\.frame)
            return DuoSplit.make(folds: folds, size: geo.size, safeTrailing: geo.safeAreaInsets.trailing, safeBottom: geo.safeAreaInsets.bottom)
        }
        #endif
        return nil
    }

    /// The 3D scene with the overlay for the current mode. `viewport` pads the scene down to its part
    /// of the screen (left of the brush overview on a wide screen; the first page on the Duo). Only its
    /// frame changes, so the 3D view is never rebuilt.
    @ViewBuilder
    private func modes(viewport: EdgeInsets, split: DuoSplit?) -> some View {
        ZStack {
            // Full-screen 120Hz Native Metal SceneKit 3D Viewport
            MouthLife3DViewport(controller: coordinator.sceneController, paused: coordinator.finale != nil)
                .padding(viewport)
                .ignoresSafeArea()

            overlays(trailingInset: viewport.trailing, split: split)
                // Rebuild every screen when the language changes, so all text is translated again
                // (the overlays only: the 3D view stays as it is).
                .id(coordinator.coachLanguage)
        }
        .preferredColorScheme(.dark)
        .sheet(item: $coordinator.activeSheet) { sheet in
            sheetContent(sheet)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        // Follow the system's Reduce Motion: on at launch if it is on, and live when it changes.
        .onAppear { if systemReduceMotion { coordinator.reducedMotion = true } }
        .onChange(of: systemReduceMotion) { _, reduce in coordinator.reducedMotion = reduce }
    }

    /// The overlay for the current mode, the finale and How to Play.
    @ViewBuilder
    private func overlays(trailingInset: CGFloat, split: DuoSplit?) -> some View {
        ZStack {
            // Streamlined Liquid-Glass Mode Overlays
            switch coordinator.mode {
            case .cosmicIntro:
                CosmicIntroView(
                    beatIndex: $coordinator.cosmicBeatIndex,
                    hasSeenBefore: coordinator.save.hasSeenCosmicIntro,
                    onComplete: { coordinator.completeCosmicIntro() },
                    onRestoreCode: { coordinator.activeSheet = .restoreCode },
                    mohsIndex: coordinator.cosmicMohsIndex,
                    onSelectMohs: { coordinator.selectCosmicMohs($0) }
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
                    onLaunchWorld: { wid in coordinator.diveFromHome(wid) },
                    onLaunchPulpRescue: { coordinator.launchPulpRescue() },
                    onReplayIntro: { coordinator.replayCosmicIntro() },
                    onOpenSheet: { kind in
                        NativeSoundEngine.shared.playUiTap()
                        coordinator.activeSheet = kind
                    },
                    showTutorialOffer: coordinator.showTutorialOffer,
                    onOpenTutorial: { coordinator.openTutorial() },
                    onDismissTutorialOffer: { coordinator.dismissTutorialOffer() },
                    molarFinishes: coordinator.molarFinishes,
                    onTapGoldenMolar: { coordinator.tapGoldenMolar() },
                    split: split
                )
                .transition(.opacity)

            case .brushAlong:
                BrushAlongView(
                    elapsedSec: coordinator.pacerElapsedSec,
                    isPaused: coordinator.pacerIsPaused,
                    pacerStage: coordinator.pacerStage,
                    didCompleteFloss: coordinator.pacerCompletedFlossStage,
                    includeRinse: coordinator.includeRinse,
                    fullBrush: coordinator.pacerBrushedFullTime,
                    fullRewardLeftToday: (coordinator.save.dailySlotsByDate[HabitBank.localDateKey()]?.fullRewards ?? 0) < GameConfig.dailyFullRewardCap,
                    reducedMotion: coordinator.reducedMotion,
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
                    onEnterMouthwashBonusNow: { didFloss in coordinator.enterMouthwashBonusNow(completedFloss: didFloss) },
                    onCompleteSession: { withFloss, withRinse in
                        coordinator.completeBrushAlongSession(
                            withFlossBonus: withFloss,
                            withMouthwashBonus: withRinse
                        )
                    },
                    onCancelToHub: { coordinator.returnToHub() },
                    duoPose: split?.axis
                )
                .modifier(PagePlacement(rect: split?.firstRect, trailingInset: trailingInset))
                .transition(.opacity)

            case .arcade, .pulpRescue:
                if let snap = coordinator.latestSnapshot, coordinator.finale == nil {
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
                        onExitToHub: { coordinator.returnToHub() },
                        onPauseChanged: { paused in coordinator.setArcadePaused(paused) },
                        split: split,
                        onLayoutChanged: { coordinator.sceneController.resetStageInput() }
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

            // A cleaned city's finale (and the ending) plays over everything, then hands over to the score.
            if let request = coordinator.finale {
                CityFinaleView(request: request, onDone: { coordinator.finishFinale() })
                    .id(request.id)
                    .transition(.opacity)
                    .zIndex(20)
            }

            // The How to Play guide floats over the Home screen.
            if coordinator.isTutorialVisible {
                TutorialView(
                    startPage: coordinator.tutorialStartPage,
                    reduceMotion: coordinator.reducedMotion,
                    onDemoSound: { pageId in coordinator.playTutorialDemoSound(pageId) },
                    onPageTurn: { NativeSoundEngine.shared.playUiTap() },
                    onClose: { coordinator.closeTutorial() },
                    cardRect: split?.firstRect
                )
                .transition(.opacity)
                .zIndex(10)
            }
        }
    }

    @ViewBuilder
    private func sheetContent(_ sheet: HubSheetKind) -> some View {
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
                case .restoreCode:
                    SyncRestoreSheet(onImportCode: { code in coordinator.restoreFromPrologue(code) })
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
                        includeRinse: coordinator.includeRinse,
                        brushWeek: coordinator.brushWeek,
                        remindersOn: coordinator.remindersOn,
                        reminderMorning: coordinator.reminderMorning,
                        reminderEvening: coordinator.reminderEvening,
                        healthAvailable: HealthBrushLog.isAvailable,
                        healthLogOn: coordinator.healthLogOn,
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
                        onChangeIncludeRinse: { on in coordinator.setIncludeRinse(on) },
                        onSetReminders: { on, done in coordinator.setReminders(on, done: done) },
                        onSetReminderTimes: { morning, evening in coordinator.setReminderTimes(morning: morning, evening: evening) },
                        onSetHealthLog: { on, done in coordinator.setHealthLog(on, done: done) },
                        onToggleProMotionTelemetry: { show in coordinator.showProMotionBadge = show },
                        onReplayCosmicIntro: { coordinator.replayCosmicIntro() }
                    )
                }
    }
}

/// Puts a full-screen overlay on its page: the Duo's first page, or left of the brush overview.
private struct PagePlacement: ViewModifier {
    let rect: CGRect?
    let trailingInset: CGFloat

    func body(content: Content) -> some View {
        if let rect {
            content.placed(in: rect)
        } else {
            content.padding(.trailing, trailingInset)
        }
    }
}

extension View {
    /// Places this view in `rect` of the root view's space (one half of a two-page layout on the
    /// Duo); touches follow it.
    func placed(in rect: CGRect) -> some View {
        frame(width: rect.width, height: rect.height)
            .position(x: rect.midX, y: rect.midY)
    }

    /// `placed(in:)` on the Duo, unchanged elsewhere.
    @ViewBuilder
    func placed(inOptional rect: CGRect?) -> some View {
        if let rect {
            placed(in: rect)
        } else {
            self
        }
    }
}
