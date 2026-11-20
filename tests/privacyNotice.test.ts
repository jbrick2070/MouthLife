import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatalogMatcher } from '../src/i18n/uiTranslator';
import {
  buildPrivacyNoticeHtml,
  PRIVACY_NOTICE_BADGE,
  PRIVACY_NOTICE_BUTTON_LABEL,
  PRIVACY_NOTICE_DONE,
  PRIVACY_NOTICE_EFFECTIVE,
  PRIVACY_NOTICE_SECTIONS,
  PRIVACY_NOTICE_TITLE,
  privacyNoticeButtonHtml,
} from '../src/ui/privacyNotice';

const ROOT = join(__dirname, '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const LOCALE_DIR = join(ROOT, 'src/i18n/locales');
const LOCALES = readdirSync(LOCALE_DIR).filter((f) => /^[a-z]{2}\.json$/.test(f));
const NATIVE_SHEET = read('native-apple/MouthLifeApp/UI/Sheets/ProfileAndSettingsSheet.swift');

const NOTICE_TEXT = [
  PRIVACY_NOTICE_TITLE,
  PRIVACY_NOTICE_BADGE,
  ...PRIVACY_NOTICE_SECTIONS.flat(),
  PRIVACY_NOTICE_EFFECTIVE,
  PRIVACY_NOTICE_DONE,
  PRIVACY_NOTICE_BUTTON_LABEL,
];

describe('L06 privacy notice in the player’s language', () => {
  it('says exactly what the native notice says', () => {
    const view = NATIVE_SHEET.slice(NATIVE_SHEET.indexOf('struct PrivacyPolicyView'));
    const block = view.slice(view.indexOf('private let sections'), view.indexOf('var body'));
    const nativeSections = [...block.matchAll(/\("([^"]+)", "([^"]+)"\)/g)].map((m) => [m[1], m[2]]);
    expect(nativeSections.length).toBe(4);
    expect(PRIVACY_NOTICE_SECTIONS.map((s) => [...s])).toEqual(nativeSections);
    expect(view).toContain(`.navigationTitle(L10n.t("${PRIVACY_NOTICE_TITLE}"))`);
    expect(view).toContain(`Text(L10n.t("${PRIVACY_NOTICE_BADGE}"))`);
    expect(view).toContain(`Text(L10n.t("${PRIVACY_NOTICE_EFFECTIVE}"))`);
    expect(view).toContain(`Button(L10n.t("${PRIVACY_NOTICE_DONE}"))`);
  });

  it('is on the shared string list, so the translator knows every line', () => {
    const en = new Set<string>(JSON.parse(read('src/i18n/strings.en.json')));
    for (const text of NOTICE_TEXT) expect(en.has(text), text).toBe(true);
  });

  it.each(LOCALES)('%s translates every line of the notice and its button', (file) => {
    const matcher = new CatalogMatcher(JSON.parse(readFileSync(join(LOCALE_DIR, file), 'utf8')));
    for (const text of NOTICE_TEXT) {
      const shown = matcher.translate(text);
      expect(shown.trim().length, `${file}: ${text}`).toBeGreaterThan(0);
      expect(shown, `${file}: ${text}`).not.toBe(text);
    }
  });

  it('is part of the translated page, not a separate English document', () => {
    // The page translator watches document.body and sets <html lang>; the notice joins that page
    // and declares no language of its own.
    expect(read('src/main.ts')).toContain('uiTranslator.attach(document.body)');
    expect(read('src/ui/privacyNotice.ts')).toContain('document.body.appendChild(shade)');
    const html = buildPrivacyNoticeHtml();
    expect(html).not.toMatch(/\blang=/);
    for (const text of NOTICE_TEXT.slice(0, -1)) expect(html).toContain(text);
    expect(html).toContain('aria-modal="true"');
  });
});

describe('M08 nothing leaves the game from the privacy notice', () => {
  it('has no links of any kind in the in-app notice', () => {
    const html = buildPrivacyNoticeHtml() + privacyNoticeButtonHtml();
    expect(html).not.toMatch(/<a\b|href=|https?:|mailto:/i);
    expect(read('src/ui/privacyNotice.ts')).not.toMatch(/window\.open|location\.|href=|https?:\/\//);
    expect(privacyNoticeButtonHtml()).toMatch(/^<button type="button"/);
  });

  it('opens from the Sync sheet inside the game instead of a separate page', () => {
    const hub = read('src/ui/CompanionHubOverlay.ts');
    expect(hub).not.toContain('privacy.html');
    expect(hub).toContain('${privacyNoticeButtonHtml()}');
  });

  it('keeps the store-listing copy (public/privacy.html) free of outside links and contact details', () => {
    const page = read('public/privacy.html');
    const hrefs = [...page.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['./']);
    expect(page).not.toMatch(/https?:\/\/|mailto:|[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    for (const name of ['SmileOnU', 'Remote Area Medical', "America's Dentists Care Foundation"]) {
      expect(page).toContain(name);
    }
  });
});
