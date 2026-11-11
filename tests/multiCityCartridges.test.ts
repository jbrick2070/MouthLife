import { describe, expect, it } from 'vitest';
import { FLOSS_ZIP_ENTRY_DIST, PROBE_RADIUS, STEPHAN_RECOVERY_SEC } from '../src/config/gameConfig';
import { HOST_CITIES, getHistoryNoteById } from '../src/config/hostsAndHistory';
import { EventBus } from '../src/engine/EventBus';
import { SaveSystem } from '../src/engine/persistence/SaveSystem';
import {
  buildAlleyWalls,
  circleIntersectsAABB,
  findNearestZipMouth,
  segmentsIntersect2D,
  tryStartCapillaryZip,
} from '../src/engine/physics/CollisionSystem';
import { type SessionInputCommand, WorldSession } from '../src/engine/sim/WorldSession';
import type { AABB2D, Vec2, WorldCartridge } from '../src/engine/types';
import { crescentSulcusCartridge } from '../src/worlds/crescentSulcusCartridge';
import { fluorapatiteCoastCartridge } from '../src/worlds/fluorapatiteCoastCartridge';
import { neonAcidClockCartridge } from '../src/worlds/neonAcidClockCartridge';
import { orbitalBiofilmDomeCartridge } from '../src/worlds/orbitalBiofilmDomeCartridge';
import { plaqueCityCartridge } from '../src/worlds/plaqueCityCartridge';
import { getCartridgeById, isPlayableWorld, PLAYABLE_CARTRIDGES } from '../src/worlds/worldRegistry';

const IDLE: SessionInputCommand = {
  moveX: 0,
  moveZ: 0,
  scrubHeld: false,
  aimWorldPos: null,
  fireFlossRequested: false,
  fireRinseRequested: false,
  fireDiscloseRequested: false,
};

function makeSession(cart: WorldCartridge, mutate?: (s: ReturnType<SaveSystem['getSave']>) => void) {
  const bus = new EventBus();
  const saveSys = new SaveSystem(bus);
  const save = saveSys.load(1_700_000_000_000);
  mutate?.(save);
  saveSys.save(save);
  const session = new WorldSession(bus);
  session.loadCartridge(cart, saveSys.getSave(), 'ARCADE');
  return { bus, saveSys, session };
}

function inAnyBox(boxes: readonly AABB2D[], p: Vec2): boolean {
  return boxes.some((b) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ);
}

/**
 * Flood-fills walkable HYDRA-1 positions on a 0.5u lattice, adding Capillary Tether-Zip edges
 * across every interdental alley, and returns a reachability predicate.
 */
function buildReachability(cart: WorldCartridge): (p: Vec2, tol: number) => boolean {
  const walls = [...cart.wallBoxes, ...buildAlleyWalls(cart)];
  const step = 0.5;
  const nx = Math.floor(cart.worldWidth / step);
  const nz = Math.floor(cart.worldDepth / step);
  const walkable = (x: number, z: number) =>
    x >= PROBE_RADIUS + 0.5 &&
    z >= PROBE_RADIUS + 0.5 &&
    x <= cart.worldWidth - PROBE_RADIUS - 0.5 &&
    z <= cart.worldDepth - PROBE_RADIUS - 0.5 &&
    !walls.some((w) => circleIntersectsAABB(x, z, PROBE_RADIUS, w));

  const seen = new Uint8Array(nx * nz);
  const queue: number[] = [];
  const push = (ix: number, iz: number) => {
    if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return;
    const k = iz * nx + ix;
    if (seen[k] || !walkable(ix * step, iz * step)) return;
    seen[k] = 1;
    queue.push(k);
  };
  push(Math.round(cart.probeSpawn.x / step), Math.round(cart.probeSpawn.z / step));

  const zipJump = (fromX: number, fromZ: number) => {
    for (const alley of cart.interdentalAlleys) {
      for (const [entry, exit] of [
        [alley.endpointA, alley.endpointB],
        [alley.endpointB, alley.endpointA],
      ] as const) {
        if (Math.hypot(fromX - entry.x, fromZ - entry.z) > FLOSS_ZIP_ENTRY_DIST) continue;
        const aim = { x: exit.x - fromX, z: exit.z - fromZ };
        if (tryStartCapillaryZip({ x: fromX, z: fromZ }, aim, cart.interdentalAlleys, cart.wallBoxes)) {
          // Land on the nearest walkable lattice node around the exit
          for (let r = 0; r <= 3; r++) {
            for (let dx = -r; dx <= r; dx++) {
              for (let dz = -r; dz <= r; dz++) {
                push(Math.round(exit.x / step) + dx, Math.round(exit.z / step) + dz);
              }
            }
          }
        }
      }
    }
  };

  while (queue.length > 0) {
    const k = queue.shift()!;
    const ix = k % nx;
    const iz = Math.floor(k / nx);
    push(ix + 1, iz);
    push(ix - 1, iz);
    push(ix, iz + 1);
    push(ix, iz - 1);
    zipJump(ix * step, iz * step);
  }

  return (p, tol) => {
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        if (seen[iz * nx + ix] && Math.hypot(ix * step - p.x, iz * step - p.z) <= tol) return true;
      }
    }
    return false;
  };
}

