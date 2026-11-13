import Foundation
import MouthLifeCore
import Observation
import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

@Observable
@MainActor
public final class AppCoordinator {
    public let eventBus = EventBus()
    public let saveSystem: SaveSystem
    public let sceneController = MouthLifeSceneController()

    // Observable UI State
    public var mode: AppMode = .hub
    public var save: MouthLifeSaveV2
    public var earthRadioEnabled: Bool = NativeSoundEngine.shared.isEarthRadioEnabled
    public var hubRadioStation: RadioStation = NativeSoundEngine.shared.isEarthRadioEnabled ? .city("world_1") : .sanctuary
    public var brushRadioStation: RadioStation = .livingClock
    public var activeRadioWorldId: String = "world_1"
    public var selectedWorldId: String = "world_1" {
        didSet {
            if let host = HostsAndHistory.host(forWorldId: selectedWorldId) {
                sceneController.cosmicNodes.focusOnCity(host.id)
            }
            NativeSoundEngine.shared.setWorldContext(selectedWorldId)
            if isWorldUnlocked(selectedWorldId) {
                activeRadioWorldId = selectedWorldId
                if earthRadioEnabled {
                    hubRadioStation = .city(selectedWorldId)
                    NativeSoundEngine.shared.setHubRadioStation(.city(selectedWorldId))
                }
            }
        }
    }
    public var cosmicBeatIndex: Int = 0 {
        didSet {
            sceneController.cosmicBeatIndex = cosmicBeatIndex
            NativeSoundEngine.shared.setCosmicBeat(cosmicBeatIndex)
            NativeSoundEngine.shared.playCosmicBeatChime(cosmicBeatIndex)
        }
    }

    // Active Arcade / Pulp Rescue State
    public private(set) var activeSession: WorldSession?
    public var latestSnapshot: SessionSnapshot?
    public var activeCartridge: WorldCartridge = WorldRegistry.world1
    public var lastReportMode: ActivePlayMode = .arcade
    public var lastReportWon: Bool = true
    public var lastBreakdown: ScoreBreakdown?
    public var lastUnlockedNoteId: String?
    public var lastUnlockedUpgradeIds: [String] = []

    // Active 2-Minute Sink Brush-Along Pacer State
    private static let flossToolDefaultsKey = "mouthlife.pacer.flossToolStyle"
    private static let mouthwashDurationDefaultsKey = "mouthlife.pacer.mouthwashDurationStyle"
    public var pacerElapsedSec: Double = 0.0
    public var pacerIsPaused: Bool = false
    public var pacerInFlossBonus: Bool = false
    public var pacerStage: PacerStage = .brushing
    public var pacerCompletedFlossStage: Bool = false
    public var flossToolStyle: FlossToolStyle = .flossPick
    public var mouthwashDurationStyle: MouthwashDurationStyle = .totalCare60s
    public var mouthwashGyro: GyroSloshSnapshot = .idle
    public var voiceCoachEnabled: Bool = NativeSoundEngine.shared.isVoiceCoachEnabled
    public var coachLanguage: CoachLanguage = NativeSoundEngine.shared.coachLanguage
    private var pacerPausedByUser: Bool = false
    private var pacerSuspendedBySystem: Bool = false
    private var announcedFlossLowerHalf: Bool = false
    private var lastAnnouncedMouthwashStep: Int = 0
    private var pacerTimer: Timer?
    private var lastPacerTickUptime: TimeInterval?
    private var lastAnnouncedQuadrant: Int = -1
    private var lastAnnouncedSurface: Int = -1
    private var lastCountdownPipKey: String = ""

    // Companion & Sheet UI State
    public var activeSheet: HubSheetKind?
    public var tappedCrownSummary: CompanionCrownSummary?
    public var hubToast: String?
    public var arcadeToast: String?
    public var liveFps: Int = 120
    public var showProMotionBadge: Bool = true
    public var reducedMotion: Bool = false {
        didSet {
            sceneController.reducedMotion = reducedMotion
            eventBus.emit(.motionChanged(reduced: reducedMotion))
        }
    }

    private var toastClearTask: Task<Void, Never>?
    private var unsubscribeToken: (() -> Void)?
    private var lastHudPublishUptime: TimeInterval = 0
    private var lastSessionCleanRatio: Double = 0

    private func shouldPublishHudSnapshot(_ next: SessionSnapshot, now: TimeInterval) -> Bool {
        guard let prev = latestSnapshot else { return true }
        if now - lastHudPublishUptime >= 0.05 { return true } // 20Hz HUD cadence
        if prev.isCompleted != next.isCompleted { return true }
        if prev.scrubActive != next.scrubActive { return true }
        if prev.sealedDistricts != next.sealedDistricts { return true }
        if (prev.flossCooldown > 0) != (next.flossCooldown > 0) { return true }
        if (prev.discloseCooldown > 0) != (next.discloseCooldown > 0) { return true }
        if (prev.surgeMeter >= GameConfig.surgeMax) != (next.surgeMeter >= GameConfig.surgeMax) { return true }
        if (prev.probeZip != nil) != (next.probeZip != nil) { return true }
        return false
    }

