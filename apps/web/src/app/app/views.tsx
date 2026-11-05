"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, formatApiDate } from "../../lib/api";
import { CompanyMembership, useNexusSession } from "./session-context";

export function DashboardView() {
  const session = useNexusSession();
  const activeCompany = session.memberships.find((company) => company.id === session.activeCompanyId);
  return (
    <section>
      <div className="page-heading"><div><span className="page-eyebrow">WORKSPACE OVERVIEW</span><h1>Good to have you, {session.name.split(" ")[0]}.</h1><p>Manage your company access and account from one secure place.</p></div><Link className="primary-action" href="/app/companies">Manage companies <span aria-hidden="true">→</span></Link></div>
      <div className="summary-grid">
        <article className="summary-card"><div className="summary-icon">▦</div><span>COMPANIES YOU CAN ACCESS</span><strong>{session.memberships.length}</strong><small>Active company memberships</small></article>
        <article className="summary-card"><div className="summary-icon">◈</div><span>ACTIVE WORKSPACE</span><strong className="summary-name">{activeCompany?.name ?? "Not selected"}</strong><small>{activeCompany?.role.name ?? "Select a company to continue"}</small></article>
        <article className="summary-card"><div className="summary-icon">✓</div><span>ACCOUNT STATUS</span><strong className="summary-name">{session.emailVerifiedAt ? "Verified" : "Unverified"}</strong><small>{session.mfaEnabled ? "Multi-factor sign-in enabled" : "Password sign-in"}</small></article>
      </div>
      <div className="workspace-grid">
        <article className="workspace-panel"><div className="panel-heading"><div><span className="page-eyebrow">YOUR COMPANIES</span><h2>Company workspaces</h2></div><Link href="/app/companies">View all <span aria-hidden="true">→</span></Link></div>
          {session.memberships.length ? <div className="company-list">{session.memberships.slice(0, 4).map((company) => <div className="company-row" key={company.id}><span className="company-symbol">{company.name.slice(0, 1).toUpperCase()}</span><div className="company-row-main"><strong>{company.name}</strong><small>{company.countryCode} · {company.currencyCode} · {company.role.name}</small></div><span className={`status-pill${company.id === session.activeCompanyId ? " status-pill-active" : ""}`}>{company.id === session.activeCompanyId ? "ACTIVE" : "MEMBER"}</span></div>)}</div> : <div className="empty-state"><span>▦</span><h3>No company workspaces yet</h3><p>Create a workspace to begin organizing your business.</p><Link className="primary-action" href="/app/companies">Create a company</Link></div>}
        </article>
        <article className="workspace-panel account-panel"><span className="page-eyebrow">ACCOUNT</span><h2>Profile and security</h2><p>Your identity and sign-in protection for NEXUS ERP MS.</p><dl className="account-details"><div><dt>Name</dt><dd>{session.name}</dd></div><div><dt>Email</dt><dd>{session.email}</dd></div><div><dt>Email verification</dt><dd>{session.emailVerifiedAt ? "Verified" : "Pending"}</dd></div><div><dt>Account created</dt><dd>{formatApiDate(session.createdAt)}</dd></div></dl><Link className="quiet-link" href="/app/security">Review active sessions <span aria-hidden="true">→</span></Link></article>
      </div>
      <p className="phase-note"><span>PHASE 2</span> Company onboarding and identity are connected to the API. Business modules will appear as their database workflows are implemented.</p>
    </section>
  );
}

