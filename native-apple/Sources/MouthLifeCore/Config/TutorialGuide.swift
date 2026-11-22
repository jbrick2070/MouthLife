import Foundation

// The How to Play guide: twelve short cards, one idea each, illustrated with real pictures of the
// game (`src/assets/guide/`, photographed from the running game and bundled as the `guide` folder).
//
// Shared word for word with the web edition (`src/config/tutorial.ts`), so both editions teach the
// same thing and use the same translations. Change them together.

public enum TutorialPageId: String, CaseIterable, Identifiable, Sendable {
    case home
    case brush
    case dive
    case cleaner
    case buttons
    case floss
    case surge
    case scan
    case enemies
    case helpers
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

/// One line of a field-guide card: a real close-up, its name, and what to do about it.
public struct TutorialRow: Equatable, Identifiable, Sendable {
    /// Picture name in the bundled `guide` folder (no extension).
    public let image: String
    public let name: String
    public let tip: String

    public var id: String { image }

    public init(image: String, name: String, tip: String) {
        self.image = image
        self.name = name
        self.tip = tip
    }
}

/// The on-screen controls a dive uses.
public enum TutorialButtonAction: String, CaseIterable, Sendable {
    case move
    case floss
    case surge
    case scan
    case pause
}

public struct TutorialButtonRow: Equatable, Identifiable, Sendable {
    public let action: TutorialButtonAction
    public let name: String
    public let tip: String

    public var id: String { action.rawValue }

    public init(action: TutorialButtonAction, name: String, tip: String) {
        self.action = action
        self.name = name
        self.tip = tip
    }
}

public struct TutorialPage: Equatable, Identifiable, Sendable {
    public let id: TutorialPageId
    public let title: String
    public let body: String
    public let controls: [TutorialInputScheme: [TutorialControlHint]]
    /// Real pictures shown one after another, like a flipbook. None = a drawn picture.
    public let frames: [String]
    /// Field-guide rows (Troublemakers, Helpers).
    public let rows: [TutorialRow]
    /// Control rows (Your controls). The picture for each depends on the device in use.
    public let buttonRows: [TutorialButtonRow]

    public init(
        id: TutorialPageId,
        title: String,
        body: String,
        controls: [TutorialInputScheme: [TutorialControlHint]],
        frames: [String] = [],
        rows: [TutorialRow] = [],
        buttonRows: [TutorialButtonRow] = []
    ) {
        self.id = id
        self.title = title
        self.body = body
        self.controls = controls
        self.frames = frames
        self.rows = rows
        self.buttonRows = buttonRows
    }

    /// True for the cards that are a list (field guides, controls) rather than one big picture.
    public var isList: Bool {
        !rows.isEmpty || !buttonRows.isEmpty
    }
}

public enum TutorialGuide {
    /// The Home screen offers the guide on this many launches, then leaves it to the ? button.
    public static let maxOffers = 3

    /// Raise this to offer the guide again to everyone, players who already saw or opened it
    /// included. 2 (November 2026): the owner wanted the guide back in front of players. Web twin:
    /// `TUTORIAL_EDITION`.
    public static let edition = 2

    /// Progress saved under an earlier edition starts over, so the new one is offered again.
    public static func progress(offers: Int, opened: Bool, savedEdition: Int) -> TutorialProgress {
        // an edition never written means the first one
        let saved = savedEdition > 0 ? savedEdition : 1
        return saved < edition ? TutorialProgress() : TutorialProgress(offers: offers, opened: opened)
    }

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

    private static func all(_ hints: [TutorialControlHint]) -> [TutorialInputScheme: [TutorialControlHint]] {
        [.touch: hints, .mouse: hints, .keys: hints, .pad: hints]
    }

