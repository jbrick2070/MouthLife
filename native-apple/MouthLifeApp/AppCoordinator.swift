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
    // Apple Health (a grown-up's choice): each brush saved as a Toothbrushing entry.
    private static let healthLogDefaultsKey = "mouthlife.health.brushLog"
    public private(set) var healthLogOn = false
    /// Set once the "Save brushes to Apple Health?" card has been shown after a brush. From then on,
    /// while Health is off, a small heart on the brush screen offers it again, only when tapped.
    private static let healthAskedDefaultsKey = "mouthlife.health.asked"
    public private(set) var healthAsked = false
    /// The last brush, so the one saying yes to Health right after it gets it saved too.
    @ObservationIgnored private var lastBrushForHealth: (sec: Double, endedAt: Date, sessionId: String)?
    /// The one-time question is due but something else was up: it shows once that is closed.
    @ObservationIgnored private var healthAskDue = false
    /// "Save brushes to Apple Health?" on screen: the question, or (Health already said no) where
    /// to turn it on.
    public enum HealthPrompt: Equatable { case ask, denied }
    public var healthPrompt: HealthPrompt?
    /// The first brush is waiting for the Health question to be answered before its timer starts.
    @ObservationIgnored private var brushAfterHealthAnswer = false
    /// Only a brush this recent is saved along with a yes (not one from days ago).
    private static let healthCatchUpSec: TimeInterval = 60 * 60
    /// Whether this session's brushing stage ran its full 2 minutes (not tapped ahead to floss early).
    public private(set) var pacerBrushedFullTime: Bool = false
    /// How long this session brushed and when brushing (not floss or rinse) ended, for Health.
    @ObservationIgnored private var pacerBrushing: (sec: Double, endedAt: Date)?
    public var pacerElapsedSec: Double = 0.0
    public var pacerIsPaused: Bool = false
    public var pacerInFlossBonus: Bool = false
    public var pacerStage: PacerStage = .brushing
    public var pacerCompletedFlossStage: Bool = false
    /// The stage whose Start card is up (floss or rinse), nil while a stage runs. Floss and rinse
    /// start only when tapped: time to put the brush down, and the floss or mouthwash may not be
    /// at hand. The clock waits at the end of the stage that ran.
    public private(set) var pacerAwaitingStage: PacerStage?
    /// When the last stage that ran ended: a brush finished from a Start card ended then.
    @ObservationIgnored private var pacerStageEndedAt: Date?
    /// When the Start card came up, for `GameConfig.brushAlongStageWaitSec`.
    @ObservationIgnored private var pacerAwaitingSince: Date?
    /// A brush whose brushing is done, kept on the device from the first Start card until the
    /// session finishes, so one the system closes meanwhile (the screen may sleep on a Start card)
    /// is still paid at the next launch, with what was finished.
    private struct PendingBrush: Codable {
        var sessionId: String
        var brushedSec: Double
        var brushingEndedAt: Date
        var stageEndedAt: Date
        var fullBrush: Bool
        var flossDone: Bool
        var rinseStepOff: Bool
    }
    private static let pendingBrushDefaultsKey = "mouthlife.pacer.pendingBrush"
    @ObservationIgnored private var pacerSessionId = UUID().uuidString
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
    /// The last pacer tick, on `pacerClockSec()` (a clock that keeps counting while the phone sleeps).
    private var lastPacerTickUptime: TimeInterval?
    /// When this brush was last noted on the device mid-brushing, on `pacerClockSec()`
    /// (`BrushCheckpoint`); nil until its first note.
    @ObservationIgnored private var lastBrushCheckpointClockSec: TimeInterval?
    /// The ritual's session clock on real time, through a locked phone or the background (H04).
    @ObservationIgnored private var pacerClock = PacerSessionClock()
    private static let pacerClockOrigin = ContinuousClock.now
    /// Seconds on a clock that, unlike `systemUptime`, keeps counting while the device sleeps.
    private static func pacerClockSec() -> Double {
        let d = ContinuousClock.now - pacerClockOrigin
        return Double(d.components.seconds) + Double(d.components.attoseconds) / 1e18
    }
    private var lastAnnouncedQuadrant: Int = -1
    private var lastAnnouncedSurface: Int = -1
    private var lastCountdownPipKey: String = ""

    // How to Play guide: offered on the first few launches, then kept behind the Home screen's ? button.
    private static let tutorialOffersDefaultsKey = "mouthlife.tutorial.offers"
    private static let tutorialOpenedDefaultsKey = "mouthlife.tutorial.opened"
    private static let tutorialEditionDefaultsKey = "mouthlife.tutorial.edition"
    public var isTutorialVisible: Bool = false
    /// The card the guide opens on. Always the first, except for `--tutorial=<card>` screenshots.
    public var tutorialStartPage: TutorialPageId = .home
    public var showTutorialOffer: Bool = false
    private var tutorialGate = TutorialGate()
    /// The city whose first Dive waits for the guide to close (see `diveFromHome`).
    @ObservationIgnored private var pendingDiveAfterTutorial: String?

    // Companion & Sheet UI State
    public var activeSheet: HubSheetKind?
    public var tappedCrownSummary: CompanionCrownSummary?
    public var hubToast: String?
    public var arcadeToast: String?
    /// The first-city coach (a new player's city 1 only); nil when it does not apply or has finished.
    public private(set) var coach: FirstCityCoach.State?
    /// One-time hints already shown on this device (web twin: `mouthlife.hintsSeen` in localStorage).
    private var seenHints: Set<String> = decodeSeenHints(from: UserDefaults.standard.string(forKey: hintsStorageKey))
    private var usedSurgeThisStage = false
    /// The stage's running count of cleaned film cells at the last snapshot (for the brush sound).
    private var lastCellsCleanedTotal = 0
    /// When the sore-gum and slime-dome reminders were last shown, so they never pile up.
    private var lastGumToastUptime: TimeInterval = -100
    private var lastDomeToastUptime: TimeInterval = -100
    private var arcadeToastClearTask: Task<Void, Never>?
    public var liveFps: Int = 120
    /// The picture quality in use (`applyAutomaticQuality`). The 3D view is handed this value, so
    /// SwiftUI updates the view, and with it the anti-aliasing, when the quality changes.
    public private(set) var pictureQuality: QualityTier = .ultra
    /// The frame-rate pill is a developer readout; it is off and no longer offered in Settings.
    public var showProMotionBadge: Bool = false
    /// Settings' "Less Camera Motion", kept under the web's name (`mouthlife.reduceMotion`). Only
    /// the switch's own choice is ever stored (`setReducedMotion`), never the system's setting.
    private static let reduceMotionDefaultsKey = "mouthlife.reduceMotion"
    public var reducedMotion: Bool = false {
        didSet {
            sceneController.reducedMotion = reducedMotion
            eventBus.emit(.motionChanged(reduced: reducedMotion))
        }
    }

    private var toastClearTask: Task<Void, Never>?
    private var unsubscribeToken: (() -> Void)?
    private var lastHudPublishUptime: TimeInterval = 0

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
        // "Less Camera Motion" as it was left in Settings; the system's Reduce Motion is added on
        // top once the screen appears (RootContentView).
        if UserDefaults.standard.bool(forKey: Self.reduceMotionDefaultsKey) {
            self.reducedMotion = true
            self.sceneController.reducedMotion = true
        }
        self.remindersOn = UserDefaults.standard.bool(forKey: Self.remindersOnDefaultsKey)
        // Off if Health access was taken away in the Health app since it was turned on.
        self.healthLogOn = UserDefaults.standard.bool(forKey: Self.healthLogDefaultsKey) && HealthBrushLog.isAllowed
        self.healthAsked = UserDefaults.standard.bool(forKey: Self.healthAskedDefaultsKey)
        self.reminderMorning = Self.storedMinutes(Self.reminderMorningDefaultsKey) ?? BrushDays.defaultMorning
        self.reminderEvening = Self.storedMinutes(Self.reminderEveningDefaultsKey) ?? BrushDays.defaultEvening
        self.tutorialGate = TutorialGate(
            progress: TutorialGuide.progress(
                offers: UserDefaults.standard.integer(forKey: Self.tutorialOffersDefaultsKey),
                opened: UserDefaults.standard.bool(forKey: Self.tutorialOpenedDefaultsKey),
                savedEdition: UserDefaults.standard.integer(forKey: Self.tutorialEditionDefaultsKey)
            )
        )
        self.voiceCoachEnabled = NativeSoundEngine.shared.isVoiceCoachEnabled
        self.coachLanguage = NativeSoundEngine.shared.coachLanguage
        // One language for the screens and the spoken coach.
        L10n.setLanguage(self.coachLanguage.rawValue)

        // The test diary and the watchdog (`AppDiagnostics`), before anything that could stall.
        // Diary lines in this file are raw strings (#"..."#): they are for testers, in English, and
        // the text extractor (scripts/i18n-extract.mjs) leaves raw strings out of the translations.
        AppDiagnostics.shared.start()
        // A brush the system closed on a Start card is paid now (before the sound listens: quietly).
        finishPendingBrush()
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

    private func storePendingBrush() {
        guard let brushing = pacerBrushing, let stageEnd = pacerStageEndedAt else { return }
        let pending = PendingBrush(
            sessionId: pacerSessionId,
            brushedSec: brushing.sec,
            brushingEndedAt: brushing.endedAt,
            stageEndedAt: stageEnd,
            fullBrush: pacerBrushedFullTime,
            flossDone: pacerCompletedFlossStage,
            rinseStepOff: !includeRinse
        )
        if let data = try? JSONEncoder().encode(pending) {
            UserDefaults.standard.set(data, forKey: Self.pendingBrushDefaultsKey)
        }
    }

    private func clearPendingBrush() {
        UserDefaults.standard.removeObject(forKey: Self.pendingBrushDefaultsKey)
    }

    /// Notes a brush still inside its 2 minutes, so one the app never finishes (closed, crashed or
    /// frozen mid-brush) is paid at the next launch with the seconds really brushed: a "good try",
    /// or a full brush if it was within the grace of the 2 minutes, as for a finished stage
    /// (`BrushCheckpoint`). Every few seconds from the pacer's tick; `force` writes at once (the
    /// app going away, Pause). It only writes the note: the session's own record of when brushing
    /// ended (`pacerBrushing`, `pacerStageEndedAt`) stays empty until brushing really ends, so
    /// Home mid-brush still leaves without a reward and the stage's end overwrites the note.
    private func checkpointBrushing(force: Bool = false) {
        guard mode == .brushAlong, pacerStage == .brushing, pacerAwaitingStage == nil, pacerBrushing == nil else { return }
        guard BrushCheckpoint.isWorthKeeping(brushedSec: pacerElapsedSec) else { return }
        let clockNow = Self.pacerClockSec()
        guard force || BrushCheckpoint.isDue(lastWriteClockSec: lastBrushCheckpointClockSec, nowClockSec: clockNow) else { return }
        lastBrushCheckpointClockSec = clockNow
        let now = Date()
        let brushedSec = min(pacerElapsedSec, GameConfig.brushAlongTotalSec)
        let pending = PendingBrush(
            sessionId: pacerSessionId,
            brushedSec: brushedSec,
            brushingEndedAt: now,
            stageEndedAt: now,
            fullBrush: BrushCheckpoint.countsAsFull(brushedSec: brushedSec),
            flossDone: false,
            rinseStepOff: !includeRinse
        )
        if let data = try? JSONEncoder().encode(pending) {
            UserDefaults.standard.set(data, forKey: Self.pendingBrushDefaultsKey)
        }
    }

    /// Pays a brush left on a Start card when the app was closed: brushing (and floss, if it was
    /// finished) counts, dated when the last finished stage ended. Its Health entry, if Health is
    /// on, carries the session's sync id, so it can never be saved twice.
    private func finishPendingBrush() {
        guard let data = UserDefaults.standard.data(forKey: Self.pendingBrushDefaultsKey) else { return }
        clearPendingBrush()
        guard let p = try? JSONDecoder().decode(PendingBrush.self, from: data) else { return }
        crumb(#"a brush the last run left unfinished is paid now: \#(Int(p.brushedSec)) s brushed, \#(p.fullBrush ? "full" : "good try")"#)
        let now = Date()
        _ = saveSystem.recordBrushAlongCompletion(
            withFlossBonus: p.flossDone,
            withMouthwashBonus: false,
            fullBrush: p.fullBrush,
            rinseStepOff: p.rinseStepOff,
            date: now,
            rewardDay: BrushEndTime.rewardDay(endedAt: p.stageEndedAt, now: now)
        )
        noteBrushEnded(at: p.stageEndedAt, full: p.fullBrush)
        if healthLogOn {
            HealthBrushLog.save(brushedSec: p.brushedSec, endedAt: p.brushingEndedAt, sessionId: p.sessionId)
        }
        save = saveSystem.getSave()
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
            requestBrushAlong()
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

    /// Turns saving brushes to Apple Health on (after a grown-up's question; Apple's Health sheet
    /// shows the first time) or off. `done` gets whether it is on.
    public func setHealthLog(_ on: Bool, done: @escaping (Bool) -> Void) {
        NativeSoundEngine.shared.playUiTap()
        // A grown-up has chosen: the one-time card after a brush is not needed any more.
        if !healthAsked {
            healthAsked = true
            UserDefaults.standard.set(true, forKey: Self.healthAskedDefaultsKey)
        }
        guard on else {
            healthLogOn = false
            UserDefaults.standard.set(false, forKey: Self.healthLogDefaultsKey)
            done(false)
            return
        }
        Task { @MainActor in
            let allowed = await HealthBrushLog.requestPermission()
            self.healthLogOn = allowed
            UserDefaults.standard.set(allowed, forKey: Self.healthLogDefaultsKey)
            // The brush that prompted the yes goes to Health too (its sync id keeps it single).
            if allowed, let b = self.lastBrushForHealth, Date().timeIntervalSince(b.endedAt) < Self.healthCatchUpSec {
                HealthBrushLog.save(brushedSec: b.sec, endedAt: b.endedAt, sessionId: b.sessionId)
            }
            self.lastBrushForHealth = nil
            done(allowed)
        }
    }

    /// After a finished brush (a watch brush arriving, or a phone brush that somehow began without
    /// the question): remembers it for Health and, if the question was never asked, asks it on Home.
    /// The phone normally asks before its first brush starts (`startBrushAskingHealthFirst`). Only for
    /// a real brush, only where Health exists, never while Health is already on, never in the game.
    private func offerHealthAfterBrush(sec: Double, endedAt: Date, sessionId: String) {
        guard HealthBrushLog.isAvailable, !healthLogOn, sec >= HealthBrushLog.minimumBrushSec else { return }
        lastBrushForHealth = (sec, endedAt, sessionId)
        guard !healthAsked else { return }
        healthAskDue = true
        // A moment later: after the chime, once the floss card (or Home's reward message) is up.
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(1.5))
            self?.showHealthAskIfFree()
        }
    }

    /// A sheet closed or the app came back: a card that was due shows now, if Home is clear.
    public func healthAskMayShow() {
        guard healthAskDue else { return }
        showHealthAskIfFree()
    }

    /// The one-time card: over the floss Start card right after brushing, or on Home (a watch brush),
    /// with nothing else up (no sheet, How to Play, finale or brush intro) and the app in front;
    /// otherwise it waits until then.
    private func showHealthAskIfFree() {
        if healthAsked || healthLogOn { healthAskDue = false }
        let onStartCard = mode == .brushAlong && pacerAwaitingStage != nil
        guard !healthAsked, !healthLogOn, mode == .hub || onStartCard, activeSheet == nil, healthPrompt == nil, finale == nil,
              !isTutorialVisible, !isBrushIntroVisible else { return }
        #if os(iOS)
        guard UIApplication.shared.applicationState == .active else { return }
        #endif
        healthAsked = true
        healthAskDue = false
        UserDefaults.standard.set(true, forKey: Self.healthAskedDefaultsKey)
        healthPrompt = HealthBrushLog.isDenied ? .denied : .ask
    }

    /// The question's answer. Yes brings up Apple's Health sheet a moment later, once the question
    /// has gone, so the two never overlap.
    /// A first brush waiting on the question starts once it is answered (after Apple's sheet, if yes).
    public func answerHealthPrompt(_ yes: Bool) {
        healthPrompt = nil
        let thenBrush = brushAfterHealthAnswer
        brushAfterHealthAnswer = false
        guard yes else {
            if thenBrush, mode == .hub { startBrushAlong() }
            return
        }
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(450))
            self?.setHealthLog(true) { [weak self] _ in
                guard let self, thenBrush, self.mode == .hub else { return }
                self.startBrushAlong()
            }
        }
    }

    /// The brush screen's small heart, shown whenever Health is off (iPhone and iPad): it only
    /// explains when tapped.
    public var showsHealthHeart: Bool {
        HealthBrushLog.isAvailable && !healthLogOn
    }

    public func openHealthCard() {
        NativeSoundEngine.shared.playUiTap()
        // The brush waits while the question is up (Play carries on).
        if mode == .brushAlong, pacerAwaitingStage == nil, !pacerIsPaused {
            togglePacerPause()
        }
        healthPrompt = HealthBrushLog.isDenied ? .denied : .ask
    }

    public func setReminderTimes(morning: Int, evening: Int) {
        reminderMorning = max(0, min(1439, morning))
        reminderEvening = max(0, min(1439, evening))
        UserDefaults.standard.set(reminderMorning, forKey: Self.reminderMorningDefaultsKey)
        UserDefaults.standard.set(reminderEvening, forKey: Self.reminderEveningDefaultsKey)
        refreshReminders()
        publishWidgetSnapshot()
    }

    /// The next 30 days of reminders (`BrushDays.daysAhead`), quiet today once that brush is done
    /// (called on launch, on return to the app, after each brush and when a setting or the language
    /// changes).
    private func refreshReminders() {
        let fullToday = save.dailySlotsByDate[HabitBank.localDateKey()]?.fullRewards ?? 0
        BrushReminderScheduler.refresh(on: remindersOn, morning: reminderMorning, evening: reminderEvening, fullToday: fullToday) { slot in
            L10n.t(slot.text)
        }
    }

    // MARK: - Apple Watch

    private static let watchLedgerDefaultsKey = "mouthlife.watch.importLedger"
    private static let watchSettingsRevisionDefaultsKey = "mouthlife.watch.settingsRevision"

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
        // An ever-rising revision, not the clock: a clock set back must not make the watch ignore
        // a grown-up turning rinse off (M05).
        let revision = WatchPhoneSettings.nextRevision(
            after: UserDefaults.standard.double(forKey: Self.watchSettingsRevisionDefaultsKey)
        )
        UserDefaults.standard.set(revision, forKey: Self.watchSettingsRevisionDefaultsKey)
        PhoneWatchBridge.shared.push(WatchPhoneSettings(
            includeRinse: includeRinse,
            rinseSec: mouthwashDurationStyle.durationSec,
            language: coachLanguage,
            revision: revision
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
        if healthLogOn {
            HealthBrushLog.save(brushedSec: record.brushedSec, endedAt: record.completedAt, sessionId: record.sessionId)
        } else {
            offerHealthAfterBrush(sec: record.brushedSec, endedAt: record.completedAt, sessionId: record.sessionId)
        }
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
        NativeSoundEngine.shared.startEngineIfNeeded(urgent: true)

        // Graphics quality is automatic. The manual picker was removed, so a fixed choice saved
        // earlier goes back to automatic.
        if save.qualityPreference != .auto {
            saveSystem.setQualityPreference(.auto)
            save = saveSystem.getSave()
        }
        let launchTier = save.qualityPreference.explicitTier ?? automaticQualityTier()
        sceneController.qualityTier = launchTier
        pictureQuality = launchTier
        sceneController.companionSmoothness = save.companion.smoothnessIndex

        sceneController.onFpsUpdated = { [weak self] fps in
            guard let self else { return }
            self.liveFps = fps
            AppDiagnostics.shared.noteFps(fps)
        }

        sceneController.onSessionStepped = { [weak self] snap in
            guard let self else { return }
            let now = ProcessInfo.processInfo.systemUptime
            if self.shouldPublishHudSnapshot(snap, now: now) {
                self.lastHudPublishUptime = now
                self.latestSnapshot = snap
            }
            // The cells really cleaned since the last snapshot, from the stage's own running count
            // (it restarts at zero with each stage). Estimating them from the change in the clean
            // percentage rounded to zero on most frames, which took the bite and the chime out of
            // the brush sound.
            let cleanedSinceLast = max(0, snap.cellsCleanedTotal - self.lastCellsCleanedTotal)
            self.lastCellsCleanedTotal = snap.cellsCleanedTotal
            let newlyCleanedCells = snap.scrubActive ? cleanedSinceLast : 0
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

    // MARK: - First-city coach and one-time hints

    /// Tells the coach what the player just did; retires it for good once it has nothing left to teach.
    private func coachSaw(_ event: FirstCityCoach.Event) {
        guard let state = coach else { return }
        let next = FirstCityCoach.advance(state, event)
        if FirstCityCoach.finished(next) {
            retireCoach()
        } else if next != state {
            coach = next
        }
    }

    private func retireCoach() {
        guard coach != nil else { return }
        coach = nil
        markHintSeen(FirstCityCoach.doneHintKey)
    }

    private func markHintSeen(_ key: String) {
        guard seenHints.insert(key).inserted else { return }
        UserDefaults.standard.set(encodeSeenHints(seenHints), forKey: hintsStorageKey)
    }

    /// A hint shown once per device (web twin: `maybeHint`). Kept outside the save, like the web's.
    private func showHintOnce(_ key: String, _ text: String) {
        guard !seenHints.contains(key) else { return }
        markHintSeen(key)
        showArcadeToast(text, seconds: 4.2)
    }

    private func handleGameEvent(_ event: GameEvent) {
        NativeSoundEngine.shared.handleGameEvent(event)
        HapticsEngine.shared.handleGameEvent(event)

        if case let .saveUpdated(updated) = event {
            self.save = updated
            self.sceneController.companionSmoothness = updated.companion.smoothnessIndex
            return
        }
        // Events are posted from the render thread and can land after the stage was left. A stage's
        // coach, hints and toasts are for a stage that is still on screen; a finished stage's result
        // is always kept, however late it lands.
        var isStageResult = false
        if case .missionComplete = event { isStageResult = true }
        guard isStageResult || mode == .arcade || mode == .pulpRescue else { return }

        switch event {
        case let .actuatorScrub(_, newlyCleaned, _, _):
            if newlyCleaned > 0 { coachSaw(.scrub(newlyCleaned: newlyCleaned)) }

        case let .flossSliced(_, _, _, _, zipped, _):
            if zipped { coachSaw(.zipped) }

        case .rinseSurged:
            usedSurgeThisStage = true
            coachSaw(.surgeFired)

        case .disclosePulsed:
            coachSaw(.scanPulsed)
            showHintOnce("two_tone_dye", "🔍 Dye shows plaque: pink = new and thin • purple = old and thick. Scrub purple first!")

        case .surgeReady:
            // The coach's own line says this for a new player in city 1.
            if coach == nil, !usedSurgeThisStage {
                showHintOnce("surge", "🌊 Surge is full! Tap Surge to blast a fluoride wave.")
            }

        case let .districtSealed(_, name, _):
            coachSaw(.zoneSealed)
            showArcadeToast("🌊 \(name) sealed with fluoride!")

        case .siteRestored:
            coachSaw(.helperRestored)
            if seenHints.contains("first_colony") {
                showArcadeToast("✨ Helper germs are back! (+30% Surge)")
            } else {
                markHintSeen("first_colony")
                showArcadeToast("✨ Helper germs are back! Clean glowing rings to charge 🌊 Surge (+30%)", seconds: 3.4)
            }

        case .gumTender:
            let now = ProcessInfo.processInfo.systemUptime
            if now - lastGumToastUptime >= 6 {
                lastGumToastUptime = now
                showArcadeToast("💗 Gentle on the gumline! Keep sweeping smoothly.")
            }

        case .epsDeflected:
            let now = ProcessInfo.processInfo.systemUptime
            if now - lastDomeToastUptime >= 6 {
                lastDomeToastUptime = now
                showArcadeToast("🛡️ Slime dome! Crack it with Floss or Surge first.")
            }

        case let .missionComplete(playMode, worldId, won, breakdown, _):
            retireCoach()
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
        // The finale takes the pause card's place: its music must not play dulled as if paused.
        setStagePause(false, by: #"a finale"#)
        sceneController.resetStageInput()
        NativeSoundEngine.shared.setFinaleDucked(true)
        reportAfterFinale = thenReport
        crumb(#"finale starts (\#(kind), city \#(worldIndex))"#)
        withAnimation(.easeOut(duration: 0.2)) {
            finale = CityFinaleRequest(kind: kind, worldIndex: worldIndex, finishes: finishes ?? molarFinishes, reducedMotion: reducedMotion)
        }
        // A show lasts 30 to 90 s and needs no touch: the screen must not dim and lock over it.
        updateIdleTimerPolicy()
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
        crumb(#"finale over"#)
        withAnimation(.easeInOut(duration: 0.35)) {
            finale = nil
            if report { transition(to: .report) }
        }
        // The show is over: the screen may sleep again (no transition follows an ending replayed
        // from Home, so it is said here).
        updateIdleTimerPolicy()
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
        self.lastCellsCleanedTotal = initialSnap.cellsCleanedTotal
        self.arcadeToastClearTask?.cancel()
        self.arcadeToast = nil
        // A stage never starts paused (see `setStagePause`).
        setStagePause(false, by: #"a new stage"#)
        sceneController.mountStage(for: session)
        NativeSoundEngine.shared.playOrbitalDive()
        transition(to: .arcade)
        // A new player's city 1 gets the coach, one thing at a time, instead of the city's whole
        // challenge at once (web twin: `shouldShowDiveIntroToast` and `coachApplies`).
        let world1Done = currentSave.worlds["world_1"]?.completed == true
        usedSurgeThisStage = false
        coach = FirstCityCoach.applies(worldId: cart.id, mode: .arcade, cityCompleted: world1Done, seenHints: seenHints)
            ? FirstCityCoach.State()
            : nil
        if let blurb = cart.challengeBlurb, shouldShowDiveIntroToast(mode: .arcade, worldId: cart.id, world1Completed: world1Done) {
            showArcadeToast("🎯 \(blurb)", seconds: 4.2)
        }
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
        self.lastCellsCleanedTotal = initialSnap.cellsCleanedTotal
        self.arcadeToastClearTask?.cancel()
        self.arcadeToast = nil
        // A stage never starts paused (see `setStagePause`).
        setStagePause(false, by: #"a new stage"#)
        sceneController.mountStage(for: session)
        NativeSoundEngine.shared.playOrbitalDive()
        coach = nil
        usedSurgeThisStage = false
        transition(to: .pulpRescue)
        showArcadeToast("🚨 90s Pulp Rescue • Clean 85% (you can’t lose the tooth)!")
    }

    /// The stage's pause card: stepping stops, so the brush must be silenced here (no further
    /// snapshot will arrive to turn it off).
    public func setArcadePaused(_ paused: Bool) {
        setStagePause(paused, by: #"the pause card"#)
    }

    /// The one place the stage's pause is written. The pause card turns it on and off; starting a
    /// stage, leaving one and a finale covering one always turn it off, whatever the card managed
    /// to say on its way out. A stage left paused would draw and play its music but never move or
    /// take a touch, with no card on screen to resume it.
    private func setStagePause(_ paused: Bool, by who: String) {
        guard paused != sceneController.arcadePaused else { return }
        // Only a stage that is on screen can be paused: a card that asks while the score or a
        // finale is already taking its place is not listened to.
        if paused, !(mode == .arcade || mode == .pulpRescue) || finale != nil {
            crumb(#"stage pause refused: no stage on screen (\#(mode.rawValue), asked by \#(who))"#)
            return
        }
        sceneController.arcadePaused = paused
        // Music sinks and dulls behind the pause card, as on the web (`sound.setPaused`); this also
        // silences the brush. A held stick or a queued floss never carries past the card.
        NativeSoundEngine.shared.setPaused(paused)
        if paused { sceneController.resetStageInput() }
        crumb(#"stage pause \#(paused ? "on" : "off") (\#(who))"#)
    }

    public func returnToHub() {
        // Home once the 2 minutes of brushing are done (from a Start card, or during floss or the
        // rinse): the brush is saved with what was finished rather than thrown away (completing goes
        // Home itself, without the spoken "Done").
        if mode == .brushAlong, pacerAwaitingStage != nil || pacerBrushing != nil {
            completeBrushAlongSession(withFlossBonus: pacerCompletedFlossStage, withMouthwashBonus: false, announce: false)
            return
        }
        stopPacerTimer()
        pacerAwaitingStage = nil
        clearPendingBrush()
        pacerIsPaused = false
        pacerPausedByUser = false
        pacerSuspendedBySystem = false
        NativeSoundEngine.shared.stopVoiceCoach()
        // A stage left from its pause card is not left paused.
        setStagePause(false, by: #"going Home"#)
        NativeSoundEngine.shared.setPaused(false)
        NativeSoundEngine.shared.stopScrub()
        // What belonged to the stage goes with it: its toast, and a coach that had not finished
        // (it starts again with the next first-city dive).
        arcadeToastClearTask?.cancel()
        arcadeToast = nil
        coach = nil
        transition(to: .hub)
    }

    private func transition(to next: AppMode) {
        let prev = mode
        // No change of screen leaves a stage paused behind it (the score after a stage that
        // ended under its pause card, for one).
        setStagePause(false, by: #"a change of screen"#)
        mode = next
        let stageId = next == .arcade || next == .pulpRescue ? activeCartridge.id : ""
        crumb(#"screen \#(prev.rawValue) -> \#(next.rawValue) \#(stageId)"#)
        // A change of screen is the one moment the picture may change quality unseen.
        applyAutomaticQuality()
        syncSceneMode()
        updateIdleTimerPolicy()
        if next == .hub {
            enterHomeForTutorial()
        } else {
            // Starting a game puts the offer away for this launch, and the guide never follows you into play.
            dismissTutorialOffer()
            isTutorialVisible = false
            pendingDiveAfterTutorial = nil
        }
        eventBus.emit(.modeChanged(from: prev, to: next))
    }

    // MARK: - How to Play Guide

    private func saveTutorialProgress() {
        UserDefaults.standard.set(tutorialGate.progress.offers, forKey: Self.tutorialOffersDefaultsKey)
        UserDefaults.standard.set(tutorialGate.progress.opened, forKey: Self.tutorialOpenedDefaultsKey)
        UserDefaults.standard.set(TutorialGuide.edition, forKey: Self.tutorialEditionDefaultsKey)
    }

    private func enterHomeForTutorial() {
        if tutorialGate.enterHome() {
            saveTutorialProgress()
        }
        showTutorialOffer = tutorialGate.isOfferVisible
    }

    public func openTutorial() {
        openTutorial(startingAt: .home)
    }

    /// Dive from Home. The first Dive opens How to Play by itself, at its dive cards, and closing or
    /// skipping it starts that dive; after that the guide waits in the Home menu and behind the ?
    /// (the owner, November 2026). Web twin: `CompanionHubOverlay.launchDive`.
    public func diveFromHome(_ worldId: String) {
        guard !tutorialGate.progress.opened, mode == .hub, !isTutorialVisible else {
            launchArcadeWorld(worldId)
            return
        }
        pendingDiveAfterTutorial = worldId
        openTutorial(startingAt: .dive)
    }

    private func openTutorial(startingAt page: TutorialPageId) {
        tutorialStartPage = page
        NativeSoundEngine.shared.playUiTap()
        if tutorialGate.markOpened() {
            saveTutorialProgress()
        }
        showTutorialOffer = false
        isTutorialVisible = true
    }

    public func closeTutorial() {
        isTutorialVisible = false
        if let worldId = pendingDiveAfterTutorial {
            pendingDiveAfterTutorial = nil
            launchArcadeWorld(worldId)
        }
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

    // MARK: - The one-time "Time Your Real Brush" card

    private static let brushIntroSeenDefaultsKey = "mouthlife.pacer.hasSeenIntro"
    /// Shown over Home before a device's first 2-Min Brush (web twin: `src/ui/brushIntroCard.ts`).
    public var isBrushIntroVisible: Bool = false

    /// Home and the widget start the brush through here: the first time on a device, the card
    /// says plainly that it times real brushing. The `--mode=brushAlong` test argument skips it.
    public func requestBrushAlong() {
        if UserDefaults.standard.bool(forKey: Self.brushIntroSeenDefaultsKey) {
            startBrushAskingHealthFirst()
        } else {
            isBrushIntroVisible = true
        }
    }

    /// The first 2-Minute Brush asks about Apple Health before its timer starts (eyes on the screen,
    /// hands still free); the brush begins as soon as it is answered, and a yes covers that brush.
    private func startBrushAskingHealthFirst() {
        guard HealthBrushLog.isAvailable, !healthAsked, !healthLogOn, healthPrompt == nil else {
            startBrushAlong()
            return
        }
        healthAsked = true
        healthAskDue = false
        UserDefaults.standard.set(true, forKey: Self.healthAskedDefaultsKey)
        brushAfterHealthAnswer = true
        healthPrompt = HealthBrushLog.isDenied ? .denied : .ask
    }

    /// The card's Start: the ritual begins exactly as from Home. Device-local, outside the save.
    public func confirmBrushIntro() {
        guard isBrushIntroVisible else { return }
        isBrushIntroVisible = false
        UserDefaults.standard.set(true, forKey: Self.brushIntroSeenDefaultsKey)
        startBrushAskingHealthFirst()
    }

    public func dismissBrushIntro() {
        isBrushIntroVisible = false
    }

    // MARK: - 2-Minute Sink Brush-Along Pacer + iPhone Wake-Lock

    public func startBrushAlong() {
        pacerElapsedSec = 0
        pacerClock = PacerSessionClock()
        pacerIsPaused = false
        pacerPausedByUser = false
        pacerSuspendedBySystem = false
        pacerInFlossBonus = false
        pacerStage = .brushing
        pacerAwaitingStage = nil
        pacerStageEndedAt = nil
        pacerAwaitingSince = nil
        pacerSessionId = UUID().uuidString
        clearPendingBrush()
        lastBrushCheckpointClockSec = nil
        crumb(#"brush started"#)
        pacerCompletedFlossStage = false
        pacerBrushedFullTime = false
        pacerBrushing = nil
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
        // A Start card is quiet: its stage's word comes with the tap.
        guard pacerAwaitingStage == nil else { return }
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
            pacerClock.rescaleRinse(from: oldDur, to: newDur)
            pacerElapsedSec = max(mwStart, pacerClock.elapsedSec(in: .mouthwashBonus, mouthwashDurationSec: newDur))
            sceneController.pacerElapsedSec = pacerElapsedSec
        }
        mouthwashDurationStyle = style
        sceneController.pacerMouthwashDurationSec = newDur
        UserDefaults.standard.set(style.rawValue, forKey: Self.mouthwashDurationDefaultsKey)
        NativeSoundEngine.shared.playUiTap()
        pushWatchSettings()
    }

    public func togglePacerPause() {
        // Nothing runs on a Start card, so there is nothing to pause.
        guard pacerAwaitingStage == nil else { return }
        pacerIsPaused.toggle()
        pacerPausedByUser = pacerIsPaused
        pacerSuspendedBySystem = false
        // Paused, then the app closed from the switcher: the note has the seconds up to the pause.
        if pacerIsPaused { checkpointBrushing(force: true) }
        lastPacerTickUptime = Self.pacerClockSec()
        crumb(#"brush \#(pacerIsPaused ? "paused" : "resumed") at \#(Int(pacerElapsedSec)) s"#)
        NativeSoundEngine.shared.setPaused(pacerIsPaused)
        updateIdleTimerPolicy()
        eventBus.emit(.pacerPaused(paused: pacerIsPaused))
    }

    /// Notes how long brushing lasted, once, as the session leaves the brushing stage.
    private func noteBrushingStageEnded() {
        guard pacerStage == .brushing, pacerBrushing == nil else { return }
        // A phone locked as the 2 minutes ran out moves on only once it wakes: brushing ended
        // that overrun ago, not now. The overrun is read from the session clock: the clock shown
        // (`pacerElapsedSec`) is held at 2:00 and would always say none.
        let overrun = pacerClock.overflowSec(in: .brushing, mouthwashDurationSec: mouthwashDurationStyle.durationSec)
        pacerBrushing = (min(pacerElapsedSec, GameConfig.brushAlongTotalSec), BrushEndTime.endedAt(now: Date(), overflowSec: overrun))
    }

    /// A stage has ended (by time, or floss skipped): the next one waits for its Start tap. Time the
    /// phone spent locked past the end is dropped (the next stage starts from 0 when tapped), and the
    /// brush is dated from when the stage ended, not from the tap. One chime when time ran out; a
    /// card reached by Skip comes up quietly (the tap was the signal). Web twin: `holdAfterStage`.
    private func holdForStart(_ next: PacerStage, chime: Bool = true) {
        let mwDur = mouthwashDurationStyle.durationSec
        if pacerAwaitingStage == nil {
            let overrun = pacerClock.overflowSec(in: pacerStage, mouthwashDurationSec: mwDur)
            if pacerStage == .brushing {
                noteBrushingStageEnded()
                pacerBrushedFullTime = pacerElapsedSec >= GameConfig.brushAlongTotalSec - GameConfig.brushAlongFullBrushGraceSec
            }
            let endedAt = BrushEndTime.endedAt(now: Date(), overflowSec: overrun)
            pacerStageEndedAt = endedAt
            pacerAwaitingSince = endedAt
            // Hold at the stage's end (the clock reads 0:00); nothing carries into the next one.
            pacerClock = PacerSessionClock(rawSec: PacerSessionClock.stageEndSec(pacerStage, mouthwashDurationSec: mwDur))
        } else {
            pacerAwaitingSince = Date()
        }
        pacerAwaitingStage = next
        crumb(#"brush: \#(pacerStage.rawValue) ended, Start card for \#(next.rawValue)"#)
        storePendingBrush()
        // Back from a lock that outlasted the wait as well: finish now, without a card or a chime.
        if let since = pacerAwaitingSince, Date().timeIntervalSince(since) >= GameConfig.brushAlongStageWaitSec {
            completeBrushAlongSession(withFlossBonus: pacerCompletedFlossStage, withMouthwashBonus: false)
            return
        }
        pacerIsPaused = false
        pacerPausedByUser = false
        pacerSuspendedBySystem = false
        lastCountdownPipKey = ""
        pacerElapsedSec = pacerClock.elapsedSec(in: pacerStage, mouthwashDurationSec: mwDur)
        sceneController.pacerElapsedSec = pacerElapsedSec
        NativeSoundEngine.shared.setPaused(false)
        // One chime says the stage is over; the next stage's word comes with its Start.
        if chime {
            NativeSoundEngine.shared.playPacerSurfaceMotif(quadrant: .upperRight, surface: .outerCheek, isNewQuadrant: true)
        }
        updateIdleTimerPolicy()
    }

    /// The brush screen's two-tap "Floss ›": brushing ends now and floss starts (the tap is its
    /// start). A brush stopped before the 2 minutes is a "good try", as always.
    public func skipToFlossNow() {
        guard mode == .brushAlong, pacerStage == .brushing, pacerAwaitingStage == nil, !pacerIsPaused else { return }
        enterFlossBonusNow()
        // Kept on the device like a Start card's brush, so a closed app still pays it.
        pacerStageEndedAt = pacerBrushing?.endedAt
        storePendingBrush()
    }

    /// The Start card's Start: floss or rinse begins now, from 0.
    public func startAwaitingStage() {
        guard mode == .brushAlong, let next = pacerAwaitingStage else { return }
        switch next {
        case .flossBonus: enterFlossBonusNow()
        case .mouthwashBonus: enterMouthwashBonusNow(completedFloss: pacerCompletedFlossStage)
        case .brushing: break
        }
    }

    /// Skip floss (from its Start card or while flossing): on to the rinse's Start card when a
    /// grown-up included the rinse, else the brush is finished without floss.
    public func skipFloss() {
        guard mode == .brushAlong else { return }
        guard pacerAwaitingStage == .flossBonus || (pacerAwaitingStage == nil && pacerStage == .flossBonus) else { return }
        pacerCompletedFlossStage = false
        if includeRinse {
            holdForStart(.mouthwashBonus, chime: false)
        } else {
            completeBrushAlongSession(withFlossBonus: false, withMouthwashBonus: false)
        }
    }

    public func enterFlossBonusNow() {
        noteBrushingStageEnded()
        if pacerStage == .brushing {
            pacerBrushedFullTime = pacerElapsedSec >= GameConfig.brushAlongTotalSec - GameConfig.brushAlongFullBrushGraceSec
        }
        // Time already past the end of brushing (the phone was locked) carries into floss (H04).
        let mwDur = mouthwashDurationStyle.durationSec
        pacerClock.enter(.flossBonus, from: pacerStage, mouthwashDurationSec: mwDur)
        let passingThrough = pacerClock.overflowSec(in: .flossBonus, mouthwashDurationSec: mwDur) > 0
        crumb(#"brush: floss starts"#)
        pacerStage = .flossBonus
        pacerAwaitingStage = nil
        pacerAwaitingSince = nil
        pacerInFlossBonus = true
        pacerIsPaused = false
        pacerPausedByUser = false
        pacerSuspendedBySystem = false
        announcedFlossLowerHalf = false
        lastCountdownPipKey = ""
        pacerElapsedSec = pacerClock.elapsedSec(in: .flossBonus, mouthwashDurationSec: mwDur)
        sceneController.pacerElapsedSec = pacerElapsedSec
        sceneController.pacerInFlossBonus = true
        sceneController.pacerStage = .flossBonus
        sceneController.pacerFlossToolStyle = flossToolStyle
        lastPacerTickUptime = Self.pacerClockSec()
        NativeSoundEngine.shared.setPaused(false)
        NativeSoundEngine.shared.setPacerState(quadrantIdx: 3, inFlossBonus: true)
        // Back from a lock that also outlasted floss: pass through quietly, speak only where it is now.
        if !passingThrough {
            NativeSoundEngine.shared.playPacerSurfaceMotif(quadrant: .upperRight, surface: .outerCheek, isNewQuadrant: true)
            NativeSoundEngine.shared.speakCoachingPhrase(
                BrushCoachCopy.spokenStageWord(.floss, lang: coachLanguage)
            )
        }
        updateIdleTimerPolicy()
    }

    public func enterMouthwashBonusNow(completedFloss: Bool = true) {
        // A button of the brush screen let go while that screen fades out must not act on Home.
        guard mode == .brushAlong else { return }
        noteBrushingStageEnded()
        pacerCompletedFlossStage = completedFloss
        let mwDur = mouthwashDurationStyle.durationSec
        pacerClock.enter(.mouthwashBonus, from: pacerStage, mouthwashDurationSec: mwDur)
        let passingThrough = pacerClock.overflowSec(in: .mouthwashBonus, mouthwashDurationSec: mwDur) > 0
        crumb(#"brush: rinse starts"#)
        pacerStage = .mouthwashBonus
        pacerAwaitingStage = nil
        pacerAwaitingSince = nil
        pacerInFlossBonus = false
        pacerIsPaused = false
        pacerPausedByUser = false
        pacerSuspendedBySystem = false
        lastAnnouncedMouthwashStep = 0
        lastCountdownPipKey = ""
        mouthwashGyro = .idle
        sceneController.resetMouthwashGyroSession()
        pacerElapsedSec = pacerClock.elapsedSec(in: .mouthwashBonus, mouthwashDurationSec: mwDur)
        sceneController.pacerElapsedSec = pacerElapsedSec
        sceneController.pacerInFlossBonus = false
        sceneController.pacerStage = .mouthwashBonus
        sceneController.pacerMouthwashDurationSec = mwDur
        lastPacerTickUptime = Self.pacerClockSec()
        NativeSoundEngine.shared.setPaused(false)
        NativeSoundEngine.shared.setPacerState(quadrantIdx: 3, inFlossBonus: true, inRinse: true)
        if !passingThrough {
            NativeSoundEngine.shared.playMouthwashSwishMotif(stepIndex: 0)
            NativeSoundEngine.shared.speakCoachingPhrase(
                BrushCoachCopy.spokenStageWord(.rinse, lang: coachLanguage)
            )
        }
        updateIdleTimerPolicy()
    }

    /// `announce`: the spoken "Done" (left out when the player chose Home).
    public func completeBrushAlongSession(withFlossBonus: Bool, withMouthwashBonus: Bool = false, announce: Bool = true) {
        // Done or Skip held down while the timer ends the session, and let go during the fade to
        // Home, must not complete it a second time (two rewards, two Health entries).
        guard mode == .brushAlong else { return }
        noteBrushingStageEnded()
        // The timer may have run out while the app was away (H04): the brush ended then, not now.
        // It is paid for the day it ended, by the rule for a late Apple Watch brush.
        let now = Date()
        // Finished from a Start card: the brush ended when the last stage stopped, not at the tap.
        let endedAt = pacerAwaitingStage != nil
            ? (pacerStageEndedAt ?? now)
            : BrushEndTime.endedAt(
                now: now,
                overflowSec: pacerClock.overflowSec(in: pacerStage, mouthwashDurationSec: mouthwashDurationStyle.durationSec)
            )
        pacerAwaitingStage = nil
        pacerAwaitingSince = nil
        clearPendingBrush()
        stopPacerTimer()
        pacerIsPaused = false
        pacerPausedByUser = false
        pacerSuspendedBySystem = false
        NativeSoundEngine.shared.setPaused(false)
        let fullBrush = pacerBrushedFullTime
        crumb(#"brush finished: \#(fullBrush ? "full" : "good try")\#(withFlossBonus ? ", floss" : "")\#(withMouthwashBonus ? ", rinse" : "")"#)
        let outcome = saveSystem.recordBrushAlongCompletion(
            withFlossBonus: withFlossBonus,
            withMouthwashBonus: withMouthwashBonus,
            fullBrush: fullBrush,
            rinseStepOff: !includeRinse,
            date: now,
            rewardDay: BrushEndTime.rewardDay(endedAt: endedAt, now: now)
        )
        noteBrushEnded(at: endedAt, full: fullBrush)
        let healthBrush = pacerBrushing.map { (sec: $0.sec, endedAt: $0.endedAt, sessionId: pacerSessionId) }
        if healthLogOn, let b = healthBrush {
            HealthBrushLog.save(brushedSec: b.sec, endedAt: b.endedAt, sessionId: b.sessionId)
        }
        save = saveSystem.getSave()
        refreshReminders()
        sceneController.touchSystem.clearAll()
        sceneController.companionSmoothness = save.companion.smoothnessIndex
        // The completion fanfare and its haptic come from the pacerComplete event the save emits
        // (NativeSoundEngine and HapticsEngine listen), so they play once.
        transition(to: .hub)
        if announce {
            NativeSoundEngine.shared.speakCoachingPhrase(
                BrushCoachCopy.spokenStageWord(.done, lang: coachLanguage)
            )
        }
        if !healthLogOn, let b = healthBrush {
            offerHealthAfterBrush(sec: b.sec, endedAt: b.endedAt, sessionId: b.sessionId)
        }
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
        lastPacerTickUptime = Self.pacerClockSec()
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
        guard mode == .brushAlong else { return }
        if pacerAwaitingStage != nil {
            // A Start card: the clock waits. One left up too long finishes the brush with what was
            // done, so a brush walked away from is still saved.
            lastPacerTickUptime = Self.pacerClockSec()
            if let since = pacerAwaitingSince, Date().timeIntervalSince(since) >= GameConfig.brushAlongStageWaitSec {
                completeBrushAlongSession(withFlossBonus: pacerCompletedFlossStage, withMouthwashBonus: false)
            }
            return
        }
        guard !pacerIsPaused else { return }
        ensureIdleTimerDisabledIfNeeded()
        // Real time in full, including any time the phone spent locked since the last tick (H04).
        let now = Self.pacerClockSec()
        let dt = max(0.0, now - (lastPacerTickUptime ?? now))
        lastPacerTickUptime = now

        let flossEnd = GameConfig.brushAlongTotalSec + GameConfig.brushAlongFlossBonusSec
        let mwDur = mouthwashDurationStyle.durationSec
        let cap = PacerSessionClock.stageEndSec(pacerStage, mouthwashDurationSec: mwDur)
        pacerClock.advance(by: dt)
        pacerElapsedSec = pacerClock.elapsedSec(in: pacerStage, mouthwashDurationSec: mwDur)
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
                // Brushing done: floss waits for its Start tap.
                holdForStart(.flossBonus)
                return
            }
            checkpointBrushing()
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
                // Floss done: the rinse waits for its Start tap, or finish when a grown-up left it out.
                if includeRinse {
                    pacerCompletedFlossStage = true
                    holdForStart(.mouthwashBonus)
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
            // Noted before, and after when it was slow: bringing the sound back talks to the
            // system's audio service and is the one step here that can take long.
            crumb(#"app active"#)
            AppDiagnostics.shared.sceneBecameActive()
            let soundBegan = ProcessInfo.processInfo.systemUptime
            NativeSoundEngine.shared.resumeFromForeground()
            let soundMs = Int((ProcessInfo.processInfo.systemUptime - soundBegan) * 1000)
            if soundMs >= 100 { crumb(#"sound came back in \#(soundMs) ms"#) }
            refreshReminders()
            // Health access taken away in Settings meanwhile: show it as off (the heart comes back).
            if healthLogOn && !HealthBrushLog.isAllowed { healthLogOn = false }
            healthAskMayShow()
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
            if mode == .brushAlong && !pacerIsPaused {
                // The session clock ran on while locked (H04): bring the sound back and catch up
                // now. The ticks pass through any stages that ended meanwhile, speaking only the
                // current cue (or Done).
                NativeSoundEngine.shared.setPaused(false)
                if pacerTimer == nil {
                    startPacerTimer()
                }
                tickPacer()
            }
            updateIdleTimerPolicy()

        case .inactive:
            // Do NOT pause Brush-Along or drop wake-lock on momentary notification banners / Control Center peeks!
            AppDiagnostics.shared.sceneBecameInactive()

        case .background:
            crumb(#"app in background"#)
            if mode == .brushAlong && !pacerIsPaused {
                // Locked or in the background, the ritual keeps its time (H04); only the sound and
                // the stay-awake stop. Brushing goes on at the sink.
                NativeSoundEngine.shared.setPaused(true)
            }
            // The system may end the app while it is away: keep what was brushed so far.
            checkpointBrushing(force: true)
            _ = saveSystem.save()
            setIdleTimerDisabled(false)
            // Last: the app has left the screen in good order.
            AppDiagnostics.shared.sceneWentToBackground()

        @unknown default:
            break
        }
    }

    private func updateIdleTimerPolicy() {
        // Awake for the hands-free brush, and for a city finale or the ending: neither needs a
        // touch, so the screen would dim and lock. (The web edition's wake lock is in `ClockController`.)
        // A Start card may wait a while for the floss or mouthwash: the screen may sleep meanwhile.
        let keepAwake = (mode == .brushAlong && !pacerIsPaused && pacerAwaitingStage == nil) || finale != nil
        setIdleTimerDisabled(keepAwake)
    }

    private func ensureIdleTimerDisabledIfNeeded() {
        #if os(iOS)
        if mode == .brushAlong && !pacerIsPaused && pacerAwaitingStage == nil && !UIApplication.shared.isIdleTimerDisabled {
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
        applyAutomaticQuality()
    }

    /// Automatic quality, from how warm the device is and Low Power Mode (`QualityGovernor`).
    private func automaticQualityTier() -> QualityTier {
        let info = ProcessInfo.processInfo
        let heat: QualityGovernor.Heat
        switch info.thermalState {
        case .nominal: heat = .nominal
        case .fair: heat = .fair
        case .serious: heat = .serious
        case .critical: heat = .critical
        @unknown default: heat = .fair
        }
        return QualityGovernor.tier(heat: heat, lowPowerMode: info.isLowPowerModeEnabled)
    }

    /// Sets the picture's quality for the screen about to show. Called at launch and on every
    /// change of screen, never during play (see `QualityGovernor`).
    private func applyAutomaticQuality() {
        let tier = save.qualityPreference.explicitTier ?? automaticQualityTier()
        if sceneController.qualityTier != tier {
            crumb(#"picture quality \#(sceneController.qualityTier.rawValue) -> \#(tier.rawValue)"#)
            sceneController.qualityTier = tier
        }
        if pictureQuality != tier { pictureQuality = tier }
    }

    public func updateAudio(muted: Bool, music: Float, sfx: Float) {
        NativeSoundEngine.shared.setMuted(muted)
        NativeSoundEngine.shared.setMusicVolume(music)
        NativeSoundEngine.shared.setSfxVolume(sfx)
    }

    /// Settings' "Less Camera Motion": applies the choice and remembers it for the next launch
    /// (web twin: `SceneManager.setReducedMotion`).
    public func setReducedMotion(_ on: Bool) {
        reducedMotion = on
        UserDefaults.standard.set(on, forKey: Self.reduceMotionDefaultsKey)
    }

    /// The system's Reduce Motion setting changed: the game follows it at once. It is never
    /// stored, and switching it off does not undo "Less Camera Motion" chosen in Settings here.
    public func systemReduceMotionChanged(_ reduce: Bool) {
        reducedMotion = reduce || UserDefaults.standard.bool(forKey: Self.reduceMotionDefaultsKey)
    }

    /// What Erase Save removes from this device besides the save itself: the widget's last-brush
    /// times, every "seen" flag (the brush intro card, How to Play, the one-time hints with the
    /// first-city coach) and the grown-up choices (the rinse step and its length, the floss tool,
    /// reminders and their times, Apple Health).
    private static let erasedDefaultsKeys: [String] = [
        lastBrushDefaultsKey, lastFullBrushDefaultsKey,
        brushIntroSeenDefaultsKey,
        tutorialOffersDefaultsKey, tutorialOpenedDefaultsKey, tutorialEditionDefaultsKey,
        hintsStorageKey,
        includeRinseDefaultsKey, mouthwashDurationDefaultsKey, flossToolDefaultsKey,
        remindersOnDefaultsKey, reminderMorningDefaultsKey, reminderEveningDefaultsKey,
        healthLogDefaultsKey, healthAskedDefaultsKey, pendingBrushDefaultsKey,
    ]

    /// Settings' "Erase Save", after a grown-up's question and a second tap: the app is as it was
    /// on first launch. The privacy notice promises it ("You can erase all saved data at any time
    /// in Settings"). Web twin: `#btn-reset-save` in CompanionHubOverlay.ts.
    ///
    /// Kept are only the comfort settings (sound, language and voice, Less Camera Motion, the
    /// whole-mouth panel) and the Apple Watch's pay-once ledger with its settings counter, so a
    /// watch brush already paid is not paid again into the fresh save and the watch still obeys
    /// "rinse off". Brushes already written to Apple Health stay there: the app cannot read them.
    public func eraseSave() {
        NativeSoundEngine.shared.playUiTap()
        // The sheet goes first: its fields still hold the old name.
        activeSheet = nil

        // What the device remembers outside the save, in storage and in memory alike.
        for key in Self.erasedDefaultsKeys {
            UserDefaults.standard.removeObject(forKey: key)
        }
        // A test build's diary of what the app was doing goes too ("erase all saved data").
        AppDiagnostics.shared.eraseEverything()
        seenHints = []
        coach = nil
        tutorialGate = TutorialGate()
        pendingDiveAfterTutorial = nil
        includeRinse = false
        flossToolStyle = .flossPick
        sceneController.pacerFlossToolStyle = flossToolStyle
        mouthwashDurationStyle = .totalCare60s
        sceneController.pacerMouthwashDurationSec = mouthwashDurationStyle.durationSec
        remindersOn = false
        reminderMorning = BrushDays.defaultMorning
        reminderEvening = BrushDays.defaultEvening
        healthLogOn = false
        healthAsked = false
        healthAskDue = false
        lastBrushForHealth = nil

        // The save and every copy of it. Taking the fresh save rewrites the widgets' snapshot from
        // it (the last-brush times are already gone); forgetting the last one written makes sure
        // it is written even if it reads the same.
        lastWidgetSnapshot = nil
        save = saveSystem.eraseAllSavedData()
        sceneController.companionSmoothness = save.companion.smoothnessIndex
        sceneController.companionAcidStress = save.companion.pulpIntegrity < 50 ? 0.5 : 0.0
        sceneController.touchSystem.clearAll()
        selectedWorldId = "world_1"

        // No reminder is left waiting, and the watch hears that the rinse step is off again.
        refreshReminders()
        pushWatchSettings()

        // Home greets a new player: How to Play is offered again, as on a first launch.
        if mode == .hub {
            enterHomeForTutorial()
        } else {
            showTutorialOffer = false
        }
        showHubToast("Save erased. You are starting fresh!")
    }

    public func importSyncCode(_ code: String) -> Result<Void, Error> {
        importSyncCode(code, preferImported: false)
    }

    private func importSyncCode(_ code: String, preferImported: Bool) -> Result<Void, Error> {
        do {
            // Merge, never overwrite: an older code must not erase this device's newer progress.
            save = try saveSystem.importSyncCode(code, preferImported: preferImported)
            sceneController.companionSmoothness = save.companion.smoothnessIndex
            // Today's brushes may have come with the code: drop reminders that are now done (M20).
            refreshReminders()
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

    /// The stage's toast keeps its own timer: a Home toast must never leave a stage toast stuck.
    private func showArcadeToast(_ text: String, seconds: Double = 2.8) {
        arcadeToast = L10n.t(text)
        arcadeToastClearTask?.cancel()
        arcadeToastClearTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            if !Task.isCancelled { self.arcadeToast = nil }
        }
    }
}
