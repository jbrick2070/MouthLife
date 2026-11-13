/**
 * Clinical Dental Anatomy & Tooth Numbering Reference Engine.
 *
 * Covers all 32 adult permanent teeth across the three major clinical notations used worldwide:
 *  1. Universal Numbering System (#1–#32, ADA / United States; A–T for 20 primary baby teeth)
 *  2. FDI World Dental Federation / ISO 3950 Two-Digit System (11–48 adult; 51–85 primary)
 *  3. Palmer Notation Method (Quadrant brackets ┘ └ ┌ ┐ with 1–8 from midline; A–E primary)
 * Plus clinical tooth surface codes (M, O, D, B/F, L/P, I) and direct mapping from the 14 sculpted
 * crowns of MouthLife's 3D Companion Arch (`toothIndex` 0..13).
 */

export type ToothNumberingSystem = 'universal' | 'fdi' | 'palmer';

export type DentalArch = 'upper' | 'lower';
export type PatientSide = 'right' | 'left';
export type ToothCategory = 'incisor' | 'canine' | 'premolar' | 'molar';

export interface AdultToothInfo {
  /** ADA Universal Number (1..32, clockwise from Upper Right 3rd Molar #1 to Lower Right 3rd Molar #32). */
  universal: number;
  /** ISO 3950 / FDI two-digit code ('11'..'48'), pronounced digit-by-digit (e.g. '16' = "one-six"). */
  fdi: string;
  /** Spoken FDI readout so learners don't read '16' as "sixteen". */
  fdiSpoken: string;
  /** Clinical Palmer notation using quadrant bracket + midline index 1..8 (e.g. '6┘', '└1', '┌6', '3┐'). */
  palmer: string;
  /** Clinical quadrant 1..4 (1=UR, 2=UL, 3=LL, 4=LR). */
  quadrant: 1 | 2 | 3 | 4;
  /** Tooth position counting distally from the central midline (1 = Central Incisor .. 8 = 3rd Molar). */
  positionFromMidline: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  arch: DentalArch;
  side: PatientSide;
  category: ToothCategory;
  isWisdomTooth: boolean;
  /** Full clinical name, e.g. "Upper Right 1st Molar". */
  clinicalName: string;
  /** Everyday / historical dental nickname, e.g. "Six-Year Molar" or "Eye Tooth (Cuspid)". */
  commonNickname: string;
  /** Concise crown/root anatomy note. */
  anatomyFact: string;
  /** Practical daily brushing/flossing tip. */
  careTip: string;
  /** Corresponding crown index (0..13) on the 14-tooth 3D Companion Arch, or null for 3rd molars (wisdom teeth). */
  companionArchIndex: number | null;
}

export interface CompanionCrownSummary {
  toothIndex: number;
  sideLabel: 'Right' | 'Left';
  toothTypeLabel: string;
  upperTooth: AdultToothInfo;
  lowerTooth: AdultToothInfo;
}

export interface ToothSurfaceGuide {
  code: string;
  name: string;
  whereItFaces: string;
  howToClean: string;
}

export interface QuadrantNumberingMeta {
  quadrant: 1 | 2 | 3 | 4;
  shortCode: 'UR' | 'UL' | 'LL' | 'LR';
  title: string;
  universalRange: string;
  fdiRange: string;
  palmerSymbol: string;
  /**Universal numbers ordered from the left side of that quadrant box to the right side on a chart facing the patient. */
  chartOrderUniversal: readonly number[];
}

const DIGIT_WORDS: Record<string, string> = {
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
};

interface PositionAnatomyTemplate {
  pos: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  category: ToothCategory;
  shortRole: string;
  nicknameUpper: string;
  nicknameLower: string;
  anatomyUpper: string;
  anatomyLower: string;
  careTip: string;
}

