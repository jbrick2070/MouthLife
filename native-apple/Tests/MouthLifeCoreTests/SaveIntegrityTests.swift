import XCTest
@testable import MouthLifeCore

/// Save fixes from the November 2026 release review (H02, H08, M01-M04), kept identical to the web
/// edition's tests/saveIntegrity.test.ts where both editions share the rule.
final class SaveIntegrityTests: XCTestCase {
    private let t0: Int64 = 1_700_000_000_000

    // H02: a save written by a newer version is never overwritten by startup, play or backgrounding.
    func testNewerVersionSaveIsLeftExactlyAsStored() {
        let raw = #"{"schemaVersion":3,"totalBrushStamps":73,"fluorideIons":421,"somethingNew":{"a":1}}"#
        let mem = InMemorySaveStorage(initialValues: [SaveSystem.storageKey: raw])
        let sys = SaveSystem(bus: EventBus(), storage: mem)
        var loaded = sys.load(nowEpochMs: t0)
        XCTAssertEqual(sys.loadOutcome, .newerVersion)
        XCTAssertTrue(sys.isPersistenceSuspended)
        // What AppCoordinator.init does right after loading, then a purchase-style save.
        _ = CompanionArchSim.reconcileOfflineElapsed(&loaded.companion, nowEpochMs: t0 + 1)
        _ = sys.save(loaded, nowEpochMs: t0 + 2)
        sys.consumeSingleSupplyBeacon(nowEpochMs: t0 + 3)
        XCTAssertEqual(mem.readString(forKey: SaveSystem.storageKey), raw)
        XCTAssertEqual(mem.readString(forKey: SaveSystem.unreadableCopyKey), raw)

        // Erasing on purpose replaces it; its bytes stay in the copy.
        _ = sys.resetToFreshSave(nowEpochMs: t0 + 4)
        XCTAssertFalse(sys.isPersistenceSuspended)
        XCTAssertNotEqual(mem.readString(forKey: SaveSystem.storageKey), raw)
        XCTAssertEqual(mem.readString(forKey: SaveSystem.unreadableCopyKey), raw)
    }

    // Settings' Erase Save: the privacy notice promises all saved data can be erased, so the copies
    // the save system keeps go too, and nothing old comes back at the next launch.
    func testEraseAllSavedDataLeavesNoCopyBehind() {
        let rawV1 = #"{"schemaVersion":1,"totalBrushStamps":12,"fluorideCrystals":300}"#
        let damaged = #"{"schemaVersion":2,"totalBrushStamps":73,"fluori"#
        let mem = InMemorySaveStorage(initialValues: [SaveSystem.storageKey: rawV1, SaveSystem.unreadableCopyKey: damaged])
        let sys = SaveSystem(bus: EventBus(), storage: mem)
        var played = sys.load(nowEpochMs: t0)
        played.playerProfile.displayName = "Old Name"
        played.hasSeenCosmicIntro = true
        played.dailySlotsByDate["2026-11-19"] = DailySlotLog(fullRewards: 2, tips: 1)
        played.worlds["world_1"]?.completed = true
        _ = sys.save(played, nowEpochMs: t0 + 1)
        XCTAssertEqual(mem.readString(forKey: SaveSystem.v1CopyKey), rawV1)
        XCTAssertEqual(mem.readString(forKey: SaveSystem.unreadableCopyKey), damaged)

        let fresh = sys.eraseAllSavedData(nowEpochMs: t0 + 2)
        // exactly a brand-new save (only the revision counter keeps rising)
        var expected = SaveSystem.createDefaultSave(nowEpochMs: t0 + 2)
        expected.saveRevision = fresh.saveRevision
        XCTAssertEqual(fresh, expected)
        XCTAssertEqual(sys.getSave(), fresh)
        // the fresh save is all that is stored
        XCTAssertEqual(Set(mem.snapshot().keys), [SaveSystem.storageKey])
        XCTAssertFalse(mem.readString(forKey: SaveSystem.storageKey)?.contains("Old Name") ?? true)

        // the next launch finds the fresh save and nothing else
        let relaunched = SaveSystem(bus: EventBus(), storage: mem)
        let loaded = relaunched.load(nowEpochMs: t0 + 3)
        XCTAssertEqual(relaunched.loadOutcome, .loaded)
        XCTAssertEqual(loaded.totalBrushStamps, 0)
        XCTAssertEqual(loaded.fluorideIons, 0)
        XCTAssertEqual(loaded.playerProfile.displayName, "Explorer")
        XCTAssertFalse(loaded.hasSeenCosmicIntro)
        XCTAssertTrue(loaded.dailySlotsByDate.isEmpty)
        XCTAssertEqual(loaded.worlds["world_1"]?.completed, false)
        XCTAssertEqual(Set(mem.snapshot().keys), [SaveSystem.storageKey])
    }

