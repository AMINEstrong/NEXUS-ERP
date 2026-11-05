"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";
import { useNexusSession } from "./session-context";
import styles from "./dashboard.module.css";

type DashboardPayload = {
  companyName: string;
  currencyCode: string;
  metrics: Array<{ key: string; label: string; value: string | number; previousValue: string | number | null; detail: string; icon: string; href: string }>;
  trend: Array<{ key: string; label: string; revenue: string; sales: number }>;
  activities: Array<{ id: string; kind: string; title: string; description: string; occurredAt: string }>;
  generatedAt: string;
  hasSalesAccess: boolean;
  hasInventoryAccess: boolean;
  hasCrmAccess: boolean;
};

function formatCurrency(value: string | number, currency: string) {
  const amount = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
}

function formatChange(current: string | number, previous: string | number) {
  const now = Number(current);
  const before = Number(previous);
  if (!Number.isFinite(now) || !Number.isFinite(before)) return null;
  if (before === 0) return now === 0 ? "No change" : "New this month";
  const difference = ((now - before) / Math.abs(before)) * 100;
  return `${difference > 0 ? "+" : ""}${difference.toFixed(1)}% vs last month`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function DashboardView() {
  const session = useNexusSession();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadDashboard() {
    setError("");
    try {
      setData(await apiRequest<DashboardPayload>("/dashboard/summary"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dashboard information could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadDashboard(); }, []);

  const maxRevenue = Math.max(1, ...((data?.trend ?? []).map((month) => Number(month.revenue))));
  const chartPoints = (data?.trend ?? []).map((month, index) => {
    const x = data!.trend.length < 2 ? 50 : 8 + (index / (data!.trend.length - 1)) * 84;
    const y = 88 - (Number(month.revenue) / maxRevenue) * 70;
    return `${x},${y}`;
  }).join(" ");
  const activeCompany = session.memberships.find((company) => company.id === session.activeCompanyId);

  return <section className={styles.dashboard}>
    <div className={styles.heading}>
      <div><span className={styles.eyebrow}>COMPANY OVERVIEW</span><h1>Good morning, {session.name.split(" ")[0]}.</h1><p>Your operational snapshot for {activeCompany?.name ?? data?.companyName ?? "your workspace"}.</p></div>
      <div className={styles.headingActions}><span className={styles.period}>◷ <span>Current month</span></span><Link className={styles.primaryAction} href="/app/sales">Open sales <span aria-hidden="true">↗</span></Link></div>
    </div>

    {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => { setLoading(true); void loadDashboard(); }}>Try again</button></div>}
    {loading && !data ? <div className={styles.metrics} aria-label="Loading dashboard metrics">{Array.from({ length: 6 }, (_, index) => <div className={styles.skeleton} key={index} />)}</div> : null}

    {data && <>
      {data.metrics.length ? <div className={styles.metrics}>{data.metrics.map((metric, index) => {
        const change = metric.previousValue === null ? null : formatChange(metric.value, metric.previousValue);
        const positive = metric.previousValue !== null && Number(metric.value) >= Number(metric.previousValue);
        const isCurrency = ["revenue", "receivables", "inventory"].includes(metric.key);
        const displayValue = isCurrency ? formatCurrency(metric.value, data.currencyCode) : new Intl.NumberFormat("en").format(Number(metric.value));
        return <Link href={metric.href} className={styles.metric} key={metric.key} style={{ "--metric-index": index } as React.CSSProperties}>
          <div className={styles.metricTop}><span>{metric.label}</span><span className={styles.metricIcon} aria-hidden="true">{metric.icon}</span></div>
          <strong>{displayValue}</strong>
          <div className={styles.metricBottom}><span className={styles.metricDetail}>{metric.detail}</span>{change && <span className={`${styles.change} ${positive ? styles.positive : styles.negative}`}>{change}</span>}</div>
        </Link>;
      })}</div> : <div className={styles.emptyAccess}><span className={styles.emptyIcon}>◈</span><h2>No business metrics available</h2><p>Your current role does not have read access to sales, inventory, or CRM data. Ask a company administrator to update your permissions.</p></div>}

      <div className={styles.contentGrid}>
        {data.hasSalesAccess && <article className={styles.panel}>
          <div className={styles.panelHeading}><div><span className={styles.eyebrow}>PERFORMANCE</span><h2>Revenue trend</h2></div><Link href="/app/sales">Sales overview <span aria-hidden="true">→</span></Link></div>
          <div className={styles.chartSummary}><strong>{formatCurrency(data.trend.reduce((sum, month) => sum + Number(month.revenue), 0), data.currencyCode)}</strong><span>Revenue across the last six months</span></div>
          {Number(data.trend.reduce((sum, month) => sum + Number(month.revenue), 0)) > 0 ? <div className={styles.chart}>
            <div className={styles.chartYAxis}><span>{formatCurrency(maxRevenue, data.currencyCode)}</span><span>{formatCurrency(maxRevenue / 2, data.currencyCode)}</span><span>0</span></div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Monthly invoiced revenue for the last six months">
              <defs><linearGradient id="revenue-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#197f83" stopOpacity=".23"/><stop offset="100%" stopColor="#197f83" stopOpacity="0"/></linearGradient></defs>
              <path d={`M ${chartPoints.split(" ").join(" L ")} L 92,96 L 8,96 Z`} fill="url(#revenue-area)" />
              <polyline points={chartPoints} fill="none" stroke="#197f83" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
              {data.trend.map((month, index) => { const x = data!.trend.length < 2 ? 50 : 8 + (index / (data!.trend.length - 1)) * 84; const y = 88 - (Number(month.revenue) / maxRevenue) * 70; return <circle key={month.key} cx={x} cy={y} r="1.4" fill="#fff" stroke="#197f83" strokeWidth="1.3" vectorEffect="non-scaling-stroke"><title>{`${month.label}: ${formatCurrency(month.revenue, data!.currencyCode)}`}</title></circle>; })}
            </svg>
            <div className={styles.chartLabels}>{data.trend.map((month) => <span key={month.key}>{month.label}</span>)}</div>
          </div> : <div className={styles.chartEmpty}><span>▤</span><p>No invoiced revenue in this period yet.</p><Link href="/app/sales">Go to sales</Link></div>}
        </article>}

        <article className={styles.panel}>
          <div className={styles.panelHeading}><div><span className={styles.eyebrow}>LATEST UPDATES</span><h2>Recent activity</h2></div><span className={styles.liveLabel}><i /> Live data</span></div>
          {data.activities.length ? <div className={styles.activityList}>{data.activities.map((activity) => <div className={styles.activity} key={activity.id}>
            <span className={`${styles.activityIcon} ${styles[`kind_${activity.kind}` as keyof typeof styles] ?? ""}`} aria-hidden="true">{activity.kind === "sales" ? "▤" : activity.kind === "inventory" ? "▦" : "◎"}</span>
            <div className={styles.activityText}><strong>{activity.title}</strong><span>{activity.description}</span></div><time dateTime={activity.occurredAt}>{formatDate(activity.occurredAt)}</time>
          </div>)}</div> : <div className={styles.activityEmpty}><span>✓</span><p>No recent activity recorded yet.</p><small>New sales, inventory, and CRM records will appear here.</small></div>}
        </article>
      </div>
      <div className={styles.footer}><span>Metrics reflect data visible to your active company role.</span><span>Updated {formatDate(data.generatedAt)}</span></div>
      {!data.hasSalesAccess || !data.hasInventoryAccess || !data.hasCrmAccess ? <div className={styles.permissionNote}>Some business modules are hidden because your role does not have permission to view them.</div> : null}
    </>}
  </section>;
}
