import * as THREE from 'three';
import { ORAL_LIGHTING_GLSL } from './OralLighting';
import { pickAcidWashTint, pickEpsDomeTint, pickSulcusTint } from './landmarkContrast';
import type { BChannelMode, WorldVisualPalette } from '../types';

const B_MODE_INDEX: Record<BChannelMode, number> = {
  marginDensity: 0,
  gumIrritation: 1,
  localPh: 2,
  epsArmor: 3,
};

const VERTEX_SHADER = /* glsl */ `
  // Companion crown id + 1 (0 = not a companion crown). Costs 0 extra draw calls.
  attribute float aToothId;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vVertColor;
  varying float vToothId;

  void main() {
    vVertColor = color;
    vToothId = aToothId;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    vWorldNormal = mat3(modelMatrix) * normal;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  ${ORAL_LIGHTING_GLSL}
  uniform sampler2D uSurfaceTex;
  uniform vec2 uWorldSize;
  uniform float uTime;

  uniform vec3 uEnamelBase;
  uniform vec3 uPellicleColor;
  uniform vec3 uBiofilmColor;
  uniform vec3 uSulcusTint;
  uniform vec3 uAcidWashTint;
  uniform vec3 uEpsDomeTint;
  uniform int uBChannelMode;

  uniform vec2 uDiscloseOrigin;
  uniform float uDiscloseRadius;
  uniform float uDiscloseStrength;

  uniform vec2 uRinseOrigin;
  uniform float uRinseRadius;
  uniform float uRinseStrength;
  uniform bool uBufferedRinse;

  // District seal: box = (minX, minZ, maxX, maxZ); age = seconds since sealed (<0 = open).
  uniform vec4 uDistrictBox[4];
  uniform float uSealAge[4];

  uniform float uGlobalSmoothnessOverride;
  uniform float uGlobalFluorideGlow;
  uniform float uAcidStress;
  uniform int uActiveQuadrant;
  // Tapped / inspected Companion crown (0..13), or < 0 for none; uHighlightPulse eases 0..1
  uniform float uHighlightedTooth;
  uniform float uHighlightPulse;

  // Recently-scrubbed bubbling foam trail samples: (x, z, birthTime, strength)
  uniform vec4 uFoam[12];
  // Companion touch specular ripples: (x, y, z, startTime)
  uniform vec4 uRipples[4];
  // Companion Regional Treat sugar-plaque splats: (x, y, z, amount 0..1)
  uniform vec4 uSplats[6];

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vVertColor;
  varying float vToothId;

  // Lightweight procedural hash & cellular value noise (zero extra texture fetches)
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec2 uv = clamp(vWorldPos.xz / uWorldSize, vec2(0.001), vec2(0.999));
    vec4 surf = texture2D(uSurfaceTex, uv);

    float rawPlaque = surf.r;
    float fluorideSeal = max(surf.g, uGlobalFluorideGlow);
    float bVal = surf.b;

    if (uGlobalSmoothnessOverride >= 0.0) {
      // Plaque settles first along cervical margins & interproximal patches, not uniformly
      float organicPatch = valueNoise(vWorldPos.xz * 0.9 + vWorldPos.y * 0.7 + vec2(1.7, 3.1));
      float fuzz = clamp((0.92 - uGlobalSmoothnessOverride) / 0.75, 0.0, 1.0);
      float marginBias = 1.0 - smoothstep(0.0, 0.55, clamp(vVertColor.b, 0.0, 1.0));
      float coverage = fuzz * (0.3 + 0.7 * marginBias);
      rawPlaque = clamp(coverage * (0.45 + 0.9 * organicPatch), 0.0, 1.0);

      // Localized sticky sugar-plaque splats from Regional Treats (organic noisy blobs)
      for (int i = 0; i < 6; i++) {
        vec4 sp = uSplats[i];
        if (sp.w <= 0.001) continue;
        float d = distance(vWorldPos, sp.xyz);
        float blob = valueNoise(vWorldPos.xz * 3.6 + vWorldPos.y * 2.1 + sp.xz * 1.7);
        float rad = 0.85 + 0.55 * blob;
        float splat = sp.w * (1.0 - smoothstep(rad * 0.45, rad, d));
        rawPlaque = max(rawPlaque, splat * 0.92);
      }
    }

    // Crisp liquid-to-glassy contour magnification right around CLEAN_THRESHOLD = 0.10,
    // while keeping thin morning pellicle semi-translucent so enamel landmarks & scrubbing progress read clearly.
    float cleanEdge = smoothstep(0.085, 0.135, rawPlaque);
    float matureBiofilm = smoothstep(0.52, 0.84, rawPlaque);
    float plaqueMask = cleanEdge * mix(0.68, 0.98, smoothstep(0.18, 0.72, rawPlaque));

    // Procedural micro-bump normal perturbation ONLY where plaque exists
    vec3 V = safeUnit(cameraPosition - vWorldPos);
    vec2 plaqueUv = vWorldPos.xz + vec2(0.31, 0.58) * vWorldPos.y;
    float n1 = 0.5;
    float n2 = 0.5;
    if (plaqueMask > 0.01) {
      n1 = valueNoise(plaqueUv * 3.8);
      if (uDetail > 0) {
        vec2 relief = plaqueUv + V.xz * (n1 - 0.5) * matureBiofilm * 0.17;
        n2 = valueNoise(relief * 9.5 + vec2(4.2, 1.9));
      }
    }
    float microTex = n1 * 0.65 + n2 * 0.35;

    vec3 N = safeUnit(vWorldNormal);
    if (plaqueMask > 0.01) {
      vec3 bumpOffset = vec3(n1 - 0.5, 0.0, n2 - 0.5) * (0.38 * plaqueMask);
      N = safeUnit(N + bumpOffset);
    }

    vec3 L1 = normalize(vec3(0.36, 0.86, 0.35));
    vec3 L2 = normalize(vec3(-0.48, 0.62, -0.62));
    vec3 H1 = safeUnit(L1 + V);
    vec3 H2 = safeUnit(L2 + V);

    float NdotL1 = max(dot(N, L1), 0.0);
    float NdotV = clamp(dot(N, V), 0.0, 1.0);

    // Subsurface hydroxyapatite wrap illumination
    float wrapDiff = max(0.0, (dot(N, L1) + 0.45) / 1.45);
    float fillDiff = max(0.0, (dot(N, L2) + 0.35) / 1.35) * 0.42;

    // Clean pearlescent enamel base vs matte organic pellicle/biofilm
    vec3 cleanEnamel = uEnamelBase * (0.34 + 0.6 * wrapDiff + fillDiff * 0.9);
    float fresnel = pow(1.0 - NdotV, 3.0);

    // Dentin glowing warm through thin cervical enamel -> opalescent bluish-pearl incisal/cusp tips
    float hFrac = clamp(vVertColor.b, 0.0, 1.0);
    float cervical = 1.0 - smoothstep(0.06, 0.48, hFrac);
    vec3 dentinWarm = vec3(1.0, 0.82, 0.58);
    cleanEnamel = mix(cleanEnamel, cleanEnamel * dentinWarm, cervical * 0.72);

    // Subtle anatomical mamelon lobes under translucent incisal/cusp enamel
    float mamelonWave = 0.5 + 0.5 * sin(vWorldPos.x * 3.4 + vWorldPos.z * 0.9);
    float incisalStart = 0.54 + 0.10 * mamelonWave;
    float incisal = smoothstep(incisalStart, 0.95, hFrac);
    float cleanFactor = 1.0 - plaqueMask * 0.85;
    float backScatter = pow(clamp(dot(-L1, V) * 0.5 + 0.5, 0.0, 1.0), 2.0);
    vec3 opalBlue = cleanEnamel * vec3(0.62, 0.78, 0.98)
                  + vec3(0.09, 0.20, 0.34) * (0.55 + fresnel * 2.1)
                  + vec3(0.16, 0.09, 0.04) * backScatter * 0.55;
    cleanEnamel = mix(cleanEnamel, opalBlue, incisal * (0.65 + 0.35 * fresnel) * cleanFactor);

    // Translucent bluish-ivory enamel edge scattering
    cleanEnamel += vec3(0.16, 0.28, 0.38) * fresnel * (1.0 - plaqueMask);

    // Perikymata: faint horizontal growth-line wave bands on clean crowns (follow crown height)
    float perikBand = 0.5 + 0.5 * sin(vWorldPos.y * 58.0 + valueNoise(vWorldPos.xz * 2.3) * 3.2);
    float perikFade = smoothstep(0.12, 0.35, hFrac) * (1.0 - smoothstep(0.88, 1.0, hFrac));
    cleanEnamel *= 1.0 - 0.035 * perikBand * perikFade * cleanFactor;

    // Bluish-opal incisal edge translucency (thin tips let the dark mouth show through)
    float tip = smoothstep(0.75, 0.97, vVertColor.b);
    cleanEnamel = mix(cleanEnamel, cleanEnamel * vec3(0.80, 0.90, 1.0) + vec3(0.03, 0.08, 0.16) * (0.5 + fresnel * 2.0), tip * 0.32 * cleanFactor);

    // Warm dentin subsurface scattering glowing through the thin cervical neck
    float neckGlow = 1.0 - smoothstep(0.18, 0.35, vVertColor.b);
    cleanEnamel += vec3(0.20, 0.11, 0.03) * neckGlow * (0.4 + 0.6 * backScatter) * cleanFactor;

    // Fluorapatite crystalline iridescent mint-cyan sheen
    if (fluorideSeal > 0.05) {
      float hexShimmer = 0.5 + 0.5 * sin(vWorldPos.x * 5.2 + vWorldPos.z * 5.2 + uMotionTime * 2.1);
      cleanEnamel += vec3(0.08, 0.40, 0.36) * fluorideSeal * (0.40 + 0.65 * fresnel) * (0.72 + 0.28 * hexShimmer);
    }

    // Plaque & mature biofilm albedo: clearer local contrast between thin pellicle and thick fissure/margin biofilm
    vec3 slimeAlbedo = mix(uPellicleColor, uBiofilmColor * 0.84, matureBiofilm);
    slimeAlbedo *= (0.78 + 0.34 * microTex);
    vec3 plaqueLit = slimeAlbedo * (0.34 + 0.62 * NdotL1 + 0.20 * fillDiff);

    if (uDetail > 0) {
      vec3 sheen = mix(vec3(0.12, 0.24, 0.28), vec3(0.33, 0.16, 0.26), n2);
      plaqueLit += sheen * (0.16 + 0.72 * fresnel) * matureBiofilm;
    }
    vec3 baseColor = mix(cleanEnamel, plaqueLit, plaqueMask);
    baseColor *= 1.0 + headlamp(vWorldPos, N);

    // B-channel biophysical cue tinting (palette-contrasted per world)
    if (uBChannelMode == 0 && bVal > 0.1 && plaqueMask > 0.2) {
      // Cervical margin / fissure amber density cue
      baseColor = mix(baseColor, vec3(0.86, 0.68, 0.20), bVal * 0.22 * plaqueMask);
    } else if (uBChannelMode == 1 && bVal > 0.02) {
      // Gingival sulcus band: clearly findable at calm baseline (0.16), flushing vivid coral when tender
      float sulcusBand = smoothstep(0.03, 0.14, bVal);
      float sulcusEdge = smoothstep(0.035, 0.085, bVal) * (1.0 - smoothstep(0.085, 0.145, bVal));
      float inflamed = smoothstep(0.18, 0.65, bVal);
      float dash = 0.62 + 0.38 * step(0.0, sin(vWorldPos.x * 5.2));
      float tenderPulse = 1.0 + inflamed * 0.32 * sin(uMotionTime * 7.5);
      vec3 sulcusCol = mix(uSulcusTint, vec3(1.0, 0.22, 0.34), inflamed * 0.7);
      baseColor = mix(baseColor, sulcusCol, clamp((sulcusBand * 0.36 + inflamed * 0.34) * tenderPulse, 0.0, 0.78));
      baseColor = mix(baseColor, mix(sulcusCol, vec3(1.0, 0.90, 0.94), 0.42), sulcusEdge * dash * 0.72);
    } else if (uBChannelMode == 2 && bVal > 0.36) {
      // Critical acidic demineralization wash (pH < 5.5 Stephan dip & World 4 Hibiscus pH 4.95); Fluorapatite repels it!
      float pulse = 0.84 + 0.16 * sin(uMotionTime * 4.6);
      float unsealedAcid = bVal * (1.0 - fluorideSeal * 0.88);
      float acidCore = smoothstep(0.38, 0.64, unsealedAcid);
      float acidRim = smoothstep(0.36, 0.50, unsealedAcid) * (1.0 - smoothstep(0.52, 0.69, unsealedAcid));
      float wave = 0.5 + 0.5 * sin(vWorldPos.x * 3.4 + cos(vWorldPos.z * 3.1) * 1.8 - uMotionTime * 4.2);
      vec3 acidCol = mix(uAcidWashTint * 0.88, uAcidWashTint * 1.38 + vec3(0.24, 0.05, 0.18), wave);
      baseColor = mix(baseColor, acidCol, clamp(acidCore * (0.76 + 0.12 * wave) * pulse, 0.0, 0.88));
      baseColor = mix(baseColor, mix(uAcidWashTint, vec3(1.0, 0.82, 0.96), 0.62), acidRim * 0.92);
      baseColor += vec3(0.12, 0.62, 0.56) * (bVal * fluorideSeal * 0.38 * pulse);
    } else if (uBChannelMode == 3 && bVal > 0.04) {
      // Zero-G quorum-sensing EPS polymer dome: rigid hexagonal shield armor + crisp Floss fracture rim
      float hexA = abs(sin(vWorldPos.x * 4.8) * cos(vWorldPos.z * 4.8));
      float qHex = smoothstep(0.12, 0.55, hexA);
      float domeCore = smoothstep(0.32, 0.90, bVal);
      float fractureRim = smoothstep(0.05, 0.42, bVal) * (1.0 - smoothstep(0.48, 0.88, bVal));
      vec3 epsCell = mix(uEpsDomeTint * 0.72, uEpsDomeTint * 1.28 + vec3(0.14, 0.18, 0.32), qHex);
      baseColor = mix(baseColor, epsCell, domeCore * 0.74);
      float domeSpec = pow(max(dot(N, H1), 0.0), 46.0) * 0.62 * domeCore;
      baseColor += vec3(0.76, 0.84, 1.0) * (fractureRim * 0.82 + domeSpec + fresnel * domeCore * 0.34);
    }

    // Companion acid stress visual warning when shields are eroded
    if (uAcidStress > 0.01) {
      float stressPulse = 0.55 + 0.45 * sin(uMotionTime * 4.2 + vWorldPos.x * 0.4);
      baseColor = mix(baseColor, vec3(0.94, 0.36, 0.24), uAcidStress * 0.36 * stressPulse);
    }

    // Mirror-wet saliva dual-lobe specular on clean hydroxyapatite vs dull sheen on plaque
    float cleanSpec1 = pow(max(dot(N, H1), 0.0), 92.0) * 0.92;
    float cleanSpec2 = uDetail > 0 ? pow(max(dot(N, H2), 0.0), 34.0) * 0.32 : 0.0;
    float dullSpec = pow(max(dot(N, H1), 0.0), 9.0) * 0.14;
    float spec = mix(cleanSpec1 + cleanSpec2, dullSpec, plaqueMask);
    baseColor += vec3(0.94, 0.99, 1.0) * spec;

    // Wet saliva meniscus glint pooled along the gingival collar (vVertColor.b near 0)
    float collarMeniscus = (1.0 - smoothstep(0.04, 0.2, vVertColor.b)) * (1.0 - plaqueMask);
    baseColor += vec3(0.85, 0.97, 1.0) * collarMeniscus * (0.08 + 0.5 * pow(max(dot(N, H1), 0.0), 26.0));

    // Liquid contour meniscus rim right along the scrubbed plaque boundary!
    float contourEdge = smoothstep(0.07, 0.105, rawPlaque) * (1.0 - smoothstep(0.115, 0.16, rawPlaque));
    baseColor += vec3(0.55, 0.96, 0.92) * contourEdge * 0.42;

    // Enamel prism / perikymata micro-shimmer on glassy clean enamel (smoothness >= 85%)
    float shimmerGate = (uGlobalSmoothnessOverride >= 0.0 ? smoothstep(0.84, 0.9, uGlobalSmoothnessOverride) : 1.0) * (1.0 - plaqueMask);
    if (uDetail > 1 && shimmerGate > 0.01) {
      float perik = 0.5 + 0.5 * sin(dot(vWorldPos, vec3(0.35, 1.0, 0.22)) * 44.0 + valueNoise(vWorldPos.xz * 1.8) * 4.0);
      float prism = valueNoise(vWorldPos.xz * 31.0 + vWorldPos.y * 17.0);
      float glint = pow(max(dot(N, H1), 0.0), 20.0) + pow(max(dot(N, H2), 0.0), 26.0) * 0.5;
      float sparkle = smoothstep(0.84, 0.97, prism) * (0.55 + 0.45 * sin(uMotionTime * 3.2 + prism * 23.0));
      baseColor += vec3(0.78, 0.93, 1.0) * shimmerGate * (perik * glint * 0.16 + sparkle * (0.12 + glint * 0.9));
    }

    // Bubbling white-cyan foam trails along recently scrubbed boundaries
    float foam = 0.0;
    for (int i = 0; i < 12; i += (uDetail == 0 ? 2 : 1)) {
      vec4 fm = uFoam[i];
      if (fm.w <= 0.0) continue;
      float age = uTime - fm.z;
      if (age < 0.0 || age > 2.4) continue;
      float d = distance(vWorldPos.xz, fm.xy);
      float fall = 1.0 - smoothstep(0.5, 2.1, d);
      foam = max(foam, fall * (1.0 - age / 2.4) * fm.w);
    }
    if (foam > 0.01) {
      vec2 q = vWorldPos.xz * 5.5 + vec2(uMotionTime * 0.35, -uMotionTime * 0.22);
      float b1 = valueNoise(q);
      float b2 = valueNoise(q * 2.4 + 4.1);
      float bub = b1 * 0.62 + b2 * 0.5;
      float bubbles = smoothstep(0.5, 0.78, bub);
      float rimRing = smoothstep(0.62, 0.7, bub) * (1.0 - smoothstep(0.7, 0.78, bub));
      float boundary = 0.45 + 1.4 * contourEdge + 0.5 * (1.0 - plaqueMask);
      baseColor = mix(baseColor, vec3(0.93, 1.0, 1.0), clamp(foam * bubbles * 0.5 * boundary, 0.0, 0.85));
      baseColor += vec3(0.4, 0.95, 1.0) * foam * (rimRing * 0.5 + bubbles * 0.08);
    }

    // Companion touch specular ripples radiating across the 3D crowns
    for (int i = 0; i < 4; i++) {
      vec4 rp = uRipples[i];
      float age = uTime - rp.w;
      if (rp.w <= 0.0 || age < 0.0 || age > 1.3) continue;
      float d = distance(vWorldPos, rp.xyz);
      float radius = age * 4.6;
      float ring = 1.0 - smoothstep(0.0, 0.32, abs(d - radius));
      float flash = (1.0 - smoothstep(0.0, 0.7, d)) * (1.0 - smoothstep(0.0, 0.25, age));
      float fade = 1.0 - age / 1.3;
      float smoothGain = 0.35 + 0.65 * (1.0 - plaqueMask);
      baseColor += vec3(0.72, 1.0, 0.96) * (ring * fade * (0.28 + cleanSpec1 * 1.2) + flash * 0.65) * smoothGain;
    }

    float recess = 1.0 - smoothstep(0.08, 0.55, hFrac);
    float side = 1.0 - smoothstep(0.05, 0.78, N.y);
    float ao = clamp(vVertColor.r, 0.33, 1.0) * (1.0 - 0.24 * recess * side);
    baseColor = attenuateOralLight(baseColor * ao, vWorldPos);

    // Two-Tone Clinical Erythrosine Disclosing Bio-Scan (Pink thin pellicle / Violet thick biofilm)
    if (uDiscloseStrength > 0.001) {
      float distD = distance(vWorldPos.xz, uDiscloseOrigin);
      float waveMask = 1.0 - smoothstep(uDiscloseRadius - 1.5, uDiscloseRadius + 0.5, distD);
      float ringLine = smoothstep(uDiscloseRadius - 0.9, uDiscloseRadius - 0.2, distD) *
                       (1.0 - smoothstep(uDiscloseRadius - 0.2, uDiscloseRadius + 0.5, distD));

      vec3 thinPink = vec3(1.0, 0.32, 0.66);
      vec3 thickViolet = vec3(0.54, 0.14, 0.96);
      float violetBlend = smoothstep(0.54, 0.80, rawPlaque);
      vec3 dyeColor = mix(thinPink, thickViolet, violetBlend);
      float dyeShade = clamp(0.70 + 0.34 * NdotL1 + 0.14 * fillDiff, 0.64, 1.12) * mix(1.0, ao, 0.42);
      float dyeAlpha = mix(0.58, 0.80, violetBlend);

      float dyeAmount = smoothstep(0.10, 0.24, rawPlaque) * waveMask * uDiscloseStrength;
      baseColor = mix(baseColor, dyeColor * dyeShade, dyeAmount * dyeAlpha);
      baseColor += vec3(0.98, 0.44, 0.84) * ringLine * uDiscloseStrength * 0.65;
    }

    // Expanding Turquoise Fluoride-Bicarb Ion Rinse Wave
    if (uRinseStrength > 0.001) {
      float distR = distance(vWorldPos.xz, uRinseOrigin);
      float rinseBand = smoothstep(uRinseRadius - 1.8, uRinseRadius - 0.3, distR) *
                        (1.0 - smoothstep(uRinseRadius - 0.3, uRinseRadius + 0.4, distR));
      baseColor += vec3(0.18, 0.96, 0.86) * rinseBand * uRinseStrength * 0.85;
      if (uBufferedRinse) {
        float echoRadius = uRinseRadius - 2.4;
        float echo = 1.0 - smoothstep(0.14, 0.56, abs(distR - echoRadius));
        baseColor += vec3(0.68, 0.93, 1.0) * echo * smoothstep(0.0, 1.1, echoRadius) * uRinseStrength;
      }
    }

    // District Seal: a mint sweep crosses the district once, then a steady 24k gold crown boundary stays.
    for (int di = 0; di < 4; di++) {
      float age = uSealAge[di];
      if (age < 0.0) continue;
      vec4 bx = uDistrictBox[di];
      vec2 q = vWorldPos.xz;
      if (q.x < bx.x - 0.4 || q.x > bx.z + 0.4 || q.y < bx.y - 0.4 || q.y > bx.w + 0.4) continue;
      // Inset onto the elevated crown above the coral gingiva collar so all 4 edges stay visible.
      vec2 center = 0.5 * (bx.xy + bx.zw);
      vec2 halfSpan = max(vec2(1.5), 0.5 * (bx.zw - bx.xy) - vec2(1.55));
      float cornerR = min(2.1, min(halfSpan.x, halfSpan.y) * 0.45);
      vec2 dVec = abs(q - center) - (halfSpan - vec2(cornerR));
      float sd = length(max(dVec, 0.0)) + min(max(dVec.x, dVec.y), 0.0) - cornerR;
      float bevel = 1.0 - smoothstep(0.18, 0.64, abs(sd));
      float core = 1.0 - smoothstep(0.0, 0.30, abs(sd));
      float goldGlint = 0.90 + 0.10 * sin(q.x * 1.5 + q.y * 1.5 + uMotionTime * 2.4);
      baseColor = mix(baseColor, baseColor * vec3(0.94, 1.04, 1.04), 0.45);
      baseColor = mix(baseColor, vec3(0.58, 0.36, 0.04), bevel * 0.62);
      baseColor = mix(baseColor, vec3(1.0, 0.80, 0.14) * goldGlint, core * 0.92);
      float sweepX = mix(bx.x, bx.z, clamp(age / 1.3, 0.0, 1.0));
      float sweep = (1.0 - smoothstep(0.0, 2.3, abs(q.x - sweepX))) * (1.0 - step(1.5, age));
      baseColor = mix(baseColor, vec3(0.78, 1.0, 0.93), sweep * 0.72);
    }

    // 2-Minute Sink Brush-Along Quadrant Coaching Highlight (encoded in vVertColor.g: 0.1, 0.3, 0.5, 0.7)
    if (uActiveQuadrant >= 0) {
      int vertQuad = int(floor(vVertColor.g * 4.0 + 0.01));
      if (vertQuad == uActiveQuadrant) {
        float coachPulse = 0.55 + 0.45 * sin(uMotionTime * 5.0);
        baseColor += vec3(0.10, 0.68, 0.75) * (0.18 + 0.18 * coachPulse);
      } else {
        baseColor *= 0.76;
      }
    }

    // Tapped / inspected Companion crown: soft pearlescent mint-gold rim light
    if (uHighlightedTooth > -0.5 && vToothId > 0.5 && abs(vToothId - 1.0 - uHighlightedTooth) < 0.5) {
      // Tint the entire crown, then add a bright gold grazing-angle rim.
      float rim = pow(1.0 - NdotV, 1.65);
      vec3 mint = vec3(0.12, 0.84, 0.56);
      vec3 gold = vec3(1.0, 0.81, 0.29);
      vec3 selected = mix(mint, gold, smoothstep(0.07, 0.68, rim));
      baseColor = mix(baseColor, selected, uHighlightPulse * (0.59 + 0.36 * rim));
    }

    gl_FragColor = vec4(baseColor, 1.0);
  }
`;