    public init() {
        let storage = UserDefaultsSaveStorage()
        let sys = SaveSystem(bus: eventBus, storage: storage)
        let loaded = sys.load()
        self.saveSystem = sys
        self.save = loaded

        // Reconcile offline Smooth Bask / Saliva Stasis on app launch
        var updatedSave = loaded
        _ = CompanionArchSim.reconcileOfflineElapsed(&updatedSave.companion, nowEpochMs: CompanionArchSim.currentEpochMs())
        self.save = sys.save(updatedSave)

        // Always greet cold launches on the Cosmic Intro arrival (returning players get 1-tap Enter Arch)
        self.mode = .cosmicIntro
        let initialWorld = pickRecommendedDiveWorld(from: self.save)
        self.selectedWorldId = initialWorld
        self.activeRadioWorldId = initialWorld
        self.earthRadioEnabled = NativeSoundEngine.shared.isEarthRadioEnabled
        self.hubRadioStation = self.earthRadioEnabled ? .city(initialWorld) : .sanctuary
        let persistedFlossStyle = UserDefaults.standard.string(forKey: Self.flossToolDefaultsKey)
            .flatMap(FlossToolStyle.init(rawValue:)) ?? .flossPick
        self.flossToolStyle = persistedFlossStyle
        self.sceneController.pacerFlossToolStyle = persistedFlossStyle
        let persistedMouthwashStyle = UserDefaults.standard.string(forKey: Self.mouthwashDurationDefaultsKey)
            .flatMap(MouthwashDurationStyle.init(rawValue:)) ?? .totalCare60s
        self.mouthwashDurationStyle = persistedMouthwashStyle
        self.sceneController.pacerMouthwashDurationSec = persistedMouthwashStyle.durationSec
        self.voiceCoachEnabled = NativeSoundEngine.shared.isVoiceCoachEnabled
        self.coachLanguage = NativeSoundEngine.shared.coachLanguage

        setupSceneAndAudioBridges()
        NativeSoundEngine.shared.setHubRadioStation(self.hubRadioStation)
        applyLaunchArgumentsIfPresent()
        syncSceneMode()
    }

    public func isWorldUnlocked(_ worldId: String) -> Bool {
        if worldId == "world_1" { return true }
        if save.worlds[worldId]?.unlocked == true { return true }
        guard let host = HostsAndHistory.host(forWorldId: worldId) else { return false }
        return save.totalBrushStamps >= host.unlockStampsRequired
    }

    private func labelForStation(_ station: RadioStation) -> String {
        switch station {
        case .livingClock:
            return "Living Clock"
        case .sanctuary:
            return "Sanctuary"
        case .planetOfEnamel:
            return "Planet of Enamel"
        case let .city(wid):
            switch wid {
            case "world_1": return "Toronto FM"
            case "world_2": return "New Orleans FM"
            case "world_3": return "Tokyo FM"
            case "world_4": return "Accra FM"
            case "world_5": return "Aurora FM"
            default:
                let city = HostsAndHistory.host(forWorldId: wid)?.city ?? "Toronto"
                return "\(city) FM"
            }
        }
    }

    public var currentRadioStationLabel: String {
        labelForStation(mode == .brushAlong ? brushRadioStation : hubRadioStation)
    }

    public func selectHubCity(_ worldId: String) {
        let unlocked = isWorldUnlocked(worldId)
        let wasAlreadyBroadcasting = hubRadioStation == .city(worldId)
        selectedWorldId = worldId
        NativeSoundEngine.shared.playUiTap()

        if unlocked {
            earthRadioEnabled = true
            activeRadioWorldId = worldId
            hubRadioStation = .city(worldId)
            NativeSoundEngine.shared.setHubRadioStation(.city(worldId))
            if !wasAlreadyBroadcasting, let host = HostsAndHistory.host(forWorldId: worldId) {
                showHubToast("📻 Earth Radio • \(host.city)")
            }
        }
    }

    public func selectSanctuaryRadio() {
        guard hubRadioStation != .sanctuary else {
            NativeSoundEngine.shared.playUiTap()
            return
        }
        earthRadioEnabled = false
        hubRadioStation = .sanctuary
        NativeSoundEngine.shared.setHubRadioStation(.sanctuary)
        NativeSoundEngine.shared.playUiTap()
        showHubToast("🌙 The Sanctuary Active")
    }

    public func selectPlanetRadio() {
        guard hubRadioStation != .planetOfEnamel else {
            NativeSoundEngine.shared.playUiTap()
            return
        }
        earthRadioEnabled = false
        hubRadioStation = .planetOfEnamel
        NativeSoundEngine.shared.setHubRadioStation(.planetOfEnamel)
        NativeSoundEngine.shared.playUiTap()
        showHubToast("🪐 Planet of Enamel Active")
    }

    public func cycleRadioStation() {
        let unlockedCityStations = HostsAndHistory.hostCities
            .map(\.worldId)
            .filter { isWorldUnlocked($0) }
            .map { RadioStation.city($0) }
        let stations: [RadioStation] = [.livingClock] + unlockedCityStations + [.sanctuary, .planetOfEnamel]
        let curIdx = stations.firstIndex(of: brushRadioStation) ?? 0
        let nextStation = stations[(curIdx + 1) % stations.count]

        NativeSoundEngine.shared.playUiTap()
        brushRadioStation = nextStation
        NativeSoundEngine.shared.setBrushRadioStation(nextStation)
        if case let .city(wid) = nextStation {
            selectedWorldId = wid
        }
    }

