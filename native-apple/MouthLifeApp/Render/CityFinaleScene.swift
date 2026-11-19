import Foundation
import ModelIO
import MouthLifeCore
import SceneKit
import SceneKit.ModelIO
import SwiftUI
import simd
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

// The city finale and the grand finale in 3D (native). Everything it shows comes from the shared,
// tested timeline (CityFinale) and its 3D layout (Finale3D); this file only turns those numbers into
// a SceneKit scene. The web twin is src/engine/render/FinaleStage3D.ts.
//
// The look: a glowing cut-paper diorama at night. The skyline drawing becomes a relief, each piece
// cut out and set a little in front of the one behind, bent round the viewer and reflected in dark
// water; a sky dome with an aurora; in front, a stage where the coin, the Golden Molar (a porcelain
// tooth with jewel settings) and a spire of hexagonal crystal columns stand as solid shapes. The
// sparks of the fireworks are drawn over the 3D view by the 2D layer (CityFinaleView), projected
// through the same camera (FinaleLens), so they glow like the web edition's.

/// The show's clock and the screen size, shared with SceneKit's render thread.
final class FinaleSceneClock: @unchecked Sendable {
    private let lock = NSLock()
    private var start = Date()
    private var size = CGSize(width: 16, height: 9)

    func setStart(_ date: Date) { lock.withLock { start = date } }
    func setSize(_ s: CGSize) { lock.withLock { size = s } }
    func now() -> (t: Double, size: CGSize) { lock.withLock { (Date().timeIntervalSince(start), size) } }
}

/// The finale camera as a lens: where it is, which way it looks, and how it maps world points to
/// the screen. The 3D scene and the 2D layer both use it, so sparks land where the scene puts them.
struct FinaleLens {
    let pos: SIMD3<Double>
    let target: SIMD3<Double>
    let right: SIMD3<Double>
    let up: SIMD3<Double>
    let forward: SIMD3<Double>
    let vFovDegrees: Double
    let tanHalf: Double
    let w: Double
    let h: Double

    init(_ shot: Finale3D.CameraShot, width: Double, height: Double) {
        w = max(1, width)
        h = max(1, height)
        // Keep the 16:9 horizontal framing on tall screens by opening the vertical angle.
        let aspect = w / h
        // On a tall screen keep only the middle of the 16:9 width in shot (42% on a phone held
        // upright), so the city and the stage fill the height instead of leaving empty sky and water.
        let coverage = aspect >= 1 ? 1 : min(1, max(0.42, 0.42 + 0.58 * (aspect - 0.45) / 0.55))
        let hTan = tan(shot.fov * Double.pi / 360) * (16.0 / 9.0) * coverage
        var wanted = shot.fov
        if aspect < 16.0 / 9.0 { wanted = max(shot.fov, 2 * atan(min(2.4, hTan / aspect)) * 180 / Double.pi) }
        vFovDegrees = min(FinaleLens.maxVFov, wanted)
        tanHalf = tan(vFovDegrees * Double.pi / 360)
        // past the widest angle, step back along the view instead, keeping the same width in shot
        let back = tan(wanted * Double.pi / 360) / tanHalf
        pos = shot.target + (shot.pos - shot.target) * back
        // On a tall screen the opened angle shows mostly empty water; aim a little higher so the
        // sky (where the fireworks are) takes the space instead.
        var aim = shot.target
        if aspect < 1 {
            let extra = (vFovDegrees - shot.fov) * 0.2 * Double.pi / 180
            aim.y += simd_length(shot.target - pos) * tan(extra)
        }
        target = aim
        forward = simd_normalize(aim - pos)
        right = simd_normalize(simd_cross(forward, SIMD3<Double>(0, 1, 0)))
        up = simd_cross(right, forward)
    }

    /// The widest vertical angle on tall screens (degrees); beyond it the camera steps back.
    static let maxVFov = 76.0

    /// A world point on screen (points), with its distance in front of the camera; nil behind it.
    func project(_ p: SIMD3<Double>) -> (x: Double, y: Double, depth: Double)? {
        let v = p - pos
        let z = simd_dot(v, forward)
        if z < 0.05 { return nil }
        let k = (h / 2) / (z * tanHalf)
        return (w / 2 + simd_dot(v, right) * k, h / 2 - simd_dot(v, up) * k, z)
    }

    /// How many points a world length spans at a distance.
    func pixels(_ length: Double, depth: Double) -> Double { length * (h / 2) / (max(0.05, depth) * tanHalf) }
}

/// The molar's pose, shared by the scene and the 2D layer (which puts the ending's face on it).
struct FinaleMolarPose {
    var position: SIMD3<Double>
    var scale: Double
    var pitch: Double
    var yaw: Double

    /// A point in molar units (x, y across the chewing surface, z up out of it) in the world.
    func world(_ p: SIMD3<Double>) -> SIMD3<Double> {
        // rotation = Rx(pitch) * Ry(yaw), as SceneKit's euler angles and three.js's XYZ order
        let cy = cos(yaw), sy = sin(yaw)
        let ry = SIMD3<Double>(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy)
        let cx = cos(pitch), sx = sin(pitch)
        let rx = SIMD3<Double>(ry.x, ry.y * cx - ry.z * sx, ry.y * sx + ry.z * cx)
        return position + rx * scale
    }

    /// Where the ending's face goes: the middle of the front wall once the molar has stood up.
    func faceAnchor() -> (center: SIMD3<Double>, side: SIMD3<Double>) {
        let o = CityFinale.Molar.bodyCenter
        let front = Finale3D.molarOutlineRadius(-Double.pi / 2) * 1.05
        let local = SIMD3<Double>(o.x, o.y - front, -0.16)
        return (world(local), world(local + SIMD3<Double>(1, 0, 0)))
    }
}

enum FinaleLook {
    static func linear(_ hex: UInt32) -> SIMD3<Float> { RenderBridge.linearSIMD3(hex: hex) }

    /// The night sky colour a drawing's black sky top fades into.
    static let nightHex: UInt32 = 0x0B1640

    /// The drawing's sky at five points across the panorama: each point's stacked strips, low to
    /// high, as four colours (horizon glow, two bands, top), and where the bands start as directions
    /// on the dome. Same as skyStops in FinaleStage3D.ts.
    static func skyStops(_ art: CityArt?) -> (colors: [(UInt32, UInt32, UInt32, UInt32)], heights: (Double, Double, Double, Double)) {
        var colors: [(UInt32, UInt32, UInt32, UInt32)] = []
        var heights = (0.0, 0.03, 0.07, 0.13)
        var found = false
        for x in [0.0, 16, 32, 48, 64] {
            var strips: [(p: SkylinePiece, lo: Double, hi: Double)] = []
            for p in art?.skyline ?? [] where p.isLight && p.topColorHex != nil {
                var lo = Double.infinity
                var hi = -Double.infinity
                var i = 0
                while i < p.triangles.count {
                    lo = min(lo, p.triangles[i])
                    hi = max(hi, p.triangles[i])
                    i += 2
                }
                if x < lo - 0.5 || x > hi + 0.5 { continue }
                let span = CitySkyline.pieceSpanY(p)
                strips.append((p, span.minY, span.maxY))
            }
            strips.sort { $0.lo < $1.lo }
            guard let first = strips.first, let last = strips.last else {
                colors.append((0x1E293B, 0x172554, 0x0F172A, nightHex))
                continue
            }
            func top(_ c: UInt32?) -> UInt32 { c == nil || c == 0x000000 ? nightHex : c! }
            let s0 = first.p
            let s1 = strips.count > 1 ? strips[1].p : nil
            let s2 = strips.count > 2 ? strips[2].p : nil
            colors.append((
                s0.colorHex,
                s1?.colorHex ?? top(s0.topColorHex),
                s2?.colorHex ?? (s1.map { top($0.topColorHex) } ?? top(s0.topColorHex)),
                top(last.p.topColorHex)
            ))
            if !found && strips.count >= 3 {
                heights = (strips[0].lo / 55, strips[1].lo / 55, strips[2].lo / 55, last.hi / 55)
                found = true
            }
        }
        return (colors, heights)
    }

    /// How far the molar has stood up for the ending's face (0..1), with every piece gold.
    static func faceTilt(_ t: Double, allGold: Bool) -> Double {
        allGold ? CityFinale.smooth01((t - (CityFinale.Ending.face - 1.4)) / 1.2) : 0
    }

    static func molarPose(cx: Double, cy: Double, scale: Double, t: Double, faceTilt: Double, turn: Bool, reducedMotion: Bool) -> FinaleMolarPose {
        let yaw = turn && !reducedMotion ? sin(t * 0.6) * 0.38 : 0
        return FinaleMolarPose(
            position: Finale3D.stageWorld(cx, cy, 0.3),
            scale: scale * Finale3D.stageUnit,
            pitch: -1.08 - 0.25 * faceTilt,
            yaw: yaw * (1 - faceTilt)
        )
    }

    /// During the credits the molar rides at the top of the view: its stage spot mapped onto a
    /// plane 14 units in front of the camera.
    static func pinnedToView(_ lens: FinaleLens, x: Double, y: Double, scale: Double) -> (position: SIMD3<Double>, scale: Double) {
        let depth = 14.0
        let half = lens.tanHalf * depth
        let k = (min(lens.w, lens.h) / lens.h) * half
        // a little higher than its stage spot, so its roots clear the credit's words below it
        let lifted = y + 0.25 * scale / 0.34
        return (lens.pos + lens.forward * depth + lens.right * (x * k) + lens.up * (lifted * k), scale * k)
    }
}

// MARK: - Geometry helpers

private struct VertexBucket {
    var positions: [Float] = []
    var colors: [Float] = []
    /// Per-vertex data for the shaders, carried in the normal: (drawing x, light?, shade).
    var data: [Float] = []
}

private func makeGeometry(positions: [Float], normals: [Float], colors: [Float]?, indices: [UInt32]? = nil) -> SCNGeometry? {
    let count = positions.count / 3
    guard count >= 3 else { return nil }
    var sources: [SCNGeometrySource] = []
    sources.append(SCNGeometrySource(
        data: positions.withUnsafeBufferPointer { Data(buffer: $0) }, semantic: .vertex, vectorCount: count,
        usesFloatComponents: true, componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: 12
    ))
    sources.append(SCNGeometrySource(
        data: normals.withUnsafeBufferPointer { Data(buffer: $0) }, semantic: .normal, vectorCount: count,
        usesFloatComponents: true, componentsPerVector: 3, bytesPerComponent: 4, dataOffset: 0, dataStride: 12
    ))
    if let colors {
        sources.append(SCNGeometrySource(
            data: colors.withUnsafeBufferPointer { Data(buffer: $0) }, semantic: .color, vectorCount: count,
            usesFloatComponents: true, componentsPerVector: 4, bytesPerComponent: 4, dataOffset: 0, dataStride: 16
        ))
    }
    let idx = indices ?? (0..<UInt32(count)).map { $0 }
    let element = SCNGeometryElement(
        data: idx.withUnsafeBufferPointer { Data(buffer: $0) }, primitiveType: .triangles,
        primitiveCount: idx.count / 3, bytesPerIndex: 4
    )
    return SCNGeometry(sources: sources, elements: [element])
}

private func meshGeometry(_ m: Finale3D.MeshData) -> SCNGeometry? {
    makeGeometry(
        positions: m.positions.map { Float($0) },
        normals: m.normals.map { Float($0) },
        colors: nil,
        indices: m.indices.map { UInt32($0) }
    )
}

/// Edges used by only one triangle of a piece: its outline, which gets a side wall.
private func boundaryEdges(_ tris: [Double]) -> [(Double, Double, Double, Double)] {
    func key(_ x: Double, _ y: Double) -> Int64 { Int64((x * 1e4).rounded()) &* 1_000_003 &+ Int64((y * 1e4).rounded()) }
    var count: [String: (n: Int, e: (Double, Double, Double, Double))] = [:]
    var order: [String] = []
    var i = 0
    while i + 5 < tris.count {
        let v = [(tris[i], tris[i + 1]), (tris[i + 2], tris[i + 3]), (tris[i + 4], tris[i + 5])]
        for k in 0..<3 {
            let a = v[k]
            let b = v[(k + 1) % 3]
            let ka = key(a.0, a.1)
            let kb = key(b.0, b.1)
            if ka == kb { continue }
            let id = ka < kb ? "\(ka)|\(kb)" : "\(kb)|\(ka)"
            if let hit = count[id] {
                count[id] = (hit.n + 1, hit.e)
            } else {
                count[id] = (1, (a.0, a.1, b.0, b.1))
                order.append(id)
            }
        }
        i += 6
    }
    return order.compactMap { id in count[id].flatMap { $0.n == 1 ? $0.e : nil } }
}

/// A small equirectangular studio: a bright warm ceiling, two softboxes, a dark floor.
private func studioImage() -> CGImage? {
    let w = 256, h = 128
    guard let ctx = CGContext(
        data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return nil }
    let colors = [
        CGColor(red: 1.0, green: 0.97, blue: 0.9, alpha: 1),
        CGColor(red: 0.62, green: 0.6, blue: 0.58, alpha: 1),
        CGColor(red: 0.3, green: 0.3, blue: 0.32, alpha: 1),
        CGColor(red: 0.06, green: 0.06, blue: 0.08, alpha: 1),
    ] as CFArray
    if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.35, 0.52, 1]) {
        ctx.drawLinearGradient(g, start: CGPoint(x: 0, y: h), end: CGPoint(x: 0, y: 0), options: [])
    }
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 0.97, alpha: 1))
    ctx.fill(CGRect(x: 40, y: 78, width: 36, height: 22))
    ctx.fill(CGRect(x: 168, y: 82, width: 44, height: 18))
    return ctx.makeImage()
}

private func glowImage() -> CGImage? {
    let size = 64
    guard let ctx = CGContext(
        data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return nil }
    let colors = [
        CGColor(red: 1, green: 1, blue: 1, alpha: 1),
        CGColor(red: 1, green: 1, blue: 1, alpha: 0.35),
        CGColor(red: 1, green: 1, blue: 1, alpha: 0),
    ] as CFArray
    guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.35, 1]) else { return nil }
    let c = CGPoint(x: size / 2, y: size / 2)
    ctx.drawRadialGradient(gradient, startCenter: c, startRadius: 0, endCenter: c, endRadius: CGFloat(size / 2), options: [])
    return ctx.makeImage()
}

// MARK: - Shaders

