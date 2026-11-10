"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { CompanyMembership, useNexusSession, usePermissions } from "./session-context";

const LOCALE_OPTIONS = ["en", "fr-MA", "ar-MA", "de-DE"];

export function CompaniesView() {
  const session = useNexusSession();
  const router = useRouter();
  const { t } = useI18n();
  const [companyName, setCompanyName] = useState("");
  const [countryCode, setCountryCode] = useState("MA");
  const [currencyCode, setCurrencyCode] = useState("MAD");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiRequest("/companies", { method: "POST", body: JSON.stringify({ companyName, countryCode, currencyCode, defaultLocale: "fr-MA", timeZone: "Africa/Casablanca" }) });
      setCompanyName("");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("The company could not be created."));
    } finally {
      setBusy(false);
    }
  }

  return <section><div className="page-heading"><div><span className="page-eyebrow">{t("COMPANY MANAGEMENT")}</span><h1>{t("Company workspaces")}</h1><p>{t("Each company is isolated by its own verified membership and database tenant policy.")}</p></div></div>
    <div className="workspace-grid company-management-grid"><article className="workspace-panel"><div className="panel-heading"><div><span className="page-eyebrow">{t("MEMBERSHIPS")}</span><h2>{t("Your companies")}</h2></div><span className="count-badge">{session.memberships.length}</span></div>
      {session.memberships.length ? <div className="company-list">{session.memberships.map((company) => <CompanyCard company={company} active={company.id === session.activeCompanyId} key={company.id} />)}</div> : <div className="empty-state"><span>▦</span><h3>{t("No companies")}</h3><p>{t("Create your first workspace with the form beside this list.")}</p></div>}
    </article>
    <article className="workspace-panel create-panel"><span className="page-eyebrow">{t("NEW WORKSPACE")}</span><h2>{t("Add a company")}</h2><p>{t("The signed-in user becomes the company owner. NEXUS validates this membership before setting tenant access.")}</p><form className="company-form" onSubmit={createCompany}><label className="auth-field"><span>{t("Company name")}</span><input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required minLength={2} maxLength={180} /></label><div className="form-row"><label className="auth-field"><span>{t("Country code")}</span><input value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" /></label><label className="auth-field"><span>{t("Base currency")}</span><input value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" /></label></div>{error && <p className="auth-alert" role="alert">{error}</p>}<button className="auth-submit" type="submit" disabled={busy}>{busy ? t("Creating…") : t("Create company workspace")}<span aria-hidden="true">→</span></button></form></article></div>
  </section>;
}

function CompanyCard({ company, active }: { company: CompanyMembership; active: boolean }) {
  const { t } = useI18n();
  return <div className="company-row"><span className="company-symbol">{company.name.slice(0, 1).toUpperCase()}</span><div className="company-row-main"><strong>{company.name}</strong><small>{company.countryCode} · {company.currencyCode} · {company.timeZone}</small></div><div className="company-meta"><span className={`status-pill${active ? " status-pill-active" : ""}`}>{active ? t("ACTIVE") : t("AVAILABLE")}</span><small>{company.role.name}</small></div></div>;
}

type SessionRecord = { id: string; createdAt: string; lastSeenAt: string; expiresAt: string; activeCompanyId: string | null; current: boolean };