    private func pickRecommendedDiveWorld(from save: MouthLifeSaveV2) -> String {
        for worldId in WorldRegistry.campaignWorldIds {
            let rec = save.worlds[worldId]
            let host = HostsAndHistory.host(forWorldId: worldId)
            let unlocked = worldId == "world_1" || rec?.unlocked == true || save.totalBrushStamps >= (host?.unlockStampsRequired ?? 999)
            if unlocked && rec?.completed != true {
                return worldId
            }
        }
        return "world_1"
    }

    private func setupSceneAndAudioBridges() {
        HapticsEngine.shared.prepare()
        NativeSoundEngine.shared.startEngineIfNeeded()

        // Apply saved GPU quality preference
        let initialTier = save.qualityPreference.explicitTier ?? .ultra
        sceneController.qualityTier = initialTier
        sceneController.companionSmoothness = save.companion.smoothnessIndex

        sceneController.onFpsUpdated = { [weak self] fps in
            guard let self else { return }
            self.liveFps = fps
        }

        sceneController.onSessionStepped = { [weak self] snap in
            guard let self else { return }
            let now = ProcessInfo.processInfo.systemUptime
            if self.shouldPublishHudSnapshot(snap, now: now) {
                self.lastHudPublishUptime = now
                self.latestSnapshot = snap
            }
            let deltaClean = max(0.0, snap.worldCleanRatio - self.lastSessionCleanRatio)
            self.lastSessionCleanRatio = snap.worldCleanRatio
            let newlyCleanedCells = snap.scrubActive ? Int((deltaClean * 1400.0).rounded()) : 0
            NativeSoundEngine.shared.updateScrub(
                active: snap.scrubActive,
                probeSpeed: snap.probeSpeed,
                newlyCleaned: newlyCleanedCells,
                cleanRatio: snap.worldCleanRatio,
                brushUpgradeId: self.save.equippedUpgrades.brush
            )
            if snap.scrubActive && snap.probeSpeed > 0.25 {
                HapticsEngine.shared.playSonicScrubTick(
                    cleanRatio: snap.worldCleanRatio,
                    speedNormalized: Float(min(1.0, snap.probeSpeed / GameConfig.probeMoveSpeed))
                )
            }
        }

        sceneController.onCompanionCrownRubbed = { [weak self] crownIdx, feedback in
            guard let self else { return }
            let changedCrown = (crownIdx != nil && self.tappedCrownSummary?.toothIndex != crownIdx)
            if let crownIdx, changedCrown {
                self.tappedCrownSummary = DentalChart.companionCrownSummary(forToothIndex: crownIdx)
            }
            if feedback.sound == .glass {
                NativeSoundEngine.shared.playGlassHarpNote(step: feedback.noteStep)
            } else if feedback.sound == .thud {
                NativeSoundEngine.shared.playSquishThud()
            } else if let crownIdx, changedCrown {
                NativeSoundEngine.shared.playCrownRub(
                    crownIndex: crownIdx,
                    smoothnessIndex: self.save.companion.smoothnessIndex
                )
            }
            HapticsEngine.shared.playEnamelRub(
                smoothnessIndex: self.save.companion.smoothnessIndex,
                intensity: feedback.onSplat ? 1.0 : 0.72
            )
            if feedback.splatsCleared > 0 {
                var next = self.saveSystem.getSave()
                CompanionArchSim.applyMiniPolish(&next.companion, splatsCleared: feedback.splatsCleared)
                self.save = self.saveSystem.save(next)
                self.sceneController.companionSmoothness = self.save.companion.smoothnessIndex
                self.showHubToast("✨ Polished sugar plaque! Smoothness \(Int(self.save.companion.smoothnessIndex.rounded()))%")
            }
        }

        sceneController.onCosmicMohsSelected = { idx in
            NativeSoundEngine.shared.playCrownRub(crownIndex: idx * 3, smoothnessIndex: 96.0)
            HapticsEngine.shared.playEnamelRub(smoothnessIndex: 96.0, intensity: 0.75)
        }

        sceneController.onMouthwashGyroUpdated = { [weak self] gyro in
            guard let self else { return }
            guard self.mode == .brushAlong, self.pacerStage == .mouthwashBonus, !self.pacerIsPaused else { return }
            self.mouthwashGyro = gyro
            if gyro.didTriggerSplash {
                NativeSoundEngine.shared.playMouthwashTiltSwish(
                    pan: gyro.splashPan,
                    intensity: gyro.splashIntensity01
                )
                HapticsEngine.shared.playMouthwashTiltSplash(intensity: gyro.splashIntensity01)
            }
        }

        unsubscribeToken = eventBus.subscribe { [weak self] event in
            Task { @MainActor [weak self] in
                self?.handleGameEvent(event)
            }
        }
    }

