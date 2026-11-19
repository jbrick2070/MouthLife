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
            // close on the quarter with the brush on each surface (no 3-2-1 before a surface change),
            // then pulled back for the next quarter with the 3-2-1 and a "here next" outline
            for (t, tag) in [(4.0, "outside"), (8.5, "outside-molar"), (16.0, "chewing"), (27.5, "countdown"), (44.0, "q2-chewing"), (54.0, "q2-inside")] {
                try render("brush-\(tag)-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: t)), onMore: {}))
            }
            try render("brush-dimmed-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 64), dimmed: true), onMore: {}))
            try render("brush-chewing-dimmed-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 104), dimmed: true), onMore: {}))
            try render("brush-outside-q3-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 61.5)), onMore: {}))
            try render("floss-dimmed-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 128), dimmed: true), onMore: {}))
            try render("controls-brushing-\(label)", size: size, WatchControlsFace(state: WatchFaceState(ritual: ritual(at: 40)), armed: nil, onPause: {}, onNext: {}, onSkip: {}, onEnd: {}, onClose: {}, scrollable: false))
            try render("floss-top-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 128)), onMore: {}))
            try render("floss-bottom-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 150)), onMore: {}))
            try render("rinse-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 175, includeRinse: true)), onMore: {}))
            try render("rinse-between-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 190, includeRinse: true)), onMore: {}))
            try render("rinse-dimmed-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 190, includeRinse: true), dimmed: true), onMore: {}))
            // each stage names itself as it starts
            try render("brush-start-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 0.5)), onMore: {}))
            try render("floss-start-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 121)), onMore: {}))
            try render("floss-start-dimmed-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 121), dimmed: true), onMore: {}))
            try render("rinse-start-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 166, includeRinse: true)), onMore: {}))
            var paused = ritual(at: 40)
            _ = paused.setPaused(true)
            try render("brush-paused-\(label)", size: size, WatchActiveFace(state: WatchFaceState(ritual: paused), onMore: {}))
            try render("controls-\(label)", size: size, WatchControlsFace(state: WatchFaceState(ritual: ritual(at: 128)), armed: "next", onPause: {}, onNext: {}, onSkip: {}, onEnd: {}, onClose: {}, scrollable: false))
            var done = ritual(at: 0)
            _ = done.end(now: Date(timeIntervalSince1970: 0))
            try render("done-goodtry-\(label)", size: size, WatchDoneFace(state: WatchFaceState(ritual: done, syncPending: true), onClose: {}))
            let full = ritual(at: 170)
            try render("done-full-\(label)", size: size, WatchDoneFace(state: WatchFaceState(ritual: full, ack: WatchBrushAck(sessionId: "x", ionsAwarded: 100, stampAwarded: true, fullReward: true)), onClose: {}))
        }
        // every language at the smallest size (the longest words: German, French, Japanese)
        for lang in CoachLanguage.allCases {
            let size = Self.sizes[0].1
            try render("rinse-between-\(lang.rawValue)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 190, includeRinse: true), language: lang), onMore: {}))
            var paused = ritual(at: 40)
            _ = paused.setPaused(true)
            try render("paused-\(lang.rawValue)", size: size, WatchActiveFace(state: WatchFaceState(ritual: paused, language: lang), onMore: {}))
            try render("brush-\(lang.rawValue)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 24), language: lang), onMore: {}))
            try render("floss-\(lang.rawValue)", size: size, WatchActiveFace(state: WatchFaceState(ritual: ritual(at: 128), language: lang), onMore: {}))
            var early = ritual(at: 0)
            _ = early.end(now: Date(timeIntervalSince1970: 0))
            try render("done-\(lang.rawValue)", size: size, WatchDoneFace(state: WatchFaceState(ritual: early, language: lang, syncPending: true), onClose: {}))
        }
    }

    /// The brush reaches every tooth, the back molar included, in every 10 s surface of the brush.
    func testTheBrushSweepsEveryToothInEverySurface() {
        for surface in 0..<12 {
            var seen = Set<Int>()
            for tenth in 0..<100 {
                let r = ritual(at: Double(surface) * 10 + Double(tenth) / 10 + 0.05)
                seen.insert(MouthPacer.tooth(atSurfaceSecond: r.phase.phaseElapsedSec))
            }
            XCTAssertEqual(seen, Set(0...6), "surface \(surface)")
        }
    }

    /// Floss goes gap by gap from the back right to the back left, as on the phone.
    func testFlossGapsRunFromBackRightToBackLeft() {
        XCTAssertEqual(MouthMap.contactIndex(gap: 5, right: true), 0)
        XCTAssertEqual(MouthMap.contactIndex(gap: 0, right: true), 5)
        XCTAssertEqual(MouthMap.contactIndex(gap: -1, right: true), 6)
        XCTAssertEqual(MouthMap.contactIndex(gap: 0, right: false), 7)
        XCTAssertEqual(MouthMap.contactIndex(gap: 5, right: false), 12)
    }

    /// The camera never leaves the mouth's frame, and does nothing at zoom 0.
    func testTheCameraStaysInsideTheMouth() {
        for (_, face) in Self.sizes {
            let size = CGSize(width: face.width, height: face.height * 0.54)
            for q in BrushQuadrant.allCases {
                XCTAssertEqual(MouthMap.camera(.quarter(q), zoom: 0, size: size), .identity)
                for zoom in [0.25, 0.5, 1.0] {
                    let t = MouthMap.camera(.quarter(q), zoom: zoom, size: size)
                    // the view's corners, taken back into the mouth's own drawing
                    let back = t.inverted()
                    for corner in [CGPoint.zero, CGPoint(x: size.width, y: size.height)] {
                        let p = corner.applying(back)
                        XCTAssertTrue(p.x.isFinite && p.y.isFinite)
                        XCTAssertGreaterThanOrEqual(p.x, -0.5, "\(q) \(zoom)")
                        XCTAssertLessThanOrEqual(p.x, size.width + 0.5, "\(q) \(zoom)")
                        XCTAssertGreaterThanOrEqual(p.y, -0.5, "\(q) \(zoom)")
                        XCTAssertLessThanOrEqual(p.y, size.height + 0.5, "\(q) \(zoom)")
                    }
                }
            }
        }
    }

    /// On screen, the floss pick's path runs from the back right (screen right, as in a mirror)
    /// across the front to the back left, on both arches.
    func testTheFlossPathRunsRightToLeftOnScreen() {
        let size = CGSize(width: 176, height: 116)
        let u = min(size.width, size.height * 1.15)
        for upper in [true, false] {
            let gaps = FlossPacer.gapsInOrder(upper: upper, size: size, unit: u)
            XCTAssertEqual(gaps.count, 13)
            let xs = gaps.map(\.outer.x)
            XCTAssertGreaterThan(xs[0], size.width * 0.8)
            XCTAssertLessThan(xs[12], size.width * 0.2)
            XCTAssertEqual(xs[6], size.width / 2, accuracy: 2)
            for i in 1..<13 { XCTAssertLessThan(xs[i], xs[i - 1]) }
        }
    }
}
