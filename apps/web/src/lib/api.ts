export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");

type ApiErrorPayload = { message?: string | string[] };

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch {
    throw new Error("NEXUS could not reach the API. Confirm the NestJS service is running and retry.");
  }

  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
  if (!response.ok) {
    const message = Array.isArray(payload.message) ? payload.message.join(" ") : payload.message;
    throw new Error(message || `The request failed (${response.status}).`);
  }
  return payload as T;
}

export function formatApiDate(value: string) {
  // Keep server and browser output identical during hydration; user-local timezone
  // rendering can be layered on top once workspace locale settings reach the client.
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}
