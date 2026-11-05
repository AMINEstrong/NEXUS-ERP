export interface CompanyContext {
  companyId: string;
  userId: string;
  membershipId: string;
  roleId: string;
}

export type SupportedLanguage = "en" | "fr" | "ar";
export type SupportedLocale = SupportedLanguage | `${SupportedLanguage}-${string}`;

export const DEFAULT_CURRENCY = "MAD" as const;
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ["en", "fr", "ar"];
export const DEFAULT_LOCALE: SupportedLocale = "fr-MA";
