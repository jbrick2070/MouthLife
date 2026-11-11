import {
  ACID_POOL_LIFETIME_SEC,
  ACID_POOL_RADIUS,
  ACID_POOL_SLOW_MULT,
  BRUSH_BASE_ARC_RAD,
  BRUSH_BASE_RADIUS,
  BRUSH_BASS_ARC_RAD,
  BRUSH_MOVING_RATE,
  BRUSH_OVERDRIVE_RADIUS_MULT,
  BRUSH_STATIONARY_RATE,
  DISCLOSE_COOLDOWN_SEC,
  DISCLOSE_DURATION_SEC,
  DISTRICT_SEAL_CLEAN_RATIO,
  FLOSS_BASE_HALF_WIDTH,
  FLOSS_COOLDOWN_SEC,
  FLOSS_LENGTH,
  FLOSS_PTFE_HALF_WIDTH,
  FLOSS_ZIP_ENTRY_DIST,
  HIBISCUS_DEFAULT_PULSE_SEC,
  MAX_MUTANS_GLOBAL,
  MAX_MUTANS_PER_CRYSTAL,
  MISWAK_INFUSION_DURATION_SEC,
  MISWAK_SPRING_CONVERT_RADIUS,
  MUTANS_DEPOSIT_RATE,
  MUTANS_MOVE_SPEED,
  MUTANS_STUN_SEC,
  MUTANS_TRAIL_RADIUS,
  PROBE_KNOCKBACK_SEC,
  PROBE_MOVE_SPEED,
  PROBE_RADIUS,
  PROBE_SWEEP_SPEED_THRESHOLD,
  PTFE_SURGE_MULTIPLIER,
  PULP_RESCUE_DURATION_SEC,
  PULP_RESCUE_WIN_CLEAN_RATIO,
  RINSE_WAVE_DURATION_SEC,
  RINSE_WAVE_RADIUS,
  SALIVA_SPRING_GUM_SOOTHE,
  SALIVA_SPRING_PH_BOOST,
  SALIVA_SPRING_RADIUS,
  STEPHAN_DEFAULT_SIP_INTERVAL_SEC,
  STEPHAN_RECOVERY_SEC,
  STEPHAN_SPRING_BUFFER_SEC,
  SULCUS_BASS_IRRITATION_MULT,
  SULCUS_HYDROSONIC_IRRITATION_MULT,
  SULCUS_STATIONARY_IRRITATION_PER_SEC,
  SITE_RESTORE_CLEAN_RATIO,
  SITE_RESTORE_RADIUS,
  SUCROSE_SPAWN_INTERVAL_SEC,
  SURGE_MAX,
  SURGE_PER_BEACON,
  SURGE_PER_CLEANED_CELL,
  SURGE_PER_EPS_CELL_CRACKED,
  SURGE_PER_FLOSS_TARGET,
  SURGE_PER_SITE_RESTORED,
} from '../../config/gameConfig';
import type { EventBus } from '../EventBus';
import {
  buildAlleyWalls,
  resolveCircleCollisions,
  sampleTerrainHeight,
  segmentsIntersect2D,
  stepCapillaryZip,
  tryStartCapillaryZip,
} from '../physics/CollisionSystem';
import { ScoringEngine } from '../scoring/ScoringEngine';
import { OralChemistrySim } from '../surface/OralChemistrySim';
import { distancePointToSegmentSq2D, OralSurfaceGrid } from '../surface/OralSurfaceGrid';
import type {
  AABB2D,
  AcidPoolEntity,
  BridgeDef,
  CommensalSiteEntity,
  MouthLifeSaveV2,
  MutansEntity,
  ProbeZipState,
  RelayBeaconEntity,
  SucroseCrystalEntity,
  Vec2,
  WorldCartridge,
} from '../types';

export interface SessionInputCommand {
  moveX: number; // -1..1
  moveZ: number; // -1..1
  scrubHeld: boolean;
  aimWorldPos: Vec2 | null;
  fireFlossRequested: boolean;
  fireRinseRequested: boolean;
  fireDiscloseRequested: boolean;
}

export class WorldSession {
  cartridge!: WorldCartridge;
  grid!: OralSurfaceGrid;
  chemistry!: OralChemistrySim;
  readonly scoring = new ScoringEngine();

  private activeMode: 'ARCADE' | 'PULP_RESCUE' = 'ARCADE';
  private running = false;
  private completed = false;
  private elapsedSec = 0;

  // Probe state
  probePos: Vec2 = { x: 8, z: 16 };
  probeY = 1.0;
  probeFacingRad = 0;
  probeSpeed = 0;
  probeZip: ProbeZipState | null = null;
  private knockbackVel: Vec2 = { x: 0, z: 0 };
  private knockbackTimer = 0;

  // Actuators & meters
  surgeMeter = 0;
  flossCooldown = 0;
  discloseCooldown = 0;
  discloseActiveRemaining = 0;
  discloseOrigin: Vec2 = { x: 0, z: 0 };
  rinseWaveRemaining = 0;
  rinseWaveOrigin: Vec2 = { x: 0, z: 0 };
  flossBeamRemaining = 0;
  flossBeamSegment: { a: Vec2; b: Vec2 } | null = null;

  // Upgrades & session buffs
  hasBassUpgrade = false;
  hasHydroSonicUpgrade = false;
  hasPtfeFlossUpgrade = false;
  hasBicarbRinseUpgrade = false;
  overdriveActive = false;

