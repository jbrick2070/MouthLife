import {
  pickAcidPoolTint,
  pickAlleyReticleTint,
  pickBridgeTint,
  pickColonyBeaconTint,
  pickColonyRestoredTint,
  pickSpringTint,
  pickSucroseTint,
} from './landmarkContrast';
import * as THREE from 'three';
import {
  BRUSH_BASE_ARC_RAD,
  BRUSH_BASE_RADIUS,
  BRUSH_BASS_ARC_RAD,
  MAX_PARTICLES_ULTRA,
  QUALITY_TIER_SPECS,
  SITE_RESTORE_CLEAN_RATIO,
  SMOOTH_BASK_THRESHOLD,
  SURGE_MAX,
} from '../../config/gameConfig';
import { findNearestZipMouth, sampleTerrainHeight } from '../physics/CollisionSystem';
import type { WorldSession } from '../sim/WorldSession';
import type { AppMode, QualityTier, WorldCartridge } from '../types';
import { mergeBufferGeometriesSimple } from './CartridgeMeshBuilder';

interface ParticleSlot {
  active: boolean;
  ambient: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

interface ShardSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  spin: number;
  age: number;
  life: number;
  size: number;
  floorY: number;
}

const MAX_SHARDS = 48;

// ---------------------------------------------------------------------------------------------
// Shared single-pass lit prop shader (instancing + optional vertex colors, pearlescent
// iridescence & emissive glow) — zero extra passes, zero shadow maps.
// ---------------------------------------------------------------------------------------------
const LIT_PROP_VERT = /* glsl */ `
  #ifdef HYDRA_PARTS
    attribute float aProbePart;
    uniform float uRingSpin;
    uniform float uCoreScale;
    varying float vProbePart;

    mat2 spinRing(float angle) {
      return mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
    }
  #endif

  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vInstColor;
  void main() {
    vInstColor = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      vInstColor *= instanceColor;
    #endif
    #ifdef USE_COLOR
      vInstColor *= color;
    #endif

    vec4 localPos = vec4(position, 1.0);
    vec3 localNorm = normal;
    #ifdef HYDRA_PARTS
      vProbePart = aProbePart;
      if (aProbePart == 3.0) {
        localPos.xyz = position * uCoreScale + vec3(0.24, 0.30, 0.0);
      } else if (aProbePart > 0.0) {
        mat2 spin = spinRing(uRingSpin * (aProbePart == 1.0 ? 1.0 : -1.35));
        localPos.yz = spin * localPos.yz;
        localNorm.yz = spin * localNorm.yz;
        localPos.xyz += vec3(-0.78, 0.02, 0.0);
      }
    #endif
    #ifdef USE_INSTANCING
      localPos = instanceMatrix * localPos;
      localNorm = mat3(instanceMatrix) * localNorm;
    #endif
    vec4 wp = modelMatrix * localPos;
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * localNorm);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const LIT_PROP_FRAG = /* glsl */ `
  #ifdef HYDRA_PARTS
    uniform vec3 uCoreColor;
    varying float vProbePart;
  #endif

  uniform vec3 uBaseColor;
  uniform float uOpacity;
  uniform float uIridescence;
  uniform float uEmissive;
  uniform float uTime;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vInstColor;
  void main() {
    #ifdef HYDRA_PARTS
      if (vProbePart > 2.5) {
        gl_FragColor = linearToOutputTexel(vec4(uCoreColor, 1.0));
        return;
      }
    #endif

    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(vec3(0.42, 0.85, 0.38));
    vec3 H = normalize(L + V);
    float NdotV = max(dot(N, V), 0.0);
    float wrap = max(0.0, (dot(N, L) + 0.5) / 1.5);
    float spec = pow(max(dot(N, H), 0.0), 46.0) * 0.65;
    float rim = pow(1.0 - NdotV, 2.5) * 0.38;
    vec3 albedo = uBaseColor * vInstColor;
    vec3 col = albedo * (0.38 + 0.72 * wrap) + vec3(0.88, 0.98, 1.0) * (spec + rim);
    if (uIridescence > 0.0) {
      float f = 1.0 - NdotV;
      vec3 irid = 0.5 + 0.5 * cos(6.2831 * (f * 1.4 + vec3(0.0, 0.33, 0.67)) + uTime * 0.7);
      col = mix(col, col * 0.55 + irid * 0.75, uIridescence * (0.35 + 0.65 * f));
    }
    col += albedo * uEmissive;
    gl_FragColor = vec4(col, uOpacity);
  }
`;

export function createCrystalLitMaterial(
  colorHex = 0xffffff,
  opacity = 1.0,
  opts: { vertexColors?: boolean; iridescence?: number; emissive?: number } = {}
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: opacity < 0.999,
    vertexColors: Boolean(opts.vertexColors),
    uniforms: {
      uBaseColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: opacity },
      uIridescence: { value: opts.iridescence ?? 0 },
      uEmissive: { value: opts.emissive ?? 0 },
      uTime: { value: 0 },
    },
    vertexShader: LIT_PROP_VERT,
    fragmentShader: LIT_PROP_FRAG,
  });
}

// Faceted refractive sucrose crystal shader: flat facets, dispersion fringes & inner sparkle.
const CRYSTAL_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vInstColor;
  float h31(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(vec3(0.42, 0.85, 0.38));
    vec3 L2 = normalize(vec3(-0.52, 0.65, -0.55));
    float NdotV = max(dot(N, V), 0.0);
    float facet = h31(floor(N * 7.0));
    vec3 R = reflect(-V, N);
    vec3 T = refract(-V, N, 0.66);
    float caustic = pow(max(dot(T, L), 0.0), 5.0);
    float glint = pow(max(dot(R, L), 0.0), 42.0) + pow(max(dot(R, L2), 0.0), 36.0) * 0.65;
    vec3 disp = 0.5 + 0.5 * cos(6.2831 * (dot(T, vec3(0.3, 0.6, 0.2)) * 2.4 + vec3(0.0, 0.33, 0.67) + uTime * 0.25));
    vec3 body = vInstColor * (0.42 + 0.52 * facet);
    vec3 col = body + disp * (0.28 + 0.52 * caustic) * (1.0 - NdotV * 0.4);
    col += vec3(1.0) * glint * 2.1;
    col += vec3(1.0, 0.88, 0.96) * pow(1.0 - NdotV, 2.6) * 0.72;
    float twinkle = smoothstep(0.86, 0.98, fract(facet * 19.0 + uTime * 1.35 + dot(vWorldPos, vec3(0.7, 1.1, 0.5))));
    col += vec3(1.0, 0.98, 1.0) * twinkle * 0.85;
    gl_FragColor = vec4(col, 0.95);
  }
`;

