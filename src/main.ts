import './styles/main.css';
import './styles/tutorial.css';
import { ClockController } from './engine/ClockController';
import { CompanionArchSim } from './engine/companion/CompanionArchSim';
import { CompanionTouchSystem } from './engine/companion/CompanionTouchSystem';
import { EventBus } from './engine/EventBus';
import { type CanvasPointerPhase, InputManager } from './engine/InputManager';
import { sampleTerrainHeight } from './engine/physics/CollisionSystem';
import { SAVE_GENERATION_KEY, SAVE_STORAGE_KEY, SaveSystem } from './engine/persistence/SaveSystem';
import { readIncludeRinse } from './engine/persistence/pacerPrefs';
import { requestMotionPermissionIfNeeded } from './engine/motionPermission';
import { SceneManager } from './engine/render/SceneManager';
import { WorldSession } from './engine/sim/WorldSession';
import { SoundEngine } from './engine/audio/SoundEngine';
import { scrubMayPlay } from './engine/audio/scrubGate';
import { synergyRankIndex } from './engine/audio/musicTheory';
import { HOST_CITIES } from './config/hostsAndHistory';
import { getUpgradeById } from './config/upgrades';
import { TutorialGate, type TutorialPageId } from './config/tutorial';
import type { AppMode, OverlayView } from './engine/types';
import { BrushAlongOverlay } from './ui/BrushAlongOverlay';
import { VoiceCoach } from './engine/audio/VoiceCoach';
import { uiTranslator, warmAllLanguagePacks } from './i18n/uiTranslator';
import { allTutorialImageUrls } from './ui/TutorialOverlay';
import { installParentGate } from './ui/parentGate';
import { evaluateBrushPhase } from './config/brushCoach';
import { CompanionHubOverlay } from './ui/CompanionHubOverlay';
import { CosmicIntroOverlay } from './ui/CosmicIntroOverlay';
import {
  type MissionReportData,
  MissionReportOverlay,
} from './ui/MissionReportOverlay';
import { TelemetryHudOverlay } from './ui/TelemetryHudOverlay';
import { CityFinaleOverlay } from './ui/CityFinaleOverlay';
import { molarFinishForGrade, type MolarFinish } from './config/cityFinale';
import { shouldHandleGlobalMuteKey } from './ui/hudHelpers';
import { getCartridgeById } from './worlds/worldRegistry';

export const CAMPAIGN_WORLD_IDS = ['world_1', 'world_2', 'world_3', 'world_4', 'world_5'];