private enum FinaleShaders {
    /// The relief city: wave of light, coloured firework flashes, far twilight haze, and (for the
    /// mirror twin) gentle water-surface wave undulation.
    static func relief(mirror: Bool) -> String {
        let vary = mirror ? "#pragma varyings\nfloat4 reliefInfo;\n" : ""
        let ripple = mirror
            ? """
            if (wp.y < 0.0 && uRm < 0.5) {
                float wd = -wp.y;
                float shift = (sin(wd * 2.6 - uT * 1.8 + wp.x * 0.22) * 0.11 + sin(wd * 5.2 + uT * 1.3 - wp.x * 0.35) * 0.045) * smoothstep(0.0, 1.5, wd);
                _geometry.position.x += shift;
                wp.x += shift;
            }
            out.reliefInfo = float4(uT, uRm, isLight ? 1.0 : 0.0, 0.0);
            """
            : ""
        return """
        #pragma arguments
        float4 showTime;
        float4 cityLook;
        float4 cityHaze;
        float4 burstA;
        float4 burstB;
        \(vary)
        #pragma body
        float uT = showTime.x;
        float uRm = showTime.y;
        float uOverride = showTime.z;
        float uNeon = cityLook.x;
        float uGlow = cityLook.y;
        float cx = _geometry.normal.x;
        bool isLight = _geometry.normal.y > 0.5;
        float shade = _geometry.normal.z;
        float night = isLight ? 0.06 : 0.34;
        float ramp = (isLight ? 0.18 : 0.7) * (uRm > 0.5 ? 3.0 : 1.0);
        float pass = uRm > 0.5 ? \(CityFinale.riseEnd + 1) : \(CityFinale.riseEnd) + (clamp(cx, -3.0, 67.0) + 3.0) / 70.0 * \(CityFinale.waveEnd - CityFinale.riseEnd);
        float age = uT - pass;
        float s = clamp(age / ramp, 0.0, 1.0);
        s = s * s * (3.0 - 2.0 * s);
        float level = age <= 0.0 ? night : night + (1.0 - night) * s;
        float flash = (isLight && age > 0.0 && uRm < 0.5) ? 0.75 * exp(-age / 0.16) : 0.0;
        float showT = uT - \(CityFinale.blazeEnd);
        if (uNeon > 0.5 && isLight && uRm < 0.5 && showT >= 0.0 && uT < \(CityFinale.showEnd)) {
            level *= 0.84 + 0.16 * cos(12.566370614 * showT);
        }
        float d = clamp(uT - 14.0, 0.0, 1.0);
        level *= 1.0 - 0.35 * d * d * (3.0 - 2.0 * d);
        if (uOverride >= 0.0) { level = uOverride; flash = 0.0; }
        if (isLight) { level *= uGlow; }
        float3 wp = (scn_node.modelTransform * float4(_geometry.position.xyz, 1.0)).xyz;
        \(ripple)
        // the drawing's levels were made for screen colours; in linear light their squares match,
        // and lit windows run a little past 1 so the bloom makes them glow
        float3 baseCol = _geometry.color.rgb;
        float3 lit = baseCol * (level * level) * (shade * shade) * (isLight ? 1.3 : 1.0);
        if (!isLight) { lit = min(lit, float3(1.0)); }
        // soft coloured wash from bursting firework shells onto nearby buildings and their reflection
        float hCatch = 0.45 + 0.55 * clamp(abs(wp.y) / 5.5, 0.0, 1.0);
        float dA = (cx - burstA.w) / 15.0;
        float dB = (cx - burstB.w) / 15.0;
        float3 burstWash = burstA.rgb * exp(-dA * dA) + burstB.rgb * exp(-dB * dB);
        float catchAmt = isLight ? 0.14 : (0.44 * hCatch * (0.65 + 0.35 * shade));
        lit += burstWash * catchAmt * (0.35 + 0.65 * baseCol);
        // atmospheric twilight haze on the far skyline so the foreground stage reads crisply in front
        float camDist = length((scn_node.modelViewTransform * float4(_geometry.position.xyz, 1.0)).xyz);
        float distHaze = smoothstep(34.0, 96.0, camDist) * 0.24;
        float sf = clamp((uT - 14.0) / 1.4, 0.0, 1.0);
        float stageFocus = uOverride >= 0.0 ? 0.0 : sf * sf * (3.0 - 2.0 * sf);
        float lowMist = 1.0 - clamp(abs(wp.y) / 7.0, 0.0, 1.0);
        float hazeAmt = clamp((distHaze + stageFocus * (0.34 + 0.14 * lowMist)) * cityHaze.w, 0.0, 0.58);
        if (isLight) { hazeAmt *= 0.62; }
        float hazeLit = uOverride >= 0.0 ? uOverride * uOverride : (0.25 + 0.75 * smoothstep(2.5, 7.5, uT));
        float3 colOut = lit + (float3(1.0) - min(lit, float3(1.0))) * flash;
        _geometry.color = float4(mix(colOut, cityHaze.rgb * hazeLit, hazeAmt), 1.0);
        """
    }

    /// The sky's direction from the dome's centre, handed to the fragment stage per pixel.
    static let skyGeometry = """
    #pragma varyings
    float3 skyDir;

    #pragma body
    out.skyDir = _geometry.position.xyz;
    """

    /// The sky: the drawing's sky sampled at five points across the panorama and blended, lit by
    /// the wave, with stars and an aurora of thin folded ribbons.
    static let sky = """
    #pragma arguments
    float4 skyTime;
    float4 auroraA;
    float4 auroraB;
    float4 skyHeights;
    float4 skyA0;
    float4 skyA1;
    float4 skyA2;
    float4 skyA3;
    float4 skyA4;
    float4 skyB0;
    float4 skyB1;
    float4 skyB2;
    float4 skyB3;
    float4 skyB4;
    float4 skyC0;
    float4 skyC1;
    float4 skyC2;
    float4 skyC3;
    float4 skyC4;
    float4 skyD0;
    float4 skyD1;
    float4 skyD2;
    float4 skyD3;
    float4 skyD4;

    #pragma declaration
    float finaleSkyHash(float3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float finaleSkyNoise(float2 p) {
        float2 i = floor(p);
        float2 f = fract(p);
        float2 u = f * f * (3.0 - 2.0 * f);
        float a = finaleSkyHash(float3(i, 1.0));
        float b = finaleSkyHash(float3(i + float2(1.0, 0.0), 1.0));
        float c = finaleSkyHash(float3(i + float2(0.0, 1.0), 1.0));
        float d = finaleSkyHash(float3(i + float2(1.0, 1.0), 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float finaleSkyFbm(float2 p) {
        float s = 0.0;
        float a = 0.5;
        for (int i = 0; i < 3; i++) { s += a * finaleSkyNoise(p); p *= 2.03; a *= 0.5; }
        return s;
    }
    float finaleSm(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }

    #pragma body
    float uT = skyTime.x;
    float uRm = skyTime.y;
    float uOverride = skyTime.z;
    float uAurora = skyTime.w;
    float uSpace = auroraA.w;
    float3 d = normalize(in.skyDir);
    float h = clamp(d.y, -0.2, 1.0);
    float xd = 32.0 + atan2(d.x, -d.z) * 74.0;
    float f = clamp(xd / 16.0, 0.0, 3.999);
    float w = finaleSm(fract(f));
    float3 sa[5] = { skyA0.rgb, skyA1.rgb, skyA2.rgb, skyA3.rgb, skyA4.rgb };
    float3 sb[5] = { skyB0.rgb, skyB1.rgb, skyB2.rgb, skyB3.rgb, skyB4.rgb };
    float3 sc[5] = { skyC0.rgb, skyC1.rgb, skyC2.rgb, skyC3.rgb, skyC4.rgb };
    float3 sd[5] = { skyD0.rgb, skyD1.rgb, skyD2.rgb, skyD3.rgb, skyD4.rgb };
    int k = int(floor(f));
    float3 c0 = mix(sa[k], sa[k + 1], w);
    float3 c1 = mix(sb[k], sb[k + 1], w);
    float3 c2 = mix(sc[k], sc[k + 1], w);
    float3 c3 = mix(sd[k], sd[k + 1], w);
    float4 H = skyHeights;
    float pass = uRm > 0.5 ? 3.5 : 2.5 + (clamp(xd, -3.0, 67.0) + 3.0) / 70.0 * 4.5;
    float age = uT - pass;
    float level = age <= 0.0 ? 0.16 : 0.16 + 0.84 * finaleSm(age / (uRm > 0.5 ? 3.6 : 1.2));
    level *= 1.0 - 0.3 * finaleSm(uT - 14.0);
    if (uOverride >= 0.0) { level = uOverride; }
    level *= level;
    float3 glowSky = c0;
    glowSky = mix(glowSky, c1, finaleSm((h - H.x) / max(1e-4, H.y - H.x)));
    glowSky = mix(glowSky, c2, finaleSm((h - H.y) / max(1e-4, H.z - H.y)));
    glowSky = mix(glowSky, c3, finaleSm((h - H.z) / max(1e-4, H.w - H.z)));
    float3 night = float3(0.01, 0.022, 0.07);
    float3 space = float3(0.003, 0.006, 0.022);
    float3 col = mix(glowSky * level, night, finaleSm((h - H.w) / 0.14));
    col = mix(col, space, finaleSm((h - 0.3) / 0.45));
    // living water below the horizon: gentle horizon shimmer and fine drifting glints
    if (d.y < 0.0 && uSpace < 0.5) {
        float depth = -d.y;
        float az = atan2(d.x, -d.z);
        float wt = uRm > 0.5 ? 0.0 : uT;
        float wz = 1.0 / (depth + 0.04);
        float horizonBand = exp(-depth * 13.0);
        float midBand = exp(-depth * 4.2);
        float swell = 0.5 + 0.5 * sin(wz * 1.15 - wt * 1.2 + sin(az * 6.0 + wt * 0.35) * 1.4);
        // fine glints, not broad patches: broad ones read as mud
        float sparkle = finaleSkyNoise(float2(az * 110.0 + sin(wz * 0.45 + wt * 0.4) * 0.8, wz * 1.6 - wt * 0.75));
        float glints = smoothstep(0.8, 0.97, sparkle) * (0.4 + 0.6 * swell);
        float3 horizonTint = c0 * level;
        float3 auroraRefl = mix(auroraA.rgb, auroraB.rgb, 0.45) * uAurora * 0.10 * midBand * (0.55 + 0.45 * swell);
        col = float3(0.002, 0.004, 0.015)
            + horizonTint * (0.008 + 0.1 * horizonBand * (0.65 + 0.35 * swell) + 0.05 * midBand * glints)
            + auroraRefl;
    }
    // stars: soft round points at a jittered spot in each cell, warm or cool
    float3 g = d * 260.0;
    float3 cell = floor(g);
    float3 off = fract(g) - 0.5 - (float3(finaleSkyHash(cell + 7.0), finaleSkyHash(cell + 13.0), finaleSkyHash(cell + 21.0)) - 0.5) * 0.6;
    float star = step(0.9965, finaleSkyHash(cell)) * (1.0 - smoothstep(0.04, 0.3, length(off))) * (uSpace > 0.5 ? 1.0 : finaleSm((h - 0.02) / 0.18));
    float skyClock = uRm > 0.5 ? 4.0 : uT;
    float tw = 0.6 + 0.4 * sin(skyClock * 2.0 + finaleSkyHash(cell + 3.0) * 40.0);
    float3 tint = mix(float3(1.0, 0.86, 0.7), float3(0.75, 0.85, 1.0), finaleSkyHash(cell + 5.0));
    col += tint * star * tw * 1.3;
    if (uAurora > 0.001 && d.y > 0.12 && d.y < 0.65) {
        float az = atan2(d.x, -d.z);
        float warp = finaleSkyFbm(float2(az * 3.0 + skyClock * 0.04, d.y * 2.0));
        float fold = abs(sin(az * 6.0 + warp * 5.0 + skyClock * 0.15));
        float ribbon = pow(1.0 - fold, 5.0);
        float rays = 0.55 + 0.45 * finaleSkyNoise(float2(az * 140.0, skyClock * 0.6));
        float base = 0.28 + 0.06 * sin(az * 3.0 + warp * 2.0);
        float band = smoothstep(base - 0.04, base + 0.02, d.y) * (1.0 - smoothstep(base + 0.04, base + 0.26, d.y));
        float3 ac = mix(auroraA.rgb, auroraB.rgb, smoothstep(base, base + 0.22, d.y));
        col += ac * ribbon * rays * band * uAurora * 0.55;
    }
    _output.color = float4(col, 1.0);
    """

    /// The golden fractal: a Mandelbulb marched inside a sphere, on a plane that faces the camera.
    static let bulb = """
    #pragma transparent
    #pragma arguments
    float4 bulbCenter;
    float4 bulbLook;

    #pragma declaration
    float finaleBulbDE(float3 p, float power, thread float &trap) {
        float3 z = p;
        float dr = 1.0;
        float r = 0.0;
        trap = 10.0;
        for (int i = 0; i < 5; i++) {
            r = length(z);
            if (r > 2.0) { break; }
            float th = acos(clamp(z.y / max(r, 1e-6), -1.0, 1.0)) * power;
            float ph = atan2(z.z, z.x) * power;
            float rp = pow(r, power - 1.0);
            dr = rp * power * dr + 1.0;
            float zr = rp * r;
            z = zr * float3(sin(th) * cos(ph), cos(th), sin(th) * sin(ph)) + p;
            trap = min(trap, dot(z, z));
        }
        return 0.5 * log(max(r, 1e-6)) * r / dr;
    }

    #pragma body
    float3 center = bulbCenter.xyz;
    float radius = bulbCenter.w;
    float spinT = bulbLook.x;
    float alpha = bulbLook.y;
    float power = bulbLook.z;
    if (alpha < 0.003) { discard_fragment(); }
    float3 worldPos = (scn_frame.inverseViewTransform * float4(_surface.position, 1.0)).xyz;
    float3 camPos = scn_frame.inverseViewTransform[3].xyz;
    float3 rd = normalize(worldPos - camPos);
    float3 ro = camPos - center;
    // tangent-plane coordinates round the fractal sun, for soft golden light rays behind the tooth
    float3 toCenter = -ro;
    float centerDist = length(toCenter);
    float3 centerDir = toCenter / max(centerDist, 0.001);
    float fwdDot = dot(rd, centerDir);
    if (fwdDot <= 0.05) { discard_fragment(); }
    float3 rayRight = normalize(cross(centerDir, float3(0.0, 1.0, 0.0)));
    float3 rayUp = cross(rayRight, centerDir);
    float3 onPlane = rd / fwdDot - centerDir;
    float rx = dot(onPlane, rayRight) * centerDist / max(radius, 0.001);
    float ry = dot(onPlane, rayUp) * centerDist / max(radius, 0.001);
    float rad = length(float2(rx, ry));
    if (rad > 2.35) { discard_fragment(); }
    float ang = atan2(ry, rx);
    // slow colour breathing across copper-amber, 24k gold and warm champagne light
    float breath = 0.5 + 0.5 * sin(spinT * 0.65);
    float breath2 = 0.5 + 0.5 * cos(spinT * 0.42 + 1.1);
    float raysA = pow(max(0.5 + 0.5 * sin(ang * 10.0 + spinT * 0.22), 0.0), 3.0);
    float raysB = pow(max(0.5 + 0.5 * sin(ang * 16.0 - spinT * 0.14 + 1.3), 0.0), 4.0);
    float raysC = 0.5 + 0.5 * sin(ang * 6.0 + spinT * 0.09);
    float beams = (0.55 * raysA + 0.45 * raysB) * (0.65 + 0.35 * raysC);
    float rayReach = smoothstep(0.32, 0.85, rad) * (1.0 - smoothstep(0.95, 2.25, rad));
    float halo = exp(-rad * rad * 1.55) * (1.0 - smoothstep(1.5, 2.25, rad));
    float3 rayTint = mix(float3(1.0, 0.70, 0.24), float3(1.0, 0.86, 0.48), breath);
    float3 rayCol = rayTint * (halo * 0.30 + beams * rayReach * 0.52);
    float rayAlpha = clamp(halo * 0.34 + beams * rayReach * 0.42, 0.0, 0.75);
    float b = dot(ro, rd);
    float c = dot(ro, ro) - radius * radius;
    float disc = b * b - c;
    float3 col = float3(0.0);
    float a = 0.0;
    bool hit = false;
    if (disc >= 0.0) {
        float tNear = max(0.0, -b - sqrt(disc));
        float tFar = -b + sqrt(disc);
        float ca = cos(spinT * 0.35), sa = sin(spinT * 0.35);
        float tilt = 0.4 + sin(spinT * 0.2) * 0.2;
        float cb = cos(tilt), sb = sin(tilt);
        float3x3 spinY = float3x3(float3(ca, 0.0, -sa), float3(0.0, 1.0, 0.0), float3(sa, 0.0, ca));
        float3x3 spinX = float3x3(float3(1.0, 0.0, 0.0), float3(0.0, cb, sb), float3(0.0, -sb, cb));
        float3x3 spin = spinY * spinX;
        float t = tNear;
        float trap = 0.0;
        float steps = 0.0;
        for (int i = 0; i < 44; i++) {
            float3 p = spin * ((ro + rd * t) / radius * 1.2);
            float dist = finaleBulbDE(p, power, trap) * radius / 1.2;
            if (dist < 0.003 * t) { hit = true; break; }
            t += dist * 0.9;
            steps += 1.0;
            if (t > tFar) { break; }
        }
        float glow = steps / 44.0;
        if (hit) {
            float3 p = spin * ((ro + rd * t) / radius * 1.2);
            float e = 0.0015 * t / radius;
            float tr;
            float3 n = normalize(float3(
                finaleBulbDE(p + float3(e, 0.0, 0.0), power, tr) - finaleBulbDE(p - float3(e, 0.0, 0.0), power, tr),
                finaleBulbDE(p + float3(0.0, e, 0.0), power, tr) - finaleBulbDE(p - float3(0.0, e, 0.0), power, tr),
                finaleBulbDE(p + float3(0.0, 0.0, e), power, tr) - finaleBulbDE(p - float3(0.0, 0.0, e), power, tr)));
            float3 v = -normalize(spin * rd);
            float3 l = normalize(spin * float3(0.45, 0.8, 0.4));
            float diff = max(dot(n, l), 0.0);
            float rim = pow(max(1.0 - max(dot(n, v), 0.0), 0.0), 3.0);
            float spec = pow(max(dot(reflect(-l, n), v), 0.0), 24.0);
            float ao = 1.0 - glow;
            float3 deepTone = mix(float3(0.56, 0.30, 0.06), float3(0.76, 0.34, 0.14), breath);
            float3 brightTone = mix(float3(1.0, 0.74, 0.24), float3(1.0, 0.84, 0.42), breath);
            float3 base = mix(deepTone, brightTone, clamp(trap * 0.85, 0.0, 1.0));
            float3 rimTint = mix(float3(1.0, 0.86, 0.50), float3(0.92, 0.96, 1.0), breath2 * 0.24);
            float3 innerWarmth = float3(0.95, 0.56, 0.14) * glow * (0.14 + 0.16 * breath);
            col = base * (0.32 + 0.68 * diff) * (0.45 + 0.55 * ao) + rimTint * (0.34 * rim + 0.48 * spec) + innerWarmth;
            a = 1.0;
        } else {
            float3 coronaTint = mix(float3(1.0, 0.64, 0.20), float3(1.0, 0.82, 0.38), breath);
            col = coronaTint * glow * glow * 0.48;
            a = glow;
        }
    }
    // premultiplied, over the sky: solid where it hits, soft breathing corona and sunbeams around it
    float3 outRgb = hit ? col : (col * a + rayCol);
    float outA = hit ? 1.0 : clamp(a + rayAlpha * 0.35, 0.0, 1.0);
    _output.color = float4(outRgb * alpha, outA * alpha);
    """

