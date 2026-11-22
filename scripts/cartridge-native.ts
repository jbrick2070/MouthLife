/**
 * Writes the native Apple app's city stages from the web edition's.
 *
 *   npx vite-node scripts/cartridge-native.ts --write  writes WorldCartridges.swift
 *   npx vite-node scripts/cartridge-native.ts --check  fails if that file is out of date
 *
 * A stage (its size, start, zones, walls, gaps, helper spots, colours...) is written once, in
 * src/worlds/<name>Cartridge.ts. The native app gets the same values as Swift constants, so the two
 * editions can never drift apart. Never edit WorldCartridges.swift by hand: change the TypeScript
 * file and run this script.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AABB2D, Capsule2D, Vec2, WorldCartridge } from '../src/engine/types';
import { crescentSulcusCartridge } from '../src/worlds/crescentSulcusCartridge';
import { fluorapatiteCoastCartridge } from '../src/worlds/fluorapatiteCoastCartridge';
import { neonAcidClockCartridge } from '../src/worlds/neonAcidClockCartridge';
import { orbitalBiofilmDomeCartridge } from '../src/worlds/orbitalBiofilmDomeCartridge';
import { plaqueCityCartridge } from '../src/worlds/plaqueCityCartridge';
import { pulpRescueCartridge } from '../src/worlds/pulpRescueCartridge';

export const CARTRIDGE_SWIFT_PATH = join(
  process.cwd(),
  'native-apple',
  'Sources',
  'MouthLifeCore',
  'Worlds',
  'WorldCartridges.swift'
);

interface Stage {
  /** The Swift constant's name (kept from the hand-written file, so no other Swift code changes). */
  swiftName: string;
  /** The web edition's name for the same stage, kept as a Swift alias. */
  webName: string;
  doc: string[];
  cartridge: WorldCartridge;
}

const STAGES: Stage[] = [
  {
    swiftName: 'world1AnteriorIncisors',
    webName: 'plaqueCityCartridge',
    doc: [
      'World 1 — Toronto Morning Arch ("Plaque City").',
      'Honors 1498 Beijing hog-bristle toothbrush & 1683 Delft Antonie van Leeuwenhoek oral microscopy.',
    ],
    cartridge: plaqueCityCartridge,
  },
  {
    swiftName: 'world2PremolarAlley',
    webName: 'crescentSulcusCartridge',
    doc: [
      'World 2 — New Orleans Evening Arch ("Crescent Sulcus").',
      "Honors Levi Spear Parmly's 1819 waxed-silk floss and Dr. Charles C. Bass's 1948 Tulane 45° sulcus method.",
    ],
    cartridge: crescentSulcusCartridge,
  },
  {
    swiftName: 'world3FirstMolarCitadel',
    webName: 'neonAcidClockCartridge',
    doc: [
      'World 3 — Tokyo Studio Arch & 1940 Chicago pH Lab ("Neon Acid Clock").',
      "Honors Dr. Robert M. Stephan's 1940 pH electrode curve.",
    ],
    cartridge: neonAcidClockCartridge,
  },
  {
    swiftName: 'world4FluorideFjord',
    webName: 'fluorapatiteCoastCartridge',
    doc: [
      'World 4 — Accra Coastal Marathon Arch & 1901–1945 Colorado Springs / Grand Rapids Fluoride Trail ("Fluorapatite Coast").',
    ],
    cartridge: fluorapatiteCoastCartridge,
  },
  {
    swiftName: 'world5WisdomFrontier',
    webName: 'orbitalBiofilmDomeCartridge',
    doc: [
      'World 5 — Station Aurora 408 km LEO ("Quorum Dome").',
      "Honors NASA's 1973 Skylab oral microbiology studies & J.W. Costerton's 1978 EPS biofilm theory.",
    ],
    cartridge: orbitalBiofilmDomeCartridge,
  },
  {
    swiftName: 'pulpRescueStage',
    webName: 'pulpRescueCartridge',
    doc: [
      'Compact 32u x 32u single-molar emergency cartridge for the 90s Pulp Rescue Scramble ("Avoid the Dreaded Root Canal!" — zero permadeath on timeout).',
    ],
    cartridge: pulpRescueCartridge,
  },
];

