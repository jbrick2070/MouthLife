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

    /// Formats local calendar date as `"YYYY-MM-DD"`.
    public static func localDateKey(for date: Date = Date(), calendar: Calendar = .current) -> String {
        let comps = calendar.dateComponents([.year, .month, .day], from: date)
        let y = comps.year ?? 1970
        let m = comps.month ?? 1
        let d = comps.day ?? 1
        return String(format: "%04d-%02d-%02d", y, m, d)
    }

    /// Pure evaluation of a 2-Minute Sink Brush-Along session reward.
    /// Daily cap: 2 full rewards (`50 + 25 floss + 25 fluoride rinse = 100 F⁻`) + 3 courtesy tips (`5`),
    /// +1 monotonic stamp, +1 Supply Beacon (capped at 4), +1 Overdrive Run (capped at 4).
    public static func evaluatePacerReward(
        currentSlot: DailySlotLog,
        withFlossBonus: Bool,
        withMouthwashBonus: Bool = false,
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

        if nextSlot.fullRewards < GameConfig.dailyFullRewardCap {
            nextSlot.fullRewards += 1
            slotType = .full
            stampAwarded = true
            ionsAwarded = GameConfig.brushAlongFullIons
                + (withFlossBonus ? GameConfig.brushAlongFlossIons : 0)
                + (withMouthwashBonus ? GameConfig.brushAlongMouthwashIons : 0)

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
        date: Date = Date(),
        calendar: Calendar = .current
    ) -> PacerRewardOutcome {
        let dateKey = localDateKey(for: date, calendar: calendar)
        let currentSlot = save.dailySlotsByDate[dateKey] ?? DailySlotLog()
        let outcome = evaluatePacerReward(
            currentSlot: currentSlot,
            withFlossBonus: withFlossBonus,
            withMouthwashBonus: withMouthwashBonus,
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
        for key in Array(save.dailySlotsByDate.keys) {
            let parts = key.split(separator: "-")
            guard parts.count == 3,
                  parts[0].count == 4,
                  parts[1].count == 2,
                  parts[2].count == 2,
                  let y = Int(parts[0]),
                  let m = Int(parts[1]),
                  let d = Int(parts[2]),
                  let entryDate = calendar.date(from: DateComponents(year: y, month: m, day: d))
            else {
                save.dailySlotsByDate.removeValue(forKey: key)
                continue
            }

            if entryDate.timeIntervalSince1970 < cutoffMs {
                save.dailySlotsByDate.removeValue(forKey: key)
            }
        }
    }
}
