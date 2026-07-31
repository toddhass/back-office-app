import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Camera, AlertTriangle, Plus, ArrowLeft, Search, Pencil } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { bg, card, textPrimary, textMuted, accent, danger, good, mono } from "../lib/tokens";

function ConfidenceBar({ score }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.85 ? good : score >= 0.5 ? accent : danger;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "#E2E6ED", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: mono, fontSize: 12, color, minWidth: 32, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function TicketDivider() {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 6, padding: "4px 0" }}>
      {Array.from({ length: 28 }).map((_, i) => (
        <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "#E2E6ED" }} />
      ))}
    </div>
  );
}

export default function InvoicesScreen() {
  const { restaurantId: RESTAURANT_ID } = useAuth();
  const [loading, setLoading] = useState(true);
  const [historyList, setHistoryList] = useState([]);
  const [historyDetail, setHistoryDetail] = useState(null); // { invoice, lineItems }
  const [historyLoading, setHistoryLoading] = useState(false);
  const [suppliersList, setSuppliersList] = useState([]);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [addingVendor, setAddingVendor] = useState(false);
  const [addVendorError, setAddVendorError] = useState("");
  const [vendorSelection, setVendorSelection] = useState(null); // candidate id, or 'new'
  const [showNewVendorConfirm, setShowNewVendorConfirm] = useState(false);
  const [newVendorConfirmName, setNewVendorConfirmName] = useState("");
  const [confirmingVendor, setConfirmingVendor] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [pendingList, setPendingList] = useState([]);
  const [view, setView] = useState("queue");
  const [cardIndex, setCardIndex] = useState(0);
  const [newItemName, setNewItemName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [invoicePhotoUrl, setInvoicePhotoUrl] = useState(null);
  const [showInvoicePhoto, setShowInvoicePhoto] = useState(false);
  const [editingQty, setEditingQty] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");

  async function loadPendingList() {
    if (!RESTAURANT_ID) return;
    setLoading(true);
    const { data: invoices, error: invErr } = await supabase
      .from("invoices")
      .select("*, suppliers(name)")
      .eq("restaurant_id", RESTAURANT_ID)
      .eq("status", "pending_review")
      .order("created_at", { ascending: true });

    if (invErr || !invoices?.length) {
      setPendingList([]);
      setLoading(false);
      return;
    }

    const ids = invoices.map((i) => i.id);
    const { data: allItems } = await supabase
      .from("invoice_line_items")
      .select("invoice_id, needs_review")
      .in("invoice_id", ids);

    const counts = {};
    (allItems || []).forEach((li) => {
      if (li.needs_review) counts[li.invoice_id] = (counts[li.invoice_id] || 0) + 1;
    });

    setPendingList(
      invoices.map((inv) => ({
        ...inv,
        needsReviewCount: counts[inv.id] || 0,
        needsVendorConfirm: !inv.supplier_id,
      }))
    );
    setLoading(false);
  }

  async function loadInvoiceDetail(invId) {
    setLoading(true);
    const { data: inv } = await supabase
      .from("invoices")
      .select("*, suppliers(name)")
      .eq("id", invId)
      .single();

    const { data: items } = await supabase
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", invId)
      .order("created_at", { ascending: true });

    setInvoice(inv || null);
    setLineItems(items || []);
    setCardIndex(0);
    setShowNewForm(false);
    setNewItemName("");
    setVendorSelection(null);
    setShowNewVendorConfirm(false);
    setNewVendorConfirmName("");
    setShowInvoicePhoto(false);
    setEditingQty(false);
    setView("detail");
    setLoading(false);

    if (inv?.file_url) {
      const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(inv.file_url, 600);
      setInvoicePhotoUrl(signed?.signedUrl || null);
    } else {
      setInvoicePhotoUrl(null);
    }
  }

  async function updateLineItemValue(itemId, field, value) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    const updated = { [field]: numValue };
    // Keep line_total consistent if the user corrects quantity or unit price
    const item = lineItems.find((i) => i.id === itemId);
    if (item) {
      const qty = field === "quantity" ? numValue : item.quantity;
      const price = field === "unit_price" ? numValue : item.unit_price;
      if (qty != null && price != null) updated.line_total = +(qty * price).toFixed(2);
    }
    await supabase.from("invoice_line_items").update(updated).eq("id", itemId);
    setLineItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...updated } : i)));
  }

  async function loadHistory() {
    if (!RESTAURANT_ID) return;
    setHistoryLoading(true);
    const { data } = await supabase
      .from("invoices")
      .select("*, suppliers(name)")
      .eq("restaurant_id", RESTAURANT_ID)
      .eq("status", "confirmed")
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false });
    setHistoryList(data || []);
    setHistoryLoading(false);
  }

  async function loadHistoryDetail(inv) {
    setHistoryLoading(true);
    const { data: items } = await supabase
      .from("invoice_line_items")
      .select("*, inventory_items(name)")
      .eq("invoice_id", inv.id)
      .order("created_at", { ascending: true });
    setHistoryDetail({ invoice: inv, lineItems: items || [] });
    setHistoryLoading(false);
  }

  async function loadSuppliers() {
    if (!RESTAURANT_ID) return;
    const { data } = await supabase
      .from("suppliers")
      .select("id, name, phone")
      .eq("restaurant_id", RESTAURANT_ID)
      .order("name", { ascending: true });
    setSuppliersList(data || []);
  }

  async function addVendor() {
    if (!newVendorName.trim()) return;
    setAddingVendor(true);
    setAddVendorError("");

    // Guard against creating a duplicate row for a vendor that's just a
    // name variant of one that already exists (same reasoning as the
    // invoice-time supplier resolution, kept simple here as an exact check
    // since this is a deliberate manual add, not an OCR read).
    const exists = suppliersList.some(
      (s) => s.name.trim().toLowerCase() === newVendorName.trim().toLowerCase()
    );
    if (exists) {
      setAddVendorError("A vendor with this name already exists.");
      setAddingVendor(false);
      return;
    }

    const { error } = await supabase
      .from("suppliers")
      .insert({ restaurant_id: RESTAURANT_ID, name: newVendorName.trim(), phone: vendorPhone.trim() || null });

    if (error) {
      setAddVendorError(error.message);
    } else {
      setNewVendorName("");
      setVendorPhone("");
      setShowAddVendor(false);
      loadSuppliers();
    }
    setAddingVendor(false);
  }

  async function confirmVendorMatch(candidateId) {
    setConfirmingVendor(true);
    const { error } = await supabase
      .from("invoices")
      .update({ supplier_id: candidateId })
      .eq("id", invoice.id);
    if (!error) {
      setInvoice((prev) => ({ ...prev, supplier_id: candidateId }));
      loadInvoiceDetail(invoice.id);
    }
    setConfirmingVendor(false);
  }

  async function confirmNewVendorFromInvoice() {
    if (!newVendorConfirmName.trim()) return;
    setConfirmingVendor(true);

    const { data: created, error: createError } = await supabase
      .from("suppliers")
      .insert({ restaurant_id: RESTAURANT_ID, name: newVendorConfirmName.trim(), phone: vendorPhone.trim() || null })
      .select("id")
      .single();

    if (!createError && created) {
      await supabase.from("invoices").update({ supplier_id: created.id }).eq("id", invoice.id);
      setInvoice((prev) => ({ ...prev, supplier_id: created.id }));
      setVendorPhone("");
      loadSuppliers();
      loadInvoiceDetail(invoice.id);
    }
    setConfirmingVendor(false);
    setShowNewVendorConfirm(false);
  }

  useEffect(() => {
    loadPendingList();
  }, [RESTAURANT_ID]);

  const reviewItems = lineItems.filter((i) => i.needs_review);
  const allResolved = reviewItems.every((i) => i.inventory_item_id || i._createdNew);
  const currentItem = reviewItems[cardIndex];

  async function selectCandidate(itemId, candidateId) {
    const { error } = await supabase
      .from("invoice_line_items")
      .update({ inventory_item_id: candidateId, needs_review: false })
      .eq("id", itemId);

    if (!error) {
      // Also record this as a learned mapping for next time
      const item = lineItems.find((i) => i.id === itemId);
      await supabase.from("item_mappings").upsert(
        {
          restaurant_id: RESTAURANT_ID,
          raw_description: item.raw_description,
          inventory_item_id: candidateId,
        },
        { onConflict: "restaurant_id,raw_description" }
      );

      setLineItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, inventory_item_id: candidateId, needs_review: false } : i))
      );
    }
  }

  async function createNewItem() {
    if (!currentItem || !newItemName) return;
    const { data: created, error } = await supabase
      .from("inventory_items")
      .insert({
        restaurant_id: RESTAURANT_ID,
        name: newItemName,
        unit: currentItem.unit || "ea",
        current_stock: currentItem.quantity || 0,
      })
      .select()
      .single();

    if (!error && created) {
      await supabase
        .from("invoice_line_items")
        .update({ inventory_item_id: created.id, needs_review: false })
        .eq("id", currentItem.id);

      await supabase.from("item_mappings").upsert(
        {
          restaurant_id: RESTAURANT_ID,
          raw_description: currentItem.raw_description,
          inventory_item_id: created.id,
        },
        { onConflict: "restaurant_id,raw_description" }
      );

      setLineItems((prev) =>
        prev.map((i) => (i.id === currentItem.id ? { ...i, inventory_item_id: created.id, needs_review: false } : i))
      );
    }
    setNewItemName("");
    setShowNewForm(false);
  }

  function confirmAndAdvance() {
    if (cardIndex < reviewItems.length - 1) {
      setCardIndex((c) => c + 1);
      setShowNewForm(false);
      setEditingQty(false);
    }
  }

  async function postToInventory() {
    // Bump stock for every matched line item, then close out the invoice
    for (const item of lineItems) {
      if (!item.inventory_item_id) continue;
      const { data: current } = await supabase
        .from("inventory_items")
        .select("current_stock")
        .eq("id", item.inventory_item_id)
        .single();

      const newStock = (current?.current_stock || 0) + (item.quantity || 0);

      await supabase
        .from("inventory_items")
        .update({ current_stock: newStock, last_reorder_sent_at: null })
        .eq("id", item.inventory_item_id);
      await supabase.from("stock_transactions").insert({
        inventory_item_id: item.inventory_item_id,
        change: item.quantity,
        source: "invoice",
        reference_id: invoice.id,
      });
    }
    const { data: userData } = await supabase.auth.getUser();
    await supabase
      .from("invoices")
      .update({
        status: "confirmed",
        confirmed_by: userData?.user?.id || null,
        confirmed_by_email: userData?.user?.email || null,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);
    setView("queue");
    loadPendingList();
  }

  if (loading) {
    return <div style={{ padding: 24, color: textMuted }}>Loading…</div>;
  }

  if (view === "history") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 16px 8px" }}>
          <button onClick={() => { setView("queue"); loadPendingList(); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", padding: 4 }}>
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Past invoices</h1>
        </div>

        <div style={{ padding: "8px 16px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: textMuted }}>Vendors</div>
            <button
              onClick={() => {
                setShowAddVendor((s) => !s);
                setAddVendorError("");
              }}
              style={{ background: "none", border: "none", color: accent, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
            >
              <Plus size={13} /> Add vendor
            </button>
          </div>

          {showAddVendor && (
            <div style={{ background: card, border: "1px solid #E2E6ED", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <input
                placeholder="Vendor name"
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                style={{ width: "100%", background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "8px 10px", color: textPrimary, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
              />
              <input
                placeholder="Phone (optional)"
                value={vendorPhone}
                onChange={(e) => setVendorPhone(e.target.value)}
                style={{ width: "100%", background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "8px 10px", color: textPrimary, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
              />
              {addVendorError && <div style={{ color: danger, fontSize: 12, marginBottom: 8 }}>{addVendorError}</div>}
              <button
                onClick={addVendor}
                disabled={!newVendorName.trim() || addingVendor}
                style={{
                  width: "100%",
                  background: newVendorName.trim() ? accent : "#D6DCE5",
                  border: "none",
                  borderRadius: 6,
                  padding: "9px 12px",
                  color: "#FFFFFF",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: newVendorName.trim() ? "pointer" : "not-allowed",
                }}
              >
                {addingVendor ? "Adding…" : "Save vendor"}
              </button>
            </div>
          )}

          {suppliersList.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {suppliersList.map((s) => {
                const active = historySearch.trim().toLowerCase() === s.name.trim().toLowerCase();
                return (
                  <button
                    key={s.id}
                    onClick={() => setHistorySearch(active ? "" : s.name)}
                    style={{
                      fontSize: 12,
                      color: active ? "#FFFFFF" : textMuted,
                      background: active ? accent : "#F1F4F8",
                      border: active ? `1px solid ${accent}` : "1px solid #E2E6ED",
                      borderRadius: 20,
                      padding: "5px 12px",
                      fontWeight: active ? 700 : 400,
                      cursor: "pointer",
                    }}
                  >
                    {s.name}{s.phone ? ` · ${s.phone}` : ""}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: "0 16px 8px", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: textMuted }}>
          Invoice history
        </div>

        {historyList.length > 0 && (
          <div style={{ padding: "0 16px 8px", position: "relative" }}>
            <Search size={14} color={textMuted} style={{ position: "absolute", left: 28, top: "50%", transform: "translateY(-50%)" }} />
            <input
              placeholder="Search by vendor…"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              style={{ width: "100%", background: card, border: "1px solid #E2E6ED", borderRadius: 8, padding: "9px 10px 9px 32px", color: textPrimary, fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
        )}

        {historyLoading && <div style={{ padding: "20px 16px", color: textMuted }}>Loading…</div>}

        {!historyLoading && historyList.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center", color: textMuted }}>
            No confirmed invoices yet.
          </div>
        )}

        <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {historyList
            .filter((inv) => (inv.suppliers?.name || "Unknown supplier").toLowerCase().includes(historySearch.toLowerCase()))
            .map((inv) => (
            <button
              key={inv.id}
              onClick={() => {
                setView("historyDetail");
                loadHistoryDetail(inv);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                background: card,
                border: "1px solid #E2E6ED",
                borderRadius: 10,
                padding: "14px 16px",
                color: textPrimary,
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{inv.suppliers?.name || "Unknown supplier"}</div>
                <div style={{ color: textMuted, fontSize: 12, marginTop: 2 }}>
                  {inv.invoice_date}
                  {" · "}
                  {new Date(inv.confirmed_at || inv.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {inv.confirmed_by_email && ` · ${inv.confirmed_by_email}`}
                </div>
              </div>
              <div style={{ fontFamily: mono, fontSize: 14, color: accent }}>${Number(inv.invoice_total || 0).toFixed(2)}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (view === "historyDetail" && historyDetail) {
    const { invoice: histInv, lineItems: histItems } = historyDetail;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 16px 8px" }}>
          <button onClick={() => setView("history")} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", padding: 4 }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{histInv.suppliers?.name || "Unknown supplier"}</div>
            <div style={{ fontSize: 12, color: textMuted }}>{histInv.invoice_date}</div>
          </div>
        </div>

        {historyLoading && <div style={{ padding: "20px 16px", color: textMuted }}>Loading…</div>}

        <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {histItems.map((item) => (
            <div key={item.id} style={{ background: card, border: "1px solid #E2E6ED", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{item.inventory_items?.name || item.raw_description}</div>
              <div style={{ fontSize: 11, color: textMuted, fontFamily: mono, marginTop: 2 }}>
                {item.quantity} {item.unit} &middot; ${Number(item.line_total || 0).toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "16px", display: "flex", justifyContent: "space-between", borderTop: "1px solid #E2E6ED", marginTop: 8 }}>
          <span style={{ color: textMuted, fontSize: 13 }}>Total</span>
          <span style={{ fontFamily: mono, color: accent, fontSize: 15 }}>${Number(histInv.invoice_total || 0).toFixed(2)}</span>
        </div>
        {histInv.confirmed_by_email && (
          <div style={{ padding: "0 16px 16px", fontSize: 12, color: textMuted }}>
            Received by {histInv.confirmed_by_email}
            {histInv.confirmed_at &&
              ` on ${new Date(histInv.confirmed_at).toLocaleDateString()} at ${new Date(histInv.confirmed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
          </div>
        )}
      </div>
    );
  }

  if (view === "queue") {
    return (
      <div>
        <div style={{ padding: "24px 20px 8px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: textMuted, marginBottom: 4 }}>
              Invoice Queue
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Needs review</h1>
          </div>
          <button
            onClick={() => {
              setView("history");
              loadHistory();
              loadSuppliers();
            }}
            style={{ background: "none", border: "none", color: textMuted, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
          >
            History
          </button>
        </div>

        {pendingList.length === 0 && (
          <div style={{ padding: "60px 20px", textAlign: "center", color: textMuted }}>
            <div>No invoices waiting for review. Upload one from the Capture tab.</div>
            <button
              onClick={() => {
                setView("history");
                loadHistory();
                loadSuppliers();
              }}
              style={{ marginTop: 16, background: "none", border: "1px solid #E2E6ED", borderRadius: 8, padding: "10px 16px", color: textMuted, cursor: "pointer", fontSize: 13 }}
            >
              View past invoices
            </button>
          </div>
        )}

        <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {pendingList.map((inv) => (
            <button
              key={inv.id}
              onClick={() => loadInvoiceDetail(inv.id)}
              style={{
                width: "100%",
                textAlign: "left",
                background: card,
                border: "1px solid #E2E6ED",
                borderRadius: 10,
                padding: "16px 18px",
                color: textPrimary,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{inv.suppliers?.name || "Unknown supplier"}</div>
                  <div style={{ color: textMuted, fontSize: 13, marginTop: 2 }}>{inv.invoice_date}</div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 15, color: accent }}>
                  ${Number(inv.invoice_total || 0).toFixed(2)}
                </div>
              </div>
              <TicketDivider />
              {inv.needsVendorConfirm ? (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "#E7F0FA",
                    color: accent,
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 20,
                  }}
                >
                  <AlertTriangle size={12} />
                  Confirm vendor
                </div>
              ) : inv.needsReviewCount > 0 ? (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "#E7F0FA",
                    color: accent,
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 20,
                  }}
                >
                  <AlertTriangle size={12} />
                  {inv.needsReviewCount} items need review
                </div>
              ) : (
                <div style={{ fontSize: 12, color: good }}>Ready to post</div>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!invoice) {
    return null;
  }

  if (!invoice.supplier_id) {
    const rawName = invoice.raw_extraction?.supplier_name || "Unknown";
    const candidates = invoice.raw_extraction?.supplier_candidates || [];
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 16px 8px" }}>
          <button onClick={() => { setView("queue"); loadPendingList(); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", padding: 4 }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Confirm vendor</div>
            <div style={{ fontSize: 12, color: textMuted }}>{invoice.invoice_date}</div>
          </div>
        </div>

        <div style={{ padding: "8px 16px" }}>
          <div style={{ background: card, border: "1px solid #E2E6ED", borderRadius: 10, padding: 18 }}>
            <div style={{ fontFamily: mono, fontSize: 15, marginBottom: 4 }}>"{rawName}"</div>
            <div style={{ color: textMuted, fontSize: 13, marginBottom: 14 }}>
              We couldn't confidently match this to an existing vendor.
            </div>
            <TicketDivider />

            {candidates.length > 0 ? (
              <>
                <div style={{ fontSize: 12, color: textMuted, textTransform: "uppercase", letterSpacing: 1, margin: "10px 0 8px" }}>
                  Is it one of these?
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {candidates.map((c) => (
                    <label
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: vendorSelection === c.id ? "#E7F0FA" : "#F1F4F8",
                        border: vendorSelection === c.id ? `1px solid ${accent}` : "1px solid #E2E6ED",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        checked={vendorSelection === c.id}
                        onChange={() => setVendorSelection(c.id)}
                        style={{ accentColor: accent }}
                      />
                      <div style={{ fontSize: 14 }}>{c.name}</div>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: textMuted, marginBottom: 12 }}>
                No existing vendors look close — this is likely a new one.
              </div>
            )}

            {!showNewVendorConfirm ? (
              <button
                onClick={() => {
                  setShowNewVendorConfirm(true);
                  setNewVendorConfirmName(rawName);
                }}
                style={{ marginTop: 10, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none", border: "1px dashed #D6DCE5", borderRadius: 8, padding: "10px 12px", color: textMuted, fontSize: 13, cursor: "pointer" }}
              >
                <Plus size={14} /> None of these — new vendor
              </button>
            ) : (
              <div style={{ marginTop: 10, background: "#F1F4F8", borderRadius: 8, padding: 12 }}>
                <input
                  value={newVendorConfirmName}
                  onChange={(e) => setNewVendorConfirmName(e.target.value)}
                  style={{ width: "100%", background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "8px 10px", color: textPrimary, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
                />
                <input
                  placeholder="Phone (optional)"
                  value={vendorPhone}
                  onChange={(e) => setVendorPhone(e.target.value)}
                  style={{ width: "100%", background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "8px 10px", color: textPrimary, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
                />
                <button
                  onClick={confirmNewVendorFromInvoice}
                  disabled={!newVendorConfirmName.trim() || confirmingVendor}
                  style={{ width: "100%", background: newVendorConfirmName.trim() ? accent : "#D6DCE5", border: "none", borderRadius: 6, padding: "9px 12px", color: "#FFFFFF", fontWeight: 600, fontSize: 13, cursor: newVendorConfirmName.trim() ? "pointer" : "not-allowed" }}
                >
                  {confirmingVendor ? "Saving…" : "Create vendor"}
                </button>
              </div>
            )}
          </div>

          {candidates.length > 0 && (
            <button
              onClick={() => confirmVendorMatch(vendorSelection)}
              disabled={!vendorSelection || confirmingVendor}
              style={{
                width: "100%",
                marginTop: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                background: vendorSelection ? accent : "#E2E6ED",
                color: vendorSelection ? "#FFFFFF" : textMuted,
                border: "none",
                borderRadius: 10,
                padding: "13px",
                fontWeight: 600,
                fontSize: 14,
                cursor: vendorSelection ? "pointer" : "not-allowed",
              }}
            >
              <Check size={16} />
              Confirm vendor
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 16px 8px" }}>
        <button onClick={() => { setView("queue"); loadPendingList(); }} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", padding: 4 }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{invoice.suppliers?.name}</div>
          <div style={{ fontSize: 12, color: textMuted }}>{invoice.invoice_date}</div>
        </div>
      </div>

      <div style={{ padding: "8px 16px 0" }}>
        <button
          onClick={() => setShowInvoicePhoto((s) => !s)}
          disabled={!invoicePhotoUrl}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none", border: "1px dashed #D6DCE5", borderRadius: 8, padding: "10px", color: invoicePhotoUrl ? textMuted : "#CBD2DC", fontSize: 12, cursor: invoicePhotoUrl ? "pointer" : "not-allowed" }}
        >
          <Camera size={13} /> {showInvoicePhoto ? "Hide" : "View"} original invoice photo
        </button>
        {showInvoicePhoto && invoicePhotoUrl && (
          <img src={invoicePhotoUrl} alt="Invoice" style={{ width: "100%", borderRadius: 8, marginTop: 8, border: "1px solid #E2E6ED" }} />
        )}
      </div>

      <div style={{ padding: "12px 16px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: textMuted, fontFamily: mono }}>
          ITEM {cardIndex + 1} / {reviewItems.length}
        </span>
        <span style={{ fontSize: 12, color: textMuted }}>{lineItems.length - reviewItems.length} auto-matched</span>
      </div>

      {currentItem && (
        <div style={{ padding: "8px 16px" }}>
          <div style={{ background: card, border: "1px solid #E2E6ED", borderRadius: 10, padding: 18 }}>
            <div style={{ fontFamily: mono, fontSize: 15, marginBottom: 4 }}>"{currentItem.raw_description}"</div>
            {currentItem.shipment_note && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6, background: "#E7F0FA", border: "1px solid #BFDCF0", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontSize: 12, color: accent }}>
                <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                <span>{currentItem.shipment_note}</span>
              </div>
            )}
            {!editingQty ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ color: textMuted, fontSize: 13 }}>
                  {currentItem.quantity} {currentItem.unit} &middot; ${Number(currentItem.line_total || 0).toFixed(2)}
                </div>
                <button onClick={() => setEditingQty(true)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", padding: 2 }}>
                  <Pencil size={12} />
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
                <input
                  type="number"
                  defaultValue={currentItem.quantity}
                  onBlur={(e) => updateLineItemValue(currentItem.id, "quantity", e.target.value)}
                  style={{ width: 60, background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "6px 8px", color: textPrimary, fontSize: 13 }}
                />
                <span style={{ color: textMuted, fontSize: 13 }}>{currentItem.unit} @ $</span>
                <input
                  type="number"
                  step="0.01"
                  defaultValue={currentItem.unit_price}
                  onBlur={(e) => updateLineItemValue(currentItem.id, "unit_price", e.target.value)}
                  style={{ width: 70, background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "6px 8px", color: textPrimary, fontSize: 13 }}
                />
                <button onClick={() => setEditingQty(false)} style={{ background: accent, border: "none", borderRadius: 6, padding: "6px 10px", color: "#FFFFFF", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Done
                </button>
              </div>
            )}
            <TicketDivider />
            <div style={{ fontSize: 12, color: textMuted, textTransform: "uppercase", letterSpacing: 1, margin: "10px 0 8px" }}>
              Is this
            </div>

            {(currentItem.match_candidates || []).length === 0 ? (
              <div style={{ fontSize: 13, color: textMuted, marginBottom: 12 }}>No close match found — likely a new item.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {currentItem.match_candidates.map((c) => (
                  <label
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: currentItem.inventory_item_id === c.id ? "#E7F0FA" : "#F1F4F8",
                      border: currentItem.inventory_item_id === c.id ? `1px solid ${accent}` : "1px solid #E2E6ED",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      checked={currentItem.inventory_item_id === c.id}
                      onChange={() => selectCandidate(currentItem.id, c.id)}
                      style={{ accentColor: accent }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14 }}>{c.name}</div>
                      <div style={{ marginTop: 4 }}>
                        <ConfidenceBar score={c.score} />
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {!showNewForm ? (
              <button
                onClick={() => setShowNewForm(true)}
                style={{
                  marginTop: 10,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  background: "none",
                  border: "1px dashed #D6DCE5",
                  borderRadius: 8,
                  padding: "10px 12px",
                  color: textMuted,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <Plus size={14} /> Something else / new item
              </button>
            ) : (
              <div style={{ marginTop: 10, background: "#F1F4F8", borderRadius: 8, padding: 12 }}>
                <input
                  placeholder="Item name"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#F9FAFB",
                    border: "1px solid #D6DCE5",
                    borderRadius: 6,
                    padding: "8px 10px",
                    color: textPrimary,
                    fontSize: 13,
                    marginBottom: 8,
                    boxSizing: "border-box",
                  }}
                />
                <button
                  onClick={createNewItem}
                  disabled={!newItemName}
                  style={{
                    width: "100%",
                    background: newItemName ? accent : "#D6DCE5",
                    border: "none",
                    borderRadius: 6,
                    padding: "9px 12px",
                    color: "#FFFFFF",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: newItemName ? "pointer" : "not-allowed",
                  }}
                >
                  Create item
                </button>
              </div>
            )}
          </div>

          <button
            onClick={confirmAndAdvance}
            disabled={!currentItem.inventory_item_id}
            style={{
              width: "100%",
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: currentItem.inventory_item_id ? accent : "#E2E6ED",
              color: currentItem.inventory_item_id ? "#FFFFFF" : textMuted,
              border: "none",
              borderRadius: 10,
              padding: "13px",
              fontWeight: 600,
              fontSize: 14,
              cursor: currentItem.inventory_item_id ? "pointer" : "not-allowed",
            }}
          >
            <Check size={16} />
            Confirm
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
            <button
              onClick={() => { setCardIndex((c) => Math.max(0, c - 1)); setEditingQty(false); }}
              disabled={cardIndex === 0}
              style={{ background: "none", border: "none", color: textMuted, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 13 }}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              onClick={() => { setCardIndex((c) => Math.min(reviewItems.length - 1, c + 1)); setEditingQty(false); }}
              disabled={cardIndex === reviewItems.length - 1}
              style={{ background: "none", border: "none", color: textMuted, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 13 }}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: "18px 16px 8px" }}>
        <button
          onClick={postToInventory}
          disabled={!allResolved}
          style={{
            width: "100%",
            background: allResolved ? good : "#F1F4F8",
            color: allResolved ? "#FFFFFF" : textMuted,
            border: "none",
            borderRadius: 10,
            padding: "14px",
            fontWeight: 700,
            fontSize: 14,
            cursor: allResolved ? "pointer" : "not-allowed",
          }}
        >
          {allResolved ? "Post to Inventory" : `Resolve ${reviewItems.length - (reviewItems.filter(i => i.inventory_item_id).length)} more item(s)`}
        </button>
      </div>
    </div>
  );
}
