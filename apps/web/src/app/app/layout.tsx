import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_BASE_URL } from "../../lib/api";
import "./app.css";
import { AppShell } from "./app-shell";
import type { NexusSession } from "./session-context";
import { WorkspaceError } from "./workspace-error";

export default async function PrivateAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map(({ name, value }) => `${name}=${value}`).join("; ");
  if (!cookieHeader) redirect("/login");

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/me`, { headers: { cookie: cookieHeader }, cache: "no-store" });
  } catch {
    return <WorkspaceError kind="unreachable" />;
  }
  if (response.status === 401) redirect("/login");
  if (!response.ok) return <WorkspaceError kind="failed" />;
  const session = (await response.json()) as NexusSession;
  return <AppShell session={session}>{children}</AppShell>;
}
