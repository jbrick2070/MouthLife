import Foundation
import MouthLifeCore
import Observation
import WatchConnectivity
import WatchKit

/// Runs the brushing ritual on the watch: the clock, the taps on the wrist, the phone's songs, the "self care" runtime
/// that keeps it going with the wrist down, a checkpoint to resume after an interruption, and the
/// trip of each finished brush to the iPhone (which turns it into the reward).
@MainActor
@Observable
final class WatchController: NSObject {
    /// What the faces show: a copy of the running ritual, updated once a second and at every change
    /// (so the watch is not redrawing ten times a second).
    private(set) var ritual: WatchRitual?
    /// When `ritual` was last updated, so the face can look ahead from it (see `ritual(at:)`).
    @ObservationIgnored private var ritualShownAt = Date()
    /// The running ritual itself, ticked ten times a second.
    @ObservationIgnored private var engine: WatchRitual?
    private(set) var settings = WatchPhoneSettings()
    /// Whether the MouthLife iPhone app is on the paired phone (if not, brushes stay on the watch).
    private(set) var companionInstalled = false
    private(set) var ack: WatchBrushAck?
    private(set) var resumable: WatchRitual?
    private(set) var outbox: [WatchBrushRecord] = []
    var showControls = false
    private(set) var armed: String?
    /// The last update moved the clock on by more than a second (a stalled tick): the brush jumps
    /// to its tooth instead of gliding across several.
    private(set) var skippedAhead = false

    var language: CoachLanguage { settings.language ?? CoachLanguage.detectSystemDefault() }

    // Not watched by the faces: `tick()` writes the clock ten times a second, and a face that read
    // it through `ritual(at:)` would be rebuilt every tick instead of once a second.
    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private var lastTick: TimeInterval?
    @ObservationIgnored private var runtime: WKExtendedRuntimeSession?
    @ObservationIgnored private var lastCheckpoint: TimeInterval = 0
    @ObservationIgnored private var armTask: Task<Void, Never>?
    /// Ends the runtime a moment after Done, so "Done" and the song's fade finish with the wrist down.
    @ObservationIgnored private var endRuntimeTask: Task<Void, Never>?
    /// The phone's brush, floss and rinse songs, following the ritual.
    @ObservationIgnored private let music = WatchMusic()
    /// One spoken word per change, like the phone's coach.
    @ObservationIgnored private let voice = WatchVoice()

    private static let ritualKey = "mouthlife.watch.ritual"
    private static let savedAtKey = "mouthlife.watch.ritualSavedAt"
    private static let outboxKey = "mouthlife.watch.outbox"
    private static let settingsKey = "mouthlife.watch.settings"
    /// An interrupted brush can be resumed for this long after it was last saved.
    private static let resumeWindow: TimeInterval = 30 * 60
    /// Brushes kept for the iPhone at most (and for at most a month).
    private static let outboxLimit = 50
    private static let outboxMaxAge: TimeInterval = 30 * 86_400

    override init() {
        super.init()
        load()
        activateSession()
    }

    // MARK: - The ritual

    func start() {
        WatchLog.note("start")
        ack = nil
        resumable = nil
        clearCheckpoint()
        set(WatchRitual(includeRinse: settings.includeRinse, rinseSec: settings.rinseSec))
        play(.stageStart(.brushing))
        speak(.stageStart(.brushing))
        run()
    }

    /// Changes the running ritual and shows it at once.
    private func set(_ r: WatchRitual?) {
        engine = r
        ritual = r
        ritualShownAt = Date()
        if skippedAhead { skippedAhead = false }
        music.follow(r)
    }

    /// The ritual as it will be at `date` (a frame the dimmed screen draws ahead of time). Only while
    /// the clock is really running: if its ticks have stalled, the face shows what is known, not a
    /// guess that would snap back.
    func ritual(at date: Date) -> WatchRitual? {
        guard let r = ritual, timer != nil, let last = lastTick,
              ProcessInfo.processInfo.systemUptime - last < 3 else { return ritual }
        return r.projected(by: date.timeIntervalSince(ritualShownAt))
    }

    func resume() {
        guard var r = resumable else { return }
        resumable = nil
        _ = r.setPaused(false)
        set(r)
        play(.stageStart(.brushing))
        run()
    }

    func togglePause() {
        guard var r = engine else { return }
        let cue = r.setPaused(!r.paused)
        set(r)
        if let cue { play(cue) }
        if r.paused {
            stopClock()
            voice.stop()
            // let the self-care runtime go while paused (it lasts 10 minutes from its start, and
            // keeps the app awake); Resume is a tap, so a fresh one starts then
            endRuntime()
            checkpoint(force: true)
        } else {
            run()
        }
        showControls = false
    }