// Taut glowing C-curve floss filament: a strip bent in the vertex shader (no per-frame geometry).
const FLOSS_VERT = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uBend;
  uniform float uWidth;
  uniform float uTime;
  varying float vSide;
  varying float vT;
  void main() {
    float t = position.x + 0.5;
    vec3 ab = uB - uA;
    vec3 dir = normalize(ab);
    vec3 side = normalize(cross(dir, vec3(0.0, 1.0, 0.0)));
    float c = sin(3.14159 * t);
    vec3 p = uA + ab * t + side * c * uBend;
    p.y += c * 0.22 + sin(t * 46.0 - uTime * 38.0) * 0.018 * (1.0 - abs(uBend));
    vec3 tangent = normalize(dir * length(ab) + side * cos(3.14159 * t) * 3.14159 * uBend);
    vec3 toCam = normalize(cameraPosition - p);
    vec3 wdir = normalize(cross(tangent, toCam));
    p += wdir * position.y * uWidth;
    vSide = position.y * 2.0;
    vT = t;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;
const FLOSS_FRAG = /* glsl */ `
  uniform float uOpacity;
  uniform float uTime;
  varying float vSide;
  varying float vT;
  void main() {
    float core = exp(-pow(vSide * 3.2, 2.0));
    float halo = exp(-pow(vSide * 1.3, 2.0)) * 0.45;
    float pulse = 0.75 + 0.25 * sin(vT * 30.0 - uTime * 24.0);
    vec3 col = mix(vec3(0.25, 0.85, 1.0), vec3(1.0), core) * (core + halo) * pulse;
    gl_FragColor = vec4(col, uOpacity * (core + halo));
  }
`;

function createRadialShadowTexture(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const d = Math.min(1, Math.hypot(dx, dy));
      const alpha = Math.pow(1 - d, 2.2) * 0.42;
      const idx = (y * size + x) * 4;
      data[idx] = 4;
      data[idx + 1] = 18;
      data[idx + 2] = 28;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

/** Detailed HYDRA-1 micro-dental craft hull merged into ONE vertex-colored geometry. */
function buildHydraHullGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const hull = new THREE.SphereGeometry(0.6, 22, 14);
  hull.scale(1.25, 0.6, 0.92);
  parts.push(paint(hull, 0xe8f6ff));

  const keel = new THREE.SphereGeometry(0.5, 16, 10);
  keel.scale(1.1, 0.42, 0.7);
  keel.translate(-0.08, -0.16, 0);
  parts.push(paint(keel, 0x7dd3fc));

  // Canopy seat ring (the glass dome + Surge core are separate dynamic meshes)
  const seat = new THREE.TorusGeometry(0.33, 0.04, 8, 22);
  seat.rotateX(Math.PI / 2);
  seat.scale(1.25, 1, 0.92);
  seat.translate(0.24, 0.2, 0);
  parts.push(paint(seat, 0x0e7490));

  for (const side of [-1, 1]) {
    const pod = new THREE.CapsuleGeometry(0.15, 0.62, 4, 10);
    pod.rotateZ(Math.PI / 2);
    pod.translate(-0.24, -0.02, side * 0.66);
    parts.push(paint(pod, 0xbae6fd));
    const strut = new THREE.BoxGeometry(0.34, 0.06, 0.32);
    strut.translate(-0.18, 0.0, side * 0.45);
    parts.push(paint(strut, 0x94a3b8));
    const glow = new THREE.SphereGeometry(0.1, 10, 8);
    glow.translate(-0.62, -0.02, side * 0.66);
    parts.push(paint(glow, 0x5eead4));
  }

  // Brush-head neck & sonic head plate projecting forward-down
  const neck = new THREE.CylinderGeometry(0.07, 0.1, 0.62, 10);
  neck.rotateZ(Math.PI / 2 - 0.42);
  neck.translate(0.82, -0.2, 0);
  parts.push(paint(neck, 0xcbd5e1));
  const head = new THREE.CapsuleGeometry(0.16, 0.4, 4, 10);
  head.rotateX(Math.PI / 2);
  head.scale(1.25, 0.55, 1.0);
  head.translate(1.12, -0.36, 0);
  parts.push(paint(head, 0xf0fdfa));

  // Glowing floss-spool pylons: slim mast + wound spool disc + bead of thread on each pod
  for (const side of [-1, 1]) {
    const mast = new THREE.CylinderGeometry(0.035, 0.05, 0.34, 8);
    mast.translate(-0.24, 0.2, side * 0.66);
    parts.push(paint(mast, 0x94a3b8));
    const spool = new THREE.CylinderGeometry(0.13, 0.13, 0.1, 14);
    spool.rotateX(Math.PI / 2);
    spool.translate(-0.24, 0.4, side * 0.66);
    parts.push(paint(spool, 0xfef3c7));
    const wound = new THREE.TorusGeometry(0.11, 0.035, 6, 14);
    wound.translate(-0.24, 0.4, side * 0.66);
    parts.push(paint(wound, 0x5eead4));
  }
  // Rear emitter collar (static); the spinning rings are separate meshes
  const collar = new THREE.CylinderGeometry(0.1, 0.14, 0.18, 12);
  collar.rotateZ(Math.PI / 2);
  collar.translate(-0.62, 0.02, 0);
  parts.push(paint(collar, 0x475569));

  const merged = mergeBufferGeometriesSimple(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/** Toothed sonic bristle ring (axis = local X) used for both counter-rotating emitter rings. */
function buildSonicRingGeometry(radius: number, teeth: number, hex: number, toothHex: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const ring = new THREE.TorusGeometry(radius, 0.035, 6, 20);
  ring.rotateY(Math.PI / 2);
  parts.push(paint(ring, hex));
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const bristle = new THREE.BoxGeometry(0.05, 0.14, 0.035);
    bristle.translate(0, radius + 0.06, 0);
    bristle.rotateX(a);
    parts.push(paint(bristle, i % 2 === 0 ? toothHex : 0xf0fdfa));
  }
  const merged = mergeBufferGeometriesSimple(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/** Short streptococcal chain of 4 cocci along a gentle arc (one instanced geometry). */
function buildStreptoChainGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 4;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1) - 0.5;
    const s = new THREE.SphereGeometry(0.27 + (i % 2) * 0.02, 12, 10);
    s.translate(u * 1.05, Math.cos(u * 2.2) * 0.12 - 0.06, Math.sin(u * 2.6) * 0.28);
    const shade = i % 2 === 0 ? 0xffffff : 0xe2f5c4;
    parts.push(paint(s, shade));
  }
  const merged = mergeBufferGeometriesSimple(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/** Blooming pearlescent crystal halo: radial petals + thin ring (restored S. sanguinis). */
function buildCrystalHaloGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const petals = 9;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const petal = new THREE.OctahedronGeometry(0.22, 0);
    petal.scale(0.55, 1.5, 0.55);
    petal.rotateZ(-0.6);
    petal.translate(0.95, 0.18, 0);
    petal.rotateY(a);
    parts.push(paint(petal, i % 2 === 0 ? 0xf0fdfa : 0xe9d5ff));
  }
  const ring = new THREE.TorusGeometry(0.95, 0.035, 6, 36);
  ring.rotateX(Math.PI / 2);
  parts.push(paint(ring, 0xccfbf1));
  const merged = mergeBufferGeometriesSimple(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/** Multi-faceted sucrose crystal cluster (flat-shaded facets for sharp refraction). */
function buildSucroseClusterGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const specs: Array<[number, number, number, number, number]> = [
    [0, 0, 0, 1.0, 0],
    [0.38, -0.12, 0.2, 0.62, 0.5],
    [-0.32, -0.16, -0.18, 0.55, -0.45],
    [0.05, -0.2, -0.4, 0.45, 0.9],
  ];
  for (const [x, y, z, s, tilt] of specs) {
    const prism = new THREE.CylinderGeometry(0.0, 0.34 * s, 0.5 * s, 6, 1);
    prism.translate(0, 0.25 * s, 0);
    const base = new THREE.CylinderGeometry(0.34 * s, 0.3 * s, 0.7 * s, 6, 1);
    base.translate(0, -0.1 * s, 0);
    const tip = new THREE.CylinderGeometry(0.3 * s, 0.0, 0.3 * s, 6, 1);
    tip.translate(0, -0.6 * s, 0);
    for (const g of [prism, base, tip]) {
      g.rotateZ(tilt);
      g.translate(x, y + 0.35, z);
      parts.push(paint(g.toNonIndexed(), 0xffffff));
      g.dispose();
    }
  }
  // Faceted inner glow core (bright warm-pink octahedron visible through the prism faces)
  const core = new THREE.OctahedronGeometry(0.2, 0);
  core.translate(0, 0.4, 0);
  parts.push(paint(core, 0xfff7fb));
  core.dispose();
  const merged = mergeBufferGeometriesSimple(parts);
  for (const p of parts) p.dispose();
  merged.computeVertexNormals(); // non-indexed → crisp flat facet normals
  return merged;
}

/** Zip reticle: dashed ring + twin chevrons pointing across the interdental contact. */
function buildZipReticleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const segs = 10;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const arc = new THREE.RingGeometry(0.76, 0.96, 6, 1, a0, ((Math.PI * 2) / segs) * 0.64);
    arc.rotateX(-Math.PI / 2);
    parts.push(paint(arc, 0xffffff));
  }
  for (const off of [0.55, 1.05]) {
    const chev = new THREE.BufferGeometry();
    const v = new Float32Array([
      off, 0, 0, off - 0.34, 0, -0.28, off - 0.18, 0, 0,
      off, 0, 0, off - 0.18, 0, 0, off - 0.34, 0, 0.28,
    ]);
    chev.setAttribute('position', new THREE.BufferAttribute(v, 3));
    chev.computeVertexNormals();
    parts.push(paint(chev, 0xffffff));
  }
  const merged = mergeBufferGeometriesSimple(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/** How many soft contact shadows the enamel shader can draw at once. */
export const MAX_CONTACT_SHADOWS = 16;

export class EntityBatchRenderer {
  readonly arcadeEntitiesGroup = new THREE.Group();
  readonly sharedFxGroup = new THREE.Group();

  // HYDRA-1 articulated micro-dental craft
  private probeGroup = new THREE.Group();
  private probeHullMat: THREE.ShaderMaterial;
  private bristleTuftInst: THREE.InstancedMesh;
  private cockpitDome: THREE.Mesh;
  private ringSpin = 0;
  private tuftRest: Array<{ x: number; z: number }> = [];
  private bristleArcMesh: THREE.Mesh;
  private wakeRingInst: THREE.InstancedMesh;
  private zipReticle: THREE.Mesh;
  private zipReticleMat: THREE.MeshBasicMaterial;

  // C-curve floss filament
  private flossMesh: THREE.Mesh;
  private flossMat: THREE.ShaderMaterial;
  private flossSegmentRef: unknown = null;
  private flossVisualAge = 99;
  private flossZipped = false;

  // Batched InstancedMeshes
  private bridgeInst: THREE.InstancedMesh;
  private mutansInst: THREE.InstancedMesh;
  private mutansAuraInst: THREE.InstancedMesh;
  private siteInst: THREE.InstancedMesh;
  private siteHaloInst: THREE.InstancedMesh;
  private siteHaloMat: THREE.ShaderMaterial;
  private sucroseInst: THREE.InstancedMesh;
  private sucroseMat: THREE.ShaderMaterial;
  private shardInst: THREE.InstancedMesh;
  private shards: ShardSlot[] = [];
  private shardCursor = 0;
  private springInst: THREE.InstancedMesh;
  private beaconInst: THREE.InstancedMesh;
  private acidPoolInst: THREE.InstancedMesh;
  private shadowInst: THREE.InstancedMesh;
  /** Ground-contact spots (x, z, radius) for the enamel shader's soft shadows; see contactShadowCount. */
  readonly contactShadows = Array.from({ length: MAX_CONTACT_SHADOWS }, () => new THREE.Vector3());
  contactShadowCount = 0;
  private shadowTex: THREE.DataTexture;

  private siteRestoredAt = new Map<string, number>();
  private trackedCartridge: WorldCartridge | null = null;

  // Hitch-free pre-allocated particle pool
  private particleInst: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;
  private activeParticleCap = QUALITY_TIER_SPECS.medium.particleCap;
  private breezeEmitTimer = 0;
  private motePhase = 0;
  private qualityTier: QualityTier = 'medium';

  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();
  private tmpColorB = new THREE.Color();
  private activeSucroseHex = 0xf9a8d4;
  private tmpMat = new THREE.Matrix4();
  private timedMaterials: THREE.ShaderMaterial[] = [];

  constructor() {
    // The hull, counter-rotating rings and Surge core share one opaque draw.
    const parts = [
      buildHydraHullGeometry(),
      buildSonicRingGeometry(0.27, 12, 0x22d3ee, 0x67e8f9),
      buildSonicRingGeometry(0.16, 8, 0x0ea5e9, 0xa5f3fc),
      new THREE.IcosahedronGeometry(0.11, 1),
    ];
    const hull = mergeBufferGeometriesSimple(parts);
    const partIds = new Float32Array(hull.attributes.position.count);
    let offset = 0;
    parts.forEach((geometry, id) => {
      const count = geometry.index?.count ?? geometry.attributes.position.count;
      partIds.fill(id, offset, offset + count);
      offset += count;
      geometry.dispose();
    });
    hull.setAttribute('aProbePart', new THREE.BufferAttribute(partIds, 1));
    // Keep all articulated positions inside the conservative hull bounds.
    hull.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.5);

    this.probeHullMat = createCrystalLitMaterial(0xffffff, 1, { vertexColors: true });
    this.probeHullMat.defaultAttributeValues.aProbePart = [0];
    const uniforms = this.probeHullMat.uniforms;
    uniforms.uRingSpin = { value: 0 };
    uniforms.uCoreScale = { value: 1 };
    uniforms.uCoreColor = { value: new THREE.Color(0x5eead4) };
    this.probeHullMat.defines.HYDRA_PARTS = 1;
    this.probeGroup.add(new THREE.Mesh(hull, this.probeHullMat));

    // Translucent cockpit dome renders after the opaque core.
    const domeGeo = new THREE.SphereGeometry(0.36, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    domeGeo.scale(1.25, 0.9, 0.92);
    this.cockpitDome = new THREE.Mesh(
      domeGeo,
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      })
    );
    this.cockpitDome.position.set(0.24, 0.2, 0);
    this.probeGroup.add(this.cockpitDome);

    // Oscillating sonic bristle tufts under the brush head (1 instanced draw call)
    const tuftGeo = new THREE.CylinderGeometry(0.03, 0.045, 0.3, 5, 1);
    tuftGeo.translate(0, -0.15, 0);
    this.bristleTuftInst = new THREE.InstancedMesh(tuftGeo, createCrystalLitMaterial(0xffffff), 21);
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 3; col++) {
        this.tuftRest.push({ x: 1.12 + (col - 1) * 0.12, z: (row - 3) * 0.085 });
      }
    }
    for (let i = 0; i < this.tuftRest.length; i++) {
      this.bristleTuftInst.setColorAt(i, this.tmpColor.setHex(i % 3 === 1 ? 0x5eead4 : 0xf0fdfa));
    }
    this.bristleTuftInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bristleTuftInst.frustumCulled = false;
    this.probeGroup.add(this.bristleTuftInst);

    // Sonic Bristle sweep arc fan
    const arcGeo = new THREE.RingGeometry(0.68, BRUSH_BASE_RADIUS, 24, 1, -0.5, 1.0);
    arcGeo.rotateX(-Math.PI / 2);
    this.bristleArcMesh = new THREE.Mesh(
      arcGeo,
      new THREE.MeshBasicMaterial({
        color: 0x2dd4bf,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.bristleArcMesh.position.y = -0.38;
    this.probeGroup.add(this.bristleArcMesh);
    this.arcadeEntitiesGroup.add(this.probeGroup);

    // Hover wake rings (additive, faded via instance color brightness)
    const wakeGeo = new THREE.RingGeometry(0.86, 1.0, 32, 1);
    wakeGeo.rotateX(-Math.PI / 2);
    this.wakeRingInst = new THREE.InstancedMesh(
      wakeGeo,
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      3
    );
    this.wakeRingInst.frustumCulled = false;
    this.arcadeEntitiesGroup.add(this.wakeRingInst);

    // Projected aim / zip reticle at interdental alley mouths (alpha-blended so it stays legible on white enamel)
    this.zipReticleMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.zipReticle = new THREE.Mesh(buildZipReticleGeometry(), this.zipReticleMat);
    this.zipReticle.visible = false;
    this.zipReticle.frustumCulled = false;
    this.arcadeEntitiesGroup.add(this.zipReticle);

    // Taut glowing C-curve floss filament
    this.flossMat = new THREE.ShaderMaterial({
      uniforms: {
        uA: { value: new THREE.Vector3() },
        uB: { value: new THREE.Vector3(1, 0, 0) },
        uBend: { value: 0 },
        uWidth: { value: 0.32 },
        uTime: { value: 0 },
        uOpacity: { value: 1 },
      },
      vertexShader: FLOSS_VERT,
      fragmentShader: FLOSS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.flossMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 40, 1), this.flossMat);
    this.flossMesh.visible = false;
    this.flossMesh.frustumCulled = false;
    this.arcadeEntitiesGroup.add(this.flossMesh);

    // 2. World entity batches
    this.bridgeInst = this.makeInst(
      new THREE.CapsuleGeometry(0.15, 0.7, 4, 8).rotateZ(Math.PI / 2),
      createCrystalLitMaterial(0xffffff, 1, { emissive: 0.12 }),
      8
    );

    this.mutansInst = this.makeInst(buildStreptoChainGeometry(), createCrystalLitMaterial(0xffffff, 1, { vertexColors: true }), 16);

    const auraGeo = new THREE.RingGeometry(0.75, 1.0, 28, 1);
    auraGeo.rotateX(-Math.PI / 2);
    this.mutansAuraInst = this.makeInst(
      auraGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      16
    );

    this.siteInst = this.makeInst(new THREE.OctahedronGeometry(0.58, 1), createCrystalLitMaterial(0xffffff, 1, { iridescence: 0.25 }), 16);

    this.siteHaloMat = createCrystalLitMaterial(0xffffff, 0.92, { vertexColors: true, iridescence: 1.0, emissive: 0.35 });
    this.siteHaloMat.depthWrite = false;
    this.siteHaloInst = this.makeInst(buildCrystalHaloGeometry(), this.siteHaloMat, 16);

    this.sucroseMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: LIT_PROP_VERT,
      fragmentShader: CRYSTAL_FRAG,
      transparent: true,
    });
    this.sucroseInst = this.makeInst(buildSucroseClusterGeometry(), this.sucroseMat, 8);

    const shardGeo = new THREE.TetrahedronGeometry(0.2, 0);
    shardGeo.scale(0.7, 1.5, 0.6);
    shardGeo.computeVertexNormals();
    this.shardInst = this.makeInst(shardGeo, this.sucroseMat, MAX_SHARDS);
    for (let i = 0; i < MAX_SHARDS; i++) {
      this.shards.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, spin: 0, age: 0, life: 1, size: 1, floorY: 0 });
      this.shardInst.setColorAt(i, this.tmpColor.setHex(i % 2 ? 0xfbcfe8 : 0xf9a8d4));
    }

    const springGeo = new THREE.TorusGeometry(0.85, 0.14, 8, 24);
    springGeo.rotateX(Math.PI / 2);
    this.springInst = this.makeInst(springGeo, createCrystalLitMaterial(0xffffff, 1, { emissive: 0.2 }), 8);

    this.beaconInst = this.makeInst(new THREE.OctahedronGeometry(0.62, 0), createCrystalLitMaterial(0xfde047, 1, { emissive: 0.25 }), 8);

    const poolGeo = new THREE.CircleGeometry(1.0, 20);
    poolGeo.rotateX(-Math.PI / 2);
    this.acidPoolInst = this.makeInst(
      poolGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.64, depthWrite: false }),
      12
    );

    // 3. Shared soft radial contact shadows (1 draw call)
    this.shadowTex = createRadialShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadowInst = this.makeInst(
      shadowGeo,
      new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }),
      64
    );

    this.timedMaterials.push(this.siteHaloMat, this.sucroseMat, this.flossMat);

    // 4. Pre-allocated particle & mint breeze pool
    this.particleInst = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.22, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      MAX_PARTICLES_ULTRA
    );
    this.particleInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleInst.frustumCulled = false;
    for (let i = 0; i < MAX_PARTICLES_ULTRA; i++) {
      this.particles.push({ active: false, ambient: false, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, r: 1, g: 1, b: 1 });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.particleInst.setMatrixAt(i, this.dummy.matrix);
      this.particleInst.setColorAt(i, this.tmpColor.setHex(0xffffff));
    }
    this.particleInst.count = this.activeParticleCap;
    this.sharedFxGroup.add(this.particleInst);
  }

  private makeInst(geo: THREE.BufferGeometry, mat: THREE.Material, count: number): THREE.InstancedMesh {
    const inst = new THREE.InstancedMesh(geo, mat, count);
    inst.count = 0;
    inst.frustumCulled = false; // instance bounds move every frame; culling is per-batch anyway
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Initialize all instanceColor slots to white so un-tinted instances never read (0,0,0)
    this.tmpColor.setHex(0xffffff);
    for (let i = 0; i < count; i++) {
      inst.setColorAt(i, this.tmpColor);
    }
    this.arcadeEntitiesGroup.add(inst);
    return inst;
  }

  setQualityTier(tier: QualityTier): void {
    this.qualityTier = tier;
    this.activeParticleCap = QUALITY_TIER_SPECS[tier].particleCap;
    this.particleInst.count = this.activeParticleCap;
  }

  spawnBurst(params: {
    x: number;
    y: number;
    z: number;
    count: number;
    speed: number;
    colorHex: number;
    size?: number;
    life?: number;
    upward?: number;
  }): void {
    this.tmpColor.setHex(params.colorHex);
    const cap = Math.max(1, this.activeParticleCap);
    for (let i = 0; i < params.count; i++) {
      const idx = this.particleCursor % cap;
      this.particleCursor = (this.particleCursor + 1) % cap;
      const slot = this.particles[idx];
      const ang = (i / Math.max(1, params.count)) * Math.PI * 2 + idx * 0.37;
      const spd = params.speed * (0.55 + ((idx * 17) % 10) * 0.08);
      slot.active = true;
      slot.ambient = false;
      slot.x = params.x;
      slot.y = params.y;
      slot.z = params.z;
      slot.vx = Math.cos(ang) * spd;
      slot.vy = spd * 0.55 + (params.upward ?? 1.2);
      slot.vz = Math.sin(ang) * spd;
      slot.age = 0;
      slot.life = params.life ?? 0.65;
      slot.size = params.size ?? 1.0;
      slot.r = this.tmpColor.r;
      slot.g = this.tmpColor.g;
      slot.b = this.tmpColor.b;
    }
  }

  /** Sucrose Crystal shatter: faceted refractive shards burst outward, bounce and fade. */
  spawnShatter(x: number, y: number, z: number, count = 12): void {
    for (let i = 0; i < count; i++) {
      const s = this.shards[this.shardCursor];
      this.shardCursor = (this.shardCursor + 1) % MAX_SHARDS;
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const spd = 3.2 + Math.random() * 3.4;
      s.active = true;
      s.x = x;
      s.y = y + 0.4;
      s.z = z;
      s.vx = Math.cos(a) * spd;
      s.vz = Math.sin(a) * spd;
      s.vy = 3.5 + Math.random() * 3.0;
      s.rx = Math.random() * 6;
      s.ry = Math.random() * 6;
      s.spin = 8 + Math.random() * 10;
      s.age = 0;
      s.life = 0.9 + Math.random() * 0.4;
      s.size = 0.7 + Math.random() * 0.8;
      s.floorY = y;
    }
    this.spawnBurst({
      x,
      y: y + 0.5,
      z,
      count: 10,
      speed: 4.5,
      colorHex: this.activeSucroseHex,
      size: 0.6,
      life: 0.5,
    });
  }

  update(params: {
    dt: number;
    nowSec: number;
    mode: AppMode;
    session: WorldSession;
    scrubbingActive: boolean;
    companionSmoothness: number;
    reducedMotion: boolean;
    companionVisible: boolean;
  }): void {
    const { dt, nowSec, mode, session } = params;
    for (const m of this.timedMaterials) m.uniforms.uTime.value = params.reducedMotion ? 0 : nowSec;
    const inArcade = (mode === 'ARCADE' || mode === 'PULP_RESCUE') && Boolean(session.cartridge);

    if (inArcade) {
      if (this.trackedCartridge !== session.cartridge) {
        this.trackedCartridge = session.cartridge;
        this.siteRestoredAt.clear();
      }
      this.syncArcadeEntities(dt, nowSec, session, params.scrubbingActive, params.reducedMotion);
    }

    // Cool-Mint Smooth Bask sparkle breeze ribbons around the Companion Arch
    const inCompanionShow =
      (mode === 'HUB' && params.companionSmoothness >= SMOOTH_BASK_THRESHOLD) ||
      mode === 'BRUSH_ALONG' ||
      mode === 'REPORT';

    const showMotes = !params.reducedMotion && (inArcade || params.companionVisible) && this.qualityTier !== 'low';
    if (showMotes) {
      this.breezeEmitTimer -= dt;
      if (this.breezeEmitTimer <= 0) {
        this.breezeEmitTimer = this.qualityTier === 'ultra' ? 0.12 : 0.23;
        const ang = this.motePhase;
        this.motePhase = (ang + 2.39996) % (Math.PI * 2);
        const rx = (inArcade ? session.probePos.x : 32) + Math.sin(ang) * (inArcade ? 8 : 10.4);
        const rz = (inArcade ? session.probePos.z : 14.4) + Math.cos(ang) * 8.8;
        const slotIdx = this.particleCursor % Math.max(1, this.activeParticleCap);
        this.particleCursor = (this.particleCursor + 1) % Math.max(1, this.activeParticleCap);
        const p = this.particles[slotIdx];
        p.active = true;
        p.ambient = true;
        p.x = rx;
        p.y = (inArcade ? session.probeY : 1.4) + 0.65 + Math.sin(ang) * 0.6;
        p.z = rz;
        p.vx = Math.cos(ang) * 0.38;
        p.vy = 0.27;
        p.vz = -Math.sin(ang) * 0.38;
        p.age = 0;
        p.life = 3.8;
        p.size = inCompanionShow ? 0.66 : 0.49;
        this.tmpColor.setHex(inCompanionShow ? 0x8ddacc : 0x8dafc3);
        p.r = this.tmpColor.r;
        p.g = this.tmpColor.g;
        p.b = this.tmpColor.b;
      }
    }

    this.stepParticles(dt, showMotes);
    this.stepShards(dt);
  }

  private syncArcadeEntities(
    dt: number, nowSec: number, session: WorldSession, scrubbingActive: boolean, reducedMotion: boolean
  ): void {
    const cart = session.cartridge;
    let shadowCount = 0;
    this.contactShadowCount = 0;
    const pushShadow = (x: number, y: number, z: number, scale: number) => {
      if (this.contactShadowCount < MAX_CONTACT_SHADOWS) {
        this.contactShadows[this.contactShadowCount++].set(x, z, scale * 0.52);
      }
      if (shadowCount >= 64) return;
      this.dummy.position.set(x, y + 0.04, z);
      this.dummy.rotation.set(-Math.PI / 2, 0, 0);
      this.dummy.scale.set(scale, scale, 1);
      this.dummy.updateMatrix();
      this.shadowInst.setMatrixAt(shadowCount++, this.dummy.matrix);
    };

    // 1. HYDRA-1 craft: hover bob, banking into turns, sonic tuft oscillation
    const zipping = Boolean(session.probeZip);
    const motionTime = reducedMotion ? 0 : nowSec;
    const hover = Math.sin(motionTime * 6.5) * 0.08;
    const bank = Math.max(-0.35, Math.min(0.35, (session.probeSpeed / 9.2) * 0.22));
    this.probeGroup.position.set(session.probePos.x, session.probeY + 0.62 + hover, session.probePos.z);
    this.probeGroup.rotation.set(zipping ? 0.25 : bank * Math.sin(motionTime * 2.0) * 0.3, -session.probeFacingRad, zipping ? -0.18 : 0);
    const zipStretch = zipping ? 1.25 : 1.0;
    this.probeGroup.scale.set(zipStretch, zipping ? 0.85 : 1.0, zipping ? 0.9 : 1.0);

    const sonicAmp = scrubbingActive ? 0.42 : 0.07;
    const sonicFreq = scrubbingActive ? 62 : 9;
    for (let i = 0; i < this.tuftRest.length; i++) {
      const r = this.tuftRest[i];
      const ph = motionTime * sonicFreq + i * 1.7;
      this.dummy.position.set(r.x + Math.sin(ph) * 0.02 * (scrubbingActive ? 1 : 0.3), -0.42, r.z);
      this.dummy.rotation.set(Math.sin(ph) * sonicAmp, 0, Math.cos(ph * 0.9) * sonicAmp * 0.6);
      this.dummy.scale.set(1, scrubbingActive ? 1.08 + Math.sin(ph * 1.3) * 0.08 : 1, 1);
      this.dummy.updateMatrix();
      this.bristleTuftInst.setMatrixAt(i, this.dummy.matrix);
    }
    this.bristleTuftInst.instanceMatrix.needsUpdate = true;

    // Counter-rotating sonic rings (fast + blurred while scrubbing) and reactive Surge core
    if (!reducedMotion) this.ringSpin = (this.ringSpin + dt * (scrubbingActive ? 34 : 3.2)) % (Math.PI * 40);
    const hullUniforms = this.probeHullMat.uniforms;
    hullUniforms.uRingSpin.value = this.ringSpin;
    const surge01 = Math.max(0, Math.min(1, session.surgeMeter / SURGE_MAX));
    const surgeReady = surge01 >= 1;
    const corePulse = surgeReady && !reducedMotion ? 1.0 + Math.sin(nowSec * 14) * 0.28 : 0.55 + surge01 * 0.45;
    hullUniforms.uCoreScale.value = corePulse;
    (hullUniforms.uCoreColor.value as THREE.Color).setHex(0x14b8a6).lerp(this.tmpColor.setHex(surgeReady ? 0xfde047 : 0x67e8f9), surgeReady ? 1 : surge01);

    const arcScale = session.hasBassUpgrade ? BRUSH_BASS_ARC_RAD / BRUSH_BASE_ARC_RAD : 1.0;
    const overdriveScale = session.overdriveActive ? 1.25 : 1.0;
    this.bristleArcMesh.scale.set(
      overdriveScale / zipStretch,
      1,
      overdriveScale * arcScale * (scrubbingActive ? 1.08 + Math.sin(motionTime * 36) * 0.08 : 0.92)
    );
    (this.bristleArcMesh.material as THREE.MeshBasicMaterial).opacity = zipping ? 0 : scrubbingActive ? 0.62 : 0.22;

    // Hover wake rings expanding beneath the craft
    const hydroSonic = scrubbingActive && !zipping && session.hasHydroSonicUpgrade;
    for (let i = 0; i < 3; i++) {
      const phase = (motionTime * (scrubbingActive ? 1.9 : 1.1) + i / 3) % 1;
      const scale = 0.55 + phase * (hydroSonic ? 2.8 : zipping ? 2.4 : 1.7);
      this.dummy.position.set(session.probePos.x, session.probeY + 0.07, session.probePos.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(scale, 1, scale);
      this.dummy.updateMatrix();
      this.wakeRingInst.setMatrixAt(i, this.dummy.matrix);
      const fade = (1 - phase) * (scrubbingActive ? 0.85 : 0.5);
      this.wakeRingInst.setColorAt(i, this.tmpColor.setRGB(hydroSonic ? fade : fade * 0.6, fade, fade));
    }
    this.wakeRingInst.instanceMatrix.needsUpdate = true;
    if (this.wakeRingInst.instanceColor) this.wakeRingInst.instanceColor.needsUpdate = true;

    pushShadow(session.probePos.x, session.probeY, session.probePos.z, 1.95);

    if (scrubbingActive && !zipping && Math.random() < Math.min(1, dt * 32)) {
      this.spawnBurst({
        x: session.probePos.x + Math.cos(session.probeFacingRad) * 1.15,
        y: session.probeY + 0.22,
        z: session.probePos.z + Math.sin(session.probeFacingRad) * 1.15,
        count: 2,
        speed: 2.2,
        colorHex: Math.random() < 0.5 ? 0xa5f3fc : 0xffffff,
        size: 0.7,
        life: 0.42,
      });
    }

    // Projected aim / zip reticle when HYDRA-1 nears an interdental alley mouth
    const alleyHex = pickAlleyReticleTint(cart.palette);
    const hint = zipping ? null : findNearestZipMouth(session.probePos, cart.interdentalAlleys, cart.wallBoxes);
    if (hint) {
      const ex = hint.exit.x - hint.entry.x;
      const ez = hint.exit.z - hint.entry.z;
      const y = sampleTerrainHeight(cart, hint.entry.x, hint.entry.z) + 0.12;
      this.zipReticle.visible = true;
      this.zipReticle.position.set(hint.entry.x, y, hint.entry.z);
      this.zipReticle.rotation.set(0, -Math.atan2(ez, ex), 0);
      const pulse = hint.inZipRange ? 1.04 + Math.sin(motionTime * 10) * 0.12 : 0.88 + Math.sin(motionTime * 4) * 0.05;
      this.zipReticle.scale.setScalar(pulse);
      this.zipReticleMat.color.setHex(alleyHex);
      if (hint.inZipRange) {
        this.zipReticleMat.color.lerp(this.tmpColorB.setHex(0xffffff), 0.16);
      }
      this.zipReticleMat.opacity = hint.inZipRange ? 1.0 : 0.82;
    } else {
      this.zipReticle.visible = false;
    }

    // C-curve floss filament: wraps the contact in a C, then snaps taut
    if (session.flossBeamSegment && session.flossBeamSegment !== this.flossSegmentRef) {
      this.flossSegmentRef = session.flossBeamSegment;
      this.flossVisualAge = 0;
      this.flossZipped = Boolean(session.probeZip);
    }
    this.flossVisualAge += dt;
    const flossLife = 0.42;
    if (session.flossBeamSegment && this.flossVisualAge < flossLife) {
      const { a, b } = session.flossBeamSegment;
      const u = this.flossVisualAge / flossLife;
      const ya = sampleTerrainHeight(cart, a.x, a.z) + 0.55;
      const yb = sampleTerrainHeight(cart, b.x, b.z) + 0.55;
      (this.flossMat.uniforms.uA.value as THREE.Vector3).set(a.x, ya, a.z);
      (this.flossMat.uniforms.uB.value as THREE.Vector3).set(b.x, yb, b.z);
      const cBend = (this.flossZipped ? 0.9 : 0.6) * Math.exp(-u * 7.0) * Math.cos(u * 18.0);
      this.flossMat.uniforms.uBend.value = cBend;
      this.flossMat.uniforms.uWidth.value = session.hasPtfeFlossUpgrade ? 0.46 : 0.32;
      this.flossMat.uniforms.uOpacity.value = 1 - Math.pow(u, 2.5);
      this.flossMesh.visible = true;
    } else {
      this.flossMesh.visible = false;
    }

    // 2. Biofilm bridges (pulsing slime cords tinted for per-world contrast)
    const bridgeHex = pickBridgeTint(cart.palette);
    let bCount = 0;
    for (const br of session.bridges) {
      if (!br.intact || bCount >= 8) continue;
      const dx = br.b.x - br.a.x;
      const dz = br.b.z - br.a.z;
      const len = Math.max(0.2, Math.hypot(dx, dz));
      const mx = (br.a.x + br.b.x) * 0.5;
      const mz = (br.a.z + br.b.z) * 0.5;
      const my = sampleTerrainHeight(cart, mx, mz) + 0.35;
      this.dummy.position.set(mx, my, mz);
      this.dummy.rotation.set(0, -Math.atan2(dz, dx), 0);
      const throb = 1 + Math.sin(motionTime * 5 + bCount) * 0.15;
      this.dummy.scale.set(len, throb, throb);
      this.dummy.updateMatrix();
      this.bridgeInst.setMatrixAt(bCount, this.dummy.matrix);
      this.bridgeInst.setColorAt(bCount, this.tmpColor.setHex(bridgeHex));
      bCount++;
    }
    this.commit(this.bridgeInst, bCount);

    // 3. S. mutans streptococcal chains: bouncy squash & stretch + acid aura rings
    let mCount = 0;
    for (const m of session.mutans) {
      if (mCount >= 16) break;
      const y = sampleTerrainHeight(cart, m.pos.x, m.pos.z);
      const stunned = m.stunRemaining > 0;
      const hopPhase = reducedMotion ? 0 : m.hopPhase;
      const hopRaw = Math.abs(Math.sin(hopPhase));
      const hop = stunned ? 0.05 : hopRaw * 0.55;
      const landing = stunned ? 0 : Math.pow(1 - hopRaw, 6);
      const squash = stunned ? 0.7 : 1.0 - 0.32 * landing + 0.18 * hopRaw;
      const stretch = 1 / Math.sqrt(Math.max(0.4, squash));
      this.dummy.position.set(m.pos.x, y + 0.36 + hop, m.pos.z);
      this.dummy.rotation.set(Math.sin(hopPhase * 0.5) * 0.25, Math.atan2(-m.vel.z, m.vel.x), Math.sin(hopPhase) * 0.18);
      const wob = stunned ? 1 : 1 + Math.sin(motionTime * 9.5 + m.id * 1.9) * 0.07;
      this.dummy.scale.set(stretch * 1.05 * wob, squash / wob, stretch * 1.05 * (2 - wob));
      this.dummy.updateMatrix();
      this.mutansInst.setMatrixAt(mCount, this.dummy.matrix);
      this.mutansInst.setColorAt(mCount, this.tmpColor.setHex(stunned ? 0x67e8f9 : 0xa3e635));

      const auraPhase = (motionTime * 1.4 + m.id * 0.31) % 1;
      this.dummy.position.set(m.pos.x, y + 0.08, m.pos.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(0.7 + auraPhase * 1.1);
      this.dummy.updateMatrix();
      this.mutansAuraInst.setMatrixAt(mCount, this.dummy.matrix);
      const af = stunned ? 0.15 : (1 - auraPhase) * 0.8;
      this.mutansAuraInst.setColorAt(mCount, this.tmpColor.setRGB(af * 0.75, af, af * 0.1));

      pushShadow(m.pos.x, y, m.pos.z, 1.2 * (1 - hop * 0.4));
      mCount++;
    }
    this.commit(this.mutansInst, mCount);
    this.commit(this.mutansAuraInst, mCount);

    // 4. Commensal S. sanguinis sites + blooming pearlescent crystal halos once restored
    const colonyBeaconHex = pickColonyBeaconTint(cart.palette);
    const colonyRestoredHex = pickColonyRestoredTint(cart.palette);
    let sCount = 0;
    let hCount = 0;
    for (const site of session.sites) {
      if (sCount >= 16) break;
      const y = sampleTerrainHeight(cart, site.pos.x, site.pos.z);
      const floatY = site.restored ? 0.78 + Math.sin(motionTime * 3.4 + sCount) * 0.18 : 0.38;
      this.dummy.position.set(site.pos.x, y + floatY, site.pos.z);
      this.dummy.rotation.set(0, motionTime * (site.restored ? 1.6 : 0.35), 0);
      this.dummy.scale.setScalar(site.restored ? 1.14 : 0.9 + site.localCleanRatio * 0.22);
      this.dummy.updateMatrix();
      this.siteInst.setMatrixAt(sCount, this.dummy.matrix);
      this.tmpColor
        .setHex(colonyBeaconHex)
        .lerp(this.tmpColorB.setHex(colonyRestoredHex), site.restored ? 1 : 0.15 + site.localCleanRatio * 0.72);
      this.siteInst.setColorAt(sCount, this.tmpColor);
      pushShadow(site.pos.x, y, site.pos.z, 1.25);
      sCount++;

      if (!site.restored && hCount < 16) {
        // Always-visible target beacon patch that expands & shifts from beacon tint toward restored hue as scrubbed
        const frac = Math.max(0, Math.min(1, site.localCleanRatio / SITE_RESTORE_CLEAN_RATIO));
        const pulse = 1 + Math.sin(motionTime * 3.0 + hCount * 1.1) * 0.06;
        const ringScale = (0.68 + frac * 0.52) * pulse;
        this.dummy.position.set(site.pos.x, y + 0.26, site.pos.z);
        this.dummy.rotation.set(0, -motionTime * 0.35 + hCount, 0);
        this.dummy.scale.set(ringScale, 0.24 + frac * 0.68, ringScale);
        this.dummy.updateMatrix();
        this.siteHaloInst.setMatrixAt(hCount, this.dummy.matrix);
        this.siteHaloInst.setColorAt(
          hCount,
          this.tmpColor.setHex(colonyBeaconHex).lerp(this.tmpColorB.setHex(colonyRestoredHex), frac * 0.65)
        );
        hCount++;
      }
      if (site.restored) {
        if (!this.siteRestoredAt.has(site.id)) this.siteRestoredAt.set(site.id, nowSec);
        const age = Math.max(0, nowSec - (this.siteRestoredAt.get(site.id) ?? nowSec));
        const bloom = !reducedMotion && age < 0.9 ? 1 - Math.pow(1 - age / 0.9, 3) * Math.cos(age * 9) : 1;
        const breathe = 1 + Math.sin(motionTime * 2.2 + hCount) * 0.06;
        this.dummy.position.set(site.pos.x, y + 0.32, site.pos.z);
        this.dummy.rotation.set(0, -motionTime * 0.6 + hCount, 0);
        this.dummy.scale.set(bloom * breathe * 1.25, Math.max(0.05, bloom) * 1.1, bloom * breathe * 1.25);
        this.dummy.updateMatrix();
        this.siteHaloInst.setMatrixAt(hCount, this.dummy.matrix);
        this.siteHaloInst.setColorAt(
          hCount,
          this.tmpColor.setHex(colonyRestoredHex).lerp(this.tmpColorB.setHex(0xffffff), 0.35)
        );
        hCount++;
      }
    }
    this.commit(this.siteInst, sCount);
    this.commit(this.siteHaloInst, hCount);

    // 5. Faceted refractive Sucrose crystal clusters (cracking jitter as HP drops)
    const sucroseHex = pickSucroseTint(cart.palette);
    this.activeSucroseHex = sucroseHex;
    let cCount = 0;
    for (const c of session.sucroseCrystals) {
      if (!c.intact || cCount >= 8) continue;
      const y = sampleTerrainHeight(cart, c.pos.x, c.pos.z);
      const damage = 1 - Math.max(0, Math.min(1, c.hp / 4));
      const jitter = damage > 0.05 ? Math.sin(motionTime * 60 + cCount) * 0.04 * damage : 0;
      this.dummy.position.set(c.pos.x + jitter, y + 0.32, c.pos.z);
      this.dummy.rotation.set(0.12, motionTime * 0.6 + cCount, 0.08);
      this.dummy.scale.setScalar((1.15 - damage * 0.25) * (1 + Math.sin(motionTime * 3.1 + cCount * 1.3) * 0.03));
      this.dummy.updateMatrix();
      this.sucroseInst.setMatrixAt(cCount, this.dummy.matrix);
      this.sucroseInst.setColorAt(
        cCount,
        this.tmpColor.setHex(sucroseHex).lerp(this.tmpColorB.setHex(0xffffff), 0.25 - damage * 0.2)
      );
      pushShadow(c.pos.x, y, c.pos.z, 1.5);
      cCount++;
    }
    this.commit(this.sucroseInst, cCount);

    // 6. Salivary Bicarbonate / Miswak springs
    const springHex = pickSpringTint(cart.palette);
    let spCount = 0;
    for (let i = 0; i < cart.salivaSprings.length && spCount < 8; i++) {
      const sp = cart.salivaSprings[i];
      const y = sampleTerrainHeight(cart, sp.x, sp.z);
      this.dummy.position.set(sp.x, y + 0.15, sp.z);
      this.dummy.rotation.set(0, motionTime * 1.2, 0);
      const ready = (session.springCooldowns[i] ?? 0) <= 0;
      this.dummy.scale.setScalar(ready ? 1.02 + Math.sin(motionTime * 4.0 + i) * 0.12 : 0.72);
      this.dummy.updateMatrix();
      this.springInst.setMatrixAt(spCount, this.dummy.matrix);
      this.springInst.setColorAt(spCount, this.tmpColor.setHex(ready ? springHex : 0x64748b));
      spCount++;
    }
    this.commit(this.springInst, spCount);

    // 7. Ion relay beacons
    let bcCount = 0;
    for (const bc of session.beacons) {
      if (bc.collected || bcCount >= 8) continue;
      const y = sampleTerrainHeight(cart, bc.pos.x, bc.pos.z);
      this.dummy.position.set(bc.pos.x, y + 0.88 + Math.sin(motionTime * 4.2 + bc.index) * 0.18, bc.pos.z);
      this.dummy.rotation.set(0, motionTime * 2.2, 0);
      this.dummy.scale.setScalar(1.05);
      this.dummy.updateMatrix();
      this.beaconInst.setMatrixAt(bcCount++, this.dummy.matrix);
      pushShadow(bc.pos.x, y, bc.pos.z, 1.3);
    }
    this.commit(this.beaconInst, bcCount);

    // 8. Acid pools (palette-contrasting corrosive tint)
    const acidPoolHex = pickAcidPoolTint(cart.palette);
    let apCount = 0;
    for (const ap of session.acidPools) {
      if (apCount >= 12) break;
      const y = sampleTerrainHeight(cart, ap.pos.x, ap.pos.z);
      this.dummy.position.set(ap.pos.x, y + 0.06, ap.pos.z);
      this.dummy.rotation.set(0, motionTime * 0.5, 0);
      this.dummy.scale.setScalar(ap.radius * (1 + Math.sin(motionTime * 3 + ap.id) * 0.05));
      this.dummy.updateMatrix();
      this.acidPoolInst.setMatrixAt(apCount, this.dummy.matrix);
      this.acidPoolInst.setColorAt(apCount, this.tmpColor.setHex(acidPoolHex));
      apCount++;
    }
    this.commit(this.acidPoolInst, apCount);

    // The enamel shader now draws these shadows on the surface itself (they follow every bump and
    // are never clipped by a slope), so the flat shadow cards only cover whatever did not fit.
    this.shadowInst.count = shadowCount > MAX_CONTACT_SHADOWS ? shadowCount : 0;
    this.shadowInst.instanceMatrix.needsUpdate = true;
  }

  private commit(inst: THREE.InstancedMesh, count: number): void {
    inst.count = count;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }

  private stepShards(dt: number): void {
    let live = 0;
    for (let i = 0; i < MAX_SHARDS; i++) {
      const s = this.shards[i];
      if (!s.active) continue;
      s.age += dt;
      if (s.age >= s.life) {
        s.active = false;
        continue;
      }
      s.vy -= 14 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < s.floorY + 0.1) {
        s.y = s.floorY + 0.1;
        s.vy = Math.abs(s.vy) * 0.35;
        s.vx *= 0.6;
        s.vz *= 0.6;
      }
      s.rx += s.spin * dt;
      s.ry += s.spin * 0.7 * dt;
      const u = s.age / s.life;
      this.dummy.position.set(s.x, s.y, s.z);
      this.dummy.rotation.set(s.rx, s.ry, 0);
      this.dummy.scale.setScalar(Math.max(0.01, s.size * (1 - u * u)));
      this.dummy.updateMatrix();
      this.tmpMat.copy(this.dummy.matrix);
      const shardTints = [0xffffff, this.activeSucroseHex, 0xe0f2fe, this.activeSucroseHex];
      this.shardInst.setMatrixAt(live, this.tmpMat);
      const flash = 1.0 + 0.35 * (1.0 - u);
      this.tmpColor.setHex(shardTints[i & 3]).multiplyScalar(flash);
      this.shardInst.setColorAt(live, this.tmpColor);
      live++;
    }
    this.shardInst.count = live;
    if (live > 0) {
      this.shardInst.instanceMatrix.needsUpdate = true;
      if (this.shardInst.instanceColor) this.shardInst.instanceColor.needsUpdate = true;
    }
  }

  private stepParticles(dt: number, showMotes: boolean): void {
    const cap = this.activeParticleCap;
    let dirty = false;
    let anyActive = false;
    for (let i = 0; i < cap; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      dirty = true;
      p.age += dt;
      if (p.age >= p.life || (p.ambient && !showMotes)) {
        p.active = false;
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.setScalar(0.001);
        this.dummy.updateMatrix();
        this.particleInst.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      anyActive = true;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (!p.ambient) p.vy -= 1.8 * dt;
      const u = p.age / p.life;
      const fade = p.ambient ? Math.min(1, u * 6, (1 - u) * 4) : 1 - u * 0.85;
      const s = Math.max(0.01, p.size * fade);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.age * 3, p.age * 2, 0);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.particleInst.setMatrixAt(i, this.dummy.matrix);
      this.tmpColor.setRGB(p.r, p.g, p.b);
      this.particleInst.setColorAt(i, this.tmpColor);
    }
    this.particleInst.visible = anyActive;
    if (dirty) {
      this.particleInst.instanceMatrix.needsUpdate = true;
      if (this.particleInst.instanceColor) this.particleInst.instanceColor.needsUpdate = true;
    }
  }

  markTexturesNeedsUpdate(): void {
    this.shadowTex.needsUpdate = true;
  }

  dispose(): void {
    this.shadowTex.dispose();
  }
}