  // World entities
  allCollisionWalls: AABB2D[] = [];
  sealedDistricts: boolean[] = [];
  sites: CommensalSiteEntity[] = [];
  sucroseCrystals: SucroseCrystalEntity[] = [];
  bridges: BridgeDef[] = [];
  beacons: RelayBeaconEntity[] = [];
  mutans: MutansEntity[] = [];
  acidPools: AcidPoolEntity[] = [];
  springCooldowns: number[] = [];

  // World 3 — 1940 Stephan Curve acid clock
  private stephanSipTimer = 0;
  private stephanSipCount = 0;
  // World 2 — gum tender warning throttle
  private gumWarnCooldown = 0;
  // World 4 — Hibiscus erosion wash & Miswak/Fluorapatite lattice infusion
  private erosionPulseTimer = 0;
  private erosionWashCount = 0;
  fluorapatiteInfusionSec = 0;
  // World 5 — Quorum-sensing EPS armor deflection throttle
  private epsWarnCooldown = 0;

  private nextEntityId = 1;

  constructor(private readonly bus: EventBus) {
    this.bus.on('mode:changed', ({ to }) => {
      if (to !== 'ARCADE' && to !== 'PULP_RESCUE') {
        this.running = false;
      }
    });
  }

  loadCartridge(
    cartridge: WorldCartridge,
    save: MouthLifeSaveV2,
    mode: 'ARCADE' | 'PULP_RESCUE' = 'ARCADE'
  ): void {
    this.cartridge = cartridge;
    this.activeMode = mode;
    this.grid = new OralSurfaceGrid(cartridge.worldWidth, cartridge.worldDepth);
    this.chemistry = new OralChemistrySim(
      cartridge.worldWidth,
      cartridge.worldDepth,
      cartridge.baselinePh
    );
    this.grid.bakeFromCartridge(cartridge);
    this.scoring.reset();

    this.allCollisionWalls = [...cartridge.wallBoxes, ...buildAlleyWalls(cartridge)];
    this.sealedDistricts = new Array(cartridge.districts.length).fill(false);

    this.probePos = { x: cartridge.probeSpawn.x, z: cartridge.probeSpawn.z };
    this.probeY = sampleTerrainHeight(cartridge, this.probePos.x, this.probePos.z);
    this.probeFacingRad = 0;
    this.probeSpeed = 0;
    this.probeZip = null;
    this.knockbackTimer = 0;
    this.knockbackVel = { x: 0, z: 0 };

    const eq = save.equippedUpgrades;
    this.hasBassUpgrade = eq.brush === 'angled_bass_array';
    this.hasHydroSonicUpgrade = eq.brush === 'hydro_sonic_pulse';
    this.hasPtfeFlossUpgrade = eq.floss === 'ptfe_ribbon_filament';
    this.hasBicarbRinseUpgrade = eq.rinse === 'bicarb_buffer_jet';
    this.overdriveActive = mode === 'ARCADE' && save.remineralizedOverdriveRuns > 0;

    this.surgeMeter = this.overdriveActive ? SURGE_MAX : 0;
    this.flossCooldown = 0;
    this.discloseCooldown = 0;
    this.discloseActiveRemaining = 0;
    this.rinseWaveRemaining = 0;
    this.flossBeamRemaining = 0;
    this.flossBeamSegment = null;

    this.sites = cartridge.commensalSiteSpawns.map((s) => ({
      id: s.id,
      pos: { x: s.pos.x, z: s.pos.z },
      districtIdx: s.districtIdx,
      restored: false,
      localCleanRatio: this.grid.getAreaCleanRatio(s.pos.x, s.pos.z, SITE_RESTORE_RADIUS),
    }));

    this.sucroseCrystals = cartridge.sucroseSpawns.map((c) => ({
      id: c.id,
      pos: { x: c.pos.x, z: c.pos.z },
      districtIdx: c.districtIdx,
      hp: 4,
      intact: true,
      spawnTimer: 2.2,
    }));

    this.bridges = cartridge.biofilmBridges.map((b) => ({
      id: b.id,
      a: { x: b.a.x, z: b.a.z },
      b: { x: b.b.x, z: b.b.z },
      intact: b.intact,
    }));

    const beaconCount =
      mode === 'ARCADE'
        ? Math.min(save.pendingSupplyBeacons, cartridge.beaconDropSlots.length)
        : 0;
    this.beacons = cartridge.beaconDropSlots.slice(0, beaconCount).map((pos, index) => ({
      index,
      pos: { x: pos.x, z: pos.z },
      collected: false,
    }));

    this.mutans = [];
    this.acidPools = [];
    this.springCooldowns = new Array(cartridge.salivaSprings.length).fill(0);

    if (mode === 'PULP_RESCUE') {
      // Seed central acidic hazard in Pulp Rescue so players experience Salivary Spring buffering!
      this.chemistry.applyAcidZone(16.0, 16.0, 4.5, 5.1);
    }

    // First sweet sip arrives quickly so players feel the acid clock within the opening seconds
    this.stephanSipTimer = cartridge.stephanSipIntervalSec ? 6.0 : 0;
    this.stephanSipCount = 0;
    this.gumWarnCooldown = 0;
    this.erosionWashCount = 0;
    this.fluorapatiteInfusionSec = 0;
    this.epsWarnCooldown = 0;
    if (cartridge.erosionZones && cartridge.erosionZones.length > 0) {
      this.applyActiveErosionZones();
      this.erosionPulseTimer = cartridge.erosionPulseIntervalSec ?? HIBISCUS_DEFAULT_PULSE_SEC;
    } else {
      this.erosionPulseTimer = 0;
    }

    this.elapsedSec = 0;
    this.completed = false;
    this.running = true;
  }

