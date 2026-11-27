import Foundation
import Metal
import ModelIO
import MouthLifeCore
import os
import SceneKit
import SceneKit.ModelIO
import simd

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// What the player is telling a stage: the stick, a finger on the tooth, and floss, Surge or Scan
/// waiting for the next step. Written by the main thread (touches, the HUD's buttons) and taken
/// by SceneKit's render thread once per step, so it lives behind one lock (`stageInput`): a tap
/// that lands while a step is being put together is kept for the next step, never lost.
private struct StageInput: Sendable {
    var stickMoveX: Double = 0
    var stickMoveZ: Double = 0
    var stickScrubHeld: Bool = false
    var directTouchWorldPos: Vec2?
    var pendingFlossFire: Bool = false
    /// Floss toward this point (the Mac's right-click) ...
    var pendingFlossAimPos: Vec2?
    /// ... or this way from wherever HYDRA-1 is when the step runs (the HUD's direction pad).
    var pendingFlossAimDir: Vec2?
    var pendingRinseFire: Bool = false
    var pendingDiscloseFire: Bool = false

    /// Forgets the one-shot requests, once a step has taken them.
    mutating func clearPending() {
        pendingFlossFire = false
        pendingFlossAimPos = nil
        pendingFlossAimDir = nil
        pendingRinseFire = false
        pendingDiscloseFire = false
    }
}

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
    /// The stage's city skyline; a child of the stage, rebuilt with it.
    private var activeSkyline: CitySkylineNodes?
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
    /// Rubbed from the main thread (UIKit / AppKit input, the coordinator) and stepped and read by
    /// SceneKit's render thread; `CompanionTouchSystem` locks every call, so both sides may use it.
    public let touchSystem = CompanionTouchSystem()
    // Reused every frame for the tooth ripples and sugar splats (no per-frame heap allocation).
    private var rippleScratch: [ActiveTouchRipple] = []
    private var splatScratch: [RenderSplat] = []
    private var rippleUpload = ShadowSafeFrameBuffer<CrownTouchRipple>(capacity: CompanionTouchSystem.maxRipples)
    private var splatUpload = ShadowSafeFrameBuffer<SugarPlaqueSplat>(capacity: CompanionTouchSystem.maxSplats)

    // Camera & Mode State
    public private(set) var appMode: AppMode = .hub
    public var cosmicBeatIndex: Int = 0 {
        didSet {
            cosmicNodes.setCosmicIntroState(visible: appMode == .cosmicIntro, beatIndex: cosmicBeatIndex)
        }
    }
    public var reducedMotion: Bool = false {
        didSet {
            syncMotionMonitorPolicy()
        }
    }
    public var qualityTier: QualityTier = .ultra {
        didSet {
            companionEnamelController.setQualityTier(qualityTier)
            arcadeEnamelController.setQualityTier(qualityTier)
            applyDiveSunQuality()
        }
    }

    /// A dive's sun: see `setupDiveSun`. Points from the ground toward the sun.
    /// Web twin: DIVE_KEY_DIRECTION in OralLighting.ts (the enamel and gum shaders use it too).
    static let diveKeyDirection = simd_normalize(SIMD3<Float>(-0.25, 0.70, -0.67))
    private let diveSunNode = SCNNode()
    private let diveSun = SCNLight()

    // Companion Sync State
    public var companionSmoothness: Double = 92.0
    public var companionAcidStress: Float = 0.0
    public var pacerElapsedSec: Double = 0.0
    public var pacerInFlossBonus: Bool = false
    /// True while the arcade's pause card is up: the mission does not step (its clock stops too).
    public var arcadePaused: Bool = false
    public var pacerStage: PacerStage = .brushing
    public var pacerFlossToolStyle: FlossToolStyle = .flossPick
    public var pacerMouthwashDurationSec: Double = GameConfig.brushAlongMouthwashBonusSec
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
    /// The stick, the finger on the tooth and the queued floss, Surge and Scan (see `StageInput`).
    /// Created once; taking it never allocates.
    private let stageInput = OSAllocatedUnfairLock(initialState: StageInput())
    /// Held by the main thread for the whole of `mountStage`, and only ever *tried* by the render
    /// thread around a stage's frame. Mounting swaps what that frame reads and writes (the
    /// session, the stage's nodes, the germ and acid-pool tables, the foam trail), and it can
    /// happen while a stage is on screen: the score screen's next city, a replay. The render
    /// thread never waits for it: while a stage is being mounted it draws the frame it already
    /// has. So the main thread may call SceneKit while holding it without any risk of the two
    /// threads waiting for each other.
    private let stageLock = NSLock()
    private var lastTapTimeSec: Double?
    private var lastTapPt: CGPoint = .zero
    /// Bumped by `resetStageInput` (mode changes, pause, finales, a new stage, a Duo fold). A finger or
    /// mouse button that went down before the bump no longer steers, scrubs or rubs; the viewport
    /// waits for a fresh touch (main thread only).
    public private(set) var pointerEpoch: Int = 0

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

    // Rolling ProMotion Frame Rate Counter, 120Hz Audio Envelope & Gyro Slosh Physics
    private var fpsFrameCount: Int = 0
    private var fpsWindowStart: TimeInterval = 0
    public private(set) var measuredFps: Int = 120
    private var smoothedAudioBands = SIMD4<Float>.zero
    private var gyroSim = GyroSloshSim()
    private var latestGyroSnapshot: GyroSloshSnapshot = .idle
    private var lastGyroUiPublishSec: Float = -10
    private var lastPublishedHandheld: Bool = false

    // Callbacks to Coordinator (invoked on MainActor)
    public var onSessionStepped: ((SessionSnapshot) -> Void)?
    public var onCompanionCrownRubbed: ((Int?, TouchFeedback) -> Void)?
    public var onCosmicMohsSelected: ((Int) -> Void)?
    public var onFpsUpdated: ((Int) -> Void)?
    public var onMouthwashGyroUpdated: ((GyroSloshSnapshot) -> Void)?

    public func resetMouthwashGyroSession() {
        gyroSim.resetMouthwashSession()
        latestGyroSnapshot = .idle
        lastGyroUiPublishSec = -10
        lastPublishedHandheld = false
    }

    private func syncMotionMonitorPolicy() {
        let wantsGyro = !reducedMotion && (appMode == .hub || appMode == .cosmicIntro || appMode == .brushAlong)
        MotionTiltMonitor.shared.setActive(wantsGyro)
    }

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

        // Stage enamel takes the dive's shadows (the companion arch keeps `.constant`).
        Self.useShadowReceivingLighting(arcadeEnamelController.material)
        rippleScratch.reserveCapacity(CompanionTouchSystem.maxRipples)
        splatScratch.reserveCapacity(CompanionTouchSystem.maxSplats)
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
        // A soft procedural sky for image-based lighting. Without any contents the line above did
        // nothing, so glossy props (gold seals, the glass rinse cup, the probe hull) had nothing to
        // reflect and looked flat. This affects physically based props only; enamel, gums and Earth
        // use their own shaders. To switch it off, delete the next two statements.
        let reflectionSky = MDLSkyCubeTexture(
            name: nil,
            channelEncoding: .uInt8,
            textureDimensions: vector_int2(64, 64),
            turbidity: 0.35,
            sunElevation: 0.62,
            upperAtmosphereScattering: 0.25,
            groundAlbedo: 0.18
        )
        scene.lightingEnvironment.contents = reflectionSky

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
        setupDiveSun()

        // Mount Cosmic Backdrop, Companion Arch, and HYDRA-1 Probe
        scene.rootNode.addChildNode(cosmicNodes.rootNode)
        scene.rootNode.addChildNode(companionNodes.rootNode)
        scene.rootNode.addChildNode(probeRig.rootNode)
        scene.rootNode.addChildNode(probeRig.flossBeamNode)
        Self.configureShadowCasting(probeRig.rootNode)
        probeRig.flossBeamNode.enumerateHierarchy { node, _ in node.castsShadow = false }
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
        syncMotionMonitorPolicy()
    }

    /// A dive's sun sits low on the far side of the tooth, where the stage's dusk sky glows, so the
    /// shadows it casts fall toward the player instead of hiding behind what cast them. It lights
    /// nothing: the enamel and gum shaders do their own lighting with the same direction, and the
    /// props keep their studio lights. It only casts shadows, drawn by SceneKit in deferred mode as a
    /// darkening pass over the finished frame. That pass skips constant-lit materials, so the stage
    /// enamel and gum are switched to lambert with a black diffuse (see `useShadowReceivingLighting`):
    /// SceneKit's lights then add nothing and the shaders' emission still sets every colour.
    /// Web twin: SunShadowPass.ts. Off on the low tier and outside stages.
    private func setupDiveSun() {
        diveSun.type = .directional
        // SceneKit skips a light at zero intensity, shadows and all; 1 lumen is invisible next to
        // the 540-lumen studio key light on the props.
        diveSun.intensity = 1
        diveSun.castsShadow = true
        diveSun.shadowMode = .deferred
        // Measured off screen: 0.72 darkens shade to about the web's (its shade multiplies by
        // 0.5-0.74); the touch of blue keeps it cool, as shade under an open sky is.
        diveSun.shadowColor = RenderBridge.color(hex: 0x050F29, alpha: 0.72)
        diveSun.shadowRadius = 3
        diveSun.shadowCascadeCount = 1
        diveSun.automaticallyAdjustsShadowProjection = true
        diveSun.maximumShadowDistance = 48
        diveSunNode.name = "DiveSun"
        diveSunNode.light = diveSun
        // A directional light shines along its node's -Z, so it looks from the sun toward the ground.
        diveSunNode.simdLook(at: -Self.diveKeyDirection, up: SIMD3<Float>(0, 1, 0), localFront: SIMD3<Float>(0, 0, -1))
        diveSunNode.isHidden = true
        scene.rootNode.addChildNode(diveSunNode)
        applyDiveSunQuality()
    }

    private func applyDiveSunQuality() {
        let ultra = qualityTier == .ultra
        diveSun.shadowMapSize = ultra ? CGSize(width: 2048, height: 2048) : CGSize(width: 1024, height: 1024)
        diveSun.shadowSampleCount = ultra ? 12 : 6
        syncDiveSunVisibility()
    }

    private func syncDiveSunVisibility() {
        let inStage = appMode == .arcade || appMode == .pulpRescue || appMode == .report
        diveSunNode.isHidden = !inStage || qualityTier == .low
    }

    /// Makes a self-lit shader material (black diffuse, colour written as emission) take the dive's
    /// deferred shadows. Measured off screen: unshadowed, it draws exactly as with `.constant`.
    static func useShadowReceivingLighting(_ material: SCNMaterial?) {
        guard let material else { return }
        material.lightingModel = .lambert
        material.diffuse.contents = PlatformColor.black
        material.ambient.contents = PlatformColor.black
        material.specular.contents = PlatformColor.black
    }

    /// Solid things cast the dive's shadows; glows, rings of light and see-through or additive parts
    /// do not (they are light, not objects). Shader-driven materials (the enamel and gum) are solid;
    /// plain constant materials without a shader are the glows.
    static func configureShadowCasting(_ root: SCNNode) {
        root.enumerateHierarchy { node, _ in
            guard let geometry = node.geometry else { return }
            let isLight = geometry.materials.contains { material in
                material.transparency < 0.999
                    || material.blendMode == .add
                    || !material.writesToDepthBuffer
                    || (material.lightingModel == .constant && material.shaderModifiers == nil)
            }
            if isLight { node.castsShadow = false }
        }
    }

    // MARK: - Mode & Stage Management

    public func setMode(_ mode: AppMode, selectedCityId: String = "toronto") {
        let prevMode = appMode
        appMode = mode
        syncMotionMonitorPolicy()
        syncDiveSunVisibility()
        let inStage = (mode == .arcade || mode == .pulpRescue || mode == .report)
        let inCompanion = (mode == .hub || mode == .brushAlong)

        companionNodes.rootNode.isHidden = !inCompanion
        activeStageNodes?.rootNode.isHidden = !inStage
        probeRig.rootNode.isHidden = !inStage
        // The Earth backdrop belongs to the hub sky. During Brush-Along the close mirror camera would
        // see it hanging over the teeth (seen in the simulator screenshots), so hide it there.
        cosmicNodes.rootNode.isHidden = inStage || mode == .brushAlong
        if !inStage {
            probeRig.flossBeamNode.isHidden = true
        }
        // A thumb or button held on the way out of a stage never carries into the next screen.
        if prevMode != mode { resetStageInput() }

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
                    pacerStage: pacerStage,
                    flossToolStyle: pacerFlossToolStyle,
                    mouthwashDurationSec: pacerMouthwashDurationSec,
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
        // The render thread may be in the middle of the old stage's frame (see `stageLock`): wait
        // for that frame to end, then keep it out until the new stage is whole.
        stageLock.lock()
        defer { stageLock.unlock() }
        self.activeSession = session
        resetStageInput()
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
        Self.useShadowReceivingLighting(stage.gingivaBedNode.geometry?.firstMaterial)
        Self.configureShadowCasting(stage.rootNode)
        // Tells the stage gum's shader to take the dive's far-side sun (see gingivaSurfaceModifierMSL).
        stage.gingivaBedNode.geometry?.firstMaterial?.setValue(
            NSValue(scnVector4: RenderBridge.scnVec4(18.0, 0.085, 1.0, 0)),
            forKey: "depthCueVec"
        )
        scene.rootNode.addChildNode(stage.rootNode)
        self.activeStageNodes = stage
        let skyline = CitySkylineBuilder.build(cartridge: cart)
        if let skyline { stage.rootNode.addChildNode(skyline.rootNode) }
        self.activeSkyline = skyline
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
        // Put the ship's model at this stage's start now. The camera aims at the model, and it
        // would otherwise open on where the last stage's ship stood and pan across the tooth.
        probeRig.rootNode.simdPosition = SIMD3<Float>(Float(snap.probePos.x), Float(snap.probeY + 0.52), Float(snap.probePos.z))
        probeRig.rootNode.simdEulerAngles = SIMD3<Float>(0, Float(-snap.probeFacingRad), 0)
    }

    // MARK: - Queued Actuator Actions From SwiftUI HUD

    // Nothing queues while the stage is paused: a finger lifted after the pause card opened must
    // not fire on Resume (the web's pause card covers the buttons).
    public func requestSmartFloss() {
        guard !arcadePaused else { return }
        stageInput.withLock {
            $0.pendingFlossFire = true
            $0.pendingFlossAimPos = nil
            $0.pendingFlossAimDir = nil
        }
    }

    /// The aim point is worked out by the step that fires it, from where HYDRA-1 is then: the
    /// session belongs to the render thread and is not read from here.
    public func requestDirectionalFloss(dir: Vec2) {
        guard !arcadePaused, activeSession != nil else { return }
        stageInput.withLock {
            $0.pendingFlossFire = true
            $0.pendingFlossAimPos = nil
            $0.pendingFlossAimDir = dir
        }
    }

    public func requestIonRinse() {
        guard !arcadePaused else { return }
        stageInput.withLock { $0.pendingRinseFire = true }
    }

    public func requestDiscloseScan() {
        guard !arcadePaused else { return }
        stageInput.withLock { $0.pendingDiscloseFire = true }
    }

    public func setVirtualStick(moveX: Double, moveZ: Double, held: Bool) {
        stageInput.withLock {
            $0.stickMoveX = moveX
            $0.stickMoveZ = moveZ
            $0.stickScrubHeld = held
        }
    }

    /// The Prologue's hardness chips pick a 3D crystal.
    public func selectCosmicMohs(_ index: Int) {
        cosmicNodes.selectMohsSpecimen(index)
    }

    /// Lets go of everything a stage was being told: the stick, a finger on the tooth and any floss,
    /// Surge or Scan still waiting for the next step. Called on pause, on leaving a stage, when a
    /// finale starts and when a new stage mounts (web twin: `releaseThumbPad` + `setVirtualMove(0, 0,
    /// false)` in `TelemetryHudOverlay.setPaused`).
    public func resetStageInput() {
        stageInput.withLock { $0 = StageInput() }
        lastTapTimeSec = nil
        pointerEpoch &+= 1
        touchSystem.endTouch()
    }

    /// The Mac's right-click: floss toward the point under the pointer, as on the web (a click with
    /// no ground under it falls back to the automatic aim).
    public func requestFlossToward(_ point: CGPoint, in scnView: SCNView) {
        guard !arcadePaused, appMode == .arcade || appMode == .pulpRescue else { return }
        // The hit test is a SceneKit call: done before the lock is taken, never inside it.
        let aim = arcadeGroundPoint(at: point, in: scnView)
        stageInput.withLock {
            $0.pendingFlossFire = true
            $0.pendingFlossAimPos = aim
            $0.pendingFlossAimDir = nil
        }
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
            guard !arcadePaused else { return }
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
            guard !arcadePaused else { return }
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
        stageInput.withLock { $0.directTouchWorldPos = nil }
        brushUserDragging = false
        if appMode == .hub {
            touchSystem.endTouch()
        }
    }

    private func updateArcadeGroundTarget(at point: CGPoint, in scnView: SCNView) {
        guard let target = arcadeGroundPoint(at: point, in: scnView) else { return }
        stageInput.withLock { $0.directTouchWorldPos = target }
    }

    /// Where a screen point lands on the stage's tooth surface (kept inside the stage), or nil.
    private func arcadeGroundPoint(at point: CGPoint, in scnView: SCNView) -> Vec2? {
        guard let cart = activeSession?.cartridge else { return nil }
        let nearPt = scnView.unprojectPoint(SCNVector3(Float(point.x), Float(point.y), 0.0))
        let farPt = scnView.unprojectPoint(SCNVector3(Float(point.x), Float(point.y), 1.0))
        let rayOrigin = SIMD3<Float>(Float(nearPt.x), Float(nearPt.y), Float(nearPt.z))
        let rayEnd = SIMD3<Float>(Float(farPt.x), Float(farPt.y), Float(farPt.z))
        let dir = rayEnd - rayOrigin
        guard abs(dir.y) > 1e-4 else { return nil }
        let planeY: Float = 0.55
        let t = (planeY - rayOrigin.y) / dir.y
        guard t > 0 else { return nil }
        let hit = rayOrigin + dir * t
        let wx = max(1.0, min(cart.worldWidth - 1.0, Double(hit.x)))
        let wz = max(1.0, min(cart.worldDepth - 1.0, Double(hit.z)))
        return Vec2(x: wx, z: wz)
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

        // Step 120Hz CoreMotion gyro/gravity slosh & handheld wet-enamel parallax (0-cost no-op when inactive)
        let rawMotion = MotionTiltMonitor.shared.latestSample()
        latestGyroSnapshot = gyroSim.step(
            dt: dtFloat,
            gravityX: rawMotion.screenGravityX,
            gravityY: rawMotion.screenGravityY,
            rotationRateMag: rawMotion.rotationRateMag,
            userAccelX: rawMotion.screenUserAccelX,
            userAccelY: rawMotion.screenUserAccelY,
            sensorAvailable: rawMotion.available,
            reducedMotion: reducedMotion
        )

        // Update Cosmic Orbital Earth + Mohs Showcase only when visible
        if !cosmicNodes.rootNode.isHidden {
            cosmicNodes.update(
                dt: dtFloat,
                nowSec: sceneNowSec,
                reducedMotion: reducedMotion,
                audioBands: smoothedAudioBands
            )
        }

        if appMode == .arcade || appMode == .pulpRescue || appMode == .report {
            // Tried, never waited for: while the main thread mounts a new stage, this frame is
            // drawn as it stands (the stage's camera too: it reads the same state).
            if stageLock.try() {
                updateArcadeFrame(rawDt: rawDt, dtFloat: dtFloat, motionTime: motionTime)
                updateCameraRig(dt: dtFloat)
                stageLock.unlock()
            }
        } else {
            if appMode == .hub || appMode == .brushAlong {
                updateCompanionFrame(dt: dtFloat, motionTime: motionTime)
            }
            updateCameraRig(dt: dtFloat)
        }
        hasRenderedFirstFrame = true
    }

    private func updateCompanionFrame(dt: Float, motionTime: Float) {
        touchSystem.step(dt: Double(dt), nowSec: Double(sceneNowSec))

        // Subtle 120Hz wet-enamel specular glint as the user naturally tilts the iPhone in hand
        let gyro = latestGyroSnapshot
        companionEnamelController.setHeadlamp(
            worldPos: SIMD3<Float>(
                32.0 + gyro.parallaxX * 12.5,
                14.0 + gyro.parallaxY * 7.0,
                44.0
            ),
            weight: 0.16,
            depthStart: 54.0,
            depthDensity: 0.018
        )

        let activeQuad: Int
        var completedQuadMask: Int = 0
        var activeSurfaceIdx: Int = -1
        var preEcho01: Float = 0.0
        var upcomingQuad: Int = -1
        var pacerFoamOrigin: Vec2 = .zero
        var pacerFoamStrength: Float = 0
        var rinseGyroEncoding: Vec2 = .zero

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
                pacerStage: pacerStage,
                flossToolStyle: pacerFlossToolStyle,
                mouthwashDurationSec: pacerMouthwashDurationSec,
                gyroSloshX: gyro.sloshPosition,
                gyroPump01: gyro.pumpPulse01,
                gyroHandheld01: gyro.handheldBlend01,
                nowSec: sceneNowSec,
                reducedMotion: reducedMotion
            )
            latestPacerCoachState = coach
            activeQuad = coach.activeQuadrant
            completedQuadMask = coach.completedQuadMask
            activeSurfaceIdx = coach.activeSurfaceIdx
            preEcho01 = coach.preEcho01
            upcomingQuad = coach.upcomingQuadrant
            companionEnamelController.setHighlightedCrown(
                index: coach.activeCrownIndex >= 0 ? coach.activeCrownIndex : nil,
                pulse01: 1.0
            )
            pacerFoamOrigin = Vec2(x: Double(coach.contactWorldPos.x), z: Double(coach.contactWorldPos.z))
            switch pacerStage {
            case .brushing:
                pacerFoamStrength = 0.90
            case .flossBonus:
                pacerFoamStrength = 0.42
            case .mouthwashBonus:
                pacerFoamStrength = 0.64 + gyro.pumpPulse01 * gyro.handheldBlend01 * 0.30
                rinseGyroEncoding = Vec2(x: Double(gyro.sloshPosition), z: Double(gyro.handheldBlend01))
                let handheldChanged = (gyro.isHandheld != lastPublishedHandheld)
                if gyro.didTriggerSplash || handheldChanged || (sceneNowSec - lastGyroUiPublishSec >= 0.045) {
                    lastGyroUiPublishSec = sceneNowSec
                    lastPublishedHandheld = gyro.isHandheld
                    if let cb = onMouthwashGyroUpdated {
                        DispatchQueue.main.async { cb(gyro) }
                    }
                }
            }
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
            activeQuadrant: activeQuad,
            completedQuadMask: completedQuadMask,
            activeSurfaceIdx: activeSurfaceIdx,
            preEcho01: preEcho01,
            upcomingQuadrant: upcomingQuad
        )
        companionEnamelController.updateFrameUniforms(
            EnamelFrameUniforms(
                nowSec: sceneNowSec,
                motionTimeSec: motionTime,
                rinseOrigin: rinseGyroEncoding,
                probePosition: pacerFoamOrigin,
                probeFoamRadius: 1.55,
                probeFoamStrength: pacerFoamStrength,
                audioBands: smoothedAudioBands
            )
        )

        // Ripples and splats: copied out of the touch system under its lock into reused buffers, then
        // into the shader slots, without a heap allocation per frame.
        let rippleNowSec = Double(sceneNowSec)
        touchSystem.fillActiveRipples(nowSec: rippleNowSec, into: &rippleScratch)
        rippleUpload.refill(
            with: { out in
                for r in self.rippleScratch {
                    out.append(
                        CrownTouchRipple(
                            position: SIMD3<Float>(Float(r.x), Float(r.y), Float(r.z)),
                            // The ripple's own start (now - age): steady from frame to frame, so the
                            // shader's shadow check does not re-upload an unchanged ripple.
                            startTime: Float(rippleNowSec - r.ageSec)
                        )
                    )
                }
            },
            deliver: { ripples in
                self.companionEnamelController.setTouchRipples(ripples)
            }
        )

        touchSystem.fillRenderSplats(into: &splatScratch)
        splatUpload.refill(
            with: { out in
                for s in self.splatScratch {
                    out.append(
                        SugarPlaqueSplat(
                            position: SIMD3<Float>(Float(s.x), Float(s.y), Float(s.z)),
                            amount: Float(s.amount)
                        )
                    )
                }
            },
            deliver: { splats in
                self.companionEnamelController.setSugarSplats(splats)
                self.companionNodes.updateSugarSplats(splats)
            }
        )
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

        if arcadePaused {
            accumulator = 0
        }
        if appMode != .report && !session.isCompleted && !arcadePaused {
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

                // Taken and cleared in one go, so a tap from the main thread is in this step or
                // the next, never dropped between the two.
                let held = stageInput.withLock { input -> StageInput in
                    let taken = input
                    input.clearPending()
                    return taken
                }
                var aimWorldPos = held.pendingFlossAimPos
                if aimWorldPos == nil, let dir = held.pendingFlossAimDir {
                    aimWorldPos = Vec2(
                        x: session.probePos.x + dir.x * GameConfig.flossLength,
                        z: session.probePos.z + dir.z * GameConfig.flossLength
                    )
                }
                let input = SessionInputCommand(
                    moveX: held.stickMoveX,
                    moveZ: held.stickMoveZ,
                    directTargetWorldPos: held.directTouchWorldPos,
                    scrubHeld: held.stickScrubHeld || (held.directTouchWorldPos != nil),
                    aimWorldPos: aimWorldPos,
                    fireFlossRequested: held.pendingFlossFire,
                    fireRinseRequested: held.pendingRinseFire,
                    fireDiscloseRequested: held.pendingDiscloseFire
                )

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
        activeSkyline?.update(
            dt: dtFloat,
            nowSec: motionTime,
            cleanRatios: snap.districtCleanRatios,
            sealed: snap.sealedDistricts,
            reducedMotion: reducedMotion
        )
        if cachedArcadeSnapshot == nil {
            cachedArcadeSnapshot = snap
        }
        probeRig.updateAnimation(
            dt: dtFloat,
            nowSec: sceneNowSec,
            probeSpeed: Float(snap.probeSpeed),
            isScrubbing: snap.scrubActive && !arcadePaused,
            surgeFraction01: Float(snap.surgeMeter / GameConfig.surgeMax),
            audioBass: smoothedAudioBands.x
        )

        // No brushing foam behind the pause card (web twin: scrubbingActive in main.ts).
        if snap.scrubActive && !arcadePaused && sceneNowSec - lastFoamSampleSec > 0.09 {
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
                // No brushing glow behind the pause card (the last snapshot may still say scrubbing).
                probeFoamStrength: snap.scrubActive && !arcadePaused ? 1.0 : 0.2,
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
            // The chevrons point through the gap (as on the web), whichever way the gap runs.
            let ex = zipHint.exit.x - zipHint.entry.x
            let ez = zipHint.exit.z - zipHint.entry.z
            stage.zipReticleNode.simdEulerAngles.y = Float(-atan2(ez, ex))
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
                Self.configureShadowCasting(created)
                // A child of the stage (whose root sits at the world origin, so world placement is
                // unchanged): hidden with it on Home and torn down with it on the next mount.
                stage.rootNode.addChildNode(created)
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
                Self.configureShadowCasting(created)
                stage.rootNode.addChildNode(created)
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
            let gyroYaw = latestGyroSnapshot.parallaxX * 0.085
            let gyroLift = latestGyroSnapshot.parallaxY * 0.85
            let sinYaw = sin(cosmicOrbitYaw + gyroYaw)
            let cosYaw = cos(cosmicOrbitYaw + gyroYaw)
            switch cosmicBeatIndex {
            case 0:
                // Beat 0: Stellar Forge & Hydroxyapatite Lattice centered at ~25% from top (top 1/3 hero!)
                let dist: Float = isPortrait ? 20.0 : 15.5
                return (
                    showcaseCenter + SIMD3<Float>(sinYaw * dist, (isPortrait ? -4.2 : 0.4) + gyroLift, cosYaw * dist),
                    showcaseCenter + SIMD3<Float>(0, isPortrait ? -6.2 : -1.8, 0)
                )
            case 1:
                // Beat 1: Lattice + 5 Mohs Specimens spanning ~13%..36% from top above the story card
                let dist: Float = isPortrait ? 21.5 : 15.0
                return (
                    showcaseCenter + SIMD3<Float>(sinYaw * dist * 0.45, (isPortrait ? -6.4 : -2.6) + gyroLift, 2.2 + cosYaw * dist),
                    showcaseCenter + SIMD3<Float>(0, isPortrait ? -8.4 : -4.8, 2.2)
                )
            case 2:
                // Beat 2: Fluorapatite 9F Crystal Lock closeup in upper hero third (~14%..37% from top)
                let dist: Float = isPortrait ? 17.5 : 13.5
                return (
                    showcaseCenter + SIMD3<Float>(sinYaw * dist, (isPortrait ? -3.6 : 0.2) + gyroLift, cosYaw * dist),
                    showcaseCenter + SIMD3<Float>(0, isPortrait ? -5.4 : -1.5, 0)
                )
            default:
                // Beat 3: Full 3D Orbital Earth, Polar Aurora & LEO Station Aurora filling ~10%..51% from top
                let dist: Float = isPortrait ? 74.0 : 48.0
                return (
                    earthCenter + SIMD3<Float>(sinYaw * dist, (isPortrait ? -11.5 : -1.0) + gyroLift * 2.0, cosYaw * dist),
                    earthCenter + SIMD3<Float>(0, isPortrait ? -18.5 : -6.5, 0)
                )
            }

        case .hub:
            let archCenter = SIMD3<Float>(32.0, 1.4, 15.6)
            let dist: Float = isPortrait ? 36.5 : 22.0
            let effYaw = hubOrbitYaw + latestGyroSnapshot.parallaxX * 0.085
            let effPitch = max(0.08, min(0.88, hubOrbitPitch - latestGyroSnapshot.parallaxY * 0.048))
            let x = archCenter.x + sin(effYaw) * cos(effPitch) * dist
            let y = archCenter.y + sin(effPitch) * dist
            let z = archCenter.z + cos(effYaw) * cos(effPitch) * dist
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
        let rate: Float = appMode == .brushAlong ? 6.8 : 7.5
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

/// Hands a shader setter this frame's values in a reused array without copying it.
///
/// `EnamelMaterialController.setTouchRipples` and `setSugarSplats` keep the last array they accepted
/// (their shadow copy, compared to skip unchanged uploads). Refilling that same array next frame
/// would copy it first (copy-on-write): a heap allocation at 120 Hz. So two buffers take turns: the
/// one the setter holds is never written, and the other is emptied and refilled in place.
private struct ShadowSafeFrameBuffer<Element: Equatable> {
    private var bufferA: [Element] = []
    private var bufferB: [Element] = []
    /// The buffer the setter holds: true = A, false = B, nil = neither yet (it holds nil or nothing).
    private var setterHoldsA: Bool?

    init(capacity: Int) {
        bufferA.reserveCapacity(capacity)
        bufferB.reserveCapacity(capacity)
    }

    /// Empties the buffer the setter does not hold, lets `fill` append this frame's values, then
    /// passes it to `deliver`, which must hand it to a setter that keeps it only when it differs from
    /// the array it kept last time (as the enamel setters do).
    mutating func refill(with fill: (inout [Element]) -> Void, deliver: ([Element]) -> Void) {
        if setterHoldsA == true {
            bufferB.removeAll(keepingCapacity: true)
            fill(&bufferB)
            let changed = bufferB != bufferA
            deliver(bufferB)
            if changed { setterHoldsA = false }
        } else {
            bufferA.removeAll(keepingCapacity: true)
            fill(&bufferA)
            let changed = setterHoldsA == nil || bufferA != bufferB
            deliver(bufferA)
            if changed { setterHoldsA = true }
        }
    }
}
