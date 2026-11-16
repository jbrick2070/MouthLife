import Foundation

// The How to Play guide: eight short cards, one idea each.
//
// Shared word for word with the web edition (`src/config/tutorial.ts`), so both editions teach the
// same thing and use the same translations. Change them together.

public enum TutorialPageId: String, CaseIterable, Identifiable, Sendable {
    case home
    case brush
    case dive
    case floss
    case surge
    case scan
    case cities
    case ready

    public var id: String { rawValue }
}

/// How the player is controlling the game right now.
public enum TutorialInputScheme: String, CaseIterable, Sendable {
    case touch
    case mouse
    case keys
    case pad
}

public struct TutorialControlHint: Equatable, Sendable {
    /// Key or button names drawn as keycaps. Never translated.
    public let keys: [String]
    public let label: String

    public init(keys: [String] = [], label: String) {
        self.keys = keys
        self.label = label
    }
}

public struct TutorialPage: Equatable, Identifiable, Sendable {
    public let id: TutorialPageId
    public let title: String
    public let body: String
    public let controls: [TutorialInputScheme: [TutorialControlHint]]

    public init(
        id: TutorialPageId,
        title: String,
        body: String,
        controls: [TutorialInputScheme: [TutorialControlHint]]
    ) {
        self.id = id
        self.title = title
        self.body = body
        self.controls = controls
    }
}

public enum TutorialGuide {
    /// The Home screen offers the guide on this many launches, then leaves it to the ? button.
    public static let maxOffers = 3

    /// Words on the guide's own buttons and on the Home screen offer.
    public enum Copy {
        public static let buttonLabel = "How to Play"
        public static let skip = "Skip"
        public static let back = "Back"
        public static let next = "Next"
        public static let done = "Done"
        public static let replayDemo = "Play the demo again"
        public static let offerTitle = "How to play"
        public static let offerBody = "A one-minute guide to the games and controls."
        public static let offerAccept = "Show me"
        public static let offerDecline = "Not now"
    }

    private static let rubAndTurn: [TutorialControlHint] = [
        TutorialControlHint(label: "Rub the teeth"),
        TutorialControlHint(label: "Drag beside them to turn")
    ]
    private static let handsFree: [TutorialControlHint] = [
        TutorialControlHint(label: "Hands-free: just follow along")
    ]
    private static let dragOnTooth: [TutorialControlHint] = [
        TutorialControlHint(label: "Drag on the tooth")
    ]
    private static let pickACity: [TutorialControlHint] = [
        TutorialControlHint(label: "Pick a city on the Home screen")
    ]
    private static let findAgain: [TutorialControlHint] = [
        TutorialControlHint(label: "Tap ? on Home to see this again")
    ]

    public static let pages: [TutorialPage] = [
        TutorialPage(
            id: .home,
            title: "Welcome home",
            body: "This is your mouth. Rub the teeth to polish them, then pick a game at the bottom.",
            controls: [.touch: rubAndTurn, .mouse: rubAndTurn, .keys: rubAndTurn, .pad: rubAndTurn]
        ),
        TutorialPage(
            id: .brush,
            title: "2-Min Brush",
            body: "Brush your real teeth where the glow shows. A chime means move on. Floss and rinse come next.",
            controls: [.touch: handsFree, .mouse: handsFree, .keys: handsFree, .pad: handsFree]
        ),
        TutorialPage(
            id: .dive,
            title: "Dive",
            body: "Steer the tiny robot over a giant tooth and scrub off the plaque. Clean 90% to win.",
            controls: [
                .touch: dragOnTooth,
                .mouse: dragOnTooth,
                .keys: [
                    TutorialControlHint(keys: ["W", "A", "S", "D"], label: "Move"),
                    TutorialControlHint(keys: ["Space"], label: "Hold to scrub")
                ],
                .pad: [
                    TutorialControlHint(keys: ["L-Stick"], label: "Move"),
                    TutorialControlHint(keys: ["A"], label: "Hold to scrub")
                ]
            ]
        ),
        TutorialPage(
            id: .floss,
            title: "Floss",
            body: "Floss cleans the narrow gaps between teeth, where the brush can’t reach.",
            controls: [
                .touch: [TutorialControlHint(label: "Double-tap, or tap FLOSS")],
                .mouse: [TutorialControlHint(label: "Double-click, or click FLOSS")],
                .keys: [TutorialControlHint(keys: ["E"], label: "or right-click")],
                .pad: [TutorialControlHint(keys: ["X"], label: "Fire floss")]
            ]
        ),
        TutorialPage(
            id: .surge,
            title: "Fluoride Surge",
            body: "Scrubbing fills the Surge meter. At 100%, fire a big wave that washes plaque and acid away.",
            controls: [
                .touch: [TutorialControlHint(label: "Tap SURGE at 100%")],
                .mouse: [TutorialControlHint(label: "Click SURGE at 100%")],
                .keys: [TutorialControlHint(keys: ["Q"], label: "Fire at 100%")],
                .pad: [TutorialControlHint(keys: ["Y"], label: "Fire at 100%")]
            ]
        ),
        TutorialPage(
            id: .scan,
            title: "Dye Scan",
            body: "Pink dye shows the plaque you missed.",
            controls: [
                .touch: [TutorialControlHint(label: "Tap SCAN")],
                .mouse: [TutorialControlHint(label: "Click SCAN")],
                .keys: [TutorialControlHint(keys: ["R"], label: "Show the dye")],
                .pad: [TutorialControlHint(keys: ["B"], label: "Show the dye")]
            ]
        ),
        TutorialPage(
            id: .cities,
            title: "New cities",
            body: "Each city has its own tooth and its own challenge. Win a dive, or earn Stamps with 2-Min Brush, to unlock the next one.",
            controls: [.touch: pickACity, .mouse: pickACity, .keys: pickACity, .pad: pickACity]
        ),
        TutorialPage(
            id: .ready,
            title: "You’re ready",
            body: "You can’t lose a tooth, so take your time. Not into the games? The brush, floss and rinse timer is fun on its own.",
            controls: [.touch: findAgain, .mouse: findAgain, .keys: findAgain, .pad: findAgain]
        )
    ]

