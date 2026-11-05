"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest, formatApiDate } from "../../../lib/api";
import { useNexusSession } from "../session-context";

type PageResult<T> = { data: T[]; total: number };
type Customer = { id: string; code: string; name: string; type: string; isActive: boolean };
type Product = { id: string; sku: string; name: string; unit: string; unitCost: string; isActive: boolean };
type Warehouse = { id: string; code: string; name: string; isActive: boolean };
type SalesLine = { id: string; productId: string; description: string; quantity: string; deliveredQuantity?: string; invoicedQuantity?: string; unitPrice: string; taxRate: string; subtotal: string; taxAmount: string; total: string; product: { sku: string; name: string; unit: string } };
type Quote = { id: string; number: string; status: string; total: string; currencyCode: string; validUntil: string | null; createdAt: string; customer: { code: string; name: string }; lines: SalesLine[]; order?: { id: string; number: string; status: string } | null };
type Order = { id: string; number: string; status: string; total: string; currencyCode: string; customer: { code: string; name: string }; lines: SalesLine[]; deliveries: { id: string; number: string }[]; invoices: { id: string; number: string; status: string; total: string; paidAmount: string }[] };
type Invoice = { id: string; number: string; status: string; total: string; paidAmount: string; currencyCode: string; dueAt: string; customer: { code: string; name: string }; order: { number: string }; lines: SalesLine[]; payments: { id: string; number: string; amount: string; method: string; receivedAt: string; journalEntry: { reference: string; lines: { debit: string; credit: string; account: { code: string; name: string; type: string } }[] } }[]; journalEntry: { reference: string; lines: { debit: string; credit: string; account: { code: string; name: string } }[] } };
type Summary = { quotationCount: number; openQuotationCount: number; orderCount: number; openInvoiceCount: number; receivables: string };

const emptyQuote = { customerId: "", productId: "", quantity: "2.000", unitPrice: "", taxRate: "20.00", validUntil: "2026-12-31", notes: "" };
const money = (value: string | number, currency: string) => {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value)); }
  catch { return `${Number(value).toFixed(2)} ${currency}`; }
};
const amount = (value: string | undefined) => Number(value ?? 0);