const POSITION_TEMPLATES: readonly PositionAnatomyTemplate[] = [
  {
    pos: 1,
    category: 'incisor',
    shortRole: 'Central Incisor',
    nicknameUpper: 'Front Smile Incisor',
    nicknameLower: 'Lower Front Incisor (Smallest Tooth)',
    anatomyUpper:
      'Broad chisel-shaped crown with a single conical root; erupts with 3 tiny bumps (mamelons) that wear smooth over time.',
    anatomyLower:
      'Narrowest, most symmetrical crown in the human mouth with 1 slender root; sits right beside salivary ducts under the tongue.',
    careTip:
      'Tilt your toothbrush vertically on the inner (lingual) surface — lower front incisors collect mineralized tartar fastest!',
  },
  {
    pos: 2,
    category: 'incisor',
    shortRole: 'Lateral Incisor',
    nicknameUpper: 'Side Smile Incisor',
    nicknameLower: 'Lower Lateral Incisor',
    anatomyUpper:
      'Slightly narrower than the central incisor with a rounded distal corner and a small pit beside the cingulum (the rounded bulge) on the back.',
    anatomyLower:
      'Slightly wider than the lower central incisor with 1 root, helping slice food cleanly alongside the front teeth.',
    careTip:
      'Hug the mesial and distal edges in a gentle C-shape with floss where incisors overlap.',
  },
  {
    pos: 3,
    category: 'canine',
    shortRole: 'Canine',
    nicknameUpper: 'Cuspid / "Eye Tooth"',
    nicknameLower: 'Lower Cuspid',
    anatomyUpper:
      'Single pointed cusp and the longest root in the human dentition — anchors the corner of the dental arch and guides side-to-side jaw motion.',
    anatomyLower:
      'Pointed piercing cusp with a long sturdy root that partners with the upper canine to protect back molars from lateral grinding.',
    careTip:
      'Because canines sit at the curved corner of your arch, pause here as you pivot your brush from front teeth to back premolars.',
  },
  {
    pos: 4,
    category: 'premolar',
    shortRole: '1st Premolar',
    nicknameUpper: 'First Bicuspid',
    nicknameLower: 'First Bicuspid',
    anatomyUpper:
      'Transitional "bicuspid" with 2 sharp cusps (buccal & palatal) and typically 2 roots — bridges tearing canines and grinding molars.',
    anatomyLower:
      'Compact bicuspid with a prominent outer cusp, a smaller inner tongue-side cusp, and 1 root.',
    careTip:
      'Sweep a gentle 45° Bass angle into the gumline collar and briskly brush the central groove between its two cusps.',
  },
  {
    pos: 5,
    category: 'premolar',
    shortRole: '2nd Premolar',
    nicknameUpper: 'Second Bicuspid',
    nicknameLower: 'Second Bicuspid',
    anatomyUpper:
      'Two nearly equal-height cusps and usually 1 root; shares heavy chewing forces right in front of the 1st molar.',
    anatomyLower:
      'Rounded crown that often has 2 lingual cusps (3 cusps total!) and 1 root — great at crushing fibrous foods.',
    careTip:
      'The tight contact between the 2nd premolar and 1st molar is a classic hidden cavity spot — never skip flossing this seam!',
  },
  {
    pos: 6,
    category: 'molar',
    shortRole: '1st Molar',
    nicknameUpper: 'Six-Year Molar',
    nicknameLower: 'Six-Year Molar',
    anatomyUpper:
      'Broad 4-cusp grinding powerhouse (often sporting a bonus 5th mini-cusp called the Cusp of Carabelli!) anchored by 3 tripod roots.',
    anatomyLower:
      'Largest lower grinder with 5 cusps (3 outer, 2 inner) and 2 strong roots; erupts around age 6 without replacing any baby tooth.',
    careTip:
      'First molars do much of the heavy chewing and have deep grooves — brush the chewing pits with short, gentle strokes and let fluoride soak in!',
  },
  {
    pos: 7,
    category: 'molar',
    shortRole: '2nd Molar',
    nicknameUpper: 'Twelve-Year Molar',
    nicknameLower: 'Twelve-Year Molar',
    anatomyUpper:
      '4-cusp maxillary grinder with 3 roots nestled high near the cheek bone; erupts around age 12 behind the 1st molar.',
    anatomyLower:
      'Symmetrical 4-cusp hot-cross-bun occlusal groove pattern with 2 roots; backs up the 1st molar for heavy mastication.',
    careTip:
      'Slightly close your jaw half-way when brushing upper 2nd molars — opening too wide pulls your cheek muscle tight against the brush!',
  },
  {
    pos: 8,
    category: 'molar',
    shortRole: '3rd Molar',
    nicknameUpper: 'Upper Wisdom Tooth',
    nicknameLower: 'Lower Wisdom Tooth',
    anatomyUpper:
      'Variable 3–4 cusp crown with fused or multi-curved roots; erupts around ages 17–25 (or stays congenitally absent / impacted).',
    anatomyLower:
      'Farthest back mandibular tooth at the curve of the jawbone; often partially covered by a gum flap (operculum) if space is tight.',
    careTip:
      'Angle the very tip (toe) of your brush behind the back-most molar so plaque cannot hide along the distal gumline.',
  },
];

