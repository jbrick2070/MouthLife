import Foundation
import MouthLifeCore
import SceneKit
import simd

// MARK: - Tooth Anatomy & Return Container Types

public enum ToothKind: String, CaseIterable, Codable, Sendable {
    case centralIncisor
    case lateralIncisor
    case canine
    case premolar
    case molar
}

public struct CompanionCrownFrame: Equatable, Sendable {
    public let index: Int
    public let name: String
    public let kind: ToothKind
    public let quadrantIndex: Int
    public let localPosition: SIMD3<Float>
    public let worldPosition: SIMD3<Float>
    public let halfWidth: Float
    public let halfDepth: Float
    public let halfHeight: Float
    public let yawRadians: Float
}

public final class CompanionArchNodes {
    public let rootNode: SCNNode
    public let archContainerNode: SCNNode
    public let crownNodes: [SCNNode]
    public let crownFrames: [CompanionCrownFrame]
    public let gingivaNode: SCNNode
    public let gingivaMaterial: SCNMaterial
    public let sugarSplatNodes: [SCNNode]
    public let polishHaloNode: SCNNode

    public init(
        rootNode: SCNNode,
        archContainerNode: SCNNode,
        crownNodes: [SCNNode],
        crownFrames: [CompanionCrownFrame],
        gingivaNode: SCNNode,
        gingivaMaterial: SCNMaterial,
        sugarSplatNodes: [SCNNode],
        polishHaloNode: SCNNode
    ) {
        self.rootNode = rootNode
        self.archContainerNode = archContainerNode
        self.crownNodes = crownNodes
        self.crownFrames = crownFrames
        self.gingivaNode = gingivaNode
        self.gingivaMaterial = gingivaMaterial
        self.sugarSplatNodes = sugarSplatNodes
        self.polishHaloNode = polishHaloNode
    }

    /// Updates 3D sticky sugar-plaque overlay blobs on the Companion Arch (0..6 active splats).
    public func updateSugarSplats(_ splats: [SugarPlaqueSplat]) {
        let rootPos = rootNode.simdPosition
        for (idx, node) in sugarSplatNodes.enumerated() {
            guard idx < splats.count, splats[idx].amount > 0.01 else {
                node.isHidden = true
                continue
            }
            let sp = splats[idx]
            node.isHidden = false
            node.simdPosition = sp.position - rootPos
            let scale = 0.42 + 0.58 * sp.amount
            node.simdScale = SIMD3<Float>(scale, scale * 0.55, scale)
            node.opacity = CGFloat(min(0.88, 0.30 + sp.amount * 0.60))
        }
    }

    /// Animates the floating Smooth Bask crystalline motes halo above the arch when smoothness >= 85%.
    public func updatePolishHalo(smoothnessIndex: Double, nowSec: Float, reducedMotion: Bool = false) {
        let visible = smoothnessIndex >= GameConfig.smoothBaskThreshold
        polishHaloNode.isHidden = !visible
        guard visible else { return }
        let t = reducedMotion ? Float(0) : nowSec
        polishHaloNode.simdEulerAngles = SIMD3<Float>(0, sin(t * 0.35) * 0.08, 0)
        let norm = Float(min(1.0, max(0.0, (smoothnessIndex - 84.0) / 16.0)))
        polishHaloNode.opacity = CGFloat(0.45 + 0.55 * norm)
    }
}

public struct MohsSpecimenDescriptor: Equatable, Sendable {
    public let index: Int
    public let name: String
    public let mohsLabel: String
    public let accentHex: UInt32
    public let localCenter: SIMD3<Float>
}

public final class CosmicBackdropNodes {
    public let rootNode: SCNNode
    public let starfieldNode: SCNNode
    public let earthPivotNode: SCNNode
    public let earthGlobeNode: SCNNode
    public let earthGlobeMaterial: SCNMaterial
    public let atmosphereHaloNode: SCNNode
    public let cityBeaconNodes: [String: SCNNode]
    public let stationOrbitPivotNode: SCNNode
    public let stationAuroraNode: SCNNode
    public let cosmicShowcaseNode: SCNNode
    public let hydroxyapatiteCrystalNode: SCNNode
    public let atomicOrbitNode: SCNNode
    public let fluorideLockNode: SCNNode
    public let mohsLineupNode: SCNNode
    public let mohsSpecimenNodes: [SCNNode]
    public let mohsCompanionMineralNodes: [SCNNode]
    public let mohsSelectionRingNode: SCNNode
    public let mohsDescriptors: [MohsSpecimenDescriptor]

    public private(set) var selectedCityId: String = "toronto"
    public private(set) var selectedMohsIndex: Int = 2
    public var autoSpin: Bool = true
    private var targetEarthRotY: Float = -0.35
    private var targetEarthRotX: Float = 0.28
    private var cosmicBeatIndex: Int = 0
    private let cities: [HostCityDef]

    public init(
        rootNode: SCNNode,
        starfieldNode: SCNNode,
        earthPivotNode: SCNNode,
        earthGlobeNode: SCNNode,
        earthGlobeMaterial: SCNMaterial,
        atmosphereHaloNode: SCNNode,
        cityBeaconNodes: [String: SCNNode],
        stationOrbitPivotNode: SCNNode,
        stationAuroraNode: SCNNode,
        cosmicShowcaseNode: SCNNode,
        hydroxyapatiteCrystalNode: SCNNode,
        atomicOrbitNode: SCNNode,
        fluorideLockNode: SCNNode,
        mohsLineupNode: SCNNode,
        mohsSpecimenNodes: [SCNNode],
        mohsCompanionMineralNodes: [SCNNode],
        mohsSelectionRingNode: SCNNode,
        mohsDescriptors: [MohsSpecimenDescriptor],
        cities: [HostCityDef]
    ) {
        self.rootNode = rootNode
        self.starfieldNode = starfieldNode
        self.earthPivotNode = earthPivotNode
        self.earthGlobeNode = earthGlobeNode
        self.earthGlobeMaterial = earthGlobeMaterial
        self.atmosphereHaloNode = atmosphereHaloNode
        self.cityBeaconNodes = cityBeaconNodes
        self.stationOrbitPivotNode = stationOrbitPivotNode
        self.stationAuroraNode = stationAuroraNode
        self.cosmicShowcaseNode = cosmicShowcaseNode
        self.hydroxyapatiteCrystalNode = hydroxyapatiteCrystalNode
        self.atomicOrbitNode = atomicOrbitNode
        self.fluorideLockNode = fluorideLockNode
        self.mohsLineupNode = mohsLineupNode
        self.mohsSpecimenNodes = mohsSpecimenNodes
        self.mohsCompanionMineralNodes = mohsCompanionMineralNodes
        self.mohsSelectionRingNode = mohsSelectionRingNode
        self.mohsDescriptors = mohsDescriptors
        self.cities = cities
        focusOnCity("toronto")
    }

    public func focusOnCity(_ cityId: String) {
        let city = cities.first(where: { $0.id == cityId }) ?? cities.first
        selectedCityId = city?.id ?? cityId
        autoSpin = false
        if let city {
            let lonRad = Float((city.lon + 180.0) * .pi / 180.0)
            let latRad = Float(city.lat * .pi / 180.0)
            targetEarthRotY = -lonRad + .pi * 0.5
            targetEarthRotX = latRad * 0.55
        }
    }

    public func enableGentleAutoSpin() {
        autoSpin = true
    }

    public func setCosmicIntroState(visible: Bool, beatIndex: Int = 0) {
        cosmicShowcaseNode.isHidden = !visible
        cosmicBeatIndex = beatIndex
        mohsLineupNode.isHidden = !(visible && beatIndex == 1)
        fluorideLockNode.isHidden = !(visible && beatIndex >= 2)
    }

    public func selectMohsSpecimen(_ index: Int) {
        let clamped = min(max(0, index), max(0, mohsDescriptors.count - 1))
        selectedMohsIndex = clamped
        guard clamped < mohsDescriptors.count else { return }
        let desc = mohsDescriptors[clamped]
        mohsSelectionRingNode.simdPosition = SIMD3<Float>(desc.localCenter.x, desc.localCenter.y - 0.74, desc.localCenter.z)
        if let mat = mohsSelectionRingNode.geometry?.firstMaterial {
            mat.emission.contents = RenderBridge.color(hex: desc.accentHex)
            mat.diffuse.contents = RenderBridge.color(hex: desc.accentHex)
        }
    }

    public func cityWorldPosition(_ cityId: String) -> SIMD3<Float>? {
        guard let node = cityBeaconNodes[cityId] else { return nil }
        let wt = node.simdWorldTransform
        return SIMD3<Float>(wt.columns.3.x, wt.columns.3.y, wt.columns.3.z)
    }

    public func update(dt: Float, nowSec: Float, reducedMotion: Bool = false) {
        let t = reducedMotion ? Float(0) : nowSec
        EnamelShaders.updateEarthGlobeTime(earthGlobeMaterial, timeSec: t)

        // Orbit Station Aurora along 408 km LEO inclined ring
        stationOrbitPivotNode.simdEulerAngles.z = t * 0.38

        for city in cities {
            guard let pin = cityBeaconNodes[city.id] else { continue }
            let isSel = (city.id == selectedCityId)
            let base: Float = city.isOrbital ? 1.0 : (city.playableInSlice ? 1.32 : 0.95)
            let pulse: Float = isSel ? (1.18 + 0.14 * sin(t * 5.0)) : 1.0
            pin.simdScale = SIMD3<Float>(repeating: base * pulse)
        }

        if autoSpin {
            if !reducedMotion {
                earthPivotNode.simdEulerAngles.y += dt * 0.08
            }
            earthPivotNode.simdEulerAngles.x += (0.24 - earthPivotNode.simdEulerAngles.x) * min(1.0, dt * 2.5)
        } else {
            earthPivotNode.simdEulerAngles.y += (targetEarthRotY - earthPivotNode.simdEulerAngles.y) * min(1.0, dt * 4.2)
            earthPivotNode.simdEulerAngles.x += (targetEarthRotX - earthPivotNode.simdEulerAngles.x) * min(1.0, dt * 4.2)
        }

        guard !cosmicShowcaseNode.isHidden else { return }

        hydroxyapatiteCrystalNode.simdEulerAngles = SIMD3<Float>(0, t * 0.55, sin(t * 0.9) * 0.12)
        atomicOrbitNode.simdEulerAngles = SIMD3<Float>(sin(t * 0.5) * 0.25, -t * 0.72, 0)

        if cosmicBeatIndex == 0 {
            let s = 0.58 + 0.10 * sin(t * 2.2)
            hydroxyapatiteCrystalNode.simdScale = SIMD3<Float>(repeating: s)
            atomicOrbitNode.simdScale = SIMD3<Float>(repeating: 1.32)
        } else if cosmicBeatIndex == 1 {
            hydroxyapatiteCrystalNode.simdScale = SIMD3<Float>(repeating: 1.0)
            atomicOrbitNode.simdScale = SIMD3<Float>(repeating: 0.95)
        } else {
            hydroxyapatiteCrystalNode.simdScale = SIMD3<Float>(repeating: 1.06)
            atomicOrbitNode.simdScale = SIMD3<Float>(repeating: 0.88)
            fluorideLockNode.simdEulerAngles.y = t * 1.35
            let lockScale = 0.80 + 0.12 * sin(t * 3.2)
            fluorideLockNode.simdScale = SIMD3<Float>(repeating: lockScale)
        }

        if !mohsLineupNode.isHidden {
            mohsSelectionRingNode.simdEulerAngles.y = t * 1.2
            for (idx, specNode) in mohsSpecimenNodes.enumerated() {
                let isSel = (idx == selectedMohsIndex)
                let baseCenter = mohsDescriptors[idx].localCenter
                let lift: Float = isSel ? (0.34 + 0.08 * sin(t * 3.0)) : 0.0
                specNode.simdPosition = SIMD3<Float>(baseCenter.x, baseCenter.y + lift, baseCenter.z)
                specNode.simdEulerAngles.y = t * (isSel ? 1.45 : 0.55) + Float(idx) * 1.1
                specNode.simdScale = SIMD3<Float>(repeating: isSel ? 1.35 : 1.0)
            }
            for (idx, compNode) in mohsCompanionMineralNodes.enumerated() {
                compNode.simdEulerAngles.y = -t * 0.48 + Float(idx) * 0.9
            }
        }
    }
}

public final class CartridgeStageNodes {
    public let rootNode: SCNNode
    public let enamelTerrainNode: SCNNode
    public let contactRidgesNode: SCNNode?
    public let gingivaBedNode: SCNNode
    public let salivaSpringNodes: [SCNNode]
    public let commensalSiteNodes: [String: SCNNode]
    public let sucroseCrystalNodes: [String: SCNNode]
    public let biofilmBridgeNodes: [String: SCNNode]
    public let epsDomeNodes: [String: SCNNode]
    public let relayBeaconNodes: [SCNNode]
    public let zipReticleNode: SCNNode
    public let landmarkColors: LandmarkPaletteColors

    public init(
        rootNode: SCNNode,
        enamelTerrainNode: SCNNode,
        contactRidgesNode: SCNNode?,
        gingivaBedNode: SCNNode,
        salivaSpringNodes: [SCNNode],
        commensalSiteNodes: [String: SCNNode],
        sucroseCrystalNodes: [String: SCNNode],
        biofilmBridgeNodes: [String: SCNNode],
        epsDomeNodes: [String: SCNNode],
        relayBeaconNodes: [SCNNode],
        zipReticleNode: SCNNode,
        landmarkColors: LandmarkPaletteColors
    ) {
        self.rootNode = rootNode
        self.enamelTerrainNode = enamelTerrainNode
        self.contactRidgesNode = contactRidgesNode
        self.gingivaBedNode = gingivaBedNode
        self.salivaSpringNodes = salivaSpringNodes
        self.commensalSiteNodes = commensalSiteNodes
        self.sucroseCrystalNodes = sucroseCrystalNodes
        self.biofilmBridgeNodes = biofilmBridgeNodes
        self.epsDomeNodes = epsDomeNodes
        self.relayBeaconNodes = relayBeaconNodes
        self.zipReticleNode = zipReticleNode
        self.landmarkColors = landmarkColors
    }

    public func updateCommensalSite(id: String, restored: Bool, localCleanRatio: Double, nowSec: Float) {
        guard let siteRoot = commensalSiteNodes[id] else { return }
        let core = siteRoot.childNode(withName: "colony_core", recursively: false)
        let halo = siteRoot.childNode(withName: "colony_halo", recursively: false)
        let hex = restored ? landmarkColors.colonyRestoredHex : landmarkColors.colonyBeaconHex
        if let mat = core?.geometry?.firstMaterial {
            mat.diffuse.contents = RenderBridge.color(hex: hex)
            mat.emission.contents = RenderBridge.color(hex: hex, alpha: restored ? 0.55 : 0.25)
        }
        let clean01 = Float(min(1.0, max(0.0, localCleanRatio)))
        let scale: Float = restored ? (1.12 + 0.08 * sin(nowSec * 3.4)) : (0.85 + 0.20 * clean01)
        core?.simdScale = SIMD3<Float>(repeating: scale)
        core?.simdEulerAngles.y = nowSec * (restored ? 1.5 : 0.65)
        halo?.isHidden = !restored
        if restored {
            halo?.simdEulerAngles.y = -nowSec * 0.95
        }
    }
}

public final class HydraProbeRig {
    public let rootNode: SCNNode
    public let hullNode: SCNNode
    public let outerEmitterRingNode: SCNNode
    public let innerEmitterRingNode: SCNNode
    public let surgeCoreNode: SCNNode
    public let bristleGroupNode: SCNNode
    public let sweepConeNode: SCNNode
    public let flossBeamNode: SCNNode

    private var flossRemainingSec: Float = 0

    public init(
        rootNode: SCNNode,
        hullNode: SCNNode,
        outerEmitterRingNode: SCNNode,
        innerEmitterRingNode: SCNNode,
        surgeCoreNode: SCNNode,
        bristleGroupNode: SCNNode,
        sweepConeNode: SCNNode,
        flossBeamNode: SCNNode
    ) {
        self.rootNode = rootNode
        self.hullNode = hullNode
        self.outerEmitterRingNode = outerEmitterRingNode
        self.innerEmitterRingNode = innerEmitterRingNode
        self.surgeCoreNode = surgeCoreNode
        self.bristleGroupNode = bristleGroupNode
        self.sweepConeNode = sweepConeNode
        self.flossBeamNode = flossBeamNode
    }

    public func triggerFlossBeam(from startWorld: SIMD3<Float>, to endWorld: SIMD3<Float>, zipped: Bool = false) {
        let delta = endWorld - startWorld
        let dist = max(0.05, simd_length(delta))
        let mid = (startWorld + endWorld) * 0.5
        flossBeamNode.isHidden = false
        flossBeamNode.simdPosition = mid
        flossBeamNode.simdScale = SIMD3<Float>(zipped ? 1.45 : 1.0, dist, zipped ? 1.45 : 1.0)

        let up = SIMD3<Float>(0, 1, 0)
        let dir = delta / dist
        if abs(simd_dot(up, dir)) > 0.999 {
            flossBeamNode.simdOrientation = simd_quatf(angle: 0, axis: SIMD3<Float>(1, 0, 0))
        } else {
            flossBeamNode.simdOrientation = simd_quatf(from: up, to: dir)
        }
        flossRemainingSec = zipped ? 0.30 : 0.20
    }

