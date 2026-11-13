import Foundation
import Metal
import MouthLifeCore
import SceneKit
import simd

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

public final class MouthLifeSceneController: NSObject, SCNSceneRendererDelegate {
    public let scene = SCNScene()
    public let cameraNode = SCNNode()
    public let camera = SCNCamera()

    // Separate Enamel Material Controllers so Companion Arch & Arcade Stage never contend
    public let companionEnamelController: EnamelMaterialController
    public let arcadeEnamelController: EnamelMaterialController

    public let cosmicNodes: CosmicBackdropNodes
    public let companionNodes: CompanionArchNodes
    public let probeRig: HydraProbeRig
    private let companionCrownAnchors: [TouchHit]

    private var activeStageNodes: CartridgeStageNodes?
    private var activeCartridgeId: String?
    private var cachedArcadeSnapshot: SessionSnapshot?
    private var cachedDistrictBoxes: [AABB2D] = []
    private var mutansPool: [Int: SCNNode] = [:]
    private var acidPoolNodes: [Int: SCNNode] = [:]
    private var liveMutansIds = Set<Int>(minimumCapacity: 16)
    private var livePoolIds = Set<Int>(minimumCapacity: 16)
    private var deadEntityIds: [Int] = []
    private var districtSealBirthSec: [Float] = [-1, -1, -1, -1]
    private var foamTrail: [FoamTrailSample] = []
    private var lastFoamSampleSec: Float = -10

    // Bound Simulation & Touch State
    public weak var activeSession: WorldSession?
    public let touchSystem = CompanionTouchSystem()

    // Camera & Mode State
    public private(set) var appMode: AppMode = .hub
    public var cosmicBeatIndex: Int = 0 {
        didSet {
            cosmicNodes.setCosmicIntroState(visible: appMode == .cosmicIntro, beatIndex: cosmicBeatIndex)
        }
    }
    public var reducedMotion: Bool = false
    public var qualityTier: QualityTier = .ultra {
        didSet {
            companionEnamelController.setQualityTier(qualityTier)
            arcadeEnamelController.setQualityTier(qualityTier)
        }
    }

    // Companion Sync State
    public var companionSmoothness: Double = 92.0
    public var companionAcidStress: Float = 0.0
    public var pacerElapsedSec: Double = 0.0
    public var pacerInFlossBonus: Bool = false
    public var pacerFlossToolStyle: FlossToolStyle = .flossPick
    public var highlightedCrownIndex: Int? {
        didSet {
            companionEnamelController.setHighlightedCrown(index: highlightedCrownIndex, pulse01: 1.0)
        }
    }

    // Input State (120Hz Direct Touch Steering + Thumbstick + Orbit)
    private var hubOrbitYaw: Float = 0.0
    private var hubOrbitPitch: Float = 0.34
    private var cosmicOrbitYaw: Float = 0.0
    private var brushOrbitOffsetYaw: Float = 0.0
    private var brushOrbitOffsetPitch: Float = 0.0
    private var brushUserDragging: Bool = false
    private var latestPacerCoachState: PacerCoachVisualState?
    private var hasRenderedFirstFrame: Bool = false
    private var directTouchWorldPos: Vec2?
    private var stickMoveX: Double = 0
    private var stickMoveZ: Double = 0
    private var stickScrubHeld: Bool = false
    private var pendingFlossFire: Bool = false
    private var pendingFlossAimPos: Vec2?
    private var pendingRinseFire: Bool = false
    private var pendingDiscloseFire: Bool = false
    private var lastTapTimeSec: Double?
    private var lastTapPt: CGPoint = .zero

    // 60Hz Fixed-Step Accumulator + 120Hz Sub-Frame Interpolation State
    private let fixedDt: Double = 1.0 / 60.0
    private var accumulator: Double = 0.0
    private var lastRenderTime: TimeInterval?
    private var sceneNowSec: Float = 0.0
    private var prevProbePos: Vec2 = Vec2(x: 8, z: 16)
    private var currProbePos: Vec2 = Vec2(x: 8, z: 16)
    private var prevProbeY: Double = 0.5
    private var currProbeY: Double = 0.5
    private var prevProbeFacing: Double = 0
    private var currProbeFacing: Double = 0
    private var prevMutansPos: [Int: Vec2] = [:]

    // Smooth Camera Interpolation Vectors
    private var camCurrentPos = SIMD3<Float>(32.0, 26.0, 42.0)
    private var camCurrentLookAt = SIMD3<Float>(32.0, 1.2, 16.0)
    private var viewportAspect: Float = 0.50 // Portrait default on iPhone

    // Rolling ProMotion Frame Rate Counter & 120Hz Smoothed Audio-Reactive Envelope
    private var fpsFrameCount: Int = 0
    private var fpsWindowStart: TimeInterval = 0
    public private(set) var measuredFps: Int = 120
    private var smoothedAudioBands = SIMD4<Float>.zero

    // Callbacks to Coordinator (invoked on MainActor)
    public var onSessionStepped: ((SessionSnapshot) -> Void)?
    public var onCompanionCrownRubbed: ((Int?, TouchFeedback) -> Void)?
    public var onCosmicMohsSelected: ((Int) -> Void)?
    public var onFpsUpdated: ((Int) -> Void)?

