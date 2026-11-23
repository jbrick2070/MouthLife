import Foundation

// The Apple Watch brushing ritual as a pure state machine: brush 2:00, floss 0:45, then the
// fluoride rinse when a grown-up has turned it on (on the iPhone). The watch app feeds it time
// from a monotonic clock and turns its cues into taps on the wrist; the iPhone turns the finished
// record into the reward, with the same fair rules as a brush on the phone (HabitBank).
//
// Design choices (from the design pass with Codex Astra 6.2 and Gemini Hydrogen / Neon):
// - Two times: the timeline position (what BrushPhaseState shows) and the seconds actually brushed.
//   Tapping ahead jumps the timeline but never adds brushing time, so only a real 2:00 is "full".
// - A late or lumpy clock tick never plays a backlog of taps: at most one cue per tick, the newest.
// - The 3-2-1 taps lead only into quadrant and stage changes; surface changes are a single click.

public enum WatchRitualStage: String, Codable, Sendable, CaseIterable {
    case brushing, floss, rinse, done

    /// The phone's stage for the same moment (the shared timeline and copy use it).
    public var pacerStage: PacerStage {
        switch self {
        case .brushing: return .brushing
        case .floss: return .flossBonus
        case .rinse, .done: return .mouthwashBonus
        }
    }
}

/// How a stage ended: ran its full time, a "Done" tap, a "Skip" tap, or it was never offered.
public enum WatchStageOutcome: String, Codable, Sendable {
    case timed, markedDone, skipped, notOffered, pending

    /// Floss and rinse earn their bonus when finished, by time or by "Done" (as on the phone).
    public var earnsBonus: Bool { self == .timed || self == .markedDone }
}

/// What the wrist should feel (and the screen may mark) right now.
public enum WatchCue: Equatable, Sendable {
    case stageStart(WatchRitualStage)
    case surface
    case quadrant
    case countdown(Int)
    case flossHalfway
    case rinseStep
    case done(fullBrush: Bool)
    case pause
    case resume
}

public struct WatchRitual: Codable, Equatable, Sendable {
    public static let brushSec = GameConfig.brushAlongTotalSec
    public static let flossSec = GameConfig.brushAlongFlossBonusSec

    public var sessionId: UUID
    public var startedAt: Date
    public private(set) var stage: WatchRitualStage
    /// Seconds into the current stage.
    public private(set) var stageElapsed: Double
    /// Seconds actually spent brushing (never more than 2:00; jumps add nothing).
    public private(set) var brushedSec: Double
    public private(set) var fullBrush: Bool
    public private(set) var flossOutcome: WatchStageOutcome
    public private(set) var rinseOutcome: WatchStageOutcome
    /// The grown-up's rinse setting from the iPhone, fixed for this ritual when it starts.
    public let includeRinse: Bool
    public let rinseSec: Double
    public private(set) var paused: Bool
    public private(set) var completedAt: Date?

    public init(sessionId: UUID = UUID(), startedAt: Date = Date(), includeRinse: Bool, rinseSec: Double = GameConfig.brushAlongMouthwashBonusSec) {
        self.sessionId = sessionId
        self.startedAt = startedAt
        self.stage = .brushing
        self.stageElapsed = 0
        self.brushedSec = 0
        self.fullBrush = false
        self.flossOutcome = .pending
        self.rinseOutcome = includeRinse ? .pending : .notOffered
        self.includeRinse = includeRinse
        self.rinseSec = max(6, rinseSec)
        self.paused = false
        self.completedAt = nil
    }

    /// How long the current stage lasts.
    public var stageLength: Double {
        switch stage {
        case .brushing: return Self.brushSec
        case .floss: return Self.flossSec
        case .rinse: return rinseSec
        case .done: return 0
        }
    }

    public var remainingSec: Double { max(0, stageLength - stageElapsed) }

    /// The big 3-2-1 on the watch face: shown only before the moves the wrist taps 3-2-1 for (each
    /// new quarter, including the roll into floss, the floss halfway and end, and the rinse end),
    /// and never while paused. Surface changes get their own tap and no countdown.
    public var countdownDigit: Int? {
        guard !paused else { return nil }
        let next: Double
        switch stage {
        case .brushing:
            let quarter = Self.brushSec / 4
            next = min(Self.brushSec, (floor(stageElapsed / quarter) + 1) * quarter)
        case .floss:
            next = stageElapsed < Self.flossSec / 2 ? Self.flossSec / 2 : Self.flossSec
        case .rinse:
            next = rinseSec
        case .done:
            return nil
        }
        let left = next - stageElapsed
        guard left <= 3, left > 0.05 else { return nil }
        return max(1, min(3, Int(left.rounded(.up))))
    }

