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
});
