import './styles/main.css';
import { ClockController } from './engine/ClockController';
import { CompanionArchSim } from './engine/companion/CompanionArchSim';
import { CompanionTouchSystem } from './engine/companion/CompanionTouchSystem';
import { EventBus } from './engine/EventBus';
import { type CanvasPointerPhase, InputManager } from './engine/InputManager';
import { sampleTerrainHeight } from './engine/physics/CollisionSystem';
import { SAVE_STORAGE_KEY, SaveSystem } from './engine/persistence/SaveSystem';
import { SceneManager } from './engine/render/SceneManager';
import { WorldSession } from './engine/sim/WorldSession';
import { SoundEngine } from './engine/audio/SoundEngine';
import type { AppMode, OverlayView } from './engine/types';
import { BrushAlongOverlay } from './ui/BrushAlongOverlay';
import { CompanionHubOverlay } from './ui/CompanionHubOverlay';
import { CosmicIntroOverlay } from './ui/CosmicIntroOverlay';
import {
  type MissionReportData,
  MissionReportOverlay,
} from './ui/MissionReportOverlay';
import { TelemetryHudOverlay } from './ui/TelemetryHudOverlay';
import { getCartridgeById } from './worlds/worldRegistry';

declare global {
  interface Window {
    __MOUTHLIFE_DEBUG__?: {
      getMode: () => AppMode;
      getDrawCalls: () => number;
      getQualityTier: () => string;
      getAudioState: () => string;
      getSave: () => unknown;
      session: WorldSession;
      sceneMgr: SceneManager;
      saveSys: SaveSystem;
      input: InputManager;
      touch: CompanionTouchSystem;
      getHud: () => TelemetryHudOverlay | null;
      switchMode: (next: AppMode) => void;
    };
  }
}

