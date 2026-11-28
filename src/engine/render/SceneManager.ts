/// <reference types="vite/client" />

import { sideLayoutFraming } from '../../ui/hudHelpers';
import * as THREE from 'three';
import {
  CAMERA_BASE_FOV_DEG,
  CAMERA_FAR,
  CAMERA_NEAR,
  DISCLOSE_DURATION_SEC,
  DISCLOSE_WAVE_RADIUS,
  EARTH_BACKDROP_POS,
  EARTH_BACKDROP_RADIUS,
  QUALITY_TIER_SPECS,
  RINSE_WAVE_DURATION_SEC,
  RINSE_WAVE_RADIUS,
  ZOOM_TRANSITION_SEC,
} from '../../config/gameConfig';
import { HOST_CITIES } from '../../config/hostsAndHistory';
import type { CompanionTouchSystem } from '../companion/CompanionTouchSystem';
import type { EventBus } from '../EventBus';
import type { WorldSession } from '../sim/WorldSession';
import type { AppMode, CompanionState, QualityTier, WorldCartridge } from '../types';
import {
  buildCartridgeStageGroup,
  buildCompanionArchGroup,
  COMPANION_ARCH_ORIGIN,
  type CompanionArchBuild,
  type CompanionToothFrame,
} from './CartridgeMeshBuilder';
import { EnamelBiophysicsMaterial } from './EnamelBiophysicsMaterial';
import { EntityBatchRenderer } from './EntityBatchRenderer';
import { GlowPass } from './GlowPass';
import { NO_SUN_SHADOW, SunShadowPass } from './SunShadowPass';
import { ContextLossWatchdog } from './contextLossWatchdog';
import { PacerPropRig, type PacerVisualState } from './PacerPropRig';
import {
  arrivalCamera,
  arrivalOrbitDrag,
  BRUSH_PITCH_CLAMP,
  brushCameraTarget,
  brushOrbitDrag,
  easeBackOffset,
  followFactor,
  followRate,
  fovDeg,
  HUB_REST_PITCH,
  HUB_REST_YAW,
  hubCamera,
  hubOrbitDrag,
  idleBrushCameraTarget,
  isPortrait,
  orbitPosition,
  reportCamera,
  stageCamera,
  type BrushCameraTarget,
  type CameraPose,
} from './brushCamera';
import { evaluateBrushPhase } from '../../config/brushCoach';
import { CitySkylineBackdrop } from './CitySkylineBackdrop';
import { OrbitalEarthBackdrop } from './OrbitalEarthBackdrop';
import { createQualityGovernor, governQuality } from './qualityGovernor';

export type HubCameraFocus = 'companion' | 'globe';

/** Half the width of the square of ground, centred ahead of the ship, that gets real shadows. */
const SUN_SHADOW_HALF_EXTENT = 26;
/** Shadow map width in texels, by quality tier (the low tier draws no shadow map). */
const SUN_SHADOW_MAP_SIZE = { medium: 1024, ultra: 2048 } as const;

export interface CompanionRayHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  toothIndex: number;
}

interface FoamSample {
  x: number;
  z: number;
  t: number;
  s: number;
}

/** The system's Reduce Motion media query, or null where there is none (tests, old browsers). */
function systemReducedMotionQuery(): MediaQueryList | null {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  } catch {
    return null;
  }
}

export type GraphicsState = 'ready' | 'unavailable' | 'failed';
export type GraphicsFailureReason = 'compile' | 'context-timeout';
/**
 * How long a lost WebGL context may take to come back before the 3D is given up. Only time with
 * the page in view counts (see ContextLossWatchdog).
 */
export const CONTEXT_RESTORE_TIMEOUT_MS = 10_000;

/**
 * How far the flight into a city has got: 0 above the Earth, 1 arrived over the teeth. Under
 * Reduce Motion there is no flight: the first frame is already the arrival, so the picture cuts
 * to the city instead of diving down to it.
 */
export function diveProgress01(elapsedSec: number, reducedMotion: boolean): number {
  return reducedMotion ? 1 : Math.min(1, elapsedSec / ZOOM_TRANSITION_SEC);
}

/**
 * How much of the way to its new place the camera moves in one frame (1 is all of it: a cut). A
 * change of screen (another mode, the other Home tab) is a cut, as the native app makes it; inside
 * a screen the camera follows at the app's rates (brushCamera.ts: softer in Brush-Along, and slow
 * there under Reduce Motion).
 */
export function cameraGlide01(
  dt: number,
  brushAlong: boolean,
  reducedMotion: boolean,
  screenChanged: boolean
): number {
  if (screenChanged) return 1;
  return followFactor(followRate(brushAlong, reducedMotion), dt);
}

/**
 * The browser's side column on the hardness line-up (arrival beat 1) needs the camera further back
 * than the app's landscape framing, to fit the five specimens beside the card: the ratio the browser
 * used there (21 against 16.5), applied over the app's distance.
 */
const ARRIVAL_SIDE_COLUMN_DOLLY = 21 / 16.5;

