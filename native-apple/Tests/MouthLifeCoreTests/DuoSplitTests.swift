import CoreGraphics
import XCTest
@testable import MouthLifeCore

/// The Duo's two pages, worked out from the fold the system reports.
final class DuoSplitTests: XCTestCase {
    func testABookFoldSplitsSideBySideWithAClearGutter() throws {
        // open flat: about 880 x 620 inside the safe area, a zero-width fold at x = 470
        let size = CGSize(width: 880, height: 620)
        let split = try XCTUnwrap(DuoSplit.make(folds: [CGRect(x: 470, y: 0, width: 0, height: 620)], size: size, safeTrailing: 0))
        XCTAssertEqual(split.axis, .sideBySide)
        XCTAssertEqual(split.firstRect, CGRect(x: 0, y: 0, width: 446, height: 620))
        XCTAssertEqual(split.secondRect, CGRect(x: 494, y: 0, width: 386, height: 620))
        XCTAssertEqual(split.viewportTrailing, 434)
        XCTAssertEqual(split.viewportBottom, 0)
    }

    func testATabletopFoldStacksTheUprightPageFirst() throws {
        let size = CGSize(width: 640, height: 860)
        let split = try XCTUnwrap(DuoSplit.make(folds: [CGRect(x: 0, y: 420, width: 640, height: 20)], size: size, safeBottom: 20))
        XCTAssertEqual(split.axis, .stacked)
        XCTAssertEqual(split.firstRect.maxY, 430 - 24)
        XCTAssertEqual(split.secondRect.minY, 430 + 24)
        XCTAssertEqual(split.viewportBottom, 860 - 406 + 20)
        XCTAssertEqual(split.viewportTrailing, 0)
    }

    func testNoSplitWithoutAUsableFold() {
        let size = CGSize(width: 880, height: 620)
        XCTAssertNil(DuoSplit.make(folds: [], size: size))
        // a page under 300 points (Split View, a narrow window)
        XCTAssertNil(DuoSplit.make(folds: [CGRect(x: 250, y: 0, width: 0, height: 620)], size: size))
        // a region that is not a fold across the whole screen (a camera cut-out)
        XCTAssertNil(DuoSplit.make(folds: [CGRect(x: 400, y: 0, width: 80, height: 40)], size: size))
        XCTAssertNil(DuoSplit.make(folds: [CGRect(x: 470, y: 0, width: 0, height: 620)], size: .zero))
    }
}