    public override init() {
        let device = MTLCreateSystemDefaultDevice()
        self.companionEnamelController = EnamelMaterialController(
            gridWidth: 64,
            gridHeight: 64,
            qualityTier: .ultra,
            device: device
        )
        self.arcadeEnamelController = EnamelMaterialController(
            gridWidth: 256,
            gridHeight: 128,
            qualityTier: .ultra,
            device: device
        )

        self.cosmicNodes = ProceduralMeshBuilder.buildCosmicBackdropNodes(
            cities: HostsAndHistory.hostCities
        )
        let builtCompanion = ProceduralMeshBuilder.buildCompanionArchSceneNodes(
            enamelMaterial: companionEnamelController.material
        )
        self.companionNodes = builtCompanion
        self.companionCrownAnchors = builtCompanion.crownFrames.map { frame in
            TouchHit(
                x: Double(frame.worldPosition.x),
                y: Double(frame.worldPosition.y + frame.halfHeight * 0.35),
                z: Double(frame.worldPosition.z),
                crownIndex: frame.index
            )
        }
        self.probeRig = ProceduralMeshBuilder.buildHydraProbe()

        super.init()

        setupSceneAndLighting()
    }

    private func setupSceneAndLighting() {
        scene.background.contents = RenderBridge.color(hex: 0x04101C)

        // Camera Configuration
        camera.fieldOfView = CGFloat(GameConfig.cameraBaseFovDeg)
        camera.zNear = GameConfig.cameraNear
        camera.zFar = GameConfig.cameraFar
        // Disable EDR/HDR nit overdrive so highlights stay silky-pearlescent on Apple XDR/HDR displays
        camera.wantsHDR = false
        cameraNode.camera = camera
        cameraNode.simdPosition = camCurrentPos
        scene.rootNode.addChildNode(cameraNode)
        scene.lightingEnvironment.intensity = 0.30

        // 3-Point Studio Lighting for Arcade Props (HYDRA-1, Sucrose Crystals, Mutans)
        let keyLightNode = SCNNode()
        let keyLight = SCNLight()
        keyLight.type = .directional
        keyLight.intensity = 540
        keyLight.color = RenderBridge.color(hex: 0xFFF7EB)
        keyLightNode.light = keyLight
        keyLightNode.simdEulerAngles = SIMD3<Float>(-0.92, 0.48, 0)
        scene.rootNode.addChildNode(keyLightNode)

        let rimLightNode = SCNNode()
        let rimLight = SCNLight()
        rimLight.type = .directional
        rimLight.intensity = 220
        rimLight.color = RenderBridge.color(hex: 0x38E3F0)
        rimLightNode.light = rimLight
        rimLightNode.simdEulerAngles = SIMD3<Float>(-0.45, -2.45, 0)
        scene.rootNode.addChildNode(rimLightNode)

        let fillLightNode = SCNNode()
        let fillLight = SCNLight()
        fillLight.type = .ambient
        fillLight.intensity = 120
        fillLight.color = RenderBridge.color(hex: 0x7EB8DC)
        fillLightNode.light = fillLight
        scene.rootNode.addChildNode(fillLightNode)

        // Mount Cosmic Backdrop, Companion Arch, and HYDRA-1 Probe
        scene.rootNode.addChildNode(cosmicNodes.rootNode)
        scene.rootNode.addChildNode(companionNodes.rootNode)
        scene.rootNode.addChildNode(probeRig.rootNode)
        scene.rootNode.addChildNode(probeRig.flossBeamNode)
        probeRig.rootNode.isHidden = true
        probeRig.flossBeamNode.isHidden = true

        // Initialize Companion Arch in glossy wet Smooth Bask mode with clear portrait/landscape visibility
        companionEnamelController.setHeadlamp(
            worldPos: SIMD3<Float>(32.0, 14.0, 44.0),
            weight: 0.16,
            depthStart: 54.0,
            depthDensity: 0.018
        )
        companionNodes.gingivaMaterial.setValue(
            NSValue(scnVector4: RenderBridge.scnVec4(54.0, 0.018, 0, 0)),
            forKey: "depthCueVec"
        )
        companionEnamelController.setCompanionOverride(
            active: true,
            smoothness01: 0.92,
            fluorideGlow01: 0.40,
            acidStress01: 0.0,
            activeQuadrant: -1
        )
    }

    // MARK: - Mode & Stage Management

    public func setMode(_ mode: AppMode, selectedCityId: String = "toronto") {
        let prevMode = appMode
        appMode = mode
        let inStage = (mode == .arcade || mode == .pulpRescue || mode == .report)
        let inCompanion = (mode == .hub || mode == .brushAlong)

        companionNodes.rootNode.isHidden = !inCompanion
        activeStageNodes?.rootNode.isHidden = !inStage
        probeRig.rootNode.isHidden = !inStage
        cosmicNodes.rootNode.isHidden = inStage
        if !inStage {
            probeRig.flossBeamNode.isHidden = true
            directTouchWorldPos = nil
        }

        cosmicNodes.setCosmicIntroState(visible: mode == .cosmicIntro, beatIndex: cosmicBeatIndex)
        if mode == .cosmicIntro {
            cosmicOrbitYaw = 0
            cosmicNodes.rootNode.simdPosition = SIMD3<Float>(
                Float(GameConfig.earthBackdropPos.x),
                Float(GameConfig.earthBackdropPos.y),
                Float(GameConfig.earthBackdropPos.z)
            )
            cosmicNodes.rootNode.simdScale = SIMD3<Float>(repeating: 1.0)
            cosmicNodes.enableGentleAutoSpin()
        } else if inCompanion {
            // Frame the glowing 3D Orbital Earth & city beacons calmly in deep space behind the 14-crown arch
            cosmicNodes.rootNode.simdPosition = SIMD3<Float>(32.0, 6.2, -44.0)
            cosmicNodes.rootNode.simdScale = SIMD3<Float>(repeating: 0.64)
            cosmicNodes.focusOnCity(selectedCityId)
            if mode == .hub {
                companionNodes.setHubModeLayout()
                companionEnamelController.setHighlightedCrown(index: highlightedCrownIndex, pulse01: 1.0)
            } else if mode == .brushAlong {
                brushOrbitOffsetYaw = 0
                brushOrbitOffsetPitch = 0
                brushUserDragging = false
                latestPacerCoachState = companionNodes.updatePacerCoaching(
                    elapsedSec: pacerElapsedSec,
                    inFlossBonus: pacerInFlossBonus,
                    flossToolStyle: pacerFlossToolStyle,
                    nowSec: sceneNowSec,
                    reducedMotion: reducedMotion
                )
            }
        }

        if !hasRenderedFirstFrame || prevMode != mode {
            snapCameraToTarget()
        }
    }

