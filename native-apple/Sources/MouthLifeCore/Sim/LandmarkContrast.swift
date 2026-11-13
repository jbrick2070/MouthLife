import Foundation

public struct LandmarkPaletteInput: Equatable, Sendable {
    public var enamelBaseHex: UInt32?
    public var pellicleSlimeHex: UInt32
    public var matureBiofilmHex: UInt32

    public init(
        enamelBaseHex: UInt32? = nil,
        pellicleSlimeHex: UInt32,
        matureBiofilmHex: UInt32
    ) {
        self.enamelBaseHex = enamelBaseHex
        self.pellicleSlimeHex = pellicleSlimeHex
        self.matureBiofilmHex = matureBiofilmHex
    }

    public init(_ palette: WorldVisualPalette) {
        self.enamelBaseHex = palette.enamelBaseHex
        self.pellicleSlimeHex = palette.pellicleSlimeHex
        self.matureBiofilmHex = palette.matureBiofilmHex
    }
}

public struct LandmarkColors: Equatable, Sendable {
    public var sucroseHex: UInt32
    public var colonyBeaconHex: UInt32
    public var colonyRestoredHex: UInt32
    public var springHex: UInt32
    public var bridgeHex: UInt32
    public var acidPoolHex: UInt32
    public var alleyReticleHex: UInt32
    public var acidWashHex: UInt32
    public var epsDomeHex: UInt32
    public var sulcusBandHex: UInt32

    public init(
        sucroseHex: UInt32,
        colonyBeaconHex: UInt32,
        colonyRestoredHex: UInt32,
        springHex: UInt32,
        bridgeHex: UInt32,
        acidPoolHex: UInt32,
        alleyReticleHex: UInt32,
        acidWashHex: UInt32,
        epsDomeHex: UInt32,
        sulcusBandHex: UInt32
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
        self.sulcusBandHex = sulcusBandHex
    }
}

public func relativeLuminance(_ hex: UInt32) -> Double {
    func lin(_ c: UInt32) -> Double {
        let v = Double(c) / 255.0
        return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
    }
    let r = lin((hex >> 16) & 0xFF)
    let g = lin((hex >> 8) & 0xFF)
    let b = lin(hex & 0xFF)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

public func contrastRatio(_ a: UInt32, _ b: UInt32) -> Double {
    let la = relativeLuminance(a)
    let lb = relativeLuminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
}

/// Hue distance in `[0, 1]` weights contrast so a pink gem does not vanish on lilac plaque.
public func hueDistance(_ a: UInt32, _ b: UInt32) -> Double {
    func hue(_ hex: UInt32) -> Double {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let bl = Double(hex & 0xFF) / 255.0
        let mx = max(r, g, bl)
        let mn = min(r, g, bl)
        if mx == mn { return 0 }
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
        return h < 0 ? h + 360.0 : h
    }

    func sat(_ hex: UInt32) -> Double {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let bl = Double(hex & 0xFF) / 255.0
        let mx = max(r, g, bl)
        let mn = min(r, g, bl)
        return mx == 0 ? 0 : (mx - mn) / mx
    }

    // Neutral / near-white colours have arbitrary hue; suppress hue bonus when saturation is tiny.
    if sat(a) < 0.08 || sat(b) < 0.08 { return 0 }
    let d = abs(hue(a) - hue(b))
    return min(d, 360.0 - d) / 180.0
}

/// True when a landmark colour separates from a surface colour by luminance or hue.
public func isVisuallySeparated(
    _ fgHex: UInt32,
    _ bgHex: UInt32,
    minContrast: Double = 1.45,
    minHue: Double = 0.35
) -> Bool {
    contrastRatio(fgHex, bgHex) >= minContrast ||
        (hueDistance(fgHex, bgHex) >= minHue && contrastRatio(fgHex, bgHex) >= 1.12)
}

private func pickFromCandidates(
    _ candidates: [UInt32],
    backgrounds: [UInt32],
    avoidHexes: [UInt32] = []
) -> UInt32 {
    guard var best = candidates.first else { return 0xFFFFFF }
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
        for avoid in avoidHexes {
            let peerSep = max(hueDistance(cand, avoid), (contrastRatio(cand, avoid) - 1.0) * 0.35)
            if peerSep < 0.22 { minBgScore *= 0.65 }
        }
        if minBgScore > bestScore {
            bestScore = minBgScore
            best = cand
        }
    }
    return best
}

