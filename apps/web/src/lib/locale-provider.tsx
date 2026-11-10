"use client";

import { useEffect, useState } from "react";
import { I18nProvider, LANGUAGE_STORAGE_KEY, normalizeLanguage, type AppLanguage } from "./i18n";

export const LOCALE_CHANGE_EVENT = "nexus-locale-change";

export function readStoredLanguage(): AppLanguage {
  try {
    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)) as AppLanguage;
  } catch {
    return "en";
  }
}

export function storeLanguage(locale: string) {
  const language = normalizeLanguage(locale);
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Storage can be blocked; the in-memory provider still updates.
  }
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: language }));
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<AppLanguage>("en");

  useEffect(() => {
    setLocale(readStoredLanguage());
    function onChange(event: Event) {
      const detail = (event as CustomEvent<string>).detail;
      setLocale(normalizeLanguage(detail) as AppLanguage);
    }
    window.addEventListener(LOCALE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, onChange);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}