    public func updateAnimation(
        dt: Float,
        nowSec: Float,
        probeSpeed: Float,
        isScrubbing: Bool,
        surgeFraction01: Float
    ) {
        let spinRate: Float = (isScrubbing ? 12.0 : 3.2) + probeSpeed * 0.85
        outerEmitterRingNode.simdEulerAngles.x += dt * spinRate
        innerEmitterRingNode.simdEulerAngles.x -= dt * spinRate * 1.35

        // Sonic micro-oscillation on front bristle head when scrubbing
        if isScrubbing {
            bristleGroupNode.simdPosition.z = sin(nowSec * 52.0) * 0.045
            sweepConeNode.opacity = CGFloat(0.42 + 0.14 * sin(nowSec * 18.0))
        } else {
            bristleGroupNode.simdPosition.z = 0
            sweepConeNode.opacity = 0.24
        }

        // Surge core brightness & scale inside the translucent cockpit canopy
        let surge = min(1, max(0, surgeFraction01))
        let readyPulse: Float = surge >= 0.999 ? (1.18 + 0.18 * sin(nowSec * 8.0)) : (0.65 + 0.45 * surge)
        surgeCoreNode.simdScale = SIMD3<Float>(repeating: readyPulse)

        if flossRemainingSec > 0 {
            flossRemainingSec -= dt
            if flossRemainingSec <= 0 {
                flossBeamNode.isHidden = true
            } else {
                flossBeamNode.opacity = CGFloat(min(1.0, flossRemainingSec / 0.20))
            }
        }
    }
}

// MARK: - Procedural 3D Mesh Builder

public enum ProceduralMeshBuilder {

    // MARK: Built-in Default Host Cities (matches hostsAndHistory.ts)

    public static let defaultHostCities: [HostCityDef] = [
        HostCityDef(
            id: "toronto",
            worldId: "world_1",
            city: "Toronto",
            country: "Canada",
            lat: 43.65,
            lon: -79.38,
            isOrbital: false,
            hostName: "Maya Lin-Okafor",
            hostRole: "Civic Wood & Glass Architect",
            hostSkinToneHex: "#844D2E",
            hostAccentHex: "#38bdf8",
            unlockStampsRequired: 0,
            playableInSlice: true,
            scenarioSummary: "Morning pellicle & first-molar fissure colonies.",
            historyNoteId: "1498_beijing_1683_delft",
            signatureTreat: RegionalTreatDef(
                id: "treat_toronto_espresso",
                name: "Maple Oat Cortado & Croissant",
                city: "Toronto",
                emoji: "☕",
                phDropNote: "Warm pastry starches lodge in molar fissures."
            )
        ),
        HostCityDef(
            id: "new_orleans",
            worldId: "world_2",
            city: "New Orleans",
            country: "United States",
            lat: 29.95,
            lon: -90.07,
            isOrbital: false,
            hostName: "Marcus & Celine Beaumont",
            hostRole: "Brass & Acoustic Luthiers",
            hostSkinToneHex: "#5D331E",
            hostAccentHex: "#fb7185",
            unlockStampsRequired: 4,
            playableInSlice: true,
            scenarioSummary: "Delicate gingival sulcus pockets & tight interdental contacts.",
            historyNoteId: "1819_1948_new_orleans",
            signatureTreat: RegionalTreatDef(
                id: "treat_nola_beignet",
                name: "Powdered Café Beignet",
                city: "New Orleans",
                emoji: "🍩",
                phDropNote: "Fine sucrose dissolves into narrow gingival margins."
            )
        ),
        HostCityDef(
            id: "tokyo",
            worldId: "world_3",
            city: "Tokyo & Chicago",
            country: "Japan / USA",
            lat: 35.66,
            lon: 139.70,
            isOrbital: false,
            hostName: "Kenji Sato",
            hostRole: "Acoustic Synth Engineer",
            hostSkinToneHex: "#DFA982",
            hostAccentHex: "#c084fc",
            unlockStampsRequired: 8,
            playableInSlice: true,
            scenarioSummary: "Repeated sweet studio sips restart the Stephan Curve acid clock.",
            historyNoteId: "1940_chicago_stephan",
            signatureTreat: RegionalTreatDef(
                id: "treat_tokyo_melon",
                name: "Craft Yuzu-Melon Fizz",
                city: "Tokyo",
                emoji: "🍈",
                phDropNote: "Sweet carbonated sips hold plaque pH below 5.5."
            )
        ),
        HostCityDef(
            id: "accra",
            worldId: "world_4",
            city: "Accra & Colorado Springs",
            country: "Ghana / USA",
            lat: 5.60,
            lon: -0.19,
            isOrbital: false,
            hostName: "Dr. Amara Mensah",
            hostRole: "Coastal Marathon Physiologist",
            hostSkinToneHex: "#3B1F14",
            hostAccentHex: "#fbbf24",
            unlockStampsRequired: 14,
            playableInSlice: true,
            scenarioSummary: "Tart hibiscus hydration & botanical Miswak fluorapatite conversion.",
            historyNoteId: "1901_colorado_accra_miswak",
            signatureTreat: RegionalTreatDef(
                id: "treat_accra_sobolo",
                name: "Chilled Spiced Hibiscus Sobolo",
                city: "Accra",
                emoji: "🌺",
                phDropNote: "Tangy organic hibiscus acids temporarily soften outer enamel."
            )
        ),
        HostCityDef(
            id: "orbit_aurora",
            worldId: "world_5",
            city: "Station Aurora (408 km LEO)",
            country: "Low-Earth Orbit",
            lat: 29.55,
            lon: -95.09,
            isOrbital: true,
            hostName: "Specialist Tariq Al-Mansoor",
            hostRole: "Orbital Micro-Ecology Mission Specialist",
            hostSkinToneHex: "#C98E63",
            hostAccentHex: "#34d399",
            unlockStampsRequired: 20,
            playableInSlice: true,
            scenarioSummary: "Zero-gravity quorum-sensing EPS biofilm domes.",
            historyNoteId: "1973_skylab_orbit",
            signatureTreat: RegionalTreatDef(
                id: "treat_orbit_berry",
                name: "Zero-G Freeze-Dried Berry Bar",
                city: "Station Aurora",
                emoji: "🚀",
                phDropNote: "Dehydrated fruit sugars cling tenaciously in microgravity."
            )
        )
    ]

    // MARK: - Math & Terrain Helpers (Matches CollisionSystem.ts & OralSurfaceGrid.ts)

    @inline(__always)
    public static func smoothstep(_ e0: Float, _ e1: Float, _ x: Float) -> Float {
        let t = min(1.0, max(0.0, (x - e0) / max(1e-6, e1 - e0)))
        return t * t * (3.0 - 2.0 * t)
    }

    public static func sampleTerrainHeight(cartridge: WorldCartridge, x: Double, z: Double) -> Double {
        var y = 0.25
        for h in cartridge.heightCuspHills {
            let dx = x - h.cx
            let dz = z - h.cz
            let dSq = dx * dx + dz * dz
            let rSq = h.radius * h.radius
            if dSq < rSq {
                let t = 1.0 - dSq / rSq
                y += h.height * t * t
            }
        }
        return y
    }

    public static func buildAlleyWalls(cartridge: WorldCartridge) -> [AABB2D] {
        var result: [AABB2D] = []
        let margin = GameConfig.probeRadius * 0.85
        for alley in cartridge.interdentalAlleys {
            let dx = abs(alley.endpointB.x - alley.endpointA.x)
            let dz = abs(alley.endpointB.z - alley.endpointA.z)
            let halfGap = alley.width * 0.5
            let thick = alley.wallThickness

            if dz >= dx {
                let cx = (alley.endpointA.x + alley.endpointB.x) * 0.5
                let minZ = min(alley.endpointA.z, alley.endpointB.z) + margin
                let maxZ = max(alley.endpointA.z, alley.endpointB.z) - margin
                if maxZ > minZ {
                    result.append(AABB2D(minX: cx - halfGap - thick, minZ: minZ, maxX: cx - halfGap, maxZ: maxZ))
                    result.append(AABB2D(minX: cx + halfGap, minZ: minZ, maxX: cx + halfGap + thick, maxZ: maxZ))
                }
            } else {
                let cz = (alley.endpointA.z + alley.endpointB.z) * 0.5
                let minX = min(alley.endpointA.x, alley.endpointB.x) + margin
                let maxX = max(alley.endpointA.x, alley.endpointB.x) - margin
                if maxX > minX {
                    result.append(AABB2D(minX: minX, minZ: cz - halfGap - thick, maxX: maxX, maxZ: cz - halfGap))
                    result.append(AABB2D(minX: minX, minZ: cz + halfGap, maxX: maxX, maxZ: cz + halfGap + thick))
                }
            }
        }
        return result
    }

    @inline(__always)
    public static func distancePointToSegmentSq2D(
        px: Double, pz: Double,
        ax: Double, az: Double,
        bx: Double, bz: Double
    ) -> Double {
        let abx = bx - ax
        let abz = bz - az
        let lenSq = abx * abx + abz * abz
        if lenSq <= 1e-12 {
            let dx = px - ax
            let dz = pz - az
            return dx * dx + dz * dz
        }
        let t = min(1.0, max(0.0, ((px - ax) * abx + (pz - az) * abz) / lenSq))
        let cx = ax + t * abx
        let cz = az + t * abz
        let dx = px - cx
        let dz = pz - cz
        return dx * dx + dz * dz
    }

    @inline(__always)
    public static func latLonToUnitSIMD3(lat: Double, lon: Double) -> SIMD3<Float> {
        let phi = Float((90.0 - lat) * .pi / 180.0)
        let theta = Float((lon + 180.0) * .pi / 180.0)
        return SIMD3<Float>(
            -sin(phi) * cos(theta),
            cos(phi),
            sin(phi) * sin(theta)
        )
    }

    // MARK: - 1. Anatomical Crown Sculptor

    /// Sculpts a single anatomical human crown (`centralIncisor`, `lateralIncisor`, `canine`,
    /// `premolar`, `molar`) with superellipse proximal contacts, CEJ neck taper, labial convexity,
    /// palatal concavity, mamelons/cusps & occlusal fissures.
    public static func sculptCrownGeometry(
        kind: ToothKind,
        width: Float,
        height: Float,
        depth: Float,
        segments: Int = 28,
        quadrantIndex: Int? = nil,
        crownIndex: Int? = nil,
        seed: Float = 0
    ) -> SCNGeometry {
        let radialSegs = max(12, segments)
        let ringSegs = max(12, Int(round(Float(radialSegs) * 0.76)))

        let halfW = max(0.05, width * 0.5)
        let halfH = max(0.05, height * 0.5)
        let halfD = max(0.05, depth * 0.5)
        let minHalf = min(halfW, halfD)

        let encodedQuad: Float
        if let q = quadrantIndex, (0...3).contains(q) {
            encodedQuad = (Float(q) + 0.5) / 4.0
        } else {
            encodedQuad = 0.0
        }
        let crownCode: Float
        if let ci = crownIndex, ci >= 0, ci < 16 {
            crownCode = (Float(ci) + 1.0) * 0.05 // 0.05 .. 0.70 (< 0.95 sentinel)
        } else {
            crownCode = 0.0
        }

        let cols = radialSegs + 1
        let rows = ringSegs + 1
        let vertCount = cols * rows

        var positions = [Float](repeating: 0, count: vertCount * 3)
        var uvs = [Float](repeating: 0, count: vertCount * 2)
        var colors = [Float](repeating: 0, count: vertCount * 4)

        for iy in 0...ringSegs {
            let v = Float(iy) / Float(ringSegs)
            let phi = v * .pi // 0 (+Y top) -> pi (-Y bottom)
            let uy = cos(phi)
            let sinPhi = sin(phi)
            let h = (uy + 1.0) * 0.5 // 0 at cervical base -> 1 at occlusal/incisal top

            for ix in 0...radialSegs {
                let u = Float(ix) / Float(radialSegs)
                let theta = u * (.pi * 2.0)
                let ux = sinPhi * cos(theta)
                let uz = sinPhi * sin(theta)

                let rxz = hypot(ux, uz)
                let ang = atan2(uz, ux)

                // Superellipse (p = 2.7) squares off proximal & labial faces for natural tight contacts
                let ca = abs(cos(ang))
                let sa = abs(sin(ang))
                let pe: Float = 2.7
                let denom = pow(pow(ca, pe) + pow(sa, pe), 1.0 / pe)
                let k = denom > 1e-6 ? (1.0 / denom) : 1.0
                let radial = rxz > 1e-6 ? pow(rxz, 0.42) : 0.0

                let neck = 0.70 + 0.30 * smoothstep(0.02, 0.42, h)
                let topNarrowW: Float
                switch kind {
                case .molar: topNarrowW = 0.88
                case .premolar: topNarrowW = 0.84
                default: topNarrowW = 0.94
                }
                let topNarrowD: Float
                switch kind {
                case .centralIncisor, .lateralIncisor: topNarrowD = 0.42
                case .canine: topNarrowD = 0.62
                case .premolar, .molar: topNarrowD = 0.80
                }

                let occl = smoothstep(0.50, 1.0, h)
                let sx = neck * (1.0 - (1.0 - topNarrowW) * occl)
                let sz = neck * (1.0 - (1.0 - topNarrowD) * occl)

                let x = cos(ang) * k * radial * halfW * sx
                var z = sin(ang) * k * radial * halfD * sz
                var y = uy * halfH

                // Labial convexity (+Z) & palatal/lingual fossa concavity + basal cingulum (-Z)
                if z > 0 {
                    z *= 1.0 + 0.065 * sin(.pi * h)
                } else {
                    let cingulum = (1.0 - h) * (kind == .molar ? 0.04 : 0.10)
                    let palatalScoop: Float
                    if kind == .centralIncisor || kind == .lateralIncisor || kind == .canine {
                        palatalScoop = -0.08 * smoothstep(0.35, 0.88, h) * max(0, 1.0 - abs(x / halfW))
                    } else {
                        palatalScoop = 0
                    }
                    z *= 1.0 + cingulum + palatalScoop
                }

                let nx = x / halfW
                let nz = z / halfD
                let t = smoothstep(0.32, 1.0, uy)
                var fissureAo: Float = 1.0

                switch kind {
                case .centralIncisor, .lateralIncisor:
                    // Straight chisel incisal edge with 3 subtle mamelons
                    y += t * 0.05 * minHalf * cos(nx * .pi * 1.5 + seed)
                    y -= t * t * 0.18 * minHalf * nx * nx
                case .canine:
                    // Pointed canine cusp with mesial & distal cusp ridges
                    let cusp = max(0.0, 1.0 - 1.25 * abs(nx)) * max(0.0, 1.0 - 0.60 * nz * nz)
                    y += t * cusp * 0.62 * minHalf
                    y -= t * 0.12 * minHalf * abs(nx)
                case .premolar:
                    // Taller buccal cusp + lingual cusp separated by central mesiodistal groove
                    let buccal = exp(-pow(nz - 0.42, 2.0) / 0.09) * 0.52
                    let lingual = exp(-pow(nz + 0.45, 2.0) / 0.09) * 0.36
                    let groove = exp(-(nz * nz) / 0.035) * 0.22
                    y += t * (buccal + lingual - groove - 0.10) * minHalf * (1.0 - 0.35 * nx * nx)
                    fissureAo = 1.0 - groove * 1.6 * t
                case .molar:
                    // 4-cusp molar with cruciform central fossa & buccal developmental groove
                    var cusps: Float = 0
                    for cx: Float in [-0.46, 0.46] {
                        for cz: Float in [-0.44, 0.46] {
                            let tall: Float = cz > 0 ? 1.0 : 0.85
                            let distSq = (nx - cx) * (nx - cx) + (nz - cz) * (nz - cz)
                            cusps += tall * exp(-distSq / 0.075)
                        }
                    }
                    let cross = exp(-(nx * nx) / 0.02) * (1.0 - abs(nz) * 0.4)
                              + exp(-(nz * nz) / 0.02) * (1.0 - abs(nx) * 0.4)
                    y += t * (cusps * 0.38 - cross * 0.16 - 0.08) * minHalf
                    fissureAo = 1.0 - min(0.32, cross * 0.30) * t
                }

                let idx = iy * cols + ix
                positions[idx * 3] = x
                positions[idx * 3 + 1] = y
                positions[idx * 3 + 2] = z

                uvs[idx * 2] = u
                uvs[idx * 2 + 1] = 1.0 - v

                let cervicalAo: Float = h < 0.22 ? (0.60 + 0.40 * (h / 0.22)) : 1.0
                let proxAo: Float = abs(nx) > 0.82 ? (0.84 + 0.16 * (1.0 - (abs(nx) - 0.82) / 0.40)) : 1.0
                let ao = max(0.45, cervicalAo * proxAo * fissureAo)
                let hFrac = min(1.0, max(0.0, (h - 0.18) / 0.80))

                colors[idx * 4] = ao
                colors[idx * 4 + 1] = encodedQuad
                colors[idx * 4 + 2] = hFrac
                colors[idx * 4 + 3] = crownCode
            }
        }

        // CCW outward winding: (i00, i10, i01) and (i10, i11, i01)
        var indices = [UInt32]()
        indices.reserveCapacity(radialSegs * ringSegs * 6)
        for iy in 0..<ringSegs {
            for ix in 0..<radialSegs {
                let i00 = UInt32(iy * cols + ix)
                let i10 = i00 + 1
                let i01 = UInt32((iy + 1) * cols + ix)
                let i11 = i01 + 1
                indices.append(contentsOf: [i00, i10, i01, i10, i11, i01])
            }
        }

        let normals = computeSmoothNormals(positions: positions, indices: indices)
        return makeSCNGeometry(positions: positions, normals: normals, uvs: uvs, colors: colors, indices: indices)
    }

