import type { HistoricalFieldNote, HostCityDef } from '../engine/types';

/**
 * Inclusive Fitzpatrick I–VI realistic human skin tone palette with warm/cool/neutral undertones.
 */
export const REALISTIC_SKIN_TONES: readonly { label: string; hex: string }[] = [
  { label: 'Porcelain Ivory', hex: '#F6DDD0' },
  { label: 'Warm Alabaster', hex: '#ECC3A8' },
  { label: 'Golden Sand', hex: '#DFA982' },
  { label: 'Olive Honey', hex: '#C98E63' },
  { label: 'Warm Sienna', hex: '#A96B44' },
  { label: 'Rich Amber Umber', hex: '#844D2E' },
  { label: 'Deep Espresso', hex: '#5D331E' },
  { label: 'Obsidian Mahogany', hex: '#3B1F14' },
];

export const HISTORICAL_FIELD_NOTES: readonly HistoricalFieldNote[] = [
  {
    id: 'cosmic_hydroxyapatite',
    yearLabel: '13.8B Yrs Ago → Today',
    locationLabel: 'Stellar Nucleosynthesis & Human Ameloblasts',
    title: 'Stardust Harder Than Steel: Hydroxyapatite (Mohs 5.0)',
    scientistOrCulture: 'Astrophysics & Enamel Crystallography',
    summary:
      'Every calcium (²⁰Ca) and phosphorus (¹⁵P) atom in your teeth was forged in dying stars and supernovae. Ameloblast cells weave them into Ca₁₀(PO₄)₆(OH)₂ nanorods — 96% pure crystal, ranking 5.0 on the Mohs scale (harder than iron and steel at 4.0, halfway toward quartz 7.0 and diamond 10.0).',
    enamelLesson:
      'Mechanical hardness cannot stop chemical dissolution: below pH 5.5, bacterial acid strips ions out of hydroxyapatite unless fluoride (⁹F) locks in to form fluorapatite (stable down to pH 4.5).',
  },
  {
    id: '1498_beijing_1683_delft',
    yearLabel: '1498 Beijing & 1683 Delft',
    locationLabel: 'Ming Dynasty China & Delft, Netherlands',
    title: 'The First Bristle Brush & Leeuwenhoek’s Living “Animalcules”',
    scientistOrCulture: 'Ming Innovators & Antonie van Leeuwenhoek',
    summary:
      'In 1498 in China, craftsmen set coarse hog bristles perpendicular to a bone handle — creating the ancestor of the modern toothbrush. In 1683 in Delft, Antonie van Leeuwenhoek scraped plaque from between his own teeth under a handcrafted single-lens microscope, marveling at millions of swimming “animalcules” — and noticed rinsing with vinegar could not kill microbes sheltered inside thick plaque!',
    enamelLesson:
      'Leeuwenhoek observed the fundamental law of oral biofilms in 1683: liquid rinses alone cannot penetrate intact plaque — mechanical shear must disrupt it first.',
  },
  {
    id: '1819_1948_new_orleans',
    yearLabel: '1819 & 1948 New Orleans',
    locationLabel: 'New Orleans, Louisiana, USA',
    title: 'Silk Filament & The 45° Tulane Sulcus Revolution',
    scientistOrCulture: 'Levi Spear Parmly & Dr. Charles C. Bass',
    summary:
      'Practicing in New Orleans in 1819, dentist Levi Spear Parmly championed waxed silk floss to clean proximal tooth contacts where no brush could fit. Over a century later in the same city, Dr. Charles Cassidy Bass at Tulane University studied microscopic gum crevices and formulated the gentle 45° soft-bristle sulcus method still taught worldwide.',
    enamelLesson:
      'Rough scrubbing injures delicate gingiva while missing interdental contacts; gentle angled bristle strokes plus C-curved filament passes protect both tooth and gum.',
  },
  {
    id: '1940_chicago_stephan',
    yearLabel: '1940 Chicago',
    locationLabel: 'University of Illinois, Chicago & Global Cities',
    title: 'Plotting the Invisible Acid Clock: The Stephan Curve',
    scientistOrCulture: 'Dr. Robert M. Stephan',
    summary:
      'In 1940 in Chicago, Dr. Robert Stephan touched micro-antimony pH electrodes directly onto human dental plaque. Within 3 minutes of a sugar rinse, plaque pH plunged from ~7.0 below the critical 5.5 demineralization line and took 20–40 minutes of salivary flow to recover.',
    enamelLesson:
      'Five small sugary sips spaced across an afternoon bathe enamel in acid far longer than enjoying one dessert with dinner.',
  },
  {
    id: '1901_colorado_accra_miswak',
    yearLabel: 'Ancient Miswak & 1901–1945 Fluoride Mystery',
    locationLabel: 'Accra / West Africa & Colorado Springs → Grand Rapids',
    title: 'Botanical Minerals & The Fluorapatite Detective Story',
    scientistOrCulture: 'West African Miswak Tradition & Drs. McKay, Churchill & Dean',
    summary:
      'For millennia across Africa, the Middle East, and South Asia, chewing sticks from Salvadora persica (Miswak) naturally stimulated protective salivary bicarbonate while releasing silica and mineral ions. In 1901–1945, Frederick McKay, H.V. Churchill, and H. Trendley Dean solved the “Colorado Stain” mystery — proving trace waterborne fluoride (1 ppm) rebuilds enamel into acid-defying fluorapatite.',
    enamelLesson:
      'Saliva buffers acid back above pH 5.5 while fluoride ions replace hydroxyl groups in enamel crystal lattices to resist future acid challenges.',
  },
  {
    id: '1973_skylab_orbit',
    yearLabel: '1973 Skylab & 1978 Biofilm Theory',
    locationLabel: 'Houston Johnson Space Center & Low-Earth Orbit (408 km)',
    title: 'Zero-Gravity Mouths & Quorum-Sensing Fortresses',
    scientistOrCulture: 'NASA Skylab Oral Microbiology Team & J.W. Costerton',
    summary:
      'During NASA’s 1973 Skylab orbital missions, researchers tracked how microgravity and closed-habitat diets increased anaerobic and cariogenic oral flora when astronauts could not spit into a sink. Five years later (1978), J.W. Costerton coined the modern science of structured “biofilms” — cooperative microbial cities encased in sticky EPS polymers.',
    enamelLesson:
      'Mature quorum biofilms act like coordinated shields; keeping teeth clean daily in Earth bathrooms — or aboard orbital stations — stops isolated pellicle from maturing into a fortress.',
  },
];

