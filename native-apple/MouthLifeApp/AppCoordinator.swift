import Foundation
import MouthLifeCore
import Observation
import SwiftUI

#if canImport(UIKit)
import UIKit
#endif
#if os(iOS)
import WidgetKit
#endif

@Observable
@MainActor
public final class AppCoordinator {
    public let eventBus = EventBus()
    public let saveSystem: SaveSystem
    public let sceneController = MouthLifeSceneController()

    // Observable UI State
    public var mode: AppMode = .hub
    public var save: MouthLifeSaveV2 {
        // The Home Screen widgets follow the brush log (written only when it really changed).
        didSet { publishWidgetSnapshot() }
    }
    /// The last snapshot written for the widgets, so an unchanged log is not written again.
    @ObservationIgnored private var lastWidgetSnapshot: WidgetSnapshot?
    @ObservationIgnored private var lastWidgetDayKey: String = HabitBank.localDateKey()
    /// When the last brush on this device ended (shown by the Today widget). Device-only: not part
    /// of the save or the Sync Code.
    private static let lastBrushDefaultsKey = "mouthlife.widget.lastBrushAt"
    private static let lastFullBrushDefaultsKey = "mouthlife.widget.lastFullBrushAt"
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
    /// The Prologue's picked hardness specimen (chips and 3D crystals stay in step).
    public var cosmicMohsIndex: Int = MohsSpecimens.enamelIndex

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
    /// A city finale (or the ending) playing over the frozen game; nil otherwise.
    public var finale: CityFinaleRequest?
    /// What to show once the finale ends: the score for a cleaned city, or nothing (back to Home).
    private var reportAfterFinale = false

    // Active 2-Minute Sink Brush-Along Pacer State
    private static let flossToolDefaultsKey = "mouthlife.pacer.flossToolStyle"
    private static let mouthwashDurationDefaultsKey = "mouthlife.pacer.mouthwashDurationStyle"
    private static let includeRinseDefaultsKey = "mouthlife.pacer.includeRinse"
    /// The fluoride rinse step (ages 6 and up). Off until a grown-up turns it on in Settings, since
    /// the brusher may be younger than 6.
    public var includeRinse: Bool = false
    // Brush reminders (a grown-up's choice), under the same names as the web edition.
    private static let remindersOnDefaultsKey = "mouthlife.reminders.on"
    private static let reminderMorningDefaultsKey = "mouthlife.reminders.morning"
    private static let reminderEveningDefaultsKey = "mouthlife.reminders.evening"
    public private(set) var remindersOn = false
    public private(set) var reminderMorning = BrushDays.defaultMorning
    public private(set) var reminderEvening = BrushDays.defaultEvening
    /// Whether this session's brushing stage ran its full 2 minutes (not tapped ahead to floss early).
    public private(set) var pacerBrushedFullTime: Bool = false
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

    // How to Play guide: offered on the first few launches, then kept behind the Home screen's ? button.
    private static let tutorialOffersDefaultsKey = "mouthlife.tutorial.offers"
    private static let tutorialOpenedDefaultsKey = "mouthlife.tutorial.opened"
    public var isTutorialVisible: Bool = false
    /// The card the guide opens on. Always the first, except for `--tutorial=<card>` screenshots.
    public var tutorialStartPage: TutorialPageId = .home
    public var showTutorialOffer: Bool = false
    private var tutorialGate = TutorialGate()

