import MouthLifeCore
import SceneKit
import SwiftUI

#if canImport(UIKit)
import UIKit

public struct MouthLife3DViewport: UIViewRepresentable {
    public let controller: MouthLifeSceneController
    /// True while something covers the whole screen (a finale): the game's scene stops drawing.
    public var paused: Bool
    /// The picture quality in use. A value of this view, so a change of quality updates the view.
    public var quality: QualityTier

    public init(controller: MouthLifeSceneController, paused: Bool = false, quality: QualityTier = .ultra) {
        self.controller = controller
        self.paused = paused
        self.quality = quality
    }

    public func makeUIView(context: Context) -> InteractiveMetalSCNView {
        let scnView = InteractiveMetalSCNView(
            frame: .zero,
            options: [SCNView.Option.preferredRenderingAPI.rawValue: SCNRenderingAPI.metal.rawValue]
        )
        scnView.controller = controller
        scnView.scene = controller.scene
        scnView.pointOfView = controller.cameraNode
        scnView.delegate = controller
        scnView.preferredFramesPerSecond = 120
        scnView.rendersContinuously = true
        scnView.isPlaying = true
        scnView.antialiasingMode = .multisampling4X
        scnView.backgroundColor = UIColor(red: 0.016, green: 0.063, blue: 0.110, alpha: 1.0)
        scnView.isMultipleTouchEnabled = true
        return scnView
    }

    public func updateUIView(_ uiView: InteractiveMetalSCNView, context: Context) {
        // SwiftUI calls this on every update of the screen around it. Each value is written only
        // when it really changes: setting the anti-aliasing rebuilds the view's render targets.
        if uiView.preferredFramesPerSecond != 120 { uiView.preferredFramesPerSecond = 120 }
        if uiView.isPlaying == paused { uiView.isPlaying = !paused }
        if uiView.rendersContinuously == paused { uiView.rendersContinuously = !paused }
        let antialiasing: SCNAntialiasingMode
        switch quality {
        case .ultra, .medium:
            antialiasing = .multisampling4X
        case .low:
            antialiasing = .multisampling2X
        }
        if uiView.antialiasingMode != antialiasing { uiView.antialiasingMode = antialiasing }
        if uiView.finaleShowing != paused { uiView.finaleShowing = paused }
    }
}

public final class InteractiveMetalSCNView: SCNView {
    public weak var controller: MouthLifeSceneController?
    private var lastTouchPoint: CGPoint = .zero
    /// The one finger that drives the scene (the rule and its tests: `ScenePointerOwner`; web twin:
    /// the steering pointer in `InputManager`). Other fingers are ignored, so lifting a second
    /// finger never lets go of a held scrub. Only the finger's identity is kept, never the
    /// system's touch object: each new touch asks the system which fingers are on the screen now.
    private var owner = ScenePointerOwner()
    /// For the test diary: when the owner landed, and the input epoch for which a touch kept out
    /// was last noted. The epoch moves on with each stage, pause and finale, so the line is written
    /// at most once for each of those, however many second fingers land during play.
    private var ownerSinceUptime: TimeInterval = 0
    private var refusalNotedEpoch: Int?
    /// A finale covers the scene: a finger still down on it lets go.
    var finaleShowing = false {
        didSet { if finaleShowing && !oldValue { letGo() } }
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        controller?.updateViewportSize(bounds.size)
    }

    public override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        let center = NotificationCenter.default
        center.removeObserver(self, name: UIApplication.willResignActiveNotification, object: nil)
        if newWindow != nil {
            center.addObserver(self, selector: #selector(appWillResignActive), name: UIApplication.willResignActiveNotification, object: nil)
        } else {
            letGo()
        }
    }

    @objc private func appWillResignActive() {
        letGo()
    }

    /// Drops the owning finger and tells the scene it lifted. Called when the app stops being
    /// active, when the view leaves its window and when a finale covers it: after none of those is
    /// the system sure to say "ended" or "cancelled" for a finger that was down. A finger still
    /// down afterwards does nothing more; the scene waits for a new touch.
    private func letGo() {
        guard owner.releaseAll() else { return }
        controller?.handlePointerUp()
    }

    /// A touch's identity for as long as it is down (the system uses the object again afterwards).
    private static func key(_ touch: UITouch) -> Int {
        Int(bitPattern: ObjectIdentifier(touch))
    }

