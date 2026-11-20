/**
 * Verified public information and links for SmileOnU (https://smileonu.org/),
 * a U.S. 501(c)(3) humanitarian dental relief nonprofit.
 *
 * MouthLife includes this optional, non-intrusive directory so players who enjoy
 * the game can learn about and support real-world charitable dental care.
 */

export interface CharityProgramInfo {
  id: string;
  emoji: string;
  title: string;
  regionLabel: string;
  summary: string;
  url: string;
}

export interface CharityLinkItem {
  id: string;
  label: string;
  url: string;
}

export interface CharityNeedStat {
  stat: string;
  detail: string;
}

/**
 * A further free-dental-care charity shown under SmileOnU in the charity sheet.
 * To add one: verify every fact and link on the charity's own website, then add an entry to
 * MORE_DENTAL_CHARITIES here and to `CharityInfo.moreCharities` in the native app's CharityInfo.swift.
 */
export interface PartnerCharityInfo {
  id: string;
  emoji: string;
  name: string;
  legalStatus: string;
  summary: string;
  websiteUrl: string;
  donateUrl: string;
  links: readonly CharityLinkItem[];
}

export interface SmileOnUCharityInfo {
  name: string;
  tagline: string;
  legalStatus: string;
  missionSummary: string;
  websiteUrl: string;
  donateUrl: string;
  needHighlights: readonly CharityNeedStat[];
  programs: readonly CharityProgramInfo[];
  involvementLinks: readonly CharityLinkItem[];
  socialLinks: readonly CharityLinkItem[];
  independenceNote: string;
}

export const SMILE_ON_U_CHARITY: SmileOnUCharityInfo = {
  name: 'SmileOnU',
  tagline: 'Sm:)e Forward • Universal Dental Relief Organization',
  legalStatus: 'U.S. 501(c)(3) Public Charity • Founded 2012 by BB Maboby',
  missionSummary:
    'SmileOnU gives free dental care to children, adults and communities who cannot get it. They work in the United States and around the world, one smile at a time.',
  websiteUrl: 'https://smileonu.org/',
  donateUrl: 'https://smileonu.org/donate/',
  needHighlights: [
    {
      stat: '#1 Worldwide',
      detail: 'Tooth decay is the world’s most common disease you can’t catch',
    },
    {
      stat: '1 in 5 Kids',
      detail: 'Children living with cavities and tooth pain',
    },
    {
      stat: '46% of Adults',
      detail: 'Adults who show signs of gum disease',
    },
  ],
  programs: [
    {
      id: 'new_smile',
      emoji: '✨',
      title: 'New Smile Program',
      regionLabel: 'U.S. Hardship Care',
      summary:
        'Gives free, full dental care to people going through hard times, so they can go to school, find work and smile again.',
      url: 'https://smileonu.org/new-smile-program/',
    },
    {
      id: 'mobile_outreach',
      emoji: '🚐',
      title: 'Mobile Dental Outreach',
      regionLabel: 'Los Angeles • Orange County • San Diego',
      summary:
        'Volunteer dentists bring lessons, cleanings, fillings and pain relief to places with little or no dental care.',
      url: 'https://smileonu.org/mobile-dental-outreach/',
    },
    {
      id: 'international_clinics',
      emoji: '🌎',
      title: 'International Dental Clinics',
      regionLabel: 'World Relief & Baja, Mexico Children’s Homes',
      summary:
        'Teams travel to children’s homes and places with little care. They give check-ups, lessons, cleanings, fillings and surgery.',
      url: 'https://smileonu.org/international-dental-clinics/',
    },
  ],
  involvementLinks: [
    {
      id: 'volunteer',
      label: '🤝 Volunteer on a Clinic',
      url: 'https://smileonu.org/volunteer-application/',
    },
    {
      id: 'dentist_partner',
      label: '🦷 Become a Partner Dentist',
      url: 'https://smileonu.org/become-a-smileonu-dentist/',
    },
    {
      id: 'founder',
      label: '💛 Founder’s Message',
      url: 'https://smileonu.org/message-from-the-founder/',
    },
    {
      id: 'board',
      label: '🏛️ Board of Directors',
      url: 'https://smileonu.org/board-of-directors/',
    },
    {
      id: 'events',
      label: '📅 Clinics & CEUs for Charity',
      url: 'https://smileonu.org/upcoming-events/',
    },
  ],
  socialLinks: [
    {
      id: 'facebook',
      label: 'Facebook',
      url: 'https://www.facebook.com/SmileOnU',
    },
    {
      id: 'youtube',
      label: 'YouTube',
      url: 'https://www.youtube.com/channel/UC_rgCZ076xzvGbbLBX705Ew',
    },
    {
      id: 'twitter',
      label: 'X (@SmileOnU_)',
      url: 'https://twitter.com/SmileOnU_',
    },
  ],
  independenceNote:
    'MouthLife is a free game and brushing timer. If you liked it, you can help real people get dental care at SmileOnU.org.',
};

/** Facts and links checked against ramusa.org and adcf.net (November 2026). */
export const MORE_DENTAL_CHARITIES: readonly PartnerCharityInfo[] = [
  {
    id: 'remote_area_medical',
    emoji: '⛺',
    name: 'Remote Area Medical (RAM)',
    legalStatus: 'U.S. 501(c)(3) Nonprofit • Since 1985',
    summary:
      'RAM runs free pop-up clinics across the United States. Volunteers give dental cleanings, fillings, extractions and X-rays, along with free vision and medical care. No insurance is needed.',
    websiteUrl: 'https://www.ramusa.org/',
    donateUrl: 'https://www.ramusa.org/donate/',
    links: [
      {
        id: 'ram_schedule',
        label: '📅 Find a Free Clinic',
        url: 'https://www.ramusa.org/schedule/',
      },
      {
        id: 'ram_volunteer',
        label: '🤝 Volunteer at a Clinic',
        url: 'https://www.ramusa.org/volunteer/',
      },
    ],
  },
  {
    id: 'mission_of_mercy_adcf',
    emoji: '🦷',
    name: 'Mission of Mercy Dental Clinics (ADCF)',
    legalStatus: 'U.S. 501(c)(3) Nonprofit • Since 2008',
    summary:
      'America’s Dentists Care Foundation supplies the equipment for Mission of Mercy clinics: free two-day dental events run by volunteers. Since 2008, the clinics it supports have treated over 375,000 patients in 31 states.',
    websiteUrl: 'https://adcf.net/',
    donateUrl: 'https://adcf.net/donate/',
    links: [
      {
        id: 'adcf_schedule',
        label: '📅 Find a Free Clinic',
        url: 'https://adcf.net/clinic-schedule/',
      },
    ],
  },
];

export const MORE_CHARITIES_NOTE =
  'Each link opens the charity’s own website. MouthLife takes no fee and never handles donations.';

/** Shown in the charity sheet: none of the listed charities has endorsed or reviewed MouthLife. */
export const NOT_ENDORSED_NOTE =
  'MouthLife is an independent app. It is not affiliated with, sponsored by or endorsed by any of the charities listed here.';
