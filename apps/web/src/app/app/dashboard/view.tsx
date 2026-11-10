"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../../lib/api";
import { intlLocale, useI18n } from "../../../lib/i18n";
import { useNexusSession } from "../session-context";
import { CustomerGrowthChart, DonutChart, GroupedBarChart, HorizontalBars, RevenueChart } from "./charts";
import { formatBucketLabel, formatCurrency, formatDateTime, formatDay, formatNumber, formatPercent, truncate } from "./format";
import {
  DASHBOARD_RANGES,
  type DashboardAccess,
  type DashboardActivity,
  type DashboardKpi,
  type DashboardNotification,
  type DashboardOverview,
  type DashboardRange,
  type LowStockItem,
  type RecentCustomer,
  type RecentOrder,
  type RecentSale,
} from "./types";

const KPI_ICONS: Record<string, string> = {
  revenue: "◫",
  sales: "↗",
  orders: "▤",
  pendingOrders: "◷",
  outstandingInvoices: "◔",
  customers: "◎",
  products: "▦",
  stockValue: "▥",
  lowStock: "⚠",
  expenses: "⇩",
};

const KPI_LABEL_KEYS: Record<string, string> = {
  revenue: "Revenue",
  sales: "Sales volume",
  orders: "Orders",
  pendingOrders: "Pending orders",
  outstandingInvoices: "Outstanding invoices",
  customers: "Customers",
  products: "Products",
  stockValue: "Stock value",
  lowStock: "Low stock",
  expenses: "Expenses",
};

const KPI_CAPTION_KEYS: Record<string, string> = {
  revenue: "Invoiced net revenue in period",
  sales: "Non-cancelled order value created",
  orders: "Orders created in period",
  pendingOrders: "Awaiting delivery or invoicing",
  outstandingInvoices: "Open receivable balance",
  customers: "Active prospects in pipeline",
  products: "Active inventory catalog items",
  stockValue: "On-hand quantity at current unit cost",
  lowStock: "At or below reorder point",
  expenses: "No expense accounts configured",
};

const CHART_COLORS = ["#2b9db2", "#4f7cac", "#7a6ff0", "#d89a4a", "#54a37d", "#c26d8e", "#7d8fa3"];

const INVOICE_TONES: Record<string, string> = {
  PAID: "good",
  OPEN: "warning",
  PARTIALLY_PAID: "info",
  VOID: "muted",
};

const ORDER_TONES: Record<string, string> = {
  OPEN: "info",
  PARTIALLY_DELIVERED: "warning",
  DELIVERED: "good",
  PARTIALLY_INVOICED: "info",
  INVOICED: "good",
  CANCELLED: "muted",
};

const ACTIVITY_TONES: Record<string, string> = {
  TASK: "good",
  CALL: "warning",
  EMAIL: "warning",
  MEETING: "info",
  NOTE: "muted",
};

type QuickAction = {
  href: string;
  label: string;
  detail: string;
  glyph: string;
  access: keyof DashboardAccess;
};

const QUICK_ACTIONS: QuickAction[] = [
  { href: "/app/sales#sales-quotation-form", label: "Create quotation", detail: "Prepare a customer proposal", glyph: "▱", access: "sales" },
  { href: "/app/sales", label: "Review receivables", detail: "Invoice, deliver or record payment", glyph: "◔", access: "sales" },
  { href: "/app/crm", label: "Add a customer", detail: "Grow the customer base", glyph: "◎", access: "crm" },
  { href: "/app/inventory", label: "Update inventory", detail: "Items, receipts and transfers", glyph: "▤", access: "inventory" },
  { href: "/app/settings", label: "Company settings", detail: "Locale, currency and fiscal year", glyph: "⚙", access: "finance" },
];

