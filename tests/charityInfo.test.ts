import { describe, expect, it } from 'vitest';
import { MORE_CHARITIES_NOTE, MORE_DENTAL_CHARITIES, SMILE_ON_U_CHARITY } from '../src/config/charityInfo';

describe('SmileOnU humanitarian dental charity config', () => {
  it('exposes verified HTTPS donate, website, and mailto contact endpoints', () => {
    expect(SMILE_ON_U_CHARITY.name).toBe('SmileOnU');
    expect(SMILE_ON_U_CHARITY.legalStatus).toContain('501(c)(3)');
    expect(SMILE_ON_U_CHARITY.websiteUrl).toBe('https://smileonu.org/');
    expect(SMILE_ON_U_CHARITY.donateUrl).toBe('https://smileonu.org/donate/');
    expect(SMILE_ON_U_CHARITY.contactEmail).toBe('info@smileonu.org');
    expect(SMILE_ON_U_CHARITY.contactMailto).toBe('mailto:info@smileonu.org');
  });

  it('lists all three core SmileOnU programs with unique https://smileonu.org/ URLs', () => {
    expect(SMILE_ON_U_CHARITY.programs).toHaveLength(3);
    const urls = new Set<string>();
    for (const p of SMILE_ON_U_CHARITY.programs) {
      expect(p.title.length).toBeGreaterThan(3);
      expect(p.summary.length).toBeGreaterThan(20);
      expect(p.url.startsWith('https://smileonu.org/')).toBe(true);
      expect(p.url.endsWith('/')).toBe(true);
      urls.add(p.url);
    }
    expect(urls.size).toBe(3);
    expect(urls.has('https://smileonu.org/new-smile-program/')).toBe(true);
    expect(urls.has('https://smileonu.org/mobile-dental-outreach/')).toBe(true);
    expect(urls.has('https://smileonu.org/international-dental-clinics/')).toBe(true);
  });

  it('includes verified involvement and social links with no broken placeholder contact page', () => {
    const allUrls = [
      SMILE_ON_U_CHARITY.websiteUrl,
      SMILE_ON_U_CHARITY.donateUrl,
      ...SMILE_ON_U_CHARITY.programs.map((p) => p.url),
      ...SMILE_ON_U_CHARITY.involvementLinks.map((l) => l.url),
      ...SMILE_ON_U_CHARITY.socialLinks.map((s) => s.url),
    ];
    for (const url of allUrls) {
      expect(url.startsWith('https://')).toBe(true);
      expect(url).not.toContain('smileonu.org/contact');
    }
    expect(new Set(allUrls).size).toBe(allUrls.length);
    expect(SMILE_ON_U_CHARITY.needHighlights).toHaveLength(3);
    expect(SMILE_ON_U_CHARITY.independenceNote).toContain('SmileOnU.org');
  });

  it('lists further dental charities, each with its own https donate and website links', () => {
    expect(MORE_DENTAL_CHARITIES.length).toBeGreaterThan(0);
    expect(new Set(MORE_DENTAL_CHARITIES.map((m) => m.id)).size).toBe(MORE_DENTAL_CHARITIES.length);
    for (const m of MORE_DENTAL_CHARITIES) {
      expect(m.name.length).toBeGreaterThan(2);
      expect(m.legalStatus).toContain('501(c)(3)');
      expect(m.summary.length).toBeGreaterThan(40);
      const host = new URL(m.websiteUrl).host;
      // Every link stays on the charity's own site, and never points at SmileOnU by mistake.
      for (const url of [m.websiteUrl, m.donateUrl, ...m.links.map((l) => l.url)]) {
        expect(url.startsWith('https://')).toBe(true);
        expect(new URL(url).host).toBe(host);
        expect(url).not.toContain('smileonu.org');
      }
      expect(m.donateUrl).not.toBe(m.websiteUrl);
    }
    const ram = MORE_DENTAL_CHARITIES.find((m) => m.id === 'remote_area_medical');
    expect(ram?.donateUrl).toBe('https://www.ramusa.org/donate/');
    expect(ram?.websiteUrl).toBe('https://www.ramusa.org/');
    const mom = MORE_DENTAL_CHARITIES.find((m) => m.id === 'mission_of_mercy_adcf');
    expect(mom?.donateUrl).toBe('https://adcf.net/donate/');
    // The foundation's former domain, adcfmom.org, no longer belongs to it.
    expect(JSON.stringify(MORE_DENTAL_CHARITIES)).not.toContain('adcfmom.org');
    const linkIds = MORE_DENTAL_CHARITIES.flatMap((m) => m.links.map((l) => l.id));
    expect(new Set(linkIds).size).toBe(linkIds.length);
    expect(MORE_CHARITIES_NOTE).toContain('no fee');
  });
});
