import Foundation
import MouthLifeCore
import SceneKit
import simd

/// A stage's city skyline (see CitySkylines.swift in MouthLifeCore): one flat-coloured node for the
/// buildings, a sky per district that brightens smoothly, and that district's windows, signs and
/// lamps in a few steps that switch on one after another as it gets clean. The city wakes up as the
/// player cleans it. Groups the drawing marks as moving (a streetcar, clock hands, a blinking
/// beacon) get their own small nodes so they can slide, turn or flash.
/// Web twin: src/engine/render/CitySkylineBackdrop.ts.
public final class CitySkylineNodes {
    /// One dial: a material whose brightness eases toward a target.
    fileprivate struct LightDial {
        let material: SCNMaterial
        let district: Int
        /// -1 for a district's smooth dial (sky, moving lights); else the step it switches on at.
        let step: Int
        var level: Float
        var applied: Float
    }

    fileprivate struct MovingGroup {
        let motion: SkylineMotion
        let node: SCNNode
        /// Where the node rests, in world space (its pivot, or the origin).
        let rest: SIMD3<Float>
        let district: Int
        /// A blinking group's own light material; nil when its lights follow the district's.
        let ownLight: SCNMaterial?
        var appliedGlow: Float
    }

    public let rootNode: SCNNode
    private var dials: [LightDial]
    /// Index into `dials` of each district's smooth dial, by district index.
    private let smoothDialIndex: [Int]
    private var moving: [MovingGroup]

    fileprivate init(rootNode: SCNNode, dials: [LightDial], smoothDialIndex: [Int], moving: [MovingGroup]) {
        self.rootNode = rootNode
        self.dials = dials
        self.smoothDialIndex = smoothDialIndex
        self.moving = moving
    }

    /// Eases every dial toward where its district's progress puts it, and moves the groups that move.
    public func update(dt: Float, nowSec: Float, cleanRatios: [Double], sealed: [Bool], reducedMotion: Bool) {
        // Skies glide; windows snap on quickly enough to be noticed.
        let glide = 1 - exp(-dt * 2.6)
        let snap = 1 - exp(-dt * 7)
        for i in dials.indices {
            let district = dials[i].district
            let step = dials[i].step
            let ratio = district < cleanRatios.count ? cleanRatios[district] : 0
            let isSealed = district < sealed.count ? sealed[district] : false
            let target = step < 0
                ? Float(CitySkyline.lightLevel(cleanRatio: ratio, sealed: isSealed))
                : Float(CitySkyline.stepLevel(cleanRatio: ratio, sealed: isSealed, step: step))
            dials[i].level += (target - dials[i].level) * (step < 0 ? glide : snap)
            let twinkle: Float = reducedMotion
                ? 1
                : 1 + 0.05 * sin(nowSec * 1.9 + Float(district) * 2.1 + Float(step) * 1.3)
            let shown = min(1, dials[i].level * twinkle)
            // Only touch the material when the change would be visible (keeps the frame loop quiet).
            if abs(shown - dials[i].applied) > 0.01 {
                dials[i].applied = shown
                dials[i].material.setValue(NSNumber(value: shown), forKey: CitySkylineBuilder.lightLevelKey)
            }
        }
        for i in moving.indices {
            let state = CitySkyline.motionState(moving[i].motion, timeSec: reducedMotion ? nil : Double(nowSec))
            moving[i].node.simdPosition = moving[i].rest + SIMD3<Float>(Float(state.dx), 0, 0)
            moving[i].node.simdOrientation = simd_quatf(angle: Float(state.angleRad), axis: CitySkylineBuilder.planeNormal)
            guard let own = moving[i].ownLight else { continue }
            let district = moving[i].district
            let districtLevel = district < smoothDialIndex.count ? dials[smoothDialIndex[district]].level : 1
            let glow = min(1, districtLevel * Float(state.glow))
            if abs(glow - moving[i].appliedGlow) > 0.01 {
                moving[i].appliedGlow = glow
                own.setValue(NSNumber(value: glow), forKey: CitySkylineBuilder.lightLevelKey)
            }
        }
    }
}

public enum CitySkylineBuilder {
    fileprivate static let lightLevelKey = "skylineLightLevel"

    /// The panorama leans back, so "turning" a group means turning about this, the plane's normal.
    fileprivate static let planeNormal = SIMD3<Float>(0, Float(sin(CitySkyline.tiltRad)), Float(cos(CitySkyline.tiltRad)))

    private struct Bucket {
        var positions: [Float] = []
        var colors: [Float] = []
    }

