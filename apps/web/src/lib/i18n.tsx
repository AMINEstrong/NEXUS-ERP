import { createContext, useContext, useMemo } from "react";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import ar from "./locales/ar.json";
import de from "./locales/de.json";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  directionFor,
  interpolate,
  intlLocale,
  isRtl,
  normalizeLanguage,
} from "./i18n-core.mjs";

export type AppLanguage = "en" | "fr" | "ar" | "de";
export type AppLocale = AppLanguage | `${AppLanguage}-${string}`;

export { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES, directionFor, intlLocale, isRtl, normalizeLanguage };

export const dictionaries: Record<AppLanguage, Record<string, string>> = { en, fr, ar, de };

export type TranslateParams = Record<string, string | number>;

export { interpolate };

export function translate(locale: string | null | undefined, key: string, params?: TranslateParams): string {
  const language = normalizeLanguage(locale) as AppLanguage;
  const value = dictionaries[language][key] ?? dictionaries.en[key] ?? key;
  return interpolate(value, params);
}

export function formatNumber(locale: string | null | undefined, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale(locale), options).format(value);
}

export function formatCurrency(locale: string | null | undefined, value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency }).format(value);
  } catch {
    return `${formatNumber(locale, value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}

export function formatDate(locale: string | null | undefined, value: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), options ?? { dateStyle: "medium" }).format(date);
}

/** Convert a system enum value ("PARTIALLY_DELIVERED") into a dictionary key ("Partially delivered"). */
export function enumKey(value: string | null | undefined): string {
  if (!value) return "";
  const words = value.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

type I18nValue = {
  locale: AppLanguage;
  language: AppLanguage;
  dir: "ltr" | "rtl";
  rtl: boolean;
  t: (key: string, params?: TranslateParams) => string;
  enum: (value: string | null | undefined) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  currency: (value: number, currency: string) => string;
  date: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: string; children: React.ReactNode }) {
  const value = useMemo<I18nValue>(() => {
    const language = normalizeLanguage(locale) as AppLanguage;
    return {
      locale: language,
      language,
      dir: directionFor(language),
      rtl: isRtl(language),
      t: (key, params) => translate(language, key, params),
      enum: (input) => {
        const key = enumKey(input);
        return key ? translate(language, key) : "—";
      },
      number: (input, options) => formatNumber(language, input, options),
      currency: (input, currency) => formatCurrency(language, input, currency),
      date: (input, options) => formatDate(language, input, options),
    };
  }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    // Guest pages can render before a provider is mounted; English keeps the UI usable.
    return {
      locale: "en",
      language: "en",
      dir: "ltr",
      rtl: false,
      t: (key, params) => translate("en", key, params),
      enum: (input) => enumKey(input) || "—",
      number: (input, options) => formatNumber("en", input, options),
      currency: (input, currency) => formatCurrency("en", input, currency),
      date: (input, options) => formatDate("en", input, options),
    };
  }
  return value;
}
