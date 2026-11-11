import * as THREE from 'three';
import {
  CAMERA_BASE_FOV_DEG,
  CAMERA_FAR,
  CAMERA_NEAR,
  DISCLOSE_DURATION_SEC,
  DISCLOSE_WAVE_RADIUS,
  EARTH_BACKDROP_POS,
  FPS_DOWNGRADE_THRESHOLD,
  FPS_UPGRADE_THRESHOLD,
  QUALITY_GOVERNOR_COOLDOWN_SEC,
  QUALITY_ROLLING_FRAMES,
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
  type CompanionArchBuild,
  type CompanionToothFrame,
} from './CartridgeMeshBuilder';
import { EnamelBiophysicsMaterial } from './EnamelBiophysicsMaterial';
import { EntityBatchRenderer } from './EntityBatchRenderer';
import { OrbitalEarthBackdrop } from './OrbitalEarthBackdrop';

export type HubCameraFocus = 'companion' | 'globe';

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

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  webglAvailable = false;

  readonly enamelMat = new EnamelBiophysicsMaterial();
  readonly earthBackdrop = new OrbitalEarthBackdrop();
  readonly entityBatch = new EntityBatchRenderer();

  private companionArch!: CompanionArchBuild;
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
  private cosmicBeat = 0;

  // Companion orbit angles (draggable by touch/mouse!)
  private orbitYaw = 0;
  private orbitPitch = 0.42;

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

  // Hitch-Free 3-Tier QualityGovernor
  private qualityPref: 'auto' | QualityTier = 'auto';
  private activeTier: QualityTier = 'medium';
  private dtRing = new Float32Array(QUALITY_ROLLING_FRAMES);
  private dtRingIdx = 0;
  private dtRingFilled = 0;
  private governorCooldownSec = 3.0;
  private lastDrawCalls = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly bus: EventBus
  ) {
    this.scene.background = new THREE.Color(0x051624);
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_BASE_FOV_DEG,
      1,
      CAMERA_NEAR,
      CAMERA_FAR
    );
    this.initRenderer();
    this.syncReducedMotionClass();
    this.bindJuiceEvents();
  }

  private syncReducedMotionClass(): void {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('reduced-motion', this.reducedMotion);
    }
  }

  private static readInitialReducedMotion(): boolean {
    try {
      const saved =
        typeof localStorage !== 'undefined' ? localStorage.getItem('mouthlife.reduceMotion') : null;
      if (saved === '1') return true;
      if (saved === '0') return false;
    } catch {
      // ignore storage errors
    }
    return Boolean(
      typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    );
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
        alpha: false,
      });
      this.webglAvailable = true;
    } catch {
      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas: this.canvas,
          antialias: false,
          alpha: false,
        });
        this.webglAvailable = true;
      } catch {
        this.webglAvailable = false;
        return;
      }
    }

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false; // Strict modest-GPU discipline: zero shadow map passes!

    this.scene.add(this.earthBackdrop.rootGroup);
    this.companionArch = buildCompanionArchGroup(this.enamelMat.material);
    this.scene.add(this.companionArch.group);
    this.scene.add(this.entityBatch.arcadeEntitiesGroup);
    this.scene.add(this.entityBatch.sharedFxGroup);

    // WebGL context loss & restoration resilience
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.enamelMat.markTextureNeedsUpdate();
      this.prewarmShaders();
      this.bus.emit('webgl:restored', {});
    });

    window.addEventListener('resize', () => this.handleResize());
    this.applyQualityTier('medium');
    this.handleResize();
    this.prewarmShaders();
  }

  prewarmShaders(): void {
    if (!this.webglAvailable) return;
    const prevCosmic = this.earthBackdrop.cosmicShowcaseGroup.visible;
    const prevComp = this.companionArch.group.visible;
    const prevStage = this.cartridgeStage?.group.visible ?? false;
    const prevBackdrop = this.earthBackdrop.rootGroup.visible;
    const prevMohs = this.earthBackdrop.cosmicShowcaseGroup.children.map((c) => c.visible);

    this.earthBackdrop.rootGroup.visible = true;
    this.earthBackdrop.cosmicShowcaseGroup.children.forEach((c) => (c.visible = true));
    this.earthBackdrop.cosmicShowcaseGroup.visible = true;
    this.companionArch.group.visible = true;
    if (this.cartridgeStage) this.cartridgeStage.group.visible = true;

    this.renderer.compile(this.scene, this.camera);

    this.earthBackdrop.cosmicShowcaseGroup.children.forEach((c, i) => (c.visible = prevMohs[i]));
    this.earthBackdrop.rootGroup.visible = prevBackdrop;
    this.earthBackdrop.cosmicShowcaseGroup.visible = prevCosmic;
    this.companionArch.group.visible = prevComp;
    if (this.cartridgeStage) this.cartridgeStage.group.visible = prevStage;
  }

  handleResize(): void {
    if (!this.webglAvailable) return;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const aspect = w / h;
    this.camera.aspect = aspect;

    // Portrait-smart FOV adaptation so narrow 9:19.5 mobile screens frame the full arch & HUD!
    if (aspect < 1.0) {
      const widen = Math.min(22, (1.0 - aspect) * 38);
      this.baseFov = CAMERA_BASE_FOV_DEG + widen;
    } else {
      this.baseFov = CAMERA_BASE_FOV_DEG;
    }
    this.camera.fov = this.baseFov + this.fovPunch;
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
    this.cartridgeStage.group.visible =
      this.currentMode === 'ARCADE' || this.currentMode === 'PULP_RESCUE';
    this.scene.add(this.cartridgeStage.group);
    (this.scene.background as THREE.Color).setHex(cartridge.palette.skyTopHex);
    this.prewarmShaders();
  }

  setMode(mode: AppMode): void {
    this.currentMode = mode;
    this.syncStageVisibility();
  }

  setHubFocus(focus: HubCameraFocus): void {
    this.hubFocus = focus;
    this.syncStageVisibility();
  }

  getHubFocus(): HubCameraFocus {
    return this.hubFocus;
  }

  setCosmicBeat(beatIdx: number): void {
    this.cosmicBeat = beatIdx;
    this.earthBackdrop.setCosmicIntroState(this.currentMode === 'COSMIC_INTRO', beatIdx);
  }

  nudgeCompanionOrbit(deltaYaw: number, deltaPitch: number): void {
    this.orbitYaw += deltaYaw;
    this.orbitPitch = Math.max(0.18, Math.min(1.05, this.orbitPitch + deltaPitch));
  }

  isTransitioning(): boolean {
    return this.diveActive;
  }

  /**
   * Executes the 1.35s bounded Powers-of-Ten dive from 3D Orbital Earth into the Dental Arch!
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

    this.diveEndPos.set(targetProbeX, 18.5, targetProbeZ + 12.5);
    this.diveEndLook.set(targetProbeX, 1.2, targetProbeZ - 1.2);

    this.companionArch.group.visible = false;
    if (this.cartridgeStage) this.cartridgeStage.group.visible = false;
    this.earthBackdrop.rootGroup.visible = true;
  }

  private syncStageVisibility(): void {
    if (this.diveActive) return;

    const isCosmic = this.currentMode === 'COSMIC_INTRO';
    const isArcade =
      this.currentMode === 'ARCADE' || this.currentMode === 'PULP_RESCUE';
    const isCompanion =
      (this.currentMode === 'HUB' && this.hubFocus === 'companion') ||
      this.currentMode === 'BRUSH_ALONG' ||
      this.currentMode === 'REPORT';

    this.earthBackdrop.setCosmicIntroState(isCosmic, this.cosmicBeat);
    // Modest-GPU: the orbital backdrop only renders where it can actually be seen
    this.earthBackdrop.rootGroup.visible = isCosmic || (this.currentMode === 'HUB' && this.hubFocus === 'globe');
    this.companionArch.group.visible = isCompanion;
    if (this.cartridgeStage) {
      this.cartridgeStage.group.visible = isArcade;
    }
  }

  renderFrame(params: {
    frameDt: number;
    nowSec: number;
    session: WorldSession;
    companion: CompanionState;
    scrubbingActive: boolean;
    activePacerQuadrant: number;
  }): void {
    if (!this.webglAvailable) return;
    const { frameDt, nowSec, session, companion } = params;

    this.stepQualityGovernor(frameDt);
    this.earthBackdrop.update(frameDt, nowSec);

    // Update EnamelBiophysicsMaterial mode & DataTexture upload
    const isArcade =
      this.currentMode === 'ARCADE' || this.currentMode === 'PULP_RESCUE';

    if (isArcade && session.cartridge) {
      this.enamelMat.setCompanionOverride({ active: false });
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
      });
    } else {
      // Companion Smooth Bask / Brush-Along / Report shader override
      const smooth01 =
        this.currentMode === 'REPORT' || this.currentMode === 'BRUSH_ALONG'
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

    this.entityBatch.update({
      dt: frameDt,
      nowSec,
      mode: this.currentMode,
      session,
      scrubbingActive: params.scrubbingActive,
      companionSmoothness: companion.smoothnessIndex,
    });

    this.companionArch.gingivaMaterial.uniforms.uTime.value = nowSec;
    if (this.cartridgeStage) {
      for (const gm of this.cartridgeStage.gingivaMaterials) gm.uniforms.uTime.value = nowSec;
    }

    this.updateCameraRig(frameDt, nowSec, session, params.activePacerQuadrant);
    this.applyCameraJuice(frameDt, nowSec);

    this.renderer.render(this.scene, this.camera);
    this.lastDrawCalls = this.renderer.info.render.calls;
  }

  private updateCameraRig(
    dt: number,
    nowSec: number,
    session: WorldSession,
    activeQuadrant: number
  ): void {
    // 1. Bounded Powers-of-Ten Dive Transition
    if (this.diveActive) {
      this.diveElapsed += dt;
      const u = Math.min(1, this.diveElapsed / ZOOM_TRANSITION_SEC);
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
        const cb = this.diveOnComplete;
        this.diveOnComplete = null;
        cb?.();
      }
      return;
    }

    const desiredPos = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();

    if (this.currentMode === 'COSMIC_INTRO') {
      if (this.cosmicBeat <= 2) {
        // Frame the 3D Hexagonal Hydroxyapatite Crystal & Mohs Lineup at (32, 148, 16)
        const cx = EARTH_BACKDROP_POS.x;
        const cy = EARTH_BACKDROP_POS.y + 38;
        const cz = EARTH_BACKDROP_POS.z;
        const swayX = Math.sin(nowSec * 0.35 + this.orbitYaw) * 3.2;
        // Beat 2 tilts down & pulls back so the Mohs specimen row clears the lower info panel
        const mohsBeat = this.cosmicBeat === 1;
        const portrait = this.camera.aspect < 1.0;
        desiredPos.set(cx + swayX * (mohsBeat ? 0.4 : 1), cy + (mohsBeat ? -0.6 : 1.2), cz + (mohsBeat ? (portrait ? 19.5 : 16.5) : 14.5));
        desiredLook.set(cx, cy - (mohsBeat ? (portrait ? 5.6 : 4.6) : 0.0), cz);
      } else {
        // Beat 3: Majestic Earthrise zoom framing the 3D Globe!
        desiredPos.set(
          EARTH_BACKDROP_POS.x + 4,
          EARTH_BACKDROP_POS.y + 7,
          EARTH_BACKDROP_POS.z + 50
        );
        desiredLook.set(
          EARTH_BACKDROP_POS.x,
          EARTH_BACKDROP_POS.y - 1,
          EARTH_BACKDROP_POS.z
        );
      }
    } else if (this.currentMode === 'HUB') {
      if (this.hubFocus === 'globe') {
        desiredPos.set(
          EARTH_BACKDROP_POS.x,
          EARTH_BACKDROP_POS.y + 5.5,
          EARTH_BACKDROP_POS.z + 49
        );
        desiredLook.set(
          EARTH_BACKDROP_POS.x,
          EARTH_BACKDROP_POS.y - 1.5,
          EARTH_BACKDROP_POS.z
        );
      } else {
        // Pocket Tamagotchi Smooth Bask Companion Arch 3D Showcase!
        const gentleBob = Math.sin(nowSec * 0.45) * 0.08;
        const yaw = this.orbitYaw + gentleBob;
        const radius = this.camera.aspect < 1.0 ? 31.0 : 21.5;
        const pitch = Math.max(0.48, this.orbitPitch);
        desiredPos.set(
          32 + Math.sin(yaw) * Math.cos(pitch) * radius,
          2.2 + Math.sin(pitch) * radius,
          16 + Math.cos(yaw) * Math.cos(pitch) * radius
        );
        desiredLook.set(32, 1.5, 16.5);
      }
    } else if (this.currentMode === 'BRUSH_ALONG') {
      const quadPanX = ((activeQuadrant >= 0 ? activeQuadrant : 1.5) - 1.5) * 2.4;
      desiredPos.set(32 + quadPanX, 17.5, 32.5);
      desiredLook.set(32 + quadPanX * 0.45, 1.6, 15.5);
    } else if (this.currentMode === 'REPORT') {
      const celebYaw = nowSec * 0.42 + this.orbitYaw;
      desiredPos.set(
        32 + Math.sin(celebYaw) * 19.5,
        10.5,
        16 + Math.cos(celebYaw) * 19.5
      );
      desiredLook.set(32, 1.9, 16);
    } else {
      // ARCADE & PULP_RESCUE Top-Down Action Follow Camera
      const px = session.probePos.x;
      const pz = session.probePos.z;
      const leadX = Math.cos(session.probeFacingRad) * 1.3;
      const leadZ = Math.sin(session.probeFacingRad) * 1.1;
      desiredPos.set(px + leadX * 0.5, 18.2, pz + 12.6);
      desiredLook.set(px + leadX, session.probeY + 0.4, pz + leadZ - 0.8);
    }

    const damp = Math.min(1, dt * 6.5);
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
    for (const tooth of this.companionArch.teeth) {
      const lx = Math.sin(tooth.yaw);
      const lz = Math.cos(tooth.yaw);
      const px = tooth.center.x + lx * tooth.halfD * 0.95;
      const py = tooth.center.y + tooth.halfH * 0.05;
      const pz = tooth.center.z + lz * tooth.halfD * 0.95;
      this.tmpV.set(px, py, pz);
      this.tmpV2.subVectors(this.camera.position, this.tmpV).normalize();
      if (lx * this.tmpV2.x + lz * this.tmpV2.z > 0.15) anchors.push({ x: px, y: py, z: pz });
    }
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

  private stepQualityGovernor(dt: number): void {
    if (dt <= 0 || dt > 0.25) return;
    this.dtRing[this.dtRingIdx] = dt;
    this.dtRingIdx = (this.dtRingIdx + 1) % QUALITY_ROLLING_FRAMES;
    if (this.dtRingFilled < QUALITY_ROLLING_FRAMES) this.dtRingFilled++;

    this.governorCooldownSec = Math.max(0, this.governorCooldownSec - dt);
    if (
      this.qualityPref !== 'auto' ||
      this.dtRingFilled < QUALITY_ROLLING_FRAMES ||
      this.governorCooldownSec > 0
    ) {
      return;
    }

    let sum = 0;
    for (let i = 0; i < QUALITY_ROLLING_FRAMES; i++) sum += this.dtRing[i];
    const avgFps = QUALITY_ROLLING_FRAMES / Math.max(0.001, sum);

    if (avgFps < FPS_DOWNGRADE_THRESHOLD) {
      if (this.activeTier === 'ultra') {
        this.governorCooldownSec = QUALITY_GOVERNOR_COOLDOWN_SEC;
        this.applyQualityTier('medium', avgFps);
      } else if (this.activeTier === 'medium') {
        this.governorCooldownSec = QUALITY_GOVERNOR_COOLDOWN_SEC;
        this.applyQualityTier('low', avgFps);
      }
    } else if (avgFps > FPS_UPGRADE_THRESHOLD) {
      if (this.activeTier === 'low') {
        this.governorCooldownSec = QUALITY_GOVERNOR_COOLDOWN_SEC;
        this.applyQualityTier('medium', avgFps);
      } else if (this.activeTier === 'medium') {
        this.governorCooldownSec = QUALITY_GOVERNOR_COOLDOWN_SEC;
        this.applyQualityTier('ultra', avgFps);
      }
    }
  }
}
