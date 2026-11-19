@testable import MouthLifeCore
import XCTest

final class WatchRitualTests: XCTestCase {
    let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    /// Runs the ritual in small ticks and collects every cue.
    func run(_ r: inout WatchRitual, seconds: Double, tick: Double = 0.1) -> [WatchCue] {
        var cues: [WatchCue] = []
        var left = seconds
        while left > 1e-9 {
            let step = min(tick, left)
            if let c = r.advance(by: step, now: t0) { cues.append(c) }
            left -= step
        }
        return cues
    }

    func testAFullRitualTapsAtEveryChangeAndEndsWithAFullBrush() {
        var r = WatchRitual(startedAt: t0, includeRinse: false)
        let brush = run(&r, seconds: 120)
        // 8 surface changes, 3 quadrant changes, then floss starts
        XCTAssertEqual(brush.filter { $0 == .surface }.count, 8)
        XCTAssertEqual(brush.filter { $0 == .quadrant }.count, 3)
        // 3-2-1 leads only into the quadrant changes and the end of brushing
        XCTAssertEqual(brush.filter { if case .countdown = $0 { return true } else { return false } }.count, 12)
        XCTAssertEqual(brush.last, .stageStart(.floss))
        XCTAssertTrue(r.fullBrush)
        XCTAssertEqual(r.brushedSec, 120, accuracy: 1e-6)
        let floss = run(&r, seconds: 45)
        XCTAssertTrue(floss.contains(.flossHalfway))
        XCTAssertEqual(floss.last, .done(fullBrush: true))
        XCTAssertEqual(r.stage, .done)
        let rec = r.record!
        XCTAssertEqual(rec.floss, .timed)
        XCTAssertEqual(rec.rinse, .notOffered)
        let inputs = rec.rewardInputs
        XCTAssertTrue(inputs.fullBrush && inputs.withFloss && inputs.rinseStepOff && !inputs.withRinse)
    }

