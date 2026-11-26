import * as THREE from 'three';
import {
  COMPANION_ARCH_ORIGIN,
  COMPANION_UPPER_MIRROR_Y,
  type CompanionToothFrame,
} from './CartridgeMeshBuilder';

/** What the Brush-Along timeline is doing right now (a slice of BrushPhaseState). */
export interface PacerVisualState {
  stage: 'brushing' | 'flossBonus' | 'mouthwashBonus';
  /** 0 upper-right, 1 upper-left, 2 lower-left, 3 lower-right (patient's sides). */
  quadrant: number;
  /** 0 outside, 1 chewing tops, 2 inside. */
  surface: number;
  flossIsUpper: boolean;
  /** 0..12, counted from the patient's right. */
  flossContactIndex: number;
  /** 0 slide in, 1 lean on one side, 2 lean on the other. */
  flossStepIndex: number;
  mouthwashProgress01: number;
  paused: boolean;
  /** Seconds elapsed in the current surface/arch phase (drives tooth-by-tooth sync & zoom-in). */
  phaseElapsedSec?: number;
  /** Duration of the current surface/arch phase in seconds. */
  phaseDurationSec?: number;
  /** Reduce Motion preference: quiets micro-scrub vibration while keeping tooth progression clear. */
  reducedMotion?: boolean;
}

const PROP_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Soft wrap lighting plus underside bounce & rim so the brush/floss read crisply from above or below.
const PROP_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uGlow;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 N = normalize(vNormalW);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 L = normalize(vec3(0.36, 0.86, 0.35));
    vec3 L2 = normalize(vec3(0.18, -0.78, 0.60));
    float wrap = max(0.0, (dot(N, L) + 0.5) / 1.5);
    float bounce = max(0.0, (dot(N, L2) + 0.4) / 1.4) * 0.42;
    float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
    float spec = pow(max(dot(N, normalize(L + V)), 0.0), 40.0)
               + pow(max(dot(N, normalize(L2 + V)), 0.0), 40.0) * 0.35;
    vec3 col = uColor * (0.36 + 0.68 * wrap + bounce * 0.5) + vec3(0.85, 0.97, 1.0) * (spec * 0.42 + rim * 0.22);
    gl_FragColor = vec4(col + uColor * uGlow, 1.0);
  }
