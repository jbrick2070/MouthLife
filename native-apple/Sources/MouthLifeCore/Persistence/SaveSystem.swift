import CoreFoundation
import Foundation

public protocol SaveStorageBackend: AnyObject {
    func readString(forKey key: String) -> String?
    func writeString(_ value: String, forKey key: String)
    func removeValue(forKey key: String)
}

public final class InMemorySaveStorage: SaveStorageBackend, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: String]

    public init(initialValues: [String: String] = [:]) {
        self.values = initialValues
    }

    public func readString(forKey key: String) -> String? {
        lock.lock()
        defer { lock.unlock() }
        return values[key]
    }

    public func writeString(_ value: String, forKey key: String) {
        lock.lock()
        defer { lock.unlock() }
        values[key] = value
    }

    public func removeValue(forKey key: String) {
        lock.lock()
        defer { lock.unlock() }
        values.removeValue(forKey: key)
    }

    public func snapshot() -> [String: String] {
        lock.lock()
        defer { lock.unlock() }
        return values
    }
}

public final class UserDefaultsSaveStorage: SaveStorageBackend {
    private let defaults: UserDefaults
    private let ubiquitousStore: NSUbiquitousKeyValueStore?

    public init(
        defaults: UserDefaults = .standard,
        enableICloudMirror: Bool = false,
        ubiquitousStore: NSUbiquitousKeyValueStore? = nil
    ) {
        self.defaults = defaults
        if let ubiquitousStore {
            self.ubiquitousStore = ubiquitousStore
        } else if enableICloudMirror {
            self.ubiquitousStore = .default
        } else {
            self.ubiquitousStore = nil
        }
    }

    public func readString(forKey key: String) -> String? {
        if let local = defaults.string(forKey: key) {
            return local
        }
        return ubiquitousStore?.string(forKey: key)
    }

    public func readCloudString(forKey key: String) -> String? {
        ubiquitousStore?.string(forKey: key)
    }

    public func writeString(_ value: String, forKey key: String) {
        defaults.set(value, forKey: key)
        if let ubiquitousStore {
            ubiquitousStore.set(value, forKey: key)
            ubiquitousStore.synchronize()
        }
    }

    public func removeValue(forKey key: String) {
        defaults.removeObject(forKey: key)
        if let ubiquitousStore {
            ubiquitousStore.removeObject(forKey: key)
            ubiquitousStore.synchronize()
        }
    }
}

public enum SyncCodeError: LocalizedError, Equatable, Sendable {
    case missingPrefix
    case malformedPayload
    case invalidUtf8
    case invalidJson
    case missingSchemaVersion
    case unsupportedSchemaVersion(Int)

    public var errorDescription: String? {
        switch self {
        case .missingPrefix:
            return "Invalid Sync Code prefix (expected ML2:)."
        case .malformedPayload:
            return "Malformed Base64URL Sync Code payload."
        case .invalidUtf8:
            return "Sync Code payload is not valid UTF-8."
        case .invalidJson:
            return "Sync Code payload is not a valid JSON object."
        case .missingSchemaVersion:
            return "Sync Code JSON is missing schemaVersion."
        case .unsupportedSchemaVersion(let version):
            return "Unsupported Sync Code schemaVersion (\(version))."
        }
    }
}

public struct MissionCompletionSaveOutcome: Codable, Equatable, Sendable {
    public var unlockedHistoryNoteId: String?
    public var newlyUnlockedUpgradeIds: [String]
    public var bonusRescueIons: Int

    public init(
        unlockedHistoryNoteId: String? = nil,
        newlyUnlockedUpgradeIds: [String] = [],
        bonusRescueIons: Int = 0
    ) {
        self.unlockedHistoryNoteId = unlockedHistoryNoteId
        self.newlyUnlockedUpgradeIds = newlyUnlockedUpgradeIds
        self.bonusRescueIons = bonusRescueIons
    }
}

public func createDefaultWorldRecord(unlocked: Bool = false) -> WorldRecord {
    SaveSystem.createDefaultWorldRecord(unlocked: unlocked)
}

public func createDefaultSave(
    nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
) -> MouthLifeSaveV2 {
    SaveSystem.createDefaultSave(nowEpochMs: nowEpochMs)
}

public func reconcileWorldUnlocks(_ save: inout MouthLifeSaveV2) {
    SaveSystem.reconcileWorldUnlocks(&save)
}

public func encodeSaveToSyncCode(_ save: MouthLifeSaveV2) -> String {
    SaveSystem.encodeSaveToSyncCode(save)
}

public func decodeSaveFromSyncCode(
    _ code: String,
    nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
) throws -> MouthLifeSaveV2 {
    try SaveSystem.decodeSaveFromSyncCode(code, nowEpochMs: nowEpochMs)
}