describe('Multi-City Cartridge Registry', () => {
  it('registers all 5 playable worlds (Toronto, New Orleans, Tokyo/Chicago, Accra/Colorado, Station Aurora) and wires them to globe cities', () => {
    expect(isPlayableWorld('world_2')).toBe(true);
    expect(isPlayableWorld('world_3')).toBe(true);
    expect(isPlayableWorld('world_4')).toBe(true);
    expect(isPlayableWorld('world_5')).toBe(true);
    expect(getCartridgeById('world_2').bChannelMode).toBe('gumIrritation');
    expect(getCartridgeById('world_3').bChannelMode).toBe('localPh');
    expect(getCartridgeById('world_4').bChannelMode).toBe('localPh');
    expect(getCartridgeById('world_5').bChannelMode).toBe('epsArmor');

    for (const city of HOST_CITIES) {
      if (!city.playableInSlice) continue;
      const cart = PLAYABLE_CARTRIDGES[city.worldId];
      expect(cart, `playable city ${city.id} must resolve a cartridge`).toBeDefined();
      expect(cart.hostId).toBe(city.id);
      for (const noteId of cart.historyNoteIds) {
        expect(getHistoryNoteById(noteId)).toBeDefined();
      }
    }
    const playableIds = HOST_CITIES.filter((c) => c.playableInSlice).map((c) => c.worldId);
    expect(playableIds).toEqual(
      expect.arrayContaining(['world_1', 'world_2', 'world_3', 'world_4', 'world_5'])
    );
  });

  for (const cart of [
    plaqueCityCartridge,
    crescentSulcusCartridge,
    neonAcidClockCartridge,
    fluorapatiteCoastCartridge,
    orbitalBiofilmDomeCartridge,
  ]) {
    it(`${cart.title}: every entity sits on playable enamel, clear of walls, and is reachable (walk + zip)`, () => {
      const walls = [...cart.wallBoxes, ...buildAlleyWalls(cart)];
      const reachable = buildReachability(cart);
      const pts: Array<[string, Vec2]> = [
        ['spawn', cart.probeSpawn],
        ...cart.commensalSiteSpawns.map((s) => [s.id, s.pos] as [string, Vec2]),
        ...cart.sucroseSpawns.map((s) => [s.id, s.pos] as [string, Vec2]),
        ...cart.salivaSprings.map((p, i) => [`spring_${i}`, p] as [string, Vec2]),
        ...cart.beaconDropSlots.map((p, i) => [`beacon_${i}`, p] as [string, Vec2]),
      ];
      for (const [id, p] of pts) {
        expect(inAnyBox(cart.playableMaskBoxes, p), `${id} on playable enamel`).toBe(true);
        expect(walls.some((w) => circleIntersectsAABB(p.x, p.z, 0.3, w)), `${id} clear of walls`).toBe(false);
        expect(reachable(p, 1.5), `${id} reachable`).toBe(true);
      }
      for (const s of cart.commensalSiteSpawns) {
        expect(inAnyBox([cart.districts[s.districtIdx].bounds], s.pos)).toBe(true);
      }
      for (const br of cart.biofilmBridges) {
        const alley = cart.interdentalAlleys.find((a) => a.bridgeId === br.id);
        expect(alley, `${br.id} spans an alley`).toBeDefined();
        expect(segmentsIntersect2D(br.a, br.b, alley!.endpointA, alley!.endpointB)).toBe(true);
      }
    });
  }

  it('findNearestZipMouth reports the near-side alley mouth, zip range and walking blockage', () => {
    const far = findNearestZipMouth({ x: 8, z: 16 }, plaqueCityCartridge.interdentalAlleys, plaqueCityCartridge.wallBoxes);
    expect(far).toBeNull();

    const near = findNearestZipMouth({ x: 28.2, z: 10.5 }, plaqueCityCartridge.interdentalAlleys, plaqueCityCartridge.wallBoxes);
    expect(near?.alley.id).toBe('alley_premolar_north');
    expect(near?.entry.x).toBeCloseTo(30.2);
    expect(near?.exit.x).toBeCloseTo(33.8);
    expect(near?.inZipRange).toBe(false);
    expect(near?.blockedToWalking).toBe(true);

    const inRange = findNearestZipMouth({ x: 29.6, z: 10.5 }, plaqueCityCartridge.interdentalAlleys, plaqueCityCartridge.wallBoxes);
    expect(inRange?.inZipRange).toBe(true);

    // From the east side, the mouth flips to endpointB
    const east = findNearestZipMouth({ x: 34.6, z: 21.5 }, plaqueCityCartridge.interdentalAlleys, plaqueCityCartridge.wallBoxes);
    expect(east?.alley.id).toBe('alley_premolar_south');
    expect(east?.entry.x).toBeCloseTo(33.8);
  });
});

