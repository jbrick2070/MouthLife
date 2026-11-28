import XCTest
@testable import MouthLifeCore

/// Which finger drives the 3D scene (`ScenePointerOwner`). The browser's twin is
/// `tests/pointerOwner.test.ts`: the same cases in the same order, one for one. Change both.
final class ScenePointerOwnerTests: XCTestCase {

    func testNobodyOwnsTheSceneAtFirst() {
        var owner = ScenePointerOwner()
        XCTAssertNil(owner.key)
        XCTAssertFalse(owner.drives(1, epoch: 0))
        XCTAssertFalse(owner.ended([1]))
        XCTAssertFalse(owner.releaseAll())
    }

    func testAFingerLandsDrivesAndLifts() {
        var owner = ScenePointerOwner()
        XCTAssertTrue(owner.began(1, liveKeys: [1], epoch: 0))
        XCTAssertEqual(owner.key, 1)
        XCTAssertTrue(owner.drives(1, epoch: 0))
        XCTAssertTrue(owner.ended([1]))
        XCTAssertNil(owner.key)
        XCTAssertFalse(owner.drives(1, epoch: 0))
    }

    func testASecondFingerNeitherTakesOverNorLetsGoOfTheFirst() {
        var owner = ScenePointerOwner()
        XCTAssertTrue(owner.began(1, liveKeys: [1], epoch: 0))
        XCTAssertFalse(owner.began(2, liveKeys: [1, 2], epoch: 0))
        XCTAssertEqual(owner.key, 1)
        XCTAssertFalse(owner.drives(2, epoch: 0))
        XCTAssertTrue(owner.drives(1, epoch: 0))
        // the second finger lifts: the first still scrubs
        XCTAssertFalse(owner.ended([2]))
        XCTAssertEqual(owner.key, 1)
        XCTAssertTrue(owner.drives(1, epoch: 0))
        XCTAssertTrue(owner.ended([1]))
    }

    func testAFingerLeftDownAfterTheOwnerLiftsDoesNotTakeOverByItself() {
        var owner = ScenePointerOwner()
        XCTAssertTrue(owner.began(1, liveKeys: [1], epoch: 0))
        XCTAssertFalse(owner.began(2, liveKeys: [1, 2], epoch: 0))
        XCTAssertTrue(owner.ended([1]))
        XCTAssertFalse(owner.drives(2, epoch: 0))
        // a new touch does, though the second finger is still on the screen
        XCTAssertTrue(owner.began(3, liveKeys: [2, 3], epoch: 0))
        XCTAssertEqual(owner.key, 3)
    }

    func testARestingFingerKeepsTheSceneHoweverLongItRests() {
        // No clock anywhere in the rule: nothing arrives from a finger that rests still, and
        // however much later a second one lands, the first is still the owner.
        var owner = ScenePointerOwner()
        XCTAssertTrue(owner.began(1, liveKeys: [1], epoch: 0))
        XCTAssertFalse(owner.began(2, liveKeys: [1, 2], epoch: 0))
        XCTAssertFalse(owner.began(3, liveKeys: [1, 3], epoch: 0))
        XCTAssertTrue(owner.drives(1, epoch: 0))
    }

    func testAnOwnerThatVanishedWithoutLiftingDoesNotKeepTheNextTouchOut() {
        var owner = ScenePointerOwner()
        XCTAssertTrue(owner.began(1, liveKeys: [1], epoch: 0))
        // no "lifted" and no "cancelled" ever arrives; the next touch is alone on the screen
        XCTAssertTrue(owner.began(2, liveKeys: [2], epoch: 0))
        XCTAssertEqual(owner.key, 2)
        XCTAssertTrue(owner.drives(2, epoch: 0))
        XCTAssertFalse(owner.drives(1, epoch: 0))
        // a "lifted" for the old one, arriving late, does not let go of the new owner
        XCTAssertFalse(owner.ended([1]))
        XCTAssertEqual(owner.key, 2)
    }

    func testTheOwnersIdentityBeginningAgainIsANewTouch() {
        // The system hands identities out again: the same one beginning means the old finger went.
        var owner = ScenePointerOwner()
        XCTAssertTrue(owner.began(1, liveKeys: [1], epoch: 0))
        XCTAssertTrue(owner.began(1, liveKeys: [1], epoch: 0))
        XCTAssertEqual(owner.key, 1)
        XCTAssertTrue(owner.drives(1, epoch: 0))
    }

    func testAfterTheScreenLetsGoTheOldFingerNoLongerDrivesAndANewOneMayLand() {
        var owner = ScenePointerOwner()
        XCTAssertTrue(owner.began(1, liveKeys: [1], epoch: 0))
        // a pause, a finale or a new stage: the epoch moves on while the finger is still down
        XCTAssertFalse(owner.drives(1, epoch: 1))
        XCTAssertTrue(owner.began(2, liveKeys: [1, 2], epoch: 1))
        XCTAssertEqual(owner.key, 2)
        XCTAssertTrue(owner.drives(2, epoch: 1))
        XCTAssertFalse(owner.drives(1, epoch: 1))
        // the old finger lifting does not let go of the new owner
        XCTAssertFalse(owner.ended([1]))
        XCTAssertEqual(owner.key, 2)
    }

    func testACancelledTouchLetsGoLikeALiftedOne() {
        var owner = ScenePointerOwner()
        XCTAssertTrue(owner.began(1, liveKeys: [1], epoch: 0))
        XCTAssertFalse(owner.began(2, liveKeys: [1, 2], epoch: 0))
        // the system takes every finger away at once (a system gesture, a call)
        XCTAssertTrue(owner.ended([1, 2]))
        XCTAssertNil(owner.key)
        XCTAssertTrue(owner.began(3, liveKeys: [3], epoch: 0))
        XCTAssertEqual(owner.key, 3)
    }

    func testReleaseAllDropsTheOwnerThoughItsFingerIsStillDown() {
        var owner = ScenePointerOwner()
        XCTAssertTrue(owner.began(1, liveKeys: [1], epoch: 0))
        XCTAssertTrue(owner.releaseAll())
        XCTAssertNil(owner.key)
        XCTAssertFalse(owner.drives(1, epoch: 0))
        XCTAssertFalse(owner.releaseAll())
        // the finger that was let go of is still on the screen: it keeps nobody out
        XCTAssertTrue(owner.began(2, liveKeys: [1, 2], epoch: 0))
        XCTAssertEqual(owner.key, 2)
        XCTAssertFalse(owner.ended([1]))
        XCTAssertEqual(owner.key, 2)
    }

    func testTakeMakesAnOwnerWithoutAsking() {
        var owner = ScenePointerOwner()
        XCTAssertTrue(owner.began(1, liveKeys: [1], epoch: 0))
        owner.take(9, epoch: 0)
        XCTAssertEqual(owner.key, 9)
        XCTAssertTrue(owner.holds(against: 2, liveKeys: [9, 2], epoch: 0))
        XCTAssertFalse(owner.holds(against: 2, liveKeys: [2], epoch: 0))
        XCTAssertFalse(owner.holds(against: 9, liveKeys: [9], epoch: 0))
    }
}