function buildToothRecord(
  quadrant: 1 | 2 | 3 | 4,
  pos: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
): AdultToothInfo {
  const tmpl = POSITION_TEMPLATES[pos - 1];
  const arch: DentalArch = quadrant <= 2 ? 'upper' : 'lower';
  const side: PatientSide = quadrant === 1 || quadrant === 4 ? 'right' : 'left';

  let universal: number;
  let palmer: string;
  if (quadrant === 1) {
    universal = 9 - pos; // #1..#8
    palmer = `${pos}┘`;
  } else if (quadrant === 2) {
    universal = 8 + pos; // #9..#16
    palmer = `└${pos}`;
  } else if (quadrant === 3) {
    universal = 25 - pos; // #17..#24
    palmer = `┌${pos}`;
  } else {
    universal = 24 + pos; // #25..#32
    palmer = `${pos}┐`;
  }

  const fdi = `${quadrant}${pos}`;
  const fdiSpoken = `${DIGIT_WORDS[String(quadrant)]}-${DIGIT_WORDS[String(pos)]}`;

  let companionArchIndex: number | null = null;
  if (pos <= 7) {
    // CompanionArch ti=0..6 is Right 2nd Molar (pos 7) -> Right Central Incisor (pos 1)
    // CompanionArch ti=7..13 is Left Central Incisor (pos 1) -> Left 2nd Molar (pos 7)
    companionArchIndex = side === 'right' ? 7 - pos : 6 + pos;
  }

  const archWord = arch === 'upper' ? 'Upper' : 'Lower';
  const sideWord = side === 'right' ? 'Right' : 'Left';

  return {
    universal,
    fdi,
    fdiSpoken,
    palmer,
    quadrant,
    positionFromMidline: pos,
    arch,
    side,
    category: tmpl.category,
    isWisdomTooth: pos === 8,
    clinicalName: `${archWord} ${sideWord} ${tmpl.shortRole}`,
    commonNickname: arch === 'upper' ? tmpl.nicknameUpper : tmpl.nicknameLower,
    anatomyFact: arch === 'upper' ? tmpl.anatomyUpper : tmpl.anatomyLower,
    careTip: tmpl.careTip,
    companionArchIndex,
  };
}

/** All 32 adult permanent teeth ordered by ADA Universal Number (#1 through #32). */
export const ADULT_TEETH_BY_UNIVERSAL: readonly AdultToothInfo[] = (() => {
  const all: AdultToothInfo[] = [];
  for (const q of [1, 2, 3, 4] as const) {
    for (const p of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      all.push(buildToothRecord(q, p));
    }
  }
  return all.sort((a, b) => a.universal - b.universal);
})();

export function getToothByUniversal(universal: number): AdultToothInfo {
  const clamped = Math.max(1, Math.min(32, Math.round(universal)));
  return ADULT_TEETH_BY_UNIVERSAL[clamped - 1];
}

export function getToothByFdi(fdi: string): AdultToothInfo | undefined {
  return ADULT_TEETH_BY_UNIVERSAL.find((t) => t.fdi === fdi.trim());
}

/** Formats a compact badge label for a tooth in the active numbering system. */
export function formatToothBadge(tooth: AdultToothInfo, system: ToothNumberingSystem): string {
  if (system === 'universal') return `#${tooth.universal}`;
  if (system === 'fdi') return tooth.fdi;
  return tooth.palmer;
}

/** Maps a raycasted 3D Companion Arch `toothIndex` (0..13) to its clinical Upper & Lower tooth pair. */
export function getCompanionCrownSummary(toothIndex: number): CompanionCrownSummary {
  const idx = Math.max(0, Math.min(13, Math.floor(toothIndex)));
  const upperTooth =
    ADULT_TEETH_BY_UNIVERSAL.find((t) => t.arch === 'upper' && t.companionArchIndex === idx) ??
    ADULT_TEETH_BY_UNIVERSAL[7];
  const lowerTooth =
    ADULT_TEETH_BY_UNIVERSAL.find((t) => t.arch === 'lower' && t.companionArchIndex === idx) ??
    ADULT_TEETH_BY_UNIVERSAL[24];
  const sideLabel = upperTooth.side === 'right' ? 'Right' : 'Left';
  const tmpl = POSITION_TEMPLATES[upperTooth.positionFromMidline - 1];
  return {
    toothIndex: idx,
    sideLabel,
    toothTypeLabel: `${sideLabel} ${tmpl.shortRole}`,
    upperTooth,
    lowerTooth,
  };
}

