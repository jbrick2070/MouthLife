import * as THREE from 'three';
import type { BChannelMode, WorldVisualPalette } from '../types';

const B_MODE_INDEX: Record<BChannelMode, number> = {
  marginDensity: 0,
  gumIrritation: 1,
  localPh: 2,
  epsArmor: 3,
};

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vVertColor;

  void main() {
    vVertColor = color;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uSurfaceTex;
  uniform vec2 uWorldSize;
  uniform float uTime;

  uniform vec3 uEnamelBase;
  uniform vec3 uPellicleColor;
  uniform vec3 uBiofilmColor;
  uniform int uBChannelMode;

  uniform vec2 uDiscloseOrigin;
  uniform float uDiscloseRadius;
  uniform float uDiscloseStrength;

  uniform vec2 uRinseOrigin;
  uniform float uRinseRadius;
  uniform float uRinseStrength;

  uniform float uGlobalSmoothnessOverride;
  uniform float uGlobalFluorideGlow;
  uniform float uAcidStress;
  uniform int uActiveQuadrant;

  // Recently-scrubbed bubbling foam trail samples: (x, z, birthTime, strength)
  uniform vec4 uFoam[12];
  // Companion touch specular ripples: (x, y, z, startTime)
  uniform vec4 uRipples[4];
  // Companion Regional Treat sugar-plaque splats: (x, y, z, amount 0..1)
  uniform vec4 uSplats[6];

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vVertColor;

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

    // Crisp liquid-to-glassy contour magnification right around CLEAN_THRESHOLD = 0.10
    float plaqueMask = smoothstep(0.085, 0.135, rawPlaque);
    float matureBiofilm = smoothstep(0.42, 0.85, rawPlaque);

    // Procedural micro-bump normal perturbation ONLY where plaque exists
    float n1 = valueNoise(vWorldPos.xz * 3.8);
    float n2 = valueNoise(vWorldPos.xz * 9.5 + vec2(4.2, 1.9));
    float microTex = n1 * 0.65 + n2 * 0.35;

    vec3 N = normalize(vWorldNormal);
    if (plaqueMask > 0.01) {
      vec3 bumpOffset = vec3(n1 - 0.5, 0.0, n2 - 0.5) * (0.38 * plaqueMask);
      N = normalize(N + bumpOffset);
    }

    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L1 = normalize(vec3(0.36, 0.86, 0.35));
    vec3 L2 = normalize(vec3(-0.48, 0.62, -0.62));
    vec3 H1 = normalize(L1 + V);
    vec3 H2 = normalize(L2 + V);

    float NdotL1 = max(dot(N, L1), 0.0);
    float NdotV = max(dot(N, V), 0.0);

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
    cleanEnamel = mix(cleanEnamel, opalBlue, incisal * 0.86 * cleanFactor);

    // Translucent bluish-ivory enamel edge scattering
    cleanEnamel += vec3(0.16, 0.28, 0.38) * fresnel * (1.0 - plaqueMask);

    // Fluorapatite crystalline iridescent mint-cyan sheen
    if (fluorideSeal > 0.05) {
      float hexShimmer = 0.5 + 0.5 * sin(vWorldPos.x * 5.2 + vWorldPos.z * 5.2 + uTime * 2.1);
      cleanEnamel += vec3(0.08, 0.40, 0.36) * fluorideSeal * (0.40 + 0.65 * fresnel) * (0.72 + 0.28 * hexShimmer);
    }

    // Plaque & mature biofilm albedo
    vec3 slimeAlbedo = mix(uPellicleColor, uBiofilmColor, matureBiofilm);
    slimeAlbedo *= (0.78 + 0.34 * microTex);
    vec3 plaqueLit = slimeAlbedo * (0.34 + 0.62 * NdotL1 + 0.20 * fillDiff);

    vec3 baseColor = mix(cleanEnamel, plaqueLit, plaqueMask);

    // B-channel biophysical cue tinting
    if (uBChannelMode == 0 && bVal > 0.1 && plaqueMask > 0.2) {
      // Cervical margin / fissure amber density cue
      baseColor = mix(baseColor, vec3(0.86, 0.68, 0.20), bVal * 0.22 * plaqueMask);
    } else if (uBChannelMode == 1 && bVal > 0.05) {
      // Gingival irritation warm coral flush
      baseColor = mix(baseColor, vec3(0.95, 0.32, 0.42), bVal * 0.45);
    } else if (uBChannelMode == 2 && bVal > 0.05) {
      // Acidic demineralization warning glow (pH < 5.5); Fluorapatite (pH 4.5 stable) repels it!
      float pulse = 0.65 + 0.35 * sin(uTime * 5.5);
      float unsealedAcid = bVal * (1.0 - fluorideSeal * 0.85);
      baseColor = mix(baseColor, vec3(0.98, 0.42, 0.22), unsealedAcid * 0.44 * pulse);
      baseColor += vec3(0.10, 0.50, 0.46) * (bVal * fluorideSeal * 0.30 * pulse);
    } else if (uBChannelMode == 3 && bVal > 0.04) {
      // Zero-G quorum-sensing EPS polymer dome: bioluminescent matrix + glowing Floss fracture rim
      float qHex = 0.5 + 0.5 * (sin(vWorldPos.x * 4.6 + uTime * 1.8) * cos(vWorldPos.z * 4.6 - uTime * 1.4));
      float domeCore = smoothstep(0.35, 0.92, bVal);
      float fractureRim = smoothstep(0.05, 0.42, bVal) * (1.0 - smoothstep(0.48, 0.88, bVal));
      vec3 epsTint = mix(vec3(0.10, 0.62, 0.56), vec3(0.44, 0.26, 0.88), qHex * 0.65);
      baseColor = mix(baseColor, epsTint, domeCore * (0.50 + 0.16 * qHex));
      float domeSpec = pow(max(dot(N, H1), 0.0), 42.0) * 0.55 * domeCore;
      baseColor += vec3(0.45, 1.0, 0.88) * (fractureRim * 0.72 + domeSpec + fresnel * domeCore * 0.28);
    }

    // Companion acid stress visual warning when shields are eroded
    if (uAcidStress > 0.01) {
      float stressPulse = 0.55 + 0.45 * sin(uTime * 4.2 + vWorldPos.x * 0.4);
      baseColor = mix(baseColor, vec3(0.94, 0.36, 0.24), uAcidStress * 0.36 * stressPulse);
    }

    // Mirror-wet saliva dual-lobe specular on clean hydroxyapatite vs dull sheen on plaque
    float cleanSpec1 = pow(max(dot(N, H1), 0.0), 92.0) * 0.92;
    float cleanSpec2 = pow(max(dot(N, H2), 0.0), 48.0) * 0.32;
    float dullSpec = pow(max(dot(N, H1), 0.0), 9.0) * 0.14;
    float spec = mix(cleanSpec1 + cleanSpec2, dullSpec, plaqueMask);
    baseColor += vec3(0.94, 0.99, 1.0) * spec;

    // Liquid contour meniscus rim right along the scrubbed plaque boundary!
    float contourEdge = smoothstep(0.07, 0.105, rawPlaque) * (1.0 - smoothstep(0.115, 0.16, rawPlaque));
    baseColor += vec3(0.55, 0.96, 0.92) * contourEdge * 0.42;

    // Enamel prism / perikymata micro-shimmer on glassy clean enamel (smoothness >= 85%)
    float shimmerGate = (uGlobalSmoothnessOverride >= 0.0 ? smoothstep(0.84, 0.9, uGlobalSmoothnessOverride) : 1.0) * (1.0 - plaqueMask);
    if (shimmerGate > 0.01) {
      float perik = 0.5 + 0.5 * sin(dot(vWorldPos, vec3(0.35, 1.0, 0.22)) * 44.0 + valueNoise(vWorldPos.xz * 1.8) * 4.0);
      float prism = valueNoise(vWorldPos.xz * 31.0 + vWorldPos.y * 17.0);
      float glint = pow(max(dot(N, H1), 0.0), 20.0) + pow(max(dot(N, H2), 0.0), 26.0) * 0.5;
      float sparkle = smoothstep(0.84, 0.97, prism) * (0.55 + 0.45 * sin(uTime * 3.2 + prism * 23.0));
      baseColor += vec3(0.78, 0.93, 1.0) * shimmerGate * (perik * glint * 0.16 + sparkle * (0.12 + glint * 0.9));
    }

    // Bubbling white-cyan foam trails along recently scrubbed boundaries
    float foam = 0.0;
    for (int i = 0; i < 12; i++) {
      vec4 fm = uFoam[i];
      if (fm.w <= 0.0) continue;
      float age = uTime - fm.z;
      if (age < 0.0 || age > 2.4) continue;
      float d = distance(vWorldPos.xz, fm.xy);
      float fall = 1.0 - smoothstep(0.5, 2.1, d);
      foam = max(foam, fall * (1.0 - age / 2.4) * fm.w);
    }
    if (foam > 0.01) {
      vec2 q = vWorldPos.xz * 5.5 + vec2(uTime * 0.35, -uTime * 0.22);
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

    // Two-Tone Clinical Erythrosine Disclosing Bio-Scan (Pink thin pellicle / Violet thick biofilm)
    if (uDiscloseStrength > 0.001) {
      float distD = distance(vWorldPos.xz, uDiscloseOrigin);
      float waveMask = 1.0 - smoothstep(uDiscloseRadius - 1.5, uDiscloseRadius + 0.5, distD);
      float ringLine = smoothstep(uDiscloseRadius - 0.9, uDiscloseRadius - 0.2, distD) *
                       (1.0 - smoothstep(uDiscloseRadius - 0.2, uDiscloseRadius + 0.5, distD));

      vec3 thinPink = vec3(1.0, 0.26, 0.62);
      vec3 thickViolet = vec3(0.58, 0.16, 0.96);
      vec3 dyeColor = mix(thinPink, thickViolet, smoothstep(0.38, 0.72, rawPlaque));

      float dyeAmount = smoothstep(0.10, 0.22, rawPlaque) * waveMask * uDiscloseStrength;
      baseColor = mix(baseColor, dyeColor, dyeAmount * 0.78);
      baseColor += vec3(0.95, 0.38, 0.82) * ringLine * uDiscloseStrength * 0.65;
    }

    // Expanding Turquoise Fluoride-Bicarb Ion Rinse Wave
    if (uRinseStrength > 0.001) {
      float distR = distance(vWorldPos.xz, uRinseOrigin);
      float rinseBand = smoothstep(uRinseRadius - 1.8, uRinseRadius - 0.3, distR) *
                        (1.0 - smoothstep(uRinseRadius - 0.3, uRinseRadius + 0.4, distR));
      baseColor += vec3(0.18, 0.96, 0.86) * rinseBand * uRinseStrength * 0.85;
    }

    // 2-Minute Sink Brush-Along Quadrant Coaching Highlight (encoded in vVertColor.g: 0.1, 0.3, 0.5, 0.7)
    if (uActiveQuadrant >= 0) {
      int vertQuad = int(floor(vVertColor.g * 4.0 + 0.01));
      if (vertQuad == uActiveQuadrant) {
        float coachPulse = 0.55 + 0.45 * sin(uTime * 5.0);
        baseColor += vec3(0.10, 0.68, 0.75) * (0.18 + 0.18 * coachPulse);
      } else {
        baseColor *= 0.76;
      }
    }

    // Apply baked vertex cavity AO stored in vVertColor.r
    float ao = clamp(vVertColor.r, 0.38, 1.0);
    baseColor *= ao;

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
        uEnamelBase: { value: new THREE.Color(0xf4fbff) },
        uPellicleColor: { value: new THREE.Color(0xd9e35b) },
        uBiofilmColor: { value: new THREE.Color(0x9fb82c) },
        uBChannelMode: { value: 0 },
        uDiscloseOrigin: { value: new THREE.Vector2(0, 0) },
        uDiscloseRadius: { value: 0 },
        uDiscloseStrength: { value: 0 },
        uRinseOrigin: { value: new THREE.Vector2(0, 0) },
        uRinseRadius: { value: 0 },
        uRinseStrength: { value: 0 },
        uGlobalSmoothnessOverride: { value: -1 },
        uGlobalFluorideGlow: { value: 0 },
        uAcidStress: { value: 0 },
        uActiveQuadrant: { value: -1 },
        uFoam: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, -99, 0)) },
        uRipples: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, -99)) },
        uSplats: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });
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
    if (params.acidStress !== undefined) {
      u.uAcidStress.value = params.acidStress;
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