    func testTheBigCountdownShowsOnlyWhenTheWristTapsIt() {
        var r = WatchRitual(startedAt: t0, includeRinse: true, rinseSec: 30)
        var seconds: Set<Int> = []
        while r.stage != .done {
            let stage = r.stage
            let cue = r.advance(by: 0.1, now: t0)
            if case let .countdown(n) = cue { XCTAssertEqual(r.countdownDigit, n, "\(stage) \(r.stageElapsed)") }
            if r.countdownDigit != nil, r.stage == stage { seconds.insert(Int(r.timelineSec)) }
        }
        // before each new quarter (and the roll into floss), the floss halfway and end, the rinse end
        let expected: Set<Int> = [27, 28, 29, 57, 58, 59, 87, 88, 89, 117, 118, 119,
                                  139, 140, 141, 142, 162, 163, 164, 192, 193, 194]
        XCTAssertEqual(seconds, expected)
        // none before a surface change, and none while paused
        var s = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&s, seconds: 8.5)
        XCTAssertNil(s.countdownDigit)
        _ = run(&s, seconds: 19.5)
        XCTAssertEqual(s.countdownDigit, 2)
        _ = s.setPaused(true)
        XCTAssertNil(s.countdownDigit)
    }

    func testTheFaceCanLookAheadForTheDimmedScreen() {
        var r = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&r, seconds: 10)
        let ahead = r.projected(by: 25)
        XCTAssertEqual(ahead.stageElapsed, 35, accuracy: 1e-6)
        XCTAssertEqual(ahead.phase.quadrant, .upperLeft)
        // looking ahead never changes the ritual itself
        XCTAssertEqual(r.stageElapsed, 10, accuracy: 1e-6)
        // across the end of the brush into floss
        _ = run(&r, seconds: 108)
        let floss = r.projected(by: 5)
        XCTAssertEqual(floss.stage, .floss)
        XCTAssertEqual(floss.stageElapsed, 3, accuracy: 1e-6)
        // a paused ritual stays where it is, and nothing looks back in time
        _ = r.setPaused(true)
        XCTAssertEqual(r.projected(by: 30).stageElapsed, r.stageElapsed)
        XCTAssertEqual(r.projected(by: -3), r)
    }

    func testRinseRunsOnlyWhenTheGrownUpTurnedItOn() {
        var r = WatchRitual(startedAt: t0, includeRinse: true, rinseSec: 30)
        _ = run(&r, seconds: 165)
        XCTAssertEqual(r.stage, .rinse)
        let rinse = run(&r, seconds: 30)
        XCTAssertEqual(rinse.filter { $0 == .rinseStep }.count, 2)
        XCTAssertEqual(rinse.last, .done(fullBrush: true))
        XCTAssertEqual(r.record?.rinse, .timed)
        XCTAssertTrue(r.record!.rewardInputs.withRinse)
    }

    func testFlossWaitsForTheWholeBrush() {
        // no tapping ahead to floss: brushing only ends by its clock (or by End)
        var early = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&early, seconds: 40)
        XCTAssertNil(early.next(now: t0))
        XCTAssertNil(early.skip(now: t0))
        XCTAssertEqual(early.stage, .brushing)
        // ending early is a kind "good try", never a full brush
        XCTAssertEqual(early.end(now: t0), .done(fullBrush: false))
        XCTAssertFalse(early.fullBrush)
        XCTAssertEqual(early.brushedSec, 40, accuracy: 1e-6)
        // the 2-second grace: 118 s counts, just under it does not
        var nearly = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&nearly, seconds: 117.99, tick: 0.01)
        _ = nearly.end(now: t0)
        XCTAssertFalse(nearly.fullBrush)
        var enough = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&enough, seconds: 118, tick: 0.25)
        _ = enough.end(now: t0)
        XCTAssertTrue(enough.fullBrush)
        // floss can still be skipped (no floss pick at hand)
        var floss = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&floss, seconds: 121)
        XCTAssertEqual(floss.stage, .floss)
        XCTAssertEqual(floss.skip(now: t0), .done(fullBrush: true))
        XCTAssertEqual(floss.flossOutcome, .skipped)
    }

    func testALateTickPlaysOneCueNotABacklog() {
        var r = WatchRitual(startedAt: t0, includeRinse: false)
        // 25 seconds at once (a stalled clock): only the newest cue, and the time still counts
        let cue = r.advance(by: 25, now: t0)
        XCTAssertNotNil(cue)
        XCTAssertEqual(r.stageElapsed, 25, accuracy: 1e-9)
        // across the end of brushing: the rest carries into floss
        _ = r.advance(by: 100, now: t0)
        XCTAssertEqual(r.stage, .floss)
        XCTAssertEqual(r.stageElapsed, 5, accuracy: 1e-9)
    }

    func testPauseStopsTheClockAndBadTicksAreIgnored() {
        var r = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&r, seconds: 10)
        XCTAssertEqual(r.setPaused(true), .pause)
        XCTAssertNil(r.advance(by: 30, now: t0))
        XCTAssertNil(r.advance(by: -5, now: t0))
        XCTAssertNil(r.advance(by: .nan, now: t0))
        XCTAssertEqual(r.stageElapsed, 10, accuracy: 1e-9)
        XCTAssertEqual(r.setPaused(false), .resume)
    }

    func testSkipAndEndRecordWhatWasLeftOut() {
        var r = WatchRitual(startedAt: t0, includeRinse: true)
        _ = run(&r, seconds: 120)
        XCTAssertEqual(r.skip(now: t0), .stageStart(.rinse))
        XCTAssertEqual(r.flossOutcome, .skipped)
        XCTAssertEqual(r.end(now: t0), .done(fullBrush: true))
        XCTAssertEqual(r.rinseOutcome, .skipped)
        let inputs = r.record!.rewardInputs
        XCTAssertFalse(inputs.withFloss)
        XCTAssertFalse(inputs.withRinse)
        XCTAssertTrue(inputs.fullBrush)
    }

    func testRecordsSurviveTheTripAsADictionary() {
        var r = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&r, seconds: 165)
        let rec = r.record!
        XCTAssertEqual(WatchBrushRecord(dictionary: rec.dictionary), rec)
        XCTAssertNil(WatchBrushRecord(dictionary: ["kind": "brush"]))
        let ack = WatchBrushAck(sessionId: rec.sessionId, ionsAwarded: 100, stampAwarded: true, fullReward: true)
        XCTAssertEqual(WatchBrushAck(dictionary: ack.dictionary), ack)
        let settings = WatchPhoneSettings(includeRinse: true, rinseSec: 30, language: .japanese, revision: 3)
        XCTAssertEqual(WatchPhoneSettings(dictionary: settings.dictionary), settings)
    }

    func testThePhonePaysEachWatchBrushOnceWithTheSameFairRules() {
        let sys = SaveSystem(bus: EventBus(), storage: InMemorySaveStorage())
        _ = sys.load(nowEpochMs: 1_800_000_000_000)
        var ledger = WatchImportLedger()
        var r = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&r, seconds: 165)
        let rec = r.record!
        let first = ledger.apply(rec, to: sys, now: t0.addingTimeInterval(60))
        // with the rinse step off, a full brush and floss pay what floss and rinse would
        XCTAssertEqual(first.ionsAwarded, 100)
        XCTAssertTrue(first.stampAwarded)
        let ions = sys.getSave().fluorideIons
        let stamps = sys.getSave().totalBrushStamps
        // delivered twice (a lost answer): the same answer, nothing paid again
        XCTAssertEqual(ledger.apply(rec, to: sys, now: t0.addingTimeInterval(120)), first)
        XCTAssertEqual(sys.getSave().fluorideIons, ions)
        XCTAssertEqual(sys.getSave().totalBrushStamps, stamps)
        // an early tap-through from the watch earns the good-try tip
        var early = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&early, seconds: 30)
        _ = early.end(now: t0)
        let tip = ledger.apply(early.record!, to: sys, now: t0.addingTimeInterval(180))
        XCTAssertEqual(tip.ionsAwarded, 5)
        XCTAssertFalse(tip.stampAwarded)
    }

    func testThePhoneReservesBeforePayingAndKeepsToItsOwnRinseSetting() {
        func fresh() -> SaveSystem {
            let sys = SaveSystem(bus: EventBus(), storage: InMemorySaveStorage())
            _ = sys.load(nowEpochMs: 1_800_000_000_000)
            return sys
        }
        // rinsed on a watch still on an old "rinse on" setting, floss skipped
        let rec = WatchBrushRecord(sessionId: "a", brushedSec: 120, floss: .skipped, rinse: .timed, rinseOffered: true, completedAt: t0)
        var allowed = WatchImportLedger()
        XCTAssertEqual(allowed.apply(rec, to: fresh(), now: t0).ionsAwarded, 75)
        var notAllowed = WatchImportLedger()
        XCTAssertEqual(notAllowed.apply(rec, to: fresh(), now: t0, rinseAllowed: false).ionsAwarded, 50)
        // the ledger is saved with the brush reserved before the reward is paid, and again after
        var saved: [WatchImportLedger] = []
        var ledger = WatchImportLedger()
        let ack = ledger.apply(rec, to: fresh(), now: t0) { saved.append($0) }
        XCTAssertEqual(saved.count, 2)
        XCTAssertEqual(saved.first?.ack(for: "a")?.ionsAwarded, 0)
        XCTAssertEqual(saved.last?.ack(for: "a"), ack)
        // a crash right after the reservation: sent again, it is never paid twice
        var restored = saved[0]
        let sys = fresh()
        let before = sys.getSave().fluorideIons
        _ = restored.apply(rec, to: sys, now: t0)
        XCTAssertEqual(sys.getSave().fluorideIons, before)
    }

    func testEveryWatchWordExistsInEveryLanguage() {
        for lang in CoachLanguage.allCases {
            for w in WatchWord.allCases {
                XCTAssertNotNil(WatchCopy.table[lang]?[w], "\(lang) \(w)")
                XCTAssertFalse(WatchCopy.word(w, lang).isEmpty)
            }
        }
    }
}
