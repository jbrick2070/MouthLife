import XCTest
@testable import MouthLifeCore

/// The mouth on screen is a mirror: screen left is the player's left. The 3D arch and the 2-minute
/// brush put crowns 0...6 on screen left, so Home must name them "Left". (The web pins the same
/// numbers in tests/dentalChart.test.ts.)
final class DentalChartSideTests: XCTestCase {
    func testCrownNamesFollowTheMirror() {
        let leftM2 = DentalChart.companionCrownSummary(forToothIndex: 0)
        XCTAssertEqual(leftM2.toothTypeLabel, "Left 2nd Molar")
        XCTAssertEqual(leftM2.upperTooth.universal, 15)
        XCTAssertEqual(leftM2.lowerTooth.universal, 18)

        let leftC1 = DentalChart.companionCrownSummary(forToothIndex: 6)
        XCTAssertEqual(leftC1.toothTypeLabel, "Left Central Incisor")
        XCTAssertEqual(leftC1.upperTooth.universal, 9)
        XCTAssertEqual(leftC1.lowerTooth.universal, 24)

        let rightC1 = DentalChart.companionCrownSummary(forToothIndex: 7)
        XCTAssertEqual(rightC1.toothTypeLabel, "Right Central Incisor")
        XCTAssertEqual(rightC1.upperTooth.universal, 8)
        XCTAssertEqual(rightC1.lowerTooth.universal, 25)

        let rightM2 = DentalChart.companionCrownSummary(forToothIndex: 13)
        XCTAssertEqual(rightM2.toothTypeLabel, "Right 2nd Molar")
        XCTAssertEqual(rightM2.upperTooth.universal, 2)
        XCTAssertEqual(rightM2.lowerTooth.universal, 31)
    }

    func testEveryCrownHasOneUpperAndOneLowerTooth() {
        var seenUpper = Set<Int>()
        var seenLower = Set<Int>()
        for index in 0..<14 {
            let crown = DentalChart.companionCrownSummary(forToothIndex: index)
            XCTAssertEqual(crown.upperTooth.companionArchIndex, index)
            XCTAssertEqual(crown.lowerTooth.companionArchIndex, index)
            XCTAssertEqual(crown.upperTooth.side, index < 7 ? .left : .right, "crown \(index)")
            XCTAssertEqual(crown.lowerTooth.side, index < 7 ? .left : .right, "crown \(index)")
            seenUpper.insert(crown.upperTooth.universal)
            seenLower.insert(crown.lowerTooth.universal)
        }
        XCTAssertEqual(seenUpper.count, 14)
        XCTAssertEqual(seenLower.count, 14)
    }
}
