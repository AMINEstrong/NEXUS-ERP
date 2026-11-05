import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_BASE_URL } from "../../lib/api";
import "./app.css";
import { AppShell } from "./app-shell";
import type { NexusSession } from "./session-context";

export default async function PrivateAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map(({ name, value }) => `${name}=${value}`).join("; ");
  if (!cookieHeader) redirect("/login");

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/me`, { headers: { cookie: cookieHeader }, cache: "no-store" });
  } catch {
    return <main className="private-error"><div><span className="auth-kicker">WORKSPACE UNAVAILABLE</span><h1>Can’t reach the NEXUS API</h1><p>The web app is running, but the signed-in workspace needs the API and database. Start those services, then reload this page.</p><a className="auth-submit auth-submit-link" href="/login">Back to sign in <span aria-hidden="true">→</span></a></div></main>;
  }
  if (response.status === 401) redirect("/login");
  if (!response.ok) return <main className="private-error"><div><span className="auth-kicker">WORKSPACE UNAVAILABLE</span><h1>Couldn’t load your workspace</h1><p>The API returned an error while checking your session. Please retry in a moment.</p><a className="auth-submit auth-submit-link" href="/app">Try again <span aria-hidden="true">↻</span></a></div></main>;
  const session = (await response.json()) as NexusSession;
  return <AppShell session={session}>{children}</AppShell>;
}
