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
    public var selectedWorldId: String = "world_1" {
        didSet {
            if let host = HostsAndHistory.host(forWorldId: selectedWorldId) {
                sceneController.cosmicNodes.focusOnCity(host.id)
            }
            NativeSoundEngine.shared.setWorldContext(selectedWorldId)
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
    public var pacerElapsedSec: Double = 0.0
    public var pacerIsPaused: Bool = false
    public var pacerInFlossBonus: Bool = false
    private var pacerTimer: Timer?
    private var lastPacerTickUptime: TimeInterval?
    private var lastAnnouncedQuadrant: Int = -1
    private var lastAnnouncedSurface: Int = -1

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

        self.mode = self.save.hasSeenCosmicIntro ? .hub : .cosmicIntro
        self.selectedWorldId = pickRecommendedDiveWorld(from: self.save)

        setupSceneAndAudioBridges()
        applyLaunchArgumentsIfPresent()
        syncSceneMode()
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
            self.latestSnapshot = snap
            NativeSoundEngine.shared.updateScrub(
                active: snap.scrubActive,
                probeSpeed: snap.probeSpeed,
                newlyCleaned: snap.scrubActive ? 1 : 0,
                cleanRatio: snap.worldCleanRatio,
                brushUpgradeId: self.save.equippedUpgrades.brush
            )
            if snap.scrubActive {
                HapticsEngine.shared.playSonicScrubTick(
                    cleanRatio: snap.worldCleanRatio,
                    speedNormalized: Float(min(1.0, snap.probeSpeed / GameConfig.probeMoveSpeed))
                )
            }
        }

        sceneController.onCompanionCrownRubbed = { [weak self] crownIdx, feedback in
            guard let self else { return }
            if let crownIdx {
                self.tappedCrownSummary = DentalChart.companionCrownSummary(forToothIndex: crownIdx)
                NativeSoundEngine.shared.playCrownRub(
                    crownIndex: crownIdx,
                    smoothnessIndex: self.save.companion.smoothnessIndex
                )
            }
            if feedback.sound == .glass {
                NativeSoundEngine.shared.playGlassHarpNote(step: feedback.noteStep)
            } else if feedback.sound == .thud {
                NativeSoundEngine.shared.playSquishThud()
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
        activeCartridge = cart

        let currentSave = saveSystem.getSave()
        let session = WorldSession(
            cartridge: cart,
            save: currentSave,
            mode: .arcade,
            events: eventBus
        )
        self.activeSession = session
        self.latestSnapshot = session.makeSnapshot()
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
        self.latestSnapshot = session.makeSnapshot()
        sceneController.mountStage(for: session)
        NativeSoundEngine.shared.playOrbitalDive()
        transition(to: .pulpRescue)
        showArcadeToast("🚨 90s Pulp Rescue Scramble • Clean 85%+ (Zero Permadeath)!")
    }

    public func returnToHub() {
        stopPacerTimer()
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
        pacerInFlossBonus = false
        lastAnnouncedQuadrant = 0
        lastAnnouncedSurface = 0
        sceneController.pacerElapsedSec = 0
        sceneController.pacerInFlossBonus = false
        transition(to: .brushAlong)
        NativeSoundEngine.shared.setPacerState(quadrantIdx: 0, inFlossBonus: false)
        NativeSoundEngine.shared.playPacerCue(.quadrant)
        HapticsEngine.shared.playPacerQuadrantCue()
        startPacerTimer()
    }

    public func togglePacerPause() {
        pacerIsPaused.toggle()
        lastPacerTickUptime = ProcessInfo.processInfo.systemUptime
        updateIdleTimerPolicy()
        eventBus.emit(.pacerPaused(paused: pacerIsPaused))
    }

    public func enterFlossBonusNow() {
        pacerInFlossBonus = true
        pacerElapsedSec = max(pacerElapsedSec, GameConfig.brushAlongTotalSec)
        sceneController.pacerElapsedSec = pacerElapsedSec
        sceneController.pacerInFlossBonus = true
        NativeSoundEngine.shared.setPacerState(quadrantIdx: 3, inFlossBonus: true)
        NativeSoundEngine.shared.playPacerCue(.quadrant)
        HapticsEngine.shared.playPacerQuadrantCue()
    }

    public func completeBrushAlongSession(withFlossBonus: Bool) {
        stopPacerTimer()
        let outcome = saveSystem.recordBrushAlongCompletion(withFlossBonus: withFlossBonus)
        save = saveSystem.getSave()
        sceneController.touchSystem.clearAll()
        sceneController.companionSmoothness = save.companion.smoothnessIndex
        NativeSoundEngine.shared.playPacerCue(.complete)
        HapticsEngine.shared.playDistrictSeal()
        transition(to: .hub)
        showHubToast("🦷 Fresh Mint Smooth Bask! +\(outcome.ionsAwarded) F⁻\(outcome.stampAwarded ? " & +1 Habit Stamp!" : "")")
    }

    private func startPacerTimer() {
        stopPacerTimer()
        lastPacerTickUptime = ProcessInfo.processInfo.systemUptime
        pacerTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.tickPacer()
            }
        }
    }

    private func stopPacerTimer() {
        pacerTimer?.invalidate()
        pacerTimer = nil
        lastPacerTickUptime = nil
    }

    private func tickPacer() {
        guard mode == .brushAlong, !pacerIsPaused else { return }
        let now = ProcessInfo.processInfo.systemUptime
        let dt = min(0.5, max(0.0, now - (lastPacerTickUptime ?? now)))
        lastPacerTickUptime = now

        let cap = pacerInFlossBonus
            ? (GameConfig.brushAlongTotalSec + GameConfig.brushAlongFlossBonusSec)
            : GameConfig.brushAlongTotalSec
        pacerElapsedSec = min(cap, pacerElapsedSec + dt)
        sceneController.pacerElapsedSec = pacerElapsedSec
        sceneController.pacerInFlossBonus = pacerInFlossBonus

        if !pacerInFlossBonus {
            let qIdx = min(3, Int(pacerElapsedSec / 30.0))
            let sIdx = min(2, Int((pacerElapsedSec - Double(qIdx) * 30.0) / 10.0))
            if qIdx != lastAnnouncedQuadrant && pacerElapsedSec < GameConfig.brushAlongTotalSec - 0.2 {
                lastAnnouncedQuadrant = qIdx
                lastAnnouncedSurface = sIdx
                NativeSoundEngine.shared.setPacerState(quadrantIdx: qIdx, inFlossBonus: false)
                NativeSoundEngine.shared.playPacerCue(.quadrant)
                HapticsEngine.shared.playPacerQuadrantCue()
            } else if sIdx != lastAnnouncedSurface && pacerElapsedSec < GameConfig.brushAlongTotalSec - 0.2 {
                lastAnnouncedSurface = sIdx
                NativeSoundEngine.shared.playPacerCue(.surface)
                HapticsEngine.shared.playPacerSurfaceTick()
            }
        } else if pacerElapsedSec >= cap - 0.05 {
            completeBrushAlongSession(withFlossBonus: true)
        }
    }

    // MARK: - App Lifecycle & Wake-Lock

    public func handleScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .active:
            updateIdleTimerPolicy()
            NativeSoundEngine.shared.startEngineIfNeeded()
        case .inactive, .background:
            if mode == .brushAlong && !pacerIsPaused {
                pacerIsPaused = true
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