    /// Builds the skyline for a stage, or nil when its host city has no drawing.
    public static func build(cartridge: WorldCartridge) -> CitySkylineNodes? {
        guard let art = CitySkyline.art(forHost: cartridge.hostId) else { return nil }

        let districts = cartridge.districts
        let districtCount = max(1, districts.count)
        let steps = CitySkyline.lightSteps
        let offsetX = (cartridge.worldWidth - CitySkyline.artWidth) * 0.5
        let districtOf: (Double) -> Int = { drawingX in
            districts.isEmpty ? 0 : CitySkyline.districtIndex(districts: districts, worldX: drawingX + offsetX)
        }

        var base = Bucket()
        var skies = Array(repeating: Bucket(), count: districtCount)
        var stepped = Array(repeating: Array(repeating: Bucket(), count: steps), count: districtCount)
        var groupBase = Array(repeating: Bucket(), count: art.motions.count)
        var groupLights = Array(repeating: Bucket(), count: art.motions.count)

        // Each moving group is built round its resting point, so turning or sliding it is one transform.
        let rests: [SIMD3<Double>] = art.motions.enumerated().map { index, motion in
            guard let pivot = CitySkyline.motionPivot(motion) else { return SIMD3<Double>(0, 0, 0) }
            let order = art.skyline.first(where: { $0.group == index + 1 })?.order ?? 0
            return CitySkyline.point(x: pivot.x, y: pivot.y, order: order, worldWidth: cartridge.worldWidth)
        }

        for (index, piece) in art.skyline.enumerated() {
            let place: (Double, Double) -> SIMD3<Double> = { x, y in
                CitySkyline.point(x: x, y: y, order: piece.order, worldWidth: cartridge.worldWidth)
            }
            if piece.group > 0, piece.group <= art.motions.count {
                let g = piece.group - 1
                if piece.isLight {
                    add(piece, to: &groupLights[g], origin: rests[g], place: place)
                } else {
                    add(piece, to: &groupBase[g], origin: rests[g], place: place)
                }
            } else if !piece.isLight {
                add(piece, to: &base, origin: nil, place: place)
            } else if piece.topColorHex != nil {
                add(piece, to: &skies[districtOf(piece.centerX)], origin: nil, place: place)
            } else {
                let step = CitySkyline.lightStep(pieceIndex: index)
                add(piece, to: &stepped[districtOf(piece.centerX)][step], origin: nil, place: place)
            }
        }
        let anchors = CitySkyline.propAnchors(worldWidth: cartridge.worldWidth, worldDepth: cartridge.worldDepth)
        for (anchorIndex, anchor) in anchors.enumerated() {
            let district = districts.isEmpty ? 0 : CitySkyline.districtIndex(districts: districts, worldX: anchor.x)
            let step = CitySkyline.propStep(anchorIndex: anchorIndex)
            for piece in art.prop {
                let place: (Double, Double) -> SIMD3<Double> = { x, y in
                    CitySkyline.propPoint(
                        x: anchor.mirrored ? -x : x, y: y, order: piece.order, anchorX: anchor.x, anchorZ: anchor.z
                    )
                }
                if piece.isLight {
                    add(piece, to: &stepped[district][step], origin: nil, place: place)
                } else {
                    add(piece, to: &base, origin: nil, place: place)
                }
            }
        }

        let root = SCNNode()
        root.name = "CitySkyline_\(cartridge.hostId)"
        let plain = makeMaterial(lightLevel: nil)
        addNode(base, material: plain, name: "skyline_buildings", to: root)

        var dials: [CitySkylineNodes.LightDial] = []
        var smoothDialIndex: [Int] = []
        func makeDial(district: Int, step: Int) -> SCNMaterial {
            let level = step < 0
                ? Float(CitySkyline.lightLevel(cleanRatio: 0, sealed: false))
                : Float(CitySkyline.stepLevel(cleanRatio: 0, sealed: false, step: step))
            let material = makeMaterial(lightLevel: level)
            dials.append(
                CitySkylineNodes.LightDial(material: material, district: district, step: step, level: level, applied: level)
            )
            return material
        }
        for district in 0..<districtCount {
            smoothDialIndex.append(dials.count)
            addNode(skies[district], material: makeDial(district: district, step: -1), name: "skyline_sky_\(district)", to: root)
            for step in 0..<steps where !stepped[district][step].positions.isEmpty {
                addNode(
                    stepped[district][step],
                    material: makeDial(district: district, step: step),
                    name: "skyline_lights_\(district)_\(step)",
                    to: root
                )
            }
        }

        var moving: [CitySkylineNodes.MovingGroup] = []
        for (index, motion) in art.motions.enumerated() {
            let members = art.skyline.filter { $0.group == index + 1 }
            if members.isEmpty { continue }
            let district = districtOf(members.reduce(0) { $0 + $1.centerX } / Double(members.count))
            let rest = SIMD3<Float>(Float(rests[index].x), Float(rests[index].y), Float(rests[index].z))
            let node = SCNNode()
            node.name = "skyline_moving_\(index)"
            node.simdPosition = rest
            addNode(groupBase[index], material: plain, name: "moving_buildings", to: node)
            let smooth = dials[smoothDialIndex[district]]
            let ownLight = motion.kind == .blink ? makeMaterial(lightLevel: smooth.level) : nil
            addNode(groupLights[index], material: ownLight ?? smooth.material, name: "moving_lights", to: node)
            root.addChildNode(node)
            moving.append(
                CitySkylineNodes.MovingGroup(
                    motion: motion, node: node, rest: rest, district: district, ownLight: ownLight, appliedGlow: smooth.level
                )
            )
        }
        return CitySkylineNodes(rootNode: root, dials: dials, smoothDialIndex: smoothDialIndex, moving: moving)
    }

