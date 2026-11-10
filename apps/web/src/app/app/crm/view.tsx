"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest, utcIsoFromDateTimeInput } from "../../../lib/api";
import { useI18n } from "../../../lib/i18n";
import { useNexusSession, usePermissions } from "../session-context";

type CrmCustomer = { id: string; code: string; name: string; type: "CUSTOMER" | "PROSPECT"; contactName: string | null; email: string | null; phone: string | null; city: string | null; countryCode: string | null; notes: string | null; isActive: boolean; _count: { opportunities: number; activities: number } };
type CrmOpportunity = { id: string; reference: string; title: string; stage: string; estimatedValue: string; probability: number; expectedCloseAt: string | null; isActive: boolean; customer: { id: string; code: string; name: string }; _count: { activities: number } };
type CrmActivity = { id: string; type: string; subject: string; body: string | null; dueAt: string | null; completedAt: string | null; createdAt: string; customer: { id: string; code: string; name: string } | null; opportunity: { id: string; reference: string; title: string } | null };
type PageResult<T> = { data: T[]; total: number };
type Summary = { customerCount: number; prospectCount: number; openOpportunityCount: number; pipelineValue: string; pendingActivityCount: number };
const customerBlank = { code: "", name: "", type: "PROSPECT", contactName: "", email: "", phone: "", city: "", countryCode: "MA", notes: "" };
const opportunityBlank = { customerId: "", reference: "", title: "", estimatedValue: "0.00", stage: "QUALIFICATION", probability: "10", expectedCloseAt: "", notes: "" };
const activityBlank = { customerId: "", opportunityId: "", type: "TASK", subject: "", body: "", dueAt: "" };

