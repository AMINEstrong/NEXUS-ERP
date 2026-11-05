"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";
import { NexusSession, SessionProvider } from "./session-context";

const navigation = [
  { label: "Overview", href: "/app", detail: "Your workspace at a glance" },
  { label: "Inventory", href: "/app/inventory", detail: "Items warehouses receipts stock transfers" },
  { label: "CRM", href: "/app/crm", detail: "Customers prospects opportunities follow-ups" },
  { label: "Sales", href: "/app/sales", detail: "Quotations orders deliveries invoices payments" },
  { label: "Companies", href: "/app/companies", detail: "Company profiles and access" },
  { label: "Company settings", href: "/app/settings", detail: "Legal profile locale currency fiscal year" },
  { label: "Roles & permissions", href: "/app/roles", detail: "Administration roles permissions members" },
  { label: "Sessions & security", href: "/app/security", detail: "Review sign-in sessions" },
];

export function AppShell({ session, children }: { session: NexusSession; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [companyId, setCompanyId] = useState(session.activeCompanyId ?? "");
  const [switching, setSwitching] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [error, setError] = useState("");
  const filtered = useMemo(() => navigation.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const activeCompany = session.memberships.find((item) => item.id === companyId);

  useEffect(() => {
    const saved = window.localStorage.getItem("nexus-theme");
    if (saved === "dark") setTheme("dark");
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem("nexus-theme", next);
  }

  async function switchCompany(event: FormEvent<HTMLSelectElement>) {
    const nextId = event.currentTarget.value;
    setCompanyId(nextId);
    setError("");
    if (!nextId || nextId === session.activeCompanyId) return;
    setSwitching(true);
    try {
      await apiRequest("/auth/active-company", { method: "POST", body: JSON.stringify({ companyId: nextId }) });
      router.refresh();
    } catch (reason) {
      setCompanyId(session.activeCompanyId ?? "");
      setError(reason instanceof Error ? reason.message : "The workspace could not be changed.");
    } finally {
      setSwitching(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    setError("");
    try {
      await apiRequest("/auth/logout", { method: "POST" });
      window.location.assign("/login");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign out failed.");
      setSigningOut(false);
    }
  }

  return (
    <SessionProvider value={session}>
      <div className="erp-frame" data-theme={theme}>
        <aside className="erp-sidebar">
          <Link className="erp-brand" href="/app"><span className="brand-mark">N</span><span>NEXUS <small>ERP MS</small></span></Link>
          <div className="sidebar-caption">WORKSPACE</div>
          <nav className="erp-nav" aria-label="Workspace navigation">
            {filtered.map((item) => <Link key={item.href} className={`erp-nav-item${pathname === item.href ? " is-active" : ""}`} href={item.href}><span className="nav-glyph" aria-hidden="true">{item.label === "Overview" ? "⌂" : item.label === "Inventory" ? "▤" : item.label === "CRM" ? "◎" : item.label === "Sales" ? "↗" : item.label === "Companies" ? "▦" : item.label === "Company settings" ? "⚙" : item.label === "Roles & permissions" ? "♙" : "◈"}</span><span>{item.label}</span></Link>)}
            {filtered.length === 0 && <p className="nav-empty">No workspace pages match “{query}”.</p>}
          </nav>
          <div className="sidebar-bottom"><span className="sidebar-avatar">{session.name.slice(0, 1).toUpperCase()}</span><span className="sidebar-user"><strong>{session.name}</strong><small>{session.email}</small></span><button className="icon-button" onClick={signOut} disabled={signingOut} aria-label="Sign out" title="Sign out">↗</button></div>
        </aside>
        <main className="erp-main">
          <header className="erp-topbar">
            <div className="company-select-wrap"><span className="topbar-overline">CURRENT COMPANY</span><select value={companyId} onChange={switchCompany} disabled={switching || session.memberships.length === 0} aria-label="Current company"><option value="">Choose a company</option>{session.memberships.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>
            <div className="topbar-tools"><label className="global-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a workspace page" aria-label="Find a workspace page" /></label><button className="theme-button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>{theme === "light" ? "◐" : "☼"}<span>{theme === "light" ? "Dark" : "Light"}</span></button><div className="profile-chip"><span className="profile-avatar">{session.name.slice(0, 1).toUpperCase()}</span><span><strong>{session.name}</strong><small>{activeCompany?.role.name ?? "Account owner"}</small></span></div></div>
          </header>
          {error && <div className="erp-toast" role="alert">{error}<button className="toast-close" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
          <div className="erp-content">{children}</div>
        </main>
      </div>
    </SessionProvider>
  );
}