    public func mountStage(for session: WorldSession) {
        self.activeSession = session
        let cart = session.cartridge

        // Tear down old stage nodes
        activeStageNodes?.rootNode.removeFromParentNode()
        for (_, node) in mutansPool { node.removeFromParentNode() }
        for (_, node) in acidPoolNodes { node.removeFromParentNode() }
        mutansPool.removeAll()
        acidPoolNodes.removeAll()
        foamTrail.removeAll()
        districtSealBirthSec = [-1, -1, -1, -1]

        // Initial RGBA upload + stage mesh creation
        _ = session.grid.syncRgbaBuffer(bChannelMode: cart.bChannelMode, chemistry: session.chemistry)
        arcadeEnamelController.bindCartridge(
            cartridge: cart,
            rgbaBytes: session.grid.rgbaBuffer,
            gridWidth: session.grid.gridW,
            gridHeight: session.grid.gridH
        )

        let stage = ProceduralMeshBuilder.buildCartridgeStageNodes(
            cartridge: cart,
            enamelMaterial: arcadeEnamelController.material
        )
        scene.rootNode.addChildNode(stage.rootNode)
        self.activeStageNodes = stage
        self.activeCartridgeId = cart.id
        self.cachedDistrictBoxes = cart.districts.map(\.bounds)
        arcadeEnamelController.setDistrictSeals(boxes: cachedDistrictBoxes, sealAges: districtSealBirthSec)

        let snap = session.makeSnapshot()
        self.cachedArcadeSnapshot = snap
        prevProbePos = snap.probePos
        currProbePos = snap.probePos
        prevProbeY = snap.probeY
        currProbeY = snap.probeY
        prevProbeFacing = snap.probeFacingRad
        currProbeFacing = snap.probeFacingRad
        accumulator = 0
    }

    // MARK: - Queued Actuator Actions From SwiftUI HUD

    public func requestSmartFloss() {
        pendingFlossFire = true
        pendingFlossAimPos = nil
    }

    public func requestDirectionalFloss(dir: Vec2) {
        guard let session = activeSession else { return }
        pendingFlossFire = true
        pendingFlossAimPos = Vec2(
            x: session.probePos.x + dir.x * GameConfig.flossLength,
            z: session.probePos.z + dir.z * GameConfig.flossLength
        )
    }

    public func requestIonRinse() {
        pendingRinseFire = true
    }

    public func requestDiscloseScan() {
        pendingDiscloseFire = true
    }

    public func setVirtualStick(moveX: Double, moveZ: Double, held: Bool) {
        self.stickMoveX = moveX
        self.stickMoveZ = moveZ
        self.stickScrubHeld = held
    }

    public func spawnCompanionTreatSplats() {
        touchSystem.spawnTreatSplats(anchors: companionCrownAnchors, count: 3)
    }

    // MARK: - Direct Viewport Touch / Pointer Handling (120Hz Responsive)

    public func updateViewportSize(_ size: CGSize) {
        guard size.width > 1, size.height > 1 else { return }
        viewportAspect = Float(size.width / size.height)
        // Automatically widen vertical FOV in portrait on iPhone so the full 14-crown arch stays lushly framed
        let baseFov = Float(GameConfig.cameraBaseFovDeg)
        let portraitBoost = viewportAspect < 0.85 ? (0.85 - viewportAspect) * 46.0 : 0.0
        camera.fieldOfView = CGFloat(min(64.5, baseFov + portraitBoost))
        if !hasRenderedFirstFrame {
            snapCameraToTarget()
        }
    }

    public func handlePointerDown(at point: CGPoint, in scnView: SCNView) {
        let now = Double(sceneNowSec)
        if appMode == .arcade || appMode == .pulpRescue {
            if isDoubleTap(
                prevTimeSec: lastTapTimeSec,
                prevX: Double(lastTapPt.x),
                prevY: Double(lastTapPt.y),
                nowTimeSec: now,
                nowX: Double(point.x),
                nowY: Double(point.y)
            ) {
                requestSmartFloss()
                lastTapTimeSec = nil
            } else {
                lastTapTimeSec = now
                lastTapPt = point
            }
            updateArcadeGroundTarget(at: point, in: scnView)
        } else if appMode == .hub {
            _ = tryRubCompanionCrown(at: point, in: scnView, phase: .down)
        } else if appMode == .cosmicIntro && cosmicBeatIndex == 1 {
            let hits = scnView.hitTest(point, options: [.boundingBoxOnly: false])
            for hit in hits {
                var cur: SCNNode? = hit.node
                while let n = cur {
                    if let name = n.name, name.hasPrefix("mohs_"),
                       let idx = Int(name.replacingOccurrences(of: "mohs_", with: "")),
                       (0...4).contains(idx) {
                        cosmicNodes.selectMohsSpecimen(idx)
                        let cb = onCosmicMohsSelected
                        DispatchQueue.main.async { cb?(idx) }
                        return
                    }
                    cur = n.parent
                }
            }
        } else if appMode == .brushAlong {
            brushUserDragging = true
        }
    }

