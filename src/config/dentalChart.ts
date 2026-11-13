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
    nicknameUpper: 'Front Smile Tooth',
    nicknameLower: 'Lower Front Tooth (Smallest Tooth)',
    anatomyUpper:
      'Broad chisel-shaped crown with a single conical root; erupts with 3 tiny bumps (mamelons) that wear smooth over time.',
    anatomyLower:
      'Narrowest, most symmetrical crown in the human mouth with 1 slender root; sits right beside salivary ducts under the tongue.',
    careTip:
      'Hold your brush up and down behind these teeth. Hard tartar builds up here fastest!',
  },
  {
    pos: 2,
    category: 'incisor',
    shortRole: 'Lateral Incisor',
    nicknameUpper: 'Side Smile Tooth',
    nicknameLower: 'Lower Side Front Tooth',
    anatomyUpper:
      'A little thinner than the front tooth, with one rounded corner and a small dent on the back.',
    anatomyLower:
      'A little wider than the lower front tooth, with 1 root. It helps the front teeth cut food.',
    careTip:
      'Where these teeth overlap, hug each side with floss in a gentle C-shape.',
  },
  {
    pos: 3,
    category: 'canine',
    shortRole: 'Canine',
    nicknameUpper: 'Cuspid / "Eye Tooth"',
    nicknameLower: 'Lower Cuspid',
    anatomyUpper:
      'One sharp point and the longest root of any tooth. It holds the corner of your smile and guides your jaw side to side.',
    anatomyLower:
      'A sharp point with a long, strong root. It works with the upper canine to protect the back teeth.',
    careTip:
      'Canines sit at the corner of your smile. Slow down here as your brush turns from the front teeth to the back.',
  },
  {
    pos: 4,
    category: 'premolar',
    shortRole: '1st Premolar',
    nicknameUpper: 'First Bicuspid',
    nicknameLower: 'First Bicuspid',
    anatomyUpper:
      'Has 2 sharp points and often 2 roots. It sits between the tearing canines and the grinding molars.',
    anatomyLower:
      'A small tooth with a big outer point, a small inner point and 1 root.',
    careTip:
      'Tilt your brush toward the gumline and brush the groove between the two points.',
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
      'A rounded tooth with 1 root. It often has 3 points and is great at crushing tough food.',
    careTip:
      'The tight gap between this tooth and the first molar is a common hiding spot for cavities. Always floss here!',
  },
  {
    pos: 6,
    category: 'molar',
    shortRole: '1st Molar',
    nicknameUpper: 'Six-Year Molar',
    nicknameLower: 'Six-Year Molar',
    anatomyUpper:
      'A wide grinding tooth with 4 points (sometimes a tiny 5th one!) and 3 roots.',
    anatomyLower:
      'Largest lower grinder with 5 cusps (3 outer, 2 inner) and 2 strong roots; erupts around age 6 without replacing any baby tooth.',
    careTip:
      'First molars do a lot of chewing and have deep grooves. Brush the grooves with short, gentle strokes.',
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
      'Has 4 points, 2 roots and a cross-shaped groove on top. It helps the first molar with heavy chewing.',
    careTip:
      'Close your mouth halfway when you brush the upper back molars. Opening too wide pulls your cheek tight against the brush!',
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
      'Reach the tip of your brush behind your very last tooth so plaque can’t hide there.',
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
    whereItFaces: 'The outside, facing your cheeks (back teeth) or lips (front teeth).',
    howToClean: '45° Bass sweep along the gumline collar.',
  },
  {
    code: 'L / P',
    name: 'Lingual / Palatal',
    whereItFaces: 'The inside, facing your tongue (lower teeth) or the roof of your mouth (upper teeth).',
    howToClean: 'Brush the inside of the back teeth. Hold the brush up and down behind the front teeth.',
  },
  {
    code: 'O / I',
    name: 'Occlusal / Incisal',
    whereItFaces: 'The chewing tops of back teeth (O) or the biting edges of front teeth (I).',
    howToClean: 'Short, quick strokes into the grooves of the back teeth.',
  },
  {
    code: 'M',
    name: 'Mesial',
    whereItFaces: 'The tight side that faces the FRONT middle of your mouth.',
    howToClean: 'Slide floss gently under the gum and hug the tooth in a C-shape.',
  },
  {
    code: 'D',
    name: 'Distal',
    whereItFaces: 'The tight side that faces the BACK of your mouth.',
    howToClean: 'Hug with floss in a C-shape, and wrap the brush behind your last molar.',
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
    headline: 'Hidden Gaps & Six-Year Molars',
    lesson:
      'A brush reaches 3 of a tooth’s 5 sides. About a third of each tooth hides in the tight gaps until you floss.',
  },
  world_2: {
    id: 'world_2',
    focusTeethBadge: 'Gumline • Teeth #21–#28 (FDI 34–44)',
    headline: 'Healthy Gums & the 45° Brush Tilt',
    lesson:
      'Dentists measure the tiny pocket around each tooth. 1–3 mm is healthy! Tilting the brush toward the gumline cleans it gently.',
  },
  world_3: {
    id: 'world_3',
    focusTeethBadge: 'Posterior Molars #2–#3 & #14–#15 (FDI 17–16 & 26–27)',
    headline: 'The 20-Minute Acid Clock',
    lesson:
      'Every sugary sip makes acid for about 20 minutes. Acid pulls minerals out of enamel. Spit washes acid away, and fluoride helps rebuild stronger enamel.',
  },
  world_4: {
    id: 'world_4',
    focusTeethBadge: 'Lower Incisors #24–#25 (FDI 31–41) & Upper #3, #14',
    headline: 'Why Tartar Has Favorite Teeth',
    lesson:
      'Spit flows in behind the lower front teeth and beside the upper back teeth. Its minerals fight acid, but they can also turn old plaque into hard tartar!',
  },
  world_5: {
    id: 'world_5',
    focusTeethBadge: 'Full Arch #1–#32 (FDI 11–48) & Wisdom Teeth #1, #16, #17, #32',
    headline: 'Germ Slime Domes & Space Dentistry',
    lesson:
      'In 1–2 days, germs left alone build sticky slime domes that rinses can’t wash off. Brushing and flossing break them. That matters in space, where there is no dentist nearby!',
  },
  pulp_rescue: {
    id: 'pulp_rescue',
    focusTeethBadge: 'Inside a Tooth: Enamel → Dentin → Living Pulp',
    headline: 'How Dentists Save a Hurt Tooth',
    lesson:
      'Hard outer enamel has no nerves. The dentin under it has tiny tubes that lead to the living pulp. A gentle dental liner calms the pulp and helps it heal.',
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
    tagline: 'The hardest part of your body',
    detail:
      'Enamel is almost all mineral, packed in tiny rods. It has no living cells, so it can’t grow back. But spit and fluoride can harden early soft spots.',
    careTip: 'Fluoride toothpaste and a calm 2-minute brush keep this shield smooth.',
    colorHex: '#e0f2fe',
  },
  {
    id: 'dentin',
    name: 'Dentin',
    emoji: '🟡',
    mineralPercent: 70,
    tagline: 'Tiny tubes • the bendy core',
    detail:
      'Dentin has millions of tiny tubes that lead toward the nerve. When enamel wears thin, cold air can reach them. That is the zing you feel.',
    careTip: 'Soft bristles and a gentle touch protect dentin near the gumline.',
    colorHex: '#fde68a',
  },
  {
    id: 'pulp',
    name: 'Living Pulp',
    emoji: '❤️',
    mineralPercent: null,
    tagline: 'Nerves & blood vessels • the tooth’s heart',
    detail:
      'A soft space with nerves and blood vessels. It feeds the tooth and feels hot, cold and pressure. Healthy pulp keeps a tooth alive.',
    careTip: 'Catching cavities while they are small keeps germs far from the pulp.',
    colorHex: '#fb7185',
  },
  {
    id: 'ligament',
    name: 'Root Cover & Tooth Cushion',
    emoji: '🪢',
    mineralPercent: 45,
    tagline: 'The cushion around the root',
    detail:
      'A thin layer covers the root. Thousands of tiny fibers hold the tooth in its socket like a hammock. They cushion every bite.',
    careTip: 'Flossing every day keeps the gums around this cushion calm and healthy.',
    colorHex: '#c4b5fd',
  },
];

export function getToothLayer(id: ToothLayerInfo['id']): ToothLayerInfo {
  return TOOTH_CROSS_SECTION_LAYERS.find((l) => l.id === id) ?? TOOTH_CROSS_SECTION_LAYERS[0];
}
