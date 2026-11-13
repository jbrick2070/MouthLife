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
    yearLabel: 'Billions of Yrs Ago → Today',
    locationLabel: 'Exploding Stars & Enamel-Building Cells',
    title: 'Stardust Harder Than Iron: Tooth Enamel',
    scientistOrCulture: 'Star Science & Enamel Crystals',
    summary:
      'The calcium in your teeth was made inside dying stars long ago. Special cells packed it into tiny crystal rods. Enamel is harder than iron, but quartz and diamond can still scratch it.',
    enamelLesson:
      'Being hard does not stop acid. Germ acid pulls minerals out of enamel. Fluoride locks in and makes enamel much harder for acid to melt.',
  },
  {
    id: '1498_beijing_1683_delft',
    yearLabel: '1498 Beijing & 1683 Delft',
    locationLabel: 'Ming Dynasty China & Delft, Netherlands',
    title: 'The First Bristle Brush & the First Germs Ever Seen',
    scientistOrCulture: 'Ming Innovators & Antonie van Leeuwenhoek',
    summary:
      'In 1498 in China, people set stiff hog hairs into a bone handle. It was the first bristle toothbrush. In 1683 in Delft, Antonie van Leeuwenhoek looked at plaque from his own teeth with a microscope he made. He saw millions of tiny swimming germs. Vinegar could not kill the germs hiding deep in thick plaque!',
    enamelLesson:
      'Leeuwenhoek found a rule that is still true: a rinse alone can’t get through thick plaque. You have to brush it off first.',
  },
  {
    id: '1819_1948_new_orleans',
    yearLabel: '1819 & 1948 New Orleans',
    locationLabel: 'New Orleans, Louisiana, USA',
    title: 'Silk Floss & the 45° Gumline Brush',
    scientistOrCulture: 'Levi Spear Parmly & Dr. Charles C. Bass',
    summary:
      'In 1819 in New Orleans, dentist Levi Spear Parmly told people to use waxed silk floss to clean between teeth, where no brush fits. More than 100 years later in the same city, Dr. Charles Bass studied the tiny gap where gums meet teeth. He taught the gentle 45° soft-brush method used all over the world today.',
    enamelLesson:
      'Hard scrubbing hurts gums and still misses the gaps between teeth. Gentle tilted brushing plus C-shape flossing protects both teeth and gums.',
  },
  {
    id: '1940_chicago_stephan',
    yearLabel: '1940 Chicago',
    locationLabel: 'University of Illinois, Chicago & Global Cities',
    title: 'Timing the Hidden Acid Clock',
    scientistOrCulture: 'Dr. Robert M. Stephan',
    summary:
      'In 1940 in Chicago, Dr. Robert Stephan put tiny sensors right on people’s plaque. Within 3 minutes of a sugar rinse, the plaque turned acid enough to harm enamel. It took 20 to 40 minutes for spit to wash the acid away.',
    enamelLesson:
      'Five small sugary sips across an afternoon keep acid on your teeth far longer than one dessert with dinner.',
  },
  {
    id: '1901_colorado_accra_miswak',
    yearLabel: 'Chewing Sticks & the Fluoride Mystery (1901–1945)',
    locationLabel: 'Accra / West Africa & Colorado Springs → Grand Rapids',
    title: 'Plant Minerals & the Fluoride Detective Story',
    scientistOrCulture: 'Miswak Chewing-Stick Tradition & Drs. McKay, Churchill & Dean',
    summary:
      'For thousands of years, people in Africa, the Middle East and South Asia have cleaned their teeth with chewing sticks called miswak. Chewing makes more spit, which protects teeth. From 1901 to 1945, three scientists solved the “Colorado Stain” mystery. Too much fluoride in drinking water stained teeth. But a tiny amount meant far fewer cavities. Later, scientists learned why: fluoride helps enamel rebuild stronger.',
    enamelLesson:
      'Spit washes acid away. Fluoride slips into the enamel crystals and helps them stand up to the next acid attack.',
  },
  {
    id: '1973_skylab_orbit',
    yearLabel: '1973 Skylab & 1978 Germ-Slime Science',
    locationLabel: 'Houston Johnson Space Center & Low-Earth Orbit (Skylab, ~435 km)',
    title: 'Teeth in Space & Germ Slime Forts',
    scientistOrCulture: 'NASA Skylab Mouth Germ Team & J.W. Costerton',
    summary:
      'On NASA’s 1973 Skylab flights, scientists saw that cavity germs grew faster in space, where astronauts had no sink to spit in. In 1978, J.W. Costerton named these sticky germ cities “biofilms”. The germs work together inside a slimy shield.',
    enamelLesson:
      'Old plaque works like a team shield. Cleaning your teeth every day, on Earth or in space, stops a thin film of germs from growing into a fort.',
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
    hostRole: 'City Architect',
    hostSkinToneHex: '#844D2E',
    hostAccentHex: '#38bdf8',
    unlockStampsRequired: 0,
    playableInSlice: true,
    scenarioSummary:
      'At night your mouth makes less spit. So a thin film, sticky bits between teeth and germs in the molar grooves settle in before Maya’s morning trip to work.',
    historyNoteId: '1498_beijing_1683_delft',
    signatureTreat: {
      id: 'treat_toronto_espresso',
      name: 'Maple Oat Cortado & Croissant',
      city: 'Toronto',
      emoji: '☕',
      phDropNote: 'Sticky pastry bits get stuck in molar grooves, and maple sugar feeds cavity germs.',
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
    hostRole: 'Brass Instrument Makers',
    hostSkinToneHex: '#5D331E',
    hostAccentHex: '#fb7185',
    unlockStampsRequired: 4,
    playableInSlice: true,
    scenarioSummary:
      'Late band practice and fast, hard brushing leave the gumline sore and miss the tight gaps between teeth.',
    historyNoteId: '1819_1948_new_orleans',
    signatureTreat: {
      id: 'treat_nola_beignet',
      name: 'Powdered Café Beignet',
      city: 'New Orleans',
      emoji: '🍩',
      phDropNote: 'Fine powdered sugar melts fast into the gumline and the gaps between teeth.',
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
    hostRole: 'Sound Engineer',
    hostSkinToneHex: '#DFA982',
    hostAccentHex: '#c084fc',
    unlockStampsRequired: 8,
    playableInSlice: true,
    scenarioSummary:
      'Sipping sweet soda every 20 minutes during late-night music mixing starts the acid clock again and again.',
    historyNoteId: '1940_chicago_stephan',
    signatureTreat: {
      id: 'treat_tokyo_melon',
      name: 'Craft Yuzu-Melon Fizz',
      city: 'Tokyo',
      emoji: '🍈',
      phDropNote: 'Sweet fizzy sips, one after another, keep acid on the teeth for 20 minutes each time.',
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
    hostRole: 'Marathon Scientist',
    hostSkinToneHex: '#3B1F14',
    hostAccentHex: '#fbbf24',
    unlockStampsRequired: 14,
    playableInSlice: true,
    scenarioSummary:
      'Tart hibiscus drinks on long, hot runs make teeth acid. Being thirsty means less spit to wash the acid away.',
    historyNoteId: '1901_colorado_accra_miswak',
    signatureTreat: {
      id: 'treat_accra_sobolo',
      name: 'Chilled Spiced Hibiscus Sobolo',
      city: 'Accra',
      emoji: '🌺',
      phDropNote: 'Tangy hibiscus acid softens the outer enamel for a while, until spit washes it away.',
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
    hostRole: 'Space Station Scientist',
    hostSkinToneHex: '#C98E63',
    hostAccentHex: '#34d399',
    unlockStampsRequired: 20,
    playableInSlice: true,
    scenarioSummary:
      'In space there is no sink to spit in. A sticky germ slime dome is trying to take over the molars.',
    historyNoteId: '1973_skylab_orbit',
    signatureTreat: {
      id: 'treat_orbit_berry',
      name: 'Zero-G Freeze-Dried Berry Bar',
      city: 'Station Aurora',
      emoji: '🚀',
      phDropNote: 'Dried fruit sugar sticks hard to the chewing tops of teeth in space.',
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
