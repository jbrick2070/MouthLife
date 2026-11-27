import CoreTransferable
import Foundation
import MouthLifeCore
import os
import UniformTypeIdentifiers
#if os(iOS)
import AVFAudio
import MetricKit
import UIKit
#endif

/// Adds a line to the test diary (`TestDiary`): what the app is doing right now, in a few words.
/// Cheap and safe from any thread, but never call it from the render thread's per-frame update or
/// from the audio thread (it builds a string).
func crumb(_ text: @autoclosure () -> String) {
    // Not a test build: the text is never even put together.
    guard AppDiagnostics.isTestBuild else { return }
    AppDiagnostics.shared.diary.note(text())
}

/// Finds out where the app freezes or dies, on the device and without sending anything anywhere.
///
/// A beta tester's phone stopped answering three times and nobody could say on which screen
/// (November 2026): the app kept no trace. Now it keeps four:
/// - the diary: screens, brush stages, sound and system events, each with its time;
/// - a watchdog on its own thread that writes a HANG line when the main thread has not answered
///   for 2 s (and again at 10 s and 30 s), with what the app was last doing;
/// - a mark that the last run ended while it was on screen (a crash, or closed while frozen);
/// - the system's own crash and hang reports (MetricKit), which carry call stacks and arrive at a
///   later launch.
///
/// All of it only in test builds (TestFlight and development). The App Store build keeps no diary,
/// runs no watchdog and saves no reports: its privacy policy says the app collects no usage data,
/// and that stays true in the plainest sense. A tester shares the diary as one text file from
/// Settings; it holds no personal data, the app still has no network code, and Erase Save
/// erases it with everything else.
final class AppDiagnostics: NSObject, @unchecked Sendable {
    static let shared = AppDiagnostics()

    let diary: TestDiary
    private let directory: URL?
    private let watch = OSAllocatedUnfairLock(initialState: MainThreadWatch())
    /// The watchdog's thread, and the one place the system's reports are written and thinned.
    private let watchQueue = DispatchQueue(label: "org.mouthlife.mainwatch", qos: .utility)
    private var watchTimer: DispatchSourceTimer?
    // Main thread only.
    private var started = false
    private var lastFpsBucket = -1
    private var lastFpsNoteUptime: Double = -100
    private var latestFps = 0
    private var fpsRecheckPending = false

    private static let foregroundBuildKey = "mouthlife.diag.foregroundBuild"
    private static let reportPrefix = "report-"
    private static let reportsKept = 3

    /// The first use, from anywhere, opens this launch's part of the diary: the header is its
    /// first line whatever else is noted first (the sound engine starts before the coordinator).
    private override init() {
        let dir = Self.isTestBuild ? TestDiary.defaultDirectory() : nil
        directory = dir
        diary = TestDiary(fileURL: dir?.appendingPathComponent("diary.txt"))
        super.init()
        guard Self.isTestBuild else { return }
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let info = ProcessInfo.processInfo
        diary.note(
            "=== launch • MouthLife \(version) (\(Self.buildNumber)) • \(Self.deviceModel()) • \(info.operatingSystemVersionString)"
                + " • heat \(Self.name(info.thermalState)) • low power \(info.isLowPowerModeEnabled ? "on" : "off")"
        )
        #if os(iOS)
        // Set while the app is on screen, taken away when it leaves: still there now means the
        // last run never got to leave. (Not on the Mac: quitting there does not pass through the
        // background.)
        if let previous = UserDefaults.standard.string(forKey: Self.foregroundBuildKey) {
            UserDefaults.standard.removeObject(forKey: Self.foregroundBuildKey)
            diary.note("the last run (build \(previous)) ended while it was on screen: a crash, or closed while frozen")
        }
        #endif
    }

    /// TestFlight and development builds: the only ones that show "Share test diary".
    static let isTestBuild: Bool = {
        #if DEBUG
        return true
        #elseif os(iOS)
        return Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
        #else
        return false
        #endif
    }()

