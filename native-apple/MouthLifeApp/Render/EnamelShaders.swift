import CoreGraphics
import Foundation
import Metal
import MouthLifeCore
import SceneKit
import simd

#if canImport(UIKit)
import UIKit
public typealias PlatformColor = UIColor
#elseif canImport(AppKit)
import AppKit
public typealias PlatformColor = NSColor
#endif

// MARK: - Cross-Platform Color & SceneKit Vector Bridges

public enum RenderBridge {
    @inline(__always)
    public static func color(hex: UInt32, alpha: CGFloat = 1.0) -> PlatformColor {
        let r = CGFloat((hex >> 16) & 0xFF) / 255.0
        let g = CGFloat((hex >> 8) & 0xFF) / 255.0
        let b = CGFloat(hex & 0xFF) / 255.0
        #if canImport(UIKit)
        return UIColor(red: r, green: g, blue: b, alpha: alpha)
        #elseif canImport(AppKit)
        return NSColor(srgbRed: r, green: g, blue: b, alpha: alpha)
        #endif
    }

    @inline(__always)
    public static func color(hexString: String, alpha: CGFloat = 1.0) -> PlatformColor {
        color(hex: parseHex(hexString), alpha: alpha)
    }

    @inline(__always)
    public static func parseHex(_ hexString: String) -> UInt32 {
        let trimmed = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "#", with: "")
            .replacingOccurrences(of: "0x", with: "")
        return UInt32(trimmed, radix: 16) ?? 0xFFFFFF
    }

    @inline(__always)
    public static func srgbSIMD3(hex: UInt32) -> SIMD3<Float> {
        SIMD3<Float>(
            Float((hex >> 16) & 0xFF) / 255.0,
            Float((hex >> 8) & 0xFF) / 255.0,
            Float(hex & 0xFF) / 255.0
        )
    }

    @inline(__always)
    public static func linearSIMD3(hex: UInt32) -> SIMD3<Float> {
        @inline(__always) func toLin(_ c: Float) -> Float {
            c <= 0.04045 ? (c / 12.92) : pow((c + 0.055) / 1.055, 2.4)
        }
        let s = srgbSIMD3(hex: hex)
        return SIMD3<Float>(toLin(s.x), toLin(s.y), toLin(s.z))
    }

    #if os(macOS)
    @inline(__always)
    public static func scnVec3(_ x: Float, _ y: Float, _ z: Float) -> SCNVector3 {
        SCNVector3(CGFloat(x), CGFloat(y), CGFloat(z))
    }

    @inline(__always)
    public static func scnVec3(_ v: SIMD3<Float>) -> SCNVector3 {
        SCNVector3(CGFloat(v.x), CGFloat(v.y), CGFloat(v.z))
    }

    @inline(__always)
    public static func scnVec4(_ x: Float, _ y: Float, _ z: Float, _ w: Float) -> SCNVector4 {
        SCNVector4(CGFloat(x), CGFloat(y), CGFloat(z), CGFloat(w))
    }

    @inline(__always)
    public static func scnVec4(_ v: SIMD4<Float>) -> SCNVector4 {
        SCNVector4(CGFloat(v.x), CGFloat(v.y), CGFloat(v.z), CGFloat(v.w))
    }
    #else
    @inline(__always)
    public static func scnVec3(_ x: Float, _ y: Float, _ z: Float) -> SCNVector3 {
        SCNVector3(x, y, z)
    }

    @inline(__always)
    public static func scnVec3(_ v: SIMD3<Float>) -> SCNVector3 {
        SCNVector3(v.x, v.y, v.z)
    }

    @inline(__always)
    public static func scnVec4(_ x: Float, _ y: Float, _ z: Float, _ w: Float) -> SCNVector4 {
        SCNVector4(x, y, z, w)
    }

    @inline(__always)
    public static func scnVec4(_ v: SIMD4<Float>) -> SCNVector4 {
        SCNVector4(v.x, v.y, v.z, v.w)
    }
    #endif

    @inline(__always)
    public static func scnMat4(
        _ c0: SIMD4<Float>,
        _ c1: SIMD4<Float>,
        _ c2: SIMD4<Float>,
        _ c3: SIMD4<Float>
    ) -> SCNMatrix4 {
        SCNMatrix4(simd_float4x4(c0, c1, c2, c3))
    }
}

// MARK: - Palette-Contrasted Landmark & Biophysical Tints (Port of landmarkContrast.ts)

public struct LandmarkPaletteColors: Equatable, Sendable {
    public var sucroseHex: UInt32
    public var colonyBeaconHex: UInt32
    public var colonyRestoredHex: UInt32
    public var springHex: UInt32
    public var bridgeHex: UInt32
    public var acidPoolHex: UInt32
    public var alleyReticleHex: UInt32
    public var acidWashHex: UInt32
    public var epsDomeHex: UInt32
    public var sulcusHex: UInt32

    public init(
        sucroseHex: UInt32 = 0xD946EF,
        colonyBeaconHex: UInt32 = 0x38BDF8,
        colonyRestoredHex: UInt32 = 0x0D9488,
        springHex: UInt32 = 0x0284C7,
        bridgeHex: UInt32 = 0xF43F5E,
        acidPoolHex: UInt32 = 0xE11D48,
        alleyReticleHex: UInt32 = 0x06B6D4,
        acidWashHex: UInt32 = 0xA21CAF,
        epsDomeHex: UInt32 = 0x4338CA,
        sulcusHex: UInt32 = 0xE11D48
    ) {
        self.sucroseHex = sucroseHex
        self.colonyBeaconHex = colonyBeaconHex
        self.colonyRestoredHex = colonyRestoredHex
        self.springHex = springHex
        self.bridgeHex = bridgeHex
        self.acidPoolHex = acidPoolHex
        self.alleyReticleHex = alleyReticleHex
        self.acidWashHex = acidWashHex
        self.epsDomeHex = epsDomeHex
        self.sulcusHex = sulcusHex
    }

    public static func resolve(for palette: WorldVisualPalette) -> LandmarkPaletteColors {
        let plaqueBgs: [UInt32] = [palette.pellicleSlimeHex, palette.matureBiofilmHex]
        let allBgs: [UInt32] = [palette.pellicleSlimeHex, palette.matureBiofilmHex, palette.enamelBaseHex]

        let sucrose = pickFromCandidates(
            [0xF9A8D4, 0xD946EF, 0x9EE9FF, 0x2F80ED, 0xFFFFFF, 0xFFF1A8],
            backgrounds: plaqueBgs
        )
        let colonyBeacon = pickFromCandidates(
            [0x38BDF8, 0xFEF08A, 0x818CF8, 0x16A34A, 0xF472B6],
            backgrounds: plaqueBgs,
            avoid: [sucrose]
        )
        let colonyRestored = pickFromCandidates(
            [0x0D9488, 0x0284C7, 0x7C3AED, 0xDB2777, 0xD97706],
            backgrounds: allBgs
        )
        let spring = pickFromCandidates(
            [0x0284C7, 0x0891B2, 0x4F46E5, 0x16A34A, 0xD97706],
            backgrounds: allBgs,
            avoid: [colonyRestored]
        )
        let bridge = pickFromCandidates(
            [0xBE123C, 0xF43F5E, 0x22D3EE, 0xFBBF24, 0x16A34A, 0xA855F7, 0xFACC15],
            backgrounds: plaqueBgs,
            avoid: [sucrose]
        )
        let acidPool = pickFromCandidates(
            [0xE11D48, 0x65A30D, 0x7C3AED, 0xD97706, 0x0891B2],
            backgrounds: allBgs,
            avoid: [spring]
        )
        let reticle = pickFromCandidates(
            [0x06B6D4, 0xF59E0B, 0xEC4899, 0x8B5CF6, 0x16A34A],
            backgrounds: allBgs
        )
        let acidWash = pickFromCandidates(
            [0x9D174D, 0xA21CAF, 0xBE123C],
            backgrounds: plaqueBgs
        )
        let epsDome = pickFromCandidates(
            [0x1D4ED8, 0x1E40AF, 0x4338CA, 0x0F766E],
            backgrounds: plaqueBgs,
            avoid: [acidWash]
        )
        let sulcus = pickFromCandidates(
            [0xE11D48, 0xDB2777, 0xD97706, 0x0284C7, 0x7C3AED],
            backgrounds: allBgs
        )

        return LandmarkPaletteColors(
            sucroseHex: sucrose,
            colonyBeaconHex: colonyBeacon,
            colonyRestoredHex: colonyRestored,
            springHex: spring,
            bridgeHex: bridge,
            acidPoolHex: acidPool,
            alleyReticleHex: reticle,
            acidWashHex: acidWash,
            epsDomeHex: epsDome,
            sulcusHex: sulcus
        )
    }

    private static func relativeLuminance(_ hex: UInt32) -> Double {
        let lin = RenderBridge.linearSIMD3(hex: hex)
        return 0.2126 * Double(lin.x) + 0.7152 * Double(lin.y) + 0.0722 * Double(lin.z)
    }

    private static func contrastRatio(_ a: UInt32, _ b: UInt32) -> Double {
        let la = relativeLuminance(a)
        let lb = relativeLuminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    private static func hueDistance(_ a: UInt32, _ b: UInt32) -> Double {
        func hueSat(_ hex: UInt32) -> (h: Double, s: Double) {
            let r = Double((hex >> 16) & 0xFF) / 255.0
            let g = Double((hex >> 8) & 0xFF) / 255.0
            let bl = Double(hex & 0xFF) / 255.0
            let mx = max(r, max(g, bl))
            let mn = min(r, min(g, bl))
            let sat = mx == 0 ? 0 : (mx - mn) / mx
            if mx == mn { return (0, sat) }
            let d = mx - mn
            var h: Double
            if mx == r {
                h = ((g - bl) / d).truncatingRemainder(dividingBy: 6.0)
            } else if mx == g {
                h = (bl - r) / d + 2.0
            } else {
                h = (r - g) / d + 4.0
            }
            h *= 60.0
            if h < 0 { h += 360.0 }
            return (h, sat)
        }
        let hsa = hueSat(a)
        let hsb = hueSat(b)
        if hsa.s < 0.08 || hsb.s < 0.08 { return 0 }
        let diff = abs(hsa.h - hsb.h)
        return min(diff, 360.0 - diff) / 180.0
    }

    private static func pickFromCandidates(
        _ candidates: [UInt32],
        backgrounds: [UInt32],
        avoid: [UInt32] = []
    ) -> UInt32 {
        var best = candidates.first ?? 0xFFFFFF
        var bestScore = -1.0
        for cand in candidates {
            var minBgScore = Double.infinity
            for bg in backgrounds {
                let cr = contrastRatio(cand, bg)
                let hd = hueDistance(cand, bg)
                let isoPenalty = cr < 1.15 ? 0.45 : 1.0
                let s = cr * (0.6 + hd) * isoPenalty
                if s < minBgScore { minBgScore = s }
            }
            for peer in avoid {
                let peerSep = max(hueDistance(cand, peer), (contrastRatio(cand, peer) - 1.0) * 0.35)
                if peerSep < 0.22 { minBgScore *= 0.65 }
            }
            if minBgScore > bestScore {
                bestScore = minBgScore
                best = cand
            }
        }
        return best
    }
}

// MARK: - Zero-Leak <0.1ms Dynamic RGBA Surface Texture Uploader

/// Uploads `OralSurfaceGrid.rgbaBuffer` (`R=biofilmDensity`, `G=fluorapatiteSeal`, `B=contextChannel`,
/// `A=paintableMask`) straight into a reusable unified-memory `MTLTexture` (or `CGImage` fallback)
/// bound to `SCNMaterialProperty` (`surfaceMap`) in ~0.015 ms per dirty frame with zero leaks.
public final class SurfaceTextureUploader {
    public let materialProperty: SCNMaterialProperty
    public private(set) var width: Int
    public private(set) var height: Int

