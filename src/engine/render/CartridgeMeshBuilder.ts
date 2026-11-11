import * as THREE from 'three';
import { ORAL_LIGHTING_GLSL } from './OralLighting';
import { buildAlleyWalls, sampleTerrainHeight } from '../physics/CollisionSystem';
import { distancePointToSegmentSq2D } from '../surface/OralSurfaceGrid';
import type { AABB2D, WorldCartridge } from '../types';

// ---------------------------------------------------------------------------------------------
// Wet stippled gingiva shader (single pass): attached-gingiva orange-peel stippling, glossy
// marginal gingiva, warm subsurface wrap and sharp saliva sparkle highlights.
// vColor.r = baked AO, vColor.g = marginal-gingiva mask (1 at the papilla/crest, 0 attached).
// ---------------------------------------------------------------------------------------------
const GINGIVA_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormal = mat3(modelMatrix) * normal;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const GINGIVA_FRAG = /* glsl */ `
  ${ORAL_LIGHTING_GLSL}
  uniform vec3 uGingivaColor;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vColor;

  float ghash(vec3 p) {
    p = fract(p * vec3(127.1, 311.7, 74.7));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }
  float gnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = ghash(i);
    float n100 = ghash(i + vec3(1.0, 0.0, 0.0));
    float n010 = ghash(i + vec3(0.0, 1.0, 0.0));
    float n110 = ghash(i + vec3(1.0, 1.0, 0.0));
    float n001 = ghash(i + vec3(0.0, 0.0, 1.0));
    float n101 = ghash(i + vec3(1.0, 0.0, 1.0));
    float n011 = ghash(i + vec3(0.0, 1.0, 1.0));
    float n111 = ghash(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z
    );
  }

  void main() {
    float marginal = clamp(vColor.g, 0.0, 1.0);
    float attached = 1.0 - marginal;

    // Orange-peel stippling of attached gingiva (perturbs the normal, not the silhouette)
    vec3 sp = vWorldPos * 9.5;
    float s1 = gnoise(sp);
    float s2 = uDetail > 0 ? gnoise(sp * 2.3 + 7.1) : 0.5;
    float s3 = uDetail > 1 ? gnoise(sp + 3.3) : s1;
    float stipple = s1 * 0.65 + s2 * 0.35;
    vec3 N = safeUnit(vNormal + (vec3(s1, s2, s3) - 0.5) * (0.26 * attached + 0.06));

    vec3 V = safeUnit(cameraPosition - vWorldPos);
    vec3 L = normalize(vec3(0.35, 0.88, 0.35));
    vec3 L2 = normalize(vec3(-0.5, 0.55, -0.6));
    vec3 H = safeUnit(L + V);
    float wrap = max(0.0, (dot(N, L) + 0.55) / 1.55);
    float fill = max(0.0, (dot(N, L2) + 0.4) / 1.4) * 0.3;

    // Coral marginal gingiva vs slightly paler, stippled attached mucosa
    vec3 albedo = mix(uGingivaColor * vec3(1.03, 0.94, 0.96), uGingivaColor * vec3(1.08, 1.02, 1.0), attached * 0.6);
    albedo *= 0.9 + 0.18 * stipple;
    vec3 col = albedo * (0.4 + 0.58 * wrap + fill) * clamp(vColor.r, 0.35, 1.0);
    // Healthy coral-pink mucosa: lift toward a softer, less saturated pink
    col = mix(col, vec3(dot(col, vec3(0.3, 0.55, 0.15))) * vec3(1.22, 0.86, 0.9), 0.3);

    // Warm subsurface scattering bleeding through thin papillae
    float back = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);
    col += vec3(0.42, 0.14, 0.16) * back * (0.1 + 0.14 * marginal);

    // Crisp saliva meniscus line pooled along the gingival crest where gum meets enamel
    float meniscus = smoothstep(0.55, 1.0, marginal) * (1.0 - smoothstep(0.0, 1.0, attached));
    col += vec3(0.95, 0.98, 1.0) * meniscus * (0.1 + 0.55 * pow(max(dot(N, H), 0.0), 18.0));

    // Wet saliva film: broad sheen + sharp sparkling stipple glints
    float broad = pow(max(dot(N, H), 0.0), 24.0) * 0.22;
    float glint = uDetail > 0 ? pow(max(dot(N, H), 0.0), 140.0) : 0.0;
    float sparkle = smoothstep(0.62, 0.9, s2) * (0.6 + 0.4 * sin(uMotionTime * 2.3 + s1 * 18.0));
    col += vec3(1.0, 0.9, 0.92) * (broad + glint * (0.55 + 1.6 * sparkle));
    col += vec3(1.0, 0.88, 0.9) * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0) * 0.18;

    float sulcus = smoothstep(0.30, 0.72, marginal) * (1.0 - smoothstep(0.64, 0.96, marginal));
    col *= (1.0 - 0.32 * sulcus) * (1.0 + headlamp(vWorldPos, N));
    gl_FragColor = vec4(attenuateOralLight(col, vWorldPos), 1.0);
  }
`;