    private func applyLaunchArgumentsIfPresent() {
        let args = ProcessInfo.processInfo.arguments
        for arg in args {
            if arg.hasPrefix("--world=") {
                let wid = String(arg.dropFirst("--world=".count))
                if WorldRegistry.isPlayableWorld(wid) {
                    selectedWorldId = wid
                }
            }
        }
        for arg in args {
            if arg == "--mode=hub" {
                saveSystem.markCosmicIntroSeen()
                save = saveSystem.getSave()
                mode = .hub
            } else if arg == "--mode=cosmicIntro" {
                mode = .cosmicIntro
            } else if arg == "--mode=brushAlong" {
                saveSystem.markCosmicIntroSeen()
                save = saveSystem.getSave()
                startBrushAlong()
            } else if arg == "--mode=arcade" {
                saveSystem.markCosmicIntroSeen()
                save = saveSystem.getSave()
                launchArcadeWorld(selectedWorldId)
            } else if arg == "--mode=pulpRescue" {
                saveSystem.markCosmicIntroSeen()
                save = saveSystem.getSave()
                launchPulpRescue()
            } else if arg.hasPrefix("--beat=") {
                if let b = Int(arg.dropFirst("--beat=".count)) {
                    cosmicBeatIndex = max(0, min(3, b))
                }
            } else if arg.hasPrefix("--sheet=") {
                let s = String(arg.dropFirst("--sheet=".count))
                activeSheet = HubSheetKind(rawValue: s)
            }
        }
    }

    private func handleGameEvent(_ event: GameEvent) {
        NativeSoundEngine.shared.handleGameEvent(event)
        HapticsEngine.shared.handleGameEvent(event)

        switch event {
        case let .saveUpdated(updated):
            self.save = updated
            self.sceneController.companionSmoothness = updated.companion.smoothnessIndex

        case let .districtSealed(_, name, _):
            showArcadeToast("🏅 24k Gold Seal: \(name)!")

        case .siteRestored:
            showArcadeToast("🌿 Commensal Colony Restored (+30% Surge)!")

        case .gumTender:
            showArcadeToast("💗 Gentle along sulcus! Keep sweeping smoothly at 45°.")

        case .epsDeflected:
            showArcadeToast("🛡️ EPS Quorum Armor! Crack dome with Floss or Surge first.")

        case let .missionComplete(playMode, worldId, won, breakdown, _):
            let outcome = saveSystem.recordMissionCompletion(
                mode: playMode,
                worldId: worldId,
                won: won,
                breakdown: breakdown
            )
            self.save = saveSystem.getSave()
            self.lastReportMode = playMode
            self.lastReportWon = won
            self.lastBreakdown = breakdown
            self.lastUnlockedNoteId = outcome.unlockedHistoryNoteId
            self.lastUnlockedUpgradeIds = outcome.newlyUnlockedUpgradeIds
            transition(to: .report)

        default:
            break
        }
    }

    // MARK: - Mode Transitions

    public func completeCosmicIntro() {
        saveSystem.markCosmicIntroSeen()
        save = saveSystem.getSave()
        NativeSoundEngine.shared.playOrbitalDive()
        transition(to: .hub)
    }

    public func replayCosmicIntro() {
        cosmicBeatIndex = 0
        transition(to: .cosmicIntro)
    }

    public func launchArcadeWorld(_ worldId: String) {
        let cart = WorldRegistry.cartridgeOrDefault(forId: worldId)
        selectedWorldId = cart.id
        activeRadioWorldId = cart.id
        NativeSoundEngine.shared.setEarthRadio(enabled: earthRadioEnabled, tunedUnlockedWorldId: cart.id)
        activeCartridge = cart

        let currentSave = saveSystem.getSave()
        let session = WorldSession(
            cartridge: cart,
            save: currentSave,
            mode: .arcade,
            events: eventBus
        )
        self.activeSession = session
        let initialSnap = session.makeSnapshot()
        self.latestSnapshot = initialSnap
        self.lastSessionCleanRatio = initialSnap.worldCleanRatio
        sceneController.mountStage(for: session)
        NativeSoundEngine.shared.playOrbitalDive()
        transition(to: .arcade)
        showArcadeToast("\(cart.title) • Scrub to 90%+ & restore colonies!")
    }

    public func launchPulpRescue() {
        let cart = WorldRegistry.pulpRescue
        activeCartridge = cart
        let currentSave = saveSystem.getSave()
        let session = WorldSession(
            cartridge: cart,
            save: currentSave,
            mode: .pulpRescue,
            events: eventBus
        )
        self.activeSession = session
        let initialSnap = session.makeSnapshot()
        self.latestSnapshot = initialSnap
        self.lastSessionCleanRatio = initialSnap.worldCleanRatio
        sceneController.mountStage(for: session)
        NativeSoundEngine.shared.playOrbitalDive()
        transition(to: .pulpRescue)
        showArcadeToast("🚨 90s Pulp Rescue Scramble • Clean 85%+ (Zero Permadeath)!")
    }

    public func returnToHub() {
        stopPacerTimer()
        pacerIsPaused = false
        pacerPausedByUser = false
        pacerSuspendedBySystem = false
        NativeSoundEngine.shared.stopVoiceCoach()
        NativeSoundEngine.shared.setPaused(false)
        NativeSoundEngine.shared.stopScrub()
        transition(to: .hub)
    }

    private func transition(to next: AppMode) {
        let prev = mode
        mode = next
        syncSceneMode()
        updateIdleTimerPolicy()
        eventBus.emit(.modeChanged(from: prev, to: next))
    }

    private func syncSceneMode() {
        let cityId = HostsAndHistory.host(forWorldId: selectedWorldId)?.id ?? save.playerProfile.homeCityId
        sceneController.companionSmoothness = save.companion.smoothnessIndex
        sceneController.companionAcidStress = save.companion.pulpIntegrity < 50 ? 0.5 : 0.0
        sceneController.setMode(mode, selectedCityId: cityId)
        NativeSoundEngine.shared.setAmbientMode(mode)
        NativeSoundEngine.shared.setWorldContext(selectedWorldId)
    }