export function CompaniesView() {
  const session = useNexusSession();
  const router = useRouter();
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
      setError(reason instanceof Error ? reason.message : "The company could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return <section><div className="page-heading"><div><span className="page-eyebrow">COMPANY MANAGEMENT</span><h1>Company workspaces</h1><p>Each company is isolated by its own verified membership and database tenant policy.</p></div></div>
    <div className="workspace-grid company-management-grid"><article className="workspace-panel"><div className="panel-heading"><div><span className="page-eyebrow">MEMBERSHIPS</span><h2>Your companies</h2></div><span className="count-badge">{session.memberships.length}</span></div>
      {session.memberships.length ? <div className="company-list">{session.memberships.map((company) => <CompanyCard company={company} active={company.id === session.activeCompanyId} key={company.id} />)}</div> : <div className="empty-state"><span>▦</span><h3>No companies</h3><p>Create your first workspace with the form beside this list.</p></div>}
    </article>
    <article className="workspace-panel create-panel"><span className="page-eyebrow">NEW WORKSPACE</span><h2>Add a company</h2><p>The signed-in user becomes the company owner. NEXUS validates this membership before setting tenant access.</p><form className="company-form" onSubmit={createCompany}><label className="auth-field"><span>Company name</span><input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required minLength={2} maxLength={180} /></label><div className="form-row"><label className="auth-field"><span>Country code</span><input value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" /></label><label className="auth-field"><span>Base currency</span><input value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" /></label></div>{error && <p className="auth-alert" role="alert">{error}</p>}<button className="auth-submit" type="submit" disabled={busy}>{busy ? "Creating…" : "Create company workspace"}<span aria-hidden="true">→</span></button></form></article></div>
  </section>;
}

function CompanyCard({ company, active }: { company: CompanyMembership; active: boolean }) {
  return <div className="company-row"><span className="company-symbol">{company.name.slice(0, 1).toUpperCase()}</span><div className="company-row-main"><strong>{company.name}</strong><small>{company.countryCode} · {company.currencyCode} · {company.timeZone}</small></div><div className="company-meta"><span className={`status-pill${active ? " status-pill-active" : ""}`}>{active ? "ACTIVE" : "AVAILABLE"}</span><small>{company.role.name}</small></div></div>;
}

type SessionRecord = { id: string; createdAt: string; lastSeenAt: string; expiresAt: string; activeCompanyId: string | null; current: boolean };

export function SecurityView() {
  const router = useRouter();
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
      setError(reason instanceof Error ? reason.message : "Sessions could not be loaded.");
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
      setError(reason instanceof Error ? reason.message : "The session could not be revoked.");
    } finally {
      setBusyId("");
    }
  }

  return <section><div className="page-heading"><div><span className="page-eyebrow">ACCOUNT SECURITY</span><h1>Sign-in sessions</h1><p>Review your active sessions and revoke access you no longer use.</p></div><button className="secondary-action" onClick={() => void loadSessions()} disabled={loading}>Refresh <span aria-hidden="true">↻</span></button></div>
    {error && <p className="auth-alert" role="alert">{error}</p>}
    <article className="workspace-panel"><div className="panel-heading"><div><span className="page-eyebrow">CURRENT DEVICES</span><h2>Active sessions</h2></div>{!loading && <span className="count-badge">{sessions.length}</span>}</div>
      {loading ? <p className="loading-state">Loading your sessions…</p> : sessions.length ? <div className="session-list">{sessions.map((session) => <div className="session-row" key={session.id}><span className="session-symbol">{session.current ? "●" : "○"}</span><div className="company-row-main"><strong>{session.current ? "This session" : "Signed-in session"}</strong><small>Last activity {formatApiDate(session.lastSeenAt)} · Expires {formatApiDate(session.expiresAt)}</small></div><button className="danger-button" onClick={() => void revoke(session)} disabled={busyId === session.id}>{busyId === session.id ? "Revoking…" : "Revoke"}</button></div>)}</div> : <div className="empty-state"><span>◈</span><h3>No active sessions</h3><p>Refresh the page to create a new session.</p><button className="secondary-action" onClick={() => router.refresh()}>Refresh account</button></div>}
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
      if (current) setError(reason instanceof Error ? reason.message : "Company settings could not be loaded.");
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
      setNotice("Company settings saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Company settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <section>
    <div className="page-heading"><div><span className="page-eyebrow">COMPANY MANAGEMENT</span><h1>Company settings</h1><p>Maintain the active workspace profile and regional defaults.</p></div></div>
    {loading ? <article className="workspace-panel"><p className="loading-state">Loading company settings…</p></article> : !profile ? <article className="workspace-panel"><p className="auth-alert" role="alert">{error || "No active company was selected."}</p></article> : <article className="workspace-panel settings-panel">
      <div className="panel-heading"><div><span className="page-eyebrow">ACTIVE WORKSPACE</span><h2>{profile.name}</h2></div><span className="status-pill status-pill-active">{profile.slug}</span></div>
      <form className="company-form settings-form" onSubmit={save}>
        <div className="settings-form-grid">
          <label className="auth-field"><span>Display name</span><input name="name" defaultValue={profile.name} required minLength={2} maxLength={180} /></label>
          <label className="auth-field"><span>Legal name</span><input name="legalName" defaultValue={profile.legalName ?? ""} maxLength={240} /></label>
          <label className="auth-field"><span>Country code</span><input name="countryCode" defaultValue={profile.countryCode} required pattern="[A-Za-z]{2}" maxLength={2} /></label>
          <label className="auth-field"><span>Base currency</span><input name="currencyCode" defaultValue={profile.currencyCode} required pattern="[A-Za-z]{3}" maxLength={3} /></label>
          <label className="auth-field"><span>Default language</span><select name="defaultLocale" defaultValue={profile.defaultLocale}><option value="en">English</option><option value="fr-MA">Français (Maroc)</option><option value="ar-MA">العربية (المغرب)</option></select></label>
          <label className="auth-field"><span>Time zone</span><input name="timeZone" defaultValue={profile.timeZone} required maxLength={80} /></label>
          <label className="auth-field"><span>Fiscal year starts</span><select name="fiscalYearStartMonth" defaultValue={profile.fiscalYearStartMonth}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2024, index, 1))}</option>)}</select></label>
        </div>
        <p className="settings-help">Company profile writes are checked against the active role and recorded in the tenant audit log.</p>
        {error && <p className="auth-alert" role="alert">{error}</p>}
        {notice && <p className="success-alert" role="status">{notice}</p>}
        <div className="settings-actions"><button className="auth-submit" type="submit" disabled={saving}>{saving ? "Saving…" : "Save company settings"}<span aria-hidden="true">→</span></button></div>
      </form>
    </article>}
  </section>;
}