/** Clinical quadrant layout metadata used by both the Dental Chart modal and the 2-Min Brush-Along pacer. */
export const QUADRANT_NUMBERING_META: readonly QuadrantNumberingMeta[] = [
  {
    quadrant: 1,
    shortCode: 'UR',
    title: 'Q1 • Upper Right (Maxillary Right)',
    universalRange: 'US #1–#8',
    fdiRange: 'FDI 18–11',
    palmerSymbol: '8┘–1┘',
    // Left-to-right on a face-on dental chart: back molar #1 -> midline central incisor #8
    chartOrderUniversal: [1, 2, 3, 4, 5, 6, 7, 8],
  },
  {
    quadrant: 2,
    shortCode: 'UL',
    title: 'Q2 • Upper Left (Maxillary Left)',
    universalRange: 'US #9–#16',
    fdiRange: 'FDI 21–28',
    palmerSymbol: '└1–└8',
    // Left-to-right on a face-on dental chart: midline central incisor #9 -> back molar #16
    chartOrderUniversal: [9, 10, 11, 12, 13, 14, 15, 16],
  },
  {
    quadrant: 3,
    shortCode: 'LL',
    title: 'Q3 • Lower Left (Mandibular Left)',
    universalRange: 'US #17–#24',
    fdiRange: 'FDI 38–31',
    palmerSymbol: '┌8–┌1',
    // Left-to-right on a face-on dental chart: midline central incisor #24 -> back molar #17
    chartOrderUniversal: [24, 23, 22, 21, 20, 19, 18, 17],
  },
  {
    quadrant: 4,
    shortCode: 'LR',
    title: 'Q4 • Lower Right (Mandibular Right)',
    universalRange: 'US #25–#32',
    fdiRange: 'FDI 41–48',
    palmerSymbol: '1┐–8┐',
    // Left-to-right on a face-on dental chart: back molar #32 -> midline central incisor #25
    chartOrderUniversal: [32, 31, 30, 29, 28, 27, 26, 25],
  },
];

/** Standard 5-surface clinical abbreviations dentists call out during exams (e.g. "MOD on #19"). */
export const TOOTH_SURFACES_GUIDE: readonly ToothSurfaceGuide[] = [
  {
    code: 'B / F',
    name: 'Buccal / Facial',
    whereItFaces: 'Outer surface facing your cheeks (back teeth) or lips (front teeth).',
    howToClean: '45° Bass sweep along the gumline collar.',
  },
  {
    code: 'L / P',
    name: 'Lingual / Palatal',
    whereItFaces: 'Inner surface facing your tongue (lower) or roof of the mouth / palate (upper).',
    howToClean: 'Sweep inner molars & tilt brush vertically behind front incisors.',
  },
  {
    code: 'O / I',
    name: 'Occlusal / Incisal',
    whereItFaces: 'Chewing cusps & grooves of back teeth (O) or biting edges of front teeth (I).',
    howToClean: 'Short brisk strokes into molar pits & fissures.',
  },
  {
    code: 'M',
    name: 'Mesial',
    whereItFaces: 'Tight side contact facing TOWARD the front midline of your dental arch.',
    howToClean: 'Slide floss gently under the papilla and hug the tooth in a C-curve.',
  },
  {
    code: 'D',
    name: 'Distal',
    whereItFaces: 'Tight side contact facing AWAY from the midline toward the back of your jaw.',
    howToClean: 'C-curve floss hug + wrap brush bristles behind your last molar.',
  },
];

export interface WorldDentalLesson {
  id: string;
  focusTeethBadge: string;
  headline: string;
  lesson: string;
}

/**
 * Bite-sized real-world clinical dentistry & tooth-numbering lessons paired with each playable world
 * (shown unobtrusively in the Arcade Pause Sheet and Post-Mission Report).
 */