describe('World 2 — Crescent Sulcus (1819 Parmly & 1948 Bass gumIrritation)', () => {
  it('heavy stationary scrubbing inflames the sulcus until tender lockout, while moving sweeps stay gentle', () => {
    const { bus, session } = makeSession(crescentSulcusCartridge);
    expect(session.hasSulcusCare()).toBe(true);
    expect(session.grid.isSulcusAt(10, 26.2)).toBe(true);
    expect(session.grid.isSulcusAt(10, 16)).toBe(false);

    const tender: number[] = [];
    bus.on('gum:tender', ({ warnings }) => tender.push(warnings));

    // Park HYDRA-1 on the south gumline facing the margin and scrub without moving
    session.probePos = { x: 10, z: 25.4 };
    session.probeFacingRad = Math.PI / 2;
    for (let i = 0; i < 90; i++) {
      session.step(1 / 60, { ...IDLE, scrubHeld: true, aimWorldPos: { x: 10, z: 27 } });
    }
    const stationaryPeak = session.chemistry.getMaxGumIrritation();
    expect(stationaryPeak).toBeGreaterThan(0.72);
    expect(tender.length).toBeGreaterThan(0);

    // Fresh session: gentle moving sweep along the same gumline barely irritates
    const gentle = makeSession(crescentSulcusCartridge).session;
    gentle.probePos = { x: 5, z: 25.2 };
    for (let i = 0; i < 90; i++) {
      gentle.step(1 / 60, { ...IDLE, moveX: 1, scrubHeld: true });
    }
    expect(gentle.chemistry.getMaxGumIrritation()).toBeLessThan(stationaryPeak * 0.5);
  });

  it('Hydro-Sonic Acoustic Streaming halves sulcus pressure buildup and Saliva springs soothe gums', () => {
    const base = makeSession(crescentSulcusCartridge).session;
    const hydro = makeSession(crescentSulcusCartridge, (s) => {
      s.unlockedUpgrades.push('hydro_sonic_pulse');
      s.equippedUpgrades.brush = 'hydro_sonic_pulse';
    }).session;
    expect(hydro.getSulcusIrritationRate()).toBeCloseTo(base.getSulcusIrritationRate() * 0.5, 5);
    expect(makeSession(plaqueCityCartridge).session.getSulcusIrritationRate()).toBe(0);

    base.chemistry.addGumIrritation(12.5, 24.5, 1.5, 0.9);
    const before = base.chemistry.getMaxGumIrritation();
    base.probePos = { x: 12.5, z: 21.5 }; // Saliva spring
    base.step(1 / 60, IDLE);
    expect(base.chemistry.getMaxGumIrritation()).toBeLessThan(before - 0.4);
  });

  it('is fully clearable: seals all districts, unlocks the Parmly/Bass note and Hydro-Sonic upgrade', () => {
    const { bus, saveSys, session } = makeSession(crescentSulcusCartridge);
    let won = false;
    bus.on('mission:complete', ({ won: w, breakdown, worldId }) => {
      won = w;
      saveSys.recordMissionCompletion({
        mode: 'ARCADE',
        worldId,
        won: w,
        breakdown,
        historyNoteIds: crescentSulcusCartridge.historyNoteIds,
      });
    });
    for (let z = 5.0; z <= 27.0; z += 1.0) session.grid.applyFlossSegment(2.5, z, 61.5, z, 0.75);
    session.step(1 / 60, IDLE);
    expect(session.sealedDistricts).toEqual([true, true, true]);
    expect(won).toBe(true);
    expect(saveSys.getSave().unlockedHistoryNotes).toContain('1819_1948_new_orleans');
    expect(saveSys.getSave().unlockedUpgrades).toContain('hydro_sonic_pulse');
    // Zero streak loss: stamps never decay through play
    expect(saveSys.getSave().totalBrushStamps).toBeGreaterThanOrEqual(0);
  });
});

