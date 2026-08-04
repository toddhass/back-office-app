import { useEffect, useState } from "react";
import { AlertTriangle, Copy, Check, ChevronDown, ChevronUp, Send, Pencil, MessageCircle, FileCheck } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { card, textPrimary, textMuted, accent, danger, good, mono } from "../lib/tokens";

function suggestQty(item) {
  // Floor of 1: an item exactly AT par still counts as "below par" (<=)
  // throughout the app, but ordering 0 units is useless. Same fix already
  // applied to the SQL-side auto-PO functions - this was the one place it
  // got missed, and it produced two real 0-quantity POs before being caught.
  return Math.max(1, Math.ceil(item.par_level - item.current_stock));
}
function draftMessage(supplierName, items) {
  const lines = items.map((i) => `${suggestQty(i)} ${i.unit}${suggestQty(i) > 1 ? "s" : ""} ${i.name.split(",")[0]}`);
  return `Hi ${supplierName.split(" ")[0]} team — could we get:\n${lines.map((l) => `• ${l}`).join("\n")}\nThanks!`;
}

export default function DigestScreen() {
  const { restaurantId: RESTAURANT_ID } = useAuth();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]); // [{ supplier, items }]
  const [expanded, setExpanded] = useState({});
  const [drafts, setDrafts] = useState({});
  const [copied, setCopied] = useState(null);
  const [sent, setSent] = useState({});
  const [expectedDates, setExpectedDates] = useState({});
  const [editingParId, setEditingParId] = useState(null);
  const [sentError, setSentError] = useState({});
  const [autoPOModal, setAutoPOModal] = useState(null);
  const [vendorPickerList, setVendorPickerList] = useState([]);
  const [vendorPickerLoading, setVendorPickerLoading] = useState(false);
  const [confirmedPOs, setConfirmedPOs] = useState({});

  useEffect(() => {
    load();
  }, [RESTAURANT_ID]);

  // Live sync - see HomeScreen.jsx for the full rationale. Same pattern here
  // since this screen shows the same underlying below-par/PO state.
  useEffect(() => {
    if (!RESTAURANT_ID) return;
    const channel = supabase
      .channel(`digest-${RESTAURANT_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items", filter: `restaurant_id=eq.${RESTAURANT_ID}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders", filter: `restaurant_id=eq.${RESTAURANT_ID}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_order_items" }, () => load())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [RESTAURANT_ID]);

  async function load() {
      if (!RESTAURANT_ID) return;
      setLoading(true);
      // Items below par. Note: inventory_items isn't linked to a supplier directly in
      // the current schema — this groups by the item's most recent supplier via
      // invoice_line_items -> invoices -> suppliers. If an item has no invoice history,
      // it's grouped under "Unassigned".
      const { data: items } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("restaurant_id", RESTAURANT_ID)
        .not("par_level", "is", null);

      // Items already covered by an OPEN purchase order (sent/partial, not yet
      // fully received) are excluded here regardless of last_reorder_sent_at.
      // This is the authoritative guard: last_reorder_sent_at gets cleared on
      // ANY restock (even a partial one that doesn't fully close the order),
      // so relying on it alone would let a manager re-order something that's
      // still outstanding - real risk of double-ordering.
      const { data: openPOs } = await supabase
        .from("purchase_orders")
        .select("id")
        .eq("restaurant_id", RESTAURANT_ID)
        .in("status", ["sent", "partial"]);

      let openItemIds = new Set();
      if (openPOs && openPOs.length > 0) {
        const { data: openPOItems } = await supabase
          .from("purchase_order_items")
          .select("inventory_item_id, quantity_ordered, quantity_received")
          .in("purchase_order_id", openPOs.map((p) => p.id));
        openItemIds = new Set(
          (openPOItems || [])
            .filter((i) => Number(i.quantity_received) < Number(i.quantity_ordered))
            .map((i) => i.inventory_item_id)
        );
      }

      const belowPar = (items || []).filter(
        (i) => i.current_stock <= i.par_level && !openItemIds.has(i.id)
      );

      const grouped = {};
      for (const item of belowPar) {
        const { data: lastLine } = await supabase
          .from("invoice_line_items")
          .select("invoice_id, invoices(supplier_id, suppliers(name, phone))")
          .eq("inventory_item_id", item.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const supplierName = lastLine?.invoices?.suppliers?.name || "Unassigned";
        const supplierPhone = lastLine?.invoices?.suppliers?.phone || null;
        const supplierId = lastLine?.invoices?.supplier_id || null;
        if (!grouped[supplierName]) grouped[supplierName] = { items: [], phone: supplierPhone, supplierId };
        grouped[supplierName].items.push(item);
      }

      const groupList = Object.entries(grouped).map(([supplier, g]) => ({ supplier, items: g.items, phone: g.phone, supplierId: g.supplierId }));
      setGroups(groupList);
      setExpanded(Object.fromEntries(groupList.map((g) => [g.supplier, true])));
      setDrafts(Object.fromEntries(groupList.map((g) => [g.supplier, draftMessage(g.supplier, g.items)])));
      const defaultDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      setExpectedDates(Object.fromEntries(groupList.map((g) => [g.supplier, defaultDate])));
      setLoading(false);
  }

  function toggleGroup(supplier) {
    setExpanded((e) => ({ ...e, [supplier]: !e[supplier] }));
  }
  function copyDraft(supplier) {
    navigator.clipboard?.writeText(drafts[supplier]);
    setCopied(supplier);
    setTimeout(() => setCopied(null), 1500);
  }
  async function updateParLevel(itemId, value) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    await supabase.from("inventory_items").update({ par_level: numValue }).eq("id", itemId);
    setEditingParId(null);

    const { data: poResult } = await supabase.rpc("auto_create_po_if_needed", { p_inventory_item_id: itemId });

    if (poResult?.created) {
      setAutoPOModal({ tone: "success", text: `${poResult.po_number} created — ordered ${poResult.quantity} ${poResult.unit} of ${poResult.item_name} from ${poResult.supplier_name}.` });
      load(); // refresh - the item may now be covered by an open PO
    } else if (poResult?.reason === "already_open") {
      setAutoPOModal({ tone: "info", text: "Par updated. This item already has an open order, so no new PO was created." });
      setGroups((prev) => prev.map((g) => ({ ...g, items: g.items.map((i) => (i.id === itemId ? { ...i, par_level: numValue } : i)) })));
    } else if (poResult?.reason === "no_known_supplier") {
      setVendorPickerLoading(true);
      setAutoPOModal({ tone: "pick-vendor", itemId, text: "No supplier on file for this item yet — who should this order go to?" });
      const { data: suppliers } = await supabase.from("suppliers").select("id, name").eq("restaurant_id", RESTAURANT_ID).order("name");
      setVendorPickerList(suppliers || []);
      setVendorPickerLoading(false);
      setGroups((prev) => prev.map((g) => ({ ...g, items: g.items.map((i) => (i.id === itemId ? { ...i, par_level: numValue } : i)) })));
    } else {
      setGroups((prev) => prev.map((g) => ({ ...g, items: g.items.map((i) => (i.id === itemId ? { ...i, par_level: numValue } : i)) })));
    }
  }

  async function assignSupplierAndCreatePO(supplierId) {
    if (!autoPOModal?.itemId) return;
    setVendorPickerLoading(true);
    const { data: result } = await supabase.rpc("create_po_for_item_with_supplier", {
      p_inventory_item_id: autoPOModal.itemId,
      p_supplier_id: supplierId,
    });
    if (result?.created) {
      setAutoPOModal({ tone: "success", text: `${result.po_number} created — ordered ${result.quantity} ${result.unit} of ${result.item_name} from ${result.supplier_name}.` });
      load();
    } else {
      setAutoPOModal({ tone: "info", text: "Couldn't create the order — try again from the Reorder screen." });
    }
    setVendorPickerLoading(false);
  }
  async function markSent(group) {
    // Re-verify against open purchase orders right before creating a new one -
    // defense in depth in case this group's data went stale between the last
    // load() and this tap (e.g. another device/tab already sent an order for
    // one of these items in the meantime).
    let itemsToOrder = group.items;
    if (group.supplierId) {
      const { data: existingOpenPOs } = await supabase
        .from("purchase_orders")
        .select("id")
        .eq("supplier_id", group.supplierId)
        .in("status", ["sent", "partial"]);

      if (existingOpenPOs && existingOpenPOs.length > 0) {
        const { data: existingOpenItems } = await supabase
          .from("purchase_order_items")
          .select("inventory_item_id, quantity_ordered, quantity_received")
          .in("purchase_order_id", existingOpenPOs.map((p) => p.id));

        const alreadyOpenIds = new Set(
          (existingOpenItems || [])
            .filter((i) => Number(i.quantity_received) < Number(i.quantity_ordered))
            .map((i) => i.inventory_item_id)
        );

        itemsToOrder = group.items.filter((item) => !alreadyOpenIds.has(item.id));
      }
    }

    if (itemsToOrder.length === 0) {
      setSentError((e) => ({ ...e, [group.supplier]: "These items already have an open order with this supplier." }));
      return;
    }

    const itemIds = itemsToOrder.map((i) => i.id);
    const { error } = await supabase
      .from("inventory_items")
      .update({ last_reorder_sent_at: new Date().toISOString() })
      .in("id", itemIds);

    if (!error) {
      // Record what we actually asked for, so a later invoice from this
      // supplier can be checked for a short/partial shipment.
      if (group.supplierId) {
        const { data: po } = await supabase
          .from("purchase_orders")
          .insert({
            restaurant_id: RESTAURANT_ID,
            supplier_id: group.supplierId,
            status: "sent",
            expected_delivery_date: expectedDates[group.supplier] || null,
          })
          .select("id, po_number, expected_delivery_date")
          .single();

        if (po) {
          const poItems = itemsToOrder.map((item) => ({
            purchase_order_id: po.id,
            inventory_item_id: item.id,
            quantity_ordered: suggestQty(item),
          }));
          await supabase.from("purchase_order_items").insert(poItems);

          setConfirmedPOs((c) => ({
            ...c,
            [group.supplier]: {
              po_number: po.po_number,
              expected_delivery_date: po.expected_delivery_date,
              supplier: group.supplier,
              items: itemsToOrder.map((item) => ({ name: item.name, qty: suggestQty(item), unit: item.unit })),
            },
          }));
        }
      }

      setSent((s) => ({ ...s, [group.supplier]: true }));
      // Remove this group from the list after a brief pause so the
      // "Sent" state is visible before it disappears on next reload.
      setGroups((prev) => prev.map((g) => (g.supplier === group.supplier ? { ...g, justSent: true } : g)));
    }
  }

  if (loading) return <div style={{ padding: 24, color: textMuted }}>Loading…</div>;

  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);
  const sentCount = Object.values(sent).filter(Boolean).length;

  return (
    <div>
      {autoPOModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "backdropFadeIn 0.15s ease-out" }}>
          <div style={{ background: "#FFFFFF", borderRadius: 12, padding: 20, width: "100%", maxWidth: 360, animation: "modalPopIn 0.25s ease-out" }}>
            {autoPOModal.tone === "success" && <FileCheck size={22} color={accent} style={{ marginBottom: 8 }} />}
            <div style={{ fontSize: 14, color: textPrimary, lineHeight: 1.5, marginBottom: autoPOModal.tone === "pick-vendor" ? 14 : 16 }}>
              {autoPOModal.text}
            </div>

            {autoPOModal.tone === "pick-vendor" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14, maxHeight: 220, overflowY: "auto" }}>
                {vendorPickerLoading && <div style={{ fontSize: 13, color: textMuted, textAlign: "center", padding: 8 }}>Loading…</div>}
                {!vendorPickerLoading && vendorPickerList.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => assignSupplierAndCreatePO(s.id)}
                    style={{ width: "100%", textAlign: "left", background: "#F1F4F8", border: "1px solid #E2E6ED", borderRadius: 8, padding: "10px 12px", color: textPrimary, fontSize: 13, cursor: "pointer" }}
                  >
                    {s.name}
                  </button>
                ))}
                {!vendorPickerLoading && vendorPickerList.length === 0 && (
                  <div style={{ fontSize: 12, color: textMuted, textAlign: "center", padding: 8 }}>No vendors on file yet — add one in Invoices → History.</div>
                )}
              </div>
            )}

            <button
              onClick={() => setAutoPOModal(null)}
              style={{ width: "100%", background: autoPOModal.tone === "pick-vendor" ? "none" : accent, border: autoPOModal.tone === "pick-vendor" ? "1px solid #E2E6ED" : "none", borderRadius: 8, padding: "11px", color: autoPOModal.tone === "pick-vendor" ? textMuted : "#FFFFFF", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              {autoPOModal.tone === "pick-vendor" ? "None of these — skip for now" : "OK"}
            </button>
          </div>
        </div>
      )}
      <div style={{ padding: "24px 20px 8px" }}>
        <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: textMuted, marginBottom: 4 }}>
          Daily Digest
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Below par</h1>
        <div style={{ color: textMuted, fontSize: 13, marginTop: 6 }}>
          {totalItems} items across {groups.length} suppliers
          {sentCount > 0 && <span style={{ color: accent }}> &middot; {sentCount} sent</span>}
        </div>
      </div>

      {totalItems === 0 && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: textMuted }}>
          Nothing below par right now.
        </div>
      )}

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {groups.map((group) => {
          const isSent = sent[group.supplier];
          return (
            <div key={group.supplier} style={{ background: card, border: `1px solid ${isSent ? "#BFE3D0" : "#E2E6ED"}`, borderRadius: 10, overflow: "hidden" }}>
              <button
                onClick={() => toggleGroup(group.supplier)}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 16px",
                  background: "none",
                  border: "none",
                  color: textPrimary,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{group.supplier}</div>
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>
                    {group.items.length} item{group.items.length > 1 ? "s" : ""} below par
                  </div>
                </div>
                {expanded[group.supplier] ? <ChevronUp size={16} color={textMuted} /> : <ChevronDown size={16} color={textMuted} />}
              </button>

              {expanded[group.supplier] && (
                <div style={{ padding: "0 16px 16px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    {group.items.map((item) => (
                      <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#F1F4F8", borderRadius: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <AlertTriangle size={13} color={item.current_stock === 0 ? danger : accent} />
                          <div>
                            <div style={{ fontSize: 13 }}>{item.name}</div>
                            {editingParId === item.id ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                                <span style={{ fontSize: 11, color: textMuted, fontFamily: mono }}>{item.current_stock} / </span>
                                <input
                                  type="number"
                                  defaultValue={item.par_level}
                                  autoFocus
                                  onBlur={(e) => updateParLevel(item.id, e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && updateParLevel(item.id, e.target.value)}
                                  style={{ width: 40, background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 4, padding: "2px 4px", color: textPrimary, fontSize: 11, fontFamily: mono }}
                                />
                                <span style={{ fontSize: 11, color: textMuted }}>{item.unit}</span>
                              </div>
                            ) : (
                              <div style={{ fontSize: 11, color: textMuted, fontFamily: mono, display: "flex", alignItems: "center", gap: 4 }}>
                                {item.current_stock} / {item.par_level} {item.unit}
                                <button onClick={() => setEditingParId(item.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", padding: 1 }}>
                                  <Pencil size={10} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 13, color: accent, fontWeight: 600 }}>+{suggestQty(item)}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: 11, color: textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Draft message</div>
                  <textarea
                    value={drafts[group.supplier]}
                    onChange={(e) => setDrafts((d) => ({ ...d, [group.supplier]: e.target.value }))}
                    rows={group.items.length + 2}
                    style={{
                      width: "100%",
                      background: "#F9FAFB",
                      border: "1px solid #E2E6ED",
                      borderRadius: 8,
                      padding: "10px 12px",
                      color: textPrimary,
                      fontSize: 13,
                      fontFamily: mono,
                      resize: "vertical",
                      boxSizing: "border-box",
                      lineHeight: 1.5,
                    }}
                  />

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                    <span style={{ fontSize: 12, color: textMuted }}>Expected delivery</span>
                    <input
                      type="date"
                      value={expectedDates[group.supplier] || ""}
                      onChange={(e) => setExpectedDates((d) => ({ ...d, [group.supplier]: e.target.value }))}
                      style={{ background: "#F9FAFB", border: "1px solid #E2E6ED", borderRadius: 6, padding: "6px 8px", color: textPrimary, fontSize: 12, fontFamily: mono }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      onClick={() => copyDraft(group.supplier)}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none", border: "1px solid #D6DCE5", borderRadius: 8, padding: "10px", color: textMuted, fontSize: 13, cursor: "pointer" }}
                    >
                      {copied === group.supplier ? <Check size={14} /> : <Copy size={14} />}
                      {copied === group.supplier ? "Copied" : "Copy"}
                    </button>
                    {group.phone && (
                      <a
                        href={`sms:${group.phone}&body=${encodeURIComponent(drafts[group.supplier] || "")}`}
                        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none", border: `1px solid ${accent}`, borderRadius: 8, padding: "10px", color: accent, fontSize: 13, textDecoration: "none" }}
                      >
                        <MessageCircle size={14} />
                        Text
                      </a>
                    )}
                    <button
                      onClick={() => markSent(group)}
                      disabled={isSent}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        background: isSent ? "#BFE3D0" : accent,
                        border: "none",
                        borderRadius: 8,
                        padding: "10px",
                        color: isSent ? good : "#FFFFFF",
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: isSent ? "default" : "pointer",
                      }}
                    >
                      {isSent ? <Check size={14} /> : <Send size={14} />}
                      {isSent ? "Sent" : "Mark sent"}
                    </button>
                  </div>
                  {sentError[group.supplier] && (
                    <div style={{ fontSize: 12, color: danger, marginTop: 8 }}>{sentError[group.supplier]}</div>
                  )}
                  {confirmedPOs[group.supplier] && (
                    <div style={{ marginTop: 10, background: "#E7F0FA", border: `1px solid ${accent}`, borderRadius: 8, padding: 12, animation: "bannerSlideIn 0.25s ease-out" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <FileCheck size={14} color={accent} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: accent, fontFamily: mono }}>
                          {confirmedPOs[group.supplier].po_number} created
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
                        {confirmedPOs[group.supplier].items.map((item, idx) => (
                          <div key={idx} style={{ fontSize: 12, color: textPrimary, display: "flex", justifyContent: "space-between" }}>
                            <span>{item.name}</span>
                            <span style={{ fontFamily: mono, color: textMuted }}>+{item.qty} {item.unit}</span>
                          </div>
                        ))}
                      </div>
                      {confirmedPOs[group.supplier].expected_delivery_date && (
                        <div style={{ fontSize: 11, color: textMuted }}>
                          Expected {confirmedPOs[group.supplier].expected_delivery_date}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
