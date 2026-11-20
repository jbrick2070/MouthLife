/**
 * The city finale and the grand finale in 3D (web). Everything it shows comes from the shared,
 * tested timeline (config/cityFinale.ts) and its 3D layout (config/finale3d.ts); this file only
 * turns those numbers into a Three.js scene. The native twin is CityFinaleScene.swift.
 *
 * The look: a glowing cut-paper diorama at night. The skyline drawing becomes a relief, each
 * piece cut out and set a little in front of the one behind, bent round the viewer and reflected
 * in dark water; a sky dome with a slow aurora; in front, a stage where the coin, the Golden Molar
 * and the mountain stand as real solid shapes. Lights, sparks and signs glow.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  CAMPAIGN_PIECES,
  ENDING_BURSTS,
  ENDING_BURST_SCALE,
  ENDING_TIMES,
  FINALE_TIMES,
  GOLDEN_MOLAR,
  PIECE_RADIUS,
  endingCredit,
  endingEmblemOrbit,
  endingFace,
  endingMolarPlace,
  endingPiece,
  finaleBalloons,
  finaleBeads,
  finaleClimbStatus,
  finaleEmblemRocket,
  finaleMeteors,
  finaleMolar,
  finaleMountain,
  finaleNod,
  finalePassTime,
  finalePiece,
  finaleProbe,
  finaleRocket,
  finaleSlotShine,
  smooth01,
  type MolarFinish,
} from '../../config/cityFinale';
import {
  CUSP_BUBBLE,
  EMBLEM_WORLD,
  RELIEF_DEPTH,
  STAGE,
  WORMHOLE,
  cuspBubbleLocal,
  wormholeTeeth,
  wormholeToothMesh,
  wormholeWindow,
  burstSparks3D,
  burstWorld,
  emblemFractal,
  emblemFractalNodes,
  endingCamera3D,
  finaleCamera3D,
  goldenMolarMesh,
  ledge3D,
  molarCuspTop,
  molarOutlineRadius,
  mountainFront,
  mountainColumns,
  molarRootMesh,
  MOUNTAIN_3D,
  skylineAngle,
  skylineWorld,
  stageWorld,
  type MeshData,
  type Vec3,
} from '../../config/finale3d';
import {
  skylineMotionPivot,
  skylineMotionState,
  skylinePieceSpanY,
  type CityArt,
  type CityFinalePlan,
  type SkylinePiece,
} from '../../config/citySkylineGeometry';
import { GlowPass } from './GlowPass';
import { buildHydraHullGeometry, buildSonicRingGeometry } from './EntityBatchRenderer';

export interface FinaleCity3D {
  art: CityArt;
  plan: CityFinalePlan;
}

const T = FINALE_TIMES;
const E = ENDING_TIMES;
/** The widest vertical angle on tall screens (degrees); beyond it the camera steps back. */
const MAX_VFOV = 76;

function hexColor(hex: number): THREE.Color {
  return new THREE.Color().setHex(hex);
}

// ---------------------------------------------------------------------------------- the relief city

const RELIEF_VERT = /* glsl */ `
  attribute vec3 color;
  attribute float aKind;
  attribute float aCx;
  attribute float aShade;
  attribute float aAlpha;
  uniform float uT;
  uniform float uRm;
  uniform float uNeon;
  uniform float uOverride;
  uniform float uGlow;
  uniform float uMirror;
  uniform float uRiseEnd;
  uniform float uWaveEnd;
  uniform float uBlazeEnd;
  uniform float uShowEnd;
  uniform vec4 uHaze;
  uniform vec4 uBurstA;
  uniform vec4 uBurstB;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec3 vWorldPos;
  varying float vIsLight;
  float sm(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
  void main() {
    bool isLight = aKind > 0.5 && aKind < 1.5;
    float night = aKind < 0.5 ? 0.34 : (isLight ? 0.06 : 0.12);
    float ramp = (aKind < 0.5 ? 0.7 : (isLight ? 0.18 : 1.2)) * (uRm > 0.5 ? 3.0 : 1.0);
    float pass = uRm > 0.5 ? uRiseEnd + 1.0 : uRiseEnd + (clamp(aCx, -3.0, 67.0) + 3.0) / 70.0 * (uWaveEnd - uRiseEnd);
    float age = uT - pass;
    float level = age <= 0.0 ? night : night + (1.0 - night) * sm(age / ramp);
    float flash = (isLight && age > 0.0 && uRm < 0.5) ? 0.75 * exp(-age / 0.16) : 0.0;
    float showT = uT - uBlazeEnd;
    if (uNeon > 0.5 && isLight && uRm < 0.5 && showT >= 0.0 && uT < uShowEnd) level *= 0.84 + 0.16 * cos(12.566370614 * showT);
    float stageFocus = uOverride >= 0.0 ? 0.0 : sm((uT - 14.0) / 1.4);
    level *= 1.0 - 0.35 * sm((uT - 14.0) / 1.0);
    if (uOverride >= 0.0) { level = uOverride; flash = 0.0; }
    if (isLight) level *= uGlow;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    // Gentle living-water wave undulation on the reflection, anchored seamlessly at y = 0
    if (uMirror > 0.5 && wp.y < 0.0 && uRm < 0.5) {
      float wd = -wp.y;
      wp.x += (sin(wd * 2.6 - uT * 1.8 + wp.x * 0.22) * 0.11 + sin(wd * 5.2 + uT * 1.3 - wp.x * 0.35) * 0.045) * smoothstep(0.0, 1.5, wd);
    }
    // The drawing's levels were made for screen colours; in linear light their squares match.
    // Lit windows run a little past 1, so the bloom makes them glow.
    float lin = level * level;
    vec3 lit = color * lin * aShade * aShade * (isLight ? 1.3 : 1.0);
    if (!isLight) lit = min(lit, vec3(1.0));
    // Soft coloured wash from bursting firework shells onto nearby buildings and their reflection
    float hCatch = 0.45 + 0.55 * clamp(abs(wp.y) / 5.5, 0.0, 1.0);
    float dA = (aCx - uBurstA.w) / 15.0;
    float dB = (aCx - uBurstB.w) / 15.0;
    vec3 burstWash = uBurstA.rgb * exp(-dA * dA) + uBurstB.rgb * exp(-dB * dB);
    float catchAmt = isLight ? 0.14 : (0.44 * hCatch * (0.65 + 0.35 * aShade));
    lit += burstWash * catchAmt * (0.35 + 0.65 * color);
    // Atmospheric twilight haze on the far skyline so the stage reads crisply in front
    float camDist = length(cameraPosition - wp.xyz);
    float distHaze = smoothstep(34.0, 96.0, camDist) * 0.24;
    float lowMist = 1.0 - clamp(abs(wp.y) / 7.0, 0.0, 1.0);
    float hazeAmt = clamp((distHaze + stageFocus * (0.34 + 0.14 * lowMist)) * uHaze.w, 0.0, 0.58);
    if (isLight) hazeAmt *= 0.62;
    float hazeLit = uOverride >= 0.0 ? uOverride * uOverride : (0.25 + 0.75 * smoothstep(2.5, 7.5, uT));
    vec3 colOut = lit + (vec3(1.0) - min(lit, vec3(1.0))) * flash;
    vColor = mix(colOut, uHaze.rgb * hazeLit, hazeAmt);
    vAlpha = aAlpha;
    vWorldPos = wp.xyz;
    vIsLight = isLight ? 1.0 : 0.0;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const RELIEF_FRAG = /* glsl */ `
  uniform float uMirror;
  uniform float uT;
  uniform float uRm;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec3 vWorldPos;
  varying float vIsLight;
  void main() {
    float a = vAlpha;
    vec3 col = vColor;
    if (uMirror > 0.5) {
      if (vWorldPos.y > 0.0) discard;
      float depth = -vWorldPos.y;
      float rt = uRm > 0.5 ? 0.0 : uT;
      float w1 = sin(depth * 8.5 + vWorldPos.x * 0.45 - rt * 2.1);
      float w2 = sin(depth * 14.5 - vWorldPos.x * 0.78 + rt * 1.55);
      float wave = 0.55 * w1 + 0.45 * w2;
      float ripple = 0.72 + 0.28 * wave;
      float fade = 1.0 - smoothstep(0.0, 6.2, depth);
      float crest = smoothstep(0.54, 0.96, wave) * fade;
      col = col * ripple + col * crest * (vIsLight > 0.5 ? 0.85 : 0.35);
      a *= 0.42 * fade * (0.82 + 0.18 * wave);
    }
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface ReliefBucket {
  pos: number[];
  col: number[];
  kind: number[];
  cx: number[];
  shade: number[];
  alpha: number[];
}

function emptyBucket(): ReliefBucket {
  return { pos: [], col: [], kind: [], cx: [], shade: [], alpha: [] };
}

function bucketGeometry(b: ReliefBucket): THREE.BufferGeometry | null {
  if (b.pos.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(b.kind, 1));
  g.setAttribute('aCx', new THREE.Float32BufferAttribute(b.cx, 1));
  g.setAttribute('aShade', new THREE.Float32BufferAttribute(b.shade, 1));
  g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(b.alpha, 1));
  return g;
}

/** Edges used by only one triangle of a piece: its outline, which gets a side wall. */
function boundaryEdges(tris: readonly number[]): [number, number, number, number][] {
  const key = (x: number, y: number): string => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
  const count = new Map<string, { n: number; e: [number, number, number, number] }>();
  for (let i = 0; i + 5 < tris.length; i += 6) {
    const v = [
      [tris[i], tris[i + 1]],
      [tris[i + 2], tris[i + 3]],
      [tris[i + 4], tris[i + 5]],
    ];
    for (let k = 0; k < 3; k++) {
      const a = v[k];
      const b = v[(k + 1) % 3];
      const ka = key(a[0], a[1]);
      const kb = key(b[0], b[1]);
      if (ka === kb) continue;
      const id = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const hit = count.get(id);
      if (hit) hit.n++;
      else count.set(id, { n: 1, e: [a[0], a[1], b[0], b[1]] });
    }
  }
  const out: [number, number, number, number][] = [];
  for (const { n, e } of count.values()) if (n === 1) out.push(e);
  return out;
}

