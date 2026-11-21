import Foundation
#if os(iOS) && canImport(HealthKit)
import HealthKit
#endif

/// Saves each brush to Apple Health as a Toothbrushing entry, once a grown-up turns it on in
/// Settings. MouthLife only writes, and only toothbrushing: it never reads anything from Health.
/// Health keeps the entries on the device (and in the owner's iCloud, if they chose that).
@MainActor
enum HealthBrushLog {
    /// A brush shorter than this was a mistaken start, not a brush, so Health never gets it.
    static let minimumBrushSec: Double = 10

    /// Health is on iPhone and iPad (iPadOS 17), not on the Mac.
    static var isAvailable: Bool {
        #if os(iOS) && canImport(HealthKit)
        return HKHealthStore.isHealthDataAvailable()
        #else
        return false
        #endif
    }

    #if os(iOS) && canImport(HealthKit)
    private static let store = HKHealthStore()
    private static var brushType: HKCategoryType { HKCategoryType(.toothbrushingEvent) }

    /// Whether Health currently lets MouthLife save toothbrushing (the owner can change it in the
    /// Health app at any time).
    static var isAllowed: Bool {
        isAvailable && store.authorizationStatus(for: brushType) == .sharingAuthorized
    }
    #else
    static var isAllowed: Bool { false }
    #endif

    /// Shows Apple's Health sheet the first time; after that the system remembers the answer and
    /// this just reports it. True only if toothbrushing may be saved.
    static func requestPermission() async -> Bool {
        #if os(iOS) && canImport(HealthKit)
        guard isAvailable else { return false }
        do {
            try await store.requestAuthorization(toShare: [brushType], read: [])
        } catch {
            return false
        }
        return isAllowed
        #else
        return false
        #endif
    }

    /// Saves one brush: `brushedSec` of brushing that ended at `endedAt`. `sessionId` makes a
    /// resend (a watch brush arriving twice) replace the entry instead of adding a second one.
    static func save(brushedSec: Double, endedAt: Date, sessionId: String) {
        #if os(iOS) && canImport(HealthKit)
        guard brushedSec >= minimumBrushSec, isAllowed else { return }
        let end = min(endedAt, Date())
        let sample = HKCategorySample(
            type: brushType,
            value: HKCategoryValue.notApplicable.rawValue,
            start: end.addingTimeInterval(-brushedSec),
            end: end,
            metadata: [
                HKMetadataKeySyncIdentifier: "mouthlife.brush.\(sessionId)",
                HKMetadataKeySyncVersion: 1,
            ]
        )
        Task {
            // Health may be locked (the phone locked mid-brush) or turned off since: then the
            // brush just isn't saved there; the game's own record is unaffected.
            try? await store.save(sample)
        }
        #endif
    }
}