export function createGingivaMaterial(hexColor = 0xe66c7e): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: {
      uGingivaColor: { value: new THREE.Color(hexColor) },
      uMotionTime: { value: 0 },
      uHeadlamp: { value: new THREE.Vector4() },
      uDepthCue: { value: new THREE.Vector2(18, 0.085) },
      uDetail: { value: 1 },
    },
    vertexShader: GINGIVA_VERT,
    fragmentShader: GINGIVA_FRAG,
  });
}

export function mergeBufferGeometriesSimple(
  geos: THREE.BufferGeometry[],
  toothIndices?: number[]
): THREE.BufferGeometry {
  let totalVerts = 0;
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of nonIndexed) totalVerts += g.attributes.position.count;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);
  const toothAttr = toothIndices ? new Float32Array(totalVerts) : null;

  let offset = 0;
  let geoIdx = 0;
  for (const g of nonIndexed) {
    const posAttr = g.attributes.position;
    const normAttr = g.attributes.normal;
    const colAttr = g.attributes.color;
    const count = posAttr.count;
    for (let i = 0; i < count; i++) {
      const dst = (offset + i) * 3;
      positions[dst] = posAttr.getX(i);
      positions[dst + 1] = posAttr.getY(i);
      positions[dst + 2] = posAttr.getZ(i);
      normals[dst] = normAttr ? normAttr.getX(i) : 0;
      normals[dst + 1] = normAttr ? normAttr.getY(i) : 1;
      normals[dst + 2] = normAttr ? normAttr.getZ(i) : 0;
      colors[dst] = colAttr ? colAttr.getX(i) : 1;
      colors[dst + 1] = colAttr ? colAttr.getY(i) : 0;
      colors[dst + 2] = colAttr ? colAttr.getZ(i) : 0;
    }
    // aToothId = toothIndex + 1 (0 means "not a companion crown")
    if (toothAttr && toothIndices) toothAttr.fill(toothIndices[geoIdx] + 1, offset, offset + count);
    geoIdx++;
    offset += count;
    if (!geos.includes(g)) g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (toothAttr) merged.setAttribute('aToothId', new THREE.BufferAttribute(toothAttr, 1));
  return merged;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------------------------
// Anatomical crown sculpting
// ---------------------------------------------------------------------------------------------
export type ToothKind = 'centralIncisor' | 'lateralIncisor' | 'canine' | 'premolar' | 'molar';

export interface CrownSculptParams {
  kind: ToothKind;
  /** Mesiodistal half-width (local X, along the arch). */
  halfW: number;
  /** Labio-lingual half-depth (local Z, +Z = labial/buccal). */
  halfD: number;
  /** Crown half-height (local Y). */
  halfH: number;
  /** Encoded Brush-Along quadrant stored in vertex color G. */
  encodedQuad: number;
  seed?: number;
}

/**
 * Sculpts a single anatomical crown from a unit sphere: superellipse cross-section for broad
 * proximal contact faces, cervical (CEJ) taper, height-of-contour bulge and occlusal anatomy
 * (incisal chisel + mamelons, pointed canine cusp, bicuspid premolar, 4-cusp cruciform molar).
 * Vertex color: R = baked AO, G = quadrant code, B = cervical→incisal height fraction (0..1).
 */
export function sculptCrownGeometry(p: CrownSculptParams): THREE.BufferGeometry {
  const widthSegs = p.kind === 'molar' || p.kind === 'premolar' ? 30 : 26;
  const geo = new THREE.SphereGeometry(1, widthSegs, 22);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const seed = p.seed ?? 0;
  const minHalf = Math.min(p.halfW, p.halfD);

  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i);
    const uy = pos.getY(i);
    const uz = pos.getZ(i);
    const h = (uy + 1) * 0.5;
    const rxz = Math.hypot(ux, uz);
    const theta = Math.atan2(uz, ux);

    // Superellipse (p=2.7) squares off the proximal & labial faces for tight contacts
    const c = Math.abs(Math.cos(theta));
    const s = Math.abs(Math.sin(theta));
    const pe = 2.7;
    const k = 1 / Math.pow(Math.pow(c, pe) + Math.pow(s, pe), 1 / pe);
    const radial = Math.pow(rxz, 0.42);

    // Cervical CEJ taper → height-of-contour bulge (~h 0.42) → occlusal narrowing
    const neck = 0.7 + 0.3 * smoothstep(0.02, 0.42, h);
    const topNarrowW = p.kind === 'molar' ? 0.88 : p.kind === 'premolar' ? 0.84 : 0.94;
    const topNarrowD = p.kind === 'centralIncisor' || p.kind === 'lateralIncisor' ? 0.42 : p.kind === 'canine' ? 0.62 : 0.8;
    const occl = smoothstep(0.5, 1.0, h);
    const sx = neck * (1 - (1 - topNarrowW) * occl);
    const sz = neck * (1 - (1 - topNarrowD) * occl);

    let x = Math.cos(theta) * k * radial * p.halfW * sx;
    let z = Math.sin(theta) * k * radial * p.halfD * sz;
    let y = uy * p.halfH;

    // Labial convexity: buccal faces bulge slightly outward, lingual cingulum fuller near the neck
    if (z > 0) z *= 1 + 0.06 * Math.sin(Math.PI * h);
    else z *= 1 + 0.1 * (1 - h) * (p.kind === 'molar' ? 0.4 : 1);

    const nx = x / p.halfW;
    const nz = z / p.halfD;
    const t = smoothstep(0.32, 1.0, uy);
    let fissureAo = 1.0;

    if (p.kind === 'centralIncisor' || p.kind === 'lateralIncisor') {
      // Straight incisal edge with three subtle mamelons
      y += t * 0.05 * minHalf * Math.cos(nx * Math.PI * 1.5 + seed);
      y -= t * t * 0.18 * minHalf * nx * nx;
    } else if (p.kind === 'canine') {
      // Iconic pointed cusp tip with mesial & distal slopes
      const cusp = Math.max(0, 1 - 1.25 * Math.abs(nx)) * Math.max(0, 1 - 0.6 * nz * nz);
      y += t * cusp * 0.62 * minHalf;
      y -= t * 0.12 * minHalf * Math.abs(nx);
    } else if (p.kind === 'premolar') {
      // Taller buccal cusp + lingual cusp around a central mesiodistal groove
      const buccal = Math.exp(-Math.pow(nz - 0.42, 2) / 0.09) * 0.52;
      const lingual = Math.exp(-Math.pow(nz + 0.45, 2) / 0.09) * 0.36;
      const groove = Math.exp(-(nz * nz) / 0.035) * 0.22;
      y += t * (buccal + lingual - groove - 0.1) * minHalf * (1 - 0.35 * nx * nx);
      fissureAo = 1 - groove * 1.6 * t;
    } else {
      // Four-cusp molar with cruciform central fossa & buccal groove
      let cusps = 0;
      for (const cx of [-0.46, 0.46]) {
        for (const cz of [-0.44, 0.46]) {
          const tall = cz > 0 ? 1.0 : 0.85;
          cusps += tall * Math.exp(-(Math.pow(nx - cx, 2) + Math.pow(nz - cz, 2)) / 0.075);
        }
      }
      const cross =
        Math.exp(-(nx * nx) / 0.02) * (1 - Math.abs(nz) * 0.4) +
        Math.exp(-(nz * nz) / 0.02) * (1 - Math.abs(nx) * 0.4);
      y += t * (cusps * 0.38 - cross * 0.16 - 0.08) * minHalf;
      fissureAo = 1 - Math.min(0.32, cross * 0.3) * t;
    }

    pos.setXYZ(i, x, y, z);

    const cervicalAo = h < 0.22 ? 0.6 + 0.4 * (h / 0.22) : 1.0;
    const proxAo = Math.abs(nx) > 0.82 ? 0.84 + 0.16 * (1 - (Math.abs(nx) - 0.82) / 0.4) : 1.0;
    cols[i * 3] = Math.max(0.45, cervicalAo * proxAo * fissureAo);
    cols[i * 3 + 1] = p.encodedQuad;
    cols[i * 3 + 2] = Math.max(0, Math.min(1, (h - 0.18) / 0.8));
  }

  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------------------------
