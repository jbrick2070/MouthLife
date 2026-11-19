import MouthLifeCore
@testable import MouthLifeWatchUI
import SwiftUI
import XCTest

/// Renders the Apple Watch faces on a Mac (there is no watch simulator on the build machine), so
/// each face can be looked at. Pictures go to $WATCH_RENDER_DIR when it is set; otherwise the
/// faces are only drawn, which still catches layouts that fail to build or lay out.
@MainActor
final class WatchFaceRenderTests: XCTestCase {
    /// 40 mm, 41 mm and 49 mm watches, in points.
    static let sizes: [(String, CGSize)] = [
        ("40mm", CGSize(width: 162, height: 197)), ("41mm", CGSize(width: 176, height: 215)), ("49mm", CGSize(width: 205, height: 251)),
    ]

    func ritual(at t: Double, includeRinse: Bool = false, nextTaps: Int = 0) -> WatchRitual {
        var r = WatchRitual(sessionId: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!, startedAt: Date(timeIntervalSince1970: 0), includeRinse: includeRinse)
        for _ in 0..<nextTaps { _ = r.next(now: Date(timeIntervalSince1970: 0)) }
        var left = t
        while left > 0 {
            let step = min(0.25, left)
            _ = r.advance(by: step, now: Date(timeIntervalSince1970: 0))
            left -= step
        }
        return r
    }

    func render<V: View>(_ name: String, size: CGSize, _ view: V) throws {
        let framed = view
            .frame(width: size.width, height: size.height)
            .background(WatchLook.background)
            .environment(\.colorScheme, .dark)
        let renderer = ImageRenderer(content: framed)
        renderer.scale = 2
        guard let image = renderer.cgImage else {
            XCTFail("could not render \(name)")
            return
        }
        XCTAssertEqual(image.width, Int(size.width * 2))
        guard let dir = ProcessInfo.processInfo.environment["WATCH_RENDER_DIR"] else { return }
        let url = URL(fileURLWithPath: dir).appendingPathComponent("\(name).png")
        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else { return }
        CGImageDestinationAddImage(dest, image, nil)
        CGImageDestinationFinalize(dest)
    }

    func testEveryFaceRendersAtBothSizes() throws {
        for (label, size) in Self.sizes {
            try render("ready-\(label)", size: size, WatchReadyFace(state: WatchFaceState(), onStart: {}, onResume: {}))
            try render("ready-rinse-resume-\(label)", size: size, WatchReadyFace(state: WatchFaceState(includeRinse: true, canResume: true), onStart: {}, onResume: {}))
            // close on the quarter (the 3-2-1 sits inside the arch), then pulled back for the next one
            for (t, tag) in [(4.0, "outside"), (8.5, "close-countdown"), (14.0, "chewing"), (27.5, "countdown"), (44.0, "q2-chewing"), (54.0, "q2-inside")] {
                try render("brush-\(tag)-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: t)), onMore: {}))
            }
            try render("brush-dimmed-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 64), dimmed: true), onMore: {}))
            try render("brush-chewing-dimmed-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 104), dimmed: true), onMore: {}))
            try render("brush-outside-q3-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 61.5)), onMore: {}))
            try render("floss-dimmed-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 128), dimmed: true), onMore: {}))
            try render("controls-brushing-\(label)", size: size, WatchControlsFace(state: WatchFaceState(ritual: ritual(at: 40)), armed: nil, onPause: {}, onNext: {}, onSkip: {}, onEnd: {}, onClose: {}, scrollable: false))
            try render("floss-top-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 128)), onMore: {}))
            try render("floss-bottom-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 150)), onMore: {}))
            try render("rinse-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 190, includeRinse: true)), onMore: {}))
            try render("controls-\(label)", size: size, WatchControlsFace(state: WatchFaceState(ritual: ritual(at: 128)), armed: "next", onPause: {}, onNext: {}, onSkip: {}, onEnd: {}, onClose: {}, scrollable: false))
            var done = ritual(at: 0)
            _ = done.end(now: Date(timeIntervalSince1970: 0))
            try render("done-goodtry-\(label)", size: size, WatchDoneFace(state: WatchFaceState(ritual: done, syncPending: true), onClose: {}))
            let full = ritual(at: 170)
            try render("done-full-\(label)", size: size, WatchDoneFace(state: WatchFaceState(ritual: full, ack: WatchBrushAck(sessionId: "x", ionsAwarded: 100, stampAwarded: true, fullReward: true)), onClose: {}))
        }
        // the longest words, at the smallest size
        for lang in [CoachLanguage.german, .japanese, .french] {
            let size = Self.sizes[0].1
            try render("brush-\(lang.rawValue)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 24), language: lang), onMore: {}))
            try render("floss-\(lang.rawValue)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 128), language: lang), onMore: {}))
            var early = ritual(at: 0)
            _ = early.end(now: Date(timeIntervalSince1970: 0))
            try render("done-\(lang.rawValue)", size: size, WatchDoneFace(state: WatchFaceState(ritual: early, language: lang, syncPending: true), onClose: {}))
        }
    }
}
