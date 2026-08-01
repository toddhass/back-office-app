import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChefHat } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { card, textPrimary, textMuted, accent, danger, good, mono, sans } from "../lib/tokens";

export default function KitchenScreen() {
  const { restaurantId: RESTAURANT_ID, session } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState(null);
  const [qtyInputs, setQtyInputs] = useState({});
  const [confirmedMsg, setConfirmedMsg] = useState(null);

  useEffect(() => {
    load();
  }, [RESTAURANT_ID]);

  useEffect(() => {
    if (!RESTAURANT_ID) return;
    const channel = supabase
      .channel(`kitchen-${RESTAURANT_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items", filter: `restaurant_id=eq.${RESTAURANT_ID}` }, () => load())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [RESTAURANT_ID]);

  async function load() {
    if (!RESTAURANT_ID) return;
    setLoading(true);
    const { data } = await supabase.rpc("at_risk_items", { p_restaurant_id: RESTAURANT_ID });
    setItems(data || []);
    const defaults = {};
    (data || []).forEach((i) => { defaults[i.inventory_item_id] = i.current_stock; });
    setQtyInputs((prev) => ({ ...defaults, ...prev }));
    setLoading(false);
  }

  async function markUsed(item) {
    setMarkingId(item.inventory_item_id);
    const qty = Number(qtyInputs[item.inventory_item_id]) || item.current_stock;
    const { data: result } = await supabase.rpc("mark_item_used_before_waste", {
      p_inventory_item_id: item.inventory_item_id,
      p_quantity: qty,
      p_marked_by_email: session?.user?.email || null,
    });
    if (result?.logged) {
      setConfirmedMsg(`Marked ${result.quantity} ${result.unit} of ${result.item_name} used${result.estimated_value ? ` — ~$${result.estimated_value} saved from waste` : ""}.`);
      setTimeout(() => setConfirmedMsg(null), 5000);
    }
    setMarkingId(null);
    load();
  }

  return (
    <div style={{ fontFamily: sans }}>
      <div style={{ padding: "24px 20px 8px" }}>
        <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: textMuted, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
          <ChefHat size={13} /> Kitchen
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>
          {loading ? "Loading…" : items.length === 0 ? "Nothing at risk" : "Use these soon"}
        </h1>
        <div style={{ color: textMuted, fontSize: 13, marginTop: 6 }}>
          Estimated from each item's shelf life and last delivery date — approximate, not exact.
        </div>
      </div>

      <div style={{ padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {confirmedMsg && (
          <div style={{ background: "#E6F4EC", border: "1px solid #BFE3D0", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: good, animation: "bannerSlideIn 0.25s ease-out" }}>
            {confirmedMsg}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div style={{ background: card, border: "1px solid #BFE3D0", borderRadius: 10, padding: "20px 18px", display: "flex", alignItems: "center", gap: 10 }}>
            <CheckCircle2 size={20} color={good} />
            <div style={{ fontSize: 14, color: textPrimary }}>Nothing is close to its shelf life right now.</div>
          </div>
        )}

        {items.map((item) => {
          const overdue = item.days_until_expiration < 0;
          return (
            <div key={item.inventory_item_id} style={{ background: card, border: `1px solid ${overdue ? "#F3B8B8" : "#E2E6ED"}`, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: textPrimary }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>
                    {item.current_stock} {item.unit} on hand
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, color: overdue ? danger : accent, fontSize: 12, fontWeight: 700 }}>
                  <AlertTriangle size={13} />
                  {overdue ? `${Math.abs(item.days_until_expiration)}d overdue` : item.days_until_expiration === 0 ? "Today" : `${item.days_until_expiration}d left`}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="number"
                  value={qtyInputs[item.inventory_item_id] ?? item.current_stock}
                  onChange={(e) => setQtyInputs((prev) => ({ ...prev, [item.inventory_item_id]: e.target.value }))}
                  style={{ width: 64, background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "8px 10px", color: textPrimary, fontSize: 13, fontFamily: mono }}
                />
                <span style={{ fontSize: 12, color: textMuted }}>{item.unit}</span>
                <button
                  onClick={() => markUsed(item)}
                  disabled={markingId === item.inventory_item_id}
                  style={{ flex: 1, background: good, border: "none", borderRadius: 8, padding: "10px", color: "#FFFFFF", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  {markingId === item.inventory_item_id ? "Saving…" : "Mark used"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
