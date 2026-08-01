import { useEffect, useState } from "react";
import { AlertTriangle, Copy, Check, ChevronDown, ChevronUp, Send, Pencil, MessageCircle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { card, textPrimary, textMuted, accent, danger, good, mono } from "../lib/tokens";

function suggestQty(item) {
  return Math.ceil(item.par_level - item.current_stock);
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

  useEffect(() => {
    load();
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

      // Below par AND not already flagged as sent since it last dipped below par.
      // A restock (handled in InvoicesScreen's postToInventory) clears
      // last_reorder_sent_at, so this re-surfaces the item if it dips again.
      const belowPar = (items || []).filter(
        (i) => i.current_stock <= i.par_level && !i.last_reorder_sent_at
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
    setGroups((prev) =>
      prev.map((g) => ({ ...g, items: g.items.map((i) => (i.id === itemId ? { ...i, par_level: numValue } : i)) }))
    );
    setEditingParId(null);
  }
  async function markSent(group) {
    const itemIds = group.items.map((i) => i.id);
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
          .select("id")
          .single();

        if (po) {
          const poItems = group.items.map((item) => ({
            purchase_order_id: po.id,
            inventory_item_id: item.id,
            quantity_ordered: suggestQty(item),
          }));
          await supabase.from("purchase_order_items").insert(poItems);
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