    private let device: MTLDevice?
    private var mtlTexture: MTLTexture?
    private var fallbackBuffer: [UInt8] = []
    private let colorSpace = CGColorSpaceCreateDeviceRGB()

    public init(
        width: Int = 256,
        height: Int = 128,
        device: MTLDevice? = MTLCreateSystemDefaultDevice()
    ) {
        self.width = max(1, width)
        self.height = max(1, height)
        self.device = device
        self.materialProperty = SCNMaterialProperty()
        self.materialProperty.minificationFilter = .linear
        self.materialProperty.magnificationFilter = .linear
        self.materialProperty.mipFilter = .none
        self.materialProperty.wrapS = .clamp
        self.materialProperty.wrapT = .clamp

        reallocateTexture(width: self.width, height: self.height)
    }

    private func reallocateTexture(width: Int, height: Int) {
        self.width = max(1, width)
        self.height = max(1, height)
        let byteCount = self.width * self.height * 4

        var initialBytes = [UInt8](repeating: 0, count: byteCount)
        for i in stride(from: 3, to: byteCount, by: 4) {
            initialBytes[i] = 255
        }

        if let device, device.hasUnifiedMemory {
            let desc = MTLTextureDescriptor.texture2DDescriptor(
                pixelFormat: .rgba8Unorm,
                width: self.width,
                height: self.height,
                mipmapped: false
            )
            desc.usage = [.shaderRead]
            desc.storageMode = .shared
            if let tex = device.makeTexture(descriptor: desc) {
                self.mtlTexture = tex
                initialBytes.withUnsafeBytes { raw in
                    if let base = raw.baseAddress {
                        tex.replace(
                            region: MTLRegionMake2D(0, 0, self.width, self.height),
                            mipmapLevel: 0,
                            withBytes: base,
                            bytesPerRow: self.width * 4
                        )
                    }
                }
                self.materialProperty.contents = tex
                return
            }
        }

        self.mtlTexture = nil
        self.fallbackBuffer = initialBytes
        uploadCGImageFallback()
    }

    public func upload(rgbaBytes: [UInt8], width: Int, height: Int, dirtyRect: SurfaceDirtyRect? = nil) {
        rgbaBytes.withUnsafeBytes { raw in
            guard let ptr = raw.baseAddress else { return }
            if let rect = dirtyRect,
               width == self.width,
               height == self.height,
               let tex = mtlTexture
            {
                let rx = max(0, min(width - 1, rect.x))
                let ry = max(0, min(height - 1, rect.y))
                let rw = max(1, min(width - rx, rect.width))
                let rh = max(1, min(height - ry, rect.height))
                let byteOffset = (ry * width + rx) * 4
                guard byteOffset + ((rh - 1) * width + rw) * 4 <= raw.count else { return }
                tex.replace(
                    region: MTLRegionMake2D(rx, ry, rw, rh),
                    mipmapLevel: 0,
                    withBytes: ptr.advanced(by: byteOffset),
                    bytesPerRow: width * 4
                )
                return
            }
            upload(unsafePointer: ptr, count: raw.count, width: width, height: height)
        }
    }

    public func upload(rgbaData: Data, width: Int, height: Int) {
        rgbaData.withUnsafeBytes { raw in
            guard let ptr = raw.baseAddress else { return }
            upload(unsafePointer: ptr, count: raw.count, width: width, height: height)
        }
    }

    public func upload(unsafePointer: UnsafeRawPointer, count: Int, width: Int, height: Int) {
        let expected = width * height * 4
        guard width > 0, height > 0, count >= expected else { return }

        if width != self.width || height != self.height {
            reallocateTexture(width: width, height: height)
        }

        if let tex = mtlTexture {
            tex.replace(
                region: MTLRegionMake2D(0, 0, width, height),
                mipmapLevel: 0,
                withBytes: unsafePointer,
                bytesPerRow: width * 4
            )
            return
        }

        // Non-unified memory fallback (e.g. older discrete-GPU Intel Mac): zero-leak CGImage swap
        if fallbackBuffer.count != expected {
            fallbackBuffer = [UInt8](repeating: 0, count: expected)
        }
        fallbackBuffer.withUnsafeMutableBytes { dst in
            if let dstBase = dst.baseAddress {
                memcpy(dstBase, unsafePointer, expected)
            }
        }
        uploadCGImageFallback()
    }

    private func uploadCGImageFallback() {
        let w = width
        let h = height
        let data = Data(fallbackBuffer) as CFData
        guard let provider = CGDataProvider(data: data) else { return }
        let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue)
        guard let cgImage = CGImage(
            width: w,
            height: h,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: w * 4,
            space: colorSpace,
            bitmapInfo: bitmapInfo,
            provider: provider,
            decode: nil,
            shouldInterpolate: true,
            intent: .defaultIntent
        ) else { return }
        materialProperty.contents = cgImage
    }
}

// MARK: - Enamel Biophysics Uniform Types

public struct EnamelFrameUniforms: Sendable {
    public var nowSec: Float
    public var motionTimeSec: Float
    public var discloseOrigin: Vec2
    public var discloseRadius: Float
    public var discloseStrength: Float
    public var rinseOrigin: Vec2
    public var rinseRadius: Float
    public var rinseStrength: Float
    public var bufferedRinse: Bool
    public var probePosition: Vec2
    public var probeFoamRadius: Float
    public var probeFoamStrength: Float
    public var acidStress: Float?

    public init(
        nowSec: Float,
        motionTimeSec: Float? = nil,
        discloseOrigin: Vec2 = .zero,
        discloseRadius: Float = 0,
        discloseStrength: Float = 0,
        rinseOrigin: Vec2 = .zero,
        rinseRadius: Float = 0,
        rinseStrength: Float = 0,
        bufferedRinse: Bool = false,
        probePosition: Vec2 = .zero,
        probeFoamRadius: Float = 2.0,
        probeFoamStrength: Float = 0,
        acidStress: Float? = nil
    ) {
        self.nowSec = nowSec
        self.motionTimeSec = motionTimeSec ?? nowSec
        self.discloseOrigin = discloseOrigin
        self.discloseRadius = discloseRadius
        self.discloseStrength = discloseStrength
        self.rinseOrigin = rinseOrigin
        self.rinseRadius = rinseRadius
        self.rinseStrength = rinseStrength
        self.bufferedRinse = bufferedRinse
        self.probePosition = probePosition
        self.probeFoamRadius = probeFoamRadius
        self.probeFoamStrength = probeFoamStrength
        self.acidStress = acidStress
    }
}

public struct FoamTrailSample: Equatable, Sendable {
    public var x: Float
    public var z: Float
    public var birthTime: Float
    public var strength: Float

    public init(x: Float, z: Float, birthTime: Float, strength: Float) {
        self.x = x
        self.z = z
        self.birthTime = birthTime
        self.strength = strength
    }
}

public struct CrownTouchRipple: Equatable, Sendable {
    public var position: SIMD3<Float>
    public var startTime: Float

    public init(position: SIMD3<Float>, startTime: Float) {
        self.position = position
        self.startTime = startTime
    }
}

public struct SugarPlaqueSplat: Equatable, Sendable {
    public var position: SIMD3<Float>
    public var amount: Float

    public init(position: SIMD3<Float>, amount: Float) {
        self.position = position
        self.amount = min(1, max(0, amount))
    }
}

// MARK: - SceneKit Metal Shaders & Material Builders

public enum EnamelShaders {
    // Natural warm-ivory Companion enamel & sugary treat-plaque tones (sRGB hexes)
    public static let companionEnamelHex: UInt32 = 0xECE2CE
    public static let companionPellicleHex: UInt32 = 0xD9C252
    public static let companionBiofilmHex: UInt32 = 0xB3882E

    // MARK: 1. Enamel Biophysics Metal Shader Modifiers

    /// Transfers custom per-vertex biophysics metadata `(ao, encodedQuadrant, heightFrac, crownCode)`
    /// via `vertMeta` while resetting `_geometry.color` to white so SceneKit's default PBR pipeline
    /// never multiplies metadata values into `_surface.diffuse`.
    public static let enamelGeometryModifierMSL: String = #"""
    #pragma varyings
    float4 vertMeta;

    #pragma body
    out.vertMeta = _geometry.color;
    _geometry.color = float4(1.0);
    """#

    public static let enamelSurfaceModifierMSL: String = #"""
    #pragma arguments
    texture2d<float> surfaceMap;
    float4 worldSizeAndTime;
    float4 headlampVec;
    float4 districtSealAges;
    float4x4 paletteMatrixA;
    float4x4 paletteMatrixB;
    float4x4 waveMatrix;
    float4x4 districtBoxesMatrix;
    float4x4 foamMatrixA;
    float4x4 foamAndSplatOverflow;
    float4x4 rippleMatrix;
    float4x4 splatMatrixA;

    #pragma declaration
    float3 enamelSafeUnit(float3 v) {
        return v * rsqrt(max(dot(v, v), 0.000001));
    }