    public func handlePointerMove(at point: CGPoint, delta: CGSize, in scnView: SCNView) {
        if appMode == .arcade || appMode == .pulpRescue {
            updateArcadeGroundTarget(at: point, in: scnView)
        } else if appMode == .hub {
            if !tryRubCompanionCrown(at: point, in: scnView, phase: .move) {
                // Smoothly orbit the 14-crown arch & 3D Earth sky when dragging open space
                hubOrbitYaw = max(-0.85, min(0.85, hubOrbitYaw - Float(delta.width) * 0.0055))
                hubOrbitPitch = max(0.18, min(0.82, hubOrbitPitch + Float(delta.height) * 0.0035))
            }
        } else if appMode == .cosmicIntro {
            cosmicOrbitYaw = max(-0.75, min(0.75, cosmicOrbitYaw - Float(delta.width) * 0.005))
        } else if appMode == .brushAlong {
            brushUserDragging = true
            brushOrbitOffsetYaw = max(-0.85, min(0.85, brushOrbitOffsetYaw - Float(delta.width) * 0.0055))
            brushOrbitOffsetPitch = max(-0.45, min(0.45, brushOrbitOffsetPitch + Float(delta.height) * 0.0035))
        }
    }

    public func handlePointerUp() {
        directTouchWorldPos = nil
        brushUserDragging = false
        if appMode == .hub {
            touchSystem.endTouch()
        }
    }

    private func updateArcadeGroundTarget(at point: CGPoint, in scnView: SCNView) {
        guard let cart = activeSession?.cartridge else { return }
        let nearPt = scnView.unprojectPoint(SCNVector3(Float(point.x), Float(point.y), 0.0))
        let farPt = scnView.unprojectPoint(SCNVector3(Float(point.x), Float(point.y), 1.0))
        let rayOrigin = SIMD3<Float>(Float(nearPt.x), Float(nearPt.y), Float(nearPt.z))
        let rayEnd = SIMD3<Float>(Float(farPt.x), Float(farPt.y), Float(farPt.z))
        let dir = rayEnd - rayOrigin
        guard abs(dir.y) > 1e-4 else { return }
        let planeY: Float = 0.55
        let t = (planeY - rayOrigin.y) / dir.y
        guard t > 0 else { return }
        let hit = rayOrigin + dir * t
        let wx = max(1.0, min(cart.worldWidth - 1.0, Double(hit.x)))
        let wz = max(1.0, min(cart.worldDepth - 1.0, Double(hit.z)))
        directTouchWorldPos = Vec2(x: wx, z: wz)
    }

    @discardableResult
    private func tryRubCompanionCrown(at point: CGPoint, in scnView: SCNView, phase: TouchPhase) -> Bool {
        let hits = scnView.hitTest(point, options: [.boundingBoxOnly: false])
        guard let hit = hits.first(where: { ($0.node.name ?? "").hasPrefix("crown_") }),
              let name = hit.node.name,
              let idx = Int(name.replacingOccurrences(of: "crown_", with: ""))
        else {
            return false
        }

        let wp = hit.worldCoordinates
        let touchHit = TouchHit(
            x: Double(wp.x),
            y: Double(wp.y),
            z: Double(wp.z),
            crownIndex: idx
        )
        let feedback = touchSystem.registerTouch(
            hit: touchHit,
            phase: phase,
            nowSec: Double(sceneNowSec),
            smoothness: companionSmoothness
        )
        highlightedCrownIndex = idx

        let cb = onCompanionCrownRubbed
        DispatchQueue.main.async {
            cb?(idx, feedback)
        }
        return true
    }

    // MARK: - 120Hz Metal Render Delegate Loop

    public func renderer(_ renderer: any SCNSceneRenderer, updateAtTime time: TimeInterval) {
        let rawDt: Double
        if let prev = lastRenderTime {
            rawDt = max(0.0, min(0.1, time - prev))
        } else {
            rawDt = 1.0 / 120.0
            fpsWindowStart = time
        }
        lastRenderTime = time
        let dtFloat = Float(rawDt)
        sceneNowSec += dtFloat
        let motionTime = reducedMotion ? Float(0) : sceneNowSec

        // 120Hz asymmetric smoothing over 3-band Suno + Synth/SFX audio levels (auto-zeroed for Reduce Motion)
        if reducedMotion {
            smoothedAudioBands = .zero
        } else {
            let target = NativeSoundEngine.shared.sampleAudioReactiveBands().simd
            let atk = 1.0 - exp(-28.0 * max(0.001, dtFloat))
            let rel = 1.0 - exp(-8.5 * max(0.001, dtFloat))
            for c in 0..<4 {
                let k = target[c] > smoothedAudioBands[c] ? atk : rel
                smoothedAudioBands[c] += (target[c] - smoothedAudioBands[c]) * k
            }
        }

        // Measure real ProMotion Hz
        fpsFrameCount += 1
        if time - fpsWindowStart >= 0.5 {
            let fps = Int((Double(fpsFrameCount) / (time - fpsWindowStart)).rounded())
            fpsFrameCount = 0
            fpsWindowStart = time
            if fps != measuredFps {
                measuredFps = fps
                let cb = onFpsUpdated
                DispatchQueue.main.async { cb?(fps) }
            }
        }

        // Update Cosmic Orbital Earth + Mohs Showcase only when visible
        if !cosmicNodes.rootNode.isHidden {
            cosmicNodes.update(
                dt: dtFloat,
                nowSec: sceneNowSec,
                reducedMotion: reducedMotion,
                audioBands: smoothedAudioBands
            )
        }

        if appMode == .hub || appMode == .brushAlong {
            updateCompanionFrame(dt: dtFloat, motionTime: motionTime)
        } else if appMode == .arcade || appMode == .pulpRescue || appMode == .report {
            updateArcadeFrame(rawDt: rawDt, dtFloat: dtFloat, motionTime: motionTime)
        }

        updateCameraRig(dt: dtFloat)
        hasRenderedFirstFrame = true
    }

