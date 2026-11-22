import Foundation

/// A small diary of what the watch runtime did, kept on the watch only (Documents/watch-log.txt), to
/// find out why the face can stop with the wrist down. Debug builds only: a Release build (TestFlight,
/// the App Store) keeps no diary and writes no file. Read it from the Mac with
/// `xcrun devicectl device copy from --device <watch> --domain-type appDataContainer
/// --domain-identifier org.mouthlife.plaque.watchkitapp --source Documents/watch-log.txt
/// --destination watch-log.txt`. Nothing leaves the watch.
@MainActor
enum WatchLog {
    #if DEBUG
    private static let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("watch-log.txt")
    private static let clock: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss.SSS"
        return f
    }()
    #endif

    /// Does nothing in a Release build. The text arrives as a closure and is put together only here,
    /// when it is written, so a Release build does not build the lines either.
    static func note(_ text: @autoclosure () -> String) {
        #if DEBUG
        guard let data = (clock.string(from: Date()) + " " + text() + "\n").data(using: .utf8) else { return }
        if let handle = try? FileHandle(forWritingTo: url) {
            handle.seekToEndOfFile()
            handle.write(data)
            try? handle.close()
        } else {
            try? data.write(to: url)
        }
        // keep it small: past 300 KB keep only the newest 100 KB
        if let size = try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int, size > 300_000,
           let all = try? Data(contentsOf: url) {
            try? all.suffix(100_000).write(to: url)
        }
        #endif
    }
}
