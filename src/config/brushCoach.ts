/**
 * Hands-free Brush-Along coach: 3-stage timeline (2:00 brush → 0:45 floss → 1:00/0:30 fluoride rinse),
 * glanceable headlines, spoken cues in 8 languages, and the tilt-slosh model for the rinse stage.
 *
 * This is the web twin of `native-apple/Sources/MouthLifeCore/Config/BrushCoachSystem.swift`.
 * Keep the two in lockstep: same timings, same indices, same copy.
 */
import {
  BRUSH_ALONG_FLOSS_BONUS_SEC,
  BRUSH_ALONG_MOUTHWASH_BONUS_SEC,
  BRUSH_ALONG_MOUTHWASH_QUICK_SEC,
  BRUSH_ALONG_TOTAL_SEC,
} from './gameConfig';

export type PacerStage = 'brushing' | 'flossBonus' | 'mouthwashBonus';
export type FlossToolStyle = 'flossPick' | 'stringFloss';
export type MouthwashDurationStyle = 'totalCare60s' | 'quick30s';

export function mouthwashDurationSec(style: MouthwashDurationStyle): number {
  return style === 'quick30s' ? BRUSH_ALONG_MOUTHWASH_QUICK_SEC : BRUSH_ALONG_MOUTHWASH_BONUS_SEC;
}

// ---------------------------------------------------------------- languages

export type CoachLanguage = 'en' | 'es' | 'fr' | 'ja' | 'zh' | 'ko' | 'pt' | 'de';

export const COACH_LANGUAGES: readonly CoachLanguage[] = ['en', 'es', 'fr', 'ja', 'zh', 'ko', 'pt', 'de'];

export const COACH_LANGUAGE_INFO: Record<
  CoachLanguage,
  { bcp47VoiceCode: string; flagEmoji: string; nativeName: string }
> = {
  en: { bcp47VoiceCode: 'en-US', flagEmoji: '🇺🇸', nativeName: 'English' },
  es: { bcp47VoiceCode: 'es-MX', flagEmoji: '🇪🇸', nativeName: 'Español' },
  fr: { bcp47VoiceCode: 'fr-CA', flagEmoji: '🇫🇷', nativeName: 'Français' },
  ja: { bcp47VoiceCode: 'ja-JP', flagEmoji: '🇯🇵', nativeName: '日本語' },
  zh: { bcp47VoiceCode: 'zh-CN', flagEmoji: '🇨🇳', nativeName: '中文' },
  ko: { bcp47VoiceCode: 'ko-KR', flagEmoji: '🇰🇷', nativeName: '한국어' },
  pt: { bcp47VoiceCode: 'pt-BR', flagEmoji: '🇧🇷', nativeName: 'Português' },
  de: { bcp47VoiceCode: 'de-DE', flagEmoji: '🇩🇪', nativeName: 'Deutsch' },
};

export function isCoachLanguage(v: unknown): v is CoachLanguage {
  return typeof v === 'string' && (COACH_LANGUAGES as readonly string[]).includes(v);
}

/** First supported language among the browser's preferred languages; English otherwise. */
export function detectCoachLanguage(preferredLanguages: readonly string[]): CoachLanguage {
  for (const tag of preferredLanguages) {
    const lower = tag.toLowerCase();
    for (const code of ['es', 'fr', 'ja', 'zh', 'ko', 'pt', 'de', 'en'] as const) {
      if (lower.startsWith(code)) return code;
    }
  }
  return 'en';
}

// ---------------------------------------------------------------- timeline

/** Body-locked quadrant index. Mirror view: Q1/Q4 (patient right) on screen-right, Q2/Q3 on screen-left. */
export const BrushQuadrant = { upperRight: 0, upperLeft: 1, lowerLeft: 2, lowerRight: 3 } as const;
export type BrushQuadrantIdx = 0 | 1 | 2 | 3;

export const BrushSurface = { outerCheek: 0, chewingGrooves: 1, innerTongue: 2 } as const;
export type BrushSurfaceIdx = 0 | 1 | 2;

export function isUpperQuadrant(q: number): boolean {
  return q === BrushQuadrant.upperRight || q === BrushQuadrant.upperLeft;
}

export function isPatientRightQuadrant(q: number): boolean {
  return q === BrushQuadrant.upperRight || q === BrushQuadrant.lowerRight;
}

