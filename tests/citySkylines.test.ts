import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseCityArt,
  SKYLINE_ART_WIDTH,
  SKYLINE_PLACE,
  SKYLINE_PROP_PLACE,
  skylineDistrictIndex,
  skylineLightLevel,
  skylineLightStep,
  skylinePropStep,
  skylineStepLevel,
  SKYLINE_LIGHT_STEPS,
  SKYLINE_STEP_OFF,
  SKYLINE_STEP_ON,
  SKYLINE_STEP_SPAN,
  skylineMotionPivot,
  skylineMotionState,
  skylinePieceSpanY,
  SKYLINE_BLINK_OFF,
  skylinePoint,
  skylinePropAnchors,
  skylinePropPoint,
} from '../src/config/citySkylineGeometry';
import { CITY_SKYLINE_TEXT, cityArtForHost } from '../src/config/citySkylines';
import { PLAYABLE_CARTRIDGES } from '../src/worlds/worldRegistry';
import { renderSkylineSwift, SKYLINE_SWIFT_PATH } from '../scripts/skyline-native';

const triangles = (tris: number[]) => tris.length / 6;

describe('city skyline drawing format', () => {
  it('turns each shape into triangles', () => {
    const art = parseCityArt(
      [
        '; a note',
        '@skyline',
        'R 1 2 3 4 #112233',
        'P 0 0 4 0 4 2 0 2 #445566',
        'C 5 5 1 #000001',
        'H 5 5 1 #000002',
        'A 0 0 2 0.5 0 90 #000003',
        'L 0 0 3 4 0.2 #000004',
        'S 0 0 1 #000005',
        'N 0 0 1 0.4 20 #000006',
        'w 0 0 3 2 0.5 0.4 0.1 0.2 #ffee00',
        '@prop',
        'c 0 1 0.2 #abcdef',
      ].join('\n')
    );
    expect(art.skyline.map((p) => triangles(p.tris)).slice(0, 8)).toEqual([2, 2, 20, 12, 16, 2, 10, 28]);
    expect(art.skyline[0]).toMatchObject({ light: false, color: 0x112233, order: 0, cx: 2.5 });
    expect(art.skyline[0].tris).toEqual([1, 2, 4, 2, 4, 6, 1, 2, 4, 6, 1, 6]);

    // A window grid is one piece per window, all sharing one paint order, and windows are lights.
    const windows = art.skyline.slice(8);
    expect(windows).toHaveLength(6);
    expect(windows.every((p) => p.light && p.order === 8 && p.color === 0xffee00)).toBe(true);
    expect(windows.map((p) => [p.tris[0], p.tris[1]])).toEqual([
      [0, 0],
      [0.6, 0],
      [1.2, 0],
      [0, 0.6000000000000001],
      [0.6, 0.6000000000000001],
      [1.2, 0.6000000000000001],
    ]);

    // The prop section starts its own paint order.
    expect(art.prop).toHaveLength(1);
    expect(art.prop[0]).toMatchObject({ light: true, order: 0, color: 0xabcdef });
  });

  it('rejects lines it does not understand, naming the line', () => {
    expect(() => parseCityArt('R 1 2 3 #112233')).toThrow(/line 1.*wrong number/);
    expect(() => parseCityArt('\nZ 1 2 3 4 #112233')).toThrow(/line 2.*unknown shape/);
    expect(() => parseCityArt('R 1 2 3 4 112233')).toThrow(/bad colour/);
    expect(() => parseCityArt('R 1 2 x 4 #112233')).toThrow(/not a number/);
    expect(() => parseCityArt('P 0 0 1 1 #112233')).toThrow(/wrong number/);
  });

  it('shades a sky rectangle from its foot colour to its top colour', () => {
    const art = parseCityArt('g 0 1 10 4 #ff8800 #000000\nG 0 0 2 2 #112233 #445566');
    expect(art.skyline).toHaveLength(2);
    expect(art.skyline[0]).toMatchObject({ light: true, color: 0xff8800, topColor: 0x000000, group: 0 });
    expect(art.skyline[1]).toMatchObject({ light: false, color: 0x112233, topColor: 0x445566 });
    expect(art.skyline[0].tris).toHaveLength(12);
    expect(skylinePieceSpanY(art.skyline[0])).toEqual({ minY: 1, maxY: 5 });
    // Plain shapes carry no second colour.
    expect(parseCityArt('R 0 0 1 1 #112233').skyline[0].topColor).toBeNull();
    expect(() => parseCityArt('G 0 0 2 2 #112233')).toThrow(/line 1/);
  });

  it('groups shapes that move together', () => {
    const art = parseCityArt(
      [
        '@skyline',
        'R 0 0 1 1 #000001',
        '~slide 3 14',
        'R 5 0 2 1 #000002',
        'w 5.2 0.2 2 1 0.5 0.4 0.2 0 #ffee00',
        '~end',
        '~spin 10 2 -60',
        'l 10 2 10 3 0.1 #00ffff',
        '~end',
        '~sway 20 0 4 5',
        'L 20 0 20 2 0.1 #000003',
        '~end',
        '~blink 2 0.5',
        'c 30 6 0.1 #ff0000',
        '~end',
        'R 40 0 1 1 #000004',
      ].join('\n')
    );
    expect(art.motions).toEqual([
      { kind: 'slide', args: [3, 14] },
      { kind: 'spin', args: [10, 2, -60] },
      { kind: 'sway', args: [20, 0, 4, 5] },
      { kind: 'blink', args: [2, 0.5] },
    ]);
    expect(art.skyline.map((p) => p.group)).toEqual([0, 1, 1, 1, 2, 3, 4, 0]);
    expect(skylineMotionPivot(art.motions[0])).toBeNull();
    expect(skylineMotionPivot(art.motions[1])).toEqual({ x: 10, y: 2 });
    expect(skylineMotionPivot(art.motions[2])).toEqual({ x: 20, y: 0 });
    expect(skylineMotionPivot(art.motions[3])).toBeNull();

    expect(() => parseCityArt('~slide 3 14\nR 0 0 1 1 #000001')).toThrow(/missing ~end/);
    expect(() => parseCityArt('~slide 3 14\n~spin 0 0 5\n~end')).toThrow(/nested/);
    expect(() => parseCityArt('~end')).toThrow(/without a motion/);
    expect(() => parseCityArt('~wobble 1 2\n~end')).toThrow(/unknown motion/);
    expect(() => parseCityArt('~slide 3\n~end')).toThrow(/wrong number/);
    expect(() => parseCityArt('~slide 3 0\n~end')).toThrow(/period cannot be zero/);
    expect(() => parseCityArt('@prop\n~blink 2 0.5\nc 0 1 0.1 #ff0000\n~end')).toThrow(/only the panorama/);
    expect(() => parseCityArt('~slide 3 14\nR 0 0 1 1 #000001\n@prop')).toThrow(/missing ~end/);
  });

  it('moves groups the same way every time, and holds them still for Reduce Motion', () => {
    expect(skylineMotionState({ kind: 'slide', args: [3, 14] }, 0)).toEqual({ dx: 0, angleRad: 0, glow: 1 });
    expect(skylineMotionState({ kind: 'slide', args: [3, 14] }, 7).dx).toBeCloseTo(3, 9); // far end at half time
    expect(skylineMotionState({ kind: 'slide', args: [3, 14] }, 14).dx).toBeCloseTo(0, 9); // and back

    expect(skylineMotionState({ kind: 'spin', args: [0, 0, 60] }, 15).angleRad).toBeCloseTo(Math.PI / 2, 9);
    expect(skylineMotionState({ kind: 'spin', args: [0, 0, -60] }, 15).angleRad).toBeCloseTo(-Math.PI / 2, 9);
    expect(skylineMotionState({ kind: 'spin', args: [0, 0, 60] }, 75).angleRad).toBeCloseTo(Math.PI / 2, 9);

    expect(skylineMotionState({ kind: 'sway', args: [0, 0, 6, 4] }, 1).angleRad).toBeCloseTo((6 * Math.PI) / 180, 9);
    expect(skylineMotionState({ kind: 'sway', args: [0, 0, 6, 4] }, 3).angleRad).toBeCloseTo((-6 * Math.PI) / 180, 9);

    expect(skylineMotionState({ kind: 'blink', args: [2, 0.5] }, 0.4).glow).toBe(1);
    expect(skylineMotionState({ kind: 'blink', args: [2, 0.5] }, 1.4).glow).toBe(SKYLINE_BLINK_OFF);
    expect(skylineMotionState({ kind: 'blink', args: [2, 0.5] }, 2.4).glow).toBe(1);

    const all = [
      { kind: 'slide', args: [3, 14] },
      { kind: 'spin', args: [0, 0, 60] },
      { kind: 'sway', args: [0, 0, 6, 4] },
      { kind: 'blink', args: [2, 0.5] },
    ] as const;
    for (const motion of all) {
      expect(skylineMotionState({ kind: motion.kind, args: [...motion.args] }, null)).toEqual({ dx: 0, angleRad: 0, glow: 1 });
    }
  });

  it('stands the panorama behind the far gum line, leaning back, later pieces in front', () => {
    const [x0, y0, z0] = skylinePoint(10, 0, 0, 64);
    expect([x0, y0, z0]).toEqual([10, SKYLINE_PLACE.baseY, SKYLINE_PLACE.baseZ]);
    const [, y1, z1] = skylinePoint(10, 4, 0, 64);
    expect(y1).toBeGreaterThan(y0 + 3);
    expect(z1).toBeLessThan(z0 - 1.5); // leans away from the camera, which looks from +z
    const [, , zFront] = skylinePoint(10, 0, 50, 64);
    expect(zFront).toBeGreaterThan(z0);
    // A narrower stage keeps the drawing centred.
    expect(skylinePoint(32, 0, 0, 32)[0]).toBe(16);
    expect(SKYLINE_ART_WIDTH).toBe(64);

    const anchors = skylinePropAnchors(64, 32);
    expect(anchors).toHaveLength(SKYLINE_PROP_PLACE.depthFractions.length * 2);
    expect(anchors[0]).toEqual({ x: 0.6, z: 32 * 0.3, mirrored: false });
    expect(anchors[1].x).toBeCloseTo(63.4, 6);
    // The east row is drawn flipped, so both rows face the stage.
    expect(anchors.map((a) => a.mirrored)).toEqual([false, true, false, true, false, true, false, true]);
    expect(skylinePropPoint(0, 0, 0, 0.6, 9.6)).toEqual([0.6, SKYLINE_PROP_PLACE.baseY, 9.6]);
  });

  it('lights follow the district in front of them, dim until it is sealed', () => {
    const districts = [
      { bounds: { minX: 2.5, maxX: 22 } },
      { bounds: { minX: 22, maxX: 42 } },
      { bounds: { minX: 42, maxX: 61.5 } },
    ];
    expect(skylineDistrictIndex(districts, -5)).toBe(0);
    expect(skylineDistrictIndex(districts, 10)).toBe(0);
    expect(skylineDistrictIndex(districts, 30)).toBe(1);
    expect(skylineDistrictIndex(districts, 50)).toBe(2);
    expect(skylineDistrictIndex(districts, 70)).toBe(2);

    expect(skylineLightLevel(0, false)).toBeCloseTo(0.14, 6);
    expect(skylineLightLevel(0.5, false)).toBeGreaterThan(skylineLightLevel(0.2, false));
    expect(skylineLightLevel(1, false)).toBeLessThan(0.7); // the jump to full is the reward for sealing
    expect(skylineLightLevel(0.1, true)).toBe(1);
    expect(skylineLightLevel(5, false)).toBe(skylineLightLevel(1, false));
  });

  it('windows come on a few at a time, then blaze when the district is sealed', () => {
    expect(SKYLINE_LIGHT_STEPS).toBe(4);
    expect([0, 1, 2, 3, 4, 5].map(skylineLightStep)).toEqual([0, 1, 2, 3, 0, 1]);
    // Roadside lamps come on in pairs (one each side), far end first.
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(skylinePropStep)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);

    const lit = (ratio: number) =>
      [0, 1, 2, 3].filter((step) => skylineStepLevel(ratio, false, step) === SKYLINE_STEP_ON).length;
    expect(lit(0)).toBe(0);
    expect(lit(0.2)).toBe(1);
    expect(lit(0.4)).toBe(2);
    expect(lit(0.6)).toBe(3);
    expect(lit(SKYLINE_STEP_SPAN)).toBe(4);
    expect(skylineStepLevel(0, false, 0)).toBe(SKYLINE_STEP_OFF);
    expect(SKYLINE_STEP_ON).toBeLessThan(1);
    // Sealing lights everything fully, whatever the step.
    for (const step of [0, 1, 2, 3]) expect(skylineStepLevel(0.1, true, step)).toBe(1);
  });
});