function bootstrapMouthLife(): void {
  const canvas = document.getElementById('mouthlife-canvas') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root') as HTMLElement | null;
  if (!canvas || !uiRoot) return;

  // Step 1: EventBus & Save Hydration + Offline Smooth Bask / Saliva Stasis Reconciliation
  const bus = new EventBus();
  const saveSys = new SaveSystem(bus);
  const initialSave = saveSys.load(Date.now());
  CompanionArchSim.reconcileOfflineElapsed(initialSave.companion, Date.now());
  saveSys.save(initialSave, Date.now());

  window.addEventListener('storage', (ev) => {
    if (ev.key === SAVE_STORAGE_KEY) {
      saveSys.reconcileExternalStorageEvent(ev.newValue, Date.now());
    }
  });

  // Step 2: Clock, Procedural Audio & Simulation Session
  const clock = new ClockController(bus);
  const sound = new SoundEngine();
  sound.bindGlobalUnlockListeners();
  const session = new WorldSession(bus);

  // Step 3: Modest-GPU 3D SceneManager & InputManager
  const sceneMgr = new SceneManager(canvas, bus);
  if (!sceneMgr.webglAvailable) {
    uiRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-sheet" style="text-align:center;">
          <h2>WebGL 3D Hardware Acceleration Required</h2>
          <p style="color:#cbd5e1;font-size:0.88rem;">
            MouthLife uses a lightweight single-pass 3D enamel shader. Please enable hardware acceleration in your browser settings and reload.
          </p>
        </div>
      </div>
    `;
    return;
  }
  sceneMgr.setQualityPreference(saveSys.getSave().qualityPreference);

  const input = new InputManager(canvas);
  const touch = new CompanionTouchSystem();
  sceneMgr.attachCompanionTouch(touch);
  let lastNowSec = 0;
  let activeHub: CompanionHubOverlay | null = null;

  let currentMode: AppMode = saveSys.getSave().hasSeenCosmicIntro ? 'HUB' : 'COSMIC_INTRO';
  let activeOverlay: OverlayView | null = null;
  let activeTelemetryHud: TelemetryHudOverlay | null = null;
  let activePacerQuadrant = -1;
  let lastPlayedWorldId = 'world_1';
  let lastReport: MissionReportData | null = null;

  // Direct touch-the-teeth Smooth Bask toy (HUB companion & REPORT) + 3D globe city picking
  function handleCanvasPointer(
    phase: CanvasPointerPhase,
    clientX: number,
    clientY: number,
    ndcX: number,
    ndcY: number
  ): boolean {
    if (currentMode === 'HUB' && sceneMgr.getHubFocus() === 'globe') {
      if (phase !== 'down') return true;
      const cityId = sceneMgr.pickCityAtScreen(clientX, clientY);
      if (cityId && activeHub) {
        activeHub.selectCityFromGlobe(cityId);
        return true;
      }
      return false;
    }

    const companionMode =
      (currentMode === 'HUB' && sceneMgr.getHubFocus() === 'companion') || currentMode === 'REPORT';
    if (!companionMode) return false;

    if (phase === 'up') {
      touch.endTouch();
      return true;
    }
    const hit = sceneMgr.raycastCompanionTeeth(ndcX, ndcY);
    if (!hit) {
      if (phase === 'down') return false; // empty space → orbit drag instead
      touch.endTouch();
      return true;
    }

    const save = saveSys.getSave();
    const smoothness = currentMode === 'REPORT' ? 98 : save.companion.smoothnessIndex;
    const fb = touch.registerTouch(
      { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      phase,
      lastNowSec,
      smoothness
    );

    if (fb.sound === 'glass') sound.playGlassHarpNote(fb.noteStep);
    else if (fb.sound === 'thud') sound.playSquishThud();

    if (fb.sparkle) {
      sceneMgr.entityBatch.spawnBurst({
        x: hit.point.x + hit.normal.x * 0.15,
        y: hit.point.y + hit.normal.y * 0.15,
        z: hit.point.z + hit.normal.z * 0.15,
        count: fb.splatsCleared > 0 ? 14 : 6,
        speed: fb.splatsCleared > 0 ? 3.2 : 1.8,
        colorHex: fb.noteStep % 2 === 0 ? 0x5eead4 : 0xe0f2fe,
        size: 0.42,
        life: 0.55,
        upward: 0.9,
      });
    } else if (fb.sound === 'thud') {
      sceneMgr.entityBatch.spawnBurst({
        x: hit.point.x,
        y: hit.point.y,
        z: hit.point.z,
        count: 3,
        speed: 0.9,
        colorHex: fb.onSplat ? 0xf9a8d4 : 0xd9e35b,
        size: 0.35,
        life: 0.4,
        upward: 0.4,
      });
    }

    if (fb.splatsCleared > 0 && currentMode === 'HUB') {
      CompanionArchSim.applyMiniPolish(save.companion, fb.splatsCleared, Date.now());
      saveSys.save(save);
      bus.emit('companion:updated', { state: save.companion });
      sound.playSmoothBaskSparkle();
      if (touch.activeSplatCount === 0) {
        activeHub?.setStatusBanner('✨ Sugar splats polished away! Mirror-wet enamel restored a little.');
      }
    }
    return true;
  }

  input.setHooks({
    onUserGesture: () => sound.unlockOnGesture(),
    onOrbitDrag: (dYaw, dPitch) => sceneMgr.nudgeCompanionOrbit(dYaw, dPitch),
    getMode: () => currentMode,
    onCanvasPointer: handleCanvasPointer,
  });

  function splatRegionalTreatOnTeeth(): number {
    const anchors = sceneMgr.getCompanionSplatAnchors();
    const splats = touch.spawnTreatSplats(anchors, 3, Date.now());
    splats.forEach((sp, i) => {
      window.setTimeout(() => {
        sound.playSugarSplat();
        sceneMgr.entityBatch.spawnBurst({
          x: sp.x,
          y: sp.y,
          z: sp.z,
          count: 10,
          speed: 2.4,
          colorHex: i % 2 === 0 ? 0xf9a8d4 : 0xfcd34d,
          size: 0.5,
          life: 0.5,
          upward: 0.6,
        });
      }, i * 140);
    });
    sceneMgr.addTrauma(0.14, 1.0);
    return touch.activeSplatCount;
  }

  // Step 4: Wire Simulation Events to Audio, Particles & Save Persistence
  bus.on('actuator:scrub', ({ cleanRatio, acidWarn }) => {
    sound.updateScrubState(true, cleanRatio, acidWarn);
  });

  bus.on('floss:sliced', ({ to, targetsHit, zipped }) => {
    sound.playFlossSnap(targetsHit, zipped);
    sceneMgr.entityBatch.spawnBurst({
      x: to.x,
      y: session.probeY + 0.6,
      z: to.z,
      count: zipped ? 16 : 9,
      speed: 4.5,
      colorHex: 0x67e8f9,
    });
  });

  bus.on('rinse:surged', ({ origin }) => {
    sound.playIonRinseWave();
    sceneMgr.entityBatch.spawnBurst({
      x: origin.x,
      y: session.probeY + 0.7,
      z: origin.z,
      count: 28,
      speed: 6.2,
      colorHex: 0x2dd4bf,
      life: 0.9,
    });
  });

  bus.on('disclose:pulsed', ({ origin }) => {
    sound.playDisclosePulse();
    sceneMgr.entityBatch.spawnBurst({
      x: origin.x,
      y: session.probeY + 0.6,
      z: origin.z,
      count: 14,
      speed: 5.0,
      colorHex: 0xf472b6,
    });
  });

  bus.on('site:restored', ({ pos }) => {
    sound.playSiteRestored();
    sceneMgr.entityBatch.spawnBurst({
      x: pos.x,
      y: 1.5,
      z: pos.z,
      count: 18,
      speed: 4.2,
      colorHex: 0x5eead4,
    });
  });

  bus.on('district:sealed', () => {
    sound.playDistrictSealed();
    sceneMgr.entityBatch.spawnBurst({
      x: session.probePos.x,
      y: session.probeY + 0.8,
      z: session.probePos.z,
      count: 36,
      speed: 7.5,
      colorHex: 0x5eead4,
      life: 1.0,
    });
  });

  bus.on('sucrose:shattered', ({ pos }) => {
    sound.playCrystalShatter();
    const y = session.cartridge ? sampleTerrainHeight(session.cartridge, pos.x, pos.z) : 0.5;
    sceneMgr.entityBatch.spawnShatter(pos.x, y, pos.z, 12);
  });

  bus.on('stephan:sip', () => {
    sound.playAcidSip();
  });

  bus.on('stephan:buffered', ({ pos }) => {
    sceneMgr.entityBatch.spawnBurst({
      x: pos.x,
      y: session.probeY + 0.6,
      z: pos.z,
      count: 16,
      speed: 3.8,
      colorHex: 0x38bdf8,
    });
  });

  bus.on('gum:tender', () => {
    sound.playGumTender();
  });

  // Brush-Along & winning dives clear Regional Treat sugar splats from the Companion teeth
  bus.on('pacer:tick', ({ elapsedSec }) => {
    const cap = Math.max(0, 1 - elapsedSec / 40);
    for (const sp of touch.splats) sp.amount = Math.min(sp.amount, cap);
  });
  bus.on('pacer:complete', () => touch.clearAll());

  bus.on('beacon:collected', ({ pos }) => {
    saveSys.consumeSingleSupplyBeacon();
    sound.playSmoothBaskSparkle();
    sceneMgr.entityBatch.spawnBurst({
      x: pos.x,
      y: 1.4,
      z: pos.z,
      count: 16,
      speed: 4.0,
      colorHex: 0xfde047,
    });
  });

  bus.on('mission:complete', ({ mode, worldId, won, breakdown }) => {
    sound.updateScrubState(false, 1, false);
    sound.playDistrictSealed();

    const save = saveSys.getSave();
    let bonusRescueIons = 0;

    if (mode === 'PULP_RESCUE') {
      const rescueOutcome = CompanionArchSim.resolvePulpRescue(save.companion, won, Date.now());
      bonusRescueIons = rescueOutcome.ionsAwarded;
      save.fluorideIons += bonusRescueIons;
      saveSys.save(save);
    } else if (won) {
      CompanionArchSim.restoreFullSmoothBask(save.companion, Date.now());
    }
    if (won) touch.clearAll();

    const cart = getCartridgeById(worldId);
    const { unlockedHistoryNoteId } = saveSys.recordMissionCompletion({
      mode,
      worldId,
      won,
      breakdown,
      historyNoteIds: cart.historyNoteIds,
    });

    lastReport = {
      mode,
      worldId,
      won,
      breakdown,
      unlockedHistoryNoteId,
      bonusRescueIons,
    };
    switchMode('REPORT');
  });

  // Step 5: Mode Transition Orchestrator
  function launchPlayableStage(worldId: string, mode: 'ARCADE' | 'PULP_RESCUE'): void {
    lastPlayedWorldId = worldId;
    const cartridge = getCartridgeById(worldId);
    session.loadCartridge(cartridge, saveSys.getSave(), mode);
    sceneMgr.mountCartridgeMesh(cartridge, session);

    sound.playOrbitalDive();
    switchMode(mode);
    sceneMgr.beginDiveTransition(cartridge.probeSpawn.x, cartridge.probeSpawn.z, () => {
      // Dive complete — input automatically ungated!
    });
  }

  function switchMode(next: AppMode): void {
    const prev = currentMode;
    currentMode = next;

    activeOverlay?.dispose();
    activeOverlay = null;
    activeTelemetryHud = null;
    activeHub = null;
    touch.endTouch();
    uiRoot!.innerHTML = '';

    sound.updateScrubState(false, 0, false);
    sound.setAmbientMode(next);
    sceneMgr.setMode(next);
    bus.emit('mode:changed', { from: prev, to: next });

    if (next === 'COSMIC_INTRO') {
      sceneMgr.earthBackdrop.setMohsSelected(2);
      activeOverlay = new CosmicIntroOverlay({
        onBeatChanged: (beatIdx) => {
          sceneMgr.setCosmicBeat(beatIdx);
          sound.playCosmicBeatChime(beatIdx);
        },
        onMohsSelected: (mohsIdx) => {
          sound.playMohsSpecimenTone(mohsIdx);
          sceneMgr.earthBackdrop.setMohsSelected(mohsIdx);
        },
        onFinishOrSkip: () => {
          const s = saveSys.getSave();
          s.hasSeenCosmicIntro = true;
          saveSys.save(s);
          sound.playSmoothBaskSparkle();
          switchMode('HUB');
        },
        isMuted: () => sound.isMuted(),
        onToggleMute: () => sound.setMuted(!sound.isMuted()),
      });
    } else if (next === 'HUB') {
      activeHub = new CompanionHubOverlay(bus, saveSys, {
        onTabChanged: (tab, cityId) => {
          sceneMgr.setHubFocus(tab);
          sceneMgr.setMode('HUB');
          if (tab === 'globe') {
            sceneMgr.earthBackdrop.focusOnCity(cityId);
          }
        },
        onLaunchArcadeWorld: (wId) => launchPlayableStage(wId, 'ARCADE'),
        onLaunchPulpRescue: () => launchPlayableStage('pulp_rescue', 'PULP_RESCUE'),
        onLaunchBrushAlong: () => {
          sound.playUiTap();
          switchMode('BRUSH_ALONG');
        },
        onReplayCosmicIntro: () => {
          sound.playCosmicBeatChime(0);
          switchMode('COSMIC_INTRO');
        },
        onPlaySparkleSfx: () => sound.playSmoothBaskSparkle(),
        onPlayTreatSfx: () => sound.playTreatSnack(),
        onTreatSplat: () => splatRegionalTreatOnTeeth(),
        getSplatCount: () => touch.activeSplatCount,
        onPlayUiTap: () => sound.playUiTap(),
        isMuted: () => sound.isMuted(),
        onToggleMute: () => sound.setMuted(!sound.isMuted()),
      });
      activeOverlay = activeHub;
    } else if (next === 'ARCADE' || next === 'PULP_RESCUE') {
      const hud = new TelemetryHudOverlay(
        next,
        bus,
        session,
        input,
        sceneMgr,
        saveSys,
        () => switchMode('HUB')
      );
      activeTelemetryHud = hud;
      activeOverlay = hud;
    } else if (next === 'BRUSH_ALONG') {
      activeOverlay = new BrushAlongOverlay(bus, clock, saveSys, {
        onActiveQuadrantChanged: (q) => {
          activePacerQuadrant = q;
        },
        onPlayCue: (kind) => sound.playPacerCue(kind),
        onExitToHub: () => switchMode('HUB'),
      });
    } else if (next === 'REPORT' && lastReport) {
      const repMode = lastReport.mode;
      activeOverlay = new MissionReportOverlay(lastReport, {
        onReturnToHub: () => switchMode('HUB'),
        onReplay: () => launchPlayableStage(lastPlayedWorldId, repMode),
      });
    }

    activeOverlay?.mount(uiRoot!);
  }

  // Step 6: Bind Fixed-Step Simulation & Render Loop
  clock.setCallbacks(
    (fixedDt) => {
      if (currentMode === 'ARCADE' || currentMode === 'PULP_RESCUE') {
        const cmd = input.sampleSessionCommand(
          sceneMgr.camera,
          session.probePos,
          session.probeY,
          sceneMgr.isTransitioning()
        );
        session.step(fixedDt, cmd);
        sound.updateScrubState(
          cmd.scrubHeld && !sceneMgr.isTransitioning(),
          session.grid.getWorldCleanRatio(),
          false
        );
      }
    },
    (frameDt, nowSec) => {
      lastNowSec = nowSec;
      touch.step(frameDt);
      activeTelemetryHud?.tickHud(frameDt);
      const scrubbingActive =
        (currentMode === 'ARCADE' || currentMode === 'PULP_RESCUE') &&
        !sceneMgr.isTransitioning() &&
        input.isScrubInputActive();

      sceneMgr.renderFrame({
        frameDt,
        nowSec,
        session,
        companion: saveSys.getSave().companion,
        scrubbingActive,
        activePacerQuadrant,
      });
    }
  );

  // Step 7: Mount Initial Mode & Expose Clean DevTools Diagnostics Hook
  switchMode(currentMode);
  clock.start();

  window.__MOUTHLIFE_DEBUG__ = {
    getMode: () => currentMode,
    getDrawCalls: () => sceneMgr.getLastDrawCalls(),
    getQualityTier: () => sceneMgr.getActiveQualityTier(),
    getAudioState: () => sound.getAudioState(),
    getSave: () => saveSys.getSave(),
    session,
    sceneMgr,
    saveSys,
    input,
    touch,
    getHud: () => activeTelemetryHud,
    switchMode,
  };
}

bootstrapMouthLife();