    private static var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
    }

    // MARK: - Start

    /// Once, at launch, from the main thread: starts listening to the system and the watchdog.
    func start() {
        guard Self.isTestBuild, !started else { return }
        started = true
        observeSystem()
        #if os(iOS)
        MXMetricManager.shared.add(self)
        #endif
        startWatch()
    }

    // MARK: - On screen or not

    /// The app is on screen and taking touches. Main thread.
    func sceneBecameActive() {
        guard Self.isTestBuild else { return }
        #if os(iOS)
        UserDefaults.standard.set(Self.buildNumber, forKey: Self.foregroundBuildKey)
        #endif
        watch.withLock { $0.setArmed(true) }
    }

    /// A banner, Control Center or the app switcher is over the app. It may be swiped away from
    /// here without ever reaching the background, so the mark goes now: what it then catches is
    /// a run that died while really in use (a frozen app cannot get here to take it away).
    /// Main thread.
    func sceneBecameInactive() {
        #if os(iOS)
        if Self.isTestBuild { UserDefaults.standard.removeObject(forKey: Self.foregroundBuildKey) }
        #endif
        watch.withLock { $0.setArmed(false) }
    }

    /// The app has left the screen in good order. Main thread.
    func sceneWentToBackground() {
        #if os(iOS)
        UserDefaults.standard.removeObject(forKey: Self.foregroundBuildKey)
        #endif
        watch.withLock { $0.setArmed(false) }
    }

    // MARK: - Frame rate

    /// Notes the frame rate when it moves from one band to another (smooth, 60, slow, crawling),
    /// at most every few seconds. The reading only arrives when it changes, so a move that comes
    /// too soon after the last line is looked at again once the wait is over: a slow-down that
    /// stays is not missed. Main thread.
    func noteFps(_ fps: Int) {
        guard Self.isTestBuild else { return }
        latestFps = fps
        let bucket = Self.fpsBucket(fps)
        guard bucket != lastFpsBucket else { return }
        let wait = Self.fpsNoteGapSec - (Self.uptime() - lastFpsNoteUptime)
        if wait > 0 {
            guard !fpsRecheckPending else { return }
            fpsRecheckPending = true
            DispatchQueue.main.asyncAfter(deadline: .now() + wait + 0.05) { [self] in
                fpsRecheckPending = false
                noteFps(latestFps)
            }
            return
        }
        lastFpsBucket = bucket
        lastFpsNoteUptime = Self.uptime()
        diary.note("frame rate \(fps)", rememberAsLast: false)
    }

    private static let fpsNoteGapSec: Double = 3
    private static func fpsBucket(_ fps: Int) -> Int {
        fps >= 100 ? 3 : (fps >= 50 ? 2 : (fps >= 28 ? 1 : 0))
    }

    // MARK: - System events

    private func observeSystem() {
        let nc = NotificationCenter.default
        let diary = self.diary
        _ = nc.addObserver(forName: ProcessInfo.thermalStateDidChangeNotification, object: nil, queue: nil) { _ in
            diary.note("heat \(Self.name(ProcessInfo.processInfo.thermalState))", rememberAsLast: false)
        }
        _ = nc.addObserver(forName: .NSProcessInfoPowerStateDidChange, object: nil, queue: nil) { _ in
            diary.note("low power \(ProcessInfo.processInfo.isLowPowerModeEnabled ? "on" : "off")", rememberAsLast: false)
        }
        #if os(iOS)
        _ = nc.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: nil) { _ in
            diary.note("memory warning", rememberAsLast: false)
        }
        _ = nc.addObserver(forName: AVAudioSession.mediaServicesWereLostNotification, object: nil, queue: nil) { _ in
            diary.note("sound: the system's media services were lost")
        }
        _ = nc.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: nil) { _ in
            diary.note("sound: the system's media services were reset")
        }
        #endif
    }

    // MARK: - Watchdog

    private func startWatch() {
        let timer = DispatchSource.makeTimerSource(queue: watchQueue)
        timer.schedule(deadline: .now() + 1.0, repeating: 1.0, leeway: .milliseconds(100))
        timer.setEventHandler { [weak self] in self?.watchTick() }
        timer.resume()
        watchTimer = timer
    }

    private func watchTick() {
        let now = Self.uptime()
        switch watch.withLock({ $0.tick(nowSec: now) }) {
        case .none:
            break
        case .ping:
            DispatchQueue.main.async { [self] in
                let answeredAt = Self.uptime()
                if let gone = watch.withLock({ $0.mainAnswered(nowSec: answeredAt) }) {
                    diary.note("main thread answers again after \(Self.oneDecimal(gone)) s", rememberAsLast: false)
                }
            }
        case .report(let stalledSec):
            // Written before this returns: the app may be closed the next moment.
            diary.noteNow("HANG main thread has not answered for \(Self.oneDecimal(stalledSec)) s • last: \(diary.lastNote)")
        }
    }

    // MARK: - Erase Save

    /// Erase Save erases everything the app has kept: the diary, the system's reports and the
    /// mark of the last run. Main thread.
    func eraseEverything() {
        UserDefaults.standard.removeObject(forKey: Self.foregroundBuildKey)
        diary.clear()
        // A copy made for the share sheet may still lie in the temporary folder.
        try? FileManager.default.removeItem(at: Self.exportFileURL)
        guard let directory else { return }
        watchQueue.async {
            for name in Self.reportNames(in: directory) {
                try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))
            }
        }
    }

    // MARK: - Sharing

    /// The diary and the newest system reports as one text file, for the share sheet.
    func writeExportFile() throws -> URL {
        var out = diary.text()
        if let directory {
            for name in Self.reportNames(in: directory).reversed() {
                guard let data = try? Data(contentsOf: directory.appendingPathComponent(name)) else { continue }
                out += "\n=== system report \(name) ===\n"
                out += String(decoding: data.prefix(150_000), as: UTF8.self)
                out += "\n"
            }
        }
        let url = Self.exportFileURL
        try Data(out.utf8).write(to: url, options: .atomic)
        return url
    }

    private static var exportFileURL: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("MouthLife-test-diary.txt")
    }

    /// The saved system reports' file names, oldest first (the name starts with its time).
    private static func reportNames(in directory: URL) -> [String] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        return names.filter { $0.hasPrefix(reportPrefix) && $0.hasSuffix(".json") }.sorted()
    }

    private func saveSystemReport(_ json: Data) {
        guard let directory else { return }
        let name = "\(Self.reportPrefix)\(Int(Date().timeIntervalSince1970))-\(UUID().uuidString.prefix(8)).json"
        try? json.write(to: directory.appendingPathComponent(name), options: .atomic)
        let names = Self.reportNames(in: directory)
        for old in names.dropLast(Self.reportsKept) {
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(old))
        }
    }

    // MARK: - Small helpers

    /// Seconds on a clock that stands still while the device sleeps.
    private static func uptime() -> Double {
        Double(DispatchTime.now().uptimeNanoseconds) / 1_000_000_000
    }

    private static func oneDecimal(_ value: Double) -> String {
        String(format: "%.1f", value)
    }

    static func name(_ state: ProcessInfo.ThermalState) -> String {
        switch state {
        case .nominal: return "nominal"
        case .fair: return "fair"
        case .serious: return "serious"
        case .critical: return "critical"
        @unknown default: return "unknown"
        }
    }

    /// The hardware's own name ("iPhone13,3"), which says more than "iPhone".
    private static func deviceModel() -> String {
        var system = utsname()
        uname(&system)
        return withUnsafeBytes(of: &system.machine) { raw in
            String(decoding: raw.prefix(while: { $0 != 0 }), as: UTF8.self)
        }
    }
}

#if os(iOS)
extension AppDiagnostics: MXMetricManagerSubscriber {
    /// The system's crash and hang reports for earlier runs. Called on a background thread.
    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            let crashes = payload.crashDiagnostics?.count ?? 0
            let hangs = payload.hangDiagnostics?.count ?? 0
            let cpu = payload.cpuExceptionDiagnostics?.count ?? 0
            diary.note("system report arrived: \(crashes) crash, \(hangs) hang, \(cpu) cpu", rememberAsLast: false)
            let json = payload.jsonRepresentation()
            watchQueue.async { [self] in saveSystemReport(json) }
        }
    }
}
#endif

/// The test diary as a file for the share sheet, written only when someone really shares it.
struct TestDiaryFile: Transferable {
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .plainText) { _ in
            SentTransferredFile(try AppDiagnostics.shared.writeExportFile())
        }
    }
}