    // MARK: - 2. 14-Crown Pocket Companion Arch Builder

    private static let archRx: Double = 9.6
    private static let archRz: Double = 8.4
    private static let archZOffset: Double = -1.6
    private static let archTMax: Double = .pi * 0.62

    private struct ArchSample {
        let x: Double
        let z: Double
        let tx: Double
        let tz: Double
    }

    private struct ArchTable {
        let ts: [Double]
        let lens: [Double]
        let total: Double
    }

    private static func archPoint(_ t: Double) -> ArchSample {
        let x = sin(t) * archRx
        let z = cos(t) * archRz + archZOffset
        let dx = cos(t) * archRx
        let dz = -sin(t) * archRz
        let len = max(1e-9, hypot(dx, dz))
        return ArchSample(x: x, z: z, tx: dx / len, tz: dz / len)
    }

    private static func buildArcTable(samples: Int = 720) -> ArchTable {
        var ts = [Double](repeating: 0, count: samples + 1)
        var lens = [Double](repeating: 0, count: samples + 1)
        var acc = 0.0
        var prev = archPoint(-archTMax)
        for i in 0...samples {
            let t = -archTMax + (2.0 * archTMax * Double(i)) / Double(samples)
            let p = archPoint(t)
            if i > 0 {
                acc += hypot(p.x - prev.x, p.z - prev.z)
            }
            ts[i] = t
            lens[i] = acc
            prev = p
        }
        return ArchTable(ts: ts, lens: lens, total: acc)
    }

    private static func tAtArcLength(_ table: ArchTable, _ s: Double) -> Double {
        if s <= 0 { return table.ts[0] }
        if s >= table.total { return table.ts[table.ts.count - 1] }
        var lo = 0
        var hi = table.lens.count - 1
        while hi - lo > 1 {
            let mid = (lo + hi) >> 1
            if table.lens[mid] < s { lo = mid } else { hi = mid }
        }
        let span = max(1e-9, table.lens[hi] - table.lens[lo])
        let u = (s - table.lens[lo]) / span
        return table.ts[lo] + (table.ts[hi] - table.ts[lo]) * u
    }

    /// Builds the 14 sculpted anatomical Companion crowns (`"crown_0"` .. `"crown_13"`),
    /// swept scalloped gingival collar with interdental papillae, sugar-splat blobs, and
    /// Smooth Bask polish halo motes.
    public static func buildCompanionArchSceneNodes(
        enamelMaterial: SCNMaterial,
        gingivaMaterial: SCNMaterial? = nil,
        segments: Int = 28
    ) -> CompanionArchNodes {
        let rootNode = SCNNode()
        rootNode.name = "CompanionArchRoot"
        let rootOrigin = SIMD3<Float>(32.0, 0.4, 16.0)
        rootNode.simdPosition = rootOrigin

        let crownsContainer = SCNNode()
        crownsContainer.name = "CompanionCrownsContainer"
        rootNode.addChildNode(crownsContainer)

        let halfArchSpecs: [(kind: ToothKind, w: Double, d: Double, h: Double)] = [
            (.centralIncisor, 8.6, 7.0, 10.4),
            (.lateralIncisor, 6.6, 6.2, 9.2),
            (.canine, 7.6, 8.0, 10.2),
            (.premolar, 7.0, 9.0, 8.4),
            (.premolar, 6.6, 9.0, 7.8),
            (.molar, 10.2, 11.0, 7.4),
            (.molar, 9.2, 10.6, 7.0)
        ]
        let orderedSpecs = Array(halfArchSpecs.reversed()) + halfArchSpecs // 14 crowns: right 2nd molar -> left 2nd molar
        let totalMm = orderedSpecs.reduce(0.0) { $0 + $1.w }
        let table = buildArcTable()
        let contactGap = 0.015
        let mmToU = (table.total - contactGap * Double(orderedSpecs.count)) / totalMm

        var crownNodes: [SCNNode] = []
        var crownFrames: [CompanionCrownFrame] = []
        var contactArcPositions: [Double] = []
        var toothArcSpans: [(s0: Double, s1: Double, halfD: Double)] = []

        var cursor = contactGap * 0.5
        for (ti, spec) in orderedSpecs.enumerated() {
            let width = spec.w * mmToU
            let sCenter = cursor + width * 0.5
            let t = tAtArcLength(table, sCenter)
            let ap = archPoint(t)

            let halfW = Float(width * 0.5 * 1.02)
            let halfD = Float(spec.d * mmToU * 0.5 * 0.92)
            let halfH = Float(spec.h * mmToU * 0.5 * 1.05)

            let quadIdx = min(3, (ti * 4) / orderedSpecs.count)
            let crownGeo = sculptCrownGeometry(
                kind: spec.kind,
                width: halfW * 2.0,
                height: halfH * 2.0,
                depth: halfD * 2.0,
                segments: (spec.kind == .molar || spec.kind == .premolar) ? max(28, segments) : max(24, segments - 2),
                quadrantIndex: quadIdx,
                crownIndex: ti,
                seed: Float(ti) * 0.37
            )
            crownGeo.materials = [enamelMaterial]

            let yaw = Float(atan2(-ap.tz, ap.tx))
            let centerY: Float = 0.62 + 0.64 * halfH
            let localPos = SIMD3<Float>(Float(ap.x), centerY, Float(ap.z))

            let node = SCNNode(geometry: crownGeo)
            node.name = "crown_\(ti)"
            node.simdPosition = localPos
            node.simdEulerAngles = SIMD3<Float>(0, yaw, 0)
            crownsContainer.addChildNode(node)

            crownNodes.append(node)
            crownFrames.append(
                CompanionCrownFrame(
                    index: ti,
                    name: "crown_\(ti)",
                    kind: spec.kind,
                    quadrantIndex: quadIdx,
                    localPosition: localPos,
                    worldPosition: rootOrigin + localPos,
                    halfWidth: halfW,
                    halfDepth: halfD,
                    halfHeight: halfH,
                    yawRadians: yaw
                )
            )

            toothArcSpans.append((s0: cursor, s1: cursor + width, halfD: Double(halfD)))
            if ti > 0 {
                contactArcPositions.append(cursor - contactGap * 0.5)
            }
            cursor += width + contactGap
        }

        // Swept scalloped gingival collar with interdental papillae
        let resolvedGumMat = gingivaMaterial ?? EnamelShaders.makeGingivaMaterial(gingivaHex: 0xD4526A)
        let gumGeo = buildScallopedGingivaCollarGeometry(
            table: table,
            spans: toothArcSpans,
            contacts: contactArcPositions
        )
        gumGeo.materials = [resolvedGumMat]
        let gingivaNode = SCNNode(geometry: gumGeo)
        gingivaNode.name = "CompanionGingivaArch"
        rootNode.addChildNode(gingivaNode)

        // Sticky Regional Treat sugar-plaque splat overlay nodes (hidden until active)
        let splatMat = makeGlossyPropMaterial(hex: 0xEAB308, emissionHex: 0xCA8A04, roughness: 0.48, opacity: 0.72)
        var splatNodes: [SCNNode] = []
        for si in 0..<6 {
            let sphere = SCNSphere(radius: 0.58)
            sphere.segmentCount = 16
            sphere.materials = [splatMat]
            let sNode = SCNNode(geometry: sphere)
            sNode.name = "sugar_splat_\(si)"
            sNode.isHidden = true
            rootNode.addChildNode(sNode)
            splatNodes.append(sNode)
        }

        // Smooth Bask floating turquoise crystal motes arc (matches Hub screenshot!)
        let polishHaloNode = SCNNode()
        polishHaloNode.name = "CompanionPolishHalo"
        let moteMat = makeUnlitGlowMaterial(hex: 0x99F6E4, opacity: 0.92)
        let moteCount = 11
        for mi in 0..<moteCount {
            let frac = Double(mi) / Double(moteCount - 1)
            let t = -archTMax * 0.85 + (2.0 * archTMax * 0.85) * frac
            let ap = archPoint(t)
            let moteGeo = SCNSphere(radius: 0.11)
            moteGeo.segmentCount = 10
            moteGeo.materials = [moteMat]
            let mNode = SCNNode(geometry: moteGeo)
            mNode.simdPosition = SIMD3<Float>(
                Float(ap.x * 0.92),
                3.4 + sin(Float(frac) * .pi) * 0.65,
                Float(ap.z * 0.92)
            )
            polishHaloNode.addChildNode(mNode)
        }
        rootNode.addChildNode(polishHaloNode)

        return CompanionArchNodes(
            rootNode: rootNode,
            archContainerNode: crownsContainer,
            crownNodes: crownNodes,
            crownFrames: crownFrames,
            gingivaNode: gingivaNode,
            gingivaMaterial: resolvedGumMat,
            sugarSplatNodes: splatNodes,
            polishHaloNode: polishHaloNode
        )
    }

    private static func buildScallopedGingivaCollarGeometry(
        table: ArchTable,
        spans: [(s0: Double, s1: Double, halfD: Double)],
        contacts: [Double]
    ) -> SCNGeometry {
        let along = 200
        enum ProfileKey { case base, mid, crestOuter, crest, inner }
        let profile: [(Double, ProfileKey)] = [
            (2.35, .base),
            (2.00, .mid),
            (1.42, .crestOuter),
            (1.06, .crest),
            (0.70, .inner),
            (0.00, .inner),
            (-0.70, .inner),
            (-1.06, .crest),
            (-1.42, .crestOuter),
            (-2.00, .mid),
            (-2.35, .base)
        ]
        let rows = profile.count
        let extra = 1.6
        let sStart = -extra
        let sEnd = table.total + extra

        let vertCount = (along + 1) * rows
        var positions = [Float](repeating: 0, count: vertCount * 3)
        var uvs = [Float](repeating: 0, count: vertCount * 2)
        var colors = [Float](repeating: 0, count: vertCount * 4)

        for a in 0...along {
            let uFrac = Double(a) / Double(along)
            let s = sStart + (sEnd - sStart) * uFrac
            let sClamped = min(table.total, max(0.0, s))
            let t = tAtArcLength(table, sClamped)
            let ap = archPoint(t)
            let nx = -ap.tz
            let nz = ap.tx

            var neckD = 0.9
            var zenith = 0.0
            var rootU = 0.0
            for sp in spans where sClamped >= sp.s0 && sClamped <= sp.s1 {
                neckD = sp.halfD * 0.78
                rootU = (sClamped - sp.s0) / max(1e-6, sp.s1 - sp.s0)
                zenith = sin(.pi * rootU)
                break
            }

            var papilla = 0.0
            for cs in contacts {
                let d = (sClamped - cs) / 0.32
                papilla = max(papilla, exp(-d * d))
            }

            let endFade: Double
            if s < 0 {
                endFade = 1.0 - min(1.0, -s / extra)
            } else if s > table.total {
                endFade = 1.0 - min(1.0, (s - table.total) / extra)
            } else {
                endFade = 1.0
            }
            let endScale = 0.35 + 0.65 * sqrt(max(0.0, endFade))
            let crestY = 0.66 + 0.50 * papilla - 0.08 * zenith

            for r in 0..<rows {
                let (factor, key) = profile[r]
                let rootOut = (key == .mid) ? (1.0 + 0.07 * sin(.pi * rootU)) : 1.0
                let off = factor * neckD * endScale * rootOut

                var y: Double
                var ao: Float = 0.95
                var marginal: Float = 0.0
                switch key {
                case .base:
                    y = -0.55
                    ao = 0.78
                case .mid:
                    y = 0.05 + 0.10 * papilla
                    let rootBulge = 0.5 + 0.5 * sin(.pi * rootU)
                    y += 0.07 * rootBulge * endFade - 0.03 * papilla
                case .crestOuter:
                    y = crestY - 0.32
                    marginal = 0.45
                case .crest:
                    y = crestY
                    marginal = 1.0
                case .inner:
                    y = crestY - 0.06
                    ao = 0.48
                    marginal = 1.0
                }
                y = y * (0.55 + 0.45 * endFade) - (1.0 - endFade) * 0.20

                let idx = a * rows + r
                positions[idx * 3] = Float(ap.x + nx * off)
                positions[idx * 3 + 1] = Float(y)
                positions[idx * 3 + 2] = Float(ap.z + nz * off)

                uvs[idx * 2] = Float(uFrac)
                uvs[idx * 2 + 1] = Float(r) / Float(rows - 1)

                colors[idx * 4] = ao
                colors[idx * 4 + 1] = marginal
                colors[idx * 4 + 2] = 0.0
                colors[idx * 4 + 3] = 0.0 // < 0.95 sentinel
            }
        }

        // Outward & upward CCW winding: (i0, i2, i1) and (i1, i2, i3)
        var indices = [UInt32]()
        indices.reserveCapacity(along * (rows - 1) * 6)
        for a in 0..<along {
            for r in 0..<(rows - 1) {
                let i0 = UInt32(a * rows + r)
                let i1 = i0 + 1
                let i2 = i0 + UInt32(rows)
                let i3 = i2 + 1
                indices.append(contentsOf: [i0, i2, i1, i1, i2, i3])
            }
        }

        let normals = computeSmoothNormals(positions: positions, indices: indices)
        return makeSCNGeometry(positions: positions, normals: normals, uvs: uvs, colors: colors, indices: indices)
    }

    // MARK: - 3. Cosmic Backdrop, Orbital Earth, City Beacons, Lattice & Mohs Specimens