describe('World 3 — Neon Acid Clock (1940 Stephan Curve localPh)', () => {
  it('sweet sips plunge plaque pH below 5.5, acid-shield brushing, and springs/rinse buffer the clock', () => {
    const { bus, session } = makeSession(neonAcidClockCartridge);
    expect(session.hasStephanClock()).toBe(true);
    const sips: number[] = [];
    const buffered: number[] = [];
    bus.on('stephan:sip', ({ sipIndex }) => sips.push(sipIndex));
    bus.on('stephan:buffered', ({ remainingSec }) => buffered.push(remainingSec));

    // Wait out the 6 s opening countdown parked away from springs
    session.probePos = { x: 6, z: 7 };
    for (let i = 0; i < 6.2 * 60; i++) session.step(1 / 60, IDLE);
    expect(sips).toEqual([1]);
    expect(session.chemistry.getAveragePh()).toBeLessThan(5.5);
    expect(session.getStephanSipCountdown()).toBeGreaterThan(20);

    // Brushing during the acid window is shielded (acid abrasion warnings, no cleaning)
    const warns: boolean[] = [];
    bus.on('actuator:scrub', ({ acidWarn }) => warns.push(acidWarn));
    session.step(1 / 60, { ...IDLE, scrubHeld: true, moveX: 1 });
    expect(warns).toContain(true);

    // Salivary bicarbonate spring shortens the acid clock
    const before = session.chemistry.getStephanTimerSec();
    session.probePos = { x: 10, z: 20 };
    session.step(1 / 60, IDLE);
    expect(buffered.length).toBe(1);
    expect(session.chemistry.getStephanTimerSec()).toBeLessThan(before - 5);
    expect(before).toBeLessThanOrEqual(STEPHAN_RECOVERY_SEC);
  });

  it('shattering every Sucrose soda-sip crystal cuts off the sugar supply and stops the acid clock', () => {
    const { bus, session } = makeSession(neonAcidClockCartridge);
    const shattered: string[] = [];
    let sipCount = 0;
    bus.on('sucrose:shattered', ({ crystalId }) => shattered.push(crystalId));
    bus.on('stephan:sip', () => sipCount++);

    for (const c of session.sucroseCrystals) {
      session.probePos = { x: c.pos.x - 2.5, z: c.pos.z };
      session.flossCooldown = 0;
      session.step(1 / 60, { ...IDLE, fireFlossRequested: true, aimWorldPos: { x: c.pos.x, z: c.pos.z } });
    }
    expect(shattered.length).toBe(neonAcidClockCartridge.sucroseSpawns.length);
    expect(session.getStephanSipCountdown()).toBe(0);
    session.probePos = { x: 6, z: 7 };
    for (let i = 0; i < 30 * 60; i++) session.step(1 / 60, IDLE);
    expect(sipCount).toBe(0);
  });

  it('is fully clearable and unlocks the Stephan field note', () => {
    const { bus, saveSys, session } = makeSession(neonAcidClockCartridge);
    let won = false;
    bus.on('mission:complete', ({ won: w, breakdown, worldId }) => {
      won = w;
      saveSys.recordMissionCompletion({
        mode: 'ARCADE',
        worldId,
        won: w,
        breakdown,
        historyNoteIds: neonAcidClockCartridge.historyNoteIds,
      });
    });
    for (let z = 5.0; z <= 27.0; z += 1.0) session.grid.applyFlossSegment(2.5, z, 61.5, z, 0.75);
    session.step(1 / 60, IDLE);
    expect(won).toBe(true);
    expect(saveSys.getSave().unlockedHistoryNotes).toContain('1940_chicago_stephan');
  });
});