    private func updateCompanionFrame(dt: Float, motionTime: Float) {
        touchSystem.step(dt: Double(dt), nowSec: Double(sceneNowSec))

        let activeQuad: Int
        var pacerFoamOrigin: Vec2 = .zero
        var pacerFoamStrength: Float = 0

        if appMode == .brushAlong {
            touchSystem.fadeSplatsForPacer(elapsedSec: pacerElapsedSec)
            if !brushUserDragging {
                let relax = exp(-2.2 * max(0.001, dt))
                brushOrbitOffsetYaw *= relax
                brushOrbitOffsetPitch *= relax
            }
            let coach = companionNodes.updatePacerCoaching(
                elapsedSec: pacerElapsedSec,
                inFlossBonus: pacerInFlossBonus,
                flossToolStyle: pacerFlossToolStyle,
                nowSec: sceneNowSec,
                reducedMotion: reducedMotion
            )
            latestPacerCoachState = coach
            activeQuad = coach.activeQuadrant
            companionEnamelController.setHighlightedCrown(index: coach.activeCrownIndex, pulse01: 1.0)
            pacerFoamOrigin = Vec2(x: Double(coach.contactWorldPos.x), z: Double(coach.contactWorldPos.z))
            pacerFoamStrength = pacerInFlossBonus ? 0.36 : 0.88
        } else {
            activeQuad = -1
            companionEnamelController.setHighlightedCrown(index: highlightedCrownIndex, pulse01: 1.0)
            companionNodes.updatePolishHalo(
                smoothnessIndex: companionSmoothness,
                nowSec: sceneNowSec,
                reducedMotion: reducedMotion,
                audioBands: smoothedAudioBands
            )
        }

        let smooth01 = Float(min(1.0, max(0.0, companionSmoothness / 100.0)))
        companionEnamelController.setCompanionOverride(
            active: true,
            smoothness01: smooth01,
            fluorideGlow01: smooth01 > 0.84 ? 0.55 : 0.15,
            acidStress01: companionAcidStress,
            activeQuadrant: activeQuad
        )
        companionEnamelController.updateFrameUniforms(
            EnamelFrameUniforms(
                nowSec: sceneNowSec,
                motionTimeSec: motionTime,
                probePosition: pacerFoamOrigin,
                probeFoamRadius: 1.55,
                probeFoamStrength: pacerFoamStrength,
                audioBands: smoothedAudioBands
            )
        )

        let rawRipples = touchSystem.activeRipples(nowSec: Double(sceneNowSec))
        let ripples: [CrownTouchRipple] = rawRipples.isEmpty ? [] : rawRipples.map { r in
            CrownTouchRipple(
                position: SIMD3<Float>(Float(r.x), Float(r.y), Float(r.z)),
                startTime: sceneNowSec - Float(r.ageSec)
            )
        }
        companionEnamelController.setTouchRipples(ripples)

        let rawSplats = touchSystem.getRenderSplats()
        let splats: [SugarPlaqueSplat] = rawSplats.isEmpty ? [] : rawSplats.map { s in
            SugarPlaqueSplat(
                position: SIMD3<Float>(Float(s.x), Float(s.y), Float(s.z)),
                amount: Float(s.amount)
            )
        }
        companionEnamelController.setSugarSplats(splats)
        companionNodes.updateSugarSplats(splats)
        EnamelShaders.updateGingivaMaterial(
            companionNodes.gingivaMaterial,
            motionTimeSec: motionTime,
            audioBass: smoothedAudioBands.x,
            audioHigh: smoothedAudioBands.z
        )
    }

