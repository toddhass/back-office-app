import { useEffect, useState } from "react";
import { Receipt, ClipboardList, Camera, AlertTriangle, CheckCircle2, LogOut, TrendingDown, Activity, ChevronDown, ChevronUp, Pencil, Clock, Package, Leaf, ChefHat, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { card, textPrimary, textMuted, accent, danger, good, sans, mono } from "../lib/tokens";
import type { Database } from "../lib/database.types";
import type { AutoCreatePOResult, CreatePOWithSupplierResult } from "../lib/rpc-types";
import AskAgentModal from "./AskAgentModal";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";

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
    <div className="flex justify-between items-center text-xs gap-2">
      <span className="text-ink flex-1">{item.name}</span>
      {isEditing ? (
        <input
          type="number"
          defaultValue={item.par_level ?? ""}
          autoFocus
          placeholder="Par"
          onBlur={(e) => updateParLevel(item.id, e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && updateParLevel(item.id, (e.target as HTMLInputElement).value)}
          className="w-14 bg-input-bg border border-border-strong rounded text-ink text-[11px] font-mono px-1.5 py-0.5"
        />
      ) : (
        <div className="flex items-center gap-1">
          <span className="font-mono" style={{ color: valueColor }}>
            {item.par_level != null ? `${item.current_stock} / ${item.par_level} ${item.unit}` : "no par set"}
          </span>
          <button onClick={() => setEditingParId(item.id)} className="bg-transparent border-none text-slate cursor-pointer p-px">
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
        className={`w-full bg-transparent border-none p-0 cursor-pointer flex items-center justify-between ${isOpen ? "mb-1.5" : "mb-0"}`}
      >
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color }}>
          {label} ({items.length})
        </span>
        {isOpen ? <ChevronUp size={12} color={color} /> : <ChevronDown size={12} color={color} />}
      </button>
      {isOpen && (
        <div className="flex flex-col gap-1 max-h-[180px] min-h-0 overflow-y-auto">
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
    <div className="flex justify-between items-center text-xs">
      <div>
        <span className="text-ink font-mono font-semibold">{po.po_number}</span>
        <span className="text-slate"> · {po.supplier}</span>
      </div>
      <div className="text-slate text-[11px]">
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
        className={`w-full bg-transparent border-none p-0 cursor-pointer flex items-center justify-between ${isOpen ? "mb-1.5" : "mb-0"}`}
      >
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color }}>
          {label} ({items.length})
        </span>
        {isOpen ? <ChevronUp size={12} color={color} /> : <ChevronDown size={12} color={color} />}
      </button>
      {isOpen && (
        <div className="flex flex-col gap-1.5 max-h-[180px] min-h-0 overflow-y-auto">
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
    <div className="font-sans">
      {autoPOModal && (
        <Modal onClose={() => setAutoPOModal(null)} maxWidth={360}>
          <div className={`text-sm text-ink leading-normal ${autoPOModal.tone === "pick-vendor" ? "mb-3.5" : "mb-4"}`}>
            {autoPOModal.text}
          </div>

          {autoPOModal.tone === "pick-vendor" && (
            <div className="flex flex-col gap-1.5 mb-3.5 max-h-[220px] overflow-y-auto">
              {vendorPickerLoading && <div className="text-sm text-slate text-center p-2">Loading…</div>}
              {!vendorPickerLoading && vendorPickerList.map((s) => (
                <button
                  key={s.id}
                  onClick={() => assignSupplierAndCreatePO(s.id)}
                  className="w-full text-left bg-surface-alt border border-border rounded-lg px-3 py-2.5 text-ink text-sm cursor-pointer"
                >
                  {s.name}
                </button>
              ))}
              {!vendorPickerLoading && vendorPickerList.length === 0 && (
                <div className="text-xs text-slate text-center p-2">No vendors on file yet — add one in Invoices → History.</div>
              )}
            </div>
          )}

          <Button
            variant={autoPOModal.tone === "pick-vendor" ? "secondary" : "primary"}
            onClick={() => setAutoPOModal(null)}
            className="w-full !text-sm"
          >
            {autoPOModal.tone === "pick-vendor" ? "None of these — skip for now" : "OK"}
          </Button>
        </Modal>
      )}
      <div className="pt-6 px-5 pb-2">
        <div className="text-xs tracking-wide uppercase text-slate mb-1">
          {restaurantName}
        </div>
        <h1 className="text-[26px] font-bold m-0 tracking-tight">
          {loading ? "Loading…" : allClear ? "All clear" : "Needs attention"}
        </h1>
      </div>

      <div className="px-4 pt-4 pb-2 flex flex-col gap-2.5">
        {!loading && timeStats.totalCount > 0 && (
          <div className="bg-gradient-to-br from-[#1E5B8C] to-[#164569] rounded-[10px] p-[18px] text-white">
            <div className="flex items-center gap-2 mb-2 opacity-85">
              <Clock size={15} />
              <span className="text-xs font-semibold tracking-wide">TIME SAVED</span>
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-[28px] font-bold font-mono">
                ~{((timeStats.totalCount * 8) / 60).toFixed(1)} hrs
              </span>
              <span className="text-sm opacity-85">all time</span>
            </div>
            <div className="text-xs opacity-85">
              {timeStats.totalCount} invoice{timeStats.totalCount !== 1 ? "s" : ""} processed
              {timeStats.monthCount > 0 && ` · ${timeStats.monthCount} this month`}
            </div>
            {wasteStats.count > 0 && (
              <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-white/20">
                <Leaf size={13} />
                <span className="text-xs opacity-90">
                  ~${wasteStats.value.toFixed(2)} saved from waste ({wasteStats.count} item{wasteStats.count !== 1 ? "s" : ""} used before expiring)
                </span>
              </div>
            )}
          </div>
        )}

        {!loading && allClear && (
          <div className="bg-surface border border-good-border rounded-[10px] py-5 px-[18px] flex items-center gap-2.5">
            <CheckCircle2 size={20} color={good} />
            <div className="text-sm text-ink">Nothing waiting on you right now.</div>
          </div>
        )}

        {!loading && stockoutRisks.length > 0 && (
          <div
            onClick={() => onNavigate("digest")}
            className="w-full text-left bg-danger-bg border border-danger-border rounded-[10px] py-4 px-[18px] text-ink cursor-pointer animate-banner-slide"
          >
            <div className="flex items-center gap-2.5 mb-2">
              <TrendingDown size={18} color={danger} />
              <div className="font-bold text-[15px]" style={{ color: danger }}>
                {stockoutRisks.length} item{stockoutRisks.length > 1 ? "s" : ""} may run out before the shipment arrives
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {stockoutRisks.slice(0, 3).map((r) => (
                <div key={r.inventory_item_id} className="text-xs text-slate font-mono">
                  {r.item_name} — projected out {r.projected_stockout_date}, shipment expected {r.expected_delivery_date} ({r.days_short}d short)
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && atRiskItems.length > 0 && (
          <div
            onClick={() => onNavigate("kitchen")}
            className="w-full text-left bg-[#FFF7ED] border border-[#FBD9A8] rounded-[10px] py-4 px-[18px] text-ink cursor-pointer animate-banner-slide"
          >
            <div className="flex items-center gap-2.5 mb-2">
              <ChefHat size={18} color="#B45309" />
              <div className="font-bold text-[15px] text-[#B45309]">
                {atRiskItems.length} item{atRiskItems.length > 1 ? "s" : ""} about to expire
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {atRiskItems.slice(0, 3).map((r) => (
                <div key={r.inventory_item_id} className="text-xs text-slate font-mono">
                  {r.name} — {r.days_until_expiration < 0 ? `${Math.abs(r.days_until_expiration)}d overdue` : r.days_until_expiration === 0 ? "today" : `${r.days_until_expiration}d left`}
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && pendingCount > 0 && (
          <button
            onClick={() => onNavigate("invoices")}
            className="w-full text-left bg-surface border border-border rounded-[10px] py-4 px-[18px] text-ink cursor-pointer flex justify-between items-center"
          >
            <div className="flex items-center gap-2.5">
              <Receipt size={18} color={accent} />
              <div>
                <div className="font-semibold text-[15px]">{pendingCount} invoice{pendingCount > 1 ? "s" : ""} to review</div>
                {vendorConfirmCount > 0 && (
                  <div className="text-xs text-slate mt-0.5">
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
            className="w-full text-left bg-surface border border-border rounded-[10px] py-4 px-[18px] text-ink cursor-pointer flex justify-between items-center"
          >
            <div className="flex items-center gap-2.5">
              <ClipboardList size={18} color={accent} />
              <div className="font-semibold text-[15px]">{belowParCount} item{belowParCount > 1 ? "s" : ""} below par</div>
            </div>
            <AlertTriangle size={14} color={accent} />
          </button>
        )}

        {!loading && health.total > 0 && (
          <div className="bg-surface border border-border rounded-[10px] py-4 px-[18px]">
            <button
              onClick={() => {
                setShowHealthDetail((s) => !s);
                setExpandedCategory(null);
              }}
              className="w-full bg-transparent border-none p-0 cursor-pointer flex items-center justify-between mb-2.5"
            >
              <div className="flex items-center gap-2">
                <Activity size={16} color={textMuted} />
                <span className="text-sm font-semibold text-ink">Inventory health</span>
                {showHealthDetail ? <ChevronUp size={14} color={textMuted} /> : <ChevronDown size={14} color={textMuted} />}
              </div>
              {healthyPct != null && (
                <span className="text-sm font-mono" style={{ color: healthyPct >= 70 ? good : healthyPct >= 40 ? accent : danger }}>
                  {healthyPct}% healthy
                </span>
              )}
            </button>

            {/* Segmented bar: healthy / below par / untracked */}
            <div className="flex w-full h-2 rounded overflow-hidden mb-2.5">
              {health.healthy > 0 && <div style={{ flex: health.healthy, background: good }} />}
              {health.belowPar > 0 && <div style={{ flex: health.belowPar, background: danger }} />}
              {health.noPar > 0 && <div className="bg-border-strong" style={{ flex: health.noPar }} />}
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-slate">
              <span><span className="font-mono" style={{ color: good }}>{health.healthy}</span> healthy</span>
              <span><span className="font-mono" style={{ color: danger }}>{health.belowPar}</span> below par</span>
              {health.noPar > 0 && (
                <span><span className="text-slate font-mono">{health.noPar}</span> not tracked (no par level set)</span>
              )}
            </div>

            {showHealthDetail && (
              <div className="mt-3.5 pt-3.5 border-t border-border flex flex-col gap-3">
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
          <div className="bg-surface border border-border rounded-[10px] py-4 px-[18px]">
            <button
              onClick={() => {
                setShowPODetail((s) => !s);
                setExpandedPOCategory(null);
              }}
              className="w-full bg-transparent border-none p-0 cursor-pointer flex items-center justify-between mb-2.5"
            >
              <div className="flex items-center gap-2">
                <Package size={16} color={textMuted} />
                <span className="text-sm font-semibold text-ink">Purchase orders</span>
                {showPODetail ? <ChevronUp size={14} color={textMuted} /> : <ChevronDown size={14} color={textMuted} />}
              </div>
              <span className="text-sm font-mono text-slate">{poSummary.total} total</span>
            </button>

            {/* Segmented bar: open / partial / fulfilled */}
            <div className="flex w-full h-2 rounded overflow-hidden mb-2.5">
              {poSummary.openPOs.length > 0 && <div style={{ flex: poSummary.openPOs.length, background: accent }} />}
              {poSummary.partialPOs.length > 0 && <div style={{ flex: poSummary.partialPOs.length, background: "#D97706" }} />}
              {poSummary.fulfilledPOs.length > 0 && <div style={{ flex: poSummary.fulfilledPOs.length, background: good }} />}
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-slate">
              <span><span className="font-mono" style={{ color: accent }}>{poSummary.openPOs.length}</span> open</span>
              <span><span className="font-mono text-[#D97706]">{poSummary.partialPOs.length}</span> partial</span>
              <span><span className="font-mono" style={{ color: good }}>{poSummary.fulfilledPOs.length}</span> fulfilled</span>
            </div>

            {showPODetail && (
              <div className="mt-3.5 pt-3.5 border-t border-border flex flex-col gap-3">
                <POCategorySection categoryKey="open" label="Open" color={accent} items={poSummary.openPOs} expandedCategory={expandedPOCategory} setExpandedCategory={setExpandedPOCategory} />
                <POCategorySection categoryKey="partial" label="Partial" color="#D97706" items={poSummary.partialPOs} expandedCategory={expandedPOCategory} setExpandedCategory={setExpandedPOCategory} />
                <POCategorySection categoryKey="fulfilled" label="Fulfilled" color={good} items={poSummary.fulfilledPOs} expandedCategory={expandedPOCategory} setExpandedCategory={setExpandedPOCategory} />
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => onNavigate("capture")}
          className="w-full text-left bg-transparent border border-dashed border-border rounded-[10px] py-4 px-[18px] text-slate cursor-pointer flex items-center gap-2.5 mt-1.5"
        >
          <Camera size={18} />
          <div className="text-sm">Upload a new invoice</div>
        </button>

        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full text-center bg-transparent border-none py-4 px-[18px] text-slate cursor-pointer flex items-center justify-center gap-2 mt-4 text-sm"
        >
          <LogOut size={14} />
          Sign out
        </button>

        <button
          onClick={() => setShowAskAgent(true)}
          className="fixed bottom-[84px] right-5 w-14 h-14 rounded-full bg-accent border-none flex items-center justify-center cursor-pointer shadow-[0_4px_14px_rgba(30,91,140,0.4)] z-[500]"
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
