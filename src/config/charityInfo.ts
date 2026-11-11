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

export interface SmileOnUCharityInfo {
  name: string;
  tagline: string;
  legalStatus: string;
  missionSummary: string;
  websiteUrl: string;
  donateUrl: string;
  contactEmail: string;
  contactMailto: string;
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
    'SmileOnU expands access to free, life-changing dental care, pain relief, oral health education, and reconstructive treatment for underserved children, adults, and communities across the United States and around the world — improving lives one smile at a time.',
  websiteUrl: 'https://smileonu.org/',
  donateUrl: 'https://smileonu.org/donate/',
  contactEmail: 'info@smileonu.org',
  contactMailto: 'mailto:info@smileonu.org',
  needHighlights: [
    {
      stat: '#1 Worldwide',
      detail: 'Tooth decay remains the #1 noncontagious disease globally',
    },
    {
      stat: '1 in 5 Kids',
      detail: 'Children suffering from untreated cavities and dental pain',
    },
    {
      stat: '46% of Adults',
      detail: 'Adults showing clinical signs of gum disease',
    },
  ],
  programs: [
    {
      id: 'new_smile',
      emoji: '✨',
      title: 'New Smile Program',
      regionLabel: 'U.S. Hardship Care',
      summary:
        'Provides free, comprehensive dental treatment to individuals whose oral health has been affected by hardship as they pursue education, employment, and a confident new chapter.',
      url: 'https://smileonu.org/new-smile-program/',
    },
    {
      id: 'mobile_outreach',
      emoji: '🚐',
      title: 'Mobile Dental Outreach',
      regionLabel: 'Los Angeles • Orange County • San Diego',
      summary:
        'Mobilizes volunteer dental providers to deliver oral health education, cleanings, fillings, and pain-relieving extractions in communities with little or no access to care.',
      url: 'https://smileonu.org/mobile-dental-outreach/',
    },
    {
      id: 'international_clinics',
      emoji: '🌎',
      title: 'International Dental Clinics',
      regionLabel: 'Global Relief & Baja, Mexico Orphanage Camps',
      summary:
        'Travels to underserved communities and children’s orphanages to provide screenings, preventive education, cleanings, restorative fillings, extractions, and surgical care.',
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
    'MouthLife is a free, independent dental arcade & brushing companion. If you enjoyed the game, please consider supporting real-world charitable dental relief directly at SmileOnU.org.',
};
