import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Camera, AlertTriangle, Plus, ArrowLeft } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { bg, card, textPrimary, textMuted, accent, danger, good, mono } from "../lib/tokens";

function ConfidenceBar({ score }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.85 ? good : score >= 0.5 ? accent : danger;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "#3A3733", borderRadius: 2, overflow: "hidden" }}>
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
        <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "#3A3733" }} />
      ))}
    </div>
  );
}

export default function InvoicesScreen() {
  const { restaurantId: RESTAURANT_ID } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [view, setView] = useState("queue");
  const [cardIndex, setCardIndex] = useState(0);
  const [newItemName, setNewItemName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  async function loadPendingInvoice() {
    if (!RESTAURANT_ID) return;
    setLoading(true);
    // Grab the oldest pending-review invoice for this restaurant
    const { data: invoices, error: invErr } = await supabase
      .from("invoices")
      .select("*, suppliers(name)")
      .eq("restaurant_id", RESTAURANT_ID)
      .eq("status", "pending_review")
      .order("created_at", { ascending: true })
      .limit(1);

    if (invErr || !invoices?.length) {
      setInvoice(null);
      setLineItems([]);
      setLoading(false);
      return;
    }

    const inv = invoices[0];
    setInvoice(inv);

    const { data: items, error: liErr } = await supabase
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", inv.id)
      .order("created_at", { ascending: true });

    setLineItems(liErr ? [] : items);
    setLoading(false);
  }

  useEffect(() => {
    loadPendingInvoice();
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

      await supabase.from("inventory_items").update({ current_stock: newStock }).eq("id", item.inventory_item_id);
      await supabase.from("stock_transactions").insert({
        inventory_item_id: item.inventory_item_id,
        change: item.quantity,
        source: "invoice",
        reference_id: invoice.id,
      });
    }
    await supabase.from("invoices").update({ status: "confirmed" }).eq("id", invoice.id);
    setView("queue");
    loadPendingInvoice();
  }

  if (loading) {
    return <div style={{ padding: 24, color: textMuted }}>Loading…</div>;
  }

  if (!invoice) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center", color: textMuted }}>
        No invoices waiting for review. Upload one from the Capture tab.
      </div>
    );
  }

  if (view === "queue") {
    return (
      <div>
        <div style={{ padding: "24px 20px 8px" }}>
          <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: textMuted, marginBottom: 4 }}>
            Invoice Queue
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>Needs review</h1>
        </div>
        <div style={{ padding: "8px 16px" }}>
          <button
            onClick={() => setView("detail")}
            style={{
              width: "100%",
              textAlign: "left",
              background: card,
              border: "1px solid #35322D",
              borderRadius: 10,
              padding: "16px 18px",
              color: textPrimary,
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{invoice.suppliers?.name || "Unknown supplier"}</div>
                <div style={{ color: textMuted, fontSize: 13, marginTop: 2 }}>{invoice.invoice_date}</div>
              </div>
              <div style={{ fontFamily: mono, fontSize: 15, color: accent }}>
                ${Number(invoice.invoice_total || 0).toFixed(2)}
              </div>
            </div>
            <TicketDivider />
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#3A2E1C",
                color: accent,
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: 20,
              }}
            >
              <AlertTriangle size={12} />
              {reviewItems.length} items need review
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 16px 8px" }}>
        <button onClick={() => setView("queue")} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", padding: 4 }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{invoice.suppliers?.name}</div>
          <div style={{ fontSize: 12, color: textMuted }}>{invoice.invoice_date}</div>
        </div>
      </div>

      <div style={{ padding: "12px 16px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: textMuted, fontFamily: mono }}>
          ITEM {cardIndex + 1} / {reviewItems.length}
        </span>
        <span style={{ fontSize: 12, color: textMuted }}>{lineItems.length - reviewItems.length} auto-matched</span>
      </div>

      {currentItem && (
        <div style={{ padding: "8px 16px" }}>
          <div style={{ background: card, border: "1px solid #35322D", borderRadius: 10, padding: 18 }}>
            <div style={{ fontFamily: mono, fontSize: 15, marginBottom: 4 }}>"{currentItem.raw_description}"</div>
            <div style={{ color: textMuted, fontSize: 13, marginBottom: 14 }}>
              {currentItem.quantity} {currentItem.unit} &middot; ${Number(currentItem.line_total || 0).toFixed(2)}
            </div>
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
                      background: currentItem.inventory_item_id === c.id ? "#332B1C" : "#2C2A26",
                      border: currentItem.inventory_item_id === c.id ? `1px solid ${accent}` : "1px solid #35322D",
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
                  border: "1px dashed #45413A",
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
              <div style={{ marginTop: 10, background: "#2C2A26", borderRadius: 8, padding: 12 }}>
                <input
                  placeholder="Item name"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#1C1B1A",
                    border: "1px solid #45413A",
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
                    background: newItemName ? accent : "#45413A",
                    border: "none",
                    borderRadius: 6,
                    padding: "9px 12px",
                    color: "#1C1B1A",
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
              background: currentItem.inventory_item_id ? accent : "#35322D",
              color: currentItem.inventory_item_id ? "#1C1B1A" : textMuted,
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
              onClick={() => setCardIndex((c) => Math.max(0, c - 1))}
              disabled={cardIndex === 0}
              style={{ background: "none", border: "none", color: textMuted, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 13 }}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              onClick={() => setCardIndex((c) => Math.min(reviewItems.length - 1, c + 1))}
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
            background: allResolved ? good : "#2C2A26",
            color: allResolved ? "#1C1B1A" : textMuted,
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