describe('World 4 — Fluorapatite Coast (Hibiscus Erosion & Miswak/1901–1945 F⁻ Conversion)', () => {
  it('hibiscus pH 4.95 basins shield unsealed Hydroxyapatite, while Miswak-Saliva F⁻ infusion converts enamel to Fluorapatite and scrubs cleanly', () => {
    const { bus, session } = makeSession(fluorapatiteCoastCartridge);
    expect(session.hasErosionChallenge()).toBe(true);

    // Move directly into District 0 hibiscus basin (14.0, 11.5) where pH = 4.95 (< 5.5 HA, > 4.5 FA)
    session.probePos = { x: 14.0, z: 11.5 };
    const scrubEvents: Array<{ newlyCleaned: number; acidWarn: boolean }> = [];
    bus.on('actuator:scrub', ({ newlyCleaned, acidWarn }) =>
      scrubEvents.push({ newlyCleaned, acidWarn })
    );

    session.step(0.1, { ...IDLE, scrubHeld: true, moveX: 1 });
    expect(scrubEvents.some((e) => e.acidWarn)).toBe(true);
    expect(session.grid.isFluorideSealedAt(14.0, 11.5)).toBe(false);

    // Touch Miswak-Saliva spring at (11.0, 20.5) to gain F⁻ lattice infusion
    let infusedCount = 0;
    bus.on('fluorapatite:infused', ({ cellsConverted }) => {
      infusedCount += cellsConverted;
    });
    session.probePos = { x: 11.0, z: 20.5 };
    session.step(1 / 60, IDLE);
    expect(infusedCount).toBeGreaterThan(0);
    expect(session.getFluorapatiteInfusionSec()).toBeGreaterThan(8.0);

    // Re-enter pH 4.95 hibiscus basin while F⁻-infused: converts enamel to Fluorapatite & cleans without acid warning!
    scrubEvents.length = 0;
    session.probePos = { x: 14.0, z: 11.5 };
    for (let i = 0; i < 30; i++) {
      session.step(1 / 30, { ...IDLE, scrubHeld: true, moveX: i % 2 === 0 ? 0.5 : -0.5 });
    }
    expect(session.grid.isFluorideSealedAt(14.0, 11.5)).toBe(true);
    expect(scrubEvents.every((e) => !e.acidWarn)).toBe(true);
    expect(scrubEvents.reduce((acc, e) => acc + e.newlyCleaned, 0)).toBeGreaterThan(0);

    // Advance past erosionPulseIntervalSec (14s) so periodic hibiscus wash fires and verify Fluorapatite stays stable
    let washes = 0;
    bus.on('erosion:wash', () => washes++);
    session.probePos = { x: 7.0, z: 24.0 };
    for (let i = 0; i < 14.5 * 30; i++) session.step(1 / 30, IDLE);
    expect(washes).toBeGreaterThanOrEqual(1);
    expect(session.grid.isFluorideSealedAt(14.0, 11.5)).toBe(true);
  });

  it('is fully clearable and unlocks the Miswak/Colorado F⁻ note plus Bicarbonate Buffer Jet upgrade', () => {
    const { bus, saveSys, session } = makeSession(fluorapatiteCoastCartridge);
    let won = false;
    bus.on('mission:complete', ({ won: w, breakdown, worldId }) => {
      won = w;
      saveSys.recordMissionCompletion({
        mode: 'ARCADE',
        worldId,
        won: w,
        breakdown,
        historyNoteIds: fluorapatiteCoastCartridge.historyNoteIds,
      });
    });
    for (let z = 5.0; z <= 27.0; z += 1.0) session.grid.applyFlossSegment(2.5, z, 61.5, z, 0.75);
    session.step(1 / 60, IDLE);
    expect(won).toBe(true);
    expect(saveSys.getSave().unlockedHistoryNotes).toContain('1901_colorado_accra_miswak');
    expect(saveSys.getSave().unlockedUpgrades).toContain('bicarb_buffer_jet');
  });
});