    // MARK: - Companion Actions

    public func claimIdleIons() {
        let claimed = saveSystem.claimCompanionIdleIons()
        save = saveSystem.getSave()
        if claimed > 0 {
            NativeSoundEngine.shared.playSmoothBaskSparkle()
            HapticsEngine.shared.playFluorideSurge()
            showHubToast("✨ Claimed +\(claimed) F⁻ Smooth Bask Reservoir!")
        }
    }

    public func feedRegionalTreat() {
        let host = HostsAndHistory.host(forWorldId: selectedWorldId) ?? HostsAndHistory.hostCities[0]
        let outcome = saveSystem.feedCompanionTreat()
        save = saveSystem.getSave()
        sceneController.companionSmoothness = save.companion.smoothnessIndex
        sceneController.spawnCompanionTreatSplats()
        NativeSoundEngine.shared.playTreatSnack()
        NativeSoundEngine.shared.playSugarSplat()

        if outcome.triggeredPulpRescue {
            showHubToast("\(host.signatureTreat.emoji) Acid load reached pulp! Launching Pulp Rescue...")
            launchPulpRescue()
        } else if outcome.ionsGranted > 0 {
            showHubToast("\(host.signatureTreat.emoji) Enjoyed \(host.signatureTreat.name)! +\(outcome.ionsGranted) F⁻ • Rub crowns to polish!")
        } else {
            showHubToast("\(host.signatureTreat.emoji) \(host.signatureTreat.name) (3/hr Ion cap reached) • Rub crowns to polish!")
        }
    }

    // MARK: - 2-Minute Sink Brush-Along Pacer + iPhone Wake-Lock

    public func startBrushAlong() {
        pacerElapsedSec = 0
        pacerIsPaused = false
        pacerPausedByUser = false
        pacerSuspendedBySystem = false
        pacerInFlossBonus = false
        pacerStage = .brushing
        pacerCompletedFlossStage = false
        announcedFlossLowerHalf = false
        lastAnnouncedMouthwashStep = 0
        brushRadioStation = .livingClock
        lastAnnouncedQuadrant = 0
        lastAnnouncedSurface = 0
        lastCountdownPipKey = ""
        tappedCrownSummary = nil
        sceneController.highlightedCrownIndex = nil
        sceneController.pacerElapsedSec = 0
        sceneController.pacerInFlossBonus = false
        sceneController.pacerStage = .brushing
        sceneController.pacerFlossToolStyle = flossToolStyle
        sceneController.pacerMouthwashDurationSec = mouthwashDurationStyle.durationSec
        NativeSoundEngine.shared.setPaused(false)
        transition(to: .brushAlong)
        NativeSoundEngine.shared.setPacerState(quadrantIdx: 0, inFlossBonus: false)
        NativeSoundEngine.shared.playPacerSurfaceMotif(quadrant: .upperRight, surface: .outerCheek, isNewQuadrant: true)
        NativeSoundEngine.shared.speakCoachingPhrase(
            BrushCoachCopy.spokenBrushCue(quadrant: .upperRight, surface: .outerCheek, lang: coachLanguage)
        )
        startPacerTimer()
    }

    public func toggleVoiceCoach() {
        setVoiceCoachEnabled(!voiceCoachEnabled)
    }

    public func setVoiceCoachEnabled(_ enabled: Bool) {
        voiceCoachEnabled = enabled
        NativeSoundEngine.shared.setVoiceCoachEnabled(enabled)
        NativeSoundEngine.shared.playUiTap()
        if enabled && mode == .brushAlong && !pacerIsPaused {
            speakCurrentPacerPhaseCue()
        }
    }

    public func setCoachLanguage(_ language: CoachLanguage) {
        guard coachLanguage != language else { return }
        coachLanguage = language
        NativeSoundEngine.shared.setCoachLanguage(language)
        NativeSoundEngine.shared.playUiTap()
        if mode == .brushAlong && !pacerIsPaused && voiceCoachEnabled {
            speakCurrentPacerPhaseCue()
        }
    }

    private func speakCurrentPacerPhaseCue() {
        let phase = BrushPhaseState.evaluate(
            elapsedSec: pacerElapsedSec,
            stage: pacerStage,
            mouthwashDurationSec: mouthwashDurationStyle.durationSec
        )
        switch phase.stage {
        case .mouthwashBonus:
            let cue = phase.mouthwashStepIndex == 0
                ? BrushCoachCopy.spokenMouthwashStartCue(durationSec: Int(mouthwashDurationStyle.durationSec.rounded()), lang: coachLanguage)
                : BrushCoachCopy.spokenMouthwashStepCue(stepIndex: phase.mouthwashStepIndex, lang: coachLanguage)
            NativeSoundEngine.shared.speakCoachingPhrase(cue)
        case .flossBonus:
            let cue = phase.flossIsUpper
                ? BrushCoachCopy.spokenFlossStartCue(style: flossToolStyle, lang: coachLanguage)
                : BrushCoachCopy.spokenFlossLowerCue(lang: coachLanguage)
            NativeSoundEngine.shared.speakCoachingPhrase(cue)
        case .brushing:
            let cue = BrushCoachCopy.spokenBrushCue(quadrant: phase.quadrant, surface: phase.surface, lang: coachLanguage)
            NativeSoundEngine.shared.speakCoachingPhrase(cue)
        }
    }

