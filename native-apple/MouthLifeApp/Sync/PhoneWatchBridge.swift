import Foundation
import MouthLifeCore

#if os(iOS) && canImport(WatchConnectivity)
import WatchConnectivity

/// The iPhone's end of the Apple Watch link: it receives each finished watch brush (and pays it
/// once, through the coordinator), answers with what it earned, and tells the watch the grown-up's
/// rinse setting and the language. Nothing goes anywhere but the family's own paired watch.
@MainActor
final class PhoneWatchBridge: NSObject {
    static let shared = PhoneWatchBridge()

    /// Pays a watch brush (once per session id) and returns the answer for the watch; no answer
    /// (nil) means it was not paid, and the watch keeps it to send again.
    var onRecord: ((WatchBrushRecord) -> WatchBrushAck?)?
    private var latest: WatchPhoneSettings?

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// The settings the watch should use (sent as the latest truth; the watch keeps the newest).
    func push(_ settings: WatchPhoneSettings) {
        latest = settings
        sendSettings()
    }

    fileprivate func sendSettings() {
        guard let latest, WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        try? session.updateApplicationContext(latest.dictionary)
    }

    fileprivate func receive(_ record: WatchBrushRecord) {
        guard let ack = onRecord?(record), WCSession.isSupported() else { return }
        // Only on an active session (the family may be switching watches); an answer not sent here
        // is not lost: the watch sends the brush again and the ledger returns the same answer.
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        session.transferUserInfo(ack.dictionary)
    }
}

extension PhoneWatchBridge: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in self.sendSettings() }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        // the family switched to another paired watch: start again with that one
        session.activate()
    }

    nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
        Task { @MainActor in self.sendSettings() }
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard let record = WatchBrushRecord(dictionary: userInfo) else { return }
        Task { @MainActor in self.receive(record) }
    }
}
#endif
