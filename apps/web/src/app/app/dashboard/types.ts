export const DASHBOARD_RANGES = [
  { key: "7d", label: "7D", title: "Last 7 days" },
  { key: "30d", label: "30D", title: "Last 30 days" },
  { key: "90d", label: "90D", title: "Last 90 days" },
  { key: "6m", label: "6M", title: "Last 6 months" },
  { key: "12m", label: "12M", title: "Last 12 months" },
  { key: "ytd", label: "YTD", title: "Year to date" },
] as const;

export type DashboardRange = (typeof DASHBOARD_RANGES)[number]["key"];
export type ChangeDirection = "up" | "down" | "flat";
export type KpiStatus = "normal" | "warning" | "critical";

export type DashboardKpi = {
  key: string;
  label: string;
  value: number;
  format: "currency" | "number";
  previous: number | null;
  changePct: number | null;
  changeDirection: ChangeDirection | null;
  caption: string;
  captionKey?: string;
  captionParams?: Record<string, string | number>;
  status: KpiStatus;
  available: boolean;
};

export type DashboardCompany = {
  id: string;
  name: string;
  currencyCode: string;
  locale: string;
  timeZone: string;
  fiscalYearStartMonth: number;
};

export type DashboardPeriod = {
  key: DashboardRange;
  label: string;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  granularity: "day" | "week" | "month";
  buckets: string[];
};

export type DashboardAccess = {
  sales: boolean;
  crm: boolean;
  inventory: boolean;
  finance: boolean;
};

export type DashboardNotification = {
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

type SeriesPoint = { key: string; label: string };

export type RevenuePoint = SeriesPoint & { revenue: number; invoices: number };
export type SalesPerformancePoint = SeriesPoint & { invoiced: number; collected: number };
export type ExpensePoint = SeriesPoint & { value: number };
export type CustomerGrowthPoint = SeriesPoint & { customers: number; prospects: number };

export type OrderStatusPoint = { status: string; count: number; value: number };
export type TopProduct = { name: string; sku: string; revenue: number; quantity: number };
export type InventoryDistributionPoint = { name: string; code: string; value: number };

export type RecentSale = {
  id: string;
  number: string;
  status: string;
  total: number;
  paidAmount: number;
  balance: number;
  currencyCode: string;
  issuedAt: string;
  dueAt: string;
  customer: { name: string };
};

export type RecentOrder = {
  id: string;
  number: string;
  status: string;
  total: number;
  currencyCode: string;
  createdAt: string;
  customer: { name: string };
};

export type RecentCustomer = {
  id: string;
  code: string;
  name: string;
  type: string;
  city: string | null;
  createdAt: string;
};

export type LowStockItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  reorderPoint: number;
  onHand: number;
  shortage: number;
};

export type DashboardActivity = {
  id: string;
  type: string;
  subject: string;
  dueAt: string | null;
  createdAt: string;
  customer: { name: string } | null;
  opportunity: { reference: string; title: string } | null;
};

export type DashboardWidgets = {
  recentSales: RecentSale[];
  recentOrders: RecentOrder[];
  recentCustomers: RecentCustomer[];
  lowStock: LowStockItem[];
  pendingInvoices: RecentSale[];
  activities: DashboardActivity[];
};

export type DashboardOverview = {
  generatedAt: string;
  company: DashboardCompany;
  period: DashboardPeriod;
  access: DashboardAccess;
  hasBusinessAccess: boolean;
  expenseTracking: { available: boolean; accountCount: number; note: string };
  kpis: DashboardKpi[];
  charts: {
    revenueOverTime: RevenuePoint[];
    salesPerformance: SalesPerformancePoint[];
    ordersByStatus: OrderStatusPoint[];
    monthlyExpenses: ExpensePoint[];
    topProducts: TopProduct[];
    inventoryDistribution: InventoryDistributionPoint[];
    customerGrowth: CustomerGrowthPoint[];
  };
  widgets: DashboardWidgets;
  notifications: DashboardNotification[];
};
