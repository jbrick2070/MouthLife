import * as THREE from 'three';
import type { SessionInputCommand } from './sim/WorldSession';
import type { AppMode, Vec2 } from './types';

export type CanvasPointerPhase = 'down' | 'move' | 'up';

/** Steering helper: converts a ground-plane target into a -1..1 move vector with arrival easing. */
export function computePointerSteer(
  probePos: Vec2,
  target: Vec2,
  deadZone = 0.55,
  fullSpeedDist = 2.4
): { moveX: number; moveZ: number } {
  const dx = target.x - probePos.x;
  const dz = target.z - probePos.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= deadZone) return { moveX: 0, moveZ: 0 };
  const mag = Math.min(1, (dist - deadZone) / Math.max(0.01, fullSpeedDist - deadZone) + 0.25);
  return { moveX: (dx / dist) * mag, moveZ: (dz / dist) * mag };
}

const STEER_PREF_KEY = 'mouthlife.pointerSteer';

export class InputManager {
  private keysDown = new Set<string>();
  private mouseLeftHeld = false;
  private cursorNdc = new THREE.Vector2(0, 0);
  private hasCursorMoved = false;

  // Virtual mobile thumb controls
  private virtualMoveX = 0;
  private virtualMoveZ = 0;
  private virtualScrubHeld = false;
  private virtualFlossAim: Vec2 | null = null;

  // Edge-triggered one-shot requests
  private pendingFloss = false;
  private pendingRinse = false;
  private pendingDisclose = false;

  // Companion / Showcase drag-to-orbit state
  private orbitPointerId: number | null = null;
  private lastOrbitX = 0;
  private lastOrbitY = 0;

  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
  private hitVec3 = new THREE.Vector3();

  private onUserGesture: (() => void) | null = null;
  private onOrbitDrag: ((dYaw: number, dPitch: number) => void) | null = null;
  private onCanvasPointer:
    | ((phase: CanvasPointerPhase, clientX: number, clientY: number, ndcX: number, ndcY: number) => boolean)
    | null = null;
  private currentModeGetter: () => AppMode = () => 'HUB';

  // Direct touch-the-teeth pointer (HUB / REPORT) — consumes the gesture instead of orbiting
  private touchPointerId: number | null = null;

  // Optional drag/click-to-steer on the 3D tooth surface (ARCADE / PULP_RESCUE)
  private pointerSteerEnabled = true;
  private steerPointerId: number | null = null;
  private steerNdc = new THREE.Vector2(0, 0);

  constructor(private readonly canvas: HTMLCanvasElement) {
    try {
      const stored = window.localStorage.getItem(STEER_PREF_KEY);
      if (stored !== null) this.pointerSteerEnabled = stored === '1';
    } catch {
      /* storage unavailable — keep default */
    }
    this.bindEvents();
  }

  setHooks(params: {
    onUserGesture: () => void;
    onOrbitDrag: (dYaw: number, dPitch: number) => void;
    getMode: () => AppMode;
    onCanvasPointer?: (
      phase: CanvasPointerPhase,
      clientX: number,
      clientY: number,
      ndcX: number,
      ndcY: number
    ) => boolean;
  }): void {
    this.onUserGesture = params.onUserGesture;
    this.onOrbitDrag = params.onOrbitDrag;
    this.currentModeGetter = params.getMode;
    this.onCanvasPointer = params.onCanvasPointer ?? null;
  }

  isPointerSteerEnabled(): boolean {
    return this.pointerSteerEnabled;
  }

