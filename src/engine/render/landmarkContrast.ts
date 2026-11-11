// Picks landmark and biophysical surface tints that stay legible against each world's palette.

export interface PaletteLike {
  enamelBaseHex?: number;
  pellicleSlimeHex: number;
  matureBiofilmHex: number;
}

export function relativeLuminance(hex: number): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = lin((hex >> 16) & 255);
  const g = lin((hex >> 8) & 255);
  const b = lin(hex & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: number, b: number): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Hue distance in [0, 1] weights contrast so a pink gem does not vanish on lilac plaque. */
export function hueDistance(a: number, b: number): number {
  const hue = (hex: number) => {
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const bl = (hex & 255) / 255;
    const mx = Math.max(r, g, bl);
    const mn = Math.min(r, g, bl);
    if (mx === mn) return 0;
    const d = mx - mn;
    let h = mx === r ? ((g - bl) / d) % 6 : mx === g ? (bl - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  };
  const sat = (hex: number) => {
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const bl = (hex & 255) / 255;
    const mx = Math.max(r, g, bl);
    const mn = Math.min(r, g, bl);
    return mx === 0 ? 0 : (mx - mn) / mx;
  };
  // Neutral / near-white colours have arbitrary hue; suppress hue bonus when saturation is tiny.
  if (sat(a) < 0.08 || sat(b) < 0.08) return 0;
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d) / 180;
}

/** True when a landmark colour separates from a surface colour by luminance or hue. */
export function isVisuallySeparated(
  fgHex: number,
  bgHex: number,
  minContrast = 1.45,
  minHue = 0.35
): boolean {
  return (
    contrastRatio(fgHex, bgHex) >= minContrast ||
    (hueDistance(fgHex, bgHex) >= minHue && contrastRatio(fgHex, bgHex) >= 1.12)
  );
}

function pickFromCandidates(
  candidates: readonly number[],
  backgrounds: readonly number[],
  avoidHexes: readonly number[] = []
): number {
  let best = candidates[0];
  let bestScore = -1;
  for (const cand of candidates) {
    let minBgScore = Infinity;
    for (const bg of backgrounds) {
      const cr = contrastRatio(cand, bg);
      const hd = hueDistance(cand, bg);
      // Penalize near-isoluminant pairs (cr < 1.15) even when hue differs so shapes keep crisp edges.
      const isoPenalty = cr < 1.15 ? 0.45 : 1.0;
      const s = cr * (0.6 + hd) * isoPenalty;
      if (s < minBgScore) minBgScore = s;
    }
    for (const avoid of avoidHexes) {
      const peerSep = Math.max(hueDistance(cand, avoid), (contrastRatio(cand, avoid) - 1) * 0.35);
      if (peerSep < 0.22) minBgScore *= 0.65;
    }
    if (minBgScore > bestScore) {
      bestScore = minBgScore;
      best = cand;
    }
  }
  return best;
}

export const SUCROSE_TINT_CANDIDATES = [
  0xf9a8d4,
  0xd946ef,
  0x9ee9ff,
  0x2f80ed,
  0xffffff,
  0xfff1a8,
] as const;

export const COLONY_BEACON_CANDIDATES = [
  0x38bdf8,
  0xfef08a,
  0x818cf8,
  0x16a34a,
  0xf472b6,
] as const;

export const COLONY_RESTORED_CANDIDATES = [
  0x0d9488,
  0x0284c7,
  0x7c3aed,
  0xdb2777,
  0xd97706,
] as const;

export const SPRING_TINT_CANDIDATES = [
  0x0284c7,
  0x0891b2,
  0x4f46e5,
  0x16a34a,
  0xd97706,
] as const;

export const BRIDGE_TINT_CANDIDATES = [
  0xbe123c,
  0xf43f5e,
  0x22d3ee,
  0xfbbf24,
  0x16a34a,
  0xa855f7,
  0xfacc15,
] as const;

export const ACID_POOL_TINT_CANDIDATES = [
  0xe11d48,
  0x65a30d,
  0x7c3aed,
  0xd97706,
  0x0891b2,
] as const;

export const ALLEY_RETICLE_CANDIDATES = [
  0x06b6d4,
  0xf59e0b,
  0xec4899,
  0x8b5cf6,
  0x16a34a,
] as const;

export const ACID_WASH_CANDIDATES = [
  0x9d174d,
  0xa21caf,
  0xbe123c,
] as const;

