import Foundation

public enum PacerRewardSlotType: String, Codable, CaseIterable, Equatable, Sendable {
    case full
    case tip
    case capped
}

public struct PacerRewardOutcome: Codable, Equatable, Sendable {
    public var dateKey: String
    public var ionsAwarded: Int
    public var stampAwarded: Bool
    public var beaconsAdded: Int
    public var overdriveRunsAdded: Int
    public var slotType: PacerRewardSlotType
    public var updatedSlot: DailySlotLog

    public init(
        dateKey: String,
        ionsAwarded: Int,
        stampAwarded: Bool,
        beaconsAdded: Int,
        overdriveRunsAdded: Int,
        slotType: PacerRewardSlotType,
        updatedSlot: DailySlotLog
    ) {
        self.dateKey = dateKey
        self.ionsAwarded = ionsAwarded
        self.stampAwarded = stampAwarded
        self.beaconsAdded = beaconsAdded
        self.overdriveRunsAdded = overdriveRunsAdded
        self.slotType = slotType
        self.updatedSlot = updatedSlot
    }
}

public func formatLocalDateKey(_ date: Date = Date(), calendar: Calendar = .current) -> String {
    HabitBank.localDateKey(for: date, calendar: calendar)
}

public enum HabitBank {
    private static let logRetentionDays: Int = 35

    /// A Gregorian calendar in `calendar`'s time zone. Day keys are always Gregorian, whatever
    /// calendar the device shows, so they match the web edition's keys (M02): a Buddhist-calendar
    /// iPhone writes 2026-11-19, not 2569-11-19, and the daily cap cannot be paid twice.
    public static func keyCalendar(matching calendar: Calendar = .current) -> Calendar {
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = calendar.timeZone
        return gregorian
    }

    /// Formats the local date (in `calendar`'s time zone) as a Gregorian `"YYYY-MM-DD"`.
    public static func localDateKey(for date: Date = Date(), calendar: Calendar = .current) -> String {
        let comps = keyCalendar(matching: calendar).dateComponents([.year, .month, .day], from: date)
        let y = comps.year ?? 1970
        let m = comps.month ?? 1
        let d = comps.day ?? 1
        return String(format: "%04d-%02d-%02d", y, m, d)
    }

    /// Pure evaluation of a 2-Minute Sink Brush-Along session reward.
    /// Daily cap: 2 full rewards (`50 + 25 floss + 25 fluoride rinse = 100 F⁻`) + 3 courtesy tips (`5`),
    /// +1 monotonic stamp, +1 Supply Beacon (capped at 4), +1 Overdrive Run (capped at 4).
    ///
    /// Only the full 2-minute brush (`fullBrush`, the default) earns that. Tapping ahead to floss
    /// before the brushing time is up is a "good try": a small courtesy tip of Ions, no stamp, beacon
    /// or Overdrive run, and it leaves today's full rewards free for a full brush later.
    ///
    /// When the rinse step is off (`rinseStepOff`: it waits for a grown-up to say the brusher is 6 or
    /// older), flossing pays what flossing and rinsing would, so younger children are not paid less.
    public static func evaluatePacerReward(
        currentSlot: DailySlotLog,
        withFlossBonus: Bool,
        withMouthwashBonus: Bool = false,
        fullBrush: Bool = true,
        rinseStepOff: Bool = false,
        currentBeacons: Int = 0,
        currentOverdriveRuns: Int = 0,
        dateKey: String = localDateKey()
    ) -> PacerRewardOutcome {
        var nextSlot = currentSlot
        var ionsAwarded = 0
        var stampAwarded = false
        var beaconsAdded = 0
        var overdriveRunsAdded = 0
        var slotType: PacerRewardSlotType = .capped

        if fullBrush && nextSlot.fullRewards < GameConfig.dailyFullRewardCap {
            nextSlot.fullRewards += 1
            slotType = .full
            stampAwarded = true
            let rinseCredit = withMouthwashBonus || (rinseStepOff && withFlossBonus)
            ionsAwarded = GameConfig.brushAlongFullIons
                + (withFlossBonus ? GameConfig.brushAlongFlossIons : 0)
                + (rinseCredit ? GameConfig.brushAlongMouthwashIons : 0)

            let nextBeacons = min(GameConfig.maxSupplyBeacons, max(0, currentBeacons) + 1)
            beaconsAdded = max(0, nextBeacons - max(0, currentBeacons))

            let nextOverdrive = min(GameConfig.maxOverdriveRuns, max(0, currentOverdriveRuns) + 1)
            overdriveRunsAdded = max(0, nextOverdrive - max(0, currentOverdriveRuns))
        } else if nextSlot.tips < GameConfig.dailyCourtesyTipCap {
            nextSlot.tips += 1
            slotType = .tip
            ionsAwarded = GameConfig.brushAlongTipIons
        }

        return PacerRewardOutcome(
            dateKey: dateKey,
            ionsAwarded: ionsAwarded,
            stampAwarded: stampAwarded,
            beaconsAdded: beaconsAdded,
            overdriveRunsAdded: overdriveRunsAdded,
            slotType: slotType,
            updatedSlot: nextSlot
        )
    }

