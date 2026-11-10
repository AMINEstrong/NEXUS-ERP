"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest, dateInputValue } from "../../../lib/api";
import { useI18n } from "../../../lib/i18n";
import { useNexusSession, usePermissions } from "../session-context";

type PageResult<T> = { data: T[]; total: number };
type Customer = { id: string; code: string; name: string; type: string; isActive: boolean };
type Product = { id: string; sku: string; name: string; unit: string; unitCost: string; isActive: boolean };
type Warehouse = { id: string; code: string; name: string; isActive: boolean };
type SalesLine = { id: string; productId: string; description: string; quantity: string; deliveredQuantity?: string; invoicedQuantity?: string; unitPrice: string; taxRate: string; subtotal: string; taxAmount: string; total: string; product: { sku: string; name: string; unit: string } };
type Quote = { id: string; number: string; status: string; total: string; currencyCode: string; validUntil: string | null; createdAt: string; customer: { code: string; name: string }; lines: SalesLine[]; order?: { id: string; number: string; status: string } | null };
type Order = { id: string; number: string; status: string; total: string; currencyCode: string; customer: { code: string; name: string }; lines: SalesLine[]; deliveries: { id: string; number: string }[]; invoices: { id: string; number: string; status: string; total: string; paidAmount: string }[] };
type Invoice = { id: string; number: string; status: string; total: string; paidAmount: string; currencyCode: string; dueAt: string; customer: { code: string; name: string }; order: { number: string }; lines: SalesLine[]; payments: { id: string; number: string; amount: string; method: string; receivedAt: string; journalEntry: { reference: string; lines: { debit: string; credit: string; account: { code: string; name: string; type: string } }[] } }[]; journalEntry: { reference: string; lines: { debit: string; credit: string; account: { code: string; name: string } }[] } };
type Summary = { quotationCount: number; openQuotationCount: number; orderCount: number; openInvoiceCount: number; receivables: string };

const emptyQuote = { customerId: "", productId: "", quantity: "2.000", unitPrice: "", taxRate: "20.00", validUntil: "", notes: "" };
const amount = (value: string | undefined) => Number(value ?? 0);