    // Companion & Sheet UI State
    public var activeSheet: HubSheetKind?
    public var tappedCrownSummary: CompanionCrownSummary?
    public var hubToast: String?
    public var arcadeToast: String?
    public var liveFps: Int = 120
    /// The frame-rate pill is a developer readout; it is off and no longer offered in Settings.
    public var showProMotionBadge: Bool = false
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
        self.includeRinse = UserDefaults.standard.object(forKey: Self.includeRinseDefaultsKey) as? Bool ?? false
        self.remindersOn = UserDefaults.standard.bool(forKey: Self.remindersOnDefaultsKey)
        self.reminderMorning = Self.storedMinutes(Self.reminderMorningDefaultsKey) ?? BrushDays.defaultMorning
        self.reminderEvening = Self.storedMinutes(Self.reminderEveningDefaultsKey) ?? BrushDays.defaultEvening
        self.tutorialGate = TutorialGate(
            progress: TutorialProgress(
                offers: UserDefaults.standard.integer(forKey: Self.tutorialOffersDefaultsKey),
                opened: UserDefaults.standard.bool(forKey: Self.tutorialOpenedDefaultsKey)
            )
        )
        self.voiceCoachEnabled = NativeSoundEngine.shared.isVoiceCoachEnabled
        self.coachLanguage = NativeSoundEngine.shared.coachLanguage
        // One language for the screens and the spoken coach.
        L10n.setLanguage(self.coachLanguage.rawValue)