    /// The city's reflection in the water: gentle horizontal ripples, crest glints, fading into deep water.
    static let mirror = """
    #pragma body
    float3 wp = (scn_frame.inverseViewTransform * float4(_surface.position, 1.0)).xyz;
    if (wp.y > 0.0) { discard_fragment(); }
    float depth = -wp.y;
    float uT = in.reliefInfo.x;
    float uRm = in.reliefInfo.y;
    float isLight = in.reliefInfo.z;
    float rt = uRm > 0.5 ? 0.0 : uT;
    float w1 = sin(depth * 8.5 + wp.x * 0.45 - rt * 2.1);
    float w2 = sin(depth * 14.5 - wp.x * 0.78 + rt * 1.55);
    float wave = 0.55 * w1 + 0.45 * w2;
    float ripple = 0.72 + 0.28 * wave;
    float depthFade = 1.0 - smoothstep(0.0, 6.2, depth);
    float crest = smoothstep(0.54, 0.96, wave) * depthFade;
    float fade = 0.25 * depthFade * (0.82 + 0.18 * wave);
    float3 refl = _output.color.rgb * ripple + _output.color.rgb * crest * (isLight > 0.5 ? 0.85 : 0.35);
    _output.color = float4(refl * fade + float3(0.003, 0.006, 0.02) * (1.0 - fade), 1.0);
    """

    /// Bright enough to bloom: fractal signs grow warmer/brighter with depth and glint as they appear.
    static let neon = """
    #pragma arguments
    float4 emblemFx;

    #pragma body
    float depth = emblemFx.x;
    float glint = emblemFx.y;
    float3 base = _output.color.rgb;
    float3 warm = float3(1.0, 0.72, 0.24);
    float lum = dot(base, float3(0.2126, 0.7152, 0.0722));
    float3 tinted = mix(base, max(base, float3(0.18, 0.14, 0.06)) * warm * 1.45 + warm * (0.18 + 0.25 * lum), depth * 0.58);
    float boost = mix(1.42, 2.05, depth);
    _output.color.rgb = tinted * boost + float3(1.0, 0.94, 0.76) * glint * 1.35;
    """

    /// Passes local vertex position to surface modifiers (avoids inverseModelTransform per fragment).
    static let localPositionGeometry = """
    #pragma varyings
    float3 localPos;

    #pragma body
    out.localPos = _geometry.position.xyz;
    """

    /// Warm inner subsurface glow inside the porcelain molar, pulsing gently when a cusp piece clicks in.
    static let porcelainWarmth = """
    #pragma arguments
    float4 molarFx;

    #pragma body
    float3 wp = (scn_frame.inverseViewTransform * float4(_surface.position, 1.0)).xyz;
    float3 lp = in.localPos;
    float3 wn = normalize((scn_frame.inverseViewTransform * float4(_surface.normal, 0.0)).xyz);
    float3 camPos = scn_frame.inverseViewTransform[3].xyz;
    float3 V = normalize(camPos - wp);
    float3 keyDir = normalize(float3(-8.0, 20.0, 30.0));
    float NdotV = clamp(dot(wn, V), 0.0, 1.0);
    float rim = pow(max(1.0 - NdotV, 0.0), 2.2);
    float wrap = clamp((dot(wn, keyDir) + 0.55) / 1.55, 0.0, 1.0);
    float backWarm = pow(clamp(1.0 - max(dot(wn, keyDir), 0.0), 0.0, 1.0), 1.6) * (0.35 + 0.65 * rim);
    float bodyDepth = 1.0 - smoothstep(0.0, 1.4, max(0.0, -lp.z - 0.25));
    float3 honey = float3(0.55, 0.28, 0.09);
    float3 cream = float3(0.75, 0.50, 0.24);
    // a hint of warmth inside, kept low so the porcelain keeps its shading
    float3 innerGlow = (honey * (0.14 + 0.22 * backWarm) + cream * (0.08 * wrap + 0.16 * rim)) * (0.45 + 0.55 * bodyDepth) * 0.4;
    innerGlow += float3(0.85, 0.62, 0.22) * molarFx.x * (0.18 + 0.35 * rim);
    float sweepCoord = lp.x * 0.78 + lp.y * 0.52 + lp.z * 0.25;
    float sd = sweepCoord - molarFx.y;
    float sweepBand = exp(-sd * sd * 14.0) * molarFx.z;
    innerGlow += float3(1.0, 0.92, 0.68) * sweepBand * 0.75;
    _surface.emission.rgb += innerGlow;
    """

    /// Warm gold rim sheen and diagonal light sweep across the Golden Molar when it snaps together.
    static let goldSweep = """
    #pragma arguments
    float4 molarFx;

    #pragma body
    float3 wp = (scn_frame.inverseViewTransform * float4(_surface.position, 1.0)).xyz;
    float3 lp = in.localPos;
    float3 wn = normalize((scn_frame.inverseViewTransform * float4(_surface.normal, 0.0)).xyz);
    float3 camPos = scn_frame.inverseViewTransform[3].xyz;
    float3 V = normalize(camPos - wp);
    float NdotV = clamp(dot(wn, V), 0.0, 1.0);
    float rim = pow(max(1.0 - NdotV, 0.0), 2.6);
    float sweepCoord = lp.x * 0.78 + lp.y * 0.52 + lp.z * 0.25;
    float sd = sweepCoord - molarFx.y;
    float sharp = exp(-sd * sd * 24.0);
    float broad = exp(-sd * sd * 4.5);
    float3 sweepCol = (float3(1.0, 0.94, 0.68) * sharp * 1.45 + float3(0.95, 0.68, 0.16) * broad * 0.55) * molarFx.z;
    float3 warmRim = float3(0.92, 0.64, 0.18) * rim * (0.22 + 0.15 * molarFx.x);
    _surface.emission.rgb += sweepCol + warmRim;
    """

    /// Translucent turquoise-to-gold inner glow in the crystal mountain columns + probe facet catch.
    static let crystalMountain = """
    #pragma arguments
    float4 mountainFx;
    float4 probeLocal;

    #pragma body
    float3 wp = (scn_frame.inverseViewTransform * float4(_surface.position, 1.0)).xyz;
    float3 lp = in.localPos;
    float3 wn = normalize((scn_frame.inverseViewTransform * float4(_surface.normal, 0.0)).xyz);
    float3 camPos = scn_frame.inverseViewTransform[3].xyz;
    float3 V = normalize(camPos - wp);
    float hFrac = clamp((lp.y + 1.1) / 1.6, 0.0, 1.0);
    float NdotV = clamp(abs(dot(wn, V)), 0.0, 1.0);
    float fresnel = pow(max(1.0 - NdotV, 0.0), 2.2);
    float topFace = smoothstep(0.65, 0.95, wn.y);
    float breathe = mountainFx.y > 0.5 ? 0.5 : 0.5 + 0.5 * sin(mountainFx.x * 1.6 - lp.y * 5.0 + lp.x * 2.5);
    float3 deepGlow = float3(0.05, 0.36, 0.52);
    float3 midGlow = float3(0.14, 0.62, 0.72);
    float3 topGlow = float3(0.95, 0.78, 0.38);
    float3 cCol = hFrac < 0.55
        ? mix(deepGlow, midGlow, hFrac / 0.55)
        : mix(midGlow, topGlow, smoothstep(0.55, 0.95, hFrac));
    float3 inner = cCol * (0.11 + 0.28 * fresnel + 0.09 * breathe) * (1.0 - 0.35 * topFace);
    inner += cCol * topFace * (0.07 + 0.14 * hFrac);
    float3 dp = lp - float3(0.0, 0.5, 0.0);
    float peakGlow = exp(-dot(dp, dp) * 3.8);
    inner += float3(1.0, 0.80, 0.32) * peakGlow * (0.24 + 0.45 * mountainFx.z);
    float3 pp = lp - probeLocal.xyz;
    float probeCatch = exp(-dot(pp, pp) * 14.0) * probeLocal.w;
    inner += float3(0.25, 0.92, 0.82) * probeCatch * 0.42;
    _surface.emission.rgb += inner;
    """

    /// Path segment coordinates (0 at lower ledge -> 1 at upper ledge) for the climbing golden shimmer.
    static let pathGeometry = """
    #pragma varyings
    float pathU;
    float pathRim;

    #pragma body
    out.pathU = clamp(_geometry.position.y + 0.5, 0.0, 1.0);
    float3 vp = (scn_node.modelViewTransform * float4(_geometry.position.xyz, 1.0)).xyz;
    float3 vn = normalize((scn_node.modelViewTransform * float4(_geometry.normal.xyz, 0.0)).xyz);
    out.pathRim = clamp(abs(dot(vn, normalize(-vp))), 0.0, 1.0);
    """

    /// Path segment fragment: turns glass to luminous gold with a bright shimmer riding up beside the probe.
    static let pathFragment = """
    #pragma transparent
    #pragma arguments
    float4 pathFx;

    #pragma body
    float vU = in.pathU;
    float vRim = in.pathRim;
    float fill = pathFx.x;
    float shimmer = pathFx.y;
    float headGlow = pathFx.z;
    float alpha = pathFx.w;
    float lit = fill <= 0.001 ? 0.0 : (fill >= 0.999 ? 1.0 : 1.0 - smoothstep(fill - 0.08, fill + 0.02, vU));
    float3 glass = float3(0.75, 0.91, 1.0);
    float3 gold = float3(0.98, 0.76, 0.24) * (0.7 + 0.45 * vRim);
    float d = (vU - shimmer) * 6.5;
    float crest = exp(-d * d) * headGlow * (lit > 0.02 || abs(vU - fill) < 0.18 ? 1.0 : 0.0);
    float3 col = mix(glass, gold, lit) + float3(1.0, 0.95, 0.74) * crest * 1.45;
    float a = mix(0.30, 1.0, clamp(lit + crest * 0.85, 0.0, 1.0)) * alpha;
    if (a < 0.004) { discard_fragment(); }
    _output.color = float4(col * a, a);
    """
}

// MARK: - The scene

/// Builds and runs the 3D finale. Its frame update runs on SceneKit's render thread, reading the
/// time from FinaleSceneClock; everything it shows is a pure function of that time.
final class FinaleScene3D: NSObject, SCNSceneRendererDelegate, @unchecked Sendable {
    typealias Vec3 = SIMD3<Double>

    let scene = SCNScene()
    let cameraNode = SCNNode()
    private let camera = SCNCamera()
    private let clock: FinaleSceneClock
    private let request: CityFinaleRequest
    private let cityLength: Double
    private let reducedMotion: Bool
    private let allGold: Bool
    private let atTop: Bool
    private let worldIndex: Int
    private let arts: [CityArt?]

    private let skyMaterial = SCNMaterial()
    private var skyFor = -2
    private var reliefs: [Int: Relief] = [:]
    private let reliefRoot = SCNNode()

    private var fractalNodes: [SCNNode] = []
    private var fractalMaterials: [SCNMaterial] = []
    private var fractalLastFx: [SIMD2<Float>] = []
    private var fractalFor = -1
    /// The wormhole to the next city: one node per tooth, one porcelain tint per ring, and gold.
    private var wormholeNodes: [SCNNode] = []
    private var wormholeRingGeos: [SCNGeometry] = []
    private var wormholeGoldGeo: SCNGeometry?
    /// Each city's colour down the wormhole that leads to it (gold for the way to the Golden Molar),
    /// as on the web.
    private static let wormholeTints: [UInt32] = [0xF87171, 0xC084FC, 0xF472B6, 0xFBBF24, 0x67E8F9]
    private var emblemGeometries: [Int: SCNGeometry] = [:]
    private var orbitNodes: [SCNNode] = []

    private let probe = SCNNode()
    private var probeRig: HydraProbeRig?
    private let coinRoot = SCNNode()
    private var coinBuilt = false
    private let coinGlow: SCNNode
    private let rays: SCNNode
    private var flyingCoins: [SCNNode?] = Array(repeating: nil, count: CityFinale.campaignPieces)
    private let flyingRoot = SCNNode()

    private let molar = SCNNode()
    private let molarBody: SCNNode
    private var rootNodes: [SCNNode] = []
    private let porcelain = SCNMaterial()
    private let goldBody = SCNMaterial()
    private var cuspCoins: [SCNNode?] = Array(repeating: nil, count: CityFinale.campaignPieces)
    private var cuspFinish: [MolarFinish] = Array(repeating: .empty, count: CityFinale.campaignPieces)

    private let mountain = SCNNode()
    private let mountainMaterial = SCNMaterial()
    private var ledgeNodes: [SCNNode] = []
    private var ledgeCoins: [SCNNode?] = Array(repeating: nil, count: CityFinale.campaignPieces)
    private var pathMaterials: [SCNMaterial] = []
    private let ledgeGold = SCNMaterial()
    private let ledgeDim = SCNMaterial()
    private let summitGlow: SCNNode

    private let bulb: SCNNode
    private let bulbMaterial = SCNMaterial()
    private var beadNodes: [SCNNode] = []
    private var balloonNodes: [SCNNode] = []
    private let glowContents: CGImage?

    struct Relief {
        let root: SCNNode
        let material: SCNMaterial
        let neon: Float
        let movers: [(motion: SkylineMotion, node: SCNNode, mirror: SCNNode, rest: SIMD3<Float>, normal: SIMD3<Float>, tangent: SIMD3<Float>, material: SCNMaterial, cx: Double)]
        let mirrors: [(SCNMaterial, SCNMaterial)]
    }

    init(request: CityFinaleRequest, clock: FinaleSceneClock) {
        self.request = request
        self.clock = clock
        cityLength = request.kind == .ending ? 0 : CityFinale.end
        reducedMotion = request.reducedMotion
        allGold = request.finishes.count == CityFinale.campaignPieces && request.finishes.allSatisfy { $0 == .gold }
        atTop = CityFinale.climbStatus(request.finishes).left == 0
        worldIndex = max(0, min(CityFinale.campaignPieces - 1, request.worldIndex))
        arts = CityFinale.hostIds.map { CitySkyline.art(forHost: $0) }
        glowContents = glowImage()
        coinGlow = SCNNode()
        rays = SCNNode()
        molarBody = SCNNode()
        summitGlow = SCNNode()
        bulb = SCNNode()
        super.init()
        build()
    }

    private func finish(_ i: Int) -> MolarFinish {
        i >= 0 && i < request.finishes.count ? request.finishes[i] : .empty
    }

    // MARK: Building

    private func build() {
        scene.background.contents = PlatformColor.black
        // a soft studio for the metals to reflect: warm softboxes over a dark floor (as the web's
        // RoomEnvironment), so gold reads as gold
        scene.lightingEnvironment.contents = studioImage()
        scene.lightingEnvironment.intensity = 1.1

        camera.zNear = 0.1
        camera.zFar = 900
        camera.projectionDirection = .vertical
        camera.wantsHDR = true
        camera.wantsExposureAdaptation = false
        camera.bloomIntensity = 0.9
        camera.bloomThreshold = 1.0
        camera.bloomBlurRadius = 10
        cameraNode.camera = camera
        scene.rootNode.addChildNode(cameraNode)

        // lights for the solid things on the stage
        let ambient = SCNLight()
        ambient.type = .ambient
        ambient.color = RenderBridge.color(hex: 0x8090B0)
        ambient.intensity = 320
        let ambientNode = SCNNode()
        ambientNode.light = ambient
        scene.rootNode.addChildNode(ambientNode)
        for (hex, intensity, pos) in [(UInt32(0xFFF2D6), CGFloat(1900), SIMD3<Float>(-8, 20, 30)), (0x67E8F9, 900, SIMD3<Float>(14, 6, -10))] {
            let light = SCNLight()
            light.type = .directional
            light.color = RenderBridge.color(hex: hex)
            light.intensity = intensity
            let node = SCNNode()
            node.light = light
            node.simdPosition = pos
            node.simdLook(at: SIMD3<Float>(0, 0, 0))
            scene.rootNode.addChildNode(node)
        }

        // far: the sky dome
        let dome = SCNSphere(radius: 400)
        dome.segmentCount = 96
        skyMaterial.lightingModel = .constant
        skyMaterial.cullMode = .front
        skyMaterial.writesToDepthBuffer = false
        skyMaterial.readsFromDepthBuffer = false
        skyMaterial.shaderModifiers = [.geometry: FinaleShaders.skyGeometry, .fragment: FinaleShaders.sky]
        dome.materials = [skyMaterial]
        let domeNode = SCNNode(geometry: dome)
        domeNode.simdPosition = SIMD3<Float>(0, 0, 60)
        domeNode.renderingOrder = -10
        domeNode.categoryBitMask = 2
        scene.rootNode.addChildNode(domeNode)
        setSky(-1, aurora: 0, t: 0, override: 1)

        // The water is the dome below the horizon; only the city is mirrored in it (each relief has
        // an upside-down copy, as on the web), so the molar and the mountain stand above it.

        scene.rootNode.addChildNode(reliefRoot)
        buildProbe()
        buildCoinAndRays()
        buildMolar()
        buildWormhole()
        buildMountain()
        buildBulb()
        buildShowProps()
        for i in 0..<CityFinale.campaignPieces {
            let node = SCNNode()
            node.geometry = emblemGeometry(i)
            node.isHidden = true
            orbitNodes.append(node)
            scene.rootNode.addChildNode(node)
        }
        _ = relief(worldIndex)
        prebuild()
    }

