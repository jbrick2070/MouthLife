import * as THREE from 'three';

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Keeps only what should glow. Coloured lights (rings, sparks, fluoride, gold) pass in full; plain
// white enamel passes at a fraction, so clean teeth get a soft sheen instead of a milky haze.
const BRIGHT_FRAG = /* glsl */ `
  uniform sampler2D tSource;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSource, vUv).rgb;
    float hi = max(c.r, max(c.g, c.b));
    float lo = min(c.r, min(c.g, c.b));
    float saturation = hi > 0.0001 ? (hi - lo) / hi : 0.0;
    float bright = smoothstep(uThreshold, 1.0, hi);
    gl_FragColor = vec4(c * bright * mix(0.22, 1.0, smoothstep(0.08, 0.5, saturation)), 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tSource;
  uniform vec2 uStep;
  varying vec2 vUv;
  void main() {
    vec3 sum = texture2D(tSource, vUv).rgb * 0.227027;
    sum += texture2D(tSource, vUv + uStep * 1.384615).rgb * 0.316216;
    sum += texture2D(tSource, vUv - uStep * 1.384615).rgb * 0.316216;
    sum += texture2D(tSource, vUv + uStep * 3.230769).rgb * 0.070270;
    sum += texture2D(tSource, vUv - uStep * 3.230769).rgb * 0.070270;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D tSource;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(texture2D(tSource, vUv).rgb * uStrength, 1.0);
  }
`;

/**
 * A light glow ("bloom") around bright, colourful things. The scene is drawn a second time at low
 * resolution, the bright parts are blurred, and the result is added over the finished frame, so the
 * normal picture is never altered, only lit a little around its highlights.
 */
export class GlowPass {
  private sceneTarget: THREE.WebGLRenderTarget | null = null;
  private blurA: THREE.WebGLRenderTarget | null = null;
  private blurB: THREE.WebGLRenderTarget | null = null;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly brightMat: THREE.ShaderMaterial;
  private readonly blurMat: THREE.ShaderMaterial;
  private readonly compositeMat: THREE.ShaderMaterial;
  private readonly size = new THREE.Vector2();
  private prepared = false;

  /** 0 turns the glow off. */
  strength = 0.55;

  constructor() {
    const common = { vertexShader: QUAD_VERT, depthTest: false, depthWrite: false };
    this.brightMat = new THREE.ShaderMaterial({
      ...common,
      fragmentShader: BRIGHT_FRAG,
      uniforms: { tSource: { value: null }, uThreshold: { value: 0.62 } },
    });
    this.blurMat = new THREE.ShaderMaterial({
      ...common,
      fragmentShader: BLUR_FRAG,
      uniforms: { tSource: { value: null }, uStep: { value: new THREE.Vector2() } },
    });
    this.compositeMat = new THREE.ShaderMaterial({
      ...common,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: { tSource: { value: null }, uStrength: { value: this.strength } },
      // Add colour only. The canvas is see-through over a CSS backdrop, so alpha must stay untouched.
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      transparent: true,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.brightMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /** Glow buffer size for a given drawing-buffer size: a quarter each way, 480 px wide at most. */
  static bufferSize(drawW: number, drawH: number): { w: number; h: number } {
    const scale = Math.min(0.25, 480 / Math.max(1, drawW));
    return { w: Math.max(32, Math.round(drawW * scale)), h: Math.max(32, Math.round(drawH * scale)) };
  }

  private ensureTargets(renderer: THREE.WebGLRenderer): void {
    renderer.getDrawingBufferSize(this.size);
    const { w, h } = GlowPass.bufferSize(this.size.x, this.size.y);
    if (this.sceneTarget && this.sceneTarget.width === w && this.sceneTarget.height === h) return;
    this.disposeTargets();
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
    this.sceneTarget = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: true });
    this.blurA = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: false });
    this.blurB = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: false });
  }

  private pass(
    renderer: THREE.WebGLRenderer,
    material: THREE.ShaderMaterial,
    source: THREE.Texture,
    target: THREE.WebGLRenderTarget | null
  ): void {
    material.uniforms.tSource.value = source;
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.quadScene, this.quadCamera);
  }

  /** Call before the main render: draws the low-resolution glow buffer. */
  prepare(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    this.prepared = false;
    if (this.strength <= 0) return;
    this.ensureTargets(renderer);
    const sceneTarget = this.sceneTarget!;
    const blurA = this.blurA!;
    const blurB = this.blurB!;

    renderer.setRenderTarget(sceneTarget);
    renderer.clear();
    renderer.render(scene, camera);

    this.pass(renderer, this.brightMat, sceneTarget.texture, blurA);
    const step = this.blurMat.uniforms.uStep.value as THREE.Vector2;
    for (let i = 0; i < 2; i++) {
      const spread = 1 + i * 1.6;
      step.set(spread / blurA.width, 0);
      this.pass(renderer, this.blurMat, blurA.texture, blurB);
      step.set(0, spread / blurA.height);
      this.pass(renderer, this.blurMat, blurB.texture, blurA);
    }
    renderer.setRenderTarget(null);
    this.prepared = true;
  }

  /** Call after the main render: adds the glow on top of the finished frame. */
  composite(renderer: THREE.WebGLRenderer): void {
    if (!this.prepared || !this.blurA) return;
    this.compositeMat.uniforms.uStrength.value = this.strength;
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    this.pass(renderer, this.compositeMat, this.blurA.texture, null);
    renderer.autoClear = prevAutoClear;
    this.prepared = false;
  }

  private disposeTargets(): void {
    this.sceneTarget?.dispose();
    this.blurA?.dispose();
    this.blurB?.dispose();
    this.sceneTarget = this.blurA = this.blurB = null;
  }

  dispose(): void {
    this.disposeTargets();
    this.quad.geometry.dispose();
    this.brightMat.dispose();
    this.blurMat.dispose();
    this.compositeMat.dispose();
  }
}