  setPointerSteerEnabled(enabled: boolean): void {
    this.pointerSteerEnabled = enabled;
    if (!enabled) this.steerPointerId = null;
    try {
      window.localStorage.setItem(STEER_PREF_KEY, enabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  /** True while a mouse/touch is actively steering HYDRA-1 across the tooth surface. */
  isPointerSteering(): boolean {
    return this.steerPointerId !== null;
  }

  private toNdc(clientX: number, clientY: number): { x: number; y: number } {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    return { x: (clientX / w) * 2 - 1, y: -(clientY / h) * 2 + 1 };
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      this.onUserGesture?.();
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const code = e.code;
      this.keysDown.add(code);

      if (code === 'KeyE') {
        this.pendingFloss = true;
      } else if (code === 'KeyQ' || code === 'ShiftLeft' || code === 'ShiftRight') {
        this.pendingRinse = true;
      } else if (code === 'KeyR' || code === 'Tab') {
        const m = this.currentModeGetter();
        if (m === 'ARCADE' || m === 'PULP_RESCUE') {
          e.preventDefault();
          this.pendingDisclose = true;
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.mouseLeftHeld = false;
      this.steerPointerId = null;
      this.touchPointerId = null;
      this.virtualMoveX = 0;
      this.virtualMoveZ = 0;
      this.virtualScrubHeld = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('pointerdown', (e) => {
      this.onUserGesture?.();
      const mode = this.currentModeGetter();
      this.updateCursorNdc(e.clientX, e.clientY);

      if (mode === 'ARCADE' || mode === 'PULP_RESCUE') {
        if (e.pointerType === 'mouse') {
          if (e.button === 0) {
            this.mouseLeftHeld = true;
            if (this.pointerSteerEnabled) {
              this.steerPointerId = e.pointerId;
              this.steerNdc.copy(this.cursorNdc);
            }
          } else if (e.button === 2) {
            this.pendingFloss = true;
          }
        } else if (this.pointerSteerEnabled) {
          // One-thumb touch / pen: touch the tooth surface to sweep HYDRA-1 there while scrubbing
          this.steerPointerId = e.pointerId;
          this.steerNdc.copy(this.cursorNdc);
          try {
            this.canvas.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }
      } else {
        const ndc = this.toNdc(e.clientX, e.clientY);
        const consumed = this.onCanvasPointer?.('down', e.clientX, e.clientY, ndc.x, ndc.y) ?? false;
        if (consumed) {
          // Rubbing / tapping the 3D teeth (or picking a globe city) instead of orbiting
          this.touchPointerId = e.pointerId;
          try {
            this.canvas.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        } else {
          // Drag-to-orbit Companion teeth gums or Cosmic showcase!
          this.orbitPointerId = e.pointerId;
          this.lastOrbitX = e.clientX;
          this.lastOrbitY = e.clientY;
        }
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.updateCursorNdc(e.clientX, e.clientY);
        this.hasCursorMoved = true;
      }
      if (this.steerPointerId === e.pointerId) {
        const ndc = this.toNdc(e.clientX, e.clientY);
        this.steerNdc.set(ndc.x, ndc.y);
      }
      if (this.touchPointerId === e.pointerId) {
        const ndc = this.toNdc(e.clientX, e.clientY);
        this.onCanvasPointer?.('move', e.clientX, e.clientY, ndc.x, ndc.y);
      }
      if (this.orbitPointerId === e.pointerId) {
        const dx = e.clientX - this.lastOrbitX;
        const dy = e.clientY - this.lastOrbitY;
        this.lastOrbitX = e.clientX;
        this.lastOrbitY = e.clientY;
        this.onOrbitDrag?.(-dx * 0.007, dy * 0.005);
      }
    });

    const endPointer = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button === 0) this.mouseLeftHeld = false;
      if (this.steerPointerId === e.pointerId) this.steerPointerId = null;
      if (this.touchPointerId === e.pointerId) {
        this.touchPointerId = null;
        const ndc = this.toNdc(e.clientX, e.clientY);
        this.onCanvasPointer?.('up', e.clientX, e.clientY, ndc.x, ndc.y);
      }
      if (this.orbitPointerId === e.pointerId) {
        this.orbitPointerId = null;
      }
    };
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);
  }

  private updateCursorNdc(clientX: number, clientY: number): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.cursorNdc.x = (clientX / w) * 2 - 1;
    this.cursorNdc.y = -(clientY / h) * 2 + 1;
  }

  // Mobile Virtual Thumb Deck Controls
  setVirtualMove(dx: number, dz: number, autoScrub = true): void {
    this.onUserGesture?.();
    this.virtualMoveX = dx;
    this.virtualMoveZ = dz;
    this.virtualScrubHeld = autoScrub && Math.hypot(dx, dz) > 0.06;
  }

  setVirtualScrubHeld(held: boolean): void {
    this.onUserGesture?.();
    this.virtualScrubHeld = held;
  }

  triggerVirtualFloss(aimWorldOffset?: Vec2 | null): void {
    this.onUserGesture?.();
    this.virtualFlossAim = aimWorldOffset ?? null;
    this.pendingFloss = true;
  }

  triggerVirtualRinse(): void {
    this.onUserGesture?.();
    this.pendingRinse = true;
  }

  triggerVirtualDisclose(): void {
    this.onUserGesture?.();
    this.pendingDisclose = true;
  }

  isScrubInputActive(): boolean {
    return (
      this.mouseLeftHeld ||
      this.keysDown.has('Space') ||
      this.virtualScrubHeld ||
      this.steerPointerId !== null
    );
  }

  sampleSessionCommand(
    camera: THREE.Camera,
    probePos: Vec2,
    probeY: number,
    gatedByTransition: boolean
  ): SessionInputCommand {
    if (gatedByTransition) {
      this.pendingFloss = false;
      this.pendingRinse = false;
      this.pendingDisclose = false;
      return {
        moveX: 0,
        moveZ: 0,
        scrubHeld: false,
        aimWorldPos: null,
        fireFlossRequested: false,
        fireRinseRequested: false,
        fireDiscloseRequested: false,
      };
    }

    let moveX = this.virtualMoveX;
    let moveZ = this.virtualMoveZ;

    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) moveX -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) moveX += 1;
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) moveZ -= 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) moveZ += 1;

    // Drag/click-to-steer: sweep HYDRA-1 toward the touched tooth surface (keys & thumb pad win)
    if (this.steerPointerId !== null && Math.hypot(moveX, moveZ) < 0.05) {
      this.groundPlane.constant = -probeY;
      this.raycaster.setFromCamera(this.steerNdc, camera);
      if (this.raycaster.ray.intersectPlane(this.groundPlane, this.hitVec3)) {
        const steer = computePointerSteer(probePos, { x: this.hitVec3.x, z: this.hitVec3.z });
        moveX = steer.moveX;
        moveZ = steer.moveZ;
      }
    }

    let aimWorldPos: Vec2 | null = null;
    if (this.virtualFlossAim) {
      aimWorldPos = {
        x: probePos.x + this.virtualFlossAim.x * 4.5,
        z: probePos.z + this.virtualFlossAim.z * 4.5,
      };
    } else if (this.hasCursorMoved) {
      this.groundPlane.constant = -probeY;
      this.raycaster.setFromCamera(this.cursorNdc, camera);
      if (this.raycaster.ray.intersectPlane(this.groundPlane, this.hitVec3)) {
        aimWorldPos = { x: this.hitVec3.x, z: this.hitVec3.z };
      }
    }

    const cmd: SessionInputCommand = {
      moveX,
      moveZ,
      scrubHeld: this.isScrubInputActive(),
      aimWorldPos,
      fireFlossRequested: this.pendingFloss,
      fireRinseRequested: this.pendingRinse,
      fireDiscloseRequested: this.pendingDisclose,
    };

    this.pendingFloss = false;
    this.pendingRinse = false;
    this.pendingDisclose = false;
    this.virtualFlossAim = null;

    return cmd;
  }
}