    public override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        // Under a finale the scene takes no touch at all (as on the Mac).
        guard !finaleShowing, let touch = touches.first else { return }
        // Every finger the system says is on the screen now. With no event to ask, nobody is known
        // to be down and the new touch counts.
        var live = Set<Int>()
        for other in event?.allTouches ?? [] where other.phase != .ended && other.phase != .cancelled {
            live.insert(Self.key(other))
        }
        // A second finger neither takes over nor double-taps while the first is really down.
        guard owner.began(Self.key(touch), liveKeys: live, epoch: controller?.pointerEpoch ?? 0) else {
            noteRefusedTouch(event)
            return
        }
        ownerSinceUptime = ProcessInfo.processInfo.systemUptime
        let pt = touch.location(in: self)
        lastTouchPoint = pt
        controller?.handlePointerDown(at: pt, in: self)
    }

    public override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let controller else { return }
        let epoch = controller.pointerEpoch
        guard let touch = touches.first(where: { owner.drives(Self.key($0), epoch: epoch) }) else { return }
        let pt = touch.location(in: self)
        let delta = CGSize(width: pt.x - lastTouchPoint.x, height: pt.y - lastTouchPoint.y)
        lastTouchPoint = pt
        controller.handlePointerMove(at: pt, delta: delta, in: self)
    }

    public override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        releaseOwner(ifAmong: touches)
    }

    public override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        releaseOwner(ifAmong: touches)
    }

    private func releaseOwner(ifAmong touches: Set<UITouch>) {
        guard owner.ended(Set(touches.map(Self.key))) else { return }
        controller?.handlePointerUp()
    }

    /// One diary line per stage (per input epoch): a new touch was kept out because another finger
    /// is held. It says what the system reports of that finger and how long it has been down, which
    /// tells a second finger at play from a finger that left without the view being told.
    private func noteRefusedTouch(_ event: UIEvent?) {
        let epoch = controller?.pointerEpoch ?? 0
        guard refusalNotedEpoch != epoch else { return }
        refusalNotedEpoch = epoch
        crumb(refusedTouchLine(event))
    }

    private func refusedTouchLine(_ event: UIEvent?) -> String {
        let all = event?.allTouches ?? []
        let held = all.first { Self.key($0) == owner.key }
        let heldSec = ProcessInfo.processInfo.systemUptime - ownerSinceUptime
        return "touch on the 3D view refused: another finger is held (\(Self.phaseName(held?.phase)), down for \(String(format: "%.1f", heldSec)) s, \(all.count) on the screen)"
    }

    private static func phaseName(_ phase: UITouch.Phase?) -> String {
        guard let phase else { return "gone" }
        switch phase {
        case .began: return "began"
        case .moved: return "moving"
        case .stationary: return "resting"
        case .ended: return "ended"
        case .cancelled: return "cancelled"
        default: return "other"
        }
    }
}

#elseif canImport(AppKit)
import AppKit

public struct MouthLife3DViewport: NSViewRepresentable {
    public let controller: MouthLifeSceneController
    /// True while something covers the whole screen (a finale): the game's scene stops drawing.
    public var paused: Bool
    /// The picture quality in use. A value of this view, so a change of quality updates the view.
    public var quality: QualityTier

    public init(controller: MouthLifeSceneController, paused: Bool = false, quality: QualityTier = .ultra) {
        self.controller = controller
        self.paused = paused
        self.quality = quality
    }

    public func makeNSView(context: Context) -> InteractiveMetalSCNView {
        let scnView = InteractiveMetalSCNView(
            frame: .zero,
            options: [SCNView.Option.preferredRenderingAPI.rawValue: SCNRenderingAPI.metal.rawValue]
        )
        scnView.controller = controller
        scnView.scene = controller.scene
        scnView.pointOfView = controller.cameraNode
        scnView.delegate = controller
        scnView.preferredFramesPerSecond = 120
        scnView.rendersContinuously = true
        scnView.isPlaying = true
        scnView.antialiasingMode = .multisampling4X
        scnView.backgroundColor = NSColor(srgbRed: 0.016, green: 0.063, blue: 0.110, alpha: 1.0)
        return scnView
    }

    public func updateNSView(_ nsView: InteractiveMetalSCNView, context: Context) {
        nsView.preferredFramesPerSecond = 120
        nsView.isPlaying = !paused
        nsView.rendersContinuously = !paused
        nsView.finaleShowing = paused
    }
}

