import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputManager, type CanvasPointerPhase } from '../src/engine/InputManager';
import type { AppMode } from '../src/engine/types';
import { bindFlossRing } from '../src/ui/hudHelpers';

// Input that stops counting (first outside beta test, November 2026). A page is not always told
// that a finger lifted: it may be hidden with no "cancelled" and no loss of focus. Whatever was
// held then must let go by itself, or the brush scrubs on and every later touch is kept out.

afterEach(() => {
  vi.unstubAllGlobals();
});

type Listener = (e: Record<string, unknown>) => void;

/** Something that takes listeners and can be made to fire them, as a window or an element does. */
function target() {
  const listeners = new Map<string, Listener[]>();
  return {
    addEventListener(type: string, fn: Listener): void {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    fire(type: string, e: Record<string, unknown> = {}): void {
      for (const fn of listeners.get(type) ?? []) fn({ type, ...e });
    },
  };
}

/** A page with a canvas, just enough of one for the input to listen to, driven by hand. */
function page(mode: AppMode = 'ARCADE') {
  const win = target();
  const doc = { ...target(), visibilityState: 'visible' };
  const canvas = { ...target(), setPointerCapture: () => {} };
  vi.stubGlobal('window', {
    addEventListener: win.addEventListener,
    localStorage: { getItem: () => null, setItem: () => {} },
    innerWidth: 390,
    innerHeight: 844,
  });
  vi.stubGlobal('document', doc);

  const input = new InputManager(canvas as unknown as HTMLCanvasElement);
  const orbitDrags: Array<[number, number]> = [];
  const canvasPhases: CanvasPointerPhase[] = [];
  let rubTheTooth = false;
  input.setHooks({
    onUserGesture: () => {},
    onOrbitDrag: (dYaw, dPitch) => orbitDrags.push([dYaw, dPitch]),
    getMode: () => mode,
    onCanvasPointer: (phase) => {
      canvasPhases.push(phase);
      return rubTheTooth;
    },
  });

  const pointer = (id: number, x: number, y: number, pointerType: string, buttons: number) => ({
    pointerId: id,
    pointerType,
    clientX: x,
    clientY: y,
    button: 0,
    buttons,
    target: canvas,
  });
  const camera = new THREE.PerspectiveCamera();
  return {
    input,
    orbitDrags,
    canvasPhases,
    setRubTheTooth: (on: boolean) => {
      rubTheTooth = on;
    },
    /** A pointer lands on the canvas: the window hears it first, as in a browser. */
    down(id: number, x: number, y: number, pointerType = 'touch'): void {
      const e = pointer(id, x, y, pointerType, 1);
      win.fire('pointerdown', e);
      canvas.fire('pointerdown', e);
    },
    move(id: number, x: number, y: number, pointerType = 'touch'): void {
      win.fire('pointermove', pointer(id, x, y, pointerType, 1));
    },
    up(id: number, x = 0, y = 0, pointerType = 'touch'): void {
      win.fire('pointerup', pointer(id, x, y, pointerType, 0));
    },
    /** The page is hidden, and nothing else is said: no "cancelled", no loss of focus. */
    hide(): void {
      doc.visibilityState = 'hidden';
      doc.fire('visibilitychange');
    },
    show(): void {
      doc.visibilityState = 'visible';
      doc.fire('visibilitychange');
    },
    blur: () => win.fire('blur'),
    sample: () => input.sampleSessionCommand(camera, { x: 0, z: 0 }, 0, false, 1 / 60),
  };
}

describe('a finger on the tooth lets go when the page stops hearing of it', () => {
  it('finger down, page hidden with no cancel and no blur: the next finger down steers', () => {
    const p = page();
    p.down(1, 100, 400);
    expect(p.input.isPointerSteering()).toBe(true);
    expect(p.input.isScrubInputActive()).toBe(true);

    p.hide();
    expect(p.input.isPointerSteering()).toBe(false);
    expect(p.input.isScrubInputActive()).toBe(false);

    p.show();
    p.down(2, 300, 500);
    expect(p.input.isPointerSteering()).toBe(true);
    // it is the new finger that steers: lifting it lets go
    p.up(2);
    expect(p.input.isPointerSteering()).toBe(false);
    expect(p.input.isScrubInputActive()).toBe(false);
  });

  it('the finger that was let go of does nothing more, even when its lift arrives late', () => {
    const p = page();
    p.down(1, 100, 400);
    p.hide();
    p.show();
    p.move(1, 120, 420);
    expect(p.input.isPointerSteering()).toBe(false);
    p.down(2, 300, 500);
    p.up(1);
    expect(p.input.isPointerSteering()).toBe(true);
  });

  it('a second finger still neither takes over nor double-taps while the first is down', () => {
    const p = page();
    p.down(1, 100, 400);
    p.down(2, 100, 400);
    expect(p.sample().fireFlossRequested).toBe(false);
    p.up(2);
    expect(p.input.isPointerSteering()).toBe(true);
    p.up(1);
    expect(p.input.isPointerSteering()).toBe(false);
  });

  it('a held mouse button lets go when the page is hidden with no mouse-up', () => {
    const p = page();
    p.down(1, 100, 400, 'mouse');
    expect(p.input.isScrubInputActive()).toBe(true);
    p.hide();
    expect(p.input.isScrubInputActive()).toBe(false);
  });

  it('pausing lets go of the finger, the stick and a floss still waiting', () => {
    const p = page();
    p.down(1, 100, 400);
    p.input.setVirtualStick(1, 0, true);
    p.input.triggerVirtualFloss({ x: 1, z: 0 });
    p.input.triggerVirtualRinse();
    p.input.triggerVirtualDisclose();

    p.input.releaseAllPointers(); // what the stage HUD does on pause

    const cmd = p.sample();
    expect(cmd.moveX).toBe(0);
    expect(cmd.moveZ).toBe(0);
    expect(cmd.scrubHeld).toBe(false);
    expect(cmd.fireFlossRequested).toBe(false);
    expect(cmd.fireRinseRequested).toBe(false);
    expect(cmd.fireDiscloseRequested).toBe(false);
    // a tap straight after is one tap, not the second half of a double-tap
    p.down(2, 100, 400);
    expect(p.sample().fireFlossRequested).toBe(false);
  });
});

describe('the finger that turns the view, and the one that rubs a tooth, let go too', () => {
  it('losing focus lets go of the finger that turns the view', () => {
    const p = page('HUB');
    p.down(1, 100, 400);
    p.move(1, 140, 400);
    expect(p.orbitDrags.length).toBe(1);

    p.blur();
    p.move(1, 180, 400);
    expect(p.orbitDrags.length).toBe(1);
  });

  it('a hidden page lets go of the finger that turns the view', () => {
    const p = page('BRUSH_ALONG');
    p.down(1, 100, 400);
    p.hide();
    p.show();
    p.move(1, 180, 400);
    expect(p.orbitDrags.length).toBe(0);
    // a new finger turns it
    p.down(2, 100, 400);
    p.move(2, 140, 400);
    expect(p.orbitDrags.length).toBe(1);
  });

  it('a rub on a tooth ends once, as if the finger had lifted', () => {
    const p = page('HUB');
    p.setRubTheTooth(true);
    p.down(1, 100, 400);
    p.move(1, 110, 400);
    expect(p.canvasPhases).toEqual(['down', 'move']);

    p.hide();
    expect(p.canvasPhases).toEqual(['down', 'move', 'up']);
    // nothing more from that finger, not even when its lift arrives after all
    p.move(1, 120, 400);
    p.up(1);
    expect(p.canvasPhases).toEqual(['down', 'move', 'up']);
  });
});

describe('the Floss ring lets go of its finger', () => {
  /** The ring as the HUD binds it, with the flosses it fired (null = automatic aim). */
  function ring(options: { captureThrows?: boolean } = {}) {
    const borders: string[] = [];
    const el = {
      ...target(),
      setPointerCapture: () => {
        if (options.captureThrows) throw new Error('InvalidStateError');
      },
      style: {
        set borderColor(value: string) {
          borders.push(value);
        },
        removeProperty: () => borders.push(''),
      },
    };
    const flosses: Array<{ x: number; z: number } | null> = [];
    const release = bindFlossRing(el as unknown as HTMLElement, (aim) => flosses.push(aim));
    const pointer = (id: number, x: number, y: number) => ({ pointerId: id, clientX: x, clientY: y, button: 0 });
    return {
      flosses,
      release,
      lit: () => borders.length > 0 && borders[borders.length - 1] !== '',
      down: (id: number, x = 0, y = 0) => el.fire('pointerdown', pointer(id, x, y)),
      up: (id: number, x = 0, y = 0) => el.fire('pointerup', pointer(id, x, y)),
      cancel: (id: number) => el.fire('pointercancel', pointer(id, 0, 0)),
    };
  }

  it('finger down, page hidden with no cancel and no blur: the next finger down flosses', () => {
    const r = ring();
    r.down(5);
    expect(r.lit()).toBe(true);

    r.release(); // what the stage HUD does when the page is hidden, loses focus or pauses
    expect(r.lit()).toBe(false);

    r.down(6);
    r.up(6);
    expect(r.flosses).toEqual([null]);
  });

  it('the finger that was let go of does not floss when it lifts after all', () => {
    const r = ring();
    r.down(5);
    r.release();
    r.up(5, 40, 0);
    expect(r.flosses).toEqual([]);
  });

  it('holds one finger at a time, and lets go on a lift or a cancel', () => {
    const r = ring();
    r.down(5);
    r.down(6);
    r.up(6);
    expect(r.flosses).toEqual([]);
    r.up(5);
    expect(r.flosses).toEqual([null]);

    r.down(7);
    r.cancel(7);
    expect(r.flosses).toEqual([null]);
    r.down(8);
    r.up(8);
    expect(r.flosses).toEqual([null, null]);
  });

  it('a tap aims by itself and a drag aims the way it was dragged', () => {
    const r = ring();
    r.down(1, 10, 10);
    r.up(1, 14, 10);
    r.down(2, 10, 10);
    r.up(2, 10, 50);
    expect(r.flosses).toEqual([null, { x: 0, z: 1 }]);
  });

  it('takes the finger even when the browser refuses to capture it', () => {
    const r = ring({ captureThrows: true });
    expect(() => r.down(1)).not.toThrow();
    r.up(1);
    expect(r.flosses).toEqual([null]);
  });
});

// The parts that cannot run here (the stage HUD needs a real page; the native coordinator and its
// views are in the app, not in the tested package) are checked as written.
describe('everything that holds a finger is told to let go', () => {
  const read = (path: string) => readFileSync(path, 'utf8');
  /** The text of `source` from `start` up to the next `end`. */
  const between = (source: string, start: string, end: string): string => {
    const from = source.indexOf(start);
    expect(from, start).toBeGreaterThanOrEqual(0);
    const to = source.indexOf(end, from + start.length);
    expect(to, end).toBeGreaterThan(from);
    return source.slice(from, to);
  };

  it('the stage HUD lets go on pause, on a hidden page and on a lost window (source text)', () => {
    const hud = read('src/ui/TelemetryHudOverlay.ts');
    const pause = between(hud, '  setPaused(p: boolean): void {', '\n  }\n');
    expect(pause).toContain('this.releaseHeldControls();');
    expect(pause).toContain('this.input.releaseAllPointers();');
    expect(between(hud, 'private visibilityHandler = ', '\n  };')).toContain('this.releaseHeldControls();');
    expect(between(hud, 'private blurHandler = ', '\n  };')).toContain('this.releaseHeldControls();');
    const held = between(hud, '  releaseHeldControls(): void {', '\n  }\n');
    expect(held).toContain('this.releaseThumbPad?.();');
    expect(held).toContain('this.releaseFlossRing?.();');
    expect(hud).toContain('this.releaseFlossRing = bindFlossRing(ring,');
  });

  it('no control takes hold of a pointer without a guard: a refusal must not stop the touch (source text)', () => {
    for (const file of ['src/ui/TelemetryHudOverlay.ts', 'src/ui/hudHelpers.ts', 'src/engine/InputManager.ts']) {
      const source = read(file);
      const all = source.match(/\.setPointerCapture\(/g)?.length ?? 0;
      const guarded = source.match(/try \{\s*[\w.]+\.setPointerCapture\(/g)?.length ?? 0;
      expect(guarded, file).toBe(all);
    }
  });

  it('a change of screen and the Android app leaving the screen let go (source text)', () => {
    const main = read('src/main.ts');
    expect(between(main, '  function switchMode(next: AppMode): void {', 'sound.stopScrub();')).toContain('input.releaseAllPointers();');
    const background = between(main, 'onNativeLifecycleChanged((active) => {', '} else {');
    expect(background).toContain('input.releaseAllPointers();');
    expect(background).toContain('activeTelemetryHud?.releaseHeldControls();');
  });

  it('the native stage is paused by its card and never left paused (source text)', () => {
    const hud = read('native-apple/MouthLifeApp/UI/ArcadeHudView.swift');
    expect(hud).toContain('.onChange(of: isPausedSheet) { _, paused in');
    // The card never pauses by appearing; a HUD built anew may only say "not paused".
    expect(hud).not.toMatch(/\.on(Appear|Disappear) \{ onPauseChanged\(true/);
    expect(hud).not.toContain('.onDisappear { onPauseChanged');
    expect(hud).toContain('.onAppear { onPauseChanged(false) }');

    const coordinator = read('native-apple/MouthLifeApp/AppCoordinator.swift');
    // one writer of the stage's pause
    expect(coordinator.match(/sceneController\.arcadePaused = /g)?.length).toBe(1);
    // both launches take the pause off before the stage is mounted
    const mounts = coordinator.match(/setStagePause\(false, by: #"a new stage"#\)\n\s*sceneController\.mountStage\(for: session\)/g);
    expect(mounts?.length).toBe(2);
    expect(coordinator.match(/sceneController\.mountStage\(/g)?.length).toBe(2);
    // ...and so do going Home, every change of screen and a finale
    expect(between(coordinator, '    public func returnToHub() {', '\n    }\n')).toContain('setStagePause(false, by:');
    expect(between(coordinator, '    private func transition(to next: AppMode) {', '\n    }\n')).toContain('setStagePause(false, by:');
    expect(between(coordinator, '    private func playFinale(', '\n    }\n')).toContain('setStagePause(false, by:');
  });

  it('the native 3D view keeps no touch object and lets go by itself (source text)', () => {
    const view = read('native-apple/MouthLifeApp/Render/MouthLife3DViewport.swift');
    expect(view).not.toMatch(/var \w+: UITouch\?/);
    expect(view).toContain('private var owner = ScenePointerOwner()');
    expect(view).toContain('UIApplication.willResignActiveNotification');
    expect(view).toContain('NSApplication.didResignActiveNotification');
    expect(view).toContain('NSWindow.didResignKeyNotification');
    expect(view.match(/didSet \{ if finaleShowing && !oldValue \{ letGo(OfMouse)?\(\) \} \}/g)?.length).toBe(2);
  });
});