/** The campaign's cities, in order (everything but the rescue stage). */
const CAMPAIGN = STAGES.filter((s) => s.cartridge.id !== 'pulp_rescue');
/** The order the native app plays the campaign in (a test holds it to the web's). */
export const NATIVE_CAMPAIGN_WORLD_IDS: readonly string[] = CAMPAIGN.map((s) => s.cartridge.id);

// ---------------------------------------------------------------- Swift literals

/** A Swift Double / Float literal: always with a decimal point, never in exponent form. */
export function num(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`not a finite number: ${n}`);
  if (Number.isInteger(n)) return `${n}.0`;
  const s = String(n);
  if (/e/i.test(s)) throw new Error(`number needs exponent form: ${n}`);
  return s;
}

function int(n: number): string {
  if (!Number.isInteger(n)) throw new Error(`not a whole number: ${n}`);
  return String(n);
}

function hex(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffff) throw new Error(`not a colour: ${n}`);
  return `0x${n.toString(16).padStart(6, '0')}`;
}

/** A Swift string literal. JSON's escapes for quotes and backslashes are valid Swift. */
function str(s: string): string {
  // Control characters are written differently in JSON and Swift (\b, \f, \u0007): none belongs in a stage.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\u2028\u2029]/.test(s)) throw new Error(`text has a control character: ${JSON.stringify(s)}`);
  return JSON.stringify(s);
}

/**
 * Every field of a web object must be one this script writes: a field added to a zone, a gap or a
 * helper spot must not be dropped on the way to Swift without anyone noticing.
 */
function onlyKeys(what: string, value: object, known: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) throw new Error(`${what}: scripts/cartridge-native.ts does not write "${key}" yet`);
  }
}
const XZ = ['x', 'z'] as const;
const BOX = ['minX', 'maxX', 'minZ', 'maxZ'] as const;

const vec = (v: Vec2) => {
  onlyKeys('a point', v, XZ);
  return `Vec2(x: ${num(v.x)}, z: ${num(v.z)})`;
};
const box = (b: AABB2D) => {
  onlyKeys('a box', b, BOX);
  return `AABB2D(minX: ${num(b.minX)}, minZ: ${num(b.minZ)}, maxX: ${num(b.maxX)}, maxZ: ${num(b.maxZ)})`;
};
const capsule = (c: Capsule2D) => {
  onlyKeys('a band', c, ['a', 'b', 'radius', 'initialDensity']);
  return `Capsule2D(a: ${vec(c.a)}, b: ${vec(c.b)}, radius: ${num(c.radius)}, initialDensity: ${num(c.initialDensity)})`;
};

/** `name: [ … ]` with one item per line, or `name: []`. */
function list(name: string, items: string[]): string {
  if (items.length === 0) return `    ${name}: []`;
  return `    ${name}: [\n${items.map((i) => `        ${i}`).join(',\n')}\n    ]`;
}

