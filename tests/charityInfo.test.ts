import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MORE_CHARITIES_NOTE, MORE_DENTAL_CHARITIES, NOT_ENDORSED_NOTE, SMILE_ON_U_CHARITY } from '../src/config/charityInfo';

const ROOT = join(__dirname, '..');
const WEB_SOURCE = readFileSync(join(ROOT, 'src/config/charityInfo.ts'), 'utf8');
const SWIFT_SOURCE = readFileSync(join(ROOT, 'native-apple/Sources/MouthLifeCore/Config/CharityInfo.swift'), 'utf8');

/** The only sites a grown-up can be sent to from the Charity view: each charity's own site and SmileOnU's social pages. */
const ALLOWED_HOSTS = new Set([
  'smileonu.org',
  'www.facebook.com',
  'www.youtube.com',
  'twitter.com',
  'www.ramusa.org',
  'adcf.net',
]);

function webDestinations(): string[] {
  return [
    SMILE_ON_U_CHARITY.websiteUrl,
    SMILE_ON_U_CHARITY.donateUrl,
    ...SMILE_ON_U_CHARITY.programs.map((p) => p.url),
    ...SMILE_ON_U_CHARITY.involvementLinks.map((l) => l.url),
    ...SMILE_ON_U_CHARITY.socialLinks.map((s) => s.url),
    ...MORE_DENTAL_CHARITIES.flatMap((m) => [m.websiteUrl, m.donateUrl, ...m.links.map((l) => l.url)]),
  ];
}

const swiftDestinations = (): string[] => [...SWIFT_SOURCE.matchAll(/URL\(string: "([^"]+)"\)/g)].map((m) => m[1]);

describe('SmileOnU humanitarian dental charity config', () => {
  it('exposes verified HTTPS website and donate pages', () => {
    expect(SMILE_ON_U_CHARITY.name).toBe('SmileOnU');
    expect(SMILE_ON_U_CHARITY.legalStatus).toContain('501(c)(3)');
    expect(SMILE_ON_U_CHARITY.websiteUrl).toBe('https://smileonu.org/');
    expect(SMILE_ON_U_CHARITY.donateUrl).toBe('https://smileonu.org/donate/');
  });

  it('sends a grown-up only to approved https charity pages, the same in both editions (L11)', () => {
    const web = webDestinations();
    const swift = swiftDestinations();
    expect(web.length).toBeGreaterThan(10);
    for (const url of [...web, ...swift]) {
      const parsed = new URL(url);
      expect(parsed.protocol, url).toBe('https:');
      expect(ALLOWED_HOSTS.has(parsed.host), url).toBe(true);
    }
    expect([...swift].sort()).toEqual([...web].sort());
  });

  it('keeps no email address or mailto link in either edition’s charity config (L11)', () => {
    const email = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
    for (const [name, source] of [
      ['charityInfo.ts', WEB_SOURCE],
      ['CharityInfo.swift', SWIFT_SOURCE],
      ['web config values', JSON.stringify({ SMILE_ON_U_CHARITY, MORE_DENTAL_CHARITIES })],
    ]) {
      expect(source, name).not.toMatch(/mailto:/i);
      expect(source, name).not.toMatch(email);
      expect(source, name).not.toMatch(/contactEmail|contactMailto/);
    }
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
    expect(NOT_ENDORSED_NOTE).toContain('not affiliated with, sponsored by or endorsed by');
  });
});
