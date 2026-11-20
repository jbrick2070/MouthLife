import XCTest
@testable import MouthLifeCore

/// H04: the brushing ritual keeps real time through a locked phone (web twin:
/// tests/ritualReliability.test.ts).
final class PacerSessionClockTests: XCTestCase {
    func testTwentySecondsLockedAtOneFiftyComesBackTenSecondsIntoFloss() {
        var clock = PacerSessionClock()
        clock.advance(by: 110)
        clock.advance(by: 20) // locked
        XCTAssertEqual(clock.elapsedSec(in: .brushing, mouthwashDurationSec: 60), 120)
        XCTAssertEqual(clock.overflowSec(in: .brushing, mouthwashDurationSec: 60), 10, accuracy: 1e-9)
        clock.enter(.flossBonus, from: .brushing, mouthwashDurationSec: 60)
        XCTAssertEqual(clock.elapsedSec(in: .flossBonus, mouthwashDurationSec: 60), 130, accuracy: 1e-9)
    }

    func testFromOneFifteenToThreeMinutesLandsFifteenSecondsIntoTheRinse() {
        var clock = PacerSessionClock()
        clock.advance(by: 115)
        clock.advance(by: 65)
        clock.enter(.flossBonus, from: .brushing, mouthwashDurationSec: 60)
        XCTAssertEqual(clock.overflowSec(in: .flossBonus, mouthwashDurationSec: 60), 15, accuracy: 1e-9)
        clock.enter(.mouthwashBonus, from: .flossBonus, mouthwashDurationSec: 60)
        XCTAssertEqual(clock.elapsedSec(in: .mouthwashBonus, mouthwashDurationSec: 60), 180, accuracy: 1e-9)
        XCTAssertEqual(clock.overflowSec(in: .mouthwashBonus, mouthwashDurationSec: 60), 0)
    }

    func testStageEndsAreOneSixtyFiveOneNinetyFiveAndTwoTwentyFive() {
        XCTAssertEqual(PacerSessionClock.stageEndSec(.flossBonus, mouthwashDurationSec: 60), 165)
        XCTAssertEqual(PacerSessionClock.stageEndSec(.mouthwashBonus, mouthwashDurationSec: 30), 195)
        XCTAssertEqual(PacerSessionClock.stageEndSec(.mouthwashBonus, mouthwashDurationSec: 60), 225)
    }

    func testAJumpAheadCarriesNothingAndAClockSetBackNeverRunsItBackwards() {
        var clock = PacerSessionClock()
        clock.advance(by: 60)
        clock.enter(.flossBonus, from: .brushing, mouthwashDurationSec: 60)
        XCTAssertEqual(clock.elapsedSec(in: .flossBonus, mouthwashDurationSec: 60), 120)
        clock.advance(by: -3600)
        clock.advance(by: .nan)
        XCTAssertEqual(clock.rawSec, 120)
    }

    func testSwitchingTheRinseLengthKeepsTheSameFractionDone() {
        var clock = PacerSessionClock()
        clock.enter(.mouthwashBonus, from: .brushing, mouthwashDurationSec: 60)
        clock.advance(by: 30)
        clock.rescaleRinse(from: 60, to: 30)
        XCTAssertEqual(clock.elapsedSec(in: .mouthwashBonus, mouthwashDurationSec: 30), 180, accuracy: 1e-9)
    }
}