public final class InteractiveMetalSCNView: SCNView {
    public weak var controller: MouthLifeSceneController?
    private var lastMousePt: CGPoint = .zero
    /// A finale covers the stage (the mode is still the stage's): clicks must not reach the game,
    /// and a button held when it starts lets go.
    var finaleShowing = false {
        didSet { if finaleShowing && !oldValue { letGoOfMouse() } }
    }
    /// The left button went down on the scene; drags drive it only while held and only until the
    /// controller lets go of held input (`pointerEpoch`), as a finger does on iOS.
    private var mouseHeld = false
    private var mouseEpoch: Int = 0
    private var releaseWatch: NSTrackingArea?

    public override func layout() {
        super.layout()
        controller?.updateViewportSize(bounds.size)
    }

    public override func viewWillMove(toWindow newWindow: NSWindow?) {
        super.viewWillMove(toWindow: newWindow)
        let center = NotificationCenter.default
        center.removeObserver(self, name: NSApplication.didResignActiveNotification, object: nil)
        center.removeObserver(self, name: NSWindow.didResignKeyNotification, object: nil)
        if let newWindow {
            center.addObserver(self, selector: #selector(lostTheMouse), name: NSApplication.didResignActiveNotification, object: nil)
            center.addObserver(self, selector: #selector(lostTheMouse), name: NSWindow.didResignKeyNotification, object: newWindow)
        } else {
            letGoOfMouse()
        }
    }

    @objc private func lostTheMouse() {
        letGoOfMouse()
    }

    /// Forgets a held button and tells the scene it was released. A button let go of over another
    /// app or window, or under a finale, never reaches `mouseUp` here; without this the brush
    /// went on scrubbing until the next click.
    private func letGoOfMouse() {
        guard mouseHeld else { return }
        mouseHeld = false
        controller?.handlePointerUp()
    }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        guard releaseWatch == nil else { return }
        // Pointer moves over the scene are watched for one thing only: see `mouseMoved`.
        let watch = NSTrackingArea(rect: .zero, options: [.mouseMoved, .activeInKeyWindow, .inVisibleRect], owner: self, userInfo: nil)
        addTrackingArea(watch)
        releaseWatch = watch
    }

    /// The pointer moves over the scene with no button down, yet one is still thought held: it was
    /// let go of where this view was not told (Mission Control took the drag, say), and neither
    /// the app nor the window lost its place. Let go now.
    public override func mouseMoved(with event: NSEvent) {
        if mouseHeld, NSEvent.pressedMouseButtons & 1 == 0 { letGoOfMouse() }
        super.mouseMoved(with: event)
    }

    public override func mouseDown(with event: NSEvent) {
        if finaleShowing { return }
        mouseHeld = true
        mouseEpoch = controller?.pointerEpoch ?? 0
        let loc = convert(event.locationInWindow, from: nil)
        let pt = CGPoint(x: loc.x, y: bounds.height - loc.y)
        lastMousePt = pt
        controller?.handlePointerDown(at: pt, in: self)
    }

    public override func mouseDragged(with event: NSEvent) {
        guard mouseHeld, let controller, controller.pointerEpoch == mouseEpoch else { return }
        let loc = convert(event.locationInWindow, from: nil)
        let pt = CGPoint(x: loc.x, y: bounds.height - loc.y)
        let delta = CGSize(width: pt.x - lastMousePt.x, height: pt.y - lastMousePt.y)
        lastMousePt = pt
        controller.handlePointerMove(at: pt, delta: delta, in: self)
    }

    public override func mouseUp(with event: NSEvent) {
        guard mouseHeld else { return }
        mouseHeld = false
        controller?.handlePointerUp()
    }

    /// Right-click flosses toward the pointer in a stage, as How to Play teaches ("E or right-click")
    /// and as on the web. Not while paused or while a finale plays.
    public override func rightMouseDown(with event: NSEvent) {
        guard let controller,
              controller.appMode == .arcade || controller.appMode == .pulpRescue,
              !controller.arcadePaused, !finaleShowing else {
            super.rightMouseDown(with: event)
            return
        }
        let loc = convert(event.locationInWindow, from: nil)
        controller.requestFlossToward(CGPoint(x: loc.x, y: bounds.height - loc.y), in: self)
    }
}
#endif
