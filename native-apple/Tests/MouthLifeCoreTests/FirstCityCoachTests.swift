import XCTest
@testable import MouthLifeCore

/// The first-city coach. The same cases run on the web (tests/firstCityCoach.test.ts).
final class FirstCityCoachTests: XCTestCase {
    private typealias Coach = FirstCityCoach
    private let calm = FirstCityCoach.Context(surgeReady: false, nearGap: false)

    private func play(_ events: [FirstCityCoach.Event], from state: FirstCityCoach.State = .init()) -> FirstCityCoach.State {
        events.reduce(state) { Coach.advance($0, $1) }
    }

    func testStartsByAskingForASweepAndATouchIsNotASweep() {
        XCTAssertEqual(Coach.currentStep(.init(), calm), .sweep)
        let touched = play([.scrub(newlyCleaned: 3)])
        XCTAssertEqual(Coach.currentStep(touched, calm), .sweep)
        let swept = play([.scrub(newlyCleaned: 1)], from: touched)
        XCTAssertTrue(swept.isDone(.sweep))
        XCTAssertEqual(Coach.currentStep(swept, calm), .helper)
    }

    func testWalksAFirstZoneInOrder() {
        var s = play([.scrub(newlyCleaned: 9)])
        XCTAssertEqual(Coach.currentStep(s, calm), .helper)
        s = play([.helperRestored], from: s)
        XCTAssertEqual(Coach.currentStep(s, calm), .scan)
        s = play([.scanPulsed], from: s)
        XCTAssertEqual(Coach.currentStep(s, calm), .seal)
        s = play([.zoneSealed], from: s)
        // After the first seal the coach waits quietly for a gap.
        XCTAssertNil(Coach.currentStep(s, calm))
        XCTAssertFalse(Coach.finished(s))
    }

    func testTeachesSurgeOnlyOnceItIsFullAndThenSkipsScan() {
        var s = play([.scrub(newlyCleaned: 9), .helperRestored])
        XCTAssertEqual(Coach.currentStep(s, .init(surgeReady: true, nearGap: false)), .surge)
        s = play([.surgeFired], from: s)
        XCTAssertEqual(Coach.currentStep(s, calm), .seal)
        XCTAssertEqual(Coach.currentStep(s, .init(surgeReady: true, nearGap: false)), .seal)
    }

    func testTeachesFlossAtAGapWhereverThePlayerIsInTheList() {
        let swept = play([.scrub(newlyCleaned: 9)])
        XCTAssertEqual(Coach.currentStep(swept, .init(surgeReady: false, nearGap: true)), .floss)
        XCTAssertEqual(Coach.currentStep(.init(), .init(surgeReady: false, nearGap: true)), .sweep)
        let sealed = play([.helperRestored, .zoneSealed], from: swept)
        XCTAssertEqual(Coach.currentStep(sealed, .init(surgeReady: true, nearGap: true)), .floss)
        let zipped = play([.zipped], from: sealed)
        XCTAssertTrue(Coach.finished(zipped))
        XCTAssertNil(Coach.currentStep(zipped, .init(surgeReady: true, nearGap: true)))
    }

    func testTicksThingsOffInAnyOrderAndNeverUnticksThem() {
        let early = play([.zipped, .surgeFired, .scanPulsed])
        XCTAssertEqual(early.done, [.floss, .surge, .scan])
        XCTAssertEqual(Coach.currentStep(early, .init(surgeReady: true, nearGap: true)), .sweep)
        let later = play([.scrub(newlyCleaned: 4), .helperRestored, .zoneSealed], from: early)
        XCTAssertTrue(Coach.finished(later))
        XCTAssertEqual(play([.scrub(newlyCleaned: 50), .zipped], from: later), later)
    }

    func testIgnoresBadNumbers() {
        XCTAssertEqual(play([.scrub(newlyCleaned: 0), .scrub(newlyCleaned: -5)]), .init())
    }

    func testIsForANewPlayerInCityOneOnlyOncePerDevice() {
        XCTAssertTrue(Coach.applies(worldId: "world_1", mode: .arcade, cityCompleted: false, seenHints: []))
        XCTAssertFalse(Coach.applies(worldId: "world_1", mode: .arcade, cityCompleted: true, seenHints: []))
        XCTAssertFalse(Coach.applies(worldId: "world_2", mode: .arcade, cityCompleted: false, seenHints: []))
        XCTAssertFalse(Coach.applies(worldId: "world_1", mode: .pulpRescue, cityCompleted: false, seenHints: []))
        XCTAssertFalse(Coach.applies(worldId: "world_1", mode: .arcade, cityCompleted: false, seenHints: [Coach.doneHintKey]))
    }

    func testEveryStepHasAShortLineThatFitsAPhone() {
        for step in FirstCityCoach.Step.allCases {
            XCTAssertLessThanOrEqual(Coach.line(step, short: true).count, 21, step.rawValue)
            XCTAssertLessThanOrEqual(Coach.line(step, short: false).count, 48, step.rawValue)
        }
    }

    func testMatchesCityOneItsFirstZoneHasHelperSpotsButNoFlossGap() {
        let cart = WorldRegistry.world1
        let zone1 = cart.districts[0].bounds
        XCTAssertTrue(cart.commensalSiteSpawns.contains { $0.districtIdx == 0 })
        for alley in cart.interdentalAlleys {
            XCTAssertGreaterThan(min(alley.endpointA.x, alley.endpointB.x), zone1.maxX)
        }
    }
}
