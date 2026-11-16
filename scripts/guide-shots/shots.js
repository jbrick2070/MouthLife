// Photographs every picture the How to Play guide uses, from the real running game.
// Run after lib.js (see README.md). Each shot stages the game by hand, so the result is repeatable.
const out = {};
const S = () => D.session;
const frame = async (name, o = {}) => {
  out[name] = await G.cap(`${name}.jpg`, o);
};
const thumb = async (name, wx, wz, wy = 1.0, frac = 0.2) => {
  const p = G.scr(wx, wy, wz);
  out[name] = await G.cap(`${name}.jpg`, { w: 240, h: 240, cx: p.cx, cy: p.cy, frac, q: 0.86 });
};

const save = D.getSave();
save.pendingSupplyBeacons = 1; // so the first tooth has a supply beacon to photograph
D.saveSys.save(save);
await G.fresh('world_1');

// --- Dive: before, a first sweep, a bigger clean patch
G.zoom(1.9);
G.at(8.5, 15.6, 0);
G.step(2, {});
await G.wait(1500);
await frame('dive-1');
G.step(60, { moveX: 1, scrubHeld: true });
await G.wait(1300);
await frame('dive-2');
for (let pass = 0; pass < 3; pass++) {
  G.at(8.5, 14.2 + pass * 1.3, 0);
  G.step(62, { moveX: 1, scrubHeld: true });
}
G.at(14.6, 15.6, 0);
G.step(4, { moveX: 1, scrubHeld: true });
await G.wait(1300);
await frame('dive-3');

// --- Meet HYDRA-1: close-up on open plaque, brush running
G.zoom(3.3);
G.at(15.5, 8.6, 0);
G.step(12, { moveX: 1, scrubHeld: true });
await G.wait(1500);
await frame('cleaner');

// --- Close-ups on the front tooth
G.zoom(2.6);
G.at(6.0, 21.5, 0);
G.step(2, {});
await G.wait(1300);
await thumb('t-plaque', 9.5, 24.0, 0.6, 0.16);
G.at(13.2, 10.0, Math.PI);
G.step(2, {});
await G.wait(1300);
await thumb('t-helper-asleep', 10.5, 10.0, 1.3, 0.17);
const beacon = S().beacons.find((b) => !b.collected);
if (beacon) {
  G.zoom(3.0);
  G.at(beacon.pos.x + 3.2, beacon.pos.z + 0.4, Math.PI);
  G.step(1, {});
  await G.wait(1400);
  await thumb('t-beacon', beacon.pos.x, beacon.pos.z, 1.2, 0.2);
  G.zoom(2.6);
}
G.at(38.9, 21.5, Math.PI);
G.step(1, {});
await G.wait(1300);
await thumb('t-sugar', 36.2, 21.5, 1.3, 0.17);
const slime = S().mutans[0];
if (slime) {
  G.at(slime.pos.x + 2.6, slime.pos.z, Math.PI);
  await G.wait(1300);
  await thumb('t-slime', slime.pos.x, slime.pos.z, 1.0, 0.17);
}

// --- Floss through the south gap (x 30.2..33.8, z 21.5)
G.zoom(1.9);
G.at(28.3, 21.5, 0);
G.step(2, {});
await G.wait(1500);
await frame('floss-1', { cx: 0.56 });
G.step(1, { fireFlossRequested: true, aimWorldPos: { x: 33.8, z: 21.5 } });
G.step(3, {});
await G.wait(250);
await frame('floss-2', { cx: 0.56 });
G.step(50, {});
await G.wait(1400);
await frame('floss-3');

// --- Dye Scan on the untouched back tooth
G.zoom(1.35);
G.at(50.5, 16.5, 0);
G.step(2, {});
await G.wait(1500);
await frame('scan-1');
G.step(1, { fireDiscloseRequested: true });
G.step(45, {});
await G.wait(500);
await frame('scan-2');
G.step(260, {});

// --- Fluoride Surge: ready, then the wave growing
G.zoom(1.25);
G.at(15.5, 20.5, 0);
G.step(2, {});
S().surgeMeter = 100;
G.step(2, {});
await G.wait(1500);
await frame('surge-1');
G.step(1, { fireRinseRequested: true });
G.step(14, {});
await G.wait(200);
await frame('surge-2');
G.step(22, {});
await G.wait(200);
await frame('surge-3');
G.step(90, {});

// --- Acid puddle (placed by hand so the shot is repeatable) and a saliva spring
G.zoom(2.6);
S().acidPools.push({ id: 987654, pos: { x: 24.5, z: 22.5 }, radius: 1.25, remainingSec: 999 });
G.at(27.3, 22.5, Math.PI);
G.step(1, {});
await G.wait(1300);
await thumb('t-acid', 24.5, 22.5, 0.7, 0.18);
G.at(41.6, 16.0, Math.PI);
G.step(1, {});
await G.wait(1300);
await thumb('t-spring', 38.5, 16.0, 0.9, 0.17);

// --- Seal the back tooth: helper germs awake, and the gold edge
S().sealedDistricts[2] = true;
S().grid.sealDistrict(2);
G.zoom(1.9);
G.at(53.2, 17.6, 0);
G.step(2, {});
await G.wait(1600);
await thumb('t-helper-awake', 49.0, 21.5, 2.0, 0.2);
G.zoom(1.5);
G.at(49.5, 19.0, 0);
G.step(2, {});
await G.wait(1500);
await thumb('t-seal', 45.4, 24.2, 0.8, 0.26);

// --- Home (once any highlighted tooth has faded) and the globe
D.switchMode('HUB');
G.zoom(1);
await G.wait(7000);
await frame('home', { frac: 0.86 });
document.querySelector('#tab-globe')?.click();
await G.wait(3200);
await frame('cities');

// --- 2-Min Brush: the glow and the brush on two different quarters
D.switchMode('BRUSH_ALONG');
await G.wait(1200);
const crop = { frac: 0.4, cx: 0.5, cy: 0.5 };
D.clock.pacerElapsedSec = 64;
await G.wait(3600);
await frame('brush-1', crop);
D.clock.pacerElapsedSec = 94;
await G.wait(3600);
await frame('brush-2', crop);
D.switchMode('HUB');

// --- Slime dome in the space city. Taken last: after this city the Home teeth keep a blue tint.
await G.fresh('world_5');
G.zoom(1.7);
G.at(20.6, 16.0, Math.PI);
G.step(2, {});
await G.wait(1500);
await thumb('t-dome', 15.5, 16.0, 1.2, 0.3);

D.switchMode('HUB');

const names = Object.keys(out).map((n) => `${n}.jpg`);
await G.montage(names, 'contact-sheet.jpg', 6, 240, 160);
return { count: names.length, bytes: Object.values(out).reduce((a, b) => a + b, 0), out };