// Plaque City macro-scale stage
// ---------------------------------------------------------------------------------------------
function signedDistToPlayableBoxes(boxes: readonly AABB2D[], x: number, z: number): number {
  let best = -999;
  for (const b of boxes) {
    const dx = Math.min(x - b.minX, b.maxX - x);
    const dz = Math.min(z - b.minZ, b.maxZ - z);
    const insideMargin = Math.min(dx, dz);
    if (insideMargin > best) best = insideMargin;
  }
  return best;
}

/** Interproximal tooth boundaries (district seams + contact divider walls) along X. */
function computeToothSeamsX(cartridge: WorldCartridge): number[] {
  const seams = new Set<number>();
  for (let i = 1; i < cartridge.districts.length; i++) {
    seams.add(Math.round(cartridge.districts[i].bounds.minX * 10) / 10);
  }
  for (const w of cartridge.wallBoxes) {
    seams.add(Math.round(((w.minX + w.maxX) * 0.5) * 10) / 10);
  }
  return [...seams].sort((a, b) => a - b);
}

/**
 * Organically sculpted enamel cusp ridge for an interproximal contact wall (replaces boxy pillars).
 * Rounded superellipsoid body sinking into the crown, marginal-ridge crest and gentle cusp lobes.
 */
function sculptContactRidge(w: AABB2D, baseH: number, seed: number): THREE.BufferGeometry {
  const halfW = Math.max(0.3, (w.maxX - w.minX) * 0.5) * 1.06;
  const halfD = Math.max(0.3, (w.maxZ - w.minZ) * 0.5) * 1.04;
  const halfH = 1.45;
  const longAxisX = halfW >= halfD;
  const geo = new THREE.SphereGeometry(1, 28, 16);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i);
    const uy = pos.getY(i);
    const uz = pos.getZ(i);
    const h = (uy + 1) * 0.5;
    const rxz = Math.hypot(ux, uz);
    const theta = Math.atan2(uz, ux);
    const c = Math.abs(Math.cos(theta));
    const s = Math.abs(Math.sin(theta));
    const pe = 3.4;
    const k = 1 / Math.pow(Math.pow(c, pe) + Math.pow(s, pe), 1 / pe);
    const radial = Math.pow(rxz, 0.38);
    const taper = 1 - 0.14 * smoothstep(0.45, 1.0, h);

    const x = Math.cos(theta) * k * radial * halfW * taper;
    const z = Math.sin(theta) * k * radial * halfD * taper;
    let y = uy * halfH;

    // Cusp lobes along the long axis + rounded marginal crest across the short axis
    const along = longAxisX ? x / halfW : z / halfD;
    const across = longAxisX ? z / halfD : x / halfW;
    const t = smoothstep(0.25, 1.0, uy);
    y += t * (0.2 * Math.sin(along * Math.PI * 1.6 + seed) + 0.16 * (1 - across * across) - 0.1);

    pos.setXYZ(i, x, y, z);
    const ao = h < 0.35 ? 0.55 + 0.45 * (h / 0.35) : 0.98;
    cols[i * 3] = ao;
    cols[i * 3 + 1] = -1;
    cols[i * 3 + 2] = Math.max(0, Math.min(1, (h - 0.3) / 0.7));
  }

  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  geo.translate((w.minX + w.maxX) * 0.5, baseH + halfH * 0.42, (w.minZ + w.maxZ) * 0.5);
  return geo;
}

