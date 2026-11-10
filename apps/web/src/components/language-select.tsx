"use client";

import { SUPPORTED_LANGUAGES, useI18n, type AppLanguage } from "../lib/i18n";
import { storeLanguage } from "../lib/locale-provider";

const OPTIONS: Array<{ value: AppLanguage; label: string }> = [
  { value: "en", label: "EN" },
  { value: "fr", label: "FR" },
  { value: "ar", label: "العربية" },
  { value: "de", label: "DE" },
];

export function LanguageSelect({ className = "locale-select-wrap" }: { className?: string }) {
  const { language, t } = useI18n();
  return (
    <label className={className}>
      <span className="sr-only">{t("Interface language")}</span>
      <select
        value={language}
        onChange={(event) => storeLanguage(event.currentTarget.value)}
        aria-label={t("Interface language")}
        title={t("Interface language")}
      >
        {OPTIONS.filter((option) => SUPPORTED_LANGUAGES.includes(option.value)).map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