export const HOST_CITIES: readonly HostCityDef[] = [
  {
    id: 'toronto',
    worldId: 'world_1',
    city: 'Toronto',
    country: 'Canada',
    lat: 43.65,
    lon: -79.38,
    hostName: 'Maya Lin-Okafor',
    hostRole: 'Civic Wood & Glass Architect',
    hostSkinToneHex: '#844D2E',
    hostAccentHex: '#38bdf8',
    unlockStampsRequired: 0,
    playableInSlice: true,
    scenarioSummary:
      'Overnight reduced salivary flow lets morning pellicle, premolar interdental bridges, and first-molar fissure colonies settle in before Maya’s morning commute.',
    historyNoteId: '1498_beijing_1683_delft',
    signatureTreat: {
      id: 'treat_toronto_espresso',
      name: 'Maple Oat Cortado & Croissant',
      city: 'Toronto',
      emoji: '☕',
      phDropNote: 'Warm sticky pastry starches lodge in molar fissures while maple sucrose feeds S. mutans.',
    },
  },
  {
    id: 'new_orleans',
    worldId: 'world_2',
    city: 'New Orleans',
    country: 'United States',
    lat: 29.95,
    lon: -90.07,
    hostName: 'Marcus & Celine Beaumont',
    hostRole: 'Brass & Acoustic Luthiers',
    hostSkinToneHex: '#5D331E',
    hostAccentHex: '#fb7185',
    unlockStampsRequired: 4,
    playableInSlice: true,
    scenarioSummary:
      'Late brass-shop rehearsals and rushed heavy-handed brushing leave delicate gingival sulcus pockets tender while missing tight interdental contacts.',
    historyNoteId: '1819_1948_new_orleans',
    signatureTreat: {
      id: 'treat_nola_beignet',
      name: 'Powdered Café Beignet',
      city: 'New Orleans',
      emoji: '🍩',
      phDropNote: 'Fine powdered sucrose dissolves rapidly into narrow gingival margins and interproximal valleys.',
    },
  },
  {
    id: 'tokyo',
    worldId: 'world_3',
    city: 'Tokyo & Chicago',
    country: 'Japan / USA',
    lat: 35.66,
    lon: 139.70,
    hostName: 'Kenji Sato',
    hostRole: 'Acoustic Synth Engineer',
    hostSkinToneHex: '#DFA982',
    hostAccentHex: '#c084fc',
    unlockStampsRequired: 8,
    playableInSlice: true,
    scenarioSummary:
      'Sipping sweet craft soda every 20 minutes during late-night studio mixing repeatedly restarts the 1940 Stephan Curve acid clock.',
    historyNoteId: '1940_chicago_stephan',
    signatureTreat: {
      id: 'treat_tokyo_melon',
      name: 'Craft Yuzu-Melon Fizz',
      city: 'Tokyo',
      emoji: '🍈',
      phDropNote: 'Repeated sweet carbonated sips hold plaque pH below 5.5 across back-to-back 20-minute windows.',
    },
  },
  {
    id: 'accra',
    worldId: 'world_4',
    city: 'Accra & Colorado Springs',
    country: 'Ghana / USA',
    lat: 5.60,
    lon: -0.19,
    hostName: 'Dr. Amara Mensah',
    hostRole: 'Coastal Marathon Physiologist',
    hostSkinToneHex: '#3B1F14',
    hostAccentHex: '#fbbf24',
    unlockStampsRequired: 14,
    playableInSlice: false,
    scenarioSummary:
      'Tart hibiscus-citrus hydration on long humid runs lowers surface pH while dehydration slows salivary bicarbonate buffering.',
    historyNoteId: '1901_colorado_accra_miswak',
    signatureTreat: {
      id: 'treat_accra_sobolo',
      name: 'Chilled Spiced Hibiscus Sobolo',
      city: 'Accra',
      emoji: '🌺',
      phDropNote: 'Tangy organic hibiscus acids temporarily soften outer enamel prisms until saliva buffers pH back up.',
    },
  },
  {
    id: 'orbit_aurora',
    worldId: 'world_5',
    city: 'Station Aurora (408 km LEO)',
    country: 'Low-Earth Orbit / Houston Link',
    lat: 29.55,
    lon: -95.09,
    isOrbital: true,
    hostName: 'Specialist Tariq Al-Mansoor',
    hostRole: 'Orbital Micro-Ecology Mission Specialist',
    hostSkinToneHex: '#C98E63',
    hostAccentHex: '#34d399',
    unlockStampsRequired: 20,
    playableInSlice: false,
    scenarioSummary:
      'In zero gravity with no bathroom sink to spit into, a cooperative quorum-sensing EPS biofilm dome attempts to colonize a molar arch.',
    historyNoteId: '1973_skylab_orbit',
    signatureTreat: {
      id: 'treat_orbit_berry',
      name: 'Zero-G Freeze-Dried Berry Bar',
      city: 'Station Aurora',
      emoji: '🚀',
      phDropNote: 'Dehydrated fruit sugars cling tenaciously to occlusal cusps in low-shear microgravity saliva.',
    },
  },
];

export const HOST_CITY_IDS = new Set(HOST_CITIES.map((h) => h.id));
export const HISTORY_NOTE_IDS = new Set(HISTORICAL_FIELD_NOTES.map((n) => n.id));

export function getHostCityById(id: string): HostCityDef {
  return HOST_CITIES.find((h) => h.id === id) ?? HOST_CITIES[0];
}

export function getHistoryNoteById(id: string): HistoricalFieldNote | undefined {
  return HISTORICAL_FIELD_NOTES.find((n) => n.id === id);
}