export interface BrushPhaseState {
  stage: PacerStage;
  quadrant: BrushQuadrantIdx;
  surface: BrushSurfaceIdx;
  /** 0..11 brushing, 12/13 floss upper/lower, 14..16 rinse steps. */
  phaseIndex12: number;
  phaseElapsedSec: number;
  phaseDurationSec: number;
  /** 3, 2 or 1 in the last 3 seconds before the next switch; null otherwise. */
  countdownPip: 1 | 2 | 3 | null;
  /** 0..1 ramp in the last 0.85s before a switch (rinse stage: overall seal progress). */
  preEcho01: number;
  /** Next quadrant when a quadrant boundary is within 0.85s, else -1. */
  upcomingQuadrantIndex: number;
  /** Bitmask of finished quadrants (0b1111 during floss and rinse). */
  completedQuadrantsMask: number;
  flossIsUpper: boolean;
  flossContactIndex: number;
  /** 0 = glide past the contact, 1 = lean on wall A, 2 = lean on wall B and lift. */
  flossStepIndex: number;
  /** 0 = pour and swish, 1 = pump between teeth, 2 = final swish. */
  mouthwashStepIndex: number;
  mouthwashProgress01: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function pipFor(remainingSec: number): 1 | 2 | 3 | null {
  if (remainingSec <= 3.0 && remainingSec > 0.05) {
    return clamp(Math.ceil(remainingSec), 1, 3) as 1 | 2 | 3;
  }
  return null;
}

/**
 * Single authoritative snapshot for a point on the cumulative session clock:
 * 0..120 brushing, 120..165 floss, 165..(165 + rinse) fluoride rinse.
 */
export function evaluateBrushPhase(
  elapsedSec: number,
  stage: PacerStage,
  mouthwashDurSec: number = BRUSH_ALONG_MOUTHWASH_BONUS_SEC
): BrushPhaseState {
  if (stage === 'mouthwashBonus') {
    const mwStart = BRUSH_ALONG_TOTAL_SEC + BRUSH_ALONG_FLOSS_BONUS_SEC;
    const mwTotal = Math.max(6.0, mouthwashDurSec);
    const mwElapsed = Math.min(mwTotal - 0.001, Math.max(0, elapsedSec - mwStart));
    const prog01 = clamp(mwElapsed / mwTotal, 0, 1);
    const subDur = mwTotal / 3.0;
    const stepIdx = clamp(Math.floor(mwElapsed / subDur), 0, 2);
    const subElapsed = mwElapsed - stepIdx * subDur;
    const remInSub = Math.max(0, subDur - subElapsed);
    const sloshRight = Math.sin(mwElapsed * 2.4) >= 0;
    return {
      stage,
      quadrant: sloshRight ? BrushQuadrant.upperRight : BrushQuadrant.upperLeft,
      surface: BrushSurface.outerCheek,
      phaseIndex12: 14 + stepIdx,
      phaseElapsedSec: subElapsed,
      phaseDurationSec: subDur,
      countdownPip: pipFor(remInSub),
      preEcho01: prog01,
      upcomingQuadrantIndex: -1,
      completedQuadrantsMask: 0b1111,
      flossIsUpper: true,
      flossContactIndex: 0,
      flossStepIndex: 0,
      mouthwashStepIndex: stepIdx,
      mouthwashProgress01: prog01,
    };
  }

  if (stage === 'flossBonus') {
    const flossElapsed = Math.max(0, elapsedSec - BRUSH_ALONG_TOTAL_SEC);
    const bonusTotal = Math.max(2.0, BRUSH_ALONG_FLOSS_BONUS_SEC);
    const halfDur = bonusTotal * 0.5;
    const isUpper = flossElapsed < halfDur;
    const archElapsed = isUpper ? flossElapsed : Math.min(halfDur, flossElapsed - halfDur);
    const halfNorm = clamp(archElapsed / halfDur, 0, 0.999);
    const contactProg = clamp(halfNorm * 13.0, 0, 12.999);
    const cIdx = clamp(Math.floor(contactProg), 0, 12);
    const gapFrac = contactProg - cIdx;
    const stepIdx = gapFrac < 0.3 ? 0 : gapFrac < 0.65 ? 1 : 2;
    const remInHalf = Math.max(0, halfDur - archElapsed);
    const preEcho = remInHalf < 0.85 ? clamp((0.85 - remInHalf) / 0.85, 0, 1) : 0;
    // Contacts 0..5 sit on the patient's right (Q1/Q4), 6..12 on the left (Q2/Q3).
    const quadrant = isUpper
      ? cIdx < 6
        ? BrushQuadrant.upperRight
        : BrushQuadrant.upperLeft
      : cIdx < 6
        ? BrushQuadrant.lowerRight
        : BrushQuadrant.lowerLeft;
    return {
      stage,
      quadrant,
      surface: BrushSurface.outerCheek,
      phaseIndex12: isUpper ? 12 : 13,
      phaseElapsedSec: archElapsed,
      phaseDurationSec: halfDur,
      countdownPip: pipFor(remInHalf),
      preEcho01: preEcho,
      upcomingQuadrantIndex: -1,
      completedQuadrantsMask: 0b1111,
      flossIsUpper: isUpper,
      flossContactIndex: cIdx,
      flossStepIndex: stepIdx,
      mouthwashStepIndex: 0,
      mouthwashProgress01: 0,
    };
  }

  const clamped = Math.min(BRUSH_ALONG_TOTAL_SEC - 0.001, Math.max(0, elapsedSec));
  const qRaw = clamp(Math.trunc(clamped / 30.0), 0, 3);
  const qElapsed = clamped - qRaw * 30.0;
  const sRaw = clamp(Math.trunc(qElapsed / 10.0), 0, 2);
  const sElapsed = qElapsed - sRaw * 10.0;
  const remSurface = Math.max(0, 10.0 - sElapsed);
  const preEcho = remSurface < 0.85 ? clamp((0.85 - remSurface) / 0.85, 0, 1) : 0;
  const upcomingQuad = sRaw === 2 && remSurface < 0.85 && qRaw < 3 ? qRaw + 1 : -1;
  let completedMask = 0;
  for (let i = 0; i < qRaw; i++) completedMask |= 1 << i;
  return {
    stage: 'brushing',
    quadrant: qRaw as BrushQuadrantIdx,
    surface: sRaw as BrushSurfaceIdx,
    phaseIndex12: qRaw * 3 + sRaw,
    phaseElapsedSec: sElapsed,
    phaseDurationSec: 10.0,
    countdownPip: pipFor(remSurface),
    preEcho01: preEcho,
    upcomingQuadrantIndex: upcomingQuad,
    completedQuadrantsMask: completedMask,
    flossIsUpper: true,
    flossContactIndex: 0,
    flossStepIndex: 0,
    mouthwashStepIndex: 0,
    mouthwashProgress01: 0,
  };
}

/** Cumulative session-clock second at which each stage ends. */
export function pacerStageEndSec(stage: PacerStage, mouthwashDurSec: number): number {
  if (stage === 'brushing') return BRUSH_ALONG_TOTAL_SEC;
  const flossEnd = BRUSH_ALONG_TOTAL_SEC + BRUSH_ALONG_FLOSS_BONUS_SEC;
  return stage === 'flossBonus' ? flossEnd : flossEnd + mouthwashDurSec;
}

// ---------------------------------------------------------------- copy

type PerLang<T> = Record<CoachLanguage, T>;

const MIRROR_SIDES: PerLang<{ left: string; right: string }> = {
  en: { left: 'LEFT', right: 'RIGHT' },
  es: { left: 'IZQ', right: 'DER' },
  fr: { left: 'GAUCHE', right: 'DROITE' },
  ja: { left: '左', right: '右' },
  zh: { left: '左', right: '右' },
  ko: { left: '왼쪽', right: '오른쪽' },
  pt: { left: 'ESQ', right: 'DIR' },
  de: { left: 'LINKS', right: 'RECHTS' },
};

/** Indexed by quadrant: upperRight, upperLeft, lowerLeft, lowerRight. */
const QUADRANT_LABELS: PerLang<readonly [string, string, string, string]> = {
  en: ['TOP RIGHT', 'TOP LEFT', 'BOTTOM LEFT', 'BOTTOM RIGHT'],
  es: ['ARRIBA DERECHA', 'ARRIBA IZQUIERDA', 'ABAJO IZQUIERDA', 'ABAJO DERECHA'],
  fr: ['EN HAUT À DROITE', 'EN HAUT À GAUCHE', 'EN BAS À GAUCHE', 'EN BAS À DROITE'],
  ja: ['右上', '左上', '左下', '右下'],
  zh: ['右上', '左上', '左下', '右下'],
  ko: ['오른쪽 위', '왼쪽 위', '왼쪽 아래', '오른쪽 아래'],
  pt: ['CIMA DIREITA', 'CIMA ESQUERDA', 'BAIXO ESQUERDA', 'BAIXO DIREITA'],
  de: ['OBEN RECHTS', 'OBEN LINKS', 'UNTEN LINKS', 'UNTEN RECHTS'],
};

type Badge = { headline: string; angleTag: string };
/** Indexed by surface: outerCheek, chewingGrooves, innerTongue. */
const SURFACE_BADGES: PerLang<readonly [Badge, Badge, Badge]> = {
  en: [
    { headline: 'OUTSIDE • GUMLINE', angleTag: '45° ANGLE' },
    { headline: 'CHEWING GROOVES', angleTag: 'SHORT STROKES' },
    { headline: 'INSIDE • TILT FRONT', angleTag: 'VERTICAL TIP' },
  ],
  es: [
    { headline: 'AFUERA • ENCÍA', angleTag: 'ÁNGULO 45°' },
    { headline: 'CARAS DE MASTICAR', angleTag: 'PLANO' },
    { headline: 'ADENTRO • VERTICAL', angleTag: 'PUNTA 90°' },
  ],
  fr: [
    { headline: 'EXTÉRIEUR • GENCIVE', angleTag: 'ANGLE 45°' },
    { headline: 'DESSUS • SILLONS', angleTag: 'À PLAT' },
    { headline: 'INTÉRIEUR • VERTICAL', angleTag: 'VERTICAL 90°' },
  ],
  ja: [
    { headline: '外側 • 歯ぐき', angleTag: '45°斜め' },
    { headline: 'かみ合わせの溝', angleTag: '水平' },
    { headline: '内側 • 前歯は縦', angleTag: '縦磨き' },
  ],
  zh: [
    { headline: '外侧 • 牙龈线', angleTag: '45°斜角' },
    { headline: '咬合面沟槽', angleTag: '平刷' },
    { headline: '内侧 • 前牙竖刷', angleTag: '竖立刷头' },
  ],
  ko: [
    { headline: '바깥쪽 • 잇몸선', angleTag: '45° 각도' },
    { headline: '씹는 면 홈', angleTag: '수평' },
    { headline: '안쪽 • 앞니 세우기', angleTag: '수직 칫솔질' },
  ],
  pt: [
    { headline: 'FORA • GENGIVA', angleTag: 'ÂNGULO 45°' },
    { headline: 'TOPO • SULCOS', angleTag: 'PLANO' },
    { headline: 'DENTRO • VERTICAL', angleTag: 'PONTA 90°' },
  ],
  de: [
    { headline: 'AUSSEN • ZAHNFLEISCH', angleTag: '45° WINKEL' },
    { headline: 'KAUFLÄCHEN', angleTag: 'FLACH' },
    { headline: 'INNEN • HOCHKANT', angleTag: 'VERTIKAL' },
  ],
};

const FLOSS_HEADLINES: Record<
  Exclude<CoachLanguage, 'en'>,
  { upper: string; lower: string; glide: string; lean: string }
> = {
  es: {
    upper: 'HILO DENTAL • DIENTES ARRIBA',
    lower: 'HILO DENTAL • DIENTES ABAJO',
    glide: 'DESLIZA SUAVE SIN GOLPEAR',
    lean: 'INCLINA A CADA LADO DEL DIENTE',
  },
  fr: {
    upper: 'PORTE-FIL • DENTS DU HAUT',
    lower: 'PORTE-FIL • DENTS DU BAS',
    glide: 'GLISSEZ DOUCEMENT',
    lean: 'INCLINEZ SUR CHAQUE PAROI',
  },
  ja: {
    upper: 'フロスピック • 上の歯',
    lower: 'フロスピック • 下の歯',
    glide: 'やさしく前後にスライド',
    lean: '左右の歯の面に沿わせる',
  },
  zh: {
    upper: '牙线棒 • 上排牙齿',
    lower: '牙线棒 • 下排牙齿',
    glide: '轻轻锯动滑入牙缝',
    lean: '左右倾斜贴紧两侧牙面',
  },
  ko: {
    upper: '치실 픽 • 윗니',
    lower: '치실 픽 • 아랫니',
    glide: '살살 앞뒤로 미끄러지듯 넣기',
    lean: '양쪽 치아 벽에 기대어 쓸기',
  },
  pt: {
    upper: 'FIO COM HASTE • DENTES DE CIMA',
    lower: 'FIO COM HASTE • DENTES DE BAIXO',
    glide: 'DESLIZE SUAVE SEM FORÇAR',
    lean: 'INCLINE NOS DOIS LADOS',
  },
  de: {
    upper: 'ZAHNSEIDESTICK • OBEN',
    lower: 'ZAHNSEIDESTICK • UNTEN',
    glide: 'SANFT HINEINGLEITEN',
    lean: 'LINKS & RECHTS ANLEHNEN',
  },
};

const HUB_START_LABEL: PerLang<string> = {
  en: '2 min Brush • Pick • Rinse',
  es: '2 min Cepillo • Hilo • Enjuague',
  fr: '2 min Brosse • Fil • Rinçage',
  ja: '2分 歯みがき・ピック・洗口液',
  zh: '2分钟 刷牙·牙线·漱口水',
  ko: '2분 양치·치실픽·가글',
  pt: '2 min Escova • Fio • Enxaguante',
  de: '2 min Putzen • Stick • Spülung',
};

/** [flossJump, done, skip, rinseJump] verbs; ion amounts are appended by the accessors. */
const BUTTON_WORDS: PerLang<{ flossJump: string; done: string; skip: string; rinseJump: string }> = {
  en: { flossJump: 'Floss Pick', done: 'Done', skip: 'Skip', rinseJump: 'Fluoride Rinse' },
  es: { flossJump: 'Usar Hilo', done: 'Listo', skip: 'Saltar', rinseJump: 'Enjuague Flúor' },
  fr: { flossJump: 'Porte-Fil', done: 'Fini', skip: 'Passer', rinseJump: 'Rinçage Fluor' },
  ja: { flossJump: 'フロスピック', done: '完了', skip: 'スキップ', rinseJump: 'フッ素洗口' },
  zh: { flossJump: '牙线棒', done: '完成', skip: '跳过', rinseJump: '含氟漱口' },
  ko: { flossJump: '치실 픽', done: '완료', skip: '건너뛰기', rinseJump: '불소 가글' },
  pt: { flossJump: 'Fio Dental', done: 'Pronto', skip: 'Pular', rinseJump: 'Enxaguante Flúor' },
  de: { flossJump: 'Stick-Runde', done: 'Fertig', skip: 'Weiter', rinseJump: 'Fluorid-Spülung' },
};

type RinseStep = { actionBadge: string; ruleTag: string };
const MOUTHWASH_HEADLINES: PerLang<{ title: string; steps: readonly [RinseStep, RinseStep, RinseStep] }> = {
  en: {
    title: 'FLUORIDE RINSE',
    steps: [
      { actionBadge: 'SWISH CHEEK TO CHEEK • 10 mL', ruleTag: 'OPTIONAL • AGE 6+' },
      { actionBadge: 'PUMP VIGOROUSLY BETWEEN TEETH', ruleTag: 'ALL 26 GAPS' },
      { actionBadge: 'FINAL SWISH • DO NOT SWALLOW', ruleTag: 'NO WATER 30 min' },
    ],
  },
  es: {
    title: 'ENJUAGUE CON FLÚOR',
    steps: [
      { actionBadge: 'BUCHES DE MEJILLA A MEJILLA • 10 mL', ruleTag: 'OPCIONAL • 6+' },
      { actionBadge: 'EMPUJA FUERTE ENTRE LOS DIENTES', ruleTag: '26 ESPACIOS' },
      { actionBadge: 'RECTA FINAL • NO TRAGAR', ruleTag: 'SIN AGUA 30 min' },
    ],
  },
  fr: {
    title: 'BAIN DE BOUCHE AU FLUOR',
    steps: [
      { actionBadge: "RINCEZ D'UNE JOUE À L'AUTRE • 10 mL", ruleTag: 'FACULTATIF • 6 ANS+' },
      { actionBadge: 'FAITES PASSER ENTRE LES DENTS', ruleTag: '26 ESPACES' },
      { actionBadge: 'DERNIER TOUR • NE PAS AVALER', ruleTag: 'SANS EAU 30 min' },
    ],
  },
  ja: {
    title: 'フッ素洗口液',
    steps: [
      { actionBadge: '10mLを左右の頬へブクブク', ruleTag: '任意 • 6歳以上' },
      { actionBadge: '歯と歯の間へ強く通す', ruleTag: '全26箇所' },
      { actionBadge: '仕上げ • 飲み込まないで吐き出す', ruleTag: '30分飲食なし' },
    ],
  },
  zh: {
    title: '含氟漱口水',
    steps: [
      { actionBadge: '10毫升 左右脸颊鼓漱', ruleTag: '可选 • 6岁以上' },
      { actionBadge: '用力把液体冲过所有牙缝', ruleTag: '26处牙缝' },
      { actionBadge: '最后冲刺 • 切勿吞咽', ruleTag: '30分钟禁水食' },
    ],
  },
  ko: {
    title: '불소 가글',
    steps: [
      { actionBadge: '10mL 양볼로 힘차게 가글', ruleTag: '선택 • 6세 이상' },
      { actionBadge: '치아 사이사이로 강하게 통과', ruleTag: '26개 틈새' },
      { actionBadge: '마무리 가글 • 삼키지 마세요', ruleTag: '30분 물·음식 금지' },
    ],
  },
  pt: {
    title: 'ENXAGUANTE COM FLÚOR',
    steps: [
      { actionBadge: 'BOCHECHE DE LADO A LADO • 10 mL', ruleTag: 'OPCIONAL • 6+' },
      { actionBadge: 'PASSE FORTE ENTRE OS DENTES', ruleTag: '26 ESPAÇOS' },
      { actionBadge: 'RETA FINAL • NÃO ENGULA', ruleTag: 'SEM ÁGUA 30 min' },
    ],
  },
  de: {
    title: 'FLUORID-MUNDSPÜLUNG',
    steps: [
      { actionBadge: 'KRÄFTIG HIN UND HER SPÜLEN • 10 mL', ruleTag: 'OPTIONAL • AB 6 J.' },
      { actionBadge: 'DURCH DIE ZAHNZWISCHENRÄUME SPÜLEN', ruleTag: '26 LÜCKEN' },
      { actionBadge: 'ENDSPURT • NICHT SCHLUCKEN', ruleTag: '30 min KEIN WASSER' },
    ],
  },
};

/** Spoken outer-surface cue per quadrant: upperRight, upperLeft, lowerLeft, lowerRight. */
const SPOKEN_OUTER: PerLang<readonly [string, string, string, string]> = {
  en: [
    'Top right, outside. Angle gently to the gumline.',
    'Switch. Top left, outside.',
    'Bottom left, outside.',
    'Final section. Bottom right, outside.',
  ],
  es: [
    'Arriba a la derecha, por fuera. Inclina hacia la encía.',
    'Cambio. Arriba a la izquierda, por fuera.',
    'Abajo a la izquierda, por fuera.',
    'Última zona. Abajo a la derecha, por fuera.',
  ],
  fr: [
    'En haut à droite, extérieur. Inclinez vers la gencive.',
    'Changez. En haut à gauche, extérieur.',
    'En bas à gauche, extérieur.',
    'Dernière zone. En bas à droite, extérieur.',
  ],
  ja: ['右上、外側。歯ぐきに斜めにあてます。', 'チェンジ。左上、外側。', '左下、外側。', '最後です。右下、外側。'],
  zh: ['右上，外侧。斜向牙龈轻刷。', '换边。左上，外侧。', '左下，外侧。', '最后一段。右下，外侧。'],
  ko: [
    '오른쪽 위, 바깥쪽. 잇몸선으로 살짝 기울이세요.',
    '바꿔서, 왼쪽 위 바깥쪽.',
    '왼쪽 아래, 바깥쪽.',
    '마지막 구역, 오른쪽 아래 바깥쪽.',
  ],
  pt: [
    'Em cima à direita, por fora. Incline em direção à gengiva.',
    'Troque. Em cima à esquerda, por fora.',
    'Embaixo à esquerda, por fora.',
    'Última parte. Embaixo à direita, por fora.',
  ],
  de: [
    'Oben rechts, außen. Sanft zum Zahnfleisch neigen.',
    'Wechsel. Oben links, außen.',
    'Unten links, außen.',
    'Letzter Abschnitt. Unten rechts, außen.',
  ],
};

const SPOKEN_CHEWING: PerLang<string> = {
  en: 'Chewing surfaces.',
  es: 'Superficies de masticar.',
  fr: 'Surfaces de mastication.',
  ja: 'かみ合わせの面。',
  zh: '咬合面沟槽。',
  ko: '씹는 면.',
  pt: 'Topo dos dentes.',
  de: 'Kauflächen.',
};

const SPOKEN_INNER: PerLang<string> = {
  en: 'Inside. Tilt brush vertical behind front teeth.',
  es: 'Por dentro. Cepillo vertical en los dientes frontales.',
  fr: 'Intérieur. Brosse verticale derrière les dents de devant.',
  ja: '内側。前歯の裏はブラシを縦にします。',
  zh: '内侧。前牙内侧请把牙刷竖起来。',
  ko: '안쪽. 앞니 뒤는 칫솔을 세워주세요.',
  pt: 'Por dentro. Escova na vertical nos dentes da frente.',
  de: 'Innen. Hinter den Schneidezähnen Bürste hochkant halten.',
};

const SPOKEN_FLOSS_START: PerLang<string> = {
  en: 'Great brushing! Bonus round: Floss Pick, top teeth. Wiggle gently in, lean left and right.',
  es: 'Muy bien. Ronda extra con hilo, dientes de arriba. Desliza suave e inclina a cada lado.',
  fr: 'Bravo. Bonus porte-fil, dents du haut. Glissez doucement sur chaque côté.',
  ja: 'ブラッシング完了！ボーナス、フロスピックで上の歯。やさしく入れて左右に沿わせましょう。',
  zh: '刷得真棒！加分环节，牙线棒清洁上排牙齿，轻轻滑入，左右贴紧牙面。',
  ko: '잘하셨어요! 보너스 치실 픽, 윗니부터 살살 넣어 양쪽 벽을 쓸어주세요.',
  pt: 'Ótima escovação! Bônus com fio, dentes de cima. Deslize suave nos dois lados.',
  de: 'Super geputzt! Bonusrunde Zahnseidestick, obere Zähne. Sanft gleiten und beidseitig anlehnen.',
};

const SPOKEN_FLOSS_START_STRING_EN = 'Great brushing! Bonus round: Floss top teeth, hugging each side.';

const SPOKEN_FLOSS_LOWER: PerLang<string> = {
  en: 'Halfway. Bottom teeth.',
  es: 'Vamos a la mitad. Dientes de abajo.',
  fr: 'À mi-chemin. Dents du bas.',
  ja: '半分です。下の歯へ。',
  zh: '过半啦，换下排牙齿。',
  ko: '절반 완료. 이제 아랫니입니다.',
  pt: 'Metade. Dentes de baixo.',
  de: 'Halbzeit. Untere Zähne.',
};

const SPOKEN_MOUTHWASH_START: PerLang<{ full: string; quick: string }> = {
  en: {
    full: 'Final bonus, if you use one: fluoride rinse. Pour ten milliliters and swish cheek to cheek for one minute. Do not swallow.',
    quick: 'Final bonus, if you use one: fluoride rinse. Pour ten milliliters and swish cheek to cheek for thirty seconds. Do not swallow.',
  },
  es: {
    full: 'Ronda final: enjuague con flúor. Toma diez mililitros y haz buches por un minuto sin tragar.',
    quick: 'Ronda final: enjuague con flúor. Haz buches por treinta segundos sin tragar.',
  },
  fr: {
    full: 'Bonus final : bain de bouche au fluor. Prenez dix millilitres et rincez pendant une minute sans avaler.',
    quick: 'Bonus final : bain de bouche au fluor pendant trente secondes, sans avaler.',
  },
  ja: {
    full: '最後のボーナス、フッ素洗口液！10ミリリットルを口に含み、1分間ブクブクゆすぎます。飲み込まないでください。',
    quick: '最後のボーナス、フッ素洗口液！30秒間しっかりブクブクゆすぎます。飲み込まないでください。',
  },
  zh: {
    full: '最后一关：含氟漱口水！倒十毫升，左右鼓漱一分钟，不要吞咽。',
    quick: '最后一关：含氟漱口水！左右鼓漱三十秒，不要吞咽。',
  },
  ko: {
    full: '마지막 보너스, 불소 가글! 10밀리리터를 머금고 1분 동안 양볼로 힘차게 가글하세요. 삼키지 마세요.',
    quick: '마지막 보너스, 불소 가글! 30초 동안 힘차게 가글하세요. 삼키지 마세요.',
  },
  pt: {
    full: 'Bônus final: enxaguante com flúor! Bocheche dez mililitros por um minuto, sem engolir.',
    quick: 'Bônus final: enxaguante com flúor por trinta segundos, sem engolir.',
  },
  de: {
    full: 'Letzte Bonusrunde: Fluorid-Mundspülung! Zehn Milliliter eine Minute kräftig spülen, nicht schlucken.',
    quick: 'Letzte Bonusrunde: Fluorid-Mundspülung dreißig Sekunden kräftig spülen, nicht schlucken.',
  },
};

const SPOKEN_MOUTHWASH_PUMP: PerLang<string> = {
  en: 'Pump the rinse vigorously between all your teeth.',
  es: 'Empuja el líquido con fuerza entre todos los dientes.',
  fr: 'Faites passer le liquide vigoureusement entre toutes les dents.',
  ja: '歯と歯の間へ、液体を強く通しましょう。',
  zh: '用力把漱口水冲过每一处牙缝。',
  ko: '치아 사이사이로 가글액을 힘차게 통과시키세요.',
  pt: 'Passe o líquido com força entre todos os dentes.',
  de: 'Spülung kräftig zwischen alle Zähne pressen.',
};

const SPOKEN_MOUTHWASH_FINAL: PerLang<string> = {
  en: 'Final stretch! Keep swishing, and remember: after spitting, no water or food for thirty minutes.',
  es: 'Últimos segundos. Al escupir, no tomes agua ni comas por treinta minutos.',
  fr: 'Dernière ligne droite ! Après avoir craché, ni eau ni repas pendant trente minutes.',
  ja: 'あと少し！吐き出した後は、30分間水ですすいだり飲食しないでください。',
  zh: '最后冲刺！吐掉后三十分钟内不要用水漱口或进食。',
  ko: '거의 다 됐어요! 뱉은 뒤 30분 동안 물로 헹구거나 드시지 마세요.',
  pt: 'Reta final! Depois de cuspir, fique trinta minutos sem água ou comida.',
  de: 'Endspurt! Nach dem Ausspucken dreißig Minuten kein Wasser und nichts essen.',
};

const SPOKEN_COMPLETE: PerLang<{ withRinse: string; plain: string }> = {
  en: {
    withRinse:
      'Rinse complete! Spit out completely. Do not rinse with water, eat, or drink for thirty minutes so your fluoride shield locks in.',
    plain: "All sparkling clean! Spit excess foam, don't rinse right away.",
  },
  es: {
    withRinse:
      '¡Enjuague completo! Escupe todo. No enjuagues con agua ni comas o bebas por treinta minutos para fijar el flúor.',
    plain: 'Todo brillante. Escupe la espuma sin enjuagar todavía.',
  },
  fr: {
    withRinse:
      "Soin complet terminé ! Crachez tout. Ne rincez pas à l'eau et ne mangez ni ne buvez pendant trente minutes.",
    plain: 'Tout est propre ! Crachez la mousse sans rincer tout de suite.',
  },
  ja: {
    withRinse: '洗口完了！しっかり吐き出して、フッ素が定着するよう30分間は水ゆすぎや飲食を控えてください。',
    plain: 'ピカピカです！泡を吐き出して、すぐにはゆすがないでくださいね。',
  },
  zh: {
    withRinse: '漱口完成！请完全吐出，三十分钟内不要用水漱口、喝水或进食，让氟保护层牢牢锁住。',
    plain: '全部亮晶晶！吐掉多余泡沫，先别马上漱口哦。',
  },
  ko: {
    withRinse: '가글 완료! 완전히 뱉어내시고, 불소막이 고정되도록 30분 동안 물로 헹구거나 드시지 마세요.',
    plain: '반짝반짝 깨끗해졌어요! 거품만 뱉고 바로 헹구지 마세요.',
  },
  pt: {
    withRinse: 'Enxágue concluído! Cuspa tudo. Não enxágue com água nem coma ou beba por trinta minutos.',
    plain: 'Tudo brilhando! Cuspa a espuma sem enxaguar agora.',
  },
  de: {
    withRinse:
      'Spülung geschafft! Komplett ausspucken und dreißig Minuten nicht mit Wasser nachspülen, essen oder trinken.',
    plain: 'Alles blitzblank! Schaum ausspucken, noch nicht direkt nachspülen.',
  },
};

const GYRO_STATUS: PerLang<{ handheld: string; auto: string }> = {
  en: { handheld: 'LIVE TILT SLOSH', auto: 'AUTO • PICK UP TO TILT' },
  es: { handheld: 'INCLINA PARA ENJUAGAR', auto: 'AUTO • TOMA PARA INCLINAR' },
  fr: { handheld: 'INCLINEZ POUR RINCER', auto: 'AUTO • PRENEZ POUR INCLINER' },
  ja: { handheld: '傾けてブクブク連動', auto: '自動 • 手に持つと傾き連動' },
  zh: { handheld: '倾斜手机实时鼓漱', auto: '自动 • 拿起手机可倾斜鼓漱' },
  ko: { handheld: '기울여서 라이브 가글', auto: '자동 • 폰을 들면 기울기 연동' },
  pt: { handheld: 'INCLINE PARA BOCHECHAR', auto: 'AUTO • PEGUE PARA INCLINAR' },
  de: { handheld: 'NEIGEN ZUM SPÜLEN', auto: 'AUTO • AUFNEHMEN ZUM NEIGEN' },
};

export const BrushCoachCopy = {
  mirrorSideLabels(lang: CoachLanguage): { left: string; right: string } {
    return MIRROR_SIDES[lang];
  },

  quadrantLabel(q: number, lang: CoachLanguage): string {
    return QUADRANT_LABELS[lang][clamp(q, 0, 3)];
  },

  surfaceActionBadge(s: number, lang: CoachLanguage): Badge {
    return SURFACE_BADGES[lang][clamp(s, 0, 2)];
  },

  flossHeadline(
    isUpper: boolean,
    style: FlossToolStyle,
    stepIndex: number,
    lang: CoachLanguage
  ): { archTitle: string; actionBadge: string } {
    if (lang === 'en') {
      const usePick = style === 'flossPick';
      const tool = usePick ? 'FLOSS PICK' : 'STRING FLOSS';
      const archTitle = `${tool} • ${isUpper ? 'TOP TEETH' : 'BOTTOM TEETH'}`;
      const actionBadge = !usePick
        ? 'HUG BOTH SIDES IN A C-CURVE'
        : stepIndex === 0
          ? "WIGGLE GENTLY IN (DON'T SNAP)"
          : stepIndex === 1
            ? 'LEAN RIGHT • HUG TOOTH WALL'
            : 'LEAN LEFT • HUG OTHER WALL';
      return { archTitle, actionBadge };
    }
    const row = FLOSS_HEADLINES[lang];
    return {
      archTitle: isUpper ? row.upper : row.lower,
      actionBadge: stepIndex === 0 ? row.glide : row.lean,
    };
  },

  hubStartBrushLabel(lang: CoachLanguage): string {
    return HUB_START_LABEL[lang];
  },

  actionButtonLabels(lang: CoachLanguage): { flossJump: string; doneFloss: string; skipFloss: string } {
    const w = BUTTON_WORDS[lang];
    return { flossJump: w.flossJump, doneFloss: `${w.done} (+75 F⁻)`, skipFloss: `${w.skip} (+50 F⁻)` };
  },

  mouthwashButtonLabels(
    didFloss: boolean,
    lang: CoachLanguage
  ): { rinseJump: string; doneRinse: string; skipRinse: string } {
    const w = BUTTON_WORDS[lang];
    const fullIons = didFloss ? 100 : 75;
    const skipIons = didFloss ? 75 : 50;
    return {
      rinseJump: w.rinseJump,
      doneRinse: `${w.done} (+${fullIons} F⁻)`,
      skipRinse: `${w.skip} (+${skipIons} F⁻)`,
    };
  },

  mouthwashHeadline(
    stepIndex: number,
    lang: CoachLanguage
  ): { archTitle: string; actionBadge: string; ruleTag: string } {
    const row = MOUTHWASH_HEADLINES[lang];
    const step = row.steps[clamp(stepIndex, 0, 2)];
    return { archTitle: row.title, actionBadge: step.actionBadge, ruleTag: step.ruleTag };
  },

  spokenBrushCue(quadrant: number, surface: number, lang: CoachLanguage): string {
    if (surface === BrushSurface.outerCheek) return SPOKEN_OUTER[lang][clamp(quadrant, 0, 3)];
    if (surface === BrushSurface.chewingGrooves) return SPOKEN_CHEWING[lang];
    return SPOKEN_INNER[lang];
  },

  spokenFlossStartCue(style: FlossToolStyle, lang: CoachLanguage): string {
    if (lang === 'en' && style !== 'flossPick') return SPOKEN_FLOSS_START_STRING_EN;
    return SPOKEN_FLOSS_START[lang];
  },

  spokenFlossLowerCue(lang: CoachLanguage): string {
    return SPOKEN_FLOSS_LOWER[lang];
  },

  spokenMouthwashStartCue(durationSec: number, lang: CoachLanguage): string {
    const row = SPOKEN_MOUTHWASH_START[lang];
    return durationSec >= 45 ? row.full : row.quick;
  },

  spokenMouthwashStepCue(stepIndex: number, lang: CoachLanguage): string {
    return stepIndex === 1 ? SPOKEN_MOUTHWASH_PUMP[lang] : SPOKEN_MOUTHWASH_FINAL[lang];
  },

  spokenSessionCompleteCue(includedMouthwash: boolean, lang: CoachLanguage): string {
    const row = SPOKEN_COMPLETE[lang];
    return includedMouthwash ? row.withRinse : row.plain;
  },

  gyroSwishStatusLabel(isHandheld: boolean, lang: CoachLanguage): string {
    const row = GYRO_STATUS[lang];
    return isHandheld ? row.handheld : row.auto;
  },
};

// ---------------------------------------------------------------- tilt slosh

export interface GyroSloshSnapshot {
  isHandheld: boolean;
  handheldBlend01: number;
  /** -1 = left cheek, +1 = right cheek. */
  sloshPosition: number;
  sloshVelocity: number;
  pumpPulse01: number;
  leftCheekCharge01: number;
  rightCheekCharge01: number;
  swishCount: number;
  parallaxX: number;
  parallaxY: number;
  didTriggerSplash: boolean;
  splashPan: number;
  splashIntensity01: number;
}

export const GYRO_SLOSH_IDLE: Readonly<GyroSloshSnapshot> = Object.freeze({
  isHandheld: false,
  handheldBlend01: 0,
  sloshPosition: 0,
  sloshVelocity: 0,
  pumpPulse01: 0,
  leftCheekCharge01: 0,
  rightCheekCharge01: 0,
  swishCount: 0,
  parallaxX: 0,
  parallaxY: 0,
  didTriggerSplash: false,
  splashPan: 0,
  splashIntensity01: 0,
});

export interface GyroSloshInput {
  dt: number;
  gravityX: number;
  gravityY: number;
  rotationRateMag: number;
  userAccelX: number;
  userAccelY: number;
  sensorAvailable: boolean;
  reducedMotion: boolean;
}

/**
 * Deterministic counter-vs-handheld classifier plus a spring-damper rinse slosh.
 * Stays idle while the device rests untouched and wakes when it is picked up and tilted.
 */
export class GyroSloshSim {
  private isHandheld = false;
  private handheldBlend01 = 0;
  private sloshPosition = 0;
  private sloshVelocity = 0;
  private pumpPulse01 = 0;
  private leftCheekCharge01 = 0;
  private rightCheekCharge01 = 0;
  private swishCount = 0;
  private parallaxX = 0;
  private parallaxY = 0;

