import * as THREE from 'three';
import type { SessionInputCommand } from './sim/WorldSession';
import type { AppMode, Vec2 } from './types';

import { GAMEPAD_IDLE, GamepadInput, type GamepadSnapshot } from './GamepadInput';
export type CanvasPointerPhase = 'down' | 'move' | 'up';
export type PointerSteerPref = 'auto' | 'on' | 'off';

/**
 * Pure policy helper: in 'auto' mode (no explicit user override), touch/pen pointers steer
 * HYDRA-1 directly across the tooth arch while mouse left-click scrubs in place without yanking.
 */
export function resolvePointerSteerForType(pref: PointerSteerPref, pointerType: string): boolean {
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return pointerType !== 'mouse';
}

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

/** True when two taps land close together in time and space (double-tap detector). */
export function isDoubleTap(
  prev: { t: number; x: number; y: number } | null,
  now: { t: number; x: number; y: number },
  maxMs = 320,
  maxDistPx = 44
): boolean {
  if (!prev) return false;
  const dt = now.t - prev.t;
  return dt > 0 && dt <= maxMs && Math.hypot(now.x - prev.x, now.y - prev.y) <= maxDistPx;
}

/**
 * Exponential steering response with the same feel as a 40% blend at 60 Hz.
 */
export function smoothSteerVector(
  prev: { moveX: number; moveZ: number },
  next: { moveX: number; moveZ: number },
  dt: number
): { moveX: number; moveZ: number } {
  const k = -Math.expm1(Math.log(0.6) * 60 * Math.max(0, dt));
  const moveX = prev.moveX + (next.moveX - prev.moveX) * k;
  const moveZ = prev.moveZ + (next.moveZ - prev.moveZ) * k;
  return { moveX, moveZ };
}

/** True when a modal dialog (`role="dialog" aria-modal="true"`) is currently open and visible. */
export function isModalDialogOpen(
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined
): boolean {
  if (!doc) return false;
  const zeroLayoutDom = (doc.documentElement?.clientWidth ?? 0) === 0;
  return Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).some(
    (d) => {
      if (d.getClientRects().length > 0) return true;
      if (!zeroLayoutDom) return false;
      for (let cur: HTMLElement | null = d; cur; cur = cur.parentElement) {
        if (cur.hidden || cur.style.display === 'none') return false;
      }
      return true;
    }
  );
}

const STEER_PREF_KEY = 'mouthlife.pointerSteer';

export class InputManager {
  private keysDown = new Set<string>();
  private mouseLeftHeld = false;
  /** Mouse button bitmask from the last mouse event (1 = left, 2 = right). */
  private mouseButtons = 0;
  private cursorNdc = new THREE.Vector2(0, 0);
  private hasCursorMoved = false;

  // Virtual mobile thumb controls
  private virtualMoveX = 0;
  private virtualMoveZ = 0;
  private virtualScrubHeld = false;
  private virtualFlossAim: Vec2 | null = null;
  private virtualFlossSmartAim = false;

  // Edge-triggered one-shot requests
  private pendingFloss = false;
  private readonly gamepad = new GamepadInput();
  private padState: GamepadSnapshot = GAMEPAD_IDLE;
  /** Called when the controller's Start button is pressed. */
  onPauseRequested: (() => void) | null = null;
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
  // Defaults to 'auto': ON for touch/pen, OFF for desktop mouse unless explicitly toggled.
  private steerPref: PointerSteerPref = 'auto';
  private steerPointerId: number | null = null;
  private steerNdc = new THREE.Vector2(0, 0);
  private steerSmooth = { moveX: 0, moveZ: 0 };
  private steerTarget: Vec2 | null = null;
  private lastTap: { t: number; x: number; y: number } | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    try {
      const stored = window.localStorage.getItem(STEER_PREF_KEY);
      if (stored === '1') this.steerPref = 'on';
      else if (stored === '0') this.steerPref = 'off';
    } catch {
      /* storage unavailable — keep 'auto' default */
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
    if (this.steerPref === 'on') return true;
    if (this.steerPref === 'off') return false;
    return Boolean(
      typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
    );
  }

  getPointerSteerPreference(): PointerSteerPref {
    return this.steerPref;
  }

