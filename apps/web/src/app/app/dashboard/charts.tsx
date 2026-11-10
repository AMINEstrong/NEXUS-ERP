"use client";

import { useId } from "react";
import { useI18n } from "../../../lib/i18n";
import { formatCompactCurrency, formatCompactNumber, formatCurrency, formatNumber } from "./format";

export const CHART_COLORS = ["#2b9db2", "#4f7cac", "#7a6ff0", "#d89a4a", "#54a37d", "#c26d8e", "#7d8fa3"];

const WIDTH = 720;
const HEIGHT = 252;
const PADDING = { top: 18, right: 18, bottom: 38, left: 62 };
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

function niceMax(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const power = 10 ** exponent;
  const fraction = value / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

function xPosition(index: number, length: number) {
  if (length <= 1) return PADDING.left + PLOT_WIDTH / 2;
  return PADDING.left + (index / (length - 1)) * PLOT_WIDTH;
}

function labelStep(length: number, max = 8) {
  return Math.max(1, Math.ceil(length / max));
}

function axisLabels<T extends { label: string }>(points: T[]) {
  const step = labelStep(points.length);
  return points
    .map((point, index) => ({ ...point, index }))
    .filter((point) => point.index % step === 0 || point.index === points.length - 1);
}

export function ChartEmpty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="chart-empty">
      <span aria-hidden="true">◌</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

export function RevenueChart({
  points,
  currency,
  locale,
}: {
  points: Array<{ key: string; label: string; revenue: number; invoices: number }>;
  currency: string;
  locale: string;
}) {
  const { t } = useI18n();
  const gradientId = `revenue-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (points.length === 0 || points.every((point) => point.revenue === 0)) {
    return <ChartEmpty title={t("No invoiced revenue in this period")} detail={t("Issue an invoice or choose a wider reporting period to see the trend.")} />;
  }

  const max = niceMax(Math.max(...points.map((point) => point.revenue)));
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const positions = points.map((point, index) => ({
    ...point,
    x: xPosition(index, points.length),
    y: PADDING.top + PLOT_HEIGHT - (point.revenue / max) * PLOT_HEIGHT,
  }));
  const line = positions.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const baseline = PADDING.top + PLOT_HEIGHT;
  const area = `${line} L ${positions.at(-1)!.x.toFixed(2)} ${baseline} L ${positions[0].x.toFixed(2)} ${baseline} Z`;
  const total = points.reduce((sum, point) => sum + point.revenue, 0);
  const invoices = points.reduce((sum, point) => sum + point.invoices, 0);
  const visibleDots = points.length <= 16;
  const invoiceCount = invoices === 1
    ? t("{count} invoice in period", { count: invoices })
    : t("{count} invoices in period", { count: invoices });

  return (
    <div className="chart-wrap">
      <div className="chart-summary">
        <strong>{formatCurrency(total, currency, locale)}</strong>
        <span>{invoiceCount}</span>
      </div>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={t("Revenue over time. Total {total} across {count} invoices.", { total: formatCurrency(total, currency, locale), count: invoices })}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity="0.32" />
            <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const y = PADDING.top + PLOT_HEIGHT - tick * PLOT_HEIGHT;
          return (
            <g key={tick}>
              <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} className="chart-grid-line" />
              <text x={PADDING.left - 9} y={y + 3} textAnchor="end" className="chart-axis-text">
                {formatCompactCurrency(max * tick, currency, locale)}
              </text>
            </g>
          );
        })}
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={CHART_COLORS[0]} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {positions.map((point) => (
          <g key={point.key}>
            {visibleDots && <circle cx={point.x} cy={point.y} r="3.4" fill="#fff" stroke={CHART_COLORS[0]} strokeWidth="2" />}
            <circle cx={point.x} cy={point.y} r="11" fill="transparent">
              <title>{t("{label}: {value} · {count} invoices", { label: point.label, value: formatCurrency(point.revenue, currency, locale), count: point.invoices })}</title>
            </circle>
          </g>
        ))}
        {axisLabels(points).map((point) => (
          <text
            key={point.key}
            x={Math.min(Math.max(xPosition(point.index, points.length), PADDING.left + 18), WIDTH - PADDING.right - 18)}
            y={HEIGHT - 12}
            textAnchor="middle"
            className="chart-axis-text"
          >
            {point.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function GroupedBarChart({
  points,
  series,
  currency,
  locale,
}: {
  points: Array<{ key: string; label: string } & Record<string, string | number>>;
  series: Array<{ key: string; label: string; color: string }>;
  currency: string;
  locale: string;
}) {
  const { t } = useI18n();
  if (points.length === 0) {
    return <ChartEmpty title={t("No activity yet")} detail={t("Data appears as records are created in this reporting period.")} />;
  }
  const max = niceMax(
    Math.max(
      1,
      ...points.flatMap((point) => series.map((entry) => Number(point[entry.key] ?? 0))),
    ),
  );
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const slot = PLOT_WIDTH / Math.max(points.length, 1);
  const groupWidth = Math.max(5, slot * 0.66);
  const barWidth = Math.max(2.5, groupWidth / series.length - 2);
  const step = labelStep(points.length);

  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        {series.map((entry) => (
          <span key={entry.key}>
            <i style={{ background: entry.color }} aria-hidden="true" />
            {entry.label}
          </span>
        ))}
      </div>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={t("{series} by {period}.", { series: series.map((entry) => entry.label).join(t(" and ")), period: points[0]?.label ?? t("period") })}
      >
        {ticks.map((tick) => {
          const y = PADDING.top + PLOT_HEIGHT - tick * PLOT_HEIGHT;
          return (
            <g key={tick}>
              <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} className="chart-grid-line" />
              <text x={PADDING.left - 9} y={y + 3} textAnchor="end" className="chart-axis-text">
                {formatCompactCurrency(max * tick, currency, locale)}
              </text>
            </g>
          );
        })}
        {points.map((point, index) => {
          const center = PADDING.left + slot * index + slot / 2;
          return (
            <g key={point.key ?? index}>
              {index % step === 0 && (
                <text x={center} y={HEIGHT - 12} textAnchor="middle" className="chart-axis-text">
                  {point.label}
                </text>
              )}
              {series.map((entry, seriesIndex) => {
                const value = Number(point[entry.key] ?? 0);
                const height = (value / max) * PLOT_HEIGHT;
                const x = center - (series.length * barWidth + (series.length - 1) * 2) / 2 + seriesIndex * (barWidth + 2);
                return (
                  <rect
                    key={entry.key}
                    x={x}
                    y={PADDING.top + PLOT_HEIGHT - height}
                    width={barWidth}
                    height={Math.max(value > 0 ? 2 : 0, height)}
                    rx={Math.min(2.5, barWidth / 2)}
                    fill={entry.color}
                  >
                    <title>{t("{label} · {series}: {value}", { label: point.label, series: entry.label, value: formatCurrency(value, currency, locale) })}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function HorizontalBars({
  items,
  formatValue,
  emptyTitle,
  emptyDetail,
}: {
  items: Array<{ key: string; label: string; value: number; detail?: string; color?: string }>;
  formatValue: (value: number) => string;
  emptyTitle: string;
  emptyDetail: string;
}) {
  if (items.length === 0) return <ChartEmpty title={emptyTitle} detail={emptyDetail} />;
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="hbar-list">
      {items.map((item, index) => (
        <div className="hbar-row" key={item.key}>
          <div className="hbar-head">
            <span>{item.label}</span>
            <b>{formatValue(item.value)}</b>
          </div>
          <div className="hbar-track" aria-hidden="true">
            <span style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, background: item.color ?? CHART_COLORS[index % CHART_COLORS.length] }} />
          </div>
          {item.detail && <small>{item.detail}</small>}
        </div>
      ))}
    </div>
  );
}

export function DonutChart({
  items,
  currency,
  locale,
  emptyTitle,
  emptyDetail,
}: {
  items: Array<{ name: string; code: string; value: number }>;
  currency: string;
  locale: string;
  emptyTitle: string;
  emptyDetail: string;
}) {
  const { t } = useI18n();
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (items.length === 0 || total <= 0) return <ChartEmpty title={emptyTitle} detail={emptyDetail} />;

  const merged = items.length > 6
    ? [...items.slice(0, 5), { name: t("Other warehouses"), code: "OTHER", value: items.slice(5).reduce((sum, item) => sum + item.value, 0) }]
    : items;
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="donut-layout">
      <div className="donut-visual">
        <svg viewBox="0 0 180 180" role="img" aria-label={t("Inventory value by warehouse. Total {total}.", { total: formatCurrency(total, currency, locale) })}>
          <circle cx="90" cy="90" r={radius} fill="none" stroke="var(--erp-soft)" strokeWidth="19" />
          {merged.map((item, index) => {
            const fraction = item.value / total;
            const length = Math.max(0, fraction * circumference - 2);
            const dashOffset = -offset;
            offset += fraction * circumference;
            return (
              <circle
                key={item.code}
                cx="90"
                cy="90"
                r={radius}
                fill="none"
                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                strokeWidth="19"
                strokeDasharray={`${length} ${Math.max(0, circumference - length)}`}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 90 90)"
              >
                <title>{t("{name}: {value} ({percent}%)", { name: item.name, value: formatCurrency(item.value, currency, locale), percent: formatNumber(fraction * 100, locale, 0) })}</title>
              </circle>
            );
          })}
          <text x="90" y="86" textAnchor="middle" className="donut-total-label">{t("STOCK VALUE")}</text>
          <text x="90" y="105" textAnchor="middle" className="donut-total-value">{formatCompactCurrency(total, currency, locale)}</text>
        </svg>
      </div>
      <div className="donut-legend">
        {merged.map((item, index) => (
          <div key={item.code} className="donut-legend-row">
            <i style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} aria-hidden="true" />
            <span><strong>{item.name}</strong><small>{item.code}</small></span>
            <b>{formatCompactCurrency(item.value, currency, locale)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CustomerGrowthChart({
  points,
  locale,
}: {
  points: Array<{ key: string; label: string; customers: number; prospects: number }>;
  locale: string;
}) {
  const { t } = useI18n();
  if (points.length === 0) {
    return <ChartEmpty title={t("No customer history yet")} detail={t("New customers and prospects appear as they are created.")} />;
  }
  const max = niceMax(Math.max(1, ...points.flatMap((point) => [point.customers, point.prospects])));
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const slot = PLOT_WIDTH / Math.max(points.length, 1);
  const barWidth = Math.max(3, Math.min(16, slot * 0.26));
  const step = labelStep(points.length);
  const totalCustomers = points.reduce((sum, point) => sum + point.customers, 0);
  const totalProspects = points.reduce((sum, point) => sum + point.prospects, 0);

  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        <span><i style={{ background: CHART_COLORS[0] }} aria-hidden="true" />{t("New customers")}</span>
        <span><i style={{ background: CHART_COLORS[3] }} aria-hidden="true" />{t("New prospects")}</span>
      </div>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={t("Customer growth by period. {customers} new customers and {prospects} new prospects.", { customers: totalCustomers, prospects: totalProspects })}
      >
        {ticks.map((tick) => {
          const y = PADDING.top + PLOT_HEIGHT - tick * PLOT_HEIGHT;
          return (
            <g key={tick}>
              <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} className="chart-grid-line" />
              <text x={PADDING.left - 9} y={y + 3} textAnchor="end" className="chart-axis-text">
                {formatCompactNumber(max * tick, locale)}
              </text>
            </g>
          );
        })}
        {points.map((point, index) => {
          const center = PADDING.left + slot * index + slot / 2;
          return (
            <g key={point.key}>
              {index % step === 0 && (
                <text x={center} y={HEIGHT - 12} textAnchor="middle" className="chart-axis-text">
                  {point.label}
                </text>
              )}
              <rect
                x={center - barWidth - 2}
                y={PADDING.top + PLOT_HEIGHT - (point.customers / max) * PLOT_HEIGHT}
                width={barWidth}
                height={Math.max(point.customers > 0 ? 2 : 0, (point.customers / max) * PLOT_HEIGHT)}
                rx="2"
                fill={CHART_COLORS[0]}
              >
                <title>{t("{label} · {count} new customers", { label: point.label, count: point.customers })}</title>
              </rect>
              <rect
                x={center + 2}
                y={PADDING.top + PLOT_HEIGHT - (point.prospects / max) * PLOT_HEIGHT}
                width={barWidth}
                height={Math.max(point.prospects > 0 ? 2 : 0, (point.prospects / max) * PLOT_HEIGHT)}
                rx="2"
                fill={CHART_COLORS[3]}
              >
                <title>{t("{label} · {count} new prospects", { label: point.label, count: point.prospects })}</title>
              </rect>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