type PermissionRecord = { key: string; module: string; action: string; description: string | null };
type RoleRecord = { id: string; key: string; name: string; description: string | null; isSystem: boolean; permissions: Array<{ key: string; module: string; action: string }> };
type MembershipRecord = { id: string; userId: string; status: string; user: { name: string; email: string }; role: { key: string; name: string } };

export function RolesView() {
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [draftPermissionKeys, setDraftPermissionKeys] = useState<string[]>([]);
  const [memberRoleIds, setMemberRoleIds] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;
  const groupedPermissions = useMemo(() => permissions.reduce<Record<string, PermissionRecord[]>>((groups, permission) => {
    (groups[permission.module] ??= []).push(permission);
    return groups;
  }, {}), [permissions]);
  const filteredMemberships = memberships.filter((membership) => `${membership.user.name} ${membership.user.email} ${membership.role.name}`.toLowerCase().includes(filter.toLowerCase()));
  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(filteredMemberships.length / pageSize));
  const visibleMemberships = filteredMemberships.slice(page * pageSize, (page + 1) * pageSize);

  async function loadAdministration() {
    setLoading(true);
    setError("");
    try {
      const [permissionData, roleData, membershipData] = await Promise.all([
        apiRequest<PermissionRecord[]>("/permissions"),
        apiRequest<RoleRecord[]>("/roles"),
        apiRequest<MembershipRecord[]>("/memberships"),
      ]);
      setPermissions(permissionData);
      setRoles(roleData);
      setMemberships(membershipData);
      setMemberRoleIds(Object.fromEntries(membershipData.map((membership) => [membership.id, roleData.find((role) => role.key === membership.role.key)?.id ?? ""])));
      setSelectedRoleId((existing) => roleData.some((role) => role.id === existing) ? existing : roleData[0]?.id ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Administration data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAdministration(); }, []);
  useEffect(() => { setDraftPermissionKeys(selectedRole?.permissions.map(({ key }) => key) ?? []); }, [selectedRoleId]);
  useEffect(() => { setPage(0); }, [filter]);

  function togglePermission(key: string) {
    setDraftPermissionKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function savePermissions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRole || selectedRole.isSystem) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await apiRequest<{ id: string; key: string; name: string; permissions: string[] }>(`/roles/${selectedRole.id}/permissions`, { method: "PATCH", body: JSON.stringify({ permissionKeys: draftPermissionKeys }) });
      setRoles((current) => current.map((role) => role.id === updated.id ? { ...role, permissions: permissions.filter(({ key }) => updated.permissions.includes(key)) } : role));
      setNotice(`Permissions saved for ${selectedRole.name}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Role permissions could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newName.trim() || !newKey || !permissions.some(({ key }) => key === "company.read")) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const created = await apiRequest<{ id: string; key: string; name: string; description: string; isSystem: boolean; permissions: string[] }>("/roles", {
        method: "POST",
        body: JSON.stringify({ key: newKey, name: newName.trim(), description: newDescription.trim(), permissionKeys: ["company.read"] }),
      });
      await loadAdministration();
      setSelectedRoleId(created.id);
      setNewName("");
      setNewKey("");
      setNewDescription("");
      setNotice(`${created.name} created with company.read. Adjust its permissions in the editor.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The role could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function assignRole(membership: MembershipRecord) {
    const roleId = memberRoleIds[membership.id];
    if (!roleId) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/memberships/${membership.id}/role`, { method: "PATCH", body: JSON.stringify({ roleId }) });
      await loadAdministration();
      setNotice(`Role updated for ${membership.user.name}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The membership role could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  return <section>
    <div className="page-heading"><div><span className="page-eyebrow">ACCESS ADMINISTRATION</span><h1>Roles & permissions</h1><p>Manage company roles, permission grants and active member assignments.</p></div><button className="secondary-action" onClick={() => void loadAdministration()} disabled={loading}>Refresh <span aria-hidden="true">↻</span></button></div>
    {error && <p className="auth-alert" role="alert">{error}</p>}{notice && <p className="success-alert" role="status">{notice}</p>}
    {loading ? <article className="workspace-panel"><p className="loading-state">Loading roles and memberships…</p></article> : <>
      <div className="summary-grid admin-summary"><article className="summary-card"><span>COMPANY ROLES</span><strong>{roles.length}</strong><small>System and custom roles</small></article><article className="summary-card"><span>PERMISSION KEYS</span><strong>{permissions.length}</strong><small>Available to this company</small></article><article className="summary-card"><span>ACTIVE MEMBERS</span><strong>{memberships.length}</strong><small>Company access assignments</small></article></div>
      <div className="workspace-grid roles-layout">
        <article className="workspace-panel roles-editor"><div className="panel-heading"><div><span className="page-eyebrow">ROLE CATALOG</span><h2>Permission editor</h2></div></div>
          {roles.length ? <><label className="auth-field"><span>Choose a role</span><select value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)}>{roles.map((role) => <option value={role.id} key={role.id}>{role.name}{role.isSystem ? " · system" : ""}</option>)}</select></label>
            {selectedRole && <form className="role-permission-form" onSubmit={savePermissions}><div className="role-editor-heading"><div><strong>{selectedRole.name}</strong><small>{selectedRole.description || selectedRole.key}</small></div><span className="status-pill">{selectedRole.isSystem ? "SYSTEM ROLE" : "CUSTOM ROLE"}</span></div>
              <div className="permission-groups">{Object.entries(groupedPermissions).map(([module, modulePermissions]) => <fieldset className="permission-group" key={module}><legend>{module}</legend>{modulePermissions.map((permission) => <label className="permission-option" key={permission.key}><input type="checkbox" checked={draftPermissionKeys.includes(permission.key)} disabled={selectedRole.isSystem} onChange={() => togglePermission(permission.key)} /><span><strong>{permission.action}</strong><small>{permission.key}</small></span></label>)}</fieldset>)}</div>
              {selectedRole.isSystem ? <p className="settings-help">System role definitions are protected. Create a custom role to change permission grants.</p> : <div className="settings-actions"><button className="auth-submit" type="submit" disabled={saving}>{saving ? "Saving…" : "Save permissions"}<span aria-hidden="true">→</span></button></div>}
            </form>}
          </> : <div className="empty-state"><h3>No roles found</h3><p>Seed the company permissions before managing access.</p></div>}
        </article>
        <article className="workspace-panel create-panel"><span className="page-eyebrow">CUSTOM ACCESS</span><h2>Create a role</h2><p>New roles start with company profile access. Expand the permission set after creating the role.</p><form className="company-form" onSubmit={createRole}>
          <label className="auth-field"><span>Role name</span><input value={newName} onChange={(event) => { const value = event.target.value; setNewName(value); setNewKey(value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80)); }} required minLength={2} maxLength={120} /></label>
          <label className="auth-field"><span>Role key</span><input value={newKey} onChange={(event) => setNewKey(event.target.value.toLowerCase())} required pattern="[a-z][a-z0-9_]{1,79}" maxLength={80} /></label>
          <label className="auth-field"><span>Description</span><textarea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} maxLength={500} rows={3} /></label>
          <button className="auth-submit" type="submit" disabled={saving || !permissions.length}>{saving ? "Saving…" : "Create custom role"}<span aria-hidden="true">→</span></button>
        </form></article>
      </div>
      <article className="workspace-panel membership-panel"><div className="panel-heading"><div><span className="page-eyebrow">COMPANY MEMBERS</span><h2>Role assignments</h2></div><span className="count-badge">{memberships.length}</span></div>
        <label className="admin-filter"><span aria-hidden="true">⌕</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter by name, email or role" aria-label="Filter company memberships" /></label>
        {visibleMemberships.length ? <div className="membership-table-wrap"><table className="membership-table"><thead><tr><th>MEMBER</th><th>STATUS</th><th>CURRENT ROLE</th><th>ASSIGN ROLE</th></tr></thead><tbody>{visibleMemberships.map((membership) => <tr key={membership.id}><td><strong>{membership.user.name}</strong><small>{membership.user.email}</small></td><td><span className="status-pill status-pill-active">{membership.status}</span></td><td>{membership.role.name}</td><td><div className="role-assignment"><select value={memberRoleIds[membership.id] ?? ""} onChange={(event) => setMemberRoleIds((current) => ({ ...current, [membership.id]: event.target.value }))} aria-label={`Role for ${membership.user.name}`}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><button className="secondary-action" onClick={() => void assignRole(membership)} disabled={saving || !memberRoleIds[membership.id]}>Save</button></div></td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>No matching members</h3><p>Try another name, email or role.</p></div>}
        {pageCount > 1 && <div className="pagination"><button className="secondary-action" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>Previous</button><span>Page {page + 1} of {pageCount}</span><button className="secondary-action" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page + 1 >= pageCount}>Next</button></div>}
      </article>
    </>}
  </section>;
}
