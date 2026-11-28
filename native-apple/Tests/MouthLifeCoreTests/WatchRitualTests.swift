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
        // 8 surface changes, 3 quadrant changes, then floss waits for its Start
        XCTAssertEqual(brush.filter { $0 == .surface }.count, 8)
        XCTAssertEqual(brush.filter { $0 == .quadrant }.count, 3)
        // 3-2-1 leads only into the quadrant changes and the end of brushing
        XCTAssertEqual(brush.filter { if case .countdown = $0 { return true } else { return false } }.count, 12)
        XCTAssertEqual(brush.last, .awaitStart(.floss))
        XCTAssertTrue(r.awaitingStart)
        XCTAssertTrue(r.fullBrush)
        XCTAssertEqual(r.brushedSec, 120, accuracy: 1e-6)
        // time to put the brush down: nothing moves until Start
        XCTAssertEqual(run(&r, seconds: 30), [])
        XCTAssertEqual(r.stageElapsed, 0)
        XCTAssertEqual(r.start(), .stageStart(.floss))
        XCTAssertFalse(r.awaitingStart)
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
            if r.awaitingStart {
                XCTAssertNil(r.countdownDigit)
                _ = r.start()
                continue
            }
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
        // across the end of the brush: floss's Start card, which then stands still
        _ = run(&r, seconds: 108)
        let floss = r.projected(by: 5)
        XCTAssertEqual(floss.stage, .floss)
        XCTAssertTrue(floss.awaitingStart)
        XCTAssertEqual(floss.stageElapsed, 0)
        XCTAssertEqual(floss.projected(by: 30).stageElapsed, 0)
        // a paused ritual stays where it is, and nothing looks back in time
        _ = r.setPaused(true)
        XCTAssertEqual(r.projected(by: 30).stageElapsed, r.stageElapsed)
        XCTAssertEqual(r.projected(by: -3), r)
    }

    func testRinseRunsOnlyWhenTheGrownUpTurnedItOn() {
        var r = WatchRitual(startedAt: t0, includeRinse: true, rinseSec: 30)
        _ = run(&r, seconds: 120)
        _ = r.start()
        XCTAssertEqual(run(&r, seconds: 45).last, .awaitStart(.rinse))
        XCTAssertEqual(r.stage, .rinse)
        XCTAssertTrue(r.awaitingStart)
        XCTAssertEqual(r.flossOutcome, .timed)
        XCTAssertEqual(r.start(), .stageStart(.rinse))
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
        XCTAssertTrue(floss.awaitingStart)
        XCTAssertEqual(floss.skip(now: t0), .done(fullBrush: true))
        XCTAssertEqual(floss.flossOutcome, .skipped)
    }

    func testALateTickPlaysOneCueNotABacklog() {
        var r = WatchRitual(startedAt: t0, includeRinse: false)
        // 25 seconds at once (a stalled clock): only the newest cue, and the time still counts
        let cue = r.advance(by: 25, now: t0)
        XCTAssertNotNil(cue)
        XCTAssertEqual(r.stageElapsed, 25, accuracy: 1e-9)
        // across the end of brushing: floss waits for Start, and nothing carries into it
        XCTAssertEqual(r.advance(by: 100, now: t0), .awaitStart(.floss))
        XCTAssertEqual(r.stage, .floss)
        XCTAssertEqual(r.stageElapsed, 0)
        XCTAssertEqual(r.brushedSec, 120, accuracy: 1e-9)
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

    /// Done or Skip tapped while paused lands on the rinse's Start card, not a frozen rinse.
    func testDoneOrSkipWhilePausedLandsOnTheNextStartCard() {
        var r = WatchRitual(startedAt: t0, includeRinse: true)
        _ = run(&r, seconds: 120)
        _ = r.start()
        _ = run(&r, seconds: 10)
        _ = r.setPaused(true)
        XCTAssertEqual(r.next(now: t0), .awaitStart(.rinse))
        XCTAssertEqual(r.flossOutcome, .markedDone)
        XCTAssertFalse(r.paused)
        XCTAssertTrue(r.awaitingStart)
        XCTAssertNil(r.advance(by: 21, now: t0))
        XCTAssertEqual(r.start(), .stageStart(.rinse))
        XCTAssertEqual(r.advance(by: 21, now: t0), .rinseStep)
        XCTAssertEqual(r.stageElapsed, 21, accuracy: 1e-9)

        var s = WatchRitual(startedAt: t0, includeRinse: true)
        _ = run(&s, seconds: 120)
        _ = s.start()
        _ = run(&s, seconds: 10)
        _ = s.setPaused(true)
        XCTAssertEqual(s.skip(now: t0), .awaitStart(.rinse))
        XCTAssertFalse(s.paused)
    }

    /// The deliberate "Floss" under "…" moves on early: floss starts at once, and a short brush is
    /// not a full one. It is for brushing only.
    func testFlossCanBeStartedEarlyWhileBrushing() {
        var r = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&r, seconds: 70)
        XCTAssertEqual(r.skipToFloss(now: t0), .stageStart(.floss))
        XCTAssertEqual(r.stage, .floss)
        XCTAssertFalse(r.awaitingStart)
        XCTAssertFalse(r.fullBrush)
        XCTAssertEqual(r.brushedSec, 70, accuracy: 1e-6)
        XCTAssertNil(r.skipToFloss(now: t0), "only while brushing")
        XCTAssertEqual(run(&r, seconds: 45).last, .done(fullBrush: false))
        XCTAssertEqual(r.record?.floss, .timed)
        XCTAssertFalse(r.record!.rewardInputs.fullBrush)
        // after a full 2 minutes it is the Start card, not this
        var full = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&full, seconds: 120)
        XCTAssertNil(full.skipToFloss(now: t0))
    }

    /// On a Start card nothing runs: no pause, no Done, no countdown; only Start, Skip or End.
    func testAStartCardWaitsForItsTap() {
        var r = WatchRitual(startedAt: t0, includeRinse: true)
        XCTAssertNil(r.start(), "no Start while brushing")
        _ = run(&r, seconds: 120)
        XCTAssertTrue(r.awaitingStart)
        XCTAssertNil(r.setPaused(true))
        XCTAssertFalse(r.paused)
        XCTAssertNil(r.next(now: t0))
        XCTAssertNil(r.countdownDigit)
        XCTAssertEqual(r.remainingSec, WatchRitual.flossSec)
        // skipping floss from its card goes to the rinse's card
        XCTAssertEqual(r.skip(now: t0), .awaitStart(.rinse))
        XCTAssertEqual(r.flossOutcome, .skipped)
        XCTAssertEqual(r.start(), .stageStart(.rinse))
        XCTAssertEqual(r.stage, .rinse)
        XCTAssertFalse(r.awaitingStart)
    }

    /// A Start card left up for 10 minutes finishes the brush (so it is still saved), dated when
    /// the brushing ended, not when it was given up on.
    func testAStartCardLeftTooLongFinishesTheBrush() {
        var r = WatchRitual(startedAt: t0, includeRinse: true)
        _ = run(&r, seconds: 120)
        let ended = r.stageEndedAt!
        XCTAssertEqual(ended.timeIntervalSince(t0), 0, accuracy: 0.2)
        let wait = GameConfig.brushAlongStageWaitSec
        XCTAssertNil(r.advance(by: 1, now: t0.addingTimeInterval(wait - 1)))
        XCTAssertNil(r.expireWaitIfStale(now: t0.addingTimeInterval(wait - 1)))
        XCTAssertEqual(r.advance(by: 1, now: t0.addingTimeInterval(wait + 1)), .done(fullBrush: true))
        let rec = r.record!
        XCTAssertEqual(rec.completedAt, ended)
        XCTAssertEqual(rec.floss, .skipped)
        XCTAssertEqual(rec.rinse, .skipped)
        XCTAssertTrue(rec.rewardInputs.fullBrush)

        // the same check when the watch app comes back or reads a checkpoint
        var s = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&s, seconds: 120)
        XCTAssertEqual(s.expireWaitIfStale(now: t0.addingTimeInterval(wait)), .done(fullBrush: true))
        XCTAssertNil(s.expireWaitIfStale(now: t0.addingTimeInterval(wait)))

        // a brush ended from a later Start card (by End) is dated from the floss's end
        var e = WatchRitual(startedAt: t0, includeRinse: true)
        _ = run(&e, seconds: 120)
        _ = e.start()
        _ = run(&e, seconds: 45)
        let flossEnded = e.stageEndedAt!
        XCTAssertEqual(e.end(now: t0.addingTimeInterval(300)), .done(fullBrush: true))
        XCTAssertEqual(e.record?.completedAt, flossEnded)
        XCTAssertEqual(e.record?.floss, .timed)
    }

    /// A checkpoint written on a Start card reads back the same; one from before Start cards
    /// (no such fields) still reads.
    func testAStartCardSurvivesACheckpoint() throws {
        var r = WatchRitual(startedAt: t0, includeRinse: true)
        _ = run(&r, seconds: 120)
        let data = try JSONEncoder().encode(r)
        XCTAssertEqual(try JSONDecoder().decode(WatchRitual.self, from: data), r)
        var old = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        old["waitingSince"] = nil
        old["stageEndedAt"] = nil
        let oldData = try JSONSerialization.data(withJSONObject: old)
        let read = try JSONDecoder().decode(WatchRitual.self, from: oldData)
        XCTAssertFalse(read.awaitingStart)
        XCTAssertNil(read.stageEndedAt)
    }

    func testSkipAndEndRecordWhatWasLeftOut() {
        var r = WatchRitual(startedAt: t0, includeRinse: true)
        _ = run(&r, seconds: 120)
        XCTAssertEqual(r.skip(now: t0), .awaitStart(.rinse))
        XCTAssertEqual(r.flossOutcome, .skipped)
        XCTAssertEqual(r.end(now: t0), .done(fullBrush: true))
        XCTAssertEqual(r.rinseOutcome, .skipped)
        let inputs = r.record!.rewardInputs
        XCTAssertFalse(inputs.withFloss)
        XCTAssertFalse(inputs.withRinse)
        XCTAssertTrue(inputs.fullBrush)
    }

    /// End in the first 20 s of brushing keeps nothing (the phone's Home and the web do the same);
    /// from 20 s, or once brushing is over, End keeps what was done.
    func testEndKeepsNothingInTheFirstTwentySecondsOfBrushing() {
        var r = WatchRitual(startedAt: t0, includeRinse: false)
        XCTAssertTrue(r.endKeepsNothing)
        _ = run(&r, seconds: 19.5)
        XCTAssertTrue(r.endKeepsNothing)
        _ = run(&r, seconds: 1)
        XCTAssertFalse(r.endKeepsNothing)
        XCTAssertEqual(r.end(now: t0), .done(fullBrush: false))
        XCTAssertEqual(r.record?.rewardInputs.fullBrush, false)

        // "Floss" tapped early is kept whatever the seconds: End from floss keeps the brush.
        var early = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&early, seconds: 5)
        _ = early.skipToFloss(now: t0)
        XCTAssertFalse(early.endKeepsNothing)
        // Paused under 20 s, it still keeps nothing; Resume is for interruptions.
        var paused = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&paused, seconds: 10)
        _ = paused.setPaused(true)
        XCTAssertTrue(paused.endKeepsNothing)
    }

    /// A watch brush counts as full from 118 s (the same 2 s grace as the phone); the phone's
    /// widget uses this to decide the tooth's face.
    func testAWatchBrushIsFullFromTheSameGraceAsThePhone() {
        func full(_ sec: Double) -> Bool {
            WatchBrushRecord(sessionId: "s", brushedSec: sec, floss: .skipped, rinse: .notOffered, rinseOffered: false, completedAt: t0).rewardInputs.fullBrush
        }
        XCTAssertFalse(full(60))
        XCTAssertFalse(full(GameConfig.brushAlongTotalSec - GameConfig.brushAlongFullBrushGraceSec - 0.01))
        XCTAssertTrue(full(GameConfig.brushAlongTotalSec - GameConfig.brushAlongFullBrushGraceSec))
        XCTAssertTrue(full(GameConfig.brushAlongTotalSec))
    }

    func testRecordsSurviveTheTripAsADictionary() {
        var r = WatchRitual(startedAt: t0, includeRinse: false)
        _ = run(&r, seconds: 120)
        _ = r.start()
        _ = run(&r, seconds: 45)
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
        _ = run(&r, seconds: 120)
        _ = r.start()
        _ = run(&r, seconds: 45)
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
        // the ledger is saved with the payment pending before the reward is paid, and again after
        var saved: [WatchImportLedger] = []
        var ledger = WatchImportLedger()
        let paidSys = fresh()
        let ack = ledger.apply(rec, to: paidSys, now: t0) { saved.append($0) }
        XCTAssertEqual(saved.count, 2)
        XCTAssertNil(saved.first?.ack(for: "a"))
        XCTAssertEqual(saved.first?.pending?["a"]?.ack, ack)
        XCTAssertEqual(saved.last?.ack(for: "a"), ack)
        XCTAssertNil(saved.last?.pending)

        // H03: the app stopped after marking the payment pending but before paying. Sent again, the
        // brush is paid once, with the same answer the watch would have got.
        var stoppedBeforePaying = saved[0]
        let unpaid = fresh()
        let before = unpaid.getSave().fluorideIons
        let resent = stoppedBeforePaying.apply(rec, to: unpaid, now: t0)
        XCTAssertEqual(resent, ack)
        XCTAssertEqual(unpaid.getSave().fluorideIons, before + 75)
        XCTAssertEqual(stoppedBeforePaying.apply(rec, to: unpaid, now: t0), ack)
        XCTAssertEqual(unpaid.getSave().fluorideIons, before + 75)

        // The app stopped after paying but before storing the answer: the reward is not paid again,
        // and the watch gets the real answer, not a zero.
        var stoppedAfterPaying = saved[0]
        let paidOnce = paidSys.getSave().fluorideIons
        XCTAssertEqual(stoppedAfterPaying.apply(rec, to: paidSys, now: t0), ack)
        XCTAssertEqual(paidSys.getSave().fluorideIons, paidOnce)

        // A legitimately capped brush answers zero once and stays zero.
        let capped = fresh()
        for i in 0..<5 {
            var l = WatchImportLedger()
            _ = l.apply(WatchBrushRecord(sessionId: "c\(i)", brushedSec: 120, floss: .skipped, rinse: .skipped, rinseOffered: false, completedAt: t0), to: capped, now: t0)
        }
        var cappedLedger = WatchImportLedger()
        let zero = cappedLedger.apply(WatchBrushRecord(sessionId: "z", brushedSec: 120, floss: .skipped, rinse: .skipped, rinseOffered: false, completedAt: t0), to: capped, now: t0)
        XCTAssertEqual(zero.ionsAwarded, 0)
        XCTAssertEqual(cappedLedger.apply(WatchBrushRecord(sessionId: "z", brushedSec: 120, floss: .skipped, rinse: .skipped, rinseOffered: false, completedAt: t0), to: capped, now: t0), zero)

        // A ledger saved by an earlier build (no pending payments) still reads.
        let legacy = Data(#"{"acks":{"old":{"sessionId":"old","ionsAwarded":0,"stampAwarded":false,"fullReward":false}},"order":["old"]}"#.utf8)
        let decoded = try? JSONDecoder().decode(WatchImportLedger.self, from: legacy)
        XCTAssertEqual(decoded?.ack(for: "old")?.ionsAwarded, 0)
    }

    // M05: rinse on with the phone clock ahead, the clock corrected, rinse off: the watch takes the off.
    func testSettingsRevisionKeepsRisingWhenTheClockGoesBack() {
        let ahead = Date(timeIntervalSince1970: 1_900_000_000)
        let corrected = Date(timeIntervalSince1970: 1_800_000_000)
        let rinseOn = WatchPhoneSettings.nextRevision(after: 0, now: ahead)
        let rinseOff = WatchPhoneSettings.nextRevision(after: rinseOn, now: corrected)
        XCTAssertGreaterThan(rinseOff, rinseOn)
        // the watch's rule: take settings whose revision is not older than the ones it has
        XCTAssertTrue(rinseOff >= rinseOn)
        // above revisions earlier builds sent as plain timestamps
        let legacy = Date().timeIntervalSince1970
        XCTAssertGreaterThan(WatchPhoneSettings.nextRevision(after: 0), legacy - 1)
        XCTAssertGreaterThan(WatchPhoneSettings.nextRevision(after: .nan, now: corrected), 0)
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