    float enamelHash21(float2 p) {
        p = fract(p * float2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
    }

    float enamelValueNoise(float2 p) {
        float2 i = floor(p);
        float2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = enamelHash21(i);
        float b = enamelHash21(i + float2(1.0, 0.0));
        float c = enamelHash21(i + float2(0.0, 1.0));
        float d = enamelHash21(i + float2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float3 enamelHeadlamp(float3 worldPos, float3 worldNormal, float3 camPos, float4 lamp) {
        float3 targetOrigin = mix(camPos, lamp.xyz, lamp.w);
        float3 toLight = targetOrigin - worldPos;
        float range = mix(22.0, 3.4, lamp.w);
        float falloff = 1.0 / (1.0 + dot(toLight, toLight) / (range * range));
        float facing = clamp(dot(worldNormal, enamelSafeUnit(toLight)), 0.0, 1.0);
        float3 tint = mix(float3(0.18, 0.43, 0.62), float3(1.0, 0.76, 0.50), falloff);
        return tint * falloff * (0.12 + 0.44 * facing);
    }

    float3 enamelAttenuateOral(float3 col, float3 worldPos, float3 camPos, float2 depthCue) {
        float beyond = max(0.0, distance(camPos, worldPos) - depthCue.x);
        float transmission = exp2(-beyond * depthCue.y);
        return mix(float3(0.045, 0.095, 0.145), col, transmission);
    }

    #pragma body
    constexpr sampler surfSampler(coord::normalized, address::clamp_to_edge, filter::linear);

    float3 worldPos = (scn_frame.inverseViewTransform * float4(_surface.position, 1.0)).xyz;
    float3 worldNormal = enamelSafeUnit((scn_frame.inverseViewTransform * float4(_surface.normal, 0.0)).xyz);
    float3 camPos = scn_frame.inverseViewTransform[3].xyz;

    float2 worldSize = max(worldSizeAndTime.xy, float2(0.01, 0.01));
    float nowTime = worldSizeAndTime.z;
    float motionTime = worldSizeAndTime.w;

    float3 enamelBaseColor = paletteMatrixA[0].xyz;
    int bChannelModeIdx = int(floor(paletteMatrixA[0].w + 0.5));
    float3 pellicleBaseColor = paletteMatrixA[1].xyz;
    int detailTier = int(floor(paletteMatrixA[1].w + 0.5));
    float3 biofilmBaseColor = paletteMatrixA[2].xyz;
    float3 sulcusTintColor = paletteMatrixA[3].xyz;

    float3 acidWashTintColor = paletteMatrixB[0].xyz;
    float3 epsDomeTintColor = paletteMatrixB[1].xyz;
    float4 depthCueVec = paletteMatrixB[2];
    float4 companionStateVec = paletteMatrixB[3];

    float4 discloseWave = waveMatrix[0];
    float4 rinseWave = waveMatrix[1];
    float4 probeFoamVec = waveMatrix[2];
    float rinseBufferedFlag = waveMatrix[3].x;

    float globalSmoothnessOverride = depthCueVec.z;
    float globalFluorideGlow = depthCueVec.w;
    float acidStress = companionStateVec.x;
    int activeQuadrant = int(floor(companionStateVec.y + 0.5));
    float highlightedTooth = companionStateVec.z;
    float highlightPulse = companionStateVec.w;

    // Decode per-vertex metadata (fallback cleanly when attached to standard un-colored primitives)
    float4 meta = in.vertMeta;
    bool hasCustomMeta = (meta.w <= 0.95);
    float vertAo = hasCustomMeta ? clamp(meta.x, 0.33, 1.0) : 1.0;
    float quadCode = hasCustomMeta ? meta.y : -1.0;
    float hFrac = hasCustomMeta ? clamp(meta.z, 0.0, 1.0) : clamp((worldPos.y + 0.25) / 1.85, 0.0, 1.0);
    float toothId = (hasCustomMeta && meta.w > 0.025) ? ( floor(meta.w * 20.0 + 0.5) - 1.0 ) : -1.0;

    float2 uv = clamp(worldPos.xz / worldSize, float2(0.001, 0.001), float2(0.999, 0.999));
    float4 surf = surfaceMap.sample(surfSampler, uv);

    float rawPlaque = surf.r;
    float fluorideSeal = max(surf.g, globalFluorideGlow);
    float bVal = surf.b;

    const float4 splats[6] = {
        splatMatrixA[0], splatMatrixA[1], splatMatrixA[2], splatMatrixA[3],
        foamAndSplatOverflow[2], foamAndSplatOverflow[3]
    };
    if (globalSmoothnessOverride >= 0.0) {
        float organicPatch = enamelValueNoise(worldPos.xz * 0.9 + worldPos.y * 0.7 + float2(1.7, 3.1));
        float fuzz = clamp((0.92 - globalSmoothnessOverride) / 0.75, 0.0, 1.0);
        float marginBias = 1.0 - smoothstep(0.0, 0.55, hFrac);
        float coverage = fuzz * (0.30 + 0.70 * marginBias);
        rawPlaque = clamp(coverage * (0.45 + 0.90 * organicPatch), 0.0, 1.0);

        for (int si = 0; si < 6; si++) {
            float4 sp = splats[si];
            if (sp.w <= 0.001) { continue; }
            float d = distance(worldPos, sp.xyz);
            float blob = enamelValueNoise(worldPos.xz * 3.6 + worldPos.y * 2.1 + sp.xz * 1.7);
            float rad = 0.85 + 0.55 * blob;
            float splatMask = sp.w * (1.0 - smoothstep(rad * 0.45, rad, d));
            rawPlaque = max(rawPlaque, splatMask * 0.92);
        }
    }

    // Crisp liquid-to-glassy contour magnification right around CLEAN_THRESHOLD = 0.10
    float cleanEdge = smoothstep(0.085, 0.135, rawPlaque);
    float matureBiofilm = smoothstep(0.52, 0.84, rawPlaque);
    float plaqueMask = cleanEdge * mix(0.68, 0.98, smoothstep(0.18, 0.72, rawPlaque));

    float3 V = enamelSafeUnit(camPos - worldPos);
    float2 plaqueUv = worldPos.xz + float2(0.31, 0.58) * worldPos.y;
    float n1 = 0.5;
    float n2 = 0.5;
    if (plaqueMask > 0.01) {
        n1 = enamelValueNoise(plaqueUv * 3.8);
        if (detailTier > 0) {
            float2 relief = plaqueUv + V.xz * (n1 - 0.5) * matureBiofilm * 0.17;
            n2 = enamelValueNoise(relief * 9.5 + float2(4.2, 1.9));
        }
    }
    float microTex = n1 * 0.65 + n2 * 0.35;

    // Hunter-Schreger & perikymata horizontal micro-ridges on clean enamel + organic bump on plaque
    float cleanFactor = 1.0 - plaqueMask * 0.85;
    float hunterSchreger = sin(worldPos.y * 26.0 + enamelValueNoise(worldPos.xz * 1.6) * 2.1);
    float perikymataWave = 0.5 + 0.5 * sin(worldPos.y * 56.0 + enamelValueNoise(worldPos.xz * 2.3) * 3.2);
    float perikFade = smoothstep(0.10, 0.34, hFrac) * (1.0 - smoothstep(0.88, 1.0, hFrac));

    float3 N = worldNormal;
    float3 ridgeNormalOffset = float3(0.0, cos(worldPos.y * 26.0) * 0.022 * perikFade * cleanFactor, 0.0);
    if (plaqueMask > 0.01) {
        float3 bumpOffset = float3(n1 - 0.5, 0.0, n2 - 0.5) * (0.38 * plaqueMask);
        N = enamelSafeUnit(N + bumpOffset + ridgeNormalOffset);
    } else {
        N = enamelSafeUnit(N + ridgeNormalOffset);
    }
    _surface.normal = enamelSafeUnit((scn_frame.viewTransform * float4(N, 0.0)).xyz);

    float3 L1 = normalize(float3(0.36, 0.86, 0.35));
    float3 L2 = normalize(float3(-0.48, 0.62, -0.62));
    float3 H1 = enamelSafeUnit(L1 + V);
    float3 H2 = enamelSafeUnit(L2 + V);

    float NdotL1 = max(dot(N, L1), 0.0);
    float NdotV = clamp(dot(N, V), 0.0, 1.0);
    float wrapDiff = max(0.0, (dot(N, L1) + 0.45) / 1.45);
    float fillDiff = max(0.0, (dot(N, L2) + 0.35) / 1.35) * 0.42;
    float fresnel = pow(max(1.0 - NdotV, 0.0), 3.0);

    // Translucent warm ivory-pearl enamel + rich cervical dentin subsurface warmth
    float3 cleanEnamel = enamelBaseColor * (0.34 + 0.56 * wrapDiff + fillDiff * 0.72);
    float cervical = 1.0 - smoothstep(0.04, 0.46, hFrac);
    float3 dentinWarm = float3(0.94, 0.62, 0.30);
    cleanEnamel = mix(cleanEnamel, cleanEnamel * dentinWarm, cervical * 0.62);

    // Opalescent incisal/cusp bluish rim translucency & mamelon lobes
    float mamelonWave = 0.5 + 0.5 * sin(worldPos.x * 3.4 + worldPos.z * 0.9);
    float incisalStart = 0.56 + 0.10 * mamelonWave;
    float incisal = smoothstep(incisalStart, 0.96, hFrac);
    float backScatter = pow(clamp(dot(-L1, V) * 0.5 + 0.5, 0.0, 1.0), 2.0);
    float3 opalBlue = cleanEnamel * float3(0.55, 0.72, 0.94)
                    + float3(0.04, 0.11, 0.22) * (0.45 + fresnel * 1.6)
                    + float3(0.10, 0.05, 0.02) * backScatter * 0.45;
    cleanEnamel = mix(cleanEnamel, opalBlue, incisal * (0.58 + 0.32 * fresnel) * cleanFactor);
    cleanEnamel += float3(0.06, 0.14, 0.22) * fresnel * (1.0 - plaqueMask);

    // Hunter-Schreger & perikymata horizontal micro-ridges subtle optical banding
    cleanEnamel *= 1.0 - (0.036 * perikymataWave + 0.022 * (0.5 + 0.5 * hunterSchreger)) * perikFade * cleanFactor;

    // Thin incisal edge bluish-opal translucency + warm cervical neck dentin glow
    float tip = smoothstep(0.76, 0.98, hFrac);
    cleanEnamel = mix(
        cleanEnamel,
        cleanEnamel * float3(0.72, 0.84, 0.98) + float3(0.02, 0.05, 0.11) * (0.4 + fresnel * 1.4),
        tip * 0.34 * cleanFactor
    );
    float neckGlow = 1.0 - smoothstep(0.14, 0.34, hFrac);
    cleanEnamel += float3(0.11, 0.05, 0.01) * neckGlow * (0.35 + 0.55 * backScatter) * cleanFactor;

    // Fluorapatite crystalline iridescent mint-cyan sheen (G channel)
    float3 emissionGlow = float3(0.0);
    if (fluorideSeal > 0.05) {
        float hexShimmer = 0.5 + 0.5 * sin(worldPos.x * 5.2 + worldPos.z * 5.2 + motionTime * 2.1);
        float3 faGlow = float3(0.08, 0.42, 0.38) * fluorideSeal * (0.40 + 0.65 * fresnel) * (0.72 + 0.28 * hexShimmer);
        cleanEnamel += faGlow * 0.65;
        emissionGlow += faGlow * 0.45;
    }

    // Chalky matte pellicle & mature biofilm albedo
    float3 slimeAlbedo = mix(pellicleBaseColor, biofilmBaseColor * 0.84, matureBiofilm);
    slimeAlbedo *= (0.78 + 0.34 * microTex);
    float3 plaqueLit = slimeAlbedo * (0.36 + 0.60 * NdotL1 + 0.20 * fillDiff);
    if (detailTier > 0) {
        float3 bioSheen = mix(float3(0.12, 0.24, 0.28), float3(0.33, 0.16, 0.26), n2);
        plaqueLit += bioSheen * (0.16 + 0.72 * fresnel) * matureBiofilm;
    }

    float3 baseColor = mix(cleanEnamel, plaqueLit, plaqueMask);
    baseColor *= 1.0 + enamelHeadlamp(worldPos, N, camPos, headlampVec);

    // 4 B-Channel biophysical context tints
    if (bChannelModeIdx == 0 && bVal > 0.10 && plaqueMask > 0.20) {
        // 0 = marginDensity warm amber collar
        baseColor = mix(baseColor, float3(0.86, 0.68, 0.20), bVal * 0.24 * plaqueMask);
    } else if (bChannelModeIdx == 1 && bVal > 0.02) {
        // 1 = gumIrritation rose-coral sulcus band & tender blush
        float sulcusBand = smoothstep(0.03, 0.14, bVal);
        float sulcusEdge = smoothstep(0.035, 0.085, bVal) * (1.0 - smoothstep(0.085, 0.145, bVal));
        float inflamed = smoothstep(0.18, 0.65, bVal);
        float dash = 0.62 + 0.38 * step(0.0, sin(worldPos.x * 5.2));
        float tenderPulse = 1.0 + inflamed * 0.32 * sin(motionTime * 7.5);
        float3 sulcusCol = mix(sulcusTintColor, float3(1.0, 0.22, 0.34), inflamed * 0.70);
        baseColor = mix(baseColor, sulcusCol, clamp((sulcusBand * 0.36 + inflamed * 0.34) * tenderPulse, 0.0, 0.78));
        baseColor = mix(baseColor, mix(sulcusCol, float3(1.0, 0.90, 0.94), 0.42), sulcusEdge * dash * 0.72);
        emissionGlow += sulcusCol * inflamed * 0.14 * tenderPulse;
    } else if (bChannelModeIdx == 2 && bVal > 0.36) {
        // 2 = localPh acid violet-amber demineralization warning wave (repelled by Fluorapatite!)
        float pulse = 0.84 + 0.16 * sin(motionTime * 4.6);
        float unsealedAcid = bVal * (1.0 - fluorideSeal * 0.88);
        float acidCore = smoothstep(0.38, 0.64, unsealedAcid);
        float acidRim = smoothstep(0.36, 0.50, unsealedAcid) * (1.0 - smoothstep(0.52, 0.69, unsealedAcid));
        float wave = 0.5 + 0.5 * sin(worldPos.x * 3.4 + cos(worldPos.z * 3.1) * 1.8 - motionTime * 4.2);
        float3 acidCol = mix(acidWashTintColor * 0.88, acidWashTintColor * 1.25 + float3(0.32, 0.18, 0.06), wave);
        baseColor = mix(baseColor, acidCol, clamp(acidCore * (0.76 + 0.12 * wave) * pulse, 0.0, 0.88));
        baseColor = mix(baseColor, mix(acidWashTintColor, float3(1.0, 0.82, 0.96), 0.62), acidRim * 0.92);
        emissionGlow += float3(0.12, 0.62, 0.56) * (bVal * fluorideSeal * 0.38 * pulse) + acidCol * acidCore * 0.16;
    } else if (bChannelModeIdx == 3 && bVal > 0.04) {
        // 3 = epsArmor iridescent hexagonal polysaccharide quorum shield + Floss fracture rim
        float hexA = abs(sin(worldPos.x * 4.8) * cos(worldPos.z * 4.8));
        float qHex = smoothstep(0.12, 0.55, hexA);
        float domeCore = smoothstep(0.32, 0.90, bVal);
        float fractureRim = smoothstep(0.05, 0.42, bVal) * (1.0 - smoothstep(0.48, 0.88, bVal));
        float3 iridShift = 0.5 + 0.5 * cos(6.28318 * (fresnel * 1.3 + float3(0.0, 0.33, 0.67)) + motionTime * 0.8);
        float3 epsCell = mix(epsDomeTintColor * 0.72, epsDomeTintColor * 1.18 + iridShift * 0.28, qHex);
        baseColor = mix(baseColor, epsCell, domeCore * 0.74);
        float domeSpec = pow(max(dot(N, H1), 0.0), 46.0) * 0.62 * domeCore;
        emissionGlow += float3(0.76, 0.86, 1.0) * (fractureRim * 0.75 + domeSpec + fresnel * domeCore * 0.30);
    }

    if (acidStress > 0.01) {
        float stressPulse = 0.55 + 0.45 * sin(motionTime * 4.2 + worldPos.x * 0.4);
        baseColor = mix(baseColor, float3(0.94, 0.36, 0.24), acidStress * 0.36 * stressPulse);
    }

    // Wet saliva dual-specular sheen & meniscus glints (tight & crisp without milky bloom washout)
    float cleanSpec1 = pow(max(dot(N, H1), 0.0), 110.0) * 0.75;
    float cleanSpec2 = (detailTier > 0) ? (pow(max(dot(N, H2), 0.0), 42.0) * 0.22) : 0.0;
    float dullSpec = pow(max(dot(N, H1), 0.0), 9.0) * 0.08;
    float specBoost = mix(cleanSpec1 + cleanSpec2, dullSpec, plaqueMask);
    emissionGlow += float3(0.92, 0.98, 1.0) * specBoost * 0.24;

    // Saliva meniscus pooled along gingival collar + liquid contour rim at 0.10 plaque boundary
    float collarMeniscus = (1.0 - smoothstep(0.04, 0.18, hFrac)) * (1.0 - plaqueMask);
    emissionGlow += float3(0.80, 0.95, 1.0) * collarMeniscus * (0.02 + 0.26 * pow(max(dot(N, H1), 0.0), 32.0));

    float contourEdge = smoothstep(0.07, 0.105, rawPlaque) * (1.0 - smoothstep(0.115, 0.16, rawPlaque));
    emissionGlow += float3(0.55, 0.96, 0.92) * contourEdge * 0.38;

    // Enamel prism micro-sparkle on mirror-clean Smooth Bask enamel (smoothness >= 85%)
    float shimmerGate = ((globalSmoothnessOverride >= 0.0) ? smoothstep(0.84, 0.90, globalSmoothnessOverride) : 1.0) * (1.0 - plaqueMask);
    if (detailTier > 1 && shimmerGate > 0.01) {
        float perik = 0.5 + 0.5 * sin(dot(worldPos, float3(0.35, 1.0, 0.22)) * 44.0 + enamelValueNoise(worldPos.xz * 1.8) * 4.0);
        float prism = enamelValueNoise(worldPos.xz * 31.0 + worldPos.y * 17.0);
        float glint = pow(max(dot(N, H1), 0.0), 20.0) + pow(max(dot(N, H2), 0.0), 26.0) * 0.5;
        float sparkle = smoothstep(0.84, 0.97, prism) * (0.55 + 0.45 * sin(motionTime * 3.2 + prism * 23.0));
        emissionGlow += float3(0.78, 0.93, 1.0) * shimmerGate * (perik * glint * 0.14 + sparkle * (0.10 + glint * 0.75));
    }

    // Active Sonic Foam sparkling cyan-white bubble ring around probe + recent scrub foam trail
    float foamAmount = 0.0;
    if (probeFoamVec.w > 0.001) {
        float dp = distance(worldPos.xz, probeFoamVec.xy);
        float rad = max(0.6, probeFoamVec.z);
        float outerRing = smoothstep(rad * 0.35, rad * 0.85, dp) * (1.0 - smoothstep(rad * 0.85, rad * 1.18, dp));
        float innerCore = 1.0 - smoothstep(0.25, rad * 1.05, dp);
        foamAmount = max(foamAmount, clamp(innerCore * 0.65 + outerRing * 0.75, 0.0, 1.0) * probeFoamVec.w);
    }
    const float4 foams[6] = {
        foamMatrixA[0], foamMatrixA[1], foamMatrixA[2], foamMatrixA[3],
        foamAndSplatOverflow[0], foamAndSplatOverflow[1]
    };
    for (int fi = 0; fi < 6; fi++) {
        float4 fm = foams[fi];
        if (fm.w <= 0.0) { continue; }
        float age = nowTime - fm.z;
        if (age < 0.0 || age > 2.4) { continue; }
        float df = distance(worldPos.xz, fm.xy);
        float fall = 1.0 - smoothstep(0.5, 2.1, df);
        foamAmount = max(foamAmount, fall * (1.0 - age / 2.4) * fm.w);
    }
    if (foamAmount > 0.01) {
        float2 fq = worldPos.xz * 5.5 + float2(motionTime * 0.35, -motionTime * 0.22);
        float b1 = enamelValueNoise(fq);
        float b2 = enamelValueNoise(fq * 2.4 + 4.1);
        float bub = b1 * 0.62 + b2 * 0.50;
        float bubbles = smoothstep(0.50, 0.78, bub);
        float rimRing = smoothstep(0.62, 0.70, bub) * (1.0 - smoothstep(0.70, 0.78, bub));
        float boundary = 0.45 + 1.4 * contourEdge + 0.5 * (1.0 - plaqueMask);
        baseColor = mix(baseColor, float3(0.93, 1.0, 1.0), clamp(foamAmount * bubbles * 0.50 * boundary, 0.0, 0.85));
        emissionGlow += float3(0.40, 0.95, 1.0) * foamAmount * (rimRing * 0.55 + bubbles * 0.12);
    }

    // Companion Crown Touch Specular Ripples
    const float4 ripples[4] = {
        rippleMatrix[0], rippleMatrix[1], rippleMatrix[2], rippleMatrix[3]
    };
    for (int ri = 0; ri < 4; ri++) {
        float4 rp = ripples[ri];
        float age = nowTime - rp.w;
        if (rp.w <= 0.0 || age < 0.0 || age > 1.3) { continue; }
        float dr = distance(worldPos, rp.xyz);
        float radius = age * 4.6;
        float ring = 1.0 - smoothstep(0.0, 0.32, abs(dr - radius));
        float flash = (1.0 - smoothstep(0.0, 0.70, dr)) * (1.0 - smoothstep(0.0, 0.25, age));
        float fade = 1.0 - age / 1.3;
        float smoothGain = 0.35 + 0.65 * (1.0 - plaqueMask);
        emissionGlow += float3(0.72, 1.0, 0.96) * (ring * fade * (0.28 + cleanSpec1 * 1.1) + flash * 0.60) * smoothGain;
    }

    // Recessed gingival & interproximal ambient occlusion + oral depth light attenuation
    float recess = 1.0 - smoothstep(0.08, 0.56, hFrac);
    float side = 1.0 - smoothstep(0.05, 0.78, N.y);
    float ao = pow(vertAo, 1.45) * (1.0 - 0.36 * recess * side);
    baseColor = enamelAttenuateOral(baseColor * ao, worldPos, camPos, depthCueVec.xy);

    // Disclosing Dye Scan expanding ring (#ff2ea8 vivid magenta glow on R > 0.10 plaque + violet thick biofilm)
    if (discloseWave.w > 0.001) {
        float distD = distance(worldPos.xz, discloseWave.xy);
        float dRad = discloseWave.z;
        float dStr = discloseWave.w;
        float waveMask = 1.0 - smoothstep(dRad - 1.5, dRad + 0.5, distD);
        float ringLine = smoothstep(dRad - 0.9, dRad - 0.2, distD) * (1.0 - smoothstep(dRad - 0.2, dRad + 0.5, distD));

        float3 vividMagenta = float3(1.0, 0.18, 0.66); // #ff2ea8
        float3 thickViolet = float3(0.56, 0.14, 0.96);
        float violetBlend = smoothstep(0.54, 0.80, rawPlaque);
        float3 dyeColor = mix(vividMagenta, thickViolet, violetBlend);
        float dyeAmount = smoothstep(0.10, 0.22, rawPlaque) * waveMask * dStr;
        float dyeAlpha = mix(0.62, 0.84, violetBlend);

        baseColor = mix(baseColor, dyeColor * (0.72 + 0.34 * NdotL1), dyeAmount * dyeAlpha);
        emissionGlow += vividMagenta * (dyeAmount * 0.28 + ringLine * dStr * 0.72);
    }

    // Fluoride-Bicarb Ion Rinse expanding turquoise wave
    if (rinseWave.w > 0.001) {
        float distR = distance(worldPos.xz, rinseWave.xy);
        float rRad = rinseWave.z;
        float rStr = rinseWave.w;
        float rinseBand = smoothstep(rRad - 1.8, rRad - 0.3, distR) * (1.0 - smoothstep(rRad - 0.3, rRad + 0.4, distR));
        emissionGlow += float3(0.18, 0.96, 0.86) * rinseBand * rStr * 0.85;
        if (rinseBufferedFlag > 0.5) {
            float echoRadius = rRad - 2.4;
            float echo = 1.0 - smoothstep(0.14, 0.56, abs(distR - echoRadius));
            emissionGlow += float3(0.68, 0.93, 1.0) * echo * smoothstep(0.0, 1.1, echoRadius) * rStr;
        }
    }

    // 24k Gold District Seal border frames (up to 4 sealed district bounds)
    float goldMetalBoost = 0.0;
    const float4 dBoxes[4] = {
        districtBoxesMatrix[0], districtBoxesMatrix[1], districtBoxesMatrix[2], districtBoxesMatrix[3]
    };
    const float dAges[4] = { districtSealAges.x, districtSealAges.y, districtSealAges.z, districtSealAges.w };
    for (int di = 0; di < 4; di++) {
        float age = dAges[di];
        if (age < 0.0) { continue; }
        float4 bx = dBoxes[di];
        float2 q = worldPos.xz;
        if (q.x < bx.x - 0.4 || q.x > bx.z + 0.4 || q.y < bx.y - 0.4 || q.y > bx.w + 0.4) { continue; }

        float2 center = 0.5 * (bx.xy + bx.zw);
        float2 halfSpan = max(float2(1.5, 1.5), 0.5 * (bx.zw - bx.xy) - float2(1.55, 1.55));
        float cornerR = min(2.1, min(halfSpan.x, halfSpan.y) * 0.45);
        float2 dVec = abs(q - center) - (halfSpan - float2(cornerR, cornerR));
        float sd = length(max(dVec, float2(0.0))) + min(max(dVec.x, dVec.y), 0.0) - cornerR;
        float bevel = 1.0 - smoothstep(0.18, 0.64, abs(sd));
        float core = 1.0 - smoothstep(0.0, 0.30, abs(sd));
        float goldGlint = 0.90 + 0.10 * sin(q.x * 1.5 + q.y * 1.5 + motionTime * 2.4);

        baseColor = mix(baseColor, baseColor * float3(0.94, 1.04, 1.04), 0.40);
        baseColor = mix(baseColor, float3(0.58, 0.36, 0.04), bevel * 0.62);
        baseColor = mix(baseColor, float3(1.0, 0.80, 0.14) * goldGlint, core * 0.92);
        emissionGlow += float3(1.0, 0.82, 0.22) * core * 0.35 * goldGlint;
        goldMetalBoost = max(goldMetalBoost, core * 0.82 + bevel * 0.35);

        float sweepX = mix(bx.x, bx.z, clamp(age / 1.3, 0.0, 1.0));
        float sweep = (1.0 - smoothstep(0.0, 2.3, abs(q.x - sweepX))) * (1.0 - step(1.5, age));
        emissionGlow += float3(0.78, 1.0, 0.93) * sweep * 0.68;
    }

    // 2-Minute Sink Brush-Along Quadrant Coaching Highlight
    if (activeQuadrant >= 0 && quadCode > 0.01) {
        int vertQuad = int(floor(quadCode * 4.0 + 0.01));
        if (vertQuad == activeQuadrant) {
            float coachPulse = 0.55 + 0.45 * sin(motionTime * 5.0);
            emissionGlow += float3(0.10, 0.68, 0.75) * (0.18 + 0.18 * coachPulse);
        } else {
            baseColor *= 0.76;
        }
    }

    // Tapped / inspected Companion crown: pearlescent mint-gold rim highlight
    if (highlightedTooth > -0.5 && toothId > -0.5 && abs(toothId - highlightedTooth) < 0.5) {
        float rim = pow(max(1.0 - NdotV, 0.0), 1.65);
        float3 mint = float3(0.12, 0.84, 0.56);
        float3 gold = float3(1.0, 0.81, 0.29);
        float3 selected = mix(mint, gold, smoothstep(0.07, 0.68, rim));
        baseColor = mix(baseColor, selected, highlightPulse * (0.45 + 0.32 * rim));
        emissionGlow += selected * highlightPulse * (0.20 + 0.28 * rim);
    }

    // Dynamic PBR roughness: 0.06 mirror-glass when clean/sealed -> 0.85 chalky matte plaque when dirty!
    float cleanGlassRoughness = mix(0.06, 0.04, clamp(fluorideSeal, 0.0, 1.0));
    float dynamicRoughness = mix(cleanGlassRoughness, 0.85, clamp(plaqueMask, 0.0, 1.0));
    dynamicRoughness = mix(dynamicRoughness, 0.14, goldMetalBoost);

    // Self-contained biophysical BRDF + filmic highlight rolloff + sRGB->linear Metal encode (zero double-lighting!)
    float3 totalSrgb = baseColor + emissionGlow * 0.62;
    float3 filmic = totalSrgb / (1.0 + totalSrgb * 0.34);
    float3 finalLinear = pow(clamp(filmic, float3(0.0), float3(1.2)), float3(2.15));

    _surface.diffuse = float4(0.0, 0.0, 0.0, 1.0);
    _surface.emission = float4(finalLinear, 1.0);
    """#

    // MARK: 2. Wet Stippled Gingiva Metal Shader Modifiers

    public static let gingivaGeometryModifierMSL: String = #"""
    #pragma varyings
    float4 gingivaMeta;

    #pragma body
    out.gingivaMeta = _geometry.color;
    _geometry.color = float4(1.0);
    """#

    public static let gingivaSurfaceModifierMSL: String = #"""
    #pragma arguments
    float3 gingivaBaseColor;
    float4 gingivaTimeAndBreath;
    float4 headlampVec;
    float4 depthCueVec;
    int detailTier;

    #pragma declaration
    float3 gingivaSafeUnit(float3 v) {
        return v * rsqrt(max(dot(v, v), 0.000001));
    }

    float gingivaHash3(float3 p) {
        p = fract(p * float3(127.1, 311.7, 74.7));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
    }

    float gingivaNoise3(float3 p) {
        float3 i = floor(p);
        float3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n000 = gingivaHash3(i);
        float n100 = gingivaHash3(i + float3(1.0, 0.0, 0.0));
        float n010 = gingivaHash3(i + float3(0.0, 1.0, 0.0));
        float n110 = gingivaHash3(i + float3(1.0, 1.0, 0.0));
        float n001 = gingivaHash3(i + float3(0.0, 0.0, 1.0));
        float n101 = gingivaHash3(i + float3(1.0, 0.0, 1.0));
        float n011 = gingivaHash3(i + float3(0.0, 1.0, 1.0));
        float n111 = gingivaHash3(i + float3(1.0, 1.0, 1.0));
        return mix(
            mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
            mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
            f.z
        );
    }

    #pragma body
    float3 worldPos = (scn_frame.inverseViewTransform * float4(_surface.position, 1.0)).xyz;
    float3 worldNormal = gingivaSafeUnit((scn_frame.inverseViewTransform * float4(_surface.normal, 0.0)).xyz);
    float3 camPos = scn_frame.inverseViewTransform[3].xyz;

    float motionTime = gingivaTimeAndBreath.x;
    float breathStrength = gingivaTimeAndBreath.y;

    float4 meta = in.gingivaMeta;
    bool hasMeta = (meta.w <= 0.95);
    float ao = hasMeta ? clamp(meta.x, 0.35, 1.0) : 0.92;
    float marginal = hasMeta ? clamp(meta.y, 0.0, 1.0) : smoothstep(0.05, 0.65, worldPos.y);
    float attached = 1.0 - marginal;

    // Orange-peel micro-stipple on attached gingiva; mirror-glossy along marginal papillae
    float3 sp = worldPos * 9.5;
    float s1 = gingivaNoise3(sp);
    float s2 = (detailTier > 0) ? gingivaNoise3(sp * 2.3 + 7.1) : 0.5;
    float s3 = (detailTier > 1) ? gingivaNoise3(sp + 3.3) : s1;
    float stipple = s1 * 0.65 + s2 * 0.35;

    float3 N = gingivaSafeUnit(worldNormal + (float3(s1, s2, s3) - 0.5) * (0.26 * attached + 0.06));
    _surface.normal = gingivaSafeUnit((scn_frame.viewTransform * float4(N, 0.0)).xyz);

    float3 V = gingivaSafeUnit(camPos - worldPos);
    float3 L = normalize(float3(0.35, 0.88, 0.35));
    float3 L2 = normalize(float3(-0.50, 0.55, -0.60));
    float3 H = gingivaSafeUnit(L + V);

    float wrap = max(0.0, (dot(N, L) + 0.55) / 1.55);
    float fill = max(0.0, (dot(N, L2) + 0.40) / 1.40) * 0.30;

    // Subtle living capillary breathing warmth
    float breathWave = 0.5 + 0.5 * sin(motionTime * 1.45);
    float3 breathTint = mix(float3(1.0), float3(1.05, 0.97, 0.98), breathStrength * breathWave);

    float3 albedo = mix(
        gingivaBaseColor * float3(1.03, 0.94, 0.96),
        gingivaBaseColor * float3(1.08, 1.02, 1.00),
        attached * 0.60
    ) * breathTint;
    albedo *= 0.90 + 0.18 * stipple;

    float3 col = albedo * (0.36 + 0.62 * wrap + fill) * pow(ao, 1.35);

    // Warm vascular capillary scattering through interdental papillae
    float NdotV = clamp(dot(N, V), 0.0, 1.0);
    float back = pow(1.0 - NdotV, 2.2);
    float3 sssGlow = float3(0.32, 0.05, 0.08) * back * (0.12 + 0.18 * marginal);

    // Pooled saliva meniscus line & crisp pinpoint stipple highlights
    float meniscus = smoothstep(0.58, 1.0, marginal) * (1.0 - smoothstep(0.0, 1.0, attached));
    float3 specGlow = float3(0.92, 0.97, 1.0) * meniscus * (0.03 + 0.28 * pow(max(dot(N, H), 0.0), 26.0));

    float broadSpec = pow(max(dot(N, H), 0.0), 32.0) * 0.12;
    float sharpGlint = (detailTier > 0) ? pow(max(dot(N, H), 0.0), 140.0) : 0.0;
    float sparkle = smoothstep(0.66, 0.92, s2) * (0.60 + 0.40 * sin(motionTime * 2.3 + s1 * 18.0));
    specGlow += float3(1.0, 0.88, 0.90) * (broadSpec + sharpGlint * (0.35 + 0.95 * sparkle));

    float sulcusShadow = smoothstep(0.28, 0.72, marginal) * (1.0 - smoothstep(0.64, 0.96, marginal));
    col *= (1.0 - 0.42 * sulcusShadow);

    // Headlamp & oral depth attenuation
    float3 toLight = mix(camPos, headlampVec.xyz, headlampVec.w) - worldPos;
    float range = mix(22.0, 3.4, headlampVec.w);
    float falloff = 1.0 / (1.0 + dot(toLight, toLight) / (range * range));
    float facing = clamp(dot(N, gingivaSafeUnit(toLight)), 0.0, 1.0);
    col *= 1.0 + mix(float3(0.14, 0.34, 0.50), float3(0.85, 0.60, 0.38), falloff) * falloff * (0.08 + 0.32 * facing);

    float beyond = max(0.0, distance(camPos, worldPos) - depthCueVec.x);
    float transmission = exp2(-beyond * depthCueVec.y);
    col = mix(float3(0.025, 0.055, 0.095), col, transmission);

    float3 totalGumSrgb = col + sssGlow * 0.42 + specGlow * 0.36;
    float3 gumFilmic = totalGumSrgb / (1.0 + totalGumSrgb * 0.36);
    float3 gumLinear = pow(clamp(gumFilmic, float3(0.0), float3(1.1)), float3(2.15));

    _surface.diffuse = float4(0.0, 0.0, 0.0, 1.0);
    _surface.emission = float4(gumLinear, 1.0);
    """#

    // MARK: 3. Procedural 3D Orbital Earth & Rayleigh Atmosphere Shaders

    public static let earthSurfaceModifierMSL: String = #"""
    #pragma arguments
    float4 earthTimeAndSun;

    #pragma declaration
    float earthHash3(float3 p) {
        p = fract(p * float3(443.897, 441.423, 437.195));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
    }

    float earthNoise3(float3 p) {
        float3 i = floor(p);
        float3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n000 = earthHash3(i);
        float n100 = earthHash3(i + float3(1.0, 0.0, 0.0));
        float n010 = earthHash3(i + float3(0.0, 1.0, 0.0));
        float n110 = earthHash3(i + float3(1.0, 1.0, 0.0));
        float n001 = earthHash3(i + float3(0.0, 0.0, 1.0));
        float n101 = earthHash3(i + float3(1.0, 0.0, 1.0));
        float n011 = earthHash3(i + float3(0.0, 1.0, 1.0));
        float n111 = earthHash3(i + float3(1.0, 1.0, 1.0));
        float4 nx0 = mix(float4(n000, n010, n001, n011), float4(n100, n110, n101, n111), f.x);
        float2 nxy = mix(nx0.xz, nx0.yw, f.y);
        return mix(nxy.x, nxy.y, f.z);
    }

    float earthFbm(float3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
            v += a * earthNoise3(p);
            p *= 2.05;
            a *= 0.5;
        }
        return v;
    }

    #pragma body
    float3 worldPos = (scn_frame.inverseViewTransform * float4(_surface.position, 1.0)).xyz;
    float3 worldNormal = normalize((scn_frame.inverseViewTransform * float4(_surface.normal, 0.0)).xyz);
    float3 localNormal = normalize((scn_node.inverseModelTransform * float4(worldNormal, 0.0)).xyz);
    float3 camPos = scn_frame.inverseViewTransform[3].xyz;

    float t = earthTimeAndSun.x;
    float3 sunDir = normalize(float3(0.55, 0.42, 0.72));

    float lat = abs(localNormal.y);
    float cont = earthFbm(localNormal * 2.65 + float3(1.2, -0.4, 0.8));
    float detail = earthNoise3(localNormal * 8.5);
    float landMask = smoothstep(0.49, 0.54, cont + detail * 0.08 - lat * 0.05);

    // Bathymetry: deep abyssal ocean -> shallow turquoise continental shelves
    float3 deepOcean = float3(0.03, 0.16, 0.36);
    float3 shallowSea = float3(0.06, 0.38, 0.56);
    float3 ocean = mix(deepOcean, shallowSea, smoothstep(0.36, 0.50, cont));

    // Continents: lush emerald biomes -> golden-ochre highlands & deserts
    float3 lushLand = float3(0.14, 0.46, 0.28);
    float3 aridLand = float3(0.62, 0.52, 0.34);
    float3 land = mix(lushLand, aridLand, smoothstep(0.55, 0.78, cont + detail * 0.15));

    float3 albedo = mix(ocean, land, landMask);

    // Polar ice caps (cool slate-blue ice rather than blinding white)
    float ice = smoothstep(0.80, 0.92, lat + detail * 0.05);
    albedo = mix(albedo, float3(0.58, 0.72, 0.86), ice * 0.75);

    // Swirling orbital cloud wisps
    float clouds = smoothstep(0.56, 0.78, earthFbm(localNormal * 3.8 + float3(t * 0.015, 0.0, -t * 0.01)));
    albedo = mix(albedo, float3(0.76, 0.86, 0.96), clouds * 0.38);

    float3 V = normalize(camPos - worldPos);
    float NdotL = dot(worldNormal, sunDir);
    float dayTerm = smoothstep(-0.18, 0.25, NdotL);

    float3 lit = albedo * (0.14 + 0.92 * max(NdotL, 0.0));

    // Golden night-side city lights twinkling under clear skies
    float metro = smoothstep(0.52, 0.80, earthFbm(localNormal * 6.5 + 3.7));
    float dots = smoothstep(0.78, 0.93, earthNoise3(localNormal * 38.0));
    float twinkle = 0.78 + 0.22 * sin(t * 2.6 + earthNoise3(localNormal * 55.0) * 40.0);
    float nightGlow = (1.0 - dayTerm) * landMask * (metro * 0.45 + dots * metro * 1.15) * (1.0 - clouds * 0.70);
    lit += float3(1.0, 0.78, 0.40) * nightGlow * 0.65 * twinkle;

    // Specular sun glint on sunlit ocean water
    float3 H = normalize(sunDir + V);
    float oceanSpec = pow(max(dot(worldNormal, H), 0.0), 42.0) * (1.0 - landMask) * (1.0 - clouds);
    lit += float3(0.65, 0.88, 1.0) * oceanSpec * 0.48 * dayTerm;

    // Cyan-blue Rayleigh limb glow + golden-orange sunset terminator
    float NdotV = max(dot(worldNormal, V), 0.0);
    float rim = pow(1.0 - NdotV, 2.8);
    lit += float3(0.22, 0.68, 1.0) * rim * 0.82;
    float limbLine = pow(1.0 - NdotV, 7.0);
    lit += float3(0.55, 0.88, 1.0) * limbLine * 0.55 * (0.35 + 0.65 * dayTerm);
    float terminator = smoothstep(-0.20, 0.0, NdotL) * (1.0 - smoothstep(0.0, 0.30, NdotL));
    lit += float3(1.0, 0.52, 0.28) * terminator * rim * 0.45;

    // Calm atmospheric orbital exposure so Earth sits richly in deep space without overpowering foreground enamel
    float3 calmEarth = (lit * 0.56) / (1.0 + lit * 0.42);
    float3 linearLit = pow(max(calmEarth, float3(0.0)), float3(2.15));
    _surface.diffuse = float4(0.0, 0.0, 0.0, 1.0);
    _surface.emission = float4(linearLit, 1.0);
    """#

    public static let atmosphereFragmentModifierMSL: String = #"""
    #pragma transparent
    #pragma body
    float3 worldNormal = normalize((scn_frame.inverseViewTransform * float4(_surface.normal, 0.0)).xyz);
    float3 worldPos = (scn_frame.inverseViewTransform * float4(_surface.position, 1.0)).xyz;
    float3 camPos = scn_frame.inverseViewTransform[3].xyz;
    float3 V = normalize(camPos - worldPos);
    float3 sunDir = normalize(float3(0.55, 0.42, 0.72));

    float NdotV = clamp(abs(dot(worldNormal, V)), 0.0, 1.0);
    float NdotL = dot(worldNormal, sunDir);
    float dayWeight = smoothstep(-0.35, 0.35, NdotL) * 0.72 + 0.28;

    // Soft outer Rayleigh scattering crown: strongest near limb silhouette, fading smoothly to vacuum
    float limbBand = pow(1.0 - NdotV, 2.6) * smoothstep(0.0, 0.42, NdotV);
    float sunset = smoothstep(-0.22, 0.05, NdotL) * (1.0 - smoothstep(0.05, 0.38, NdotL));
    float3 rayleighColor = mix(float3(0.18, 0.72, 1.0), float3(0.52, 0.92, 1.0), limbBand);
    rayleighColor = mix(rayleighColor, float3(1.0, 0.58, 0.34), sunset * 0.32);

    float alpha = clamp(limbBand * dayWeight * 0.52, 0.0, 0.55);
    float3 linRayleigh = pow(max(rayleighColor, float3(0.0)), float3(2.15));
    _output.color = float4(linRayleigh * alpha, alpha);
    """#

    // MARK: - Material Factory Functions

    public static func makeEnamelMaterial(
        surfaceUploader: SurfaceTextureUploader,
        worldWidth: Double = 64.0,
        worldDepth: Double = 32.0,
        palette: WorldVisualPalette = WorldVisualPalette(
            enamelBaseHex: 0xF4FBFF,
            pellicleSlimeHex: 0xD9E35B,
            matureBiofilmHex: 0x9FB82C,
            gingivaHex: 0xD96B7E,
            skyTopHex: 0x071320,
            skyHorizonHex: 0x0F2940
        ),
        bChannelMode: BChannelMode = .marginDensity,
        qualityTier: QualityTier = .medium
    ) -> SCNMaterial {
        let mat = SCNMaterial()
        mat.name = "EnamelBiophysicsMaterial"
        // Use .constant so our custom biophysical BRDF in enamelSurfaceModifierMSL is never double-lit by SceneKit's auto skybox IBL
        mat.lightingModel = .constant
        mat.diffuse.contents = PlatformColor.black
        mat.isDoubleSided = false

        mat.shaderModifiers = [
            .geometry: enamelGeometryModifierMSL,
            .surface: enamelSurfaceModifierMSL
        ]

        mat.setValue(surfaceUploader.materialProperty, forKey: "surfaceMap")

        let detail: Float = {
            switch qualityTier {
            case .low: return 0
            case .medium: return 1
            case .ultra: return 2
            }
        }()
        configureEnamelPalette(
            material: mat,
            worldWidth: worldWidth,
            worldDepth: worldDepth,
            palette: palette,
            bChannelMode: bChannelMode,
            detailTier: detail,
            depthCue: SIMD4<Float>(18.0, 0.085, -1.0, 0.0),
            companionState: SIMD4<Float>(0.0, -1.0, -1.0, 0.0)
        )

        // Initialize packed constant buffers cleanly under Metal's 31-buffer limit
        let zero4 = SIMD4<Float>(0, 0, 0, 0)
        let offFoam = SIMD4<Float>(0, 0, -99, 0)
        let offRipple = SIMD4<Float>(0, 0, 0, -99)

        mat.setValue(NSValue(scnVector4: RenderBridge.scnVec4(zero4)), forKey: "headlampVec")
        mat.setValue(NSValue(scnVector4: RenderBridge.scnVec4(-1, -1, -1, -1)), forKey: "districtSealAges")
        mat.setValue(NSValue(scnMatrix4: RenderBridge.scnMat4(zero4, zero4, zero4, zero4)), forKey: "waveMatrix")
        mat.setValue(NSValue(scnMatrix4: RenderBridge.scnMat4(zero4, zero4, zero4, zero4)), forKey: "districtBoxesMatrix")
        mat.setValue(NSValue(scnMatrix4: RenderBridge.scnMat4(offFoam, offFoam, offFoam, offFoam)), forKey: "foamMatrixA")
        mat.setValue(NSValue(scnMatrix4: RenderBridge.scnMat4(offFoam, offFoam, zero4, zero4)), forKey: "foamAndSplatOverflow")
        mat.setValue(NSValue(scnMatrix4: RenderBridge.scnMat4(offRipple, offRipple, offRipple, offRipple)), forKey: "rippleMatrix")
        mat.setValue(NSValue(scnMatrix4: RenderBridge.scnMat4(zero4, zero4, zero4, zero4)), forKey: "splatMatrixA")

        return mat
    }

    public static func configureEnamelPalette(
        material: SCNMaterial,
        worldWidth: Double,
        worldDepth: Double,
        palette: WorldVisualPalette,
        landmarkColors: LandmarkPaletteColors? = nil,
        bChannelMode: BChannelMode,
        detailTier: Float = 2.0,
        depthCue: SIMD4<Float> = SIMD4<Float>(18.0, 0.085, -1.0, 0.0),
        companionState: SIMD4<Float> = SIMD4<Float>(0.0, -1.0, -1.0, 0.0),
        resetWorldSizeAndTime: Bool = true
    ) {
        let landmarks = landmarkColors ?? LandmarkPaletteColors.resolve(for: palette)
        let enamel = RenderBridge.srgbSIMD3(hex: palette.enamelBaseHex)
        let pellicle = RenderBridge.srgbSIMD3(hex: palette.pellicleSlimeHex)
        let biofilm = RenderBridge.srgbSIMD3(hex: palette.matureBiofilmHex)
        let sulcus = RenderBridge.srgbSIMD3(hex: landmarks.sulcusHex)
        let acidWash = RenderBridge.srgbSIMD3(hex: landmarks.acidWashHex)
        let epsDome = RenderBridge.srgbSIMD3(hex: landmarks.epsDomeHex)

        if resetWorldSizeAndTime {
            material.setValue(
                NSValue(scnVector4: RenderBridge.scnVec4(Float(worldWidth), Float(worldDepth), 0, 0)),
                forKey: "worldSizeAndTime"
            )
        }
        let matA = RenderBridge.scnMat4(
            SIMD4<Float>(enamel.x, enamel.y, enamel.z, Float(bChannelMode.shaderIndex)),
            SIMD4<Float>(pellicle.x, pellicle.y, pellicle.z, detailTier),
            SIMD4<Float>(biofilm.x, biofilm.y, biofilm.z, 0),
            SIMD4<Float>(sulcus.x, sulcus.y, sulcus.z, 0)
        )
        let matB = RenderBridge.scnMat4(
            SIMD4<Float>(acidWash.x, acidWash.y, acidWash.z, 0),
            SIMD4<Float>(epsDome.x, epsDome.y, epsDome.z, 0),
            depthCue,
            companionState
        )
        material.setValue(NSValue(scnMatrix4: matA), forKey: "paletteMatrixA")
        material.setValue(NSValue(scnMatrix4: matB), forKey: "paletteMatrixB")
    }

    public static func makeGingivaMaterial(
        gingivaHex: UInt32 = 0xC94C64,
        qualityTier: QualityTier = .medium,
        breathingStrength: Float = 0.35
    ) -> SCNMaterial {
        let mat = SCNMaterial()
        mat.name = "WetStippledGingivaMaterial"
        mat.lightingModel = .constant
        mat.diffuse.contents = PlatformColor.black
        mat.isDoubleSided = true

        mat.shaderModifiers = [
            .geometry: gingivaGeometryModifierMSL,
            .surface: gingivaSurfaceModifierMSL
        ]

        let base = RenderBridge.srgbSIMD3(hex: gingivaHex)
        mat.setValue(NSValue(scnVector3: RenderBridge.scnVec3(base)), forKey: "gingivaBaseColor")
        mat.setValue(
            NSValue(scnVector4: RenderBridge.scnVec4(0, breathingStrength, 0, 0)),
            forKey: "gingivaTimeAndBreath"
        )
        mat.setValue(NSValue(scnVector4: RenderBridge.scnVec4(0, 0, 0, 0)), forKey: "headlampVec")
        mat.setValue(NSValue(scnVector4: RenderBridge.scnVec4(18.0, 0.085, 0, 0)), forKey: "depthCueVec")
        setQualityTier(material: mat, tier: qualityTier)
        return mat
    }

    public static func updateGingivaMaterial(
        _ material: SCNMaterial,
        gingivaHex: UInt32? = nil,
        motionTimeSec: Float,
        breathingStrength: Float = 0.35,
        headlamp: SIMD4<Float>? = nil
    ) {
        if let hex = gingivaHex {
            let base = RenderBridge.srgbSIMD3(hex: hex)
            material.setValue(NSValue(scnVector3: RenderBridge.scnVec3(base)), forKey: "gingivaBaseColor")
        }
        material.setValue(
            NSValue(scnVector4: RenderBridge.scnVec4(motionTimeSec, breathingStrength, 0, 0)),
            forKey: "gingivaTimeAndBreath"
        )
        if let headlamp {
            material.setValue(NSValue(scnVector4: RenderBridge.scnVec4(headlamp)), forKey: "headlampVec")
        }
    }

    public static func makeEarthGlobeMaterial() -> SCNMaterial {
        let mat = SCNMaterial()
        mat.name = "OrbitalEarthGlobeMaterial"
        mat.lightingModel = .constant
        mat.diffuse.contents = PlatformColor.black
        mat.isDoubleSided = false
        mat.shaderModifiers = [.surface: earthSurfaceModifierMSL]
        mat.setValue(NSValue(scnVector4: RenderBridge.scnVec4(0, 0, 0, 0)), forKey: "earthTimeAndSun")
        return mat
    }

    public static func updateEarthGlobeTime(_ material: SCNMaterial, timeSec: Float) {
        material.setValue(NSValue(scnVector4: RenderBridge.scnVec4(timeSec, 0, 0, 0)), forKey: "earthTimeAndSun")
    }

    public static func makeAtmosphereHaloMaterial() -> SCNMaterial {
        let mat = SCNMaterial()
        mat.name = "OrbitalAtmosphereHaloMaterial"
        mat.lightingModel = .constant
        mat.diffuse.contents = PlatformColor.clear
        mat.blendMode = .add
        mat.writesToDepthBuffer = false
        mat.isDoubleSided = true
        mat.shaderModifiers = [.fragment: atmosphereFragmentModifierMSL]
        return mat
    }

    public static func setQualityTier(material: SCNMaterial, tier: QualityTier) {
        let detail: Int32
        switch tier {
        case .low: detail = 0
        case .medium: detail = 1
        case .ultra: detail = 2
        }
        material.setValue(NSNumber(value: detail), forKey: "detailTier")
    }
}

// MARK: - Stateful High-Speed Enamel Material Controller

/// High-level controller managing `SCNMaterial` + `SurfaceTextureUploader` + per-frame uniform updates
/// for both Arcade Plaque City cartridges and the 14-Crown Pocket Companion Hub.
public final class EnamelMaterialController {
    public let uploader: SurfaceTextureUploader
    public let material: SCNMaterial

    private var worldWidth: Float = 64.0
    private var worldDepth: Float = 32.0
    private var arcadePalette = WorldVisualPalette(
        enamelBaseHex: 0xF4FBFF,
        pellicleSlimeHex: 0xD9E35B,
        matureBiofilmHex: 0x9FB82C,
        gingivaHex: 0xD96B7E,
        skyTopHex: 0x071320,
        skyHorizonHex: 0x0F2940
    )
    private var companionModeActive: Bool = false
    private var bChannelMode: BChannelMode = .marginDensity
    private var detailTierFloat: Float = 2.0
    private var depthStart: Float = 18.0
    private var depthDensity: Float = 0.085
    private var smoothnessOverride: Float = -1.0
    private var fluorideGlow: Float = 0.0
    private var acidStress: Float = 0.0
    private var activeQuadrant: Int = -1
    private var highlightedCrown: Int = -1
    private var highlightPulse: Float = 0.0

    private var overflowFoam4 = SIMD4<Float>(0, 0, -99, 0)
    private var overflowFoam5 = SIMD4<Float>(0, 0, -99, 0)
    private var overflowSplat4 = SIMD4<Float>(0, 0, 0, 0)
    private var overflowSplat5 = SIMD4<Float>(0, 0, 0, 0)

    // Cached uniform shadows to avoid redundant SceneKit KVO/lock & NSValue boxing at 120Hz
    private var lastHeadlampVec: SIMD4<Float>?
    private var lastWaveCols: simd_float4x4?
    private var lastDistrictCols: simd_float4x4?
    private var lastDistrictAges: SIMD4<Float>?
    private var lastFoamSamples: [FoamTrailSample]?
    private var lastRipples: [CrownTouchRipple]?
    private var lastSplats: [SugarPlaqueSplat]?
    private var cachedLandmarkPaletteKey: WorldVisualPalette?
    private var cachedLandmarkColors: LandmarkPaletteColors?

    public init(
        gridWidth: Int = 256,
        gridHeight: Int = 128,
        qualityTier: QualityTier = .medium,
        device: MTLDevice? = MTLCreateSystemDefaultDevice()
    ) {
        let uploader = SurfaceTextureUploader(width: gridWidth, height: gridHeight, device: device)
        self.uploader = uploader
        switch qualityTier {
        case .low: self.detailTierFloat = 0
        case .medium: self.detailTierFloat = 1
        case .ultra: self.detailTierFloat = 2
        }
        self.material = EnamelShaders.makeEnamelMaterial(
            surfaceUploader: uploader,
            qualityTier: qualityTier
        )
    }

    public func bindCartridge(
        cartridge: WorldCartridge,
        rgbaBytes: [UInt8],
        gridWidth: Int,
        gridHeight: Int
    ) {
        worldWidth = Float(cartridge.worldWidth)
        worldDepth = Float(cartridge.worldDepth)
        arcadePalette = cartridge.palette
        bChannelMode = cartridge.bChannelMode
        companionModeActive = false
        smoothnessOverride = -1.0
        fluorideGlow = 0.0
        acidStress = 0.0
        activeQuadrant = -1
        highlightedCrown = -1
        highlightPulse = 0.0
        lastDistrictCols = nil
        lastDistrictAges = nil
        lastFoamSamples = nil

        uploader.upload(rgbaBytes: rgbaBytes, width: gridWidth, height: gridHeight)
        material.setValue(
            NSValue(scnVector4: RenderBridge.scnVec4(worldWidth, worldDepth, 0, 0)),
            forKey: "worldSizeAndTime"
        )
        pushPaletteAndCompanionMatrices()
    }

    public func uploadDirtySurface(
        rgbaBytes: [UInt8],
        width: Int,
        height: Int,
        dirtyRect: SurfaceDirtyRect? = nil
    ) {
        uploader.upload(rgbaBytes: rgbaBytes, width: width, height: height, dirtyRect: dirtyRect)
    }

    public func setQualityTier(_ tier: QualityTier) {
        let nextTier: Float
        switch tier {
        case .low: nextTier = 0
        case .medium: nextTier = 1
        case .ultra: nextTier = 2
        }
        guard nextTier != detailTierFloat else { return }
        detailTierFloat = nextTier
        pushPaletteAndCompanionMatrices()
    }

    public func setCompanionOverride(
        active: Bool,
        smoothness01: Float = 0.95,
        fluorideGlow01: Float = 0.35,
        acidStress01: Float = 0.0,
        activeQuadrant: Int = -1
    ) {
        let nextSmooth: Float = active ? min(1, max(0, smoothness01)) : -1.0
        let nextFluoride: Float = active ? min(1, max(0, fluorideGlow01)) : 0.0
        let nextAcid: Float = active ? min(1, max(0, acidStress01)) : 0.0
        let nextQuad: Int = active ? activeQuadrant : -1

        guard companionModeActive != active
            || abs(self.smoothnessOverride - nextSmooth) > 1e-4
            || abs(self.fluorideGlow - nextFluoride) > 1e-4
            || abs(self.acidStress - nextAcid) > 1e-4
            || self.activeQuadrant != nextQuad
        else { return }

        companionModeActive = active
        self.smoothnessOverride = nextSmooth
        self.fluorideGlow = nextFluoride
        self.acidStress = nextAcid
        self.activeQuadrant = nextQuad
        pushPaletteAndCompanionMatrices()
    }

    public func setHighlightedCrown(index: Int?, pulse01: Float = 1.0) {
        let nextCrown = index ?? -1
        let nextPulse: Float = index != nil ? min(1, max(0, pulse01)) : 0.0
        guard highlightedCrown != nextCrown || abs(highlightPulse - nextPulse) > 1e-4 else { return }
        highlightedCrown = nextCrown
        highlightPulse = nextPulse
        pushPaletteAndCompanionMatrices()
    }

    public func setHeadlamp(worldPos: SIMD3<Float>, weight: Float, depthStart: Float = 18.0, depthDensity: Float = 0.085) {
        let vec = SIMD4<Float>(worldPos.x, worldPos.y, worldPos.z, weight)
        if lastHeadlampVec != vec {
            lastHeadlampVec = vec
            material.setValue(NSValue(scnVector4: RenderBridge.scnVec4(vec)), forKey: "headlampVec")
        }
        if depthStart != self.depthStart || depthDensity != self.depthDensity {
            self.depthStart = depthStart
            self.depthDensity = depthDensity
            pushPaletteAndCompanionMatrices()
        }
    }

    public func updateFrameUniforms(_ u: EnamelFrameUniforms) {
        material.setValue(
            NSValue(scnVector4: RenderBridge.scnVec4(worldWidth, worldDepth, u.nowSec, u.motionTimeSec)),
            forKey: "worldSizeAndTime"
        )
        let c0 = SIMD4<Float>(Float(u.discloseOrigin.x), Float(u.discloseOrigin.z), u.discloseRadius, u.discloseStrength)
        let c1 = SIMD4<Float>(Float(u.rinseOrigin.x), Float(u.rinseOrigin.z), u.rinseRadius, u.rinseStrength)
        let c2 = SIMD4<Float>(Float(u.probePosition.x), Float(u.probePosition.z), u.probeFoamRadius, u.probeFoamStrength)
        let c3 = SIMD4<Float>(u.bufferedRinse ? 1.0 : 0.0, 0, 0, 0)
        let waveSimd = simd_float4x4(c0, c1, c2, c3)
        if lastWaveCols != waveSimd {
            lastWaveCols = waveSimd
            material.setValue(NSValue(scnMatrix4: SCNMatrix4(waveSimd)), forKey: "waveMatrix")
        }

        if let stress = u.acidStress, abs(stress - self.acidStress) > 1e-4 {
            self.acidStress = stress
            pushPaletteAndCompanionMatrices()
        }
    }

    public func setDistrictSeals(boxes: [AABB2D], sealAges: [Float]) {
        var c0 = SIMD4<Float>(0, 0, 0, 0)
        var c1 = SIMD4<Float>(0, 0, 0, 0)
        var c2 = SIMD4<Float>(0, 0, 0, 0)
        var c3 = SIMD4<Float>(0, 0, 0, 0)
        var ages = SIMD4<Float>(-1, -1, -1, -1)
        for i in 0..<4 where i < boxes.count {
            let b = boxes[i]
            let col = SIMD4<Float>(Float(b.minX), Float(b.minZ), Float(b.maxX), Float(b.maxZ))
            switch i {
            case 0: c0 = col
            case 1: c1 = col
            case 2: c2 = col
            default: c3 = col
            }
            ages[i] = i < sealAges.count ? sealAges[i] : -1
        }
        let boxSimd = simd_float4x4(c0, c1, c2, c3)
        if lastDistrictCols != boxSimd {
            lastDistrictCols = boxSimd
            material.setValue(NSValue(scnMatrix4: SCNMatrix4(boxSimd)), forKey: "districtBoxesMatrix")
        }
        if lastDistrictAges != ages {
            lastDistrictAges = ages
            material.setValue(NSValue(scnVector4: RenderBridge.scnVec4(ages)), forKey: "districtSealAges")
        }
    }

    public func setFoamSamples(_ samples: [FoamTrailSample]) {
        guard lastFoamSamples != samples else { return }
        lastFoamSamples = samples
        let off = SIMD4<Float>(0, 0, -99, 0)
        func vec(_ idx: Int) -> SIMD4<Float> {
            guard idx < samples.count else { return off }
            let s = samples[idx]
            return SIMD4<Float>(s.x, s.z, s.birthTime, s.strength)
        }
        material.setValue(
            NSValue(scnMatrix4: RenderBridge.scnMat4(vec(0), vec(1), vec(2), vec(3))),
            forKey: "foamMatrixA"
        )
        overflowFoam4 = vec(4)
        overflowFoam5 = vec(5)
        pushOverflowMatrix()
    }

    public func setTouchRipples(_ ripples: [CrownTouchRipple]) {
        guard lastRipples != ripples else { return }
        lastRipples = ripples
        let off = SIMD4<Float>(0, 0, 0, -99)
        func vec(_ idx: Int) -> SIMD4<Float> {
            guard idx < ripples.count else { return off }
            let r = ripples[idx]
            return SIMD4<Float>(r.position.x, r.position.y, r.position.z, r.startTime)
        }
        material.setValue(
            NSValue(scnMatrix4: RenderBridge.scnMat4(vec(0), vec(1), vec(2), vec(3))),
            forKey: "rippleMatrix"
        )
    }

    public func setSugarSplats(_ splats: [SugarPlaqueSplat]) {
        guard lastSplats != splats else { return }
        lastSplats = splats
        let off = SIMD4<Float>(0, 0, 0, 0)
        func vec(_ idx: Int) -> SIMD4<Float> {
            guard idx < splats.count else { return off }
            let sp = splats[idx]
            return SIMD4<Float>(sp.position.x, sp.position.y, sp.position.z, sp.amount)
        }
        material.setValue(
            NSValue(scnMatrix4: RenderBridge.scnMat4(vec(0), vec(1), vec(2), vec(3))),
            forKey: "splatMatrixA"
        )
        overflowSplat4 = vec(4)
        overflowSplat5 = vec(5)
        pushOverflowMatrix()
    }

    private func pushOverflowMatrix() {
        material.setValue(
            NSValue(scnMatrix4: RenderBridge.scnMat4(overflowFoam4, overflowFoam5, overflowSplat4, overflowSplat5)),
            forKey: "foamAndSplatOverflow"
        )
    }

    private func pushPaletteAndCompanionMatrices() {
        let effectivePalette: WorldVisualPalette
        if companionModeActive {
            effectivePalette = WorldVisualPalette(
                enamelBaseHex: EnamelShaders.companionEnamelHex,
                pellicleSlimeHex: EnamelShaders.companionPellicleHex,
                matureBiofilmHex: EnamelShaders.companionBiofilmHex,
                gingivaHex: arcadePalette.gingivaHex,
                skyTopHex: arcadePalette.skyTopHex,
                skyHorizonHex: arcadePalette.skyHorizonHex
            )
        } else {
            effectivePalette = arcadePalette
        }

        let landmarks: LandmarkPaletteColors
        if cachedLandmarkPaletteKey == effectivePalette, let cached = cachedLandmarkColors {
            landmarks = cached
        } else {
            let resolved = LandmarkPaletteColors.resolve(for: effectivePalette)
            cachedLandmarkPaletteKey = effectivePalette
            cachedLandmarkColors = resolved
            landmarks = resolved
        }

        EnamelShaders.configureEnamelPalette(
            material: material,
            worldWidth: Double(worldWidth),
            worldDepth: Double(worldDepth),
            palette: effectivePalette,
            landmarkColors: landmarks,
            bChannelMode: bChannelMode,
            detailTier: detailTierFloat,
            depthCue: SIMD4<Float>(depthStart, depthDensity, smoothnessOverride, fluorideGlow),
            companionState: SIMD4<Float>(acidStress, Float(activeQuadrant), Float(highlightedCrown), highlightPulse),
            resetWorldSizeAndTime: false
        )
    }
}