export const WORLD_DENTAL_LESSONS: Record<string, WorldDentalLesson> = {
  world_1: {
    id: 'world_1',
    focusTeethBadge: 'Teeth #8–#9, #4–#5 & #3 (FDI 11–21, 15–14 & 16)',
    headline: 'Hidden Contacts & Six-Year Molars',
    lesson:
      'Bristles reach 3 of 5 crown faces (Buccal, Occlusal, Lingual), leaving ~35% of enamel hidden in tight Mesial/Distal contacts between premolars (#4–#5) and 1st molars (#3 / FDI 16) until flossed.',
  },
  world_2: {
    id: 'world_2',
    focusTeethBadge: 'Cervical Sulcus • Teeth #21–#28 (FDI 34–44)',
    headline: '1–3 mm Healthy Gum Pockets & 45° Bass Angle',
    lesson:
      'Dentists measure 6 pocket depths around every tooth (#1–#32): 1–3 mm is healthy! Sweeping bristles gently at 45° clears sulcus plaque without irritating tender gingival collars.',
  },
  world_3: {
    id: 'world_3',
    focusTeethBadge: 'Posterior Molars #2–#3 & #14–#15 (FDI 17–16 & 26–27)',
    headline: 'Critical pH 5.5 & The Stephan Acid Clock',
    lesson:
      'Every sugary sip drops plaque pH below 5.5 for ~20 minutes, pulling calcium out of hydroxyapatite. Saliva buffers acid while fluoride rebuilds tougher fluorapatite (critical pH ~4.5).',
  },
  world_4: {
    id: 'world_4',
    focusTeethBadge: 'Lower Incisors #24–#25 (FDI 31–41) & Upper #3, #14',
    headline: 'Why Tartar Picks Favorite Tooth Numbers',
    lesson:
      'Major salivary ducts open right behind lower front incisors (#24–#25) and in the cheeks beside the upper molars (near #2–#3 & #14–#15) — bathing them in minerals that buffer acid, or calcify leftover plaque into tartar!',
  },
  world_5: {
    id: 'world_5',
    focusTeethBadge: 'Full Arch #1–#32 (FDI 11–48) & Wisdom Teeth #1, #16, #17, #32',
    headline: 'Quorum-Sensing EPS Armor & Spaceflight Dentistry',
    lesson:
      'Within 24–48 hours, undisturbed bacteria weave sticky EPS domes that block rinses until mechanically cracked by brushing & flossing — vital in orbit where a #1 or #32 flare-up has no clinic nearby!',
  },
  pulp_rescue: {
    id: 'pulp_rescue',
    focusTeethBadge: 'Crown Cross-Section: Enamel → Dentin → Living Pulp',
    headline: 'How Endodontists Rescue Stressed Teeth',
    lesson:
      'Hard outer enamel (Mohs 5) has zero nerves, while underlying dentin has microscopic fluid tubules leading to the living pulp. Gentle Ca(OH)₂ / MTA liners calm inflammation and spark reparative dentin!',
  },
};

export function getWorldDentalLesson(
  worldId: string,
  mode: 'ARCADE' | 'PULP_RESCUE' = 'ARCADE'
): WorldDentalLesson {
  if (mode === 'PULP_RESCUE') return WORLD_DENTAL_LESSONS.pulp_rescue;
  return WORLD_DENTAL_LESSONS[worldId] ?? WORLD_DENTAL_LESSONS.world_1;
}

// ---------------------------------------------------------------------------------------------
// "Spot That Tooth!" optional micro-quiz (zero pressure: no timers, no penalties, never gatekeeps)
// ---------------------------------------------------------------------------------------------
export interface SpotQuizQuestion {
  targetUniversal: number;
  prompt: string;
  /** How much of the answer is given away: 'full' shows name + all codes, 'code' only a number. */
  difficulty: 'full' | 'name' | 'code';
}

export interface SpotQuizResult {
  correct: boolean;
  nextStreak: number;
  bestStreak: number;
  message: string;
}

/** Builds one friendly prompt. `rand` is injectable (0..1) so tests are deterministic. */
export function buildSpotQuizQuestion(
  rand: () => number = Math.random,
  avoidUniversal?: number
): SpotQuizQuestion {
  let n = 1 + Math.floor(rand() * 32);
  if (n > 32) n = 32;
  if (avoidUniversal !== undefined && n === avoidUniversal) n = (n % 32) + 1;
  const t = getToothByUniversal(n);
  const style = Math.floor(rand() * 4);
  if (style === 0) {
    return {
      targetUniversal: n,
      difficulty: 'full',
      prompt: `Can you tap the ${t.clinicalName} (${t.commonNickname}) — #${t.universal} / FDI ${t.fdi}?`,
    };
  }
  if (style === 1) {
    return {
      targetUniversal: n,
      difficulty: 'name',
      prompt: `Find the ${t.clinicalName}!`,
    };
  }
  if (style === 2) {
    return {
      targetUniversal: n,
      difficulty: 'code',
      prompt: `Find FDI ${t.fdi} (“${t.fdiSpoken}”)!`,
    };
  }
  return {
    targetUniversal: n,
    difficulty: 'code',
    prompt: `Tap US tooth #${t.universal}!`,
  };
}

