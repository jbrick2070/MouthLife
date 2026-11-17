import Foundation
import MouthLifeCore
import SceneKit
import simd

/// A stage's city skyline (see CitySkylines.swift in MouthLifeCore): one flat-coloured node for the
/// buildings, plus one node of lights per district whose brightness follows how clean that district
/// is. The city wakes up as the player cleans it. Web twin: src/engine/render/CitySkylineBackdrop.ts.
public final class CitySkylineNodes {
    public let rootNode: SCNNode
    private let lightMaterials: [SCNMaterial]
    private var levels: [Float]
    private var applied: [Float]

    fileprivate init(rootNode: SCNNode, lightMaterials: [SCNMaterial], startLevel: Float) {
        self.rootNode = rootNode
        self.lightMaterials = lightMaterials
        self.levels = Array(repeating: startLevel, count: lightMaterials.count)
        self.applied = Array(repeating: startLevel, count: lightMaterials.count)
    }

    /// Eases each district's lights toward its clean level, with a slow twinkle.
    public func update(dt: Float, nowSec: Float, cleanRatios: [Double], sealed: [Bool], reducedMotion: Bool) {
        let ease = 1 - exp(-dt * 2.6)
        for i in lightMaterials.indices {
            let ratio = i < cleanRatios.count ? cleanRatios[i] : 0
            let isSealed = i < sealed.count ? sealed[i] : false
            let target = Float(CitySkyline.lightLevel(cleanRatio: ratio, sealed: isSealed))
            levels[i] += (target - levels[i]) * ease
            let twinkle: Float = reducedMotion ? 1 : 1 + 0.05 * sin(nowSec * 1.9 + Float(i) * 2.1)
            let shown = min(1, levels[i] * twinkle)
            // Only touch the material when the change would be visible (keeps the frame loop quiet).
            if abs(shown - applied[i]) > 0.01 {
                applied[i] = shown
                lightMaterials[i].setValue(NSNumber(value: shown), forKey: CitySkylineBuilder.lightLevelKey)
            }
        }
    }
}

public enum CitySkylineBuilder {
    fileprivate static let lightLevelKey = "skylineLightLevel"

    private struct Bucket {
        var positions: [Float] = []
        var colors: [Float] = []
    }

    /// Builds the skyline for a stage, or nil when its host city has no drawing.
    public static func build(cartridge: WorldCartridge) -> CitySkylineNodes? {
        guard let art = CitySkyline.art(forHost: cartridge.hostId) else { return nil }

        let districts = cartridge.districts
        var base = Bucket()
        var lights = Array(repeating: Bucket(), count: districts.count)
        let offsetX = (cartridge.worldWidth - CitySkyline.artWidth) * 0.5

        for piece in art.skyline {
            let place: (Double, Double) -> SIMD3<Double> = { x, y in
                CitySkyline.point(x: x, y: y, order: piece.order, worldWidth: cartridge.worldWidth)
            }
            if piece.isLight, !lights.isEmpty {
                let district = CitySkyline.districtIndex(districts: districts, worldX: piece.centerX + offsetX)
                add(piece, to: &lights[district], place: place)
            } else {
                add(piece, to: &base, place: place)
            }
        }
        for anchor in CitySkyline.propAnchors(worldWidth: cartridge.worldWidth, worldDepth: cartridge.worldDepth) {
            let district = CitySkyline.districtIndex(districts: districts, worldX: anchor.x)
            for piece in art.prop {
                let place: (Double, Double) -> SIMD3<Double> = { x, y in
                    CitySkyline.propPoint(x: x, y: y, order: piece.order, anchorX: anchor.x, anchorZ: anchor.z)
                }
                if piece.isLight, !lights.isEmpty {
                    add(piece, to: &lights[district], place: place)
                } else {
                    add(piece, to: &base, place: place)
                }
            }
        }

        let root = SCNNode()
        root.name = "CitySkyline_\(cartridge.hostId)"
        if let geometry = makeGeometry(base) {
            geometry.materials = [makeMaterial(lightLevel: nil)]
            let node = SCNNode(geometry: geometry)
            node.name = "skyline_buildings"
            node.castsShadow = false
            root.addChildNode(node)
        }

        let startLevel = Float(CitySkyline.lightLevel(cleanRatio: 0, sealed: false))
        var lightMaterials: [SCNMaterial] = []
        for (index, bucket) in lights.enumerated() {
            let material = makeMaterial(lightLevel: startLevel)
            lightMaterials.append(material)
            guard let geometry = makeGeometry(bucket) else { continue }
            geometry.materials = [material]
            let node = SCNNode(geometry: geometry)
            node.name = "skyline_lights_\(index)"
            node.castsShadow = false
            root.addChildNode(node)
        }
        return CitySkylineNodes(rootNode: root, lightMaterials: lightMaterials, startLevel: startLevel)
    }

    /// The drawings' colours are sRGB; vertex colours reach the renderer as linear values.
    private static func linear(_ channel: UInt32) -> Float {
        let c = Float(channel) / 255
        return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }

    private static func add(_ piece: SkylinePiece, to bucket: inout Bucket, place: (Double, Double) -> SIMD3<Double>) {
        let r = linear((piece.colorHex >> 16) & 0xFF)
        let g = linear((piece.colorHex >> 8) & 0xFF)
        let b = linear(piece.colorHex & 0xFF)
        var i = 0
        while i < piece.triangles.count {
            let p = place(piece.triangles[i], piece.triangles[i + 1])
            bucket.positions += [Float(p.x), Float(p.y), Float(p.z)]
            bucket.colors += [r, g, b, 1]
            i += 2
        }
    }

    private static func makeGeometry(_ bucket: Bucket) -> SCNGeometry? {
        let count = bucket.positions.count / 3
        guard count >= 3 else { return nil }

        // Every piece lies in the same leaning plane, so they all share one normal: toward the camera.
        let normal: [Float] = [0, Float(sin(CitySkyline.tiltRad)), Float(cos(CitySkyline.tiltRad))]
        var normals: [Float] = []
        normals.reserveCapacity(count * 3)
        for _ in 0..<count { normals += normal }
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
