import XCTest
@testable import MouthLifeCore

/// The grown-up question's rules: the sum, the four answers and the lock after a wrong answer (the
/// web's twin, src/ui/parentGate.ts, follows the same rules).
final class ParentGateTests: XCTestCase {
    /// The same numbers on every run (SplitMix64), so "evenly spread" is checked on a known sequence
    /// and cannot fail by bad luck.
    private struct Seeded: RandomNumberGenerator {
        var state: UInt64

        mutating func next() -> UInt64 {
            state &+= 0x9E37_79B9_7F4A_7C15
            var z = state
            z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
            z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
            return z ^ (z >> 31)
        }
    }

    func testTheSumIsTwelveToNineteenTimesThreeToNine() {
        XCTAssertEqual(ParentGate.firstFactor, 12...19)
        XCTAssertEqual(ParentGate.secondFactor, 3...9)
        var generator = Seeded(state: 1)
        var firsts = Set<Int>(), seconds = Set<Int>()
        for _ in 0..<4_000 {
            let q = ParentGate.question(using: &generator)
            XCTAssertTrue((12...19).contains(q.a), "\(q.a)")
            XCTAssertTrue((3...9).contains(q.b), "\(q.b)")
            XCTAssertEqual(q.answer, q.a * q.b)
            firsts.insert(q.a)
            seconds.insert(q.b)
        }
        // every number in both ranges comes up, the ends too
        XCTAssertEqual(firsts, Set(12...19))
        XCTAssertEqual(seconds, Set(3...9))
    }

    func testFourDifferentAnswersInRisingOrderWithTheRightOneAmongThem() {
        var generator = Seeded(state: 2)
        var cards = Set<String>()
        var smallest = Int.max
        for _ in 0..<40_000 {
            let q = ParentGate.question(using: &generator)
            XCTAssertEqual(q.choices.count, 4)
            XCTAssertEqual(Set(q.choices).count, 4, "\(q)")
            XCTAssertEqual(q.choices, q.choices.sorted(), "\(q)")
            XCTAssertTrue(q.choices.allSatisfy { $0 > 0 }, "\(q)")
            XCTAssertEqual(q.choices.filter { $0 == q.answer }.count, 1, "\(q)")
            // a wrong answer is one `b` out, ten out, or both
            for wrong in q.choices where wrong != q.answer {
                XCTAssertTrue([q.b, 10, q.b + 10].contains(abs(wrong - q.answer)), "\(q)")
            }
            cards.insert("\(q.a) x \(q.b): \(q.choices)")
            smallest = min(smallest, q.choices[0])
        }
        // Every card there is was drawn and checked above: 8 x 7 sums, each with 20 sets of answers
        // (1 with the right one first, 9 with it second, 9 with it third, 1 with it last).
        XCTAssertEqual(cards.count, 8 * 7 * 20)
        // the smallest answer ever offered: 12 x 3 - 3 - 10
        XCTAssertEqual(smallest, 23)
    }

    func testTheRightAnswerIsAsOftenFirstSecondThirdOrLast() throws {
        var generator = Seeded(state: 3)
        let draws = 20_000
        var places = [0, 0, 0, 0]
        for _ in 0..<draws {
            let q = ParentGate.question(using: &generator)
            places[try XCTUnwrap(q.choices.firstIndex(of: q.answer))] += 1
        }
        // a quarter each, give or take a twentieth of that (the old question's right answer was a
        // middle one four times in five)
        let quarter = Double(draws) / 4
        for count in places {
            XCTAssertEqual(Double(count), quarter, accuracy: quarter * 0.05, "\(places)")
        }
    }

    func testEveryWrongAnswerIsUsedAsOftenAsTheNext() {
        var generator = Seeded(state: 4)
        let draws = 20_000
        // the six wrong answers by name: one `b`, ten, or both, below or above the right one
        var used: [String: Int] = [:]
        for _ in 0..<draws {
            let q = ParentGate.question(using: &generator)
            for wrong in q.choices where wrong != q.answer {
                let gap = abs(wrong - q.answer)
                let name = gap == q.b ? "b" : gap == 10 ? "ten" : "both"
                used[(wrong < q.answer ? "below " : "above ") + name, default: 0] += 1
            }
        }
        XCTAssertEqual(used.count, 6, "\(used)")
        // each of the six is on the card in half of the questions
        let half = Double(draws) / 2
        for (name, count) in used {
            XCTAssertEqual(Double(count), half, accuracy: half * 0.05, "\(name): \(used)")
        }
    }

    func testTheSameRandomNumbersGiveTheSameQuestion() {
        var one = Seeded(state: 5), two = Seeded(state: 5), other = Seeded(state: 6)
        let first = (0..<50).map { _ in ParentGate.question(using: &one) }
        let again = (0..<50).map { _ in ParentGate.question(using: &two) }
        let different = (0..<50).map { _ in ParentGate.question(using: &other) }
        XCTAssertEqual(first, again)
        XCTAssertNotEqual(first, different)
        // the everyday entry point keeps the same rules
        let q = ParentGate.question()
        XCTAssertTrue((12...19).contains(q.a) && (3...9).contains(q.b))
        XCTAssertEqual(q.choices.count, 4)
        XCTAssertTrue(q.choices.contains(q.answer))
    }

    func testAWrongAnswerLocksTheQuestionForThirtySeconds() {
        XCTAssertEqual(ParentGate.lockSeconds, 30)
        // 1000 s after the device started
        let end = ParentGate.lockEnd(wrongAnswerAt: 1000)
        XCTAssertEqual(end, 1030)
        // rounded up: the countdown shows 30 first and 1 last
        XCTAssertEqual(ParentGate.secondsLeft(lockEnd: end, at: 1000), 30)
        XCTAssertEqual(ParentGate.secondsLeft(lockEnd: end, at: 1000.25), 30)
        XCTAssertEqual(ParentGate.secondsLeft(lockEnd: end, at: 1001), 29)
        XCTAssertEqual(ParentGate.secondsLeft(lockEnd: end, at: 1028.5), 2)
        XCTAssertEqual(ParentGate.secondsLeft(lockEnd: end, at: 1029), 1)
        XCTAssertEqual(ParentGate.secondsLeft(lockEnd: end, at: 1029.75), 1)
        // over at the end and ever after
        XCTAssertEqual(ParentGate.secondsLeft(lockEnd: end, at: 1030), 0)
        XCTAssertEqual(ParentGate.secondsLeft(lockEnd: end, at: 1030.25), 0)
        XCTAssertEqual(ParentGate.secondsLeft(lockEnd: end, at: 86_400), 0)
    }

    func testNoLockMeansNoWaitAndAWaitIsNeverLongerThanOneLock() {
        XCTAssertEqual(ParentGate.secondsLeft(lockEnd: nil, at: 0), 0)
        XCTAssertEqual(ParentGate.secondsLeft(lockEnd: nil, at: 1000), 0)
        // a time from before the lock was set cannot stretch it
        XCTAssertEqual(ParentGate.secondsLeft(lockEnd: 1030, at: 0), 30)
        XCTAssertEqual(ParentGate.secondsLeft(lockEnd: .infinity, at: 1000), 30)
        // a number that is not a time locks nothing
        XCTAssertEqual(ParentGate.secondsLeft(lockEnd: .nan, at: 1000), 0)
        XCTAssertEqual(ParentGate.secondsLeft(lockEnd: 1030, at: .nan), 0)
    }
}