    public func setFlossToolStyle(_ style: FlossToolStyle) {
        guard flossToolStyle != style else { return }
        flossToolStyle = style
        sceneController.pacerFlossToolStyle = style
        UserDefaults.standard.set(style.rawValue, forKey: Self.flossToolDefaultsKey)
        NativeSoundEngine.shared.playUiTap()
    }

    public func setMouthwashDurationStyle(_ style: MouthwashDurationStyle) {
        guard mouthwashDurationStyle != style else { return }
        let mwStart = GameConfig.brushAlongTotalSec + GameConfig.brushAlongFlossBonusSec
        let oldDur = max(6.0, mouthwashDurationStyle.durationSec)
        let newDur = max(6.0, style.durationSec)
        if pacerStage == .mouthwashBonus {
            let frac = min(0.98, max(0.0, (pacerElapsedSec - mwStart) / oldDur))
            pacerElapsedSec = mwStart + frac * newDur
            sceneController.pacerElapsedSec = pacerElapsedSec
        }
        mouthwashDurationStyle = style
        sceneController.pacerMouthwashDurationSec = newDur
        UserDefaults.standard.set(style.rawValue, forKey: Self.mouthwashDurationDefaultsKey)
        NativeSoundEngine.shared.playUiTap()
    }

    public func togglePacerPause() {
        pacerIsPaused.toggle()
        pacerPausedByUser = pacerIsPaused
        pacerSuspendedBySystem = false
        lastPacerTickUptime = ProcessInfo.processInfo.systemUptime
        NativeSoundEngine.shared.setPaused(pacerIsPaused)
        updateIdleTimerPolicy()
        eventBus.emit(.pacerPaused(paused: pacerIsPaused))
    }

    public func enterFlossBonusNow() {
        pacerStage = .flossBonus
        pacerInFlossBonus = true
        pacerIsPaused = false
        pacerPausedByUser = false
        pacerSuspendedBySystem = false
        announcedFlossLowerHalf = false
        lastCountdownPipKey = ""
        pacerElapsedSec = GameConfig.brushAlongTotalSec
        sceneController.pacerElapsedSec = pacerElapsedSec
        sceneController.pacerInFlossBonus = true
        sceneController.pacerStage = .flossBonus
        sceneController.pacerFlossToolStyle = flossToolStyle
        lastPacerTickUptime = ProcessInfo.processInfo.systemUptime
        NativeSoundEngine.shared.setPaused(false)
        NativeSoundEngine.shared.setPacerState(quadrantIdx: 3, inFlossBonus: true)
        NativeSoundEngine.shared.playPacerSurfaceMotif(quadrant: .upperRight, surface: .outerCheek, isNewQuadrant: true)
        NativeSoundEngine.shared.speakCoachingPhrase(
            BrushCoachCopy.spokenFlossStartCue(style: flossToolStyle, lang: coachLanguage)
        )
        updateIdleTimerPolicy()
    }

    public func enterMouthwashBonusNow(completedFloss: Bool = true) {
        pacerCompletedFlossStage = completedFloss
        pacerStage = .mouthwashBonus
        pacerInFlossBonus = false
        pacerIsPaused = false
        pacerPausedByUser = false
        pacerSuspendedBySystem = false
        lastAnnouncedMouthwashStep = 0
        lastCountdownPipKey = ""
        mouthwashGyro = .idle
        sceneController.resetMouthwashGyroSession()
        pacerElapsedSec = GameConfig.brushAlongTotalSec + GameConfig.brushAlongFlossBonusSec
        sceneController.pacerElapsedSec = pacerElapsedSec
        sceneController.pacerInFlossBonus = false
        sceneController.pacerStage = .mouthwashBonus
        sceneController.pacerMouthwashDurationSec = mouthwashDurationStyle.durationSec
        lastPacerTickUptime = ProcessInfo.processInfo.systemUptime
        NativeSoundEngine.shared.setPaused(false)
        NativeSoundEngine.shared.setPacerState(quadrantIdx: 3, inFlossBonus: true)
        NativeSoundEngine.shared.playMouthwashSwishMotif(stepIndex: 0)
        NativeSoundEngine.shared.speakCoachingPhrase(
            BrushCoachCopy.spokenMouthwashStartCue(
                durationSec: Int(mouthwashDurationStyle.durationSec.rounded()),
                lang: coachLanguage
            )
        )
        updateIdleTimerPolicy()
    }