    public static func buildCosmicBackdropNodes(
        cities: [HostCityDef] = defaultHostCities,
        earthMaterial: SCNMaterial? = nil,
        atmosphereMaterial: SCNMaterial? = nil
    ) -> CosmicBackdropNodes {
        let rootNode = SCNNode()
        rootNode.name = "CosmicBackdropRoot"
        rootNode.simdPosition = SIMD3<Float>(
            Float(GameConfig.earthBackdropPos.x),
            Float(GameConfig.earthBackdropPos.y),
            Float(GameConfig.earthBackdropPos.z)
        )

        // 1. 340-Star Golden-Angle Spherical Starfield (1 Point Primitive Draw Call)
        let starfieldNode = buildStarfieldNode(starCount: 340)
        rootNode.addChildNode(starfieldNode)

        // 2. 3D Orbital Earth Globe + Rayleigh Atmosphere Halo + 5 Host City Beacons
        let earthPivotNode = SCNNode()
        earthPivotNode.name = "EarthPivot"
        rootNode.addChildNode(earthPivotNode)

        let earthRadius = CGFloat(GameConfig.earthBackdropRadius)
        let resolvedEarthMat = earthMaterial ?? EnamelShaders.makeEarthGlobeMaterial()
        let earthSphere = SCNSphere(radius: earthRadius)
        earthSphere.segmentCount = 56
        earthSphere.materials = [resolvedEarthMat]
        let earthGlobeNode = SCNNode(geometry: earthSphere)
        earthGlobeNode.name = "OrbitalEarthGlobe"
        earthPivotNode.addChildNode(earthGlobeNode)

        let resolvedAtmoMat = atmosphereMaterial ?? EnamelShaders.makeAtmosphereHaloMaterial()
        let atmoSphere = SCNSphere(radius: earthRadius * 1.075)
        atmoSphere.segmentCount = 48
        atmoSphere.materials = [resolvedAtmoMat]
        let atmosphereHaloNode = SCNNode(geometry: atmoSphere)
        atmosphereHaloNode.name = "OrbitalAtmosphereHalo"
        atmosphereHaloNode.renderingOrder = 10
        earthPivotNode.addChildNode(atmosphereHaloNode)

        var cityBeaconNodes: [String: SCNNode] = [:]
        let rFloat = Float(GameConfig.earthBackdropRadius)

        for city in cities where !city.isOrbital {
            let accentHex = RenderBridge.parseHex(city.hostAccentHex)
            let dir = latLonToUnitSIMD3(lat: city.lat, lon: city.lon)

            let pinRoot = SCNNode()
            pinRoot.name = "city_pin_\(city.id)"
            pinRoot.simdPosition = dir * (rFloat + 0.36)

            let beaconSphere = SCNSphere(radius: 0.56)
            beaconSphere.segmentCount = 16
            beaconSphere.materials = [makeUnlitGlowMaterial(hex: accentHex, opacity: 1.0)]
            pinRoot.addChildNode(SCNNode(geometry: beaconSphere))

            let haloTorus = SCNTorus(ringRadius: 0.92, pipeRadius: 0.08)
            haloTorus.materials = [makeUnlitGlowMaterial(hex: accentHex, opacity: 0.65, additive: true)]
            let haloNode = SCNNode(geometry: haloTorus)
            let up = SIMD3<Float>(0, 1, 0)
            if abs(simd_dot(up, dir)) < 0.999 {
                haloNode.simdOrientation = simd_quatf(from: up, to: dir)
            }
            pinRoot.addChildNode(haloNode)

            earthPivotNode.addChildNode(pinRoot)
            cityBeaconNodes[city.id] = pinRoot
        }

        // Orbital LEO Ring + Station Aurora Micro-Satellite (408 km LEO)
        let leoRadius = rFloat + 2.6
        let leoTorus = SCNTorus(ringRadius: CGFloat(leoRadius), pipeRadius: 0.09)
        leoTorus.ringSegmentCount = 64
        leoTorus.pipeSegmentCount = 10
        leoTorus.materials = [makeUnlitGlowMaterial(hex: 0x34D399, opacity: 0.48, additive: true)]
        let leoRingNode = SCNNode(geometry: leoTorus)
        // SCNTorus lies in XZ plane; tilt to match orbital inclination
        leoRingNode.simdEulerAngles = SIMD3<Float>(.pi * 0.36, 0.25, 0)
        earthPivotNode.addChildNode(leoRingNode)

        let stationOrbitPivotNode = SCNNode()
        stationOrbitPivotNode.name = "StationAuroraOrbitPivot"
        stationOrbitPivotNode.simdEulerAngles = SIMD3<Float>(.pi * 0.36 - .pi * 0.5, 0.25, 0)
        earthPivotNode.addChildNode(stationOrbitPivotNode)

        let stationAuroraNode = buildStationAuroraMicroSatelliteNode()
        stationAuroraNode.name = "city_pin_orbit_aurora"
        stationAuroraNode.simdPosition = SIMD3<Float>(leoRadius, 0, 0)
        stationOrbitPivotNode.addChildNode(stationAuroraNode)
        cityBeaconNodes["orbit_aurora"] = stationAuroraNode

        // 3. Cosmic Intro Showcase (World 32, 148, 16)
        let cosmicShowcaseNode = SCNNode()
        cosmicShowcaseNode.name = "CosmicShowcase"
        cosmicShowcaseNode.simdPosition = SIMD3<Float>(0, 38.0, 0)
        cosmicShowcaseNode.isHidden = true
        rootNode.addChildNode(cosmicShowcaseNode)

        let hydroxyapatiteCrystalNode = buildHydroxyapatiteLatticeNode()
        cosmicShowcaseNode.addChildNode(hydroxyapatiteCrystalNode)

        // Orbiting Stellar Nucleosynthesis Elements (20Ca Gold, 15P Violet, 8O Cyan)
        let atomicOrbitNode = SCNNode()
        atomicOrbitNode.name = "AtomicNucleosynthesisOrbit"
        let atomHexes: [UInt32] = [0xFDE68A, 0xC084FC, 0x38BDF8]
        let atomMats = atomHexes.map { makeGlossyPropMaterial(hex: $0, emissionHex: $0, roughness: 0.18) }
        for i in 0..<18 {
            let ang = (Float(i) / 18.0) * (.pi * 2.0)
            let ringR: Float = 3.6 + Float(i % 3) * 0.95
            let yOff: Float = Float((i % 5) - 2) * 0.85
            let sphere = SCNSphere(radius: i % 3 == 0 ? 0.44 : 0.34)
            sphere.segmentCount = 14
            sphere.materials = [atomMats[i % 3]]
            let atomNode = SCNNode(geometry: sphere)
            atomNode.simdPosition = SIMD3<Float>(cos(ang) * ringR, yOff, sin(ang) * ringR)
            atomicOrbitNode.addChildNode(atomNode)
        }
        cosmicShowcaseNode.addChildNode(atomicOrbitNode)

        // 6 Incoming 9F Fluoride Ions locking into crystal lattice
        let fluorideLockNode = SCNNode()
        fluorideLockNode.name = "FluorideLatticeLock"
        let fMat = makeGlossyPropMaterial(hex: 0x2DD4BF, emissionHex: 0x14B8A6, roughness: 0.12)
        let fOctGeo = makeOctahedronGeometry(radius: 0.55)
        fOctGeo.materials = [fMat]
        for i in 0..<6 {
            let ang = (Float(i) / 6.0) * (.pi * 2.0)
            let fNode = SCNNode(geometry: fOctGeo)
            fNode.simdPosition = SIMD3<Float>(
                cos(ang) * 2.4,
                (i % 2 == 0 ? 1.0 : -1.0) * 1.4,
                sin(ang) * 2.4
            )
            fluorideLockNode.addChildNode(fNode)
        }
        cosmicShowcaseNode.addChildNode(fluorideLockNode)

        // Mohs Scale Hardness Specimens Lineup (5 interactive benchmark pillars + Talc/Gypsum/Calcite/Fluorite mineral accents)
        let (mohsLineupNode, mohsSpecNodes, mohsCompNodes, mohsRingNode, mohsDescs) = buildMohsSpecimensLineup()
        cosmicShowcaseNode.addChildNode(mohsLineupNode)

        let backdrop = CosmicBackdropNodes(
            rootNode: rootNode,
            starfieldNode: starfieldNode,
            earthPivotNode: earthPivotNode,
            earthGlobeNode: earthGlobeNode,
            earthGlobeMaterial: resolvedEarthMat,
            atmosphereHaloNode: atmosphereHaloNode,
            cityBeaconNodes: cityBeaconNodes,
            stationOrbitPivotNode: stationOrbitPivotNode,
            stationAuroraNode: stationAuroraNode,
            cosmicShowcaseNode: cosmicShowcaseNode,
            hydroxyapatiteCrystalNode: hydroxyapatiteCrystalNode,
            atomicOrbitNode: atomicOrbitNode,
            fluorideLockNode: fluorideLockNode,
            mohsLineupNode: mohsLineupNode,
            mohsSpecimenNodes: mohsSpecNodes,
            mohsCompanionMineralNodes: mohsCompNodes,
            mohsSelectionRingNode: mohsRingNode,
            mohsDescriptors: mohsDescs,
            cities: cities
        )
        backdrop.selectMohsSpecimen(2)
        return backdrop
    }

    private static func buildStarfieldNode(starCount: Int) -> SCNNode {
        var positions = [Float](repeating: 0, count: starCount * 3)
        var colors = [Float](repeating: 0, count: starCount * 4)
        var indices = [UInt32](repeating: 0, count: starCount)

        for i in 0..<starCount {
            let frac = (Double(i) * 0.61803398875).truncatingRemainder(dividingBy: 1.0)
            let u = Float(frac * 2.0 - 1.0)
            let theta = Float(i) * 2.3999632
            let r = Float(95 + (i % 7) * 14)
            let s = sqrt(max(0.0, 1.0 - u * u))

            positions[i * 3] = cos(theta) * s * r
            positions[i * 3 + 1] = u * r * 0.75 + 10.0
            positions[i * 3 + 2] = sin(theta) * s * r

            let tint = i % 3
            colors[i * 4] = tint == 0 ? 0.85 : (tint == 1 ? 1.0 : 0.75)
            colors[i * 4 + 1] = tint == 0 ? 0.94 : (tint == 1 ? 0.92 : 0.88)
            colors[i * 4 + 2] = 1.0
            colors[i * 4 + 3] = 0.92
            indices[i] = UInt32(i)
        }

        let posData = positions.withUnsafeBufferPointer { Data(buffer: $0) }
        let colData = colors.withUnsafeBufferPointer { Data(buffer: $0) }
        let idxData = indices.withUnsafeBufferPointer { Data(buffer: $0) }

        let posSrc = SCNGeometrySource(
            data: posData, semantic: .vertex, vectorCount: starCount,
            usesFloatComponents: true, componentsPerVector: 3, bytesPerComponent: 4,
            dataOffset: 0, dataStride: 12
        )
        let colSrc = SCNGeometrySource(
            data: colData, semantic: .color, vectorCount: starCount,
            usesFloatComponents: true, componentsPerVector: 4, bytesPerComponent: 4,
            dataOffset: 0, dataStride: 16
        )
        let elem = SCNGeometryElement(
            data: idxData, primitiveType: .point, primitiveCount: starCount, bytesPerIndex: 4
        )
        elem.pointSize = 2.6
        elem.minimumPointScreenSpaceRadius = 1.2
        elem.maximumPointScreenSpaceRadius = 4.2

        let geo = SCNGeometry(sources: [posSrc, colSrc], elements: [elem])
        let mat = SCNMaterial()
        mat.lightingModel = .constant
        mat.diffuse.contents = PlatformColor.white
        mat.emission.contents = RenderBridge.color(hex: 0xE0F2FE)
        mat.writesToDepthBuffer = false
        geo.materials = [mat]

        let node = SCNNode(geometry: geo)
        node.name = "CosmicStarfield"
        return node
    }

    private static func buildStationAuroraMicroSatelliteNode() -> SCNNode {
        let root = SCNNode()
        let bodyGeo = makeOctahedronGeometry(radius: 0.72)
        bodyGeo.materials = [makeGlossyPropMaterial(hex: 0x6EE7B7, emissionHex: 0x34D399, roughness: 0.18, metalness: 0.45)]
        root.addChildNode(SCNNode(geometry: bodyGeo))

        let panelMat = makeGlossyPropMaterial(hex: 0x0EA5E9, emissionHex: 0x0284C7, roughness: 0.15, metalness: 0.65)
        for side: Float in [-1, 1] {
            let panel = SCNBox(width: 1.05, height: 0.05, length: 0.42, chamferRadius: 0.02)
            panel.materials = [panelMat]
            let pNode = SCNNode(geometry: panel)
            pNode.simdPosition = SIMD3<Float>(0, 0, side * 0.95)
            root.addChildNode(pNode)
        }
        return root
    }

    private static func buildHydroxyapatiteLatticeNode() -> SCNNode {
        let root = SCNNode()
        root.name = "HydroxyapatiteCrystalLattice"

        // Translucent hexagonal prism (Ca10(PO4)6(OH)2)
        let prismGeo = makeHexagonalPrismGeometry(radius: 2.15, height: 4.8)
        prismGeo.materials = [makeGlossyPropMaterial(hex: 0xDCFCE7, emissionHex: 0x38BDF8, roughness: 0.08, opacity: 0.36)]
        let prismNode = SCNNode(geometry: prismGeo)
        prismNode.renderingOrder = 4
        root.addChildNode(prismNode)

        // Glowing top & bottom hex crystal rims
        let rimMat = makeUnlitGlowMaterial(hex: 0x38BDF8, opacity: 0.88, additive: true)
        for ySign: Float in [-1, 1] {
            let ring = SCNTorus(ringRadius: 2.12, pipeRadius: 0.04)
            ring.ringSegmentCount = 6
            ring.pipeSegmentCount = 8
            ring.materials = [rimMat]
            let rNode = SCNNode(geometry: ring)
            rNode.simdPosition = SIMD3<Float>(0, ySign * 2.4, 0)
            root.addChildNode(rNode)
        }

        // 3-layer Ca2+, PO4(3-), OH- atomic lattice + bonds
        let caMat = makeGlossyPropMaterial(hex: 0xFDE68A, emissionHex: 0xF59E0B, roughness: 0.2)
        let pMat = makeGlossyPropMaterial(hex: 0xC084FC, emissionHex: 0x9333EA, roughness: 0.2)
        let ohMat = makeGlossyPropMaterial(hex: 0x67E8F9, emissionHex: 0x06B6D4, roughness: 0.15)
        let bondMat = makeUnlitGlowMaterial(hex: 0x5EEAD4, opacity: 0.72, additive: true)

        let caSphere = SCNSphere(radius: 0.19); caSphere.segmentCount = 12; caSphere.materials = [caMat]
        let pSphere = SCNSphere(radius: 0.15); pSphere.segmentCount = 12; pSphere.materials = [pMat]
        let ohSphere = SCNSphere(radius: 0.17); ohSphere.segmentCount = 12; ohSphere.materials = [ohMat]

        let layers: [Float] = [-1.6, 0.0, 1.6]
        var layerPositions: [(ring: [SIMD3<Float>], tri: [SIMD3<Float>], oh: SIMD3<Float>)] = []

        for (li, y) in layers.enumerated() {
            var ringPts: [SIMD3<Float>] = []
            var triPts: [SIMD3<Float>] = []
            for k in 0..<6 {
                let a = (Float(k) / 6.0) * (.pi * 2.0)
                let p = SIMD3<Float>(cos(a) * 1.78, y, sin(a) * 1.78)
                ringPts.append(p)
                let n = SCNNode(geometry: caSphere)
                n.simdPosition = p
                root.addChildNode(n)
            }
            for k in 0..<3 {
                let offset: Float = (li % 2 == 0) ? (.pi / 6.0) : (-.pi / 6.0)
                let a = (Float(k) / 3.0) * (.pi * 2.0) + offset
                let p = SIMD3<Float>(cos(a) * 0.98, y + (li % 2 == 1 ? 0.25 : -0.25), sin(a) * 0.98)
                triPts.append(p)
                let n = SCNNode(geometry: pSphere)
                n.simdPosition = p
                root.addChildNode(n)
            }
            let ohPt = SIMD3<Float>(0, y, 0)
            let ohNode = SCNNode(geometry: ohSphere)
            ohNode.simdPosition = ohPt
            root.addChildNode(ohNode)
            layerPositions.append((ring: ringPts, tri: triPts, oh: ohPt))
        }

        func addBond(_ a: SIMD3<Float>, _ b: SIMD3<Float>) {
            let d = b - a
            let len = simd_length(d)
            guard len > 0.01 else { return }
            let cyl = SCNCylinder(radius: 0.032, height: CGFloat(len))
            cyl.radialSegmentCount = 6
            cyl.materials = [bondMat]
            let bNode = SCNNode(geometry: cyl)
            bNode.simdPosition = (a + b) * 0.5
            let up = SIMD3<Float>(0, 1, 0)
            let dir = d / len
            if abs(simd_dot(up, dir)) < 0.999 {
                bNode.simdOrientation = simd_quatf(from: up, to: dir)
            }
            root.addChildNode(bNode)
        }

        for (li, L) in layerPositions.enumerated() {
            for k in 0..<6 {
                addBond(L.ring[k], L.ring[(k + 1) % 6])
            }
            for k in 0..<3 {
                addBond(L.tri[k], L.oh)
                addBond(L.tri[k], L.ring[(k * 2) % 6])
                addBond(L.tri[k], L.ring[(k * 2 + 1) % 6])
            }
            if li > 0 {
                let prev = layerPositions[li - 1]
                for k in 0..<6 { addBond(prev.ring[k], L.ring[k]) }
                addBond(prev.oh, L.oh)
            }
        }

        return root
    }

