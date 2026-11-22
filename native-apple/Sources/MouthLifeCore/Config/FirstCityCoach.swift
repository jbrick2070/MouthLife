import Foundation

/// The first city teaches while you play: a new player's goal line names one thing to try at a
/// time, and ticks it off when they do it. Nothing pauses or blocks, steps can be done in any
/// order, and the coach is gone for good after the first sealed zone and the first zip.
///
/// Pure (no UI, no timers). Web twin: `src/config/firstCityCoach.ts`; the two test files share cases.
public enum FirstCityCoach {
    /// The city that teaches.
    public static let worldId = "world_1"
    /// Kept with the other one-time hints (`hintsStorageKey`), outside the save and its Sync Code.
    public static let doneHintKey = "coach_city1"
    /// Film cleaned (grid cells) before the first step counts as done: a real sweep, not a touch.
    public static let sweepCells = 4

    public enum Step: String, CaseIterable, Sendable {
        case sweep, helper, scan, surge, seal, floss
    }

    /// What the player has done so far.
    public struct State: Equatable, Sendable {
        public var cleanedCells: Int = 0
        public var done: Set<Step> = []

        public init() {}

        public func isDone(_ step: Step) -> Bool { done.contains(step) }
    }

    /// What the game just reported.
    public enum Event: Equatable, Sendable {
        case scrub(newlyCleaned: Int)
        case helperRestored
        case scanPulsed
        case surgeFired
        case zoneSealed
        case zipped
    }

    /// What is true right now, from the stage.
    public struct Context: Equatable, Sendable {
        /// The Surge meter is full.
        public var surgeReady: Bool
        /// HYDRA-1 is at a gap too narrow to drive through.
        public var nearGap: Bool

        public init(surgeReady: Bool, nearGap: Bool) {
            self.surgeReady = surgeReady
            self.nearGap = nearGap
        }
    }

    /// Ticks off whatever the event shows the player has done. Never un-ticks anything.
    public static func advance(_ state: State, _ event: Event) -> State {
        var next = state
        switch event {
        case let .scrub(newlyCleaned):
            guard newlyCleaned > 0, !state.isDone(.sweep) else { return state }
            next.cleanedCells += newlyCleaned
            if next.cleanedCells >= sweepCells { next.done.insert(.sweep) }
        case .helperRestored:
            next.done.insert(.helper)
        case .scanPulsed:
            next.done.insert(.scan)
        case .surgeFired:
            next.done.insert(.surge)
        case .zoneSealed:
            next.done.insert(.seal)
        case .zipped:
            next.done.insert(.floss)
        }
        return next
    }

    /// The coach has nothing left to teach: a zone is sealed and a gap has been flossed.
    public static func finished(_ state: State) -> Bool {
        state.isDone(.seal) && state.isDone(.floss)
    }

    /// The one thing to try now, or nil when the stage's own goal line should show.
    /// - Floss is taught at a gap, wherever the player is in the list (the first zone has none).
    /// - Surge is taught only once it is full; Scan only before Surge or the first seal.
    /// - After the first seal the coach waits quietly until the player reaches a gap.
    public static func currentStep(_ state: State, _ ctx: Context) -> Step? {
        if finished(state) { return nil }
        if !state.isDone(.sweep) { return .sweep }
        if ctx.nearGap && !state.isDone(.floss) { return .floss }
        if state.isDone(.seal) { return nil }
        if !state.isDone(.helper) { return .helper }
        if ctx.surgeReady && !state.isDone(.surge) { return .surge }
        if !state.isDone(.scan) && !state.isDone(.surge) { return .scan }
        return .seal
    }

    /// The coach's words: the whole line, and the short one a phone's single-line HUD can hold.
    /// The same English as the web, so both editions share the translations.
    public static func line(_ step: Step, short: Bool) -> String {
        switch step {
        case .sweep: return short ? "Scrub the plaque" : "Steer over the yellow plaque to scrub it off"
        case .helper: return short ? "Scrub a glowing ring" : "Scrub a glowing ring to bring a helper back"
        case .scan: return short ? "Try Scan" : "Try Scan. It shows the plaque you missed"
        case .surge: return short ? "Fire Surge!" : "Surge is full. Fire it for a big wave!"
        case .seal: return short ? "Clean the whole zone" : "Clean the whole zone to seal it gold"
        case .floss: return short ? "Floss through the gap" : "Floss through the narrow gap"
        }
    }

    /// Who gets the coach: a new player's city 1, until it has finished once on this device.
    public static func applies(worldId: String, mode: ActivePlayMode, cityCompleted: Bool, seenHints: Set<String>) -> Bool {
        mode == .arcade && worldId == Self.worldId && !cityCompleted && !seenHints.contains(doneHintKey)
    }
}