    // Erase Save also replaces a save written by a newer version, and its kept bytes go as well.
    func testEraseAllSavedDataReplacesANewerVersionSaveAndItsCopy() {
        let raw = #"{"schemaVersion":3,"totalBrushStamps":73,"fluorideIons":421,"somethingNew":{"a":1}}"#
        let mem = InMemorySaveStorage(initialValues: [SaveSystem.storageKey: raw])
        let sys = SaveSystem(bus: EventBus(), storage: mem)
        _ = sys.load(nowEpochMs: t0)
        XCTAssertTrue(sys.isPersistenceSuspended)
        XCTAssertEqual(mem.readString(forKey: SaveSystem.unreadableCopyKey), raw)

        _ = sys.eraseAllSavedData(nowEpochMs: t0 + 1)
        XCTAssertFalse(sys.isPersistenceSuspended)
        XCTAssertEqual(Set(mem.snapshot().keys), [SaveSystem.storageKey])
        XCTAssertFalse(mem.readString(forKey: SaveSystem.storageKey)?.contains("somethingNew") ?? true)
        // saving works again from here on
        var next = sys.getSave()
        next.fluorideIons = 5
        _ = sys.save(next, nowEpochMs: t0 + 2)
        let relaunched = SaveSystem(bus: EventBus(), storage: mem)
        XCTAssertEqual(relaunched.load(nowEpochMs: t0 + 3).fluorideIons, 5)
    }

    // The words of Settings' Erase Save (the button, its second tap and the Home toast) are the
    // web's, so every language already has them: nothing new to translate.
    func testEraseSaveWordsAreAlreadyInEveryLanguage() {
        defer { L10n.setLanguage("en") }
        for code in L10nCatalogs.languageCodes {
            L10n.setLanguage(code)
            for text in ["🔄 Erase Save", "⚠️ Tap Again to Erase", "Save erased. You are starting fresh!"] {
                XCTAssertNotEqual(L10n.t(text), text, "\(code): \(text)")
            }
        }
    }

    func testDamagedSaveBytesAreKeptBeforeStartingFresh() {
        let raw = #"{"schemaVersion":2,"totalBrushStamps":73,"fluori"#
        let mem = InMemorySaveStorage(initialValues: [SaveSystem.storageKey: raw])
        let sys = SaveSystem(bus: EventBus(), storage: mem)
        _ = sys.load(nowEpochMs: t0)
        XCTAssertEqual(sys.loadOutcome, .unreadable)
        XCTAssertFalse(sys.isPersistenceSuspended)
        XCTAssertEqual(mem.readString(forKey: SaveSystem.unreadableCopyKey), raw)
        XCTAssertNotEqual(mem.readString(forKey: SaveSystem.storageKey), raw)
    }

    func testOnlyAMissingSaveStartsANewStoredSave() {
        let mem = InMemorySaveStorage()
        let sys = SaveSystem(bus: EventBus(), storage: mem)
        _ = sys.load(nowEpochMs: t0)
        XCTAssertEqual(sys.loadOutcome, .new)
        XCTAssertNotNil(mem.readString(forKey: SaveSystem.storageKey))
        XCTAssertNil(mem.readString(forKey: SaveSystem.unreadableCopyKey))
    }

    func testVersionOneSaveIsCopiedBeforeItsFirstRewrite() {
        let raw = #"{"schemaVersion":1,"totalBrushStamps":12,"fluorideCrystals":300}"#
        let mem = InMemorySaveStorage(initialValues: [SaveSystem.storageKey: raw])
        let sys = SaveSystem(bus: EventBus(), storage: mem)
        let loaded = sys.load(nowEpochMs: t0)
        XCTAssertEqual(loaded.fluorideIons, 300)
        _ = sys.save(loaded, nowEpochMs: t0 + 1)
        XCTAssertEqual(mem.readString(forKey: SaveSystem.v1CopyKey), raw)
    }

