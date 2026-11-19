import XCTest
@testable import MouthLifeCore

/// Fixes from the November 2026 web QA pass, kept identical in both editions.
final class QAFixTests: XCTestCase {

    // The brushing sound belongs to a stage being played (web twin: tests/scrubGate.test.ts).
    func testScrubGatePlaysOnlyDuringALiveStage() {
        XCTAssertTrue(ScrubGate.mayPlay(mode: .arcade, finale: false, paused: false, stageLive: true))
        XCTAssertTrue(ScrubGate.mayPlay(mode: .pulpRescue, finale: false, paused: false, stageLive: true))
        // The city just ended: the last snapshot may still say "scrubbing".
        XCTAssertFalse(ScrubGate.mayPlay(mode: .arcade, finale: false, paused: false, stageLive: false))
        XCTAssertFalse(ScrubGate.mayPlay(mode: .arcade, finale: true, paused: false, stageLive: true))
        XCTAssertFalse(ScrubGate.mayPlay(mode: .arcade, finale: false, paused: true, stageLive: true))
        for mode in [AppMode.report, .hub, .cosmicIntro, .brushAlong] {
            XCTAssertFalse(ScrubGate.mayPlay(mode: mode, finale: false, paused: false, stageLive: true))
        }
    }
}