    /// Next, Skip and End ask for a second tap within a few seconds.
    func tapNext() { confirm("next") { r in r.next() } }
    func tapSkip() { confirm("skip") { r in r.skip() } }
    func tapEnd() { confirm("end") { r in r.end() } }

    func openControls() {
        armed = nil
        showControls = true
    }

    func closeControls() {
        armed = nil
        showControls = false
    }

    /// Back to the start screen after Done.
    func close() {
        set(nil)
        voice.stop()
        ack = nil
        showControls = false
    }

    /// The app came to the front: anything still waiting for the iPhone goes again.
    func cameForward() {
        flushOutbox()
    }

    /// The app left the front. With the self-care runtime the brush carries on with the wrist down;
    /// without it (it could not start, or was lost) the clock would stop mid-brush, so pause and keep it.
    func wentBackground() {
        guard runtime?.state != .running, var r = engine, r.stage != .done, !r.paused else { return }
        WatchLog.note("background without runtime: pausing")
        _ = r.setPaused(true)
        set(r)
        stopClock()
        voice.stop()
        checkpoint(force: true)
    }

    private func confirm(_ what: String, _ action: (inout WatchRitual) -> WatchCue?) {
        guard armed == what else {
            armed = what
            armTask?.cancel()
            armTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(3))
                if !Task.isCancelled { self?.armed = nil }
            }
            WKInterfaceDevice.current().play(.click)
            return
        }
        armed = nil
        armTask?.cancel()
        guard var r = engine else { return }
        let cue = action(&r)
        set(r)
        showControls = false
        handle(cue)
        if r.stage != .done && !r.paused { run() }
    }

    private func run() {
        beginRuntime()
        if timer == nil {
            lastTick = ProcessInfo.processInfo.systemUptime
            let t = Timer(timeInterval: 0.1, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated { self?.tick() }
            }
            // a little slack lets watchOS group the wake-ups (cues still land within ~0.1 s)
            t.tolerance = 0.02
            RunLoop.main.add(t, forMode: .common)
            timer = t
        }
    }

    private func tick() {
        guard var r = engine, r.stage != .done else { return stopClock() }
        let now = ProcessInfo.processInfo.systemUptime
        // A short stall still counts (the child kept brushing), but a long gap while the app was away
        // never does: at most 2.5 seconds a tick.
        let gap = now - (lastTick ?? now)
        let dt = min(2.5, max(0, gap))
        lastTick = now
        if gap > 1 { WatchLog.note(String(format: "tick gap %.1fs at %@ %.1f", gap, r.stage.rawValue, r.stageElapsed)) }
        if Int(r.stageElapsed + dt) / 10 != Int(r.stageElapsed) / 10 {
            WatchLog.note(String(format: "alive %@ %.1f runtime=%@", r.stage.rawValue, r.stageElapsed + dt, runtimeState))
        }
        let cue = r.advance(by: dt)
        engine = r
        // show it once a second (the clock and the pacer dot), and at once when something changes
        let shown = ritual
        if cue != nil || shown?.stage != r.stage || shown?.paused != r.paused
            || Int(r.stageElapsed) != Int(shown?.stageElapsed ?? -1) {
            // a Done, Skip or End armed for the stage that just ended must not land on the next one
            if shown?.stage != r.stage, armed != nil {
                armed = nil
                armTask?.cancel()
            }
            let jumped = shown?.stage == r.stage && r.stageElapsed - (shown?.stageElapsed ?? r.stageElapsed) > 1.5
            if skippedAhead != jumped { skippedAhead = jumped }
            ritual = r
            ritualShownAt = Date()
            music.follow(r)
        }
        handle(cue)
        checkpoint(force: false)
    }

    private func handle(_ cue: WatchCue?) {
        guard let cue else { return }
        play(cue)
        speak(cue)
        if case .stageStart = cue { checkpoint(force: true) }
        if case .done = cue { finish() }
    }

    private func finish() {
        stopClock()
        endRuntimeSoon()
        ritual = engine
        guard let record = engine?.record else { return clearCheckpoint() }
        // saved for the iPhone first, then the checkpoint cleared: a crash in between loses nothing
        // (and `load()` drops a checkpoint whose brush is already in the outbox)
        if !outbox.contains(where: { $0.sessionId == record.sessionId }) {
            outbox.append(record)
            trimOutbox()
            saveOutbox()
        }
        clearCheckpoint()
        flushOutbox()
    }

    private func stopClock() {
        timer?.invalidate()
        timer = nil
        lastTick = nil
    }

    // MARK: - Taps on the wrist

    private func play(_ cue: WatchCue) {
        let device = WKInterfaceDevice.current()
        switch cue {
        case .stageStart, .resume: device.play(.start)
        case .surface, .rinseStep, .countdown: device.play(.click)
        case .quadrant: device.play(.directionUp)
        case .flossHalfway: device.play(.directionDown)
        case .done: device.play(.success)
        case .pause: device.play(.stop)
        }
    }

    /// The spoken word for a change: "Brush" at the start (the card says it too), the quarter
    /// numbers, then "Floss", "Rinse", "Done". The song dips while it speaks.
    private func speak(_ cue: WatchCue) {
        let lang = language
        let text: String
        switch cue {
        case .stageStart(.brushing): text = WatchCopy.word(.brush, lang)
        case .quadrant:
            guard let q = engine?.phase.quadrant else { return }
            text = BrushCoachCopy.spokenQuadrantNumber(q, lang: lang)
        case .stageStart(.floss): text = BrushCoachCopy.spokenStageWord(.floss, lang: lang)
        case .stageStart(.rinse): text = BrushCoachCopy.spokenStageWord(.rinse, lang: lang)
        case .done: text = BrushCoachCopy.spokenStageWord(.done, lang: lang)
        default: return
        }
        music.duck()
        voice.say(text, lang)
    }

    // MARK: - Runtime with the wrist down (the "self care" session Apple lists for tooth-brushing)

    private func beginRuntime() {
        endRuntimeTask?.cancel()
        endRuntimeTask = nil
        if let runtime, runtime.state == .running || runtime.state == .scheduled { return }
        let session = WKExtendedRuntimeSession()
        session.delegate = self
        session.start()
        runtime = session
        WatchLog.note("runtime start requested, state=\(session.state.rawValue)")
    }

    private var runtimeState: String {
        guard let runtime else { return "none" }
        return "\(runtime.state.rawValue)"
    }

    private func endRuntime() {
        endRuntimeTask?.cancel()
        endRuntimeTask = nil
        runtime?.invalidate()
        runtime = nil
    }

    /// Ends the runtime once "Done" has been said and the song has faded (a new brush started in
    /// the meantime keeps it).
    private func endRuntimeSoon() {
        endRuntimeTask?.cancel()
        guard let session = runtime else { return }
        endRuntimeTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2.5))
            guard !Task.isCancelled, let self, self.runtime === session else { return }
            self.endRuntime()
        }
    }

    /// Whether a runtime callback is about the session in use now (not one already let go).
    fileprivate func isCurrentRuntime(_ id: ObjectIdentifier) -> Bool {
        guard let runtime else { return false }
        return ObjectIdentifier(runtime) == id
    }

    /// The runtime ended early (the child left the app, or time ran out): pause and keep the
    /// progress so it can be resumed.
    fileprivate func runtimeEnded() {
        WatchLog.note("runtime ended: pausing")
        runtime = nil
        guard var r = engine, r.stage != .done else { return }
        if !r.paused {
            _ = r.setPaused(true)
            set(r)
        }
        stopClock()
        voice.stop()
        checkpoint(force: true)
    }

    /// The runtime could not start, or ended without taking the app away: carry on while it is open.
    fileprivate func runtimeLost() {
        WatchLog.note("runtime lost: carrying on while open")
        runtime = nil
    }

    // MARK: - Checkpoint, so an interrupted brush can carry on

    private func checkpoint(force: Bool) {
        let now = ProcessInfo.processInfo.systemUptime
        guard force || now - lastCheckpoint > 5, let r = engine, r.stage != .done else { return }
        lastCheckpoint = now
        if let data = try? JSONEncoder().encode(r) {
            UserDefaults.standard.set(data, forKey: Self.ritualKey)
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: Self.savedAtKey)
        }
    }

    private func clearCheckpoint() {
        UserDefaults.standard.removeObject(forKey: Self.ritualKey)
        UserDefaults.standard.removeObject(forKey: Self.savedAtKey)
    }

    private func load() {
        let defaults = UserDefaults.standard
        if let data = defaults.data(forKey: Self.settingsKey), let s = try? JSONDecoder().decode(WatchPhoneSettings.self, from: data) {
            settings = s
        }
        if let data = defaults.data(forKey: Self.outboxKey), let o = try? JSONDecoder().decode([WatchBrushRecord].self, from: data) {
            outbox = o
            trimOutbox()
        }
        if let data = defaults.data(forKey: Self.ritualKey), var r = try? JSONDecoder().decode(WatchRitual.self, from: data) {
            let savedAt = defaults.object(forKey: Self.savedAtKey) as? Double
            let since = savedAt.map { Date().timeIntervalSince1970 - $0 } ?? Date().timeIntervalSince(r.startedAt)
            let alreadyFinished = outbox.contains { $0.sessionId == r.sessionId.uuidString }
            if r.stage != .done && since < Self.resumeWindow && !alreadyFinished {
                _ = r.setPaused(true)
                resumable = r
            } else {
                clearCheckpoint()
            }
        }
    }

    /// Keeps the outbox small: the newest brushes, at most a month old.
    private func trimOutbox() {
        let cutoff = Date().addingTimeInterval(-Self.outboxMaxAge)
        outbox.removeAll { $0.completedAt < cutoff }
        if outbox.count > Self.outboxLimit { outbox.removeFirst(outbox.count - Self.outboxLimit) }
    }

    private func saveOutbox() {
        if let data = try? JSONEncoder().encode(outbox) {
            UserDefaults.standard.set(data, forKey: Self.outboxKey)
        }
    }

    // MARK: - The iPhone

    private func activateSession() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// Queues a finished brush for the iPhone (delivered whenever it is in reach; resent until it
    /// answers, and the iPhone pays each session id only once).
    private func send(_ record: WatchBrushRecord) {
        let session = WCSession.default
        guard WCSession.isSupported(), session.activationState == .activated else { return }
        let queued = session.outstandingUserInfoTransfers.contains { ($0.userInfo["id"] as? String) == record.sessionId }
        if !queued { session.transferUserInfo(record.dictionary) }
    }

    /// Sends every brush still waiting for the iPhone's answer (one already queued is not queued twice).
    private func flushOutbox() {
        for record in outbox { send(record) }
    }

    fileprivate func sessionReady(companionInstalled: Bool) {
        self.companionInstalled = companionInstalled
        flushOutbox()
    }

    fileprivate func received(_ settings: WatchPhoneSettings) {
        guard settings.revision >= self.settings.revision else { return }
        self.settings = settings
        if let data = try? JSONEncoder().encode(settings) {
            UserDefaults.standard.set(data, forKey: Self.settingsKey)
        }
    }

    fileprivate func received(_ ack: WatchBrushAck) {
        outbox.removeAll { $0.sessionId == ack.sessionId }
        saveOutbox()
        if engine?.sessionId.uuidString == ack.sessionId { self.ack = ack }
    }
}