    private func updateArcadeFrame(rawDt: Double, dtFloat: Float, motionTime: Float) {
        guard let session = activeSession else { return }
        let cart = session.cartridge

        if appMode != .report && !session.isCompleted {
            accumulator = min(0.12, accumulator + rawDt)
            var didStep = false
            var steppedSnapshot: SessionSnapshot?

            while accumulator >= fixedDt && !session.isCompleted {
                prevProbePos = currProbePos
                prevProbeY = currProbeY
                prevProbeFacing = currProbeFacing
                prevMutansPos.removeAll(keepingCapacity: true)
                for m in session.mutans {
                    prevMutansPos[m.id] = m.pos
                }

                let input = SessionInputCommand(
                    moveX: stickMoveX,
                    moveZ: stickMoveZ,
                    directTargetWorldPos: directTouchWorldPos,
                    scrubHeld: stickScrubHeld || (directTouchWorldPos != nil),
                    aimWorldPos: pendingFlossAimPos,
                    fireFlossRequested: pendingFlossFire,
                    fireRinseRequested: pendingRinseFire,
                    fireDiscloseRequested: pendingDiscloseFire
                )
                pendingFlossFire = false
                pendingFlossAimPos = nil
                pendingRinseFire = false
                pendingDiscloseFire = false

                session.step(dt: fixedDt, input: input)
                accumulator -= fixedDt
                didStep = true

                let snap = session.makeSnapshot()
                currProbePos = snap.probePos
                currProbeY = snap.probeY
                currProbeFacing = snap.probeFacingRad
                steppedSnapshot = snap
                cachedArcadeSnapshot = snap

                if let beam = snap.flossBeamSegment, snap.flossBeamRemaining > 0.16 {
                    let yA = Float(sampleTerrainHeight(cartridge: cart, x: beam.a.x, z: beam.a.z) + 0.45)
                    let yB = Float(sampleTerrainHeight(cartridge: cart, x: beam.b.x, z: beam.b.z) + 0.45)
                    probeRig.triggerFlossBeam(
                        from: SIMD3<Float>(Float(beam.a.x), yA, Float(beam.a.z)),
                        to: SIMD3<Float>(Float(beam.b.x), yB, Float(beam.b.z)),
                        zipped: snap.probeZip != nil
                    )
                }
            }

            if didStep, let snap = steppedSnapshot {
                // Upload only the dirty RGBA sub-rectangle to Metal shared memory (~0.005 ms)
                if session.grid.syncRgbaBuffer(bChannelMode: cart.bChannelMode, chemistry: session.chemistry) {
                    arcadeEnamelController.uploadDirtySurface(
                        rgbaBytes: session.grid.rgbaBuffer,
                        width: session.grid.gridW,
                        height: session.grid.gridH,
                        dirtyRect: session.grid.lastSyncedRect
                    )
                }

                // Track newly sealed 24k Gold districts
                for (i, sealed) in snap.sealedDistricts.enumerated() where i < 4 {
                    if sealed && districtSealBirthSec[i] < 0 {
                        districtSealBirthSec[i] = sceneNowSec
                    }
                }

                let cb = onSessionStepped
                DispatchQueue.main.async { cb?(snap) }
            }
        }

        // Sub-Frame 120Hz Interpolation (alpha in 0..1)
        let alpha = appMode == .report ? 1.0 : max(0.0, min(1.0, accumulator / fixedDt))
        let interpX = prevProbePos.x + (currProbePos.x - prevProbePos.x) * alpha
        let interpZ = prevProbePos.z + (currProbePos.z - prevProbePos.z) * alpha
        let interpY = prevProbeY + (currProbeY - prevProbeY) * alpha
        let interpFacing = interpolateAngle(from: prevProbeFacing, to: currProbeFacing, t: alpha)

        probeRig.rootNode.simdPosition = SIMD3<Float>(Float(interpX), Float(interpY + 0.52), Float(interpZ))
        probeRig.rootNode.simdEulerAngles = SIMD3<Float>(0, Float(-interpFacing), 0)

        let snap = cachedArcadeSnapshot ?? session.makeSnapshot()
        if cachedArcadeSnapshot == nil {
            cachedArcadeSnapshot = snap
        }
        probeRig.updateAnimation(
            dt: dtFloat,
            nowSec: sceneNowSec,
            probeSpeed: Float(snap.probeSpeed),
            isScrubbing: snap.scrubActive,
            surgeFraction01: Float(snap.surgeMeter / GameConfig.surgeMax),
            audioBass: smoothedAudioBands.x
        )

        if snap.scrubActive && sceneNowSec - lastFoamSampleSec > 0.09 {
            lastFoamSampleSec = sceneNowSec
            foamTrail.insert(
                FoamTrailSample(
                    x: Float(interpX),
                    z: Float(interpZ),
                    birthTime: sceneNowSec,
                    strength: 1.0
                ),
                at: 0
            )
            if foamTrail.count > 6 { foamTrail.removeLast() }
        }

        // Update Enamel Biophysics Uniforms (Disclosing Scan, Fluoride Rinse Wave, Gold Seals, Foam, 3-Band Audio)
        let discloseProg = snap.discloseActiveRemaining > 0
            ? Float(1.0 - snap.discloseActiveRemaining / GameConfig.discloseDurationSec)
            : 0
        let rinseProg = snap.rinseWaveRemaining > 0
            ? Float(1.0 - snap.rinseWaveRemaining / GameConfig.rinseWaveDurationSec)
            : 0

        arcadeEnamelController.updateFrameUniforms(
            EnamelFrameUniforms(
                nowSec: sceneNowSec,
                motionTimeSec: motionTime,
                discloseOrigin: snap.discloseOrigin,
                discloseRadius: discloseProg * Float(GameConfig.discloseWaveRadius),
                discloseStrength: snap.discloseActiveRemaining > 0 ? 1.0 : 0.0,
                rinseOrigin: snap.rinseWaveOrigin,
                rinseRadius: rinseProg * Float(GameConfig.rinseWaveRadius),
                rinseStrength: snap.rinseWaveRemaining > 0 ? Float(snap.rinseWaveRemaining / GameConfig.rinseWaveDurationSec) : 0.0,
                bufferedRinse: true,
                probePosition: Vec2(x: interpX, z: interpZ),
                probeFoamRadius: Float(snap.effectiveBrushRadius),
                probeFoamStrength: snap.scrubActive ? 1.0 : 0.2,
                acidStress: snap.stephanTimerSec > 0 ? 0.65 : 0.0,
                audioBands: smoothedAudioBands
            )
        )
        if let arcadeGumMat = activeStageNodes?.gingivaBedNode.geometry?.firstMaterial {
            EnamelShaders.updateGingivaMaterial(
                arcadeGumMat,
                motionTimeSec: motionTime,
                audioBass: smoothedAudioBands.x,
                audioHigh: smoothedAudioBands.z,
                headlamp: SIMD4<Float>(Float(interpX), Float(interpY + 2.4), Float(interpZ), 0.85)
            )
        }
        arcadeEnamelController.setHeadlamp(
            worldPos: SIMD3<Float>(Float(interpX), Float(interpY + 2.4), Float(interpZ)),
            weight: 0.85,
            depthStart: 28.0,
            depthDensity: 0.045
        )
        arcadeEnamelController.setFoamSamples(foamTrail)

        if districtSealBirthSec.contains(where: { $0 >= 0 }) {
            let sealAges = districtSealBirthSec.map { birth in
                birth >= 0 ? max(0, sceneNowSec - birth) : Float(-1)
            }
            arcadeEnamelController.setDistrictSeals(
                boxes: cachedDistrictBoxes,
                sealAges: sealAges
            )
        }

        syncStageEntities(snap: snap, cart: cart, alpha: alpha)
    }

