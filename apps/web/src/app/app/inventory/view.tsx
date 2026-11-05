"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiRequest, formatApiDate } from "../../../lib/api";
import { useNexusSession } from "../session-context";

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
      setError(reason instanceof Error ? reason.message : "Inventory data could not be loaded.");
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
        setNotice(`${body.name} updated.`);
      } else {
        await apiRequest("/inventory/items", { method: "POST", body: JSON.stringify(body) });
        setNotice(`${body.sku} added to the item catalog.`);
      }
      setItemDraft(emptyItem); setEditingItem(null); await loadInventory();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The item could not be saved.");
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
      setNotice(item.isActive ? `${item.sku} archived.` : `${item.sku} reactivated.`);
      await loadInventory();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The item status could not be changed."); }
    finally { setBusy(false); }
  }

  async function saveWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (editingWarehouse) {
        await apiRequest(`/inventory/warehouses/${editingWarehouse.id}`, { method: "PATCH", body: JSON.stringify({ name: warehouseDraft.name, location: warehouseDraft.location }) });
        setNotice(`${warehouseDraft.name} updated.`);
      } else {
        await apiRequest("/inventory/warehouses", { method: "POST", body: JSON.stringify(warehouseDraft) });
        setNotice(`${warehouseDraft.code.toUpperCase()} warehouse created.`);
      }
      setWarehouseDraft(emptyWarehouse); setEditingWarehouse(null); await loadInventory();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The warehouse could not be saved."); }
    finally { setBusy(false); }
  }

  async function toggleWarehouse(warehouse: Warehouse) {
    setBusy(true); setError(""); setNotice("");
    try {
      if (warehouse.isActive) await apiRequest(`/inventory/warehouses/${warehouse.id}`, { method: "DELETE" });
      else await apiRequest(`/inventory/warehouses/${warehouse.id}`, { method: "PATCH", body: JSON.stringify({ isActive: true }) });
      setNotice(warehouse.isActive ? `${warehouse.code} warehouse archived.` : `${warehouse.code} warehouse reactivated.`);
      await loadInventory();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The warehouse status could not be changed."); }
    finally { setBusy(false); }
  }

  async function receiveGoods(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest("/inventory/receipts", { method: "POST", body: JSON.stringify({ warehouseId: receipt.warehouseId, reference: receipt.reference, lines: [{ productId: receipt.productId, quantity: receipt.quantity, ...(receipt.unitCost ? { unitCost: receipt.unitCost } : {}) }] }) });
      setReceipt((current) => ({ ...current, quantity: "", unitCost: "", reference: "" }));
      setNotice("Goods receipt posted. Stock and movement history updated atomically."); await loadInventory();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The goods receipt could not be posted."); }
    finally { setBusy(false); }
  }

  async function transferStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest("/inventory/transfers", { method: "POST", body: JSON.stringify({ fromWarehouseId: transfer.fromWarehouseId, toWarehouseId: transfer.toWarehouseId, reference: transfer.reference, lines: [{ productId: transfer.productId, quantity: transfer.quantity }] }) });
      setTransfer((current) => ({ ...current, quantity: "", reference: "" }));
      setNotice("Stock transfer posted. Both warehouse balances and ledger entries were updated together."); await loadInventory();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The stock transfer could not be posted."); }
    finally { setBusy(false); }
  }

  return <section className="inventory-page">
    <div className="page-heading"><div><span className="page-eyebrow">OPERATIONS · INVENTORY</span><h1>Inventory & warehouses</h1><p>Track item balances by warehouse and keep each stock change in a tenant-scoped ledger.</p></div><button className="secondary-action" onClick={() => void loadInventory()} disabled={loading}>Refresh <span aria-hidden="true">↻</span></button></div>
    {error && <p className="auth-alert" role="alert">{error}</p>}{notice && <p className="success-alert" role="status">{notice}</p>}
    <div className="summary-grid inventory-summary">
      <article className="summary-card"><span>ACTIVE ITEMS</span><strong>{summary?.itemCount ?? "—"}</strong><small>Catalog items in this company</small></article>
      <article className="summary-card"><span>WAREHOUSES</span><strong>{summary?.warehouseCount ?? "—"}</strong><small>Active stock locations</small></article>
      <article className="summary-card"><span>UNITS ON HAND</span><strong>{summary?.totalUnits ?? "—"}</strong><small>Across all active and archived locations</small></article>
      <article className="summary-card"><span>BELOW REORDER POINT</span><strong>{summary?.lowStockCount ?? "—"}</strong><small>Items below company-wide threshold</small></article>
    </div>
    <div className="workspace-grid inventory-forms-grid">
      <article className="workspace-panel inventory-form-panel" id="inventory-item-form"><div className="panel-heading"><div><span className="page-eyebrow">ITEM CATALOG</span><h2>{editingItem ? `Edit ${editingItem.sku}` : "Add an item"}</h2></div></div>
        <form className="company-form" onSubmit={saveItem}>
          <label className="auth-field"><span>SKU</span><input value={itemDraft.sku} onChange={(event) => setItemDraft((current) => ({ ...current, sku: event.target.value.toUpperCase() }))} required minLength={2} maxLength={60} pattern="[A-Za-z0-9][A-Za-z0-9._/-]{1,59}" disabled={Boolean(editingItem)} /></label>
          <label className="auth-field"><span>Item name</span><input value={itemDraft.name} onChange={(event) => setItemDraft((current) => ({ ...current, name: event.target.value }))} required minLength={2} maxLength={180} /></label>
          <div className="form-row"><label className="auth-field"><span>Unit</span><input value={itemDraft.unit} onChange={(event) => setItemDraft((current) => ({ ...current, unit: event.target.value }))} required maxLength={16} /></label><label className="auth-field"><span>Unit cost ({currency})</span><input type="number" min="0" step="0.01" value={itemDraft.unitCost} onChange={(event) => setItemDraft((current) => ({ ...current, unitCost: event.target.value }))} required /></label></div>
          <div className="form-row"><label className="auth-field"><span>Reorder point</span><input type="number" min="0" step="0.001" value={itemDraft.reorderPoint} onChange={(event) => setItemDraft((current) => ({ ...current, reorderPoint: event.target.value }))} placeholder="Optional" /></label><label className="auth-field"><span>Description</span><input value={itemDraft.description} onChange={(event) => setItemDraft((current) => ({ ...current, description: event.target.value }))} maxLength={1000} placeholder="Optional" /></label></div>
          <div className="inventory-form-actions"><button className="auth-submit" type="submit" disabled={busy}>{busy ? "Saving…" : editingItem ? "Save item changes" : "Create inventory item"}<span aria-hidden="true">→</span></button>{editingItem && <button type="button" className="secondary-action" onClick={() => { setEditingItem(null); setItemDraft(emptyItem); }}>Cancel</button>}</div>
        </form>
      </article>
      <article className="workspace-panel inventory-form-panel"><div className="panel-heading"><div><span className="page-eyebrow">STOCK LOCATION</span><h2>{editingWarehouse ? `Edit ${editingWarehouse.code}` : "Add a warehouse"}</h2></div></div>
        <form className="company-form" onSubmit={saveWarehouse}>
          <label className="auth-field"><span>Warehouse code</span><input value={warehouseDraft.code} onChange={(event) => setWarehouseDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))} required minLength={2} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9._-]{1,23}" disabled={Boolean(editingWarehouse)} /></label>
          <label className="auth-field"><span>Warehouse name</span><input value={warehouseDraft.name} onChange={(event) => setWarehouseDraft((current) => ({ ...current, name: event.target.value }))} required minLength={2} maxLength={160} /></label>
          <label className="auth-field"><span>Location</span><input value={warehouseDraft.location} onChange={(event) => setWarehouseDraft((current) => ({ ...current, location: event.target.value }))} maxLength={180} placeholder="City, site or address" /></label>
          <div className="inventory-form-actions"><button className="auth-submit" type="submit" disabled={busy}>{busy ? "Saving…" : editingWarehouse ? "Save warehouse" : "Create warehouse"}<span aria-hidden="true">→</span></button>{editingWarehouse && <button type="button" className="secondary-action" onClick={() => { setEditingWarehouse(null); setWarehouseDraft(emptyWarehouse); }}>Cancel</button>}</div>
        </form>
      </article>
    </div>
    <div className="workspace-grid inventory-forms-grid inventory-workflows">
      <article className="workspace-panel inventory-form-panel"><span className="page-eyebrow">GOODS RECEIPT</span><h2>Receive stock</h2><p>Post an incoming quantity to a selected warehouse. The balance and immutable movement record commit together.</p>
        <form className="company-form" onSubmit={receiveGoods}>
          <label className="auth-field"><span>Warehouse</span><select value={receipt.warehouseId} onChange={(event) => setReceipt((current) => ({ ...current, warehouseId: event.target.value }))} required><option value="">Choose a warehouse</option>{activeWarehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
          <label className="auth-field"><span>Item</span><select value={receipt.productId} onChange={(event) => setReceipt((current) => ({ ...current, productId: event.target.value }))} required><option value="">Choose an item</option>{activeItems.map((item) => <option value={item.id} key={item.id}>{item.sku} · {item.name}</option>)}</select></label>
          <div className="form-row"><label className="auth-field"><span>Quantity</span><input type="number" min="0.001" step="0.001" value={receipt.quantity} onChange={(event) => setReceipt((current) => ({ ...current, quantity: event.target.value }))} required /></label><label className="auth-field"><span>Unit cost ({currency})</span><input type="number" min="0" step="0.01" value={receipt.unitCost} onChange={(event) => setReceipt((current) => ({ ...current, unitCost: event.target.value }))} placeholder="Use item cost" /></label></div>
          <label className="auth-field"><span>Reference</span><input value={receipt.reference} onChange={(event) => setReceipt((current) => ({ ...current, reference: event.target.value }))} maxLength={100} placeholder="Supplier delivery or GRN" /></label>
          <button className="auth-submit" type="submit" disabled={busy || !activeItems.length || !activeWarehouses.length}>{busy ? "Posting…" : "Post goods receipt"}<span aria-hidden="true">→</span></button>
        </form>
      </article>
      <article className="workspace-panel inventory-form-panel"><span className="page-eyebrow">WAREHOUSE TRANSFER</span><h2>Move stock</h2><p>Transfers create paired ledger entries. The source balance is checked atomically to prevent negative stock.</p>
        <form className="company-form" onSubmit={transferStock}>
          <label className="auth-field"><span>Item</span><select value={transfer.productId} onChange={(event) => setTransfer((current) => ({ ...current, productId: event.target.value }))} required><option value="">Choose an item</option>{activeItems.map((item) => <option value={item.id} key={item.id}>{item.sku} · {item.name}</option>)}</select></label>
          <div className="form-row"><label className="auth-field"><span>From warehouse</span><select value={transfer.fromWarehouseId} onChange={(event) => setTransfer((current) => ({ ...current, fromWarehouseId: event.target.value }))} required><option value="">Choose source</option>{activeWarehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label><label className="auth-field"><span>To warehouse</span><select value={transfer.toWarehouseId} onChange={(event) => setTransfer((current) => ({ ...current, toWarehouseId: event.target.value }))} required><option value="">Choose destination</option>{activeWarehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id} disabled={warehouse.id === transfer.fromWarehouseId}>{warehouse.code} · {warehouse.name}</option>)}</select></label></div>
          <div className="form-row"><label className="auth-field"><span>Quantity</span><input type="number" min="0.001" step="0.001" value={transfer.quantity} onChange={(event) => setTransfer((current) => ({ ...current, quantity: event.target.value }))} required /></label><label className="auth-field"><span>Reference</span><input value={transfer.reference} onChange={(event) => setTransfer((current) => ({ ...current, reference: event.target.value }))} maxLength={100} placeholder="Transfer reference" /></label></div>
          <button className="auth-submit" type="submit" disabled={busy || activeWarehouses.length < 2 || !activeItems.length}>{busy ? "Posting…" : "Post stock transfer"}<span aria-hidden="true">→</span></button>
        </form>
      </article>
    </div>
    <article className="workspace-panel inventory-table-panel"><div className="panel-heading"><div><span className="page-eyebrow">TENANT ITEM CATALOG</span><h2>Items & on-hand quantity</h2></div><span className="count-badge">{summary?.itemCount ?? 0}</span></div>
      <label className="admin-filter"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search SKU or item name" aria-label="Search inventory items" /></label>
      {loading ? <p className="loading-state">Loading inventory…</p> : items.length ? <div className="membership-table-wrap"><table className="membership-table inventory-table"><thead><tr><th>ITEM</th><th>ON HAND</th><th>REORDER</th><th>UNIT COST</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{items.map((item) => {
        const quantityByWarehouse = item.stockBalances.map((balance) => <span key={balance.warehouse.id} className="stock-location"><strong>{balance.quantity}</strong><small>{balance.warehouse.code}</small></span>);
        const total = item.stockBalances.reduce((sum, balance) => sum + Number(balance.quantity), 0);
        return <tr key={item.id}><td><strong>{item.name}</strong><small>{item.sku} · {item.unit}{item.description ? ` · ${item.description}` : ""}</small></td><td><div className="stock-locations">{quantityByWarehouse.length ? quantityByWarehouse : <span className="stock-location"><strong>0</strong><small>No stock</small></span>}<b>Total {total.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")}</b></div></td><td>{item.reorderPoint ?? "—"}</td><td>{new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(item.unitCost))}</td><td><span className={`status-pill${item.isActive ? " status-pill-active" : ""}`}>{item.isActive ? "ACTIVE" : "ARCHIVED"}</span></td><td><div className="inventory-row-actions"><button className="secondary-action" onClick={() => editItem(item)}>Edit</button><button className={item.isActive ? "danger-button" : "secondary-action"} onClick={() => void toggleItem(item)} disabled={busy}>{item.isActive ? "Archive" : "Reactivate"}</button></div></td></tr>;
      })}</tbody></table></div> : <div className="empty-state"><span>▦</span><h3>{query ? "No matching items" : "Your catalog is empty"}</h3><p>{query ? "Try a different SKU or item name." : "Create an item above, then post a receipt to begin tracking stock."}</p></div>}
      {pageCount > 1 && <div className="pagination"><span>{page} / {pageCount}</span><button className="secondary-action" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Previous</button><button className="secondary-action" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>Next</button></div>}
    </article>
    <div className="workspace-grid inventory-lower-grid">
      <article className="workspace-panel inventory-table-panel"><div className="panel-heading"><div><span className="page-eyebrow">LOCATIONS</span><h2>Warehouses</h2></div><span className="count-badge">{summary?.warehouseCount ?? 0}</span></div>
        <label className="admin-filter"><span aria-hidden="true">⌕</span><input value={warehouseQuery} onChange={(event) => { setWarehouseQuery(event.target.value); setWarehousePage(1); }} placeholder="Search warehouse code, name or location" aria-label="Search warehouses" /></label>
        {warehouses.length ? <div className="warehouse-list">{warehouses.map((warehouse) => <div className="warehouse-row" key={warehouse.id}><span className="company-symbol">⌂</span><div className="company-row-main"><strong>{warehouse.name}</strong><small>{warehouse.code} · {warehouse.location || "No location set"} · {warehouse.productCount} stocked items</small></div><span className={`status-pill${warehouse.isActive ? " status-pill-active" : ""}`}>{warehouse.isActive ? "ACTIVE" : "ARCHIVED"}</span><div className="inventory-row-actions"><button className="secondary-action" onClick={() => { setEditingWarehouse(warehouse); setWarehouseDraft({ code: warehouse.code, name: warehouse.name, location: warehouse.location ?? "" }); document.getElementById("inventory-item-form")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>Edit</button><button className={warehouse.isActive ? "danger-button" : "secondary-action"} onClick={() => void toggleWarehouse(warehouse)} disabled={busy}>{warehouse.isActive ? "Archive" : "Reactivate"}</button></div></div>)}</div> : <div className="empty-state"><h3>No warehouses yet</h3><p>Create a stock location before receiving inventory.</p></div>}
        {warehousePageCount > 1 && <div className="pagination"><span>Page {warehousePage} of {warehousePageCount}</span><button className="secondary-action" onClick={() => setWarehousePage((current) => Math.max(1, current - 1))} disabled={warehousePage <= 1}>Previous</button><button className="secondary-action" onClick={() => setWarehousePage((current) => Math.min(warehousePageCount, current + 1))} disabled={warehousePage >= warehousePageCount}>Next</button></div>}
      </article>
      <article className="workspace-panel inventory-table-panel"><div className="panel-heading"><div><span className="page-eyebrow">IMMUTABLE STOCK LEDGER</span><h2>Recent movements</h2></div><span className="count-badge">{summary?.movementCount ?? 0}</span></div>
        <label className="admin-filter"><span aria-hidden="true">⌕</span><input value={movementQuery} onChange={(event) => { setMovementQuery(event.target.value); setMovementPage(1); }} placeholder="Search item, warehouse or reference" aria-label="Search stock movements" /></label>
        {movements.length ? <div className="movement-list">{movements.map((movement) => <div className="movement-row" key={movement.id}><span className={`movement-type movement-${movement.type.toLowerCase()}`}>{movement.type.replaceAll("_", " ")}</span><div className="company-row-main"><strong>{movement.product.sku} · {movement.product.name}</strong><small>{movement.warehouse.code} · {movement.reference || "No reference"} · {movement.actor.name} · {formatApiDate(movement.createdAt)}</small></div><b>{movement.type === "TRANSFER_OUT" || movement.type === "ISSUE" ? "−" : "+"}{movement.quantity} {movement.product.unit}</b></div>)}</div> : <div className="empty-state"><h3>No stock movements</h3><p>Receipts and transfers will be recorded here.</p></div>}
        {movementPageCount > 1 && <div className="pagination"><span>Page {movementPage} of {movementPageCount}</span><button className="secondary-action" onClick={() => setMovementPage((current) => Math.max(1, current - 1))} disabled={movementPage <= 1}>Previous</button><button className="secondary-action" onClick={() => setMovementPage((current) => Math.min(movementPageCount, current + 1))} disabled={movementPage >= movementPageCount}>Next</button></div>}
      </article>
    </div>
  </section>;
}