    private static func buildMohsSpecimensLineup() -> (
        root: SCNNode,
        specimens: [SCNNode],
        companions: [SCNNode],
        ring: SCNNode,
        descriptors: [MohsSpecimenDescriptor]
    ) {
        let lineupRoot = SCNNode()
        lineupRoot.name = "MohsLineupGroup"

        let descriptors: [MohsSpecimenDescriptor] = [
            MohsSpecimenDescriptor(index: 0, name: "Gold Nugget (2.5) / Talc (1)", mohsLabel: "Mohs 1–2.5", accentHex: 0xFBBF24, localCenter: SIMD3<Float>(-5.0, -3.7, 2.2)),
            MohsSpecimenDescriptor(index: 1, name: "Forged Iron (4.0) / Fluorite (4)", mohsLabel: "Mohs 4.0", accentHex: 0xCBD5E1, localCenter: SIMD3<Float>(-2.5, -3.7, 2.2)),
            MohsSpecimenDescriptor(index: 2, name: "Hydroxyapatite Enamel (5.0)", mohsLabel: "Mohs 5.0", accentHex: 0x5EEAD4, localCenter: SIMD3<Float>(0.0, -3.7, 2.2)),
            MohsSpecimenDescriptor(index: 3, name: "Quartz Crystal (7.0)", mohsLabel: "Mohs 7.0", accentHex: 0xC4B5FD, localCenter: SIMD3<Float>(2.5, -3.7, 2.2)),
            MohsSpecimenDescriptor(index: 4, name: "Brilliant Diamond (10.0)", mohsLabel: "Mohs 10.0", accentHex: 0x67E8F9, localCenter: SIMD3<Float>(5.0, -3.7, 2.2))
        ]

        var specNodes: [SCNNode] = []

        // 0: Lumpy 24k Gold Nugget (Mohs 2.5)
        let goldNode = SCNNode()
        goldNode.name = "mohs_0"
        let goldGeo = makeLumpyNuggetGeometry(radius: 0.62)
        goldGeo.materials = [makeGlossyPropMaterial(hex: 0xFBBF24, emissionHex: 0xD97706, roughness: 0.18, metalness: 0.88)]
        goldNode.addChildNode(SCNNode(geometry: goldGeo))
        goldNode.simdPosition = descriptors[0].localCenter
        lineupRoot.addChildNode(goldNode)
        specNodes.append(goldNode)

        // 1: Chunky Hex-Head Forged Iron Bolt (Mohs 4.0)
        let ironNode = SCNNode()
        ironNode.name = "mohs_1"
        let ironMat = makeGlossyPropMaterial(hex: 0xD6DDE6, emissionHex: 0x475569, roughness: 0.28, metalness: 0.82)
        let hexHead = makeHexagonalPrismGeometry(radius: 0.44, height: 0.26)
        hexHead.materials = [ironMat]
        let headN = SCNNode(geometry: hexHead)
        headN.simdPosition = SIMD3<Float>(0, 0.36, 0)
        ironNode.addChildNode(headN)
        let shank = SCNCylinder(radius: 0.20, height: 0.88)
        shank.radialSegmentCount = 14
        shank.materials = [ironMat]
        let shankN = SCNNode(geometry: shank)
        shankN.simdPosition = SIMD3<Float>(0, -0.18, 0)
        ironNode.addChildNode(shankN)
        ironNode.simdPosition = descriptors[1].localCenter
        lineupRoot.addChildNode(ironNode)
        specNodes.append(ironNode)

        // 2: Sculpted 4-Cusp Hydroxyapatite Enamel Molar + Bifurcated Anatomical Roots (Mohs 5.0!)
        let enamelSpecNode = SCNNode()
        enamelSpecNode.name = "mohs_2"
        let molarCrown = sculptCrownGeometry(kind: .molar, width: 1.08, height: 0.88, depth: 1.12, segments: 28)
        molarCrown.materials = [makeGlossyPropMaterial(hex: 0xF0F9FF, emissionHex: 0x38BDF8, roughness: 0.06, metalness: 0.05)]
        let crownN = SCNNode(geometry: molarCrown)
        crownN.simdPosition = SIMD3<Float>(0, 0.26, 0)
        enamelSpecNode.addChildNode(crownN)

        let cementumMat = makeGlossyPropMaterial(hex: 0xE7CA9E, emissionHex: 0x92400E, roughness: 0.36, metalness: 0.02)
        let rootTrunk = SCNCone(topRadius: 0.38, bottomRadius: 0.30, height: 0.22)
        rootTrunk.materials = [cementumMat]
        let trunkN = SCNNode(geometry: rootTrunk)
        trunkN.simdPosition = SIMD3<Float>(0, -0.14, 0)
        enamelSpecNode.addChildNode(trunkN)

        for side: Float in [-1, 1] {
            let prong = SCNCone(topRadius: 0.145, bottomRadius: 0.055, height: 0.48)
            prong.materials = [cementumMat]
            let prongN = SCNNode(geometry: prong)
            prongN.simdPosition = SIMD3<Float>(side * 0.22, -0.40, 0)
            prongN.simdEulerAngles = SIMD3<Float>(0, 0, side * 0.16)
            enamelSpecNode.addChildNode(prongN)
        }
        enamelSpecNode.simdPosition = descriptors[2].localCenter
        lineupRoot.addChildNode(enamelSpecNode)
        specNodes.append(enamelSpecNode)

        // 3: Hexagonal Twin Quartz Prism + Pyramidal Terminations (Mohs 7.0)
        let quartzNode = SCNNode()
        quartzNode.name = "mohs_3"
        let quartzMat = makeGlossyPropMaterial(hex: 0xDDD6FE, emissionHex: 0x8B5CF6, roughness: 0.06, opacity: 0.88)
        let qPrism = makeHexagonalPrismGeometry(radius: 0.30, height: 0.88)
        qPrism.materials = [quartzMat]
        quartzNode.addChildNode(SCNNode(geometry: qPrism))
        let qCap = SCNCone(topRadius: 0, bottomRadius: 0.30, height: 0.42)
        qCap.radialSegmentCount = 6
        qCap.materials = [quartzMat]
        let qCapN = SCNNode(geometry: qCap)
        qCapN.simdPosition = SIMD3<Float>(0, 0.65, 0)
        quartzNode.addChildNode(qCapN)

        let twinPivot = SCNNode()
        twinPivot.simdPosition = SIMD3<Float>(0.30, -0.14, 0.12)
        twinPivot.simdEulerAngles = SIMD3<Float>(0, 0, -0.48)
        let tPrism = makeHexagonalPrismGeometry(radius: 0.15, height: 0.48)
        tPrism.materials = [quartzMat]
        twinPivot.addChildNode(SCNNode(geometry: tPrism))
        let tCap = SCNCone(topRadius: 0, bottomRadius: 0.15, height: 0.24)
        tCap.radialSegmentCount = 6
        tCap.materials = [quartzMat]
        let tCapN = SCNNode(geometry: tCap)
        tCapN.simdPosition = SIMD3<Float>(0, 0.36, 0)
        twinPivot.addChildNode(tCapN)
        quartzNode.addChildNode(twinPivot)
        quartzNode.simdPosition = descriptors[3].localCenter
        lineupRoot.addChildNode(quartzNode)
        specNodes.append(quartzNode)

        // 4: Round Brilliant-Cut Diamond (Mohs 10.0)
        let diamondNode = SCNNode()
        diamondNode.name = "mohs_4"
        let diaMat = makeGlossyPropMaterial(hex: 0xA5F3FC, emissionHex: 0x38BDF8, roughness: 0.03, metalness: 0.15, opacity: 0.90)
        let crownCut = SCNCone(topRadius: 0.36, bottomRadius: 0.62, height: 0.24)
        crownCut.radialSegmentCount = 8
        crownCut.materials = [diaMat]
        let ccN = SCNNode(geometry: crownCut)
        ccN.simdPosition = SIMD3<Float>(0, 0.20, 0)
        diamondNode.addChildNode(ccN)
        let pavilion = SCNCone(topRadius: 0.62, bottomRadius: 0.0, height: 0.66)
        pavilion.radialSegmentCount = 8
        pavilion.materials = [diaMat]
        let pavN = SCNNode(geometry: pavilion)
        pavN.simdPosition = SIMD3<Float>(0, -0.25, 0)
        diamondNode.addChildNode(pavN)
        diamondNode.simdPosition = descriptors[4].localCenter
        lineupRoot.addChildNode(diamondNode)
        specNodes.append(diamondNode)

        // Companion Mineral Reference Crystals (Talc 1, Gypsum 2, Calcite 3, Fluorite 4 octahedron)
        var compNodes: [SCNNode] = []
        let mineralSpecs: [(name: String, hex: UInt32, pos: SIMD3<Float>)] = [
            ("mohs_ref_talc_1", 0xD1FAE5, SIMD3<Float>(-4.2, -4.55, 0.85)),
            ("mohs_ref_gypsum_2", 0xFEF3C7, SIMD3<Float>(-1.6, -4.55, 0.85)),
            ("mohs_ref_calcite_3", 0xFDE68A, SIMD3<Float>(1.6, -4.55, 0.85)),
            ("mohs_ref_fluorite_4", 0xA78BFA, SIMD3<Float>(4.2, -4.55, 0.85))
        ]
        for (idx, ms) in mineralSpecs.enumerated() {
            let mGeo: SCNGeometry
            if idx == 3 {
                mGeo = makeOctahedronGeometry(radius: 0.28) // Classic octahedral Fluorite 4!
            } else if idx == 2 {
                let box = SCNBox(width: 0.36, height: 0.32, length: 0.34, chamferRadius: 0.02) // Rhombohedral Calcite 3
                mGeo = box
            } else {
                mGeo = makeHexagonalPrismGeometry(radius: 0.22, height: idx == 1 ? 0.44 : 0.18) // Tabular Talc 1 / Selenite Gypsum 2
            }
            mGeo.materials = [makeGlossyPropMaterial(hex: ms.hex, emissionHex: ms.hex, roughness: 0.16, opacity: 0.84)]
            let mNode = SCNNode(geometry: mGeo)
            mNode.name = ms.name
            mNode.simdPosition = ms.pos
            mNode.simdEulerAngles = SIMD3<Float>(0.22, Float(idx) * 0.7, 0.18)
            lineupRoot.addChildNode(mNode)
            compNodes.append(mNode)
        }

        // Glowing Selection Pedestal Ring
        let selTorus = SCNTorus(ringRadius: 0.95, pipeRadius: 0.06)
        selTorus.ringSegmentCount = 48
        selTorus.pipeSegmentCount = 10
        selTorus.materials = [makeUnlitGlowMaterial(hex: 0x5EEAD4, opacity: 0.90, additive: true)]
        let selRingNode = SCNNode(geometry: selTorus)
        selRingNode.name = "MohsSelectionRing"
        lineupRoot.addChildNode(selRingNode)

        return (lineupRoot, specNodes, compNodes, selRingNode, descriptors)
    }

    // MARK: - 4. Plaque City Cartridge Stage Builder

    private static func signedDistToPlayableBoxes(_ boxes: [AABB2D], x: Double, z: Double) -> Double {
        var best = -999.0
        for b in boxes {
            let dx = min(x - b.minX, b.maxX - x)
            let dz = min(z - b.minZ, b.maxZ - z)
            let inside = min(dx, dz)
            if inside > best { best = inside }
        }
        return best
    }

    private static func computeToothSeamsX(_ cartridge: WorldCartridge) -> [Double] {
        var seams = Set<Int>()
        for i in 1..<cartridge.districts.count {
            seams.insert(Int((cartridge.districts[i].bounds.minX * 10.0).rounded()))
        }
        for w in cartridge.wallBoxes {
            seams.insert(Int(((w.minX + w.maxX) * 5.0).rounded()))
        }
        return seams.map { Double($0) / 10.0 }.sorted()
    }

    public static func buildCartridgeStageNodes(
        cartridge: WorldCartridge,
        enamelMaterial: SCNMaterial,
        gingivaMaterial: SCNMaterial? = nil,
        landmarkColors: LandmarkPaletteColors? = nil
    ) -> CartridgeStageNodes {
        let rootNode = SCNNode()
        rootNode.name = "CartridgeStage_\(cartridge.id)"

        let colors = landmarkColors ?? LandmarkPaletteColors.resolve(for: cartridge.palette)
        let resolvedGumMat = gingivaMaterial ?? EnamelShaders.makeGingivaMaterial(gingivaHex: cartridge.palette.gingivaHex)

        // 1. Continuous Heightfield Enamel Terrain Mesh (World XZ UVs in 0..1!)
        let terrainGeo = buildCartridgeEnamelTerrainGeometry(cartridge: cartridge)
        terrainGeo.materials = [enamelMaterial]
        let terrainNode = SCNNode(geometry: terrainGeo)
        terrainNode.name = "EnamelTerrainMesh"
        rootNode.addChildNode(terrainNode)

        // 2. Sculpted Interdental Contact Ridges along wallBoxes + alley walls
        let allWalls = cartridge.wallBoxes + buildAlleyWalls(cartridge: cartridge)
        var contactRidgesNode: SCNNode?
        if !allWalls.isEmpty {
            let ridgesGeo = buildMergedContactRidgesGeometry(cartridge: cartridge, walls: allWalls)
            ridgesGeo.materials = [enamelMaterial]
            let rNode = SCNNode(geometry: ridgesGeo)
            rNode.name = "InterdentalContactRidges"
            rootNode.addChildNode(rNode)
            contactRidgesNode = rNode
        }

        // 3. Surrounding Scalloped Coral Gingiva Bed
        let gumGeo = buildCartridgeGingivaBedGeometry(cartridge: cartridge)
        gumGeo.materials = [resolvedGumMat]
        let gumNode = SCNNode(geometry: gumGeo)
        gumNode.name = "CartridgeGingivaBed"
        rootNode.addChildNode(gumNode)

        // 4. Saliva Spring Fountains
        var salivaSpringNodes: [SCNNode] = []
        let springMat = makeGlossyPropMaterial(hex: colors.springHex, emissionHex: colors.springHex, roughness: 0.14)
        let bubbleCoreMat = makeUnlitGlowMaterial(hex: 0x67E8F9, opacity: 0.78, additive: true)
        for (idx, pos) in cartridge.salivaSprings.enumerated() {
            let y = Float(sampleTerrainHeight(cartridge: cartridge, x: pos.x, z: pos.z))
            let sRoot = SCNNode()
            sRoot.name = "saliva_spring_\(idx)"
            sRoot.simdPosition = SIMD3<Float>(Float(pos.x), y + 0.14, Float(pos.z))

            let torus = SCNTorus(ringRadius: 0.85, pipeRadius: 0.14)
            torus.ringSegmentCount = 28
            torus.pipeSegmentCount = 12
            torus.materials = [springMat]
            sRoot.addChildNode(SCNNode(geometry: torus))

            let core = SCNSphere(radius: 0.34)
            core.segmentCount = 14
            core.materials = [bubbleCoreMat]
            let cNode = SCNNode(geometry: core)
            cNode.name = "spring_core"
            cNode.simdPosition = SIMD3<Float>(0, 0.22, 0)
            sRoot.addChildNode(cNode)

            rootNode.addChildNode(sRoot)
            salivaSpringNodes.append(sRoot)
        }

        // 5. Commensal Colony Ring Beacons (S. sanguinis)
        var commensalSiteNodes: [String: SCNNode] = [:]
        for spawn in cartridge.commensalSiteSpawns {
            let y = Float(sampleTerrainHeight(cartridge: cartridge, x: spawn.pos.x, z: spawn.pos.z))
            let siteRoot = SCNNode()
            siteRoot.name = "commensal_site_\(spawn.id)"
            siteRoot.simdPosition = SIMD3<Float>(Float(spawn.pos.x), y + 0.52, Float(spawn.pos.z))

            let oct = makeOctahedronGeometry(radius: 0.56)
            oct.materials = [makeGlossyPropMaterial(hex: colors.colonyBeaconHex, emissionHex: colors.colonyBeaconHex, roughness: 0.12)]
            let coreNode = SCNNode(geometry: oct)
            coreNode.name = "colony_core"
            siteRoot.addChildNode(coreNode)

            let haloNode = buildCommensalCrystalHaloNode(tintHex: colors.colonyRestoredHex)
            haloNode.name = "colony_halo"
            haloNode.simdPosition = SIMD3<Float>(0, -0.34, 0)
            haloNode.isHidden = true
            siteRoot.addChildNode(haloNode)

            let guideRing = SCNTorus(ringRadius: 0.96, pipeRadius: 0.055)
            guideRing.materials = [makeGlossyPropMaterial(hex: 0x0F172A, emissionHex: colors.colonyBeaconHex, roughness: 0.25)]
            let ringNode = SCNNode(geometry: guideRing)
            ringNode.simdPosition = SIMD3<Float>(0, -0.44, 0)
            siteRoot.addChildNode(ringNode)

            rootNode.addChildNode(siteRoot)
            commensalSiteNodes[spawn.id] = siteRoot
        }

        // 6. Faceted Purple Sucrose Crystals with Tilted Spiked Orbital Rings
        var sucroseCrystalNodes: [String: SCNNode] = [:]
        for spawn in cartridge.sucroseSpawns {
            let y = Float(sampleTerrainHeight(cartridge: cartridge, x: spawn.pos.x, z: spawn.pos.z))
            let crystalNode = buildSucroseCrystalNode(tintHex: colors.sucroseHex)
            crystalNode.name = "sucrose_\(spawn.id)"
            crystalNode.simdPosition = SIMD3<Float>(Float(spawn.pos.x), y + 0.58, Float(spawn.pos.z))
            rootNode.addChildNode(crystalNode)
            sucroseCrystalNodes[spawn.id] = crystalNode
        }

        // 7. Sticky Biofilm Bridges spanning interdental alleys
        var biofilmBridgeNodes: [String: SCNNode] = [:]
        let bridgeMat = makeGlossyPropMaterial(hex: colors.bridgeHex, emissionHex: colors.bridgeHex, roughness: 0.35)
        for bridge in cartridge.biofilmBridges {
            let ya = sampleTerrainHeight(cartridge: cartridge, x: bridge.a.x, z: bridge.a.z)
            let yb = sampleTerrainHeight(cartridge: cartridge, x: bridge.b.x, z: bridge.b.z)
            let pa = SIMD3<Float>(Float(bridge.a.x), Float(ya) + 0.32, Float(bridge.a.z))
            let pb = SIMD3<Float>(Float(bridge.b.x), Float(yb) + 0.32, Float(bridge.b.z))
            let delta = pb - pa
            let len = max(0.2, simd_length(delta))

            let cap = SCNCapsule(capRadius: 0.16, height: CGFloat(len + 0.32))
            cap.materials = [bridgeMat]
            let bNode = SCNNode(geometry: cap)
            bNode.name = "bridge_\(bridge.id)"
            bNode.simdPosition = (pa + pb) * 0.5
            let up = SIMD3<Float>(0, 1, 0)
            let dir = delta / len
            if abs(simd_dot(up, dir)) < 0.999 {
                bNode.simdOrientation = simd_quatf(from: up, to: dir)
            }
            bNode.isHidden = !bridge.intact
            rootNode.addChildNode(bNode)
            biofilmBridgeNodes[bridge.id] = bNode
        }

        // 8. EPS Quorum-Sensing Domes (World 5)
        var epsDomeNodes: [String: SCNNode] = [:]
        if let domes = cartridge.epsDomes {
            let domeMat = makeGlossyPropMaterial(
                hex: colors.epsDomeHex,
                emissionHex: 0x38BDF8,
                roughness: 0.12,
                opacity: 0.44
            )
            domeMat.writesToDepthBuffer = false
            for dome in domes {
                let y = Float(sampleTerrainHeight(cartridge: cartridge, x: dome.cx, z: dome.cz))
                let dNode = SCNNode()
                dNode.name = "eps_dome_\(dome.id)"
                dNode.simdPosition = SIMD3<Float>(Float(dome.cx), y, Float(dome.cz))

                let hemi = buildHemisphereDomeGeometry(radius: Float(dome.radius), segments: 20)
                hemi.materials = [domeMat]
                let hMesh = SCNNode(geometry: hemi)
                hMesh.renderingOrder = 6
                dNode.addChildNode(hMesh)

                let baseRing = SCNTorus(ringRadius: CGFloat(dome.radius), pipeRadius: 0.08)
                baseRing.ringSegmentCount = 32
                baseRing.materials = [makeUnlitGlowMaterial(hex: 0x818CF8, opacity: 0.78, additive: true)]
                dNode.addChildNode(SCNNode(geometry: baseRing))

                rootNode.addChildNode(dNode)
                epsDomeNodes[dome.id] = dNode
            }
        }

        // 9. Supply Relay Beacons
        var relayBeaconNodes: [SCNNode] = []
        let beaconGeo = makeOctahedronGeometry(radius: 0.62)
        beaconGeo.materials = [makeGlossyPropMaterial(hex: 0xFDE047, emissionHex: 0xF59E0B, roughness: 0.14, metalness: 0.35)]
        for (idx, pos) in cartridge.beaconDropSlots.enumerated() {
            let y = Float(sampleTerrainHeight(cartridge: cartridge, x: pos.x, z: pos.z))
            let bNode = SCNNode(geometry: beaconGeo)
            bNode.name = "relay_beacon_\(idx)"
            bNode.simdPosition = SIMD3<Float>(Float(pos.x), y + 0.72, Float(pos.z))
            bNode.isHidden = true // Shown when pendingSupplyBeacons > idx
            rootNode.addChildNode(bNode)
            relayBeaconNodes.append(bNode)
        }

        // 10. Interdental Tether-Zip Reticle
        let zipReticleNode = buildZipReticleNode(tintHex: colors.alleyReticleHex)
        zipReticleNode.name = "ZipPromptReticle"
        zipReticleNode.isHidden = true
        rootNode.addChildNode(zipReticleNode)

        return CartridgeStageNodes(
            rootNode: rootNode,
            enamelTerrainNode: terrainNode,
            contactRidgesNode: contactRidgesNode,
            gingivaBedNode: gumNode,
            salivaSpringNodes: salivaSpringNodes,
            commensalSiteNodes: commensalSiteNodes,
            sucroseCrystalNodes: sucroseCrystalNodes,
            biofilmBridgeNodes: biofilmBridgeNodes,
            epsDomeNodes: epsDomeNodes,
            relayBeaconNodes: relayBeaconNodes,
            zipReticleNode: zipReticleNode,
            landmarkColors: colors
        )
    }

