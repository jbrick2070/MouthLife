/**
 * Shows the game in the player's language without changing how screens are built.
 *
 * Screens keep writing English. This watches the page and swaps every text run and
 * aria-label / title / placeholder / alt value it recognises for the translation from
 * src/i18n/locales/<lang>.json. Text with numbers in it is matched by patterns: the key
 * "Restore {0} colonies" also matches "Restore 10 colonies".
 *
 * The English original of every node is remembered, so switching language mid-game simply
 * translates the page again. Add data-no-translate to an element (player names, sync codes)
 * to leave it and everything inside it alone.
 */
import type { CoachLanguage } from '../config/brushCoach';

export type Catalog = Readonly<Record<string, string>>;

const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'] as const;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'NOSCRIPT']);
const CACHE_LIMIT = 4000;

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

interface Pattern {
  re: RegExp;
  out: string;
  /** Literal characters in the key: longer keys are more specific and are tried first. */
  weight: number;
}

/** Builds lookup tables for one language. Pure, so it can be tested without a page. */
export class CatalogMatcher {
  private readonly exact = new Map<string, string>();
  private readonly patterns: Pattern[] = [];
  private readonly cache = new Map<string, string | null>();

  constructor(catalog: Catalog) {
    for (const [key, value] of Object.entries(catalog)) {
      if (!value) continue;
      const k = norm(key);
      if (/\{\d+\}/.test(k)) {
        const literal = k.replace(/\{\d+\}/g, '');
        if (literal.replace(/[^A-Za-z]/g, '').length < 2) continue; // too vague to match safely
        const order: number[] = [];
        const source = k
          .split(/(\{\d+\})/)
          .map((part) => {
            const m = /^\{(\d+)\}$/.exec(part);
            if (m) {
              order.push(Number(m[1]));
              return '(.+?)';
            }
            return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          })
          .join('');
        // Slots in the translation refer to slot numbers in the key; map them to capture groups.
        const out = value.replace(/\{(\d+)\}/g, (_, n) => {
          const idx = order.indexOf(Number(n));
          return idx >= 0 ? `$${idx + 1}` : '';
        });
        this.patterns.push({ re: new RegExp(`^${source}$`), out, weight: literal.length });
      } else {
        this.exact.set(k, value);
      }
    }
    this.patterns.sort((a, b) => b.weight - a.weight);
  }

  /** Translation of an English text run, or null when there is none. */
  lookup(text: string): string | null {
    const k = norm(text);
    if (!k || !/[A-Za-z]/.test(k)) return null;
    const hit = this.exact.get(k);
    if (hit !== undefined) return hit;
    const cached = this.cache.get(k);
    if (cached !== undefined) return cached;
    let result: string | null = null;
    for (const p of this.patterns) {
      if (p.re.test(k)) {
        result = k.replace(p.re, p.out.replace(/\$(?!\d)/g, '$$$$'));
        break;
      }
    }
    if (this.cache.size > CACHE_LIMIT) this.cache.clear();
    this.cache.set(k, result);
    return result;
  }

  /** Translate keeping the original's leading and trailing spaces. */
  translate(text: string): string {
    const t = this.lookup(text);
    if (t === null) return text;
    const lead = /^\s*/.exec(text)?.[0] ?? '';
    const trail = /\s*$/.exec(text)?.[0] ?? '';
    return lead + t + trail;
  }
}

type Loader = () => Promise<{ default: Catalog } | Catalog>;
const LOADERS = import.meta.glob<{ default: Catalog }>('./locales/[a-z][a-z].json') as Record<string, Loader>;

export function availableUiLanguages(): string[] {
  return ['en', ...Object.keys(LOADERS).map((p) => /([a-z]{2})\.json$/.exec(p)?.[1] ?? '').filter(Boolean)];
}

export class UiTranslator {
  private lang: CoachLanguage | 'en' = 'en';
  private matcher: CatalogMatcher | null = null;
  private observer: MutationObserver | null = null;
  private root: HTMLElement | null = null;
  /** English text of each text node, and what we last wrote into it. */
  private readonly textOrig = new WeakMap<Text, string>();
  private readonly textWritten = new WeakMap<Text, string>();
  private readonly attrOrig = new WeakMap<Element, Map<string, string>>();
  private readonly attrWritten = new WeakMap<Element, Map<string, string>>();
  private loadToken = 0;

