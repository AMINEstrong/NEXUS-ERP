"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";
import { useI18n } from "../../../lib/i18n";
import { useNexusSession, usePermissions } from "../session-context";

type StockBalance = { quantity: string; warehouse: { id: string; code: string; name: string } };
type InventoryItem = { id: string; sku: string; name: string; description: string | null; unit: string; unitCost: string; reorderPoint: string | null; isActive: boolean; stockBalances: StockBalance[] };
type Warehouse = { id: string; code: string; name: string; location: string | null; isActive: boolean; productCount: number };
type Movement = { id: string; type: string; quantity: string; reference: string | null; createdAt: string; product: { sku: string; name: string; unit: string }; warehouse: { code: string; name: string }; actor: { name: string } };
type InventorySummary = { itemCount: number; warehouseCount: number; movementCount: number; totalUnits: string; lowStockCount: number };
type PageResult<T> = { data: T[]; page: number; pageSize: number; total: number; pageCount: number };

const emptyItem = { sku: "", name: "", description: "", unit: "each", unitCost: "0.00", reorderPoint: "" };
const emptyWarehouse = { code: "", name: "", location: "" };

export function InventoryView() {
  const session = useNexusSession();
  const access = usePermissions();
  const { t, enum: enumText, currency: formatMoney, date: formatDate } = useI18n();
  const canCreate = access.can("inventory.create");
  const canUpdate = access.can("inventory.update");
  const canDelete = access.can("inventory.delete");
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemOptions, setItemOptions] = useState<InventoryItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseOptions, setWarehouseOptions] = useState<Warehouse[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [warehouseQuery, setWarehouseQuery] = useState("");
  const [warehousePage, setWarehousePage] = useState(1);
  const [warehousePageCount, setWarehousePageCount] = useState(1);
  const [movementQuery, setMovementQuery] = useState("");
  const [movementPage, setMovementPage] = useState(1);
  const [movementPageCount, setMovementPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [itemDraft, setItemDraft] = useState(emptyItem);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [warehouseDraft, setWarehouseDraft] = useState(emptyWarehouse);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [receipt, setReceipt] = useState({ warehouseId: "", productId: "", quantity: "", unitCost: "", reference: "" });
  const [transfer, setTransfer] = useState({ fromWarehouseId: "", toWarehouseId: "", productId: "", quantity: "", reference: "" });
  const currency = session.memberships.find((company) => company.id === session.activeCompanyId)?.currencyCode ?? "MAD";
  const activeItems = itemOptions.filter((item) => item.isActive);
  const activeWarehouses = warehouseOptions.filter((warehouse) => warehouse.isActive);

  async function loadInventory() {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: "10", ...(query.trim() ? { q: query.trim() } : {}) });
    const warehouseParams = new URLSearchParams({ page: String(warehousePage), pageSize: "8", ...(warehouseQuery.trim() ? { q: warehouseQuery.trim() } : {}) });
    const movementParams = new URLSearchParams({ page: String(movementPage), pageSize: "8", ...(movementQuery.trim() ? { q: movementQuery.trim() } : {}) });
    try {
      const [summaryData, itemData, itemOptionsData, warehouseData, warehouseOptionsData, movementData] = await Promise.all([
        apiRequest<InventorySummary>("/inventory/summary"),
        apiRequest<PageResult<InventoryItem>>(`/inventory/items?${params.toString()}`),
        apiRequest<PageResult<InventoryItem>>("/inventory/items?page=1&pageSize=100"),
        apiRequest<PageResult<Warehouse>>(`/inventory/warehouses?${warehouseParams.toString()}`),
        apiRequest<PageResult<Warehouse>>("/inventory/warehouses?page=1&pageSize=100"),
        apiRequest<PageResult<Movement>>(`/inventory/movements?${movementParams.toString()}`),
      ]);
      setSummary(summaryData);
      setItems(itemData.data);
      setPageCount(Math.max(1, itemData.pageCount));
      setItemOptions(itemOptionsData.data);
      setWarehouses(warehouseData.data);
      setWarehousePageCount(Math.max(1, warehouseData.pageCount));
      setWarehouseOptions(warehouseOptionsData.data);
      setMovements(movementData.data);
      setMovementPageCount(Math.max(1, movementData.pageCount));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Inventory data could not be loaded."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadInventory(); }, [query, page, warehouseQuery, warehousePage, movementQuery, movementPage]);
  useEffect(() => {
    if (activeWarehouses.length) {
      setReceipt((current) => ({ ...current, warehouseId: current.warehouseId || activeWarehouses[0]!.id }));
      setTransfer((current) => ({ ...current, fromWarehouseId: current.fromWarehouseId || activeWarehouses[0]!.id, toWarehouseId: current.toWarehouseId || activeWarehouses[1]?.id || "" }));
    }
  }, [warehouses]);
  useEffect(() => {
    if (activeItems.length) {
      setReceipt((current) => ({ ...current, productId: current.productId || activeItems[0]!.id }));
      setTransfer((current) => ({ ...current, productId: current.productId || activeItems[0]!.id }));
    }
  }, [items]);

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    const body = { ...itemDraft, sku: itemDraft.sku.trim().toUpperCase(), reorderPoint: itemDraft.reorderPoint || "0" };
    try {
      if (editingItem) {
        await apiRequest(`/inventory/items/${editingItem.id}`, { method: "PATCH", body: JSON.stringify({ name: body.name, description: body.description, unit: body.unit, unitCost: body.unitCost, reorderPoint: body.reorderPoint }) });
        setNotice(t("{name} updated.", { name: body.name }));
      } else {
        await apiRequest("/inventory/items", { method: "POST", body: JSON.stringify(body) });
        setNotice(t("{sku} added to the item catalog.", { sku: body.sku }));
      }
      setItemDraft(emptyItem); setEditingItem(null); await loadInventory();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("The item could not be saved."));
    } finally { setBusy(false); }
  }

  function editItem(item: InventoryItem) {
    setEditingItem(item);
    setItemDraft({ sku: item.sku, name: item.name, description: item.description ?? "", unit: item.unit, unitCost: item.unitCost, reorderPoint: item.reorderPoint ?? "0" });
    document.getElementById("inventory-item-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function toggleItem(item: InventoryItem) {
    setBusy(true); setError(""); setNotice("");
    try {
      if (item.isActive) await apiRequest(`/inventory/items/${item.id}`, { method: "DELETE" });
      else await apiRequest(`/inventory/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ isActive: true }) });
      setNotice(item.isActive ? t("{sku} archived.", { sku: item.sku }) : t("{sku} reactivated.", { sku: item.sku }));
      await loadInventory();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("The item status could not be changed.")); }
    finally { setBusy(false); }
  }

  async function saveWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (editingWarehouse) {
        await apiRequest(`/inventory/warehouses/${editingWarehouse.id}`, { method: "PATCH", body: JSON.stringify({ name: warehouseDraft.name, location: warehouseDraft.location }) });
        setNotice(t("{name} updated.", { name: warehouseDraft.name }));
      } else {
        await apiRequest("/inventory/warehouses", { method: "POST", body: JSON.stringify(warehouseDraft) });
        setNotice(t("{code} warehouse created.", { code: warehouseDraft.code.toUpperCase() }));
      }
      setWarehouseDraft(emptyWarehouse); setEditingWarehouse(null); await loadInventory();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("The warehouse could not be saved.")); }
    finally { setBusy(false); }
  }

  async function toggleWarehouse(warehouse: Warehouse) {
    setBusy(true); setError(""); setNotice("");
    try {
      if (warehouse.isActive) await apiRequest(`/inventory/warehouses/${warehouse.id}`, { method: "DELETE" });
      else await apiRequest(`/inventory/warehouses/${warehouse.id}`, { method: "PATCH", body: JSON.stringify({ isActive: true }) });
      setNotice(warehouse.isActive ? t("{code} warehouse archived.", { code: warehouse.code }) : t("{code} warehouse reactivated.", { code: warehouse.code }));
      await loadInventory();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("The warehouse status could not be changed.")); }
    finally { setBusy(false); }
  }

  async function receiveGoods(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest("/inventory/receipts", { method: "POST", body: JSON.stringify({ warehouseId: receipt.warehouseId, reference: receipt.reference, lines: [{ productId: receipt.productId, quantity: receipt.quantity, ...(receipt.unitCost ? { unitCost: receipt.unitCost } : {}) }] }) });
      setReceipt((current) => ({ ...current, quantity: "", unitCost: "", reference: "" }));
      setNotice(t("Goods receipt posted. Stock and movement history updated atomically.")); await loadInventory();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("The goods receipt could not be posted.")); }
    finally { setBusy(false); }
  }

  async function transferStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest("/inventory/transfers", { method: "POST", body: JSON.stringify({ fromWarehouseId: transfer.fromWarehouseId, toWarehouseId: transfer.toWarehouseId, reference: transfer.reference, lines: [{ productId: transfer.productId, quantity: transfer.quantity }] }) });
      setTransfer((current) => ({ ...current, quantity: "", reference: "" }));
      setNotice(t("Stock transfer posted. Both warehouse balances and ledger entries were updated together.")); await loadInventory();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("The stock transfer could not be posted.")); }
    finally { setBusy(false); }
  }

  if (!access.can("inventory.read")) {
    return <section className="inventory-page"><div className="page-heading"><div><span className="page-eyebrow">{t("OPERATIONS · INVENTORY")}</span><h1>{t("Inventory & warehouses")}</h1></div></div><div className="empty-state"><h3>{t("Inventory access is restricted")}</h3><p>{t("Your role does not include the inventory.read permission. Ask a company administrator to grant it.")}</p></div></section>;
  }

  return <section className="inventory-page">
    <div className="page-heading"><div><span className="page-eyebrow">{t("OPERATIONS · INVENTORY")}</span><h1>{t("Inventory & warehouses")}</h1><p>{t("Track item balances by warehouse and keep each stock change in a tenant-scoped ledger.")}</p></div><button className="secondary-action" onClick={() => void loadInventory()} disabled={loading}>{t("Refresh")} <span aria-hidden="true">↻</span></button></div>
    {error && <p className="auth-alert" role="alert">{error}</p>}{notice && <p className="success-alert" role="status">{notice}</p>}
    <div className="summary-grid inventory-summary">
      <article className="summary-card"><span>{t("ACTIVE ITEMS")}</span><strong>{summary?.itemCount ?? "—"}</strong><small>{t("Catalog items in this company")}</small></article>
      <article className="summary-card"><span>{t("WAREHOUSES")}</span><strong>{summary?.warehouseCount ?? "—"}</strong><small>{t("Active stock locations")}</small></article>
      <article className="summary-card"><span>{t("UNITS ON HAND")}</span><strong>{summary?.totalUnits ?? "—"}</strong><small>{t("Across all active and archived locations")}</small></article>
      <article className="summary-card"><span>{t("BELOW REORDER POINT")}</span><strong>{summary?.lowStockCount ?? "—"}</strong><small>{t("Items below company-wide threshold")}</small></article>
    </div>
    <div className="workspace-grid inventory-forms-grid">
      {(canCreate || editingItem) && <article className="workspace-panel inventory-form-panel" id="inventory-item-form"><div className="panel-heading"><div><span className="page-eyebrow">{t("ITEM CATALOG")}</span><h2>{editingItem ? t("Edit {sku}", { sku: editingItem.sku }) : t("Add an item")}</h2></div></div>
        <form className="company-form" onSubmit={saveItem}>
          <label className="auth-field"><span>{t("SKU")}</span><input value={itemDraft.sku} onChange={(event) => setItemDraft((current) => ({ ...current, sku: event.target.value.toUpperCase() }))} required minLength={2} maxLength={60} pattern="[A-Za-z0-9][A-Za-z0-9._/-]{1,59}" disabled={Boolean(editingItem)} /></label>
          <label className="auth-field"><span>{t("Item name")}</span><input value={itemDraft.name} onChange={(event) => setItemDraft((current) => ({ ...current, name: event.target.value }))} required minLength={2} maxLength={180} /></label>
          <div className="form-row"><label className="auth-field"><span>{t("Unit")}</span><input value={itemDraft.unit} onChange={(event) => setItemDraft((current) => ({ ...current, unit: event.target.value }))} required maxLength={16} /></label><label className="auth-field"><span>{t("Unit cost ({currency})", { currency })}</span><input type="number" min="0" step="0.01" value={itemDraft.unitCost} onChange={(event) => setItemDraft((current) => ({ ...current, unitCost: event.target.value }))} required /></label></div>
          <div className="form-row"><label className="auth-field"><span>{t("Reorder point")}</span><input type="number" min="0" step="0.001" value={itemDraft.reorderPoint} onChange={(event) => setItemDraft((current) => ({ ...current, reorderPoint: event.target.value }))} placeholder={t("Optional")} /></label><label className="auth-field"><span>{t("Description")}</span><input value={itemDraft.description} onChange={(event) => setItemDraft((current) => ({ ...current, description: event.target.value }))} maxLength={1000} placeholder={t("Optional")} /></label></div>
          <div className="inventory-form-actions"><button className="auth-submit" type="submit" disabled={busy}>{busy ? t("Saving…") : editingItem ? t("Save item changes") : t("Create inventory item")}<span aria-hidden="true">→</span></button>{editingItem && <button type="button" className="secondary-action" onClick={() => { setEditingItem(null); setItemDraft(emptyItem); }}>{t("Cancel")}</button>}</div>
        </form>
      </article>}
      {(canCreate || editingWarehouse) && <article className="workspace-panel inventory-form-panel"><div className="panel-heading"><div><span className="page-eyebrow">{t("STOCK LOCATION")}</span><h2>{editingWarehouse ? t("Edit {code}", { code: editingWarehouse.code }) : t("Add a warehouse")}</h2></div></div>
        <form className="company-form" onSubmit={saveWarehouse}>
          <label className="auth-field"><span>{t("Warehouse code")}</span><input value={warehouseDraft.code} onChange={(event) => setWarehouseDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))} required minLength={2} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9._-]{1,23}" disabled={Boolean(editingWarehouse)} /></label>
          <label className="auth-field"><span>{t("Warehouse name")}</span><input value={warehouseDraft.name} onChange={(event) => setWarehouseDraft((current) => ({ ...current, name: event.target.value }))} required minLength={2} maxLength={160} /></label>
          <label className="auth-field"><span>{t("Location")}</span><input value={warehouseDraft.location} onChange={(event) => setWarehouseDraft((current) => ({ ...current, location: event.target.value }))} maxLength={180} placeholder={t("City, site or address")} /></label>
          <div className="inventory-form-actions"><button className="auth-submit" type="submit" disabled={busy}>{busy ? t("Saving…") : editingWarehouse ? t("Save warehouse") : t("Create warehouse")}<span aria-hidden="true">→</span></button>{editingWarehouse && <button type="button" className="secondary-action" onClick={() => { setEditingWarehouse(null); setWarehouseDraft(emptyWarehouse); }}>{t("Cancel")}</button>}</div>
        </form>
      </article>}
    </div>
    <div className="workspace-grid inventory-forms-grid inventory-workflows">
      {canCreate && <article className="workspace-panel inventory-form-panel"><span className="page-eyebrow">{t("GOODS RECEIPT")}</span><h2>{t("Receive stock")}</h2><p>{t("Post an incoming quantity to a selected warehouse. The balance and immutable movement record commit together.")}</p>
        <form className="company-form" onSubmit={receiveGoods}>
          <label className="auth-field"><span>{t("Warehouse")}</span><select value={receipt.warehouseId} onChange={(event) => setReceipt((current) => ({ ...current, warehouseId: event.target.value }))} required><option value="">{t("Choose a warehouse")}</option>{activeWarehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
          <label className="auth-field"><span>{t("Item")}</span><select value={receipt.productId} onChange={(event) => setReceipt((current) => ({ ...current, productId: event.target.value }))} required><option value="">{t("Choose an item")}</option>{activeItems.map((item) => <option value={item.id} key={item.id}>{item.sku} · {item.name}</option>)}</select></label>
          <div className="form-row"><label className="auth-field"><span>{t("Quantity")}</span><input type="number" min="0.001" step="0.001" value={receipt.quantity} onChange={(event) => setReceipt((current) => ({ ...current, quantity: event.target.value }))} required /></label><label className="auth-field"><span>{t("Unit cost ({currency})", { currency })}</span><input type="number" min="0" step="0.01" value={receipt.unitCost} onChange={(event) => setReceipt((current) => ({ ...current, unitCost: event.target.value }))} placeholder={t("Use item cost")} /></label></div>
          <label className="auth-field"><span>{t("Reference")}</span><input value={receipt.reference} onChange={(event) => setReceipt((current) => ({ ...current, reference: event.target.value }))} maxLength={100} placeholder={t("Supplier delivery or GRN")} /></label>
          <button className="auth-submit" type="submit" disabled={busy || !activeItems.length || !activeWarehouses.length}>{busy ? t("Posting…") : t("Post goods receipt")}<span aria-hidden="true">→</span></button>
        </form>
      </article>}
      {canUpdate && <article className="workspace-panel inventory-form-panel"><span className="page-eyebrow">{t("WAREHOUSE TRANSFER")}</span><h2>{t("Move stock")}</h2><p>{t("Transfers create paired ledger entries. The source balance is checked atomically to prevent negative stock.")}</p>
        <form className="company-form" onSubmit={transferStock}>
          <label className="auth-field"><span>{t("Item")}</span><select value={transfer.productId} onChange={(event) => setTransfer((current) => ({ ...current, productId: event.target.value }))} required><option value="">{t("Choose an item")}</option>{activeItems.map((item) => <option value={item.id} key={item.id}>{item.sku} · {item.name}</option>)}</select></label>
          <div className="form-row"><label className="auth-field"><span>{t("From warehouse")}</span><select value={transfer.fromWarehouseId} onChange={(event) => setTransfer((current) => ({ ...current, fromWarehouseId: event.target.value }))} required><option value="">{t("Choose source")}</option>{activeWarehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label><label className="auth-field"><span>{t("To warehouse")}</span><select value={transfer.toWarehouseId} onChange={(event) => setTransfer((current) => ({ ...current, toWarehouseId: event.target.value }))} required><option value="">{t("Choose destination")}</option>{activeWarehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id} disabled={warehouse.id === transfer.fromWarehouseId}>{warehouse.code} · {warehouse.name}</option>)}</select></label></div>
          <div className="form-row"><label className="auth-field"><span>{t("Quantity")}</span><input type="number" min="0.001" step="0.001" value={transfer.quantity} onChange={(event) => setTransfer((current) => ({ ...current, quantity: event.target.value }))} required /></label><label className="auth-field"><span>{t("Reference")}</span><input value={transfer.reference} onChange={(event) => setTransfer((current) => ({ ...current, reference: event.target.value }))} maxLength={100} placeholder={t("Transfer reference")} /></label></div>
          <button className="auth-submit" type="submit" disabled={busy || activeWarehouses.length < 2 || !activeItems.length}>{busy ? t("Posting…") : t("Post stock transfer")}<span aria-hidden="true">→</span></button>
        </form>
      </article>}
    </div>
    <article className="workspace-panel inventory-table-panel"><div className="panel-heading"><div><span className="page-eyebrow">{t("TENANT ITEM CATALOG")}</span><h2>{t("Items & on-hand quantity")}</h2></div><span className="count-badge">{summary?.itemCount ?? 0}</span></div>
      <label className="admin-filter"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t("Search SKU or item name")} aria-label={t("Search inventory items")} /></label>
      {loading ? <p className="loading-state">{t("Loading inventory…")}</p> : items.length ? <div className="membership-table-wrap"><table className="membership-table inventory-table"><thead><tr><th>{t("ITEM")}</th><th>{t("ON HAND")}</th><th>{t("REORDER")}</th><th>{t("UNIT COST")}</th><th>{t("STATUS")}</th><th>{t("ACTIONS")}</th></tr></thead><tbody>{items.map((item) => {
        const quantityByWarehouse = item.stockBalances.map((balance) => <span key={balance.warehouse.id} className="stock-location"><strong>{balance.quantity}</strong><small>{balance.warehouse.code}</small></span>);
        const total = item.stockBalances.reduce((sum, balance) => sum + Number(balance.quantity), 0);
        return <tr key={item.id}><td><strong>{item.name}</strong><small>{item.sku} · {item.unit}{item.description ? ` · ${item.description}` : ""}</small></td><td><div className="stock-locations">{quantityByWarehouse.length ? quantityByWarehouse : <span className="stock-location"><strong>0</strong><small>{t("No stock")}</small></span>}<b>{t("Total {value}", { value: total.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1") })}</b></div></td><td>{item.reorderPoint ?? "—"}</td><td>{formatMoney(Number(item.unitCost), currency)}</td><td><span className={`status-pill${item.isActive ? " status-pill-active" : ""}`}>{item.isActive ? t("ACTIVE") : t("ARCHIVED")}</span></td><td><div className="inventory-row-actions">{canUpdate && <button className="secondary-action" onClick={() => editItem(item)}>{t("Edit")}</button>}{(item.isActive ? canDelete : canUpdate) && <button className={item.isActive ? "danger-button" : "secondary-action"} onClick={() => void toggleItem(item)} disabled={busy}>{item.isActive ? t("Archive") : t("Reactivate")}</button>}</div></td></tr>;
      })}</tbody></table></div> : <div className="empty-state"><span>▦</span><h3>{query ? t("No matching items") : t("Your catalog is empty")}</h3><p>{query ? t("Try a different SKU or item name.") : t("Create an item above, then post a receipt to begin tracking stock.")}</p></div>}
      {pageCount > 1 && <div className="pagination"><span>{t("{page} / {count}", { page, count: pageCount })}</span><button className="secondary-action" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>{t("Previous")}</button><button className="secondary-action" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>{t("Next")}</button></div>}
    </article>
    <div className="workspace-grid inventory-lower-grid">
      <article className="workspace-panel inventory-table-panel"><div className="panel-heading"><div><span className="page-eyebrow">{t("LOCATIONS")}</span><h2>{t("Warehouses")}</h2></div><span className="count-badge">{summary?.warehouseCount ?? 0}</span></div>
        <label className="admin-filter"><span aria-hidden="true">⌕</span><input value={warehouseQuery} onChange={(event) => { setWarehouseQuery(event.target.value); setWarehousePage(1); }} placeholder={t("Search warehouse code, name or location")} aria-label={t("Search warehouses")} /></label>
        {warehouses.length ? <div className="warehouse-list">{warehouses.map((warehouse) => <div className="warehouse-row" key={warehouse.id}><span className="company-symbol">⌂</span><div className="company-row-main"><strong>{warehouse.name}</strong><small>{warehouse.code} · {warehouse.location || t("No location set")} · {t("{count} stocked items", { count: warehouse.productCount })}</small></div><span className={`status-pill${warehouse.isActive ? " status-pill-active" : ""}`}>{warehouse.isActive ? t("ACTIVE") : t("ARCHIVED")}</span><div className="inventory-row-actions">{canUpdate && <button className="secondary-action" onClick={() => { setEditingWarehouse(warehouse); setWarehouseDraft({ code: warehouse.code, name: warehouse.name, location: warehouse.location ?? "" }); document.getElementById("inventory-item-form")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{t("Edit")}</button>}{(warehouse.isActive ? canDelete : canUpdate) && <button className={warehouse.isActive ? "danger-button" : "secondary-action"} onClick={() => void toggleWarehouse(warehouse)} disabled={busy}>{warehouse.isActive ? t("Archive") : t("Reactivate")}</button>}</div></div>)}</div> : <div className="empty-state"><h3>{t("No warehouses yet")}</h3><p>{t("Create a stock location before receiving inventory.")}</p></div>}
        {warehousePageCount > 1 && <div className="pagination"><span>{t("Page {page} of {count}", { page: warehousePage, count: warehousePageCount })}</span><button className="secondary-action" onClick={() => setWarehousePage((current) => Math.max(1, current - 1))} disabled={warehousePage <= 1}>{t("Previous")}</button><button className="secondary-action" onClick={() => setWarehousePage((current) => Math.min(warehousePageCount, current + 1))} disabled={warehousePage >= warehousePageCount}>{t("Next")}</button></div>}
      </article>
      <article className="workspace-panel inventory-table-panel"><div className="panel-heading"><div><span className="page-eyebrow">{t("IMMUTABLE STOCK LEDGER")}</span><h2>{t("Recent movements")}</h2></div><span className="count-badge">{summary?.movementCount ?? 0}</span></div>
        <label className="admin-filter"><span aria-hidden="true">⌕</span><input value={movementQuery} onChange={(event) => { setMovementQuery(event.target.value); setMovementPage(1); }} placeholder={t("Search item, warehouse or reference")} aria-label={t("Search stock movements")} /></label>
        {movements.length ? <div className="movement-list">{movements.map((movement) => <div className="movement-row" key={movement.id}><span className={`movement-type movement-${movement.type.toLowerCase()}`}>{enumText(movement.type)}</span><div className="company-row-main"><strong>{movement.product.sku} · {movement.product.name}</strong><small>{movement.warehouse.code} · {movement.reference || t("No reference")} · {movement.actor.name} · {formatDate(movement.createdAt, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })}</small></div><b>{movement.type === "TRANSFER_OUT" || movement.type === "ISSUE" ? "−" : "+"}{movement.quantity} {movement.product.unit}</b></div>)}</div> : <div className="empty-state"><h3>{t("No stock movements")}</h3><p>{t("Receipts and transfers will be recorded here.")}</p></div>}
        {movementPageCount > 1 && <div className="pagination"><span>{t("Page {page} of {count}", { page: movementPage, count: movementPageCount })}</span><button className="secondary-action" onClick={() => setMovementPage((current) => Math.max(1, current - 1))} disabled={movementPage <= 1}>{t("Previous")}</button><button className="secondary-action" onClick={() => setMovementPage((current) => Math.min(movementPageCount, current + 1))} disabled={movementPage >= movementPageCount}>{t("Next")}</button></div>}
      </article>
    </div>
  </section>;
}