    private static func buildCartridgeEnamelTerrainGeometry(cartridge: WorldCartridge) -> SCNGeometry {
        let segX = min(144, max(32, Int((cartridge.worldWidth * 2.0).rounded())))
        let segZ = min(96, max(24, Int((cartridge.worldDepth * 2.0).rounded())))
        let cols = segX + 1
        let rows = segZ + 1
        let vertCount = cols * rows

        let allWalls = cartridge.wallBoxes + buildAlleyWalls(cartridge: cartridge)
        let seams = computeToothSeamsX(cartridge)

        var maxHill = 0.25
        for h in cartridge.heightCuspHills {
            maxHill = max(maxHill, 0.25 + h.height)
        }

        var positions = [Float](repeating: 0, count: vertCount * 3)
        var uvs = [Float](repeating: 0, count: vertCount * 2)
        var colors = [Float](repeating: 0, count: vertCount * 4)

        for iz in 0...segZ {
            let v = Double(iz) / Double(segZ)
            let z = v * cartridge.worldDepth

            for ix in 0...segX {
                let u = Double(ix) / Double(segX)
                let x = u * cartridge.worldWidth

                var marginDist = signedDistToPlayableBoxes(cartridge.playableMaskBoxes, x: x, z: z)
                var y = sampleTerrainHeight(cartridge: cartridge, x: x, z: z)

                var seamProx = 0.0
                for sx in seams {
                    let d = (x - sx) / 1.5
                    seamProx = max(seamProx, exp(-d * d))
                }
                if marginDist < 2.2 {
                    marginDist -= 0.95 * seamProx
                }

                var fissureAo = 1.0
                for band in cartridge.marginBands {
                    let dSq = distancePointToSegmentSq2D(
                        px: x, pz: z,
                        ax: band.a.x, az: band.a.z,
                        bx: band.b.x, bz: band.b.z
                    )
                    let rSq = band.radius * band.radius
                    if dSq < rSq {
                        let k = 1.0 - dSq / rSq
                        y -= 0.18 * k
                        fissureAo = min(fissureAo, 1.0 - 0.37 * k)
                    }
                }

                var edgeAo = 1.0
                if marginDist < 0.8 {
                    let t = min(1.0, max(0.0, (0.8 - marginDist) / 2.2))
                    y -= t * t * 2.1
                    edgeAo = 1.0 - 0.32 * t
                }

                var wallAo = 1.0
                for w in allWalls {
                    let cx = max(w.minX, min(x, w.maxX))
                    let cz = max(w.minZ, min(z, w.maxZ))
                    let d = hypot(x - cx, z - cz)
                    if d < 1.3 {
                        wallAo = min(wallAo, 0.46 + 0.54 * (d / 1.3))
                    }
                }

                let idx = iz * cols + ix
                positions[idx * 3] = Float(x)
                positions[idx * 3 + 1] = Float(y)
                positions[idx * 3 + 2] = Float(z)

                // Exact 0..1 world XZ UVs aligned 1:1 with OralSurfaceGrid!
                uvs[idx * 2] = Float(u)
                uvs[idx * 2 + 1] = Float(v)

                let ao = Float(max(0.33, fissureAo * edgeAo * wallAo))
                let hFrac = Float(min(1.0, max(0.0, (y + 0.4) / (maxHill + 0.4))))

                colors[idx * 4] = ao
                colors[idx * 4 + 1] = 0.0
                colors[idx * 4 + 2] = hFrac
                colors[idx * 4 + 3] = 0.0
            }
        }

        // Upward (+Y) CCW winding: (i00, i01, i10) and (i10, i01, i11)
        var indices = [UInt32]()
        indices.reserveCapacity(segX * segZ * 6)
        for iz in 0..<segZ {
            for ix in 0..<segX {
                let i00 = UInt32(iz * cols + ix)
                let i10 = i00 + 1
                let i01 = UInt32((iz + 1) * cols + ix)
                let i11 = i01 + 1
                indices.append(contentsOf: [i00, i01, i10, i10, i01, i11])
            }
        }

        let normals = computeSmoothNormals(positions: positions, indices: indices)
        return makeSCNGeometry(positions: positions, normals: normals, uvs: uvs, colors: colors, indices: indices)
    }

    private static func buildMergedContactRidgesGeometry(cartridge: WorldCartridge, walls: [AABB2D]) -> SCNGeometry {
        let radialSegs = 24
        let ringSegs = 14
        let cols = radialSegs + 1
        let rows = ringSegs + 1
        let vertsPerRidge = cols * rows

        var allPos = [Float]()
        var allUvs = [Float]()
        var allCols = [Float]()
        var allIdx = [UInt32]()

        allPos.reserveCapacity(walls.count * vertsPerRidge * 3)
        allUvs.reserveCapacity(walls.count * vertsPerRidge * 2)
        allCols.reserveCapacity(walls.count * vertsPerRidge * 4)
        allIdx.reserveCapacity(walls.count * radialSegs * ringSegs * 6)

        let worldW = max(0.01, Float(cartridge.worldWidth))
        let worldD = max(0.01, Float(cartridge.worldDepth))

        for (wIdx, w) in walls.enumerated() {
            let baseOffset = UInt32(wIdx * vertsPerRidge)
            let cx = Float((w.minX + w.maxX) * 0.5)
            let cz = Float((w.minZ + w.maxZ) * 0.5)
            let baseH = Float(sampleTerrainHeight(cartridge: cartridge, x: Double(cx), z: Double(cz)))
            let halfW = max(0.30, Float(w.maxX - w.minX) * 0.5) * 1.06
            let halfD = max(0.30, Float(w.maxZ - w.minZ) * 0.5) * 1.04
            let halfH: Float = 1.45
            let longAxisX = halfW >= halfD
            let seed = Float(wIdx) * 1.7

            for iy in 0...ringSegs {
                let v = Float(iy) / Float(ringSegs)
                let phi = v * .pi
                let uy = cos(phi)
                let sinPhi = sin(phi)
                let h = (uy + 1.0) * 0.5

                for ix in 0...radialSegs {
                    let u = Float(ix) / Float(radialSegs)
                    let theta = u * (.pi * 2.0)
                    let ux = sinPhi * cos(theta)
                    let uz = sinPhi * sin(theta)
                    let rxz = hypot(ux, uz)
                    let ang = atan2(uz, ux)

                    let ca = abs(cos(ang))
                    let sa = abs(sin(ang))
                    let pe: Float = 3.4
                    let denom = pow(pow(ca, pe) + pow(sa, pe), 1.0 / pe)
                    let k = denom > 1e-6 ? (1.0 / denom) : 1.0
                    let radial = rxz > 1e-6 ? pow(rxz, 0.38) : 0.0
                    let taper = 1.0 - 0.14 * smoothstep(0.45, 1.0, h)

                    let lx = cos(ang) * k * radial * halfW * taper
                    let lz = sin(ang) * k * radial * halfD * taper
                    var ly = uy * halfH

                    let along = longAxisX ? (lx / halfW) : (lz / halfD)
                    let across = longAxisX ? (lz / halfD) : (lx / halfW)
                    let t = smoothstep(0.25, 1.0, uy)
                    ly += t * (0.20 * sin(along * .pi * 1.6 + seed) + 0.16 * (1.0 - across * across) - 0.10)

                    let wx = cx + lx
                    let wy = baseH + halfH * 0.42 + ly
                    let wz = cz + lz

                    allPos.append(contentsOf: [wx, wy, wz])
                    allUvs.append(contentsOf: [
                        min(1.0, max(0.0, wx / worldW)),
                        min(1.0, max(0.0, wz / worldD))
                    ])

                    let ao: Float = h < 0.35 ? (0.55 + 0.45 * (h / 0.35)) : 0.98
                    let hFrac = min(1.0, max(0.0, (h - 0.30) / 0.70))
                    allCols.append(contentsOf: [ao, 0.0, hFrac, 0.0])
                }
            }

            for iy in 0..<ringSegs {
                for ix in 0..<radialSegs {
                    let i00 = baseOffset + UInt32(iy * cols + ix)
                    let i10 = i00 + 1
                    let i01 = baseOffset + UInt32((iy + 1) * cols + ix)
                    let i11 = i01 + 1
                    allIdx.append(contentsOf: [i00, i10, i01, i10, i11, i01])
                }
            }
        }

        let normals = computeSmoothNormals(positions: allPos, indices: allIdx)
        return makeSCNGeometry(positions: allPos, normals: normals, uvs: allUvs, colors: allCols, indices: allIdx)
    }

    private static func buildCartridgeGingivaBedGeometry(cartridge: WorldCartridge) -> SCNGeometry {
        let segX = 96
        let segZ = 48
        let cols = segX + 1
        let rows = segZ + 1
        let vertCount = cols * rows
        let pad = 7.0
        let totalW = cartridge.worldWidth + pad * 2.0
        let totalD = cartridge.worldDepth + pad * 2.0
        let seams = computeToothSeamsX(cartridge)

        var positions = [Float](repeating: 0, count: vertCount * 3)
        var uvs = [Float](repeating: 0, count: vertCount * 2)
        var colors = [Float](repeating: 0, count: vertCount * 4)

        for iz in 0...segZ {
            let v = Double(iz) / Double(segZ)
            let z = -pad + v * totalD
            for ix in 0...segX {
                let u = Double(ix) / Double(segX)
                let x = -pad + u * totalW

                let marginDist = signedDistToPlayableBoxes(cartridge.playableMaskBoxes, x: x, z: z)
                var papilla = 0.0
                for sx in seams {
                    let d = (x - sx) / 1.35
                    papilla = max(papilla, exp(-d * d))
                }
                let cd = (marginDist + 0.5) / 1.6
                let collar = exp(-cd * cd)
                let collarWave = collar * (0.62 + 0.75 * papilla)
                let outerFalloff = marginDist < -2.0 ? max(-2.6, (marginDist + 2.0) * 0.28) : 0.0
                let insideDip = marginDist > 0.6 ? -1.4 : 0.0
                let y = -0.15 + collarWave + outerFalloff + insideDip

                let idx = iz * cols + ix
                positions[idx * 3] = Float(x)
                positions[idx * 3 + 1] = Float(y)
                positions[idx * 3 + 2] = Float(z)

                uvs[idx * 2] = Float(u)
                uvs[idx * 2 + 1] = Float(v)

                let ao: Float = marginDist > -0.2 ? 0.68 : 0.96
                let marginal = Float(min(1.0, collar * (0.60 + 0.40 * papilla)))
                colors[idx * 4] = ao
                colors[idx * 4 + 1] = marginal
                colors[idx * 4 + 2] = 0.0
                colors[idx * 4 + 3] = 0.0
            }
        }

        var indices = [UInt32]()
        indices.reserveCapacity(segX * segZ * 6)
        for iz in 0..<segZ {
            for ix in 0..<segX {
                let i00 = UInt32(iz * cols + ix)
                let i10 = i00 + 1
                let i01 = UInt32((iz + 1) * cols + ix)
                let i11 = i01 + 1
                indices.append(contentsOf: [i00, i01, i10, i10, i01, i11])
            }
        }

        let normals = computeSmoothNormals(positions: positions, indices: indices)
        return makeSCNGeometry(positions: positions, normals: normals, uvs: uvs, colors: colors, indices: indices)
    }

    private static func buildCommensalCrystalHaloNode(tintHex: UInt32) -> SCNNode {
        let haloRoot = SCNNode()
        let petalGeo = makeOctahedronGeometry(radius: 0.20)
        let petalMatA = makeGlossyPropMaterial(hex: 0xF0FDFA, emissionHex: tintHex, roughness: 0.08)
        let petalMatB = makeGlossyPropMaterial(hex: 0xE9D5FF, emissionHex: tintHex, roughness: 0.08)
        let petals = 9
        for i in 0..<petals {
            let ang = (Float(i) / Float(petals)) * (.pi * 2.0)
            let pGeo = petalGeo.copy() as? SCNGeometry ?? petalGeo
            pGeo.materials = [i % 2 == 0 ? petalMatA : petalMatB]
            let pNode = SCNNode(geometry: pGeo)
            pNode.simdScale = SIMD3<Float>(0.55, 1.45, 0.55)
            pNode.simdPosition = SIMD3<Float>(cos(ang) * 0.95, 0.16, sin(ang) * 0.95)
            pNode.simdEulerAngles = SIMD3<Float>(0, -ang, -0.55)
            haloRoot.addChildNode(pNode)
        }
        let ring = SCNTorus(ringRadius: 0.95, pipeRadius: 0.038)
        ring.materials = [makeUnlitGlowMaterial(hex: 0xCCFBF1, opacity: 0.9)]
        haloRoot.addChildNode(SCNNode(geometry: ring))
        return haloRoot
    }

    /// Faceted purple/magenta Sucrose Crystal cluster with inner glow core + tilted spiked orbital ring!
    public static func buildSucroseCrystalNode(tintHex: UInt32 = 0x9333EA) -> SCNNode {
        let root = SCNNode()

        // Rich purple-violet refractive crystal material matching polish captures
        let gemHex: UInt32 = tintHex == 0xFFFFFF ? 0x7C3AED : tintHex
        let crystalMat = makeGlossyPropMaterial(
            hex: gemHex,
            emissionHex: 0x6D28D9,
            roughness: 0.06,
            metalness: 0.12,
            opacity: 0.94
        )

        let clusterSpecs: [(x: Float, y: Float, z: Float, s: Float, tilt: Float)] = [
            (0.0, 0.0, 0.0, 1.0, 0.0),
            (0.36, -0.12, 0.20, 0.62, 0.50),
            (-0.32, -0.16, -0.18, 0.55, -0.45),
            (0.05, -0.20, -0.38, 0.46, 0.85)
        ]

        for sp in clusterSpecs {
            let shardPivot = SCNNode()
            shardPivot.simdPosition = SIMD3<Float>(sp.x, sp.y + 0.10, sp.z)
            shardPivot.simdEulerAngles = SIMD3<Float>(0, 0, sp.tilt)

            let body = makeHexagonalPrismGeometry(radius: 0.34 * sp.s, height: 0.68 * sp.s)
            body.materials = [crystalMat]
            shardPivot.addChildNode(SCNNode(geometry: body))

            let topCap = SCNCone(topRadius: 0, bottomRadius: CGFloat(0.34 * sp.s), height: CGFloat(0.42 * sp.s))
            topCap.radialSegmentCount = 6
            topCap.materials = [crystalMat]
            let topN = SCNNode(geometry: topCap)
            topN.simdPosition = SIMD3<Float>(0, 0.55 * sp.s, 0)
            shardPivot.addChildNode(topN)

            root.addChildNode(shardPivot)
        }

        // Inner radiant core
        let core = makeOctahedronGeometry(radius: 0.22)
        core.materials = [makeUnlitGlowMaterial(hex: 0xF5D0FE, opacity: 0.95, additive: true)]
        let coreN = SCNNode(geometry: core)
        coreN.simdPosition = SIMD3<Float>(0, 0.16, 0)
        root.addChildNode(coreN)

        // Tilted orbital ring with crystalline spikes (matches after-seal-world1-390.jpg!)
        let ringPivot = SCNNode()
        ringPivot.name = "sucrose_orbit_ring"
        ringPivot.simdEulerAngles = SIMD3<Float>(0.34, 0.0, -0.26)

        let ringTorus = SCNTorus(ringRadius: 1.05, pipeRadius: 0.035)
        ringTorus.ringSegmentCount = 36
        ringTorus.materials = [makeUnlitGlowMaterial(hex: 0xC084FC, opacity: 0.88)]
        ringPivot.addChildNode(SCNNode(geometry: ringTorus))

        let spikeMatA = makeUnlitGlowMaterial(hex: 0xE879F9, opacity: 0.90)
        let spikeMatB = makeUnlitGlowMaterial(hex: 0x67E8F9, opacity: 0.85)
        let spikes = 8
        for i in 0..<spikes {
            let ang = (Float(i) / Float(spikes)) * (.pi * 2.0)
            let cone = SCNCone(topRadius: 0, bottomRadius: 0.10, height: 0.30)
            cone.radialSegmentCount = 4
            cone.materials = [i % 2 == 0 ? spikeMatA : spikeMatB]
            let sNode = SCNNode(geometry: cone)
            sNode.simdPosition = SIMD3<Float>(cos(ang) * 1.12, 0.08, sin(ang) * 1.12)
            sNode.simdEulerAngles = SIMD3<Float>(0, -ang, -0.45)
            ringPivot.addChildNode(sNode)
        }
        root.addChildNode(ringPivot)

        return root
    }