public let sucroseTintCandidates: [UInt32] = [
    0xF9A8D4,
    0xD946EF,
    0x9EE9FF,
    0x2F80ED,
    0xFFFFFF,
    0xFFF1A8,
]

public let colonyBeaconCandidates: [UInt32] = [
    0x38BDF8,
    0xFEF08A,
    0x818CF8,
    0x16A34A,
    0xF472B6,
]

public let colonyRestoredCandidates: [UInt32] = [
    0x0D9488,
    0x0284C7,
    0x7C3AED,
    0xDB2777,
    0xD97706,
]

public let springTintCandidates: [UInt32] = [
    0x0284C7,
    0x0891B2,
    0x4F46E5,
    0x16A34A,
    0xD97706,
]

public let bridgeTintCandidates: [UInt32] = [
    0xBE123C,
    0xF43F5E,
    0x22D3EE,
    0xFBBF24,
    0x16A34A,
    0xA855F7,
    0xFACC15,
]

public let acidPoolTintCandidates: [UInt32] = [
    0xE11D48,
    0x65A30D,
    0x7C3AED,
    0xD97706,
    0x0891B2,
]

public let alleyReticleCandidates: [UInt32] = [
    0x06B6D4,
    0xF59E0B,
    0xEC4899,
    0x8B5CF6,
    0x16A34A,
]

public let acidWashCandidates: [UInt32] = [
    0x9D174D,
    0xA21CAF,
    0xBE123C,
]

public let epsDomeCandidates: [UInt32] = [
    0x1D4ED8,
    0x1E40AF,
    0x4338CA,
    0x0F766E,
]

public let sulcusBandCandidates: [UInt32] = [
    0xE11D48,
    0xDB2777,
    0xD97706,
    0x0284C7,
    0x7C3AED,
]

public func pickSucroseTint(_ palette: LandmarkPaletteInput) -> UInt32 {
    pickFromCandidates(
        sucroseTintCandidates,
        backgrounds: [palette.pellicleSlimeHex, palette.matureBiofilmHex]
    )
}

public func pickSucroseTint(_ palette: WorldVisualPalette) -> UInt32 {
    pickSucroseTint(LandmarkPaletteInput(palette))
}

public func pickColonyBeaconTint(_ palette: LandmarkPaletteInput) -> UInt32 {
    let sucrose = pickSucroseTint(palette)
    return pickFromCandidates(
        colonyBeaconCandidates,
        backgrounds: [palette.pellicleSlimeHex, palette.matureBiofilmHex],
        avoidHexes: [sucrose]
    )
}

public func pickColonyBeaconTint(_ palette: WorldVisualPalette) -> UInt32 {
    pickColonyBeaconTint(LandmarkPaletteInput(palette))
}

public func pickColonyRestoredTint(_ palette: LandmarkPaletteInput) -> UInt32 {
    var bgs = [palette.pellicleSlimeHex, palette.matureBiofilmHex]
    if let enamel = palette.enamelBaseHex { bgs.append(enamel) }
    return pickFromCandidates(colonyRestoredCandidates, backgrounds: bgs)
}

public func pickColonyRestoredTint(_ palette: WorldVisualPalette) -> UInt32 {
    pickColonyRestoredTint(LandmarkPaletteInput(palette))
}

public func pickSpringTint(_ palette: LandmarkPaletteInput) -> UInt32 {
    let restored = pickColonyRestoredTint(palette)
    var bgs = [palette.pellicleSlimeHex, palette.matureBiofilmHex]
    if let enamel = palette.enamelBaseHex { bgs.append(enamel) }
    return pickFromCandidates(springTintCandidates, backgrounds: bgs, avoidHexes: [restored])
}