  setPointerSteerEnabled(enabled: boolean): void {
    this.steerPref = enabled ? 'on' : 'off';
    if (!enabled) this.steerPointerId = null;
    try {
      window.localStorage.setItem(STEER_PREF_KEY, enabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  /** Ground-plane point the active pointer is steering toward (null when not steering). */
  getSteerTarget(): Vec2 | null {
    return this.steerPointerId !== null ? this.steerTarget : null;
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
      const target = e.target instanceof Element ? e.target : null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || isModalDialogOpen()) return;

      const code = e.code;
      if (code === 'Space' && target?.closest('button, a, [role="button"]')) return;
      this.keysDown.add(code);

      if (code === 'KeyE') {
        this.pendingFloss = true;
      } else if (code === 'KeyQ' || code === 'ShiftLeft' || code === 'ShiftRight') {
        this.pendingRinse = true;
      } else if (code === 'KeyR') {
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
      this.mouseButtons = 0;
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
        if (e.pointerType !== 'mouse' && this.steerPointerId !== null) return;
        // Double-tap anywhere on the tooth: auto-aimed Floss (snaps to the nearest alley mouth)
        const tapNow = { t: performance.now(), x: e.clientX, y: e.clientY };
        if (e.pointerType !== 'mouse' && isDoubleTap(this.lastTap, tapNow)) {
          this.pendingFloss = true;
          this.virtualFlossAim = null;
          this.virtualFlossSmartAim = true;
          this.lastTap = null;
        } else {
          this.lastTap = tapNow;
        }
        const shouldSteer = resolvePointerSteerForType(this.steerPref, e.pointerType);
        if (e.pointerType === 'mouse') {
          this.mouseButtons = e.buttons;
          if (e.button === 0) {
            this.mouseLeftHeld = true;
            if (shouldSteer) {
              this.steerPointerId = e.pointerId;
              this.steerNdc.copy(this.cursorNdc);
            }
          } else if (e.button === 2) {
            this.pendingFloss = true;
          }
        } else if (shouldSteer) {
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
        // A second mouse button pressed or released while another is held arrives as a
        // pointermove (not pointerdown/up), so chords are read from the button bitmask.
        const prev = this.mouseButtons;
        this.mouseButtons = e.buttons;
        const mode = this.currentModeGetter();
        const inPlay = mode === 'ARCADE' || mode === 'PULP_RESCUE';
        const overCanvas = e.target === this.canvas;
        if ((e.buttons & 2) !== 0 && (prev & 2) === 0 && inPlay && overCanvas) {
          this.pendingFloss = true; // right-click floss while still holding left to scrub
        }
        if ((e.buttons & 1) !== 0 && (prev & 1) === 0 && inPlay && overCanvas) {
          this.mouseLeftHeld = true; // left pressed while right is still down
        }
        if ((e.buttons & 1) === 0 && this.mouseLeftHeld) {
          this.mouseLeftHeld = false; // left released while right is still down
          if (this.steerPointerId === e.pointerId) this.steerPointerId = null;
        }
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
      if (e.pointerType === 'mouse') {
        this.mouseButtons = e.buttons;
        if ((e.buttons & 1) === 0) this.mouseLeftHeld = false;
      }
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
    this.canvas.addEventListener('lostpointercapture', endPointer);
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
    this.virtualFlossSmartAim = !aimWorldOffset;
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

  /**
   * Read the game controller. Call once per rendered frame (also while paused, so Start can unpause).
   */
  pollGamepad(): void {
    const pads =
      typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
        ? navigator.getGamepads()
        : [];
    this.applyGamepadSnapshot(this.gamepad.poll(pads));
  }

  /** Split out so tests can feed a snapshot without a real controller. */
  applyGamepadSnapshot(snap: GamepadSnapshot): void {
    this.padState = snap;
    if (!snap.connected) return;
    if (snap.anyInput) this.onUserGesture?.();
    if (snap.pausePressed) this.onPauseRequested?.();
    const mode = this.currentModeGetter();
    if (mode === 'ARCADE' || mode === 'PULP_RESCUE') {
      if (snap.flossPressed) this.pendingFloss = true;
      if (snap.rinsePressed) this.pendingRinse = true;
      if (snap.scanPressed) this.pendingDisclose = true;
    }
  }

  isGamepadConnected(): boolean {
    return this.padState.connected;
  }

  /** Controller rumble for hits and big moments (no-op without a controller). */
  rumble(strength01: number, durationMs: number): void {
    this.gamepad.rumble(strength01, durationMs);
  }

  isScrubInputActive(): boolean {
    return (
      this.padState.scrubHeld ||
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
    gatedByTransition: boolean,
    dt: number
  ): SessionInputCommand {
    if (gatedByTransition) {
      this.pendingFloss = false;
      this.pendingRinse = false;
      this.pendingDisclose = false;
      this.virtualFlossAim = null;
      this.virtualFlossSmartAim = false;
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
    moveX += this.padState.moveX;
    moveZ += this.padState.moveZ;

    // Drag/click-to-steer: sweep HYDRA-1 toward the touched tooth surface (keys & thumb pad win)
    if (this.steerPointerId !== null && Math.hypot(moveX, moveZ) < 0.05) {
      this.groundPlane.constant = -probeY;
      this.raycaster.setFromCamera(this.steerNdc, camera);
      if (this.raycaster.ray.intersectPlane(this.groundPlane, this.hitVec3)) {
        this.steerTarget = { x: this.hitVec3.x, z: this.hitVec3.z };
        const steer = smoothSteerVector(
          this.steerSmooth,
          computePointerSteer(probePos, this.steerTarget),
          dt
        );
        this.steerSmooth = steer;
        moveX = steer.moveX;
        moveZ = steer.moveZ;
      }
    } else {
      this.steerSmooth = { moveX: 0, moveZ: 0 };
    }

    let aimWorldPos: Vec2 | null = null;
    if (this.padState.aimX !== 0 || this.padState.aimZ !== 0) {
      // Right stick aims the floss from the probe outward.
      aimWorldPos = {
        x: probePos.x + this.padState.aimX * 4.5,
        z: probePos.z + this.padState.aimZ * 4.5,
      };
    } else if (this.virtualFlossAim) {
      aimWorldPos = {
        x: probePos.x + this.virtualFlossAim.x * 4.5,
        z: probePos.z + this.virtualFlossAim.z * 4.5,
      };
    } else if (!this.virtualFlossSmartAim && this.hasCursorMoved) {
      this.groundPlane.constant = -probeY;
      this.raycaster.setFromCamera(this.cursorNdc, camera);
      if (this.raycaster.ray.intersectPlane(this.groundPlane, this.hitVec3)) {
        aimWorldPos = { x: this.hitVec3.x, z: this.hitVec3.z };
      }
    } else if (!this.virtualFlossSmartAim && this.steerPointerId !== null && this.steerTarget) {
      aimWorldPos = { x: this.steerTarget.x, z: this.steerTarget.z };
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
    this.virtualFlossSmartAim = false;

    return cmd;
  }
}