    private static func buildZipReticleNode(tintHex: UInt32) -> SCNNode {
        let root = SCNNode()
        let mat = makeUnlitGlowMaterial(hex: tintHex, opacity: 0.88)
        let segs = 10
        for i in 0..<segs {
            let a = (Float(i) / Float(segs)) * (.pi * 2.0)
            let dash = SCNBox(width: 0.32, height: 0.03, length: 0.14, chamferRadius: 0.02)
            dash.materials = [mat]
            let dNode = SCNNode(geometry: dash)
            dNode.simdPosition = SIMD3<Float>(cos(a) * 0.86, 0.05, sin(a) * 0.86)
            dNode.simdEulerAngles = SIMD3<Float>(0, -a, 0)
            root.addChildNode(dNode)
        }
        for off: Float in [0.55, 1.02] {
            let chev = SCNCone(topRadius: 0, bottomRadius: 0.22, height: 0.36)
            chev.radialSegmentCount = 3
            chev.materials = [mat]
            let cNode = SCNNode(geometry: chev)
            cNode.simdPosition = SIMD3<Float>(off, 0.06, 0)
            cNode.simdEulerAngles = SIMD3<Float>(0, 0, -.pi * 0.5)
            root.addChildNode(cNode)
        }
        return root
    }

    // MARK: - 5. Adorable Glossy White/Cyan HYDRA-1 Micro-Submersible Probe

    public static func buildHydraProbe() -> HydraProbeRig {
        let root = SCNNode()
        root.name = "HydraProbeRoot"

        let hullContainer = SCNNode()
        hullContainer.name = "hydra_hull"
        root.addChildNode(hullContainer)

        // Glossy pearlescent white upper hull (+X = forward)
        let hullSphere = SCNSphere(radius: 0.60)
        hullSphere.segmentCount = 28
        hullSphere.materials = [makeGlossyPropMaterial(hex: 0xF0F9FF, emissionHex: 0x38BDF8, roughness: 0.08, metalness: 0.06)]
        let mainHull = SCNNode(geometry: hullSphere)
        mainHull.simdScale = SIMD3<Float>(1.25, 0.60, 0.92)
        hullContainer.addChildNode(mainHull)

        // Sky-cyan lower keel
        let keelSphere = SCNSphere(radius: 0.50)
        keelSphere.segmentCount = 20
        keelSphere.materials = [makeGlossyPropMaterial(hex: 0x7DD3FC, emissionHex: 0x0284C7, roughness: 0.14)]
        let keelNode = SCNNode(geometry: keelSphere)
        keelNode.simdScale = SIMD3<Float>(1.10, 0.42, 0.70)
        keelNode.simdPosition = SIMD3<Float>(-0.08, -0.16, 0)
        hullContainer.addChildNode(keelNode)

        // Canopy seat collar + translucent cyan cockpit dome + glowing Surge Core
        let collarTorus = SCNTorus(ringRadius: 0.33, pipeRadius: 0.042)
        collarTorus.materials = [makeGlossyPropMaterial(hex: 0x0E7490, roughness: 0.22, metalness: 0.35)]
        let collarNode = SCNNode(geometry: collarTorus)
        collarNode.simdScale = SIMD3<Float>(1.25, 1.0, 0.92)
        collarNode.simdPosition = SIMD3<Float>(0.24, 0.20, 0)
        hullContainer.addChildNode(collarNode)

        let surgeCoreGeo = makeOctahedronGeometry(radius: 0.14)
        surgeCoreGeo.materials = [makeUnlitGlowMaterial(hex: 0xFDE047, opacity: 0.98, additive: true)]
        let surgeCoreNode = SCNNode(geometry: surgeCoreGeo)
        surgeCoreNode.name = "hydra_surge_core"
        surgeCoreNode.simdPosition = SIMD3<Float>(0.24, 0.28, 0)
        root.addChildNode(surgeCoreNode)

        let domeGeo = buildHemisphereDomeGeometry(radius: 0.36, segments: 20)
        let domeMat = makeGlossyPropMaterial(hex: 0x67E8F9, emissionHex: 0x22D3EE, roughness: 0.04, opacity: 0.34)
        domeMat.writesToDepthBuffer = false
        domeGeo.materials = [domeMat]
        let domeNode = SCNNode(geometry: domeGeo)
        domeNode.simdScale = SIMD3<Float>(1.25, 0.90, 0.92)
        domeNode.simdPosition = SIMD3<Float>(0.24, 0.20, 0)
        domeNode.renderingOrder = 8
        hullContainer.addChildNode(domeNode)

        // Twin Lateral Thruster Pods + Polymer Floss Spool Pylons
        let podMat = makeGlossyPropMaterial(hex: 0xBAE6FD, emissionHex: 0x38BDF8, roughness: 0.12)
        let strutMat = makeGlossyPropMaterial(hex: 0x94A3B8, roughness: 0.28, metalness: 0.55)
        let thrusterGlowMat = makeUnlitGlowMaterial(hex: 0x5EEAD4, opacity: 0.95, additive: true)
        let spoolMat = makeGlossyPropMaterial(hex: 0xFEF3C7, roughness: 0.25)
        let silkMat = makeUnlitGlowMaterial(hex: 0x5EEAD4, opacity: 0.92)

        for side: Float in [-1, 1] {
            let pod = SCNCapsule(capRadius: 0.15, height: 0.92)
            pod.materials = [podMat]
            let podNode = SCNNode(geometry: pod)
            podNode.simdEulerAngles = SIMD3<Float>(0, 0, .pi * 0.5)
            podNode.simdPosition = SIMD3<Float>(-0.24, -0.02, side * 0.66)
            hullContainer.addChildNode(podNode)

            let strut = SCNBox(width: 0.34, height: 0.06, length: 0.32, chamferRadius: 0.02)
            strut.materials = [strutMat]
            let strutNode = SCNNode(geometry: strut)
            strutNode.simdPosition = SIMD3<Float>(-0.18, 0.0, side * 0.45)
            hullContainer.addChildNode(strutNode)

            let jet = SCNSphere(radius: 0.11)
            jet.materials = [thrusterGlowMat]
            let jetNode = SCNNode(geometry: jet)
            jetNode.simdPosition = SIMD3<Float>(-0.66, -0.02, side * 0.66)
            hullContainer.addChildNode(jetNode)

            // Floss-spool pylon atop each pod
            let mast = SCNCylinder(radius: 0.04, height: 0.34)
            mast.materials = [strutMat]
            let mastNode = SCNNode(geometry: mast)
            mastNode.simdPosition = SIMD3<Float>(-0.24, 0.20, side * 0.66)
            hullContainer.addChildNode(mastNode)

            let spool = SCNCylinder(radius: 0.13, height: 0.10)
            spool.materials = [spoolMat]
            let spoolNode = SCNNode(geometry: spool)
            spoolNode.simdEulerAngles = SIMD3<Float>(.pi * 0.5, 0, 0)
            spoolNode.simdPosition = SIMD3<Float>(-0.24, 0.40, side * 0.66)
            hullContainer.addChildNode(spoolNode)

            let silkTorus = SCNTorus(ringRadius: 0.11, pipeRadius: 0.035)
            silkTorus.materials = [silkMat]
            let silkNode = SCNNode(geometry: silkTorus)
            silkNode.simdEulerAngles = SIMD3<Float>(.pi * 0.5, 0, 0)
            silkNode.simdPosition = SIMD3<Float>(-0.24, 0.40, side * 0.66)
            hullContainer.addChildNode(silkNode)
        }

        // Forward Sonic Brush Neck + Capsule Plate + 21 Oscillating Bristle Tufts
        let neck = SCNCylinder(radius: 0.085, height: 0.62)
        neck.materials = [strutMat]
        let neckNode = SCNNode(geometry: neck)
        neckNode.simdEulerAngles = SIMD3<Float>(0, 0, .pi * 0.5 - 0.42)
        neckNode.simdPosition = SIMD3<Float>(0.82, -0.20, 0)
        hullContainer.addChildNode(neckNode)

        let headPlate = SCNCapsule(capRadius: 0.16, height: 0.72)
        headPlate.materials = [makeGlossyPropMaterial(hex: 0xF0FDFA, emissionHex: 0x2DD4BF, roughness: 0.12)]
        let headNode = SCNNode(geometry: headPlate)
        headNode.simdEulerAngles = SIMD3<Float>(.pi * 0.5, 0, 0)
        headNode.simdScale = SIMD3<Float>(1.25, 1.0, 0.55)
        headNode.simdPosition = SIMD3<Float>(1.12, -0.36, 0)
        hullContainer.addChildNode(headNode)

        let bristleGroupNode = SCNNode()
        bristleGroupNode.name = "hydra_bristles"
        let tuftWhiteMat = makeGlossyPropMaterial(hex: 0xF0FDFA, roughness: 0.2)
        let tuftMintMat = makeUnlitGlowMaterial(hex: 0x5EEAD4, opacity: 0.95)
        let tuftCone = SCNCone(topRadius: 0.042, bottomRadius: 0.026, height: 0.28)
        for row in 0..<7 {
            for col in 0..<3 {
                let idx = row * 3 + col
                let tGeo = tuftCone.copy() as? SCNGeometry ?? tuftCone
                tGeo.materials = [idx % 3 == 1 ? tuftMintMat : tuftWhiteMat]
                let tNode = SCNNode(geometry: tGeo)
                tNode.simdPosition = SIMD3<Float>(
                    1.12 + Float(col - 1) * 0.12,
                    -0.50,
                    Float(row - 3) * 0.085
                )
                bristleGroupNode.addChildNode(tNode)
            }
        }
        root.addChildNode(bristleGroupNode)

        // Counter-Rotating Rear Toothed Sonic Emitter Rings
        let outerEmitterRingNode = buildToothedEmitterRingNode(radius: 0.27, teeth: 12, ringHex: 0x22D3EE, toothHex: 0x67E8F9)
        outerEmitterRingNode.name = "hydra_outer_ring"
        outerEmitterRingNode.simdPosition = SIMD3<Float>(-0.78, 0.02, 0)
        root.addChildNode(outerEmitterRingNode)

        let innerEmitterRingNode = buildToothedEmitterRingNode(radius: 0.16, teeth: 8, ringHex: 0x0EA5E9, toothHex: 0xA5F3FC)
        innerEmitterRingNode.name = "hydra_inner_ring"
        innerEmitterRingNode.simdPosition = SIMD3<Float>(-0.78, 0.02, 0)
        root.addChildNode(innerEmitterRingNode)

        // Translucent Sonic Sweep Cone Fan Indicator under the front brush head
        let sweepFanGeo = buildSweepArcFanGeometry(
            innerRadius: 0.68,
            outerRadius: Float(GameConfig.brushBaseRadius),
            arcRad: Float(GameConfig.brushBaseArcRad)
        )
        let sweepMat = makeUnlitGlowMaterial(hex: 0x2DD4BF, opacity: 0.30, additive: false)
        sweepMat.isDoubleSided = true
        sweepMat.writesToDepthBuffer = false
        sweepFanGeo.materials = [sweepMat]
        let sweepConeNode = SCNNode(geometry: sweepFanGeo)
        sweepConeNode.name = "hydra_sweep_cone"
        sweepConeNode.simdPosition = SIMD3<Float>(0, -0.38, 0)
        sweepConeNode.renderingOrder = 5
        root.addChildNode(sweepConeNode)

        // Dynamic Laser-Silk Polymer Floss Beam Node (positioned in world or stage space when fired)
        let flossBeamNode = SCNNode()
        flossBeamNode.name = "hydra_floss_beam"
        let coreCyl = SCNCylinder(radius: 0.055, height: 1.0)
        coreCyl.materials = [makeUnlitGlowMaterial(hex: 0xFFFFFF, opacity: 0.96, additive: true)]
        flossBeamNode.addChildNode(SCNNode(geometry: coreCyl))
        let haloCyl = SCNCylinder(radius: 0.16, height: 1.0)
        haloCyl.materials = [makeUnlitGlowMaterial(hex: 0x38BDF8, opacity: 0.52, additive: true)]
        flossBeamNode.addChildNode(SCNNode(geometry: haloCyl))
        flossBeamNode.isHidden = true
        flossBeamNode.renderingOrder = 12

        return HydraProbeRig(
            rootNode: root,
            hullNode: hullContainer,
            outerEmitterRingNode: outerEmitterRingNode,
            innerEmitterRingNode: innerEmitterRingNode,
            surgeCoreNode: surgeCoreNode,
            bristleGroupNode: bristleGroupNode,
            sweepConeNode: sweepConeNode,
            flossBeamNode: flossBeamNode
        )
    }

    /// Convenience factory returning HYDRA-1's root `SCNNode` directly (with `flossBeamNode` attached under `"hydra_floss_beam"`).
    public static func buildHydraProbeNode() -> SCNNode {
        let rig = buildHydraProbe()
        rig.rootNode.addChildNode(rig.flossBeamNode)
        return rig.rootNode
    }

    private static func buildToothedEmitterRingNode(radius: Float, teeth: Int, ringHex: UInt32, toothHex: UInt32) -> SCNNode {
        let node = SCNNode()
        let torus = SCNTorus(ringRadius: CGFloat(radius), pipeRadius: 0.035)
        torus.materials = [makeUnlitGlowMaterial(hex: ringHex, opacity: 0.95)]
        let tNode = SCNNode(geometry: torus)
        tNode.simdEulerAngles = SIMD3<Float>(0, 0, .pi * 0.5) // Axis = local X
        node.addChildNode(tNode)

        let matA = makeUnlitGlowMaterial(hex: toothHex, opacity: 0.95)
        let matB = makeGlossyPropMaterial(hex: 0xF0FDFA, roughness: 0.15)
        for i in 0..<teeth {
            let a = (Float(i) / Float(teeth)) * (.pi * 2.0)
            let box = SCNBox(width: 0.05, height: 0.13, length: 0.035, chamferRadius: 0.01)
            box.materials = [i % 2 == 0 ? matA : matB]
            let bNode = SCNNode(geometry: box)
            let r = radius + 0.055
            bNode.simdPosition = SIMD3<Float>(0, cos(a) * r, sin(a) * r)
            bNode.simdEulerAngles = SIMD3<Float>(a, 0, 0)
            node.addChildNode(bNode)
        }
        return node
    }

    // MARK: - 6. Hopping Chartreuse/Amber S. mutans Cocci Pair & Acid Pool Disc