        setupSceneAndAudioBridges()
        NativeSoundEngine.shared.setHubRadioStation(self.hubRadioStation)
        applyLaunchArgumentsIfPresent()
        syncSceneMode()
        startWatchLink()
        refreshReminders()
        publishWidgetSnapshot()
    }

    // MARK: - Home Screen widgets

    /// Writes the widgets' anonymous snapshot (brush counts and the language) into the App Group and
    /// asks WidgetKit to redraw, but only when it changed. Without an App Group (a free developer
    /// team, the Mac) nothing is written and the widgets show "Open MouthLife".
    private func publishWidgetSnapshot() {
        #if os(iOS)
        // a time in the future (a clock or time-zone change) is not a last brush
        let now = Date()
        let lastBrush = (UserDefaults.standard.object(forKey: Self.lastBrushDefaultsKey) as? Date).flatMap { $0 <= now ? $0 : nil }
        let lastFull = (UserDefaults.standard.object(forKey: Self.lastFullBrushDefaultsKey) as? Date).flatMap { $0 <= now ? $0 : nil }
        let snapshot = WidgetSnapshot.from(
            slots: save.dailySlotsByDate,
            language: coachLanguage,
            lastBrushAt: lastBrush,
            lastFullBrushAt: lastFull,
            morning: reminderMorning,
            evening: reminderEvening
        )
        guard snapshot != lastWidgetSnapshot else { return }
        if snapshot.save() {
            lastWidgetSnapshot = snapshot
            WidgetCenter.shared.reloadAllTimelines()
        }
        #endif
    }

    /// Remembers when a brush ended, for the Today widget: "Last brush" (any brush) and the tooth's
    /// face (full 2-minute brushes only). Each time only ever moves forward. Call it just before
    /// `save` takes the new brush, whose `didSet` then publishes both together (one reload).
    private func noteBrushEnded(at date: Date, full: Bool) {
        let now = Date()
        func advance(_ key: String) {
            if let known = UserDefaults.standard.object(forKey: key) as? Date, known >= date, known <= now { return }
            UserDefaults.standard.set(min(date, now), forKey: key)
        }
        advance(Self.lastBrushDefaultsKey)
        if full { advance(Self.lastFullBrushDefaultsKey) }
    }

    /// A widget was tapped. `mouthlife://brush` (Today, the Lock Screen tooth) starts the 2-Minute
    /// Brush from Home or from a returning player's Prologue; `mouthlife://home` (This week) just
    /// opens Home from the Prologue. A brush or a city stage already in progress is never
    /// interrupted, and a first-time player still sees the Prologue.
    public func openFromWidget(_ url: URL) {
        #if os(iOS)
        guard url.scheme == "mouthlife", save.hasSeenCosmicIntro else { return }
        // not over a city finale or the ending either (Home stays underneath them)
        guard mode == .hub || mode == .cosmicIntro, finale == nil else { return }
        if url.host == "brush" {
            // close whatever is open on Home first (a sheet, How to Play)
            activeSheet = nil
            if isTutorialVisible { closeTutorial() }
            startBrushAlong()
        } else if mode == .cosmicIntro {
            transition(to: .hub)
        }
        #endif
    }

    /// The clock changed under the widgets (a new time zone, a manual clock change): their timeline
    /// was worked out on the old clock, so write and reload even if the snapshot is the same.
    public func clockChangedForWidgets() {
        #if os(iOS)
        lastWidgetDayKey = HabitBank.localDateKey()
        lastWidgetSnapshot = nil
        publishWidgetSnapshot()
        #endif
    }

    // MARK: - Brush log and reminders

    /// The last seven days of brushes, for "This week" in Settings.
    public var brushWeek: [BrushDays.Day] { BrushDays.week(save.dailySlotsByDate) }

    private static func storedMinutes(_ key: String) -> Int? {
        guard let n = UserDefaults.standard.object(forKey: key) as? Int, (0..<1440).contains(n) else { return nil }
        return n
    }

    /// Turns reminders on (asking the system for permission the first time) or off; `done` gets the
    /// final state (off if notifications are not allowed).
    public func setReminders(_ on: Bool, done: @escaping (Bool) -> Void) {
        NativeSoundEngine.shared.playUiTap()
        guard on else {
            remindersOn = false
            UserDefaults.standard.set(false, forKey: Self.remindersOnDefaultsKey)
            refreshReminders()
            done(false)
            return
        }
        Task { @MainActor in
            let allowed = await BrushReminderScheduler.requestPermission()
            self.remindersOn = allowed
            UserDefaults.standard.set(allowed, forKey: Self.remindersOnDefaultsKey)
            self.refreshReminders()
            done(allowed)
        }
    }

    public func setReminderTimes(morning: Int, evening: Int) {
        reminderMorning = max(0, min(1439, morning))
        reminderEvening = max(0, min(1439, evening))
        UserDefaults.standard.set(reminderMorning, forKey: Self.reminderMorningDefaultsKey)
        UserDefaults.standard.set(reminderEvening, forKey: Self.reminderEveningDefaultsKey)
        refreshReminders()
        publishWidgetSnapshot()
    }

    /// The next week of reminders, quiet today once that brush is done (called on launch, on return
    /// to the app, after each brush and when a setting or the language changes).
    private func refreshReminders() {
        let fullToday = save.dailySlotsByDate[HabitBank.localDateKey()]?.fullRewards ?? 0
        BrushReminderScheduler.refresh(on: remindersOn, morning: reminderMorning, evening: reminderEvening, fullToday: fullToday) { slot in
            L10n.t(slot.text)
        }
    }

    // MARK: - Apple Watch

    private static let watchLedgerDefaultsKey = "mouthlife.watch.importLedger"

    /// Listens for brushes finished on the paired Apple Watch and tells it the grown-up's settings.
    private func startWatchLink() {
        #if os(iOS) && canImport(WatchConnectivity)
        PhoneWatchBridge.shared.onRecord = { [weak self] record in
            // no answer at all (the app going away, an unreadable ledger): the watch keeps it and sends it again
            self?.importWatchBrush(record)
        }
        PhoneWatchBridge.shared.activate()
        pushWatchSettings()
        #endif
    }

    /// The watch's settings: the rinse step only if a grown-up turned it on here, its length, the language.
    private func pushWatchSettings() {
        #if os(iOS) && canImport(WatchConnectivity)
        PhoneWatchBridge.shared.push(WatchPhoneSettings(
            includeRinse: includeRinse,
            rinseSec: mouthwashDurationStyle.durationSec,
            language: coachLanguage,
            revision: Date().timeIntervalSince1970
        ))
        #endif
    }

    /// Pays a brush finished on the watch, once per session (a resend gets the same answer), with
    /// the same fair rules as a brush here, credited to the day it was brushed.
    func importWatchBrush(_ record: WatchBrushRecord) -> WatchBrushAck? {
        var ledger = WatchImportLedger()
        if let data = UserDefaults.standard.data(forKey: Self.watchLedgerDefaultsKey) {
            // an unreadable ledger could pay old brushes again: pay nothing until it reads
            guard let stored = try? JSONDecoder().decode(WatchImportLedger.self, from: data) else { return nil }
            ledger = stored
        }
        if let known = ledger.ack(for: record.sessionId) { return known }
        let ack = ledger.apply(record, to: saveSystem, rinseAllowed: includeRinse) { ledger in
            if let data = try? JSONEncoder().encode(ledger) {
                UserDefaults.standard.set(data, forKey: Self.watchLedgerDefaultsKey)
            }
        }
        noteBrushEnded(at: record.completedAt, full: record.rewardInputs.fullBrush)
        save = saveSystem.getSave()
        sceneController.companionSmoothness = save.companion.smoothnessIndex
        refreshReminders()
        if mode == .hub {
            if ack.ionsAwarded > 0 {
                showHubToast("⌚ Brushed on Apple Watch! +\(ack.ionsAwarded) F⁻")
            } else {
                showHubToast("⌚ Brushed on Apple Watch!")
            }
        }
        return ack
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

        // Graphics quality is automatic. The manual picker was removed, so a fixed choice saved
        // earlier goes back to automatic.
        if save.qualityPreference != .auto {
            saveSystem.setQualityPreference(.auto)
            save = saveSystem.getSave()
        }
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
            // This snapshot was posted from the render thread and can land after the city ended
            // (finale or score already up): then the brush must stay quiet.
            let stageLive = ScrubGate.mayPlay(mode: self.mode, finale: self.finale != nil, paused: self.sceneController.arcadePaused, stageLive: snap.isRunning)
            NativeSoundEngine.shared.updateScrub(
                active: stageLive && snap.scrubActive,
                probeSpeed: snap.probeSpeed,
                newlyCleaned: newlyCleanedCells,
                cleanRatio: snap.worldCleanRatio,
                brushUpgradeId: self.save.equippedUpgrades.brush
            )
            if stageLive && snap.scrubActive && snap.probeSpeed > 0.25 {
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
                self.showHubToast("✨ Sugar spots polished! Smoothness \(Int(self.save.companion.smoothnessIndex.rounded()))%")
            }
        }

        sceneController.onCosmicMohsSelected = { [weak self] idx in
            self?.cosmicMohsIndex = idx
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
            } else if arg.hasPrefix("--finale=") || arg == "--ending" {
                // For screenshots and testing: play a city's finale (--finale=0 ... 4) or the ending
                // straight away, optionally with --finishes=gold,silver,pearl,empty,gold
                saveSystem.markCosmicIntroSeen()
                save = saveSystem.getSave()
                mode = .hub
                let finishes = args.first { $0.hasPrefix("--finishes=") }.map { list in
                    list.dropFirst("--finishes=".count).split(separator: ",").map { MolarFinish(rawValue: String($0)) ?? .empty }
                }
                if arg == "--ending" {
                    playFinale(.ending, worldIndex: 0, thenReport: false, finishes: finishes)
                } else {
                    let index = max(0, min(4, Int(arg.dropFirst("--finale=".count)) ?? 0))
                    playFinale(.city, worldIndex: index, thenReport: false, finishes: finishes)
                }
            } else if arg.hasPrefix("--lang=") {
                // For screenshots and testing: start in a given language, e.g. --lang=ja
                if let language = CoachLanguage(rawValue: String(arg.dropFirst("--lang=".count))) {
                    setCoachLanguage(language)
                }
            } else if arg == "--rinse=off" || arg == "--rinse=on" {
                // For screenshots and testing: brush with or without the rinse step (not saved).
                includeRinse = arg == "--rinse=on"
            } else if arg == "--pacer=floss" && mode == .brushAlong {
                // For screenshots and testing: tap ahead to the floss step straight away (after --mode=brushAlong).
                enterFlossBonusNow()
            } else if arg.hasPrefix("--sheet=") {
                let s = String(arg.dropFirst("--sheet=".count))
                activeSheet = HubSheetKind(rawValue: s)
            } else if arg == "--tutorial" {
                // For screenshots and testing: open the How to Play guide straight away.
                isTutorialVisible = true
            } else if arg.hasPrefix("--tutorial=") {
                // ...or at one card, e.g. --tutorial=enemies
                let card = String(arg.dropFirst("--tutorial=".count))
                tutorialStartPage = TutorialPageId(rawValue: card) ?? .home
                isTutorialVisible = true
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
            showArcadeToast("🌿 Helper germs are back (+30% Surge)!")

        case .gumTender:
            showArcadeToast("💗 Gentle on the gumline! Keep sweeping smoothly.")

        case .epsDeflected:
            showArcadeToast("🛡️ Slime dome! Crack it with Floss or Surge first.")

        case let .missionComplete(playMode, worldId, won, breakdown, _):
            let clearedBefore = CityFinale.worldIds.filter { saveSystem.getSave().worlds[$0]?.completed == true }.count
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
            // A cleaned city puts on its finale before the score; the fifth one also plays the ending.
            if playMode == .arcade, won, let index = CityFinale.worldIds.firstIndex(of: worldId) {
                let clearedAfter = CityFinale.worldIds.filter { save.worlds[$0]?.completed == true }.count
                let justMastered = clearedBefore < CityFinale.campaignPieces && clearedAfter >= CityFinale.campaignPieces
                playFinale(justMastered ? .cityThenEnding : .city, worldIndex: index, thenReport: true)
            } else {
                transition(to: .report)
            }

        default:
            break
        }
    }

    // MARK: - City Finales

    /// Each campaign city's piece of the Golden Molar, from the save.
    public var molarFinishes: [MolarFinish] {
        CityFinale.worldIds.map { id in
            let rec = save.worlds[id]
            return CityFinale.finish(for: rec?.bestGrade, completed: rec?.completed == true)
        }
    }

    private func playFinale(_ kind: CityFinaleRequest.Kind, worldIndex: Int, thenReport: Bool, finishes: [MolarFinish]? = nil) {
        NativeSoundEngine.shared.stopScrub()
        sceneController.resetStageInput()
        NativeSoundEngine.shared.setFinaleDucked(true)
        reportAfterFinale = thenReport
        withAnimation(.easeOut(duration: 0.2)) {
            finale = CityFinaleRequest(kind: kind, worldIndex: worldIndex, finishes: finishes ?? molarFinishes, reducedMotion: reducedMotion)
        }
    }

    /// The main menu's Golden Molar: once complete, it plays the ending again.
    public func watchEnding() {
        playFinale(.ending, worldIndex: 0, thenReport: false)
    }

    /// The finale ended or was skipped: on to the score (or back to Home).
    public func finishFinale() {
        NativeSoundEngine.shared.setFinaleDucked(false)
        let report = reportAfterFinale
        reportAfterFinale = false
        withAnimation(.easeInOut(duration: 0.35)) {
            finale = nil
            if report { transition(to: .report) }
        }
    }

    public func tapGoldenMolar() {
        NativeSoundEngine.shared.playUiTap()
        if molarFinishes.allSatisfy({ $0 != .empty }) {
            watchEnding()
        } else {
            showHubToast("Clean every city to finish the Golden Molar.")
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
        // the hardness ring starts on tooth enamel again, as on the web (quietly: no chip was tapped)
        cosmicMohsIndex = MohsSpecimens.enamelIndex
        sceneController.selectCosmicMohs(MohsSpecimens.enamelIndex)
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
        showArcadeToast("\(cart.title) • Scrub to 90% & bring back helper germs!")
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
        showArcadeToast("🚨 90s Pulp Rescue • Clean 85% (you can’t lose the tooth)!")
    }

    /// The stage's pause card: stepping stops, so the brush must be silenced here (no further
    /// snapshot will arrive to turn it off).
    public func setArcadePaused(_ paused: Bool) {
        sceneController.arcadePaused = paused
        // Music sinks and dulls behind the pause card, as on the web (`sound.setPaused`); this also
        // silences the brush. A held stick or a queued floss never carries past the card.
        NativeSoundEngine.shared.setPaused(paused)
        if paused { sceneController.resetStageInput() }
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
        if next == .hub {
            enterHomeForTutorial()
        } else {
            // Starting a game puts the offer away for this launch, and the guide never follows you into play.
            dismissTutorialOffer()
            isTutorialVisible = false
        }
        eventBus.emit(.modeChanged(from: prev, to: next))
    }

    // MARK: - How to Play Guide

    private func saveTutorialProgress() {
        UserDefaults.standard.set(tutorialGate.progress.offers, forKey: Self.tutorialOffersDefaultsKey)
        UserDefaults.standard.set(tutorialGate.progress.opened, forKey: Self.tutorialOpenedDefaultsKey)
    }

    private func enterHomeForTutorial() {
        if tutorialGate.enterHome() {
            saveTutorialProgress()
        }
        showTutorialOffer = tutorialGate.isOfferVisible
    }

    public func openTutorial() {
        tutorialStartPage = .home
        NativeSoundEngine.shared.playUiTap()
        if tutorialGate.markOpened() {
            saveTutorialProgress()
        }
        showTutorialOffer = false
        isTutorialVisible = true
    }

    public func closeTutorial() {
        isTutorialVisible = false
    }

    public func dismissTutorialOffer() {
        tutorialGate.dismissOffer()
        showTutorialOffer = false
    }

    /// Tapping a demo in the guide plays the sound that control makes in the game.
    public func playTutorialDemoSound(_ pageId: TutorialPageId) {
        let sound = NativeSoundEngine.shared
        switch pageId {
        case .home: sound.playGlassHarpNote(step: 4)
        case .brush: sound.playPacerCue(.quadrant)
        case .dive: sound.playSiteRestored()
        case .cleaner: sound.playSurgeReady()
        case .buttons, .enemies, .helpers: sound.playUiTap()
        case .floss: sound.playFlossSnap()
        case .surge: sound.playIonRinseWave()
        case .scan: sound.playDisclosePulse()
        case .cities: sound.playSynergyRankUp(2)
        case .ready: sound.playSmoothBaskSparkle()
        }
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
            showHubToast("✨ Claimed +\(claimed) F⁻ from Smooth Bask!")
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
            // Ask, as the web does: the hub's Rescue button appears; the child chooses when to start.
            showHubToast("🚨 Acid reached the pulp! Start the 90s Pulp Rescue to save the tooth!")
        } else if outcome.ionsGranted > 0 {
            showHubToast("\(host.signatureTreat.emoji) Enjoyed \(host.signatureTreat.name)! +\(outcome.ionsGranted) F⁻ • Rub the teeth to polish!")
        } else {
            showHubToast("\(host.signatureTreat.emoji) \(host.signatureTreat.name) (no more Ions this hour) • Rub the teeth to polish!")
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
        pacerBrushedFullTime = false
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
            BrushCoachCopy.spokenQuadrantNumber(.upperRight, lang: coachLanguage)
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
        L10n.setLanguage(language.rawValue)
        coachLanguage = language
        NativeSoundEngine.shared.setCoachLanguage(language)
        publishWidgetSnapshot()
        NativeSoundEngine.shared.playUiTap()
        pushWatchSettings()
        refreshReminders()
        if mode == .brushAlong && !pacerIsPaused && voiceCoachEnabled {
            speakCurrentPacerPhaseCue()
        }
    }

    /// Re-speaks the one-word cue for wherever the timeline is now (after a voice or language change).
    private func speakCurrentPacerPhaseCue() {
        let cue: String
        switch pacerStage {
        case .mouthwashBonus:
            cue = BrushCoachCopy.spokenStageWord(.rinse, lang: coachLanguage)
        case .flossBonus:
            cue = BrushCoachCopy.spokenStageWord(.floss, lang: coachLanguage)
        case .brushing:
            let phase = BrushPhaseState.evaluate(elapsedSec: pacerElapsedSec, stage: .brushing)
            cue = BrushCoachCopy.spokenQuadrantNumber(phase.quadrant, lang: coachLanguage)
        }
        NativeSoundEngine.shared.speakCoachingPhrase(cue)
    }

    public func setFlossToolStyle(_ style: FlossToolStyle) {
        guard flossToolStyle != style else { return }
        flossToolStyle = style
        sceneController.pacerFlossToolStyle = style
        UserDefaults.standard.set(style.rawValue, forKey: Self.flossToolDefaultsKey)
        NativeSoundEngine.shared.playUiTap()
    }

    public func setIncludeRinse(_ on: Bool) {
        guard includeRinse != on else { return }
        includeRinse = on
        UserDefaults.standard.set(on, forKey: Self.includeRinseDefaultsKey)
        NativeSoundEngine.shared.playUiTap()
        pushWatchSettings()
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
        pushWatchSettings()
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
        if pacerStage == .brushing {
            pacerBrushedFullTime = pacerElapsedSec >= GameConfig.brushAlongTotalSec - GameConfig.brushAlongFullBrushGraceSec
        }
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
            BrushCoachCopy.spokenStageWord(.floss, lang: coachLanguage)
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
        NativeSoundEngine.shared.setPacerState(quadrantIdx: 3, inFlossBonus: true, inRinse: true)
        NativeSoundEngine.shared.playMouthwashSwishMotif(stepIndex: 0)
        NativeSoundEngine.shared.speakCoachingPhrase(
            BrushCoachCopy.spokenStageWord(.rinse, lang: coachLanguage)
        )
        updateIdleTimerPolicy()
    }

    public func completeBrushAlongSession(withFlossBonus: Bool, withMouthwashBonus: Bool = false) {
        stopPacerTimer()
        pacerIsPaused = false
        pacerPausedByUser = false
        pacerSuspendedBySystem = false
        NativeSoundEngine.shared.setPaused(false)
        let fullBrush = pacerBrushedFullTime
        let outcome = saveSystem.recordBrushAlongCompletion(
            withFlossBonus: withFlossBonus,
            withMouthwashBonus: withMouthwashBonus,
            fullBrush: fullBrush,
            rinseStepOff: !includeRinse
        )
        noteBrushEnded(at: Date(), full: fullBrush)
        save = saveSystem.getSave()
        refreshReminders()
        sceneController.touchSystem.clearAll()
        sceneController.companionSmoothness = save.companion.smoothnessIndex
        // The completion fanfare and its haptic come from the pacerComplete event the save emits
        // (NativeSoundEngine and HapticsEngine listen), so they play once.
        transition(to: .hub)
        NativeSoundEngine.shared.speakCoachingPhrase(
            BrushCoachCopy.spokenStageWord(.done, lang: coachLanguage)
        )
        if !fullBrush {
            // Tapped ahead before the 2 minutes were up: a kind word and a small tip, never a scolding.
            if outcome.ionsAwarded > 0 {
                showHubToast("🌱 Good try! +\(outcome.ionsAwarded) F⁻ • Brush the whole 2 minutes to earn a Habit Stamp.")
            } else {
                showHubToast("🌱 Good try! Brush the whole 2 minutes to earn a Habit Stamp.")
            }
        } else if withMouthwashBonus {
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
                    BrushCoachCopy.spokenQuadrantNumber(phase.quadrant, lang: coachLanguage)
                )
            } else if sIdx != lastAnnouncedSurface && pacerElapsedSec < GameConfig.brushAlongTotalSec - 0.2 {
                lastAnnouncedSurface = sIdx
                // Surface changes are an earcon only: the voice just counts quadrants.
                NativeSoundEngine.shared.playPacerSurfaceMotif(quadrant: phase.quadrant, surface: phase.surface, isNewQuadrant: false)
            }

        case .flossBonus:
            let flossElapsed = pacerElapsedSec - GameConfig.brushAlongTotalSec
            if !announcedFlossLowerHalf && flossElapsed >= GameConfig.brushAlongFlossBonusSec * 0.5 {
                announcedFlossLowerHalf = true
                NativeSoundEngine.shared.playPacerSurfaceMotif(quadrant: .lowerRight, surface: .outerCheek, isNewQuadrant: true)
            }
            if pacerElapsedSec >= flossEnd - 0.05 {
                // Roll hands-free into Stage 3, the fluoride rinse, or finish when a grown-up left it out.
                if includeRinse {
                    enterMouthwashBonusNow(completedFloss: true)
                } else {
                    completeBrushAlongSession(withFlossBonus: true, withMouthwashBonus: false)
                }
            }

        case .mouthwashBonus:
            if phase.mouthwashStepIndex != lastAnnouncedMouthwashStep && phase.mouthwashStepIndex > 0 && pacerElapsedSec < cap - 0.25 {
                lastAnnouncedMouthwashStep = phase.mouthwashStepIndex
                NativeSoundEngine.shared.playMouthwashSwishMotif(stepIndex: phase.mouthwashStepIndex)
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
            refreshReminders()
            #if os(iOS)
            // the 14 days kept move on with the date; also rewrites a file removed while away
            let dayKey = HabitBank.localDateKey()
            let fileMissing = WidgetSnapshot.fileURL().map { !FileManager.default.fileExists(atPath: $0.path) } ?? false
            if dayKey != lastWidgetDayKey || fileMissing {
                lastWidgetDayKey = dayKey
                lastWidgetSnapshot = nil
            }
            publishWidgetSnapshot()
            #endif
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
        importSyncCode(code, preferImported: false)
    }

    private func importSyncCode(_ code: String, preferImported: Bool) -> Result<Void, Error> {
        do {
            // Merge, never overwrite: an older code must not erase this device's newer progress.
            save = try saveSystem.importSyncCode(code, preferImported: preferImported)
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

    /// A hardness chip on the Prologue: the 3D crystal lights up with it (web twin: `onMohsSelected`).
    public func selectCosmicMohs(_ index: Int) {
        let idx = min(max(0, index), MohsSpecimens.all.count - 1)
        cosmicMohsIndex = idx
        sceneController.selectCosmicMohs(idx)
        NativeSoundEngine.shared.playCrownRub(crownIndex: idx * 3, smoothnessIndex: 96.0)
        HapticsEngine.shared.playEnamelRub(smoothnessIndex: 96.0, intensity: 0.75)
    }

    /// "Have a Sync Code?" on the Prologue: bring the other device's progress across (merged, never
    /// overwritten), then straight Home. Web twin: `restoreSyncCode` in main.ts.
    public func restoreFromPrologue(_ code: String) -> Result<Void, Error> {
        // The link only shows on a brand-new save, so the code's tooth and settings come across too.
        let result = importSyncCode(code, preferImported: !save.hasSeenCosmicIntro)
        if case .success = result {
            // Home's Dive aims at the next city of the restored campaign, not at Toronto.
            selectedWorldId = pickRecommendedDiveWorld(from: save)
            activeSheet = nil
            completeCosmicIntro()
            showHubToast("Code imported! Your save is updated.")
        }
        return result
    }

    private func showHubToast(_ text: String) {
        hubToast = L10n.t(text)
        toastClearTask?.cancel()
        toastClearTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_200_000_000)
            if !Task.isCancelled { self.hubToast = nil }
        }
    }

    private func showArcadeToast(_ text: String) {
        arcadeToast = L10n.t(text)
        toastClearTask?.cancel()
        toastClearTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_800_000_000)
            if !Task.isCancelled { self.arcadeToast = nil }
        }
    }
}
