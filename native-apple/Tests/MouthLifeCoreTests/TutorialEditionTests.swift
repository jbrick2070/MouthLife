import XCTest
@testable import MouthLifeCore

/// The How to Play guide comes back for everyone when its edition is raised (web twin:
/// tests/tutorial.test.ts, "offers the guide again to players who saw or opened an earlier edition").
final class TutorialEditionTests: XCTestCase {
    func testAnEarlierEditionIsOfferedAgain() {
        // saved before editions existed (nothing written = 0), or under edition 1
        for saved in [0, 1] {
            var gate = TutorialGate(progress: TutorialGuide.progress(offers: 3, opened: true, savedEdition: saved))
            XCTAssertTrue(gate.enterHome())
            XCTAssertTrue(gate.isOfferVisible)
        }
    }

    func testTheCurrentEditionCountsAsUsual() {
        var opened = TutorialGate(progress: TutorialGuide.progress(offers: 1, opened: true, savedEdition: TutorialGuide.edition))
        opened.enterHome()
        XCTAssertFalse(opened.isOfferVisible)
        var spent = TutorialGate(progress: TutorialGuide.progress(offers: TutorialGuide.maxOffers, opened: false, savedEdition: TutorialGuide.edition))
        spent.enterHome()
        XCTAssertFalse(spent.isOfferVisible)
    }
}
