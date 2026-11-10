// Pure locale helpers shared by the React provider and the unit tests.
// Keeping this file framework-free lets the dictionaries and RTL rules be
// verified with plain `node --test` without a browser or a React renderer.

export const SUPPORTED_LANGUAGES = ["en", "fr", "ar", "de"];
export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_STORAGE_KEY = "nexus-locale";

/** @param {string | null | undefined} locale */
export function normalizeLanguage(locale) {
  const base = (locale ?? "").trim().toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.includes(base) ? base : DEFAULT_LANGUAGE;
}

/** @param {string | null | undefined} locale */
export function isRtl(locale) {
  return normalizeLanguage(locale) === "ar";
}

/** @param {string | null | undefined} locale */
export function directionFor(locale) {
  return isRtl(locale) ? "rtl" : "ltr";
}

/** @param {string | null | undefined} locale */
export function intlLocale(locale) {
  const base = normalizeLanguage(locale);
  if (base === "fr") return "fr-MA";
  if (base === "ar") return "ar-MA";
  if (base === "de") return "de-DE";
  return "en-GB";
}

/** @param {string} template @param {Record<string, string | number> | undefined} params */
export function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
}