    public func completeBrushAlongSession(withFlossBonus: Bool, withMouthwashBonus: Bool = false) {
        stopPacerTimer()
        pacerIsPaused = false
        pacerPausedByUser = false
        pacerSuspendedBySystem = false
        NativeSoundEngine.shared.setPaused(false)
        let outcome = saveSystem.recordBrushAlongCompletion(
            withFlossBonus: withFlossBonus,
            withMouthwashBonus: withMouthwashBonus
        )
        save = saveSystem.getSave()
        sceneController.touchSystem.clearAll()
        sceneController.companionSmoothness = save.companion.smoothnessIndex
        NativeSoundEngine.shared.playPacerCue(.complete)
        HapticsEngine.shared.playDistrictSeal()
        transition(to: .hub)
        NativeSoundEngine.shared.speakCoachingPhrase(
            BrushCoachCopy.spokenSessionCompleteCue(
                includedMouthwash: withMouthwashBonus,
                lang: coachLanguage
            )
        )
        if withMouthwashBonus {
            showHubToast("💜 Fluoride Rinse Seal! +\(outcome.ionsAwarded) F⁻ • Spit out, no water for 30 min!")
        } else {
            showHubToast("🦷 Fresh Mint Smooth Bask! +\(outcome.ionsAwarded) F⁻\(outcome.stampAwarded ? " & +1 Habit Stamp!" : "")")
        }
    }

