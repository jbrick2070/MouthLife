import * as THREE from 'three';
import type { CompanionToothFrame } from './CartridgeMeshBuilder';

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

// Soft wrap lighting plus a rim, written in the same display-space style as the tooth shaders.
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
    float wrap = max(0.0, (dot(N, L) + 0.5) / 1.5);
    float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
    float spec = pow(max(dot(N, normalize(L + V)), 0.0), 40.0);
    vec3 col = uColor * (0.36 + 0.74 * wrap) + vec3(0.85, 0.97, 1.0) * (spec * 0.45 + rim * 0.22);
    gl_FragColor = vec4(col + uColor * uGlow, 1.0);
  }
`;

function propMaterial(hex: number, glow = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: PROP_VERT,
    fragmentShader: PROP_FRAG,
    uniforms: { uColor: { value: new THREE.Color(hex) }, uGlow: { value: glow } },
    // The upper arch is drawn through a mirror matrix, which flips triangle winding.
    side: THREE.DoubleSide,
  });
}

/**
 * Indices into the lower-arch tooth list for one quadrant. Tooth 0 is on screen-left (the patient's
 * left in the mirror view) and tooth 13 on screen-right. The upper arch reuses the same list through
 * the mirror matrix, so only left/right matters here.
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
 * The guided 3D toothbrush and floss pick shown during Brush-Along, so players can copy the
 * motion: where the brush goes, how it tilts for each surface, and how floss hugs each tooth.
 */
export class PacerPropRig {
  /** Add to the scene. Its matrix is set every frame (identity, or the upper-arch mirror). */
  readonly group = new THREE.Group();
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
  private clockSec = 0;

  constructor() {
    this.group.matrixAutoUpdate = false;
    this.group.visible = false;

    const add = (parent: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial): THREE.Mesh => {
      this.geometries.push(geo);
      if (!this.materials.includes(mat)) this.materials.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      parent.add(mesh);
      return mesh;
    };

    // Toothbrush. Local axes: bristles point down (-Y), the handle runs along +Z.
    const handleMat = propMaterial(0x22d3ee);
    const gripMat = propMaterial(0xf8fafc);
    const bristleMat = propMaterial(0xe0f2fe, 0.12);
    add(this.brush, new THREE.BoxGeometry(0.62, 0.2, 1.5), gripMat).position.set(0, 0.36, 0);
    add(this.brush, new THREE.CylinderGeometry(0.13, 0.17, 1.5, 12), handleMat)
      .rotateX(Math.PI / 2)
      .position.set(0, 0.36, 1.45);
    add(this.brush, new THREE.CapsuleGeometry(0.24, 3.6, 6, 14), handleMat)
      .rotateX(Math.PI / 2)
      .position.set(0, 0.36, 4.1);
    // Three rows of bristle tufts read better than one block.
    for (let row = -1; row <= 1; row++) {
      add(this.brush, new THREE.BoxGeometry(0.15, 0.42, 1.3), bristleMat).position.set(row * 0.19, 0.06, 0);
    }
    // Drawn larger than life so the motion reads from across a bathroom.
    this.brush.scale.setScalar(1.55);
    this.group.add(this.brush);

    // Floss pick: a Y-shaped bow holding a short strand. Local X is the strand.
    const bowMat = propMaterial(0x34d399);
    const strandMat = propMaterial(0xfef9c3, 0.5);
    add(this.floss, new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), strandMat).rotateZ(Math.PI / 2);
    add(this.floss, new THREE.BoxGeometry(0.12, 0.7, 0.12), bowMat).position.set(-0.75, 0.33, 0);
    add(this.floss, new THREE.BoxGeometry(0.12, 0.7, 0.12), bowMat).position.set(0.75, 0.33, 0);
    add(this.floss, new THREE.BoxGeometry(1.62, 0.12, 0.12), bowMat).position.set(0, 0.68, 0);
    add(this.floss, new THREE.CapsuleGeometry(0.11, 2.4, 4, 10), bowMat).position.set(0, 2.0, 0);
    this.floss.scale.setScalar(1.35);
    this.group.add(this.floss);
  }

  /**
   * @param teeth lower-arch tooth frames (world space)
   * @param mirror reflection that maps the lower arch onto the upper arch this frame
   */
  update(
    dt: number,
    state: PacerVisualState | null,
    teeth: readonly CompanionToothFrame[],
    mirror: THREE.Matrix4
  ): void {
    if (!state || state.stage === 'mouthwashBonus' || teeth.length < 14) {
      this.group.visible = false;
      return;
    }
    if (!state.paused) this.clockSec += dt;
    this.group.visible = true;

    const brushing = state.stage === 'brushing';
    this.brush.visible = brushing;
    this.floss.visible = !brushing;
    const upper = brushing ? state.quadrant <= 1 : state.flossIsUpper;
    if (upper) this.group.matrix.copy(mirror);
    else this.group.matrix.identity();
    this.group.matrixWorldNeedsUpdate = true;

    if (brushing) this.poseBrush(state, teeth);
    else this.poseFloss(state, teeth);
  }

  private frameAt(teeth: readonly CompanionToothFrame[], index: number): CompanionToothFrame {
    return teeth[Math.max(0, Math.min(teeth.length - 1, index))];
  }

  private setAxes(tooth: CompanionToothFrame): void {
    // yaw maps local X to the arch tangent and local +Z to the outward (lip/cheek) normal.
    this.tangent.set(Math.cos(tooth.yaw), 0, -Math.sin(tooth.yaw));
    this.outward.set(Math.sin(tooth.yaw), 0, Math.cos(tooth.yaw));
  }

  private poseBrush(state: PacerVisualState, teeth: readonly CompanionToothFrame[]): void {
    const { from, to } = quadrantToothRange(state.quadrant);
    // Glide tooth to tooth across the quadrant and back, about 4 seconds each way.
    const along = from + sweep01(this.clockSec, 8) * (to - from);
    const i0 = Math.floor(along);
    const f = along - i0;
    const a = this.frameAt(teeth, i0);
    const b = this.frameAt(teeth, Math.min(to, i0 + 1));
    this.setAxes(f < 0.5 ? a : b);
    this.pos.copy(a.center).lerp(b.center, f);
    const halfD = a.halfD + (b.halfD - a.halfD) * f;
    const halfH = a.halfH + (b.halfH - a.halfH) * f;

    // Small quick strokes: side to side on the tops, a gentle jiggle at the gumline.
    const stroke = Math.sin(this.clockSec * 11) * (state.surface === 1 ? 0.2 : 0.11);

    if (state.surface === 1) {
      // Chewing tops: bristles straight down onto the grooves.
      this.pos.y += halfH + 0.2;
      this.bristleDir.set(0, -1, 0);
    } else {
      const sideSign = state.surface === 0 ? 1 : -1; // outside, or inside (tongue side)
      this.pos.addScaledVector(this.outward, sideSign * (halfD + 0.3));
      this.pos.y -= halfH * 0.35;
      // 45 degrees: half toward the tooth, half toward the gumline.
      this.bristleDir.copy(this.outward).multiplyScalar(-sideSign).add(this.tmpA.set(0, -1, 0)).normalize();
    }
    this.pos.addScaledVector(this.tangent, stroke);

    // The handle leaves the mouth toward the viewer, kept square to the bristles.
    this.handleDir.set(0, 0.25, 1);
    if (state.surface === 2) this.handleDir.set(0, 0.9, 0.45); // behind the teeth: brush held upright
    this.handleDir.addScaledVector(this.bristleDir, -this.handleDir.dot(this.bristleDir)).normalize();
    this.side.crossVectors(this.tmpB.copy(this.bristleDir).negate(), this.handleDir).normalize();
    this.basis.makeBasis(this.side, this.tmpB, this.handleDir);
    this.brush.quaternion.setFromRotationMatrix(this.basis);
    this.brush.position.copy(this.pos);
  }

  private poseFloss(state: PacerVisualState, teeth: readonly CompanionToothFrame[]): void {
    const pair = flossContactTeeth(state.flossContactIndex);
    const a = this.frameAt(teeth, pair.a);
    const b = this.frameAt(teeth, pair.b);
    this.setAxes(a);
    this.pos.copy(a.center).lerp(b.center, 0.5);

    // Slide in with a gentle saw, then lean on one tooth and the other (the C-shape hug).
    const lean = state.flossStepIndex === 1 ? -0.16 : state.flossStepIndex === 2 ? 0.16 : 0;
    const saw = state.flossStepIndex === 0 ? Math.sin(this.clockSec * 9) * 0.22 : Math.sin(this.clockSec * 5) * 0.06;
    const dip = state.flossStepIndex === 0 ? 0.25 : -0.15 + Math.sin(this.clockSec * 4) * 0.12;
    this.pos.addScaledVector(this.tangent, lean);
    this.pos.addScaledVector(this.outward, saw);
    this.pos.y += dip;

    // The strand (local X) lies across the gap, front to back; the handle (local Y) points up and out.
    this.side.copy(this.outward);
    this.tmpB.set(0, 1, 0).addScaledVector(this.outward, 0.35).normalize();
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
