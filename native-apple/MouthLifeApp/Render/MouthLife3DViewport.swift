import SceneKit
import SwiftUI

#if canImport(UIKit)
import UIKit

public struct MouthLife3DViewport: UIViewRepresentable {
    public let controller: MouthLifeSceneController
    /// True while something covers the whole screen (a finale): the game's scene stops drawing.
    public var paused: Bool

    public init(controller: MouthLifeSceneController, paused: Bool = false) {
        self.controller = controller
        self.paused = paused
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
        uiView.preferredFramesPerSecond = 120
        uiView.isPlaying = !paused
        uiView.rendersContinuously = !paused
        switch controller.qualityTier {
        case .ultra, .medium:
            uiView.antialiasingMode = .multisampling4X
        case .low:
            uiView.antialiasingMode = .multisampling2X
        }
    }
}

public final class InteractiveMetalSCNView: SCNView {
    public weak var controller: MouthLifeSceneController?
    private var lastTouchPoint: CGPoint = .zero
    /// The one finger that drives the scene (web twin: the owning pointer id in `InputManager`).
    /// Other fingers are ignored, so lifting a second finger never lets go of a held scrub. Released
    /// when it lifts, or left behind when the controller lets go of held input (`pointerEpoch`).
    private var owningTouch: UITouch?
    private var owningTouchEpoch: Int = 0

    public override func layoutSubviews() {
        super.layoutSubviews()
        controller?.updateViewportSize(bounds.size)
    }

    /// True while the owning finger is still down and still belongs to the current screen.
    private func owningTouchIsLive() -> Bool {
        guard let owner = owningTouch else { return false }
        if owner.phase == .ended || owner.phase == .cancelled { return false }
        guard let controller else { return false }
        return controller.pointerEpoch == owningTouchEpoch
    }

    public override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        // A second finger neither takes over nor double-taps while the first is still down.
        if owningTouchIsLive() { return }
        guard let touch = touches.first else { return }
        owningTouch = touch
        owningTouchEpoch = controller?.pointerEpoch ?? 0
        let pt = touch.location(in: self)
        lastTouchPoint = pt
        controller?.handlePointerDown(at: pt, in: self)
    }

    public override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let owner = owningTouch, touches.contains(owner), owningTouchIsLive() else { return }
        let pt = owner.location(in: self)
        let delta = CGSize(width: pt.x - lastTouchPoint.x, height: pt.y - lastTouchPoint.y)
        lastTouchPoint = pt
        controller?.handlePointerMove(at: pt, delta: delta, in: self)
    }

    public override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        releaseOwningTouch(ifAmong: touches)
    }

    public override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        releaseOwningTouch(ifAmong: touches)
    }

    private func releaseOwningTouch(ifAmong touches: Set<UITouch>) {
        guard let owner = owningTouch, touches.contains(owner) else { return }
        owningTouch = nil
        controller?.handlePointerUp()
    }
}

#elseif canImport(AppKit)
import AppKit

public struct MouthLife3DViewport: NSViewRepresentable {
    public let controller: MouthLifeSceneController
    /// True while something covers the whole screen (a finale): the game's scene stops drawing.
    public var paused: Bool

    public init(controller: MouthLifeSceneController, paused: Bool = false) {
        self.controller = controller
        self.paused = paused
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
    /// A finale covers the stage (the mode is still the stage's): clicks must not reach the game.
    var finaleShowing = false
    /// The left button went down on the scene; drags drive it only while held and only until the
    /// controller lets go of held input (`pointerEpoch`), as a finger does on iOS.
    private var mouseHeld = false
    private var mouseEpoch: Int = 0

    public override func layout() {
        super.layout()
        controller?.updateViewportSize(bounds.size)
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
