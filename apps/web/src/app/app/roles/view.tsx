"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../../lib/api";
import { useI18n } from "../../../lib/i18n";
import { usePermissions } from "../session-context";

type PermissionRecord = { key: string; module: string; action: string; description: string | null };
type RolePermission = { key: string; module: string; action: string };
type RoleRecord = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isOwnerRole: boolean;
  memberCount: number;
  permissions: RolePermission[];
};
type MembershipRecord = {
  id: string;
  userId: string;
  status: string;
  user: { name: string; email: string };
  role: { id: string; key: string; name: string; isSystem: boolean };
  roles: Array<{ id: string; key: string; name: string; isSystem: boolean }>;
  permissions: string[];
  isOwner: boolean;
};
type RoleMember = {
  id: string;
  userId: string;
  status: string;
  joinedAt: string | null;
  isPrimary: boolean;
  user: { name: string; email: string };
};
type RoleDialog =
  | { mode: "create"; name: string; key: string; description: string; permissionKeys: string[] }
  | { mode: "edit"; role: RoleRecord; name: string; description: string }
  | { mode: "duplicate"; role: RoleRecord; name: string; key: string }
  | null;

const MEMBER_PAGE_SIZE = 8;

const MODULE_LABELS: Record<string, string> = {
  administration: "Administration",
  company: "Company",
  crm: "CRM",
  inventory: "Inventory",
  sales: "Sales",
  finance: "Finance",
  reports: "Reports",
  platform: "Platform",
};