    /// Records completion of a 2-Minute Sink Brush-Along session onto `MouthLifeSaveV2`.
    /// Never penalizes missed days; caps daily full rewards at 2 and courtesy tips at 3.
    @discardableResult
    public static func completeBrushAlong(
        save: inout MouthLifeSaveV2,
        withFlossBonus: Bool,
        withMouthwashBonus: Bool = false,
        fullBrush: Bool = true,
        rinseStepOff: Bool = false,
        date: Date = Date(),
        rewardDay: Date? = nil,
        calendar: Calendar = .current
    ) -> PacerRewardOutcome {
        // `rewardDay`: a brush synced late (from the watch) counts against the day it was brushed;
        // everything else (the companion's polish, pruning) uses `date`, now.
        let dateKey = localDateKey(for: rewardDay ?? date, calendar: calendar)
        let currentSlot = save.dailySlotsByDate[dateKey] ?? DailySlotLog()
        let outcome = evaluatePacerReward(
            currentSlot: currentSlot,
            withFlossBonus: withFlossBonus,
            withMouthwashBonus: withMouthwashBonus,
            fullBrush: fullBrush,
            rinseStepOff: rinseStepOff,
            currentBeacons: save.pendingSupplyBeacons,
            currentOverdriveRuns: save.remineralizedOverdriveRuns,
            dateKey: dateKey
        )

        if outcome.stampAwarded {
            save.totalBrushStamps += 1
        }
        save.fluorideIons += outcome.ionsAwarded
        save.pendingSupplyBeacons = min(
            GameConfig.maxSupplyBeacons,
            max(0, save.pendingSupplyBeacons) + outcome.beaconsAdded
        )
        save.remineralizedOverdriveRuns = min(
            GameConfig.maxOverdriveRuns,
            max(0, save.remineralizedOverdriveRuns) + outcome.overdriveRunsAdded
        )
        save.dailySlotsByDate[dateKey] = outcome.updatedSlot

        let nowMs = Int64((date.timeIntervalSince1970 * 1000.0).rounded())
        CompanionArchSim.applyBrushAlongPolish(
            &save.companion,
            includedFlossBonus: withFlossBonus,
            nowEpochMs: nowMs
        )
        pruneOldDailyLogs(&save, referenceDate: date, calendar: calendar)
        return outcome
    }

    public static func pruneOldDailyLogs(
        _ save: inout MouthLifeSaveV2,
        referenceDate: Date = Date(),
        calendar: Calendar = .current
    ) {
        let cutoffMs = referenceDate.timeIntervalSince1970 - Double(logRetentionDays) * 86_400.0
        let keyCal = keyCalendar(matching: calendar)
        for key in Array(save.dailySlotsByDate.keys) {
            let parts = key.split(separator: "-")
            guard parts.count == 3,
                  parts[0].count == 4,
                  parts[1].count == 2,
                  parts[2].count == 2,
                  let y = Int(parts[0]),
                  let m = Int(parts[1]),
                  let d = Int(parts[2]),
                  let entryDate = keyCal.date(from: DateComponents(year: y, month: m, day: d))
            else {
                save.dailySlotsByDate.removeValue(forKey: key)
                continue
            }

            if entryDate.timeIntervalSince1970 < cutoffMs {
                save.dailySlotsByDate.removeValue(forKey: key)
            }
        }
    }

    /// Earlier builds wrote day keys in the device's own calendar (a Buddhist-calendar iPhone wrote
    /// 2569-11-19 for 19 November 2026). On such a device, a key that is not a recent Gregorian day
    /// but is a recent day in that calendar is moved to its Gregorian key, merged with any slots
    /// already there. Real Gregorian keys are never reinterpreted, and nothing changes on a
    /// Gregorian device (M02).
    public static func migrateLegacyCalendarKeys(
        _ save: inout MouthLifeSaveV2,
        calendar: Calendar = .current,
        now: Date = Date()
    ) {
        guard calendar.identifier != .gregorian else { return }
        let gregorian = keyCalendar(matching: calendar)
        let window: TimeInterval = 60 * 86_400
        func isRecent(_ date: Date) -> Bool {
            date.timeIntervalSince(now) <= 2 * 86_400 && now.timeIntervalSince(date) <= window
        }
        let era = calendar.component(.era, from: now)
        for key in Array(save.dailySlotsByDate.keys) {
            let parts = key.split(separator: "-")
            guard parts.count == 3,
                  let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2])
            else { continue }
            if let asGregorian = gregorian.date(from: DateComponents(year: y, month: m, day: d)),
               isRecent(asGregorian) {
                continue
            }
            var legacy = DateComponents(era: era, year: y, month: m, day: d)
            legacy.hour = 12
            guard let date = calendar.date(from: legacy), isRecent(date) else { continue }
            let newKey = localDateKey(for: date, calendar: calendar)
            guard newKey != key, let slot = save.dailySlotsByDate.removeValue(forKey: key) else { continue }
            let existing = save.dailySlotsByDate[newKey] ?? DailySlotLog()
            save.dailySlotsByDate[newKey] = DailySlotLog(
                fullRewards: max(existing.fullRewards, slot.fullRewards),
                tips: max(existing.tips, slot.tips)
            )
        }
    }
}
