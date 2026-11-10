const FALLBACK_LOCALE = "en-GB";

function safeLocale(locale?: string | null) {
  if (!locale) return FALLBACK_LOCALE;
  try {
    return Intl.NumberFormat.supportedLocalesOf([locale]).length > 0 ? locale : FALLBACK_LOCALE;
  } catch {
    return FALLBACK_LOCALE;
  }
}

export function formatNumber(value: number, locale?: string | null, maximumFractionDigits = 0) {
  const amount = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(safeLocale(locale), { maximumFractionDigits }).format(amount);
}

export function formatCurrency(value: number, currency: string, locale?: string | null) {
  const amount = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(safeLocale(locale), {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || "USD"} ${formatNumber(amount, locale, 2)}`;
  }
}

export function formatCompactNumber(value: number, locale?: string | null) {
  const amount = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(safeLocale(locale), {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return formatNumber(amount, locale, 1);
  }
}

export function formatCompactCurrency(value: number, currency: string, locale?: string | null) {
  const amount = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(safeLocale(locale), {
      style: "currency",
      currency: currency || "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return formatCompactNumber(amount, locale);
  }
}

export function formatPercent(value: number, locale?: string | null) {
  const amount = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(amount * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${formatNumber(rounded, locale, 1)}%`;
}

function toDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Date-only business values (invoice due dates, quotation validity) are stored
 * at UTC midnight, so they must be rendered in UTC to avoid a calendar day
 * shift in negative-offset time zones.
 */
export function formatDay(value: string | Date | null | undefined, locale?: string | null) {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(safeLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Rebuild an API chart bucket label in the active UI language. The API sends a
 * stable UTC `YYYY-MM-DD` key plus an English label, so the client controls the
 * displayed language without changing the series identity.
 */
export function formatBucketLabel(key: string, granularity: "day" | "week" | "month", locale?: string | null) {
  const date = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return key;
  const options: Intl.DateTimeFormatOptions =
    granularity === "month"
      ? { month: "short", year: "2-digit", timeZone: "UTC" }
      : { day: "numeric", month: "short", timeZone: "UTC" };
  return new Intl.DateTimeFormat(safeLocale(locale), options).format(date);
}

export function formatDateTime(value: string | Date | null | undefined, locale?: string | null, timeZone?: string | null) {
  const date = toDate(value);
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat(safeLocale(locale), {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timeZone || "UTC",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(safeLocale(locale), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date);
  }
}

export function formatTime(value: string | Date | null | undefined, locale?: string | null, timeZone?: string | null) {
  const date = toDate(value);
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat(safeLocale(locale), {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timeZone || "UTC",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(safeLocale(locale), {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(date);
  }
}

export function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function truncate(value: string, length = 42) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}
