import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/engine/EventBus';
import { SaveSystem } from '../src/engine/persistence/SaveSystem';
import { WorldSession } from '../src/engine/sim/WorldSession';
import { plaqueCityCartridge } from '../src/worlds/plaqueCityCartridge';

describe('WorldSession — Plaque City Integration', () => {
  it('bakes Plaque City, charges Surge, zaps bridges via Floss Zip, restores Commensal Sites, and seals all 3 districts', () => {
    const bus = new EventBus();
    const saveSys = new SaveSystem(bus);
    const save = saveSys.load(1_700_000_000_000);
    save.pendingSupplyBeacons = 4;
    saveSys.save(save);

    const session = new WorldSession(bus);
    session.loadCartridge(plaqueCityCartridge, saveSys.getSave(), 'ARCADE');

    expect(session.sites.length).toBe(10);
    expect(session.beacons.length).toBe(4);
    expect(session.grid.getWorldCleanRatio()).toBeLessThan(0.05);

    // Move & scrub around spawn to verify Surge charging
    for (let i = 0; i < 30; i++) {
      session.step(1 / 60, {
        moveX: 1,
        moveZ: 0,
        scrubHeld: true,
        aimWorldPos: null,
        fireFlossRequested: false,
        fireRinseRequested: false,
        fireDiscloseRequested: false,
      });
    }
    expect(session.surgeMeter).toBeGreaterThan(0);

    // Position HYDRA-1 at west mouth of Premolar North Alley (30.2, 10.5) & fire Floss East
    session.probePos = { x: 29.6, z: 10.5 };
    session.step(1 / 60, {
      moveX: 0,
      moveZ: 0,
      scrubHeld: false,
      aimWorldPos: { x: 34.0, z: 10.5 },
      fireFlossRequested: true,
      fireRinseRequested: false,
      fireDiscloseRequested: false,
    });
    expect(session.probeZip).not.toBeNull();
    const northBridge = session.bridges.find((b) => b.id === 'bridge_north');
    expect(northBridge?.intact).toBe(false);

    // Complete zip traversal across narrow interdental contact
    for (let i = 0; i < 20; i++) {
      session.step(1 / 60, {
        moveX: 0,
        moveZ: 0,
        scrubHeld: false,
        aimWorldPos: null,
        fireFlossRequested: false,
        fireRinseRequested: false,
        fireDiscloseRequested: false,
      });
    }
    expect(session.probeZip).toBeNull();
    expect(session.probePos.x).toBeCloseTo(33.8, 2);

    // Verify Commensal Site reactivation at >= 85% local clean & automatic District Remineralization Wave
    const sealedEvents: number[] = [];
    let missionWon = false;
    bus.on('district:sealed', ({ districtIdx }) => sealedEvents.push(districtIdx));
    bus.on('mission:complete', ({ won, breakdown, worldId }) => {
      missionWon = won;
      saveSys.recordMissionCompletion({
        mode: 'ARCADE',
        worldId,
        won,
        breakdown,
        historyNoteIds: plaqueCityCartridge.historyNoteIds,
      });
    });

    // Sweep clean across the entire arch via wide filament passes to trigger all 10 sites + all 3 districts
    for (let z = 5.0; z <= 27.0; z += 1.0) {
      session.grid.applyFlossSegment(2.5, z, 61.5, z, 0.75);
    }
    session.step(1 / 60, {
      moveX: 0,
      moveZ: 0,
      scrubHeld: false,
      aimWorldPos: null,
      fireFlossRequested: false,
      fireRinseRequested: false,
      fireDiscloseRequested: false,
    });

    expect(session.sites.every((s) => s.restored)).toBe(true);
    expect(sealedEvents).toEqual([0, 1, 2]);
    expect(missionWon).toBe(true);
    expect(saveSys.getSave().unlockedUpgrades).toContain('angled_bass_array');
    expect(saveSys.getSave().unlockedHistoryNotes).toContain('1498_beijing_1683_delft');
  });

  it('zips westward through the east mouth even when a parked cursor points away from the alley', () => {
    const bus = new EventBus();
    const saveSys = new SaveSystem(bus);
    saveSys.load(1_700_000_000_000);
    const session = new WorldSession(bus);
    session.loadCartridge(plaqueCityCartridge, saveSys.getSave(), 'ARCADE');
    session.probePos = { x: 35.0, z: 10.5 };
    const idle = { scrubHeld: false, fireRinseRequested: false, fireDiscloseRequested: false };
    for (let i = 0; i < 4; i++) {
      session.step(1 / 60, { ...idle, moveX: -1, moveZ: 0, aimWorldPos: { x: 44, z: 14 }, fireFlossRequested: false });
    }
    session.step(1 / 60, { ...idle, moveX: -1, moveZ: 0, aimWorldPos: { x: 44, z: 14 }, fireFlossRequested: true });
    expect(session.probeZip).not.toBeNull();
    expect(session.probeZip?.to.x).toBeCloseTo(30.2, 2);
  });

  it('zips reliably across South and Molar alleys in both directions under diagonal, wall-slide, parked-cursor, and smart-aim inputs', () => {
    const bus = new EventBus();
    const saveSys = new SaveSystem(bus);
    saveSys.load(1_700_000_000_000);
    const session = new WorldSession(bus);
    session.loadCartridge(plaqueCityCartridge, saveSys.getSave(), 'ARCADE');
    const idle = { scrubHeld: false, fireRinseRequested: false, fireDiscloseRequested: false };

    const completeZip = () => {
      for (let i = 0; i < 20; i++) {
        session.step(1 / 60, { ...idle, moveX: 0, moveZ: 0, aimWorldPos: null, fireFlossRequested: false });
      }
      session.flossCooldown = 0;
    };

    // 1. South alley Eastward: steep diagonal approach with smart auto-aim (null aimWorldPos)
    session.probePos = { x: 29.2, z: 22.6 };
    session.probeFacingRad = -Math.PI / 2; // sliding North along the divider wall
    session.step(1 / 60, { ...idle, moveX: 0, moveZ: -1, aimWorldPos: null, fireFlossRequested: true });
    expect(session.probeZip).not.toBeNull();
    expect(session.probeZip?.to.x).toBeCloseTo(33.8, 2);
    expect(session.probeZip?.to.z).toBeCloseTo(21.5, 2);
    completeZip();

    // 2. South alley Westward: wall-sliding South along the east divider with a parked cursor in the wrong direction
    session.probePos = { x: 34.6, z: 20.6 };
    session.probeFacingRad = Math.PI / 2; // facing South (90 deg perpendicular to alley)
    session.step(1 / 60, { ...idle, moveX: 0, moveZ: 1, aimWorldPos: { x: 50, z: 8 }, fireFlossRequested: true });
    expect(session.probeZip).not.toBeNull();
    expect(session.probeZip?.to.x).toBeCloseTo(30.2, 2);
    expect(session.probeZip?.to.z).toBeCloseTo(21.5, 2);
    completeZip();

    // 3. Molar alley Eastward: pointer-steering into the west mouth (43.2, 16.0) and firing Floss
    session.probePos = { x: 42.3, z: 16.8 };
    session.step(1 / 60, {
      ...idle,
      moveX: 0.6,
      moveZ: -0.5,
      aimWorldPos: { x: 43.2, z: 16.0 },
      fireFlossRequested: true,
    });
    expect(session.probeZip).not.toBeNull();
    expect(session.probeZip?.to.x).toBeCloseTo(46.6, 2);
    expect(session.probeZip?.to.z).toBeCloseTo(16.0, 2);
    completeZip();

    // 4. Molar alley Westward: diagonal approach from East mouth (46.6, 16.0)
    session.probePos = { x: 47.5, z: 15.1 };
    session.step(1 / 60, {
      ...idle,
      moveX: -0.5,
      moveZ: 0.5,
      aimWorldPos: { x: 20, z: 26 },
      fireFlossRequested: true,
    });
    expect(session.probeZip).not.toBeNull();
    expect(session.probeZip?.to.x).toBeCloseTo(43.2, 2);
    expect(session.probeZip?.to.z).toBeCloseTo(16.0, 2);
  });

  it('purges resident S. mutans and acid pools when a district seals and blocks wandering cocci from re-soiling sealed crowns', () => {
    const bus = new EventBus();
    const saveSys = new SaveSystem(bus);
    saveSys.load(1_700_000_000_000);
    const session = new WorldSession(bus);
    session.loadCartridge(plaqueCityCartridge, saveSys.getSave(), 'ARCADE');

    // Seed resident S. mutans + an acid pool inside District 0 (x: 2.5..22, z: 4.5..27.5),
    // plus a wandering S. mutans in District 1 aimed westward toward District 0.
    session.mutans.push(
      {
        id: 9001,
        pos: { x: 12, z: 16 },
        vel: { x: 2.5, z: 0 },
        hopPhase: 0,
        hp: 2,
        stunRemaining: 0,
        acidDropCooldown: 0.1,
        parentSucroseId: 'suc_d0',
      },
      {
        id: 9002,
        pos: { x: 23.2, z: 10.5 },
        vel: { x: -4.2, z: 0 },
        hopPhase: 0,
        hp: 2,
        stunRemaining: 0,
        acidDropCooldown: 0.05,
        parentSucroseId: 'suc_d1',
      }
    );
    session.acidPools.push(
      {
        id: 9100,
        pos: { x: 11.5, z: 15.5 },
        radius: 1.5,
        remainingSec: 8,
      },
      {
        id: 9101,
        pos: { x: 1.4, z: 28.1 }, // outer gingival collar bordering District 0
        radius: 1.5,
        remainingSec: 8,
      }
    );

    // Clean only District 0 so District 0 seals while Districts 1 & 2 remain open
    for (let z = 5.0; z <= 27.0; z += 1.0) {
      session.grid.applyFlossSegment(2.5, z, 22.0, z, 0.75);
    }

    const idle = {
      moveX: 0,
      moveZ: 0,
      scrubHeld: false,
      aimWorldPos: null,
      fireFlossRequested: false,
      fireRinseRequested: false,
      fireDiscloseRequested: false,
    };
    session.step(1 / 60, idle);

    expect(session.sealedDistricts[0]).toBe(true);
    expect(session.sealedDistricts[1]).toBe(false);
    const d0 = plaqueCityCartridge.districts[0].bounds;
    expect(session.mutans.some((m) => m.pos.x <= d0.maxX)).toBe(false);
    expect(session.acidPools.some((p) => p.pos.x <= d0.maxX)).toBe(false);
    expect(session.grid.getDistrictCleanRatio(0)).toBe(1);

    // Advance 3 seconds of ecology: wandering District 1 cocci must bounce off District 0 and keep it 100% clean
    for (let i = 0; i < 180; i++) {
      session.step(1 / 60, idle);
    }
    expect(session.mutans.some((m) => m.pos.x <= d0.maxX)).toBe(false);
    expect(session.acidPools.some((p) => p.pos.x <= d0.maxX)).toBe(false);
    expect(session.grid.getDistrictCleanRatio(0)).toBe(1);
  });
});