    /// Position on the shared timeline (what BrushPhaseState.evaluate expects).
    public var timelineSec: Double {
        switch stage {
        case .brushing: return stageElapsed
        case .floss: return Self.brushSec + stageElapsed
        case .rinse, .done: return Self.brushSec + Self.flossSec + stageElapsed
        }
    }

    /// The shared timeline snapshot: quadrant, surface, the 3-2-1 pips, floss half, rinse steps.
    public var phase: BrushPhaseState {
        BrushPhaseState.evaluate(elapsedSec: timelineSec, stage: stage.pacerStage, mouthwashDurationSec: rinseSec)
    }

    // MARK: - Time

    /// Where this ritual will be `seconds` from now if nothing else happens (a paused one stays put;
    /// at most 90 s ahead). The watch face draws from this: with the wrist down, watchOS renders the
    /// coming seconds ahead of time, so each frame must show its own moment, not the moment the
    /// screen dimmed.
    public func projected(by seconds: Double) -> WatchRitual {
        guard seconds > 0, seconds.isFinite else { return self }
        var copy = self
        _ = copy.advance(by: min(seconds, 90))
        return copy
    }

    /// Moves the ritual on by `dt` seconds of real time and returns at most one cue: the newest.
    public mutating func advance(by dt: Double, now: Date = Date()) -> WatchCue? {
        guard stage != .done, !paused, dt.isFinite, dt > 0 else { return nil }
        var remaining = dt
        var last: WatchCue?
        // A tick can cross a stage end; carry the rest into the next stage (bounded loop).
        for _ in 0..<4 where remaining > 0 && stage != .done {
            let before = stageElapsed
            let step = min(remaining, stageLength - stageElapsed)
            stageElapsed += step
            remaining -= step
            if stage == .brushing { brushedSec = min(Self.brushSec, brushedSec + step) }
            if let cue = crossing(from: before, to: stageElapsed) { last = cue }
            if stageElapsed >= stageLength - 1e-9 {
                last = finishStage(.timed, now: now)
            }
        }
        return last
    }

    /// The cue for a move within the current stage from `a` to `b` seconds (the newest crossed).
    private func crossing(from a: Double, to b: Double) -> WatchCue? {
        var cue: WatchCue?
        func crossed(_ x: Double) -> Bool { a < x && b >= x }
        switch stage {
        case .brushing:
            for k in 1...11 {
                let at = Double(k) * 10
                if crossed(at) { cue = k % 3 == 0 ? .quadrant : .surface }
            }
            for boundary in [30.0, 60, 90, 120] {
                for n in [3, 2, 1] where crossed(boundary - Double(n)) { cue = .countdown(n) }
            }
            // a quadrant or surface change outranks a countdown crossed in the same tick
            for k in 1...11 where crossed(Double(k) * 10) { cue = k % 3 == 0 ? .quadrant : .surface }
        case .floss:
            let half = Self.flossSec / 2
            for boundary in [half, Self.flossSec] {
                for n in [3, 2, 1] where crossed(boundary - Double(n)) { cue = .countdown(n) }
            }
            if crossed(half) { cue = .flossHalfway }
        case .rinse:
            for n in [3, 2, 1] where crossed(rinseSec - Double(n)) { cue = .countdown(n) }
            for k in 1...2 where crossed(rinseSec * Double(k) / 3) { cue = .rinseStep }
        case .done:
            break
        }
        return cue
    }

    // MARK: - Taps

    /// "Done": floss marked done → rinse or done, rinse marked done → done. Flossing waits for the
    /// whole brush: the brushing clock rolls into floss by itself, and there is no tapping ahead.
    public mutating func next(now: Date = Date()) -> WatchCue? {
        guard stage == .floss || stage == .rinse else { return nil }
        return finishStage(.markedDone, now: now)
    }

    /// "Skip": floss or rinse left out (no bonus for it). Brushing can only be ended, not skipped.
    public mutating func skip(now: Date = Date()) -> WatchCue? {
        guard stage == .floss || stage == .rinse else { return nil }
        return finishStage(.skipped, now: now)
    }