export function buildCartridgeStageGroup(
  cartridge: WorldCartridge,
  enamelMaterial: THREE.ShaderMaterial
): { group: THREE.Group; dispose: () => void; gingivaMaterials: THREE.ShaderMaterial[] } {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];

  const segX = Math.min(144, Math.round(cartridge.worldWidth * 2));
  const segZ = Math.min(96, Math.round(cartridge.worldDepth * 2));

  const crownGeo = new THREE.PlaneGeometry(cartridge.worldWidth, cartridge.worldDepth, segX, segZ);
  crownGeo.rotateX(-Math.PI / 2);
  crownGeo.translate(cartridge.worldWidth * 0.5, 0, cartridge.worldDepth * 0.5);

  const pos = crownGeo.attributes.position;
  const vertCount = pos.count;
  const colors = new Float32Array(vertCount * 3);
  const allWalls = [...cartridge.wallBoxes, ...buildAlleyWalls(cartridge)];
  const seams = computeToothSeamsX(cartridge);

  let maxHill = 0.25;
  for (const h of cartridge.heightCuspHills) maxHill = Math.max(maxHill, 0.25 + h.height);

  for (let i = 0; i < vertCount; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);

    let marginDist = signedDistToPlayableBoxes(cartridge.playableMaskBoxes, x, z);
    let y = sampleTerrainHeight(cartridge, x, z);

    // Embrasure pinch: the crown outline necks in at each interproximal seam (scalloped arch)
    let seamProx = 0;
    for (const sx of seams) seamProx = Math.max(seamProx, Math.exp(-Math.pow((x - sx) / 1.5, 2)));
    if (marginDist < 2.2) marginDist -= 0.95 * seamProx;

    // Carve anatomical fissure grooves along marginBands
    let fissureAo = 1.0;
    for (const band of cartridge.marginBands) {
      const dSq = distancePointToSegmentSq2D(x, z, band.a.x, band.a.z, band.b.x, band.b.z);
      const rSq = band.radius * band.radius;
      if (dSq < rSq) {
        const k = 1 - dSq / rSq;
        y -= 0.18 * k;
        fissureAo = Math.min(fissureAo, 1.0 - 0.37 * k);
      }
    }

    // Rounded cervical bevel below the gingiva outside playable boxes
    let edgeAo = 1.0;
    if (marginDist < 0.8) {
      const t = Math.max(0, Math.min(1, (0.8 - marginDist) / 2.2));
      y -= t * t * 2.1;
      edgeAo = 1.0 - 0.32 * t;
    }

    // Cavity AO near interproximal enamel walls
    let wallAo = 1.0;
    for (const w of allWalls) {
      const cx = Math.max(w.minX, Math.min(x, w.maxX));
      const cz = Math.max(w.minZ, Math.min(z, w.maxZ));
      const d = Math.hypot(x - cx, z - cz);
      if (d < 1.3) wallAo = Math.min(wallAo, 0.46 + 0.54 * (d / 1.3));
    }

    pos.setY(i, y);
    const ao = Math.max(0.33, fissureAo * edgeAo * wallAo);
    colors[i * 3] = ao;
    colors[i * 3 + 1] = -1; // not a Brush-Along quadrant tooth
    // Height fraction: cusp tips read pearly-translucent, fissures & cervical bevel dentin-warm
    colors[i * 3 + 2] = Math.max(0, Math.min(1, (y + 0.4) / (maxHill + 0.4)));
  }

  crownGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  crownGeo.computeVertexNormals();
  disposables.push(crownGeo);
  group.add(new THREE.Mesh(crownGeo, enamelMaterial));

  // Sculpted rounded enamel contact ridges merged into 1 draw call
  if (allWalls.length > 0) {
    const ridgeGeos = allWalls.map((w, idx) =>
      sculptContactRidge(w, sampleTerrainHeight(cartridge, (w.minX + w.maxX) * 0.5, (w.minZ + w.maxZ) * 0.5), idx * 1.7)
    );
    const mergedRidges = mergeBufferGeometriesSimple(ridgeGeos);
    for (const g of ridgeGeos) g.dispose();
    disposables.push(mergedRidges);
    group.add(new THREE.Mesh(mergedRidges, enamelMaterial));
  }

  // Scalloped coral gingiva bed with interdental papillae at each tooth seam (1 draw call)
  const gumGeo = new THREE.PlaneGeometry(cartridge.worldWidth + 14, cartridge.worldDepth + 14, 96, 48);
  gumGeo.rotateX(-Math.PI / 2);
  gumGeo.translate(cartridge.worldWidth * 0.5, 0, cartridge.worldDepth * 0.5);
  const gPos = gumGeo.attributes.position;
  const gCols = new Float32Array(gPos.count * 3);
  for (let i = 0; i < gPos.count; i++) {
    const x = gPos.getX(i);
    const z = gPos.getZ(i);
    const marginDist = signedDistToPlayableBoxes(cartridge.playableMaskBoxes, x, z);
    let papilla = 0;
    for (const sx of seams) papilla = Math.max(papilla, Math.exp(-Math.pow((x - sx) / 1.35, 2)));
    const collar = Math.exp(-Math.pow((marginDist + 0.5) / 1.6, 2));
    const collarWave = collar * (0.62 + 0.75 * papilla);
    const outerFalloff = marginDist < -2.0 ? Math.max(-2.6, (marginDist + 2.0) * 0.28) : 0;
    const insideDip = marginDist > 0.6 ? -1.4 : 0;
    gPos.setY(i, -0.15 + collarWave + outerFalloff + insideDip);
    gCols[i * 3] = marginDist > -0.2 ? 0.68 : 0.96;
    gCols[i * 3 + 1] = Math.min(1, collar * (0.6 + 0.4 * papilla));
    gCols[i * 3 + 2] = 0;
  }
  gumGeo.setAttribute('color', new THREE.BufferAttribute(gCols, 3));
  gumGeo.computeVertexNormals();
  const gumMat = createGingivaMaterial(cartridge.palette.gingivaHex);
  disposables.push(gumGeo, gumMat);
  group.add(new THREE.Mesh(gumGeo, gumMat));

  return {
    group,
    gingivaMaterials: [gumMat],
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Pocket Smooth Bask Companion Arch
// ---------------------------------------------------------------------------------------------
export interface CompanionToothFrame {
  index: number;
  kind: ToothKind;
  /** Crown center in WORLD space. */
  center: THREE.Vector3;
  halfW: number;
  halfD: number;
  halfH: number;
  /** Rotation about +Y mapping local X → arch tangent and local +Z → labial normal. */
  yaw: number;
}

export interface CompanionArchBuild {
  group: THREE.Group;
  teethMesh: THREE.Mesh;
  gingivaMaterial: THREE.ShaderMaterial;
  teeth: CompanionToothFrame[];
  dispose: () => void;
}

const ARCH_RX = 9.6;
const ARCH_RZ = 8.4;
const ARCH_Z_OFFSET = -1.6;
const ARCH_T_MAX = Math.PI * 0.62;

function archPoint(t: number): { x: number; z: number; tx: number; tz: number } {
  const x = Math.sin(t) * ARCH_RX;
  const z = Math.cos(t) * ARCH_RZ + ARCH_Z_OFFSET;
  const dx = Math.cos(t) * ARCH_RX;
  const dz = -Math.sin(t) * ARCH_RZ;
  const len = Math.hypot(dx, dz) || 1;
  return { x, z, tx: dx / len, tz: dz / len };
}

/** Builds a dense arc-length table so crowns can be packed contiguously along the arch. */
function buildArcTable(samples = 720): { ts: Float64Array; lens: Float64Array; total: number } {
  const ts = new Float64Array(samples + 1);
  const lens = new Float64Array(samples + 1);
  let acc = 0;
  let prev = archPoint(-ARCH_T_MAX);
  for (let i = 0; i <= samples; i++) {
    const t = -ARCH_T_MAX + (2 * ARCH_T_MAX * i) / samples;
    const p = archPoint(t);
    if (i > 0) acc += Math.hypot(p.x - prev.x, p.z - prev.z);
    ts[i] = t;
    lens[i] = acc;
    prev = p;
  }
  return { ts, lens, total: acc };
}

function tAtArcLength(table: ReturnType<typeof buildArcTable>, s: number): number {
  const { ts, lens } = table;
  if (s <= 0) return ts[0];
  if (s >= table.total) return ts[ts.length - 1];
  let lo = 0;
  let hi = lens.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lens[mid] < s) lo = mid;
    else hi = mid;
  }
  const u = (s - lens[lo]) / Math.max(1e-9, lens[hi] - lens[lo]);
  return ts[lo] + (ts[hi] - ts[lo]) * u;
}