  /** True when the loaded cartridge runs the 1940 Stephan Curve acid clock. */
  hasStephanClock(): boolean {
    return Boolean(this.cartridge?.stephanSipIntervalSec);
  }

  /** True when the loaded cartridge has tart organic-acid erosion basins + Fluorapatite conversion (World 4). */
  hasErosionChallenge(): boolean {
    return Boolean(this.cartridge?.erosionZones && this.cartridge.erosionZones.length > 0);
  }

  getFluorapatiteInfusionSec(): number {
    return this.fluorapatiteInfusionSec;
  }

  /** True when the loaded cartridge has zero-G quorum-sensing EPS biofilm domes (World 5). */
  hasEpsDomes(): boolean {
    return Boolean(this.cartridge?.epsDomes && this.cartridge.epsDomes.length > 0);
  }

  /** Seconds until the next sweet sip (0 when the sugar supply has been cut off). */
  getStephanSipCountdown(): number {
    if (!this.hasStephanClock()) return 0;
    if (!this.sucroseCrystals.some((c) => c.intact)) return 0;
    return Math.max(0, this.stephanSipTimer);
  }

  getStephanSipCount(): number {
    return this.stephanSipCount;
  }

  /** True when the loaded cartridge has tender gingival sulcus margins (World 2). */
  hasSulcusCare(): boolean {
    return Boolean(this.cartridge?.sulcusBands && this.cartridge.sulcusBands.length > 0);
  }

  /** Effective sulcus irritation rate given equipped brush upgrades (0 outside World 2). */
  getSulcusIrritationRate(): number {
    if (!this.hasSulcusCare()) return 0;
    let rate = SULCUS_STATIONARY_IRRITATION_PER_SEC;
    if (this.hasBassUpgrade) rate *= SULCUS_BASS_IRRITATION_MULT;
    if (this.hasHydroSonicUpgrade) rate *= SULCUS_HYDROSONIC_IRRITATION_MULT;
    return rate;
  }

  setRunning(running: boolean): void {
    this.running = running;
  }

  isRunning(): boolean {
    return this.running && !this.completed;
  }

  getElapsedSec(): number {
    return this.elapsedSec;
  }

  getRemainingRescueSec(): number {
    return Math.max(0, PULP_RESCUE_DURATION_SEC - this.elapsedSec);
  }

  addSurge(delta: number): number {
    if (delta <= 0) return 0;
    const prev = this.surgeMeter;
    this.surgeMeter = Math.min(SURGE_MAX, this.surgeMeter + delta);
    if (prev < SURGE_MAX && this.surgeMeter >= SURGE_MAX) {
      this.bus.emit('surge:ready', {});
    }
    return this.surgeMeter - prev;
  }

