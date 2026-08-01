import { useEffect, useState } from "react";
import { Receipt, ClipboardList, Camera, AlertTriangle, CheckCircle2, LogOut, TrendingDown, Activity } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { card, textPrimary, textMuted, accent, danger, good, sans, mono } from "../lib/tokens";

export default function HomeScreen({ onNavigate }) {
  const { restaurantId: RESTAURANT_ID, restaurantName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [vendorConfirmCount, setVendorConfirmCount] = useState(0);
  const [belowParCount, setBelowParCount] = useState(0);
  const [stockoutRisks, setStockoutRisks] = useState([]);
  const [health, setHealth] = useState({ total: 0, healthy: 0, belowPar: 0, noPar: 0 });

  useEffect(() => {
    load();
  }, [RESTAURANT_ID]);

  async function load() {
    if (!RESTAURANT_ID) return;
    setLoading(true);

    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, supplier_id")
      .eq("restaurant_id", RESTAURANT_ID)
      .eq("status", "pending_review");

    setPendingCount((invoices || []).length);
    setVendorConfirmCount((invoices || []).filter((i) => !i.supplier_id).length);

    // Fetch every item (not just ones with a par level) so the health
    // summary can also surface items that aren't being monitored at all.
    const { data: allItems } = await supabase
      .from("inventory_items")
      .select("id, current_stock, par_level")
      .eq("restaurant_id", RESTAURANT_ID);

    const items = allItems || [];
    const noPar = items.filter((i) => i.par_level == null).length;
    const tracked = items.filter((i) => i.par_level != null);
    const belowParRaw = tracked.filter((i) => i.current_stock <= i.par_level).length;
    const healthy = tracked.length - belowParRaw;
    setHealth({ total: items.length, healthy, belowPar: belowParRaw, noPar });

    // Actionable alert count excludes items already covered by an open
    // purchase order - matches the same guard logic as the Reorder digest,
    // so this number only reflects items that actually need a NEW order.
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

    setBelowParCount(
      tracked.filter((i) => i.current_stock <= i.par_level && !openItemIds.has(i.id)).length
    );

    const { data: risks } = await supabase.rpc("stockout_risk_items", { p_restaurant_id: RESTAURANT_ID });
    setStockoutRisks(risks || []);

    setLoading(false);
  }

  const allClear = pendingCount === 0 && belowParCount === 0 && stockoutRisks.length === 0;
  const healthyPct = health.total - health.noPar > 0 ? Math.round((health.healthy / (health.total - health.noPar)) * 100) : null;

  return (
    <div style={{ fontFamily: sans }}>
      <div style={{ padding: "24px 20px 8px" }}>
        <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: textMuted, marginBottom: 4 }}>
          {restaurantName}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>
          {loading ? "Loading…" : allClear ? "All clear" : "Needs attention"}
        </h1>
      </div>

      <div style={{ padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {!loading && allClear && (
          <div style={{ background: card, border: "1px solid #BFE3D0", borderRadius: 10, padding: "20px 18px", display: "flex", alignItems: "center", gap: 10 }}>
            <CheckCircle2 size={20} color={good} />
            <div style={{ fontSize: 14, color: textPrimary }}>Nothing waiting on you right now.</div>
          </div>
        )}

        {!loading && stockoutRisks.length > 0 && (
          <div
            onClick={() => onNavigate("digest")}
            style={{ width: "100%", textAlign: "left", background: "#FDECEC", border: "1px solid #F3B8B8", borderRadius: 10, padding: "16px 18px", color: textPrimary, cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <TrendingDown size={18} color={danger} />
              <div style={{ fontWeight: 700, fontSize: 15, color: danger }}>
                {stockoutRisks.length} item{stockoutRisks.length > 1 ? "s" : ""} may run out before the shipment arrives
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {stockoutRisks.slice(0, 3).map((r) => (
                <div key={r.inventory_item_id} style={{ fontSize: 12, color: textMuted, fontFamily: mono }}>
                  {r.item_name} — projected out {r.projected_stockout_date}, shipment expected {r.expected_delivery_date} ({r.days_short}d short)
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && pendingCount > 0 && (
          <button
            onClick={() => onNavigate("invoices")}
            style={{ width: "100%", textAlign: "left", background: card, border: "1px solid #E2E6ED", borderRadius: 10, padding: "16px 18px", color: textPrimary, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Receipt size={18} color={accent} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{pendingCount} invoice{pendingCount > 1 ? "s" : ""} to review</div>
                {vendorConfirmCount > 0 && (
                  <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>
                    {vendorConfirmCount} need{vendorConfirmCount === 1 ? "s" : ""} vendor confirmation
                  </div>
                )}
              </div>
            </div>
            <AlertTriangle size={14} color={accent} />
          </button>
        )}

        {!loading && belowParCount > 0 && (
          <button
            onClick={() => onNavigate("digest")}
            style={{ width: "100%", textAlign: "left", background: card, border: "1px solid #E2E6ED", borderRadius: 10, padding: "16px 18px", color: textPrimary, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ClipboardList size={18} color={accent} />
              <div style={{ fontWeight: 600, fontSize: 15 }}>{belowParCount} item{belowParCount > 1 ? "s" : ""} below par</div>
            </div>
            <AlertTriangle size={14} color={accent} />
          </button>
        )}

        {!loading && health.total > 0 && (
          <div style={{ background: card, border: "1px solid #E2E6ED", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Activity size={16} color={textMuted} />
                <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>Inventory health</span>
              </div>
              {healthyPct != null && (
                <span style={{ fontSize: 13, fontFamily: mono, color: healthyPct >= 70 ? good : healthyPct >= 40 ? accent : danger }}>
                  {healthyPct}% healthy
                </span>
              )}
            </div>

            {/* Segmented bar: healthy / below par / untracked */}
            <div style={{ display: "flex", width: "100%", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
              {health.healthy > 0 && <div style={{ flex: health.healthy, background: good }} />}
              {health.belowPar > 0 && <div style={{ flex: health.belowPar, background: danger }} />}
              {health.noPar > 0 && <div style={{ flex: health.noPar, background: "#D6DCE5" }} />}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: textMuted }}>
              <span><span style={{ color: good, fontFamily: mono }}>{health.healthy}</span> healthy</span>
              <span><span style={{ color: danger, fontFamily: mono }}>{health.belowPar}</span> below par</span>
              {health.noPar > 0 && (
                <span><span style={{ color: textMuted, fontFamily: mono }}>{health.noPar}</span> not tracked (no par level set)</span>
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => onNavigate("capture")}
          style={{ width: "100%", textAlign: "left", background: "none", border: "1px dashed #E2E6ED", borderRadius: 10, padding: "16px 18px", color: textMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}
        >
          <Camera size={18} />
          <div style={{ fontSize: 14 }}>Upload a new invoice</div>
        </button>

        <button
          onClick={() => supabase.auth.signOut()}
          style={{ width: "100%", textAlign: "center", background: "none", border: "none", padding: "16px 18px", color: textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, fontSize: 13 }}
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </div>
  );
}