    private func syncStageEntities(snap: SessionSnapshot, cart: WorldCartridge, alpha: Double) {
        guard let stage = activeStageNodes else { return }

        stage.updateSalivaSprings(audioBands: smoothedAudioBands)

        for site in snap.sites {
            stage.updateCommensalSite(
                id: site.id,
                restored: site.restored,
                localCleanRatio: site.localCleanRatio,
                nowSec: sceneNowSec,
                audioBands: smoothedAudioBands
            )
        }

        for crystal in snap.sucroseCrystals {
            if let node = stage.sucroseCrystalNodes[crystal.id] {
                if node.isHidden == crystal.intact {
                    node.isHidden = !crystal.intact
                }
                if crystal.intact {
                    node.simdEulerAngles.y = sceneNowSec * 0.9 + smoothedAudioBands.z * 0.32
                }
            }
        }

        for bridge in snap.bridges {
            if let bNode = stage.biofilmBridgeNodes[bridge.id], bNode.isHidden == bridge.intact {
                bNode.isHidden = !bridge.intact
            }
        }

        for beacon in snap.beacons {
            if beacon.index < stage.relayBeaconNodes.count {
                let bNode = stage.relayBeaconNodes[beacon.index]
                if bNode.isHidden != beacon.collected {
                    bNode.isHidden = beacon.collected
                }
                if !beacon.collected {
                    bNode.simdEulerAngles.y = sceneNowSec * 1.4
                }
            }
        }

        if let zipHint = snap.nearestZipMouth, zipHint.distToEntry <= GameConfig.zipPromptRadius {
            if stage.zipReticleNode.isHidden { stage.zipReticleNode.isHidden = false }
            let y = Float(sampleTerrainHeight(cartridge: cart, x: zipHint.entry.x, z: zipHint.entry.z) + 0.35)
            stage.zipReticleNode.simdPosition = SIMD3<Float>(Float(zipHint.entry.x), y, Float(zipHint.entry.z))
            stage.zipReticleNode.simdEulerAngles.y = sceneNowSec * 2.4
        } else if !stage.zipReticleNode.isHidden {
            stage.zipReticleNode.isHidden = true
        }

        // Dynamic S. mutans Hopping Cocci Pool (120Hz Interpolated, Zero-Alloc Set Reuse!)
        liveMutansIds.removeAll(keepingCapacity: true)
        for m in snap.mutans {
            liveMutansIds.insert(m.id)
            let node: SCNNode
            if let existing = mutansPool[m.id] {
                node = existing
            } else {
                let created = ProceduralMeshBuilder.buildMutansNode()
                scene.rootNode.addChildNode(created)
                mutansPool[m.id] = created
                node = created
            }
            let prev = prevMutansPos[m.id] ?? m.pos
            let mx = prev.x + (m.pos.x - prev.x) * alpha
            let mz = prev.z + (m.pos.z - prev.z) * alpha
            let hop = abs(sin(m.hopPhase)) * 0.48 + Double(smoothedAudioBands.w) * 0.09
            let groundY = sampleTerrainHeight(cartridge: cart, x: mx, z: mz)
            node.simdPosition = SIMD3<Float>(Float(mx), Float(groundY + 0.34 + hop), Float(mz))
            if hypot(m.vel.x, m.vel.z) > 0.05 {
                node.simdEulerAngles.y = Float(-atan2(m.vel.z, m.vel.x))
            }
        }
        if mutansPool.count > liveMutansIds.count {
            deadEntityIds.removeAll(keepingCapacity: true)
            for id in mutansPool.keys where !liveMutansIds.contains(id) {
                deadEntityIds.append(id)
            }
            for id in deadEntityIds {
                mutansPool.removeValue(forKey: id)?.removeFromParentNode()
            }
        }

        // Dynamic Acid Pools (Zero-Alloc Set Reuse!)
        livePoolIds.removeAll(keepingCapacity: true)
        for p in snap.acidPools {
            livePoolIds.insert(p.id)
            let node: SCNNode
            if let existing = acidPoolNodes[p.id] {
                node = existing
            } else {
                let created = ProceduralMeshBuilder.buildAcidPoolNode(
                    radius: Float(p.radius),
                    tintHex: stage.landmarkColors.acidPoolHex
                )
                scene.rootNode.addChildNode(created)
                acidPoolNodes[p.id] = created
                node = created
            }
            let py = sampleTerrainHeight(cartridge: cart, x: p.pos.x, z: p.pos.z) + 0.06
            node.simdPosition = SIMD3<Float>(Float(p.pos.x), Float(py), Float(p.pos.z))
            node.opacity = CGFloat(min(0.82, p.remainingSec / 1.5))
        }
        if acidPoolNodes.count > livePoolIds.count {
            deadEntityIds.removeAll(keepingCapacity: true)
            for id in acidPoolNodes.keys where !livePoolIds.contains(id) {
                deadEntityIds.append(id)
            }
            for id in deadEntityIds {
                acidPoolNodes.removeValue(forKey: id)?.removeFromParentNode()
            }
        }
    }

    // MARK: - Bounded Powers-of-Ten Smooth 120Hz Camera Rig