  step(dt: number, input: SessionInputCommand): void {
    if (!this.running || this.completed) return;

    this.elapsedSec += dt;
    this.flossCooldown = Math.max(0, this.flossCooldown - dt);
    this.discloseCooldown = Math.max(0, this.discloseCooldown - dt);
    this.discloseActiveRemaining = Math.max(0, this.discloseActiveRemaining - dt);
    this.rinseWaveRemaining = Math.max(0, this.rinseWaveRemaining - dt);
    this.flossBeamRemaining = Math.max(0, this.flossBeamRemaining - dt);

    for (let i = 0; i < this.springCooldowns.length; i++) {
      this.springCooldowns[i] = Math.max(0, this.springCooldowns[i] - dt);
    }

    this.chemistry.step(dt);
    this.scoring.step(dt);
    this.gumWarnCooldown = Math.max(0, this.gumWarnCooldown - dt);
    this.fluorapatiteInfusionSec = Math.max(0, this.fluorapatiteInfusionSec - dt);
    this.epsWarnCooldown = Math.max(0, this.epsWarnCooldown - dt);
    this.stepStephanClock(dt);
    this.stepErosionWash(dt);

    // 1. Probe Movement or Capillary Tether-Zip
    if (this.probeZip) {
      const zipStep = stepCapillaryZip(this.probeZip, dt);
      this.probePos = zipStep.pos;
      this.probeSpeed = PROBE_MOVE_SPEED * 1.8;
      if (zipStep.done) {
        this.probeZip = null;
      }
    } else {
      const prevX = this.probePos.x;
      const prevZ = this.probePos.z;

      const inAcidPool = this.acidPools.some(
        (p) =>
          Math.hypot(this.probePos.x - p.pos.x, this.probePos.z - p.pos.z) <= p.radius
      );
      const speedMult = inAcidPool ? ACID_POOL_SLOW_MULT : 1.0;

      let mx = input.moveX;
      let mz = input.moveZ;
      const mLen = Math.hypot(mx, mz);
      if (mLen > 1) {
        mx /= mLen;
        mz /= mLen;
      }

      let vx = mx * PROBE_MOVE_SPEED * speedMult;
      let vz = mz * PROBE_MOVE_SPEED * speedMult;

      if (this.knockbackTimer > 0) {
        const kRatio = this.knockbackTimer / PROBE_KNOCKBACK_SEC;
        vx += this.knockbackVel.x * kRatio;
        vz += this.knockbackVel.z * kRatio;
        this.knockbackTimer = Math.max(0, this.knockbackTimer - dt);
      }

      const candidatePos = {
        x: this.probePos.x + vx * dt,
        z: this.probePos.z + vz * dt,
      };
      this.probePos = resolveCircleCollisions(
        candidatePos,
        PROBE_RADIUS,
        this.cartridge.worldWidth,
        this.cartridge.worldDepth,
        this.allCollisionWalls
      );

      const movedDist = Math.hypot(this.probePos.x - prevX, this.probePos.z - prevZ);
      this.probeSpeed = dt > 0 ? movedDist / dt : 0;

      if (mLen > 0.08) {
        this.probeFacingRad = Math.atan2(mz, mx);
      } else if (input.aimWorldPos) {
        const adx = input.aimWorldPos.x - this.probePos.x;
        const adz = input.aimWorldPos.z - this.probePos.z;
        if (Math.hypot(adx, adz) > 0.25) {
          this.probeFacingRad = Math.atan2(adz, adx);
        }
      }
    }

    this.probeY = sampleTerrainHeight(this.cartridge, this.probePos.x, this.probePos.z);

    // 2. Salivary Bicarbonate Springs & Relay Beacons proximity
    for (let si = 0; si < this.cartridge.salivaSprings.length; si++) {
      if (this.springCooldowns[si] > 0) continue;
      const sp = this.cartridge.salivaSprings[si];
      if (Math.hypot(this.probePos.x - sp.x, this.probePos.z - sp.z) <= 1.6) {
        this.springCooldowns[si] = 3.0;
        this.bus.emit('spring:triggered', { pos: { x: sp.x, z: sp.z } });
        this.chemistry.triggerSalivaSpring(
          sp.x,
          sp.z,
          SALIVA_SPRING_RADIUS,
          SALIVA_SPRING_PH_BOOST
        );
        // Bicarbonate also soothes inflamed gingiva & shortens the Stephan acid clock
        if (this.hasSulcusCare()) {
          this.chemistry.addGumIrritation(sp.x, sp.z, SALIVA_SPRING_RADIUS, -SALIVA_SPRING_GUM_SOOTHE);
        }
        if (this.chemistry.getStephanTimerSec() > 0) {
          const remainingSec = this.chemistry.bufferStephan(STEPHAN_SPRING_BUFFER_SEC);
          this.bus.emit('stephan:buffered', { pos: { x: sp.x, z: sp.z }, remainingSec });
        }
        if (this.hasErosionChallenge()) {
          const cellsConverted = this.grid.convertCircleToFluorapatite(
            sp.x,
            sp.z,
            MISWAK_SPRING_CONVERT_RADIUS
          );
          this.fluorapatiteInfusionSec = MISWAK_INFUSION_DURATION_SEC;
          this.bus.emit('fluorapatite:infused', {
            pos: { x: sp.x, z: sp.z },
            cellsConverted,
            durationSec: MISWAK_INFUSION_DURATION_SEC,
          });
        }
      }
    }

    for (const beacon of this.beacons) {
      if (beacon.collected) continue;
      if (Math.hypot(this.probePos.x - beacon.pos.x, this.probePos.z - beacon.pos.z) <= 1.5) {
        beacon.collected = true;
        const surgeDelta = this.addSurge(SURGE_PER_BEACON);
        this.bus.emit('beacon:collected', {
          beaconIndex: beacon.index,
          pos: { x: beacon.pos.x, z: beacon.pos.z },
          surgeDelta,
        });
      }
    }

    // 3. Sonic Bristle Actuator
    if (input.scrubHeld && !this.probeZip) {
      const isMoving = this.probeSpeed >= PROBE_SWEEP_SPEED_THRESHOLD;
      const removalPerSec = isMoving ? BRUSH_MOVING_RATE : BRUSH_STATIONARY_RATE;
      const radius =
        BRUSH_BASE_RADIUS * (this.overdriveActive ? BRUSH_OVERDRIVE_RADIUS_MULT : 1.0);
      const arcRad = this.hasBassUpgrade ? BRUSH_BASS_ARC_RAD : BRUSH_BASE_ARC_RAD;

      const res = this.grid.applyBrush(
        {
          cx: this.probePos.x,
          cz: this.probePos.z,
          facingRad: this.probeFacingRad,
          arcRad,
          radius,
          removalPerSec,
          dt,
          hasBassUpgrade: this.hasBassUpgrade,
          sulcusIrritationPerSec: this.getSulcusIrritationRate(),
          isMovingSweep: isMoving,
          convertToFluorapatite: this.fluorapatiteInfusionSec > 0,
        },
        this.chemistry
      );

      // Brush also chips adjacent Mutans & Sucrose Crystals
      this.applyBrushEntityHits(radius, dt);

      const surgeDelta = this.addSurge(
        res.newlyCleanedCells * SURGE_PER_CLEANED_CELL + res.densityRemovedTotal * 0.04
      );
      if (res.newlyCleanedCells > 0) {
        this.scoring.recordSweepingCellsCleaned(res.newlyCleanedCells, isMoving);
      }
      if (res.acidAbrasionWarnings > 0) {
        this.scoring.recordAcidAbrasionWarning(1);
      }
      const gumWarnings = res.gumTenderWarnings ?? 0;
      if (gumWarnings > 0 && this.gumWarnCooldown <= 0) {
        this.gumWarnCooldown = 0.6;
        this.scoring.recordAcidAbrasionWarning(1);
        this.bus.emit('gum:tender', {
          pos: { x: this.probePos.x, z: this.probePos.z },
          warnings: gumWarnings,
        });
      }
      const epsWarnings = res.epsDeflectWarnings ?? 0;
      if (epsWarnings > 0 && this.epsWarnCooldown <= 0) {
        this.epsWarnCooldown = 0.7;
        this.bus.emit('eps:deflected', {
          pos: { x: this.probePos.x, z: this.probePos.z },
          warnings: epsWarnings,
        });
      }

      if (
        res.newlyCleanedCells > 0 ||
        res.acidAbrasionWarnings > 0 ||
        (res.fluorapatiteConverted ?? 0) > 0
      ) {
        this.bus.emit('actuator:scrub', {
          cleanRatio: this.grid.getWorldCleanRatio(),
          newlyCleaned: res.newlyCleanedCells,
          surgeDelta,
          acidWarn: res.acidAbrasionWarnings > 0,
        });
      }
    }

    // 4. Polymer Floss Filament & Capillary Tether-Zip
    if (input.fireFlossRequested && this.flossCooldown <= 0) {
      this.fireFlossActuator(input.aimWorldPos);
    }

    // 5. Fluoride-Bicarb Ion Rinse
    if (input.fireRinseRequested && this.surgeMeter >= SURGE_MAX) {
      this.fireIonRinseActuator();
    }

    // 6. Erythrosine Disclosing Bio-Scan
    if (input.fireDiscloseRequested && this.discloseCooldown <= 0) {
      this.discloseCooldown = DISCLOSE_COOLDOWN_SEC;
      this.discloseActiveRemaining = DISCLOSE_DURATION_SEC;
      this.discloseOrigin = { x: this.probePos.x, z: this.probePos.z };
      this.bus.emit('disclose:pulsed', {
        origin: this.discloseOrigin,
        durationSec: DISCLOSE_DURATION_SEC,
      });
    }

    // 7. Ecology: Sucrose Spawners, Mutans Cocci, Acid Pools
    this.stepEcology(dt);

    // 8. Commensal Sites & Soft-Lock-Proof District Remineralization
    this.evaluateSitesAndDistricts();

    // 9. Mode Completion Checks
    this.evaluateMissionCompletion();
  }