    private func appendFractalNode(index: Int) {
        let mat = SCNMaterial()
        mat.lightingModel = .constant
        mat.isDoubleSided = true
        mat.shaderModifiers = [.fragment: FinaleShaders.neon]
        mat.setValue(NSValue(scnVector4: SCNVector4(0, 0, 0, 0)), forKey: "emblemFx")
        let copy = emblemGeometry(index)?.copy() as? SCNGeometry
        copy?.materials = [mat]
        let n = SCNNode(geometry: copy)
        n.renderingOrder = 7
        n.isHidden = true
        fractalNodes.append(n)
        fractalMaterials.append(mat)
        fractalLastFx.append(SIMD2<Float>(-1, -1))
        scene.rootNode.addChildNode(n)
    }

    /// Everything the show would otherwise create on a beat (the coins, the fractal's copies).
    private func prebuild() {
        if request.kind != .ending {
            coinRoot.addChildNode(coinNode(worldIndex, finish: finish(worldIndex) == .empty ? .pearl : finish(worldIndex)))
            coinBuilt = true
            let count = Finale3D.emblemFractalNodes(worldIndex).count
            fractalFor = worldIndex
            for _ in 0..<count {
                appendFractalNode(index: worldIndex)
            }
        }
        for i in 0..<CityFinale.campaignPieces where finish(i) != .empty {
            let c = coinNode(i, finish: finish(i))
            c.isHidden = true
            cuspCoins[i] = c
            cuspFinish[i] = finish(i)
            molar.addChildNode(c)
        }
    }

    private func glowNode(_ hex: UInt32, size: CGFloat) -> SCNNode {
        let plane = SCNPlane(width: size, height: size)
        let m = SCNMaterial()
        m.lightingModel = .constant
        m.diffuse.contents = glowContents
        m.multiply.contents = RenderBridge.color(hex: hex)
        m.blendMode = .add
        m.writesToDepthBuffer = false
        m.isDoubleSided = true
        plane.materials = [m]
        let node = SCNNode(geometry: plane)
        node.constraints = [SCNBillboardConstraint()]
        node.categoryBitMask = 2
        node.renderingOrder = 9
        return node
    }

    private func buildProbe() {
        let rig = ProceduralMeshBuilder.buildHydraProbe()
        probeRig = rig
        let craft = rig.rootNode
        craft.name = "craft"
        probe.addChildNode(craft)
        let halo = glowNode(0x5EEAD4, size: 3.4)
        halo.opacity = 0.45
        probe.addChildNode(halo)
        probe.isHidden = true
        scene.rootNode.addChildNode(probe)
    }

    private func pbr(_ m: SCNMaterial, hex: UInt32, metal: CGFloat, rough: CGFloat) {
        m.lightingModel = .physicallyBased
        m.diffuse.contents = RenderBridge.color(hex: hex)
        m.metalness.contents = metal
        m.roughness.contents = rough
    }

    /// A city's sign as a thin solid with its own colours, round 0,0, about one unit each way.
    private func emblemGeometry(_ index: Int) -> SCNGeometry? {
        if let g = emblemGeometries[index] { return g }
        guard index >= 0, index < arts.count, let art = arts[index] else { return nil }
        var pos: [Float] = []
        var nor: [Float] = []
        var col: [Float] = []
        let depth = 0.14
        for (k, piece) in art.emblem.enumerated() {
            let c = FinaleLook.linear(piece.colorHex)
            let z = Float(depth / 2 + Double(k) * 0.004)
            let t = piece.triangles
            var i = 0
            while i + 5 < t.count {
                for v in 0..<3 {
                    pos += [Float(t[i + v * 2]), Float(t[i + v * 2 + 1]), z]
                    nor += [0, 0, 1]
                    col += [c.x, c.y, c.z, 1]
                }
                i += 6
            }
            for (x1, y1, x2, y2) in boundaryEdges(t) {
                let len = max(1e-9, hypot(x2 - x1, y2 - y1))
                let nx = Float((y2 - y1) / len)
                let ny = Float(-(x2 - x1) / len)
                let back = Float(-depth / 2)
                for (x, y, zz) in [(x1, y1, z), (x2, y2, z), (x2, y2, back), (x1, y1, z), (x2, y2, back), (x1, y1, back)] {
                    pos += [Float(x), Float(y), zz]
                    nor += [nx, ny, 0]
                    col += [c.x * 0.6, c.y * 0.6, c.z * 0.6, 1]
                }
            }
        }
        guard let g = makeGeometry(positions: pos, normals: nor, colors: col) else { return nil }
        let m = SCNMaterial()
        m.lightingModel = .constant
        m.isDoubleSided = true
        m.shaderModifiers = [.fragment: FinaleShaders.neon]
        m.setValue(NSValue(scnVector4: SCNVector4(0, 0, 0, 0)), forKey: "emblemFx")
        g.materials = [m]
        emblemGeometries[index] = g
        return g
    }

    /// A coin: a short metal cylinder in its finish with the city's sign raised on both faces.
    private func coinNode(_ index: Int, finish: MolarFinish) -> SCNNode {
        let node = SCNNode()
        let body = SCNCylinder(radius: 1, height: 0.16)
        body.radialSegmentCount = 48
        let m = SCNMaterial()
        let look: (hex: UInt32, rough: CGFloat) = switch finish {
        case .gold: (0xF3C04F, 0.2)
        case .silver: (0xD9DEE6, 0.2)
        default: (0xF5EFE6, 0.28)
        }
        pbr(m, hex: look.hex, metal: 1, rough: look.rough)
        body.materials = [m]
        let bodyNode = SCNNode(geometry: body)
        bodyNode.simdEulerAngles = SIMD3<Float>(Float.pi / 2, 0, 0)
        node.addChildNode(bodyNode)
        if let emblem = emblemGeometry(index)?.copy() as? SCNGeometry {
            let plain = SCNMaterial()
            plain.lightingModel = .constant
            plain.isDoubleSided = true
            emblem.materials = [plain]
            for side: Float in [1, -1] {
                let face = SCNNode(geometry: emblem)
                face.simdScale = SIMD3<Float>(repeating: 0.62)
                face.simdPosition = SIMD3<Float>(0, 0, 0.1 * side)
                if side < 0 { face.simdEulerAngles = SIMD3<Float>(0, Float.pi, 0) }
                node.addChildNode(face)
            }
        }
        return node
    }

    private func buildCoinAndRays() {
        scene.rootNode.addChildNode(coinRoot)
        scene.rootNode.addChildNode(flyingRoot)
        let glow = glowNode(0xFDE68A, size: 1)
        coinGlow.addChildNode(glow)
        coinGlow.isHidden = true
        scene.rootNode.addChildNode(coinGlow)
        // rays that fade out along their length
        var pos: [Float] = []
        var col: [Float] = []
        for k in 0..<12 {
            let a = Float.pi * 2 * Float(k) / 12
            let w: Float = 0.07
            pos += [0, 0, 0, cos(a - w), sin(a - w), 0, cos(a + w), sin(a + w), 0]
            col += [1, 0.9, 0.55, 1, 0, 0, 0, 0, 0, 0, 0, 0]
        }
        let nor = [Float](repeating: 0, count: pos.count)
        if let g = makeGeometry(positions: pos, normals: nor, colors: col) {
            let m = SCNMaterial()
            m.lightingModel = .constant
            m.blendMode = .add
            m.transparency = 0.4
            m.writesToDepthBuffer = false
            m.isDoubleSided = true
            g.materials = [m]
            rays.geometry = g
        }
        rays.isHidden = true
        rays.renderingOrder = 8
        scene.rootNode.addChildNode(rays)
    }

    private func buildMolar() {
        pbr(porcelain, hex: 0xC9C0B0, metal: 0, rough: 0.42)
        porcelain.clearCoat.contents = 0.7
        porcelain.clearCoatRoughness.contents = 0.2
        porcelain.emission.contents = PlatformColor.black
        porcelain.shaderModifiers = [.geometry: FinaleShaders.localPositionGeometry, .surface: FinaleShaders.porcelainWarmth]
        porcelain.setValue(NSValue(scnVector4: SCNVector4(0, -3, 0, 0)), forKey: "molarFx")
        pbr(goldBody, hex: 0xE8B23E, metal: 1, rough: 0.26)
        goldBody.clearCoat.contents = 0.5
        goldBody.emission.contents = PlatformColor.black
        goldBody.shaderModifiers = [.geometry: FinaleShaders.localPositionGeometry, .surface: FinaleShaders.goldSweep]
        goldBody.setValue(NSValue(scnVector4: SCNVector4(0, -3, 0, 0)), forKey: "molarFx")
        if let g = meshGeometry(Finale3D.goldenMolarMesh()) {
            g.materials = [porcelain]
            molarBody.geometry = g
        }
        molar.addChildNode(molarBody)
        for side in [-1.0, 1.0] {
            guard let g = meshGeometry(Finale3D.molarRootMesh(side: side)) else { continue }
            g.materials = [porcelain]
            let n = SCNNode(geometry: g)
            rootNodes.append(n)
            molar.addChildNode(n)
        }
        let socketMat = SCNMaterial()
        pbr(socketMat, hex: 0x0B1530, metal: 0, rough: 0.18)
        socketMat.clearCoat.contents = 1.0
        let bezelMat = SCNMaterial()
        pbr(bezelMat, hex: 0xF3C04F, metal: 1, rough: 0.25)
        for i in 0..<CityFinale.campaignPieces {
            let top = Finale3D.molarCuspTop(i)
            let r = CGFloat(CityFinale.Molar.cuspRadius * 0.98)
            let socket = SCNCylinder(radius: r, height: 0.12 * r)
            socket.radialSegmentCount = 40
            socket.materials = [socketMat]
            let sNode = SCNNode(geometry: socket)
            sNode.simdEulerAngles = SIMD3<Float>(Float.pi / 2, 0, 0)
            sNode.simdPosition = SIMD3<Float>(Float(top.x), Float(top.y), Float(top.z - 0.02))
            let bezel = SCNTorus(ringRadius: r * 1.04, pipeRadius: 0.09 * r)
            bezel.materials = [bezelMat]
            let bNode = SCNNode(geometry: bezel)
            bNode.simdEulerAngles = SIMD3<Float>(Float.pi / 2, 0, 0)
            bNode.simdPosition = SIMD3<Float>(Float(top.x), Float(top.y), Float(top.z + 0.012))
            molar.addChildNode(sNode)
            molar.addChildNode(bNode)
        }
        molar.isHidden = true
        scene.rootNode.addChildNode(molar)
    }

    /// The wormhole to the next city: rings of little porcelain and gold teeth, crowns pointing in
    /// (Finale3D places every tooth; the window at the far end is drawn by the 2D layer).
    private func buildWormhole() {
        guard request.kind != .ending, let base = meshGeometry(Finale3D.wormholeToothMesh()) else { return }
        let next = (0..<CityFinale.campaignPieces).first { finish($0) == .empty } ?? -1
        let tint: UInt32 = next >= 0 && next < Self.wormholeTints.count ? Self.wormholeTints[next] : 0xFDE047
        func mix(_ a: UInt32, _ b: UInt32, _ k: Double) -> UInt32 {
            func ch(_ v: UInt32, _ s: UInt32) -> Double { Double((v >> s) & 255) }
            func m(_ s: UInt32) -> UInt32 { UInt32((ch(a, s) + (ch(b, s) - ch(a, s)) * k).rounded()) << s }
            return m(16) | m(8) | m(0)
        }
        let gold = SCNMaterial()
        pbr(gold, hex: 0xE8B23E, metal: 1, rough: 0.22)
        gold.clearCoat.contents = 0.5
        gold.emission.contents = RenderBridge.color(hex: 0x2A1D06)
        if let g = base.copy() as? SCNGeometry {
            g.materials = [gold]
            wormholeGoldGeo = g
        }
        for k in 0...(Finale3D.Wormhole.rings + 1) {
            let depth = min(1, Double(k) / Double(Finale3D.Wormhole.rings))
            let shade = mix(0xF4EEE0, tint, 0.6 * depth)
            let mat = SCNMaterial()
            pbr(mat, hex: shade, metal: 0, rough: 0.32)
            mat.clearCoat.contents = 0.85
            mat.clearCoatRoughness.contents = 0.15
            mat.emission.contents = RenderBridge.color(hex: mix(0x000000, shade, 0.16))
            if let g = base.copy() as? SCNGeometry {
                g.materials = [mat]
                wormholeRingGeos.append(g)
            }
        }
        for _ in 0..<(Finale3D.Wormhole.teeth * (Finale3D.Wormhole.rings + 2)) {
            let n = SCNNode()
            n.isHidden = true
            scene.rootNode.addChildNode(n)
            wormholeNodes.append(n)
        }
    }

    /// The wormhole's teeth, each crown turned toward the tunnel's middle.
    private func placeWormhole(_ t: Double) {
        let teeth = Finale3D.wormholeTeeth(t, reducedMotion: reducedMotion)
        for (i, node) in wormholeNodes.enumerated() {
            guard i < teeth.count, teeth[i].scale > 1e-4, !wormholeRingGeos.isEmpty else {
                node.isHidden = true
                continue
            }
            let w = teeth[i]
            let geo = w.gold ? wormholeGoldGeo : wormholeRingGeos[min(w.ring, wormholeRingGeos.count - 1)]
            if node.geometry !== geo { node.geometry = geo }
            // y = z x x keeps the frame right-handed (crown along z, roots spreading along x)
            let x = SIMD3<Float>(w.tangent) * Float(w.scale)
            let z = SIMD3<Float>(w.inward) * Float(w.scale)
            let y = simd_cross(SIMD3<Float>(w.inward), SIMD3<Float>(w.tangent)) * Float(w.scale)
            node.simdTransform = float4x4(
                SIMD4<Float>(x, 0),
                SIMD4<Float>(y, 0),
                SIMD4<Float>(z, 0),
                SIMD4<Float>(SIMD3<Float>(w.pos), 1)
            )
            node.isHidden = false
        }
    }

