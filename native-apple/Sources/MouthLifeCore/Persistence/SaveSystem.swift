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
            return "This is not a MouthLife code. It should start with ML2:"
        // A code cut short or mistyped gets one plain message, the same as on the web.
        case .malformedPayload, .invalidUtf8:
            return "This code is damaged and can’t be read."
        case .invalidJson:
            return "This code is damaged and can’t be read."
        case .missingSchemaVersion:
            return "This code is missing its version number."
        case .unsupportedSchemaVersion(let version):
            return "This code is from a version this app can’t read (\(version))."
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

    /// How many brushing days a save keeps: the newest ones (see the day rule in `migrateSave`).
    /// The web's DAILY_LOG_MAX_DAYS.
    public static let dailyLogMaxDays = 45
    /// The most visible characters a name keeps. The web's DISPLAY_NAME_MAX_CHARS.
    public static let displayNameMaxChars = 24
    /// The most UTF-16 units a name keeps, whatever its characters are made of. The web's
    /// DISPLAY_NAME_MAX_UNITS.
    public static let displayNameMaxUnits = 256

    /// The spaces a name is trimmed of, exactly as the web's `String.prototype.trim` trims them:
    /// the ECMAScript white space (tab, vertical tab, form feed, space, no-break space, the byte
    /// order mark and every Unicode space separator) and line terminators. Not Foundation's
    /// `.whitespacesAndNewlines`, which also trims U+0085 and U+200B and keeps U+FEFF, so one code
    /// could give two different names.
    static let webTrimmedSpaces: CharacterSet = {
        var set = CharacterSet(charactersIn: "\u{0009}\u{000A}\u{000B}\u{000C}\u{000D}\u{0020}\u{00A0}\u{1680}")
        set.insert(charactersIn: "\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}")
        set.insert(charactersIn: Unicode.Scalar(0x2000)!...Unicode.Scalar(0x200A)!)
        return set
    }()

    /// A name with spaces trimmed from both ends, as the web trims it (`webTrimmedSpaces`).
    static func trimName(_ name: String) -> String {
        name.trimmingCharacters(in: webTrimmedSpaces)
    }

    /// The first 24 whole visible characters of a name, stopping before it passes 256 UTF-16 units.
    ///
    /// One visible character can carry any number of stacked marks, so 24 of them can still be very
    /// long: a crafted name could make a save's own Sync Code too long to read back. The cut is
    /// always at a whole character and never skips one to fit a smaller one after it; a first
    /// character too long by itself leaves nothing, and the caller then uses the usual name. Same
    /// rule as the web's `truncateDisplayName`, so one code gives one name in both editions.
    public static func truncateDisplayName(
        _ name: String,
        maxChars: Int = displayNameMaxChars,
        maxUnits: Int = displayNameMaxUnits
    ) -> String {
        var out = ""
        var kept = 0
        var units = 0
        for character in name {
            let size = character.utf16.count
            if kept >= maxChars || units + size > maxUnits { break }
            out.append(character)
            kept += 1
            units += size
        }
        return out
    }

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

        // check the value before turning it into an Int: a huge number would crash the conversion
        guard versionDouble == 1 || versionDouble == 2 else {
            return base
        }
        let version = Int(versionDouble)

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
            // The 45 most recent valid days: a malformed key must not take the place of a real one.
            let dated = rawDaily.keys.filter { isValidDateKey($0) }.sorted()
            // Days that can have happened come first: everything up to tomorrow (tomorrow, because a
            // code may come from a device a time zone ahead). Days dated later only fill the room
            // that is left. A crafted code full of days in the year 9999 can then never push the real
            // days out, and a device whose own clock is set too early still keeps its newest days.
            // Same rule as the web's migrateSave, so one code keeps the same days in both editions.
            let tomorrow = formatLocalDateKey(Date(timeIntervalSince1970: Double(nowEpochMs) / 1000 + 86_400))
            let happened = Array(dated.filter { $0 <= tomorrow }.suffix(dailyLogMaxDays))
            let room = dailyLogMaxDays - happened.count
            let later = room > 0 ? Array(dated.filter { $0 > tomorrow }.suffix(room)) : []
            for dateKey in happened + later {
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
                } else if val is [Any] {
                    // A list where a day belongs: the web reads it as an object with no counts and
                    // keeps an empty day, so this does too (one code, the same days in both editions).
                    base.dailySlotsByDate[dateKey] = DailySlotLog(fullRewards: 0, tips: 0)
                }
            }
        }

        // Player profile
        if let p = obj["playerProfile"] as? [String: Any] {
            let rawName = trimName(p["displayName"] as? String ?? "")
            // Nothing left after the cut (no name, or one "letter" too long to keep): the usual name.
            let cutName = truncateDisplayName(rawName)
            let safeName = cutName.isEmpty ? "Explorer" : cutName
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
        // The web's code.trim() and /\s+/g remove exactly `webTrimmedSpaces`: the same here, so a
        // code pasted with a stray invisible character reads (or fails) the same in both editions.
        let trimmed = code.trimmingCharacters(in: webTrimmedSpaces)
        guard trimmed.hasPrefix(syncCodePrefix) else {
            throw SyncCodeError.missingPrefix
        }

        let afterPrefix = trimmed.dropFirst(syncCodePrefix.count)
        var compactScalars = String.UnicodeScalarView()
        for scalar in afterPrefix.unicodeScalars {
            if webTrimmedSpaces.contains(scalar) {
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
        // check the value before turning it into an Int: a huge number would crash the conversion
        guard vDouble == 1 || vDouble == 2 else {
            throw SyncCodeError.unsupportedSchemaVersion(vDouble.isFinite && abs(vDouble) < 1e9 ? Int(vDouble) : -1)
        }

        return migrateSave(jsonObject: dict, nowEpochMs: nowEpochMs)
    }

    /// What the import box and the backup-file button accept: an `ML2:` Sync Code, or the text of
    /// a `backup.mouthlife.json` file from the web edition's Download button (H08). Both pass the
    /// same checks and migration. Web twin: `decodeSaveFromText` in SaveSystem.ts.
    public static func decodeSaveFromText(
        _ text: String,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) throws -> MouthLifeSaveV2 {
        // As the web's text.trim(): it also takes off a byte-order mark (U+FEFF) at either end,
        // however many there are.
        let trimmed = text.trimmingCharacters(in: webTrimmedSpaces)
        guard trimmed.hasPrefix("{") else {
            return try decodeSaveFromSyncCode(trimmed, nowEpochMs: nowEpochMs)
        }
        // Counted in UTF-16 units, as the web's `trimmed.length > 262144` counts: in bytes, a text
        // full of accents or emoji the web accepts would be refused here.
        guard trimmed.utf16.count <= 262_144,
              let data = trimmed.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data, options: []),
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
        guard vDouble == 1 || vDouble == 2 else {
            throw SyncCodeError.unsupportedSchemaVersion(vDouble.isFinite && abs(vDouble) < 1e9 ? Int(vDouble) : -1)
        }
        return migrateSave(jsonObject: dict, nowEpochMs: nowEpochMs)
    }

    /// A save as read back from storage: readable, damaged, or written by a newer version (H02).
    public enum StoredSaveRead: Sendable {
        case ok(MouthLifeSaveV2, schemaVersion: Int)
        case unreadable
        case newerVersion(Int)
    }

    public static func readStoredSave(
        _ rawText: String,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> StoredSaveRead {
        guard let data = rawText.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data, options: []),
              let obj = parsed as? [String: Any],
              let version = jsonDouble(obj["schemaVersion"])
        else {
            return .unreadable
        }
        if version == 1 || version == 2 {
            return .ok(migrateSave(jsonObject: obj, nowEpochMs: nowEpochMs), schemaVersion: Int(version))
        }
        if version.isFinite && version > 2 {
            return .newerVersion(version < 1e9 ? Int(version) : Int.max)
        }
        return .unreadable
    }

    /// How `load` found the stored save.
    public enum LoadOutcome: String, Sendable {
        case new
        case loaded
        case unreadable
        case newerVersion
    }

    /// The bytes of a stored save this build could not read, kept before anything replaces them.
    public static let unreadableCopyKey = "mouthlife_save_v2_unreadable"
    /// A copy of a version-1 save, kept before its first rewrite in the version-2 shape.
    public static let v1CopyKey = "mouthlife_save_v1_copy"

    // MARK: - Instance Persistence Operations

    /// How the last `load` found the stored save.
    public private(set) var loadOutcome: LoadOutcome = .new
    /// True while nothing is written because the stored save came from a newer version (H02).
    public private(set) var isPersistenceSuspended = false

    /// Keeps the first copy only, so a later problem never overwrites the bytes worth recovering.
    private func keepCopy(_ rawText: String, forKey key: String) {
        if storage.readString(forKey: key) == nil {
            storage.writeString(rawText, forKey: key)
        }
    }

    @discardableResult
    public func load(
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs(),
        calendar: Calendar = .current
    ) -> MouthLifeSaveV2 {
        isPersistenceSuspended = false
        let rawText = storage.readString(forKey: Self.storageKey) ?? memoryBackup.readString(forKey: Self.storageKey)
        guard let rawText, !rawText.isEmpty else {
            // Only a missing save starts a new one in storage (H02).
            loadOutcome = .new
            currentSave = Self.createDefaultSave(nowEpochMs: nowEpochMs)
            persistInternal(nowEpochMs: nowEpochMs)
            return currentSave
        }

        switch Self.readStoredSave(rawText, nowEpochMs: nowEpochMs) {
        case .ok(let loaded, let schemaVersion):
            if schemaVersion == 1 {
                keepCopy(rawText, forKey: Self.v1CopyKey)
            }
            loadOutcome = .loaded
            currentSave = loaded
            // Day keys written on a device set to another calendar become Gregorian (M02).
            HabitBank.migrateLegacyCalendarKeys(
                &currentSave,
                calendar: calendar,
                now: Date(timeIntervalSince1970: Double(nowEpochMs) / 1000.0)
            )
        case .newerVersion:
            // A newer version wrote this save (an older build is running): play goes on with a fresh
            // save in memory, and the stored one stays exactly as it is until the player imports a
            // code or erases on purpose.
            keepCopy(rawText, forKey: Self.unreadableCopyKey)
            loadOutcome = .newerVersion
            isPersistenceSuspended = true
            currentSave = Self.createDefaultSave(nowEpochMs: nowEpochMs)
            return currentSave
        case .unreadable:
            // Damaged past reading by any version: keep its bytes, then start fresh so progress is
            // saved again from now on.
            keepCopy(rawText, forKey: Self.unreadableCopyKey)
            loadOutcome = .unreadable
            currentSave = Self.createDefaultSave(nowEpochMs: nowEpochMs)
            persistInternal(nowEpochMs: nowEpochMs)
            return currentSave
        }

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
        let revisionBefore = currentSave.saveRevision
        // Erasing on purpose replaces even a save from a newer version (its bytes are kept).
        isPersistenceSuspended = false
        currentSave = Self.createDefaultSave(nowEpochMs: nowEpochMs)
        currentSave.saveRevision = revisionBefore + 1
        persistInternal(nowEpochMs: nowEpochMs)
        bus.emit(.saveUpdated(save: currentSave))
        return currentSave
    }

    /// Settings' "Erase Save": erases everything the save system keeps, then starts a brand-new
    /// Day-1 save. That is the save itself and both kept copies (the bytes of a save this build
    /// could not read, and the version-1 copy). The privacy notice promises that all saved data can
    /// be erased, and an erase that leaves copies behind is not an erase. `resetToFreshSave` alone
    /// keeps the copies.
    @discardableResult
    public func eraseAllSavedData(
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) -> MouthLifeSaveV2 {
        storage.removeValue(forKey: Self.unreadableCopyKey)
        storage.removeValue(forKey: Self.v1CopyKey)
        return resetToFreshSave(nowEpochMs: nowEpochMs)
    }

    private func persistInternal(nowEpochMs: Int64) {
        currentSave.lastSavedEpochMs = nowEpochMs
        // A save from a newer version stays untouched until the player imports or erases (H02).
        guard !isPersistenceSuspended else { return }
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

        guard let dict = parsed as? [String: Any],
              let version = Self.jsonDouble(dict["schemaVersion"]),
              version == 1 || version == 2
        else {
            // Keep the local save when the cloud copy is unreadable or from a newer version.
            return false
        }
        let incoming = Self.migrateSave(jsonObject: dict, nowEpochMs: nowEpochMs)
        // Another device's save is merged, never swapped in whole, even at an equal or higher
        // revision: a city clear made here must survive a profile edit made there (M04).
        var merged = Self.mergeSaves(current: currentSave, imported: incoming)
        merged.saveRevision = max(currentSave.saveRevision, incoming.saveRevision)
        // The name and look come from whichever side changed them last (an import takes the code's).
        merged.playerProfile = incoming.lastSavedEpochMs >= currentSave.lastSavedEpochMs
            ? incoming.playerProfile
            : currentSave.playerProfile
        guard merged != currentSave else {
            return false
        }
        currentSave = merged
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
        fullBrush: Bool = true,
        rinseStepOff: Bool = false,
        date: Date = Date(),
        rewardDay: Date? = nil,
        calendar: Calendar = .current
    ) -> PacerRewardOutcome {
        var next = currentSave
        let outcome = HabitBank.completeBrushAlong(
            save: &next,
            withFlossBonus: withFlossBonus,
            withMouthwashBonus: withMouthwashBonus,
            fullBrush: fullBrush,
            rinseStepOff: rinseStepOff,
            date: date,
            rewardDay: rewardDay,
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
            let cut = Self.truncateDisplayName(Self.trimName(displayName))
            next.playerProfile.displayName = cut.isEmpty ? "Explorer" : cut
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

    /// Two saves of the same player made into one, so an older code never erases newer progress:
    /// each city keeps its best record, counts keep the higher value, unlocks are combined, each
    /// day's reward slots keep the higher count, the companion comes from the newer save, and this
    /// device keeps its own graphics setting. Twin of mergeSaves in SaveSystem.ts.
    /// `preferImported`: this device's save is brand new (the Prologue's "Have a Sync Code?"), so the
    /// code's tooth, settings and choices win even though the fresh save was written more recently.
    /// Counts and unlocks still merge the same way.
    /// True when `older` holds nothing that `newer` lacks: an earlier save time and revision, no
    /// more stamps, and every city record, brushing day, treat, unlock and history note matched or
    /// beaten. Replaying such a code must not refill what `newer` has spent since (M03). Days and
    /// treats `newer` has already let go of are not counted against it. Web twin: `isSupersededBy`.
    public static func isSuperseded(_ older: MouthLifeSaveV2, by newer: MouthLifeSaveV2) -> Bool {
        if older.saveRevision >= newer.saveRevision || older.lastSavedEpochMs > newer.lastSavedEpochMs {
            return false
        }
        if older.totalBrushStamps > newer.totalBrushStamps { return false }
        let newerTreats = newer.companion.recentTreatTimestampsMs
        let oldestTreatKept: Int64 = newerTreats.count >= 12 ? (newerTreats.min() ?? Int64.min) : Int64.min
        for ts in older.companion.recentTreatTimestampsMs where ts >= oldestTreatKept && !newerTreats.contains(ts) {
            return false
        }
        for (id, a) in older.worlds {
            guard let b = newer.worlds[id] else {
                if a.completed || a.timesCleared > 0 || a.bestScore > 0 { return false }
                continue
            }
            if (a.completed && !b.completed) || (a.unlocked && !b.unlocked) ||
                a.timesCleared > b.timesCleared || a.bestScore > b.bestScore ||
                a.bestGrade.rank > b.bestGrade.rank ||
                a.bestCleanlinessPct > b.bestCleanlinessPct ||
                a.sitesRestoredMax > b.sitesRestoredMax {
                return false
            }
        }
        let newerDays = newer.dailySlotsByDate.keys.sorted()
        let oldestKept = newerDays.count >= dailyLogMaxDays ? (newerDays.first ?? "") : ""
        for (day, a) in older.dailySlotsByDate where day >= oldestKept {
            let b = newer.dailySlotsByDate[day]
            if a.fullRewards > (b?.fullRewards ?? 0) || a.tips > (b?.tips ?? 0) { return false }
        }
        let upgrades = Set(newer.unlockedUpgrades)
        if older.unlockedUpgrades.contains(where: { !upgrades.contains($0) }) { return false }
        let notes = Set(newer.unlockedHistoryNotes)
        if older.unlockedHistoryNotes.contains(where: { !notes.contains($0) }) { return false }
        return true
    }

    public static func mergeSaves(current: MouthLifeSaveV2, imported: MouthLifeSaveV2, preferImported: Bool = false) -> MouthLifeSaveV2 {
        let newer = preferImported || imported.lastSavedEpochMs >= current.lastSavedEpochMs ? imported : current
        func union(_ a: [String], _ b: [String]) -> [String] {
            var seen = Set<String>()
            return (a + b).filter { seen.insert($0).inserted }
        }
        var worlds: [String: WorldRecord] = [:]
        for id in Set(current.worlds.keys).union(imported.worlds.keys) {
            guard let a = current.worlds[id], let b = imported.worlds[id] else {
                worlds[id] = current.worlds[id] ?? imported.worlds[id]
                continue
            }
            var w = a
            w.unlocked = a.unlocked || b.unlocked
            w.completed = a.completed || b.completed
            w.timesCleared = max(a.timesCleared, b.timesCleared)
            w.bestScore = max(a.bestScore, b.bestScore)
            w.bestGrade = a.bestGrade.rank >= b.bestGrade.rank ? a.bestGrade : b.bestGrade
            w.bestCleanlinessPct = max(a.bestCleanlinessPct, b.bestCleanlinessPct)
            w.sitesRestoredMax = max(a.sitesRestoredMax, b.sitesRestoredMax)
            worlds[id] = w
        }
        var daily: [String: DailySlotLog] = [:]
        for day in Set(current.dailySlotsByDate.keys).union(imported.dailySlotsByDate.keys) {
            let a = current.dailySlotsByDate[day] ?? DailySlotLog()
            let b = imported.dailySlotsByDate[day] ?? DailySlotLog()
            daily[day] = DailySlotLog(fullRewards: max(a.fullRewards, b.fullRewards), tips: max(a.tips, b.tips))
        }
        let unlocked = union(current.unlockedUpgrades, imported.unlockedUpgrades)
        func pick(_ slot: KeyPath<EquippedUpgrades, String?>) -> String? {
            let want = newer.equippedUpgrades[keyPath: slot] ?? current.equippedUpgrades[keyPath: slot] ?? imported.equippedUpgrades[keyPath: slot]
            guard let want, unlocked.contains(want) else { return nil }
            return want
        }
        // A code that brings nothing new is an older copy of this save (M03): spent ions, beacons
        // and Overdrive charges stay spent instead of coming back with it.
        let keepWallet = !preferImported && isSuperseded(imported, by: current)
        func wallet(_ a: Int, _ b: Int) -> Int { keepWallet ? a : max(a, b) }
        var out = newer
        out.hasSeenCosmicIntro = current.hasSeenCosmicIntro || imported.hasSeenCosmicIntro
        out.playerProfile = imported.playerProfile
        out.companion = newer.companion
        out.totalBrushStamps = max(current.totalBrushStamps, imported.totalBrushStamps)
        out.fluorideIons = wallet(current.fluorideIons, imported.fluorideIons)
        out.dailySlotsByDate = daily
        out.pendingSupplyBeacons = wallet(current.pendingSupplyBeacons, imported.pendingSupplyBeacons)
        out.remineralizedOverdriveRuns = wallet(current.remineralizedOverdriveRuns, imported.remineralizedOverdriveRuns)
        out.unlockedUpgrades = unlocked
        out.equippedUpgrades = EquippedUpgrades(brush: pick(\.brush), floss: pick(\.floss), rinse: pick(\.rinse))
        out.unlockedHistoryNotes = union(current.unlockedHistoryNotes, imported.unlockedHistoryNotes)
        out.qualityPreference = current.qualityPreference
        out.worlds = worlds
        out.lastSavedEpochMs = max(current.lastSavedEpochMs, imported.lastSavedEpochMs)
        return out
    }

    public func exportSyncCode() -> String {
        Self.encodeSaveToSyncCode(currentSave)
    }

    @discardableResult
    public func importSyncCode(
        _ code: String,
        preferImported: Bool = false,
        nowEpochMs: Int64 = CompanionArchSim.currentEpochMs()
    ) throws -> MouthLifeSaveV2 {
        // An ML2: code, or the text of a web backup.mouthlife.json file (H08).
        let imported = try Self.decodeSaveFromText(code, nowEpochMs: nowEpochMs)
        // "Import & Merge" merges: nothing either device earned is lost (see mergeSaves).
        var merged = Self.mergeSaves(current: currentSave, imported: imported, preferImported: preferImported)
        _ = CompanionArchSim.reconcileOfflineElapsed(&merged.companion, nowEpochMs: nowEpochMs)
        merged.saveRevision = max(currentSave.saveRevision, imported.saveRevision) + 1
        currentSave = merged
        // Importing on purpose is the player's choice to replace a save this version can't read.
        isPersistenceSuspended = false
        _ = checkThresholdAutoUnlocks()
        persistInternal(nowEpochMs: nowEpochMs)
        bus.emit(.saveUpdated(save: currentSave))
        return currentSave
    }
}
