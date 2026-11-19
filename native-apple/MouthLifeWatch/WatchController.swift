import Foundation
import MouthLifeCore
import Observation
import WatchConnectivity
import WatchKit

/// Runs the brushing ritual on the watch: the clock, the taps on the wrist, the "self care" runtime
/// that keeps it going with the wrist down, a checkpoint to resume after an interruption, and the
/// trip of each finished brush to the iPhone (which turns it into the reward).
@MainActor
@Observable
final class WatchController: NSObject {
    /// What the faces show: a copy of the running ritual, updated once a second and at every change
    /// (so the watch is not redrawing ten times a second).
    private(set) var ritual: WatchRitual?
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

    var language: CoachLanguage { settings.language ?? CoachLanguage.detectSystemDefault() }

    private var timer: Timer?
    private var lastTick: TimeInterval?
    private var runtime: WKExtendedRuntimeSession?
    private var lastCheckpoint: TimeInterval = 0
    private var armTask: Task<Void, Never>?

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
        ack = nil
        resumable = nil
        clearCheckpoint()
        set(WatchRitual(includeRinse: settings.includeRinse, rinseSec: settings.rinseSec))
        play(.stageStart(.brushing))
        run()
    }

    /// Changes the running ritual and shows it at once.
    private func set(_ r: WatchRitual?) {
        engine = r
        ritual = r
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
        ack = nil
        showControls = false
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
            RunLoop.main.add(t, forMode: .common)
            timer = t
        }
    }

    private func tick() {
        guard var r = engine, r.stage != .done else { return stopClock() }
        let now = ProcessInfo.processInfo.systemUptime
        // A short stall still counts (the child kept brushing), but a long gap while the app was away
        // never does: at most 2.5 seconds a tick.
        let dt = min(2.5, max(0, now - (lastTick ?? now)))
        lastTick = now
        let cue = r.advance(by: dt)
        engine = r
        // show it once a second (the clock and the pacer dot), and at once when something changes
        let shown = ritual
        if cue != nil || shown?.stage != r.stage || shown?.paused != r.paused
            || Int(r.stageElapsed) != Int(shown?.stageElapsed ?? -1) {
            ritual = r
        }
        handle(cue)
        checkpoint(force: false)
    }

    private func handle(_ cue: WatchCue?) {
        guard let cue else { return }
        play(cue)
        if case .stageStart = cue { checkpoint(force: true) }
        if case .done = cue { finish() }
    }

    private func finish() {
        stopClock()
        endRuntime()
        ritual = engine
        guard let record = engine?.record else { return clearCheckpoint() }
        // saved for the iPhone first, then the checkpoint cleared: a crash in between loses nothing
        if !outbox.contains(where: { $0.sessionId == record.sessionId }) {
            outbox.append(record)
            trimOutbox()
            saveOutbox()
        }
        clearCheckpoint()
        send(record)
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

    // MARK: - Runtime with the wrist down (the "self care" session Apple lists for tooth-brushing)

    private func beginRuntime() {
        if let runtime, runtime.state == .running || runtime.state == .scheduled { return }
        let session = WKExtendedRuntimeSession()
        session.delegate = self
        session.start()
        runtime = session
    }

    private func endRuntime() {
        runtime?.invalidate()
        runtime = nil
    }

    /// The runtime ended early (the child left the app, or time ran out): pause and keep the
    /// progress so it can be resumed.
    fileprivate func runtimeEnded() {
        runtime = nil
        guard var r = engine, r.stage != .done else { return }
        if !r.paused {
            _ = r.setPaused(true)
            set(r)
        }
        stopClock()
        checkpoint(force: true)
    }

    /// The runtime could not start, or ended without taking the app away: carry on while it is open.
    fileprivate func runtimeLost() {
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
            if r.stage != .done && since < Self.resumeWindow {
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

    fileprivate func sessionReady(companionInstalled: Bool) {
        self.companionInstalled = companionInstalled
        for record in outbox { send(record) }
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
    nonisolated func extendedRuntimeSessionDidStart(_ extendedRuntimeSession: WKExtendedRuntimeSession) {}

    nonisolated func extendedRuntimeSessionWillExpire(_ extendedRuntimeSession: WKExtendedRuntimeSession) {
        Task { @MainActor in self.runtimeEnded() }
    }

    nonisolated func extendedRuntimeSession(_ extendedRuntimeSession: WKExtendedRuntimeSession, didInvalidateWith reason: WKExtendedRuntimeSessionInvalidationReason, error: Error?) {
        // Pause only when the watch really took the app away (time ran out, the child left the app, or
        // the system stopped it); if the session merely could not start, carry on while it is open.
        let tookAway = reason == .expired || reason == .resignedFrontmost || reason == .suppressedBySystem
        let id = ObjectIdentifier(extendedRuntimeSession)
        Task { @MainActor in
            // our own invalidate at the end of a ritual is not an interruption
            guard let runtime = self.runtime, ObjectIdentifier(runtime) == id else { return }
            if tookAway { self.runtimeEnded() } else { self.runtimeLost() }
        }
    }
}

extension WatchController: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
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