    private func buildMountain() {
        // a spire of hexagonal crystal columns, ivory at the peak like enamel, baked into one mesh
        var pos: [Float] = []
        var nor: [Float] = []
        var col: [Float] = []
        let deep = FinaleLook.linear(0x1E1B4B)
        let sea = FinaleLook.linear(0x0E7490)
        let ivory = FinaleLook.linear(0xF5F0E6)
        let bottom = Finale3D.mountainFootY - 0.3
        for (i, c) in Finale3D.mountainColumns().enumerated() {
            let f = Float(c.height)
            var base = f < 0.55 ? deep + (sea - deep) * (f / 0.55) : sea + (ivory - sea) * Float(CityFinale.smooth01(Double(f - 0.55) / 0.35))
            if (UInt64(i) &* 2_654_435_761) % (1 << 32) % 17 == 0 { base *= 1.7 }
            let r = Float(c.radius)
            let x0 = Float(c.x)
            let z0 = Float(c.z)
            let top = Float(c.top)
            let bot = Float(bottom)
            // corners pointing along ±z, as the web's six-sided cylinder
            let corners: [SIMD2<Float>] = (0..<6).map { k in
                let a = Float.pi / 3 * Float(k)
                return SIMD2<Float>(x0 + r * sin(a), z0 + r * cos(a))
            }
            let side = base * 0.6
            for k in 0..<6 {
                let a = corners[k]
                let b = corners[(k + 1) % 6]
                let mid = (a + b) * 0.5 - SIMD2<Float>(x0, z0)
                let n = simd_normalize(mid)
                for (p, y) in [(a, top), (b, bot), (b, top), (a, top), (a, bot), (b, bot)] {
                    pos += [p.x, y, p.y]
                    nor += [n.x, 0, n.y]
                    col += [side.x, side.y, side.z, 1]
                }
            }
            for k in 0..<6 {
                let a = corners[k]
                let b = corners[(k + 1) % 6]
                for p in [SIMD2<Float>(x0, z0), a, b] {
                    pos += [p.x, top, p.y]
                    nor += [0, 1, 0]
                    col += [base.x, base.y, base.z, 1]
                }
            }
        }
        if let g = makeGeometry(positions: pos, normals: nor, colors: col) {
            pbr(mountainMaterial, hex: 0xFFFFFF, metal: 0.1, rough: 0.32)
            mountainMaterial.emission.contents = PlatformColor.black
            mountainMaterial.shaderModifiers = [.geometry: FinaleShaders.localPositionGeometry, .surface: FinaleShaders.crystalMountain]
            mountainMaterial.setValue(NSValue(scnVector4: SCNVector4(0, reducedMotion ? 1 : 0, 0, 0)), forKey: "mountainFx")
            mountainMaterial.setValue(NSValue(scnVector4: SCNVector4(0, 0, 0, 0)), forKey: "probeLocal")
            g.materials = [mountainMaterial]
            mountain.addChildNode(SCNNode(geometry: g))
        }
        pbr(ledgeGold, hex: 0xFDE68A, metal: 0.6, rough: 0.3)
        ledgeGold.emission.contents = RenderBridge.color(hex: 0xB45309)
        ledgeDim.lightingModel = .constant
        ledgeDim.diffuse.contents = RenderBridge.color(hex: 0xE0F2FE)
        ledgeDim.transparency = 0.32
        ledgeDim.writesToDepthBuffer = false
        for i in 0..<CityFinale.campaignPieces {
            let l = Finale3D.ledge(i)
            let cyl = SCNCylinder(radius: 0.13, height: 0.05)
            cyl.radialSegmentCount = 6
            let n = SCNNode(geometry: cyl)
            n.simdPosition = SIMD3<Float>(Float(l.x), Float(l.y - 0.085), Float(l.z))
            ledgeNodes.append(n)
            mountain.addChildNode(n)
        }
        let stops = [Finale3D.ledge(-1)] + (0..<CityFinale.campaignPieces).map { Finale3D.ledge($0) } + [Finale3D.ledge(CityFinale.campaignPieces)]
        for k in 0..<(stops.count - 1) {
            let a = SIMD3<Float>(Float(stops[k].x), Float(stops[k].y), Float(stops[k].z))
            let b = SIMD3<Float>(Float(stops[k + 1].x), Float(stops[k + 1].y), Float(stops[k + 1].z))
            let cyl = SCNCylinder(radius: 0.016, height: 1)
            let pm = SCNMaterial()
            pm.lightingModel = .constant
            pm.blendMode = .alpha
            pm.writesToDepthBuffer = false
            pm.shaderModifiers = [.geometry: FinaleShaders.pathGeometry, .fragment: FinaleShaders.pathFragment]
            pm.setValue(NSValue(scnVector4: SCNVector4(0, 0, 0, 1)), forKey: "pathFx")
            cyl.materials = [pm]
            pathMaterials.append(pm)
            let n = SCNNode(geometry: cyl)
            n.simdPosition = (a + b) * 0.5
            n.simdScale = SIMD3<Float>(1, simd_distance(a, b), 1)
            n.simdOrientation = simd_quatf(from: SIMD3<Float>(0, 1, 0), to: simd_normalize(b - a))
            n.renderingOrder = 6
            mountain.addChildNode(n)
        }
        mountain.isHidden = true
        scene.rootNode.addChildNode(mountain)
        summitGlow.addChildNode(glowNode(0xFDE68A, size: 1))
        summitGlow.isHidden = true
        scene.rootNode.addChildNode(summitGlow)
    }

    private func buildBulb() {
        bulbMaterial.lightingModel = .constant
        bulbMaterial.blendMode = .alpha
        bulbMaterial.writesToDepthBuffer = false
        bulbMaterial.readsFromDepthBuffer = false
        bulbMaterial.isDoubleSided = true
        bulbMaterial.shaderModifiers = [.fragment: FinaleShaders.bulb]
        let plane = SCNPlane(width: 2, height: 2)
        plane.materials = [bulbMaterial]
        bulb.geometry = plane
        bulb.constraints = [SCNBillboardConstraint()]
        bulb.renderingOrder = -5
        bulb.categoryBitMask = 2
        bulb.isHidden = true
        scene.rootNode.addChildNode(bulb)
    }

    private func buildShowProps() {
        for _ in 0..<60 {
            let s = SCNSphere(radius: 0.2)
            s.segmentCount = 12
            let m = SCNMaterial()
            pbr(m, hex: 0xFFFFFF, metal: 0.4, rough: 0.3)
            s.materials = [m]
            let n = SCNNode(geometry: s)
            n.isHidden = true
            beadNodes.append(n)
            scene.rootNode.addChildNode(n)
        }
        for _ in 0..<5 {
            let g = SCNNode()
            let env = SCNSphere(radius: 0.75)
            let em = SCNMaterial()
            pbr(em, hex: 0xFFFFFF, metal: 0, rough: 0.6)
            env.materials = [em]
            let envNode = SCNNode(geometry: env)
            envNode.name = "envelope"
            envNode.simdScale = SIMD3<Float>(1, 1.15, 1)
            let basket = SCNBox(width: 0.45, height: 0.3, length: 0.45, chamferRadius: 0.04)
            let bm = SCNMaterial()
            pbr(bm, hex: 0x8B5E34, metal: 0, rough: 0.9)
            basket.materials = [bm]
            let basketNode = SCNNode(geometry: basket)
            basketNode.simdPosition = SIMD3<Float>(0, -1.2, 0)
            g.addChildNode(envNode)
            g.addChildNode(basketNode)
            g.isHidden = true
            balloonNodes.append(g)
            scene.rootNode.addChildNode(g)
        }
    }

    /// The relief city for campaign index `index`, built the first time it is needed.
    private func relief(_ index: Int) -> Relief? {
        if let r = reliefs[index] { return r }
        guard index >= 0, index < arts.count, let art = arts[index], let plan = art.finale else { return nil }
        var solid = VertexBucket()
        var moving = Array(repeating: VertexBucket(), count: art.motions.count)
        let rests: [(x: Double, y: Double, world: Vec3)] = art.motions.enumerated().map { i, motion in
            let members = art.skyline.filter { $0.group == i + 1 }
            let pivot = CitySkyline.motionPivot(motion)
            let mx = pivot?.x ?? members.reduce(0) { $0 + $1.centerX } / Double(max(1, members.count))
            let my = pivot?.y ?? 0
            let order = members.first?.order ?? 0
            return (mx, my, Finale3D.skylineWorld(mx, my, order))
        }

        func put(_ b: inout VertexBucket, _ p: Vec3, color: SIMD3<Float>, light: Bool, cx: Double, shade: Float) {
            b.positions += [Float(p.x), Float(p.y), Float(p.z)]
            b.colors += [color.x, color.y, color.z, 1]
            b.data += [Float(cx), light ? 1 : 0, shade]
        }

        // group consecutive pieces of one drawing line, so a window grid lights as one
        var run: [SkylinePiece] = []
        func flush() {
            guard let first = run.first else { return }
            defer { run = [] }
            // the drawing's sky panels become the dome's colours, so no flat panel edges show in 3D
            if first.isLight && first.topColorHex != nil { return }
            var lo = Double.infinity
            var hi = -Double.infinity
            for p in run {
                var i = 0
                while i < p.triangles.count {
                    lo = min(lo, p.triangles[i])
                    hi = max(hi, p.triangles[i])
                    i += 2
                }
            }
            let cx = (lo + hi) / 2
            let g = first.group
            let origin: Vec3 = g > 0 && g <= rests.count ? rests[g - 1].world : Vec3(0, 0, 0)
            for piece in run {
                let foot = FinaleLook.linear(piece.colorHex)
                let top = piece.topColorHex.map(FinaleLook.linear)
                let span = CitySkyline.pieceSpanY(piece)
                func colorAt(_ y: Double) -> SIMD3<Float> {
                    guard let top else { return foot }
                    let f = Float((y - span.minY) / max(1e-6, span.maxY - span.minY))
                    return foot + (top - foot) * f
                }
                let t = piece.triangles
                func place(_ x: Double, _ y: Double, _ back: Double) -> Vec3 { Finale3D.skylineWorld(x, y, piece.order, back: back) - origin }
                var i = 0
                while i + 5 < t.count {
                    for v in 0..<3 {
                        let x = t[i + v * 2]
                        let y = t[i + v * 2 + 1]
                        if g > 0 && g <= moving.count {
                            put(&moving[g - 1], place(x, y, 0), color: colorAt(y), light: piece.isLight, cx: cx, shade: 1)
                        } else {
                            put(&solid, place(x, y, 0), color: colorAt(y), light: piece.isLight, cx: cx, shade: 1)
                        }
                    }
                    i += 6
                }
                for (x1, y1, x2, y2) in boundaryEdges(t) {
                    // windows and light stripes are thin; buildings get the full cut-paper depth
                    let d = piece.isLight ? 0.02 : Finale3D.reliefDepth
                    let quad: [(Double, Double, Double, Float)] = [(x1, y1, 0, 0.55), (x2, y2, 0, 0.55), (x2, y2, d, 0.4), (x1, y1, 0, 0.55), (x2, y2, d, 0.4), (x1, y1, d, 0.4)]
                    for (x, y, back, shade) in quad {
                        if g > 0 && g <= moving.count {
                            put(&moving[g - 1], place(x, y, back), color: colorAt(y), light: piece.isLight, cx: cx, shade: shade)
                        } else {
                            put(&solid, place(x, y, back), color: colorAt(y), light: piece.isLight, cx: cx, shade: shade)
                        }
                    }
                }
            }
        }
        for piece in art.skyline {
            if let first = run.first, piece.order != first.order || piece.group != first.group { flush() }
            run.append(piece)
        }
        flush()
        // the near layer: the city's roadside prop along the waterfront, in two staggered rows
        for row in [3.5, 6.5] {
            var x = -36.0
            while x <= 36 {
                let dx = x + (row == 6.5 ? 4 : 0)
                x += 8
                if abs(dx) < 9 { continue }
                let base = Finale3D.skylineWorld(32 + dx, 0, 0)
                let a = Finale3D.skylineAngle(32 + dx)
                let n = Vec3(sin(a), 0, cos(a))
                let tg = Vec3(cos(a), 0, -sin(a))
                let scale = 0.8
                for piece in art.prop {
                    let c = FinaleLook.linear(piece.colorHex)
                    func place(_ px: Double, _ py: Double, _ back: Double) -> Vec3 {
                        let depth = row + Double(piece.order) * 0.01 - back
                        return Vec3(base.x, 0, base.z) + tg * (px * scale) + Vec3(0, py * scale, 0) + n * depth
                    }
                    let t = piece.triangles
                    var i = 0
                    while i + 5 < t.count {
                        for v in 0..<3 { put(&solid, place(t[i + v * 2], t[i + v * 2 + 1], 0), color: c, light: piece.isLight, cx: 32 + dx, shade: 1) }
                        i += 6
                    }
                    for (x1, y1, x2, y2) in boundaryEdges(t) {
                        for (px, py, back, shade) in [(x1, y1, 0.0, Float(0.55)), (x2, y2, 0, 0.55), (x2, y2, 0.12, 0.4), (x1, y1, 0, 0.55), (x2, y2, 0.12, 0.4), (x1, y1, 0.12, 0.4)] {
                            put(&solid, place(px, py, back), color: c, light: piece.isLight, cx: 32 + dx, shade: shade)
                        }
                    }
                }
            }
        }

        let stops = FinaleLook.skyStops(art)
        let midHorizon = FinaleLook.linear(stops.colors[2].0)
        let inSpace = plan.show == .meteors
        var haze = FinaleLook.linear(0x0B1636)
        if !inSpace { haze += midHorizon * 0.045 }
        let hazeW: Float = inSpace ? 0.3 : 1.0
        let hazeVec = NSValue(scnVector4: SCNVector4(haze.x, haze.y, haze.z, hazeW))
        let zeroVec = NSValue(scnVector4: SCNVector4(0, 0, 0, 0))

        func material(glow: Float, mirror: Bool = false) -> SCNMaterial {
            let m = SCNMaterial()
            m.lightingModel = .constant
            m.diffuse.contents = PlatformColor.white
            m.locksAmbientWithDiffuse = false
            m.ambient.contents = PlatformColor.black
            m.isDoubleSided = true
            m.shaderModifiers = mirror
                ? [.geometry: FinaleShaders.relief(mirror: true), .fragment: FinaleShaders.mirror]
                : [.geometry: FinaleShaders.relief(mirror: false)]
            m.setValue(NSValue(scnVector4: SCNVector4(0, reducedMotion ? 1 : 0, -1, 0)), forKey: "showTime")
            m.setValue(NSValue(scnVector4: SCNVector4(plan.show == .neon ? 1 : 0, glow, 0, 0)), forKey: "cityLook")
            m.setValue(hazeVec, forKey: "cityHaze")
            m.setValue(zeroVec, forKey: "burstA")
            m.setValue(zeroVec, forKey: "burstB")
            return m
        }
        // each material's mirror twin shares its show time and burst flashes (set together in updateRelief)
        var mirrors: [(SCNMaterial, SCNMaterial)] = []
        func mirrorOf(_ m: SCNMaterial) -> SCNMaterial {
            let twin = material(glow: 1, mirror: true)
            mirrors.append((m, twin))
            return twin
        }
        let root = SCNNode()
        let mirrorRoot = SCNNode()
        mirrorRoot.simdScale = SIMD3<Float>(1, -1, 1)
        // Station Aurora is in orbit: nothing to reflect it
        mirrorRoot.isHidden = plan.show == .meteors
        root.addChildNode(mirrorRoot)
        let main = material(glow: 1)
        if let g = makeGeometry(positions: solid.positions, normals: solid.data, colors: solid.colors) {
            g.materials = [main]
            root.addChildNode(SCNNode(geometry: g))
            if let flipped = g.copy() as? SCNGeometry {
                flipped.materials = [mirrorOf(main)]
                mirrorRoot.addChildNode(SCNNode(geometry: flipped))
            }
        }
        var movers: [(motion: SkylineMotion, node: SCNNode, mirror: SCNNode, rest: SIMD3<Float>, normal: SIMD3<Float>, tangent: SIMD3<Float>, material: SCNMaterial, cx: Double)] = []
        for (i, motion) in art.motions.enumerated() {
            guard let g = makeGeometry(positions: moving[i].positions, normals: moving[i].data, colors: moving[i].colors) else { continue }
            let m = material(glow: 1)
            g.materials = [m]
            let node = SCNNode(geometry: g)
            root.addChildNode(node)
            let mirrorNode = SCNNode()
            if let flipped = g.copy() as? SCNGeometry {
                flipped.materials = [mirrorOf(m)]
                mirrorNode.geometry = flipped
            }
            mirrorRoot.addChildNode(mirrorNode)
            let rest = rests[i]
            let a = Finale3D.skylineAngle(rest.x)
            movers.append((
                motion, node, mirrorNode,
                SIMD3<Float>(Float(rest.world.x), Float(rest.world.y), Float(rest.world.z)),
                SIMD3<Float>(Float(sin(a)), 0, Float(cos(a))),
                SIMD3<Float>(Float(cos(a)), 0, Float(-sin(a))),
                m, rest.x
            ))
        }
        root.isHidden = true
        reliefRoot.addChildNode(root)
        let r = Relief(root: root, material: main, neon: plan.show == .neon ? 1 : 0, movers: movers, mirrors: mirrors)
        reliefs[index] = r
        return r
    }

    // MARK: Frame update

    func renderer(_ renderer: any SCNSceneRenderer, updateAtTime time: TimeInterval) {
        let now = clock.now()
        let w = Double(max(1, now.size.width))
        let h = Double(max(1, now.size.height))
        if request.kind != .ending && now.t < cityLength {
            renderCity(now.t, w: w, h: h)
        } else {
            renderEnding(now.t - cityLength, w: w, h: h)
        }
    }

    private func setCamera(_ shot: Finale3D.CameraShot, w: Double, h: Double) -> FinaleLens {
        let lens = FinaleLens(shot, width: w, height: h)
        camera.fieldOfView = CGFloat(lens.vFovDegrees)
        cameraNode.simdPosition = SIMD3<Float>(Float(lens.pos.x), Float(lens.pos.y), Float(lens.pos.z))
        cameraNode.simdLook(at: SIMD3<Float>(Float(lens.target.x), Float(lens.target.y), Float(lens.target.z)), up: SIMD3<Float>(0, 1, 0), localFront: SIMD3<Float>(0, 0, -1))
        return lens
    }