/** Where the camera stands and looks from the target `pose`, backed off `dolly` times along the same line. */
function dollyPose(pose: CameraPose, dolly: number, outPos: THREE.Vector3, outLook: THREE.Vector3): void {
  outLook.set(pose.look.x, pose.look.y, pose.look.z);
  outPos.set(
    pose.look.x + (pose.pos.x - pose.look.x) * dolly,
    pose.look.y + (pose.pos.y - pose.look.y) * dolly,
    pose.look.z + (pose.pos.z - pose.look.z) * dolly
  );
}

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  webglAvailable = false;
  /**
   * Whether the 3D picture can be drawn. `unavailable`: no WebGL 2 renderer could be made.
   * `failed` is terminal for this page load: a shader would not compile or link (three reports it
   * on a program's first draw, never on `compile()`), or the context was lost for good. Once
   * failed, nothing is drawn again until reload, and `webgl:failed` has been emitted once.
   */
  graphicsState: GraphicsState = 'unavailable';
  private readonly lostWatchdog = new ContextLossWatchdog(
    CONTEXT_RESTORE_TIMEOUT_MS,
    () => this.markGraphicsFailed('context-timeout'),
    () => document.visibilityState === 'hidden'
  );

  readonly enamelMat = new EnamelBiophysicsMaterial();
  readonly earthBackdrop = new OrbitalEarthBackdrop();
  /** The stage's city skyline; rebuilt with each cartridge. */
  private citySkyline: CitySkylineBackdrop | null = null;
  readonly entityBatch = new EntityBatchRenderer();

  private companionArch!: CompanionArchBuild;
  private readonly glow = new GlowPass();
  private readonly sunShadow = new SunShadowPass();
  private readonly sunFocus = new THREE.Vector3();
  private readonly pacerRig = new PacerPropRig();
  private rinseWash01 = 0;
  private cartridgeStage: {
    group: THREE.Group;
    dispose: () => void;
    gingivaMaterials: THREE.ShaderMaterial[];
  } | null = null;
  private companionTouch: CompanionTouchSystem | null = null;

  // Arcade "juice": trauma camera micro-shake & FOV punch (applied on top of the damped rig)
  private rigPos = new THREE.Vector3(32, 20, 40);
  private trauma = 0;
  private fovPunch = 0;
  private baseFov = CAMERA_BASE_FOV_DEG;
  private fovDirty = false;
  private reducedMotion = SceneManager.readInitialReducedMotion();

  // Bubbling foam trail samples behind recently scrubbed boundaries
  private foamSamples: FoamSample[] = [];
  private foamCursor = 0;
  private foamEmitTimer = 0;

  private raycaster = new THREE.Raycaster();
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();

  private currentMode: AppMode = 'HUB';
  private hubFocus: HubCameraFocus = 'companion';
  /** True from a change of mode or Home tab until the camera's next step (see cameraGlide01). */
  private screenChanged = false;
  private cosmicBeat = 0;

  // Companion & Brush-Along orbit angles (draggable by touch/mouse!). Limits, gains and the
  // resting angles are the native app's (brushCamera.ts).
  private orbitYaw = HUB_REST_YAW;
  private cosmicYaw = 0;
  private orbitPitch = HUB_REST_PITCH;
  private orbitResetActive = false;
  private brushOrbitYaw = 0;
  private brushOrbitPitch = 0;
  /** A finger is turning the Brush-Along view: its turn holds; let go, it eases back. */
  private brushOrbitHeld = false;
  // Pixels the Companion image is lifted so the arch sits in the gap between hub chrome.
  private hubViewShiftPx = 0;
  private hubViewShiftTarget = 0;
  // Landscape phones: the hub deck becomes a right-hand column, so the arch shifts left instead.
  private hubViewShiftXPx = 0;
  private hubViewShiftXTarget = 0;
  private hubSideFrac = 0;
  private hubBandFrac = 1;
  private hubInsetTimer = 0;
  private viewOffsetApplied = 0;
  private highlightTooth: number | null = null;
  private highlightHoldSec = 0;
  private highlightStartSec = -1;

  // Powers-of-Ten Dive Transition state
  private diveActive = false;
  private diveElapsed = 0;
  private diveSwapped = false;
  private diveOnComplete: (() => void) | null = null;
  private diveStartPos = new THREE.Vector3();
  private diveStartLook = new THREE.Vector3();
  private diveEndPos = new THREE.Vector3();
  private diveEndLook = new THREE.Vector3();

  private currentLookAt = new THREE.Vector3(32, 2.0, 16);

  // Hitch-Free 3-Tier QualityGovernor (the rules are in qualityGovernor.ts)
  private qualityPref: 'auto' | QualityTier = 'auto';
  private activeTier: QualityTier = 'medium';
  private readonly governor = createQualityGovernor();
  private lastDrawCalls = 0;
  private warnedDrawBudget = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly bus: EventBus
  ) {
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_BASE_FOV_DEG,
      1,
      CAMERA_NEAR,
      CAMERA_FAR
    );
    this.initRenderer();
    this.syncReducedMotionClass();
    this.followSystemReducedMotion();
    this.bindJuiceEvents();
  }

  /**
   * Follows the system's Reduce Motion while the game runs, as the native app does
   * (RootContentView): switching it on (or off) applies at once, to the skyline, the finale and
   * everything else that reads `isReducedMotion()`. The in-app switch can still change it after.
   */
  private followSystemReducedMotion(): void {
    const mq = systemReducedMotionQuery();
    if (!mq) return;
    const onChange = (e: { matches: boolean }): void => {
      if (e.matches !== this.reducedMotion) this.setReducedMotion(e.matches);
    };
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
    else mq.addListener?.(onChange);
  }

  private syncReducedMotionClass(): void {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('reduced-motion', this.reducedMotion);
    }
  }

  /**
   * On at launch when the system asks for Reduce Motion (even if the in-app switch was left off
   * last time, as native's RootContentView does), otherwise the in-app switch's saved choice.
   */
  static readInitialReducedMotion(): boolean {
    if (systemReducedMotionQuery()?.matches) return true;
    try {
      const saved =
        typeof localStorage !== 'undefined' ? localStorage.getItem('mouthlife.reduceMotion') : null;
      return saved === '1';
    } catch {
      // ignore storage errors
      return false;
    }
  }

  isReducedMotion(): boolean {
    return this.reducedMotion;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.syncReducedMotionClass();
    if (reduced) {
      this.trauma = 0;
      this.fovPunch = 0;
      this.fovDirty = true;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('mouthlife.reduceMotion', reduced ? '1' : '0');
      }
    } catch {
      // ignore storage errors
    }
    this.bus.emit('motion:changed', { reduced });
  }

  /** Impulse camera micro-shake + FOV punch on the big arcade moments. */
  private bindJuiceEvents(): void {
    this.bus.on('floss:sliced', ({ zipped, targetsHit }) => {
      if (zipped) this.addTrauma(0.42, 5.5);
      else if (targetsHit > 0) this.addTrauma(0.16, 1.2);
    });
    this.bus.on('sucrose:shattered', () => this.addTrauma(0.34, 2.6));
    this.bus.on('eps:cracked', () => this.addTrauma(0.28, 2.2));
    this.bus.on('district:sealed', () => this.addTrauma(0.62, 7.5));
    this.bus.on('rinse:surged', () => this.addTrauma(0.5, 6.0));
    this.bus.on('stephan:sip', () => this.addTrauma(0.2, -1.5));
  }

  addTrauma(amount: number, fovPunchDeg = 0): void {
    if (this.reducedMotion) return;
    this.trauma = Math.min(1, this.trauma + amount);
    this.fovPunch += fovPunchDeg;
    this.fovPunch = Math.max(-6, Math.min(12, this.fovPunch));
  }

  getTrauma(): number {
    return this.trauma;
  }

  attachCompanionTouch(touch: CompanionTouchSystem): void {
    this.companionTouch = touch;
  }

  private initRenderer(): void {
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance',
        alpha: true,
      });
      this.webglAvailable = true;
    } catch {
      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas: this.canvas,
          antialias: false,
          alpha: true,
        });
        this.webglAvailable = true;
      } catch {
        this.webglAvailable = false;
        return;
      }
    }
    this.graphicsState = 'ready';
    // One latch for the whole session: any shader that fails on its first draw ends the 3D.
    this.renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
      console.error(
        '[graphics] shader failed',
        gl.getProgramInfoLog(program),
        gl.getShaderInfoLog(vertexShader),
        gl.getShaderInfoLog(fragmentShader)
      );
      this.markGraphicsFailed('compile');
    };

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false; // Strict modest-GPU discipline: zero shadow map passes!

    this.scene.add(this.earthBackdrop.rootGroup);
    this.companionArch = buildCompanionArchGroup(
      this.enamelMat.material,
      this.enamelMat.createUpperJawMaterial()
    );
    this.scene.add(this.companionArch.group);
    this.scene.add(this.companionArch.upperGroup);
    this.scene.add(this.pacerRig.group);
    this.scene.add(this.entityBatch.arcadeEntitiesGroup);
    this.scene.add(this.entityBatch.sharedFxGroup);
    // Drifting motes and sparks are light, not solid things: they cast no shadow.
    this.entityBatch.sharedFxGroup.userData[NO_SUN_SHADOW] = true;
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('graphicsTest') === 'shaderError') {
      // Development only (removed from production builds): a shader that cannot compile, to
      // exercise the failure card.
      const broken = new THREE.ShaderMaterial({ fragmentShader: 'void main() { this is not glsl; }' });
      this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), broken));
    }

    // WebGL context loss & restoration resilience. A context that does not come back within
    // 10 s (with the page in view) ends the 3D for this page load; a restore is only announced
    // once a real draw passes.
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (this.graphicsState === 'failed') return;
      this.lostWatchdog.lose();
      this.bus.emit('webgl:lost', {});
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      // Too late once failed: the card stays up until reload.
      if (this.graphicsState === 'failed' || !this.lostWatchdog.restore()) return;
      this.enamelMat.markTextureNeedsUpdate();
      this.entityBatch.markTexturesNeedsUpdate();
      this.prewarmShaders();
      if (this.graphicsState !== 'ready') return;
      this.bus.emit('webgl:restored', {});
    });
    // A phone may take the picture away while the game is in the background and give it back
    // only when the player returns. Hidden time must not count towards giving up: hiding stops
    // the wait, and coming back starts a full one if the picture is still missing.
    document.addEventListener('visibilitychange', () => this.lostWatchdog.visibilityChanged());

    window.addEventListener('resize', () => this.handleResize());
    window.visualViewport?.addEventListener('resize', () => this.handleResize());
    this.applyQualityTier('medium');
    this.handleResize();
    this.prewarmShaders();
  }

  /**
   * Builds every shader the scene can show and draws each once, off screen, so a phone whose GPU
   * cannot run them fails here, before any screen appears, instead of drawing black. three
   * checks a program only on its first draw, so a compile alone would never notice.
   */
  prewarmShaders(): void {
    if (!this.webglAvailable || this.graphicsState === 'failed') return;
    const hidden: THREE.Object3D[] = [];
    const culled: THREE.Object3D[] = [];
    const prevTarget = this.renderer.getRenderTarget();
    const prevStrength = this.glow.strength;

    try {
      // Everything the scene can ever show, hidden or not (the floss line, the zip reticle, the
      // pacer, a stage's upper arch...), and wherever the camera points: draw it all once.
      // A cartridge's stage is added later; mountCartridgeMesh runs this again.
      this.scene.traverse((o) => {
        if (!o.visible) {
          o.visible = true;
          hidden.push(o);
        }
        if (o.frustumCulled) {
          o.frustumCulled = false;
          culled.push(o);
        }
      });

      this.renderer.compile(this.scene, this.camera);
      // GlowPass draws the scene and its own passes into its off-screen targets.
      this.glow.strength = Math.max(prevStrength, 0.42);
      // The shadow map draws every solid object with its own depth-only shader: check that too.
      this.sunShadow.render(this.renderer, this.scene, this.currentLookAt, SUN_SHADOW_HALF_EXTENT, SUN_SHADOW_MAP_SIZE.medium, 1, 1.25);
      this.applySunUniforms(true);
      this.glow.prepare(this.renderer, this.scene, this.camera);
      this.glow.discardPrepared(this.renderer);
      // Known limit: these draws go to off-screen targets, whose program variants can differ from
      // the screen's (output colour space, tone mapping). A driver that rejects only a screen
      // variant is still caught by the session-long latch on the first real frame (the card,
      // not a black screen). A real on-screen draw here could flash a frame at mission start.
    } finally {
      for (const o of culled) o.frustumCulled = true;
      for (const o of hidden) o.visible = false;
      this.glow.strength = prevStrength;
      this.renderer.setRenderTarget(prevTarget);
    }
  }

  private markGraphicsFailed(reason: GraphicsFailureReason): void {
    if (this.graphicsState === 'failed') return;
    this.graphicsState = 'failed';
    this.lostWatchdog.fail();
    this.bus.emit('webgl:failed', { reason });
  }

  handleResize(): void {
    if (!this.webglAvailable) return;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const aspect = w / h;
    this.camera.aspect = aspect;

    // Portrait-smart FOV adaptation so narrow 9:19.5 mobile screens frame the full arch & HUD
    // (the native app's widening; the stage's FOV punch rides on top).
    this.baseFov = fovDeg(aspect);
    this.camera.fov = this.baseFov + this.fovPunch;
    this.viewOffsetApplied = Number.NaN; // force the hub view shift to re-apply at the new size
    this.camera.updateProjectionMatrix();

    const spec = QUALITY_TIER_SPECS[this.activeTier];
    const dpr = Math.min(window.devicePixelRatio || 1, spec.maxDpr) * spec.renderScale;
    this.renderer.setPixelRatio(Math.max(0.75, dpr));
    this.renderer.setSize(w, h, false);
  }

  setQualityPreference(pref: 'auto' | QualityTier): void {
    this.qualityPref = pref;
    if (pref !== 'auto') {
      this.applyQualityTier(pref);
    }
  }

  getActiveQualityTier(): QualityTier {
    return this.activeTier;
  }

  getLastDrawCalls(): number {
    return this.lastDrawCalls;
  }

  private applyQualityTier(tier: QualityTier, fps = 60): void {
    this.activeTier = tier;
    this.entityBatch.setQualityTier(tier);
    this.handleResize();
    this.bus.emit('quality:changed', { tier, fps: Math.round(fps) });
  }

  mountCartridgeMesh(cartridge: WorldCartridge, session: WorldSession): void {
    if (this.cartridgeStage) {
      this.scene.remove(this.cartridgeStage.group);
      this.cartridgeStage.dispose();
      this.cartridgeStage = null;
    }
    this.citySkyline?.dispose();
    this.citySkyline = null;

    session.grid.syncRgbaBuffer(session.chemistry, cartridge.bChannelMode);
    this.enamelMat.bindGridBuffer(
      session.grid.rgbaBuffer,
      session.grid.gridW,
      session.grid.gridH,
      cartridge.worldWidth,
      cartridge.worldDepth,
      cartridge.palette,
      cartridge.bChannelMode
    );

    this.foamSamples = [];
    this.foamCursor = 0;
    this.cartridgeStage = buildCartridgeStageGroup(cartridge, this.enamelMat.material);
    this.citySkyline = new CitySkylineBackdrop(cartridge);
    // The skyline is a far-off painted backdrop; it must not throw shadows across the gum.
    this.citySkyline.group.userData[NO_SUN_SHADOW] = true;
    this.cartridgeStage.group.add(this.citySkyline.group);
    this.cartridgeStage.group.visible = SceneManager.showsStage(this.currentMode);
    this.scene.add(this.cartridgeStage.group);
    this.canvas.style.setProperty('--oral-sky', new THREE.Color(cartridge.palette.skyTopHex).getStyle());
    this.prewarmShaders();
  }

  /**
   * Whether a screen shows the city stage: while playing it, and on the score screen, which circles
   * the stage just played (as the native app does).
   */
  static showsStage(mode: AppMode): boolean {
    return mode === 'ARCADE' || mode === 'PULP_RESCUE' || mode === 'REPORT';
  }

  setMode(mode: AppMode): void {
    if (mode === 'COSMIC_INTRO' && this.currentMode !== 'COSMIC_INTRO') this.cosmicYaw = 0;
    if (mode === 'BRUSH_ALONG' && this.currentMode !== 'BRUSH_ALONG') {
      this.brushOrbitYaw = 0;
      this.brushOrbitPitch = 0;
      this.brushOrbitHeld = false;
    }
    if (mode !== this.currentMode) this.screenChanged = true;
    this.currentMode = mode;
    this.hubInsetTimer = 0;
    this.canvas.classList.toggle('arcade-backdrop', SceneManager.showsStage(mode));
    this.syncStageVisibility();
  }

  setHubFocus(focus: HubCameraFocus): void {
    if (focus !== this.hubFocus) this.screenChanged = true;
    this.hubFocus = focus;
    this.syncStageVisibility();
  }

  getHubFocus(): HubCameraFocus {
    return this.hubFocus;
  }

  setCosmicBeat(beatIdx: number): void {
    this.cosmicBeat = beatIdx;
    this.hubInsetTimer = 0;
    this.earthBackdrop.setCosmicIntroState(this.currentMode === 'COSMIC_INTRO', beatIdx);
  }

  /** Softly illuminates a Companion crown (0..13) for `holdSec`, then fades; null clears. */
  highlightCompanionTooth(index: number | null, holdSec = 4.2): void {
    this.highlightTooth = index;
    this.highlightHoldSec = holdSec;
    this.highlightStartSec = -1; // stamped on the next frame
  }

  /** True when the player has orbited the Companion Arch well away from the default view. */
  isCompanionOrbitOffCenter(): boolean {
    return Math.abs(this.orbitYaw - HUB_REST_YAW) > 0.35 || Math.abs(this.orbitPitch - HUB_REST_PITCH) > 0.3;
  }

  resetCompanionOrbit(): void {
    this.orbitResetActive = true;
  }

  /**
   * The Prologue's own turn round the crystal (kept apart from the home screen's view), held where
   * it is let go, after a drag of `dxPoints` (CSS px). Same range and rate as the native app.
   */
  nudgeCosmicOrbit(dxPoints: number): void {
    this.cosmicYaw = arrivalOrbitDrag(this.cosmicYaw, dxPoints);
  }

  /** Home: turns and tilts the arch after a drag of (dx, dy) CSS px across open space, within the app's limits. */
  nudgeCompanionOrbit(dxPoints: number, dyPoints: number): void {
    this.orbitResetActive = false;
    const turned = hubOrbitDrag(this.orbitYaw, this.orbitPitch, dxPoints, dyPoints);
    this.orbitYaw = turned.yaw;
    this.orbitPitch = turned.pitch;
  }

  /** Lets the player orbit around the active teeth at any moment during Brush-Along (CSS px). */
  nudgeBrushOrbit(dxPoints: number, dyPoints: number): void {
    const turned = brushOrbitDrag(this.brushOrbitYaw, this.brushOrbitPitch, dxPoints, dyPoints);
    this.brushOrbitYaw = turned.yaw;
    this.brushOrbitPitch = turned.pitch;
  }

  /** A finger is down turning the Brush-Along view (held), or has let go (eases back to the guided view). */
  setBrushOrbitHeld(held: boolean): void {
    this.brushOrbitHeld = held;
  }

  resetBrushOrbit(): void {
    this.brushOrbitYaw = 0;
    this.brushOrbitPitch = 0;
  }

  isTransitioning(): boolean {
    return this.diveActive;
  }

  /**
   * Executes the 1.35s bounded Powers-of-Ten dive from 3D Orbital Earth into the Dental Arch!
   * Under Reduce Motion it is a cut instead (diveProgress01).
   */
  beginDiveTransition(targetProbeX: number, targetProbeZ: number, onComplete: () => void): void {
    this.diveActive = true;
    this.diveElapsed = 0;
    this.diveSwapped = false;
    this.diveOnComplete = onComplete;

    // Start from orbital Earth vantage
    this.diveStartPos.set(
      EARTH_BACKDROP_POS.x,
      EARTH_BACKDROP_POS.y + 8,
      EARTH_BACKDROP_POS.z + 52
    );
    this.diveStartLook.set(
      EARTH_BACKDROP_POS.x,
      EARTH_BACKDROP_POS.y,
      EARTH_BACKDROP_POS.z
    );

    // The dive ends exactly where the stage camera stands, so there is nothing to glide afterwards.
    {
      const endCam = stageCamera(targetProbeX, targetProbeZ, isPortrait(this.camera.aspect));
      this.diveEndPos.set(endCam.pos.x, endCam.pos.y, endCam.pos.z);
      this.diveEndLook.set(endCam.look.x, endCam.look.y, endCam.look.z);
    }

    this.companionArch.group.visible = false;
    if (this.cartridgeStage) this.cartridgeStage.group.visible = false;
    this.earthBackdrop.rootGroup.visible = true;
  }

  private syncStageVisibility(): void {
    if (this.diveActive) return;

    const isCosmic = this.currentMode === 'COSMIC_INTRO';
    // The score screen shows the city stage just played, not the companion arch.
    const stageOnScreen = SceneManager.showsStage(this.currentMode);
    const isCompanion =
      (this.currentMode === 'HUB' && this.hubFocus === 'companion') ||
      this.currentMode === 'BRUSH_ALONG';

    this.earthBackdrop.setCosmicIntroState(isCosmic, this.cosmicBeat);
    // Modest-GPU: the orbital backdrop only renders where it can actually be seen
    this.earthBackdrop.rootGroup.visible = isCosmic || (this.currentMode === 'HUB' && this.hubFocus === 'globe');
    this.companionArch.group.visible = isCompanion;
    if (this.currentMode !== 'BRUSH_ALONG') {
      this.companionArch.group.position?.set(
        COMPANION_ARCH_ORIGIN.x,
        COMPANION_ARCH_ORIGIN.y,
        COMPANION_ARCH_ORIGIN.z
      );
      if (this.companionArch.upperGroup) {
        this.companionArch.upperGroup.visible = false;
      }
      this.enamelMat?.setJawDim(1);
      if (this.companionArch.gingivaMaterial?.uniforms?.uJawDim) {
        this.companionArch.gingivaMaterial.uniforms.uJawDim.value = 1;
      }
      if (this.companionArch.upperEnamelMaterial?.uniforms?.uJawDim) {
        this.companionArch.upperEnamelMaterial.uniforms.uJawDim.value = 1;
      }
      if (this.companionArch.upperGingivaMaterial?.uniforms?.uJawDim) {
        this.companionArch.upperGingivaMaterial.uniforms.uJawDim.value = 1;
      }
    }
    if (this.cartridgeStage) {
      this.cartridgeStage.group.visible = stageOnScreen;
    }
  }

  renderFrame(params: {
    frameDt: number;
    nowSec: number;
    session: WorldSession;
    companion: CompanionState;
    scrubbingActive: boolean;
    activePacerQuadrant: number;
    /** Live Brush-Along timeline state, or null when no session is running. */
    pacer?: PacerVisualState | null;
  }): void {
    // Nothing to draw while the context is lost, and nothing ever again once the 3D has failed.
    if (!this.webglAvailable || this.lostWatchdog.lost || this.graphicsState !== 'ready') return;
    const { frameDt, nowSec, session, companion } = params;

    this.stepQualityGovernor(frameDt);
    this.earthBackdrop.reducedMotion = this.reducedMotion;
    this.earthBackdrop.update(frameDt, this.reducedMotion ? 0 : nowSec);

    // Update EnamelBiophysicsMaterial mode & DataTexture upload
    const isArcade =
      this.currentMode === 'ARCADE' || this.currentMode === 'PULP_RESCUE';
    // The stage is drawn while playing and on the score screen (which circles it).
    const stageShown = SceneManager.showsStage(this.currentMode) && !!this.cartridgeStage;

    if (stageShown && session.cartridge) {
      this.citySkyline?.update(frameDt, nowSec, session, this.reducedMotion);
      this.enamelMat.setCompanionOverride({ active: false });
      this.enamelMat.setHighlightedTooth(null);
      if (session.grid.syncRgbaBuffer(session.chemistry, session.cartridge.bChannelMode)) {
        this.enamelMat.markTextureNeedsUpdate();
      }

      const discProg =
        session.discloseActiveRemaining > 0
          ? 1 - session.discloseActiveRemaining / DISCLOSE_DURATION_SEC
          : 0;
      const discStrength =
        session.discloseActiveRemaining > 0
          ? Math.min(1, session.discloseActiveRemaining * 1.4)
          : 0;

      const rinseProg =
        session.rinseWaveRemaining > 0
          ? 1 - session.rinseWaveRemaining / RINSE_WAVE_DURATION_SEC
          : 0;
      const rinseStrength =
        session.rinseWaveRemaining > 0 ? session.rinseWaveRemaining : 0;

      // Bubbling foam trail samples just ahead of the sonic head while scrubbing
      this.foamEmitTimer -= frameDt;
      if (params.scrubbingActive && this.foamEmitTimer <= 0) {
        this.foamEmitTimer = 0.09;
        const sample: FoamSample = {
          x: session.probePos.x + Math.cos(session.probeFacingRad) * 0.9,
          z: session.probePos.z + Math.sin(session.probeFacingRad) * 0.9,
          t: nowSec,
          s: 1,
        };
        this.foamSamples[this.foamCursor] = sample;
        this.foamCursor = (this.foamCursor + 1) % 12;
      }
      this.enamelMat.setFoamSamples(this.foamSamples);
      this.enamelMat.setRipples([]);
      this.enamelMat.setSplats([]);

      this.enamelMat.updateFrameUniforms({
        nowSec,
        discloseOriginX: session.discloseOrigin.x,
        discloseOriginZ: session.discloseOrigin.z,
        discloseRadius: discProg * DISCLOSE_WAVE_RADIUS,
        discloseStrength: discStrength,
        rinseOriginX: session.rinseWaveOrigin.x,
        rinseOriginZ: session.rinseWaveOrigin.z,
        rinseRadius: rinseProg * RINSE_WAVE_RADIUS,
        rinseStrength,
        bufferedRinse: session.hasBicarbRinseUpgrade,
      });
      this.syncDistrictSeals(nowSec, session);
    } else {
      // Companion Smooth Bask / Brush-Along shader override
      this.enamelMat.setDistrictSeals([], []);
      const smooth01 =
        this.currentMode === 'BRUSH_ALONG'
          ? 0.98
          : companion.smoothnessIndex / 100;
      const shieldAvg =
        (companion.enamelShield + companion.dentinShield + companion.pulpIntegrity) / 300;
      const acidStress01 =
        this.currentMode === 'HUB' ? Math.max(0, 1 - shieldAvg) : 0;

      this.enamelMat.setCompanionOverride({
        active: true,
        smoothness01: smooth01,
        fluorideGlow01: smooth01 >= 0.85 ? 0.14 : 0.04,
        acidStress01,
        activeQuadrant:
          this.currentMode === 'BRUSH_ALONG' ? params.activePacerQuadrant : -1,
      });
      this.enamelMat.setFoamSamples([]);
      if (this.highlightTooth !== null) {
        if (this.highlightStartSec < 0) this.highlightStartSec = nowSec;
        const age = nowSec - this.highlightStartSec;
        const fadeIn = Math.min(1, age / 0.18);
        const fadeOut = Math.max(0, Math.min(1, (this.highlightHoldSec + 0.6 - age) / 0.6));
        if (age > this.highlightHoldSec + 0.6) {
          this.highlightTooth = null;
          this.enamelMat.setHighlightedTooth(null);
        } else {
          this.enamelMat.setHighlightedTooth(this.highlightTooth, Math.min(fadeIn, fadeOut));
        }
      } else {
        this.enamelMat.setHighlightedTooth(null);
      }
      if (this.companionTouch) {
        this.enamelMat.setRipples(this.companionTouch.ripples);
        this.enamelMat.setSplats(this.companionTouch.getRenderSplats());
      }
      this.enamelMat.updateFrameUniforms({
        nowSec,
        discloseOriginX: 0,
        discloseOriginZ: 0,
        discloseRadius: 0,
        discloseStrength: 0,
        rinseOriginX: 0,
        rinseOriginZ: 0,
        rinseRadius: 0,
        rinseStrength: 0,
      });
    }

    const pacer =
      this.currentMode === 'BRUSH_ALONG' && !this.diveActive ? (params.pacer ?? null) : null;
    // Update the 3D toothbrush/floss rig first so its live contact point can drive the cutaway camera.
    this.pacerRig.update(frameDt, pacer, this.companionArch.teeth);

    this.entityBatch.update({
      dt: frameDt,
      nowSec,
      mode: this.currentMode,
      session,
      scrubbingActive: params.scrubbingActive,
      companionSmoothness: companion.smoothnessIndex,
      reducedMotion: this.reducedMotion,
      companionVisible: this.companionArch.group.visible || this.companionArch.upperGroup.visible,
    });
    this.enamelMat.setContactShadows(
      this.entityBatch.contactShadows,
      isArcade ? this.entityBatch.contactShadowCount : 0
    );

    this.updateCameraRig(
      frameDt,
      nowSec,
      session,
      params.activePacerQuadrant,
      pacer
    );
    this.applyHubViewShift(frameDt);
    this.applyCameraJuice(frameDt, nowSec);
    this.updateOralLighting(nowSec, stageShown, session);

    // The orbital leg of a dive never needs to render the arcade batches.
    this.entityBatch.arcadeEntitiesGroup.visible = isArcade && !!this.cartridgeStage?.group.visible;
    // Ease the purple rinse wash in and out so stage changes never pop.
    const washTarget = pacer?.stage === 'mouthwashBonus' ? 1 : 0;
    this.rinseWash01 += (washTarget - this.rinseWash01) * (1 - Math.exp(-4 * frameDt));
    this.enamelMat.setRinseWash(this.rinseWash01, pacer?.mouthwashProgress01 ?? 0);
    this.updateSunShadow(stageShown);
    // Glow is skipped on the low tier, where every draw counts.
    this.glow.strength = this.activeTier === 'low' ? 0 : this.activeTier === 'medium' ? 0.42 : 0.55;
    this.glow.prepare(this.renderer, this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.lastDrawCalls = this.renderer.info.render.calls;
    this.glow.composite(this.renderer);
    if (import.meta.env.DEV && this.lastDrawCalls >= 25 && !this.warnedDrawBudget) {
      console.assert(false, `MouthLife ${this.currentMode} used ${this.lastDrawCalls} draw calls (budget < 25)`);
      this.warnedDrawBudget = true;
    } else if (this.lastDrawCalls < 25) {
      this.warnedDrawBudget = false;
    }
  }

  private readonly sealStartSec: number[] = [];

  /** Drives the on-surface district seal sweep and the steady gold boundary afterwards. */
  private syncDistrictSeals(nowSec: number, session: WorldSession): void {
    const districts = session.cartridge.districts;
    const ages: number[] = [];
    for (let i = 0; i < 4; i++) {
      if (districts[i] && session.sealedDistricts[i]) {
        if (this.sealStartSec[i] === undefined) this.sealStartSec[i] = nowSec;
        ages[i] = this.reducedMotion ? 99 : Math.max(0, nowSec - this.sealStartSec[i]);
      } else {
        delete this.sealStartSec[i];
        ages[i] = -1;
      }
    }
    this.enamelMat.setDistrictSeals(districts.map((d) => d.bounds), ages);
  }

  /** Finds the free vertical band between the top header/callout and the bottom deck/pacer card. */
  private measureHubBand(dt: number): void {
    this.hubInsetTimer -= dt;
    if (this.hubInsetTimer > 0) return;
    this.hubInsetTimer = 0.25;
    const h = Math.max(1, window.innerHeight);
    let top = 0;
    let bottom = h;
    const header = document.querySelector('.hub-top-bar') as HTMLElement | null;
    const callout = document.querySelector('.hub-center-callout') as HTMLElement | null;
    const deck = document.querySelector(
      '.hub-bottom-deck, #pacer-card, .pacer-bottom-card, .cosmic-card'
    ) as HTMLElement | null;
    const w = Math.max(1, window.innerWidth);
    const deckRect = deck?.getBoundingClientRect();
    const side = deckRect && deckRect.height > 0 ? sideLayoutFraming(w, h, deckRect.left, deckRect.right) : null;
    if (side) {
      this.hubSideFrac = side.sideFrac;
      this.hubViewShiftXTarget = side.shiftX;
      this.hubViewShiftTarget = 0;
      this.hubBandFrac = 1;
      if (this.currentMode === 'HUB' && this.hubFocus === 'globe') {
        const top = (callout?.getBoundingClientRect().bottom ?? 0) + 12;
        const bottom = h - 12;
        const band = Math.max(h * 0.25, bottom - top);
        this.hubBandFrac = band / h;
        this.hubViewShiftTarget = bottom - band / 2 - h / 2;
      } else if (this.currentMode === 'COSMIC_INTRO') {
        this.hubViewShiftTarget = (header?.getBoundingClientRect().bottom ?? 0) / 2;
      }
      return;
    }
    this.hubSideFrac = 0;
    this.hubViewShiftXTarget = 0;
    if (header) top = Math.max(top, header.getBoundingClientRect().bottom);
    if (callout) {
      const r = callout.getBoundingClientRect();
      if (r.height > 0 && r.bottom < h * 0.4) top = Math.max(top, r.bottom);
    }
    if (deck) {
      const r = deck.getBoundingClientRect();
      if (r.height > 0 && r.top > h * 0.3) bottom = Math.min(bottom, r.top);
    }
    const band = Math.max(h * 0.25, bottom - top);
    this.hubBandFrac = band / h;
    // Bias the free-band center slightly upward so foreground central incisors clear the bottom deck.
    const midY = (top + bottom) * 0.5 - Math.min(22, (bottom - top) * 0.08);
    this.hubViewShiftTarget = bottom > top ? midY - h / 2 : 0;
  }

  private applyHubViewShift(dt: number): void {
    const active =
      this.currentMode === 'HUB' ||
      this.currentMode === 'BRUSH_ALONG' ||
      this.currentMode === 'REPORT' ||
      (this.currentMode === 'COSMIC_INTRO' && this.cosmicBeat !== 1);
    const mohsSide = this.currentMode === 'COSMIC_INTRO' && this.cosmicBeat === 1 && this.hubSideFrac > 0;
    const target = active || mohsSide ? this.hubViewShiftTarget : 0;
    const targetX = active || mohsSide ? this.hubViewShiftXTarget : 0;
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 8);
    this.hubViewShiftPx += (target - this.hubViewShiftPx) * k;
    this.hubViewShiftXPx += (targetX - this.hubViewShiftXPx) * k;
    if (Math.abs(this.hubViewShiftPx - target) < 0.4) this.hubViewShiftPx = target;
    if (Math.abs(this.hubViewShiftXPx - targetX) < 0.4) this.hubViewShiftXPx = targetX;
    const signature = this.hubViewShiftPx + this.hubViewShiftXPx * 1000;
    if (Math.abs(signature - this.viewOffsetApplied) < 0.05) return;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    if (this.hubViewShiftPx === 0 && this.hubViewShiftXPx === 0) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, -this.hubViewShiftXPx, -this.hubViewShiftPx, w, h);
    this.viewOffsetApplied = signature;
  }

  /**
   * A dive's look: the far-side sun and film-style colour on every tier, and real shadows on the
   * medium and ultra tiers. Everywhere else (home, Brush-Along, the report) nothing changes.
   */
  private updateSunShadow(arcade: boolean): void {
    const tier = this.activeTier;
    if (arcade && tier !== 'low' && this.cartridgeStage?.group.visible) {
      // The camera sees further ahead of the ship (up the screen) than behind it.
      this.sunFocus.set(this.currentLookAt.x, 0, this.currentLookAt.z - 4);
      this.sunShadow.render(
        this.renderer,
        this.scene,
        this.sunFocus,
        SUN_SHADOW_HALF_EXTENT,
        SUN_SHADOW_MAP_SIZE[tier],
        1,
        tier === 'ultra' ? 1.8 : 1.6
      );
    } else {
      this.sunShadow.disable();
    }
    this.applySunUniforms(arcade);
  }

  private applySunUniforms(arcade: boolean): void {
    const apply = (material: THREE.ShaderMaterial) => {
      const u = material.uniforms;
      u.uSunShadowMap.value = this.sunShadow.texture;
      (u.uSunShadowMatrix.value as THREE.Matrix4).copy(this.sunShadow.matrix);
      (u.uSunShadow.value as THREE.Vector4).copy(this.sunShadow.params);
      u.uDiveLook.value = arcade ? 1 : 0;
    };
    apply(this.enamelMat.material);
    apply(this.companionArch.gingivaMaterial);
    for (const material of this.cartridgeStage?.gingivaMaterials ?? []) apply(material);
  }

  private updateOralLighting(nowSec: number, arcade: boolean, session: WorldSession): void {
    const detail = this.activeTier === 'low' ? 0 : this.activeTier === 'medium' ? 1 : 2;
    const motionTime = this.reducedMotion ? 0 : nowSec;
    // Keep portrait framing from dimming the entire arch as the camera backs up.
    const fogStart = arcade ? 16 : Math.max(14, this.rigPos.distanceTo(this.currentLookAt) - 7);
    const update = (material: THREE.ShaderMaterial) => {
      const u = material.uniforms;
      u.uDetail.value = detail;
      u.uMotionTime.value = motionTime;
      u.uDepthCue.value.set(fogStart, arcade ? 0.053 : 0.095);
      u.uHeadlamp.value.set(
        session.probePos.x + Math.cos(session.probeFacingRad) * 0.95,
        session.probeY + 1.35,
        session.probePos.z + Math.sin(session.probeFacingRad) * 0.95,
        arcade ? 1 : 0
      );
    };
    update(this.enamelMat.material);
    update(this.companionArch.gingivaMaterial);
    for (const material of this.cartridgeStage?.gingivaMaterials ?? []) update(material);
  }

  /**
   * Positions, shows/hides, and dims the true 3D lower and upper dental arches for Brush-Along
   * cutaway views (and resets them cleanly in every other mode).
   */
  private syncCompanionJaws(target: BrushCameraTarget | null): void {
    const ox = COMPANION_ARCH_ORIGIN.x;
    const oy = COMPANION_ARCH_ORIGIN.y;
    const oz = COMPANION_ARCH_ORIGIN.z;
    if (!target || this.currentMode !== 'BRUSH_ALONG' || this.diveActive) {
      this.companionArch.group.position.set(ox, oy, oz);
      this.companionArch.upperGroup.visible = false;
      this.companionArch.upperGroup.position.set(ox, oy, oz);
      this.enamelMat.setJawDim(1);
      this.companionArch.gingivaMaterial.uniforms.uJawDim.value = 1;
      this.companionArch.upperEnamelMaterial.uniforms.uJawDim.value = 1;
      this.companionArch.upperGingivaMaterial.uniforms.uJawDim.value = 1;
      return;
    }

    // The jaws as the shared camera places them; the browser shows "how solid" as a dimming.
    const lower = target.lowerJaw;
    const upper = target.upperJaw;
    this.companionArch.group.visible = lower.visible;
    this.companionArch.group.position.set(ox + lower.offset.x, oy + lower.offset.y, oz + lower.offset.z);
    this.companionArch.upperGroup.visible = upper.visible;
    this.companionArch.upperGroup.position.set(ox + upper.offset.x, oy + upper.offset.y, oz + upper.offset.z);
    this.enamelMat.setJawDim(lower.opacity);
    this.companionArch.gingivaMaterial.uniforms.uJawDim.value = lower.opacity;
    this.companionArch.upperEnamelMaterial.uniforms.uJawDim.value = upper.opacity;
    this.companionArch.upperGingivaMaterial.uniforms.uJawDim.value = upper.opacity;
  }

  /**
   * The Brush-Along camera for this frame: brushCamera.ts, the app's numbers, following the point
   * the app follows (`PacerPropRig.cameraContactLocal`) on a clock that stands still while paused or
   * on a Start card. Before any stage runs the browser keeps its own idle frame; with a quadrant
   * but no running pacer it holds that quadrant's outside step, close up.
   */
  private brushAlongTarget(pacer: PacerVisualState | null, activeQuadrant: number): BrushCameraTarget {
    if (!pacer && activeQuadrant < 0) return idleBrushCameraTarget(this.companionArch.incisorClearanceY);
    const phase = pacer
      ? {
          stage: pacer.stage,
          quadrant: pacer.quadrant,
          surface: pacer.surface,
          phaseElapsedSec: pacer.phaseElapsedSec ?? 4,
          phaseDurationSec: pacer.phaseDurationSec ?? 10,
          flossIsUpper: pacer.flossIsUpper,
          flossContactIndex: pacer.flossContactIndex,
        }
      : evaluateBrushPhase(activeQuadrant * 30 + 4, 'brushing');
    const rig = this.pacerRig;
    return brushCameraTarget({
      phase,
      reducedMotion: this.reducedMotion,
      clockSec: rig.cameraClockSec,
      contactLocal: rig.hasContact ? rig.cameraContactLocal : null,
      flossOutwardXZ: rig.hasContact ? { x: rig.activeOutwardX, z: rig.activeOutwardZ } : null,
      rinseHandheld01: pacer?.rinseHandheld01 ?? 0,
      rinseSlosh: pacer?.rinseSlosh ?? 0,
    });
  }

  private updateCameraRig(
    dt: number,
    nowSec: number,
    session: WorldSession,
    activeQuadrant: number,
    pacer: PacerVisualState | null = null
  ): void {
    // 1. Bounded Powers-of-Ten Dive Transition
    if (this.diveActive) {
      this.diveElapsed += dt;
      // Under Reduce Motion this is 1 at once: the stage is swapped in and the dive finished
      // below, in this same frame, before anything is drawn. A cut, with no Earth frame.
      const u = diveProgress01(this.diveElapsed, this.reducedMotion);
      const ease = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

      if (!this.diveSwapped && u >= 0.55) {
        this.diveSwapped = true;
        if (this.cartridgeStage) this.cartridgeStage.group.visible = true;
        this.earthBackdrop.rootGroup.visible = false;
      }

      this.rigPos.lerpVectors(this.diveStartPos, this.diveEndPos, ease);
      this.currentLookAt.lerpVectors(this.diveStartLook, this.diveEndLook, ease);
      this.camera.position.copy(this.rigPos);
      this.camera.lookAt(this.currentLookAt);

      if (u >= 1) {
        this.diveActive = false;
        this.syncStageVisibility();
        // The flight hands over to the stage's camera with the usual follow (the flight itself
        // was the way in); under Reduce Motion the next frame cuts to it, as a change of screen.
        if (!this.reducedMotion) this.screenChanged = false;
        const cb = this.diveOnComplete;
        this.diveOnComplete = null;
        cb?.();
      }
      return;
    }

    const desiredPos = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();
    // Portrait framing below the app's cut-off (a foldable's near-square inner screen is landscape).
    const portraitView = isPortrait(this.camera.aspect);

    if (this.currentMode === 'COSMIC_INTRO') {
      this.measureHubBand(dt);
      // The app's framing per beat (the crystal, the hardness line-up, fluorapatite, the Earth).
      // Dragging turns it as in the app; there is no gyroscope on the browser's camera, so no tilt.
      const pose = arrivalCamera(this.cosmicBeat, this.cosmicYaw, portraitView);
      // The browser's side column beside the hardness line-up: back off to fit (its own panels).
      const dolly = this.cosmicBeat === 1 && this.hubSideFrac > 0 ? ARRIVAL_SIDE_COLUMN_DOLLY : 1;
      dollyPose(pose, dolly, desiredPos, desiredLook);
    } else if (this.currentMode === 'HUB') {
      if (this.hubFocus === 'globe') {
        this.measureHubBand(dt);
        const sideLayout = this.hubSideFrac > 0;
        const halfFov = THREE.MathUtils.degToRad(this.baseFov / 2);
        const fit = Math.min(this.hubBandFrac, this.camera.aspect * this.hubSideFrac * 0.92);
        const globeDistance = sideLayout
          ? Math.max(66, EARTH_BACKDROP_RADIUS / Math.sin(Math.atan(Math.tan(halfFov) * fit)))
          : 49;
        desiredPos.set(
          EARTH_BACKDROP_POS.x,
          EARTH_BACKDROP_POS.y + (sideLayout ? 0 : 5.5),
          EARTH_BACKDROP_POS.z + globeDistance
        );
        desiredLook.set(
          EARTH_BACKDROP_POS.x,
          EARTH_BACKDROP_POS.y - (sideLayout ? 0 : 1.5),
          EARTH_BACKDROP_POS.z
        );
      } else {
        // Pocket Tamagotchi Smooth Bask Companion Arch 3D Showcase! The app's framing and resting
        // angle; double-tap eases back to rest (browser only), and nothing else moves it (the app's
        // idle motion is a held phone's tilt, which the browser's camera does not read).
        if (this.orbitResetActive) {
          // Same easing at any refresh rate (these used to run once per frame, so 144 Hz snapped back faster).
          const keep = Math.pow(0.9, dt * 60);
          this.orbitYaw += (HUB_REST_YAW - this.orbitYaw) * (1 - keep);
          this.orbitPitch += (HUB_REST_PITCH - this.orbitPitch) * (1 - keep);
          if (Math.abs(this.orbitYaw - HUB_REST_YAW) < 0.01 && Math.abs(this.orbitPitch - HUB_REST_PITCH) < 0.01) {
            this.orbitYaw = HUB_REST_YAW;
            this.orbitPitch = HUB_REST_PITCH;
            this.orbitResetActive = false;
          }
        }
        this.measureHubBand(dt);
        // The browser's own fit round its panels, on top of the app's distance: landscape has spare
        // width, so back off further to fit the arch height inside the band.
        const bandDolly =
          1 + Math.min(portraitView ? 0.24 : 0.72, Math.max(0, 0.58 - this.hubBandFrac) * (portraitView ? 0.65 : 1.85));
        const sideDolly = this.hubSideFrac > 0 ? Math.max(1, 0.52 / (this.hubSideFrac * 0.92)) : 1;
        const pose = hubCamera(this.orbitYaw, this.orbitPitch, portraitView, 0, 0, bandDolly * sideDolly);
        desiredPos.set(pose.pos.x, pose.pos.y, pose.pos.z);
        desiredLook.set(pose.look.x, pose.look.y, pose.look.z);
      }
    } else if (this.currentMode === 'BRUSH_ALONG') {
      this.measureHubBand(dt);
      // The browser's own fit round its panels, on top of the app's distances.
      const bandDolly =
        1 +
        Math.min(
          portraitView ? 0.16 : 0.36,
          Math.max(0, 0.56 - this.hubBandFrac) * (portraitView ? 0.42 : 0.95)
        );
      const sideDolly = this.hubSideFrac > 0 ? Math.max(1, 0.54 / (this.hubSideFrac * 0.92)) : 1;

      // Let go, a finger's turn eases back to the guided view (it is kept across steps, as in the app).
      if (!this.brushOrbitHeld) {
        this.brushOrbitYaw = easeBackOffset(this.brushOrbitYaw, dt);
        this.brushOrbitPitch = easeBackOffset(this.brushOrbitPitch, dt);
      }

      const target = this.brushAlongTarget(pacer, activeQuadrant);
      this.syncCompanionJaws(target);

      const dist = (portraitView ? target.distPortrait : target.distLandscape) * bandDolly * sideDolly;
      const yaw = target.yaw + this.brushOrbitYaw;
      const pitch = Math.max(-BRUSH_PITCH_CLAMP, Math.min(BRUSH_PITCH_CLAMP, target.pitch + this.brushOrbitPitch));
      desiredLook.set(
        COMPANION_ARCH_ORIGIN.x + target.lookLocal.x,
        COMPANION_ARCH_ORIGIN.y + target.lookLocal.y,
        COMPANION_ARCH_ORIGIN.z + target.lookLocal.z
      );
      const pos = orbitPosition(desiredLook, yaw, pitch, dist);
      desiredPos.set(pos.x, pos.y, pos.z);
    } else if (this.currentMode === 'REPORT') {
      // Circles the city stage just played, as the app does (one fixed angle under Reduce Motion),
      // backed off along the same line to fit the browser's side column (its own panels).
      this.measureHubBand(dt);
      const reportSide = this.hubSideFrac > 0 ? Math.max(1, 0.55 / (this.hubSideFrac * 0.92)) : 1;
      const pose = reportCamera(
        session.cartridge?.worldWidth ?? 64,
        session.cartridge?.worldDepth ?? 32,
        nowSec,
        this.reducedMotion
      );
      dollyPose(pose, reportSide, desiredPos, desiredLook);
    } else {
      // ARCADE & PULP_RESCUE: south of the ship, looking down a little ahead of it; never turns.
      const pose = stageCamera(session.probePos.x, session.probePos.z, portraitView);
      desiredPos.set(pose.pos.x, pose.pos.y, pose.pos.z);
      desiredLook.set(pose.look.x, pose.look.y, pose.look.z);
    }

    // A change of screen cuts; inside a screen the camera follows at the app's rates.
    const brushAlong = this.currentMode === 'BRUSH_ALONG';
    const damp = cameraGlide01(dt, brushAlong, this.reducedMotion, this.screenChanged);
    this.screenChanged = false;
    this.rigPos.lerp(desiredPos, damp);
    this.currentLookAt.lerp(desiredLook, damp);
    this.camera.position.copy(this.rigPos);
    this.camera.lookAt(this.currentLookAt);
  }

  /** Applies decaying trauma shake (quadratic falloff, smooth pseudo-noise) and FOV punch. */
  private applyCameraJuice(dt: number, nowSec: number): void {
    if (this.trauma > 0) {
      const shake = this.trauma * this.trauma;
      const t = nowSec * 38;
      const ox = (Math.sin(t * 1.13) + Math.sin(t * 2.71 + 1.3) * 0.5) * 0.42 * shake;
      const oy = (Math.sin(t * 1.37 + 2.1) + Math.sin(t * 3.07) * 0.5) * 0.3 * shake;
      const oz = Math.sin(t * 0.93 + 4.2) * 0.25 * shake;
      this.camera.position.set(this.rigPos.x + ox, this.rigPos.y + oy, this.rigPos.z + oz);
      this.tmpV.copy(this.currentLookAt);
      this.tmpV.x += ox * 0.35;
      this.tmpV.y += oy * 0.35;
      this.camera.lookAt(this.tmpV);
      this.camera.rotateZ(Math.sin(t * 0.77 + 0.4) * 0.035 * shake);
      this.trauma = Math.max(0, this.trauma - dt * 1.7);
    }

    if (Math.abs(this.fovPunch) > 0.01 || this.fovDirty) {
      this.fovPunch *= Math.exp(-dt * 6.5);
      if (Math.abs(this.fovPunch) <= 0.01) this.fovPunch = 0;
      this.camera.fov = this.baseFov + this.fovPunch;
      this.camera.updateProjectionMatrix();
      this.fovDirty = this.fovPunch !== 0;
    }
  }

  /** Projects a world point to CSS pixel coordinates for floating HUD callouts. */
  worldToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    this.tmpV.set(x, y, z).project(this.camera);
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    return {
      x: (this.tmpV.x * 0.5 + 0.5) * w,
      y: (-this.tmpV.y * 0.5 + 0.5) * h,
      visible: this.tmpV.z > -1 && this.tmpV.z < 1,
    };
  }

  isCompanionVisible(): boolean {
    return this.companionArch.group.visible && !this.diveActive;
  }

  getCompanionTeeth(): readonly CompanionToothFrame[] {
    return this.companionArch.teeth;
  }

  /**
   * Fast analytic raycast against per-crown ellipsoid proxies (no triangle walk), so rubbing the
   * 3D teeth stays cheap on mobile. Returns the nearest crown hit in world space.
   */
  raycastCompanionTeeth(ndcX: number, ndcY: number): CompanionRayHit | null {
    if (!this.isCompanionVisible()) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const ray = this.raycaster.ray;
    let bestT = Infinity;
    let best: CompanionRayHit | null = null;

    for (const tooth of this.companionArch.teeth) {
      const c = Math.cos(-tooth.yaw);
      const sn = Math.sin(-tooth.yaw);
      const ex = tooth.halfW * 1.08;
      const ey = tooth.halfH * 1.05;
      const ez = tooth.halfD * 1.12;
      // Ray into tooth-local unit-sphere space
      const ox = ray.origin.x - tooth.center.x;
      const oy = ray.origin.y - tooth.center.y;
      const oz = ray.origin.z - tooth.center.z;
      const lox = (c * ox + sn * oz) / ex;
      const loz = (-sn * ox + c * oz) / ez;
      const loy = oy / ey;
      const ldx = (c * ray.direction.x + sn * ray.direction.z) / ex;
      const ldz = (-sn * ray.direction.x + c * ray.direction.z) / ez;
      const ldy = ray.direction.y / ey;
      const a = ldx * ldx + ldy * ldy + ldz * ldz;
      const b = 2 * (lox * ldx + loy * ldy + loz * ldz);
      const cc = lox * lox + loy * loy + loz * loz - 1;
      const disc = b * b - 4 * a * cc;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t <= 0 || t >= bestT) continue;
      bestT = t;
      const point = ray.at(t, new THREE.Vector3());
      // Ellipsoid gradient normal back in world space
      const hx = lox + ldx * t;
      const hy = loy + ldy * t;
      const hz = loz + ldz * t;
      const nlx = hx / ex;
      const nly = hy / ey;
      const nlz = hz / ez;
      const cw = Math.cos(tooth.yaw);
      const sw = Math.sin(tooth.yaw);
      const normal = new THREE.Vector3(cw * nlx + sw * nlz, nly, -sw * nlx + cw * nlz).normalize();
      best = { point, normal, toothIndex: tooth.index };
    }
    return best;
  }

  /** Labial-face anchor points on crowns facing the camera (sugar splat targets). */
  getCompanionSplatAnchors(): Array<{ x: number; y: number; z: number }> {
    const anchors: Array<{ x: number; y: number; z: number }> = [];
    const w = window.innerWidth;
    const h = window.innerHeight;
    const reachable: typeof anchors = [];
    for (const tooth of this.companionArch.teeth) {
      const lx = Math.sin(tooth.yaw);
      const lz = Math.cos(tooth.yaw);
      const px = tooth.center.x + lx * tooth.halfD * 0.95;
      const py = tooth.center.y + tooth.halfH * 0.05;
      const pz = tooth.center.z + lz * tooth.halfD * 0.95;
      this.tmpV.set(px, py, pz);
      this.tmpV2.subVectors(this.camera.position, this.tmpV).normalize();
      if (lx * this.tmpV2.x + lz * this.tmpV2.z <= 0.15) continue;
      const anchor = { x: px, y: py, z: pz };
      anchors.push(anchor);
      const screen = this.worldToScreen(px, py, pz);
      if (screen.visible && screen.x >= 18 && screen.x <= w - 18 && screen.y >= 18 && screen.y <= h - 18) {
        reachable.push(anchor);
      }
    }
    if (reachable.length > 0) return reachable;
    return anchors.length > 0
      ? anchors
      : this.companionArch.teeth.map((t) => ({ x: t.center.x, y: t.center.y + t.halfH * 0.6, z: t.center.z }));
  }

  /** Picks the host city pin nearest a screen point on the visible hemisphere of the 3D globe. */
  pickCityAtScreen(clientX: number, clientY: number, radiusPx = 38): string | null {
    if (!this.earthBackdrop.rootGroup.visible || this.currentMode !== 'HUB' || this.hubFocus !== 'globe') {
      return null;
    }
    const earthCenter = this.earthBackdrop.getEarthCenter(new THREE.Vector3());
    let bestId: string | null = null;
    let bestD = radiusPx;
    for (const city of HOST_CITIES) {
      const pos = this.earthBackdrop.getCityWorldPosition(city.id, new THREE.Vector3());
      if (!pos) continue;
      const outward = this.tmpV2.subVectors(pos, earthCenter).normalize();
      const toCam = new THREE.Vector3().subVectors(this.camera.position, pos).normalize();
      if (outward.dot(toCam) < 0.05) continue;
      const sp = this.worldToScreen(pos.x, pos.y, pos.z);
      if (!sp.visible) continue;
      const d = Math.hypot(sp.x - clientX, sp.y - clientY);
      if (d < bestD) {
        bestD = d;
        bestId = city.id;
      }
    }
    return bestId;
  }

  /** One drawn frame for the automatic quality; applies the new level when it asks for one. */
  private stepQualityGovernor(dt: number): void {
    const next = governQuality(this.governor, dt, this.activeTier, this.qualityPref === 'auto');
    if (next !== null) this.applyQualityTier(next, this.governor.fps);
  }
}