    // H08: the web edition's downloaded backup.mouthlife.json imports through the same checks.
    func testDownloadedBackupJsonImports() throws {
        var source = SaveSystem.createDefaultSave(nowEpochMs: t0)
        source.playerProfile.displayName = "Zoë 🦷 Ōkafor"
        source.totalBrushStamps = 14
        source.fluorideIons = 777
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted]
        let backup = "\u{FEFF}" + String(decoding: try encoder.encode(source), as: UTF8.self)

        let sys = SaveSystem(bus: EventBus(), storage: InMemorySaveStorage())
        _ = sys.load(nowEpochMs: t0 + 10)
        let merged = try sys.importSyncCode(backup, nowEpochMs: t0 + 20)
        XCTAssertEqual(merged.playerProfile.displayName, "Zoë 🦷 Ōkafor")
        XCTAssertEqual(merged.totalBrushStamps, 14)
        XCTAssertEqual(merged.fluorideIons, 777)

        let before = sys.getSave()
        XCTAssertThrowsError(try sys.importSyncCode(#"{"schemaVersion":2,"totalBrush"#))
        XCTAssertThrowsError(try sys.importSyncCode(#"{"schemaVersion":3}"#))
        XCTAssertEqual(sys.getSave(), before)
    }

    // M01: the newest days survive, and a malformed key never takes a real day's place.
    func testKeepsTheFortyFiveLatestValidDays() {
        var daily: [String: Any] = [:]
        for d in 1...31 { daily[String(format: "2026-10-%02d", d)] = ["fullRewards": 1, "tips": 0] }
        for d in 1...28 { daily[String(format: "2026-03-%02d", d)] = ["fullRewards": 2, "tips": 0] }
        daily["zzzz-zz-zz"] = ["fullRewards": 2, "tips": 0]
        let save = SaveSystem.migrateSave(jsonObject: ["schemaVersion": 2, "dailySlotsByDate": daily], nowEpochMs: t0)
        XCTAssertEqual(save.dailySlotsByDate.count, 45)
        XCTAssertNotNil(save.dailySlotsByDate["2026-10-31"])
        XCTAssertNotNil(save.dailySlotsByDate["2026-03-15"])
        XCTAssertNil(save.dailySlotsByDate["2026-03-14"])
    }

    // M02: day keys are Gregorian on every device, and old keys from another calendar move over.
    func testDayKeysAreGregorianOnABuddhistCalendarDevice() throws {
        var buddhist = Calendar(identifier: .buddhist)
        buddhist.timeZone = try XCTUnwrap(TimeZone(identifier: "Asia/Bangkok"))
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = buddhist.timeZone
        let day = try XCTUnwrap(gregorian.date(from: DateComponents(year: 2026, month: 11, day: 19, hour: 9)))
        XCTAssertEqual(HabitBank.localDateKey(for: day, calendar: buddhist), "2026-11-19")

        var save = SaveSystem.createDefaultSave(nowEpochMs: t0)
        save.dailySlotsByDate = [
            "2569-11-19": DailySlotLog(fullRewards: 2, tips: 1),
            "2026-11-19": DailySlotLog(fullRewards: 1, tips: 2),
            "2026-11-18": DailySlotLog(fullRewards: 1, tips: 0)
        ]
        HabitBank.migrateLegacyCalendarKeys(&save, calendar: buddhist, now: day)
        XCTAssertNil(save.dailySlotsByDate["2569-11-19"])
        XCTAssertEqual(save.dailySlotsByDate["2026-11-19"], DailySlotLog(fullRewards: 2, tips: 2))
        XCTAssertEqual(save.dailySlotsByDate["2026-11-18"], DailySlotLog(fullRewards: 1, tips: 0))

        // The same day is capped: a third full brush pays nothing more.
        let outcome = HabitBank.evaluatePacerReward(
            currentSlot: save.dailySlotsByDate["2026-11-19"] ?? DailySlotLog(),
            withFlossBonus: true,
            dateKey: HabitBank.localDateKey(for: day, calendar: buddhist)
        )
        XCTAssertEqual(outcome.slotType, .tip)

        // Nothing changes on a Gregorian device.
        var untouched = save
        untouched.dailySlotsByDate["2569-11-20"] = DailySlotLog(fullRewards: 1, tips: 0)
        let copy = untouched
        HabitBank.migrateLegacyCalendarKeys(&untouched, calendar: gregorian, now: day)
        XCTAssertEqual(untouched, copy)
    }

    // M03: replaying an older code of the same save does not refund what was spent.
    func testOldSyncCodeDoesNotRefundSpentBalances() throws {
        let sys = SaveSystem(bus: EventBus(), storage: InMemorySaveStorage())
        var s = sys.load(nowEpochMs: t0)
        s.fluorideIons = 500
        s.pendingSupplyBeacons = 2
        _ = sys.save(s, nowEpochMs: t0 + 10)
        let oldCode = sys.exportSyncCode()

        XCTAssertTrue(sys.purchaseUpgradeWithIons("angled_bass_array", nowEpochMs: t0 + 20))
        let afterPurchase = sys.getSave().fluorideIons
        XCTAssertLessThan(afterPurchase, 500)
        sys.consumeSingleSupplyBeacon(nowEpochMs: t0 + 30)

        let merged = try sys.importSyncCode(oldCode, nowEpochMs: t0 + 40)
        XCTAssertEqual(merged.fluorideIons, afterPurchase)
        XCTAssertEqual(merged.pendingSupplyBeacons, 1)
        XCTAssertTrue(merged.unlockedUpgrades.contains("angled_bass_array"))
        XCTAssertEqual(try sys.importSyncCode(oldCode, nowEpochMs: t0 + 50).fluorideIons, afterPurchase)
    }

    func testCodeWithNewProgressStillBringsItsBiggerWallet() throws {
        let other = SaveSystem(bus: EventBus(), storage: InMemorySaveStorage())
        var o = other.load(nowEpochMs: t0)
        o.fluorideIons = 900
        o.worlds["world_1"]?.completed = true
        o.worlds["world_1"]?.timesCleared = 1
        _ = other.save(o, nowEpochMs: t0 + 10)

        let mine = SaveSystem(bus: EventBus(), storage: InMemorySaveStorage())
        var m = mine.load(nowEpochMs: t0 + 20)
        m.fluorideIons = 40
        for i in 0..<5 { m = mine.save(m, nowEpochMs: t0 + 30 + Int64(i)) }
        XCTAssertEqual(try mine.importSyncCode(other.exportSyncCode(), nowEpochMs: t0 + 100).fluorideIons, 900)
    }

    // M04: an iCloud copy with a higher revision is merged, not swapped in whole.
    func testCloudCopyIsMergedEvenAtAHigherRevision() throws {
        let sys = SaveSystem(bus: EventBus(), storage: InMemorySaveStorage())
        _ = sys.load(nowEpochMs: t0)
        var local = sys.getSave()
        local.worlds["world_1"]?.completed = true
        local.worlds["world_1"]?.timesCleared = 1
        _ = sys.save(local, nowEpochMs: t0 + 10)

        var cloud = SaveSystem.createDefaultSave(nowEpochMs: t0 + 20)
        cloud.saveRevision = 50
        cloud.playerProfile.displayName = "Edited Elsewhere"
        let cloudJson = String(decoding: try JSONEncoder().encode(cloud), as: UTF8.self)
        XCTAssertTrue(sys.reconcileExternalStorageEvent(cloudJson, nowEpochMs: t0 + 30))
        XCTAssertEqual(sys.getSave().worlds["world_1"]?.completed, true)
        XCTAssertEqual(sys.getSave().playerProfile.displayName, "Edited Elsewhere")
        // The same copy again changes nothing (no endless notifications).
        XCTAssertFalse(sys.reconcileExternalStorageEvent(cloudJson, nowEpochMs: t0 + 40))
        // An unreadable cloud copy leaves the local save alone.
        XCTAssertFalse(sys.reconcileExternalStorageEvent(#"{"schemaVersion":9}"#, nowEpochMs: t0 + 50))
    }
}
