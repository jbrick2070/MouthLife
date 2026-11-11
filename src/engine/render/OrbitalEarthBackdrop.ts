import * as THREE from 'three';
import {
  EARTH_BACKDROP_POS,
  EARTH_BACKDROP_RADIUS,
} from '../../config/gameConfig';
import { HOST_CITIES } from '../../config/hostsAndHistory';
import { mergeBufferGeometriesSimple, sculptCrownGeometry } from './CartridgeMeshBuilder';
import { createCrystalLitMaterial } from './EntityBatchRenderer';

// Glowing lattice bond cylinders (additive, pulse travelling along each bond)
const BOND_VERT = /* glsl */ `
  varying float vAlong;
  varying vec3 vInstColor;
  void main() {
    vAlong = position.y + 0.5;
    vInstColor = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      vInstColor = instanceColor;
    #endif
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const BOND_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  varying float vAlong;
  varying vec3 vInstColor;
  void main() {
    float pulse = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(vAlong * 6.2831 - uTime * 3.4), 3.0);
    gl_FragColor = vec4(vInstColor * pulse * uIntensity, 1.0);
  }
`;

// Mohs specimen lineup: one merged geometry, per-vertex specimen id & pivot, spun in-shader.
const MOHS_VERT = /* glsl */ `
  attribute vec3 aCenter;
  attribute float aSpec;
  uniform float uTime;
  uniform float uSelected;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vColor;
  varying float vSel;
  varying float vSpec;
  void main() {
    float sel = 1.0 - step(0.5, abs(aSpec - uSelected));
    float ang = uTime * (0.55 + 0.9 * sel) + aSpec * 1.3;
    float c = cos(ang);
    float s = sin(ang);
    vec3 local = position - aCenter;
    local *= 1.0 + 0.38 * sel;
    vec3 rp = vec3(c * local.x + s * local.z, local.y, -s * local.x + c * local.z);
    vec3 rn = vec3(c * normal.x + s * normal.z, normal.y, -s * normal.x + c * normal.z);
    vec3 p = aCenter + rp + vec3(0.0, sel * (0.35 + 0.08 * sin(uTime * 3.0)), 0.0);
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * rn);
    vColor = color;
    vSel = sel;
    vSpec = aSpec;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const MOHS_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec3 vColor;
  varying float vSel;
  varying float vSpec;
  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(vec3(0.42, 0.85, 0.38));
    vec3 H = normalize(L + V);
    float NdotV = max(dot(N, V), 0.0);
    float wrap = max(0.0, (dot(N, L) + 0.45) / 1.45);
    float metal = (vSpec < 1.5) ? 1.0 : 0.0;         // Gold & Iron
    float gem = step(2.5, vSpec);                     // Quartz & Diamond
    float specPow = mix(40.0, 120.0, gem);
    float spec = pow(max(dot(N, H), 0.0), specPow);
    vec3 specCol = mix(vec3(0.95, 0.98, 1.0), vColor * 1.4, metal);
    vec3 col = vColor * (0.34 + 0.75 * wrap) * (1.0 - 0.18 * metal);
    col += specCol * spec * (0.7 + 0.8 * gem + 0.3 * metal);
    // Gem dispersion fringes (diamond strongest)
    if (gem > 0.5) {
      float disp = (vSpec > 3.5) ? 1.0 : 0.45;
      vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (dot(reflect(-V, N), vec3(0.4, 0.7, 0.3)) * 2.4 + vec3(0.0, 0.33, 0.67)) + uTime);
      col += rainbow * pow(1.0 - NdotV, 1.5) * 0.55 * disp;
    }
    col += vec3(0.9, 0.98, 1.0) * pow(1.0 - NdotV, 2.6) * 0.35;
    col += vColor * vSel * (0.18 + 0.1 * sin(uTime * 4.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

function paintSolidColor(geo: THREE.BufferGeometry, hex: number): void {
  const n = geo.attributes.position.count;
  const col = new THREE.Color(hex);
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    cols[i * 3] = col.r;
    cols[i * 3 + 1] = col.g;
    cols[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}

function tagSpecimen(
  geo: THREE.BufferGeometry,
  hex: number,
  center: THREE.Vector3,
  smooth: 'flat' | 'indexed' | 'radial' | 'keep',
  preserveColor = false
): THREE.BufferGeometry {
  if (smooth === 'indexed' && geo.index) geo.computeVertexNormals();
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (smooth === 'flat') {
    g.computeVertexNormals();
  } else if (smooth === 'radial') {
    // Smooth organic normals for rounded nuggets (direction from pivot)
    const p = g.attributes.position;
    const n = new Float32Array(p.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i) * 1.25, p.getZ(i)).normalize();
      n[i * 3] = v.x;
      n[i * 3 + 1] = v.y;
      n[i * 3 + 2] = v.z;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  }
  g.translate(center.x, center.y, center.z);
  if (!preserveColor || !g.getAttribute('color')) {
    paintSolidColor(g, hex);
  }
  return g;
}

/** Five instantly-recognizable Mohs silhouettes merged into one draw call. */
function buildMohsSpecimenGeometry(centers: THREE.Vector3[]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 0 · Gold 2.5 — soft rounded lumpy nugget
  const nugget = new THREE.IcosahedronGeometry(0.62, 3);
  const np = nugget.attributes.position;
  for (let i = 0; i < np.count; i++) {
    const v = new THREE.Vector3(np.getX(i), np.getY(i), np.getZ(i));
    const bump = 1 + 0.16 * Math.sin(v.x * 7.1 + 1.3) * Math.sin(v.y * 6.3) + 0.1 * Math.sin(v.z * 9.7 + v.x * 3.0);
    v.multiplyScalar(bump);
    v.y *= 0.78;
    np.setXYZ(i, v.x, v.y, v.z);
  }
  parts.push(tagSpecimen(nugget, 0xfbbf24, centers[0], 'radial'));

  // 1 · Iron 4.0 — chunky hex-head forged bolt
  const head = new THREE.CylinderGeometry(0.44, 0.44, 0.26, 6, 1);
  head.translate(0, 0.42, 0);
  const shank = new THREE.CylinderGeometry(0.2, 0.2, 0.9, 14, 6);
  const sp = shank.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i);
    const ang = Math.atan2(sp.getZ(i), sp.getX(i));
    const thread = 1 + 0.12 * Math.max(0, Math.sin(y * 34 + ang));
    sp.setX(i, sp.getX(i) * thread);
    sp.setZ(i, sp.getZ(i) * thread);
  }
  shank.translate(0, -0.15, 0);
  const iron = mergeBufferGeometriesSimple([head.toNonIndexed(), shank.toNonIndexed()]);
  head.dispose();
  shank.dispose();
  parts.push(tagSpecimen(iron, 0xd6dde6, centers[1], 'flat'));

  // 2 · Tooth Enamel 5.0 — 4-cusp pearly molar crown + bifurcated warm-cementum anatomical root
  const crown = sculptCrownGeometry({ kind: 'molar', halfW: 0.54, halfD: 0.56, halfH: 0.44, encodedQuad: 0 });
  crown.translate(0, 0.25, 0);
  crown.computeVertexNormals();
  paintSolidColor(crown, 0xf0f9ff);

  const rootTrunk = new THREE.CylinderGeometry(0.39, 0.31, 0.22, 14, 1);
  rootTrunk.scale(1.0, 1.0, 0.88);
  rootTrunk.translate(0, -0.14, 0);
  rootTrunk.computeVertexNormals();
  paintSolidColor(rootTrunk, 0xedd5af);

  const buildMolarRootProng = (side: -1 | 1): THREE.BufferGeometry => {
    const prong = new THREE.CylinderGeometry(0.145, 0.058, 0.46, 12, 4);
    const pp = prong.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const y = pp.getY(i); // -0.23..+0.23
      const t = (0.23 - y) / 0.46; // 0 at furcation -> 1 at apex
      // Gentle anatomical root arch: splays outward from furcation then curves slightly at apex
      pp.setX(i, pp.getX(i) + side * (0.12 * Math.sin(t * Math.PI * 0.75)));
      pp.setZ(i, pp.getZ(i) * 0.84);
    }
    prong.translate(side * 0.21, -0.38, 0);
    prong.computeVertexNormals();
    paintSolidColor(prong, 0xe7ca9e);
    return prong;
  };

  const mesialRoot = buildMolarRootProng(-1);
  const distalRoot = buildMolarRootProng(1);
  const molarTooth = mergeBufferGeometriesSimple([crown, rootTrunk, mesialRoot, distalRoot]);
  [crown, rootTrunk, mesialRoot, distalRoot].forEach((g) => g.dispose());
  parts.push(tagSpecimen(molarTooth, 0xf0f9ff, centers[2], 'keep', true));

  // 3 · Quartz 7.0 — hexagonal prism with pyramidal termination (+ a smaller twin point)
  const prism = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 6, 1);
  const cap = new THREE.ConeGeometry(0.3, 0.42, 6, 1);
  cap.translate(0, 0.66, 0);
  const twin = new THREE.CylinderGeometry(0.15, 0.15, 0.5, 6, 1);
  twin.translate(0, 0, 0);
  const twinCap = new THREE.ConeGeometry(0.15, 0.24, 6, 1);
  twinCap.translate(0, 0.37, 0);
  const twinMerged = mergeBufferGeometriesSimple([twin.toNonIndexed(), twinCap.toNonIndexed()]);
  twinMerged.rotateZ(-0.5);
  twinMerged.translate(0.32, -0.15, 0.12);
  const quartz = mergeBufferGeometriesSimple([prism.toNonIndexed(), cap.toNonIndexed(), twinMerged]);
  quartz.translate(0, -0.1, 0);
  [prism, cap, twin, twinCap].forEach((g) => g.dispose());
  parts.push(tagSpecimen(quartz, 0xddd6fe, centers[3], 'flat'));

  // 4 · Diamond 10.0 — round brilliant cut (table, crown facets, pavilion point)
  const crownCut = new THREE.CylinderGeometry(0.36, 0.62, 0.24, 8, 1);
  crownCut.translate(0, 0.12, 0);
  const pavilion = new THREE.ConeGeometry(0.62, 0.66, 8, 1);
  pavilion.rotateX(Math.PI);
  pavilion.translate(0, -0.33, 0);
  const diamond = mergeBufferGeometriesSimple([crownCut.toNonIndexed(), pavilion.toNonIndexed()]);
  diamond.translate(0, 0.08, 0);
  crownCut.dispose();
  pavilion.dispose();
  parts.push(tagSpecimen(diamond, 0xa5f3fc, centers[4], 'flat'));

  // Merge and attach specimen ids + pivots
  let total = 0;
  for (const g of parts) total += g.attributes.position.count;
  const merged = mergeBufferGeometriesSimple(parts);
  const aCenter = new Float32Array(total * 3);
  const aSpec = new Float32Array(total);
  let off = 0;
  parts.forEach((g, idx) => {
    const n = g.attributes.position.count;
    for (let i = 0; i < n; i++) {
      aCenter[(off + i) * 3] = centers[idx].x;
      aCenter[(off + i) * 3 + 1] = centers[idx].y;
      aCenter[(off + i) * 3 + 2] = centers[idx].z;
      aSpec[off + i] = idx;
    }
    off += n;
    g.dispose();
  });
  merged.setAttribute('aCenter', new THREE.BufferAttribute(aCenter, 3));
  merged.setAttribute('aSpec', new THREE.BufferAttribute(aSpec, 1));
  return merged;
}

const EARTH_VERT = /* glsl */ `
  varying vec3 vLocalNormal;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vLocalNormal = normalize(normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const EARTH_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vLocalNormal;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  float hash3(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash3(i);
    float n100 = hash3(i + vec3(1, 0, 0));
    float n010 = hash3(i + vec3(0, 1, 0));
    float n110 = hash3(i + vec3(1, 1, 0));
    float n001 = hash3(i + vec3(0, 0, 1));
    float n101 = hash3(i + vec3(1, 0, 1));
    float n011 = hash3(i + vec3(0, 1, 1));
    float n111 = hash3(i + vec3(1, 1, 1));
    vec4 nx0 = mix(vec4(n000, n010, n001, n011), vec4(n100, n110, n101, n111), f.x);
    vec2 nxy = mix(nx0.xz, nx0.yw, f.y);
    return mix(nxy.x, nxy.y, f.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise3(p);
      p *= 2.05;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 n = normalize(vLocalNormal);
    float lat = abs(n.y);
    float cont = fbm(n * 2.65 + vec3(1.2, -0.4, 0.8));
    float detail = noise3(n * 8.5);
    float landMask = smoothstep(0.49, 0.54, cont + detail * 0.08 - lat * 0.05);

    vec3 deepOcean = vec3(0.03, 0.16, 0.36);
    vec3 shallowSea = vec3(0.06, 0.38, 0.56);
    vec3 ocean = mix(deepOcean, shallowSea, smoothstep(0.36, 0.50, cont));

    vec3 lushLand = vec3(0.14, 0.46, 0.28);
    vec3 aridLand = vec3(0.62, 0.52, 0.34);
    vec3 land = mix(lushLand, aridLand, smoothstep(0.55, 0.78, cont + detail * 0.15));

    vec3 albedo = mix(ocean, land, landMask);

    // Polar ice caps
    float ice = smoothstep(0.76, 0.88, lat + detail * 0.06);
    albedo = mix(albedo, vec3(0.90, 0.96, 1.0), ice);

    // Drifting orbital cloud swirls
    float clouds = smoothstep(0.54, 0.74, fbm(n * 3.8 + vec3(uTime * 0.015, 0.0, -uTime * 0.01)));
    albedo = mix(albedo, vec3(0.95, 0.98, 1.0), clouds * 0.52);

    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 sunDir = normalize(vec3(0.55, 0.42, 0.72));
    float NdotL = dot(normalize(vWorldNormal), sunDir);
    float dayTerm = smoothstep(-0.18, 0.25, NdotL);

    vec3 lit = albedo * (0.14 + 0.92 * max(NdotL, 0.0));
    // Warm city lights hint on night side of continents
    float nightGlow = (1.0 - dayTerm) * landMask * smoothstep(0.55, 0.75, detail);
    lit += vec3(1.0, 0.76, 0.38) * nightGlow * 0.35;

    // Ocean sun glint
    vec3 H = normalize(sunDir + V);
    float spec = pow(max(dot(normalize(vWorldNormal), H), 0.0), 42.0) * (1.0 - landMask) * (1.0 - clouds);
    lit += vec3(0.65, 0.88, 1.0) * spec * 0.45 * dayTerm;

    // Rayleigh atmospheric blue-cyan limb glow
    float rim = pow(1.0 - max(dot(normalize(vWorldNormal), V), 0.0), 2.8);
    lit += vec3(0.22, 0.68, 1.0) * rim * 0.82;

    gl_FragColor = vec4(lit, 1.0);
  }
`;

export function latLonToUnitVec3(latDeg: number, lonDeg: number): THREE.Vector3 {
  const phi = ((90 - latDeg) * Math.PI) / 180;
  const theta = ((lonDeg + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
}

export class OrbitalEarthBackdrop {
  readonly rootGroup = new THREE.Group();
  readonly earthPivot = new THREE.Group();
  readonly cosmicShowcaseGroup = new THREE.Group();

  private earthMaterial: THREE.ShaderMaterial;
  private crystalCoreMesh: THREE.Mesh;
  private crystalCoreMat: THREE.ShaderMaterial;
  private atomicOrbitGroup = new THREE.Group();
  private fluorideLockGroup = new THREE.Group();
  private mohsLineupGroup = new THREE.Group();
  private mohsMaterial!: THREE.ShaderMaterial;
  private mohsRing!: THREE.Mesh;
  private mohsRingMat!: THREE.MeshBasicMaterial;
  private mohsCenters: THREE.Vector3[] = [];
  private selectedMohsIdx = 2;
  private bondMaterial!: THREE.ShaderMaterial;
  private latticeGroup = new THREE.Group();
  private stationMarkerPivot = new THREE.Group();
  private stationMesh!: THREE.Mesh;
  private pinInst!: THREE.InstancedMesh;
  private groundCities = HOST_CITIES.filter((c) => !c.isOrbital);
  private selectedCityId = 'toronto';
  private tmpDummy = new THREE.Object3D();

  private targetEarthRotY = -0.35;
  private targetEarthRotX = 0.28;
  private autoSpin = true;
  private cosmicBeatIndex = 0;

  constructor() {
    this.rootGroup.position.set(
      EARTH_BACKDROP_POS.x,
      EARTH_BACKDROP_POS.y,
      EARTH_BACKDROP_POS.z
    );

    // 1. Starfield (1 single Points draw call!)
    const starCount = 340;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // Deterministic golden-angle spherical distribution around backdrop
      const u = ((i * 0.61803398875) % 1) * 2 - 1;
      const theta = i * 2.3999632;
      const r = 95 + (i % 7) * 14;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      starPositions[i * 3] = Math.cos(theta) * s * r;
      starPositions[i * 3 + 1] = u * r * 0.75 + 10;
      starPositions[i * 3 + 2] = Math.sin(theta) * s * r;

      const tint = i % 3;
      starColors[i * 3] = tint === 0 ? 0.85 : tint === 1 ? 1.0 : 0.75;
      starColors[i * 3 + 1] = tint === 0 ? 0.94 : tint === 1 ? 0.92 : 0.88;
      starColors[i * 3 + 2] = 1.0;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 1.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    this.rootGroup.add(new THREE.Points(starGeo, starMat));

    // 2. 3D Procedural Earth Sphere + City Pins
    this.earthMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
    });
    const earthGeo = new THREE.SphereGeometry(EARTH_BACKDROP_RADIUS, 44, 32);
    const earthMesh = new THREE.Mesh(earthGeo, this.earthMaterial);
    this.earthPivot.add(earthMesh);

    // City markers batched into one InstancedMesh on Earth + orbital LEO ring
    const groundCities = HOST_CITIES.filter((c) => !c.isOrbital);
    const pinGeo = new THREE.SphereGeometry(0.58, 12, 10);
    const pinMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pinInst = new THREE.InstancedMesh(pinGeo, pinMat, groundCities.length);
    this.pinInst = pinInst;
    const dummy = new THREE.Object3D();
    groundCities.forEach((city, idx) => {
      const dir = latLonToUnitVec3(city.lat, city.lon);
      dummy.position.copy(dir).multiplyScalar(EARTH_BACKDROP_RADIUS + 0.35);
      dummy.scale.setScalar(city.playableInSlice ? 1.35 : 0.95);
      dummy.updateMatrix();
      pinInst.setMatrixAt(idx, dummy.matrix);
      pinInst.setColorAt(idx, new THREE.Color(city.hostAccentHex));
    });
    pinInst.instanceMatrix.needsUpdate = true;
    if (pinInst.instanceColor) pinInst.instanceColor.needsUpdate = true;
    this.earthPivot.add(pinInst);

    // Orbital LEO ring + Station Aurora marker (408 km LEO)
    const orbitRingGeo = new THREE.TorusGeometry(EARTH_BACKDROP_RADIUS + 2.6, 0.09, 8, 64);
    const orbitRingMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.48,
    });
    const orbitRing = new THREE.Mesh(orbitRingGeo, orbitRingMat);
    orbitRing.rotation.x = Math.PI * 0.36;
    orbitRing.rotation.y = 0.25;
    this.earthPivot.add(orbitRing);

    const stationMesh = (this.stationMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.75, 0),
      new THREE.MeshBasicMaterial({ color: 0x6ee7b7 })
    ));
    stationMesh.position.set(EARTH_BACKDROP_RADIUS + 2.6, 0, 0);
    this.stationMarkerPivot.rotation.copy(orbitRing.rotation);
    this.stationMarkerPivot.add(stationMesh);
    this.earthPivot.add(this.stationMarkerPivot);

    this.rootGroup.add(this.earthPivot);

    // 3. Cosmic Origins Showcase Group (visible ONLY in COSMIC_INTRO mode!)
    // Positioned at (0, 38, 0) relative to rootGroup => world (32, 148, 16)
    this.cosmicShowcaseGroup.position.set(0, 38, 0);
    this.cosmicShowcaseGroup.visible = false;

    // Hexagonal Hydroxyapatite Crystal Prism (Ca10(PO4)6(OH)2)
    const hexGeo = new THREE.CylinderGeometry(2.15, 2.15, 4.8, 6, 1);
    this.crystalCoreMat = createCrystalLitMaterial(0xdcfce7, 0.4);
    this.crystalCoreMat.depthWrite = false;
    this.crystalCoreMesh = new THREE.Mesh(hexGeo, this.crystalCoreMat);
    this.buildHydroxyapatiteLattice();

    // Crisp wireframe edge overlay on crystal prism for crystallographic readability
    const hexWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(hexGeo),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.95 })
    );
    this.crystalCoreMesh.add(hexWire);
    this.cosmicShowcaseGroup.add(this.crystalCoreMesh);

    // Orbiting Nucleosynthesis Elements (Ca, P, O) in 1 InstancedMesh
    const atomGeo = new THREE.IcosahedronGeometry(0.42, 1);
    const atomMat = createCrystalLitMaterial(0xffffff);
    const atomCount = 18;
    const atomInst = new THREE.InstancedMesh(atomGeo, atomMat, atomCount);
    const atomPalette = [
      new THREE.Color(0xfde68a), // 20Ca Calcium (warm stellar gold)
      new THREE.Color(0xc084fc), // 15P Phosphorus (nebula violet)
      new THREE.Color(0x38bdf8), // 8O Oxygen (cyan)
    ];
    for (let i = 0; i < atomCount; i++) {
      const ang = (i / atomCount) * Math.PI * 2;
      const ringR = 3.6 + (i % 3) * 0.95;
      const yOff = ((i % 5) - 2) * 0.85;
      dummy.position.set(Math.cos(ang) * ringR, yOff, Math.sin(ang) * ringR);
      dummy.scale.setScalar(i % 3 === 0 ? 1.15 : 0.85);
      dummy.updateMatrix();
      atomInst.setMatrixAt(i, dummy.matrix);
      atomInst.setColorAt(i, atomPalette[i % 3]);
    }
    atomInst.instanceMatrix.needsUpdate = true;
    if (atomInst.instanceColor) atomInst.instanceColor.needsUpdate = true;
    this.atomicOrbitGroup.add(atomInst);
    this.cosmicShowcaseGroup.add(this.atomicOrbitGroup);

    // Incoming 9F Fluoride Ions locking into crystal lattice on Beat 3
    const fGeo = new THREE.OctahedronGeometry(0.55, 0);
    const fMat = createCrystalLitMaterial(0x2dd4bf);
    const fInst = new THREE.InstancedMesh(fGeo, fMat, 6);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      dummy.position.set(Math.cos(ang) * 2.4, (i % 2 === 0 ? 1 : -1) * 1.4, Math.sin(ang) * 2.4);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      fInst.setMatrixAt(i, dummy.matrix);
    }
    fInst.instanceMatrix.needsUpdate = true;
    this.fluorideLockGroup.add(fInst);
    this.cosmicShowcaseGroup.add(this.fluorideLockGroup);

    // Mohs Scale 5-Specimen lineup (Gold 2.5, Iron 4.0, Enamel 5.0, Quartz 7.0, Diamond 10.0)
    for (let i = 0; i < 5; i++) this.mohsCenters.push(new THREE.Vector3((i - 2) * 2.5, -3.7, 2.2));
    this.mohsMaterial = new THREE.ShaderMaterial({
      vertexColors: true,
      uniforms: { uTime: { value: 0 }, uSelected: { value: 2 } },
      vertexShader: MOHS_VERT,
      fragmentShader: MOHS_FRAG,
    });
    const mohsMesh = new THREE.Mesh(buildMohsSpecimenGeometry(this.mohsCenters), this.mohsMaterial);
    mohsMesh.frustumCulled = false;
    this.mohsLineupGroup.add(mohsMesh);

    // Glowing selection pedestal ring
    const ringGeo = new THREE.TorusGeometry(0.95, 0.06, 8, 48);
    ringGeo.rotateX(Math.PI / 2);
    this.mohsRingMat = new THREE.MeshBasicMaterial({
      color: 0x5eead4,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mohsRing = new THREE.Mesh(ringGeo, this.mohsRingMat);
    this.mohsLineupGroup.add(this.mohsRing);
    this.setMohsSelected(2);

    this.cosmicShowcaseGroup.add(this.mohsLineupGroup);

    this.rootGroup.add(this.cosmicShowcaseGroup);

    // Default initial orientation facing Toronto / Atlantic
    this.focusOnCity('toronto');
  }

  /**
   * Glowing Ca10(PO4)6(OH)2 unit-cell lattice: Ca hexagon rings, PO4 triangles, OH column
   * and pulsing bond cylinders — 2 instanced draw calls inside the translucent prism.
   */
  private buildHydroxyapatiteLattice(): void {
    const layers = [-1.6, 0, 1.6];
    const nodes: Array<{ p: THREE.Vector3; kind: 'Ca' | 'P' | 'OH' }> = [];
    const layerIdx: Array<{ ring: number[]; tri: number[]; oh: number }> = [];
    layers.forEach((y, li) => {
      const ring: number[] = [];
      const tri: number[] = [];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        ring.push(nodes.length);
        nodes.push({ p: new THREE.Vector3(Math.cos(a) * 1.78, y, Math.sin(a) * 1.78), kind: 'Ca' });
      }
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + (li % 2 === 0 ? Math.PI / 6 : -Math.PI / 6);
        tri.push(nodes.length);
        nodes.push({ p: new THREE.Vector3(Math.cos(a) * 0.98, y + (li % 2 ? 0.25 : -0.25), Math.sin(a) * 0.98), kind: 'P' });
      }
      const oh = nodes.length;
      nodes.push({ p: new THREE.Vector3(0, y, 0), kind: 'OH' });
      layerIdx.push({ ring, tri, oh });
    });

    const bonds: Array<[number, number, number]> = [];
    layerIdx.forEach((L, li) => {
      for (let k = 0; k < 6; k++) bonds.push([L.ring[k], L.ring[(k + 1) % 6], 0xfde68a]);
      for (let k = 0; k < 3; k++) {
        bonds.push([L.tri[k], L.oh, 0x67e8f9]);
        bonds.push([L.tri[k], L.ring[(k * 2) % 6], 0xc084fc]);
        bonds.push([L.tri[k], L.ring[(k * 2 + 1) % 6], 0xc084fc]);
      }
      if (li > 0) {
        const P = layerIdx[li - 1];
        for (let k = 0; k < 6; k++) bonds.push([P.ring[k], L.ring[k], 0x5eead4]);
        bonds.push([P.oh, L.oh, 0x99f6e4]);
      }
    });

    const nodeGeo = new THREE.IcosahedronGeometry(0.17, 1);
    const nodeMat = createCrystalLitMaterial(0xffffff, 1, { emissive: 0.55 });
    const nodeInst = new THREE.InstancedMesh(nodeGeo, nodeMat, nodes.length);
    const kindColor = { Ca: 0xfde68a, P: 0xc084fc, OH: 0x67e8f9 } as const;
    nodes.forEach((n, i) => {
      this.tmpDummy.position.copy(n.p);
      this.tmpDummy.rotation.set(0, 0, 0);
      this.tmpDummy.scale.setScalar(n.kind === 'Ca' ? 1.15 : n.kind === 'OH' ? 1.0 : 0.85);
      this.tmpDummy.updateMatrix();
      nodeInst.setMatrixAt(i, this.tmpDummy.matrix);
      nodeInst.setColorAt(i, new THREE.Color(kindColor[n.kind]));
    });
    nodeInst.instanceMatrix.needsUpdate = true;
    this.latticeGroup.add(nodeInst);

    this.bondMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 1.0 } },
      vertexShader: BOND_VERT,
      fragmentShader: BOND_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const bondGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true);
    const bondInst = new THREE.InstancedMesh(bondGeo, this.bondMaterial, bonds.length);
    const up = new THREE.Vector3(0, 1, 0);
    bonds.forEach(([a, b, hex], i) => {
      const pa = nodes[a].p;
      const pb = nodes[b].p;
      const dir = new THREE.Vector3().subVectors(pb, pa);
      const len = dir.length();
      this.tmpDummy.position.copy(pa).addScaledVector(dir, 0.5);
      this.tmpDummy.quaternion.setFromUnitVectors(up, dir.normalize());
      this.tmpDummy.scale.set(1, len, 1);
      this.tmpDummy.updateMatrix();
      bondInst.setMatrixAt(i, this.tmpDummy.matrix);
      bondInst.setColorAt(i, new THREE.Color(hex));
    });
    bondInst.instanceMatrix.needsUpdate = true;
    bondInst.renderOrder = 2;
    this.latticeGroup.add(bondInst);
    this.crystalCoreMesh.add(this.latticeGroup);
  }

  /** Highlights a Mohs specimen: spins faster, lifts, scales up and gains a glowing pedestal ring. */
  setMohsSelected(idx: number): void {
    this.selectedMohsIdx = Math.max(0, Math.min(4, idx));
    if (this.mohsMaterial) this.mohsMaterial.uniforms.uSelected.value = this.selectedMohsIdx;
    const ringColors = [0xfbbf24, 0xcbd5e1, 0x5eead4, 0xc4b5fd, 0x67e8f9];
    if (this.mohsRing) {
      const c = this.mohsCenters[this.selectedMohsIdx];
      this.mohsRing.position.set(c.x, c.y - 0.72, c.z);
      this.mohsRingMat.color.setHex(ringColors[this.selectedMohsIdx]);
    }
  }

  getSelectedMohs(): number {
    return this.selectedMohsIdx;
  }

  /** World-space position of a host city's globe pin (or the orbital station marker). */
  getCityWorldPosition(cityId: string, out = new THREE.Vector3()): THREE.Vector3 | null {
    this.rootGroup.updateMatrixWorld(true);
    if (cityId === 'orbit_aurora') {
      return this.stationMesh.getWorldPosition(out);
    }
    const idx = this.groundCities.findIndex((c) => c.id === cityId);
    if (idx < 0) return null;
    const m = new THREE.Matrix4();
    this.pinInst.getMatrixAt(idx, m);
    out.setFromMatrixPosition(m);
    return out.applyMatrix4(this.earthPivot.matrixWorld);
  }

  /** Earth center in world space (used for hemisphere visibility tests). */
  getEarthCenter(out = new THREE.Vector3()): THREE.Vector3 {
    return this.earthPivot.getWorldPosition(out);
  }

  setCosmicIntroState(visible: boolean, beatIndex = 0): void {
    this.cosmicShowcaseGroup.visible = visible;
    this.cosmicBeatIndex = beatIndex;
    this.mohsLineupGroup.visible = visible && beatIndex === 1;
    this.fluorideLockGroup.visible = visible && beatIndex >= 2;
  }

  focusOnCity(cityId: string): void {
    const city = HOST_CITIES.find((c) => c.id === cityId) ?? HOST_CITIES[0];
    this.selectedCityId = city.id;
    this.autoSpin = false;
    // Rotate globe so (lat, lon) faces toward camera direction (+Z / -Y tilt)
    const lonRad = ((city.lon + 180) * Math.PI) / 180;
    const latRad = (city.lat * Math.PI) / 180;
    this.targetEarthRotY = -lonRad + Math.PI * 0.5;
    this.targetEarthRotX = latRad * 0.55;
  }

  enableGentleAutoSpin(): void {
    this.autoSpin = true;
  }

  update(dt: number, nowSec: number): void {
    this.earthMaterial.uniforms.uTime.value = nowSec;
    this.stationMarkerPivot.rotation.z = nowSec * 0.38;

    // Pulse the selected host city pin
    if (this.rootGroup.visible) {
      this.groundCities.forEach((city, idx) => {
        const dir = latLonToUnitVec3(city.lat, city.lon);
        const selected = city.id === this.selectedCityId;
        const base = city.playableInSlice ? 1.35 : 0.95;
        this.tmpDummy.position.copy(dir).multiplyScalar(EARTH_BACKDROP_RADIUS + 0.35);
        this.tmpDummy.rotation.set(0, 0, 0);
        this.tmpDummy.scale.setScalar(selected ? base * (1.18 + 0.12 * Math.sin(nowSec * 5)) : base);
        this.tmpDummy.updateMatrix();
        this.pinInst.setMatrixAt(idx, this.tmpDummy.matrix);
      });
      this.pinInst.instanceMatrix.needsUpdate = true;
      this.stationMesh.scale.setScalar(this.selectedCityId === 'orbit_aurora' ? 1.6 + 0.2 * Math.sin(nowSec * 5) : 1);
    }

    if (this.autoSpin) {
      this.earthPivot.rotation.y += dt * 0.08;
      this.earthPivot.rotation.x += (0.24 - this.earthPivot.rotation.x) * Math.min(1, dt * 2.5);
    } else {
      this.earthPivot.rotation.y +=
        (this.targetEarthRotY - this.earthPivot.rotation.y) * Math.min(1, dt * 4.2);
      this.earthPivot.rotation.x +=
        (this.targetEarthRotX - this.earthPivot.rotation.x) * Math.min(1, dt * 4.2);
    }

    if (this.cosmicShowcaseGroup.visible) {
      this.bondMaterial.uniforms.uTime.value = nowSec;
      this.bondMaterial.uniforms.uIntensity.value = this.cosmicBeatIndex === 0 ? 0.45 : 1.0;
      this.mohsMaterial.uniforms.uTime.value = nowSec;
      this.mohsRing.rotation.y = nowSec * 1.2;
      this.mohsRingMat.opacity = 0.65 + 0.3 * Math.sin(nowSec * 4.0);
      this.crystalCoreMesh.rotation.y = nowSec * 0.55;
      this.crystalCoreMesh.rotation.z = Math.sin(nowSec * 0.9) * 0.12;
      this.atomicOrbitGroup.rotation.y = -nowSec * 0.72;
      this.atomicOrbitGroup.rotation.x = Math.sin(nowSec * 0.5) * 0.25;

      // Beat-responsive crystal appearance
      if (this.cosmicBeatIndex === 0) {
        // Supernova nucleosynthesis: expanded atomic cloud, nascent crystal core
        const s = 0.55 + 0.1 * Math.sin(nowSec * 2.2);
        this.crystalCoreMesh.scale.setScalar(s);
        this.atomicOrbitGroup.scale.setScalar(1.35);
        (this.crystalCoreMat.uniforms.uBaseColor.value as THREE.Color).setHex(0xe0f2fe);
      } else if (this.cosmicBeatIndex === 1) {
        // Mohs 5.0 Hydroxyapatite lattice: full gleaming prism + Mohs pedestal row
        this.crystalCoreMesh.scale.setScalar(1.0);
        this.atomicOrbitGroup.scale.setScalar(0.95);
        (this.crystalCoreMat.uniforms.uBaseColor.value as THREE.Color).setHex(0xf0f9ff);
      } else {
        // Beat 2..3: Acid challenge vs 9F Fluorapatite turquoise lattice lock!
        this.crystalCoreMesh.scale.setScalar(1.06);
        this.atomicOrbitGroup.scale.setScalar(0.88);
        this.fluorideLockGroup.rotation.y = nowSec * 1.35;
        const lockScale = 0.78 + 0.12 * Math.sin(nowSec * 3.2);
        this.fluorideLockGroup.scale.setScalar(lockScale);
        (this.crystalCoreMat.uniforms.uBaseColor.value as THREE.Color).setHex(0x99f6e4);
      }
    }
  }
}
