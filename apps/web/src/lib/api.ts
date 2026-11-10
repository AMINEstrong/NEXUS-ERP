import en from "./locales/en.json";
import fr from "./locales/fr.json";
import ar from "./locales/ar.json";
import de from "./locales/de.json";
import { normalizeLanguage } from "./i18n-core.mjs";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001/api/v1").replace(/\/$/, "");

type ApiErrorPayload = { message?: string | string[] };

const MESSAGES: Record<string, Record<string, string>> = { en, fr, ar, de };

/**
 * Translate a server message with the same stored preference the UI uses.
 * Reading localStorage directly keeps this module framework-free so it can be
 * imported by the server layout without pulling in React context.
 */
function translateApiMessage(message: string): string {
  let language = "en";
  try {
    if (typeof window !== "undefined") language = normalizeLanguage(window.localStorage.getItem("nexus-locale"));
  } catch {
    // Storage can be blocked; fall back to English.
  }
  return MESSAGES[language]?.[message] ?? message;
}


export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch {
    throw new Error(translateApiMessage("NEXUS could not reach the API. Confirm the NestJS service is running and retry."));
  }

  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
  if (!response.ok) {
    const message = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message;
    throw new Error(message ? translateApiMessage(message) : `The request failed (${response.status}).`);
  }
  return payload as T;
}

export function formatApiDate(value: string) {
  // Keep server and browser output identical during hydration; user-local timezone
  // rendering can be layered on top once workspace locale settings reach the client.
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}

export function dateInputValue(daysFromNow = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * `datetime-local` controls submit a wall-clock value without an offset. NEXUS
 * displays business timestamps in UTC, so interpret the submitted value as UTC
 * too; otherwise the stored instant and the visible time drift apart.
 */
export function utcIsoFromDateTimeInput(value: string) {
  const normalized = value.length === 16 ? `${value}:00` : value;
  const date = new Date(`${normalized}Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Enter a valid date and time.");
  return date.toISOString();
}