export function SalesView() {
  const session = useNexusSession();
  const access = usePermissions();
  const { t, enum: enumText, currency: formatMoney, date: formatDate } = useI18n();
  const canCreate = access.can("sales.create");
  const canApprove = access.can("sales.approve");
  const currency = session.memberships.find((company) => company.id === session.activeCompanyId)?.currencyCode ?? "MAD";
  const [summary, setSummary] = useState<Summary | null>(null);
  const [quotations, setQuotations] = useState<Quote[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [quoteDraft, setQuoteDraft] = useState(emptyQuote);
  const [warehouseId, setWarehouseId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, { amount: string; method: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const activeCustomers = useMemo(() => customers.filter((customer) => customer.isActive && customer.type === "CUSTOMER"), [customers]);
  const activeProducts = useMemo(() => products.filter((product) => product.isActive), [products]);

  async function loadSales() {
    setLoading(true); setError("");
    try {
      const [nextSummary, quoteData, orderData, invoiceData, customerData, productData, warehouseData] = await Promise.all([
        apiRequest<Summary>("/sales/summary"),
        apiRequest<PageResult<Quote>>("/sales/quotations?page=1&pageSize=100"),
        apiRequest<PageResult<Order>>("/sales/orders?page=1&pageSize=100"),
        apiRequest<PageResult<Invoice>>("/sales/invoices?page=1&pageSize=100"),
        apiRequest<PageResult<Customer>>("/crm/customers?page=1&pageSize=100"),
        apiRequest<PageResult<Product>>("/inventory/items?page=1&pageSize=100"),
        apiRequest<PageResult<Warehouse>>("/inventory/warehouses?page=1&pageSize=100"),
      ]);
      setSummary(nextSummary); setQuotations(quoteData.data); setOrders(orderData.data); setInvoices(invoiceData.data);
      setCustomers(customerData.data); setProducts(productData.data); setWarehouses(warehouseData.data);
      setQuoteDraft((draft) => ({ ...draft, customerId: draft.customerId || customerData.data.find((customer) => customer.type === "CUSTOMER" && customer.isActive)?.id || "", productId: draft.productId || productData.data.find((product) => product.isActive)?.id || "", unitPrice: draft.unitPrice || productData.data.find((product) => product.isActive)?.unitCost || "0.00" }));
      setWarehouseId((current) => current || warehouseData.data.find((warehouse) => warehouse.isActive)?.id || "");
      setPaymentDrafts((current) => {
        const next = { ...current };
        for (const invoice of invoiceData.data.filter((item) => item.status === "OPEN" || item.status === "PARTIALLY_PAID")) {
          next[invoice.id] ??= { amount: (amount(invoice.total) - amount(invoice.paidAmount)).toFixed(2), method: "BANK_TRANSFER" };
        }
        return next;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Sales data could not be loaded."));
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadSales(); }, []);
  useEffect(() => {
    // Defaults are created after mount so server and browser render the same
    // empty inputs and no fixed calendar date can go stale.
    setQuoteDraft((draft) => (draft.validUntil ? draft : { ...draft, validUntil: dateInputValue(30) }));
    setDueAt((current) => current || dateInputValue(30));
  }, []);

  async function createQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("quote"); setError(""); setNotice("");
    try {
      const product = activeProducts.find((item) => item.id === quoteDraft.productId);
      await apiRequest("/sales/quotations", { method: "POST", body: JSON.stringify({ customerId: quoteDraft.customerId, validUntil: quoteDraft.validUntil || undefined, notes: quoteDraft.notes || undefined, lines: [{ productId: quoteDraft.productId, quantity: quoteDraft.quantity, unitPrice: quoteDraft.unitPrice, taxRate: quoteDraft.taxRate, description: product?.name }] }) });
      setNotice(t("Quotation created as a draft. Send it to unlock order conversion.")); await loadSales();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("Quotation could not be created.")); }
    finally { setBusy(""); }
  }

  async function act(key: string, path: string, body?: unknown, success = t("Sales record updated.")) {
    setBusy(key); setError(""); setNotice("");
    try { await apiRequest(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); setNotice(success); await loadSales(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("The sales action failed.")); }
    finally { setBusy(""); }
  }

  function deliver(order: Order) {
    const lines = order.lines.map((line) => ({ orderLineId: line.id, quantity: (amount(line.quantity) - amount(line.deliveredQuantity)).toFixed(3) })).filter((line) => amount(line.quantity) > 0);
    if (!lines.length) { setError(t("This order has no remaining quantity to deliver.")); return; }
    void act(`deliver-${order.id}`, `/sales/orders/${order.id}/deliver`, { warehouseId, lines }, t("Delivery posted for {number}. Inventory was reduced.", { number: order.number }));
  }

  function invoice(order: Order) {
    const lines = order.lines.map((line) => ({ orderLineId: line.id, quantity: (amount(line.deliveredQuantity) - amount(line.invoicedQuantity)).toFixed(3) })).filter((line) => amount(line.quantity) > 0);
    if (!lines.length) { setError(t("This order has no delivered quantity available to invoice.")); return; }
    void act(`invoice-${order.id}`, `/sales/orders/${order.id}/invoices`, { dueAt, lines }, t("Invoice issued for {number} with a balanced journal entry.", { number: order.number }));
  }

  function pay(invoiceRecord: Invoice) {
    const draft = paymentDrafts[invoiceRecord.id] ?? { amount: "", method: "BANK_TRANSFER" };
    void act(`pay-${invoiceRecord.id}`, `/sales/invoices/${invoiceRecord.id}/payments`, { amount: draft.amount, method: draft.method }, t("Payment recorded for {number}.", { number: invoiceRecord.number }));
  }

  if (!access.can("sales.read")) {
    return <section className="sales-page inventory-page"><div className="page-heading"><div><span className="page-eyebrow">{t("COMMERCIAL OPERATIONS")}</span><h1>{t("Sales & receivables")}</h1></div></div><div className="empty-state"><h3>{t("Sales access is restricted")}</h3><p>{t("Your role does not include the sales.read permission. Ask a company administrator to grant it.")}</p></div></section>;
  }

  return <section className="sales-page inventory-page">
    <div className="page-heading"><div><span className="page-eyebrow">{t("COMMERCIAL OPERATIONS")}</span><h1>{t("Sales & receivables")}</h1><p>{t("Manage quotations through delivery, invoicing, and customer payments.")}</p></div><button className="secondary-action" onClick={() => void loadSales()} disabled={loading}>↻ {t("Refresh")}</button></div>
    {error && <div className="sales-alert sales-alert-error" role="alert">{error}<button onClick={() => setError("")} aria-label={t("Dismiss error")}>×</button></div>}
    {notice && <div className="sales-alert sales-alert-success" role="status">{notice}<button onClick={() => setNotice("")} aria-label={t("Dismiss notification")}>×</button></div>}
    <div className="summary-grid inventory-summary sales-summary">
      <article className="summary-card"><span>{t("QUOTATIONS")}</span><strong>{summary?.quotationCount ?? "—"}</strong><small>{t("{count} drafts or awaiting a response", { count: summary?.openQuotationCount ?? 0 })}</small></article>
      <article className="summary-card"><span>{t("SALES ORDERS")}</span><strong>{summary?.orderCount ?? "—"}</strong><small>{t("Active customer orders")}</small></article>
      <article className="summary-card"><span>{t("OPEN INVOICES")}</span><strong>{summary?.openInvoiceCount ?? "—"}</strong><small>{t("Awaiting full payment")}</small></article>
      <article className="summary-card"><span>{t("RECEIVABLES")}</span><strong>{summary ? formatMoney(Number(summary.receivables), currency) : "—"}</strong><small>{t("{currency} outstanding balance", { currency })}</small></article>
    </div>
    <div className="sales-flow-strip" aria-label={t("Sales workflow")}><span>1&nbsp; {t("Quote")}</span><i>→</i><span>2&nbsp; {t("Order")}</span><i>→</i><span>3&nbsp; {t("Delivery")}</span><i>→</i><span>4&nbsp; {t("Invoice")}</span><i>→</i><span>5&nbsp; {t("Payment")}</span></div>

    {canCreate && <article className="workspace-panel inventory-form-panel sales-quote-form" id="sales-quotation-form">
      <div className="panel-heading"><div><span className="page-eyebrow">{t("NEW DOCUMENT")}</span><h2>{t("Create a quotation")}</h2></div><span className="count-badge">{currency}</span></div>
      {activeCustomers.length === 0 || activeProducts.length === 0 ? <p className="loading-state">{t("Add an active customer and inventory item before creating a quotation.")}</p> : <form onSubmit={createQuote}>
        <div className="sales-form-grid">
          <label className="auth-field"><span>{t("Customer")}</span><select required value={quoteDraft.customerId} onChange={(event) => setQuoteDraft({ ...quoteDraft, customerId: event.target.value })}>{activeCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
          <label className="auth-field"><span>{t("Item")}</span><select required value={quoteDraft.productId} onChange={(event) => { const product = activeProducts.find((item) => item.id === event.target.value); setQuoteDraft({ ...quoteDraft, productId: event.target.value, unitPrice: product?.unitCost ?? "0.00" }); }}>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label>
          <label className="auth-field"><span>{t("Quantity")}</span><input required inputMode="decimal" pattern="\d+(\.\d{1,3})?" value={quoteDraft.quantity} onChange={(event) => setQuoteDraft({ ...quoteDraft, quantity: event.target.value })} /></label>
          <label className="auth-field"><span>{t("Unit price · {currency}", { currency })}</span><input required inputMode="decimal" pattern="\d+(\.\d{1,2})?" value={quoteDraft.unitPrice} onChange={(event) => setQuoteDraft({ ...quoteDraft, unitPrice: event.target.value })} /></label>
          <label className="auth-field"><span>{t("Tax rate · %")}</span><input required inputMode="decimal" pattern="\d+(\.\d{1,2})?" value={quoteDraft.taxRate} onChange={(event) => setQuoteDraft({ ...quoteDraft, taxRate: event.target.value })} /></label>
          <label className="auth-field"><span>{t("Valid until")}</span><input type="date" value={quoteDraft.validUntil} onChange={(event) => setQuoteDraft({ ...quoteDraft, validUntil: event.target.value })} /></label>
          <label className="auth-field sales-notes-field"><span>{t("Notes")}</span><input maxLength={2000} value={quoteDraft.notes} onChange={(event) => setQuoteDraft({ ...quoteDraft, notes: event.target.value })} placeholder={t("Optional customer-facing context")} /></label>
        </div>
        <div className="inventory-form-actions"><button className="auth-submit" type="submit" disabled={busy === "quote" || !quoteDraft.customerId || !quoteDraft.productId}>{busy === "quote" ? t("Saving…") : t("Create draft quotation")}<span aria-hidden="true">→</span></button></div>
      </form>}
    </article>}

    <article className="workspace-panel inventory-table-panel sales-list-panel"><div className="panel-heading"><div><span className="page-eyebrow">{t("CUSTOMER PROPOSALS")}</span><h2>{t("Quotations")}</h2></div><span className="count-badge">{quotations.length}</span></div>
      {loading ? <p className="loading-state">{t("Loading quotations…")}</p> : quotations.length ? <div className="sales-document-list">{quotations.map((quote) => <div className="sales-document" key={quote.id}>
        <div className="sales-document-main"><div><strong>{quote.number}</strong><small>{quote.customer.name} · {formatDate(quote.createdAt, { dateStyle: "medium", timeZone: "UTC" })}</small></div><span className={`status-pill sales-status-${quote.status.toLowerCase()}`}>{enumText(quote.status)}</span><b>{formatMoney(Number(quote.total), quote.currencyCode)}</b></div>
        <div className="sales-line-summary">{quote.lines.map((line) => <span key={line.id}>{line.quantity} × {line.product.name} <small>{formatMoney(Number(line.unitPrice), quote.currencyCode)} / {line.product.unit}</small></span>)}</div>
        <div className="sales-actions">{quote.order ? <span className="sales-linked-record">{t("Order {number}", { number: quote.order.number })}</span> : quote.status === "DRAFT" ? (access.can("sales.update") ? <button className="secondary-action" disabled={busy === `send-${quote.id}`} onClick={() => void act(`send-${quote.id}`, `/sales/quotations/${quote.id}/send`, undefined, t("{number} marked as sent.", { number: quote.number }))}>{t("Send quotation")}</button> : null) : quote.status === "SENT" ? (canApprove ? <button className="auth-submit sales-small-submit" disabled={busy === `convert-${quote.id}`} onClick={() => void act(`convert-${quote.id}`, `/sales/quotations/${quote.id}/convert`, undefined, t("{number} converted to an order.", { number: quote.number }))}>{t("Convert to order")} <span aria-hidden="true">→</span></button> : null) : null}</div>
      </div>)}</div> : <p className="loading-state">{t("No quotations yet. Create one above to start the sales workflow.")}</p>}
    </article>

    <article className="workspace-panel inventory-table-panel sales-list-panel"><div className="panel-heading"><div><span className="page-eyebrow">{t("FULFILLMENT")}</span><h2>{t("Sales orders")}</h2></div><div className="sales-list-tools"><label className="sales-inline-field"><span>{t("Ship from")}</span><select aria-label={t("Delivery warehouse")} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>{warehouses.filter((warehouse) => warehouse.isActive).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label><label className="sales-inline-field"><span>{t("Invoice due date")}</span><input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label></div></div>
      {loading ? <p className="loading-state">{t("Loading sales orders…")}</p> : orders.length ? <div className="sales-document-list">{orders.map((order) => {
        const remaining = order.lines.reduce((sum, line) => sum + amount(line.quantity) - amount(line.deliveredQuantity), 0);
        const billable = order.lines.reduce((sum, line) => sum + amount(line.deliveredQuantity) - amount(line.invoicedQuantity), 0);
        return <div className="sales-document" key={order.id}>
          <div className="sales-document-main"><div><strong>{order.number}</strong><small>{order.customer.name} · {t("{count} lines", { count: order.lines.length })}</small></div><span className={`status-pill sales-status-${order.status.toLowerCase()}`}>{enumText(order.status)}</span><b>{formatMoney(Number(order.total), order.currencyCode)}</b></div>
          <div className="sales-order-lines">{order.lines.map((line) => <div key={line.id}><span><strong>{line.product.sku}</strong> · {line.product.name}</span><small>{t("Ordered {ordered} · delivered {delivered} · invoiced {invoiced}", { ordered: line.quantity, delivered: line.deliveredQuantity ?? "0.000", invoiced: line.invoicedQuantity ?? "0.000" })}</small></div>)}</div>
          <div className="sales-actions">{order.deliveries.map((delivery) => <span key={delivery.id} className="sales-linked-record">{t("Delivery {number}", { number: delivery.number })}</span>)}{order.invoices.map((record) => <span key={record.id} className="sales-linked-record">{t("Invoice {number}", { number: record.number })}</span>)}{canApprove && remaining > 0 && <button className="secondary-action" disabled={busy === `deliver-${order.id}` || !warehouseId} onClick={() => deliver(order)}>{busy === `deliver-${order.id}` ? t("Posting…") : t("Deliver {quantity}", { quantity: remaining.toFixed(3) })}</button>}{canApprove && billable > 0 && <button className="auth-submit sales-small-submit" disabled={busy === `invoice-${order.id}` || !dueAt} onClick={() => invoice(order)}>{busy === `invoice-${order.id}` ? t("Issuing…") : t("Invoice {quantity}", { quantity: billable.toFixed(3) })}<span aria-hidden="true">→</span></button>}</div>
        </div>;
      })}</div> : <p className="loading-state">{t("Convert a sent quotation to create the first order.")}</p>}
    </article>

    <article className="workspace-panel inventory-table-panel sales-list-panel"><div className="panel-heading"><div><span className="page-eyebrow">{t("ACCOUNTS RECEIVABLE")}</span><h2>{t("Invoices & payments")}</h2></div><span className="count-badge">{invoices.length}</span></div>
      {loading ? <p className="loading-state">{t("Loading invoices…")}</p> : invoices.length ? <div className="sales-document-list">{invoices.map((invoiceRecord) => {
        const balance = amount(invoiceRecord.total) - amount(invoiceRecord.paidAmount);
        const draft = paymentDrafts[invoiceRecord.id] ?? { amount: balance.toFixed(2), method: "BANK_TRANSFER" };
        return <div className="sales-document" key={invoiceRecord.id}>
          <div className="sales-document-main"><div><strong>{invoiceRecord.number}</strong><small>{invoiceRecord.customer.name} · {t("order {number}", { number: invoiceRecord.order.number })} · {t("due {date}", { date: formatDate(invoiceRecord.dueAt, { dateStyle: "medium", timeZone: "UTC" }) })}</small></div><span className={`status-pill sales-status-${invoiceRecord.status.toLowerCase()}`}>{enumText(invoiceRecord.status)}</span><b>{formatMoney(Number(invoiceRecord.total), invoiceRecord.currencyCode)}</b></div>
          <div className="sales-invoice-meta"><span>{t("Paid {amount}", { amount: formatMoney(Number(invoiceRecord.paidAmount), invoiceRecord.currencyCode) })}</span><span>{t("Balance {amount}", { amount: formatMoney(balance, invoiceRecord.currencyCode) })}</span><span>{t("Journal {reference}", { reference: invoiceRecord.journalEntry.reference })}</span><span>{t("{count} balanced lines", { count: invoiceRecord.journalEntry.lines.length })}</span></div>
          {invoiceRecord.payments.map((payment) => <div className="sales-payment-row" key={payment.id}><span>{payment.number} · {enumText(payment.method)}<small> {t("Journal {reference} · {count} balanced lines", { reference: payment.journalEntry.reference, count: payment.journalEntry.lines.length })}</small></span><small>{formatDate(payment.receivedAt, { dateStyle: "medium", timeZone: "UTC" })}</small><b>{formatMoney(Number(payment.amount), invoiceRecord.currencyCode)}</b></div>)}
          {canApprove && balance > 0 && invoiceRecord.status !== "VOID" && <div className="sales-actions sales-payment-form"><label className="sales-inline-field"><span>{t("Payment amount")}</span><input inputMode="decimal" value={draft.amount} onChange={(event) => setPaymentDrafts({ ...paymentDrafts, [invoiceRecord.id]: { ...draft, amount: event.target.value } })} /></label><label className="sales-inline-field"><span>{t("Method")}</span><select value={draft.method} onChange={(event) => setPaymentDrafts({ ...paymentDrafts, [invoiceRecord.id]: { ...draft, method: event.target.value } })}><option value="BANK_TRANSFER">{t("Bank transfer")}</option><option value="CASH">{t("Cash")}</option><option value="CARD">{t("Card")}</option><option value="CHEQUE">{t("Cheque")}</option><option value="OTHER">{t("Other")}</option></select></label><button className="auth-submit sales-small-submit" disabled={busy === `pay-${invoiceRecord.id}` || !draft.amount} onClick={() => pay(invoiceRecord)}>{busy === `pay-${invoiceRecord.id}` ? t("Posting…") : t("Record payment")}<span aria-hidden="true">→</span></button></div>}
        </div>;
      })}</div> : <p className="loading-state">{t("Issued invoices and their balanced accounting entries will appear here.")}</p>}
    </article>
  </section>;
}