    /// Builds a cute, expressive hopping `S. mutans` diplococcus/chain node with glossy eyes,
    /// bioluminescent slime aura ring (`"mutans_aura"`), plus companion acid pool builder.
    public static func buildMutansNode(tintHex: UInt32 = 0xA3E635) -> SCNNode {
        let root = SCNNode()
        root.name = "MutansEntity"

        let bodyMat = makeGlossyPropMaterial(hex: tintHex, emissionHex: 0x65A30D, roughness: 0.22)
        let budMat = makeGlossyPropMaterial(hex: 0xFACC15, emissionHex: 0xCA8A04, roughness: 0.24)

        // Primary front coccus (+X facing)
        let headSphere = SCNSphere(radius: 0.34)
        headSphere.segmentCount = 18
        headSphere.materials = [bodyMat]
        let headNode = SCNNode(geometry: headSphere)
        headNode.simdPosition = SIMD3<Float>(0.22, 0.34, 0.0)
        headNode.simdScale = SIMD3<Float>(1.05, 0.94, 1.05)
        root.addChildNode(headNode)

        // Secondary budding coccus pair behind
        let rearSphere = SCNSphere(radius: 0.29)
        rearSphere.segmentCount = 16
        rearSphere.materials = [budMat]
        let rearNode = SCNNode(geometry: rearSphere)
        rearNode.simdPosition = SIMD3<Float>(-0.26, 0.30, 0.08)
        root.addChildNode(rearNode)

        let tailSphere = SCNSphere(radius: 0.21)
        tailSphere.segmentCount = 14
        tailSphere.materials = [bodyMat]
        let tailNode = SCNNode(geometry: tailSphere)
        tailNode.simdPosition = SIMD3<Float>(-0.62, 0.24, -0.06)
        root.addChildNode(tailNode)

        // Cute expressive glossy dark eyes + tiny white specular catchlights
        let eyeMat = makeGlossyPropMaterial(hex: 0x0F172A, roughness: 0.04)
        let glintMat = makeUnlitGlowMaterial(hex: 0xFFFFFF, opacity: 1.0)
        for side: Float in [-1, 1] {
            let eye = SCNSphere(radius: 0.068)
            eye.segmentCount = 12
            eye.materials = [eyeMat]
            let eyeNode = SCNNode(geometry: eye)
            eyeNode.simdPosition = SIMD3<Float>(0.52, 0.41, side * 0.14)
            root.addChildNode(eyeNode)

            let glint = SCNSphere(radius: 0.024)
            glint.segmentCount = 8
            glint.materials = [glintMat]
            let glintNode = SCNNode(geometry: glint)
            glintNode.simdPosition = SIMD3<Float>(0.575, 0.435, side * 0.125)
            root.addChildNode(glintNode)
        }

        // Glowing acid-slime base aura ring
        let auraTorus = SCNTorus(ringRadius: 0.72, pipeRadius: 0.055)
        auraTorus.ringSegmentCount = 28
        auraTorus.materials = [makeUnlitGlowMaterial(hex: 0xBEF264, opacity: 0.58, additive: true)]
        let auraNode = SCNNode(geometry: auraTorus)
        auraNode.name = "mutans_aura"
        auraNode.simdPosition = SIMD3<Float>(0, 0.04, 0)
        root.addChildNode(auraNode)

        return root
    }

    public static func buildAcidPoolNode(
        radius: Float = Float(GameConfig.acidPoolRadius),
        tintHex: UInt32 = 0xE11D48
    ) -> SCNNode {
        let root = SCNNode()
        root.name = "AcidPoolDisc"

        let disc = SCNCylinder(radius: CGFloat(radius), height: 0.04)
        disc.radialSegmentCount = 24
        let mat = makeUnlitGlowMaterial(hex: tintHex, opacity: 0.62, additive: false)
        mat.writesToDepthBuffer = false
        disc.materials = [mat]
        let discNode = SCNNode(geometry: disc)
        discNode.simdPosition = SIMD3<Float>(0, 0.03, 0)
        discNode.renderingOrder = 3
        root.addChildNode(discNode)

        let rim = SCNTorus(ringRadius: CGFloat(radius * 0.96), pipeRadius: 0.045)
        rim.ringSegmentCount = 28
        rim.materials = [makeUnlitGlowMaterial(hex: tintHex, opacity: 0.85, additive: true)]
        let rimNode = SCNNode(geometry: rim)
        rimNode.simdPosition = SIMD3<Float>(0, 0.05, 0)
        root.addChildNode(rimNode)

        return root
    }

    // MARK: - Low-Level Procedural Geometry & Material Primitives

    public static func makeGlossyPropMaterial(
        hex: UInt32,
        emissionHex: UInt32? = nil,
        roughness: Float = 0.16,
        metalness: Float = 0.08,
        opacity: Float = 1.0
    ) -> SCNMaterial {
        let mat = SCNMaterial()
        mat.lightingModel = .physicallyBased
        mat.diffuse.contents = RenderBridge.color(hex: hex, alpha: CGFloat(opacity))
        if let emissionHex {
            let emCol = RenderBridge.srgbSIMD3(hex: emissionHex) * 0.28
            #if canImport(UIKit)
            mat.emission.contents = UIColor(red: CGFloat(emCol.x), green: CGFloat(emCol.y), blue: CGFloat(emCol.z), alpha: 1.0)
            #elseif canImport(AppKit)
            mat.emission.contents = NSColor(srgbRed: CGFloat(emCol.x), green: CGFloat(emCol.y), blue: CGFloat(emCol.z), alpha: 1.0)
            #endif
        }
        mat.roughness.contents = NSNumber(value: roughness)
        mat.metalness.contents = NSNumber(value: metalness)
        mat.transparency = CGFloat(opacity)
        return mat
    }

    public static func makeUnlitGlowMaterial(
        hex: UInt32,
        opacity: Float = 1.0,
        additive: Bool = false
    ) -> SCNMaterial {
        let mat = SCNMaterial()
        mat.lightingModel = .constant
        mat.diffuse.contents = RenderBridge.color(hex: hex, alpha: CGFloat(opacity))
        mat.emission.contents = RenderBridge.color(hex: hex, alpha: CGFloat(opacity))
        mat.transparency = CGFloat(opacity)
        if additive {
            mat.blendMode = .add
            mat.writesToDepthBuffer = false
        }
        return mat
    }

    public static func makeOctahedronGeometry(radius r: Float) -> SCNGeometry {
        let verts: [SIMD3<Float>] = [
            SIMD3<Float>(0, r, 0),   // 0 top
            SIMD3<Float>(0, -r, 0),  // 1 bottom
            SIMD3<Float>(r, 0, 0),   // 2 +X
            SIMD3<Float>(0, 0, r),   // 3 +Z
            SIMD3<Float>(-r, 0, 0),  // 4 -X
            SIMD3<Float>(0, 0, -r)   // 5 -Z
        ]
        // 8 flat-shaded CCW faces
        let faces: [(Int, Int, Int)] = [
            (0, 3, 2), (0, 4, 3), (0, 5, 4), (0, 2, 5),
            (1, 2, 3), (1, 3, 4), (1, 4, 5), (1, 5, 2)
        ]
        return makeFlatFacetedGeometry(vertices: verts, faces: faces)
    }

    public static func makeHexagonalPrismGeometry(radius: Float, height: Float) -> SCNGeometry {
        let halfH = height * 0.5
        var verts: [SIMD3<Float>] = [
            SIMD3<Float>(0, halfH, 0),  // 0 top center
            SIMD3<Float>(0, -halfH, 0)  // 1 bottom center
        ]
        for i in 0..<6 {
            let a = (Float(i) / 6.0) * (.pi * 2.0)
            verts.append(SIMD3<Float>(cos(a) * radius, halfH, sin(a) * radius))  // 2..7 top ring
        }
        for i in 0..<6 {
            let a = (Float(i) / 6.0) * (.pi * 2.0)
            verts.append(SIMD3<Float>(cos(a) * radius, -halfH, sin(a) * radius)) // 8..13 bottom ring
        }
        var faces: [(Int, Int, Int)] = []
        for i in 0..<6 {
            let next = (i + 1) % 6
            let t0 = 2 + i
            let t1 = 2 + next
            let b0 = 8 + i
            let b1 = 8 + next
            // Top cap (+Y): sin increases from 0 -> pi/3 (+Z), so (0, t1, t0) has +Y normal
            faces.append((0, t1, t0))
            // Bottom cap (-Y): (1, b0, b1)
            faces.append((1, b0, b1))
            // Side quad outward normal
            faces.append((t0, t1, b0))
            faces.append((t1, b1, b0))
        }
        return makeFlatFacetedGeometry(vertices: verts, faces: faces)
    }

    private static func makeLumpyNuggetGeometry(radius: Float) -> SCNGeometry {
        let segs = 18
        let rings = 12
        let cols = segs + 1
        let rows = rings + 1
        var positions = [Float](repeating: 0, count: cols * rows * 3)
        var uvs = [Float](repeating: 0, count: cols * rows * 2)
        let colors = [Float](repeating: 1, count: cols * rows * 4)

        for iy in 0...rings {
            let v = Float(iy) / Float(rings)
            let phi = v * .pi
            for ix in 0...segs {
                let u = Float(ix) / Float(segs)
                let theta = u * (.pi * 2.0)
                var p = SIMD3<Float>(sin(phi) * cos(theta), cos(phi), sin(phi) * sin(theta)) * radius
                let bump = 1.0 + 0.16 * sin(p.x * 7.1 + 1.3) * sin(p.y * 6.3) + 0.10 * sin(p.z * 9.7 + p.x * 3.0)
                p *= bump
                p.y *= 0.78
                let idx = iy * cols + ix
                positions[idx * 3] = p.x
                positions[idx * 3 + 1] = p.y
                positions[idx * 3 + 2] = p.z
                uvs[idx * 2] = u
                uvs[idx * 2 + 1] = v
            }
        }
        var indices = [UInt32]()
        for iy in 0..<rings {
            for ix in 0..<segs {
                let i00 = UInt32(iy * cols + ix)
                let i10 = i00 + 1
                let i01 = UInt32((iy + 1) * cols + ix)
                let i11 = i01 + 1
                indices.append(contentsOf: [i00, i10, i01, i10, i11, i01])
            }
        }
        let normals = computeSmoothNormals(positions: positions, indices: indices)
        return makeSCNGeometry(positions: positions, normals: normals, uvs: uvs, colors: colors, indices: indices)
    }

    public static func buildHemisphereDomeGeometry(radius: Float, segments: Int = 20) -> SCNGeometry {
        let segs = max(8, segments)
        let rings = max(6, segments / 2)
        let cols = segs + 1
        let rows = rings + 1
        var positions = [Float](repeating: 0, count: cols * rows * 3)
        var uvs = [Float](repeating: 0, count: cols * rows * 2)
        let colors = [Float](repeating: 1, count: cols * rows * 4)

        for iy in 0...rings {
            let v = Float(iy) / Float(rings)
            let phi = v * (.pi * 0.5)
            for ix in 0...segs {
                let u = Float(ix) / Float(segs)
                let theta = u * (.pi * 2.0)
                let idx = iy * cols + ix
                positions[idx * 3] = sin(phi) * cos(theta) * radius
                positions[idx * 3 + 1] = cos(phi) * radius
                positions[idx * 3 + 2] = sin(phi) * sin(theta) * radius
                uvs[idx * 2] = u
                uvs[idx * 2 + 1] = v
            }
        }
        var indices = [UInt32]()
        for iy in 0..<rings {
            for ix in 0..<segs {
                let i00 = UInt32(iy * cols + ix)
                let i10 = i00 + 1
                let i01 = UInt32((iy + 1) * cols + ix)
                let i11 = i01 + 1
                indices.append(contentsOf: [i00, i10, i01, i10, i11, i01])
            }
        }
        let normals = computeSmoothNormals(positions: positions, indices: indices)
        return makeSCNGeometry(positions: positions, normals: normals, uvs: uvs, colors: colors, indices: indices)
    }

    public static func buildSweepArcFanGeometry(innerRadius: Float, outerRadius: Float, arcRad: Float, steps: Int = 24) -> SCNGeometry {
        let n = max(6, steps)
        let vertCount = (n + 1) * 2
        var positions = [Float](repeating: 0, count: vertCount * 3)
        var normals = [Float](repeating: 0, count: vertCount * 3)
        var uvs = [Float](repeating: 0, count: vertCount * 2)
        let colors = [Float](repeating: 1, count: vertCount * 4)

        // Centered along +X (probe forward axis) in XZ plane
        for i in 0...n {
            let u = Float(i) / Float(n)
            let ang = -arcRad * 0.5 + arcRad * u
            let ca = cos(ang)
            let sa = sin(ang)
            let iInner = i * 2
            let iOuter = iInner + 1

            positions[iInner * 3] = ca * innerRadius
            positions[iInner * 3 + 1] = 0
            positions[iInner * 3 + 2] = sa * innerRadius

            positions[iOuter * 3] = ca * outerRadius
            positions[iOuter * 3 + 1] = 0
            positions[iOuter * 3 + 2] = sa * outerRadius

            normals[iInner * 3 + 1] = 1
            normals[iOuter * 3 + 1] = 1

            uvs[iInner * 2] = u; uvs[iInner * 2 + 1] = 0
            uvs[iOuter * 2] = u; uvs[iOuter * 2 + 1] = 1
        }

        var indices = [UInt32]()
        for i in 0..<n {
            let a = UInt32(i * 2)
            let b = a + 1
            let c = a + 2
            let d = a + 3
            indices.append(contentsOf: [a, b, c, b, d, c])
        }
        return makeSCNGeometry(positions: positions, normals: normals, uvs: uvs, colors: colors, indices: indices)
    }

    private static func makeFlatFacetedGeometry(vertices: [SIMD3<Float>], faces: [(Int, Int, Int)]) -> SCNGeometry {
        let vertCount = faces.count * 3
        var positions = [Float](repeating: 0, count: vertCount * 3)
        var normals = [Float](repeating: 0, count: vertCount * 3)
        var uvs = [Float](repeating: 0, count: vertCount * 2)
        let colors = [Float](repeating: 1, count: vertCount * 4)
        var indices = [UInt32](repeating: 0, count: vertCount)

        for (fi, (ia, ib, ic)) in faces.enumerated() {
            let pa = vertices[ia]
            let pb = vertices[ib]
            let pc = vertices[ic]
            let rawN = simd_cross(pb - pa, pc - pa)
            let len = simd_length(rawN)
            let n = len > 1e-7 ? (rawN / len) : SIMD3<Float>(0, 1, 0)

            let tri = [pa, pb, pc]
            for k in 0..<3 {
                let vi = fi * 3 + k
                let p = tri[k]
                positions[vi * 3] = p.x
                positions[vi * 3 + 1] = p.y
                positions[vi * 3 + 2] = p.z
                normals[vi * 3] = n.x
                normals[vi * 3 + 1] = n.y
                normals[vi * 3 + 2] = n.z
                uvs[vi * 2] = Float(k == 1 ? 1 : 0)
                uvs[vi * 2 + 1] = Float(k == 2 ? 1 : 0)
                indices[vi] = UInt32(vi)
            }
        }
        return makeSCNGeometry(positions: positions, normals: normals, uvs: uvs, colors: colors, indices: indices)
    }

    private static func computeSmoothNormals(positions: [Float], indices: [UInt32]) -> [Float] {
        let vertCount = positions.count / 3
        var accum = [Float](repeating: 0, count: positions.count)

        let triCount = indices.count / 3
        for t in 0..<triCount {
            let i0 = Int(indices[t * 3])
            let i1 = Int(indices[t * 3 + 1])
            let i2 = Int(indices[t * 3 + 2])

            let p0 = SIMD3<Float>(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2])
            let p1 = SIMD3<Float>(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2])
            let p2 = SIMD3<Float>(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2])

            let fn = simd_cross(p1 - p0, p2 - p0)
            for iv in [i0, i1, i2] {
                accum[iv * 3] += fn.x
                accum[iv * 3 + 1] += fn.y
                accum[iv * 3 + 2] += fn.z
            }
        }

        for i in 0..<vertCount {
            let v = SIMD3<Float>(accum[i * 3], accum[i * 3 + 1], accum[i * 3 + 2])
            let len = simd_length(v)
            let u = len > 1e-8 ? (v / len) : SIMD3<Float>(0, 1, 0)
            accum[i * 3] = u.x
            accum[i * 3 + 1] = u.y
            accum[i * 3 + 2] = u.z
        }
        return accum
    }

    private static func makeSCNGeometry(
        positions: [Float],
        normals: [Float],
        uvs: [Float],
        colors: [Float],
        indices: [UInt32]
    ) -> SCNGeometry {
        let vertCount = positions.count / 3
        let posData = positions.withUnsafeBufferPointer { Data(buffer: $0) }
        let normData = normals.withUnsafeBufferPointer { Data(buffer: $0) }
        let uvData = uvs.withUnsafeBufferPointer { Data(buffer: $0) }
        let colData = colors.withUnsafeBufferPointer { Data(buffer: $0) }
        let idxData = indices.withUnsafeBufferPointer { Data(buffer: $0) }

        let posSrc = SCNGeometrySource(
            data: posData,
            semantic: .vertex,
            vectorCount: vertCount,
            usesFloatComponents: true,
            componentsPerVector: 3,
            bytesPerComponent: 4,
            dataOffset: 0,
            dataStride: 12
        )
        let normSrc = SCNGeometrySource(
            data: normData,
            semantic: .normal,
            vectorCount: vertCount,
            usesFloatComponents: true,
            componentsPerVector: 3,
            bytesPerComponent: 4,
            dataOffset: 0,
            dataStride: 12
        )
        let uvSrc = SCNGeometrySource(
            data: uvData,
            semantic: .texcoord,
            vectorCount: vertCount,
            usesFloatComponents: true,
            componentsPerVector: 2,
            bytesPerComponent: 4,
            dataOffset: 0,
            dataStride: 8
        )
        let colSrc = SCNGeometrySource(
            data: colData,
            semantic: .color,
            vectorCount: vertCount,
            usesFloatComponents: true,
            componentsPerVector: 4,
            bytesPerComponent: 4,
            dataOffset: 0,
            dataStride: 16
        )
        let element = SCNGeometryElement(
            data: idxData,
            primitiveType: .triangles,
            primitiveCount: indices.count / 3,
            bytesPerIndex: 4
        )

        return SCNGeometry(sources: [posSrc, normSrc, uvSrc, colSrc], elements: [element])
    }
}