public final class SaveSystem {
    public static let storageKey = "mouthlife_save_v2"
    public static let syncCodePrefix = "ML2:"
    public static let campaignUnlockOrder: [String] = [
        "world_1",
        "world_2",
        "world_3",
        "world_4",
        "world_5"
    ]

    private static let maxSafeJsInt: Int64 = 9_007_199_254_740_991

    private let bus: EventBus
    private let storage: SaveStorageBackend
    private let memoryBackup = InMemorySaveStorage()
    public private(set) var currentSave: MouthLifeSaveV2

    public init(
        bus: EventBus = EventBus(),
        storage: SaveStorageBackend = InMemorySaveStorage(),
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) {
        self.bus = bus
        self.storage = storage
        self.currentSave = Self.createDefaultSave(nowEpochMs: nowEpochMs)
    }

    public static func createDefaultWorldRecord(unlocked: Bool = false) -> WorldRecord {
        WorldRecord(
            unlocked: unlocked,
            completed: false,
            timesCleared: 0,
            bestScore: 0,
            bestGrade: .none,
            bestCleanlinessPct: 0.0,
            sitesRestoredMax: 0
        )
    }

    public static func createDefaultSave(
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> MouthLifeSaveV2 {
        var worlds: [String: WorldRecord] = [:]
        for city in HostsAndHistory.hostCities {
            worlds[city.worldId] = createDefaultWorldRecord(unlocked: city.worldId == "world_1")
        }

        return MouthLifeSaveV2(
            schemaVersion: 2,
            saveRevision: 1,
            lastSavedEpochMs: nowEpochMs,
            hasSeenCosmicIntro: false,
            playerProfile: PlayerHostProfile(
                displayName: "Explorer",
                skinToneIndex: 3,
                homeCityId: "toronto"
            ),
            companion: createInitialCompanionState(nowEpochMs: nowEpochMs),
            totalBrushStamps: 0,
            fluorideIons: 0,
            dailySlotsByDate: [:],
            pendingSupplyBeacons: 0,
            remineralizedOverdriveRuns: 0,
            unlockedUpgrades: [],
            equippedUpgrades: EquippedUpgrades(brush: nil, floss: nil, rinse: nil),
            unlockedHistoryNotes: ["cosmic_hydroxyapatite"],
            qualityPreference: .auto,
            worlds: worlds
        )
    }

    /// Ensures campaign worlds unlock sequentially when the preceding stage is cleared
    /// OR when monotonic Habit Stamp milestones are met (`world_1` is always unlocked).
    public static func reconcileWorldUnlocks(_ save: inout MouthLifeSaveV2) {
        for city in HostsAndHistory.hostCities {
            var rec = save.worlds[city.worldId] ?? createDefaultWorldRecord(unlocked: city.worldId == "world_1")
            if city.worldId == "world_1" ||
                rec.completed ||
                save.totalBrushStamps >= city.unlockStampsRequired {
                rec.unlocked = true
            }
            save.worlds[city.worldId] = rec
        }

        for idx in 1..<campaignUnlockOrder.count {
            let prevId = campaignUnlockOrder[idx - 1]
            let currId = campaignUnlockOrder[idx]
            if save.worlds[prevId]?.completed == true {
                var rec = save.worlds[currId] ?? createDefaultWorldRecord(unlocked: true)
                rec.unlocked = true
                save.worlds[currId] = rec
            }
        }
    }

    // MARK: - JSON Sanitizer & V1 -> V2 Migrator

    private static func jsonBool(_ any: Any?) -> Bool? {
        guard let num = any as? NSNumber else { return nil }
        if CFGetTypeID(num) == CFBooleanGetTypeID() {
            return num.boolValue
        }
        return nil
    }

    private static func jsonDouble(_ any: Any?) -> Double? {
        guard let num = any as? NSNumber else { return nil }
        if CFGetTypeID(num) == CFBooleanGetTypeID() {
            return nil
        }
        let d = num.doubleValue
        return d.isFinite ? d : nil
    }

    private static func jsonTruthy(_ any: Any?) -> Bool {
        if let b = jsonBool(any) { return b }
        if let d = jsonDouble(any) { return d != 0.0 }
        if let s = any as? String { return !s.isEmpty }
        return false
    }

    /// Upper bound for imported counters (ions, stamps, save revision). Far above anything play can
    /// reach, and low enough that later `+= reward` or `revision + 1` arithmetic can never overflow
    /// and trap, which a hand-edited or hostile sync code could otherwise trigger on every launch.
    private static let maxImportedCounter: Int = 1_000_000_000

    private static func clampInt(
        _ val: Any?,
        min minVal: Int,
        max maxVal: Int = maxImportedCounter,
        fallback: Int? = nil
    ) -> Int {
        let fb = fallback ?? minVal
        guard let d = jsonDouble(val), !d.isNaN else { return fb }
        let floored = floor(d)
        if floored <= Double(minVal) { return minVal }
        if floored >= Double(maxVal) { return maxVal }
        return Int(floored)
    }

    private static func clampInt64(
        _ val: Any?,
        min minVal: Int64,
        max maxVal: Int64 = maxSafeJsInt,
        fallback: Int64
    ) -> Int64 {
        guard let d = jsonDouble(val), !d.isNaN else { return fallback }
        let floored = floor(d)
        if floored <= Double(minVal) { return minVal }
        if floored >= Double(maxVal) { return maxVal }
        return Int64(floored)
    }

    private static func clampDouble(
        _ val: Any?,
        min minVal: Double,
        max maxVal: Double,
        fallback: Double
    ) -> Double {
        guard let d = jsonDouble(val) else { return fallback }
        return Swift.max(minVal, Swift.min(maxVal, d))
    }

    private static func isValidDateKey(_ key: String) -> Bool {
        let bytes = Array(key.utf8)
        guard bytes.count == 10 else { return false }
        for (i, b) in bytes.enumerated() {
            if i == 4 || i == 7 {
                if b != UInt8(ascii: "-") { return false }
            } else {
                if b < UInt8(ascii: "0") || b > UInt8(ascii: "9") { return false }
            }
        }
        return true
    }

    /// Pure migration & validation pipeline from untyped `JSONSerialization` object.
    /// Supports both `schemaVersion: 2` and legacy `schemaVersion: 1` fixtures,
    /// strips unknown registry IDs safely, clamps invalid numbers, and preserves `world_1.unlocked = true`.
    public static func migrateSave(
        jsonObject raw: Any?,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> MouthLifeSaveV2 {
        var base = createDefaultSave(nowEpochMs: nowEpochMs)
        guard let obj = raw as? [String: Any],
              let versionDouble = jsonDouble(obj["schemaVersion"])
        else {
            return base
        }

        let version = Int(versionDouble)
        guard (version == 1 || version == 2) && Double(version) == versionDouble else {
            return base
        }

        base.saveRevision = clampInt(obj["saveRevision"], min: 1, max: maxImportedCounter, fallback: 1)
        base.lastSavedEpochMs = clampInt64(
            obj["lastSavedEpochMs"],
            min: 0,
            max: maxSafeJsInt,
            fallback: nowEpochMs
        )
        base.hasSeenCosmicIntro = jsonBool(obj["hasSeenCosmicIntro"]) ?? (version == 1)

        // Monotonic stamps & currency (map V1 fluorideCrystals -> fluorideIons)
        base.totalBrushStamps = clampInt(obj["totalBrushStamps"] ?? obj["brushStamps"], min: 0)
        let rawIons = (version == 1) ? (obj["fluorideCrystals"] ?? obj["fluorideIons"]) : obj["fluorideIons"]
        base.fluorideIons = clampInt(rawIons, min: 0)

        // Beacons & Overdrive (map V1 remineralizedBuffRunsRemaining -> remineralizedOverdriveRuns)
        base.pendingSupplyBeacons = clampInt(
            obj["pendingSupplyBeacons"],
            min: 0,
            max: GameConfig.maxSupplyBeacons,
            fallback: 0
        )
        let rawOverdrive = (version == 1) ? obj["remineralizedBuffRunsRemaining"] : obj["remineralizedOverdriveRuns"]
        base.remineralizedOverdriveRuns = clampInt(
            rawOverdrive,
            min: 0,
            max: GameConfig.maxOverdriveRuns,
            fallback: 0
        )

        // Daily slots (V1 stored numbers; V2 stores { fullRewards, tips })
        if let rawDaily = obj["dailySlotsByDate"] as? [String: Any] {
            let sortedKeys = rawDaily.keys.sorted().suffix(45)
            for dateKey in sortedKeys {
                guard isValidDateKey(dateKey) else { continue }
                let val = rawDaily[dateKey]
                if jsonDouble(val) != nil {
                    base.dailySlotsByDate[dateKey] = DailySlotLog(
                        fullRewards: clampInt(val, min: 0, max: GameConfig.dailyFullRewardCap, fallback: 0),
                        tips: 0
                    )
                } else if let vObj = val as? [String: Any] {
                    base.dailySlotsByDate[dateKey] = DailySlotLog(
                        fullRewards: clampInt(vObj["fullRewards"], min: 0, max: GameConfig.dailyFullRewardCap, fallback: 0),
                        tips: clampInt(vObj["tips"], min: 0, max: GameConfig.dailyCourtesyTipCap, fallback: 0)
                    )
                }
            }
        }

        // Player profile
        if let p = obj["playerProfile"] as? [String: Any] {
            let rawName = (p["displayName"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let safeName = rawName.isEmpty ? "Explorer" : String(rawName.prefix(24))
            let skinIdx = clampInt(
                p["skinToneIndex"],
                min: 0,
                max: max(0, HostsAndHistory.realisticSkinTones.count - 1),
                fallback: 3
            )
            let cityCandidate = p["homeCityId"] as? String
            let homeCityId = (cityCandidate != nil && HostsAndHistory.hostCityIds.contains(cityCandidate!))
                ? cityCandidate!
                : "toronto"
            base.playerProfile = PlayerHostProfile(
                displayName: safeName,
                skinToneIndex: skinIdx,
                homeCityId: homeCityId
            )
        }

        // Companion hydration
        if let c = obj["companion"] as? [String: Any] {
            var rawTreats: [Int64] = []
            if let arr = c["recentTreatTimestampsMs"] as? [Any] {
                for item in arr {
                    if let d = jsonDouble(item), d >= 0, d <= Double(maxSafeJsInt) {
                        rawTreats.append(Int64(floor(d)))
                    }
                }
                rawTreats = Array(rawTreats.suffix(12))
            }
            base.companion = CompanionState(
                smoothnessIndex: clampDouble(c["smoothnessIndex"], min: 0.0, max: 100.0, fallback: 90.0),
                enamelShield: clampDouble(c["enamelShield"], min: 0.0, max: 100.0, fallback: 100.0),
                dentinShield: clampDouble(c["dentinShield"], min: 0.0, max: 100.0, fallback: 100.0),
                pulpIntegrity: clampDouble(c["pulpIntegrity"], min: 0.0, max: 100.0, fallback: 100.0),
                unclaimedIdleIons: clampInt(
                    c["unclaimedIdleIons"],
                    min: 0,
                    max: GameConfig.idleIonReservoirCap,
                    fallback: 0
                ),
                recentTreatTimestampsMs: rawTreats,
                lastEvaluatedEpochMs: clampInt64(
                    c["lastEvaluatedEpochMs"],
                    min: 0,
                    max: maxSafeJsInt,
                    fallback: nowEpochMs
                )
            )
        } else if version == 1 {
            base.companion = CompanionState(
                smoothnessIndex: 90.0,
                enamelShield: 100.0,
                dentinShield: 100.0,
                pulpIntegrity: 100.0,
                unclaimedIdleIons: 0,
                recentTreatTimestampsMs: [],
                lastEvaluatedEpochMs: nowEpochMs
            )
        }

        // Registry-sanitized upgrades
        if let rawUpgrades = obj["unlockedUpgrades"] as? [Any] {
            var validOrdered: [String] = []
            var seen = Set<String>()
            for item in rawUpgrades {
                guard let idStr = item as? String else { continue }
                let mapped = (idStr == "angled_bass_bristles") ? "angled_bass_array" : idStr
                if UpgradeCatalog.ids.contains(mapped) && !seen.contains(mapped) {
                    seen.insert(mapped)
                    validOrdered.append(mapped)
                }
            }
            base.unlockedUpgrades = validOrdered
        }

        if version == 1, let legacyEq = obj["equippedBrushUpgrade"] as? String {
            let mapped = (legacyEq == "angled_bass_bristles") ? "angled_bass_array" : legacyEq
            if UpgradeCatalog.ids.contains(mapped) &&
                base.unlockedUpgrades.contains(mapped) &&
                UpgradeCatalog.get(mapped)?.slot == .brush {
                base.equippedUpgrades.brush = mapped
            }
        } else if let eq = obj["equippedUpgrades"] as? [String: Any] {
            for slot in ActuatorKind.allCases {
                if let val = eq[slot.rawValue] as? String,
                   UpgradeCatalog.ids.contains(val),
                   base.unlockedUpgrades.contains(val),
                   UpgradeCatalog.get(val)?.slot == slot {
                    base.equippedUpgrades[slot] = val
                }
            }
        }

        // Registry-sanitized history notes
        if let rawNotes = obj["unlockedHistoryNotes"] as? [Any] {
            var orderedNotes: [String] = ["cosmic_hydroxyapatite"]
            var seenNotes: Set<String> = ["cosmic_hydroxyapatite"]
            for item in rawNotes {
                if let nId = item as? String,
                   HostsAndHistory.historyNoteIds.contains(nId),
                   !seenNotes.contains(nId) {
                    seenNotes.insert(nId)
                    orderedNotes.append(nId)
                }
            }
            base.unlockedHistoryNotes = orderedNotes
        }

        if let qStr = obj["qualityPreference"] as? String,
           let qPref = QualityPreference(rawValue: qStr) {
            base.qualityPreference = qPref
        }

        // Worlds migration (V1 worldProgress vs V2 worlds)
        let rawWorlds = (version == 1 ? obj["worldProgress"] : obj["worlds"]) as? [String: Any]
        if let rawWorlds {
            for city in HostsAndHistory.hostCities {
                let wid = city.worldId
                if let w = rawWorlds[wid] as? [String: Any] {
                    let completed = jsonTruthy(w["completed"])
                    let bestGrade: MasteryGrade
                    if let gStr = w["bestGrade"] as? String,
                       let parsedGrade = MasteryGrade(rawValue: gStr) {
                        bestGrade = parsedGrade
                    } else {
                        bestGrade = completed ? .b : .none
                    }

                    base.worlds[wid] = WorldRecord(
                        unlocked: wid == "world_1" || jsonTruthy(w["unlocked"]) || completed,
                        completed: completed,
                        timesCleared: clampInt(w["timesCleared"], min: 0, max: 999_999, fallback: completed ? 1 : 0),
                        bestScore: clampInt(w["bestScore"], min: 0, max: 999_999, fallback: 0),
                        bestGrade: bestGrade,
                        bestCleanlinessPct: clampDouble(w["bestCleanlinessPct"], min: 0.0, max: 100.0, fallback: 0.0),
                        sitesRestoredMax: clampInt(
                            w["sitesRestoredMax"] ?? w["citizensRescuedMax"],
                            min: 0,
                            max: 999,
                            fallback: 0
                        )
                    )
                }
            }
        }

        reconcileWorldUnlocks(&base)
        return base
    }

    public static func migrateSave(
        jsonData: Data,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> MouthLifeSaveV2 {
        guard let parsed = try? JSONSerialization.jsonObject(with: jsonData, options: []) else {
            return createDefaultSave(nowEpochMs: nowEpochMs)
        }
        return migrateSave(jsonObject: parsed, nowEpochMs: nowEpochMs)
    }

    public static func migrateSave(
        jsonString: String,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> MouthLifeSaveV2 {
        guard let data = jsonString.data(using: .utf8) else {
            return createDefaultSave(nowEpochMs: nowEpochMs)
        }
        return migrateSave(jsonData: data, nowEpochMs: nowEpochMs)
    }

    // MARK: - Cross-Platform ML2: Base64URL Sync Codes

    public static func encodeSaveToSyncCode(_ save: MouthLifeSaveV2) -> String {
        let encoder = JSONEncoder()
        let jsonData = (try? encoder.encode(save)) ?? Data("{}".utf8)
        let base64Url = jsonData
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "\(syncCodePrefix)\(base64Url)"
    }

    public static func decodeSaveFromSyncCode(
        _ code: String,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) throws -> MouthLifeSaveV2 {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix(syncCodePrefix) else {
            throw SyncCodeError.missingPrefix
        }

        let afterPrefix = trimmed.dropFirst(syncCodePrefix.count)
        var compactScalars = String.UnicodeScalarView()
        for scalar in afterPrefix.unicodeScalars {
            if CharacterSet.whitespacesAndNewlines.contains(scalar) {
                continue
            }
            compactScalars.append(scalar)
        }
        let body = String(compactScalars)

        guard !body.isEmpty, body.utf8.count <= 65_536 else {
            throw SyncCodeError.malformedPayload
        }

        // Validate Base64URL / standard Base64 alphabet with optional trailing '=' padding only
        var sawPadding = false
        var unpaddedBytes: [UInt8] = []
        unpaddedBytes.reserveCapacity(body.utf8.count)
        for byte in body.utf8 {
            if byte == UInt8(ascii: "=") {
                sawPadding = true
                continue
            }
            if sawPadding {
                // '=' inside the middle of payload is invalid
                throw SyncCodeError.malformedPayload
            }
            let isAlphaNum =
                (byte >= UInt8(ascii: "A") && byte <= UInt8(ascii: "Z")) ||
                (byte >= UInt8(ascii: "a") && byte <= UInt8(ascii: "z")) ||
                (byte >= UInt8(ascii: "0") && byte <= UInt8(ascii: "9"))
            let isB64Symbol =
                byte == UInt8(ascii: "-") ||
                byte == UInt8(ascii: "_") ||
                byte == UInt8(ascii: "+") ||
                byte == UInt8(ascii: "/")
            guard isAlphaNum || isB64Symbol else {
                throw SyncCodeError.malformedPayload
            }
            if byte == UInt8(ascii: "-") {
                unpaddedBytes.append(UInt8(ascii: "+"))
            } else if byte == UInt8(ascii: "_") {
                unpaddedBytes.append(UInt8(ascii: "/"))
            } else {
                unpaddedBytes.append(byte)
            }
        }

        guard !unpaddedBytes.isEmpty, unpaddedBytes.count % 4 != 1 else {
            throw SyncCodeError.malformedPayload
        }

        while unpaddedBytes.count % 4 != 0 {
            unpaddedBytes.append(UInt8(ascii: "="))
        }

        let stdBase64 = String(decoding: unpaddedBytes, as: UTF8.self)
        guard let decodedBytes = Data(base64Encoded: stdBase64) else {
            throw SyncCodeError.malformedPayload
        }

        guard let jsonText = String(data: decodedBytes, encoding: .utf8),
              let utf8Data = jsonText.data(using: .utf8)
        else {
            throw SyncCodeError.invalidUtf8
        }

        guard let parsed = try? JSONSerialization.jsonObject(with: utf8Data, options: []),
              let dict = parsed as? [String: Any]
        else {
            throw SyncCodeError.invalidJson
        }

        guard dict["schemaVersion"] != nil else {
            throw SyncCodeError.missingSchemaVersion
        }

        guard let vDouble = jsonDouble(dict["schemaVersion"]) else {
            throw SyncCodeError.unsupportedSchemaVersion(-1)
        }
        let vInt = Int(vDouble)
        guard (vInt == 1 || vInt == 2) && Double(vInt) == vDouble else {
            throw SyncCodeError.unsupportedSchemaVersion(vInt)
        }

        return migrateSave(jsonObject: dict, nowEpochMs: nowEpochMs)
    }

    // MARK: - Instance Persistence Operations

    @discardableResult
    public func load(nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()) -> MouthLifeSaveV2 {
        let rawText = storage.readString(forKey: Self.storageKey) ?? memoryBackup.readString(forKey: Self.storageKey)
        guard let rawText, let data = rawText.data(using: .utf8) else {
            currentSave = Self.createDefaultSave(nowEpochMs: nowEpochMs)
            persistInternal(nowEpochMs: nowEpochMs)
            return currentSave
        }

        guard let parsed = try? JSONSerialization.jsonObject(with: data, options: []),
              parsed is [String: Any]
        else {
            currentSave = Self.createDefaultSave(nowEpochMs: nowEpochMs)
            return currentSave
        }

        currentSave = Self.migrateSave(jsonObject: parsed, nowEpochMs: nowEpochMs)

        // If iCloud KVS holds a strictly newer revision, merge monotonically
        if let cloudStore = storage as? UserDefaultsSaveStorage,
           let cloudRaw = cloudStore.readCloudString(forKey: Self.storageKey) {
            _ = reconcileExternalStorageEvent(cloudRaw, nowEpochMs: nowEpochMs)
        }

        _ = checkThresholdAutoUnlocks()
        return currentSave
    }

    public func getSave() -> MouthLifeSaveV2 {
        currentSave
    }

    @discardableResult
    public func save(
        _ mutatedSave: MouthLifeSaveV2? = nil,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> MouthLifeSaveV2 {
        var next = mutatedSave ?? currentSave
        // Enforce monotonic totalBrushStamps invariant
        next.totalBrushStamps = max(currentSave.totalBrushStamps, max(0, next.totalBrushStamps))
        next.saveRevision = max(currentSave.saveRevision, next.saveRevision) + 1
        next.lastSavedEpochMs = nowEpochMs
        currentSave = next

        _ = checkThresholdAutoUnlocks()
        persistInternal(nowEpochMs: nowEpochMs)
        bus.emit(.saveUpdated(save: currentSave))
        return currentSave
    }

    /// Resets local progress to a brand-new Day-1 save.
    @discardableResult
    public func resetToFreshSave(
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> MouthLifeSaveV2 {
        currentSave = Self.createDefaultSave(nowEpochMs: nowEpochMs)
        persistInternal(nowEpochMs: nowEpochMs)
        bus.emit(.saveUpdated(save: currentSave))
        return currentSave
    }

    private func persistInternal(nowEpochMs: Int64) {
        currentSave.lastSavedEpochMs = nowEpochMs
        let encoder = JSONEncoder()
        guard let data = try? encoder.encode(currentSave),
              let serialized = String(data: data, encoding: .utf8)
        else {
            return
        }
        memoryBackup.writeString(serialized, forKey: Self.storageKey)
        storage.writeString(serialized, forKey: Self.storageKey)
    }

    @discardableResult
    public func reconcileExternalStorageEvent(
        _ rawJson: String?,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> Bool {
        guard let rawJson,
              let data = rawJson.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data, options: []),
              parsed is [String: Any]
        else {
            return false
        }

        var incoming = Self.migrateSave(jsonObject: parsed, nowEpochMs: nowEpochMs)
        guard incoming.saveRevision > currentSave.saveRevision else {
            return false
        }

        incoming.totalBrushStamps = max(incoming.totalBrushStamps, currentSave.totalBrushStamps)
        currentSave = incoming
        _ = checkThresholdAutoUnlocks()
        bus.emit(.saveUpdated(save: currentSave))
        return true
    }

    public func consumeSingleSupplyBeacon(nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()) {
        guard currentSave.pendingSupplyBeacons > 0 else { return }
        var next = currentSave
        next.pendingSupplyBeacons -= 1
        _ = save(next, nowEpochMs: nowEpochMs)
    }

    @discardableResult
    public func recordBrushAlongCompletion(
        withFlossBonus: Bool,
        withMouthwashBonus: Bool = false,
        date: Date = Date(),
        calendar: Calendar = .current
    ) -> PacerRewardOutcome {
        var next = currentSave
        let outcome = HabitBank.completeBrushAlong(
            save: &next,
            withFlossBonus: withFlossBonus,
            withMouthwashBonus: withMouthwashBonus,
            date: date,
            calendar: calendar
        )
        let nowMs = Int64((date.timeIntervalSince1970 * 1000.0).rounded())
        _ = save(next, nowEpochMs: nowMs)
        bus.emit(.companionUpdated(state: currentSave.companion))
        bus.emit(.pacerComplete(
            withFlossBonus: withFlossBonus,
            ionsAwarded: outcome.ionsAwarded,
            stampAwarded: outcome.stampAwarded
        ))
        return outcome
    }

    @discardableResult
    public func recordMissionCompletion(
        mode: ActivePlayMode,
        worldId: String,
        won: Bool,
        breakdown: ScoreBreakdown,
        historyNoteIds: [String]? = nil,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> MissionCompletionSaveOutcome {
        var next = currentSave
        let upgradesBefore = Set(next.unlockedUpgrades)
        var unlockedHistoryNoteId: String?
        var bonusRescueIons = 0

        if mode == .pulpRescue {
            bonusRescueIons = CompanionArchSim.resolvePulpRescue(
                &next.companion,
                won: won,
                nowEpochMs: nowEpochMs
            )
            next.fluorideIons += bonusRescueIons
        } else if mode == .arcade && won {
            var rec = next.worlds[worldId] ?? Self.createDefaultWorldRecord(unlocked: true)
            let isFirstClear = !rec.completed

            rec.unlocked = true
            rec.completed = true
            rec.timesCleared += 1
            rec.bestScore = max(rec.bestScore, breakdown.totalScore)
            if breakdown.grade.rank > rec.bestGrade.rank {
                rec.bestGrade = breakdown.grade
            }
            rec.bestCleanlinessPct = max(rec.bestCleanlinessPct, breakdown.cleanlinessPct)
            rec.sitesRestoredMax = max(rec.sitesRestoredMax, breakdown.sitesRestored)
            next.worlds[worldId] = rec

            // First-time world clear grants +1 monotonic Habit Stamp
            if isFirstClear {
                next.totalBrushStamps += 1
            }

            next.fluorideIons += breakdown.ionsEarned

            // Consume 1 Overdrive charge ONLY on completed Arcade run
            if next.remineralizedOverdriveRuns > 0 {
                next.remineralizedOverdriveRuns -= 1
            }

            CompanionArchSim.applyArcadeWorldClearPolish(&next.companion, nowEpochMs: nowEpochMs)

            let resolvedNotes = historyNoteIds ?? WorldRegistry.cartridge(forId: worldId)?.historyNoteIds ?? []
            for noteId in resolvedNotes {
                if HostsAndHistory.historyNoteIds.contains(noteId) &&
                    !next.unlockedHistoryNotes.contains(noteId) {
                    next.unlockedHistoryNotes.append(noteId)
                    unlockedHistoryNoteId = noteId
                }
            }
        }

        _ = save(next, nowEpochMs: nowEpochMs)
        let newlyUnlocked = currentSave.unlockedUpgrades.filter { !upgradesBefore.contains($0) }
        return MissionCompletionSaveOutcome(
            unlockedHistoryNoteId: unlockedHistoryNoteId,
            newlyUnlockedUpgradeIds: newlyUnlocked,
            bonusRescueIons: bonusRescueIons
        )
    }

    @discardableResult
    public func checkThresholdAutoUnlocks() -> [String] {
        var newlyUnlocked: [String] = []
        for upg in UpgradeCatalog.all {
            if currentSave.unlockedUpgrades.contains(upg.id) { continue }

            let byStamps = upg.stampUnlockThreshold != nil &&
                currentSave.totalBrushStamps >= upg.stampUnlockThreshold!
            let byWorld = upg.worldClearUnlockId != nil &&
                (currentSave.worlds[upg.worldClearUnlockId!]?.completed == true)

            if byStamps || byWorld {
                currentSave.unlockedUpgrades.append(upg.id)
                if currentSave.equippedUpgrades[upg.slot] == nil {
                    currentSave.equippedUpgrades[upg.slot] = upg.id
                }
                newlyUnlocked.append(upg.id)
                bus.emit(.upgradeUnlocked(
                    upgradeId: upg.id,
                    via: byWorld ? .worldClear : .stamps,
                    costPaid: 0
                ))
            }
        }

        Self.reconcileWorldUnlocks(&currentSave)
        return newlyUnlocked
    }

    @discardableResult
    public func purchaseUpgradeWithIons(
        _ upgradeId: String,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> Bool {
        guard let upg = UpgradeCatalog.get(upgradeId) else { return false }
        guard !currentSave.unlockedUpgrades.contains(upg.id) else { return false }
        guard currentSave.fluorideIons >= upg.ionCost else { return false }

        var next = currentSave
        next.fluorideIons -= upg.ionCost
        next.unlockedUpgrades.append(upg.id)
        next.equippedUpgrades[upg.slot] = upg.id
        _ = save(next, nowEpochMs: nowEpochMs)
        bus.emit(.upgradeUnlocked(upgradeId: upg.id, via: .ions, costPaid: upg.ionCost))
        return true
    }

    @discardableResult
    public func equipUpgrade(
        _ upgradeId: String,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> Bool {
        guard let upg = UpgradeCatalog.get(upgradeId) else { return false }
        guard currentSave.unlockedUpgrades.contains(upg.id) else { return false }

        var next = currentSave
        next.equippedUpgrades[upg.slot] = (next.equippedUpgrades[upg.slot] == upg.id) ? nil : upg.id
        _ = save(next, nowEpochMs: nowEpochMs)
        return true
    }

    @discardableResult
    public func setEquippedUpgrade(
        _ upgradeId: String?,
        for slot: ActuatorKind,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> Bool {
        if let upgradeId {
            guard let upg = UpgradeCatalog.get(upgradeId),
                  upg.slot == slot,
                  currentSave.unlockedUpgrades.contains(upg.id)
            else {
                return false
            }
            var next = currentSave
            next.equippedUpgrades[slot] = upg.id
            _ = save(next, nowEpochMs: nowEpochMs)
            return true
        } else {
            var next = currentSave
            next.equippedUpgrades[slot] = nil
            _ = save(next, nowEpochMs: nowEpochMs)
            return true
        }
    }

    @discardableResult
    public func feedCompanionTreat(
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> TreatFeedOutcome {
        var next = currentSave
        let outcome = CompanionArchSim.feedRegionalTreat(&next.companion, nowEpochMs: nowEpochMs)
        next.fluorideIons += outcome.ionsGranted
        _ = save(next, nowEpochMs: nowEpochMs)
        bus.emit(.companionUpdated(state: currentSave.companion))
        return outcome
    }

    @discardableResult
    public func claimCompanionIdleIons(
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> Int {
        var next = currentSave
        _ = CompanionArchSim.reconcileOfflineElapsed(&next.companion, nowEpochMs: nowEpochMs)
        let claimed = CompanionArchSim.claimIdleIons(&next.companion)
        next.fluorideIons += claimed
        _ = save(next, nowEpochMs: nowEpochMs)
        bus.emit(.companionUpdated(state: currentSave.companion))
        return claimed
    }

    @discardableResult
    public func updateProfile(
        displayName: String? = nil,
        skinToneIndex: Int? = nil,
        homeCityId: String? = nil,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> PlayerHostProfile {
        var next = currentSave
        if let displayName {
            let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            next.playerProfile.displayName = trimmed.isEmpty ? "Explorer" : String(trimmed.prefix(24))
        }
        if let skinToneIndex {
            let maxIdx = max(0, HostsAndHistory.realisticSkinTones.count - 1)
            next.playerProfile.skinToneIndex = max(0, min(maxIdx, skinToneIndex))
        }
        if let homeCityId, HostsAndHistory.hostCityIds.contains(homeCityId) {
            next.playerProfile.homeCityId = homeCityId
        }
        _ = save(next, nowEpochMs: nowEpochMs)
        return currentSave.playerProfile
    }

    @discardableResult
    public func updateProfile(
        _ profile: PlayerHostProfile,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> PlayerHostProfile {
        updateProfile(
            displayName: profile.displayName,
            skinToneIndex: profile.skinToneIndex,
            homeCityId: profile.homeCityId,
            nowEpochMs: nowEpochMs
        )
    }

    public func setQualityPreference(
        _ preference: QualityPreference,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) {
        var next = currentSave
        next.qualityPreference = preference
        _ = save(next, nowEpochMs: nowEpochMs)
    }

    public func markCosmicIntroSeen(nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()) {
        var next = currentSave
        next.hasSeenCosmicIntro = true
        _ = save(next, nowEpochMs: nowEpochMs)
    }

    public func exportSyncCode() -> String {
        Self.encodeSaveToSyncCode(currentSave)
    }

    @discardableResult
    public func importSyncCode(
        _ code: String,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) throws -> MouthLifeSaveV2 {
        var imported = try Self.decodeSaveFromSyncCode(code, nowEpochMs: nowEpochMs)
        // Preserve monotonic stamps across merges if player imports on existing device
        imported.totalBrushStamps = max(imported.totalBrushStamps, currentSave.totalBrushStamps)
        _ = CompanionArchSim.reconcileOfflineElapsed(&imported.companion, nowEpochMs: nowEpochMs)
        imported.saveRevision = max(currentSave.saveRevision, imported.saveRevision) + 1
        currentSave = imported
        _ = checkThresholdAutoUnlocks()
        persistInternal(nowEpochMs: nowEpochMs)
        bus.emit(.saveUpdated(save: currentSave))
        return currentSave
    }
}
