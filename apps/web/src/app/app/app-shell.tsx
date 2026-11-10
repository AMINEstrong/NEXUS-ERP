"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../lib/api";
import { formatDate, I18nProvider, LANGUAGE_STORAGE_KEY, normalizeLanguage, translate } from "../../lib/i18n";
import { buildAccess, NexusSession, SessionProvider } from "./session-context";

type NavItem = { label: string; href: string; glyph: string; detail: string; detailKey: string; section: string; permissions?: string[] };
type SearchItem = { id: string; title: string; detail: string; href: string };
type SearchGroup = { key: string; label: string; items: SearchItem[] };
type SearchResponse = { query: string; groups: SearchGroup[] };
type NotificationItem = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  titleKey?: string;
  titleParams?: Record<string, string | number>;
  detailKey?: string;
  detailParams?: Record<string, string | number>;
  href: string;
  createdAt: string;
};
type NotificationResponse = { generatedAt: string; items: NotificationItem[] };

const navigation: NavItem[] = [
  { label: "Overview", href: "/app", glyph: "⌂", detail: "Your workspace at a glance", detailKey: "Overview description", section: "Workspace" },
  { label: "Inventory", href: "/app/inventory", glyph: "▤", detail: "Items warehouses receipts stock transfers", detailKey: "Inventory description", section: "Operations", permissions: ["inventory.read"] },
  { label: "CRM", href: "/app/crm", glyph: "◎", detail: "Customers prospects opportunities follow-ups", detailKey: "CRM description", section: "Operations", permissions: ["crm.read"] },
  { label: "Sales", href: "/app/sales", glyph: "↗", detail: "Quotations orders deliveries invoices payments", detailKey: "Sales description", section: "Operations", permissions: ["sales.read"] },
  { label: "Companies", href: "/app/companies", glyph: "▦", detail: "Company profiles and access", detailKey: "Companies description", section: "Administration" },
  { label: "Company settings", href: "/app/settings", glyph: "⚙", detail: "Legal profile locale currency fiscal year", detailKey: "Company settings description", section: "Administration", permissions: ["company.read"] },
  { label: "Roles & permissions", href: "/app/roles", glyph: "♙", detail: "Administration roles permissions members", detailKey: "Roles description", section: "Administration", permissions: ["administration.read"] },
  { label: "Sessions & security", href: "/app/security", glyph: "◈", detail: "Review sign-in sessions", detailKey: "Security description", section: "Administration" },
];

const sections = ["Workspace", "Operations", "Administration"];
const readStorageKey = "nexus-notification-read";

const SEARCH_GROUP_KEYS: Record<string, string> = {
  customers: "Customers",
  products: "Products",
  invoices: "Invoices",
  orders: "Sales orders",
  quotations: "Quotations",
};