    /// The drawings' colours are sRGB; vertex colours reach the renderer as linear values.
    private static func linear(_ channel: UInt32) -> Float {
        let c = Float(channel) / 255
        return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }

    private static func linearRGB(_ hex: UInt32) -> SIMD3<Float> {
        SIMD3<Float>(linear((hex >> 16) & 0xFF), linear((hex >> 8) & 0xFF), linear(hex & 0xFF))
    }

    private static func add(
        _ piece: SkylinePiece,
        to bucket: inout Bucket,
        origin: SIMD3<Double>?,
        place: (Double, Double) -> SIMD3<Double>
    ) {
        let foot = linearRGB(piece.colorHex)
        let top = piece.topColorHex.map(linearRGB)
        let span = top == nil ? (minY: 0.0, maxY: 1.0) : CitySkyline.pieceSpanY(piece)
        let spanY = max(1e-6, span.maxY - span.minY)
        let shift = origin ?? SIMD3<Double>(0, 0, 0)
        var i = 0
        while i < piece.triangles.count {
            let p = place(piece.triangles[i], piece.triangles[i + 1]) - shift
            bucket.positions += [Float(p.x), Float(p.y), Float(p.z)]
            if let top {
                // A shaded rectangle runs from its foot colour to its top colour.
                let t = Float((piece.triangles[i + 1] - span.minY) / spanY)
                let c = foot + (top - foot) * t
                bucket.colors += [c.x, c.y, c.z, 1]
            } else {
                bucket.colors += [foot.x, foot.y, foot.z, 1]
            }
            i += 2
        }
    }

    private static func addNode(_ bucket: Bucket, material: SCNMaterial, name: String, to parent: SCNNode) {
        guard let geometry = makeGeometry(bucket) else { return }
        geometry.materials = [material]
        let node = SCNNode(geometry: geometry)
        node.name = name
        node.castsShadow = false
        parent.addChildNode(node)
    }

    private static func makeGeometry(_ bucket: Bucket) -> SCNGeometry? {
        let count = bucket.positions.count / 3
        guard count >= 3 else { return nil }

        // Every piece lies in the same leaning plane, so they all share one normal: toward the camera.
        var normals: [Float] = []
        normals.reserveCapacity(count * 3)
        for _ in 0..<count { normals += [planeNormal.x, planeNormal.y, planeNormal.z] }
        let indices = (0..<UInt32(count)).map { $0 }

        let posData = bucket.positions.withUnsafeBufferPointer { Data(buffer: $0) }
        let normData = normals.withUnsafeBufferPointer { Data(buffer: $0) }
        let colData = bucket.colors.withUnsafeBufferPointer { Data(buffer: $0) }
        let idxData = indices.withUnsafeBufferPointer { Data(buffer: $0) }

        let posSrc = SCNGeometrySource(
            data: posData, semantic: .vertex, vectorCount: count, usesFloatComponents: true,
            componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: 12
        )
        let normSrc = SCNGeometrySource(
            data: normData, semantic: .normal, vectorCount: count, usesFloatComponents: true,
            componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: 12
        )
        let colSrc = SCNGeometrySource(
            data: colData, semantic: .color, vectorCount: count, usesFloatComponents: true,
            componentsPerVector: 4, bytesPerComponent: 4, dataOffset: 0, dataStride: 16
        )
        let element = SCNGeometryElement(
            data: idxData, primitiveType: .triangles, primitiveCount: count / 3, bytesPerIndex: 4
        )
        return SCNGeometry(sources: [posSrc, normSrc, colSrc], elements: [element])
    }

    /// Flat, unlit vertex colours. Light meshes also get a brightness dial the frame loop turns.
    private static func makeMaterial(lightLevel: Float?) -> SCNMaterial {
        let material = SCNMaterial()
        material.lightingModel = .constant
        material.diffuse.contents = RenderBridge.color(hex: 0xFFFFFF)
        // Constant lighting still adds ambient light times the ambient colour; keep that at zero so
        // the drawing's colours come through exactly.
        material.locksAmbientWithDiffuse = false
        material.ambient.contents = RenderBridge.color(hex: 0x000000)
        material.isDoubleSided = true
        if let lightLevel {
            material.shaderModifiers = [
                .fragment: """
                #pragma arguments
                float \(lightLevelKey);

                #pragma body
                _output.color.rgb *= \(lightLevelKey);
                """
            ]
            material.setValue(NSNumber(value: lightLevel), forKey: lightLevelKey)
        }
        return material
    }
}