/**
 * Builds the curved 14-tooth anatomical Companion Arch: contiguous incisors, canines, bicuspid
 * premolars and 4-cusp molars packed by arc length with tight proximal contacts, rising from a
 * scalloped gingival collar with pointed interdental papillae.
 * 1 merged enamel draw call + 1 sculpted gingiva draw call.
 */
export function buildCompanionArchGroup(enamelMaterial: THREE.ShaderMaterial): CompanionArchBuild {
  const group = new THREE.Group();
  group.position.set(32, 0.4, 16);
  group.updateMatrixWorld(true);

  // Relative real-world crown proportions (mm), from midline → distal on each side
  const halfArchKinds: Array<{ kind: ToothKind; w: number; d: number; h: number }> = [
    { kind: 'centralIncisor', w: 8.6, d: 7.0, h: 10.4 },
    { kind: 'lateralIncisor', w: 6.6, d: 6.2, h: 9.2 },
    { kind: 'canine', w: 7.6, d: 8.0, h: 10.2 },
    { kind: 'premolar', w: 7.0, d: 9.0, h: 8.4 },
    { kind: 'premolar', w: 6.6, d: 9.0, h: 7.8 },
    { kind: 'molar', w: 10.2, d: 11.0, h: 7.4 },
    { kind: 'molar', w: 9.2, d: 10.6, h: 7.0 },
  ];
  const ordered = [...halfArchKinds].reverse().concat(halfArchKinds); // right molar → left molar
  const totalMm = ordered.reduce((acc, t) => acc + t.w, 0);
  const table = buildArcTable();
  const contactGap = 0.015;
  const mmToU = (table.total - contactGap * ordered.length) / totalMm;

  const toothGeos: THREE.BufferGeometry[] = [];
  const teeth: CompanionToothFrame[] = [];
  const contactArcPositions: number[] = [];
  const toothArcSpans: Array<{ s0: number; s1: number; halfD: number }> = [];

  let cursor = contactGap * 0.5;
  for (let ti = 0; ti < ordered.length; ti++) {
    const spec = ordered[ti];
    const width = spec.w * mmToU;
    const sCenter = cursor + width * 0.5;
    const t = tAtArcLength(table, sCenter);
    const ap = archPoint(t);

    const halfW = width * 0.5 * 1.02; // slight overlap → tight proximal contacts
    const halfD = spec.d * mmToU * 0.5 * 0.92;
    const halfH = spec.h * mmToU * 0.5 * 1.05;

    const quadIdx = Math.min(3, Math.floor((ti / ordered.length) * 4));
    const geo = sculptCrownGeometry({
      kind: spec.kind,
      halfW,
      halfD,
      halfH,
      encodedQuad: (quadIdx + 0.5) / 4.0,
      seed: ti * 0.37,
    });

    const yaw = Math.atan2(-ap.tz, ap.tx);
    geo.rotateY(yaw);
    // Neck (h≈0.18 → y≈-0.64·halfH) sits at the gingival zenith (~0.62)
    const centerY = 0.62 + 0.64 * halfH;
    geo.translate(ap.x, centerY, ap.z);
    toothGeos.push(geo);

    teeth.push({
      index: ti,
      kind: spec.kind,
      center: new THREE.Vector3(ap.x, centerY, ap.z).applyMatrix4(group.matrixWorld),
      halfW,
      halfD,
      halfH,
      yaw,
    });

    toothArcSpans.push({ s0: cursor, s1: cursor + width, halfD });
    if (ti > 0) contactArcPositions.push(cursor - contactGap * 0.5);
    cursor += width + contactGap;
  }

  const mergedTeeth = mergeBufferGeometriesSimple(
    toothGeos,
    toothGeos.map((_, i) => i)
  );
  for (const tg of toothGeos) tg.dispose();
  const teethMesh = new THREE.Mesh(mergedTeeth, enamelMaterial);
  group.add(teethMesh);

  const gumGeo = buildScallopedGingivaCollar(table, toothArcSpans, contactArcPositions);
  const gumMat = createGingivaMaterial(0xe7858f);
  group.add(new THREE.Mesh(gumGeo, gumMat));

  return {
    group,
    teethMesh,
    gingivaMaterial: gumMat,
    teeth,
    dispose: () => {
      mergedTeeth.dispose();
      gumGeo.dispose();
      gumMat.dispose();
    },
  };
}

