import Foundation
import MouthLifeCore
import UserNotifications

/// Brush reminders a grown-up set: local notifications for the next 30 days of mornings and
/// evenings (`BrushDays.daysAhead`), refreshed whenever the app opens or a brush is saved, and quiet
/// today once that brush is done. They are made on this device; nothing is sent anywhere.
@MainActor
enum BrushReminderScheduler {
    static let idPrefix = "mouthlife.brush."
    /// One refresh at a time, so an older plan never lands after a newer one.
    private static var latest: Task<Void, Never>?

    /// Asks once for permission to show reminders (the system remembers the answer).
    static func requestPermission() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional:
            return true
        case .denied:
            return false
        default:
            return (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        }
    }

    /// Replaces the scheduled reminders with a fresh plan, or removes them when reminders are off.
    static func refresh(on: Bool, morning: Int, evening: Int, fullToday: Int, text: (BrushDays.Slot) -> String) {
        let items: [(id: String, at: Date, body: String)] = on
            ? BrushDays.plan(now: Date(), morning: morning, evening: evening, fullToday: fullToday).map { item in
                ("\(idPrefix)\(item.slot.rawValue).\(Int(item.at.timeIntervalSince1970))", item.at, text(item.slot))
            }
            : []
        let previous = latest
        latest = Task {
            await previous?.value
            let center = UNUserNotificationCenter.current()
            let pending = await center.pendingNotificationRequests()
            center.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier).filter { $0.hasPrefix(idPrefix) })
            guard !items.isEmpty else { return }
            let settings = await center.notificationSettings()
            guard [.authorized, .provisional].contains(settings.authorizationStatus) else { return }
            for item in items {
                let content = UNMutableNotificationContent()
                content.title = "MouthLife"
                content.body = item.body
                content.sound = .default
                let when = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: item.at)
                let request = UNNotificationRequest(identifier: item.id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: false))
                try? await center.add(request)
            }
        }
    }
}