`;

function propMaterial(hex: number, glow = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: PROP_VERT,
    fragmentShader: PROP_FRAG,
    uniforms: { uColor: { value: new THREE.Color(hex) }, uGlow: { value: glow } },
    side: THREE.DoubleSide,
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Indices into the lower-arch tooth list for one quadrant. Tooth 0 is on screen-left (the patient's
 * left in the mirror view) and tooth 13 on screen-right.
 */
export function quadrantToothRange(quadrant: number): { from: number; to: number } {
  const patientRight = quadrant === 0 || quadrant === 3;
  return patientRight ? { from: 7, to: 13 } : { from: 0, to: 6 };
}

/** Lower-arch tooth pair (j, j+1) for a floss contact counted from the patient's right. */
export function flossContactTeeth(contactIndex: number): { a: number; b: number } {
  const j = 12 - Math.max(0, Math.min(12, Math.round(contactIndex)));
  return { a: j, b: j + 1 };
}

/** Smooth back-and-forth 0..1..0 sweep. */
export function sweep01(timeSec: number, periodSec: number): number {
  const t = ((timeSec % periodSec) + periodSec) % periodSec;
  const tri = t < periodSec / 2 ? t / (periodSec / 2) : 2 - t / (periodSec / 2);
  return tri * tri * (3 - 2 * tri);
}

/**
 * The guided 3D toothbrush and floss pick shown during Brush-Along, posed directly in true 3D
 * world space on either the lower mandibular arch or the inverted upper maxillary arch so the
 * player can follow tooth-by-tooth motion, 45° gumline tilt, vertical front-incisor heel-to-toe
 * handle rotation, and C-shape flossing.
 */
export class PacerPropRig {
  readonly group = new THREE.Group();
  /** Live world-space brush/floss contact point (used by SceneManager's close-up camera focus). */
  readonly contactWorldPos = new THREE.Vector3(COMPANION_ARCH_ORIGIN.x, COMPANION_ARCH_ORIGIN.y + 1.5, COMPANION_ARCH_ORIGIN.z);
  /** True when contactWorldPos holds an active brushing or flossing point this frame. */
  hasContact = false;
  /** Outward lip/cheek normal XZ at the active contact point (for floss oblique framing). */
  activeOutwardX = 0;
  activeOutwardZ = 1;

  private readonly brush = new THREE.Group();
  private readonly floss = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.ShaderMaterial[] = [];

  private readonly pos = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly outward = new THREE.Vector3();
  private readonly bristleDir = new THREE.Vector3();
  private readonly handleDir = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpPosB = new THREE.Vector3();
  private clockSec = 0;

  constructor() {
    this.group.visible = false;

    const add = (parent: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial): THREE.Mesh => {
      this.geometries.push(geo);
      if (!this.materials.includes(mat)) this.materials.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      parent.add(mesh);
      return mesh;
    };

    // Toothbrush. Local axes: bristles point down (-Y), handle extends along +Z.
    const handleMat = propMaterial(0x22d3ee);
    const gripMat = propMaterial(0xf8fafc);
    const bristleMat = propMaterial(0xe0f2fe, 0.14);
    add(this.brush, new THREE.BoxGeometry(0.62, 0.2, 1.5), gripMat).position.set(0, 0.36, 0);
    add(this.brush, new THREE.CylinderGeometry(0.13, 0.17, 1.5, 12), handleMat)
      .rotateX(Math.PI / 2)
      .position.set(0, 0.36, 1.45);
    add(this.brush, new THREE.CapsuleGeometry(0.24, 3.6, 6, 14), handleMat)
      .rotateX(Math.PI / 2)
      .position.set(0, 0.36, 4.1);
    // Three rows of bristle tufts read cleanly up close.
    for (let row = -1; row <= 1; row++) {
      add(this.brush, new THREE.BoxGeometry(0.15, 0.42, 1.3), bristleMat).position.set(row * 0.19, 0.06, 0);
    }
    this.brush.scale.setScalar(1.3);
    this.group.add(this.brush);

    // Floss pick: a Y-shaped bow holding a short taut strand. Local X is the strand, +Y rises out of the gap.
    const bowMat = propMaterial(0x34d399);
    const strandMat = propMaterial(0xfef9c3, 0.55);
    add(this.floss, new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), strandMat).rotateZ(Math.PI / 2);
    add(this.floss, new THREE.BoxGeometry(0.12, 0.7, 0.12), bowMat).position.set(-0.75, 0.33, 0);
    add(this.floss, new THREE.BoxGeometry(0.12, 0.7, 0.12), bowMat).position.set(0.75, 0.33, 0);
    add(this.floss, new THREE.BoxGeometry(1.62, 0.12, 0.12), bowMat).position.set(0, 0.68, 0);
    add(this.floss, new THREE.CapsuleGeometry(0.11, 2.4, 4, 10), bowMat).position.set(0, 2.0, 0);
    this.floss.scale.setScalar(1.22);
    this.group.add(this.floss);
  }

  /**
   * Updates brush/floss pose and publishes `contactWorldPos` for the live close-up camera.
   * @param teeth lower-arch tooth frames (world space at base COMPANION_ARCH_ORIGIN)
   */
  update(
    dt: number,
    state: PacerVisualState | null,
    teeth: readonly CompanionToothFrame[]
  ): void {
    if (!state || state.stage === 'mouthwashBonus' || teeth.length < 14) {
      this.group.visible = false;
      this.hasContact = false;
      return;
    }
    if (!state.paused) this.clockSec += dt;
    this.group.visible = true;

    const brushing = state.stage === 'brushing';
    this.brush.visible = brushing;
    this.floss.visible = !brushing;

    if (brushing) this.poseBrush(state, teeth);
    else this.poseFloss(state, teeth);
    this.hasContact = true;
  }

  private frameAt(teeth: readonly CompanionToothFrame[], index: number): CompanionToothFrame {
    return teeth[Math.max(0, Math.min(teeth.length - 1, index))];
  }

  /** World position of a tooth crown on either the lower arch or the vertically inverted upper arch. */
  private crownWorldPos(tooth: CompanionToothFrame, isUpper: boolean, out: THREE.Vector3): THREE.Vector3 {
    if (!isUpper) return out.copy(tooth.center);
    // Arch local Y = tooth.center.y - originY; upper local Y = upperMirrorY - localY.
    const upperWorldY = 2 * COMPANION_ARCH_ORIGIN.y + COMPANION_UPPER_MIRROR_Y - tooth.center.y;
    return out.set(tooth.center.x, upperWorldY, tooth.center.z);
  }

  private setInterpolatedAxes(a: CompanionToothFrame, b: CompanionToothFrame, f: number): void {
    const ox = Math.sin(a.yaw) * (1 - f) + Math.sin(b.yaw) * f;
    const oz = Math.cos(a.yaw) * (1 - f) + Math.cos(b.yaw) * f;
    const len = Math.hypot(ox, oz) || 1;
    this.outward.set(ox / len, 0, oz / len);
    // Arch tangent perpendicular to outward in XZ.
    this.tangent.set(this.outward.z, 0, -this.outward.x);
    this.activeOutwardX = this.outward.x;
    this.activeOutwardZ = this.outward.z;
  }

  private poseBrush(state: PacerVisualState, teeth: readonly CompanionToothFrame[]): void {
    const isUpper = state.quadrant <= 1;
    const isRightSide = state.quadrant === 0 || state.quadrant === 3;
    const gumSign = isUpper ? 1 : -1;
    const rm = Boolean(state.reducedMotion);

    // Mirror-matched tooth-by-tooth sweep matching native ProceduralMeshBuilder:
    //   - Patient Right (Q1, Q4) = Screen-Right (+X, crowns 13 -> 7: back molar -> front incisor)
    //   - Patient Left  (Q2, Q3) = Screen-Left  (-X, crowns 0 -> 6: back molar -> front incisor)
    //   - Chewing tops (surface 1) reverses front -> back for a natural continuous loop!
    let crownProgress: number;
    if (state.phaseElapsedSec !== undefined) {
      const dur = Math.max(1, state.phaseDurationSec ?? 10);
      const sFrac = clamp(state.phaseElapsedSec / dur, 0, 0.999);
      const u = state.surface === 1 ? 1 - sFrac : sFrac;
      crownProgress = isRightSide ? 13 - u * 6 : u * 6;
    } else {
      const { from, to } = quadrantToothRange(state.quadrant);
      crownProgress = from + sweep01(this.clockSec, 8) * (to - from);
    }

    const distFromBack = isRightSide ? 13 - crownProgress : crownProgress;
    const i0 = clamp(Math.floor(crownProgress), 0, 13);
    const i1 = Math.min(13, i0 + 1);
    const f = crownProgress - i0;
    const a = this.frameAt(teeth, i0);
    const b = this.frameAt(teeth, i1);

    this.setInterpolatedAxes(a, b, f);
    this.crownWorldPos(a, isUpper, this.pos);
    this.crownWorldPos(b, isUpper, this.tmpPosB);
    this.pos.lerp(this.tmpPosB, f);
    const halfD = a.halfD + (b.halfD - a.halfD) * f;
    const halfH = a.halfH + (b.halfH - a.halfH) * f;

    const microSweep = rm ? 0 : Math.sin(this.clockSec * 9.0) * 0.24;
    const microVert = rm ? 0 : Math.cos(this.clockSec * 9.0) * 0.07;

    if (state.surface === 0) {
      // OUTER: 45° Bass angle tucked gently into the gingival collar.
      this.pos.addScaledVector(this.outward, halfD * 1.02 + 0.14);
      this.pos.y += gumSign * (halfH * 0.36) + microVert;
      this.pos.addScaledVector(this.tangent, microSweep);
      this.bristleDir
        .copy(this.outward)
        .multiplyScalar(-1)
        .add(this.tmpA.set(0, gumSign * 0.84, 0))
        .normalize();
      this.handleDir.set(this.outward.x * 0.24, -gumSign * 0.12, 1.0).normalize();
    } else if (state.surface === 1) {
      // CHEWING: bristles flat onto occlusal cusps & grooves.
      this.pos.y += -gumSign * (halfH * 1.04 + 0.12);
      this.pos.addScaledVector(this.tangent, microSweep * 1.3);
      this.bristleDir.set(-this.outward.x * 0.12, gumSign, -0.08).normalize();
      this.handleDir.set(this.outward.x * 0.15, -gumSign * 0.06, 1.0).normalize();
    } else {
      // INNER: 45° inside collar on molars -> rotates vertically heel-to-toe behind front teeth!
      const frontBlend = smoothstep(2.8, 4.5, distFromBack);
      this.pos.addScaledVector(this.outward, -(halfD * 1.0 + 0.14));
      this.pos.y += gumSign * (halfH * 0.28) + microVert;
      this.pos.addScaledVector(this.tangent, microSweep * (1 - 0.5 * frontBlend));
      this.bristleDir
        .copy(this.outward)
        .add(this.tmpA.set(0, gumSign * (0.76 - 0.22 * frontBlend), 0))
        .normalize();
      // Smoothly blend molar horizontal handle into upright vertical heel-to-toe behind incisors!
      this.tmpA.set(-this.outward.x * 0.2, -gumSign * 0.18, 1.0).normalize();
      this.tmpB.set(0, -gumSign * 0.88, 0.48).normalize();
      this.handleDir.lerpVectors(this.tmpA, this.tmpB, frontBlend).normalize();
    }

    // Publish exact contact point on the enamel before offsetting back by bristle length.
    this.contactWorldPos.copy(this.pos);

    // Orthonormal right-handed basis: local -Y = bristleDir, local +Z = handleDir.
    this.handleDir.addScaledVector(this.bristleDir, -this.handleDir.dot(this.bristleDir));
    if (this.handleDir.lengthSq() < 1e-5) {
      this.handleDir.set(0, 0, 1).addScaledVector(this.bristleDir, -this.bristleDir.z);
    }
    this.handleDir.normalize();
    this.tmpB.copy(this.bristleDir).negate(); // local +Y (back of brush head)
    this.side.crossVectors(this.tmpB, this.handleDir).normalize();
    this.handleDir.crossVectors(this.side, this.tmpB).normalize();
    this.basis.makeBasis(this.side, this.tmpB, this.handleDir);
    this.brush.quaternion.setFromRotationMatrix(this.basis);
    // Offset slightly away from enamel along +Y so bristle tips cleanly kiss the surface.
    this.brush.position.copy(this.pos).addScaledVector(this.tmpB, 0.2);
  }

  private poseFloss(state: PacerVisualState, teeth: readonly CompanionToothFrame[]): void {
    const isUpper = state.flossIsUpper;
    const gumSign = isUpper ? 1 : -1;
    const rm = Boolean(state.reducedMotion);
    const pair = flossContactTeeth(state.flossContactIndex);
    const a = this.frameAt(teeth, pair.a);
    const b = this.frameAt(teeth, pair.b);

    this.setInterpolatedAxes(a, b, 0.5);
    this.crownWorldPos(a, isUpper, this.pos);
    this.crownWorldPos(b, isUpper, this.tmpPosB);
    this.pos.lerp(this.tmpPosB, 0.5);
    const halfH = (a.halfH + b.halfH) * 0.5;

    // Gentle saw into the tight contact, then C-shape lean onto one wall and the other.
    const lean = state.flossStepIndex === 1 ? -0.16 : state.flossStepIndex === 2 ? 0.16 : 0;
    const saw = rm
      ? 0
      : state.flossStepIndex === 0
        ? Math.sin(this.clockSec * 9) * 0.2
        : Math.sin(this.clockSec * 5) * 0.06;
    const depthIntoGap =
      state.flossStepIndex === 0
        ? -halfH * 0.35
        : halfH * 0.16 + (rm ? 0 : Math.sin(this.clockSec * 4) * 0.12);

    this.pos.addScaledVector(this.tangent, lean);
    this.pos.addScaledVector(this.outward, saw);
    this.pos.y += gumSign * depthIntoGap;
    this.contactWorldPos.copy(this.pos);

    // Strand (local +X) lies across the gap labio-lingually; bow/handle (local +Y) rises away from gum.
    this.side.copy(this.outward);
    this.tmpB.set(0, -gumSign, 0).addScaledVector(this.outward, 0.32).normalize();
    this.tmpB.addScaledVector(this.side, -this.tmpB.dot(this.side)).normalize();
    this.handleDir.crossVectors(this.side, this.tmpB).normalize();
    this.basis.makeBasis(this.side, this.tmpB, this.handleDir);
    this.floss.quaternion.setFromRotationMatrix(this.basis);
    this.floss.rotateZ(lean * 1.4);
    this.floss.position.copy(this.pos);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