declare global {
  interface Window {
    __MOUTHLIFE_DEBUG__?: {
      getMode: () => AppMode;
      clock: ClockController;
      getDrawCalls: () => number;
      getQualityTier: () => string;
      getAudioState: () => string;
      getAudioDebug: () => Record<string, unknown>;
      sound: SoundEngine;
      getSave: () => unknown;
      session: WorldSession;
      sceneMgr: SceneManager;
      saveSys: SaveSystem;
      input: InputManager;
      touch: CompanionTouchSystem;
      getHud: () => TelemetryHudOverlay | null;
      switchMode: (next: AppMode) => void;
      launchStage: (worldId: string, mode?: 'ARCADE' | 'PULP_RESCUE') => void;
      /** Plays a city's finale (or the ending) straight away, for checking it. */
      playFinale: (kind: 'city' | 'ending' | 'city+ending', worldIndex?: number, finishes?: MolarFinish[]) => void;
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

  // Another tab saved or erased: merge its save in (never just the newer revision number, H01).
  window.addEventListener('storage', (ev) => {
    if (ev.key === SAVE_STORAGE_KEY || ev.key === SAVE_GENERATION_KEY || ev.key === null) {
      saveSys.refreshFromStorage(Date.now());
    }
  });

  // Step 2: Clock, Procedural Audio & Simulation Session
  const clock = new ClockController(bus);
  const sound = new SoundEngine();
  const voiceCoach = new VoiceCoach();
  voiceCoach.onSpeakingChanged = (speaking) => sound.setVoiceDucked(speaking);
  // Mute silences the coach too, and the effects slider sets how loud it speaks.
  voiceCoach.soundLevel = () => {
    const prefs = sound.getPrefs();
    if (prefs.muted || prefs.sfxVolume <= 0.001) return 0;
    return Math.max(0.35, Math.min(1, prefs.sfxVolume * 1.6));
  };
  // One language for the whole game: screens, and the spoken brushing coach.
  uiTranslator.attach(document.body);
  void uiTranslator.setLanguage(voiceCoach.getLanguage());
  voiceCoach.onLanguageChanged = (language) => void uiTranslator.setLanguage(language);
  sound.onPrefsChanged = (prefs) => bus.emit('audio:changed', prefs);
  sound.bindGlobalUnlockListeners();
  window.addEventListener('keydown', (ev) => {
    if (shouldHandleGlobalMuteKey(ev, ev.target)) {
      sound.unlockOnGesture();
      sound.setMuted(!sound.isMuted());
    }
  });
  const session = new WorldSession(bus);

  // Step 3: Modest-GPU 3D SceneManager & InputManager
  const sceneMgr = new SceneManager(canvas, bus);
  if (!sceneMgr.webglAvailable) {
    uiRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-sheet" style="text-align:center;">
          <h2>3D Graphics Are Turned Off</h2>
          <p style="color:#cbd5e1;font-size:0.88rem;">
            MouthLife needs 3D graphics. Turn on hardware acceleration in your browser settings, then reload.
          </p>
        </div>
      </div>
    `;
    return;
  }
  // Graphics quality is automatic: the game watches its own frame rate and adjusts. The manual
  // picker was removed, so a fixed choice saved earlier goes back to automatic.
  if (saveSys.getSave().qualityPreference !== 'auto') saveSys.setQualityPreference('auto');
  sceneMgr.setQualityPreference('auto');

  const input = new InputManager(canvas);
  const touch = new CompanionTouchSystem();
  sceneMgr.attachCompanionTouch(touch);
  let lastNowSec = 0;
  let activeHub: CompanionHubOverlay | null = null;

  // How to Play guide: offered on the first few launches, then kept behind the hub ? button.
  const tutorialGate = new TutorialGate();
  /** Tapping a demo in the guide plays the sound that control makes in the game. */
  function playTutorialDemoSound(pageId: TutorialPageId): void {
    if (pageId === 'home') sound.playGlassHarpNote(4);
    else if (pageId === 'brush') sound.playPacerCue('quadrant');
    else if (pageId === 'dive') sound.playSiteRestored();
    else if (pageId === 'cleaner') sound.playSurgeReady();
    else if (pageId === 'floss') sound.playFlossSnap(1, false);
    else if (pageId === 'surge') sound.playIonRinseWave();
    else if (pageId === 'scan') sound.playDisclosePulse();
    else if (pageId === 'cities') sound.playSynergyRankUp(2);
    else sound.playSmoothBaskSparkle();
  }

  let currentMode: AppMode = saveSys.getSave().hasSeenCosmicIntro ? 'HUB' : 'COSMIC_INTRO';
  let activeOverlay: OverlayView | null = null;
  let activeTelemetryHud: TelemetryHudOverlay | null = null;
  let activePacerQuadrant = -1;
  let lastPlayedWorldId = 'world_1';
  let lastReport: MissionReportData | null = null;
  /** A city finale is playing: the game is frozen behind it. */
  let finaleActive = false;
  /** The finale covers the whole screen, so the 3D scene need not draw. */
  let sceneHidden = false;
  let finaleOverlay: CityFinaleOverlay | null = null;
  // A Reduce Motion change (the system setting or the in-app switch) reaches a finale already playing.
  bus.on('motion:changed', ({ reduced }) => finaleOverlay?.setReducedMotion(reduced));

  /** Each campaign city's piece of the Golden Molar, from the save. */
  function molarFinishes(): MolarFinish[] {
    const worlds = saveSys.getSave().worlds;
    return CAMPAIGN_WORLD_IDS.map((id) => molarFinishForGrade(worlds[id]?.bestGrade, Boolean(worlds[id]?.completed)));
  }

  /**
   * Plays a finale over whatever is on screen, then calls `then`. For a city, the game's HUD is
   * taken down first and the score follows; the ending alone (from the main menu) leaves the menu
   * underneath and simply uncovers it.
   */
  function playFinale(
    kind: 'city' | 'ending' | 'city+ending',
    worldIndex: number,
    finishes: MolarFinish[],
    then: () => void
  ): void {
    finaleOverlay?.dispose();
    if (kind !== 'ending') {
      activeOverlay?.dispose();
      activeOverlay = null;
      activeTelemetryHud = null;
      touch.endTouch();
      uiRoot!.innerHTML = '';
    }
    finaleActive = true;
    sound.stopScrub();
    sound.setFinaleDucked(true);
    const overlay = new CityFinaleOverlay({
      kind,
      worldIndex,
      finishes,
      reducedMotion: sceneMgr.isReducedMotion(),
      onNotes: (notes) => sound.playFinaleNotes(notes),
      onCovered: (covered) => {
        sceneHidden = covered;
      },
      hasTrack: (part) => sound.hasFinaleTrack(part === 'ending' ? -1 : worldIndex),
      onTrack: (part, offsetSec) => {
        if (part === null) sound.stopFinaleTrack();
        else sound.playFinaleTrack(part === 'ending' ? -1 : worldIndex, offsetSec);
      },
      onDone: () => {
        overlay.dispose();
        if (finaleOverlay === overlay) finaleOverlay = null;
        finaleActive = false;
        sceneHidden = false;
        sound.setFinaleDucked(false);
        then();
      },
    });
    finaleOverlay = overlay;
    overlay.mount(kind === 'ending' ? document.body : uiRoot!);
  }

  /** Watch the Ending from Home waits at most this long for its recording, then the synth plays it. */
  const ENDING_REPLAY_WAIT_MS = 1500;
  let endingReplayPending = false;
  /**
   * Watch the Ending from Home, even straight after a reload: the bundled recording is got ready
   * first (a short, bounded wait), so the replay plays it; if it is slow or fails, the synth does.
   */
  function replayEnding(): void {
    if (endingReplayPending || finaleOverlay) return;
    endingReplayPending = true;
    void sound.prepareFinaleTrack(-1, ENDING_REPLAY_WAIT_MS).then(() => {
      endingReplayPending = false;
      // left Home meanwhile (or something else took the screen): no ending over it
      if (currentMode !== 'HUB' || finaleOverlay) return;
      playFinale('ending', 0, molarFinishes(), () => {});
    });
  }

  // Direct touch-the-teeth Smooth Bask toy (HUB companion & REPORT) + 3D globe city picking
  let lastEmptyTapMs = 0;
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
      if (phase === 'down') {
        // Double-tap the gum / empty space to smoothly recenter the 3D view
        if (lastEmptyTapMs > 0 && performance.now() - lastEmptyTapMs < 350 && currentMode === 'HUB') {
          sceneMgr.resetCompanionOrbit();
          activeHub?.setViewOffCenter(false);
          lastEmptyTapMs = 0;
        } else {
          lastEmptyTapMs = performance.now();
        }
        return false; // empty space → orbit drag instead
      }
      touch.endTouch();
      return true;
    }

    if (currentMode === 'HUB') {
      activeHub?.notifyToothTouched(hit.toothIndex);
      sceneMgr.highlightCompanionTooth(hit.toothIndex);
    }

    const save = saveSys.getSave();
    const smoothness =
      currentMode === 'REPORT'
        ? lastReport?.won === false
          ? save.companion.smoothnessIndex
          : Math.max(98, save.companion.smoothnessIndex)
        : save.companion.smoothnessIndex;
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
        activeHub?.setStatusBanner('✨ Sugar spots polished away! Your enamel is a bit smoother.');
      }
    }
    return true;
  }

  input.setHooks({
    onUserGesture: () => sound.unlockOnGesture(),
    // Action presses on the Pause card never fire after Resume (M12).
    isGameplayPaused: () => Boolean(activeTelemetryHud?.isPaused()),
    onOrbitDrag: (dYaw, dPitch) => {
      if (currentMode === 'COSMIC_INTRO') {
        // the native app turns 0.005 rad per point; the drag arrives at 0.007 per pixel
        sceneMgr.nudgeCosmicOrbit(dYaw * (0.005 / 0.007));
        return;
      }
      sceneMgr.nudgeCompanionOrbit(dYaw, dPitch);
      activeHub?.setViewOffCenter(sceneMgr.isCompanionOrbitOffCenter());
    },
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
  // Scrub audio is driven by ONE per-step update (see clock callback); the event only
  // accumulates newly-cleaned cells and fires the throttled acid-lockout cue.
  let pendingNewlyCleaned = 0;
  let lastSynergyRank = -1;
  bus.on('actuator:scrub', ({ newlyCleaned, acidWarn }) => {
    pendingNewlyCleaned += newlyCleaned;
    if (acidWarn) sound.playAcidWarn();
  });

  bus.on('spring:triggered', ({ pos }) => {
    sound.playSalivaSpring();
    sceneMgr.entityBatch.spawnBurst({
      x: pos.x,
      y: session.probeY + 0.55,
      z: pos.z,
      count: 10,
      speed: 3.1,
      colorHex: 0x67e8f9,
      size: 0.36,
      life: 0.55,
    });
  });
  bus.on('mutans:bumped', () => sound.playMutansBoing());
  /**
   * A big moment: freeze the sim for an instant and rumble the controller.
   * Skipped with Reduced Motion on, so the game never stutters for players who asked for calm.
   */
  const punch = (hitStopSec: number, rumble01: number, rumbleMs: number): void => {
    if (sceneMgr.isReducedMotion()) return;
    clock.requestHitStop(hitStopSec);
    input.rumble(rumble01, rumbleMs);
  };
  input.onPauseRequested = () => {
    if (activeTelemetryHud) activeTelemetryHud.setPaused(!activeTelemetryHud.isPaused());
  };
  // If the graphics card drops the 3D picture mid-mission, pause (the clock must not run behind a
  // blank screen); the player resumes from the pause card once the picture is back.
  bus.on('webgl:lost', () => {
    if ((currentMode === 'ARCADE' || currentMode === 'PULP_RESCUE') && activeTelemetryHud && !activeTelemetryHud.isPaused()) {
      activeTelemetryHud.setPaused(true);
    }
  });

  bus.on('mutans:popped', ({ pos }) => {
    sound.playMutansPop();
    sceneMgr.entityBatch.spawnBurst({
      x: pos.x,
      y: session.probeY + 0.5,
      z: pos.z,
      count: 6,
      speed: 2.2,
      colorHex: 0xbef264,
      size: 0.35,
      life: 0.4,
    });
  });
  bus.on('surge:ready', () => sound.playSurgeReady());
  bus.on('companion:updated', ({ state }) => sound.setPulpReadiness(state.pulpIntegrity));

  const missionUpgradeIds: string[] = [];
  bus.on('upgrade:unlocked', ({ upgradeId }) => {
    if (!missionUpgradeIds.includes(upgradeId)) missionUpgradeIds.push(upgradeId);
  });

  bus.on('floss:sliced', ({ to, targetsHit, zipped, epsCellsCracked }) => {
    sound.playFlossSnap(targetsHit + (epsCellsCracked > 0 ? 1 : 0), zipped, session.hasPtfeFlossUpgrade);
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
    sound.playIonRinseWave(session.hasBicarbRinseUpgrade);
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
    punch(0.035, 0.45, 90);
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
    punch(0.08, 0.9, 220);
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
    punch(0.045, 0.55, 110);
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

  bus.on('eps:deflected', ({ pos }) => {
    sound.playEpsDeflect();
    sceneMgr.entityBatch.spawnBurst({
      x: pos.x,
      y: session.probeY + 0.5,
      z: pos.z,
      count: 8,
      speed: 2.8,
      colorHex: 0xa78bfa,
      size: 0.35,
      life: 0.4,
    });
  });

  bus.on('eps:cracked', ({ pos, via }) => {
    sound.playEpsCrack();
    punch(0.06, 0.75, 160);
    const y = session.cartridge ? sampleTerrainHeight(session.cartridge, pos.x, pos.z) : 0.6;
    sceneMgr.entityBatch.spawnBurst({
      x: pos.x,
      y: y + 0.6,
      z: pos.z,
      count: via === 'rinse' ? 24 : 18,
      speed: 5.2,
      colorHex: 0x34d399,
      life: 0.75,
    });
  });

  bus.on('fluorapatite:infused', ({ pos }) => {
    sound.playFluorapatiteInfuse();
    sceneMgr.entityBatch.spawnBurst({
      x: pos.x,
      y: session.probeY + 0.65,
      z: pos.z,
      count: 20,
      speed: 4.4,
      colorHex: 0x2dd4bf,
      life: 0.8,
    });
  });

  bus.on('erosion:wash', () => {
    sound.playErosionWash();
  });

  // Brush-Along & winning dives clear Regional Treat sugar splats from the Companion teeth
  bus.on('pacer:tick', ({ elapsedSec, quadrantIdx, stage }) => {
    // Floss and rinse each switch to their own recording (the synth plays its calmer closing
    // section when no recording is available).
    sound.setPacerState(
      quadrantIdx,
      stage !== 'brushing',
      stage === 'flossBonus' ? 'floss' : stage === 'mouthwashBonus' ? 'rinse' : null
    );
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
    sound.stopScrub();
    sound.playMissionEnd(won);

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
    const prevBest = saveSys.getSave().worlds[worldId]?.bestScore ?? 0;
    const clearedBefore = CAMPAIGN_WORLD_IDS.filter((id) => saveSys.getSave().worlds[id]?.completed).length;
    const { unlockedHistoryNoteId } = saveSys.recordMissionCompletion({
      mode,
      worldId,
      won,
      breakdown,
      historyNoteIds: cart.historyNoteIds,
    });

    const after = saveSys.getSave();
    const clearedCount = CAMPAIGN_WORLD_IDS.filter((id) => after.worlds[id]?.completed).length;
    const nextId =
      mode === 'ARCADE' && won ? CAMPAIGN_WORLD_IDS[CAMPAIGN_WORLD_IDS.indexOf(worldId) + 1] : undefined;
    const hostLabel = HOST_CITIES.filter((h) => h.worldId === worldId)
      .map((h) => h.city)
      .join(' & ');
    lastReport = {
      mode,
      worldId,
      won,
      breakdown,
      unlockedHistoryNoteId,
      bonusRescueIons,
      parTimeSec: cart.parTimeSec,
      worldTitle: cart.title,
      hostCityLabel: hostLabel,
      newBest: mode === 'ARCADE' && won && breakdown.totalScore > prevBest,
      nextWorldId: nextId ?? null,
      nextWorldTitle: nextId ? getCartridgeById(nextId).title : null,
      campaignMastered: mode === 'ARCADE' && won && clearedCount >= CAMPAIGN_WORLD_IDS.length,
      unlockedUpgradeNames: missionUpgradeIds.map((id) => getUpgradeById(id)?.name ?? id),
    };
    missionUpgradeIds.length = 0;

    // A cleaned city puts on its finale before the score; the fifth one also plays the ending.
    const worldIndex = CAMPAIGN_WORLD_IDS.indexOf(worldId);
    if (mode === 'ARCADE' && won && worldIndex >= 0) {
      const justMastered = clearedBefore < CAMPAIGN_WORLD_IDS.length && clearedCount >= CAMPAIGN_WORLD_IDS.length;
      playFinale(justMastered ? 'city+ending' : 'city', worldIndex, molarFinishes(), () => switchMode('REPORT'));
      return;
    }
    switchMode('REPORT');
  });

  // Step 5: Mode Transition Orchestrator
  function launchPlayableStage(worldId: string, mode: 'ARCADE' | 'PULP_RESCUE'): void {
    lastPlayedWorldId = worldId;
    missionUpgradeIds.length = 0;
    lastSynergyRank = -1;
    pendingNewlyCleaned = 0;
    sound.setWorldContext(worldId);
    // Have this city's finale song (and, near the end of the campaign, the ending's) ready in time.
    const campaignIndex = CAMPAIGN_WORLD_IDS.indexOf(worldId);
    if (campaignIndex >= 0) {
      sound.preloadFinaleTrack(campaignIndex);
      if (molarFinishes().filter((f) => f === 'empty').length <= 1) sound.preloadFinaleTrack(-1);
    }
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
    if (finaleOverlay) {
      finaleOverlay.dispose();
      finaleOverlay = null;
      finaleActive = false;
      sceneHidden = false;
      sound.setFinaleDucked(false);
    }

    activeOverlay?.dispose();
    activeOverlay = null;
    activeTelemetryHud = null;
    activeHub = null;
    touch.endTouch();
    uiRoot!.innerHTML = '';

    sound.stopScrub();
    sound.setPaused(false);
    sound.setAmbientMode(next);
    sceneMgr.setMode(next);
    bus.emit('mode:changed', { from: prev, to: next });

    if (next === 'COSMIC_INTRO') {
      sceneMgr.earthBackdrop.setMohsSelected(2);
      activeOverlay = new CosmicIntroOverlay({
        onBeatChanged: (beatIdx) => {
          sceneMgr.setCosmicBeat(beatIdx);
          sound.setCosmicBeat(beatIdx);
          if (beatIdx > 0 || sound.getAudioState() === 'running') {
            sound.playCosmicBeatChime(beatIdx);
          }
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
        bus,
        // Only a brand-new save is offered this: a returning player already has their progress here.
        restoreSyncCode: saveSys.getSave().hasSeenCosmicIntro
          ? undefined
          : (code) => {
              try {
                // The link only shows on a brand-new save, so the code's tooth and settings come too.
                saveSys.importSyncCode(code, Date.now(), true);
              } catch (err) {
                return err instanceof Error && err.message ? err.message : 'That Sync Code could not be read.';
              }
              const s = saveSys.getSave();
              s.hasSeenCosmicIntro = true;
              saveSys.save(s);
              sound.playSmoothBaskSparkle();
              switchMode('HUB');
              activeHub?.setStatusBanner('Code imported! Your save is updated.');
              return null;
            },
      });
    } else if (next === 'HUB') {
      // a finished Golden Molar can be replayed from here: have the ending's recording on the way
      if (molarFinishes().every((f) => f !== 'empty')) sound.preloadFinaleTrack(-1);
      sound.setHubFocus('companion');
      sound.setPulpReadiness(saveSys.getSave().companion.pulpIntegrity);
      activeHub = new CompanionHubOverlay(bus, saveSys, {
        onTabChanged: (tab, cityId) => {
          sceneMgr.setHubFocus(tab);
          sound.setHubFocus(tab);
          sceneMgr.setMode('HUB');
          if (tab === 'globe') {
            sceneMgr.earthBackdrop.focusOnCity(cityId);
          }
        },
        onLaunchArcadeWorld: (wId) => launchPlayableStage(wId, 'ARCADE'),
        onLaunchPulpRescue: () => launchPlayableStage('pulp_rescue', 'PULP_RESCUE'),
        onLaunchBrushAlong: () => {
          sound.playUiTap();
          // The rinse's tilt gauge needs Safari's permission, asked from this tap (M21).
          if (readIncludeRinse() && !sceneMgr.isReducedMotion()) requestMotionPermissionIfNeeded();
          switchMode('BRUSH_ALONG');
        },
        onReplayCosmicIntro: () => {
          switchMode('COSMIC_INTRO');
        },
        onPlaySparkleSfx: () => sound.playSmoothBaskSparkle(),
        onPlayToothChime: (step) => sound.playGlassHarpNote(step),
        onHighlightCrown: (idx) => sceneMgr.highlightCompanionTooth(idx, 4.5),
        onResetCompanionView: () => sceneMgr.resetCompanionOrbit(),
        isCompanionViewOffCenter: () => sceneMgr.isCompanionOrbitOffCenter(),
        onPlayTreatSfx: () => sound.playTreatSnack(),
        onTreatSplat: () => splatRegionalTreatOnTeeth(),
        getSplatCount: () => touch.activeSplatCount,
        onPlayUiTap: () => sound.playUiTap(),
        isMuted: () => sound.isMuted(),
        onToggleMute: () => sound.setMuted(!sound.isMuted()),
        getMusicVolume: () => sound.getMusicVolume(),
        setMusicVolume: (v) => sound.setMusicVolume(v),
        getSfxVolume: () => sound.getSfxVolume(),
        setSfxVolume: (v) => sound.setSfxVolume(v),
        isReducedMotion: () => sceneMgr.isReducedMotion(),
        onToggleReducedMotion: () => sceneMgr.setReducedMotion(!sceneMgr.isReducedMotion()),
        getLanguage: () => voiceCoach.getLanguage(),
        setLanguage: (language) => voiceCoach.setLanguage(language),
        tutorialGate,
        isGamepadConnected: () => input.isGamepadConnected(),
        onPlayTutorialDemo: (pageId) => playTutorialDemoSound(pageId),
        onWatchEnding: () => replayEnding(),
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
        () => switchMode('HUB'),
        {
          isMuted: () => sound.isMuted(),
          toggleMute: () => sound.setMuted(!sound.isMuted()),
          getMusicVolume: () => sound.getMusicVolume(),
          setMusicVolume: (v) => sound.setMusicVolume(v),
          getSfxVolume: () => sound.getSfxVolume(),
          setSfxVolume: (v) => sound.setSfxVolume(v),
          setPaused: (p) => sound.setPaused(p),
          isReducedMotion: () => sceneMgr.isReducedMotion(),
          toggleReducedMotion: () => sceneMgr.setReducedMotion(!sceneMgr.isReducedMotion()),
          restartDive: () => launchPlayableStage(lastPlayedWorldId, next),
        }
      );
      activeTelemetryHud = hud;
      activeOverlay = hud;
    } else if (next === 'BRUSH_ALONG') {
      activeOverlay = new BrushAlongOverlay(bus, clock, saveSys, voiceCoach, {
        onActiveQuadrantChanged: (q) => {
          activePacerQuadrant = q;
        },
        onPlayCue: (kind) => sound.playPacerCue(kind),
        onPlayPip: (secondsLeft, isUpper) => sound.playPacerAnticipationPip(secondsLeft, isUpper),
        onPlaySwish: (pan, intensity) => sound.playMouthwashSwish(pan, intensity),
        onExitToHub: () => switchMode('HUB'),
        isMuted: () => sound.isMuted(),
        onToggleMute: () => sound.setMuted(!sound.isMuted()),
        onPauseChanged: (p) => sound.setPaused(p),
      });
    } else if (next === 'REPORT' && lastReport) {
      const repMode = lastReport.mode;
      activeOverlay = new MissionReportOverlay(lastReport, {
        onReturnToHub: () => switchMode('HUB'),
        onReplay: () => launchPlayableStage(lastPlayedWorldId, repMode),
        onNextDive: (id) => launchPlayableStage(id, 'ARCADE'),
        isMuted: () => sound.isMuted(),
        onToggleMute: () => sound.setMuted(!sound.isMuted()),
        isReducedMotion: () => sceneMgr.isReducedMotion(),
        bus,
      });
    }

    activeOverlay?.mount(uiRoot!);

    // Restore keyboard focus cleanly to the logical Hub trigger when returning from a mode/sheet.
    if (next === 'HUB' && prev !== 'HUB') {
      const fromRescue = prev === 'PULP_RESCUE' || (prev === 'REPORT' && lastReport?.mode === 'PULP_RESCUE');
      const ids =
        prev === 'BRUSH_ALONG'
          ? ['#btn-start-brush-along', '#btn-launch-arcade']
          : fromRescue
            ? ['#btn-launch-rescue', '#btn-launch-arcade', '#btn-start-brush-along']
            : ['#btn-launch-arcade', '#btn-start-brush-along'];
      requestAnimationFrame(() => {
        for (const sel of ids) {
          const el = uiRoot?.querySelector<HTMLElement>(sel);
          if (el) {
            el.focus({ preventScroll: true });
            break;
          }
        }
      });
    }
  }

  // Step 6: Bind Fixed-Step Simulation & Render Loop
  clock.setCallbacks(
    (fixedDt) => {
      if (
        (currentMode === 'ARCADE' || currentMode === 'PULP_RESCUE') &&
        !finaleActive &&
        !activeTelemetryHud?.isPaused()
      ) {
        const cmd = input.sampleSessionCommand(
          sceneMgr.camera,
          session.probePos,
          session.probeY,
          sceneMgr.isTransitioning(),
          fixedDt
        );
        session.step(fixedDt, cmd);
        // Sealing the last zone (or running out of time) ends the stage inside step(): the finale or
        // the score is already up by now, so the brush must not start again.
        const stageLive = scrubMayPlay({
          mode: currentMode,
          finale: finaleActive,
          paused: activeTelemetryHud?.isPaused() ?? false,
          hidden: false,
          stageLive: session.isRunning(),
        });
        sound.updateScrub({
          active: stageLive && cmd.scrubHeld && !sceneMgr.isTransitioning(),
          probeSpeed: session.probeSpeed,
          newlyCleaned: pendingNewlyCleaned,
          cleanRatio: session.grid.getWorldCleanRatio(),
          brush: session.hasBassUpgrade ? 'bass' : session.hasHydroSonicUpgrade ? 'hydro-sonic' : undefined,
        });
        pendingNewlyCleaned = 0;

        const rank = synergyRankIndex(session.scoring.getSynergyMultiplier());
        if (rank > lastSynergyRank && rank >= 0) sound.playSynergyRankUp(rank);
        lastSynergyRank = rank;
        sound.setUrgency(currentMode === 'PULP_RESCUE' && session.getRemainingRescueSec() <= 20);
        sound.setAcidTension(
          currentMode === 'ARCADE' &&
            session.hasStephanClock() &&
            session.chemistry.getStephanTimerSec() > 0
        );
      }
    },
    (frameDt, nowSec, simAlpha) => {
      lastNowSec = nowSec;
      input.pollGamepad();
      touch.step(frameDt);
      activeTelemetryHud?.tickHud(frameDt);
      // A finished or paused stage shows no brushing (no foam), even if the button is still held.
      const scrubbingActive =
        (currentMode === 'ARCADE' || currentMode === 'PULP_RESCUE') &&
        !finaleActive &&
        session.isRunning() &&
        !activeTelemetryHud?.isPaused() &&
        !sceneMgr.isTransitioning() &&
        input.isScrubInputActive();

      if (sceneHidden) return;
      session.beginRenderInterpolation(simAlpha);
      sceneMgr.renderFrame({
        frameDt,
        nowSec,
        session,
        companion: saveSys.getSave().companion,
        scrubbingActive,
        activePacerQuadrant,
        pacer:
          currentMode === 'BRUSH_ALONG' && clock.isPacerActive()
            ? {
                ...evaluateBrushPhase(
                  clock.getPacerElapsedSec(),
                  clock.getPacerStage(),
                  clock.getPacerMouthwashDurationSec()
                ),
                paused: clock.isPacerPaused(),
              }
            : null,
      });
      session.endRenderInterpolation();
    }
  );

  // Step 7: Mount Initial Mode & Expose Clean DevTools Diagnostics Hook
  switchMode(currentMode);
  clock.start();

  // Flush save state on iOS/mobile backgrounding or page hide. Only changes this tab holds are
  // written, after merging what other tabs stored, so an old tab never undoes an erase (H01).
  const flushSaveOnLifecycleExit = () => {
    saveSys.flushIfChanged(Date.now());
  };
  window.addEventListener('pagehide', flushSaveOnLifecycleExit);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushSaveOnLifecycleExit();
    } else {
      saveSys.refreshFromStorage(Date.now());
    }
  });

  // F toggles full screen (never while typing in a field).
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    }
  });

  window.__MOUTHLIFE_DEBUG__ = {
    getMode: () => currentMode,
    clock,
    getDrawCalls: () => sceneMgr.getLastDrawCalls(),
    getQualityTier: () => sceneMgr.getActiveQualityTier(),
    getAudioState: () => sound.getAudioState(),
    getAudioDebug: () => sound.getDebugInfo(),
    sound,
    getSave: () => saveSys.getSave(),
    session,
    sceneMgr,
    saveSys,
    input,
    touch,
    getHud: () => activeTelemetryHud,
    switchMode,
    launchStage: (worldId, mode = worldId === 'pulp_rescue' ? 'PULP_RESCUE' : 'ARCADE') =>
      launchPlayableStage(worldId, mode),
    playFinale: (kind, worldIndex = 0, finishes) => {
      const back = currentMode;
      playFinale(kind, worldIndex, finishes ?? molarFinishes(), () => {
        if (kind !== 'ending') switchMode(back === 'ARCADE' || back === 'PULP_RESCUE' ? 'HUB' : back);
      });
    },
  };
}

// Outside links (charity pages, donations) wait for a grown-up.
installParentGate();
bootstrapMouthLife();

// Offline-capable PWA shell for mobile Home Screen & dead-zone bathroom play (production only)
if (
  import.meta.env.PROD &&
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  window.location.protocol.startsWith('http')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Non-fatal in private/restricted webviews
    });
    // Tell the worker which script and style files this visit loaded, so the game works offline
    // after the very first visit (their hashed names are not known to the worker ahead of time).
    navigator.serviceWorker.ready
      .then((reg) => {
        const urls = performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((name) => name.startsWith(window.location.origin) && name.includes('/assets/'));
        if (urls.length > 0) reg.active?.postMessage({ type: 'precache', urls });
        // Fetch what a first visit never asks for (guide pictures, other languages) once the worker
        // controls the page, so they are cached for play without a connection.
        const warm = (): void => {
          const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 2000));
          idle(() => {
            warmAllLanguagePacks();
            for (const url of allTutorialImageUrls()) void fetch(url).catch(() => undefined);
          });
        };
        if (navigator.serviceWorker.controller) warm();
        else navigator.serviceWorker.addEventListener('controllerchange', warm, { once: true });
      })
      .catch(() => {});
  });
}