extension WatchController: WKExtendedRuntimeSessionDelegate {
    nonisolated func extendedRuntimeSessionDidStart(_ extendedRuntimeSession: WKExtendedRuntimeSession) {
        Task { @MainActor in WatchLog.note("runtime didStart") }
    }

    nonisolated func extendedRuntimeSessionWillExpire(_ extendedRuntimeSession: WKExtendedRuntimeSession) {
        let id = ObjectIdentifier(extendedRuntimeSession)
        Task { @MainActor in
            WatchLog.note("runtime willExpire")
            // only the session in use now (a newer one may have replaced it)
            guard self.isCurrentRuntime(id) else { return }
            self.runtimeEnded()
        }
    }

    nonisolated func extendedRuntimeSession(_ extendedRuntimeSession: WKExtendedRuntimeSession, didInvalidateWith reason: WKExtendedRuntimeSessionInvalidationReason, error: Error?) {
        // Pause only when the watch really took the app away (time ran out, the child left the app, or
        // the system stopped it); if the session merely could not start, carry on while it is open.
        let tookAway = reason == .expired || reason == .resignedFrontmost || reason == .suppressedBySystem
        let id = ObjectIdentifier(extendedRuntimeSession)
        let why = "runtime invalidated reason=\(reason.rawValue) error=\(error.map { "\($0)" } ?? "none")"
        Task { @MainActor in
            WatchLog.note(why)
            // our own invalidate at the end of a ritual is not an interruption
            guard self.isCurrentRuntime(id) else { return }
            if tookAway { self.runtimeEnded() } else { self.runtimeLost() }
        }
    }
}

extension WatchController: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        // the session's state can be read only once it is active
        guard activationState == .activated else {
            Task { @MainActor in WatchLog.note("watch session not activated: \(activationState.rawValue)") }
            return
        }
        let context = WatchPhoneSettings(dictionary: session.receivedApplicationContext)
        let installed = session.isCompanionAppInstalled
        Task { @MainActor in
            if let context { self.received(context) }
            self.sessionReady(companionInstalled: installed)
        }
    }

    nonisolated func sessionCompanionAppInstalledDidChange(_ session: WCSession) {
        let installed = session.isCompanionAppInstalled
        Task { @MainActor in self.sessionReady(companionInstalled: installed) }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        guard let settings = WatchPhoneSettings(dictionary: applicationContext) else { return }
        Task { @MainActor in self.received(settings) }
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard let ack = WatchBrushAck(dictionary: userInfo) else { return }
        Task { @MainActor in self.received(ack) }
    }
}