export function SalesView() {
  const session = useNexusSession();
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
  const [dueAt, setDueAt] = useState("2026-12-05");
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
      setError(reason instanceof Error ? reason.message : "Sales data could not be loaded.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadSales(); }, []);

  async function createQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("quote"); setError(""); setNotice("");
    try {
      const product = activeProducts.find((item) => item.id === quoteDraft.productId);
      await apiRequest("/sales/quotations", { method: "POST", body: JSON.stringify({ customerId: quoteDraft.customerId, validUntil: quoteDraft.validUntil || undefined, notes: quoteDraft.notes || undefined, lines: [{ productId: quoteDraft.productId, quantity: quoteDraft.quantity, unitPrice: quoteDraft.unitPrice, taxRate: quoteDraft.taxRate, description: product?.name }] }) });
      setNotice("Quotation created as a draft. Send it to unlock order conversion."); await loadSales();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Quotation could not be created."); }
    finally { setBusy(""); }
  }

  async function act(key: string, path: string, body?: unknown, success = "Sales record updated.") {
    setBusy(key); setError(""); setNotice("");
    try { await apiRequest(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); setNotice(success); await loadSales(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The sales action failed."); }
    finally { setBusy(""); }
  }

  function deliver(order: Order) {
    const lines = order.lines.map((line) => ({ orderLineId: line.id, quantity: (amount(line.quantity) - amount(line.deliveredQuantity)).toFixed(3) })).filter((line) => amount(line.quantity) > 0);
    if (!lines.length) { setError("This order has no remaining quantity to deliver."); return; }
    void act(`deliver-${order.id}`, `/sales/orders/${order.id}/deliver`, { warehouseId, lines }, `Delivery posted for ${order.number}. Inventory was reduced.`);
  }

  function invoice(order: Order) {
    const lines = order.lines.map((line) => ({ orderLineId: line.id, quantity: (amount(line.deliveredQuantity) - amount(line.invoicedQuantity)).toFixed(3) })).filter((line) => amount(line.quantity) > 0);
    if (!lines.length) { setError("This order has no delivered quantity available to invoice."); return; }
    void act(`invoice-${order.id}`, `/sales/orders/${order.id}/invoices`, { dueAt, lines }, `Invoice issued for ${order.number} with a balanced journal entry.`);
  }

  function pay(invoiceRecord: Invoice) {
    const draft = paymentDrafts[invoiceRecord.id] ?? { amount: "", method: "BANK_TRANSFER" };
    void act(`pay-${invoiceRecord.id}`, `/sales/invoices/${invoiceRecord.id}/payments`, { amount: draft.amount, method: draft.method }, `Payment recorded for ${invoiceRecord.number}.`);
  }

  return <section className="sales-page inventory-page">
    <div className="page-heading"><div><span className="page-eyebrow">COMMERCIAL OPERATIONS</span><h1>Sales &amp; receivables</h1><p>Manage quotations through delivery, invoicing, and customer payments.</p></div><button className="secondary-action" onClick={() => void loadSales()} disabled={loading}>↻ Refresh</button></div>
    {error && <div className="sales-alert sales-alert-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
    {notice && <div className="sales-alert sales-alert-success" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notification">×</button></div>}
    <div className="summary-grid inventory-summary sales-summary">
      <article className="summary-card"><span>QUOTATIONS</span><strong>{summary?.quotationCount ?? "—"}</strong><small>{summary?.openQuotationCount ?? 0} drafts or awaiting a response</small></article>
      <article className="summary-card"><span>SALES ORDERS</span><strong>{summary?.orderCount ?? "—"}</strong><small>Active customer orders</small></article>
      <article className="summary-card"><span>OPEN INVOICES</span><strong>{summary?.openInvoiceCount ?? "—"}</strong><small>Awaiting full payment</small></article>
      <article className="summary-card"><span>RECEIVABLES</span><strong>{summary ? money(summary.receivables, currency) : "—"}</strong><small>{currency} outstanding balance</small></article>
    </div>
    <div className="sales-flow-strip" aria-label="Sales workflow"><span>1&nbsp; Quote</span><i>→</i><span>2&nbsp; Order</span><i>→</i><span>3&nbsp; Delivery</span><i>→</i><span>4&nbsp; Invoice</span><i>→</i><span>5&nbsp; Payment</span></div>

    <article className="workspace-panel inventory-form-panel sales-quote-form" id="sales-quotation-form">
      <div className="panel-heading"><div><span className="page-eyebrow">NEW DOCUMENT</span><h2>Create a quotation</h2></div><span className="count-badge">{currency}</span></div>
      {activeCustomers.length === 0 || activeProducts.length === 0 ? <p className="loading-state">Add an active customer and inventory item before creating a quotation.</p> : <form onSubmit={createQuote}>
        <div className="sales-form-grid">
          <label className="auth-field"><span>Customer</span><select required value={quoteDraft.customerId} onChange={(event) => setQuoteDraft({ ...quoteDraft, customerId: event.target.value })}>{activeCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
          <label className="auth-field"><span>Item</span><select required value={quoteDraft.productId} onChange={(event) => { const product = activeProducts.find((item) => item.id === event.target.value); setQuoteDraft({ ...quoteDraft, productId: event.target.value, unitPrice: product?.unitCost ?? "0.00" }); }}>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label>
          <label className="auth-field"><span>Quantity</span><input required inputMode="decimal" pattern="\d+(\.\d{1,3})?" value={quoteDraft.quantity} onChange={(event) => setQuoteDraft({ ...quoteDraft, quantity: event.target.value })} /></label>
          <label className="auth-field"><span>Unit price · {currency}</span><input required inputMode="decimal" pattern="\d+(\.\d{1,2})?" value={quoteDraft.unitPrice} onChange={(event) => setQuoteDraft({ ...quoteDraft, unitPrice: event.target.value })} /></label>
          <label className="auth-field"><span>Tax rate · %</span><input required inputMode="decimal" pattern="\d+(\.\d{1,2})?" value={quoteDraft.taxRate} onChange={(event) => setQuoteDraft({ ...quoteDraft, taxRate: event.target.value })} /></label>
          <label className="auth-field"><span>Valid until</span><input type="date" value={quoteDraft.validUntil} onChange={(event) => setQuoteDraft({ ...quoteDraft, validUntil: event.target.value })} /></label>
          <label className="auth-field sales-notes-field"><span>Notes</span><input maxLength={2000} value={quoteDraft.notes} onChange={(event) => setQuoteDraft({ ...quoteDraft, notes: event.target.value })} placeholder="Optional customer-facing context" /></label>
        </div>
        <div className="inventory-form-actions"><button className="auth-submit" type="submit" disabled={busy === "quote" || !quoteDraft.customerId || !quoteDraft.productId}>{busy === "quote" ? "Saving…" : "Create draft quotation"}<span aria-hidden="true">→</span></button></div>
      </form>}
    </article>

    <article className="workspace-panel inventory-table-panel sales-list-panel"><div className="panel-heading"><div><span className="page-eyebrow">CUSTOMER PROPOSALS</span><h2>Quotations</h2></div><span className="count-badge">{quotations.length}</span></div>
      {loading ? <p className="loading-state">Loading quotations…</p> : quotations.length ? <div className="sales-document-list">{quotations.map((quote) => <div className="sales-document" key={quote.id}>
        <div className="sales-document-main"><div><strong>{quote.number}</strong><small>{quote.customer.name} · {formatApiDate(quote.createdAt)}</small></div><span className={`status-pill sales-status-${quote.status.toLowerCase()}`}>{quote.status.replaceAll("_", " ")}</span><b>{money(quote.total, quote.currencyCode)}</b></div>
        <div className="sales-line-summary">{quote.lines.map((line) => <span key={line.id}>{line.quantity} × {line.product.name} <small>{money(line.unitPrice, quote.currencyCode)} / {line.product.unit}</small></span>)}</div>
        <div className="sales-actions">{quote.order ? <span className="sales-linked-record">Order {quote.order.number}</span> : quote.status === "DRAFT" ? <button className="secondary-action" disabled={busy === `send-${quote.id}`} onClick={() => void act(`send-${quote.id}`, `/sales/quotations/${quote.id}/send`, undefined, `${quote.number} marked as sent.`)}>Send quotation</button> : quote.status === "SENT" ? <button className="auth-submit sales-small-submit" disabled={busy === `convert-${quote.id}`} onClick={() => void act(`convert-${quote.id}`, `/sales/quotations/${quote.id}/convert`, undefined, `${quote.number} converted to an order.`)}>Convert to order <span aria-hidden="true">→</span></button> : null}</div>
      </div>)}</div> : <p className="loading-state">No quotations yet. Create one above to start the sales workflow.</p>}
    </article>

    <article className="workspace-panel inventory-table-panel sales-list-panel"><div className="panel-heading"><div><span className="page-eyebrow">FULFILLMENT</span><h2>Sales orders</h2></div><div className="sales-list-tools"><label className="sales-inline-field"><span>Ship from</span><select aria-label="Delivery warehouse" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>{warehouses.filter((warehouse) => warehouse.isActive).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label><label className="sales-inline-field"><span>Invoice due date</span><input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label></div></div>
      {loading ? <p className="loading-state">Loading sales orders…</p> : orders.length ? <div className="sales-document-list">{orders.map((order) => {
        const remaining = order.lines.reduce((sum, line) => sum + amount(line.quantity) - amount(line.deliveredQuantity), 0);
        const billable = order.lines.reduce((sum, line) => sum + amount(line.deliveredQuantity) - amount(line.invoicedQuantity), 0);
        return <div className="sales-document" key={order.id}>
          <div className="sales-document-main"><div><strong>{order.number}</strong><small>{order.customer.name} · {order.lines.length} line{order.lines.length === 1 ? "" : "s"}</small></div><span className={`status-pill sales-status-${order.status.toLowerCase()}`}>{order.status.replaceAll("_", " ")}</span><b>{money(order.total, order.currencyCode)}</b></div>
          <div className="sales-order-lines">{order.lines.map((line) => <div key={line.id}><span><strong>{line.product.sku}</strong> · {line.product.name}</span><small>Ordered {line.quantity} · delivered {line.deliveredQuantity ?? "0.000"} · invoiced {line.invoicedQuantity ?? "0.000"}</small></div>)}</div>
          <div className="sales-actions">{order.deliveries.map((delivery) => <span key={delivery.id} className="sales-linked-record">Delivery {delivery.number}</span>)}{order.invoices.map((record) => <span key={record.id} className="sales-linked-record">Invoice {record.number}</span>)}{remaining > 0 && <button className="secondary-action" disabled={busy === `deliver-${order.id}` || !warehouseId} onClick={() => deliver(order)}>{busy === `deliver-${order.id}` ? "Posting…" : `Deliver ${remaining.toFixed(3)}`}</button>}{billable > 0 && <button className="auth-submit sales-small-submit" disabled={busy === `invoice-${order.id}`} onClick={() => invoice(order)}>{busy === `invoice-${order.id}` ? "Issuing…" : `Invoice ${billable.toFixed(3)}`}<span aria-hidden="true">→</span></button>}</div>
        </div>;
      })}</div> : <p className="loading-state">Convert a sent quotation to create the first order.</p>}
    </article>

    <article className="workspace-panel inventory-table-panel sales-list-panel"><div className="panel-heading"><div><span className="page-eyebrow">ACCOUNTS RECEIVABLE</span><h2>Invoices &amp; payments</h2></div><span className="count-badge">{invoices.length}</span></div>
      {loading ? <p className="loading-state">Loading invoices…</p> : invoices.length ? <div className="sales-document-list">{invoices.map((invoiceRecord) => {
        const balance = amount(invoiceRecord.total) - amount(invoiceRecord.paidAmount);
        const draft = paymentDrafts[invoiceRecord.id] ?? { amount: balance.toFixed(2), method: "BANK_TRANSFER" };
        return <div className="sales-document" key={invoiceRecord.id}>
          <div className="sales-document-main"><div><strong>{invoiceRecord.number}</strong><small>{invoiceRecord.customer.name} · order {invoiceRecord.order.number} · due {formatApiDate(invoiceRecord.dueAt)}</small></div><span className={`status-pill sales-status-${invoiceRecord.status.toLowerCase()}`}>{invoiceRecord.status.replaceAll("_", " ")}</span><b>{money(invoiceRecord.total, invoiceRecord.currencyCode)}</b></div>
          <div className="sales-invoice-meta"><span>Paid {money(invoiceRecord.paidAmount, invoiceRecord.currencyCode)}</span><span>Balance {money(balance, invoiceRecord.currencyCode)}</span><span>Journal <strong>{invoiceRecord.journalEntry.reference}</strong></span><span>{invoiceRecord.journalEntry.lines.length} balanced lines</span></div>
          {invoiceRecord.payments.map((payment) => <div className="sales-payment-row" key={payment.id}><span>{payment.number} · {payment.method.replaceAll("_", " ")}<small> Journal {payment.journalEntry.reference} · {payment.journalEntry.lines.length} balanced lines</small></span><small>{formatApiDate(payment.receivedAt)}</small><b>{money(payment.amount, invoiceRecord.currencyCode)}</b></div>)}
          {balance > 0 && invoiceRecord.status !== "VOID" && <div className="sales-actions sales-payment-form"><label className="sales-inline-field"><span>Payment amount</span><input inputMode="decimal" value={draft.amount} onChange={(event) => setPaymentDrafts({ ...paymentDrafts, [invoiceRecord.id]: { ...draft, amount: event.target.value } })} /></label><label className="sales-inline-field"><span>Method</span><select value={draft.method} onChange={(event) => setPaymentDrafts({ ...paymentDrafts, [invoiceRecord.id]: { ...draft, method: event.target.value } })}><option value="BANK_TRANSFER">Bank transfer</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option></select></label><button className="auth-submit sales-small-submit" disabled={busy === `pay-${invoiceRecord.id}` || !draft.amount} onClick={() => pay(invoiceRecord)}>{busy === `pay-${invoiceRecord.id}` ? "Posting…" : "Record payment"}<span aria-hidden="true">→</span></button></div>}
        </div>;
      })}</div> : <p className="loading-state">Issued invoices and their balanced accounting entries will appear here.</p>}
    </article>
  </section>;
}