export function CrmView() {
  const session = useNexusSession();
  const access = usePermissions();
  const { t, enum: enumText, number: formatNumber, date: formatDate } = useI18n();
  const canCreate = access.can("crm.create");
  const canUpdate = access.can("crm.update");
  const currency = session.memberships.find((company) => company.id === session.activeCompanyId)?.currencyCode ?? "MAD";
  const [summary, setSummary] = useState<Summary | null>(null);
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [opportunities, setOpportunities] = useState<CrmOpportunity[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [customerDraft, setCustomerDraft] = useState(customerBlank);
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null);
  const [opportunityDraft, setOpportunityDraft] = useState(opportunityBlank);
  const [activityDraft, setActivityDraft] = useState(activityBlank);
  const activeCustomers = useMemo(() => customers.filter((customer) => customer.isActive), [customers]);
  const filteredCustomers = customers.filter((customer) => `${customer.code} ${customer.name} ${customer.contactName ?? ""} ${customer.email ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const filteredOpportunities = opportunities.filter((opportunity) => `${opportunity.reference} ${opportunity.title} ${opportunity.customer.name}`.toLowerCase().includes(search.toLowerCase()));
  const filteredActivities = activities.filter((activity) => `${activity.subject} ${activity.customer?.name ?? ""} ${activity.opportunity?.title ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  async function loadCrm() {
    setLoading(true); setError("");
    try {
      const [summaryData, customerData, opportunityData, activityData] = await Promise.all([
        apiRequest<Summary>("/crm/summary"),
        apiRequest<PageResult<CrmCustomer>>("/crm/customers?page=1&pageSize=100"),
        apiRequest<PageResult<CrmOpportunity>>("/crm/opportunities?page=1&pageSize=100"),
        apiRequest<PageResult<CrmActivity>>("/crm/activities?page=1&pageSize=100"),
      ]);
      setSummary(summaryData); setCustomers(customerData.data); setOpportunities(opportunityData.data); setActivities(activityData.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("CRM workspace could not be loaded.")); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadCrm(); }, []);
  useEffect(() => {
    const firstCustomer = activeCustomers[0]?.id;
    if (firstCustomer) {
      setOpportunityDraft((draft) => draft.customerId ? draft : { ...draft, customerId: firstCustomer });
      setActivityDraft((draft) => draft.customerId ? draft : { ...draft, customerId: firstCustomer });
    }
  }, [activeCustomers]);

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const body = { ...customerDraft, code: customerDraft.code.toUpperCase(), countryCode: customerDraft.countryCode.toUpperCase(), email: customerDraft.email || undefined };
      if (editingCustomer) {
        const { code: _code, ...update } = body;
        await apiRequest(`/crm/customers/${editingCustomer}`, { method: "PATCH", body: JSON.stringify(update) });
        setNotice(t("{name} updated.", { name: body.name }));
      } else {
        await apiRequest("/crm/customers", { method: "POST", body: JSON.stringify(body) });
        setNotice(t("{code} added to CRM.", { code: body.code }));
      }
      setCustomerDraft(customerBlank); setEditingCustomer(null); await loadCrm();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("Customer could not be saved.")); }
    finally { setBusy(false); }
  }

  async function saveOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest("/crm/opportunities", { method: "POST", body: JSON.stringify({ ...opportunityDraft, probability: Number(opportunityDraft.probability), estimatedValue: opportunityDraft.estimatedValue, expectedCloseAt: opportunityDraft.expectedCloseAt || undefined }) });
      setOpportunityDraft((draft) => ({ ...opportunityBlank, customerId: draft.customerId })); setNotice(t("Opportunity added to the sales pipeline.")); await loadCrm();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("Opportunity could not be saved.")); }
    finally { setBusy(false); }
  }

  async function saveActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest("/crm/activities", { method: "POST", body: JSON.stringify({ ...activityDraft, customerId: activityDraft.customerId || undefined, opportunityId: activityDraft.opportunityId || undefined, dueAt: activityDraft.dueAt ? utcIsoFromDateTimeInput(activityDraft.dueAt) : undefined }) });
      setActivityDraft((draft) => ({ ...activityBlank, customerId: draft.customerId })); setNotice(t("Activity logged.")); await loadCrm();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("Activity could not be saved.")); }
    finally { setBusy(false); }
  }

  async function updateOpportunity(opportunity: CrmOpportunity, update: object) {
    setBusy(true); setError(""); setNotice("");
    try { await apiRequest(`/crm/opportunities/${opportunity.id}`, { method: "PATCH", body: JSON.stringify(update) }); setNotice(t("{reference} updated.", { reference: opportunity.reference })); await loadCrm(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("Opportunity could not be updated.")); }
    finally { setBusy(false); }
  }

  async function completeActivity(activity: CrmActivity) {
    setBusy(true); setError("");
    try { await apiRequest(`/crm/activities/${activity.id}/complete`, { method: "PATCH" }); setNotice(activity.completedAt ? t("Activity reopened.") : t("Activity marked complete.")); await loadCrm(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("Activity status could not be changed.")); }
    finally { setBusy(false); }
  }

  async function toggleCustomer(customer: CrmCustomer) {
    setBusy(true); setError("");
    try { await apiRequest(`/crm/customers/${customer.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !customer.isActive }) }); setNotice(customer.isActive ? t("{code} archived.", { code: customer.code }) : t("{code} reactivated.", { code: customer.code })); await loadCrm(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("Customer status could not be changed.")); }
    finally { setBusy(false); }
  }

  function editCustomer(customer: CrmCustomer) {
    setCustomerDraft({ code: customer.code, name: customer.name, type: customer.type, contactName: customer.contactName ?? "", email: customer.email ?? "", phone: customer.phone ?? "", city: customer.city ?? "", countryCode: customer.countryCode ?? "MA", notes: customer.notes ?? "" });
    setEditingCustomer(customer.id); document.getElementById("crm-customer-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!access.can("crm.read")) {
    return <section className="inventory-page crm-page"><div className="page-heading"><div><span className="page-eyebrow">{t("CUSTOMERS · SALES PIPELINE")}</span><h1>{t("Customer relationships")}</h1></div></div><div className="empty-state"><h3>{t("CRM access is restricted")}</h3><p>{t("Your role does not include the crm.read permission. Ask a company administrator to grant it.")}</p></div></section>;
  }

  return <section className="inventory-page crm-page">
    <div className="page-heading"><div><span className="page-eyebrow">{t("CUSTOMERS · SALES PIPELINE")}</span><h1>{t("Customer relationships")}</h1><p>{t("Keep company contacts, active opportunities and follow-up work together in the current workspace.")}</p></div><button className="secondary-action" onClick={() => void loadCrm()} disabled={loading}>{t("Refresh")} <span aria-hidden="true">↻</span></button></div>
    {error && <p className="auth-alert" role="alert">{error}</p>}{notice && <p className="success-alert" role="status">{notice}</p>}
    <div className="summary-grid inventory-summary"><article className="summary-card"><span>{t("ACTIVE CUSTOMERS")}</span><strong>{summary?.customerCount ?? "—"}</strong><small>{t("Converted accounts")}</small></article><article className="summary-card"><span>{t("PROSPECTS")}</span><strong>{summary?.prospectCount ?? "—"}</strong><small>{t("Companies in qualification")}</small></article><article className="summary-card"><span>{t("OPEN PIPELINE")}</span><strong>{summary ? formatNumber(Number(summary.pipelineValue), { maximumFractionDigits: 2 }) : "—"}</strong><small>{currency} · {t("{count} opportunities", { count: summary?.openOpportunityCount ?? "—" })}</small></article><article className="summary-card"><span>{t("PENDING FOLLOW-UPS")}</span><strong>{summary?.pendingActivityCount ?? "—"}</strong><small>{t("Calls, tasks, meetings and notes")}</small></article></div>
    <label className="admin-filter crm-search"><span aria-hidden="true">⌕</span><input aria-label={t("Search CRM")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Search customers, opportunities and activities")} /></label>
    <div className="workspace-grid inventory-forms-grid">
      {(canCreate || editingCustomer) && <article className="workspace-panel inventory-form-panel" id="crm-customer-form"><div className="panel-heading"><div><span className="page-eyebrow">{t("CUSTOMER DIRECTORY")}</span><h2>{editingCustomer ? t("Update contact") : t("Add customer or prospect")}</h2></div></div>
        <form className="company-form" onSubmit={saveCustomer}><div className="form-row"><label className="auth-field"><span>{t("Record code")}</span><input value={customerDraft.code} onChange={(e) => setCustomerDraft({ ...customerDraft, code: e.target.value.toUpperCase() })} required minLength={2} maxLength={40} disabled={Boolean(editingCustomer)} /></label><label className="auth-field"><span>{t("Type")}</span><select value={customerDraft.type} onChange={(e) => setCustomerDraft({ ...customerDraft, type: e.target.value })}><option value="PROSPECT">{t("Prospect")}</option><option value="CUSTOMER">{t("Customer")}</option></select></label></div>
          <label className="auth-field"><span>{t("Company name")}</span><input value={customerDraft.name} onChange={(e) => setCustomerDraft({ ...customerDraft, name: e.target.value })} required minLength={2} maxLength={180} /></label>
          <div className="form-row"><label className="auth-field"><span>{t("Contact person")}</span><input value={customerDraft.contactName} onChange={(e) => setCustomerDraft({ ...customerDraft, contactName: e.target.value })} maxLength={160} /></label><label className="auth-field"><span>{t("Email")}</span><input type="email" value={customerDraft.email} onChange={(e) => setCustomerDraft({ ...customerDraft, email: e.target.value })} maxLength={320} /></label></div>
          <div className="form-row"><label className="auth-field"><span>{t("Phone")}</span><input value={customerDraft.phone} onChange={(e) => setCustomerDraft({ ...customerDraft, phone: e.target.value })} maxLength={40} /></label><label className="auth-field"><span>{t("City")}</span><input value={customerDraft.city} onChange={(e) => setCustomerDraft({ ...customerDraft, city: e.target.value })} maxLength={120} /></label></div>
          <div className="inventory-form-actions"><button className="auth-submit" type="submit" disabled={busy}>{busy ? t("Saving…") : editingCustomer ? t("Save contact") : t("Create CRM record")}<span aria-hidden="true">→</span></button>{editingCustomer && <button type="button" className="secondary-action" onClick={() => { setEditingCustomer(null); setCustomerDraft(customerBlank); }}>{t("Cancel")}</button>}</div>
        </form>
      </article>}
      {canCreate && <article className="workspace-panel inventory-form-panel"><div className="panel-heading"><div><span className="page-eyebrow">{t("SALES OPPORTUNITY")}</span><h2>{t("Build the pipeline")}</h2></div></div>
        <form className="company-form" onSubmit={saveOpportunity}><label className="auth-field"><span>{t("Customer or prospect")}</span><select value={opportunityDraft.customerId} onChange={(e) => setOpportunityDraft({ ...opportunityDraft, customerId: e.target.value })} required><option value="">{t("Select a company")}</option>{activeCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
          <div className="form-row"><label className="auth-field"><span>{t("Reference")}</span><input value={opportunityDraft.reference} onChange={(e) => setOpportunityDraft({ ...opportunityDraft, reference: e.target.value.toUpperCase() })} required maxLength={40} /></label><label className="auth-field"><span>{t("Stage")}</span><select value={opportunityDraft.stage} onChange={(e) => setOpportunityDraft({ ...opportunityDraft, stage: e.target.value })}>{stages.map((stage) => <option key={stage} value={stage}>{enumText(stage)}</option>)}</select></label></div>
          <label className="auth-field"><span>{t("Opportunity title")}</span><input value={opportunityDraft.title} onChange={(e) => setOpportunityDraft({ ...opportunityDraft, title: e.target.value })} required minLength={2} maxLength={180} /></label>
          <div className="form-row"><label className="auth-field"><span>{t("Estimated value ({currency})", { currency })}</span><input type="number" min="0" step="0.01" value={opportunityDraft.estimatedValue} onChange={(e) => setOpportunityDraft({ ...opportunityDraft, estimatedValue: e.target.value })} required /></label><label className="auth-field"><span>{t("Win probability (%)")}</span><input type="number" min="0" max="100" value={opportunityDraft.probability} onChange={(e) => setOpportunityDraft({ ...opportunityDraft, probability: e.target.value })} required /></label></div>
          <div className="inventory-form-actions"><button className="auth-submit" type="submit" disabled={busy || activeCustomers.length === 0}>{busy ? t("Saving…") : t("Add opportunity")}<span aria-hidden="true">→</span></button></div>
        </form>
      </article>}
    </div>
    <div className="crm-lists-grid">
      <article className="workspace-panel inventory-table-panel"><div className="panel-heading"><div><span className="page-eyebrow">{t("RELATIONSHIPS")}</span><h2>{t("Customers & prospects")}</h2></div><span className="count-badge">{filteredCustomers.length}</span></div>
        {loading ? <p className="loading-state">{t("Loading CRM records…")}</p> : filteredCustomers.length ? <div className="crm-record-list">{filteredCustomers.map((customer) => <div className="crm-record-row" key={customer.id}><span className={`status-pill${customer.isActive ? " status-pill-active" : ""}`}>{enumText(customer.type)}</span><div className="company-row-main"><strong>{customer.name} <small>{customer.code}</small></strong><small>{customer.contactName || customer.email || customer.city || t("No contact details")} · {t("{count} opportunities", { count: customer._count.opportunities })}</small></div><div className="inventory-row-actions">{canUpdate && <button className="secondary-action" onClick={() => editCustomer(customer)} disabled={busy}>{t("Edit")}</button>}{canUpdate && <button className="secondary-action" onClick={() => void toggleCustomer(customer)} disabled={busy}>{customer.isActive ? t("Archive") : t("Restore")}</button>}</div></div>)}</div> : <div className="empty-state"><h3>{t("No matching companies")}</h3><p>{t("Add your first customer or prospect with the form above.")}</p></div>}
      </article>
      <article className="workspace-panel inventory-table-panel"><div className="panel-heading"><div><span className="page-eyebrow">{t("OPPORTUNITY TRACKING")}</span><h2>{t("Sales pipeline")}</h2></div><span className="count-badge">{filteredOpportunities.length}</span></div>
        {loading ? <p className="loading-state">{t("Loading pipeline…")}</p> : filteredOpportunities.length ? <div className="crm-record-list">{filteredOpportunities.map((opportunity) => <div className="crm-record-row crm-opportunity-row" key={opportunity.id}><span className={`stage-pill stage-${opportunity.stage.toLowerCase()}`}>{enumText(opportunity.stage)}</span><div className="company-row-main"><strong>{opportunity.title}</strong><small>{opportunity.reference} · {opportunity.customer.name} · {opportunity.probability}%</small><small>{currency} {formatNumber(Number(opportunity.estimatedValue))} · {t("{count} activities", { count: opportunity._count.activities })}{opportunity.expectedCloseAt ? ` · ${t("close {date}", { date: formatDate(opportunity.expectedCloseAt) })}` : ""}</small></div>{canUpdate && <div className="crm-stage-actions"><select aria-label={t("Stage for {reference}", { reference: opportunity.reference })} value={opportunity.stage} disabled={busy} onChange={(e) => void updateOpportunity(opportunity, { stage: e.target.value })}>{stages.map((stage) => <option key={stage} value={stage}>{enumText(stage)}</option>)}</select><button className="secondary-action" disabled={busy} onClick={() => void updateOpportunity(opportunity, { isActive: !opportunity.isActive })}>{opportunity.isActive ? t("Archive") : t("Restore")}</button></div>}</div>)}</div> : <div className="empty-state"><h3>{t("Pipeline is clear")}</h3><p>{t("Create an opportunity linked to a customer or prospect.")}</p></div>}
      </article>
    </div>
    <div className="workspace-grid inventory-forms-grid inventory-workflows">
      {canCreate && <article className="workspace-panel inventory-form-panel"><div className="panel-heading"><div><span className="page-eyebrow">{t("FOLLOW-UP ACTIVITY")}</span><h2>{t("Log a customer touchpoint")}</h2></div></div>
        <form className="company-form" onSubmit={saveActivity}><div className="form-row"><label className="auth-field"><span>{t("Activity type")}</span><select value={activityDraft.type} onChange={(e) => setActivityDraft({ ...activityDraft, type: e.target.value })}>{["TASK", "CALL", "EMAIL", "MEETING", "NOTE"].map((type) => <option key={type} value={type}>{enumText(type)}</option>)}</select></label><label className="auth-field"><span>{t("Due date")}</span><input type="datetime-local" value={activityDraft.dueAt} onChange={(e) => setActivityDraft({ ...activityDraft, dueAt: e.target.value })} /></label></div>
          <label className="auth-field"><span>{t("Customer or prospect")}</span><select value={activityDraft.customerId} onChange={(e) => setActivityDraft({ ...activityDraft, customerId: e.target.value, opportunityId: "" })}><option value="">{t("Select a company")}</option>{activeCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
          <label className="auth-field"><span>{t("Opportunity (optional)")}</span><select value={activityDraft.opportunityId} onChange={(e) => { const opportunity = opportunities.find((item) => item.id === e.target.value); setActivityDraft({ ...activityDraft, opportunityId: e.target.value, customerId: opportunity?.customer.id ?? activityDraft.customerId }); }}><option value="">{t("No linked opportunity")}</option>{opportunities.filter((item) => item.isActive).map((opportunity) => <option key={opportunity.id} value={opportunity.id}>{opportunity.reference} · {opportunity.title}</option>)}</select></label>
          <label className="auth-field"><span>{t("Subject")}</span><input value={activityDraft.subject} onChange={(e) => setActivityDraft({ ...activityDraft, subject: e.target.value })} required minLength={2} maxLength={180} /></label>
          <div className="inventory-form-actions"><button className="auth-submit" type="submit" disabled={busy || activeCustomers.length === 0}>{busy ? t("Saving…") : t("Log activity")}<span aria-hidden="true">→</span></button></div>
        </form>
      </article>}
      <article className="workspace-panel inventory-table-panel"><div className="panel-heading"><div><span className="page-eyebrow">{t("ACTIVITY HISTORY")}</span><h2>{t("Follow-ups")}</h2></div><span className="count-badge">{t("{count} open", { count: filteredActivities.filter((activity) => !activity.completedAt).length })}</span></div>
        {loading ? <p className="loading-state">{t("Loading activities…")}</p> : filteredActivities.length ? <div className="crm-record-list">{filteredActivities.map((activity) => <div className="crm-record-row" key={activity.id}><span className={`activity-type activity-${activity.type.toLowerCase()}`}>{enumText(activity.type)}</span><div className="company-row-main"><strong>{activity.subject}</strong><small>{activity.customer?.name ?? t("Company")}{activity.opportunity ? ` · ${activity.opportunity.reference}` : ""}{activity.dueAt ? ` · ${formatDate(activity.dueAt)}` : ""}</small></div>{canUpdate && <button className="secondary-action" disabled={busy} onClick={() => void completeActivity(activity)}>{activity.completedAt ? t("Reopen") : t("Complete")}</button>}</div>)}</div> : <div className="empty-state"><h3>{t("No follow-ups yet")}</h3><p>{t("Log calls, meetings, emails or tasks to keep the account history current.")}</p></div>}
      </article>
    </div>
  </section>;
}

const stages = ["QUALIFICATION", "NEEDS_ANALYSIS", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];