  private applyBrushEntityHits(radius: number, dt: number): void {
    // Knock back & pop S. mutans within brush sweep radius
    for (let i = this.mutans.length - 1; i >= 0; i--) {
      const m = this.mutans[i];
      const dx = m.pos.x - this.probePos.x;
      const dz = m.pos.z - this.probePos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= radius + 0.45) {
        m.hp -= 3.2 * dt;
        if (dist > 0.05) {
          m.pos.x += (dx / dist) * 5.0 * dt;
          m.pos.z += (dz / dist) * 5.0 * dt;
        }
        if (m.hp <= 0) {
          this.bus.emit('mutans:popped', { pos: { x: m.pos.x, z: m.pos.z }, via: 'brush' });
          this.mutans.splice(i, 1);
        }
      }
    }

    // Gradual brush chipping on Sucrose Crystals (4 sweeps vs instant 1 Floss slice)
    for (const c of this.sucroseCrystals) {
      if (!c.intact) continue;
      if (Math.hypot(c.pos.x - this.probePos.x, c.pos.z - this.probePos.z) <= radius + 0.5) {
        c.hp -= 1.4 * dt;
        if (c.hp <= 0) {
          c.intact = false;
          this.scoring.recordSucroseCleared(1);
          this.bus.emit('sucrose:shattered', {
            crystalId: c.id,
            pos: { x: c.pos.x, z: c.pos.z },
            via: 'brush',
          });
        }
      }
    }
  }

  private fireFlossActuator(aimWorldPos: Vec2 | null): void {
    this.flossCooldown = FLOSS_COOLDOWN_SEC;

    let aimDir: Vec2;
    if (aimWorldPos) {
      const dx = aimWorldPos.x - this.probePos.x;
      const dz = aimWorldPos.z - this.probePos.z;
      const len = Math.hypot(dx, dz);
      aimDir =
        len > 0.15
          ? { x: dx / len, z: dz / len }
          : { x: Math.cos(this.probeFacingRad), z: Math.sin(this.probeFacingRad) };
    } else {
      // Smart auto-aim fallback for quick-tap mobile play: find nearest alley mouth or sucrose crystal within 4.2u
      aimDir = this.findSmartFlossDirection();
    }

    this.probeFacingRad = Math.atan2(aimDir.z, aimDir.x);

    const zipCandidate = tryStartCapillaryZip(
      this.probePos,
      aimDir,
      this.cartridge.interdentalAlleys,
      this.cartridge.wallBoxes
    );

    const segStart = { x: this.probePos.x, z: this.probePos.z };
    const segEnd = zipCandidate
      ? { x: zipCandidate.zip.to.x, z: zipCandidate.zip.to.z }
      : {
          x: this.probePos.x + aimDir.x * FLOSS_LENGTH,
          z: this.probePos.z + aimDir.z * FLOSS_LENGTH,
        };

    const baseHalfW = this.hasPtfeFlossUpgrade
      ? FLOSS_PTFE_HALF_WIDTH
      : FLOSS_BASE_HALF_WIDTH;
    const effectiveHalfW = zipCandidate
      ? Math.max(baseHalfW, zipCandidate.alley.width * 0.55)
      : baseHalfW;

    const gridRes = this.grid.applyFlossSegment(
      segStart.x,
      segStart.z,
      segEnd.x,
      segEnd.z,
      effectiveHalfW
    );

    let targetsHit = 0;

    // Sever Biofilm Bridges
    for (const bridge of this.bridges) {
      if (!bridge.intact) continue;
      if (
        segmentsIntersect2D(segStart, segEnd, bridge.a, bridge.b) ||
        distancePointToSegmentSq2D(
          (bridge.a.x + bridge.b.x) * 0.5,
          (bridge.a.z + bridge.b.z) * 0.5,
          segStart.x,
          segStart.z,
          segEnd.x,
          segEnd.z
        ) <= 0.65
      ) {
        bridge.intact = false;
        targetsHit++;
      }
    }

    // Fracture Sucrose Crystals instantly with Floss!
    for (const crystal of this.sucroseCrystals) {
      if (!crystal.intact) continue;
      if (
        distancePointToSegmentSq2D(
          crystal.pos.x,
          crystal.pos.z,
          segStart.x,
          segStart.z,
          segEnd.x,
          segEnd.z
        ) <= 0.85
      ) {
        crystal.intact = false;
        crystal.hp = 0;
        targetsHit++;
        this.scoring.recordSucroseCleared(1);
        this.bus.emit('sucrose:shattered', {
          crystalId: crystal.id,
          pos: { x: crystal.pos.x, z: crystal.pos.z },
          via: 'floss',
        });
      }
    }

    // Pop Mutans along filament line
    for (let i = this.mutans.length - 1; i >= 0; i--) {
      const m = this.mutans[i];
      if (
        distancePointToSegmentSq2D(
          m.pos.x,
          m.pos.z,
          segStart.x,
          segStart.z,
          segEnd.x,
          segEnd.z
        ) <= 0.55
      ) {
        this.bus.emit('mutans:popped', { pos: { x: m.pos.x, z: m.pos.z }, via: 'floss' });
        this.mutans.splice(i, 1);
      }
    }

    if (zipCandidate) {
      this.probeZip = zipCandidate.zip;
    }

    const epsCracked = gridRes.epsCellsCracked ?? 0;
    const perTargetSurge =
      SURGE_PER_FLOSS_TARGET * (this.hasPtfeFlossUpgrade ? PTFE_SURGE_MULTIPLIER : 1.0);
    const rawSurge =
      targetsHit * perTargetSurge +
      gridRes.newlyCleanedCells * SURGE_PER_CLEANED_CELL +
      epsCracked * SURGE_PER_EPS_CELL_CRACKED;
    const surgeDelta = this.addSurge(rawSurge);

    this.scoring.recordFlossSlice(targetsHit, gridRes.newlyCleanedCells);

    this.flossBeamRemaining = 0.22;
    this.flossBeamSegment = { a: segStart, b: segEnd };

    if (epsCracked > 0) {
      this.bus.emit('eps:cracked', {
        pos: { x: (segStart.x + segEnd.x) * 0.5, z: (segStart.z + segEnd.z) * 0.5 },
        cellsCracked: epsCracked,
        via: 'floss',
      });
    }

    this.bus.emit('floss:sliced', {
      from: segStart,
      to: segEnd,
      targetsHit,
      surgeDelta,
      zipped: Boolean(zipCandidate),
    });
  }

  private findSmartFlossDirection(): Vec2 {
    let bestDir: Vec2 | null = null;
    let bestDist = 4.4;

    for (const alley of this.cartridge.interdentalAlleys) {
      for (const [entry, exit] of [
        [alley.endpointA, alley.endpointB],
        [alley.endpointB, alley.endpointA],
      ] as const) {
        const dEntry = Math.hypot(entry.x - this.probePos.x, entry.z - this.probePos.z);
        if (dEntry <= FLOSS_ZIP_ENTRY_DIST) {
          const vx = exit.x - this.probePos.x;
          const vz = exit.z - this.probePos.z;
          const l = Math.hypot(vx, vz);
          if (l > 0.1) return { x: vx / l, z: vz / l };
        }
      }
    }

    for (const c of this.sucroseCrystals) {
      if (!c.intact) continue;
      const d = Math.hypot(c.pos.x - this.probePos.x, c.pos.z - this.probePos.z);
      if (d < bestDist && d > 0.1) {
        bestDist = d;
        bestDir = {
          x: (c.pos.x - this.probePos.x) / d,
          z: (c.pos.z - this.probePos.z) / d,
        };
      }
    }

    if (!bestDir && this.cartridge.epsDomes) {
      let bestDomeDist = 5.2;
      for (const dome of this.cartridge.epsDomes) {
        if (!this.grid.isEpsArmoredAt(dome.cx, dome.cz)) continue;
        const d = Math.hypot(dome.cx - this.probePos.x, dome.cz - this.probePos.z);
        if (d < bestDomeDist && d > 0.1) {
          bestDomeDist = d;
          bestDir = {
            x: (dome.cx - this.probePos.x) / d,
            z: (dome.cz - this.probePos.z) / d,
          };
        }
      }
    }

    if (bestDir) return bestDir;
    return { x: Math.cos(this.probeFacingRad), z: Math.sin(this.probeFacingRad) };
  }

  private stepStephanClock(dt: number): void {
    if (!this.cartridge.stephanSipIntervalSec) return;
    // Cutting off every Sucrose Crystal ends the repeated sweet sips for good
    if (!this.sucroseCrystals.some((c) => c.intact)) return;
    this.stephanSipTimer -= dt;
    if (this.stephanSipTimer <= 0) {
      this.stephanSipTimer =
        this.cartridge.stephanSipIntervalSec || STEPHAN_DEFAULT_SIP_INTERVAL_SEC;
      this.chemistry.triggerSucroseStephanHit();
      this.stephanSipCount++;
      this.bus.emit('stephan:sip', {
        sipIndex: this.stephanSipCount,
        recoverySec: STEPHAN_RECOVERY_SEC,
      });
    }
  }

  private applyActiveErosionZones(): { count: number; minPh: number } {
    const zones = this.cartridge.erosionZones;
    if (!zones || zones.length === 0) {
      return { count: 0, minPh: this.cartridge?.baselinePh ?? 7.0 };
    }
    let count = 0;
    let minPh = this.cartridge.baselinePh;
    for (const z of zones) {
      const di = this.cartridge.districts.findIndex(
        (d) =>
          z.cx >= d.bounds.minX &&
          z.cx <= d.bounds.maxX &&
          z.cz >= d.bounds.minZ &&
          z.cz <= d.bounds.maxZ
      );
      if (di >= 0 && this.sealedDistricts[di]) continue;
      this.chemistry.applyAcidZone(z.cx, z.cz, z.radius, z.targetPh);
      count++;
      if (z.targetPh < minPh) minPh = z.targetPh;
    }
    return { count, minPh };
  }

  private stepErosionWash(dt: number): void {
    if (!this.cartridge.erosionZones || this.cartridge.erosionZones.length === 0) return;
    this.erosionPulseTimer -= dt;
    if (this.erosionPulseTimer <= 0) {
      this.erosionPulseTimer =
        this.cartridge.erosionPulseIntervalSec ?? HIBISCUS_DEFAULT_PULSE_SEC;
      const { count, minPh } = this.applyActiveErosionZones();
      if (count > 0) {
        this.erosionWashCount++;
        this.bus.emit('erosion:wash', {
          washIndex: this.erosionWashCount,
          targetPh: minPh,
        });
      }
    }
  }

  private fireIonRinseActuator(): void {
    this.surgeMeter = 0;
    // Fluoride-Bicarb surge neutralizes the Stephan acid window immediately
    this.chemistry.bufferStephan(STEPHAN_RECOVERY_SEC * 2);
    this.rinseWaveRemaining = RINSE_WAVE_DURATION_SEC;
    this.rinseWaveOrigin = { x: this.probePos.x, z: this.probePos.z };

    const res = this.grid.applyIonRinse(
      this.probePos.x,
      this.probePos.z,
      RINSE_WAVE_RADIUS,
      this.chemistry,
      this.hasBicarbRinseUpgrade
    );

    let extraConverted = 0;
    if (this.hasErosionChallenge()) {
      extraConverted = this.grid.convertCircleToFluorapatite(
        this.probePos.x,
        this.probePos.z,
        RINSE_WAVE_RADIUS * 0.85
      );
      this.fluorapatiteInfusionSec = MISWAK_INFUSION_DURATION_SEC;
      this.bus.emit('fluorapatite:infused', {
        pos: { x: this.probePos.x, z: this.probePos.z },
        cellsConverted: extraConverted,
        durationSec: MISWAK_INFUSION_DURATION_SEC,
      });
    }

    const epsCracked = res.epsCellsCracked ?? 0;
    if (epsCracked > 0) {
      this.bus.emit('eps:cracked', {
        pos: { x: this.probePos.x, z: this.probePos.z },
        cellsCracked: epsCracked,
        via: 'rinse',
      });
    }

    // Clear Acid Pools & Stun S. mutans inside Rinse Wave
    for (let i = this.acidPools.length - 1; i >= 0; i--) {
      const p = this.acidPools[i];
      if (
        Math.hypot(p.pos.x - this.probePos.x, p.pos.z - this.probePos.z) <=
        RINSE_WAVE_RADIUS
      ) {
        this.acidPools.splice(i, 1);
      }
    }

    for (const m of this.mutans) {
      if (
        Math.hypot(m.pos.x - this.probePos.x, m.pos.z - this.probePos.z) <=
        RINSE_WAVE_RADIUS
      ) {
        m.stunRemaining = MUTANS_STUN_SEC;
      }
    }

    const sealed = (res.cellsSealed ?? 0) + extraConverted;
    this.scoring.recordIonRinseSeal(sealed);
    this.bus.emit('rinse:surged', {
      origin: this.rinseWaveOrigin,
      cellsSealed: sealed,
    });
  }

  private stepEcology(dt: number): void {
    // Sucrose Crystal spawners
    for (const c of this.sucroseCrystals) {
      if (!c.intact) continue;
      if (this.sealedDistricts[c.districtIdx]) {
        c.intact = false;
        continue;
      }
      c.spawnTimer -= dt;
      if (c.spawnTimer <= 0) {
        c.spawnTimer = SUCROSE_SPAWN_INTERVAL_SEC;
        const activeFromCrystal = this.mutans.filter(
          (m) => m.parentSucroseId === c.id
        ).length;
        if (
          activeFromCrystal < MAX_MUTANS_PER_CRYSTAL &&
          this.mutans.length < MAX_MUTANS_GLOBAL
        ) {
          const angle = (this.nextEntityId * 2.39996) % (Math.PI * 2);
          this.mutans.push({
            id: this.nextEntityId++,
            pos: {
              x: c.pos.x + Math.cos(angle) * 0.9,
              z: c.pos.z + Math.sin(angle) * 0.9,
            },
            vel: {
              x: Math.cos(angle) * MUTANS_MOVE_SPEED,
              z: Math.sin(angle) * MUTANS_MOVE_SPEED,
            },
            hopPhase: 0,
            hp: 2.0,
            stunRemaining: 0,
            acidDropCooldown: 4.5,
            parentSucroseId: c.id,
          });
        }
      }
    }

    // S. mutans cocci movement, biofilm trail & playful Slime-Boing bump
    for (const m of this.mutans) {
      if (m.stunRemaining > 0) {
        m.stunRemaining = Math.max(0, m.stunRemaining - dt);
        continue;
      }
      m.hopPhase += dt * 7.5;
      const nextPos = resolveCircleCollisions(
        { x: m.pos.x + m.vel.x * dt, z: m.pos.z + m.vel.z * dt },
        0.45,
        this.cartridge.worldWidth,
        this.cartridge.worldDepth,
        this.allCollisionWalls
      );
      if (Math.abs(nextPos.x - (m.pos.x + m.vel.x * dt)) > 1e-4) m.vel.x *= -1;
      if (Math.abs(nextPos.z - (m.pos.z + m.vel.z * dt)) > 1e-4) m.vel.z *= -1;
      m.pos = nextPos;

      this.grid.depositPlaqueCircle(
        m.pos.x,
        m.pos.z,
        MUTANS_TRAIL_RADIUS,
        MUTANS_DEPOSIT_RATE,
        dt
      );

      m.acidDropCooldown -= dt;
      if (m.acidDropCooldown <= 0 && this.acidPools.length < 8) {
        m.acidDropCooldown = 7.0;
        this.acidPools.push({
          id: this.nextEntityId++,
          pos: { x: m.pos.x, z: m.pos.z },
          radius: ACID_POOL_RADIUS,
          remainingSec: ACID_POOL_LIFETIME_SEC,
        });
      }

      // Playful Slime-Boing bump against HYDRA-1 (zero HP bar!)
      const dx = this.probePos.x - m.pos.x;
      const dz = this.probePos.z - m.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < PROBE_RADIUS + 0.45 && dist > 0.01 && this.knockbackTimer <= 0) {
        this.knockbackTimer = PROBE_KNOCKBACK_SEC;
        this.bus.emit('mutans:bumped', { pos: { x: m.pos.x, z: m.pos.z } });
        this.knockbackVel = {
          x: (dx / dist) * 8.5,
          z: (dz / dist) * 8.5,
        };
        m.vel.x = -(dx / dist) * MUTANS_MOVE_SPEED;
        m.vel.z = -(dz / dist) * MUTANS_MOVE_SPEED;
      }
    }

    // Acid pools lifetime
    for (let i = this.acidPools.length - 1; i >= 0; i--) {
      this.acidPools[i].remainingSec -= dt;
      if (this.acidPools[i].remainingSec <= 0) {
        this.acidPools.splice(i, 1);
      }
    }
  }

  private evaluateSitesAndDistricts(): void {
    for (const site of this.sites) {
      site.localCleanRatio = this.grid.getAreaCleanRatio(
        site.pos.x,
        site.pos.z,
        SITE_RESTORE_RADIUS
      );
      if (!site.restored && site.localCleanRatio >= SITE_RESTORE_CLEAN_RATIO) {
        site.restored = true;
        this.scoring.recordCommensalSiteRestored();
        const surgeDelta = this.addSurge(SURGE_PER_SITE_RESTORED);
        this.bus.emit('site:restored', {
          siteId: site.id,
          pos: { x: site.pos.x, z: site.pos.z },
          districtIdx: site.districtIdx,
          surgeDelta,
        });
      }
    }

    for (let di = 0; di < this.cartridge.districts.length; di++) {
      if (this.sealedDistricts[di]) continue;
      const ratio = this.grid.getDistrictCleanRatio(di);
      const allDistrictSitesRestored = this.sites
        .filter((s) => s.districtIdx === di)
        .every((s) => s.restored);

      if (ratio >= DISTRICT_SEAL_CLEAN_RATIO && allDistrictSitesRestored) {
        this.sealedDistricts[di] = true;
        this.grid.sealDistrict(di);
        this.bus.emit('district:sealed', {
          districtIdx: di,
          districtName: this.cartridge.districts[di].name,
          worldCleanRatio: this.grid.getWorldCleanRatio(),
        });
      }
    }
  }

  private evaluateMissionCompletion(): void {
    if (this.activeMode === 'ARCADE') {
      if (this.sealedDistricts.length > 0 && this.sealedDistricts.every(Boolean)) {
        this.finishMission(true);
      }
    } else {
      // PULP_RESCUE 90s scramble
      const cleanRatio = this.grid.getWorldCleanRatio();
      if (cleanRatio >= PULP_RESCUE_WIN_CLEAN_RATIO) {
        this.grid.sealDistrict(0);
        this.finishMission(true);
      } else if (this.elapsedSec >= PULP_RESCUE_DURATION_SEC) {
        this.finishMission(false);
      }
    }
  }

  private finishMission(won: boolean): void {
    this.completed = true;
    this.running = false;
    const breakdown = this.scoring.evaluateBreakdown({
      worldCleanRatio: this.grid.getWorldCleanRatio(),
      sitesTotal: this.sites.length,
      elapsedSec: this.elapsedSec,
      parTimeSec: this.cartridge.parTimeSec,
    });
    const unlockedHistoryNoteId =
      won && this.cartridge.historyNoteIds.length > 0
        ? this.cartridge.historyNoteIds[0]
        : null;

    this.bus.emit('mission:complete', {
      mode: this.activeMode,
      worldId: this.cartridge.id,
      won,
      breakdown,
      unlockedHistoryNoteId,
    });
  }
}