// Natural warm-ivory companion enamel & sugary treat-plaque tones (arcade palettes restored on dive)
const COMPANION_ENAMEL_HEX = 0xf8f4ec;
const COMPANION_PELLICLE_HEX = 0xeadb8c;
const COMPANION_BIOFILM_HEX = 0xc7a24a;

export class EnamelBiophysicsMaterial {
  readonly material: THREE.ShaderMaterial;
  private surfaceTexture: THREE.DataTexture;
  private arcadePalette = { enamel: 0xf4fbff, pellicle: 0xd9e35b, biofilm: 0x9fb82c };
  private companionPaletteActive = false;

  constructor(initialGridW = 256, initialGridH = 128) {
    const initialBuf = new Uint8Array(initialGridW * initialGridH * 4);
    for (let i = 0; i < initialGridW * initialGridH; i++) {
      initialBuf[i * 4 + 3] = 255;
    }
    this.surfaceTexture = this.buildDataTexture(initialBuf, initialGridW, initialGridH);

    this.material = new THREE.ShaderMaterial({
      vertexColors: true,
      uniforms: {
        uSurfaceTex: { value: this.surfaceTexture },
        uWorldSize: { value: new THREE.Vector2(64, 32) },
        uTime: { value: 0 },
        uMotionTime: { value: 0 },
        uHeadlamp: { value: new THREE.Vector4() },
        uDepthCue: { value: new THREE.Vector2(18, 0.085) },
        uDetail: { value: 1 },
        uEnamelBase: { value: new THREE.Color(0xf4fbff) },
        uPellicleColor: { value: new THREE.Color(0xd9e35b) },
        uBiofilmColor: { value: new THREE.Color(0x9fb82c) },
        uSulcusTint: { value: new THREE.Color(0xe11d48) },
        uAcidWashTint: { value: new THREE.Color(0xa21caf) },
        uEpsDomeTint: { value: new THREE.Color(0x4338ca) },
        uBChannelMode: { value: 0 },
        uDiscloseOrigin: { value: new THREE.Vector2(0, 0) },
        uDiscloseRadius: { value: 0 },
        uDiscloseStrength: { value: 0 },
        uRinseOrigin: { value: new THREE.Vector2(0, 0) },
        uRinseRadius: { value: 0 },
        uRinseStrength: { value: 0 },
        uBufferedRinse: { value: false },
        uDistrictBox: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) },
        uSealAge: { value: [-1, -1, -1, -1] },
        uGlobalSmoothnessOverride: { value: -1 },
        uGlobalFluorideGlow: { value: 0 },
        uAcidStress: { value: 0 },
        uActiveQuadrant: { value: -1 },
        uHighlightedTooth: { value: -1 },
        uHighlightPulse: { value: 0 },
        uFoam: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, -99, 0)) },
        uRipples: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, -99)) },
        uSplats: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });
    // Meshes without a crown id attribute (arcade stage) read 0 = "not a companion crown"
    this.material.defaultAttributeValues = {
      ...this.material.defaultAttributeValues,
      aToothId: [0],
    };
  }

  /** Softly illuminates one Companion crown (0..13); pass null to clear. */
  setHighlightedTooth(index: number | null, pulse01 = 1): void {
    const u = this.material.uniforms;
    u.uHighlightedTooth.value = index === null ? -1 : index;
    u.uHighlightPulse.value = index === null ? 0 : Math.max(0, Math.min(1, pulse01));
  }

  private buildDataTexture(
    rgbaBuffer: Uint8Array,
    gridW: number,
    gridH: number
  ): THREE.DataTexture {
    const tex = new THREE.DataTexture(
      rgbaBuffer as unknown as Uint8Array<ArrayBuffer>,
      gridW,
      gridH,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  bindGridBuffer(
    rgbaBuffer: Uint8Array,
    gridW: number,
    gridH: number,
    worldWidth: number,
    worldDepth: number,
    palette: WorldVisualPalette,
    bChannelMode: BChannelMode
  ): void {
    this.surfaceTexture.dispose();
    this.surfaceTexture = this.buildDataTexture(rgbaBuffer, gridW, gridH);
    const u = this.material.uniforms;
    u.uSurfaceTex.value = this.surfaceTexture;
    (u.uWorldSize.value as THREE.Vector2).set(worldWidth, worldDepth);
    this.arcadePalette = {
      enamel: palette.enamelBaseHex,
      pellicle: palette.pellicleSlimeHex,
      biofilm: palette.matureBiofilmHex,
    };
    this.companionPaletteActive = false;
    (u.uEnamelBase.value as THREE.Color).setHex(palette.enamelBaseHex);
    (u.uPellicleColor.value as THREE.Color).setHex(palette.pellicleSlimeHex);
    (u.uBiofilmColor.value as THREE.Color).setHex(palette.matureBiofilmHex);
    (u.uSulcusTint.value as THREE.Color).setHex(pickSulcusTint(palette));
    (u.uAcidWashTint.value as THREE.Color).setHex(pickAcidWashTint(palette));
    (u.uEpsDomeTint.value as THREE.Color).setHex(pickEpsDomeTint(palette));
    u.uBChannelMode.value = B_MODE_INDEX[bChannelMode];
  }

  markTextureNeedsUpdate(): void {
    this.surfaceTexture.needsUpdate = true;
  }

  setCompanionOverride(params: {
    active: boolean;
    smoothness01?: number;
    fluorideGlow01?: number;
    acidStress01?: number;
    activeQuadrant?: number;
  }): void {
    const u = this.material.uniforms;
    if (params.active !== this.companionPaletteActive) {
      this.companionPaletteActive = params.active;
      const pal = params.active
        ? { enamel: COMPANION_ENAMEL_HEX, pellicle: COMPANION_PELLICLE_HEX, biofilm: COMPANION_BIOFILM_HEX }
        : this.arcadePalette;
      (u.uEnamelBase.value as THREE.Color).setHex(pal.enamel);
      (u.uPellicleColor.value as THREE.Color).setHex(pal.pellicle);
      (u.uBiofilmColor.value as THREE.Color).setHex(pal.biofilm);
    }
    if (!params.active) {
      u.uGlobalSmoothnessOverride.value = -1;
      u.uGlobalFluorideGlow.value = 0;
      u.uAcidStress.value = 0;
      u.uActiveQuadrant.value = -1;
      return;
    }
    u.uGlobalSmoothnessOverride.value = params.smoothness01 ?? 0.95;
    u.uGlobalFluorideGlow.value = params.fluorideGlow01 ?? 0.35;
    u.uAcidStress.value = params.acidStress01 ?? 0;
    u.uActiveQuadrant.value = params.activeQuadrant ?? -1;
  }

  updateFrameUniforms(params: {
    nowSec: number;
    discloseOriginX: number;
    discloseOriginZ: number;
    discloseRadius: number;
    discloseStrength: number;
    rinseOriginX: number;
    rinseOriginZ: number;
    rinseRadius: number;
    rinseStrength: number;
    bufferedRinse?: boolean;
    acidStress?: number;
  }): void {
    const u = this.material.uniforms;
    u.uTime.value = params.nowSec;
    (u.uDiscloseOrigin.value as THREE.Vector2).set(
      params.discloseOriginX,
      params.discloseOriginZ
    );
    u.uDiscloseRadius.value = params.discloseRadius;
    u.uDiscloseStrength.value = params.discloseStrength;
    (u.uRinseOrigin.value as THREE.Vector2).set(params.rinseOriginX, params.rinseOriginZ);
    u.uRinseRadius.value = params.rinseRadius;
    u.uRinseStrength.value = params.rinseStrength;
    u.uBufferedRinse.value = params.bufferedRinse ?? false;
    if (params.acidStress !== undefined) {
      u.uAcidStress.value = params.acidStress;
    }
  }

  /** Publishes district rectangles and seal ages (seconds, negative = still open). */
  setDistrictSeals(
    boxes: ReadonlyArray<{ minX: number; minZ: number; maxX: number; maxZ: number }>,
    ages: ReadonlyArray<number>
  ): void {
    const boxArr = this.material.uniforms.uDistrictBox.value as THREE.Vector4[];
    const ageArr = this.material.uniforms.uSealAge.value as number[];
    for (let i = 0; i < 4; i++) {
      const b = boxes[i];
      if (b) boxArr[i].set(b.minX, b.minZ, b.maxX, b.maxZ);
      ageArr[i] = b && ages[i] !== undefined ? ages[i] : -1;
    }
  }

  /** Writes recently-scrubbed foam trail samples (x, z, birthTime, strength). */
  setFoamSamples(samples: ReadonlyArray<{ x: number; z: number; t: number; s: number }>): void {
    const arr = this.material.uniforms.uFoam.value as THREE.Vector4[];
    for (let i = 0; i < arr.length; i++) {
      const f = samples[i];
      if (f) arr[i].set(f.x, f.z, f.t, f.s);
      else arr[i].set(0, 0, -99, 0);
    }
  }

  /** Writes companion touch ripple origins (world xyz, start time). */
  setRipples(ripples: ReadonlyArray<{ x: number; y: number; z: number; t: number }>): void {
    const arr = this.material.uniforms.uRipples.value as THREE.Vector4[];
    for (let i = 0; i < arr.length; i++) {
      const r = ripples[i];
      if (r) arr[i].set(r.x, r.y, r.z, r.t);
      else arr[i].set(0, 0, 0, -99);
    }
  }

  /** Writes companion sugar-plaque splats (world xyz, amount 0..1). */
  setSplats(splats: ReadonlyArray<{ x: number; y: number; z: number; amount: number }>): void {
    const arr = this.material.uniforms.uSplats.value as THREE.Vector4[];
    for (let i = 0; i < arr.length; i++) {
      const sp = splats[i];
      if (sp) arr[i].set(sp.x, sp.y, sp.z, Math.max(0, Math.min(1, sp.amount)));
      else arr[i].set(0, 0, 0, 0);
    }
  }

  dispose(): void {
    this.surfaceTexture.dispose();
    this.material.dispose();
  }
}