  private hasSeededReference = false;
  private refGravityX = 0;
  private refGravityY = -0.7;
  private prevGravityX = 0;
  private prevGravityY = -0.7;
  private lastSplashSide = 0;
  private splashCooldownSec = 0;

  resetMouthwashSession(): void {
    this.sloshPosition = 0;
    this.sloshVelocity = 0;
    this.pumpPulse01 = 0;
    this.leftCheekCharge01 = 0;
    this.rightCheekCharge01 = 0;
    this.swishCount = 0;
    this.lastSplashSide = 0;
    this.splashCooldownSec = 0;
  }

  step(input: GyroSloshInput): GyroSloshSnapshot {
    const { gravityX, gravityY, rotationRateMag, userAccelX, userAccelY } = input;
    if (!input.sensorAvailable || input.reducedMotion) {
      this.isHandheld = false;
      this.handheldBlend01 = 0;
      this.sloshPosition = 0;
      this.sloshVelocity = 0;
      this.pumpPulse01 = 0;
      this.parallaxX = 0;
      this.parallaxY = 0;
      return {
        ...GYRO_SLOSH_IDLE,
        leftCheekCharge01: this.leftCheekCharge01,
        rightCheekCharge01: this.rightCheekCharge01,
        swishCount: this.swishCount,
      };
    }

    const dt = clamp(input.dt, 0.001, 0.05);
    this.splashCooldownSec = Math.max(0, this.splashCooldownSec - dt);

    if (!this.hasSeededReference) {
      this.hasSeededReference = true;
      this.refGravityX = gravityX;
      this.refGravityY = gravityY;
      this.prevGravityX = gravityX;
      this.prevGravityY = gravityY;
    }

    // 1. Resting on a counter (dead still) vs. held in a hand (tremor + tilt).
    const gravDelta = Math.hypot(gravityX - this.prevGravityX, gravityY - this.prevGravityY) / dt;
    this.prevGravityX = gravityX;
    this.prevGravityY = gravityY;

    const accelMag = Math.hypot(userAccelX, userAccelY);
    const activeSignal = rotationRateMag + gravDelta * 0.75 + accelMag * 2.2;
    const instantActivity = activeSignal > 0.11 ? Math.min(1, (activeSignal - 0.04) * 2.4) : 0;
    if (instantActivity > this.handheldBlend01) {
      this.handheldBlend01 += (instantActivity - this.handheldBlend01) * (1 - Math.exp(-9.5 * dt));
    } else {
      // Hold handheld mode through brief pauses so a steady tilt still counts.
      const holdBias = Math.abs(gravityX) > 0.16 ? 0.45 : 0;
      const target = Math.max(instantActivity, this.isHandheld ? holdBias : 0);
      this.handheldBlend01 += (target - this.handheldBlend01) * (1 - Math.exp(-0.75 * dt));
    }

    if (!this.isHandheld && this.handheldBlend01 >= 0.36) {
      this.isHandheld = true;
    } else if (this.isHandheld && this.handheldBlend01 <= 0.15) {
      this.isHandheld = false;
    }

    // 2. Drift-free relative tilt around the natural grip angle.
    const refFollow = 1 - Math.exp(-0.42 * dt);
    this.refGravityX += (gravityX - this.refGravityX) * refFollow;
    this.refGravityY += (gravityY - this.refGravityY) * refFollow;
    const rawPx = clamp((gravityX - this.refGravityX) * 3.8, -1, 1);
    const rawPy = clamp((gravityY - this.refGravityY) * 3.8, -1, 1);
    const smoothP = 1 - Math.exp(-14.0 * dt);
    this.parallaxX += (rawPx * this.handheldBlend01 - this.parallaxX) * smoothP;
    this.parallaxY += (rawPy * this.handheldBlend01 - this.parallaxY) * smoothP;

    // 3. Spring-damper slosh between the cheeks.
    const prevPos = this.sloshPosition;
    const targetSlosh = clamp(gravityX * 2.25 + userAccelX * 0.9, -1, 1);
    const accel = (targetSlosh - this.sloshPosition) * 28.0 - this.sloshVelocity * 4.4;
    this.sloshVelocity += accel * dt;
    this.sloshPosition = clamp(this.sloshPosition + this.sloshVelocity * dt, -1, 1);

    const pumpDrive = Math.min(1, Math.abs(rawPy) * 0.85 + accelMag * 1.45);
    const pumpRate = pumpDrive > this.pumpPulse01 ? 12.0 : 3.6;
    this.pumpPulse01 += (pumpDrive * this.handheldBlend01 - this.pumpPulse01) * (1 - Math.exp(-pumpRate * dt));

    let didSplash = false;
    let splashPan = 0;
    let splashIntensity = 0;
    const speed = Math.abs(this.sloshVelocity);

    if (this.isHandheld) {
      if (this.sloshPosition <= -0.34) {
        this.leftCheekCharge01 = Math.min(1, this.leftCheekCharge01 + dt * 0.42);
        if (this.lastSplashSide !== -1 && this.splashCooldownSec <= 0 && speed > 0.32) {
          this.lastSplashSide = -1;
          this.swishCount += 1;
          this.splashCooldownSec = 0.28;
          didSplash = true;
          splashPan = -0.62;
          splashIntensity = Math.min(1, 0.42 + speed * 0.25);
        }
      } else if (this.sloshPosition >= 0.34) {
        this.rightCheekCharge01 = Math.min(1, this.rightCheekCharge01 + dt * 0.42);
        if (this.lastSplashSide !== 1 && this.splashCooldownSec <= 0 && speed > 0.32) {
          this.lastSplashSide = 1;
          this.swishCount += 1;
          this.splashCooldownSec = 0.28;
          didSplash = true;
          splashPan = 0.62;
          splashIntensity = Math.min(1, 0.42 + speed * 0.25);
        }
      } else if ((prevPos < 0 && this.sloshPosition >= 0) || (prevPos > 0 && this.sloshPosition <= 0)) {
        if (this.splashCooldownSec <= 0 && speed > 0.85) {
          this.splashCooldownSec = 0.26;
          didSplash = true;
          splashPan = this.sloshVelocity > 0 ? 0.3 : -0.3;
          splashIntensity = Math.min(1, 0.35 + speed * 0.22);
        }
      }
    }

    return {
      isHandheld: this.isHandheld,
      handheldBlend01: this.handheldBlend01,
      sloshPosition: this.sloshPosition,
      sloshVelocity: this.sloshVelocity,
      pumpPulse01: this.pumpPulse01,
      leftCheekCharge01: this.leftCheekCharge01,
      rightCheekCharge01: this.rightCheekCharge01,
      swishCount: this.swishCount,
      parallaxX: this.parallaxX,
      parallaxY: this.parallaxY,
      didTriggerSplash: didSplash,
      splashPan,
      splashIntensity01: splashIntensity,
    };
  }
}
