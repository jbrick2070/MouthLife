import Foundation

/// A short diary of what the app was doing, kept on the device, so a freeze or a crash a tester
/// meets leaves something to read ("it stopped answering on the brush screen, 40 s in").
///
/// It holds no personal data: screens, stages, timings, the build and the device model. Nothing is
/// ever sent anywhere; a tester shares the file themself from Settings. Test builds only: the
/// App Store build keeps no diary at all (it is given no file), and Erase Save empties it.
///
/// Safe to call from any thread, but never from the render thread's per-frame update or the audio
/// thread: a line is a string, and both of those must not allocate. Lines are written on the
/// diary's own queue, so a caller never waits for the disk (`noteNow` does wait: it is for the
/// watchdog, whose line must be on disk before the app is closed).
///
/// The file is kept short by counting lines in memory, not by asking the file system for its size
/// or dates (those calls need a declared reason in the privacy manifest).
public final class TestDiary: @unchecked Sendable {
    /// Lines kept after the diary is trimmed, and the count at which it is trimmed.
    public let keepLines: Int
    public let maxLines: Int

    private let fileURL: URL?
    private let queue = DispatchQueue(label: "org.mouthlife.testdiary", qos: .utility)
    private let lastLock = NSLock()
    private var lastText = ""
    // Only touched on `queue`.
    private var lineCount = -1
    private let stamp: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "MM-dd HH:mm:ss.SSS"
        return f
    }()

    /// - Parameter fileURL: where the diary lives; nil keeps nothing (a place could not be made).
    public init(fileURL: URL?, keepLines: Int = 250, maxLines: Int = 400) {
        self.fileURL = fileURL
        self.keepLines = max(1, keepLines)
        self.maxLines = max(self.keepLines + 1, maxLines)
    }

    /// The diary's usual place: Application Support/MouthLifeDiagnostics/diary.txt.
    public static func defaultDirectory() -> URL? {
        guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let dir = base.appendingPathComponent("MouthLifeDiagnostics", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            return dir
        } catch {
            return nil
        }
    }

    /// The most recent line's text (without its time): what the app was last known to be doing.
    public var lastNote: String {
        lastLock.lock()
        defer { lastLock.unlock() }
        return lastText
    }

    /// Adds a line. Returns at once; the line is written on the diary's queue.
    /// `rememberAsLast: false` is for lines that are not something the app is doing (the frame
    /// rate, the device getting warm): `lastNote` then still names the screen or the stage.
    public func note(_ text: String, rememberAsLast: Bool = true) {
        let now = Date()
        if rememberAsLast { remember(text) }
        queue.async { [self] in append(text, at: now) }
    }

    /// Adds a line and waits until it is on disk. Never call this from the main thread, the render
    /// thread or the audio thread. `rememberAsLast: false` keeps `lastNote` pointing at what the
    /// app was doing (the watchdog's own lines are not that).
    public func noteNow(_ text: String, rememberAsLast: Bool = false) {
        let now = Date()
        if rememberAsLast { remember(text) }
        queue.sync { append(text, at: now) }
    }

    /// The whole diary, oldest line first. Waits for lines still on their way to the disk.
    public func text() -> String {
        queue.sync {
            guard let fileURL, let data = try? Data(contentsOf: fileURL) else { return "" }
            return String(decoding: data, as: UTF8.self)
        }
    }

    /// Empties the diary: Erase Save erases everything the app has kept.
    public func clear() {
        remember("")
        queue.async { [self] in
            guard let fileURL else { return }
            try? Data().write(to: fileURL, options: .atomic)
            lineCount = 0
        }
    }

    private func remember(_ text: String) {
        lastLock.lock()
        lastText = text
        lastLock.unlock()
    }

    private func append(_ text: String, at date: Date) {
        guard let fileURL else { return }
        if lineCount < 0 {
            // First line of this launch: count what earlier launches left.
            if let data = try? Data(contentsOf: fileURL) {
                lineCount = data.reduce(0) { $1 == 0x0A ? $0 + 1 : $0 }
            } else {
                lineCount = 0
            }
        }
        // One line per note, whatever the text holds.
        let flat = text.replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "\r", with: " ")
        let line = Data("\(stamp.string(from: date))  \(flat)\n".utf8)
        if let handle = try? FileHandle(forWritingTo: fileURL) {
            defer { try? handle.close() }
            do {
                try handle.seekToEnd()
                try handle.write(contentsOf: line)
                lineCount += 1
            } catch {
                return
            }
        } else {
            // No file yet.
            guard (try? line.write(to: fileURL, options: .atomic)) != nil else { return }
            lineCount = 1
        }
        if lineCount > maxLines { trim() }
    }

    private func trim() {
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else { return }
        let lines = String(decoding: data, as: UTF8.self).split(separator: "\n", omittingEmptySubsequences: true)
        let kept = lines.suffix(keepLines)
        let out = kept.joined(separator: "\n") + "\n"
        if (try? Data(out.utf8).write(to: fileURL, options: .atomic)) != nil {
            lineCount = kept.count
        }
    }
}

/// Watches whether the main thread still answers, on the watchdog's own clock readings, so the
/// rule can be tested without threads. One `tick` a second; `mainAnswered` when the main thread
/// ran the ping it was sent.
///
/// It must not mistake three things for a hang: the app being suspended (nothing runs, including
/// the watchdog, so its next tick comes late and is thrown away), the app not being on screen
/// (not armed), and a watchdog thread that was itself starved (a late tick again).
public struct MainThreadWatch: Equatable, Sendable {
    public enum Action: Equatable, Sendable {
        /// Nothing to do this second.
        case none
        /// Send the main thread a ping (and call `mainAnswered` when it runs).
        case ping
        /// The main thread has not answered for this long: write it down.
        case report(stalledSec: Double)
    }

    /// Stall lengths at which a line is written, in seconds.
    public static let reportAfterSec: [Double] = [2, 10, 30]
    /// A tick this much later than the last one means the watchdog itself did not run.
    public static let lateTickSec: Double = 2.5

    public private(set) var armed = false
    private var pingSentAt: Double?
    private var lastTickAt: Double?
    private var reports = 0

    public init() {}

    /// Armed only while the app is on screen and active.
    public mutating func setArmed(_ on: Bool) {
        guard armed != on else { return }
        armed = on
        pingSentAt = nil
        lastTickAt = nil
        reports = 0
    }

    public mutating func tick(nowSec: Double) -> Action {
        guard armed else { return .none }
        defer { lastTickAt = nowSec }
        if let last = lastTickAt, nowSec - last > Self.lateTickSec || nowSec < last {
            // Suspended, or the watchdog was not given time: no judgement from this gap.
            pingSentAt = nil
            reports = 0
            return .none
        }
        guard let sent = pingSentAt else {
            pingSentAt = nowSec
            return .ping
        }
        let stalled = nowSec - sent
        if reports < Self.reportAfterSec.count, stalled >= Self.reportAfterSec[reports] {
            reports += 1
            return .report(stalledSec: stalled)
        }
        return .none
    }

    /// The main thread ran its ping. Returns how long it had been stalled if that was reported
    /// (so the diary can say it came back), else nil.
    public mutating func mainAnswered(nowSec: Double) -> Double? {
        defer {
            pingSentAt = nil
            reports = 0
        }
        guard reports > 0, let sent = pingSentAt else { return nil }
        return max(0, nowSec - sent)
    }
}
