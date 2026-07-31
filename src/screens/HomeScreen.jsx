import { useEffect, useState } from "react";
import { Receipt, ClipboardList, Camera, AlertTriangle, CheckCircle2, LogOut } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { card, textPrimary, textMuted, accent, danger, good, sans } from "../lib/tokens";

export default function HomeScreen({ onNavigate }) {
  const { restaurantId: RESTAURANT_ID, restaurantName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [vendorConfirmCount, setVendorConfirmCount] = useState(0);
  const [belowParCount, setBelowParCount] = useState(0);

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

    const { data: items } = await supabase
      .from("inventory_items")
      .select("current_stock, par_level, last_reorder_sent_at")
      .eq("restaurant_id", RESTAURANT_ID)
      .not("par_level", "is", null);

    setBelowParCount(
      (items || []).filter((i) => i.current_stock <= i.par_level && !i.last_reorder_sent_at).length
    );

    setLoading(false);
  }

  const allClear = pendingCount === 0 && belowParCount === 0;

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