    private static let rubAndTurn: [TutorialControlHint] = [
        TutorialControlHint(label: "Rub the teeth"),
        TutorialControlHint(label: "Drag beside them to turn")
    ]
    private static let handsFree: [TutorialControlHint] = [
        TutorialControlHint(label: "Hands-free: just follow along"),
        TutorialControlHint(label: "Any toothbrush works, electric too")
    ]
    private static let dragOnTooth: [TutorialControlHint] = [
        TutorialControlHint(label: "Drag on the tooth")
    ]
    private static let goldGlow: [TutorialControlHint] = [
        TutorialControlHint(label: "It glows gold when Surge is ready")
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
            controls: all(rubAndTurn),
            frames: ["home"]
        ),
        TutorialPage(
            id: .brush,
            title: "2-Min Brush",
            body: "Brush your real teeth where the glow shows. A chime means move on. Floss and rinse come next.",
            controls: all(handsFree),
            frames: ["brush-1", "brush-2"]
        ),
        TutorialPage(
            id: .dive,
            title: "Dive",
            body: "Steer the tiny ship over a giant tooth and scrub off the plaque. Clean 90% to win.",
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
            ],
            frames: ["dive-1", "dive-2", "dive-3"]
        ),
        TutorialPage(
            id: .cleaner,
            title: "Meet HYDRA-1",
            body: "Your tooth-cleaning ship. The brush on its nose scrubs, and its spools shoot floss through tight gaps.",
            controls: all(goldGlow),
            frames: ["cleaner"]
        ),
        TutorialPage(
            id: .buttons,
            title: "Your controls",
            body: "Four tools clean every tooth.",
            controls: [:],
            buttonRows: [
                TutorialButtonRow(action: .move, name: "Move and scrub", tip: "Steer the ship over the plaque."),
                TutorialButtonRow(action: .floss, name: "Floss", tip: "Shoots thread through tight gaps."),
                TutorialButtonRow(action: .surge, name: "Surge", tip: "A big wave. It fills as you scrub."),
                TutorialButtonRow(action: .scan, name: "Dye Scan", tip: "Shows the plaque you missed."),
                TutorialButtonRow(action: .pause, name: "Pause", tip: "Take a break any time.")
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
            ],
            frames: ["floss-1", "floss-2", "floss-3"]
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
            ],
            frames: ["surge-1", "surge-2", "surge-3"]
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
            ],
            frames: ["scan-1", "scan-2"]
        ),
        TutorialPage(
            id: .enemies,
            title: "Troublemakers",
            body: "Know them when you see them.",
            controls: [:],
            rows: [
                TutorialRow(image: "t-plaque", name: "Plaque", tip: "Sticky yellow film. Scrub it off."),
                TutorialRow(image: "t-sugar", name: "Sugar crystal", tip: "It makes slimes. Floss shatters it."),
                TutorialRow(image: "t-slime", name: "Slime", tip: "Leaves plaque and acid. Scrub or floss it."),
                TutorialRow(image: "t-acid", name: "Acid puddle", tip: "Slows you down. Surge washes it away."),
                TutorialRow(image: "t-dome", name: "Slime dome", tip: "Blocks the brush. Crack it with Floss or Surge.")
            ]
        ),
        TutorialPage(
            id: .helpers,
            title: "Helpers",
            body: "Good things to look for.",
            controls: [:],
            rows: [
                TutorialRow(image: "t-helper-asleep", name: "Sleeping helper germs", tip: "Clean around them to wake them."),
                TutorialRow(image: "t-helper-awake", name: "Awake helper germs", tip: "Wake them all to seal the zone."),
                TutorialRow(image: "t-seal", name: "Gold seal", tip: "A gold edge means the zone is sealed."),
                TutorialRow(image: "t-spring", name: "Saliva spring", tip: "Drive through it to wash acid away."),
                TutorialRow(image: "t-beacon", name: "Supply beacon", tip: "Grab it for a Surge boost.")
            ]
        ),
        TutorialPage(
            id: .cities,
            title: "New cities",
            body: "Each city has its own tooth and its own challenge. Win a dive, or earn Stamps with 2-Min Brush, to unlock the next one.",
            controls: all(pickACity),
            frames: ["cities"]
        ),
        TutorialPage(
            id: .ready,
            title: "You’re ready",
            body: "You can’t lose a tooth, so take your time. Not into the games? The brush, floss and rinse timer is fun on its own.",
            controls: all(findAgain)
        )
    ]

    /// The key or controller button for each dive control. Touch and mouse players get a picture of
    /// the real on-screen button instead.
    public static func buttonKeys(for action: TutorialButtonAction, scheme: TutorialInputScheme) -> [String] {
        switch scheme {
        case .keys:
            switch action {
            case .move: return ["W", "A", "S", "D", "Space"]
            case .floss: return ["E"]
            case .surge: return ["Q"]
            case .scan: return ["R"]
            case .pause: return ["Esc"]
            }
        case .pad:
            switch action {
            case .move: return ["L-Stick", "A"]
            case .floss: return ["X"]
            case .surge: return ["Y"]
            case .scan: return ["B"]
            case .pause: return ["Start"]
            }
        case .touch, .mouse:
            return []
        }
    }

    /// Every picture the guide uses, so a test can check the list against the web edition.
    public static var imageNames: [String] {
        var seen: [String] = []
        for page in pages {
            for name in page.frames + page.rows.map(\.image) where !seen.contains(name) {
                seen.append(name)
            }
        }
        return seen
    }

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

    /// Which picture of a flipbook to show at a given moment, and how visible each one is.
    /// Each picture holds for `holdSec`, then fades into the next over `fadeSec`.
    public static func flipbookOpacities(
        count: Int,
        elapsedSec: Double,
        holdSec: Double = 1.6,
        fadeSec: Double = 0.35
    ) -> [Double] {
        guard count > 0 else { return [] }
        guard count > 1, holdSec > 0, elapsedSec.isFinite else {
            return [1] + Array(repeating: 0, count: max(0, count - 1))
        }
        let period = holdSec * Double(count)
        var t = elapsedSec.truncatingRemainder(dividingBy: period)
        if t < 0 { t += period }
        let index = min(count - 1, Int(t / holdSec))
        let into = t - Double(index) * holdSec
        let fade = min(max(0, fadeSec), holdSec)
        // The next picture fades in over the last `fade` seconds of this one.
        let blend = fade > 0 ? max(0, (into - (holdSec - fade)) / fade) : 0
        var out = Array(repeating: 0.0, count: count)
        out[index] = 1
        out[(index + 1) % count] = max(out[(index + 1) % count], blend)
        return out
    }

    /// With motion off, the picture that best shows the action: the middle of three, else the last.
    public static func stillFrameIndex(count: Int) -> Int {
        if count >= 3 { return 1 }
        return max(0, count - 1)
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

// MARK: - Drawing timing

/// Small pure helpers for the closing card's drawing (twinkles and a gentle pulse).
public enum TutorialMotion {
    /// Where a looping animation is in its cycle, from 0 up to (not including) 1.
    public static func loopPhase(elapsedSec: Double, periodSec: Double) -> Double {
        guard periodSec > 0, elapsedSec.isFinite else { return 0 }
        let p = (elapsedSec / periodSec).truncatingRemainder(dividingBy: 1)
        return p < 0 ? p + 1 : p
    }

    /// A soft 0 to 1 to 0 pulse, once per whole number of `x`.
    public static func twinkle(_ x: Double) -> Double {
        0.5 - 0.5 * cos(2 * Double.pi * x)
    }
}
