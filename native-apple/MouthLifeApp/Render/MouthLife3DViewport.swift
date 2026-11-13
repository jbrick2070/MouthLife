import SceneKit
import SwiftUI

#if canImport(UIKit)
import UIKit

public struct MouthLife3DViewport: UIViewRepresentable {
    public let controller: MouthLifeSceneController

    public init(controller: MouthLifeSceneController) {
        self.controller = controller
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

    public override func layoutSubviews() {
        super.layoutSubviews()
        controller?.updateViewportSize(bounds.size)
    }

    public override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first else { return }
        let pt = touch.location(in: self)
        lastTouchPoint = pt
        controller?.handlePointerDown(at: pt, in: self)
    }

    public override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first else { return }
        let pt = touch.location(in: self)
        let delta = CGSize(width: pt.x - lastTouchPoint.x, height: pt.y - lastTouchPoint.y)
        lastTouchPoint = pt
        controller?.handlePointerMove(at: pt, delta: delta, in: self)
    }

    public override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        controller?.handlePointerUp()
    }

    public override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        controller?.handlePointerUp()
    }
}

#elseif canImport(AppKit)
import AppKit

public struct MouthLife3DViewport: NSViewRepresentable {
    public let controller: MouthLifeSceneController

    public init(controller: MouthLifeSceneController) {
        self.controller = controller
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
    }
}

public final class InteractiveMetalSCNView: SCNView {
    public weak var controller: MouthLifeSceneController?
    private var lastMousePt: CGPoint = .zero

    public override func layout() {
        super.layout()
        controller?.updateViewportSize(bounds.size)
    }

    public override func mouseDown(with event: NSEvent) {
        let loc = convert(event.locationInWindow, from: nil)
        let pt = CGPoint(x: loc.x, y: bounds.height - loc.y)
        lastMousePt = pt
        controller?.handlePointerDown(at: pt, in: self)
    }

    public override func mouseDragged(with event: NSEvent) {
        let loc = convert(event.locationInWindow, from: nil)
        let pt = CGPoint(x: loc.x, y: bounds.height - loc.y)
        let delta = CGSize(width: pt.x - lastMousePt.x, height: pt.y - lastMousePt.y)
        lastMousePt = pt
        controller?.handlePointerMove(at: pt, delta: delta, in: self)
    }

    public override func mouseUp(with event: NSEvent) {
        controller?.handlePointerUp()
    }
}
#endif