export function RolesView() {
  const router = useRouter();
  const { can, isOwner } = usePermissions();
  const { t, enum: enumText, number: formatNumber } = useI18n();
  const canManage = can("administration.manage");

  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [draftPermissionKeys, setDraftPermissionKeys] = useState<string[]>([]);
  const [roleMembers, setRoleMembers] = useState<RoleMember[]>([]);
  const [memberRoleDraft, setMemberRoleDraft] = useState<Record<string, string[]>>({});
  const [roleSearch, setRoleSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPage, setMemberPage] = useState(0);
  const [permissionSearch, setPermissionSearch] = useState("");
  const [tab, setTab] = useState<"permissions" | "members">("permissions");
  const [dialog, setDialog] = useState<RoleDialog>(null);
  const [confirmation, setConfirmation] = useState<{ title: string; message: string; confirmLabel: string; run: () => Promise<void> } | null>(null);
  const [assignMemberId, setAssignMemberId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;
  const groupedPermissions = useMemo(() => {
    const value = permissionSearch.trim().toLowerCase();
    const groups: Record<string, PermissionRecord[]> = {};
    for (const permission of permissions) {
      if (value && !`${permission.key} ${permission.action} ${permission.module}`.toLowerCase().includes(value)) continue;
      (groups[permission.module] ??= []).push(permission);
    }
    return groups;
  }, [permissions, permissionSearch]);
  const filteredRoles = useMemo(() => {
    const value = roleSearch.trim().toLowerCase();
    if (!value) return roles;
    return roles.filter((role) => `${role.name} ${role.key} ${role.description ?? ""}`.toLowerCase().includes(value));
  }, [roleSearch, roles]);
  const filteredMemberships = useMemo(() => {
    const value = memberSearch.trim().toLowerCase();
    if (!value) return memberships;
    return memberships.filter((member) => {
      const roleText = member.roles.map((role) => role.name).join(" ");
      return `${member.user.name} ${member.user.email} ${roleText}`.toLowerCase().includes(value);
    });
  }, [memberSearch, memberships]);
  const memberPageCount = Math.max(1, Math.ceil(filteredMemberships.length / MEMBER_PAGE_SIZE));
  const visibleMemberships = filteredMemberships.slice(memberPage * MEMBER_PAGE_SIZE, (memberPage + 1) * MEMBER_PAGE_SIZE);
  const dirty = Boolean(
    selectedRole &&
      !selectedRole.isSystem &&
      (draftPermissionKeys.length !== selectedRole.permissions.length ||
        draftPermissionKeys.some((key) => !selectedRole.permissions.some((permission) => permission.key === key))),
  );
  const assignableMembers = memberships.filter((member) => !roleMembers.some((roleMember) => roleMember.id === member.id));
  const permissionModules = Object.keys(groupedPermissions).sort();

  useEffect(() => {
    void loadAdministration();
  }, []);

  useEffect(() => {
    setDraftPermissionKeys(selectedRole?.permissions.map(({ key }) => key) ?? []);
    if (selectedRole) void loadRoleMembers(selectedRole.id);
  }, [selectedRoleId, roles]);

  useEffect(() => {
    setMemberPage(0);
  }, [memberSearch]);

  async function loadAdministration(preferredRoleId?: string) {
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
      setMemberRoleDraft(Object.fromEntries(membershipData.map((member) => [member.id, member.roles.map((role) => role.id)])));
      setSelectedRoleId((current) => {
        const candidate = preferredRoleId ?? current;
        return roleData.some((role) => role.id === candidate) ? candidate : roleData[0]?.id ?? "";
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Administration data could not be loaded."));
    } finally {
      setLoading(false);
    }
  }

  async function loadRoleMembers(roleId: string) {
    try {
      setRoleMembers(await apiRequest<RoleMember[]>(`/roles/${roleId}/members`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Role members could not be loaded."));
    }
  }

  function selectRole(roleId: string) {
    if (dirty && !window.confirm(t("Discard the unsaved permission changes for this role?"))) return;
    setSelectedRoleId(roleId);
    setAssignMemberId("");
  }

  function togglePermission(key: string) {
    setDraftPermissionKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  function toggleModule(module: string, select: boolean) {
    const keys = (groupedPermissions[module] ?? []).map((permission) => permission.key);
    setDraftPermissionKeys((current) => {
      const set = new Set(current);
      for (const key of keys) {
        if (select) set.add(key);
        else set.delete(key);
      }
      return Array.from(set);
    });
  }

  async function savePermissions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRole || selectedRole.isSystem) return;
    setBusy("permissions");
    setError("");
    setNotice("");
    try {
      const updated = await apiRequest<RoleRecord>(`/roles/${selectedRole.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissionKeys: draftPermissionKeys }),
      });
      setRoles((current) => current.map((role) => (role.id === updated.id ? updated : role)));
      setNotice(t("Permissions saved for {name}. Members with this role receive the change immediately.", { name: updated.name }));
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Role permissions could not be saved."));
    } finally {
      setBusy("");
    }
  }

  function openCreate() {
    setDialog({ mode: "create", name: "", key: "", description: "", permissionKeys: permissions.some(({ key }) => key === "company.read") ? ["company.read"] : [] });
  }

  async function submitDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    setBusy("dialog");
    setError("");
    setNotice("");
    try {
      if (dialog.mode === "create") {
        const created = await apiRequest<RoleRecord>("/roles", {
          method: "POST",
          body: JSON.stringify({ key: dialog.key, name: dialog.name.trim(), description: dialog.description.trim(), permissionKeys: dialog.permissionKeys }),
        });
        setDialog(null);
        await loadAdministration(created.id);
        setNotice(t("{name} created. Adjust its permission matrix below.", { name: created.name }));
      } else if (dialog.mode === "edit") {
        const updated = await apiRequest<RoleRecord>(`/roles/${dialog.role.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: dialog.name.trim(), description: dialog.description.trim() }),
        });
        setRoles((current) => current.map((role) => (role.id === updated.id ? updated : role)));
        setDialog(null);
        setNotice(t("{name} updated.", { name: updated.name }));
      } else {
        const duplicated = await apiRequest<RoleRecord>(`/roles/${dialog.role.id}/duplicate`, {
          method: "POST",
          body: JSON.stringify({ key: dialog.key, name: dialog.name.trim() }),
        });
        setDialog(null);
        await loadAdministration(duplicated.id);
        setNotice(t("{name} created as a copy of {source}.", { name: duplicated.name, source: dialog.role.name }));
      }
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("The role change could not be saved."));
    } finally {
      setBusy("");
    }
  }

  function requestDelete(role: RoleRecord) {
    setConfirmation({
      title: t("Delete {name}?", { name: role.name }),
      message: role.memberCount
        ? t("{count} members still hold this role. Reassign them first.", { count: role.memberCount })
        : t("This permanently removes the role and its permission grants. Audit history is retained."),
      confirmLabel: t("Delete role"),
      run: async () => {
        await apiRequest(`/roles/${role.id}`, { method: "DELETE" });
        await loadAdministration();
        setNotice(t("{name} deleted.", { name: role.name }));
        router.refresh();
      },
    });
  }

  function requestRemoveRole(member: MembershipRecord | RoleMember, role: { id: string; name: string }) {
    setConfirmation({
      title: t("Remove {name}?", { name: role.name }),
      message: t("This member will lose every permission granted by {name} immediately.", { name: role.name }),
      confirmLabel: t("Remove role"),
      run: async () => {
        await apiRequest(`/memberships/${member.id}/roles/${role.id}`, { method: "DELETE" });
        await loadAdministration(selectedRoleId);
        setNotice(t("{name} removed.", { name: role.name }));
        router.refresh();
      },
    });
  }

  async function addRoleToMember() {
    if (!selectedRole || !assignMemberId) return;
    setBusy("assign");
    setError("");
    setNotice("");
    try {
      await apiRequest(`/memberships/${assignMemberId}/roles`, { method: "POST", body: JSON.stringify({ roleId: selectedRole.id }) });
      const member = memberships.find((item) => item.id === assignMemberId);
      setAssignMemberId("");
      await loadAdministration(selectedRoleId);
      setNotice(member ? t("{role} added to {member}.", { role: selectedRole.name, member: member.user.name }) : t("{role} added.", { role: selectedRole.name }));
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("The role could not be assigned."));
    } finally {
      setBusy("");
    }
  }

  async function saveMemberRoles(member: MembershipRecord) {
    const roleIds = memberRoleDraft[member.id] ?? [];
    if (!roleIds.length) {
      setError(t("Every member must keep at least one role."));
      return;
    }
    setBusy(`member-${member.id}`);
    setError("");
    setNotice("");
    try {
      const updated = await apiRequest<MembershipRecord>(`/memberships/${member.id}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roleIds }),
      });
      setMemberships((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMemberRoleDraft((current) => ({ ...current, [updated.id]: updated.roles.map((role) => role.id) }));
      setNotice(t("Roles updated for {member}.", { member: member.user.name }));
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Member roles could not be saved."));
    } finally {
      setBusy("");
    }
  }

  function toggleMemberRole(memberId: string, roleId: string) {
    setMemberRoleDraft((current) => {
      const existing = current[memberId] ?? [];
      return {
        ...current,
        [memberId]: existing.includes(roleId) ? existing.filter((id) => id !== roleId) : [...existing, roleId],
      };
    });
  }

  if (!can("administration.read")) {
    return (
      <section>
        <div className="page-heading"><div><span className="page-eyebrow">{t("ACCESS ADMINISTRATION")}</span><h1>{t("Roles & permissions")}</h1></div></div>
        <article className="workspace-panel"><div className="empty-state"><span>♙</span><h3>{t("Administration access required")}</h3><p>{t("Ask a company administrator to grant you the administration read permission.")}</p></div></article>
      </section>
    );
  }

  return (
    <section className="roles-page">
      <div className="page-heading">
        <div>
          <span className="page-eyebrow">{t("ACCESS ADMINISTRATION")}</span>
          <h1>{t("Roles & permissions")}</h1>
          <p>{t("Define company roles, grant least-privilege permissions and manage multi-role memberships with immediate backend enforcement.")}</p>
        </div>
        <div className="page-heading-actions">
          <button className="secondary-action" onClick={() => void loadAdministration()} disabled={loading || Boolean(busy)}>{t("Refresh")} <span aria-hidden="true">↻</span></button>
          {canManage && <button className="primary-action" onClick={openCreate}>{t("New role")} <span aria-hidden="true">+</span></button>}
        </div>
      </div>

      {error && <p className="auth-alert" role="alert">{error}</p>}
      {notice && <p className="success-alert" role="status">{notice}</p>}

      {loading ? (
        <article className="workspace-panel"><p className="loading-state">{t("Loading roles, permission catalog and memberships…")}</p></article>
      ) : (
        <>
          <div className="summary-grid admin-summary">
            <article className="summary-card"><span>{t("COMPANY ROLES")}</span><strong>{roles.length}</strong><small>{t("{count} protected system roles", { count: roles.filter((role) => role.isSystem).length })}</small></article>
            <article className="summary-card"><span>{t("PERMISSION KEYS")}</span><strong>{permissions.length}</strong><small>{t("Tenant-scoped grants in the catalog")}</small></article>
            <article className="summary-card"><span>{t("ACTIVE MEMBERS")}</span><strong>{memberships.length}</strong><small>{t("Each member may hold multiple roles")}</small></article>
            <article className="summary-card"><span>{t("YOUR ACCESS")}</span><strong>{isOwner ? t("Owner") : t(permissions.length ? "Scoped" : "None")}</strong><small>{t("Effective permissions are enforced server-side on every request")}</small></article>
          </div>

          <article className="workspace-panel roles-table-panel">
            <div className="panel-heading">
              <div><span className="page-eyebrow">{t("ROLE CATALOG")}</span><h2>{t("Company roles")}</h2></div>
              <label className="admin-filter roles-filter"><span aria-hidden="true">⌕</span><input value={roleSearch} onChange={(event) => setRoleSearch(event.target.value)} placeholder={t("Search roles by name, key or description")} aria-label={t("Search roles")} /></label>
            </div>
            {filteredRoles.length ? (
              <div className="membership-table-wrap">
                <table className="membership-table roles-table">
                  <thead><tr><th>{t("ROLE")}</th><th>{t("TYPE")}</th><th>{t("MEMBERS")}</th><th>{t("PERMISSIONS")}</th><th>{t("ACTIONS")}</th></tr></thead>
                  <tbody>
                    {filteredRoles.map((role) => (
                      <tr key={role.id} className={role.id === selectedRoleId ? "is-selected-row" : ""}>
                        <td><button className="link-button role-name-button" onClick={() => selectRole(role.id)}><strong>{role.name}</strong><small>{role.key}{role.description ? ` · ${role.description}` : ""}</small></button></td>
                        <td><span className={`status-pill${role.isSystem ? " status-pill-system" : ""}`}>{role.isOwnerRole ? t("OWNER") : role.isSystem ? t("SYSTEM") : t("CUSTOM")}</span></td>
                        <td>{formatNumber(role.memberCount)}</td>
                        <td>{formatNumber(role.permissions.length)}</td>
                        <td>
                          <div className="inventory-row-actions">
                            <button className="secondary-action" onClick={() => selectRole(role.id)}>{t("Open")}</button>
                            {canManage && role.id !== "__none__" && (
                              <>
                                <button className="secondary-action" onClick={() => setDialog({ mode: "edit", role, name: role.name, description: role.description ?? "" })} disabled={role.isSystem}>{t("Edit")}</button>
                                <button className="secondary-action" onClick={() => setDialog({ mode: "duplicate", role, name: `${role.name} ${t("copy")}`, key: `${role.key}_copy`.slice(0, 80) })}>{t("Duplicate")}</button>
                                <button className="danger-button" onClick={() => requestDelete(role)} disabled={role.isSystem || role.memberCount > 0}>{t("Delete")}</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty-state"><h3>{t("No matching roles")}</h3><p>{t("Try a different name, key or description.")}</p></div>}
          </article>

          {selectedRole && (
            <article className="workspace-panel roles-editor">
              <div className="panel-heading">
                <div><span className="page-eyebrow">{t("ROLE DETAIL")}</span><h2>{selectedRole.name}</h2><p>{selectedRole.description || selectedRole.key}</p></div>
                <div className="role-editor-badges">
                  <span className="status-pill">{selectedRole.isSystem ? t("PROTECTED") : t("CUSTOM")}</span>
                  <span className="count-badge">{t("{count} members", { count: selectedRole.memberCount })}</span>
                </div>
              </div>

              <div className="role-tabs" role="tablist" aria-label={t("Role detail sections")}>
                <button role="tab" aria-selected={tab === "permissions"} className={tab === "permissions" ? "is-active" : ""} onClick={() => setTab("permissions")}>{t("Permissions")} <span className="tab-count">{draftPermissionKeys.length}</span></button>
                <button role="tab" aria-selected={tab === "members"} className={tab === "members" ? "is-active" : ""} onClick={() => setTab("members")}>{t("Members")} <span className="tab-count">{roleMembers.length}</span></button>
              </div>

              {tab === "permissions" ? (
                <div className="role-permission-browser">
                  {selectedRole.isSystem && <p className="settings-help">{t("System roles are protected from edits so no administrator can accidentally remove owner or administrator access. Duplicate this role to customise its grants.")}</p>}
                  <div className="permission-toolbar">
                    <label className="admin-filter"><span aria-hidden="true">⌕</span><input value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} placeholder={t("Filter permission keys")} aria-label={t("Filter permissions")} /></label>
                    {canManage && !selectedRole.isSystem && (
                      <div className="permission-toolbar-actions">
                        <button className="secondary-action" type="button" disabled={Boolean(busy) || !permissionModules.length} onClick={() => setDraftPermissionKeys(permissions.map(({ key }) => key))}>{t("Select all")}</button>
                        <button className="secondary-action" type="button" disabled={Boolean(busy)} onClick={() => setDraftPermissionKeys([])}>{t("Clear")}</button>
                      </div>
                    )}
                  </div>
                  <form onSubmit={savePermissions} className="role-permission-form">
                    {permissionModules.length ? (
                      <div className="permission-groups">
                        {permissionModules.map((module) => {
                          const modulePermissions = groupedPermissions[module] ?? [];
                          const allSelected = modulePermissions.every((permission) => draftPermissionKeys.includes(permission.key));
                          return (
                            <fieldset className="permission-group" key={module}>
                              <legend>
                                <span>{t(MODULE_LABELS[module] ?? module)}</span>
                                {canManage && !selectedRole.isSystem && (
                                  <button type="button" className="text-button" onClick={() => toggleModule(module, !allSelected)}>{allSelected ? t("Clear module") : t("Select module")}</button>
                                )}
                              </legend>
                              {modulePermissions.map((permission) => (
                                <label className="permission-option" key={permission.key}>
                                  <input
                                    type="checkbox"
                                    checked={draftPermissionKeys.includes(permission.key)}
                                    disabled={selectedRole.isSystem || !canManage}
                                    onChange={() => togglePermission(permission.key)}
                                  />
                                  <span><strong>{enumText(permission.action)}</strong><small>{permission.key}</small></span>
                                </label>
                              ))}
                            </fieldset>
                          );
                        })}
                      </div>
                    ) : <div className="empty-state"><h3>{t("No permission matches")}</h3><p>{t("Clear the filter to review the full catalog.")}</p></div>}
                    {canManage && !selectedRole.isSystem && (
                      <div className="settings-actions role-save-actions">
                        {dirty && <span className="unsaved-hint" role="status">{t("Unsaved changes")}</span>}
                        <button className="secondary-action" type="button" disabled={!dirty || Boolean(busy)} onClick={() => setDraftPermissionKeys(selectedRole.permissions.map(({ key }) => key))}>{t("Cancel")}</button>
                        <button className="auth-submit" type="submit" disabled={!dirty || Boolean(busy)}>{busy === "permissions" ? t("Saving…") : t("Save permissions")}<span aria-hidden="true">→</span></button>
                      </div>
                    )}
                  </form>
                </div>
              ) : (
                <div className="role-members-panel">
                  <div className="permission-toolbar">
                    <label className="admin-filter"><span aria-hidden="true">⌕</span><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder={t("Filter members by name, email or role")} aria-label={t("Filter role members")} /></label>
                    {canManage && (
                      <div className="role-member-assign">
                        <select value={assignMemberId} onChange={(event) => setAssignMemberId(event.target.value)} aria-label={t("Choose a member to receive this role")} disabled={Boolean(busy) || !assignableMembers.length}>
                          <option value="">{assignableMembers.length ? t("Choose a member") : t("Every member already holds this role")}</option>
                          {assignableMembers.map((member) => <option key={member.id} value={member.id}>{member.user.name} · {member.user.email}</option>)}
                        </select>
                        <button className="secondary-action" type="button" disabled={!assignMemberId || Boolean(busy)} onClick={() => void addRoleToMember()}>{busy === "assign" ? t("Assigning…") : t("Add member")}</button>
                      </div>
                    )}
                  </div>
                  {roleMembers.length ? (
                    <div className="membership-table-wrap">
                      <table className="membership-table">
                        <thead><tr><th>{t("MEMBER")}</th><th>{t("STATUS")}</th><th>{t("PRIMARY")}</th><th>{t("ACTION")}</th></tr></thead>
                        <tbody>
                          {roleMembers
                            .filter((member) => `${member.user.name} ${member.user.email}`.toLowerCase().includes(memberSearch.trim().toLowerCase()))
                            .map((member) => (
                              <tr key={member.id}>
                                <td><strong>{member.user.name}</strong><small>{member.user.email}</small></td>
                                <td><span className="status-pill status-pill-active">{enumText(member.status)}</span></td>
                                <td>{member.isPrimary ? t("Yes") : t("No")}</td>
                                <td>{canManage && <button className="danger-button" type="button" disabled={Boolean(busy)} onClick={() => requestRemoveRole(member, selectedRole)}>{t("Remove role")}</button>}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <div className="empty-state"><h3>{t("No members hold this role")}</h3><p>{t("Add a member above or assign this role from the member list.")}</p></div>}
                </div>
              )}
            </article>
          )}

          <article className="workspace-panel membership-panel">
            <div className="panel-heading"><div><span className="page-eyebrow">{t("COMPANY MEMBERS")}</span><h2>{t("Member role assignments")}</h2></div><span className="count-badge">{memberships.length}</span></div>
            <label className="admin-filter"><span aria-hidden="true">⌕</span><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder={t("Search by member, email or role")} aria-label={t("Search company members")} /></label>
            {visibleMemberships.length ? (
              <div className="membership-table-wrap">
                <table className="membership-table">
                  <thead><tr><th>{t("MEMBER")}</th><th>{t("STATUS")}</th><th>{t("ROLES")}</th><th>{t("EFFECTIVE PERMISSIONS")}</th><th>{t("ASSIGN ROLES")}</th></tr></thead>
                  <tbody>
                    {visibleMemberships.map((member) => {
                      const draft = memberRoleDraft[member.id] ?? [];
                      const changed = draft.length !== member.roles.length || draft.some((id) => !member.roles.some((role) => role.id === id));
                      return (
                        <tr key={member.id}>
                          <td><strong>{member.user.name}</strong><small>{member.user.email}</small></td>
                          <td><span className="status-pill status-pill-active">{enumText(member.status)}</span></td>
                          <td>
                            <div className="role-chip-list">
                              {member.roles.map((role) => (
                                <span className="role-chip" key={role.id}>
                                  {role.name}
                                  {canManage && member.roles.length > 1 && <button type="button" aria-label={t("Remove {name}", { name: role.name })} onClick={() => requestRemoveRole(member, role)}>×</button>}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td><span className="permission-count">{member.permissions.length}</span></td>
                          <td>
                            {canManage ? (
                              <details className="role-multiselect">
                                <summary>{t("{count} roles selected", { count: draft.length })}</summary>
                                <div className="role-multiselect-list">
                                  {roles.map((role) => (
                                    <label key={role.id} className="permission-option">
                                      <input type="checkbox" checked={draft.includes(role.id)} disabled={Boolean(busy)} onChange={() => toggleMemberRole(member.id, role.id)} />
                                      <span><strong>{role.name}</strong><small>{role.key}</small></span>
                                    </label>
                                  ))}
                                </div>
                                <button className="secondary-action" type="button" disabled={!changed || Boolean(busy)} onClick={() => void saveMemberRoles(member)}>{busy === `member-${member.id}` ? t("Saving…") : t("Save roles")}</button>
                              </details>
                            ) : <span className="permission-count">{member.roles.length}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty-state"><h3>{t("No matching members")}</h3><p>{t("Try another name, email or role.")}</p></div>}
            {memberPageCount > 1 && (
              <div className="pagination">
                <button className="secondary-action" onClick={() => setMemberPage((current) => Math.max(0, current - 1))} disabled={memberPage === 0}>{t("Previous")}</button>
                <span>{t("Page {page} of {count}", { page: memberPage + 1, count: memberPageCount })}</span>
                <button className="secondary-action" onClick={() => setMemberPage((current) => Math.min(memberPageCount - 1, current + 1))} disabled={memberPage + 1 >= memberPageCount}>{t("Next")}</button>
              </div>
            )}
          </article>
        </>
      )}

      {dialog && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialog(null); }}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="role-dialog-title">
            <div className="modal-heading">
              <div><span className="page-eyebrow">{dialog.mode === "create" ? t("NEW ROLE") : dialog.mode === "edit" ? t("EDIT ROLE") : t("DUPLICATE ROLE")}</span><h2 id="role-dialog-title">{dialog.mode === "create" ? t("Create a custom role") : dialog.mode === "edit" ? t("Edit {name}", { name: dialog.role.name }) : t("Duplicate {name}", { name: dialog.role.name })}</h2></div>
              <button className="icon-button" type="button" onClick={() => setDialog(null)} disabled={Boolean(busy)} aria-label={t("Close dialog")}>×</button>
            </div>
            <form className="company-form" onSubmit={submitDialog}>
              <label className="auth-field"><span>{t("Role name")}</span><input value={dialog.name} onChange={(event) => setDialog({ ...dialog, name: event.target.value, ...(dialog.mode === "create" ? { key: slugifyKey(event.target.value) } : {}) })} required minLength={2} maxLength={120} autoFocus /></label>
              {(dialog.mode === "create" || dialog.mode === "duplicate") && (
                <label className="auth-field"><span>{t("Role key")}</span><input value={dialog.key} onChange={(event) => setDialog({ ...dialog, key: event.target.value.toLowerCase() })} required pattern="[a-z][a-z0-9_]{1,79}" maxLength={80} /></label>
              )}
              {dialog.mode !== "duplicate" && (
                <label className="auth-field"><span>{t("Description")}</span><textarea value={dialog.description} onChange={(event) => setDialog({ ...dialog, description: event.target.value })} maxLength={500} rows={3} /></label>
              )}
              {dialog.mode === "create" && (
                <fieldset className="dialog-permission-seed">
                  <legend>{t("Starting permissions")}</legend>
                  <p>{t("Only permissions you already hold can be granted.")}</p>
                  <div className="role-chip-list">
                    {permissions.filter((permission) => permission.action === "read").map((permission) => (
                      <label className="permission-chip" key={permission.key}>
                        <input
                          type="checkbox"
                          checked={dialog.permissionKeys.includes(permission.key)}
                          onChange={() => setDialog({ ...dialog, permissionKeys: dialog.permissionKeys.includes(permission.key) ? dialog.permissionKeys.filter((key) => key !== permission.key) : [...dialog.permissionKeys, permission.key] })}
                        />
                        {permission.key}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {error && <p className="auth-alert" role="alert">{error}</p>}
              <div className="modal-actions">
                <button className="secondary-action" type="button" onClick={() => setDialog(null)} disabled={Boolean(busy)}>{t("Cancel")}</button>
                <button className="auth-submit" type="submit" disabled={Boolean(busy)}>{busy === "dialog" ? t("Saving…") : dialog.mode === "edit" ? t("Save role") : dialog.mode === "duplicate" ? t("Duplicate role") : t("Create role")}<span aria-hidden="true">→</span></button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmation && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirmation(null); }}>
          <div className="modal-card modal-confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="modal-heading"><div><span className="page-eyebrow">{t("CONFIRM CHANGE")}</span><h2 id="confirm-title">{confirmation.title}</h2></div></div>
            <p>{confirmation.message}</p>
            {error && <p className="auth-alert" role="alert">{error}</p>}
            <div className="modal-actions">
              <button className="secondary-action" type="button" onClick={() => setConfirmation(null)} disabled={Boolean(busy)}>{t("Keep role")}</button>
              <button
                className="danger-button"
                type="button"
                disabled={Boolean(busy)}
                onClick={async () => {
                  setBusy("confirm");
                  setError("");
                  try {
                    await confirmation.run();
                    setConfirmation(null);
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : t("The change could not be completed."));
                  } finally {
                    setBusy("");
                  }
                }}
              >
                {busy === "confirm" ? t("Working…") : confirmation.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function slugifyKey(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}
