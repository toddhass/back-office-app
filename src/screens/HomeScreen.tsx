import { useEffect, useState } from "react";
import { Receipt, ClipboardList, Camera, AlertTriangle, CheckCircle2, LogOut, TrendingDown, Activity, ChevronDown, ChevronUp, Pencil, Clock, Package, Leaf, ChefHat, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { card, textPrimary, textMuted, accent, danger, good, sans, mono } from "../lib/tokens";
import type { Database } from "../lib/database.types";
import type { AutoCreatePOResult, CreatePOWithSupplierResult } from "../lib/rpc-types";
import AskAgentModal from "./AskAgentModal";

interface AutoPOModalState {
  tone: "success" | "info" | "pick-vendor";
  text: string;
  itemId?: string;
}

interface HealthItem {
  id: string;
  name: string;
  unit: string;
  current_stock: number | null;
  par_level: number | null;
}

interface ItemHealthRowProps {
  item: HealthItem;
  valueColor: string;
  editingParId: string | null;
  setEditingParId: (id: string | null) => void;
  updateParLevel: (itemId: string, value: string) => void;
}

function ItemHealthRow({ item, valueColor, editingParId, setEditingParId, updateParLevel }: ItemHealthRowProps) {
  const isEditing = editingParId === item.id;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, gap: 8 }}>
      <span style={{ color: textPrimary, flex: 1 }}>{item.name}</span>
      {isEditing ? (
        <input
          type="number"
          defaultValue={item.par_level ?? ""}
          autoFocus
          placeholder="Par"
          onBlur={(e) => updateParLevel(item.id, e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && updateParLevel(item.id, (e.target as HTMLInputElement).value)}
          style={{ width: 56, background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 4, padding: "2px 6px", color: textPrimary, fontSize: 11, fontFamily: mono }}
        />
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: valueColor, fontFamily: mono }}>
            {item.par_level != null ? `${item.current_stock} / ${item.par_level} ${item.unit}` : "no par set"}
          </span>
          <button onClick={() => setEditingParId(item.id)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", padding: 1 }}>
            <Pencil size={10} />
          </button>
        </div>
      )}
    </div>
  );
}

interface HealthCategorySectionProps {
  categoryKey: string;
  label: string;
  color: string;
  items: HealthItem[];
  expandedCategory: string | null;
  setExpandedCategory: (key: string | null) => void;
  editingParId: string | null;
  setEditingParId: (id: string | null) => void;
  updateParLevel: (itemId: string, value: string) => void;
}

function HealthCategorySection({ categoryKey, label, color, items, expandedCategory, setExpandedCategory, editingParId, setEditingParId, updateParLevel }: HealthCategorySectionProps) {
  if (items.length === 0) return null;
  const isOpen = expandedCategory === categoryKey;
  return (
    <div>
      <button
        onClick={() => setExpandedCategory(isOpen ? null : categoryKey)}
        style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isOpen ? 6 : 0 }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {label} ({items.length})
        </span>
        {isOpen ? <ChevronUp size={12} color={color} /> : <ChevronDown size={12} color={color} />}
      </button>
      {isOpen && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, minHeight: 0, overflowY: "auto" }}>
          {items.map((i) => (
            <ItemHealthRow key={i.id} item={i} valueColor={color} editingParId={editingParId} setEditingParId={setEditingParId} updateParLevel={updateParLevel} />
          ))}
        </div>
      )}
    </div>
  );
}

interface POSummaryItem {
  id: string;
  po_number: string | null;
  supplier: string;
  expected_delivery_date: string | null;
  itemCount: number;
}

function PORow({ po }: { po: POSummaryItem }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
      <div>
        <span style={{ color: textPrimary, fontFamily: mono, fontWeight: 600 }}>{po.po_number}</span>
        <span style={{ color: textMuted }}> · {po.supplier}</span>
      </div>
      <div style={{ color: textMuted, fontSize: 11 }}>
        {po.itemCount} item{po.itemCount !== 1 ? "s" : ""}
        {po.expected_delivery_date && ` · ${po.expected_delivery_date}`}
      </div>
    </div>
  );
}

interface POCategorySectionProps {
  categoryKey: string;
  label: string;
  color: string;
  items: POSummaryItem[];
  expandedCategory: string | null;
  setExpandedCategory: (key: string | null) => void;
}