    /// The sky over city `index` (-1: plain night), lit as at show time `t` or at `override`.
    private func setSky(_ index: Int, aurora: Double, t: Double, override: Double) {
        skyMaterial.setValue(NSValue(scnVector4: SCNVector4(Float(t), reducedMotion ? 1 : 0, Float(override), Float(aurora))), forKey: "skyTime")
        guard skyFor != index else { return }
        skyFor = index
        let art = index >= 0 && index < arts.count ? arts[index] : nil
        let stops = FinaleLook.skyStops(art)
        for (k, c) in stops.colors.enumerated() {
            for (letter, hex) in zip(["A", "B", "C", "D"], [c.0, c.1, c.2, c.3]) {
                let v = FinaleLook.linear(hex)
                skyMaterial.setValue(NSValue(scnVector4: SCNVector4(v.x, v.y, v.z, 1)), forKey: "sky\(letter)\(k)")
            }
        }
        let hs = stops.heights
        skyMaterial.setValue(NSValue(scnVector4: SCNVector4(Float(hs.0), Float(hs.1), Float(hs.2), Float(hs.3))), forKey: "skyHeights")
        // Station Aurora is in orbit: no water, stars all round (carried in auroraA.w)
        let inSpace: Float = art?.finale?.show == .meteors ? 1 : 0
        let a = FinaleLook.linear(0x2DD4BF)
        let b = FinaleLook.linear(art?.finale?.bursts.first?.colorHex ?? 0xA78BFA)
        skyMaterial.setValue(NSValue(scnVector4: SCNVector4(a.x, a.y, a.z, inSpace)), forKey: "auroraA")
        skyMaterial.setValue(NSValue(scnVector4: SCNVector4(b.x, b.y, b.z, 1)), forKey: "auroraB")
    }

    private func showOnly(_ index: Int) -> Relief? {
        for (i, r) in reliefs { r.root.isHidden = i != index }
        guard index >= 0, let r = relief(index) else { return nil }
        r.root.isHidden = false
        return r
    }

    private func computeBurstFlash(_ plan: CityFinalePlan?, showT: Double, dim: Double) -> (SCNVector4, SCNVector4) {
        let zero = SCNVector4(0, 0, 0, 0)
        guard let plan, !reducedMotion, showT >= 0, dim > 0.004 else { return (zero, zero) }
        let delay = plan.show == .meteors ? 0.0 : 0.9
        var bestA = 0.0
        var bestB = 0.0
        var outA = zero
        var outB = zero
        for burst in plan.bursts {
            let age = showT - burst.t - delay
            if age < 0 || age > 0.72 { continue }
            let str = CityFinale.smooth01(age / 0.04) * exp(-age / 0.24) * 0.55 * dim
            if str <= bestB { continue }
            let c = FinaleLook.linear(burst.colorHex)
            let s = Float(str)
            let v = SCNVector4(c.x * s, c.y * s, c.z * s, Float(burst.x))
            if str > bestA {
                bestB = bestA
                outB = outA
                bestA = str
                outA = v
            } else {
                bestB = str
                outB = v
            }
        }
        return (outA, outB)
    }

    private func updateRelief(_ r: Relief, t: Double, override: Double, motionAll: Double?, burstA: SCNVector4, burstB: SCNVector4) {
        let timeVal = NSValue(scnVector4: SCNVector4(Float(t), reducedMotion ? 1 : 0, Float(override), 0))
        let valA = NSValue(scnVector4: burstA)
        let valB = NSValue(scnVector4: burstB)
        r.material.setValue(timeVal, forKey: "showTime")
        r.material.setValue(valA, forKey: "burstA")
        r.material.setValue(valB, forKey: "burstB")
        for m in r.movers {
            var time: Double?
            if !reducedMotion {
                if let motionAll {
                    time = motionAll
                } else {
                    let pass = CityFinale.passTime(m.cx, reducedMotion: false)
                    time = t > pass ? t - pass : nil
                }
            }
            let state = CitySkyline.motionState(m.motion, timeSec: time)
            m.material.setValue(timeVal, forKey: "showTime")
            m.material.setValue(NSValue(scnVector4: SCNVector4(r.neon, Float(state.glow), 0, 0)), forKey: "cityLook")
            m.material.setValue(valA, forKey: "burstA")
            m.material.setValue(valB, forKey: "burstB")
            m.node.simdPosition = m.rest + m.tangent * Float(state.dx)
            m.node.simdOrientation = simd_quatf(angle: Float(state.angleRad), axis: m.normal)
            m.mirror.simdPosition = m.node.simdPosition
            m.mirror.simdOrientation = m.node.simdOrientation
        }
        for (source, twin) in r.mirrors {
            twin.setValue(source.value(forKey: "showTime"), forKey: "showTime")
            twin.setValue(source.value(forKey: "cityLook"), forKey: "cityLook")
            twin.setValue(valA, forKey: "burstA")
            twin.setValue(valB, forKey: "burstB")
        }
    }

    private func hideStage() {
        molar.isHidden = true
        mountain.isHidden = true
        summitGlow.isHidden = true
        coinRoot.isHidden = true
        flyingRoot.isHidden = true
        coinGlow.isHidden = true
        rays.isHidden = true
        probe.isHidden = true
        bulb.isHidden = true
        for n in orbitNodes { n.isHidden = true }
        for n in fractalNodes { n.isHidden = true }
        for n in wormholeNodes { n.isHidden = true }
    }

    private func placeMolar(_ pose: FinaleMolarPose, alpha: Double, placed: (Int) -> MolarFinish, shineIndex: Int, shine: Double, gold: Bool) {
        molar.isHidden = alpha <= 0.01
        if molar.isHidden { return }
        molar.simdPosition = SIMD3<Float>(Float(pose.position.x), Float(pose.position.y), Float(pose.position.z))
        molar.simdScale = SIMD3<Float>(repeating: Float(pose.scale))
        molar.simdEulerAngles = SIMD3<Float>(Float(pose.pitch), Float(pose.yaw), 0)
        molar.opacity = CGFloat(alpha)
        let body = gold ? goldBody : porcelain
        if molarBody.geometry?.firstMaterial !== body {
            molarBody.geometry?.materials = [body]
            for r in rootNodes { r.geometry?.materials = [body] }
        }
        for i in 0..<CityFinale.campaignPieces {
            let f = placed(i)
            if f == .empty {
                cuspCoins[i]?.isHidden = true
                continue
            }
            if cuspCoins[i] == nil || cuspFinish[i] != f {
                cuspCoins[i]?.removeFromParentNode()
                let c = coinNode(i, finish: f)
                cuspCoins[i] = c
                cuspFinish[i] = f
                molar.addChildNode(c)
            }
            guard let coin = cuspCoins[i] else { continue }
            coin.isHidden = false
            let top = Finale3D.molarCuspTop(i)
            coin.simdPosition = SIMD3<Float>(Float(top.x), Float(top.y), Float(top.z + 0.03))
            coin.simdScale = SIMD3<Float>(repeating: Float(CityFinale.Molar.cuspRadius * 0.88 * (i == shineIndex ? 1 + 0.25 * shine : 1)))
        }
    }

    private func placeMountain(_ t: Double) -> Double {
        let m = CityFinale.mountain(t, reducedMotion: reducedMotion)
        mountain.isHidden = m.alpha <= 0.01
        if mountain.isHidden {
            summitGlow.isHidden = true
            return m.dy
        }
        let o = Finale3D.stageWorld(0, m.dy, 0)
        mountain.simdPosition = SIMD3<Float>(Float(o.x), Float(o.y), Float(o.z))
        mountain.simdScale = SIMD3<Float>(repeating: Float(Finale3D.stageUnit))
        mountain.opacity = CGFloat(m.alpha)
        let summitBlaze = atTop && t >= CityFinale.summitHop ? min(1, 0.55 + exp(-(t - CityFinale.summitHop) / 0.55)) : 0
        mountainMaterial.setValue(NSValue(scnVector4: SCNVector4(Float(t), reducedMotion ? 1 : 0, Float(summitBlaze), 0)), forKey: "mountainFx")
        let probeNow = CityFinale.probe(t, reducedMotion: reducedMotion, climbTo: worldIndex, summit: atTop)
        if probeNow.space == .stage && probeNow.alpha > 0.01 && t >= CityFinale.molarEnd {
            let py = probeNow.y - m.dy
            let pz = Finale3D.mountainFront(probeNow.x, py) + 0.08
            mountainMaterial.setValue(NSValue(scnVector4: SCNVector4(Float(probeNow.x), Float(py), Float(pz), Float(probeNow.alpha))), forKey: "probeLocal")
        } else {
            mountainMaterial.setValue(NSValue(scnVector4: SCNVector4(0, 0, 0, 0)), forKey: "probeLocal")
        }
        func earned(_ i: Int) -> Bool { i == worldIndex ? t >= CityFinale.climbHop : finish(i) != .empty }
        for (i, node) in ledgeNodes.enumerated() {
            let on = earned(i)
            node.geometry?.materials = [on ? ledgeGold : ledgeDim]
            if on && ledgeCoins[i] == nil {
                let c = coinNode(i, finish: finish(i) == .empty ? .pearl : finish(i))
                ledgeCoins[i] = c
                mountain.addChildNode(c)
            }
            if let coin = ledgeCoins[i] {
                coin.isHidden = !on
                let p = Finale3D.ledge(i)
                let side: Double = p.x < 0 ? -1 : 1
                let pop = i == worldIndex && !reducedMotion ? min(1, max(0, (t - CityFinale.climbHop) / 0.35)) : 1
                coin.simdPosition = SIMD3<Float>(Float(p.x + side * 0.17), Float(p.y + 0.02), Float(p.z + 0.02))
                coin.simdScale = SIMD3<Float>(repeating: Float(0.072 * (0.4 + 0.6 * pop)))
                coin.simdEulerAngles = SIMD3<Float>(0, reducedMotion ? 0 : Float(t * 0.8 + Double(i)), 0)
            }
        }
        let hopStart = CityFinale.climbHop - 0.8
        let summitStart = CityFinale.summitHop - 0.8
        for (k, pm) in pathMaterials.enumerated() {
            var fill = 0.0
            var shimmer = 0.0
            var headGlow = 0.0
            let rawPhase = t * 0.65 - Double(k) * 0.22
            let phase = rawPhase - floor(rawPhase)
            if k < CityFinale.campaignPieces {
                if k == worldIndex {
                    if t >= CityFinale.climbHop {
                        fill = 1
                        shimmer = phase
                        headGlow = reducedMotion ? 0 : 0.35 + 0.65 * exp(-(t - CityFinale.climbHop) / 0.5)
                    } else if t >= hopStart && !reducedMotion {
                        let s = CityFinale.smooth01((t - hopStart) / 0.8)
                        fill = s
                        shimmer = s
                        headGlow = 1
                    }
                } else if earned(k) {
                    fill = 1
                    shimmer = phase
                    headGlow = reducedMotion ? 0 : 0.35
                }
            } else if atTop {
                if t >= CityFinale.summitHop {
                    let sRaw = t * 0.75 - Double(k) * 0.22
                    fill = 1
                    shimmer = sRaw - floor(sRaw)
                    headGlow = reducedMotion ? 0 : 0.45 + 0.75 * exp(-(t - CityFinale.summitHop) / 0.6)
                } else if t >= summitStart && !reducedMotion {
                    let s = CityFinale.smooth01((t - summitStart) / 0.8)
                    fill = s
                    shimmer = s
                    headGlow = 1
                }
            }
            pm.setValue(NSValue(scnVector4: SCNVector4(Float(fill), Float(shimmer), Float(headGlow), Float(m.alpha))), forKey: "pathFx")
        }
        let top = Finale3D.stageWorld(0, 0.66 + m.dy, -0.5)
        summitGlow.isHidden = false
        summitGlow.simdPosition = SIMD3<Float>(Float(top.x), Float(top.y), Float(top.z))
        let blaze = atTop && t >= CityFinale.summitHop ? 1.6 : 0.8 + (reducedMotion ? 0 : 0.15 * sin(t * 3))
        summitGlow.simdScale = SIMD3<Float>(repeating: Float(5 * blaze))
        summitGlow.opacity = CGFloat(m.alpha * 0.7)
        return m.dy
    }

    /// The probe's place in the world, at time `at` (city space over the skyline, stage space after).
    static func probeWorld(_ p: CityFinale.Probe, at: Double, mountainDy: Double) -> Vec3 {
        if p.space == .city {
            let w = Finale3D.skylineWorld(p.x, p.y, 0)
            return Vec3(w.x, w.y, w.z + 3.5)
        }
        let depth = at >= CityFinale.molarEnd ? Finale3D.mountainFront(p.x, p.y - mountainDy) * Finale3D.stageUnit + 0.45 : 0.6
        return Finale3D.stageWorld(p.x, p.y, depth)
    }

    private func placeProbe(_ t: Double, mountainDy: Double) {
        let p = CityFinale.probe(t, reducedMotion: reducedMotion, climbTo: worldIndex, summit: atTop)
        if p.space == .hidden || p.alpha <= 0.01 {
            probe.isHidden = true
            return
        }
        probe.isHidden = false
        let now = Self.probeWorld(p, at: t, mountainDy: mountainDy)
        probe.simdPosition = SIMD3<Float>(Float(now.x), Float(now.y), Float(now.z))
        probe.simdScale = SIMD3<Float>(repeating: p.space == .city ? 1.5 : 0.62)
        // face the way it is flying: nose along +x going right, -x going left, toward you hovering
        let before = CityFinale.probe(t - 0.15, reducedMotion: reducedMotion, climbTo: worldIndex, summit: atTop)
        var s = 0.0
        if before.space == p.space && !reducedMotion {
            let prev = Self.probeWorld(before, at: t - 0.15, mountainDy: mountainDy)
            s = max(-1, min(1, (now.x - prev.x) / (p.space == .city ? 1.6 : 0.5)))
        }
        if let craft = probeRig?.rootNode {
            // a nod hello at the wormhole's ring of teeth (its tiny double in the next city nods back)
            let nod = CityFinale.nod(t, at: CityFinale.hello, reducedMotion: reducedMotion)
            craft.simdEulerAngles = SIMD3<Float>(0, Float(-Double.pi / 2 + Double.pi / 2 * s), Float(-0.25 * abs(s) + (reducedMotion ? 0 : 0.05 * sin(t * 3.1)) - 0.55 * nod))
            craft.simdPosition = SIMD3<Float>(0, reducedMotion ? 0 : Float(0.06 * sin(t * 2.3)), 0)
        }
        let spin = Float(reducedMotion ? 0 : t * 7)
        probeRig?.outerEmitterRingNode.simdEulerAngles = SIMD3<Float>(spin, 0, 0)
        probeRig?.innerEmitterRingNode.simdEulerAngles = SIMD3<Float>(-spin * 1.35, 0, 0)
    }

    private func placeFractal(_ index: Int, t: Double) {
        let list = Finale3D.emblemFractal(index, t, reducedMotion: reducedMotion)
        if fractalFor != index {
            fractalFor = index
            for (k, n) in fractalNodes.enumerated() {
                if let copy = emblemGeometry(index)?.copy() as? SCNGeometry {
                    copy.materials = [fractalMaterials[k]]
                    n.geometry = copy
                }
                fractalLastFx[k] = SIMD2<Float>(-1, -1)
            }
        }
        while fractalNodes.count < list.count {
            appendFractalNode(index: index)
        }
        for (k, n) in fractalNodes.enumerated() {
            guard k < list.count else {
                n.isHidden = true
                continue
            }
            let e = list[k]
            n.isHidden = false
            n.simdPosition = SIMD3<Float>(Float(e.x), Float(e.y), Float(e.z))
            n.simdEulerAngles = SIMD3<Float>(0, Float(e.yaw), Float(e.roll))
            n.simdScale = SIMD3<Float>(repeating: Float(e.scale * max(0.001, e.alpha)))
            let depth = Float(min(1.0, Double(e.level) / 3.0))
            let glint = Float(e.glint)
            let last = fractalLastFx[k]
            if abs(depth - last.x) > 0.004 || abs(glint - last.y) > 0.004 {
                fractalLastFx[k] = SIMD2<Float>(depth, glint)
                fractalMaterials[k].setValue(NSValue(scnVector4: SCNVector4(depth, glint, 0, 0)), forKey: "emblemFx")
            }
        }
    }