  getLanguage(): string {
    return this.lang;
  }

  /** Start translating everything under root (normally document.body). */
  attach(root: HTMLElement): void {
    this.root = root;
    this.observer?.disconnect();
    this.observer = new MutationObserver((records) => this.onMutations(records));
    this.observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    });
    this.translateTree(root);
  }

  /** Switch language; resolves once the new text is on screen. English needs no file. */
  async setLanguage(lang: CoachLanguage | 'en'): Promise<void> {
    const token = ++this.loadToken;
    let matcher: CatalogMatcher | null = null;
    if (lang !== 'en') {
      const loader = LOADERS[`./locales/${lang}.json`];
      if (loader) {
        try {
          const mod = await loader();
          const catalog = ('default' in mod ? mod.default : mod) as Catalog;
          matcher = new CatalogMatcher(catalog);
        } catch {
          matcher = null; // missing or broken file: stay readable in English
        }
      }
    }
    if (token !== this.loadToken) return; // a newer request won
    this.lang = lang;
    this.matcher = matcher;
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
    if (this.root) this.translateTree(this.root);
  }

  /** Translate one string from code (for things that never reach the page as text). */
  t(english: string): string {
    return this.matcher ? this.matcher.translate(english) : english;
  }

  private skip(el: Element | null): boolean {
    for (let e = el; e; e = e.parentElement) {
      if (SKIP_TAGS.has(e.tagName) || e.hasAttribute('data-no-translate') || (e as HTMLElement).isContentEditable) {
        return true;
      }
    }
    return false;
  }

  private onMutations(records: MutationRecord[]): void {
    for (const r of records) {
      if (r.type === 'characterData' && r.target.nodeType === Node.TEXT_NODE) {
        this.translateText(r.target as Text);
      } else if (r.type === 'attributes' && r.attributeName) {
        this.translateAttr(r.target as Element, r.attributeName);
      } else if (r.type === 'childList') {
        r.addedNodes.forEach((n) => {
          if (n.nodeType === Node.TEXT_NODE) this.translateText(n as Text);
          else if (n.nodeType === Node.ELEMENT_NODE) this.translateTree(n as Element);
        });
      }
    }
  }

  private translateTree(root: Element): void {
    if (this.skip(root)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.nodeType === Node.ELEMENT_NODE && (SKIP_TAGS.has((node as Element).tagName) || (node as Element).hasAttribute('data-no-translate'))
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    this.translateAttrs(root);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) this.translateText(n as Text, true);
      else this.translateAttrs(n as Element);
    }
  }

  private translateText(node: Text, parentChecked = false): void {
    const current = node.data;
    if (this.textWritten.get(node) === current) {
      // Our own write coming back, unless the language changed since: then redo from the original.
      const orig = this.textOrig.get(node);
      if (orig === undefined) return;
      const next = this.matcher ? this.matcher.translate(orig) : orig;
      if (next !== current) this.writeText(node, next);
      return;
    }
    if (!/[A-Za-z]/.test(current)) {
      this.textOrig.delete(node);
      return;
    }
    if (!parentChecked && this.skip(node.parentElement)) return;
    this.textOrig.set(node, current);
    const next = this.matcher ? this.matcher.translate(current) : current;
    if (next !== current) this.writeText(node, next);
    else this.textWritten.delete(node);
  }

  private writeText(node: Text, value: string): void {
    this.textWritten.set(node, value);
    node.data = value;
  }

  private translateAttrs(el: Element): void {
    for (const a of ATTRS) if (el.hasAttribute(a)) this.translateAttr(el, a);
  }

  private translateAttr(el: Element, name: string): void {
    const current = el.getAttribute(name);
    if (current === null) return;
    let orig = this.attrOrig.get(el);
    let written = this.attrWritten.get(el);
    if (!orig) this.attrOrig.set(el, (orig = new Map()));
    if (!written) this.attrWritten.set(el, (written = new Map()));
    if (written.get(name) !== current) orig.set(name, current);
    const english = orig.get(name) ?? current;
    const next = this.matcher ? this.matcher.translate(english) : english;
    if (next !== current) {
      written.set(name, next);
      el.setAttribute(name, next);
    }
  }
}

/** The one translator for the whole page. */
export const uiTranslator = new UiTranslator();