class CityRelief {
  readonly group = new THREE.Group();
  readonly uniforms: Record<string, THREE.IUniform>;
  private readonly materials: THREE.ShaderMaterial[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly tmpQ = new THREE.Quaternion();
  private readonly movers: {
    motion: CityArt['motions'][number];
    nodes: THREE.Object3D[];
    rest: THREE.Vector3;
    normal: THREE.Vector3;
    tangent: THREE.Vector3;
    glow: THREE.IUniform;
    cx: number;
  }[] = [];
  constructor(art: CityArt, plan: CityFinalePlan) {
    const stops = skyStops(art);
    const midHorizon = hexColor(stops.colors[2][0]);
    const inSpace = plan.show === 'meteors';
    const hazeCol = new THREE.Color(0x0b1636);
    if (!inSpace) {
      hazeCol.r += midHorizon.r * 0.045;
      hazeCol.g += midHorizon.g * 0.045;
      hazeCol.b += midHorizon.b * 0.045;
    }
    this.uniforms = {
      uT: { value: 0 },
      uRm: { value: 0 },
      uNeon: { value: plan.show === 'neon' ? 1 : 0 },
      uOverride: { value: -1 },
      uRiseEnd: { value: T.riseEnd },
      uWaveEnd: { value: T.waveEnd },
      uBlazeEnd: { value: T.blazeEnd },
      uShowEnd: { value: T.showEnd },
      uHaze: { value: new THREE.Vector4(hazeCol.r, hazeCol.g, hazeCol.b, inSpace ? 0.3 : 1.0) },
      uBurstA: { value: new THREE.Vector4(0, 0, 0, 0) },
      uBurstB: { value: new THREE.Vector4(0, 0, 0, 0) },
    };
    const still = { solid: emptyBucket() };
    const moving = art.motions.map(() => emptyBucket());
    const restOf = art.motions.map((motion, i) => {
      const members = art.skyline.filter((p) => p.group === i + 1);
      const pivot = skylineMotionPivot(motion);
      const mx = pivot ? pivot.x : members.reduce((s, p) => s + p.cx, 0) / Math.max(1, members.length);
      const my = pivot ? pivot.y : 0;
      const order = members[0]?.order ?? 0;
      return { x: mx, y: my, order, world: new THREE.Vector3(...skylineWorld(mx, my, order)) };
    });

    // Group consecutive pieces of one drawing line, so a window grid lights as one.
    let run: SkylinePiece[] = [];
    const flush = (): void => {
      if (run.length === 0) return;
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of run) for (let i = 0; i < p.tris.length; i += 2) {
        lo = Math.min(lo, p.tris[i]);
        hi = Math.max(hi, p.tris[i]);
      }
      const cx = (lo + hi) / 2;
      const first = run[0];
      // The drawing's sky panels become the dome's colours (see skyStops), so no flat panel
      // edges show in 3D.
      if (first.light && first.topColor !== null) {
        run = [];
        return;
      }
      const kind = first.light ? 1 : 0;
      const target = first.group > 0 ? moving[first.group - 1] : still.solid;
      const origin = first.group > 0 ? restOf[first.group - 1].world : null;
      for (const piece of run) this.addPiece(target, piece, kind, cx, origin);
      run = [];
    };
    for (const piece of art.skyline) {
      if (run.length && (piece.order !== run[0].order || piece.group !== run[0].group)) flush();
      run.push(piece);
    }
    flush();
    // the near layer: the city's roadside prop along the waterfront, in two staggered rows, the
    // middle left open for the stage
    for (const row of [3.5, 6.5]) {
      for (let x = -36; x <= 36; x += 8) {
        const dx = x + (row === 6.5 ? 4 : 0);
        if (Math.abs(dx) < 9) continue;
        this.addProp(still.solid, art.prop, 32 + dx, row);
      }
    }

    const make = (transparent: boolean, mirror: boolean, glow: THREE.IUniform): THREE.ShaderMaterial => {
      const m = new THREE.ShaderMaterial({
        vertexShader: RELIEF_VERT,
        fragmentShader: RELIEF_FRAG,
        uniforms: { ...this.uniforms, uGlow: glow, uMirror: { value: mirror ? 1 : 0 } },
        transparent: transparent || mirror,
        depthWrite: !(transparent || mirror),
        side: THREE.DoubleSide,
      });
      this.materials.push(m);
      return m;
    };
    const one = { value: 1 };
    const addMesh = (geo: THREE.BufferGeometry | null, parent: THREE.Object3D, transparent: boolean, glow: THREE.IUniform, order: number): THREE.Mesh[] => {
      if (!geo) return [];
      this.geometries.push(geo);
      const front = new THREE.Mesh(geo, make(transparent, false, glow));
      front.renderOrder = order;
      front.frustumCulled = false;
      parent.add(front);
      return [front];
    };
    const mirrorRoot = new THREE.Group();
    mirrorRoot.scale.set(1, -1, 1);
    // Station Aurora is in orbit: nothing to reflect it
    mirrorRoot.visible = plan.show !== 'meteors';
    this.group.add(mirrorRoot);
    const solidGeo = bucketGeometry(still.solid);
    addMesh(solidGeo, this.group, false, one, 2);
    if (solidGeo) {
      const m = new THREE.Mesh(solidGeo, make(false, true, one));
      m.renderOrder = 0;
      m.frustumCulled = false;
      mirrorRoot.add(m);
    }
    art.motions.forEach((motion, i) => {
      const geo = bucketGeometry(moving[i]);
      if (!geo) return;
      const glow = { value: 1 };
      const node = new THREE.Group();
      const mirrorNode = new THREE.Group();
      this.group.add(node);
      mirrorRoot.add(mirrorNode);
      addMesh(geo, node, false, glow, 3);
      const mm = new THREE.Mesh(geo, make(false, true, glow));
      mm.frustumCulled = false;
      mirrorNode.add(mm);
      const rest = restOf[i];
      const a = skylineAngle(rest.x);
      this.movers.push({
        motion,
        nodes: [node, mirrorNode],
        rest: rest.world,
        normal: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)),
        tangent: new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)),
        glow,
        cx: rest.x,
      });
    });
  }

  private addPiece(b: ReliefBucket, piece: SkylinePiece, kind: number, cx: number, origin: THREE.Vector3 | null): void {
    const foot = hexColor(piece.color);
    const top = piece.topColor !== null ? hexColor(piece.topColor) : null;
    const span = skylinePieceSpanY(piece);
    const blackTop = piece.topColor === 0x000000;
    const put = (x: number, y: number, back: number, shade: number): void => {
      const p = skylineWorld(x, y, piece.order, back);
      b.pos.push(p[0] - (origin?.x ?? 0), p[1] - (origin?.y ?? 0), p[2] - (origin?.z ?? 0));
      let c = foot;
      let alpha = 1;
      if (top) {
        const f = (y - span.minY) / Math.max(1e-6, span.maxY - span.minY);
        c = foot.clone().lerp(top, f);
        if (blackTop) alpha = 1 - f;
      }
      b.col.push(c.r, c.g, c.b);
      b.kind.push(kind);
      b.cx.push(cx);
      b.shade.push(shade);
      b.alpha.push(alpha);
    };
    const t = piece.tris;
    for (let i = 0; i + 5 < t.length; i += 6) {
      put(t[i], t[i + 1], 0, 1);
      put(t[i + 2], t[i + 3], 0, 1);
      put(t[i + 4], t[i + 5], 0, 1);
    }
    // windows and light stripes are thin; buildings get the full cut-paper depth
    const depth = piece.light ? 0.02 : RELIEF_DEPTH;
    for (const [x1, y1, x2, y2] of boundaryEdges(t)) {
      put(x1, y1, 0, 0.55);
      put(x2, y2, 0, 0.55);
      put(x2, y2, depth, 0.4);
      put(x1, y1, 0, 0.55);
      put(x2, y2, depth, 0.4);
      put(x1, y1, depth, 0.4);
    }
  }

  /** One roadside prop, standing at panorama x `x`, `row` units in front of the skyline. */
  private addProp(b: ReliefBucket, prop: readonly SkylinePiece[], x: number, row: number): void {
    const base = skylineWorld(x, 0, 0);
    const a = skylineAngle(x);
    const nx = Math.sin(a);
    const nz = Math.cos(a);
    const tx = Math.cos(a);
    const tz = -Math.sin(a);
    const scale = 0.8;
    for (const piece of prop) {
      const c = hexColor(piece.color);
      const kind = piece.light ? 1 : 0;
      const put = (px: number, py: number, back: number, shade: number): void => {
        const d = row + piece.order * 0.01 - back;
        b.pos.push(base[0] + tx * px * scale + nx * d, py * scale, base[2] + tz * px * scale + nz * d);
        b.col.push(c.r, c.g, c.b);
        b.kind.push(kind);
        b.cx.push(x);
        b.shade.push(shade);
        b.alpha.push(1);
      };
      const t = piece.tris;
      for (let i = 0; i + 5 < t.length; i += 6) {
        put(t[i], t[i + 1], 0, 1);
        put(t[i + 2], t[i + 3], 0, 1);
        put(t[i + 4], t[i + 5], 0, 1);
      }
      for (const [x1, y1, x2, y2] of boundaryEdges(t)) {
        put(x1, y1, 0, 0.55);
        put(x2, y2, 0, 0.55);
        put(x2, y2, 0.12, 0.4);
        put(x1, y1, 0, 0.55);
        put(x2, y2, 0.12, 0.4);
        put(x1, y1, 0.12, 0.4);
      }
    }
  }

  /** `override` >= 0 lights the whole city at that level (the credits); `motionAll` runs every motion. */
  update(t: number, reducedMotion: boolean, override: number, motionAll: number | null, burstA?: THREE.Vector4, burstB?: THREE.Vector4): void {
    this.uniforms.uT.value = t;
    this.uniforms.uRm.value = reducedMotion ? 1 : 0;
    this.uniforms.uOverride.value = override;
    const ua = this.uniforms.uBurstA.value as THREE.Vector4;
    const ub = this.uniforms.uBurstB.value as THREE.Vector4;
    if (burstA) ua.copy(burstA);
    else ua.set(0, 0, 0, 0);
    if (burstB) ub.copy(burstB);
    else ub.set(0, 0, 0, 0);
    const q = this.tmpQ;
    for (const m of this.movers) {
      let time: number | null = null;
      if (!reducedMotion) {
        if (motionAll !== null) time = motionAll;
        else {
          const pass = finalePassTime(m.cx, false);
          time = t > pass ? t - pass : null;
        }
      }
      const state = skylineMotionState(m.motion, time);
      m.glow.value = state.glow;
      q.setFromAxisAngle(m.normal, state.angleRad);
      const [node, mirror] = m.nodes;
      node.position.copy(m.rest).addScaledVector(m.tangent, state.dx);
      node.quaternion.copy(q);
      mirror.position.copy(node.position);
      mirror.quaternion.copy(q);
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}

// ---------------------------------------------------------------------------------- the sky

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The city's own sky as one seamless dome: the drawing's sky panels sampled at five points across
// the panorama and blended (no panel edges), lit by the same wave of light as the city, with a
// field of stars and an aurora on top (fractal noise, fbm, bent by more noise).
const SKY_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uAurora;
  uniform vec3 uSkyC0[5];
  uniform vec3 uSkyC1[5];
  uniform vec3 uSkyC2[5];
  uniform vec3 uSkyC3[5];
  uniform vec4 uSkyH;
  uniform float uSpace;
  uniform float uT;
  uniform float uRm;
  uniform float uOverride;
  uniform float uRiseEnd;
  uniform float uWaveEnd;
  uniform vec3 uAuroraA;
  uniform vec3 uAuroraB;
  varying vec3 vDir;
  float sm(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(vec3(i, 1.0)); float b = hash(vec3(i + vec2(1.0, 0.0), 1.0));
    float c = hash(vec3(i + vec2(0.0, 1.0), 1.0)); float d = hash(vec3(i + vec2(1.0, 1.0), 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 3; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, -0.2, 1.0);
    // which part of the panorama this direction is over (drawing units, 0..64)
    float xd = 32.0 + atan(d.x, -d.z) * 74.0;
    float f = clamp(xd / 16.0, 0.0, 3.999);
    float w = sm(fract(f));
    vec3 c0 = uSkyC0[0];
    vec3 c1 = uSkyC1[0];
    vec3 c2 = uSkyC2[0];
    vec3 c3 = uSkyC3[0];
    for (int k = 0; k < 4; k++) {
      if (f >= float(k)) {
        c0 = mix(uSkyC0[k], uSkyC0[k + 1], w);
        c1 = mix(uSkyC1[k], uSkyC1[k + 1], w);
        c2 = mix(uSkyC2[k], uSkyC2[k + 1], w);
        c3 = mix(uSkyC3[k], uSkyC3[k + 1], w);
      }
    }
    // the wave of light reaches this part of the sky as it does the city below
    float pass = uRm > 0.5 ? uRiseEnd + 1.0 : uRiseEnd + (clamp(xd, -3.0, 67.0) + 3.0) / 70.0 * (uWaveEnd - uRiseEnd);
    float age = uT - pass;
    float level = age <= 0.0 ? 0.16 : 0.16 + 0.84 * sm(age / (uRm > 0.5 ? 3.6 : 1.2));
    level *= 1.0 - 0.3 * sm(uT - 14.0);
    if (uOverride >= 0.0) level = uOverride;
    level *= level;
    vec3 glowSky = c0;
    glowSky = mix(glowSky, c1, sm((h - uSkyH.x) / max(1e-4, uSkyH.y - uSkyH.x)));
    glowSky = mix(glowSky, c2, sm((h - uSkyH.y) / max(1e-4, uSkyH.z - uSkyH.y)));
    glowSky = mix(glowSky, c3, sm((h - uSkyH.z) / max(1e-4, uSkyH.w - uSkyH.z)));
    vec3 night = vec3(0.01, 0.022, 0.07);
    vec3 space = vec3(0.003, 0.006, 0.022);
    vec3 col = mix(glowSky * level, night, sm((h - uSkyH.w) / 0.14));
    col = mix(col, space, sm((h - 0.3) / 0.45));
    if (d.y < 0.0 && uSpace < 0.5) {
      float depth = -d.y;
      float az = atan(d.x, -d.z);
      float wt = uRm > 0.5 ? 0.0 : uTime;
      // Perspective-foreshortened ripples: fine near the horizon, wider swells below
      float wz = 1.0 / (depth + 0.04);
      float horizonBand = exp(-depth * 13.0);
      float midBand = exp(-depth * 4.2);
      float swell = 0.5 + 0.5 * sin(wz * 1.15 - wt * 1.2 + sin(az * 6.0 + wt * 0.35) * 1.4);
      // fine glints, not broad patches: broad ones read as mud
      float sparkle = noise(vec2(az * 110.0 + sin(wz * 0.45 + wt * 0.4) * 0.8, wz * 1.6 - wt * 0.75));
      float glints = smoothstep(0.8, 0.97, sparkle) * (0.4 + 0.6 * swell);
      vec3 horizonTint = c0 * level;
      vec3 auroraRefl = mix(uAuroraA, uAuroraB, 0.45) * uAurora * 0.16 * midBand * (0.55 + 0.45 * swell);
      col = vec3(0.003, 0.007, 0.024)
        + horizonTint * (0.012 + 0.14 * horizonBand * (0.65 + 0.35 * swell) + 0.08 * midBand * glints)
        + auroraRefl;
    }
    // stars: soft round points at a jittered spot in each cell, warm or cool
    vec3 g = d * 260.0;
    vec3 cell = floor(g);
    vec3 off = fract(g) - 0.5 - (vec3(hash(cell + 7.0), hash(cell + 13.0), hash(cell + 21.0)) - 0.5) * 0.6;
    float star = step(0.9965, hash(cell)) * (1.0 - smoothstep(0.04, 0.3, length(off))) * (uSpace > 0.5 ? 1.0 : smoothstep(0.02, 0.2, h));
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + hash(cell + 3.0) * 40.0);
    vec3 tint = mix(vec3(1.0, 0.86, 0.7), vec3(0.75, 0.85, 1.0), hash(cell + 5.0));
    col += tint * star * tw * 1.3;
    // aurora curtains
    // aurora: thin folded ribbons with fine vertical rays, high over the city
    if (uAurora > 0.001 && d.y > 0.12 && d.y < 0.65) {
      float az = atan(d.x, -d.z);
      float warp = fbm(vec2(az * 3.0 + uTime * 0.04, d.y * 2.0));
      float fold = abs(sin(az * 6.0 + warp * 5.0 + uTime * 0.15));
      float ribbon = pow(1.0 - fold, 5.0);
      float rays = 0.55 + 0.45 * noise(vec2(az * 140.0, uTime * 0.6));
      float base = 0.28 + 0.06 * sin(az * 3.0 + warp * 2.0);
      float band = smoothstep(base - 0.04, base + 0.02, d.y) * (1.0 - smoothstep(base + 0.04, base + 0.26, d.y));
      vec3 ac = mix(uAuroraA, uAuroraB, smoothstep(base, base + 0.22, d.y));
      col += ac * ribbon * rays * band * uAurora * 0.55;
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** The drawing's sky, sampled at five points across the panorama: [foot colour, top colour]. */
/** The night sky colour a drawing's black sky top fades into. */
const NIGHT_HEX = 0x0b1640;

/**
 * The drawing's sky, sampled at five points across the panorama: each sample's stacked strips, low
 * to high, as four colours (the horizon glow, two bands, the top), and where the bands start as
 * directions on the dome (shared by all samples).
 */
export function skyStops(art: CityArt | null): { colors: [number, number, number, number][]; heights: [number, number, number, number] } {
  const colors: [number, number, number, number][] = [];
  let heights: [number, number, number, number] = [0, 0.03, 0.07, 0.13];
  let found = false;
  for (const x of [0, 16, 32, 48, 64]) {
    const strips: { p: SkylinePiece; lo: number; hi: number }[] = [];
    for (const p of art?.skyline ?? []) {
      if (!p.light || p.topColor === null) continue;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < p.tris.length; i += 2) {
        lo = Math.min(lo, p.tris[i]);
        hi = Math.max(hi, p.tris[i]);
      }
      if (x < lo - 0.5 || x > hi + 0.5) continue;
      const span = skylinePieceSpanY(p);
      strips.push({ p, lo: span.minY, hi: span.maxY });
    }
    strips.sort((a, b) => a.lo - b.lo);
    if (strips.length === 0) {
      colors.push([0x1e293b, 0x172554, 0x0f172a, NIGHT_HEX]);
      continue;
    }
    const top = (c: number | null): number => (c === null || c === 0x000000 ? NIGHT_HEX : c);
    const s0 = strips[0].p;
    const s1 = strips[1]?.p ?? null;
    const s2 = strips[2]?.p ?? null;
    const last = strips[strips.length - 1];
    colors.push([s0.color, s1 ? s1.color : top(s0.topColor), s2 ? s2.color : s1 ? top(s1.topColor) : top(s0.topColor), top(last.p.topColor)]);
    if (!found && strips.length >= 3) {
      // drawing units up the skyline, as directions seen from the dome's centre (about 55 away)
      heights = [strips[0].lo / 55, strips[1].lo / 55, strips[2].lo / 55, last.hi / 55];
      found = true;
    }
  }
  return { colors, heights };
}

// ---------------------------------------------------------------------------------- glowing points

const POINTS_VERT = /* glsl */ `
  attribute vec3 color;
  attribute float aAlpha;
  attribute float aSize;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    // a touch more colour than the drawing's pale pinks and golds, so sparks read as coloured
    vColor = max(mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, 1.35), 0.0);
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * uScale / max(0.5, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const POINTS_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    if (r > 1.0) discard;
    float core = 1.0 - smoothstep(0.0, 1.0, r);
    gl_FragColor = vec4(vColor * (0.35 * core + 0.9 * (1.0 - smoothstep(0.0, 0.35, r))) * vAlpha, 1.0);
    #include <colorspace_fragment>
  }
`;

class GlowPoints {
  readonly points: THREE.Points;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly alpha: Float32Array;
  private readonly size: Float32Array;
  private count = 0;
  readonly material: THREE.ShaderMaterial;

  constructor(private readonly max: number) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  begin(): void {
    this.count = 0;
  }

  add(x: number, y: number, z: number, c: THREE.Color, alpha: number, size: number): void {
    if (this.count >= this.max || alpha <= 0.004) return;
    const i = this.count++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    this.alpha[i] = alpha;
    this.size[i] = size;
  }

  end(): void {
    this.geo.setDrawRange(0, this.count);
    for (const name of ['position', 'color', 'aAlpha', 'aSize']) {
      const attr = this.geo.getAttribute(name) as THREE.BufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, Math.max(1, this.count) * attr.itemSize);
      attr.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}

// ---------------------------------------------------------------------------------- glowing streaks (fireworks, rockets, stardust)

const STREAK_VERT = /* glsl */ `
  attribute vec3 aTail;
  attribute vec3 color;
  attribute vec2 aCorner;
  attribute vec2 aStyle;
  uniform vec2 uViewport;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vUv;
  void main() {
    vec4 clipH = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec4 clipT = projectionMatrix * modelViewMatrix * vec4(aTail, 1.0);
    if (clipH.w <= 0.05 || clipT.w <= 0.05) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vColor = vec3(0.0);
      vAlpha = 0.0;
      vUv = aCorner;
      return;
    }
    vec2 ndcH = clipH.xy / clipH.w;
    vec2 ndcT = clipT.xy / clipT.w;
    vec2 aspect = vec2(uViewport.x / max(1.0, uViewport.y), 1.0);
    vec2 dir = (ndcH - ndcT) * aspect;
    float len = length(dir);
    vec2 fwd = len > 0.0005 ? dir / len : vec2(1.0, 0.0);
    vec2 side = vec2(-fwd.y, fwd.x);
    vec4 clip = mix(clipT, clipH, aCorner.x);
    float ndcHalf = max(aStyle.y * projectionMatrix[1][1] / max(0.2, clip.w), 2.4 / max(1.0, uViewport.y));
    float capExt = (aCorner.x * 2.0 - 1.0) * ndcHalf;
    float widthScale = mix(0.42, 1.0, aCorner.x);
    vec2 offset = (fwd * capExt + side * aCorner.y * ndcHalf * widthScale) / aspect;
    gl_Position = vec4(clip.xy + offset * clip.w, clip.z, clip.w);
    vColor = max(mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, 1.38), 0.0);
    vAlpha = aStyle.x;
    vUv = aCorner;
  }
`;

const STREAK_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vUv;
  void main() {
    float across = abs(vUv.y);
    float edge = 1.0 - smoothstep(0.0, 1.0, across);
    float core = 1.0 - smoothstep(0.0, 0.45, across);
    float tailFade = smoothstep(0.0, 0.82, vUv.x);
    float headCap = 1.0 - smoothstep(0.76, 1.0, vUv.x);
    float body = (edge * edge * 0.55 + core * 0.78) * tailFade * headCap;
    float headDist = length(vec2((vUv.x - 0.80) * 5.0, vUv.y));
    float tip = 1.0 - smoothstep(0.0, 0.95, headDist);
    vec3 col = vColor * (body + tip * 0.95) + vec3(1.0, 0.97, 0.9) * tip * 0.55;
    float energy = (body + tip) * vAlpha;
    if (energy < 0.004) discard;
    gl_FragColor = vec4(col * vAlpha, 1.0);
    #include <colorspace_fragment>
  }
`;

class GlowStreaks {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.BufferGeometry();
  private readonly head: Float32Array;
  private readonly tail: Float32Array;
  private readonly col: Float32Array;
  private readonly style: Float32Array;
  private count = 0;
  private prevCount = 0;
  readonly material: THREE.ShaderMaterial;

  constructor(private readonly max: number) {
    this.head = new Float32Array(max * 12);
    this.tail = new Float32Array(max * 12);
    this.col = new Float32Array(max * 12);
    this.style = new Float32Array(max * 8);
    const corner = new Float32Array(max * 8);
    const indices = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) {
      corner.set([0, -1, 0, 1, 1, -1, 1, 1], i * 8);
      const v = i * 4;
      indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.head, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aTail', new THREE.BufferAttribute(this.tail, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    this.geo.setAttribute('aStyle', new THREE.BufferAttribute(this.style, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(indices, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: STREAK_VERT,
      fragmentShader: STREAK_FRAG,
      uniforms: { uViewport: { value: new THREE.Vector2(1280, 720) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  begin(): void {
    this.count = 0;
  }

  add(x: number, y: number, z: number, px: number, py: number, pz: number, c: THREE.Color, alpha: number, halfWidth: number): void {
    if (this.count >= this.max || alpha <= 0.004) return;
    const i = this.count++;
    const p = i * 12;
    const s = i * 8;
    for (let k = 0; k < 4; k++) {
      const o = p + k * 3;
      this.head[o] = x;
      this.head[o + 1] = y;
      this.head[o + 2] = z;
      this.tail[o] = px;
      this.tail[o + 1] = py;
      this.tail[o + 2] = pz;
      this.col[o] = c.r;
      this.col[o + 1] = c.g;
      this.col[o + 2] = c.b;
      const so = s + k * 2;
      this.style[so] = alpha;
      this.style[so + 1] = halfWidth;
    }
  }

  end(): void {
    this.geo.setDrawRange(0, this.count * 6);
    if (this.count > 0 || this.prevCount > 0) {
      for (const name of ['position', 'aTail', 'color', 'aStyle']) {
        const attr = this.geo.getAttribute(name) as THREE.BufferAttribute;
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, Math.max(1, this.count * 6) * attr.itemSize);
        attr.needsUpdate = true;
      }
    }
    this.prevCount = this.count;
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}

// ---------------------------------------------------------------------------------- fractal sign & crystal path shaders

const FRACTAL_VERT = /* glsl */ `
  attribute vec3 color;
  attribute vec2 aEmblemFx;
  varying vec3 vColor;
  varying vec2 vFx;
  void main() {
    vColor = color;
    vFx = aEmblemFx;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRACTAL_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying vec2 vFx;
  void main() {
    float depth = vFx.x;
    float glint = vFx.y;
    vec3 warm = vec3(1.0, 0.72, 0.24);
    float lum = dot(vColor, vec3(0.2126, 0.7152, 0.0722));
    vec3 tinted = mix(vColor, max(vColor, vec3(0.18, 0.14, 0.06)) * warm * 1.45 + warm * (0.18 + 0.25 * lum), depth * 0.58);
    float boost = mix(1.42, 2.05, depth);
    vec3 col = tinted * boost + vec3(1.0, 0.94, 0.76) * glint * 1.35;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const PATH_VERT = /* glsl */ `
  varying float vU;
  varying float vRim;
  void main() {
    vU = clamp(position.y + 0.5, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 vn = normalize(normalMatrix * normal);
    vRim = clamp(abs(dot(vn, normalize(-mv.xyz))), 0.0, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const PATH_FRAG = /* glsl */ `
  uniform vec4 uPathFx;
  varying float vU;
  varying float vRim;
  void main() {
    float fill = uPathFx.x;
    float shimmer = uPathFx.y;
    float headGlow = uPathFx.z;
    float alpha = uPathFx.w;
    float lit = fill <= 0.001 ? 0.0 : (fill >= 0.999 ? 1.0 : 1.0 - smoothstep(fill - 0.08, fill + 0.02, vU));
    vec3 glass = vec3(0.75, 0.91, 1.0);
    vec3 gold = vec3(0.98, 0.76, 0.24) * (0.7 + 0.45 * vRim);
    float d = (vU - shimmer) * 6.5;
    float crest = exp(-d * d) * headGlow * (lit > 0.02 || abs(vU - fill) < 0.18 ? 1.0 : 0.0);
    vec3 col = mix(glass, gold, lit) + vec3(1.0, 0.95, 0.74) * crest * 1.45;
    float a = mix(0.30, 1.0, clamp(lit + crest * 0.85, 0.0, 1.0)) * alpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------------- the golden fractal

// A Mandelbulb (power 8) in gold, marched against the sky behind the finished molar: the grand
// finale's surprise. Distance estimate: 0.5 * log(r) * r / dr. Six iterations, 72 steps.
const BULB_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BULB_FRAG = /* glsl */ `
  uniform vec3 uCamPos;
  uniform mat3 uCamRot;
  uniform float uTanHalf;
  uniform float uAspect;
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform float uTime;
  uniform float uAlpha;
  uniform float uPower;
  varying vec2 vUv;
  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
  float de(vec3 p, out float trap) {
    vec3 z = p; float dr = 1.0; float r = 0.0; trap = 10.0;
    for (int i = 0; i < 6; i++) {
      r = length(z);
      if (r > 2.0) break;
      float th = acos(clamp(z.y / max(r, 1e-6), -1.0, 1.0)) * uPower;
      float ph = atan(z.z, z.x) * uPower;
      float rp = pow(r, uPower - 1.0);
      dr = rp * uPower * dr + 1.0;
      float zr = rp * r;
      z = zr * vec3(sin(th) * cos(ph), cos(th), sin(th) * sin(ph)) + p;
      trap = min(trap, dot(z, z));
    }
    return 0.5 * log(max(r, 1e-6)) * r / dr;
  }
  void main() {
    if (uAlpha < 0.003) discard;
    vec2 ndc = vUv * 2.0 - 1.0;
    vec3 rd = normalize(uCamRot * vec3(ndc.x * uTanHalf * uAspect, ndc.y * uTanHalf, -1.0));
    vec3 ro = uCamPos - uCenter;
    // Tangent-plane coordinates round the fractal sun, for soft golden light rays behind the tooth
    vec3 toCenter = -ro;
    float centerDist = length(toCenter);
    vec3 centerDir = toCenter / max(centerDist, 0.001);
    float fwdDot = dot(rd, centerDir);
    if (fwdDot <= 0.05) discard;
    vec3 rayRight = normalize(cross(centerDir, vec3(0.0, 1.0, 0.0)));
    vec3 rayUp = cross(rayRight, centerDir);
    vec3 onPlane = rd / fwdDot - centerDir;
    float rx = dot(onPlane, rayRight) * centerDist / max(uRadius, 0.001);
    float ry = dot(onPlane, rayUp) * centerDist / max(uRadius, 0.001);
    float rad = length(vec2(rx, ry));
    if (rad > 2.35) discard;
    float ang = atan(ry, rx);
    // Slow colour breathing across copper-amber, 24k gold and warm champagne light
    float breath = 0.5 + 0.5 * sin(uTime * 0.65);
    float breath2 = 0.5 + 0.5 * cos(uTime * 0.42 + 1.1);
    float raysA = pow(max(0.0, 0.5 + 0.5 * sin(ang * 10.0 + uTime * 0.22)), 3.0);
    float raysB = pow(max(0.0, 0.5 + 0.5 * sin(ang * 16.0 - uTime * 0.14 + 1.3)), 4.0);
    float raysC = 0.5 + 0.5 * sin(ang * 6.0 + uTime * 0.09);
    float beams = (0.55 * raysA + 0.45 * raysB) * (0.65 + 0.35 * raysC);
    float rayReach = smoothstep(0.32, 0.85, rad) * (1.0 - smoothstep(0.95, 2.25, rad));
    float halo = exp(-rad * rad * 1.55) * (1.0 - smoothstep(1.5, 2.25, rad));
    vec3 rayTint = mix(vec3(1.0, 0.70, 0.24), vec3(1.0, 0.86, 0.48), breath);
    vec3 rayCol = rayTint * (halo * 0.30 + beams * rayReach * 0.52);
    float rayAlpha = clamp(halo * 0.34 + beams * rayReach * 0.42, 0.0, 0.75);
    // Bounding sphere for the Mandelbulb (rays outside skip raymarching entirely)
    float b = dot(ro, rd);
    float c = dot(ro, ro) - uRadius * uRadius;
    float disc = b * b - c;
    vec3 col = vec3(0.0);
    float a = 0.0;
    bool hit = false;
    if (disc >= 0.0) {
      float tNear = max(0.0, -b - sqrt(disc));
      float tFar = -b + sqrt(disc);
      mat3 spin = rotY(uTime * 0.35) * rotX(0.4 + sin(uTime * 0.2) * 0.2);
      float t = tNear;
      float trap = 0.0;
      float steps = 0.0;
      for (int i = 0; i < 72; i++) {
        vec3 p = spin * ((ro + rd * t) / uRadius * 1.2);
        float d = de(p, trap) * uRadius / 1.2;
        if (d < 0.002 * t) { hit = true; break; }
        t += d * 0.9;
        steps += 1.0;
        if (t > tFar) break;
      }
      float glow = steps / 72.0;
      if (hit) {
        // lit gold: a surface normal from the distance estimate, a key light, a rim, and the
        // marching steps as ambient occlusion (deep folds take more steps)
        vec3 p = spin * ((ro + rd * t) / uRadius * 1.2);
        float e = 0.0012 * t / uRadius;
        float tr;
        vec3 n = normalize(vec3(
          de(p + vec3(e, 0.0, 0.0), tr) - de(p - vec3(e, 0.0, 0.0), tr),
          de(p + vec3(0.0, e, 0.0), tr) - de(p - vec3(0.0, e, 0.0), tr),
          de(p + vec3(0.0, 0.0, e), tr) - de(p - vec3(0.0, 0.0, e), tr)));
        vec3 v = -normalize(spin * rd);
        vec3 l = normalize(spin * vec3(0.45, 0.8, 0.4));
        float diff = max(dot(n, l), 0.0);
        float rim = pow(max(1.0 - max(dot(n, v), 0.0), 0.0), 3.0);
        float spec = pow(max(dot(reflect(-l, n), v), 0.0), 24.0);
        float ao = 1.0 - glow;
        vec3 deepTone = mix(vec3(0.56, 0.30, 0.06), vec3(0.76, 0.34, 0.14), breath);
        vec3 brightTone = mix(vec3(1.0, 0.74, 0.24), vec3(1.0, 0.84, 0.42), breath);
        vec3 base = mix(deepTone, brightTone, clamp(trap * 0.85, 0.0, 1.0));
        vec3 rimTint = mix(vec3(1.0, 0.86, 0.50), vec3(0.92, 0.96, 1.0), breath2 * 0.24);
        vec3 innerWarmth = vec3(0.95, 0.56, 0.14) * glow * (0.14 + 0.16 * breath);
        col = base * (0.32 + 0.68 * diff) * (0.45 + 0.55 * ao) + rimTint * (0.34 * rim + 0.48 * spec) + innerWarmth;
        a = 1.0;
      } else {
        vec3 coronaTint = mix(vec3(1.0, 0.64, 0.20), vec3(1.0, 0.82, 0.38), breath);
        col = coronaTint * glow * glow * 0.48;
        a = glow;
      }
    }
    // premultiplied, over the sky: solid where it hits, soft breathing corona and sunbeams around it
    vec3 outRgb = hit ? col : (col * a + rayCol);
    float outA = hit ? 1.0 : clamp(a + rayAlpha * 0.35, 0.0, 1.0);
    gl_FragColor = vec4(outRgb * uAlpha, outA * uAlpha);
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------------- the stage

/** Each city's colour down the wormhole that leads to it (and gold for the way to the Golden Molar). */
const WORMHOLE_TINTS = [0xf87171, 0xc084fc, 0xf472b6, 0xfbbf24, 0x67e8f9] as const;
const WORMHOLE_TINT_ENDING = 0xfde047;

function meshGeometry(m: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(m.normals, 3));
  g.setIndex(m.indices);
  return g;
}

/** A city's sign as a thin solid with its own colours, round 0,0, about one unit each way. */
function emblemGeometry(emblem: readonly SkylinePiece[], depth: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  emblem.forEach((piece, k) => {
    const c = hexColor(piece.color);
    const z = depth / 2 + k * 0.004;
    const t = piece.tris;
    for (let i = 0; i + 5 < t.length; i += 6) {
      for (const v of [0, 1, 2]) {
        pos.push(t[i + v * 2], t[i + v * 2 + 1], z);
        col.push(c.r, c.g, c.b);
        nor.push(0, 0, 1);
      }
    }
    for (const [x1, y1, x2, y2] of boundaryEdges(t)) {
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = (y2 - y1) / len;
      const ny = -(x2 - x1) / len;
      for (const [x, y, zz] of [
        [x1, y1, z],
        [x2, y2, z],
        [x2, y2, -depth / 2],
        [x1, y1, z],
        [x2, y2, -depth / 2],
        [x1, y1, -depth / 2],
      ]) {
        pos.push(x, y, zz);
        col.push(c.r * 0.6, c.g * 0.6, c.b * 0.6);
        nor.push(nx, ny, 0);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

const FINISH_METAL: Record<MolarFinish, { color: number; rough: number }> = {
  empty: { color: 0x1e293b, rough: 0.5 },
  pearl: { color: 0xf5efe6, rough: 0.28 },
  silver: { color: 0xd9dee6, rough: 0.2 },
  gold: { color: 0xf3c04f, rough: 0.2 },
};

/** A coin: a short cylinder in its finish with the city's sign raised on both faces. */
function buildCoin(emblem: THREE.BufferGeometry, finish: MolarFinish, env: THREE.Texture | null, track: (d: { dispose(): void }) => void): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.CylinderGeometry(1, 1, 0.16, 48);
  body.rotateX(Math.PI / 2);
  const metal = FINISH_METAL[finish === 'empty' ? 'pearl' : finish];
  const mat = new THREE.MeshStandardMaterial({ color: metal.color, metalness: 1, roughness: metal.rough, envMap: env, envMapIntensity: 1.3 });
  track(body);
  track(mat);
  g.add(new THREE.Mesh(body, mat));
  const reliefMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.45, envMap: env, emissive: 0x111111, side: THREE.DoubleSide });
  track(reliefMat);
  const front = new THREE.Mesh(emblem, reliefMat);
  front.scale.setScalar(0.62);
  front.position.z = 0.1;
  const back = new THREE.Mesh(emblem, reliefMat);
  back.scale.setScalar(0.62);
  back.position.z = -0.1;
  back.rotation.y = Math.PI;
  g.add(front, back);
  return g;
}

export class FinaleStage3D {
  private renderer: THREE.WebGLRenderer | null = null;

  /** Whether WebGL started: if not, the caller draws the 2D show instead. */
  get ok(): boolean {
    return this.renderer !== null;
  }
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 900);
  private readonly glow = new GlowPass();
  private env: THREE.Texture | null = null;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private readonly disposables: { dispose(): void }[] = [];
  private readonly track = (d: { dispose(): void }): void => {
    this.disposables.push(d);
  };

  private readonly skyUniforms = {
    uTime: { value: 0 },
    uAurora: { value: 0 },
    uSkyC0: { value: Array.from({ length: 5 }, () => new THREE.Color(0x1e293b)) },
    uSkyC1: { value: Array.from({ length: 5 }, () => new THREE.Color(0x172554)) },
    uSkyC2: { value: Array.from({ length: 5 }, () => new THREE.Color(0x0f172a)) },
    uSkyC3: { value: Array.from({ length: 5 }, () => new THREE.Color(0x0b1640)) },
    uSkyH: { value: new THREE.Vector4(0, 0.03, 0.07, 0.13) },
    uSpace: { value: 0 },
    uT: { value: 0 },
    uRm: { value: 0 },
    uOverride: { value: -1 },
    uRiseEnd: { value: T.riseEnd },
    uWaveEnd: { value: T.waveEnd },
    uAuroraA: { value: new THREE.Color(0x2dd4bf) },
    uAuroraB: { value: new THREE.Color(0xa78bfa) },
  };
  private skyFor = -2;
  private readonly reliefs = new Map<number, CityRelief>();
  private readonly sparks = new GlowPoints(4000);
  private readonly streaks = new GlowStreaks(4500);
  private readonly water: THREE.Mesh;
  private readonly beads: THREE.InstancedMesh;
  private readonly balloons: THREE.Group[] = [];
  private readonly meteorLines: THREE.LineSegments;
  private readonly meteorPos = new Float32Array(12 * 6);
  private readonly emblemGeos = new Map<number, THREE.BufferGeometry>();
  private readonly fractals = new Map<number, { inst: THREE.InstancedMesh; fxBuf: Float32Array; fxAttr: THREE.InstancedBufferAttribute }>();
  private readonly orbitEmblems: THREE.Mesh[] = [];
  private readonly probe = new THREE.Group();
  private readonly coinRoot = new THREE.Group();
  private coinFor = -1;
  private readonly flyingRoot = new THREE.Group();
  private readonly flyingCoins: (THREE.Group | null)[] = [];
  /** 0: the molar shows its chewing surface; 1: it stands up to face you (the ending's face). */
  private faceTilt = 0;
  private readonly molar = new THREE.Group();
  private readonly molarFx = { value: new THREE.Vector4(0, -3, 0, 0) };
  /** The wormhole to the next city: its rings of porcelain and gold teeth. */
  private readonly wormholePorcelain: THREE.InstancedMesh;
  private readonly wormholeGold: THREE.InstancedMesh;
  private disposed = false;
  private readonly molarBodyGlass: THREE.MeshPhysicalMaterial;
  private readonly molarBodyGold: THREE.MeshPhysicalMaterial;
  private readonly molarBody: THREE.Mesh;
  private readonly socketMat: THREE.MeshPhysicalMaterial;
  private readonly bezelMat: THREE.MeshStandardMaterial;
  private readonly cuspCoins: (THREE.Group | null)[] = [];
  private readonly mountain = new THREE.Group();
  private readonly mountainFx = { value: new THREE.Vector4(0, 0, 0, 0) };
  private readonly probeLocal = { value: new THREE.Vector4(0, 0, 0, 0) };
  private readonly mountainMat: THREE.MeshStandardMaterial;
  private readonly ledgeMeshes: THREE.Mesh[] = [];
  private readonly ledgeCoins: (THREE.Group | null)[] = [];
  private readonly pathMaterials: THREE.ShaderMaterial[] = [];
  private readonly ledgeGold: THREE.MeshStandardMaterial;
  private readonly ledgeDim: THREE.MeshStandardMaterial;
  private readonly bulb: THREE.Mesh;
  private readonly bulbMat: THREE.ShaderMaterial;
  private readonly glowSprite: THREE.Texture;
  private readonly coinGlow: THREE.Sprite;
  private readonly summitGlow: THREE.Sprite;
  private readonly rays: THREE.Mesh;
  private readonly burstA = new THREE.Vector4();
  private readonly burstB = new THREE.Vector4();
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpE = new THREE.Euler();
  private readonly tmpS = new THREE.Vector3();
  private readonly tmpP = new THREE.Vector3();
  private readonly colA = new THREE.Color();
  private readonly colB = new THREE.Color();
  private readonly mixed = new THREE.Color();
  private readonly tmpV2 = new THREE.Vector2();

  constructor(
    canvas: HTMLCanvasElement,
    private readonly cities: (FinaleCity3D | null)[],
    private readonly worldIndex: number,
    private readonly finishes: readonly MolarFinish[],
    private reducedMotion: boolean
  ) {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      this.renderer = null;
    }
    // Everything below is built even without WebGL, so the fields are always set; `ok` says
    // whether the show can be drawn this way.
    const r = this.renderer;
    if (r) {
      r.setClearColor(0x01030c, 1);
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.05;
      const pmrem = new THREE.PMREMGenerator(r);
      const room = new RoomEnvironment();
      this.envTarget = pmrem.fromScene(room, 0.04);
      this.env = this.envTarget.texture;
      room.dispose();
      pmrem.dispose();
    }
    this.glow.strength = 0.7;

    // far: the sky dome
    const skyGeo = new THREE.SphereGeometry(400, 48, 24);
    const skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false });
    this.track(skyGeo);
    this.track(skyMat);
    const sky = new THREE.Mesh(skyGeo, skyMat);
    // centred where the camera mostly is, so a direction on the dome lines up with the city below
    sky.position.set(0, 0, 60);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.scene.add(sky);

    // the dark water the city stands in, with its rippled reflection and horizon shimmer showing through
    const waterGeo = new THREE.CircleGeometry(420, 96);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshBasicMaterial({ color: 0x020617, transparent: true, opacity: 0.55, depthWrite: false });
    this.track(waterGeo);
    this.track(waterMat);
    this.water = new THREE.Mesh(waterGeo, waterMat);
    this.water.position.set(0, -0.02, -20);
    this.water.renderOrder = 1;
    this.scene.add(this.water);

    // lights for the solid things on the stage
    this.scene.add(new THREE.AmbientLight(0x8090b0, 0.5));
    const key = new THREE.DirectionalLight(0xfff2d6, 2.2);
    key.position.set(-8, 20, 30);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x67e8f9, 1.1);
    rim.position.set(14, 6, -10);
    this.scene.add(rim);

    this.scene.add(this.sparks.points);
    this.scene.add(this.streaks.mesh);

    // beads, balloons and meteor streaks for the shows that have them
    const beadGeo = new THREE.SphereGeometry(0.2, 10, 8);
    const beadMat = new THREE.MeshStandardMaterial({ metalness: 0.4, roughness: 0.3, envMap: this.env });
    this.track(beadGeo);
    this.track(beadMat);
    this.beads = new THREE.InstancedMesh(beadGeo, beadMat, 60);
    this.beads.count = 0;
    this.beads.frustumCulled = false;
    this.scene.add(this.beads);
    const envelope = new THREE.SphereGeometry(0.75, 20, 14);
    const basket = new THREE.BoxGeometry(0.45, 0.3, 0.45);
    this.track(envelope);
    this.track(basket);
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const em = new THREE.MeshStandardMaterial({ roughness: 0.6, color: 0xffffff });
      const bm = new THREE.MeshStandardMaterial({ roughness: 0.9, color: 0x8b5e34 });
      this.track(em);
      this.track(bm);
      const env = new THREE.Mesh(envelope, em);
      env.scale.set(1, 1.15, 1);
      const bas = new THREE.Mesh(basket, bm);
      bas.position.y = -1.2;
      g.add(env, bas);
      g.visible = false;
      this.balloons.push(g);
      this.scene.add(g);
    }
    const meteorGeo = new THREE.BufferGeometry();
    meteorGeo.setAttribute('position', new THREE.BufferAttribute(this.meteorPos, 3).setUsage(THREE.DynamicDrawUsage));
    const meteorCol = new Float32Array(12 * 6);
    for (let i = 0; i < 12; i++) meteorCol.set([1, 1, 1, 0, 0, 0], i * 6);
    meteorGeo.setAttribute('color', new THREE.BufferAttribute(meteorCol, 3));
    const meteorMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.track(meteorGeo);
    this.track(meteorMat);
    this.meteorLines = new THREE.LineSegments(meteorGeo, meteorMat);
    this.meteorLines.frustumCulled = false;
    this.scene.add(this.meteorLines);

    // a soft round glow, for sprites
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 64;
    const gc = glowCanvas.getContext('2d');
    if (gc) {
      const grad = gc.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      gc.fillStyle = grad;
      gc.fillRect(0, 0, 64, 64);
    }
    this.glowSprite = new THREE.CanvasTexture(glowCanvas);
    this.track(this.glowSprite);
    const sprite = (color: number): THREE.Sprite => {
      const m = new THREE.SpriteMaterial({ map: this.glowSprite, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      this.track(m);
      const s = new THREE.Sprite(m);
      s.renderOrder = 9;
      return s;
    };

    // the probe: the game's own HYDRA-1 craft (nose toward +x), its two sonic rings turning
    const hullGeo = buildHydraHullGeometry();
    const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.3, envMap: this.env, envMapIntensity: 1.2 });
    const ringAGeo = buildSonicRingGeometry(0.27, 12, 0x22d3ee, 0x67e8f9);
    const ringBGeo = buildSonicRingGeometry(0.16, 8, 0x0ea5e9, 0xa5f3fc);
    const ringMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const coreGeo = new THREE.IcosahedronGeometry(0.11, 1);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x5eead4, toneMapped: false });
    const domeGeo = new THREE.SphereGeometry(0.36, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    domeGeo.scale(1.25, 0.9, 0.92);
    const domeMat = new THREE.MeshPhysicalMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1, envMap: this.env, depthWrite: false });
    for (const d of [hullGeo, hullMat, ringAGeo, ringBGeo, ringMat, coreGeo, coreMat, domeGeo, domeMat]) this.track(d);
    const craft = new THREE.Group();
    craft.name = 'craft';
    craft.add(new THREE.Mesh(hullGeo, hullMat));
    for (const [geo, name] of [
      [ringAGeo, 'ringA'],
      [ringBGeo, 'ringB'],
    ] as const) {
      const ring = new THREE.Mesh(geo, ringMat);
      ring.name = name;
      ring.position.set(-0.78, 0.02, 0);
      craft.add(ring);
    }
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(0.24, 0.3, 0);
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.set(0.24, 0.2, 0);
    const thruster = sprite(0x5eead4);
    thruster.position.set(-0.95, 0.02, 0);
    thruster.scale.setScalar(1.6);
    craft.add(core, dome, thruster);
    const probeGlow = sprite(0x5eead4);
    probeGlow.scale.setScalar(3.4);
    (probeGlow.material as THREE.SpriteMaterial).opacity = 0.45;
    this.probe.add(craft, probeGlow);
    this.probe.visible = false;
    this.scene.add(this.probe);

    // the coin's glow and the turning rays behind it while the probe holds it up
    this.coinGlow = sprite(0xfde68a);
    this.coinGlow.visible = false;
    this.scene.add(this.coinGlow);
    this.scene.add(this.coinRoot);
    this.scene.add(this.flyingRoot);
    // rays that fade out along their length
    const rayGeo = new THREE.BufferGeometry();
    const rayPos: number[] = [];
    const rayCol: number[] = [];
    for (let k = 0; k < 12; k++) {
      const a = (Math.PI * 2 * k) / 12;
      const w = 0.07;
      rayPos.push(0, 0, 0, Math.cos(a - w), Math.sin(a - w), 0, Math.cos(a + w), Math.sin(a + w), 0);
      rayCol.push(1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0);
    }
    rayGeo.setAttribute('position', new THREE.Float32BufferAttribute(rayPos, 3));
    rayGeo.setAttribute('color', new THREE.Float32BufferAttribute(rayCol, 4));
    const rayMat = new THREE.MeshBasicMaterial({ color: 0xfde68a, vertexColors: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.track(rayGeo);
    this.track(rayMat);
    this.rays = new THREE.Mesh(rayGeo, rayMat);
    this.rays.visible = false;
    this.rays.renderOrder = 8;
    this.scene.add(this.rays);

    // the Golden Molar: a porcelain crown on two roots, a jewel setting on each cusp for its piece
    const molarGeo = meshGeometry(goldenMolarMesh());
    const rootGeos = [meshGeometry(molarRootMesh(-1)), meshGeometry(molarRootMesh(1))];
    this.track(molarGeo);
    for (const g of rootGeos) this.track(g);
    this.molarBodyGlass = new THREE.MeshPhysicalMaterial({
      color: 0xc9c0b0,
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.2,
      sheen: 0.25,
      sheenColor: new THREE.Color(0xffe7c2),
      envMap: this.env,
      envMapIntensity: 0.55,
      transparent: true,
    });
    this.molarBodyGlass.customProgramCacheKey = () => 'molar-porcelain-v1';
    this.molarBodyGlass.onBeforeCompile = (shader) => {
      shader.uniforms.uMolarFx = this.molarFx;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMolarLocal;\nvarying vec3 vMolarWorld;\nvarying vec3 vMolarNormal;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvMolarLocal = position;\nvMolarWorld = (modelMatrix * vec4(position, 1.0)).xyz;\nvMolarNormal = normalize(mat3(modelMatrix) * normal);'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec4 uMolarFx;\nvarying vec3 vMolarLocal;\nvarying vec3 vMolarWorld;\nvarying vec3 vMolarNormal;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            vec3 wn = normalize(vMolarNormal);
            vec3 V = normalize(cameraPosition - vMolarWorld);
            vec3 keyDir = normalize(vec3(-8.0, 20.0, 30.0));
            float NdotV = clamp(dot(wn, V), 0.0, 1.0);
            float rim = pow(max(0.0, 1.0 - NdotV), 2.2);
            float wrap = clamp((dot(wn, keyDir) + 0.55) / 1.55, 0.0, 1.0);
            float backWarm = pow(clamp(1.0 - max(dot(wn, keyDir), 0.0), 0.0, 1.0), 1.6) * (0.35 + 0.65 * rim);
            float bodyDepth = 1.0 - smoothstep(0.0, 1.4, max(0.0, -vMolarLocal.z - 0.25));
            vec3 honey = vec3(0.55, 0.28, 0.09);
            vec3 cream = vec3(0.75, 0.50, 0.24);
            // a hint of warmth inside, kept low so the porcelain keeps its shading
            vec3 innerGlow = (honey * (0.14 + 0.22 * backWarm) + cream * (0.08 * wrap + 0.16 * rim)) * (0.45 + 0.55 * bodyDepth) * 0.4;
            innerGlow += vec3(0.85, 0.62, 0.22) * uMolarFx.x * (0.18 + 0.35 * rim);
            float sweepCoord = vMolarLocal.x * 0.78 + vMolarLocal.y * 0.52 + vMolarLocal.z * 0.25;
            float sd = sweepCoord - uMolarFx.y;
            float sweepBand = exp(-sd * sd * 14.0) * uMolarFx.z;
            innerGlow += vec3(1.0, 0.92, 0.68) * sweepBand * 0.75;
            totalEmissiveRadiance += innerGlow;
          }`
        );
    };
    this.molarBodyGold = new THREE.MeshPhysicalMaterial({ color: 0xe8b23e, metalness: 1, roughness: 0.26, clearcoat: 0.5, envMap: this.env, envMapIntensity: 1.0, transparent: true });
    this.molarBodyGold.customProgramCacheKey = () => 'molar-gold-v1';
    this.molarBodyGold.onBeforeCompile = (shader) => {
      shader.uniforms.uMolarFx = this.molarFx;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMolarLocal;\nvarying vec3 vMolarWorld;\nvarying vec3 vMolarNormal;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvMolarLocal = position;\nvMolarWorld = (modelMatrix * vec4(position, 1.0)).xyz;\nvMolarNormal = normalize(mat3(modelMatrix) * normal);'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec4 uMolarFx;\nvarying vec3 vMolarLocal;\nvarying vec3 vMolarWorld;\nvarying vec3 vMolarNormal;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            vec3 wn = normalize(vMolarNormal);
            vec3 V = normalize(cameraPosition - vMolarWorld);
            float NdotV = clamp(dot(wn, V), 0.0, 1.0);
            float rim = pow(max(0.0, 1.0 - NdotV), 2.6);
            float sweepCoord = vMolarLocal.x * 0.78 + vMolarLocal.y * 0.52 + vMolarLocal.z * 0.25;
            float sd = sweepCoord - uMolarFx.y;
            float sharp = exp(-sd * sd * 24.0);
            float broad = exp(-sd * sd * 4.5);
            vec3 sweepCol = (vec3(1.0, 0.94, 0.68) * sharp * 1.45 + vec3(0.95, 0.68, 0.16) * broad * 0.55) * uMolarFx.z;
            vec3 warmRim = vec3(0.92, 0.64, 0.18) * rim * (0.22 + 0.15 * uMolarFx.x);
            totalEmissiveRadiance += sweepCol + warmRim;
          }`
        );
    };
    this.track(this.molarBodyGlass);
    this.track(this.molarBodyGold);
    this.molarBody = new THREE.Mesh(molarGeo, this.molarBodyGlass);
    this.molar.add(this.molarBody);
    for (const g of rootGeos) {
      const root = new THREE.Mesh(g, this.molarBodyGlass);
      root.name = 'root';
      this.molar.add(root);
    }
    const socketGeo = new THREE.CylinderGeometry(1, 1, 0.12, 40);
    socketGeo.rotateX(Math.PI / 2);
    const bezelGeo = new THREE.TorusGeometry(1, 0.09, 10, 48);
    this.socketMat = new THREE.MeshPhysicalMaterial({ color: 0x0b1530, roughness: 0.18, clearcoat: 1, envMap: this.env, transparent: true });
    this.bezelMat = new THREE.MeshStandardMaterial({ color: 0xf3c04f, metalness: 1, roughness: 0.25, envMap: this.env, envMapIntensity: 1.4, transparent: true });
    for (const d of [socketGeo, bezelGeo, this.socketMat, this.bezelMat]) this.track(d);
    for (let i = 0; i < CAMPAIGN_PIECES; i++) {
      const top = molarCuspTop(i);
      const r = GOLDEN_MOLAR.cuspRadius * 0.98;
      const socket = new THREE.Mesh(socketGeo, this.socketMat);
      socket.position.set(top[0], top[1], top[2] - 0.02);
      socket.scale.setScalar(r);
      const bezel = new THREE.Mesh(bezelGeo, this.bezelMat);
      bezel.position.set(top[0], top[1], top[2] + 0.012);
      bezel.scale.setScalar(r * 1.04);
      this.molar.add(socket, bezel);
      this.cuspCoins.push(null);
    }
    this.molar.visible = false;
    this.scene.add(this.molar);

    // the wormhole to the next city: rings of little porcelain and gold teeth, crowns pointing in
    // (finale3d.ts places every tooth; the window at the far end is drawn by the 2D layer)
    const toothGeo = meshGeometry(wormholeToothMesh());
    const toothPorcelain = new THREE.MeshPhysicalMaterial({
      color: 0xf4eee0,
      roughness: 0.32,
      clearcoat: 0.85,
      clearcoatRoughness: 0.15,
      sheen: 0.3,
      sheenColor: new THREE.Color(0xffe7c2),
      emissive: 0xffffff,
      emissiveIntensity: 0.16,
      envMap: this.env,
      envMapIntensity: 0.8,
    });
    const toothGold = new THREE.MeshPhysicalMaterial({ color: 0xe8b23e, metalness: 1, roughness: 0.22, clearcoat: 0.5, emissive: 0x7a5410, emissiveIntensity: 0.35, envMap: this.env, envMapIntensity: 1.2 });
    for (const d of [toothGeo, toothPorcelain, toothGold]) this.track(d);
    // the mouth, the tunnel's rings and the ring round the window
    const maxTeeth = WORMHOLE.teeth * (WORMHOLE.rings + 2);
    this.wormholePorcelain = new THREE.InstancedMesh(toothGeo, toothPorcelain, maxTeeth);
    this.wormholeGold = new THREE.InstancedMesh(toothGeo, toothGold, maxTeeth);
    for (const m of [this.wormholePorcelain, this.wormholeGold]) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m);
    }
    // the porcelain teeth take on the next city's colour toward the far end of the tunnel
    this.wormholePorcelain.setColorAt(0, new THREE.Color(1, 1, 1));
    this.wormholePorcelain.instanceColor?.setUsage(THREE.DynamicDrawUsage);

    // the mountain: a spire of hexagonal crystal columns, ivory at the peak like enamel
    const columns = mountainColumns();
    const prism = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
    const pn = prism.getAttribute('normal');
    const shade = new Float32Array(pn.count * 3);
    for (let i = 0; i < pn.count; i++) {
      const ny = pn.getY(i);
      shade.fill(ny > 0.9 ? 1 : ny < -0.9 ? 0.3 : 0.6, i * 3, i * 3 + 3);
    }
    prism.setAttribute('color', new THREE.BufferAttribute(shade, 3));
    this.mountainMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.32, metalness: 0.1, envMap: this.env, envMapIntensity: 0.9, transparent: true });
    this.mountainMat.customProgramCacheKey = () => 'mountain-crystal-v1';
    this.mountainMat.onBeforeCompile = (shader) => {
      shader.uniforms.uMountainFx = this.mountainFx;
      shader.uniforms.uProbeLocal = this.probeLocal;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMountLocal;\nvarying vec3 vMountWorld;\nvarying vec3 vMountNormal;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec4 mLocal = instanceMatrix * vec4(position, 1.0);
            vMountLocal = mLocal.xyz;
            vMountWorld = (modelMatrix * mLocal).xyz;
          #else
            vMountLocal = position;
            vMountWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          #endif
          vMountNormal = normalize(mat3(modelMatrix) * normal);`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec4 uMountainFx;\nuniform vec4 uProbeLocal;\nvarying vec3 vMountLocal;\nvarying vec3 vMountWorld;\nvarying vec3 vMountNormal;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            vec3 lp = vMountLocal;
            vec3 wn = normalize(vMountNormal);
            vec3 V = normalize(cameraPosition - vMountWorld);
            float hFrac = clamp((lp.y + 1.1) / 1.6, 0.0, 1.0);
            float NdotV = clamp(abs(dot(wn, V)), 0.0, 1.0);
            float fresnel = pow(max(0.0, 1.0 - NdotV), 2.2);
            float topFace = smoothstep(0.65, 0.95, wn.y);
            float breathe = uMountainFx.y > 0.5 ? 0.5 : 0.5 + 0.5 * sin(uMountainFx.x * 1.6 - lp.y * 5.0 + lp.x * 2.5);
            vec3 deepGlow = vec3(0.05, 0.36, 0.52);
            vec3 midGlow = vec3(0.14, 0.62, 0.72);
            vec3 topGlow = vec3(0.95, 0.78, 0.38);
            vec3 cCol = hFrac < 0.55
              ? mix(deepGlow, midGlow, hFrac / 0.55)
              : mix(midGlow, topGlow, smoothstep(0.55, 0.95, hFrac));
            vec3 inner = cCol * (0.11 + 0.28 * fresnel + 0.09 * breathe) * (1.0 - 0.35 * topFace);
            inner += cCol * topFace * (0.07 + 0.14 * hFrac);
            vec3 dp = lp - vec3(0.0, 0.5, 0.0);
            float peakGlow = exp(-dot(dp, dp) * 3.8);
            inner += vec3(1.0, 0.80, 0.32) * peakGlow * (0.24 + 0.45 * uMountainFx.z);
            vec3 pp = lp - uProbeLocal.xyz;
            float probeCatch = exp(-dot(pp, pp) * 14.0) * uProbeLocal.w;
            inner += vec3(0.25, 0.92, 0.82) * probeCatch * 0.42;
            totalEmissiveRadiance += inner;
          }`
        );
    };
    this.track(prism);
    this.track(this.mountainMat);
    const spire = new THREE.InstancedMesh(prism, this.mountainMat, columns.length);
    const deep = new THREE.Color(0x1e1b4b);
    const sea = new THREE.Color(0x0e7490);
    const ivory = new THREE.Color(0xf5f0e6);
    const bottom = MOUNTAIN_3D.footY - 0.3;
    columns.forEach((c, i) => {
      const height = c.top - bottom;
      this.tmpP.set(c.x, bottom + height / 2, c.z);
      this.tmpS.set(c.radius, height, c.radius);
      this.tmpQ.identity();
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      spire.setMatrixAt(i, this.tmpM);
      const f = c.height;
      const col = f < 0.55 ? deep.clone().lerp(sea, f / 0.55) : sea.clone().lerp(ivory, smooth01((f - 0.55) / 0.35));
      // a few crystals catch the light
      if (((i * 2654435761) >>> 0) % 17 === 0) col.multiplyScalar(1.7);
      spire.setColorAt(i, col);
    });
    spire.instanceMatrix.needsUpdate = true;
    if (spire.instanceColor) spire.instanceColor.needsUpdate = true;
    this.mountain.add(spire);
    this.ledgeGold = new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xb45309, emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3, envMap: this.env });
    // not yet climbed: faint glass, so the way up shows without looking like pipes
    this.ledgeDim = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false });
    this.track(this.ledgeGold);
    this.track(this.ledgeDim);
    const ledgeGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 6);
    this.track(ledgeGeo);
    for (let i = 0; i < CAMPAIGN_PIECES; i++) {
      const l = ledge3D(i);
      const m = new THREE.Mesh(ledgeGeo, this.ledgeDim);
      m.position.set(l[0], l[1] - 0.085, l[2]);
      this.ledgeMeshes.push(m);
      this.mountain.add(m);
      this.ledgeCoins.push(null);
    }
    const stops = [ledge3D(-1), ...Array.from({ length: CAMPAIGN_PIECES }, (_, i) => ledge3D(i)), ledge3D(CAMPAIGN_PIECES)];
    const pathGeo = new THREE.CylinderGeometry(0.016, 0.016, 1, 8);
    this.track(pathGeo);
    for (let k = 0; k + 1 < stops.length; k++) {
      const a = new THREE.Vector3(...stops[k]);
      const b = new THREE.Vector3(...stops[k + 1]);
      const pm = new THREE.ShaderMaterial({
        vertexShader: PATH_VERT,
        fragmentShader: PATH_FRAG,
        uniforms: { uPathFx: { value: new THREE.Vector4(0, 0, 0, 1) } },
        transparent: true,
        depthWrite: false,
      });
      this.track(pm);
      this.pathMaterials.push(pm);
      const m = new THREE.Mesh(pathGeo, pm);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.scale.set(1, a.distanceTo(b), 1);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      m.renderOrder = 6;
      this.mountain.add(m);
    }
    this.summitGlow = sprite(0xfde68a);
    this.summitGlow.visible = false;
    this.scene.add(this.summitGlow);
    this.mountain.visible = false;
    this.scene.add(this.mountain);

    // the golden fractal behind the finished molar (grand finale)
    const bulbGeo = new THREE.PlaneGeometry(2, 2);
    this.bulbMat = new THREE.ShaderMaterial({
      vertexShader: BULB_VERT,
      fragmentShader: BULB_FRAG,
      uniforms: {
        uCamPos: { value: new THREE.Vector3() },
        uCamRot: { value: new THREE.Matrix3() },
        uTanHalf: { value: 0.4 },
        uAspect: { value: 1.6 },
        uCenter: { value: new THREE.Vector3() },
        uRadius: { value: 4 },
        uTime: { value: 0 },
        uAlpha: { value: 0 },
        uPower: { value: 8 },
      },
      // In the opaque pass straight after the sky (renderOrder), added onto it: everything
      // solid draws over it afterwards.
      transparent: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false,
      depthTest: false,
    });
    this.track(bulbGeo);
    this.track(this.bulbMat);
    this.bulb = new THREE.Mesh(bulbGeo, this.bulbMat);
    this.bulb.frustumCulled = false;
    this.bulb.renderOrder = -5;
    this.bulb.visible = false;
    this.scene.add(this.bulb);

    // each city's sign: the fractal bloom (coloured by depth + appear glint), and a single sign for the ending's circle
    const fractalMat = new THREE.ShaderMaterial({
      vertexShader: FRACTAL_VERT,
      fragmentShader: FRACTAL_FRAG,
      side: THREE.DoubleSide,
    });
    const orbitMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1.42, 1.42, 1.42), side: THREE.DoubleSide });
    this.track(fractalMat);
    this.track(orbitMat);
    cities.forEach((city, i) => {
      if (!city) return;
      const geo = emblemGeometry(city.art.emblem, 0.14);
      this.track(geo);
      this.emblemGeos.set(i, geo);
      const count = emblemFractalNodes(i).length;
      const instGeo = new THREE.BufferGeometry();
      instGeo.setAttribute('position', geo.getAttribute('position'));
      instGeo.setAttribute('color', geo.getAttribute('color'));
      instGeo.setAttribute('normal', geo.getAttribute('normal'));
      const fxBuf = new Float32Array(count * 2);
      const fxAttr = new THREE.InstancedBufferAttribute(fxBuf, 2).setUsage(THREE.DynamicDrawUsage);
      instGeo.setAttribute('aEmblemFx', fxAttr);
      this.track(instGeo);
      const inst = new THREE.InstancedMesh(instGeo, fractalMat, count);
      inst.frustumCulled = false;
      inst.count = 0;
      inst.renderOrder = 7;
      this.fractals.set(i, { inst, fxBuf, fxAttr });
      this.scene.add(inst);
      const orbit = new THREE.Mesh(geo, orbitMat);
      orbit.visible = false;
      this.orbitEmblems.push(orbit);
      this.scene.add(orbit);
    });

    // Compile the shaders now, not on the first frame of the show.
    if (this.renderer) {
      this.relief(worldIndex);
      try {
        this.renderer.compile(this.scene, this.camera);
      } catch {
        // drawing will compile them instead
      }
    }
  }

  private relief(i: number): CityRelief | null {
    const city = this.cities[i];
    if (!city) return null;
    let r = this.reliefs.get(i);
    if (!r) {
      r = new CityRelief(city.art, city.plan);
      r.group.visible = false;
      this.reliefs.set(i, r);
      this.scene.add(r.group);
    }
    return r;
  }

  private showOnly(index: number): CityRelief | null {
    let shown: CityRelief | null = null;
    for (const [i, r] of this.reliefs) r.group.visible = i === index;
    if (index >= 0) {
      shown = this.relief(index);
      if (shown) shown.group.visible = true;
    }
    return shown;
  }

  private setCamera(shot: { pos: Vec3; target: Vec3; fov: number }, w: number, h: number): void {
    const aspect = w / Math.max(1, h);
    // Keep the 16:9 horizontal framing on tall screens by opening the vertical angle.
    // On a tall screen keep only the middle of the 16:9 width in shot (42% on a phone held upright),
    // so the city and the stage fill the height instead of leaving empty sky and water.
    const coverage = aspect >= 1 ? 1 : Math.min(1, Math.max(0.42, 0.42 + (0.58 * (aspect - 0.45)) / 0.55));
    const hTan = Math.tan(((shot.fov * Math.PI) / 180) / 2) * (16 / 9) * coverage;
    const wanted = aspect < 16 / 9 ? Math.max(shot.fov, (2 * Math.atan(Math.min(2.4, hTan / aspect)) * 180) / Math.PI) : shot.fov;
    const vFov = Math.min(MAX_VFOV, wanted);
    // past the widest angle, step back along the view instead, keeping the same width in shot
    const back = Math.tan((wanted * Math.PI) / 360) / Math.tan((vFov * Math.PI) / 360);
    this.camera.fov = vFov;
    this.camera.aspect = aspect;
    this.camera.position.set(
      shot.target[0] + (shot.pos[0] - shot.target[0]) * back,
      shot.target[1] + (shot.pos[1] - shot.target[1]) * back,
      shot.target[2] + (shot.pos[2] - shot.target[2]) * back
    );
    // On a tall screen the opened angle shows mostly empty water; aim a little higher so the sky
    // (where the fireworks are) takes the space instead. Same as FinaleLens in the native app.
    const aim: Vec3 = [...shot.target];
    if (aspect < 1) {
      const extra = ((this.camera.fov - shot.fov) * 0.2 * Math.PI) / 180;
      const dist = back * Math.hypot(shot.target[0] - shot.pos[0], shot.target[1] - shot.pos[1], shot.target[2] - shot.pos[2]);
      aim[1] += dist * Math.tan(extra);
    }
    this.camera.lookAt(...aim);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  /** The sky over city `index` (-1: plain night), lit as at show time `t` or at `override`. */
  private setSky(index: number, aurora: number, t: number, override: number): void {
    const u = this.skyUniforms;
    u.uTime.value = this.reducedMotion ? 4 : t;
    u.uAurora.value = aurora;
    u.uT.value = t;
    u.uRm.value = this.reducedMotion ? 1 : 0;
    u.uOverride.value = override;
    if (this.skyFor === index) return;
    this.skyFor = index;
    const city = index >= 0 ? this.cities[index] : null;
    const stops = skyStops(city?.art ?? null);
    stops.colors.forEach(([a, b, c, d], k) => {
      u.uSkyC0.value[k].setHex(a);
      u.uSkyC1.value[k].setHex(b);
      u.uSkyC2.value[k].setHex(c);
      u.uSkyC3.value[k].setHex(d);
    });
    u.uSkyH.value.set(...stops.heights);
    // Station Aurora is in orbit: no water, stars all round
    const inSpace = city?.plan.show === 'meteors';
    u.uSpace.value = inSpace ? 1 : 0;
    this.water.visible = !inSpace;
    // a real aurora's green low down, the city's own colour at the top of the curtains
    const bursts = city?.plan.bursts ?? [];
    u.uAuroraB.value.setHex(bursts[0]?.color ?? 0xa78bfa);
  }

  private coinGroup(index: number, finish: MolarFinish): THREE.Group {
    const geo = this.emblemGeos.get(index);
    return buildCoin(geo ?? new THREE.BufferGeometry(), finish, this.env, this.track);
  }

  /** Finds up to two strongest active firework burst flashes to wash over the city skyline. */
  private computeBurstFlash(plan: CityFinalePlan, showT: number, dim: number): void {
    this.burstA.set(0, 0, 0, 0);
    this.burstB.set(0, 0, 0, 0);
    if (this.reducedMotion || showT < 0 || dim <= 0.004) return;
    const delay = plan.show === 'meteors' ? 0 : 0.9;
    let bestA = 0;
    let bestB = 0;
    for (const burst of plan.bursts) {
      const age = showT - burst.t - delay;
      if (age < 0 || age > 0.72) continue;
      const str = smooth01(age / 0.04) * Math.exp(-age / 0.24) * 0.55 * dim;
      if (str <= bestB) continue;
      this.colA.setHex(burst.color);
      if (str > bestA) {
        bestB = bestA;
        this.burstB.copy(this.burstA);
        bestA = str;
        this.burstA.set(this.colA.r * str, this.colA.g * str, this.colA.b * str, burst.x);
      } else {
        bestB = str;
        this.burstB.set(this.colA.r * str, this.colA.g * str, this.colA.b * str, burst.x);
      }
    }
  }

  /** Draws the city's show and celebration streaks/sparks (city space). */
  /** No beads, balloons or shooting stars on screen (before a city's show, or under another city's credit). */
  private clearShowProps(): void {
    this.beads.count = 0;
    for (const b of this.balloons) b.visible = false;
    this.meteorPos.fill(0);
    (this.meteorLines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private drawShow(city: FinaleCity3D, showT: number, dim: number): void {
    const plan = city.plan;
    if (showT < 0) {
      this.clearShowProps();
      return;
    }
    const delay = plan.show === 'meteors' ? 0 : 0.9;
    plan.bursts.forEach((burst, b) => {
      const center = burstWorld(burst, b);
      if (this.reducedMotion) {
        const still = (showT - burst.t - delay) / 1.6;
        if (still >= 0 && still < 1) this.sparks.add(center[0], center[1], center[2], this.colA.setHex(burst.color), 0.7 * dim * Math.sin(Math.PI * still), 2.6);
        return;
      }
      const rocket = finaleRocket(burst, showT, plan.show);
      if (rocket) {
        const p = skylineWorld(rocket.x, rocket.y, 0);
        const tail = skylineWorld(rocket.x, Math.max(0, rocket.y - 1.35), 0);
        this.colA.setHex(0xfef3c7);
        this.streaks.add(p[0], p[1], center[2], tail[0], tail[1], center[2], this.colA, 0.95 * dim, 0.16);
        this.sparks.add(p[0], p[1], center[2], this.colA, 0.9 * dim, 0.75);
      }
      if (this.reducedMotion) return;
      this.colA.setHex(burst.color);
      this.colB.setHex(burst.color2);
      // Soft brief core bloom right as the shell opens
      const age = showT - burst.t - delay;
      if (age >= 0 && age < 0.28) {
        const coreAlpha = 0.52 * dim * smooth01(age / 0.025) * Math.exp(-age / 0.08);
        const coreSize = 2.4 * (0.45 + 1.3 * smooth01(age / 0.12));
        this.mixed.copy(this.colA).lerp(this.colB, 0.35);
        this.sparks.add(center[0], center[1], center[2], this.mixed, coreAlpha, coreSize);
      }
      for (const s of burstSparks3D(burst, b, showT, plan.show, center)) {
        this.mixed.copy(this.colA).lerp(this.colB, s.mix);
        this.streaks.add(s.x, s.y, s.z, s.px, s.py, s.pz, this.mixed, s.alpha * dim, s.gen === 0 ? 0.24 : 0.16);
      }
    });
    // beads
    if (plan.show === 'beads' && !this.reducedMotion) {
      const beads = finaleBeads(showT);
      this.beads.count = beads.length;
      beads.forEach((bead, i) => {
        const p = skylineWorld(bead.x, bead.y, 0);
        this.tmpM.makeTranslation(p[0], p[1], p[2] + 3 + (i % 5) * 0.6);
        this.beads.setMatrixAt(i, this.tmpM);
        this.beads.setColorAt(i, this.colA.setHex(bead.color));
      });
      this.beads.instanceMatrix.needsUpdate = true;
      if (this.beads.instanceColor) this.beads.instanceColor.needsUpdate = true;
    } else {
      this.beads.count = 0;
    }
    // balloons
    const balloons = plan.show === 'balloons' ? finaleBalloons(showT) : [];
    this.balloons.forEach((g, i) => {
      const b = balloons[i];
      g.visible = Boolean(b) && !this.reducedMotion;
      if (!b) return;
      const p = skylineWorld(b.x, b.y, 0);
      g.position.set(p[0], p[1], p[2] + 4 + i * 0.7);
      ((g.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.setHex(b.color);
    });
    // shooting stars
    const meteors = plan.show === 'meteors' && !this.reducedMotion ? finaleMeteors(showT) : [];
    this.meteorPos.fill(0);
    meteors.forEach((m, i) => {
      const a = skylineWorld(m.x, m.y, 0);
      const b = skylineWorld(m.tailX, m.tailY, 0);
      this.meteorPos.set([a[0], a[1], a[2] - 4, b[0], b[1], b[2] - 4], i * 6);
    });
    (this.meteorLines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private placeFractal(index: number, t: number): void {
    for (const [i, entry] of this.fractals) {
      const { inst, fxBuf, fxAttr } = entry;
      if (i !== index) {
        inst.count = 0;
        continue;
      }
      const list = emblemFractal(i, t, this.reducedMotion);
      inst.count = list.length;
      list.forEach((e, k) => {
        this.tmpE.set(0, e.yaw, e.roll, 'YXZ');
        this.tmpQ.setFromEuler(this.tmpE);
        const s = e.scale * Math.max(0.001, e.alpha);
        this.tmpS.set(s, s, s);
        this.tmpP.set(e.x, e.y, e.z);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        inst.setMatrixAt(k, this.tmpM);
        fxBuf[k * 2] = Math.min(1, e.level / 3);
        fxBuf[k * 2 + 1] = e.glint;
      });
      inst.instanceMatrix.needsUpdate = true;
      fxAttr.needsUpdate = true;
    }
  }

  private placeProbe(t: number, mountainDy: number): void {
    const p = finaleProbe(t, this.reducedMotion, this.worldIndex, finaleClimbStatus(this.finishes).left === 0);
    if (p.space === 'hidden' || p.alpha <= 0.01) {
      this.probe.visible = false;
      return;
    }
    this.probe.visible = true;
    const where = (q: { space: string; x: number; y: number }, at: number): Vec3 => {
      if (q.space === 'city') {
        const w = skylineWorld(q.x, q.y, 0);
        return [w[0], w[1], w[2] + 3.5];
      }
      const depth = at >= T.molarEnd ? mountainFront(q.x, q.y - mountainDy) * STAGE.unit + 0.45 : 0.6;
      return stageWorld(q.x, q.y, depth);
    };
    const now = where(p, t);
    this.probe.position.set(...now);
    this.probe.scale.setScalar(p.space === 'city' ? 1.5 : 0.62);
    // Face the way it is flying: nose along +x going right, -x going left, toward the viewer
    // while it hovers; lean into the turn a little.
    const atTop = finaleClimbStatus(this.finishes).left === 0;
    const before = finaleProbe(t - 0.15, this.reducedMotion, this.worldIndex, atTop);
    let s = 0;
    if (before.space === p.space && !this.reducedMotion) {
      const prev = where(before, t - 0.15);
      s = Math.max(-1, Math.min(1, (now[0] - prev[0]) / (p.space === 'city' ? 1.6 : 0.5)));
    }
    const craft = this.probe.getObjectByName('craft');
    if (craft) {
      // a nod hello at the wormhole's ring of teeth (its tiny double in the next city nods back)
      const nod = finaleNod(t, T.hello, this.reducedMotion);
      craft.rotation.set(0, -Math.PI / 2 + (Math.PI / 2) * s, -0.25 * Math.abs(s) + (this.reducedMotion ? 0 : 0.05 * Math.sin(t * 3.1)) - 0.55 * nod);
      craft.position.y = this.reducedMotion ? 0 : 0.06 * Math.sin(t * 2.3);
    }
    const spin = this.reducedMotion ? 0 : t * 7;
    const ringA = this.probe.getObjectByName('ringA');
    const ringB = this.probe.getObjectByName('ringB');
    if (ringA) ringA.rotation.x = spin;
    if (ringB) ringB.rotation.x = -spin * 1.35;
  }

  private placeMolar(cx: number, cy: number, scale: number, alpha: number, t: number, placed: (i: number) => MolarFinish, shineIndex: number, shine: number, gold: boolean, turn: boolean): void {
    this.molar.visible = alpha > 0.01;
    if (!this.molar.visible) return;
    this.molar.position.set(...stageWorld(cx, cy, 0.3));
    this.molar.scale.setScalar(scale * STAGE.unit);
    // Three-quarter view: the cusps (and their pieces) toward you, the roots below. For the
    // ending's face it stands up straighter, its smooth side to the front.
    const yaw = turn && !this.reducedMotion ? Math.sin(t * 0.6) * 0.38 : 0;
    this.molar.rotation.set(-1.08 - 0.25 * this.faceTilt, yaw * (1 - this.faceTilt), 0);
    const body = gold ? this.molarBodyGold : this.molarBodyGlass;
    this.molarBody.material = body;
    for (const child of this.molar.children) if (child.name === 'root') (child as THREE.Mesh).material = body;
    for (const m of [this.molarBodyGlass, this.molarBodyGold, this.socketMat, this.bezelMat]) {
      m.opacity = alpha;
      m.transparent = alpha < 0.999;
    }
    for (let i = 0; i < CAMPAIGN_PIECES; i++) {
      const finish = placed(i);
      let coin = this.cuspCoins[i];
      if (finish === 'empty') {
        if (coin) coin.visible = false;
        continue;
      }
      if (!coin || coin.userData.finish !== finish) {
        if (coin) this.molar.remove(coin);
        coin = this.coinGroup(i, finish);
        coin.userData.finish = finish;
        this.cuspCoins[i] = coin;
        this.molar.add(coin);
      }
      coin.visible = true;
      const top = molarCuspTop(i);
      coin.position.set(top[0], top[1], top[2] + 0.03);
      const s = GOLDEN_MOLAR.cuspRadius * 0.88 * (i === shineIndex ? 1 + 0.25 * shine : 1);
      coin.scale.setScalar(s);
      // the pieces fade with the tooth they sit in (as SceneKit's node opacity does natively), so a
      // Reduce Motion cross-fade never leaves them hanging in the air
      setOpacity(coin, alpha);
    }
  }

  private placeMountain(t: number): number {
    const m = finaleMountain(t, this.reducedMotion);
    this.mountain.visible = m.alpha > 0.01;
    if (!this.mountain.visible) {
      this.summitGlow.visible = false;
      return m.dy;
    }
    this.mountain.position.set(...stageWorld(0, m.dy, 0));
    this.mountain.scale.setScalar(STAGE.unit);
    this.mountainMat.opacity = m.alpha;
    this.mountainMat.transparent = m.alpha < 0.999;
    const atTop = finaleClimbStatus(this.finishes).left === 0;
    const summitBlaze = atTop && t >= T.summitHop ? Math.min(1, 0.55 + Math.exp(-(t - T.summitHop) / 0.55)) : 0;
    this.mountainFx.value.set(t, this.reducedMotion ? 1 : 0, summitBlaze, 0);
    const probeNow = finaleProbe(t, this.reducedMotion, this.worldIndex, atTop);
    if (probeNow.space === 'stage' && probeNow.alpha > 0.01 && t >= T.molarEnd) {
      const py = probeNow.y - m.dy;
      this.probeLocal.value.set(probeNow.x, py, mountainFront(probeNow.x, py) + 0.08, probeNow.alpha);
    } else {
      this.probeLocal.value.set(0, 0, 0, 0);
    }
    const earned = (i: number): boolean =>
      i === this.worldIndex ? t >= T.climbHop : (this.finishes[i] ?? 'empty') !== 'empty';
    this.ledgeMeshes.forEach((l, i) => {
      l.material = earned(i) ? this.ledgeGold : this.ledgeDim;
      const show = earned(i);
      let coin = this.ledgeCoins[i];
      if (show && !coin) {
        coin = this.coinGroup(i, this.finishes[i] === 'empty' ? 'pearl' : this.finishes[i]);
        this.ledgeCoins[i] = coin;
        this.mountain.add(coin);
      }
      if (coin) {
        coin.visible = show;
        const p = ledge3D(i);
        const side = p[0] < 0 ? -1 : 1;
        const pop = i === this.worldIndex && !this.reducedMotion ? Math.min(1, Math.max(0, (t - T.climbHop) / 0.35)) : 1;
        coin.position.set(p[0] + side * 0.17, p[1] + 0.02, p[2] + 0.02);
        coin.scale.setScalar(0.072 * (0.4 + 0.6 * pop));
        coin.rotation.y = this.reducedMotion ? 0 : t * 0.8 + i;
      }
    });
    const hopStart = T.climbHop - 0.8;
    const summitStart = T.summitHop - 0.8;
    this.pathMaterials.forEach((pm, k) => {
      let fill = 0;
      let shimmer = 0;
      let headGlow = 0;
      const phase = ((t * 0.65 - k * 0.22) % 1 + 1) % 1;
      if (k < CAMPAIGN_PIECES) {
        if (k === this.worldIndex) {
          if (t >= T.climbHop) {
            fill = 1;
            shimmer = phase;
            headGlow = this.reducedMotion ? 0 : 0.35 + 0.65 * Math.exp(-(t - T.climbHop) / 0.5);
          } else if (t >= hopStart && !this.reducedMotion) {
            const s = smooth01((t - hopStart) / 0.8);
            fill = s;
            shimmer = s;
            headGlow = 1;
          }
        } else if (earned(k)) {
          fill = 1;
          shimmer = phase;
          headGlow = this.reducedMotion ? 0 : 0.35;
        }
      } else if (atTop) {
        if (t >= T.summitHop) {
          fill = 1;
          shimmer = ((t * 0.75 - k * 0.22) % 1 + 1) % 1;
          headGlow = this.reducedMotion ? 0 : 0.45 + 0.75 * Math.exp(-(t - T.summitHop) / 0.6);
        } else if (t >= summitStart && !this.reducedMotion) {
          const s = smooth01((t - summitStart) / 0.8);
          fill = s;
          shimmer = s;
          headGlow = 1;
        }
      }
      (pm.uniforms.uPathFx.value as THREE.Vector4).set(fill, shimmer, headGlow, m.alpha);
    });
    // Brief golden sparkle ring on the ledge when the probe touches down
    if (!this.reducedMotion) {
      const addTouchdown = (at: number, ledgeIdx: number): void => {
        const age = t - at;
        if (age < 0 || age > 0.5) return;
        const l = ledge3D(ledgeIdx);
        const w0 = stageWorld(l[0], l[1] + m.dy, l[2] * STAGE.unit);
        const r = 0.25 + 1.3 * smooth01(age / 0.45);
        const fade = (1 - age / 0.5) * m.alpha;
        this.colA.setHex(0xfde68a);
        for (let j = 0; j < 10; j++) {
          const a = (Math.PI * 2 * j) / 10 + age * 1.4;
          this.sparks.add(w0[0] + Math.cos(a) * r, w0[1] + Math.sin(a) * r * 0.45 + age * 0.6, w0[2] + 0.15, this.colA, fade * 0.85, 0.22);
        }
      };
      addTouchdown(T.climbHop, this.worldIndex);
      if (atTop) addTouchdown(T.summitHop, CAMPAIGN_PIECES);
    }
    const top = stageWorld(0, 0.66 + m.dy, 0);
    this.summitGlow.visible = true;
    this.summitGlow.position.set(top[0], top[1], top[2] - 0.5);
    const blaze = atTop && t >= T.summitHop ? 1.6 : 0.8 + (this.reducedMotion ? 0 : 0.15 * Math.sin(t * 3));
    this.summitGlow.scale.setScalar(5 * blaze);
    (this.summitGlow.material as THREE.SpriteMaterial).opacity = m.alpha * 0.7;
    return m.dy;
  }

  private resize(w: number, h: number): void {
    const r = this.renderer;
    if (!r) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = r.getSize(this.tmpV2);
    if (size.x !== w || size.y !== h || r.getPixelRatio() !== dpr) {
      r.setPixelRatio(dpr);
      r.setSize(w, h, false);
    }
  }

  private draw(): void {
    const r = this.renderer;
    if (!r) return;
    // point sizes are given in world units: this turns them into pixels at a distance of 1, for the
    // smaller glow buffer first, then for the screen
    const buffer = r.getDrawingBufferSize(this.tmpV2);
    const perUnit = buffer.y / (2 * Math.tan(((this.camera.fov * Math.PI) / 180) / 2));
    const scale = this.sparks.material.uniforms.uScale;
    const glowBuf = GlowPass.bufferSize(buffer.x, buffer.y);
    const viewport = this.streaks.material.uniforms.uViewport.value as THREE.Vector2;
    scale.value = (perUnit * glowBuf.h) / Math.max(1, buffer.y);
    viewport.set(glowBuf.w, glowBuf.h);
    this.glow.prepare(r, this.scene, this.camera);
    scale.value = perUnit;
    viewport.set(buffer.x, buffer.y);
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
    this.glow.composite(r);
  }

  private hideStage(): void {
    this.molar.visible = false;
    this.mountain.visible = false;
    this.summitGlow.visible = false;
    this.coinRoot.visible = false;
    this.flyingRoot.visible = false;
    this.coinGlow.visible = false;
    this.rays.visible = false;
    this.probe.visible = false;
    this.bulb.visible = false;
    for (const o of this.orbitEmblems) o.visible = false;
    for (const { inst } of this.fractals.values()) inst.count = 0;
    this.wormholePorcelain.count = 0;
    this.wormholeGold.count = 0;
  }

  /** The wormhole's teeth, each crown turned toward the tunnel's middle. */
  private placeWormhole(t: number): void {
    const teeth = wormholeTeeth(t, this.reducedMotion);
    const next = finaleClimbStatus(this.finishes).next;
    const tint = WORMHOLE_TINTS[next] ?? WORMHOLE_TINT_ENDING;
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    let porcelain = 0;
    let gold = 0;
    for (const w of teeth) {
      const s = w.scale;
      if (s <= 1e-4) continue;
      const x = w.tangent;
      const z = w.inward;
      // y = z x x keeps the frame right-handed (crown along z, roots spreading along x)
      const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      m.set(x[0] * s, y[0] * s, z[0] * s, w.pos[0], x[1] * s, y[1] * s, z[1] * s, w.pos[1], x[2] * s, y[2] * s, z[2] * s, w.pos[2], 0, 0, 0, 1);
      if (w.gold) {
        this.wormholeGold.setMatrixAt(gold++, m);
      } else {
        this.wormholePorcelain.setMatrixAt(porcelain, m);
        col.setRGB(1, 1, 1).lerp(col.clone().setHex(tint), 0.6 * w.depth);
        this.wormholePorcelain.setColorAt(porcelain, col);
        porcelain++;
      }
    }
    this.wormholePorcelain.count = porcelain;
    this.wormholeGold.count = gold;
    this.wormholePorcelain.instanceMatrix.needsUpdate = true;
    this.wormholeGold.instanceMatrix.needsUpdate = true;
    if (this.wormholePorcelain.instanceColor) this.wormholePorcelain.instanceColor.needsUpdate = true;
  }

  /**
   * Where the window onto the next city is on screen (CSS pixels): its middle and radius. Once the
   * camera reaches it, it covers the whole screen.
   */
  wormholeWindowOnScreen(t: number, w: number, h: number): { x: number; y: number; r: number; alpha: number; fill: number } | null {
    const win = wormholeWindow(t, this.reducedMotion);
    if (!win) return null;
    const cover = Math.hypot(w, h);
    const c = new THREE.Vector3(...win.center);
    const view = c.clone().applyMatrix4(this.camera.matrixWorldInverse);
    if (-view.z < 0.08) return { x: w / 2, y: h / 2, r: cover, alpha: win.alpha, fill: win.fill };
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const p = c.clone().project(this.camera);
    const e = c.clone().addScaledVector(right, win.radius).project(this.camera);
    const x = (p.x * 0.5 + 0.5) * w;
    const y = (-p.y * 0.5 + 0.5) * h;
    const r = Math.hypot((e.x * 0.5 + 0.5) * w - x, (-e.y * 0.5 + 0.5) * h - y);
    return { x, y, r: Math.min(r, cover * 4), alpha: win.alpha, fill: win.fill };
  }

  /** One frame of a city's finale, `t` seconds in. */
  renderCity(t: number, w: number, h: number): void {
    if (!this.renderer) return;
    this.resize(w, h);
    const city = this.cities[this.worldIndex];
    const relief = this.showOnly(this.worldIndex);
    if (!city || !relief) return;
    this.hideStage();
    this.faceTilt = 0;
    this.setCamera(finaleCamera3D(t, this.reducedMotion), w, h);
    const dim = 1 - 0.35 * smooth01((t - 14.0) / 1.0);
    this.computeBurstFlash(city.plan, t - T.blazeEnd, dim);
    relief.update(t, this.reducedMotion, -1, null, this.burstA, this.burstB);
    const aurora = smooth01((t - T.waveEnd) / 1.2) * (t < T.showEnd ? 1 : 0.55);
    this.setSky(this.worldIndex, this.reducedMotion ? aurora * 0.6 : aurora, t, -1);

    // the show
    this.sparks.begin();
    this.streaks.begin();
    this.drawShow(city, t - T.blazeEnd, dim);

    // the emblem: its rocket, then the fractal bloom of the city's sign
    const rocket = finaleEmblemRocket(t);
    if (rocket && !this.reducedMotion) {
      const p = stageWorld(rocket.x, rocket.y, 0);
      const y = lerpN(p[1] - 6, EMBLEM_WORLD.center[1], (t - T.showEnd) / (T.emblemBurst - T.showEnd));
      this.colA.setHex(0xfef3c7);
      this.streaks.add(0, y, EMBLEM_WORLD.center[2], 0, y - 1.6, EMBLEM_WORLD.center[2], this.colA, 1, 0.2);
      this.sparks.add(0, y, EMBLEM_WORLD.center[2], this.colA, 0.95, 1.0);
    }
    this.placeFractal(this.worldIndex, t);

    // the coin
    const finish = this.finishes[this.worldIndex] ?? 'pearl';
    const piece = finalePiece(t, this.worldIndex, this.reducedMotion);
    if (piece.visible) {
      if (this.coinFor !== this.worldIndex) {
        this.coinRoot.clear();
        this.coinRoot.add(this.coinGroup(this.worldIndex, finish));
        this.coinFor = this.worldIndex;
      }
      this.coinRoot.visible = true;
      const p = stageWorld(piece.x, piece.y, 0.8);
      this.coinRoot.position.set(...p);
      this.coinRoot.scale.setScalar(PIECE_RADIUS * piece.scale * STAGE.unit);
      setOpacity(this.coinRoot, piece.alpha);
      this.coinRoot.rotation.set(0, piece.spin, 0);
      this.coinGlow.visible = true;
      this.coinGlow.position.set(p[0], p[1], p[2] - 0.3);
      this.coinGlow.scale.setScalar(PIECE_RADIUS * STAGE.unit * 5 * piece.glow);
      (this.coinGlow.material as THREE.SpriteMaterial).color.setHex(finish === 'gold' ? 0xfde047 : 0xe2e8f0);
      (this.coinGlow.material as THREE.SpriteMaterial).opacity = piece.alpha * 0.8;
      if (t >= T.meet && t < T.prizeEnd && !this.reducedMotion) {
        this.rays.visible = true;
        this.rays.position.set(p[0], p[1], p[2] - 0.5);
        this.rays.scale.setScalar(PIECE_RADIUS * STAGE.unit * 3.4);
        this.rays.rotation.z = t * 0.6;
      }
    }

    // the molar, then the mountain with the molar on its summit
    const dy = this.placeMountain(t);
    const molar = finaleMolar(t, this.reducedMotion);
    const slotShine = finaleSlotShine(t);
    this.molarFx.value.set(slotShine, -3, 0, 0);
    this.placeMolar(
      molar.x,
      molar.y,
      GOLDEN_MOLAR.scale * molar.scale,
      molar.alpha,
      t,
      (i) => (i === this.worldIndex ? (t >= T.slot ? finish : 'empty') : this.finishes[i] ?? 'empty'),
      this.worldIndex,
      slotShine,
      false,
      t < T.molarEnd
    );
    this.placeProbe(t, dy);
    this.placeWormhole(t);
    // the probe's trail
    if (this.probe.visible && !this.reducedMotion) {
      for (let k = 1; k <= 7; k++) {
        const past = finaleProbe(t - k * 0.04, false, this.worldIndex, finaleClimbStatus(this.finishes).left === 0);
        if (past.space === 'hidden') continue;
        let w: Vec3;
        if (past.space === 'city') {
          const s = skylineWorld(past.x, past.y, 0);
          w = [s[0], s[1], s[2] + 3.5];
        } else {
          w = stageWorld(past.x, past.y, t >= T.molarEnd ? mountainFront(past.x, past.y - dy) * STAGE.unit + 0.45 : 0.6);
        }
        this.sparks.add(w[0], w[1], w[2], this.colA.setHex(0x5eead4), 0.6 * (1 - k / 8), past.space === 'city' ? 0.8 : 0.22);
      }
    }
    this.sparks.end();
    this.streaks.end();
    this.draw();
  }

  /** One frame of the grand finale, `t` seconds in. */
  renderEnding(t: number, w: number, h: number, allGold: boolean): void {
    if (!this.renderer) return;
    this.resize(w, h);
    this.hideStage();
    const credit = endingCredit(t);
    this.setCamera(endingCamera3D(t, this.reducedMotion), w, h);
    this.sparks.begin();
    this.streaks.begin();
    if (credit.index >= 0) {
      const relief = this.showOnly(credit.index);
      const city = this.cities[credit.index];
      const within = t - E.creditsStart - credit.index * E.creditSeconds;
      if (city) this.computeBurstFlash(city.plan, within - 0.6, credit.alpha);
      else {
        this.burstA.set(0, 0, 0, 0);
        this.burstB.set(0, 0, 0, 0);
      }
      relief?.update(T.end, this.reducedMotion, credit.alpha, this.reducedMotion ? null : t, this.burstA, this.burstB);
      this.setSky(credit.index, credit.alpha * 0.6, t, credit.alpha);
      if (city) this.drawShow(city, within - 0.6, credit.alpha);
    } else {
      this.showOnly(-1);
      this.setSky(-1, t >= E.finaleStart ? 1 : 0.35, t, 1);
      this.beads.count = 0;
      for (const b of this.balloons) b.visible = false;
      this.meteorPos.fill(0);
      (this.meteorLines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }

    // the molar, its pieces flying in, then gold with a light sweep across it on snap
    const place = endingMolarPlace(t, this.reducedMotion);
    const snapped = t >= E.snap;
    const isGold = snapped && allGold;
    let sweepPos = -3;
    let sweepStr = 0;
    if (snapped) {
      const snapAge = t - E.snap;
      if (this.reducedMotion) {
        sweepPos = 0;
        sweepStr = Math.exp(-snapAge / 0.85) * (isGold ? 0.5 : 0.35);
      } else if (snapAge < 1.35) {
        const s = snapAge / 1.35;
        sweepPos = lerpN(-1.7, 1.8, smooth01(s));
        sweepStr = Math.sin(s * Math.PI) * (isGold ? 1.0 : 0.65);
      } else if (isGold && t >= E.face && t - E.face < 1.2) {
        const s = (t - E.face) / 1.2;
        sweepPos = lerpN(-1.5, 1.6, smooth01(s));
        sweepStr = Math.sin(s * Math.PI) * 0.55;
      }
    }
    this.molarFx.value.set(isGold ? (t >= E.finaleStart ? 1 : 0.45) : 0, sweepPos, sweepStr, 0);
    // With every piece gold the molar stands up to face you before its face appears, so the face
    // sits on its smooth side rather than between the cusps.
    // every finished game gets the happy face, so the tooth turns a little toward the child for all
    this.faceTilt = smooth01((t - (E.face - 1.4)) / 1.2);
    this.placeMolar(
      place.x,
      place.y,
      place.scale,
      place.alpha,
      t,
      (i) => (endingPiece(i, t, this.reducedMotion).arrived ? this.finishes[i] ?? 'pearl' : 'empty'),
      -1,
      0,
      isGold,
      true
    );
    if (credit.index >= 0 && this.molar.visible) {
      // During the credits the camera is out over each city; the molar rides along at the top of
      // the view where the 2D show keeps it: its stage spot mapped onto a plane 14 units ahead.
      const depth = 14;
      const half = Math.tan((this.camera.fov * Math.PI) / 360) * depth;
      const k = (Math.min(w, h) / Math.max(1, h)) * half;
      // a little higher than its stage spot, so its roots clear the credit's words below it
      this.tmpP.set(place.x * k, (place.y + 0.25 * place.scale / 0.34) * k, -depth);
      this.camera.localToWorld(this.tmpP);
      this.molar.position.copy(this.tmpP);
      this.molar.scale.setScalar(place.scale * k);
    }
    // the pieces in flight
    for (let i = 0; i < CAMPAIGN_PIECES; i++) {
      const p = endingPiece(i, t, this.reducedMotion);
      let coin = this.flyingCoins[i];
      if (p.arrived || p.alpha <= 0) {
        if (coin) coin.visible = false;
        continue;
      }
      if (!coin) {
        coin = this.coinGroup(i, this.finishes[i] === 'empty' ? 'pearl' : this.finishes[i] ?? 'pearl');
        this.flyingCoins[i] = coin;
        this.flyingRoot.add(coin);
      }
      coin.visible = true;
      // Over the last part of the flight the coin eases into its socket's own place, turn and size
      // on the tilted 3D molar, so it is already exactly there when it clicks in.
      const flight = Math.max(0, Math.min(1, (t - (E.firstPiece + i * E.pieceGap)) / E.pieceFlight));
      const k = this.reducedMotion ? 1 : smooth01((flight - 0.55) / 0.45);
      const top = molarCuspTop(i);
      this.molar.updateMatrixWorld(true);
      this.tmpP.set(top[0], top[1], top[2] + 0.03);
      this.molar.localToWorld(this.tmpP);
      this.molar.getWorldQuaternion(this.tmpQ);
      const socketScale = GOLDEN_MOLAR.cuspRadius * 0.88 * this.molar.scale.x;
      const fly = stageWorld(p.x, p.y, 1);
      coin.position.set(fly[0], fly[1], fly[2]).lerp(this.tmpP, k);
      coin.quaternion.setFromEuler(this.tmpE.set(0, p.spin, 0)).slerp(this.tmpQ, k);
      coin.scale.setScalar(lerpN(GOLDEN_MOLAR.cuspRadius * place.scale * p.scale * STAGE.unit, socketScale, k));
      setOpacity(coin, p.alpha);
    }
    this.flyingRoot.visible = true;

    // the last scene: the golden fractal, the signs circling, fireworks
    if (t >= E.finaleStart) {
      const local = t - E.finaleStart;
      const grow = this.reducedMotion ? smooth01(local / 1.0) : smooth01(local / 1.6);
      const fade = 1 - smooth01((t - (E.end - 0.8)) / 0.8);
      this.bulb.visible = true;
      const u = this.bulbMat.uniforms;
      u.uCamPos.value.copy(this.camera.position);
      u.uCamRot.value.setFromMatrix4(this.camera.matrixWorld);
      u.uTanHalf.value = Math.tan(((this.camera.fov * Math.PI) / 180) / 2);
      u.uAspect.value = this.camera.aspect;
      // a golden fractal sun rising behind the molar
      const c = stageWorld(place.x, place.y + 0.15, -10);
      u.uCenter.value.set(c[0], c[1], c[2]);
      u.uRadius.value = this.reducedMotion ? 5.2 : 5.2 * (0.2 + 0.8 * grow);
      u.uTime.value = this.reducedMotion ? 0 : local;
      u.uAlpha.value = grow * fade;
      u.uPower.value = this.reducedMotion ? 8 : 6 + 2 * smooth01(local / 3);
      for (let i = 0; i < CAMPAIGN_PIECES; i++) {
        const o = endingEmblemOrbit(i, t, this.reducedMotion);
        const m = this.orbitEmblems[i];
        if (!m) continue;
        m.visible = o.alpha > 0.01;
        m.position.set(...stageWorld(o.x, o.y, 1.2));
        m.scale.setScalar(0.11 * STAGE.unit * o.alpha);
        m.rotation.y = this.reducedMotion ? 0 : local * 1.2 + i;
      }
      if (!this.reducedMotion) {
        ENDING_BURSTS.forEach((burst, b) => {
          const center = stageWorld(burst.x, burst.y, -2 + (b % 3));
          this.colA.setHex(burst.color);
          this.colB.setHex(burst.color2);
          const age = local - burst.t - 0.9;
          if (age >= 0 && age < 0.25) {
            const coreAlpha = 0.45 * smooth01(age / 0.025) * Math.exp(-age / 0.08);
            this.mixed.copy(this.colA).lerp(this.colB, 0.35);
            this.sparks.add(center[0], center[1], center[2], this.mixed, coreAlpha, 0.95 * (0.5 + smooth01(age / 0.12)));
          }
          for (const s of burstSparks3D(burst, b, local, 'fireworks', center, ENDING_BURST_SCALE * STAGE.unit * 0.5)) {
            this.mixed.copy(this.colA).lerp(this.colB, s.mix);
            this.streaks.add(s.x, s.y, s.z, s.px, s.py, s.pz, this.mixed, s.alpha, s.gen === 0 ? 0.09 : 0.065);
          }
        });
      }
      if (allGold && !this.reducedMotion && endingFace(t, allGold).alpha > 0) {
        // golden rain over everything as delicate shimmering streaks
        this.colA.setHex(0xfde047);
        for (let k = 0; k < 120; k++) {
          const a = t - E.face - 0.03 * k;
          if (a < 0) continue;
          const fall = (a * (0.9 + 0.7 * ((k * 37) % 11) / 11)) % 5;
          const x = (((k * 53) % 97) / 97 - 0.5) * 30;
          const y = 22 - fall * 4.4;
          const z = (((k * 29) % 41) / 41) * 12;
          this.streaks.add(x, y, z, x, y + 0.65, z, this.colA, 0.8, 0.06);
        }
      }
    }
    this.sparks.end();
    this.streaks.end();
    this.draw();
  }

  /**
   * Where the ending's face goes on screen (CSS pixels): the middle of the molar's front wall once it
   * has stood up, and how many pixels one molar unit spans there.
   */
  /** Where each city's bubble over the molar's pieces is on screen (CSS pixels), with its radius. */
  cuspBubblesOnScreen(w: number, h: number): { index: number; x: number; y: number; r: number }[] {
    if (!this.molar.visible) return [];
    this.molar.updateMatrixWorld(true);
    const out: { index: number; x: number; y: number; r: number }[] = [];
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const radiusLocal = GOLDEN_MOLAR.cuspRadius * CUSP_BUBBLE.radius;
    for (let i = 0; i < CAMPAIGN_PIECES; i++) {
      const c = this.molar.localToWorld(new THREE.Vector3(...cuspBubbleLocal(i)));
      // a bubble is round from every side: its screen radius is its world radius at that distance
      const worldRadius = radiusLocal * this.molar.scale.x;
      const p = c.clone().project(this.camera);
      if (p.z > 1) continue;
      const e = c.clone().addScaledVector(right, worldRadius).project(this.camera);
      const x = (p.x * 0.5 + 0.5) * w;
      const y = (-p.y * 0.5 + 0.5) * h;
      out.push({ index: i, x, y, r: Math.hypot((e.x * 0.5 + 0.5) * w - x, (-e.y * 0.5 + 0.5) * h - y) });
    }
    return out;
  }

  molarFaceOnScreen(w: number, h: number): { x: number; y: number; u: number } | null {
    if (!this.molar.visible) return null;
    this.molar.updateMatrixWorld(true);
    const o = GOLDEN_MOLAR.bodyCenter;
    const front = molarOutlineRadius(-Math.PI / 2) * 1.05;
    const local = new THREE.Vector3(o.x, o.y - front, -0.16);
    const c = this.molar.localToWorld(local.clone()).project(this.camera);
    const side = this.molar.localToWorld(local.clone().add(new THREE.Vector3(1, 0, 0))).project(this.camera);
    if (c.z > 1) return null;
    const x = (c.x * 0.5 + 0.5) * w;
    const y = (-c.y * 0.5 + 0.5) * h;
    const sx = (side.x * 0.5 + 0.5) * w;
    const sy = (-side.y * 0.5 + 0.5) * h;
    return { x, y, u: Math.hypot(sx - x, sy - y) };
  }

  /** Follows a Reduce Motion change mid-show: every frame reads it, so the next one fades instead. */
  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const r of this.reliefs.values()) r.dispose();
    for (const d of this.disposables) d.dispose();
    this.sparks.dispose();
    this.streaks.dispose();
    this.glow.dispose();
    this.beads.dispose();
    for (const f of this.fractals.values()) f.inst.dispose();
    this.mountain.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    // the wormhole's two rings of teeth hang straight off the scene, not under the mountain
    this.wormholePorcelain.dispose();
    this.wormholeGold.dispose();
    this.envTarget?.dispose();
    this.env?.dispose();
    this.renderer?.dispose();
    this.renderer = null;
  }
}

/** Fades every material in a group (the coins), going into the transparent pass only while fading. */
function setOpacity(group: THREE.Object3D, alpha: number): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      m.opacity = alpha;
      m.transparent = alpha < 0.999;
    }
  });
}

function lerpN(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
