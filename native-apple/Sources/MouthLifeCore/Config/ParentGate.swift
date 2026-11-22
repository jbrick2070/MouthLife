import Foundation

/// The grown-up question: which sum is asked, which four answers are offered, and how long a wrong
/// answer locks it. It stands in front of every link that leaves the app and of turning on what only
/// a grown-up may turn on (reminders, Apple Health, the fluoride rinse).
///
/// Three things keep a young child out. The sum is a two-digit number times a single digit (it used
/// to come straight from the 3 to 9 times tables). The right answer is as often first, second, third
/// or last, so no place is a better guess than another. And a wrong answer locks the question for
/// half a minute, so it cannot be tried again and again.
///
/// Pure (no UI, no timers, no clock of its own): the card is `ParentGateView` in the app. Web twin:
/// `src/ui/parentGate.ts`, which follows the same rules.
public enum ParentGate {
    /// The sum is `a × b`, with `a` from 12 to 19 and `b` from 3 to 9.
    public static let firstFactor = 12...19
    public static let secondFactor = 3...9
    /// How long a wrong answer locks the question, in seconds.
    public static let lockSeconds: Double = 30

    /// One question: the sum and the four answers on the buttons.
    public struct Question: Equatable, Sendable {
        public let a: Int
        public let b: Int
        /// The four answers in rising order. One of them is `answer`.
        public let choices: [Int]

        public var answer: Int { a * b }
    }

    /// Draws a new question.
    ///
    /// `rank` wrong answers are below the right one and the other `3 - rank` above it, and every rank
    /// from 0 to 3 is as likely as the next. The wrong answers lie close by: one `b` out, ten out, or
    /// both. The smallest of them is 12 × 3 − 3 − 10 = 23, so all four are above zero, and since `b`
    /// is never 10 no two are the same.
    public static func question<G: RandomNumberGenerator>(using generator: inout G) -> Question {
        let a = Int.random(in: firstFactor, using: &generator)
        let b = Int.random(in: secondFactor, using: &generator)
        let answer = a * b
        let rank = Int.random(in: 0...3, using: &generator)
        var choices = [answer]
        choices += [answer - b, answer - 10, answer - b - 10].shuffled(using: &generator).prefix(rank)
        choices += [answer + b, answer + 10, answer + b + 10].shuffled(using: &generator).prefix(3 - rank)
        return Question(a: a, b: b, choices: choices.sorted())
    }

    /// Draws a new question with the system's own random numbers.
    public static func question() -> Question {
        var generator = SystemRandomNumberGenerator()
        return question(using: &generator)
    }

    /// When a lock set by a wrong answer at `uptime` ends. Both times are seconds on a clock that
    /// only runs forwards (the time since the device started), so changing the date in Settings
    /// cannot end a lock early.
    public static func lockEnd(wrongAnswerAt uptime: TimeInterval) -> TimeInterval {
        uptime + lockSeconds
    }

    /// Whole seconds of lock left at `uptime`, rounded up, so the countdown shows 30 first and 1
    /// last. 0 means the question can be answered: no lock was set, or it is over. Never more than
    /// one full lock.
    public static func secondsLeft(lockEnd: TimeInterval?, at uptime: TimeInterval) -> Int {
        guard let lockEnd else { return 0 }
        let left = lockEnd - uptime
        guard left > 0 else { return 0 }
        return Int(min(lockSeconds, left).rounded(.up))
    }
}