    private func placeShowProps(_ city: CityArt?, showT: Double) {
        let plan = city?.finale
        let beads = plan?.show == .beads && !reducedMotion && showT >= 0 ? CityFinale.beads(showT) : []
        for (i, node) in beadNodes.enumerated() {
            guard i < beads.count else {
                node.isHidden = true
                continue
            }
            let b = beads[i]
            let p = Finale3D.skylineWorld(b.x, b.y, 0)
            node.isHidden = false
            node.simdPosition = SIMD3<Float>(Float(p.x), Float(p.y), Float(p.z + 3 + Double(i % 5) * 0.6))
            node.geometry?.firstMaterial?.diffuse.contents = RenderBridge.color(hex: b.colorHex)
        }
        let balloons = plan?.show == .balloons && !reducedMotion && showT >= 0 ? CityFinale.balloons(showT) : []
        for (i, node) in balloonNodes.enumerated() {
            guard i < balloons.count else {
                node.isHidden = true
                continue
            }
            let b = balloons[i]
            let p = Finale3D.skylineWorld(b.x, b.y, 0)
            node.isHidden = false
            node.simdPosition = SIMD3<Float>(Float(p.x), Float(p.y), Float(p.z + 4 + Double(i) * 0.7))
            node.childNode(withName: "envelope", recursively: false)?.geometry?.firstMaterial?.diffuse.contents = RenderBridge.color(hex: b.colorHex)
        }
    }

    private func renderCity(_ t: Double, w: Double, h: Double) {
        guard let relief = showOnly(worldIndex), let art = arts[worldIndex] else { return }
        hideStage()
        _ = setCamera(Finale3D.finaleCamera(t, reducedMotion: reducedMotion), w: w, h: h)
        let dim = 1 - 0.35 * CityFinale.smooth01((t - 14.0) / 1.0)
        let flash = computeBurstFlash(art.finale, showT: t - CityFinale.blazeEnd, dim: dim)
        updateRelief(relief, t: t, override: -1, motionAll: nil, burstA: flash.0, burstB: flash.1)
        let aurora = CityFinale.smooth01((t - CityFinale.waveEnd) / 1.2) * (t < CityFinale.showEnd ? 1 : 0.55)
        setSky(worldIndex, aurora: reducedMotion ? aurora * 0.6 : aurora, t: t, override: -1)
        placeShowProps(art, showT: t - CityFinale.blazeEnd)
        placeFractal(worldIndex, t: t)

        let finishHere = finish(worldIndex) == .empty ? .pearl : finish(worldIndex)
        let piece = CityFinale.piece(t, slotIndex: worldIndex, reducedMotion: reducedMotion)
        if piece.visible {
            if !coinBuilt {
                coinRoot.addChildNode(coinNode(worldIndex, finish: finishHere))
                coinBuilt = true
            }
            coinRoot.isHidden = false
            let p = Finale3D.stageWorld(piece.x, piece.y, 0.8)
            coinRoot.simdPosition = SIMD3<Float>(Float(p.x), Float(p.y), Float(p.z))
            coinRoot.simdScale = SIMD3<Float>(repeating: Float(CityFinale.pieceRadius * piece.scale * Finale3D.stageUnit))
            coinRoot.opacity = CGFloat(piece.alpha)
            coinRoot.simdEulerAngles = SIMD3<Float>(0, Float(piece.spin), 0)
            coinGlow.isHidden = false
            coinGlow.simdPosition = SIMD3<Float>(Float(p.x), Float(p.y), Float(p.z - 0.3))
            coinGlow.simdScale = SIMD3<Float>(repeating: Float(CityFinale.pieceRadius * Finale3D.stageUnit * 5 * piece.glow))
            coinGlow.opacity = CGFloat(piece.alpha * 0.8)
            (coinGlow.childNodes.first?.geometry?.firstMaterial)?.multiply.contents = RenderBridge.color(hex: finishHere == .gold ? 0xFDE047 : 0xE2E8F0)
            if t >= CityFinale.meet && t < CityFinale.prizeEnd && !reducedMotion {
                rays.isHidden = false
                rays.simdPosition = SIMD3<Float>(Float(p.x), Float(p.y), Float(p.z - 0.5))
                rays.simdScale = SIMD3<Float>(repeating: Float(CityFinale.pieceRadius * Finale3D.stageUnit * 3.4))
                rays.simdEulerAngles = SIMD3<Float>(0, 0, Float(t * 0.6))
            }
        }

        let dy = placeMountain(t)
        let m = CityFinale.molar(t, reducedMotion: reducedMotion)
        let slotShine = CityFinale.slotShine(t)
        porcelain.setValue(NSValue(scnVector4: SCNVector4(Float(slotShine), -3, 0, 0)), forKey: "molarFx")
        let pose = FinaleLook.molarPose(cx: m.x, cy: m.y, scale: CityFinale.Molar.scale * m.scale, t: t, faceTilt: 0, turn: t < CityFinale.molarEnd, reducedMotion: reducedMotion)
        placeMolar(
            pose, alpha: m.alpha,
            placed: { i in i == self.worldIndex ? (t >= CityFinale.slot ? finishHere : .empty) : self.finish(i) },
            shineIndex: worldIndex, shine: slotShine, gold: false
        )
        placeProbe(t, mountainDy: dy)
        placeWormhole(t)
    }

    private func renderEnding(_ t: Double, w: Double, h: Double) {
        typealias E = CityFinale.Ending
        hideStage()
        let credit = CityFinale.endingCredit(t)
        let lens = setCamera(Finale3D.endingCamera(t, reducedMotion: reducedMotion), w: w, h: h)
        if credit.index >= 0 {
            let within = t - E.creditsStart - Double(credit.index) * E.creditSeconds
            let art = credit.index < arts.count ? arts[credit.index] : nil
            if let relief = showOnly(credit.index) {
                let flash = computeBurstFlash(art?.finale, showT: within - 0.6, dim: credit.alpha)
                updateRelief(relief, t: CityFinale.end, override: credit.alpha, motionAll: reducedMotion ? nil : t, burstA: flash.0, burstB: flash.1)
            }
            setSky(credit.index, aurora: credit.alpha * 0.6, t: t, override: credit.alpha)
            placeShowProps(art, showT: within - 0.6)
        } else {
            _ = showOnly(-1)
            setSky(-1, aurora: t >= E.finaleStart ? 1 : 0.35, t: t, override: 1)
            placeShowProps(nil, showT: -1)
        }

        let place = CityFinale.endingMolarPlace(t)
        let snapped = t >= E.snap
        let isGold = snapped && allGold
        var sweepPos = -3.0
        var sweepStr = 0.0
        if snapped {
            let snapAge = t - E.snap
            if reducedMotion {
                sweepPos = 0
                sweepStr = exp(-snapAge / 0.85) * (isGold ? 0.5 : 0.35)
            } else if snapAge < 1.35 {
                let s = snapAge / 1.35
                sweepPos = -1.7 + 3.5 * CityFinale.smooth01(s)
                sweepStr = sin(s * Double.pi) * (isGold ? 1.0 : 0.65)
            } else if isGold && t >= E.face && t - E.face < 1.2 {
                let s = (t - E.face) / 1.2
                sweepPos = -1.5 + 3.1 * CityFinale.smooth01(s)
                sweepStr = sin(s * Double.pi) * 0.55
            }
        }
        let fxVal = NSValue(scnVector4: SCNVector4(Float(isGold ? (t >= E.finaleStart ? 1.0 : 0.45) : 0.0), Float(sweepPos), Float(sweepStr), 0))
        (isGold ? goldBody : porcelain).setValue(fxVal, forKey: "molarFx")
        var pose = FinaleLook.molarPose(cx: place.x, cy: place.y, scale: place.scale, t: t, faceTilt: FinaleLook.faceTilt(t, allGold: true), turn: true, reducedMotion: reducedMotion)
        if credit.index >= 0 {
            let pinned = FinaleLook.pinnedToView(lens, x: place.x, y: place.y, scale: place.scale)
            pose.position = pinned.position
            pose.scale = pinned.scale
        }
        placeMolar(
            pose, alpha: place.alpha,
            placed: { i in CityFinale.endingPiece(i, t: t, reducedMotion: self.reducedMotion).arrived ? self.finish(i) : .empty },
            shineIndex: -1, shine: 0, gold: isGold
        )
        // the pieces in flight
        flyingRoot.isHidden = false
        for i in 0..<CityFinale.campaignPieces {
            let p = CityFinale.endingPiece(i, t: t, reducedMotion: reducedMotion)
            if p.arrived || p.alpha <= 0 {
                flyingCoins[i]?.isHidden = true
                continue
            }
            if flyingCoins[i] == nil {
                let c = coinNode(i, finish: finish(i) == .empty ? .pearl : finish(i))
                flyingCoins[i] = c
                flyingRoot.addChildNode(c)
            }
            guard let coin = flyingCoins[i] else { continue }
            coin.isHidden = false
            // Over the last part of the flight the coin eases into its socket's own place, turn and
            // size on the tilted 3D molar, so it is already exactly there when it clicks in.
            let flight = max(0, min(1, (t - (E.firstPiece + Double(i) * E.pieceGap)) / E.pieceFlight))
            let k = reducedMotion ? 1 : CityFinale.smooth01((flight - 0.55) / 0.45)
            let top = Finale3D.molarCuspTop(i)
            let socket = pose.world(SIMD3<Double>(top.x, top.y, top.z + 0.03))
            let fly = Finale3D.stageWorld(p.x, p.y, 1)
            let at = fly + (socket - fly) * k
            coin.simdPosition = SIMD3<Float>(Float(at.x), Float(at.y), Float(at.z))
            let flyScale = CityFinale.Molar.cuspRadius * place.scale * p.scale * Finale3D.stageUnit
            let socketScale = CityFinale.Molar.cuspRadius * 0.88 * pose.scale
            coin.simdScale = SIMD3<Float>(repeating: Float(flyScale + (socketScale - flyScale) * k))
            let flyTurn = simd_quatf(angle: Float(p.spin), axis: SIMD3<Float>(0, 1, 0))
            coin.simdOrientation = simd_slerp(flyTurn, molar.simdOrientation, Float(k))
            coin.opacity = CGFloat(p.alpha)
        }

        // the last scene: the golden fractal rising behind the molar, the signs circling
        if t >= E.finaleStart {
            let local = t - E.finaleStart
            let grow = reducedMotion ? CityFinale.smooth01(local / 1.0) : CityFinale.smooth01(local / 1.6)
            let fade = 1 - CityFinale.smooth01((t - (E.end - 0.8)) / 0.8)
            let c = Finale3D.stageWorld(place.x, place.y + 0.15, -10)
            let radius = reducedMotion ? 5.2 : 5.2 * (0.2 + 0.8 * grow)
            bulb.isHidden = false
            bulb.simdPosition = SIMD3<Float>(Float(c.x), Float(c.y), Float(c.z))
            bulb.simdScale = SIMD3<Float>(repeating: Float(radius * 2.4))
            bulbMaterial.setValue(NSValue(scnVector4: SCNVector4(Float(c.x), Float(c.y), Float(c.z), Float(radius))), forKey: "bulbCenter")
            let power = reducedMotion ? 8 : 6 + 2 * CityFinale.smooth01(local / 3)
            bulbMaterial.setValue(NSValue(scnVector4: SCNVector4(Float(reducedMotion ? 0 : local), Float(grow * fade), Float(power), 0)), forKey: "bulbLook")
            for i in 0..<CityFinale.campaignPieces {
                let o = CityFinale.endingEmblemOrbit(i, t: t, reducedMotion: reducedMotion)
                let n = orbitNodes[i]
                n.isHidden = o.alpha <= 0.01
                let wp = Finale3D.stageWorld(o.x, o.y, 1.2)
                n.simdPosition = SIMD3<Float>(Float(wp.x), Float(wp.y), Float(wp.z))
                n.simdScale = SIMD3<Float>(repeating: Float(0.11 * Finale3D.stageUnit * o.alpha))
                n.simdEulerAngles = SIMD3<Float>(0, reducedMotion ? 0 : Float(local * 1.2 + Double(i)), 0)
            }
        }
    }
}

// MARK: - The view

#if canImport(UIKit)
struct FinaleSceneView: UIViewRepresentable {
    let stage: FinaleScene3D

    func makeUIView(context: Context) -> SCNView {
        let view = SCNView(frame: .zero, options: [SCNView.Option.preferredRenderingAPI.rawValue: SCNRenderingAPI.metal.rawValue])
        configure(view)
        return view
    }

    func updateUIView(_ uiView: SCNView, context: Context) {}

    static func dismantleUIView(_ uiView: SCNView, coordinator: ()) {
        uiView.isPlaying = false
        uiView.delegate = nil
        uiView.scene = nil
    }

    private func configure(_ view: SCNView) {
        view.scene = stage.scene
        view.pointOfView = stage.cameraNode
        view.delegate = stage
        view.preferredFramesPerSecond = 60
        view.rendersContinuously = true
        view.isPlaying = true
        view.antialiasingMode = UIDevice.current.userInterfaceIdiom == .phone ? .multisampling2X : .multisampling4X
        view.backgroundColor = .black
        view.isUserInteractionEnabled = false
    }
}
#elseif canImport(AppKit)
struct FinaleSceneView: NSViewRepresentable {
    let stage: FinaleScene3D

    func makeNSView(context: Context) -> SCNView {
        let view = SCNView(frame: .zero, options: [SCNView.Option.preferredRenderingAPI.rawValue: SCNRenderingAPI.metal.rawValue])
        view.scene = stage.scene
        view.pointOfView = stage.cameraNode
        view.delegate = stage
        view.preferredFramesPerSecond = 60
        view.rendersContinuously = true
        view.isPlaying = true
        view.antialiasingMode = .multisampling4X
        view.backgroundColor = .black
        return view
    }

    func updateNSView(_ nsView: SCNView, context: Context) {}

    static func dismantleNSView(_ nsView: SCNView, coordinator: ()) {
        nsView.isPlaying = false
        nsView.delegate = nil
        nsView.scene = nil
    }
}
#endif

// MARK: - The 2D layer over the 3D show

extension FinalePainter {
    /// Over the 3D city finale: the fireworks' sparks with their tails, rockets, the probe's trail,
    /// shooting stars, the host and their words, and the fades.
    func draw3DOverlay(_ ctx: inout GraphicsContext, t: Double) {
        if request.kind != .ending && t < clock.cityLength {
            drawCity3DOverlay(&ctx, t: t)
        } else {
            drawEnding3DOverlay(&ctx, t: t - clock.cityLength)
        }
    }

    private func sparkStroke(_ ctx: inout GraphicsContext, lens: FinaleLens, head: SIMD3<Double>, tail: SIMD3<Double>, color: Color, size: Double, alpha: Double) {
        guard alpha > 0.004, let a = lens.project(head) else { return }
        let b = lens.project(tail) ?? a
        let px = max(1.2, lens.pixels(size, depth: a.depth))
        var c = ctx
        c.blendMode = .plusLighter
        c.opacity = alpha * 0.22
        c.fill(Path(ellipseIn: CGRect(x: a.x - px * 2.5, y: a.y - px * 2.5, width: px * 5.0, height: px * 5.0)), with: .color(color))
        if hypot(a.x - b.x, a.y - b.y) > 0.5 {
            var streak = Path()
            streak.move(to: CGPoint(x: b.x, y: b.y))
            streak.addLine(to: CGPoint(x: a.x, y: a.y))
            c.opacity = 1
            c.stroke(streak, with: .linearGradient(
                Gradient(colors: [color.opacity(0), color.opacity(alpha)]),
                startPoint: CGPoint(x: b.x, y: b.y),
                endPoint: CGPoint(x: a.x, y: a.y)
            ), style: StrokeStyle(lineWidth: px, lineCap: .round))
        }
        c.opacity = alpha * 0.9
        c.fill(Path(ellipseIn: CGRect(x: a.x - px * 0.85, y: a.y - px * 0.85, width: px * 1.7, height: px * 1.7)), with: .color(color))
        c.opacity = alpha * 0.65
        c.fill(Path(ellipseIn: CGRect(x: a.x - px * 0.45, y: a.y - px * 0.45, width: px * 0.9, height: px * 0.9)), with: .color(Color(red: 1, green: 0.97, blue: 0.9)))
    }

    /// One burst's sparks, each drawn as a tapered streak from its previous position to its head.
    private func paintBurst3D(_ ctx: inout GraphicsContext, lens: FinaleLens, burst: FinaleBurst, index b: Int, showT: Double, show: FinaleShow, center: SIMD3<Double>, scale: Double, size: (Double, Double), dim: Double) {
        let delay = show == .meteors ? 0.0 : 0.9
        let age = showT - burst.t - delay
        let c1 = finaleRGB(burst.colorHex)
        let c2 = finaleRGB(burst.color2Hex)
        if age >= 0 && age < 0.28, let s = lens.project(center) {
            let coreAlpha = 0.52 * dim * CityFinale.smooth01(age / 0.025) * exp(-age / 0.08)
            let coreRadius = lens.pixels(2.2 * scale * (0.45 + 1.3 * CityFinale.smooth01(age / 0.12)), depth: s.depth)
            paintGlow(&ctx, x: s.x, y: s.y, radius: coreRadius, color: finaleColor(c1 + (c2 - c1) * 0.35), alpha: coreAlpha)
        }
        let now = Finale3D.burstSparks(burst, b, showT: showT, show: show, center: center, scale: scale)
        if now.isEmpty { return }
        for s in now {
            let color = finaleColor(c1 + (c2 - c1) * s.mix)
            sparkStroke(&ctx, lens: lens, head: SIMD3(s.x, s.y, s.z), tail: SIMD3(s.px, s.py, s.pz), color: color, size: s.gen == 0 ? size.0 : size.1, alpha: s.alpha * dim)
        }
    }