    /// "End": stop here; whatever is finished counts, the rest is skipped.
    public mutating func end(now: Date = Date()) -> WatchCue? {
        guard stage != .done else { return nil }
        if stage == .brushing { latchBrush() }
        if flossOutcome == .pending { flossOutcome = .skipped }
        if rinseOutcome == .pending { rinseOutcome = .skipped }
        return complete(now: now)
    }

    public mutating func setPaused(_ on: Bool) -> WatchCue? {
        guard stage != .done, paused != on else { return nil }
        paused = on
        return on ? .pause : .resume
    }

    private mutating func latchBrush() {
        fullBrush = brushedSec >= Self.brushSec - GameConfig.brushAlongFullBrushGraceSec
    }

    /// Moves on to the next stage. A new stage always runs: "Done" or "Skip" tapped while paused
    /// starts it (its card, tap and word announce it), rather than leaving it frozen.
    private mutating func finishStage(_ how: WatchStageOutcome, now: Date) -> WatchCue? {
        switch stage {
        case .brushing:
            latchBrush()
            stage = .floss
            stageElapsed = 0
            paused = false
            return .stageStart(.floss)
        case .floss:
            flossOutcome = how
            if includeRinse {
                stage = .rinse
                stageElapsed = 0
                paused = false
                return .stageStart(.rinse)
            }
            return complete(now: now)
        case .rinse:
            rinseOutcome = how
            return complete(now: now)
        case .done:
            return nil
        }
    }

    private mutating func complete(now: Date) -> WatchCue {
        stage = .done
        stageElapsed = 0
        paused = false
        completedAt = now
        return .done(fullBrush: fullBrush)
    }

    /// The finished ritual as the record the iPhone turns into a reward (nil until done).
    public var record: WatchBrushRecord? {
        guard stage == .done, let completedAt else { return nil }
        return WatchBrushRecord(
            sessionId: sessionId.uuidString,
            brushedSec: brushedSec,
            floss: flossOutcome,
            rinse: rinseOutcome,
            rinseOffered: includeRinse,
            completedAt: completedAt
        )
    }
}

/// What the watch sends the iPhone when a ritual finishes: facts only, no reward. The phone works
/// out the reward with HabitBank so the daily caps and the rinse rule hold for every brush.
public struct WatchBrushRecord: Codable, Equatable, Sendable {
    public static let currentVersion = 1

    public var version: Int
    public var sessionId: String
    public var brushedSec: Double
    public var floss: WatchStageOutcome
    public var rinse: WatchStageOutcome
    public var rinseOffered: Bool
    public var completedAt: Date

    public init(sessionId: String, brushedSec: Double, floss: WatchStageOutcome, rinse: WatchStageOutcome, rinseOffered: Bool, completedAt: Date) {
        self.version = Self.currentVersion
        self.sessionId = sessionId
        self.brushedSec = brushedSec
        self.floss = floss
        self.rinse = rinse
        self.rinseOffered = rinseOffered
        self.completedAt = completedAt
    }

    /// The same inputs a phone brush gives HabitBank.
    public var rewardInputs: (withFloss: Bool, withRinse: Bool, fullBrush: Bool, rinseStepOff: Bool) {
        let full = brushedSec >= GameConfig.brushAlongTotalSec - GameConfig.brushAlongFullBrushGraceSec
        return (floss.earnsBonus, rinseOffered && rinse.earnsBonus, full, !rinseOffered)
    }

    /// As a WatchConnectivity user-info dictionary (property-list types only) and back.
    public var dictionary: [String: Any] {
        [
            "kind": "brush", "v": version, "id": sessionId, "brushed": brushedSec,
            "floss": floss.rawValue, "rinse": rinse.rawValue, "rinseOffered": rinseOffered,
            "at": completedAt.timeIntervalSince1970,
        ]
    }