describe('city skylines for every stage', () => {
  const cartridges = Object.values(PLAYABLE_CARTRIDGES);

  it('every stage has a skyline and a roadside prop', () => {
    for (const cart of cartridges) {
      const art = cityArtForHost(cart.hostId);
      expect(art, cart.id).not.toBeNull();
      expect(art!.skyline.length, cart.id).toBeGreaterThan(60);
      expect(art!.prop.length, cart.id).toBeGreaterThanOrEqual(3);
      expect(art!.prop.some((p) => p.light), `${cart.id} prop has a light`).toBe(true);
    }
    expect(cityArtForHost('atlantis')).toBeNull();
    expect(Object.keys(CITY_SKYLINE_TEXT).sort()).toEqual([...new Set(cartridges.map((c) => c.hostId))].sort());
  });

  it('every district has lights to switch on', () => {
    for (const cart of cartridges) {
      const art = cityArtForHost(cart.hostId)!;
      const offsetX = (cart.worldWidth - SKYLINE_ART_WIDTH) / 2;
      const counts = cart.districts.map(() => 0);
      for (const piece of art.skyline) {
        if (piece.light) counts[skylineDistrictIndex(cart.districts, piece.cx + offsetX)]++;
      }
      for (const [i, n] of counts.entries()) expect(n, `${cart.id} district ${i}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('drawings stay inside the frame and are light enough to draw', () => {
    for (const [host, text] of Object.entries(CITY_SKYLINE_TEXT)) {
      const art = parseCityArt(text);
      let total = 0;
      for (const piece of art.skyline) {
        total += triangles(piece.tris);
        for (let i = 0; i < piece.tris.length; i += 2) {
          // Skies run far past both ends of the stage so their edges are never on screen.
          const wide = piece.topColor !== null ? 40 : 0;
          expect(piece.tris[i], `${host} x`).toBeGreaterThanOrEqual(-25 - wide);
          expect(piece.tris[i], `${host} x`).toBeLessThanOrEqual(89 + wide);
          expect(piece.tris[i + 1], `${host} y`).toBeGreaterThanOrEqual(-6);
          expect(piece.tris[i + 1], `${host} y`).toBeLessThanOrEqual(8);
        }
      }
      for (const piece of art.prop) {
        for (let i = 0; i < piece.tris.length; i += 2) {
          expect(Math.abs(piece.tris[i]), `${host} prop x`).toBeLessThanOrEqual(2);
          // A hair below the base is fine: the foot of every prop is sunk into the gum.
          expect(piece.tris[i + 1], `${host} prop y`).toBeGreaterThanOrEqual(-0.1);
          expect(piece.tris[i + 1], `${host} prop y`).toBeLessThanOrEqual(3.5);
        }
      }
      expect(total, `${host} triangles`).toBeLessThan(1200);
    }
  });

  it('the native app carries the same drawings (run npx vite-node scripts/skyline-native.ts --write after changes)', () => {
    const onDisk = readFileSync(SKYLINE_SWIFT_PATH, 'utf8').replace(/\r\n/g, '\n');
    expect(onDisk).toBe(renderSkylineSwift());
  });

  it('the native reader uses the same placement and shape settings', () => {
    const swift = readFileSync('native-apple/Sources/MouthLifeCore/Config/CitySkylines.swift', 'utf8');
    const num = (name: string) => Number(new RegExp(`static let ${name}(?:: (?:Double|Int))? = (-?[0-9.]+)`).exec(swift)?.[1]);
    expect(num('artWidth')).toBe(SKYLINE_ART_WIDTH);
    expect(num('baseZ')).toBe(SKYLINE_PLACE.baseZ);
    expect(num('baseY')).toBe(SKYLINE_PLACE.baseY);
    expect(num('tiltRad')).toBe(SKYLINE_PLACE.tiltRad);
    expect(num('layerStep')).toBe(SKYLINE_PLACE.layerStep);
    expect(num('propInsetX')).toBe(SKYLINE_PROP_PLACE.insetX);
    expect(num('propBaseY')).toBe(SKYLINE_PROP_PLACE.baseY);
    expect(swift).toContain(`propDepthFractions: [Double] = [${SKYLINE_PROP_PLACE.depthFractions.join(', ')}]`);
    expect(swift).toContain('return 0.14 + 0.46 * r * r');
    expect(num('lightSteps')).toBe(SKYLINE_LIGHT_STEPS);
    expect(num('stepOff')).toBe(SKYLINE_STEP_OFF);
    expect(num('stepOn')).toBe(SKYLINE_STEP_ON);
    expect(num('stepSpan')).toBe(SKYLINE_STEP_SPAN);
  });
});