    /// Reduce Motion: no rocket climbs; a still light swells and fades where the shell would burst.
    private func stillBurstLight(_ ctx: inout GraphicsContext, lens: FinaleLens, burst: FinaleBurst, center: SIMD3<Double>, showT: Double, show: FinaleShow, dim: Double) {
        let delay = show == .meteors ? 0.0 : 0.9
        let still = (showT - burst.t - delay) / 1.6
        guard still >= 0, still < 1, let s = lens.project(center) else { return }
        paintGlow(&ctx, x: s.x, y: s.y, radius: lens.pixels(2.6, depth: s.depth), color: finaleColor(finaleRGB(burst.colorHex)), alpha: 0.7 * dim * sin(Double.pi * still))
    }

    /// Station Aurora's shooting stars, each a fading line from its head back along its tail.
    private func paintMeteors(_ ctx: inout GraphicsContext, lens: FinaleLens, showT: Double, alpha: Double) {
        for m in CityFinale.meteors(showT) {
            let a = Finale3D.skylineWorld(m.x, m.y, 0)
            let b = Finale3D.skylineWorld(m.tailX, m.tailY, 0)
            guard let pa = lens.project(SIMD3(a.x, a.y, a.z - 4)), let pb = lens.project(SIMD3(b.x, b.y, b.z - 4)) else { continue }
            var line = Path()
            line.move(to: CGPoint(x: pa.x, y: pa.y))
            line.addLine(to: CGPoint(x: pb.x, y: pb.y))
            ctx.stroke(line, with: .linearGradient(
                Gradient(colors: [Color.white.opacity(m.alpha * alpha), Color.white.opacity(0)]),
                startPoint: CGPoint(x: pa.x, y: pa.y), endPoint: CGPoint(x: pb.x, y: pb.y)
            ), style: StrokeStyle(lineWidth: 2, lineCap: .round))
        }
    }

    private func drawCity3DOverlay(_ ctx: inout GraphicsContext, t: Double) {
        guard let city else { return }
        let plan = city.plan
        let lens = FinaleLens(Finale3D.finaleCamera(t, reducedMotion: rm), width: w, height: h)
        var glow = ctx
        glow.blendMode = .plusLighter
        let showT = t - CityFinale.blazeEnd
        let dim = 1 - 0.35 * CityFinale.smooth01((t - 14.0) / 1.0)
        if showT >= 0 {
            for (b, burst) in plan.bursts.enumerated() {
                let center = Finale3D.burstWorld(burst, b)
                if rm {
                    stillBurstLight(&glow, lens: lens, burst: burst, center: center, showT: showT, show: plan.show, dim: dim)
                    continue
                }
                if let r = CityFinale.rocket(burst, showT: showT, show: plan.show) {
                    let p = Finale3D.skylineWorld(r.x, r.y, 0)
                    let tail = Finale3D.skylineWorld(r.x, max(0, r.y - 1.35), 0)
                    let head = SIMD3(p.x, p.y, center.z)
                    sparkStroke(&glow, lens: lens, head: head, tail: SIMD3(tail.x, tail.y, center.z), color: Color(red: 1, green: 0.95, blue: 0.78), size: 0.14, alpha: 0.95 * dim)
                    if let s = lens.project(head) {
                        paintGlow(&glow, x: s.x, y: s.y, radius: lens.pixels(0.75, depth: s.depth), color: Color(red: 1, green: 0.95, blue: 0.78), alpha: 0.9 * dim)
                    }
                }
                if !rm {
                    paintBurst3D(&glow, lens: lens, burst: burst, index: b, showT: showT, show: plan.show, center: center, scale: 1, size: (0.16, 0.11), dim: dim)
                }
            }
            if plan.show == .meteors && !rm {
                for m in CityFinale.meteors(showT) {
                    let a = Finale3D.skylineWorld(m.x, m.y, 0)
                    let b = Finale3D.skylineWorld(m.tailX, m.tailY, 0)
                    guard let pa = lens.project(SIMD3(a.x, a.y, a.z - 4)), let pb = lens.project(SIMD3(b.x, b.y, b.z - 4)) else { continue }
                    var line = Path()
                    line.move(to: CGPoint(x: pa.x, y: pa.y))
                    line.addLine(to: CGPoint(x: pb.x, y: pb.y))
                    glow.stroke(line, with: .linearGradient(
                        Gradient(colors: [Color.white.opacity(m.alpha), Color.white.opacity(0)]),
                        startPoint: CGPoint(x: pa.x, y: pa.y), endPoint: CGPoint(x: pb.x, y: pb.y)
                    ), style: StrokeStyle(lineWidth: 2, lineCap: .round))
                }
            }
        }
        // the emblem rocket climbing to the burst
        if let rocket = CityFinale.emblemRocket(t), !rm {
            let p = Finale3D.stageWorld(rocket.x, rocket.y, 0)
            let k = min(1, max(0, (t - CityFinale.showEnd) / (CityFinale.emblemBurst - CityFinale.showEnd)))
            let y = p.y - 6 + (Finale3D.emblemCenter.y - (p.y - 6)) * k
            let head = SIMD3(0, y, Finale3D.emblemCenter.z)
            sparkStroke(&glow, lens: lens, head: head, tail: SIMD3(0, y - 1.6, Finale3D.emblemCenter.z), color: Color(red: 1, green: 0.95, blue: 0.78), size: 0.18, alpha: 1)
            if let s = lens.project(head) {
                paintGlow(&glow, x: s.x, y: s.y, radius: lens.pixels(1.0, depth: s.depth), color: Color(red: 1, green: 0.95, blue: 0.78), alpha: 0.95)
            }
        }
        // the probe's trail and brief touchdown sparkle ring on the climbed ledge
        if !rm {
            let m = CityFinale.mountain(t, reducedMotion: rm)
            let dy = m.dy
            for k in 1...7 {
                let past = CityFinale.probe(t - Double(k) * 0.04, reducedMotion: false, climbTo: request.worldIndex, summit: atTop)
                if past.space == .hidden { continue }
                let wp = FinaleScene3D.probeWorld(past, at: t, mountainDy: dy)
                guard let s = lens.project(wp) else { continue }
                paintGlow(&glow, x: s.x, y: s.y, radius: lens.pixels(past.space == .city ? 0.8 : 0.22, depth: s.depth), color: Color(red: 0.37, green: 0.92, blue: 0.83), alpha: 0.6 * (1 - Double(k) / 8))
            }
            func paintTouchdown(at: Double, ledgeIdx: Int) {
                let age = t - at
                guard m.alpha > 0.01, age >= 0, age <= 0.5 else { return }
                let l = Finale3D.ledge(ledgeIdx)
                let w0 = Finale3D.stageWorld(l.x, l.y + dy, l.z * Finale3D.stageUnit)
                let r = 0.25 + 1.3 * CityFinale.smooth01(age / 0.45)
                let fade = (1 - age / 0.5) * m.alpha * 0.85
                for j in 0..<10 {
                    let a = (Double.pi * 2 * Double(j)) / 10 + age * 1.4
                    let wp = SIMD3(w0.x + cos(a) * r, w0.y + sin(a) * r * 0.45 + age * 0.6, w0.z + 0.15)
                    guard let s = lens.project(wp) else { continue }
                    paintGlow(&glow, x: s.x, y: s.y, radius: lens.pixels(0.22, depth: s.depth), color: Color(red: 0.99, green: 0.9, blue: 0.54), alpha: fade)
                }
            }
            paintTouchdown(at: CityFinale.climbHop, ledgeIdx: request.worldIndex)
            if atTop { paintTouchdown(at: CityFinale.summitHop, ledgeIdx: CityFinale.campaignPieces) }
        }
        // the window at the end of the wormhole: the next city, with little wormholes in its sky
        if let win = Finale3D.wormholeWindow(t, reducedMotion: rm) {
            let cover = hypot(w, h)
            let next = CityFinale.climbStatus(request.finishes).next
            if let s = lens.project(win.center), s.depth > 0.08 {
                paintWormholeWindow(&ctx, x: s.x, y: s.y, r: min(lens.pixels(win.radius, depth: s.depth), cover * 4), cityIndex: next, depth: 2, t: t, alpha: win.alpha, withProbe: true)
            } else {
                paintWormholeWindow(&ctx, x: w / 2, y: h / 2, r: cover, cityIndex: next, depth: 2, t: t, alpha: win.alpha, withProbe: true)
            }
            // Reduce Motion: the next city cross-fades up to fill the screen instead of the dive
            if win.fill > 0.01 {
                paintWormholeWindow(&ctx, x: w / 2, y: h / 2, r: cover, cityIndex: next, depth: 2, t: t, alpha: win.fill, withProbe: true)
            }
        }
        let host = CityFinale.host(t, reducedMotion: rm)
        paintHost(&ctx, city, onLeft: plan.hostOnLeft, rise: host.rise, wave: host.wave)
        // in 3D the bloom carries the moment the probe takes the piece; only a soft flash
        let flash = t >= CityFinale.meet && !rm ? exp(-(t - CityFinale.meet) / 0.12) * 0.22 : 0
        let endingFollows = clock.total > clock.cityLength
        // only the last moment fades, so the next city at the end of the wormhole stays in sight
        let toLight = endingFollows ? 0 : CityFinale.smooth01((t - (CityFinale.end - 0.3)) / 0.3)
        let toDark = endingFollows ? CityFinale.smooth01((t - (CityFinale.end - 0.3)) / 0.3) : 0
        fillScreen(&ctx, color: Color(red: 1, green: 0.98, blue: 0.92), alpha: flash)
        fillScreen(&ctx, color: Color(red: 0.9, green: 1, blue: 0.98), alpha: toLight)
        fillScreen(&ctx, color: Color(red: 0.004, green: 0.012, blue: 0.047), alpha: toDark)
    }

    private func drawEnding3DOverlay(_ ctx: inout GraphicsContext, t: Double) {
        typealias E = CityFinale.Ending
        let lens = FinaleLens(Finale3D.endingCamera(t, reducedMotion: rm), width: w, height: h)
        var glow = ctx
        glow.blendMode = .plusLighter
        let credit = CityFinale.endingCredit(t)
        if credit.index >= 0, let c = FinaleModels.city(credit.index) {
            let within = t - E.creditsStart - Double(credit.index) * E.creditSeconds
            for (b, burst) in c.plan.bursts.enumerated() {
                let center = Finale3D.burstWorld(burst, b)
                if rm {
                    stillBurstLight(&glow, lens: lens, burst: burst, center: center, showT: within - 0.6, show: c.plan.show, dim: credit.alpha)
                    continue
                }
                if let r = CityFinale.rocket(burst, showT: within - 0.6, show: c.plan.show) {
                    let p = Finale3D.skylineWorld(r.x, r.y, 0)
                    let tail = Finale3D.skylineWorld(r.x, max(0, r.y - 1.35), 0)
                    let head = SIMD3(p.x, p.y, center.z)
                    sparkStroke(&glow, lens: lens, head: head, tail: SIMD3(tail.x, tail.y, center.z), color: Color(red: 1, green: 0.95, blue: 0.78), size: 0.14, alpha: 0.95 * credit.alpha)
                    if let s = lens.project(head) {
                        paintGlow(&glow, x: s.x, y: s.y, radius: lens.pixels(0.75, depth: s.depth), color: Color(red: 1, green: 0.95, blue: 0.78), alpha: 0.9 * credit.alpha)
                    }
                }
                if !rm {
                    paintBurst3D(&glow, lens: lens, burst: burst, index: b, showT: within - 0.6, show: c.plan.show, center: center, scale: 1, size: (0.16, 0.11), dim: credit.alpha)
                }
            }
            if c.plan.show == .meteors && !rm {
                paintMeteors(&glow, lens: lens, showT: within - 0.6, alpha: credit.alpha)
            }
            paintHost(&ctx, c, onLeft: c.plan.hostOnLeft, rise: credit.alpha, wave: rm ? 0 : 0.5 * sin(Double.pi * 2 * 1.4 * t))
        }
        // every city the child cleaned, in a little bubble over its own piece: all five inside one tooth
        let homes = CityFinale.endingCityBubbles(t)
        if homes > 0.01 {
            let place = CityFinale.endingMolarPlace(t)
            let pose = FinaleLook.molarPose(cx: place.x, cy: place.y, scale: place.scale, t: t, faceTilt: FinaleLook.faceTilt(t, allGold: true), turn: true, reducedMotion: rm)
            var bubbles: [(index: Int, x: Double, y: Double, r: Double)] = []
            for i in 0..<CityFinale.campaignPieces {
                guard let s = lens.project(pose.world(Finale3D.cuspBubbleLocal(i))) else { continue }
                bubbles.append((i, s.x, s.y, lens.pixels(CityFinale.Molar.cuspRadius * Finale3D.cuspBubble.radius * pose.scale, depth: s.depth)))
            }
            // on a narrow screen the crown of bubbles draws in toward the middle so none is cut off
            let mid = bubbles.reduce(0) { $0 + $1.x } / Double(max(1, bubbles.count))
            let reach = max(1, bubbles.map { abs($0.x - mid) }.max() ?? 1)
            let widest = bubbles.map { $0.r }.max() ?? 0
            let fit = max(0.3, min(1, (min(mid, w - mid) - widest * 1.1 - 6) / reach))
            for b in bubbles {
                let x = mid + (b.x - mid) * fit
                paintWormholeWindow(&ctx, x: x, y: b.y, r: b.r, cityIndex: b.index, depth: 0, t: t, alpha: homes)
                paintBubbleRim(&ctx, x: x, y: b.y, r: b.r, alpha: homes)
            }
        }
        if t >= E.finaleStart {
            let local = t - E.finaleStart
            if !rm {
                for (b, burst) in CityFinale.endingBursts.enumerated() {
                    let center = Finale3D.stageWorld(burst.x, burst.y, -2 + Double(b % 3))
                    paintBurst3D(&glow, lens: lens, burst: burst, index: b, showT: local, show: .fireworks, center: center, scale: CityFinale.endingBurstScale * Finale3D.stageUnit * 0.5, size: (0.06, 0.045), dim: 1)
                }
            }
            // the happy tooth: its face (for everyone who finishes), then "a hug for you"
            let face = CityFinale.endingFace(t)
            if face.alpha > 0 {
                let place = CityFinale.endingMolarPlace(t)
                let pose = FinaleLook.molarPose(cx: place.x, cy: place.y, scale: place.scale, t: t, faceTilt: FinaleLook.faceTilt(t, allGold: true), turn: true, reducedMotion: rm)
                let anchor = pose.faceAnchor()
                if let a = lens.project(anchor.center), let b = lens.project(anchor.side) {
                    let u = hypot(b.x - a.x, b.y - a.y) * 0.78
                    let hug = CityFinale.endingHug(t, reducedMotion: rm)
                    paintFaceAt(&ctx, x: a.x, y: a.y, u: u, alpha: face.alpha, wink: face.wink, happy: hug.happyEyes)
                    paintHugArms(&ctx, x: a.x, y: a.y, u: u, hug: hug, alpha: face.alpha, gold: allGold)
                    paintHearts(&ctx, x: a.x, y: a.y, u: u, t: t, amount: hug.hearts)
                }
            }
            if allGold {
                if face.alpha > 0 {
                    if !rm {
                        // golden rain over everything as delicate falling streaks
                        let rainCol = Color(red: 0.99, green: 0.88, blue: 0.28)
                        for k in 0..<120 {
                            let age = t - E.face - 0.03 * Double(k)
                            if age < 0 { continue }
                            let fall = (age * (0.9 + 0.7 * Double((k * 37) % 11) / 11)).truncatingRemainder(dividingBy: 5)
                            let x = (Double((k * 53) % 97) / 97 - 0.5) * 30
                            let y = 22 - fall * 4.4
                            let z = Double((k * 29) % 41) / 41 * 12
                            sparkStroke(&glow, lens: lens, head: SIMD3(x, y, z), tail: SIMD3(x, y + 0.65, z), color: rainCol, size: 0.055, alpha: 0.8)
                        }
                    }
                }
            }
        }
        let snapFlash = t >= E.snap && !rm ? exp(-(t - E.snap) / 0.15) * 0.22 : 0
        fillScreen(&ctx, color: Color(red: 1, green: 0.98, blue: 0.92), alpha: snapFlash)
        fillScreen(&ctx, color: Color(red: 0.004, green: 0.012, blue: 0.047), alpha: CityFinale.smooth01((t - (E.end - 0.6)) / 0.6))
    }
}