/** Pure answer check; streak resets gently on a miss and the best streak never decreases. */
export function judgeSpotQuizAnswer(
  targetUniversal: number,
  tappedUniversal: number,
  streak: number,
  bestStreak: number
): SpotQuizResult {
  const target = getToothByUniversal(targetUniversal);
  if (targetUniversal === tappedUniversal) {
    const nextStreak = streak + 1;
    return {
      correct: true,
      nextStreak,
      bestStreak: Math.max(bestStreak, nextStreak),
      message: `Yes! ${target.clinicalName} = #${target.universal} • FDI ${target.fdi} • Palmer ${target.palmer}`,
    };
  }
  const tapped = getToothByUniversal(tappedUniversal);
  return {
    correct: false,
    nextStreak: 0,
    bestStreak,
    message: `Close! That one is ${tapped.clinicalName} (#${tapped.universal}). Try again — you’ve got this!`,
  };
}

// ---------------------------------------------------------------------------------------------
// Tooth cross-section anatomy explorer (4 layers, outside → in)
// ---------------------------------------------------------------------------------------------
export interface ToothLayerInfo {
  id: 'enamel' | 'dentin' | 'pulp' | 'ligament';
  name: string;
  emoji: string;
  /** Approximate mineral content by weight (percent), where meaningful. */
  mineralPercent: number | null;
  tagline: string;
  detail: string;
  careTip: string;
  /** Diagram fill color. */
  colorHex: string;
}

export const TOOTH_CROSS_SECTION_LAYERS: readonly ToothLayerInfo[] = [
  {
    id: 'enamel',
    name: 'Enamel',
    emoji: '💎',
    mineralPercent: 96,
    tagline: 'Mohs 5 • the hardest tissue in your body',
    detail:
      'About 96% hydroxyapatite mineral packed in tiny prisms. It has no living cells, so it cannot regrow — but saliva and fluoride can re-mineralize early soft spots into tougher fluorapatite.',
    careTip: 'Fluoride toothpaste + a calm 2-minute brush keeps this shield glassy.',
    colorHex: '#e0f2fe',
  },
  {
    id: 'dentin',
    name: 'Dentin',
    emoji: '🟡',
    mineralPercent: 70,
    tagline: 'Microscopic tubules • the flexible core',
    detail:
      'About 70% mineral, laced with millions of microscopic tubules that lead toward the nerve. When enamel wears thin or gums recede, fluid moving in those tubules is why cold air can zing.',
    careTip: 'Soft bristles and gentle angles protect exposed dentin near the gumline.',
    colorHex: '#fde68a',
  },
  {
    id: 'pulp',
    name: 'Living Pulp',
    emoji: '❤️',
    mineralPercent: null,
    tagline: 'Nerves & blood vessels • the tooth’s heart',
    detail:
      'A soft chamber of nerves, vessels and connective tissue that feeds the tooth and senses temperature and pressure. Healthy pulp keeps a tooth alive and able to build repair dentin.',
    careTip: 'Catching cavities while they are small keeps bacteria far from the pulp.',
    colorHex: '#fb7185',
  },
  {
    id: 'ligament',
    name: 'Cementum & Periodontal Ligament',
    emoji: '🪢',
    mineralPercent: 45,
    tagline: 'The shock-absorbing sling around the root',
    detail:
      'Cementum (about 45% mineral) coats the root, and thousands of ligament fibers hang the tooth in its bony socket like a hammock — cushioning every bite and sensing how hard you chew.',
    careTip: 'Daily flossing keeps the gums that guard this sling calm and healthy.',
    colorHex: '#c4b5fd',
  },
];

export function getToothLayer(id: ToothLayerInfo['id']): ToothLayerInfo {
  return TOOTH_CROSS_SECTION_LAYERS.find((l) => l.id === id) ?? TOOTH_CROSS_SECTION_LAYERS[0];
}