/** One stage as a Swift constant (exported for tests). */
export function renderStageSwift(swiftName: string, doc: readonly string[], c: WorldCartridge): string {
  const fields: string[] = [
    `    id: ${str(c.id)}`,
    `    title: ${str(c.title)}`,
    `    subtitle: ${str(c.subtitle)}`,
    `    hostId: ${str(c.hostId)}`,
    `    historyNoteIds: [${c.historyNoteIds.map(str).join(', ')}]`,
    `    worldWidth: ${num(c.worldWidth)}`,
    `    worldDepth: ${num(c.worldDepth)}`,
    `    bChannelMode: .${c.bChannelMode}`,
    `    parTimeSec: ${num(c.parTimeSec)}`,
    `    basePellicleDensity: ${num(c.basePellicleDensity)}`,
    `    baselinePh: ${num(c.baselinePh)}`,
    `    probeSpawn: ${vec(c.probeSpawn)}`,
    ...(c.probeSpawnFacingRad !== undefined ? [`    probeSpawnFacingRad: ${num(c.probeSpawnFacingRad)}`] : []),
    list(
      'districts',
      c.districts.map(
        (d) =>
          (onlyKeys(`${c.id} zone`, d, ['id', 'name', 'subtitle', 'bounds']), '') +
          `DistrictDef(\n            id: ${str(d.id)},\n            name: ${str(d.name)},\n            subtitle: ${str(d.subtitle)},\n            bounds: ${box(d.bounds)}\n        )`
      )
    ),
    list('playableMaskBoxes', c.playableMaskBoxes.map(box)),
    list('wallBoxes', c.wallBoxes.map(box)),
    list(
      'interdentalAlleys',
      c.interdentalAlleys.map((a) => {
        onlyKeys(`${c.id} gap`, a, ['id', 'endpointA', 'endpointB', 'width', 'wallThickness', 'bridgeId']);
        const lines = [
          `id: ${str(a.id)}`,
          `endpointA: ${vec(a.endpointA)}`,
          `endpointB: ${vec(a.endpointB)}`,
          `width: ${num(a.width)}`,
          `wallThickness: ${num(a.wallThickness)}`,
        ];
        lines.push(`bridgeId: ${a.bridgeId == null ? 'nil' : str(a.bridgeId)}`); // no default in Swift: always written
        return `InterdentalAlleyDef(\n${lines.map((l) => `            ${l}`).join(',\n')}\n        )`;
      })
    ),
    list('marginBands', c.marginBands.map(capsule)),
    list(
      'heightCuspHills',
      c.heightCuspHills.map(
        (h) => (onlyKeys(`${c.id} hill`, h, ['cx', 'cz', 'radius', 'height']), '') + `HillDef(cx: ${num(h.cx)}, cz: ${num(h.cz)}, radius: ${num(h.radius)}, height: ${num(h.height)})`
      )
    ),
    list(
      'commensalSiteSpawns',
      c.commensalSiteSpawns.map(
        (s) => (onlyKeys(`${c.id} helper spot`, s, ['id', 'pos', 'districtIdx']), '') + `CommensalSpawnDef(id: ${str(s.id)}, pos: ${vec(s.pos)}, districtIdx: ${int(s.districtIdx)})`
      )
    ),
    list(
      'sucroseSpawns',
      c.sucroseSpawns.map(
        (s) => (onlyKeys(`${c.id} sugar`, s, ['id', 'pos', 'districtIdx']), '') + `SucroseSpawnDef(id: ${str(s.id)}, pos: ${vec(s.pos)}, districtIdx: ${int(s.districtIdx)})`
      )
    ),
    list(
      'biofilmBridges',
      c.biofilmBridges.map(
        (b) => (onlyKeys(`${c.id} bridge`, b, ['id', 'a', 'b', 'intact']), '') + `BridgeDef(id: ${str(b.id)}, a: ${vec(b.a)}, b: ${vec(b.b)}, intact: ${b.intact ? 'true' : 'false'})`
      )
    ),
    list('salivaSprings', c.salivaSprings.map(vec)),
    list('beaconDropSlots', c.beaconDropSlots.map(vec)),
    (onlyKeys(`${c.id} palette`, c.palette, ['enamelBaseHex', 'pellicleSlimeHex', 'matureBiofilmHex', 'gingivaHex', 'skyTopHex', 'skyHorizonHex']), '') +
      `    palette: WorldVisualPalette(\n${(
      ['enamelBaseHex', 'pellicleSlimeHex', 'matureBiofilmHex', 'gingivaHex', 'skyTopHex', 'skyHorizonHex'] as const
    )
      .map((k) => `        ${k}: ${hex(c.palette[k])}`)
      .join(',\n')}\n    )`,
  ];
  if (c.sulcusBands) fields.push(list('sulcusBands', c.sulcusBands.map(capsule)));
  if (c.stephanSipIntervalSec !== undefined) fields.push(`    stephanSipIntervalSec: ${num(c.stephanSipIntervalSec)}`);
  if (c.erosionZones) {
    fields.push(
      list(
        'erosionZones',
        c.erosionZones.map(
          (z) =>
            (onlyKeys(`${c.id} acid pool`, z, ['id', 'cx', 'cz', 'radius', 'targetPh']), '') +
            `ErosionZoneDef(id: ${str(z.id)}, cx: ${num(z.cx)}, cz: ${num(z.cz)}, radius: ${num(z.radius)}, targetPh: ${num(z.targetPh)})`
        )
      )
    );
  }
  if (c.erosionPulseIntervalSec !== undefined) fields.push(`    erosionPulseIntervalSec: ${num(c.erosionPulseIntervalSec)}`);
  if (c.epsDomes) {
    fields.push(
      list(
        'epsDomes',
        c.epsDomes.map(
          (d) =>
            (onlyKeys(`${c.id} dome`, d, ['id', 'cx', 'cz', 'radius', 'initialDensity']), '') +
            `EpsDomeDef(id: ${str(d.id)}, cx: ${num(d.cx)}, cz: ${num(d.cz)}, radius: ${num(d.radius)}, initialDensity: ${num(d.initialDensity)})`
        )
      )
    );
  }
  if (c.challengeBlurb !== undefined) fields.push(`    challengeBlurb: ${str(c.challengeBlurb)}`);

  // Every field of the web type must be written above: a new one must not be dropped silently.
  const written = new Set(fields.map((f) => f.trim().split(':')[0]));
  for (const key of Object.keys(c)) {
    if (!written.has(key)) throw new Error(`${c.id}: scripts/cartridge-native.ts does not write "${key}" yet`);
  }

  const docLines = doc.map((l) => `/// ${l}\n`).join('');
  return `${docLines}public let ${swiftName} = WorldCartridge(\n${fields.join(',\n')}\n)\n`;
}