export const EPS_DOME_CANDIDATES = [
  0x1d4ed8,
  0x1e40af,
  0x4338ca,
  0x0f766e,
] as const;

export const SULCUS_BAND_CANDIDATES = [
  0xe11d48,
  0xdb2777,
  0xd97706,
  0x0284c7,
  0x7c3aed,
] as const;

export function pickSucroseTint(palette: PaletteLike): number {
  return pickFromCandidates(SUCROSE_TINT_CANDIDATES, [
    palette.pellicleSlimeHex,
    palette.matureBiofilmHex,
  ]);
}

/** Unrestored S. sanguinis colony beacon sitting on un-scrubbed plaque. */
export function pickColonyBeaconTint(palette: PaletteLike): number {
  const sucrose = pickSucroseTint(palette);
  return pickFromCandidates(
    COLONY_BEACON_CANDIDATES,
    [palette.pellicleSlimeHex, palette.matureBiofilmHex],
    [sucrose]
  );
}

/** Restored S. sanguinis colony crystal sitting on freshly scrubbed enamel near remaining plaque. */
export function pickColonyRestoredTint(palette: PaletteLike): number {
  const bgs = [palette.pellicleSlimeHex, palette.matureBiofilmHex];
  if (palette.enamelBaseHex !== undefined) bgs.push(palette.enamelBaseHex);
  return pickFromCandidates(COLONY_RESTORED_CANDIDATES, bgs);
}

/** Salivary Bicarbonate / Miswak spring torus ring on plaque or scrubbed enamel. */
export function pickSpringTint(palette: PaletteLike): number {
  const restored = pickColonyRestoredTint(palette);
  const bgs = [palette.pellicleSlimeHex, palette.matureBiofilmHex];
  if (palette.enamelBaseHex !== undefined) bgs.push(palette.enamelBaseHex);
  return pickFromCandidates(SPRING_TINT_CANDIDATES, bgs, [restored]);
}

/** Viscous biofilm bridge cord spanning narrow interdental alleys. */
export function pickBridgeTint(palette: PaletteLike): number {
  const sucrose = pickSucroseTint(palette);
  return pickFromCandidates(
    BRIDGE_TINT_CANDIDATES,
    [palette.pellicleSlimeHex, palette.matureBiofilmHex],
    [sucrose]
  );
}

/** Corrosive acid puddle dropped by S. mutans onto plaque or scrubbed enamel. */
export function pickAcidPoolTint(palette: PaletteLike): number {
  const spring = pickSpringTint(palette);
  const bgs = [palette.pellicleSlimeHex, palette.matureBiofilmHex];
  if (palette.enamelBaseHex !== undefined) bgs.push(palette.enamelBaseHex);
  return pickFromCandidates(ACID_POOL_TINT_CANDIDATES, bgs, [spring]);
}

/** Projected interdental alley-mouth reticle sitting at the enamel/plaque seam. */
export function pickAlleyReticleTint(palette: PaletteLike): number {
  const bgs = [palette.pellicleSlimeHex, palette.matureBiofilmHex];
  if (palette.enamelBaseHex !== undefined) bgs.push(palette.enamelBaseHex);
  return pickFromCandidates(ALLEY_RETICLE_CANDIDATES, bgs);
}

/** Biophysical surface wash for low-pH acid zones (Stephan curve & World 4 Hibiscus wash). */
export function pickAcidWashTint(palette: PaletteLike): number {
  return pickFromCandidates(ACID_WASH_CANDIDATES, [
    palette.pellicleSlimeHex,
    palette.matureBiofilmHex,
  ]);
}

/** Biophysical polymer armor tint for Zero-G quorum-sensing EPS domes (World 5). */
export function pickEpsDomeTint(palette: PaletteLike): number {
  const acid = pickAcidWashTint(palette);
  return pickFromCandidates(
    EPS_DOME_CANDIDATES,
    [palette.pellicleSlimeHex, palette.matureBiofilmHex],
    [acid]
  );
}

/** Gingival sulcus margin guide tint (World 2 Bass sulcus bands). */
export function pickSulcusTint(palette: PaletteLike): number {
  const bgs = [palette.pellicleSlimeHex, palette.matureBiofilmHex];
  if (palette.enamelBaseHex !== undefined) bgs.push(palette.enamelBaseHex);
  return pickFromCandidates(SULCUS_BAND_CANDIDATES, bgs);
}