    public init?(dictionary d: [String: Any]) {
        guard d["kind"] as? String == "brush",
              let v = d["v"] as? Int, v >= 1,
              let id = d["id"] as? String, !id.isEmpty, id.count <= 64,
              let brushed = (d["brushed"] as? NSNumber)?.doubleValue, brushed.isFinite,
              let floss = (d["floss"] as? String).flatMap(WatchStageOutcome.init(rawValue:)),
              let rinse = (d["rinse"] as? String).flatMap(WatchStageOutcome.init(rawValue:)),
              let offered = d["rinseOffered"] as? Bool,
              let at = (d["at"] as? NSNumber)?.doubleValue, at.isFinite
        else { return nil }
        self.version = v
        self.sessionId = id
        self.brushedSec = min(max(0, brushed), GameConfig.brushAlongTotalSec)
        self.floss = floss
        self.rinse = rinse
        self.rinseOffered = offered
        self.completedAt = Date(timeIntervalSince1970: at)
    }
}

/// The iPhone's answer to a record: what it earned (shown on the watch's Done screen).
public struct WatchBrushAck: Codable, Equatable, Sendable {
    public var sessionId: String
    public var ionsAwarded: Int
    public var stampAwarded: Bool
    public var fullReward: Bool

    public init(sessionId: String, ionsAwarded: Int, stampAwarded: Bool, fullReward: Bool) {
        self.sessionId = sessionId
        self.ionsAwarded = ionsAwarded
        self.stampAwarded = stampAwarded
        self.fullReward = fullReward
    }

    public var dictionary: [String: Any] {
        ["kind": "ack", "id": sessionId, "ions": ionsAwarded, "stamp": stampAwarded, "full": fullReward]
    }

    public init?(dictionary d: [String: Any]) {
        guard d["kind"] as? String == "ack", let id = d["id"] as? String,
              let ions = (d["ions"] as? NSNumber)?.intValue
        else { return nil }
        self.init(sessionId: id, ionsAwarded: ions, stampAwarded: d["stamp"] as? Bool ?? false, fullReward: d["full"] as? Bool ?? false)
    }
}

/// What the iPhone tells the watch: the grown-up's rinse setting and the family's choices.
public struct WatchPhoneSettings: Codable, Equatable, Sendable {
    public var includeRinse: Bool
    public var rinseSec: Double
    public var language: CoachLanguage?
    public var revision: Double

    public init(includeRinse: Bool = false, rinseSec: Double = GameConfig.brushAlongMouthwashBonusSec, language: CoachLanguage? = nil, revision: Double = 0) {
        self.includeRinse = includeRinse
        self.rinseSec = rinseSec
        self.language = language
        self.revision = revision
    }

    public var dictionary: [String: Any] {
        var d: [String: Any] = ["kind": "settings", "rinse": includeRinse, "rinseSec": rinseSec, "rev": revision]
        if let language { d["lang"] = language.rawValue }
        return d
    }

    /// The next settings revision the iPhone sends: always above the last one it sent, so a grown-up
    /// turning rinse off still reaches the watch after the clock is set back (M05). Starts from the
    /// clock time so it also stays above revisions earlier builds sent as timestamps.
    public static func nextRevision(after last: Double, now: Date = Date()) -> Double {
        let lastSent = last.isFinite ? last : 0
        return max(lastSent + 1, now.timeIntervalSince1970.rounded(.down))
    }

    public init?(dictionary d: [String: Any]) {
        guard d["kind"] as? String == "settings", let rinse = d["rinse"] as? Bool else { return nil }
        self.includeRinse = rinse
        self.rinseSec = (d["rinseSec"] as? NSNumber)?.doubleValue ?? GameConfig.brushAlongMouthwashBonusSec
        self.language = (d["lang"] as? String).flatMap(CoachLanguage.init(rawValue:))
        self.revision = (d["rev"] as? NSNumber)?.doubleValue ?? 0
    }
}

/// The iPhone side of the sync: applies each watch record exactly once (a lost answer or a resend
/// returns the stored result without paying again) and remembers recent session ids.
public struct WatchImportLedger: Codable, Equatable, Sendable {
    public static let keep = 200
    public private(set) var acks: [String: WatchBrushAck] = [:]
    public private(set) var order: [String] = []
    /// Payments started but not yet confirmed, by session id (H03). Optional so ledgers saved by
    /// earlier builds still read.
    public private(set) var pending: [String: PendingPayment]?

    /// A payment in progress: the day it counts for, that day's reward slots just before paying,
    /// and the answer paying from those slots gives.
    public struct PendingPayment: Codable, Equatable, Sendable {
        public var dayKey: String
        public var slotBefore: DailySlotLog
        public var ack: WatchBrushAck