function renderStage(stage: Stage): string {
  return renderStageSwift(stage.swiftName, stage.doc, stage.cartridge);
}

export function renderCartridgeSwift(): string {
  const names = (stages: Stage[], indent: string) => stages.map((s) => `${indent}${s.swiftName}`).join(',\n');
  let swift = `// GENERATED by scripts/cartridge-native.ts from src/worlds/*Cartridge.ts. Do not edit by hand.
// Run \`npx vite-node scripts/cartridge-native.ts --write\` after a stage changes.

import Foundation

`;
  swift += STAGES.map(renderStage).join('\n');
  swift += `
// The web edition's names for the same stages
${STAGES.map((s) => `public let ${s.webName} = ${s.swiftName}`).join('\n')}

public enum WorldRegistry {
    public static let world1 = world1AnteriorIncisors
    public static let world2 = world2PremolarAlley
    public static let world3 = world3FirstMolarCitadel
    public static let world4 = world4FluorideFjord
    public static let world5 = world5WisdomFrontier
    public static let pulpRescue = pulpRescueStage

    public static let campaignWorlds: [WorldCartridge] = [
${names(CAMPAIGN, '        ')}
    ]

    public static let campaignWorldIds: [String] = campaignWorlds.map(\\.id)

    public static let allWorlds: [WorldCartridge] = [
${names(STAGES, '        ')}
    ]

    public static let byId: [String: WorldCartridge] = Dictionary(
        uniqueKeysWithValues: allWorlds.map { ($0.id, $0) }
    )

    public static func isPlayableWorld(_ id: String) -> Bool {
        byId[id] != nil
    }

    public static func cartridge(forId id: String) -> WorldCartridge? {
        byId[id]
    }

    public static func cartridgeOrDefault(forId id: String) -> WorldCartridge {
        byId[id] ?? world1AnteriorIncisors
    }

    public static func nextWorldId(after worldId: String) -> String? {
        guard let idx = campaignWorldIds.firstIndex(of: worldId),
              idx + 1 < campaignWorldIds.count
        else {
            return nil
        }
        return campaignWorldIds[idx + 1]
    }
}
`;
  return swift;
}

// Runs only when asked to, so a test can import this file safely.
const outArg = process.argv.find((a) => a.startsWith('--out='));
if (process.argv.includes('--write') || process.argv.includes('--check') || outArg) {
  const swift = renderCartridgeSwift();
  if (outArg) {
    writeFileSync(outArg.slice('--out='.length), swift);
  } else if (process.argv.includes('--check')) {
    let onDisk = '';
    try {
      onDisk = readFileSync(CARTRIDGE_SWIFT_PATH, 'utf8').replace(/\r\n/g, '\n');
    } catch {
      /* missing counts as stale */
    }
    if (onDisk !== swift) {
      console.error('WorldCartridges.swift is out of date. Run: npx vite-node scripts/cartridge-native.ts --write');
      process.exit(1);
    }
    console.log('WorldCartridges.swift is up to date.');
  } else {
    writeFileSync(CARTRIDGE_SWIFT_PATH, swift);
    console.log(`Wrote ${CARTRIDGE_SWIFT_PATH}`);
  }
}
