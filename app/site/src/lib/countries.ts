import type { Lang } from './i18n';
const alias: Record<string, string> = { EL: 'GR', UK: 'GB', XK: 'XK' };
const cache: Partial<Record<Lang, Intl.DisplayNames>> = {};
/** Country name from an Erasmus+ code (EL = Greece, UK = United Kingdom); falls back to the code. */
export function country(lang: Lang, code: string): string {
  const dn = (cache[lang] ??= new Intl.DisplayNames([lang === 'hr' ? 'hr' : 'en'], { type: 'region' }));
  try { return dn.of(alias[code] ?? code) ?? code; } catch { return code; }
}