export function DashboardView() {
  const session = useNexusSession();
  const { t, language, enum: enumText } = useI18n();
  const locale = intlLocale(language);
  const [range, setRange] = useState<DashboardRange>("30d");
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void apiRequest<DashboardOverview>(`/dashboard?range=${encodeURIComponent(range)}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : t("The dashboard could not be loaded."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range, refreshToken, session.activeCompanyId]);

  const currency = data?.company.currencyCode ?? "USD";
  const refreshing = loading && data !== null;
  const firstName = session.name.trim().split(/\s+/)[0] || session.name;
  const activeCompanyName = data?.company.name ?? session.memberships.find((company) => company.id === session.activeCompanyId)?.name ?? t("your company");
  const periodLabel = t(DASHBOARD_RANGES.find((option) => option.key === range)?.title ?? "Live performance");
  const granularity = data?.period.granularity ?? "day";
  const bucketLabel = (key: string) => formatBucketLabel(key, granularity, locale);

  const alertSummary = useMemo(() => {
    const notifications = data?.notifications ?? [];
    const critical = notifications.filter((item) => item.severity === "critical").length;
    const warning = notifications.filter((item) => item.severity === "warning").length;
    return { total: notifications.length, critical, warning };
  }, [data?.notifications]);

  const quickActions = useMemo(() => {
    if (!data) return QUICK_ACTIONS.slice(0, 2);
    return QUICK_ACTIONS.filter((action) => (action.access === "finance" ? true : data.access[action.access])).slice(0, 5);
  }, [data]);

  function refresh() {
    setRefreshToken((token) => token + 1);
  }

  const criticalHeading = alertSummary.critical === 1
    ? t("{count} critical operational alert", { count: alertSummary.critical })
    : t("{count} critical operational alerts", { count: alertSummary.critical });
  const totalHeading = alertSummary.total === 1
    ? t("{count} operational alert", { count: alertSummary.total })
    : t("{count} operational alerts", { count: alertSummary.total });
  const warningDetail = alertSummary.warning === 1
    ? t("{count} warning also needs review.", { count: alertSummary.warning })
    : t("{count} warnings also need review.", { count: alertSummary.warning });

  return (
    <section className="dash-page" aria-busy={loading}>
      <header className="dash-heading">
        <div className="dash-heading-copy">
          <span className="page-eyebrow">{t("EXECUTIVE OVERVIEW")}</span>
          <h1>{t("Business overview")}</h1>
          <p>
            {activeCompanyName} · {periodLabel} · {t("Welcome back, {name}.", { name: firstName })}
          </p>
        </div>
        <div className="dash-controls">
          <div className="dash-range" role="group" aria-label={t("Reporting period")}>
            {DASHBOARD_RANGES.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`dash-range-button${range === option.key ? " is-active" : ""}`}
                aria-pressed={range === option.key}
                title={t(option.title)}
                onClick={() => setRange(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button className="secondary-action dash-refresh" type="button" onClick={refresh} disabled={loading}>
            <span aria-hidden="true">↻</span>
            {refreshing ? t("Updating…") : t("Refresh")}
          </button>
        </div>
      </header>

      {error && (
        <div className="dash-error" role="alert">
          <div>
            <strong>{t("Dashboard data could not be loaded")}</strong>
            <p>{error}</p>
          </div>
          <button className="secondary-action" type="button" onClick={refresh} disabled={loading}>{t("Try again")}</button>
        </div>
      )}

      {!data && loading && <DashboardSkeleton />}

      {!data && !loading && !error && (
        <div className="dash-card dash-empty-page">
          <span aria-hidden="true">◌</span>
          <h2>{t("No dashboard data available")}</h2>
          <p>{t("Refresh the page or confirm that your role has reporting access to this company.")}</p>
          <button className="primary-action" type="button" onClick={refresh}>{t("Reload dashboard")}</button>
        </div>
      )}

      {data && (
        <div className={refreshing ? "dash-body is-updating" : "dash-body"}>
          {data.notifications.length > 0 && (
            <div className={`dash-alert-strip${alertSummary.critical > 0 ? " is-critical" : ""}`} role="status">
              <span className="dash-alert-icon" aria-hidden="true">{alertSummary.critical > 0 ? "⚠" : "◔"}</span>
              <div>
                <strong>{alertSummary.critical > 0 ? criticalHeading : totalHeading}</strong>
                <p>{alertSummary.warning > 0 ? warningDetail : t("Review the live alerts below to keep operations on track.")}</p>
              </div>
              <a className="dash-alert-link" href="#dash-notifications">{t("Review alerts")} <span aria-hidden="true">→</span></a>
            </div>
          )}

          {!data.hasBusinessAccess && (
            <div className="dash-card dash-empty-page">
              <span aria-hidden="true">♙</span>
              <h2>{t("Reporting access only")}</h2>
              <p>{t("Your role can open reports but does not have read access to sales, CRM, inventory or finance records. Ask a company administrator to grant the module permissions you need.")}</p>
              <Link className="primary-action" href="/app/roles">{t("Review roles & permissions")} <span aria-hidden="true">→</span></Link>
            </div>
          )}

          {data.hasBusinessAccess && (
            <>
              <div className="dash-section-head">
                <div>
                  <span className="page-eyebrow">{t("PERFORMANCE")}</span>
                  <h2>{t("Key indicators")}</h2>
                </div>
                <span className="dash-updated">
                  {t("Updated {date}", { date: formatDateTime(data.generatedAt, locale, data.company.timeZone) })}
                  {refreshing && <em> · {t("refreshing")}</em>}
                </span>
              </div>
              <div className="dash-kpis">
                {data.kpis.map((kpi) => <KpiCard key={kpi.key} kpi={kpi} currency={currency} locale={locale} />)}
              </div>

              <div className="dash-section-head">
                <div>
                  <span className="page-eyebrow">{t("ANALYTICS")}</span>
                  <h2>{t("Performance trends")}</h2>
                </div>
                <span className="dash-updated">{t("Compared with the previous period")}</span>
              </div>

              <div className="dash-chart-grid">
                {data.access.sales && (
                  <DashboardCard className="dash-span-2" title={t("Revenue over time")} subtitle={t("Net invoiced revenue, excluding tax and voided invoices")}>
                    <RevenueChart points={data.charts.revenueOverTime.map((point) => ({ ...point, label: bucketLabel(point.key) }))} currency={currency} locale={locale} />
                  </DashboardCard>
                )}

                {data.access.sales && (
                  <DashboardCard title={t("Orders by status")} subtitle={t("Sales orders created in the period")}>
                    <HorizontalBars
                      items={data.charts.ordersByStatus.map((entry) => ({
                        key: entry.status,
                        label: enumText(entry.status),
                        value: entry.count,
                        detail: t("{amount} order value", { amount: formatCurrency(entry.value, currency, locale) }),
                        color: orderColor(entry.status),
                      }))}
                      formatValue={(value) => value === 1 ? t("{count} order", { count: formatNumber(value, locale) }) : t("{count} orders", { count: formatNumber(value, locale) })}
                      emptyTitle={t("No orders in this period")}
                      emptyDetail={t("Orders appear here as soon as they are created from a converted quotation.")}
                    />
                  </DashboardCard>
                )}

                {data.access.sales && (
                  <DashboardCard title={t("Sales performance")} subtitle={t("Invoiced value against customer payments received")}>
                    <GroupedBarChart
                      points={data.charts.salesPerformance.map((point) => ({ ...point, label: bucketLabel(point.key) }))}
                      series={[
                        { key: "invoiced", label: t("Invoiced"), color: CHART_COLORS[0] },
                        { key: "collected", label: t("Collected"), color: CHART_COLORS[4] },
                      ]}
                      currency={currency}
                      locale={locale}
                    />
                  </DashboardCard>
                )}

                {data.access.crm && (
                  <DashboardCard title={t("Customer growth")} subtitle={t("New customers and prospects created per period")}>
                    <CustomerGrowthChart points={data.charts.customerGrowth.map((point) => ({ ...point, label: bucketLabel(point.key) }))} locale={locale} />
                  </DashboardCard>
                )}

                {data.access.finance && (
                  <DashboardCard
                    title={t("Monthly expenses")}
                    subtitle={data.expenseTracking.available ? t("Posted journal lines on active expense accounts") : t("Expense tracking is not configured")}
                  >
                    {data.expenseTracking.available ? (
                      <GroupedBarChart
                        points={data.charts.monthlyExpenses.map((point) => ({ ...point, label: bucketLabel(point.key) }))}
                        series={[{ key: "value", label: t("Expenses"), color: CHART_COLORS[3] }]}
                        currency={currency}
                        locale={locale}
                      />
                    ) : (
                      <ExpenseUnavailable note={t("No active expense accounts have been configured, so expense and profit metrics are not shown.")} />
                    )}
                  </DashboardCard>
                )}

                {data.access.sales && (
                  <DashboardCard title={t("Top products")} subtitle={t("Best selling catalog items by invoiced revenue")}>
                    <HorizontalBars
                      items={data.charts.topProducts.map((product) => ({
                        key: product.sku,
                        label: product.name,
                        value: product.revenue,
                        detail: t("{value} units sold · {sku}", { value: formatNumber(product.quantity, locale, 2), sku: product.sku }),
                      }))}
                      formatValue={(value) => formatCurrency(value, currency, locale)}
                      emptyTitle={t("No product revenue yet")}
                      emptyDetail={t("Invoice lines on issued invoices populate this ranking.")}
                    />
                  </DashboardCard>
                )}

                {data.access.inventory && (
                  <DashboardCard title={t("Inventory distribution")} subtitle={t("Stock value by warehouse at current unit cost")}>
                    <DonutChart
                      items={data.charts.inventoryDistribution}
                      currency={currency}
                      locale={locale}
                      emptyTitle={t("No stock value recorded")}
                      emptyDetail={t("Receive inventory into a warehouse to populate the distribution.")}
                    />
                  </DashboardCard>
                )}
              </div>

              <div className="dash-section-head">
                <div>
                  <span className="page-eyebrow">{t("OPERATIONS")}</span>
                  <h2>{t("Live workspace")}</h2>
                </div>
                <span className="dash-updated">{t("Real-time records from {company}", { company: activeCompanyName })}</span>
              </div>

              <div className="dash-widget-grid">
                {data.access.sales && (
                  <DashboardCard title={t("Recent sales")} subtitle={t("Latest customer invoices")} action={{ href: "/app/sales", label: t("Open receivables") }} className="dash-span-wide">
                    {data.widgets.recentSales.length > 0 ? (
                      <div className="dash-table-wrap">
                        <table className="dash-table">
                          <thead>
                            <tr><th>{t("Invoice")}</th><th>{t("Customer")}</th><th>{t("Status")}</th><th className="is-numeric">{t("Total")}</th><th className="is-numeric">{t("Balance")}</th></tr>
                          </thead>
                          <tbody>
                            {data.widgets.recentSales.map((sale) => (
                              <tr key={sale.id}>
                                <td><strong>{sale.number}</strong><small>{formatDay(sale.issuedAt, locale)}</small></td>
                                <td>{truncate(sale.customer.name, 30)}</td>
                                <td><StatusChip status={sale.status} tone={INVOICE_TONES[sale.status] ?? "muted"} /></td>
                                <td className="is-numeric">{formatCurrency(sale.total, sale.currencyCode, locale)}</td>
                                <td className="is-numeric">{formatCurrency(sale.balance, sale.currencyCode, locale)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <CompactEmpty icon="◫" title={t("No invoices yet")} detail={t("Issue an invoice from a delivered order to start receivables.")} href="/app/sales" linkLabel={t("Open sales")} />}
                  </DashboardCard>
                )}

                {data.access.sales && (
                  <DashboardCard title={t("Recent orders")} subtitle={t("Latest sales orders created")}>
                    {data.widgets.recentOrders.length > 0 ? (
                      <div className="dash-list">
                        {data.widgets.recentOrders.map((order) => (
                          <OrderRow key={order.id} order={order} locale={locale} currency={currency} />
                        ))}
                      </div>
                    ) : <CompactEmpty icon="▤" title={t("No orders yet")} detail={t("Convert a sent quotation into an order to begin fulfilment.")} href="/app/sales" linkLabel={t("Open sales")} />}
                  </DashboardCard>
                )}

                {data.access.sales && (
                  <DashboardCard title={t("Pending invoices")} subtitle={t("Open balances ordered by due date")}>
                    {data.widgets.pendingInvoices.length > 0 ? (
                      <div className="dash-list">
                        {data.widgets.pendingInvoices.map((invoice) => (
                          <PendingInvoiceRow key={invoice.id} invoice={invoice} locale={locale} referenceTime={data.generatedAt} />
                        ))}
                      </div>
                    ) : <CompactEmpty icon="✓" title={t("No open receivables")} detail={t("Every issued invoice is fully paid or voided.")} href="/app/sales" linkLabel={t("Review invoices")} />}
                  </DashboardCard>
                )}

                {data.access.inventory && (
                  <DashboardCard title={t("Low-stock alerts")} subtitle={t("Items at or below their reorder point")} action={{ href: "/app/inventory", label: t("Manage stock") }}>
                    {data.widgets.lowStock.length > 0 ? (
                      <div className="dash-list">
                        {data.widgets.lowStock.map((item) => <LowStockRow key={item.id} item={item} locale={locale} />)}
                      </div>
                    ) : <CompactEmpty icon="✓" title={t("Stock levels are healthy")} detail={t("No active item is at or below its reorder point.")} href="/app/inventory" linkLabel={t("Review inventory")} />}
                  </DashboardCard>
                )}

                {data.access.crm && (
                  <DashboardCard title={t("Recent customers")} subtitle={t("Newest customer and prospect records")} action={{ href: "/app/crm", label: t("Open CRM") }}>
                    {data.widgets.recentCustomers.length > 0 ? (
                      <div className="dash-list">
                        {data.widgets.recentCustomers.map((customer) => <CustomerRow key={customer.id} customer={customer} locale={locale} />)}
                      </div>
                    ) : <CompactEmpty icon="◎" title={t("No customers yet")} detail={t("Add a customer or prospect to start the pipeline.")} href="/app/crm" linkLabel={t("Open CRM")} />}
                  </DashboardCard>
                )}

                {data.access.crm && (
                  <DashboardCard title={t("Upcoming follow-ups")} subtitle={t("Open CRM activities that need attention")}>
                    {data.widgets.activities.length > 0 ? (
                      <div className="dash-list">
                        {data.widgets.activities.map((activity) => (
                          <ActivityRow key={activity.id} activity={activity} locale={locale} referenceTime={data.generatedAt} />
                        ))}
                      </div>
                    ) : <CompactEmpty icon="✓" title={t("No open follow-ups")} detail={t("Create a task, call, meeting or email in the CRM.")} href="/app/crm" linkLabel={t("Open CRM")} />}
                  </DashboardCard>
                )}

                <DashboardCard
                  id="dash-notifications"
                  title={t("Notifications")}
                  subtitle={t("Derived from live tenant records")}
                  action={{ href: "/app", label: t("Refresh"), onClick: refresh }}
                  className="dash-span-wide"
                >
                  {data.notifications.length > 0 ? (
                    <div className="dash-notification-list">
                      {data.notifications.map((notification) => <NotificationRow key={notification.id} notification={notification} locale={locale} timeZone={data.company.timeZone} />)}
                    </div>
                  ) : <CompactEmpty icon="✓" title={t("All clear")} detail={t("No overdue invoices, low-stock items, pending orders or due follow-ups.")} />}
                </DashboardCard>

                <DashboardCard title={t("Quick actions")} subtitle={t("Jump straight into the work that needs you")}>
                  <div className="dash-quick-actions">
                    {quickActions.map((action) => (
                      <Link className="dash-quick-action" href={action.href} key={action.label}>
                        <span className="dash-quick-icon" aria-hidden="true">{action.glyph}</span>
                        <span><strong>{t(action.label)}</strong><small>{t(action.detail)}</small></span>
                        <span className="dash-quick-arrow" aria-hidden="true">→</span>
                      </Link>
                    ))}
                  </div>
                </DashboardCard>
              </div>

              <div className="dash-notes">
                <p><strong>{t("Data source.")}</strong> {t("Every indicator is calculated from live records in {company}. No demo or placeholder values are used.", { company: activeCompanyName })}</p>
                <p><strong>{t("Net profit is not shown.")}</strong> {data.expenseTracking.available ? t("Cost of goods sold is not yet tracked at invoice level, so a reliable profit figure is not available.") : t("No active expense accounts have been configured, so expense and profit metrics are not shown.")}</p>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function KpiCard({ kpi, currency, locale }: { kpi: DashboardKpi; currency: string; locale: string }) {
  const { t } = useI18n();
  const value = kpi.available
    ? kpi.format === "currency"
      ? formatCurrency(kpi.value, currency, locale)
      : formatNumber(kpi.value, locale)
    : "—";
  const direction = kpi.changeDirection ?? "flat";
  const tooltip = kpi.changePct === null ? undefined : t("{value} versus the previous period", { value: formatPercent(kpi.changePct, locale) });
  const caption = kpi.available
    ? kpi.captionKey
      ? t(kpi.captionKey, kpi.captionParams)
      : t(KPI_CAPTION_KEYS[kpi.key] ?? kpi.caption)
    : t("Not configured for this company");

  return (
    <article className={`kpi-card${kpi.status === "warning" ? " is-warning" : kpi.status === "critical" ? " is-critical" : ""}${kpi.available ? "" : " is-unavailable"}`}>
      <div className="kpi-top">
        <span className="kpi-label">{t(KPI_LABEL_KEYS[kpi.key] ?? kpi.label)}</span>
        <span className="kpi-icon" aria-hidden="true">{KPI_ICONS[kpi.key] ?? "◇"}</span>
      </div>
      <div className="kpi-value-row">
        <strong className="kpi-value">{value}</strong>
        {kpi.available && kpi.changePct !== null && (
          <span className={`kpi-change is-${direction}`} title={tooltip}>
            <span aria-hidden="true">{direction === "up" ? "↑" : direction === "down" ? "↓" : "→"}</span>
            {formatPercent(kpi.changePct, locale)}
          </span>
        )}
      </div>
      <p className="kpi-caption">{caption}</p>
    </article>
  );
}

function DashboardCard({
  id,
  title,
  subtitle,
  action,
  className = "",
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  action?: { href: string; label: string; onClick?: () => void };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article className={`dash-card ${className}`.trim()} id={id}>
      <div className="dash-card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action && (
          <Link className="dash-card-link" href={action.href} onClick={() => action.onClick?.()}>
            {action.label} <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
      <div className="dash-card-body">{children}</div>
    </article>
  );
}

function StatusChip({ status, tone }: { status: string; tone: string }) {
  const { enum: enumText } = useI18n();
  return <span className={`dash-chip dash-chip-${tone}`}>{enumText(status)}</span>;
}

function OrderRow({ order, locale, currency }: { order: RecentOrder; locale: string; currency: string }) {
  return (
    <div className="dash-list-row">
      <span className="dash-list-symbol" aria-hidden="true">↗</span>
      <span className="dash-list-main">
        <strong>{order.number}</strong>
        <small>{order.customer.name} · {formatDay(order.createdAt, locale)}</small>
      </span>
      <span className="dash-list-meta">
        <StatusChip status={order.status} tone={ORDER_TONES[order.status] ?? "muted"} />
        <b>{formatCurrency(order.total, order.currencyCode || currency, locale)}</b>
      </span>
    </div>
  );
}

function PendingInvoiceRow({ invoice, locale, referenceTime }: { invoice: RecentSale; locale: string; referenceTime: string }) {
  const { t } = useI18n();
  const overdue = new Date(invoice.dueAt).getTime() < new Date(referenceTime).getTime();
  return (
    <div className={`dash-list-row${overdue ? " is-overdue" : ""}`}>
      <span className={`dash-list-symbol${overdue ? " is-danger" : ""}`} aria-hidden="true">{overdue ? "!" : "◔"}</span>
      <span className="dash-list-main">
        <strong>{invoice.number}</strong>
        <small>{invoice.customer.name} · {t("due {date}", { date: formatDay(invoice.dueAt, locale) })}{overdue ? ` · ${t("overdue")}` : ""}</small>
      </span>
      <span className="dash-list-meta">
        <StatusChip status={invoice.status} tone={INVOICE_TONES[invoice.status] ?? "muted"} />
        <b>{formatCurrency(invoice.balance, invoice.currencyCode, locale)}</b>
      </span>
    </div>
  );
}

function LowStockRow({ item, locale }: { item: LowStockItem; locale: string }) {
  const { t } = useI18n();
  const ratio = item.reorderPoint > 0 ? Math.max(0, Math.min(100, (item.onHand / item.reorderPoint) * 100)) : 0;
  return (
    <div className="dash-list-row is-stacked">
      <span className="dash-list-symbol is-warning" aria-hidden="true">⚠</span>
      <span className="dash-list-main">
        <strong>{item.name}</strong>
        <small>{t("{onHand} {unit} on hand · reorder at {reorder}", { onHand: formatNumber(item.onHand, locale, 2), unit: item.unit, reorder: formatNumber(item.reorderPoint, locale, 2) })}</small>
        <span className="dash-stock-bar" aria-hidden="true"><i style={{ width: `${Math.max(ratio, 2)}%` }} /></span>
      </span>
      <span className="dash-list-meta">
        <b className="dash-shortage">-{formatNumber(item.shortage, locale, 2)}</b>
        <small>{t("short")}</small>
      </span>
    </div>
  );
}

function CustomerRow({ customer, locale }: { customer: RecentCustomer; locale: string }) {
  const { enum: enumText } = useI18n();
  return (
    <div className="dash-list-row">
      <span className="dash-list-symbol" aria-hidden="true">{customer.name.slice(0, 1).toUpperCase()}</span>
      <span className="dash-list-main">
        <strong>{customer.name}</strong>
        <small>{customer.code} · {enumText(customer.type)}{customer.city ? ` · ${customer.city}` : ""}</small>
      </span>
      <span className="dash-list-meta">
        <small>{formatDay(customer.createdAt, locale)}</small>
      </span>
    </div>
  );
}

function ActivityRow({ activity, locale, referenceTime }: { activity: DashboardActivity; locale: string; referenceTime: string }) {
  const { t, enum: enumText } = useI18n();
  const overdue = Boolean(activity.dueAt && new Date(activity.dueAt).getTime() < new Date(referenceTime).getTime());
  return (
    <div className={`dash-list-row${overdue ? " is-overdue" : ""}`}>
      <span className={`dash-chip dash-chip-${ACTIVITY_TONES[activity.type] ?? "muted"}`}>{enumText(activity.type)}</span>
      <span className="dash-list-main">
        <strong>{activity.subject}</strong>
        <small>
          {activity.customer?.name ?? t("Company")}
          {activity.opportunity ? ` · ${activity.opportunity.reference}` : ""}
          {activity.dueAt ? ` · ${overdue ? t("overdue") : t("due")} ${formatDateTime(activity.dueAt, locale)}` : ""}
        </small>
      </span>
      <Link className="dash-row-link" href="/app/crm">{t("Open")}</Link>
    </div>
  );
}

function NotificationRow({ notification, locale, timeZone }: { notification: DashboardNotification; locale: string; timeZone: string }) {
  const { t } = useI18n();
  return (
    <Link className={`dash-notification dash-notification-${notification.severity}`} href={notification.href}>
      <span className="dash-notification-dot" aria-hidden="true" />
      <span>
        <strong>{notification.titleKey ? t(notification.titleKey, notification.titleParams) : notification.title}</strong>
        <small>{notification.detailKey ? t(notification.detailKey, notification.detailParams) : notification.detail}</small>
      </span>
      <span className="dash-notification-time">{formatDateTime(notification.createdAt, locale, timeZone)}</span>
    </Link>
  );
}

function CompactEmpty({
  icon,
  title,
  detail,
  href,
  linkLabel,
}: {
  icon: string;
  title: string;
  detail: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="dash-empty">
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {href && linkLabel && <Link href={href}>{linkLabel} <span aria-hidden="true">→</span></Link>}
    </div>
  );
}

function ExpenseUnavailable({ note }: { note: string }) {
  const { t } = useI18n();
  return (
    <div className="dash-empty">
      <span aria-hidden="true">⇩</span>
      <strong>{t("Expense accounting is not configured")}</strong>
      <p>{note}</p>
    </div>
  );
}

function DashboardSkeleton() {
  const { t } = useI18n();
  return (
    <div className="dash-skeleton" aria-label={t("Loading dashboard")}>
      <div className="dash-kpis">
        {Array.from({ length: 10 }).map((_, index) => <div className="dash-skeleton-card" key={index} />)}
      </div>
      <div className="dash-chart-grid">
        <div className="dash-skeleton-card dash-skeleton-chart dash-span-2" />
        <div className="dash-skeleton-card dash-skeleton-chart" />
        <div className="dash-skeleton-card dash-skeleton-chart" />
        <div className="dash-skeleton-card dash-skeleton-chart dash-span-2" />
      </div>
    </div>
  );
}

function orderColor(status: string) {
  switch (status) {
    case "OPEN":
      return CHART_COLORS[1];
    case "PARTIALLY_DELIVERED":
      return CHART_COLORS[3];
    case "DELIVERED":
    case "INVOICED":
      return CHART_COLORS[4];
    case "PARTIALLY_INVOICED":
      return CHART_COLORS[0];
    default:
      return CHART_COLORS[6];
  }
}