        public init(dayKey: String, slotBefore: DailySlotLog, ack: WatchBrushAck) {
            self.dayKey = dayKey
            self.slotBefore = slotBefore
            self.ack = ack
        }
    }

    public init() {}

    public func ack(for sessionId: String) -> WatchBrushAck? { acks[sessionId] }

    /// A brush is credited to the day it was brushed for at most this long (an older one counts as today).
    public static let backdateLimit: TimeInterval = 2 * 86_400

    /// Pays a record into the save once, and returns the answer.
    ///
    /// - `rinseAllowed`: whether a grown-up has the rinse step on here; if not, a watch still on an old
    ///   setting is paid like a brush with the rinse step off.
    /// - `persist`: called with the ledger before the reward is paid and again after.
    ///
    /// Before paying, the ledger stores the payment as pending, with the day's slots as they were.
    /// If the app stops before the answer is stored, the resent record finds it pending (H03): when
    /// the day's slots have moved on, the payment landed, and the stored answer goes back without
    /// paying again; when they have not, nothing landed, and it is paid now. Every reward that pays
    /// anything moves the day's slots, so a brush is never paid twice and never lost. (Only another
    /// brush credited to the same day between the stop and the resend would read as "landed".)
    /// Answers already stored, including zeros saved by earlier builds, are final.
    public mutating func apply(
        _ record: WatchBrushRecord,
        to saveSystem: SaveSystem,
        now: Date = Date(),
        rinseAllowed: Bool = true,
        persist: (WatchImportLedger) -> Void = { _ in }
    ) -> WatchBrushAck {
        if let done = acks[record.sessionId] { return done }
        if let started = pending?[record.sessionId] {
            let slotNow = saveSystem.getSave().dailySlotsByDate[started.dayKey] ?? DailySlotLog()
            if slotNow != started.slotBefore {
                finish(started.ack)
                persist(self)
                return started.ack
            }
        }
        var inputs = record.rewardInputs
        if !rinseAllowed {
            inputs.withRinse = false
            inputs.rinseStepOff = true
        }
        // credited to the day it was brushed, but a brush from the future (a wrong clock) or one
        // more than two days old counts as now
        let day = record.completedAt > now || record.completedAt < now.addingTimeInterval(-Self.backdateLimit) ? now : record.completedAt
        let dayKey = HabitBank.localDateKey(for: day)
        let current = saveSystem.getSave()
        let slotBefore = current.dailySlotsByDate[dayKey] ?? DailySlotLog()
        let expected = HabitBank.evaluatePacerReward(
            currentSlot: slotBefore,
            withFlossBonus: inputs.withFloss,
            withMouthwashBonus: inputs.withRinse,
            fullBrush: inputs.fullBrush,
            rinseStepOff: inputs.rinseStepOff,
            currentBeacons: current.pendingSupplyBeacons,
            currentOverdriveRuns: current.remineralizedOverdriveRuns,
            dateKey: dayKey
        )
        var started = pending ?? [:]
        started[record.sessionId] = PendingPayment(
            dayKey: dayKey,
            slotBefore: slotBefore,
            ack: WatchBrushAck(
                sessionId: record.sessionId,
                ionsAwarded: expected.ionsAwarded,
                stampAwarded: expected.stampAwarded,
                fullReward: expected.slotType == .full
            )
        )
        pending = started
        persist(self)
        let outcome = saveSystem.recordBrushAlongCompletion(
            withFlossBonus: inputs.withFloss,
            withMouthwashBonus: inputs.withRinse,
            fullBrush: inputs.fullBrush,
            rinseStepOff: inputs.rinseStepOff,
            date: now,
            rewardDay: day
        )
        let ack = WatchBrushAck(sessionId: record.sessionId, ionsAwarded: outcome.ionsAwarded, stampAwarded: outcome.stampAwarded, fullReward: outcome.slotType == .full)
        finish(ack)
        persist(self)
        return ack
    }

    private mutating func finish(_ ack: WatchBrushAck) {
        pending?.removeValue(forKey: ack.sessionId)
        if pending?.isEmpty == true { pending = nil }
        remember(ack)
    }

    private mutating func remember(_ ack: WatchBrushAck) {
        if acks[ack.sessionId] == nil { order.append(ack.sessionId) }
        acks[ack.sessionId] = ack
        while order.count > Self.keep {
            acks.removeValue(forKey: order.removeFirst())
        }
    }
}