export function SecurityView() {
  const router = useRouter();
  const { t, date: formatDate } = useI18n();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function loadSessions() {
    setLoading(true);
    setError("");
    try {
      setSessions(await apiRequest<SessionRecord[]>("/auth/sessions"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Sessions could not be loaded."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadSessions(); }, []);

  async function revoke(session: SessionRecord) {
    setBusyId(session.id);
    setError("");
    try {
      await apiRequest(`/auth/sessions/${session.id}`, { method: "DELETE" });
      if (session.current) window.location.assign("/login");
      else await loadSessions();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("The session could not be revoked."));
    } finally {
      setBusyId("");
    }
  }

  return <section><div className="page-heading"><div><span className="page-eyebrow">{t("ACCOUNT SECURITY")}</span><h1>{t("Sign-in sessions")}</h1><p>{t("Review your active sessions and revoke access you no longer use.")}</p></div><button className="secondary-action" onClick={() => void loadSessions()} disabled={loading}>{t("Refresh")} <span aria-hidden="true">↻</span></button></div>
    {error && <p className="auth-alert" role="alert">{error}</p>}
    <article className="workspace-panel"><div className="panel-heading"><div><span className="page-eyebrow">{t("CURRENT DEVICES")}</span><h2>{t("Active sessions")}</h2></div>{!loading && <span className="count-badge">{sessions.length}</span>}</div>
      {loading ? <p className="loading-state">{t("Loading your sessions…")}</p> : sessions.length ? <div className="session-list">{sessions.map((session) => <div className="session-row" key={session.id}><span className="session-symbol">{session.current ? "●" : "○"}</span><div className="company-row-main"><strong>{session.current ? t("This session") : t("Signed-in session")}</strong><small>{t("Last activity {date} · Expires {expires}", { date: formatDate(session.lastSeenAt), expires: formatDate(session.expiresAt) })}</small></div><button className="danger-button" onClick={() => void revoke(session)} disabled={busyId === session.id}>{busyId === session.id ? t("Revoking…") : t("Revoke")}</button></div>)}</div> : <div className="empty-state"><span>◈</span><h3>{t("No active sessions")}</h3><p>{t("Refresh the page to create a new session.")}</p><button className="secondary-action" onClick={() => router.refresh()}>{t("Refresh account")}</button></div>}
    </article>
  </section>;
}

type CompanyProfile = {
  id: string;
  name: string;
  legalName: string | null;
  slug: string;
  countryCode: string;
  currencyCode: string;
  defaultLocale: string;
  timeZone: string;
  fiscalYearStartMonth: number;
};

export function CompanySettingsView() {
  const access = usePermissions();
  const { t, date: formatDate } = useI18n();
  const canUpdate = access.can("company.update");
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let current = true;
    void apiRequest<CompanyProfile>("/companies/current").then((value) => {
      if (current) setProfile(value);
    }).catch((reason: unknown) => {
      if (current) setError(reason instanceof Error ? reason.message : t("Company settings could not be loaded."));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      legalName: String(form.get("legalName") ?? ""),
      countryCode: String(form.get("countryCode") ?? "").toUpperCase(),
      currencyCode: String(form.get("currencyCode") ?? "").toUpperCase(),
      defaultLocale: String(form.get("defaultLocale") ?? ""),
      timeZone: String(form.get("timeZone") ?? ""),
      fiscalYearStartMonth: Number(form.get("fiscalYearStartMonth")),
    };
    try {
      const updated = await apiRequest<CompanyProfile>("/companies/current", { method: "PATCH", body: JSON.stringify(payload) });
      setProfile(updated);
      setNotice(t("Company settings saved."));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Company settings could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  if (!access.can("company.read")) {
    return <section><div className="page-heading"><div><span className="page-eyebrow">{t("COMPANY MANAGEMENT")}</span><h1>{t("Company settings")}</h1></div></div><div className="empty-state"><h3>{t("Company settings are restricted")}</h3><p>{t("Your role does not include the company.read permission.")}</p></div></section>;
  }

  const localeLabel = (locale: string) => {
    if (locale === "en") return t("English");
    if (locale === "fr-MA" || locale === "fr") return t("French (Morocco)");
    if (locale === "ar-MA" || locale === "ar") return t("Arabic (Morocco)");
    if (locale === "de-DE" || locale === "de") return t("German");
    return locale;
  };

  return <section>
    <div className="page-heading"><div><span className="page-eyebrow">{t("COMPANY MANAGEMENT")}</span><h1>{t("Company settings")}</h1><p>{t("Maintain the active workspace profile and regional defaults.")}</p></div></div>
    {loading ? <article className="workspace-panel"><p className="loading-state">{t("Loading company settings…")}</p></article> : !profile ? <article className="workspace-panel"><p className="auth-alert" role="alert">{error || t("No active company was selected.")}</p></article> : <article className="workspace-panel settings-panel">
      <div className="panel-heading"><div><span className="page-eyebrow">{t("ACTIVE WORKSPACE")}</span><h2>{profile.name}</h2></div><span className="status-pill status-pill-active">{profile.slug}</span></div>
      <form className="company-form settings-form" onSubmit={save}>
        <fieldset className="settings-fieldset" disabled={!canUpdate}>
        <div className="settings-form-grid">
          <label className="auth-field"><span>{t("Display name")}</span><input name="name" defaultValue={profile.name} required minLength={2} maxLength={180} /></label>
          <label className="auth-field"><span>{t("Legal name")}</span><input name="legalName" defaultValue={profile.legalName ?? ""} maxLength={240} /></label>
          <label className="auth-field"><span>{t("Country code")}</span><input name="countryCode" defaultValue={profile.countryCode} required pattern="[A-Za-z]{2}" maxLength={2} /></label>
          <label className="auth-field"><span>{t("Base currency")}</span><input name="currencyCode" defaultValue={profile.currencyCode} required pattern="[A-Za-z]{3}" maxLength={3} /></label>
          <label className="auth-field"><span>{t("Default language")}</span><select name="defaultLocale" defaultValue={profile.defaultLocale}>{LOCALE_OPTIONS.map((option) => <option key={option} value={option}>{localeLabel(option)}</option>)}</select></label>
          <label className="auth-field"><span>{t("Time zone")}</span><input name="timeZone" defaultValue={profile.timeZone} required maxLength={80} /></label>
          <label className="auth-field"><span>{t("Fiscal year starts")}</span><select name="fiscalYearStartMonth" defaultValue={profile.fiscalYearStartMonth}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{formatDate(new Date(2024, index, 1), { month: "long", timeZone: "UTC" })}</option>)}</select></label>
        </div>
        </fieldset>
        <p className="settings-help">{canUpdate ? t("Company profile writes are checked against the active role and recorded in the tenant audit log.") : t("You can review company settings, but your role does not allow changes.")}</p>
        {error && <p className="auth-alert" role="alert">{error}</p>}
        {notice && <p className="success-alert" role="status">{notice}</p>}
        {canUpdate && <div className="settings-actions"><button className="auth-submit" type="submit" disabled={saving}>{saving ? t("Saving…") : t("Save company settings")}<span aria-hidden="true">→</span></button></div>}
      </form>
    </article>}
  </section>;
}