function POCategorySection({ categoryKey, label, color, items, expandedCategory, setExpandedCategory }: POCategorySectionProps) {
  if (items.length === 0) return null;
  const isOpen = expandedCategory === categoryKey;
  return (
    <div>
      <button
        onClick={() => setExpandedCategory(isOpen ? null : categoryKey)}
        style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isOpen ? 6 : 0 }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {label} ({items.length})
        </span>
        {isOpen ? <ChevronUp size={12} color={color} /> : <ChevronDown size={12} color={color} />}
      </button>
      {isOpen && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, minHeight: 0, overflowY: "auto" }}>
          {items.map((po) => (
            <PORow key={po.id} po={po} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function HomeScreen({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { restaurantId: RESTAURANT_ID, restaurantName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [vendorConfirmCount, setVendorConfirmCount] = useState(0);
  const [belowParCount, setBelowParCount] = useState(0);
  const [stockoutRisks, setStockoutRisks] = useState<Database["public"]["Functions"]["stockout_risk_items"]["Returns"]>([]);
  const [atRiskItems, setAtRiskItems] = useState<Database["public"]["Functions"]["at_risk_items"]["Returns"]>([]);
  const [health, setHealth] = useState<{ total: number; healthy: number; belowPar: number; noPar: number; healthyItems: HealthItem[]; belowParItems: HealthItem[]; noParItems: HealthItem[] }>({ total: 0, healthy: 0, belowPar: 0, noPar: 0, healthyItems: [], belowParItems: [], noParItems: [] });
  const [showHealthDetail, setShowHealthDetail] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null); // 'belowPar' | 'noPar' | 'healthy' | null
  const [editingParId, setEditingParId] = useState<string | null>(null);
  const [timeStats, setTimeStats] = useState({ monthCount: 0, totalCount: 0 });
  const [wasteStats, setWasteStats] = useState({ count: 0, value: 0 });
  const [poSummary, setPoSummary] = useState<{ total: number; openPOs: POSummaryItem[]; partialPOs: POSummaryItem[]; fulfilledPOs: POSummaryItem[] }>({ total: 0, openPOs: [], partialPOs: [], fulfilledPOs: [] });
  const [showPODetail, setShowPODetail] = useState(false);
  const [expandedPOCategory, setExpandedPOCategory] = useState<string | null>(null);
  const [autoPOModal, setAutoPOModal] = useState<AutoPOModalState | null>(null);
  const [vendorPickerList, setVendorPickerList] = useState<{ id: string; name: string }[]>([]);
  const [vendorPickerLoading, setVendorPickerLoading] = useState(false);
  const [showAskAgent, setShowAskAgent] = useState(false);

  useEffect(() => {
    load();
  }, [RESTAURANT_ID]);

  // Live sync: any change to inventory, invoices, or purchase orders for
  // this restaurant re-runs load() automatically. Replaces relying on a
  // manual load() call after every single mutation (fragile - easy to miss
  // one, and doesn't help at all if the change came from another device,
  // another tab, or the scheduled demo-activity job).
  useEffect(() => {
    if (!RESTAURANT_ID) return;
    const channel = supabase
      .channel(`home-${RESTAURANT_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items", filter: `restaurant_id=eq.${RESTAURANT_ID}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `restaurant_id=eq.${RESTAURANT_ID}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders", filter: `restaurant_id=eq.${RESTAURANT_ID}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_order_items" }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
      .select("id, name, unit, current_stock, par_level")
      .eq("restaurant_id", RESTAURANT_ID)
      .order("name", { ascending: true });

    const items = allItems || [];
    const noParItems = items.filter((i) => i.par_level == null);
    const tracked = items.filter((i) => i.par_level != null);
    const belowParItems = tracked.filter((i) => (i.current_stock ?? 0) <= (i.par_level ?? 0));
    const healthyItems = tracked.filter((i) => (i.current_stock ?? 0) > (i.par_level ?? 0));
    setHealth({
      total: items.length,
      healthy: healthyItems.length,
      belowPar: belowParItems.length,
      noPar: noParItems.length,
      healthyItems,
      belowParItems,
      noParItems,
    });

    // Actionable alert count excludes items already covered by an open
    // purchase order - matches the same guard logic as the Reorder digest,
    // so this number only reflects items that actually need a NEW order.
    const { data: openPOs } = await supabase
      .from("purchase_orders")
      .select("id")
      .eq("restaurant_id", RESTAURANT_ID)
      .in("status", ["sent", "partial"]);

    let openItemIds = new Set<string>();
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
      tracked.filter((i) => (i.current_stock ?? 0) <= (i.par_level ?? 0) && !openItemIds.has(i.id)).length
    );

    const { data: risks } = await supabase.rpc("stockout_risk_items", { p_restaurant_id: RESTAURANT_ID });
    setStockoutRisks(risks || []);

    const { data: atRisk } = await supabase.rpc("at_risk_items", { p_restaurant_id: RESTAURANT_ID });
    setAtRiskItems(atRisk || []);

    // Time saved is an estimate, not a measurement - based on ~8 minutes of
    // manual entry (reading a paper invoice, typing line items/quantities/
    // prices into a spreadsheet or POS) avoided per invoice processed here.
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: monthCount } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", RESTAURANT_ID)
      .eq("status", "confirmed")
      .gte("confirmed_at", startOfMonth.toISOString());

    const { count: totalCount } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", RESTAURANT_ID)
      .eq("status", "confirmed");

    setTimeStats({ monthCount: monthCount || 0, totalCount: totalCount || 0 });

    // Waste saved is a real, logged number - only counts items a chef
    // actually marked used via the Kitchen at-risk view, priced at that
    // item's last known unit price. Not an estimate like time saved.
    const { data: wasteLog } = await supabase
      .from("waste_saved_log")
      .select("quantity, estimated_value")
      .eq("restaurant_id", RESTAURANT_ID);

    const wasteCount = (wasteLog || []).length;
    const wasteValue = (wasteLog || []).reduce((sum, w) => sum + (Number(w.estimated_value) || 0), 0);
    setWasteStats({ count: wasteCount, value: wasteValue });

    // Purchase order summary - grouped by fulfillment status, with item
    // counts per PO for a quick "what's in it" glance.
    const { data: pos } = await supabase
      .from("purchase_orders")
      .select("id, po_number, status, expected_delivery_date, created_at, suppliers(name), purchase_order_items(id)")
      .eq("restaurant_id", RESTAURANT_ID)
      .order("created_at", { ascending: false });

    const allPOs = (pos || []).map((p) => ({
      id: p.id,
      po_number: p.po_number,
      supplier: p.suppliers?.name || "Unknown",
      expected_delivery_date: p.expected_delivery_date,
      itemCount: p.purchase_order_items?.length || 0,
    }));

    setPoSummary({
      total: allPOs.length,
      openPOs: (pos || []).filter((p) => p.status === "sent").map((p) => allPOs.find((a) => a.id === p.id)).filter((p): p is POSummaryItem => p !== undefined),
      partialPOs: (pos || []).filter((p) => p.status === "partial").map((p) => allPOs.find((a) => a.id === p.id)).filter((p): p is POSummaryItem => p !== undefined),
      fulfilledPOs: (pos || []).filter((p) => p.status === "fulfilled").map((p) => allPOs.find((a) => a.id === p.id)).filter((p): p is POSummaryItem => p !== undefined),
    });

    setLoading(false);
  }

  async function updateParLevel(itemId: string, value: string) {
    const numValue = value === "" ? null : parseFloat(value);
    if (value !== "" && numValue !== null && isNaN(numValue)) return;
    await supabase.from("inventory_items").update({ par_level: numValue }).eq("id", itemId);
    setEditingParId(null);

    if (numValue !== null) {
      const { data: poResult } = await supabase.rpc("auto_create_po_if_needed", { p_inventory_item_id: itemId });
      const typedResult = poResult as AutoCreatePOResult | null;
      if (typedResult?.created) {
        setAutoPOModal({ tone: "success", text: `${typedResult.po_number} created — ordered ${typedResult.quantity} ${typedResult.unit} of ${typedResult.item_name} from ${typedResult.supplier_name}.` });
      } else if (typedResult?.reason === "already_open") {
        setAutoPOModal({ tone: "info", text: "Par updated. This item already has an open order, so no new PO was created." });
      } else if (typedResult?.reason === "no_known_supplier") {
        setVendorPickerLoading(true);
        setAutoPOModal({ tone: "pick-vendor", itemId, text: "No supplier on file for this item yet — who should this order go to?" });
        const { data: suppliers } = await supabase.from("suppliers").select("id, name").eq("restaurant_id", RESTAURANT_ID ?? "").order("name");
        setVendorPickerList(suppliers || []);
        setVendorPickerLoading(false);
      }
    }
    // Reload rather than patch local state - changing a par can move an item
    // between categories (e.g. setting one for the first time on a
    // 'not tracked' item, or pushing a 'healthy' item into 'below par').
    load();
  }

  async function assignSupplierAndCreatePO(supplierId: string) {
    if (!autoPOModal?.itemId) return;
    setVendorPickerLoading(true);
    const { data: result } = await supabase.rpc("create_po_for_item_with_supplier", {
      p_inventory_item_id: autoPOModal.itemId,
      p_supplier_id: supplierId,
    });
    const typedResult = result as CreatePOWithSupplierResult | null;
    if (typedResult?.created) {
      setAutoPOModal({ tone: "success", text: `${typedResult.po_number} created — ordered ${typedResult.quantity} ${typedResult.unit} of ${typedResult.item_name} from ${typedResult.supplier_name}.` });
      load();
    } else {
      setAutoPOModal({ tone: "info", text: "Couldn't create the order — try again from the Reorder screen." });
    }
    setVendorPickerLoading(false);
  }

  const allClear = pendingCount === 0 && belowParCount === 0 && stockoutRisks.length === 0 && atRiskItems.length === 0;
  const healthyPct = health.total - health.noPar > 0 ? Math.round((health.healthy / (health.total - health.noPar)) * 100) : null;

  return (
    <div style={{ fontFamily: sans }}>
      {autoPOModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "backdropFadeIn 0.15s ease-out" }}>
          <div style={{ background: "#FFFFFF", borderRadius: 12, padding: 20, width: "100%", maxWidth: 360, animation: "modalPopIn 0.25s ease-out" }}>
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
          {restaurantName}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -0.3 }}>
          {loading ? "Loading…" : allClear ? "All clear" : "Needs attention"}
        </h1>
      </div>

      <div style={{ padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {!loading && timeStats.totalCount > 0 && (
          <div style={{ background: "linear-gradient(135deg, #1E5B8C, #164569)", borderRadius: 10, padding: "18px 18px", color: "#FFFFFF" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, opacity: 0.85 }}>
              <Clock size={15} />
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.3 }}>TIME SAVED</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 700, fontFamily: mono }}>
                ~{((timeStats.totalCount * 8) / 60).toFixed(1)} hrs
              </span>
              <span style={{ fontSize: 13, opacity: 0.85 }}>all time</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              {timeStats.totalCount} invoice{timeStats.totalCount !== 1 ? "s" : ""} processed
              {timeStats.monthCount > 0 && ` · ${timeStats.monthCount} this month`}
            </div>
            {wasteStats.count > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.2)" }}>
                <Leaf size={13} />
                <span style={{ fontSize: 12, opacity: 0.9 }}>
                  ~${wasteStats.value.toFixed(2)} saved from waste ({wasteStats.count} item{wasteStats.count !== 1 ? "s" : ""} used before expiring)
                </span>
              </div>
            )}
          </div>
        )}

        {!loading && allClear && (
          <div style={{ background: card, border: "1px solid #BFE3D0", borderRadius: 10, padding: "20px 18px", display: "flex", alignItems: "center", gap: 10 }}>
            <CheckCircle2 size={20} color={good} />
            <div style={{ fontSize: 14, color: textPrimary }}>Nothing waiting on you right now.</div>
          </div>
        )}

        {!loading && stockoutRisks.length > 0 && (
          <div
            onClick={() => onNavigate("digest")}
            style={{ width: "100%", textAlign: "left", background: "#FDECEC", border: "1px solid #F3B8B8", borderRadius: 10, padding: "16px 18px", color: textPrimary, cursor: "pointer", animation: "bannerSlideIn 0.3s ease-out" }}
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

        {!loading && atRiskItems.length > 0 && (
          <div
            onClick={() => onNavigate("kitchen")}
            style={{ width: "100%", textAlign: "left", background: "#FFF7ED", border: "1px solid #FBD9A8", borderRadius: 10, padding: "16px 18px", color: textPrimary, cursor: "pointer", animation: "bannerSlideIn 0.3s ease-out" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <ChefHat size={18} color="#B45309" />
              <div style={{ fontWeight: 700, fontSize: 15, color: "#B45309" }}>
                {atRiskItems.length} item{atRiskItems.length > 1 ? "s" : ""} about to expire
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {atRiskItems.slice(0, 3).map((r) => (
                <div key={r.inventory_item_id} style={{ fontSize: 12, color: textMuted, fontFamily: mono }}>
                  {r.name} — {r.days_until_expiration < 0 ? `${Math.abs(r.days_until_expiration)}d overdue` : r.days_until_expiration === 0 ? "today" : `${r.days_until_expiration}d left`}
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
            <button
              onClick={() => {
                setShowHealthDetail((s) => !s);
                setExpandedCategory(null);
              }}
              style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Activity size={16} color={textMuted} />
                <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>Inventory health</span>
                {showHealthDetail ? <ChevronUp size={14} color={textMuted} /> : <ChevronDown size={14} color={textMuted} />}
              </div>
              {healthyPct != null && (
                <span style={{ fontSize: 13, fontFamily: mono, color: healthyPct >= 70 ? good : healthyPct >= 40 ? accent : danger }}>
                  {healthyPct}% healthy
                </span>
              )}
            </button>

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

            {showHealthDetail && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #E2E6ED", display: "flex", flexDirection: "column", gap: 12 }}>
                <HealthCategorySection
                  categoryKey="belowPar"
                  label="Below par"
                  color={danger}
                  items={health.belowParItems}
                  expandedCategory={expandedCategory}
                  setExpandedCategory={setExpandedCategory}
                  editingParId={editingParId}
                  setEditingParId={setEditingParId}
                  updateParLevel={updateParLevel}
                />
                <HealthCategorySection
                  categoryKey="noPar"
                  label="Not tracked"
                  color={textMuted}
                  items={health.noParItems}
                  expandedCategory={expandedCategory}
                  setExpandedCategory={setExpandedCategory}
                  editingParId={editingParId}
                  setEditingParId={setEditingParId}
                  updateParLevel={updateParLevel}
                />
                <HealthCategorySection
                  categoryKey="healthy"
                  label="Healthy"
                  color={good}
                  items={health.healthyItems}
                  expandedCategory={expandedCategory}
                  setExpandedCategory={setExpandedCategory}
                  editingParId={editingParId}
                  setEditingParId={setEditingParId}
                  updateParLevel={updateParLevel}
                />
              </div>
            )}
          </div>
        )}

        {!loading && poSummary.total > 0 && (
          <div style={{ background: card, border: "1px solid #E2E6ED", borderRadius: 10, padding: "16px 18px" }}>
            <button
              onClick={() => {
                setShowPODetail((s) => !s);
                setExpandedPOCategory(null);
              }}
              style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Package size={16} color={textMuted} />
                <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>Purchase orders</span>
                {showPODetail ? <ChevronUp size={14} color={textMuted} /> : <ChevronDown size={14} color={textMuted} />}
              </div>
              <span style={{ fontSize: 13, fontFamily: mono, color: textMuted }}>{poSummary.total} total</span>
            </button>

            {/* Segmented bar: open / partial / fulfilled */}
            <div style={{ display: "flex", width: "100%", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
              {poSummary.openPOs.length > 0 && <div style={{ flex: poSummary.openPOs.length, background: accent }} />}
              {poSummary.partialPOs.length > 0 && <div style={{ flex: poSummary.partialPOs.length, background: "#D97706" }} />}
              {poSummary.fulfilledPOs.length > 0 && <div style={{ flex: poSummary.fulfilledPOs.length, background: good }} />}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: textMuted }}>
              <span><span style={{ color: accent, fontFamily: mono }}>{poSummary.openPOs.length}</span> open</span>
              <span><span style={{ color: "#D97706", fontFamily: mono }}>{poSummary.partialPOs.length}</span> partial</span>
              <span><span style={{ color: good, fontFamily: mono }}>{poSummary.fulfilledPOs.length}</span> fulfilled</span>
            </div>

            {showPODetail && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #E2E6ED", display: "flex", flexDirection: "column", gap: 12 }}>
                <POCategorySection categoryKey="open" label="Open" color={accent} items={poSummary.openPOs} expandedCategory={expandedPOCategory} setExpandedCategory={setExpandedPOCategory} />
                <POCategorySection categoryKey="partial" label="Partial" color="#D97706" items={poSummary.partialPOs} expandedCategory={expandedPOCategory} setExpandedCategory={setExpandedPOCategory} />
                <POCategorySection categoryKey="fulfilled" label="Fulfilled" color={good} items={poSummary.fulfilledPOs} expandedCategory={expandedPOCategory} setExpandedCategory={setExpandedPOCategory} />
              </div>
            )}
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

        <button
          onClick={() => setShowAskAgent(true)}
          style={{
            position: "fixed",
            bottom: 84,
            right: 20,
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: accent,
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(30,91,140,0.4)",
            zIndex: 500,
          }}
          aria-label="Ask about your business"
        >
          <Sparkles size={22} color="#FFFFFF" />
        </button>

        {showAskAgent && RESTAURANT_ID && (
          <AskAgentModal restaurantId={RESTAURANT_ID} healthyPercent={healthyPct} onClose={() => setShowAskAgent(false)} />
        )}
      </div>
    </div>
  );
}