public func pickSpringTint(_ palette: WorldVisualPalette) -> UInt32 {
    pickSpringTint(LandmarkPaletteInput(palette))
}

public func pickBridgeTint(_ palette: LandmarkPaletteInput) -> UInt32 {
    let sucrose = pickSucroseTint(palette)
    return pickFromCandidates(
        bridgeTintCandidates,
        backgrounds: [palette.pellicleSlimeHex, palette.matureBiofilmHex],
        avoidHexes: [sucrose]
    )
}

public func pickBridgeTint(_ palette: WorldVisualPalette) -> UInt32 {
    pickBridgeTint(LandmarkPaletteInput(palette))
}

public func pickAcidPoolTint(_ palette: LandmarkPaletteInput) -> UInt32 {
    let spring = pickSpringTint(palette)
    var bgs = [palette.pellicleSlimeHex, palette.matureBiofilmHex]
    if let enamel = palette.enamelBaseHex { bgs.append(enamel) }
    return pickFromCandidates(acidPoolTintCandidates, backgrounds: bgs, avoidHexes: [spring])
}

public func pickAcidPoolTint(_ palette: WorldVisualPalette) -> UInt32 {
    pickAcidPoolTint(LandmarkPaletteInput(palette))
}

public func pickAlleyReticleTint(_ palette: LandmarkPaletteInput) -> UInt32 {
    var bgs = [palette.pellicleSlimeHex, palette.matureBiofilmHex]
    if let enamel = palette.enamelBaseHex { bgs.append(enamel) }
    return pickFromCandidates(alleyReticleCandidates, backgrounds: bgs)
}

public func pickAlleyReticleTint(_ palette: WorldVisualPalette) -> UInt32 {
    pickAlleyReticleTint(LandmarkPaletteInput(palette))
}

public func pickAcidWashTint(_ palette: LandmarkPaletteInput) -> UInt32 {
    pickFromCandidates(
        acidWashCandidates,
        backgrounds: [palette.pellicleSlimeHex, palette.matureBiofilmHex]
    )
}

public func pickAcidWashTint(_ palette: WorldVisualPalette) -> UInt32 {
    pickAcidWashTint(LandmarkPaletteInput(palette))
}

public func pickEpsDomeTint(_ palette: LandmarkPaletteInput) -> UInt32 {
    let acid = pickAcidWashTint(palette)
    return pickFromCandidates(
        epsDomeCandidates,
        backgrounds: [palette.pellicleSlimeHex, palette.matureBiofilmHex],
        avoidHexes: [acid]
    )
}

public func pickEpsDomeTint(_ palette: WorldVisualPalette) -> UInt32 {
    pickEpsDomeTint(LandmarkPaletteInput(palette))
}

public func pickSulcusTint(_ palette: LandmarkPaletteInput) -> UInt32 {
    var bgs = [palette.pellicleSlimeHex, palette.matureBiofilmHex]
    if let enamel = palette.enamelBaseHex { bgs.append(enamel) }
    return pickFromCandidates(sulcusBandCandidates, backgrounds: bgs)
}

public func pickSulcusTint(_ palette: WorldVisualPalette) -> UInt32 {
    pickSulcusTint(LandmarkPaletteInput(palette))
}

public func computeLandmarkContrast(for palette: LandmarkPaletteInput) -> LandmarkColors {
    LandmarkColors(
        sucroseHex: pickSucroseTint(palette),
        colonyBeaconHex: pickColonyBeaconTint(palette),
        colonyRestoredHex: pickColonyRestoredTint(palette),
        springHex: pickSpringTint(palette),
        bridgeHex: pickBridgeTint(palette),
        acidPoolHex: pickAcidPoolTint(palette),
        alleyReticleHex: pickAlleyReticleTint(palette),
        acidWashHex: pickAcidWashTint(palette),
        epsDomeHex: pickEpsDomeTint(palette),
        sulcusBandHex: pickSulcusTint(palette)
    )
}

public func computeLandmarkContrast(for palette: WorldVisualPalette) -> LandmarkColors {
    computeLandmarkContrast(for: LandmarkPaletteInput(palette))
}