/**
 * Sweeps a gingival cross-section along the arch. The crest rises into pointed interdental papillae
 * at every proximal contact and dips to a rounded zenith over each crown's labial center, hugging
 * the cervical necks; the collar tapers closed behind the last molars.
 */
function buildScallopedGingivaCollar(
  table: ReturnType<typeof buildArcTable>,
  spans: Array<{ s0: number; s1: number; halfD: number }>,
  contacts: number[]
): THREE.BufferGeometry {
  const along = 220;
  // Cross-section: [outward offset factor (relative to local neck depth), height key]
  const profile: Array<[number, 'base' | 'mid' | 'crestOuter' | 'crest' | 'inner']> = [
    [2.35, 'base'],
    [2.0, 'mid'],
    [1.42, 'crestOuter'],
    [1.06, 'crest'],
    [0.7, 'inner'],
    [0.0, 'inner'],
    [-0.7, 'inner'],
    [-1.06, 'crest'],
    [-1.42, 'crestOuter'],
    [-2.0, 'mid'],
    [-2.35, 'base'],
  ];
  const rows = profile.length;
  const extra = 1.6; // collar continues past the last molars and closes
  const sStart = -extra;
  const sEnd = table.total + extra;

  const positions = new Float32Array((along + 1) * rows * 3);
  const colors = new Float32Array((along + 1) * rows * 3);

  for (let a = 0; a <= along; a++) {
    const s = sStart + ((sEnd - sStart) * a) / along;
    const sClamped = Math.max(0, Math.min(table.total, s));
    const t = tAtArcLength(table, sClamped);
    const ap = archPoint(t);
    const nx = -ap.tz;
    const nz = ap.tx;

    // Local neck depth & distance to nearest contact (papilla) vs crown center (zenith)
    let neckD = 0.9;
    let zenith = 0;
    for (const sp of spans) {
      if (sClamped >= sp.s0 && sClamped <= sp.s1) {
        neckD = sp.halfD * 0.78;
        const u = (sClamped - sp.s0) / Math.max(1e-6, sp.s1 - sp.s0);
        zenith = Math.sin(Math.PI * u);
        break;
      }
    }
    let rootU = 0;
    for (const sp of spans) {
      if (sClamped >= sp.s0 && sClamped <= sp.s1) {
        rootU = (sClamped - sp.s0) / Math.max(1e-6, sp.s1 - sp.s0);
        break;
      }
    }
    let papilla = 0;
    for (const cs of contacts) papilla = Math.max(papilla, Math.exp(-Math.pow((sClamped - cs) / 0.32, 2)));

    // End taper behind the terminal molars
    const endFade = s < 0 ? 1 - Math.min(1, -s / extra) : s > table.total ? 1 - Math.min(1, (s - table.total) / extra) : 1;
    const endScale = 0.35 + 0.65 * Math.sqrt(Math.max(0, endFade));

    const crestY = 0.66 + 0.5 * papilla - 0.08 * zenith;
    for (let r = 0; r < rows; r++) {
      const [factor, key] = profile[r];
      const rootOut = key === 'mid' ? 1 + 0.07 * Math.sin(Math.PI * rootU) : 1;
      const off = factor * neckD * endScale * rootOut;
      let y: number;
      let ao = 0.95;
      let marginal = 0;
      if (key === 'base') {
        y = -0.55;
        ao = 0.78;
      } else if (key === 'mid') {
        y = 0.05 + 0.1 * papilla;
      } else if (key === 'crestOuter') {
        y = crestY - 0.32;
        marginal = 0.45;
      } else if (key === 'crest') {
        y = crestY;
        marginal = 1;
      } else {
        y = crestY - 0.06;
        ao = 0.48; // sulcus shadow where enamel emerges
        marginal = 1;
      }
      // Jugae alveolares: gentle root-eminence bulges over each root, shallow grooves between roots
      if (key === 'mid' || key === 'base') {
        const rootBulge = 0.5 + 0.5 * Math.sin(Math.PI * rootU);
        if (key === 'mid') y += 0.07 * rootBulge * endFade - 0.03 * papilla;
      }
      y = y * (0.55 + 0.45 * endFade) - (1 - endFade) * 0.2;
      const idx = (a * rows + r) * 3;
      positions[idx] = ap.x + nx * off;
      positions[idx + 1] = y;
      positions[idx + 2] = ap.z + nz * off;
      colors[idx] = ao;
      colors[idx + 1] = marginal;
      colors[idx + 2] = 0;
    }
  }

  const indices: number[] = [];
  for (let a = 0; a < along; a++) {
    for (let r = 0; r < rows - 1; r++) {
      const i0 = a * rows + r;
      const i1 = i0 + 1;
      const i2 = i0 + rows;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
