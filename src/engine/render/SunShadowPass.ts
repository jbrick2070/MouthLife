import * as THREE from 'three';
import { DIVE_KEY_DIRECTION as SUN_DIRECTION } from './OralLighting';

/** Objects on this layer are drawn into the shadow map, so they cast a shadow. */
const CASTER_LAYER = 5;
/** Set `userData[NO_SUN_SHADOW] = true` on an object to keep it and its children from casting. */
export const NO_SUN_SHADOW = 'noSunShadow';
/**
 * A mesh whose vertex shader moves its parts (the ship's spinning rings) sets
 * `userData[SUN_DEPTH_MATERIAL]` to a depth-only material that moves them the same way, so its
 * shadow matches what is seen. Everything else is drawn with one shared depth material.
 */
export const SUN_DEPTH_MATERIAL = 'sunDepthMaterial';

const SUN_DISTANCE = 42;
const SUN_DEPTH_RANGE = 78;

/** The settings every depth-only shadow material shares (see SUN_DEPTH_MATERIAL). */
export const SUN_DEPTH_MATERIAL_OPTIONS = {
  colorWrite: false,
  side: THREE.DoubleSide,
  // Pushes the stored depth slightly away from the sun so lit faces do not shadow themselves.
  polygonOffset: true,
  polygonOffsetFactor: 2,
  polygonOffsetUnits: 4,
} as const;

/**
 * Real shadows for a dive. The scene's solid objects are drawn once more, depth only, as the sun
 * sees them; the enamel and gum shaders then ask that picture whether the sun reaches each point
 * (see `sunVisibility` in OralLighting.ts). One extra low-cost pass, no extra colour work.
 */
export class SunShadowPass {
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, SUN_DEPTH_RANGE);
  private readonly depthMat = new THREE.MeshBasicMaterial(SUN_DEPTH_MATERIAL_OPTIONS);
  private readonly snapped = new THREE.Vector3();
  /** The sun never turns, so its view's rotation and the inverse are worked out once. */
  private readonly toSunView = new THREE.Quaternion();
  private readonly casters: THREE.Mesh[] = [];
  private readonly ownMaterials: Array<THREE.Material | THREE.Material[]> = [];
  private readonly toUv = new THREE.Matrix4().set(
    0.5, 0, 0, 0.5,
    0, 0.5, 0, 0.5,
    0, 0, 0.5, 0.5,
    0, 0, 0, 1
  );

  /** World position → (u, v, depth) in the shadow map. */
  readonly matrix = new THREE.Matrix4();
  /** x: how dark a shadow is (0 = off), y: one texel in uv, z: tap spread in texels, w: depth bias. */
  readonly params = new THREE.Vector4(0, 0, 0, 0);

  constructor() {
    this.camera.layers.set(CASTER_LAYER);
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(SUN_DIRECTION).multiplyScalar(SUN_DISTANCE);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    this.toSunView.copy(this.camera.quaternion).invert();
  }

  get texture(): THREE.DepthTexture | null {
    return this.target?.depthTexture ?? null;
  }

  /** Turns the shadows off (the shaders skip the lookup). */
  disable(): void {
    this.params.x = 0;
  }

  private ensureTarget(size: number): THREE.WebGLRenderTarget {
    if (this.target && this.target.width === size) return this.target;
    this.disposeTarget();
    const depth = new THREE.DepthTexture(size, size);
    // The GPU compares and smooths four neighbouring texels per lookup.
    depth.compareFunction = THREE.LessEqualCompare;
    depth.minFilter = THREE.LinearFilter;
    depth.magFilter = THREE.LinearFilter;
    this.target = new THREE.WebGLRenderTarget(size, size, {
      format: THREE.RedFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      depthTexture: depth,
    });
    return this.target;
  }

  /** Solid things cast; glows, rings of light, particles and see-through parts do not. */
  private tagCasters(node: THREE.Object3D): void {
    if (!node.visible || node.userData[NO_SUN_SHADOW] === true) return;
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) {
      const m = mesh.material;
      const solid = !Array.isArray(m) && m.visible && !m.transparent && m.depthWrite && m.colorWrite;
      if (solid) {
        mesh.layers.enable(CASTER_LAYER);
        this.casters.push(mesh);
      } else {
        mesh.layers.disable(CASTER_LAYER);
      }
    }
    for (const child of node.children) this.tagCasters(child);
  }

  /**
   * Draws the shadow map for the ground around `focus`.
   * @param halfExtent half the width of the square of ground covered, in world units
   * @param size shadow map width in texels
   */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    focus: THREE.Vector3,
    halfExtent: number,
    size: number,
    darkness: number,
    spreadTexels: number
  ): void {
    const target = this.ensureTarget(size);
    const cam = this.camera;

    // Move the sun's view in whole texels only, so shadow edges do not shimmer as the camera glides.
    const texelWorld = (halfExtent * 2) / size;
    this.snapped.copy(focus).applyQuaternion(this.toSunView);
    this.snapped.x = Math.round(this.snapped.x / texelWorld) * texelWorld;
    this.snapped.y = Math.round(this.snapped.y / texelWorld) * texelWorld;
    this.snapped.applyQuaternion(cam.quaternion);
    cam.position.copy(SUN_DIRECTION).multiplyScalar(SUN_DISTANCE).add(this.snapped);
    cam.left = -halfExtent;
    cam.right = halfExtent;
    cam.top = halfExtent;
    cam.bottom = -halfExtent;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    this.casters.length = 0;
    this.ownMaterials.length = 0;
    this.tagCasters(scene);

    // Each caster wears a depth-only material for this one draw, then gets its own back.
    for (const mesh of this.casters) {
      this.ownMaterials.push(mesh.material);
      mesh.material = (mesh.userData[SUN_DEPTH_MATERIAL] as THREE.Material | undefined) ?? this.depthMat;
    }
    const prevTarget = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, cam);
    } finally {
      this.casters.forEach((mesh, i) => (mesh.material = this.ownMaterials[i]));
      renderer.setRenderTarget(prevTarget);
    }

    this.matrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).premultiply(this.toUv);
    this.params.set(darkness, 1 / size, spreadTexels, 0.06 / (SUN_DEPTH_RANGE - 1));
  }

  private disposeTarget(): void {
    this.target?.depthTexture?.dispose();
    this.target?.dispose();
    this.target = null;
  }

  dispose(): void {
    this.disposeTarget();
    this.depthMat.dispose();
  }
}