export function AppShell({ session, children }: { session: NexusSession; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [companyId, setCompanyId] = useState(session.activeCompanyId ?? "");
  const [switching, setSwitching] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [locale, setLocale] = useState(session.locale || "en");
  const [localeBusy, setLocaleBusy] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationError, setNotificationError] = useState("");
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);

  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const notificationBoxRef = useRef<HTMLDivElement>(null);
  const profileBoxRef = useRef<HTMLDivElement>(null);

  const activeCompany = session.memberships.find((item) => item.id === companyId);
  const baseLocale = normalizeLanguage(locale);
  const dir = baseLocale === "ar" ? "rtl" : "ltr";
  const t = (key: string, params?: Record<string, string | number>) => translate(baseLocale, key, params);
  const access = useMemo(() => buildAccess(session), [session]);
  const visibleNavigation = useMemo(
    () => navigation.filter((item) => !item.permissions || item.permissions.every((permission) => access.can(permission))),
    [access],
  );
  const visibleSections = useMemo(
    () => sections.filter((section) => visibleNavigation.some((item) => item.section === section)),
    [visibleNavigation],
  );
  const activeRole = activeCompany?.role.name ?? t("Account owner");
  const pageNav = visibleNavigation.find((item) => item.href === pathname);
  const unreadCount = notifications.filter((item) => !readIds.includes(item.id)).length;
  const readStorageKeyForCompany = `${readStorageKey}:${companyId || "none"}`;

  const pageMatches = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return [];
    return visibleNavigation
      .filter((item) => `${t(item.label)} ${t(item.detailKey)}`.toLowerCase().includes(value))
      .slice(0, 5)
      .map((item) => ({ id: item.href, title: t(item.label), detail: t(item.detailKey), href: item.href }));
  }, [query, visibleNavigation, locale]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [{ label: t("Workspace"), href: "/app" }];
    if (pathname === "/app") crumbs.push({ label: t("Overview"), href: "/app" });
    else crumbs.push({ label: pageNav ? t(pageNav.label) : pathname.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") ?? t("Page not found"), href: pathname });
    return crumbs;
  }, [pageNav?.label, pathname, locale]);

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem("nexus-theme");
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
      setTheme(storedTheme === "dark" || (!storedTheme && prefersDark) ? "dark" : "light");
      setCollapsed(window.localStorage.getItem("nexus-sidebar") === "collapsed");
    } catch {
      // Browser storage can be unavailable in private or locked-down contexts.
    }
  }, []);

  useEffect(() => {
    try {
      const storedRead = JSON.parse(window.localStorage.getItem(readStorageKeyForCompany) ?? "[]") as unknown;
      setReadIds(Array.isArray(storedRead) ? storedRead.filter((value): value is string => typeof value === "string") : []);
    } catch {
      setReadIds([]);
    }
  }, [readStorageKeyForCompany]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    setLocale(session.locale || "en");
  }, [session.locale]);

  useEffect(() => {
    document.documentElement.lang = baseLocale;
    document.documentElement.dir = dir;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, baseLocale);
    } catch {
      // Language still applies for this session when storage is blocked.
    }
  }, [baseLocale, dir]);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
    setNotificationOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (searchBoxRef.current && !searchBoxRef.current.contains(target)) setSearchOpen(false);
      if (notificationBoxRef.current && !notificationBoxRef.current.contains(target)) setNotificationOpen(false);
      if (profileBoxRef.current && !profileBoxRef.current.contains(target)) setProfileOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotificationOpen(false);
        setProfileOpen(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      const isTextEntry = target?.matches("input, textarea, select, [contenteditable='true']") ?? false;
      if (event.key === "/" && !isTextEntry && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setSearchResults(null);
      setSearchLoading(false);
      setSearchError("");
      return;
    }
    if (!access.can("reports.read")) {
      setSearchResults(null);
      setSearchLoading(false);
      setSearchError("");
      return;
    }
    let active = true;
    setSearchLoading(true);
    setSearchError("");
    const timer = window.setTimeout(() => {
      void apiRequest<SearchResponse>(`/dashboard/search?q=${encodeURIComponent(value)}`)
        .then((result) => {
          if (active) setSearchResults(result);
        })
        .catch((reason: unknown) => {
          if (active) {
            setSearchResults(null);
            setSearchError(reason instanceof Error ? reason.message : translate(baseLocale, "Search is unavailable right now."));
          }
        })
        .finally(() => {
          if (active) setSearchLoading(false);
        });
    }, 280);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, access, baseLocale]);

  useEffect(() => {
    let active = true;
    async function loadNotifications(silent = false) {
      if (!access.can("reports.read")) {
        if (active) {
          setNotifications([]);
          setNotificationError("");
          setNotificationsLoading(false);
        }
        return;
      }
      if (!silent) setNotificationsLoading(true);
      setNotificationError("");
      try {
        const result = await apiRequest<NotificationResponse>("/dashboard/notifications");
        if (active) setNotifications(result.items);
      } catch (reason) {
        if (active) setNotificationError(reason instanceof Error ? reason.message : translate(baseLocale, "Notifications are unavailable."));
      } finally {
        if (active && !silent) setNotificationsLoading(false);
      }
    }
    void loadNotifications();
    const interval = window.setInterval(() => void loadNotifications(true), 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [session.activeCompanyId, access, baseLocale]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      window.localStorage.setItem("nexus-theme", next);
    } catch {
      // Theme still applies for this session when storage is blocked.
    }
  }

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem("nexus-sidebar", next ? "collapsed" : "expanded");
    } catch {
      // Collapsing still works for this session when storage is blocked.
    }
  }

  function markAllNotificationsRead() {
    const next = Array.from(new Set([...readIds, ...notifications.map((item) => item.id)]));
    setReadIds(next);
    try {
      window.localStorage.setItem(readStorageKeyForCompany, JSON.stringify(next));
    } catch {
      // Read state is still reflected for this session.
    }
  }

  function markNotificationRead(id: string) {
    if (readIds.includes(id)) return;
    const next = [...readIds, id];
    setReadIds(next);
    try {
      window.localStorage.setItem(readStorageKeyForCompany, JSON.stringify(next));
    } catch {
      // Read state is still reflected for this session.
    }
  }

  async function changeLocale(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.currentTarget.value;
    const previous = locale;
    setLocale(next);
    setLocaleBusy(true);
    setError("");
    try {
      await apiRequest("/auth/me/locale", { method: "PATCH", body: JSON.stringify({ locale: next }) });
    } catch (reason) {
      setLocale(previous);
      setError(reason instanceof Error ? reason.message : t("The language preference could not be saved."));
    } finally {
      setLocaleBusy(false);
    }
  }

  async function switchCompany(event: React.ChangeEvent<HTMLSelectElement>) {
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
      setError(reason instanceof Error ? reason.message : translate(baseLocale, "The workspace could not be changed."));
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
      setError(reason instanceof Error ? reason.message : translate(baseLocale, "Sign out failed."));
      setSigningOut(false);
    }
  }

  const showSearchPanel = searchOpen && query.trim().length > 0;
  const hasSearchRecords = Boolean(searchResults?.groups.length);
  const showSearchEmpty = query.trim().length >= 2 && !searchLoading && !searchError && !hasSearchRecords && pageMatches.length === 0;

  return (
    <SessionProvider value={session}>
      <I18nProvider locale={baseLocale}>
      <div className="erp-frame" data-theme={theme} data-collapsed={collapsed ? "true" : "false"} data-mobile-open={mobileOpen ? "true" : "false"} dir={dir}>
        <a className="skip-link" href="#nexus-content">{t("Skip to content")}</a>
        <aside className="erp-sidebar" aria-label={t("Workspace navigation")}>
          <div className="sidebar-brand-row">
            <Link className="erp-brand" href="/app" aria-label={t("NEXUS ERP home")}>
              <span className="brand-mark">N</span>
              <span className="brand-copy">NEXUS <small>ERP MS</small></span>
            </Link>
            <button className="sidebar-collapse" onClick={toggleCollapsed} aria-label={collapsed ? t("Expand navigation") : t("Collapse navigation")} title={collapsed ? t("Expand navigation") : t("Collapse navigation")}>
              {collapsed ? "»" : "«"}
            </button>
          </div>
          <div className="sidebar-caption">{t("WORKSPACE")}</div>
          <nav className="erp-nav" aria-label={t("Workspace pages")}>
            {visibleSections.map((section) => {
              const items = visibleNavigation.filter((item) => item.section === section);
              return (
                <div className="nav-section" key={section}>
                  <span className="nav-section-label">{t(section)}</span>
                  {items.map((item) => (
                    <Link
                      key={item.href}
                      className={`erp-nav-item${pathname === item.href ? " is-active" : ""}`}
                      href={item.href}
                      title={collapsed ? t(item.label) : undefined}
                      aria-current={pathname === item.href ? "page" : undefined}
                    >
                      <span className="nav-glyph" aria-hidden="true">{item.glyph}</span>
                      <span className="nav-label">{t(item.label)}</span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="sidebar-bottom">
            <span className="sidebar-avatar">{session.name.slice(0, 1).toUpperCase()}</span>
            <span className="sidebar-user"><strong>{session.name}</strong><small>{session.email}</small></span>
            <button className="sidebar-signout" onClick={signOut} disabled={signingOut} aria-label={t("Sign out")} title={t("Sign out")}>↗</button>
          </div>
        </aside>

        {mobileOpen && <button className="erp-mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label={t("Close navigation")} />}

        <main className="erp-main" id="nexus-content">
          <header className="erp-topbar">
            <div className="topbar-left">
              <button className="mobile-menu-button" onClick={() => setMobileOpen((current) => !current)} aria-label={t("Open navigation")} aria-expanded={mobileOpen}>☰</button>
              <div className="company-select-wrap">
                <span className="topbar-overline">{t("CURRENT COMPANY")}</span>
                <select value={companyId} onChange={switchCompany} disabled={switching || session.memberships.length === 0} aria-label={t("Current company")}>
                  {session.memberships.length === 0 && <option value="">{t("No company available")}</option>}
                  {session.memberships.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select>
              </div>
            </div>
            <div className="topbar-tools">
              <div className="global-search" ref={searchBoxRef}>
                <label className="global-search-field">
                  <span aria-hidden="true">⌕</span>
                  <input
                    ref={searchInputRef}
                    value={query}
                    onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
                    onFocus={() => setSearchOpen(true)}
                    placeholder={t("Search records, documents or pages")}
                    aria-label={t("Search workspace records, documents and pages")}
                    aria-expanded={showSearchPanel}
                    aria-controls="nexus-global-search-results"
                    role="combobox"
                  />
                  <kbd aria-hidden="true">/</kbd>
                </label>
                {showSearchPanel && (
                  <div className="search-panel" id="nexus-global-search-results" role="listbox">
                    {pageMatches.length > 0 && (
                      <div className="search-group">
                        <span className="search-group-label">{t("Workspace pages")}</span>
                        {pageMatches.map((item) => <Link key={item.id} href={item.href} onClick={() => { setSearchOpen(false); setQuery(""); }} className="search-result"><span className="search-result-icon">⌂</span><span><strong>{item.title}</strong><small>{item.detail}</small></span></Link>)}
                      </div>
                    )}
                    {searchLoading && <p className="search-status">{t("Searching company records…")}</p>}
                    {searchError && <p className="search-status search-status-error" role="alert">{searchError}</p>}
                    {!searchLoading && searchResults?.groups.map((group) => (
                      <div className="search-group" key={group.key}>
                        <span className="search-group-label">{t(SEARCH_GROUP_KEYS[group.key] ?? group.label)}</span>
                        {group.items.map((item) => <Link key={`${group.key}-${item.id}`} href={item.href} onClick={() => { setSearchOpen(false); setQuery(""); }} className="search-result"><span className="search-result-icon">{searchGlyph(group.key)}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span></Link>)}
                      </div>
                    ))}
                    {showSearchEmpty && <p className="search-status">{t("No records or pages match “{query}”.", { query: query.trim() })}</p>}
                    <p className="search-hint">{t("Searches customers, inventory, quotations, orders and invoices in the active company.")}</p>
                  </div>
                )}
              </div>

              <div className="notification-wrap" ref={notificationBoxRef}>
                {access.can("reports.read") && (
                  <button className="icon-button topbar-icon" onClick={() => setNotificationOpen((current) => !current)} aria-label={`${t("Notifications")}${unreadCount ? ` (${unreadCount})` : ""}`} aria-expanded={notificationOpen} title={t("Notifications")}>
                    <span aria-hidden="true">◔</span>
                    {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
                  </button>
                )}
                {notificationOpen && access.can("reports.read") && (
                  <div className="notification-panel">
                    <div className="popover-heading"><div><span className="popover-eyebrow">{t("NOTIFICATION CENTER")}</span><strong>{t("Operational alerts")}</strong></div><button className="text-button" onClick={markAllNotificationsRead} disabled={notifications.length === 0}>{t("Mark all read")}</button></div>
                    {notificationsLoading ? <p className="search-status">{t("Loading live alerts…")}</p> : notificationError ? <p className="search-status search-status-error" role="alert">{notificationError}</p> : notifications.length === 0 ? <div className="popover-empty"><span>✓</span><strong>{t("All clear")}</strong><p>{t("No overdue invoices, low-stock items or pending follow-ups.")}</p></div> : <div className="notification-list">{notifications.map((item) => <Link key={item.id} href={item.href} className={`notification-item${readIds.includes(item.id) ? " is-read" : ""}`} onClick={() => { markNotificationRead(item.id); setNotificationOpen(false); }}><span className={`notification-dot notification-${item.severity}`} aria-hidden="true" /><span><strong>{item.titleKey ? t(item.titleKey, item.titleParams) : item.title}</strong><small>{item.detailKey ? t(item.detailKey, item.detailParams) : item.detail}</small><em>{formatDate(baseLocale, item.createdAt, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })}</em></span></Link>)}</div>}
                    <p className="popover-foot">{t("Alerts are derived from live tenant records in the active company.")}</p>
                  </div>
                )}
              </div>

              <label className="locale-select-wrap">
                <span className="sr-only">{t("Interface language")}</span>
                <select value={baseLocale} onChange={changeLocale} disabled={localeBusy} aria-label={t("Interface language")} title={t("Interface language")}>
                  <option value="en">EN</option>
                  <option value="fr">FR</option>
                  <option value="ar">العربية</option>
                  <option value="de">DE</option>
                </select>
              </label>

              <button className="theme-button" onClick={toggleTheme} aria-label={t(theme === "light" ? "Switch to dark theme" : "Switch to light theme")} title={t(theme === "light" ? "Switch to dark theme" : "Switch to light theme")}>
                <span aria-hidden="true">{theme === "light" ? "◐" : "☼"}</span>
                <span className="theme-label">{t(theme === "light" ? "Dark" : "Light")}</span>
              </button>

              <div className="profile-wrap" ref={profileBoxRef}>
                <button className="profile-chip" onClick={() => setProfileOpen((current) => !current)} aria-label={t("Open profile menu")} aria-expanded={profileOpen}>
                  <span className="profile-avatar">{session.name.slice(0, 1).toUpperCase()}</span>
                  <span className="profile-copy"><strong>{session.name}</strong><small>{activeRole}</small></span>
                  <span className="profile-chevron" aria-hidden="true">⌄</span>
                </button>
                {profileOpen && (
                  <div className="profile-menu">
                    <div className="profile-menu-head"><span className="profile-avatar profile-avatar-large">{session.name.slice(0, 1).toUpperCase()}</span><span><strong>{session.name}</strong><small>{session.email}</small><em>{activeRole}{activeCompany ? ` · ${activeCompany.name}` : ""}</em></span></div>
                    <div className="profile-menu-links">
                      {access.can("company.read") && <Link href="/app/settings" onClick={() => setProfileOpen(false)}>{t("Company settings")}</Link>}
                      {access.can("administration.read") && <Link href="/app/roles" onClick={() => setProfileOpen(false)}>{t("Roles & permissions")}</Link>}
                      <Link href="/app/security" onClick={() => setProfileOpen(false)}>{t("Sessions & security")}</Link>
                    </div>
                    <button className="profile-signout" onClick={signOut} disabled={signingOut}>{signingOut ? t("Signing out…") : t("Sign out")}<span aria-hidden="true">↗</span></button>
                  </div>
                )}
              </div>
            </div>
          </header>
          {error && <div className="erp-toast" role="alert">{error}<button className="toast-close" onClick={() => setError("")} aria-label={t("Dismiss error")}>×</button></div>}
          <div className="erp-content">
            <nav className="erp-breadcrumbs" aria-label={t("Breadcrumb")}>
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.href + index}>
                  {index > 0 && <span className="breadcrumb-separator" aria-hidden="true">/</span>}
                  {index === breadcrumbs.length - 1 ? <span aria-current="page">{crumb.label}</span> : <Link href={crumb.href}>{crumb.label}</Link>}
                </span>
              ))}
            </nav>
            {children}
          </div>
        </main>
      </div>
      </I18nProvider>
    </SessionProvider>
  );
}

function searchGlyph(group: string) {
  switch (group) {
    case "customers":
      return "◎";
    case "products":
      return "▤";
    case "invoices":
      return "▧";
    case "orders":
      return "↗";
    case "quotations":
      return "▱";
    default:
      return "•";
  }
}