    public static func pageIndex(of id: TutorialPageId) -> Int {
        pages.firstIndex { $0.id == id } ?? 0
    }

    /// Control hints for one card. Unknown schemes fall back to touch, so a card is never blank by mistake.
    public static func controls(for page: TutorialPage, scheme: TutorialInputScheme) -> [TutorialControlHint] {
        page.controls[scheme] ?? page.controls[.touch] ?? []
    }

    /// A controller in use wins; otherwise fingers on a touch screen, keys on a desktop.
    public static func pickInputScheme(coarsePointer: Bool, gamepadConnected: Bool) -> TutorialInputScheme {
        if gamepadConnected { return .pad }
        return coarsePointer ? .touch : .keys
    }
}

// MARK: - When to offer it

public struct TutorialProgress: Equatable, Sendable {
    /// Launches on which the offer has been shown.
    public var offers: Int
    /// True once the player has opened the guide, from the offer or the ? button.
    public var opened: Bool

    public init(offers: Int = 0, opened: Bool = false) {
        self.offers = max(0, min(TutorialGuide.maxOffers, offers))
        self.opened = opened
    }

    public var shouldOffer: Bool {
        !opened && offers < TutorialGuide.maxOffers
    }

    public func afterOffer() -> TutorialProgress {
        TutorialProgress(offers: offers + 1, opened: opened)
    }

    public func afterOpening() -> TutorialProgress {
        TutorialProgress(offers: offers, opened: true)
    }
}

/// Decides, for one launch of the app, whether the Home screen shows the offer.
/// The offer counts once per launch, and goes away for that launch as soon as the player answers
/// it or starts a game. Mirrors `TutorialGate` in the web edition.
public struct TutorialGate: Equatable, Sendable {
    public private(set) var progress: TutorialProgress
    public private(set) var isOfferVisible: Bool = false
    private var countedThisLaunch: Bool = false

    public init(progress: TutorialProgress = TutorialProgress()) {
        self.progress = progress
    }

    /// Call each time the Home screen appears. Returns true when `progress` changed and needs saving.
    @discardableResult
    public mutating func enterHome() -> Bool {
        guard !countedThisLaunch else { return false }
        countedThisLaunch = true
        guard progress.shouldOffer else { return false }
        isOfferVisible = true
        progress = progress.afterOffer()
        return true
    }

    public mutating func dismissOffer() {
        isOfferVisible = false
    }

    /// The player opened the guide: never offer it again. Returns true when `progress` needs saving.
    @discardableResult
    public mutating func markOpened() -> Bool {
        isOfferVisible = false
        guard !progress.opened else { return false }
        progress = progress.afterOpening()
        return true
    }
}

// MARK: - Demo animation timing

/// Small pure helpers that turn "how far through the loop are we" into positions and fades.
/// The guide's demos are drawn from these, so they are the same every time and easy to test.
public enum TutorialMotion {
    /// Where a looping demo is in its cycle, from 0 up to (not including) 1.
    public static func loopPhase(elapsedSec: Double, periodSec: Double) -> Double {
        guard periodSec > 0, elapsedSec.isFinite else { return 0 }
        let p = (elapsedSec / periodSec).truncatingRemainder(dividingBy: 1)
        return p < 0 ? p + 1 : p
    }

    /// 0 before `start`, 1 after `end`, a straight line between.
    public static func ramp(_ p: Double, _ start: Double, _ end: Double) -> Double {
        guard end > start else { return p >= end ? 1 : 0 }
        return min(1, max(0, (p - start) / (end - start)))
    }

    /// Gentle start and stop for a 0...1 value.
    public static func ease(_ x: Double) -> Double {
        let c = min(1, max(0, x))
        return c * c * (3 - 2 * c)
    }

    /// Rises 0 to 1 between `inStart` and `inEnd`, holds, then falls back to 0 between `outStart` and `outEnd`.
    public static func window(
        _ p: Double,
        _ inStart: Double,
        _ inEnd: Double,
        _ outStart: Double,
        _ outEnd: Double
    ) -> Double {
        min(ramp(p, inStart, inEnd), 1 - ramp(p, outStart, outEnd))
    }

    /// A soft 0 to 1 to 0 pulse, once per whole number of `x`.
    public static func twinkle(_ x: Double) -> Double {
        0.5 - 0.5 * cos(2 * Double.pi * x)
    }

    /// One timed stop on a path: at loop phase `at`, be at (`x`, `y`).
    public struct Stop: Equatable, Sendable {
        public let at: Double
        public let x: Double
        public let y: Double

        public init(at: Double, x: Double, y: Double) {
            self.at = at
            self.x = x
            self.y = y
        }
    }

    /// Position along a list of stops (in rising `at` order), easing between neighbours.
    public static func along(_ p: Double, stops: [Stop]) -> (x: Double, y: Double) {
        guard let first = stops.first, let last = stops.last else { return (0, 0) }
        if p <= first.at { return (first.x, first.y) }
        if p >= last.at { return (last.x, last.y) }
        for i in 1..<stops.count {
            let a = stops[i - 1]
            let b = stops[i]
            if p <= b.at {
                let k = ease(ramp(p, a.at, b.at))
                return (a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k)
            }
        }
        return (last.x, last.y)
    }
}