    private func computeCameraTargets() -> (pos: SIMD3<Float>, look: SIMD3<Float>) {
        let isPortrait = viewportAspect < 0.85

        switch appMode {
        case .cosmicIntro:
            let earthCenter = SIMD3<Float>(
                Float(GameConfig.earthBackdropPos.x),
                Float(GameConfig.earthBackdropPos.y),
                Float(GameConfig.earthBackdropPos.z)
            )
            let showcaseCenter = earthCenter + SIMD3<Float>(0, 38.0, 0)
            let sinYaw = sin(cosmicOrbitYaw)
            let cosYaw = cos(cosmicOrbitYaw)
            switch cosmicBeatIndex {
            case 0:
                // Beat 0: Stellar Forge & Hydroxyapatite Lattice centered at ~25% from top (top 1/3 hero!)
                let dist: Float = isPortrait ? 20.0 : 15.5
                return (
                    showcaseCenter + SIMD3<Float>(sinYaw * dist, isPortrait ? -4.2 : 0.4, cosYaw * dist),
                    showcaseCenter + SIMD3<Float>(0, isPortrait ? -6.2 : -1.8, 0)
                )
            case 1:
                // Beat 1: Lattice + 5 Mohs Specimens spanning ~13%..36% from top above the story card
                let dist: Float = isPortrait ? 21.5 : 15.0
                return (
                    showcaseCenter + SIMD3<Float>(sinYaw * dist * 0.45, isPortrait ? -6.4 : -2.6, 2.2 + cosYaw * dist),
                    showcaseCenter + SIMD3<Float>(0, isPortrait ? -8.4 : -4.8, 2.2)
                )
            case 2:
                // Beat 2: Fluorapatite 9F Crystal Lock closeup in upper hero third (~14%..37% from top)
                let dist: Float = isPortrait ? 17.5 : 13.5
                return (
                    showcaseCenter + SIMD3<Float>(sinYaw * dist, isPortrait ? -3.6 : 0.2, cosYaw * dist),
                    showcaseCenter + SIMD3<Float>(0, isPortrait ? -5.4 : -1.5, 0)
                )
            default:
                // Beat 3: Full 3D Orbital Earth, Polar Aurora & LEO Station Aurora filling ~10%..51% from top
                let dist: Float = isPortrait ? 74.0 : 48.0
                return (
                    earthCenter + SIMD3<Float>(sinYaw * dist, isPortrait ? -11.5 : -1.0, cosYaw * dist),
                    earthCenter + SIMD3<Float>(0, isPortrait ? -18.5 : -6.5, 0)
                )
            }

        case .hub:
            let archCenter = SIMD3<Float>(32.0, 1.4, 15.6)
            let dist: Float = isPortrait ? 36.5 : 22.0
            let x = archCenter.x + sin(hubOrbitYaw) * cos(hubOrbitPitch) * dist
            let y = archCenter.y + sin(hubOrbitPitch) * dist
            let z = archCenter.z + cos(hubOrbitYaw) * cos(hubOrbitPitch) * dist
            return (
                SIMD3<Float>(x, y, z),
                archCenter + SIMD3<Float>(0, isPortrait ? 1.8 : 0.9, -1.0)
            )

        case .brushAlong:
            let coach = latestPacerCoachState ?? companionNodes.updatePacerCoaching(
                elapsedSec: pacerElapsedSec,
                inFlossBonus: pacerInFlossBonus,
                flossToolStyle: pacerFlossToolStyle,
                nowSec: sceneNowSec,
                reducedMotion: reducedMotion
            )
            let dist = isPortrait ? coach.camDistPortrait : coach.camDistLandscape
            let yaw = coach.camYaw + brushOrbitOffsetYaw
            let pitch = max(-0.92, min(0.92, coach.camPitch + brushOrbitOffsetPitch))
            let focus = coach.focusWorldPos
            let pos = focus + SIMD3<Float>(
                sin(yaw) * cos(pitch) * dist,
                sin(pitch) * dist,
                cos(yaw) * cos(pitch) * dist
            )
            return (pos, focus)

        case .arcade, .pulpRescue:
            let px = currProbePos.x
            let pz = currProbePos.z
            let camHeight: Float = isPortrait ? 24.0 : 18.0
            let camBackZ: Float = isPortrait ? 16.0 : 12.2
            let probeX = probeRig.rootNode.isHidden ? Float(px) : probeRig.rootNode.simdPosition.x
            let probeZ = probeRig.rootNode.isHidden ? Float(pz) : probeRig.rootNode.simdPosition.z
            return (
                SIMD3<Float>(probeX, camHeight, probeZ + camBackZ),
                SIMD3<Float>(probeX, 0.6, probeZ - 1.0)
            )

        case .report:
            let cx = Float((activeSession?.cartridge.worldWidth ?? 64.0) * 0.5)
            let cz = Float((activeSession?.cartridge.worldDepth ?? 32.0) * 0.5)
            let orbit = reducedMotion ? Float(0.2) : sceneNowSec * 0.22
            return (
                SIMD3<Float>(cx + sin(orbit) * 22.0, 24.0, cz + cos(orbit) * 22.0),
                SIMD3<Float>(cx, 0.5, cz)
            )
        }
    }

    public func snapCameraToTarget() {
        let targets = computeCameraTargets()
        camCurrentPos = targets.pos
        camCurrentLookAt = targets.look
        cameraNode.simdPosition = camCurrentPos
        cameraNode.look(
            at: RenderBridge.scnVec3(camCurrentLookAt),
            up: RenderBridge.scnVec3(0, 1, 0),
            localFront: RenderBridge.scnVec3(0, 0, -1)
        )
    }

    private func updateCameraRig(dt: Float) {
        let targets = computeCameraTargets()
        let rate: Float = appMode == .brushAlong ? 4.8 : 7.5
        let k = 1.0 - exp(-rate * max(0.001, dt))
        camCurrentPos += (targets.pos - camCurrentPos) * k
        camCurrentLookAt += (targets.look - camCurrentLookAt) * k
        cameraNode.simdPosition = camCurrentPos
        cameraNode.look(
            at: RenderBridge.scnVec3(camCurrentLookAt),
            up: RenderBridge.scnVec3(0, 1, 0),
            localFront: RenderBridge.scnVec3(0, 0, -1)
        )

        // Keep 3D Orbital Earth & starfield gracefully framed behind the arch with cosmic parallax as user orbits
        if appMode == .hub || appMode == .brushAlong {
            let sight = camCurrentLookAt - camCurrentPos
            let sightLen = max(0.001, simd_length(sight))
            let dir = sight / sightLen
            let earthDist: Float = 59.0
            cosmicNodes.rootNode.simdPosition = SIMD3<Float>(
                32.0 + dir.x * earthDist,
                6.2 + dir.y * earthDist * 0.45,
                15.6 + dir.z * earthDist
            )
        }
    }

    private func interpolateAngle(from a: Double, to b: Double, t: Double) -> Double {
        var diff = b - a
        while diff > .pi { diff -= .pi * 2 }
        while diff < -.pi { diff += .pi * 2 }
        return a + diff * t
    }
}