    private func startPacerTimer() {
        stopPacerTimer()
        lastPacerTickUptime = ProcessInfo.processInfo.systemUptime
        let timer = Timer(timeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.tickPacer()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        pacerTimer = timer
    }

    private func stopPacerTimer() {
        pacerTimer?.invalidate()
        pacerTimer = nil
        lastPacerTickUptime = nil
    }

    private func tickPacer() {
        guard mode == .brushAlong, !pacerIsPaused else { return }
        ensureIdleTimerDisabledIfNeeded()
        let now = ProcessInfo.processInfo.systemUptime
        let dt = min(0.5, max(0.0, now - (lastPacerTickUptime ?? now)))
        lastPacerTickUptime = now

        let flossEnd = GameConfig.brushAlongTotalSec + GameConfig.brushAlongFlossBonusSec
        let mwDur = mouthwashDurationStyle.durationSec
        let cap: Double
        switch pacerStage {
        case .brushing:
            cap = GameConfig.brushAlongTotalSec
        case .flossBonus:
            cap = flossEnd
        case .mouthwashBonus:
            cap = flossEnd + mwDur
        }
        pacerElapsedSec = min(cap, pacerElapsedSec + dt)
        sceneController.pacerElapsedSec = pacerElapsedSec
        sceneController.pacerInFlossBonus = pacerInFlossBonus
        sceneController.pacerStage = pacerStage
        sceneController.pacerMouthwashDurationSec = mwDur

        let phase = BrushPhaseState.evaluate(
            elapsedSec: pacerElapsedSec,
            stage: pacerStage,
            mouthwashDurationSec: mwDur
        )

        // Musical 3-second anticipation pickup ("3... 2... 1...") so users watching the mirror prepare to switch
        if let pip = phase.countdownPip {
            let pipKey = "\(phase.stage.rawValue)-\(phase.phaseIndex12)-\(pip)"
            if pipKey != lastCountdownPipKey {
                lastCountdownPipKey = pipKey
                let isUpper = phase.inMouthwashBonus ? true : (phase.inFlossBonus ? phase.flossIsUpper : phase.quadrant.isUpper)
                NativeSoundEngine.shared.playPacerAnticipationPip(secondsLeft: pip, isUpper: isUpper)
            }
        }

        switch pacerStage {
        case .brushing:
            if pacerElapsedSec >= GameConfig.brushAlongTotalSec - 0.04 {
                // Seamlessly chime & roll hands-free into Stage 2: 45s Floss Pick Bonus Round!
                enterFlossBonusNow()
                return
            }
            let qIdx = phase.quadrant.rawValue
            let sIdx = phase.surface.rawValue
            if qIdx != lastAnnouncedQuadrant && pacerElapsedSec < GameConfig.brushAlongTotalSec - 0.2 {
                lastAnnouncedQuadrant = qIdx
                lastAnnouncedSurface = sIdx
                NativeSoundEngine.shared.setPacerState(quadrantIdx: qIdx, inFlossBonus: false)
                NativeSoundEngine.shared.playPacerSurfaceMotif(quadrant: phase.quadrant, surface: phase.surface, isNewQuadrant: true)
                NativeSoundEngine.shared.speakCoachingPhrase(
                    BrushCoachCopy.spokenBrushCue(quadrant: phase.quadrant, surface: phase.surface, lang: coachLanguage)
                )
            } else if sIdx != lastAnnouncedSurface && pacerElapsedSec < GameConfig.brushAlongTotalSec - 0.2 {
                lastAnnouncedSurface = sIdx
                NativeSoundEngine.shared.playPacerSurfaceMotif(quadrant: phase.quadrant, surface: phase.surface, isNewQuadrant: false)
                NativeSoundEngine.shared.speakCoachingPhrase(
                    BrushCoachCopy.spokenBrushCue(quadrant: phase.quadrant, surface: phase.surface, lang: coachLanguage)
                )
            }

        case .flossBonus:
            let flossElapsed = pacerElapsedSec - GameConfig.brushAlongTotalSec
            if !announcedFlossLowerHalf && flossElapsed >= GameConfig.brushAlongFlossBonusSec * 0.5 {
                announcedFlossLowerHalf = true
                NativeSoundEngine.shared.playPacerSurfaceMotif(quadrant: .lowerRight, surface: .outerCheek, isNewQuadrant: true)
                NativeSoundEngine.shared.speakCoachingPhrase(
                    BrushCoachCopy.spokenFlossLowerCue(lang: coachLanguage)
                )
            }
            if pacerElapsedSec >= flossEnd - 0.05 {
                // Seamlessly chime & roll hands-free into Stage 3: 60s Purple Total Care Fluoride Rinse Bonus!
                enterMouthwashBonusNow(completedFloss: true)
            }

        case .mouthwashBonus:
            if phase.mouthwashStepIndex != lastAnnouncedMouthwashStep && phase.mouthwashStepIndex > 0 && pacerElapsedSec < cap - 0.25 {
                lastAnnouncedMouthwashStep = phase.mouthwashStepIndex
                NativeSoundEngine.shared.playMouthwashSwishMotif(stepIndex: phase.mouthwashStepIndex)
                NativeSoundEngine.shared.speakCoachingPhrase(
                    BrushCoachCopy.spokenMouthwashStepCue(stepIndex: phase.mouthwashStepIndex, lang: coachLanguage)
                )
            }
            if pacerElapsedSec >= cap - 0.05 {
                completeBrushAlongSession(withFlossBonus: pacerCompletedFlossStage, withMouthwashBonus: true)
            }
        }
    }

    // MARK: - App Lifecycle & Wake-Lock

    public func handleScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .active:
            NativeSoundEngine.shared.resumeFromForeground()
            if mode == .brushAlong {
                if pacerSuspendedBySystem && !pacerPausedByUser {
                    pacerSuspendedBySystem = false
                    pacerIsPaused = false
                    NativeSoundEngine.shared.setPaused(false)
                    eventBus.emit(.pacerPaused(paused: false))
                }
                lastPacerTickUptime = ProcessInfo.processInfo.systemUptime
                if !pacerIsPaused && pacerTimer == nil {
                    startPacerTimer()
                }
            }
            updateIdleTimerPolicy()

        case .inactive:
            // Do NOT pause Brush-Along or drop wake-lock on momentary notification banners / Control Center peeks!
            break

        case .background:
            if mode == .brushAlong && !pacerIsPaused {
                pacerIsPaused = true
                pacerSuspendedBySystem = true
                NativeSoundEngine.shared.setPaused(true)
                eventBus.emit(.pacerPaused(paused: true))
            }
            _ = saveSystem.save()
            setIdleTimerDisabled(false)

        @unknown default:
            break
        }
    }

    private func updateIdleTimerPolicy() {
        let keepAwake = (mode == .brushAlong && !pacerIsPaused)
        setIdleTimerDisabled(keepAwake)
    }

    private func ensureIdleTimerDisabledIfNeeded() {
        #if os(iOS)
        if mode == .brushAlong && !pacerIsPaused && !UIApplication.shared.isIdleTimerDisabled {
            UIApplication.shared.isIdleTimerDisabled = true
        }
        #endif
    }

    private func setIdleTimerDisabled(_ disabled: Bool) {
        #if os(iOS)
        UIApplication.shared.isIdleTimerDisabled = disabled
        #endif
    }

    // MARK: - Upgrades, Profile & Sync Helpers

    public func purchaseUpgrade(_ id: String) {
        if saveSystem.purchaseUpgradeWithIons(id) {
            save = saveSystem.getSave()
            NativeSoundEngine.shared.playSmoothBaskSparkle()
            HapticsEngine.shared.playDistrictSeal()
        }
    }

    public func setEquipped(slot: ActuatorKind, upgradeId: String?) {
        _ = saveSystem.setEquippedUpgrade(upgradeId, for: slot)
        save = saveSystem.getSave()
        NativeSoundEngine.shared.playUiTap()
    }

    public func updateProfile(name: String, skinTone: Int, homeCity: String) {
        _ = saveSystem.updateProfile(displayName: name, skinToneIndex: skinTone, homeCityId: homeCity)
        save = saveSystem.getSave()
    }

    public func updateQuality(_ pref: QualityPreference) {
        saveSystem.setQualityPreference(pref)
        save = saveSystem.getSave()
        sceneController.qualityTier = pref.explicitTier ?? .ultra
    }

    public func updateAudio(muted: Bool, music: Float, sfx: Float) {
        NativeSoundEngine.shared.setMuted(muted)
        NativeSoundEngine.shared.setMusicVolume(music)
        NativeSoundEngine.shared.setSfxVolume(sfx)
    }

    public func importSyncCode(_ code: String) -> Result<Void, Error> {
        do {
            let decoded = try SaveSystem.decodeSaveFromSyncCode(code)
            save = saveSystem.save(decoded)
            sceneController.companionSmoothness = save.companion.smoothnessIndex
            if !isWorldUnlocked(activeRadioWorldId) {
                activeRadioWorldId = pickRecommendedDiveWorld(from: save)
                NativeSoundEngine.shared.setEarthRadio(
                    enabled: earthRadioEnabled,
                    tunedUnlockedWorldId: activeRadioWorldId
                )
            }
            NativeSoundEngine.shared.playSmoothBaskSparkle()
            return .success(())
        } catch {
            return .failure(error)
        }
    }

    private func showHubToast(_ text: String) {
        hubToast = text
        toastClearTask?.cancel()
        toastClearTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_200_000_000)
            if !Task.isCancelled { self.hubToast = nil }
        }
    }

    private func showArcadeToast(_ text: String) {
        arcadeToast = text
        toastClearTask?.cancel()
        toastClearTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_800_000_000)
            if !Task.isCancelled { self.arcadeToast = nil }
        }
    }
}