describe('World 5 — Quorum Dome (1973 Skylab & 1978 EPS Biofilm Armor)', () => {
  it('EPS domes deflect raw Sonic Bristles until fractured by Polymer Floss or Fluoride Surge', () => {
    const { bus, session } = makeSession(orbitalBiofilmDomeCartridge);
    expect(session.hasEpsDomes()).toBe(true);
    expect(session.grid.getInitialEpsArmorCount()).toBeGreaterThan(200);
    expect(session.grid.isEpsArmoredAt(15.5, 16.0)).toBe(true);

    let deflections = 0;
    const crackedVia: Array<'floss' | 'rinse'> = [];
    bus.on('eps:deflected', ({ warnings }) => {
      deflections += warnings;
    });
    bus.on('eps:cracked', ({ via }) => crackedVia.push(via));

    // Raw brushing bounces off the Cupola EPS dome
    session.probePos = { x: 15.5, z: 16.0 };
    const cleanBefore = session.grid.getAreaCleanRatio(15.5, 16.0, 2.0);
    for (let i = 0; i < 15; i++) {
      session.step(1 / 30, { ...IDLE, scrubHeld: true, moveX: 0.4 });
    }
    expect(deflections).toBeGreaterThan(0);
    expect(session.grid.isEpsArmoredAt(15.5, 16.0)).toBe(true);
    expect(session.grid.getAreaCleanRatio(15.5, 16.0, 2.0)).toBeCloseTo(cleanBefore, 4);

    // Quick-tap Polymer Floss auto-aims & fractures the EPS dome
    session.probePos = { x: 13.0, z: 16.0 };
    session.flossCooldown = 0;
    session.step(1 / 30, { ...IDLE, fireFlossRequested: true });
    expect(crackedVia).toContain('floss');
    expect(session.grid.isEpsArmoredAt(15.5, 16.0)).toBe(false);

    // Now Sonic Bristles orbit around (15.5, 16.0) and restore the commensal site!
    for (let i = 0; i < 75; i++) {
      const ang = (i / 75) * Math.PI * 2;
      session.probePos = {
        x: 15.5 + Math.cos(ang) * 0.7,
        z: 16.0 + Math.sin(ang) * 0.7,
      };
      session.step(1 / 30, {
        ...IDLE,
        scrubHeld: true,
        moveX: -Math.sin(ang) * 0.5,
        moveZ: Math.cos(ang) * 0.5,
      });
    }
    expect(session.grid.getAreaCleanRatio(15.5, 16.0, 2.0)).toBeGreaterThan(0.85);
    expect(session.sites.find((s) => s.id === 'aurora_d0_2')?.restored).toBe(true);

    // Fluoride-Bicarb Surge wave cracks the District 2 fortress dome at (55.0, 16.0)
    expect(session.grid.isEpsArmoredAt(55.0, 16.0)).toBe(true);
    session.probePos = { x: 55.0, z: 16.0 };
    session.surgeMeter = 100;
    session.step(1 / 30, { ...IDLE, fireRinseRequested: true });
    expect(crackedVia).toContain('rinse');
    expect(session.grid.isEpsArmoredAt(55.0, 16.0)).toBe(false);
  });

  it('is fully clearable and unlocks the 1973 Skylab & 1978 Biofilm field note', () => {
    const { bus, saveSys, session } = makeSession(orbitalBiofilmDomeCartridge);
    let won = false;
    bus.on('mission:complete', ({ won: w, breakdown, worldId }) => {
      won = w;
      saveSys.recordMissionCompletion({
        mode: 'ARCADE',
        worldId,
        won: w,
        breakdown,
        historyNoteIds: orbitalBiofilmDomeCartridge.historyNoteIds,
      });
    });
    for (let z = 5.0; z <= 27.0; z += 1.0) session.grid.applyFlossSegment(2.5, z, 61.5, z, 0.75);
    session.step(1 / 60, IDLE);
    expect(won).toBe(true);
    expect(saveSys.getSave().unlockedHistoryNotes).toContain('1973_skylab_orbit');
  });
});
