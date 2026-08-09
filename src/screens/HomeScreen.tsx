import { useEffect, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { Receipt, ClipboardList, Camera, AlertTriangle, CheckCircle2, LogOut, TrendingDown, Activity, ChevronDown, ChevronUp, Pencil, Clock, Package, Leaf, ChefHat, Sparkles, ScanLine, X, CloudSun, CloudRain, Cloud, CloudSnow, Sun, Calendar } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { card, textPrimary, textMuted, accent, danger, good, sans, mono } from "../lib/tokens";
import type { Database } from "../lib/database.types";
import type { AutoCreatePOResult, CreatePOWithSupplierResult } from "../lib/rpc-types";
import AskAgentModal from "./AskAgentModal";

// Lazy-loaded: @zxing/browser (needed for real barcode decoding, not just
// jsQR's QR codes) adds ~450kB to the bundle on its own - nearly doubling
// it if bundled normally. Code-splitting it means that cost is only paid
// the moment someone actually taps the scan button, not on every page load
// for people who never use this feature.
const BarcodeScannerModal = lazy(() => import("./BarcodeScannerModal"));

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

interface POLineItem {
  name: string;
  unit: string;
  quantityOrdered: number;
  quantityReceived: number;
}

interface POSummaryItem {
  id: string;
  po_number: string | null;
  supplier: string;
  expected_delivery_date: string | null;
  itemCount: number;
  items: POLineItem[];
}

function PORow({ po, onSelect }: { po: POSummaryItem; onSelect: (po: POSummaryItem) => void }) {
  return (
    <button
      onClick={() => onSelect(po)}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
    >
      <div>
        <span style={{ color: textPrimary, fontFamily: mono, fontWeight: 600 }}>{po.po_number}</span>
        <span style={{ color: textMuted }}> · {po.supplier}</span>
      </div>
      <div style={{ color: textMuted, fontSize: 11 }}>
        {po.itemCount} item{po.itemCount !== 1 ? "s" : ""}
        {po.expected_delivery_date && ` · ${po.expected_delivery_date}`}
      </div>
    </button>
  );
}

interface POCategorySectionProps {
  categoryKey: string;
  label: string;
  color: string;
  items: POSummaryItem[];
  expandedCategory: string | null;
  setExpandedCategory: (key: string | null) => void;
  onSelectPO: (po: POSummaryItem) => void;
}

function POCategorySection({ categoryKey, label, color, items, expandedCategory, setExpandedCategory, onSelectPO }: POCategorySectionProps) {
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
            <PORow key={po.id} po={po} onSelect={onSelectPO} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function HomeScreen() {
  const navigate = useNavigate();
  // Kept as a local shim so the many onNavigate("digest") / ("kitchen") /
  // etc. call sites below didn't all need touching individually - maps
  // the old tab-key vocabulary onto real routes in one place.
  const routeForTab: Record<string, string> = { digest: "/reorder", kitchen: "/kitchen", invoices: "/invoices", capture: "/capture" };
  const onNavigate = (tabKey: string) => navigate(routeForTab[tabKey] || "/");
  const { restaurantId: RESTAURANT_ID, restaurantName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [vendorConfirmCount, setVendorConfirmCount] = useState(0);
  const [belowParCount, setBelowParCount] = useState(0);
  const [stockoutRisks, setStockoutRisks] = useState<Database["public"]["Functions"]["stockout_risk_items"]["Returns"]>([]);
  const [atRiskItems, setAtRiskItems] = useState<Database["public"]["Functions"]["at_risk_items"]["Returns"]>([]);
  const [health, setHealth] = useState<{ total: number; healthy: number; belowPar: number; belowParOnOrder: number; noPar: number; healthyItems: HealthItem[]; belowParItems: HealthItem[]; noParItems: HealthItem[] }>({ total: 0, healthy: 0, belowPar: 0, belowParOnOrder: 0, noPar: 0, healthyItems: [], belowParItems: [], noParItems: [] });
  const [showHealthDetail, setShowHealthDetail] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null); // 'belowPar' | 'noPar' | 'healthy' | null
  const [editingParId, setEditingParId] = useState<string | null>(null);
  const [timeStats, setTimeStats] = useState({ monthCount: 0, totalCount: 0 });
  const [wasteStats, setWasteStats] = useState({ count: 0, value: 0 });
  const [weather, setWeather] = useState<{ condition: string; high: number; low: number; precipChance: number; city: string } | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<{ id: string; event_name: string; next_occurrence: string; days_until: number; in_reminder_window: boolean }[]>([]);
  const [poSummary, setPoSummary] = useState<{ total: number; openPOs: POSummaryItem[]; partialPOs: POSummaryItem[]; fulfilledPOs: POSummaryItem[] }>({ total: 0, openPOs: [], partialPOs: [], fulfilledPOs: [] });
  const [showPODetail, setShowPODetail] = useState(false);
  const [expandedPOCategory, setExpandedPOCategory] = useState<string | null>(null);
  const [autoPOModal, setAutoPOModal] = useState<AutoPOModalState | null>(null);
  const [vendorPickerList, setVendorPickerList] = useState<{ id: string; name: string }[]>([]);
  const [vendorPickerLoading, setVendorPickerLoading] = useState(false);
  const [showAskAgent, setShowAskAgent] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [selectedPO, setSelectedPO] = useState<POSummaryItem | null>(null);

  useEffect(() => {
    load();
  }, [RESTAURANT_ID]);

  // Independent of load() deliberately - weather is a nice-to-have signal,
  // not core business data, and calling a free public API (no key needed)
  // shouldn't be coupled to the realtime-driven reload cycle above or
  // able to block/slow down anything else on this screen if it's briefly
  // unavailable. Fetches today's real forecast for the restaurant's own
  // location; silently shows nothing if no location is on file yet
  // (most restaurants using this app won't have set one up) or if the
  // fetch fails, rather than showing an error card for a non-critical
  // feature.
  useEffect(() => {
    if (!RESTAURANT_ID) return;
    let cancelled = false;
    (async () => {
      const { data: restaurant } = await supabase
        .from("restaurants")
        .select("city, latitude, longitude")
        .eq("id", RESTAURANT_ID)
        .maybeSingle();
      if (!restaurant?.latitude || !restaurant?.longitude || cancelled) return;
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${restaurant.latitude}&longitude=${restaurant.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit&timezone=auto&forecast_days=1`;
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const d = data?.daily;
        if (!d?.weather_code?.[0] && d?.weather_code?.[0] !== 0) return;
        const WMO: Record<number, string> = {
          0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
          45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
          61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
          71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow",
          80: "Rain showers", 81: "Rain showers", 82: "Heavy showers",
          85: "Snow showers", 86: "Snow showers", 95: "Thunderstorms", 96: "Thunderstorms", 99: "Thunderstorms",
        };
        if (!cancelled) {
          setWeather({
            condition: WMO[d.weather_code[0]] || "—",
            high: Math.round(d.temperature_2m_max[0]),
            low: Math.round(d.temperature_2m_min[0]),
            precipChance: d.precipitation_probability_max[0],
            city: restaurant.city || "",
          });
        }
      } catch {
        // Non-critical - no card shown is a fine fallback.
      }
    })();
    return () => { cancelled = true; };
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
      .on("postgres_changes", { event: "*", schema: "public", table: "waste_saved_log", filter: `restaurant_id=eq.${RESTAURANT_ID}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "local_events", filter: `restaurant_id=eq.${RESTAURANT_ID}` }, () => load())
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

    // Fetched here (before setHealth) so the below-par count can show how
    // many of those items are already covered by an open PO - without this,
    // "3 below par" here and "nothing below par" on the Reorder digest look
    // like contradicting data, when they're actually both correct: this is
    // raw current stock state, Reorder deliberately excludes items already
    // on order since there's nothing NEW to do about those.
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

    const belowParOnOrderCount = belowParItems.filter((i) => openItemIds.has(i.id)).length;

    setHealth({
      total: items.length,
      healthy: healthyItems.length,
      belowPar: belowParItems.length,
      belowParOnOrder: belowParOnOrderCount,
      noPar: noParItems.length,
      healthyItems,
      belowParItems,
      noParItems,
    });

    setBelowParCount(
      belowParItems.filter((i) => !openItemIds.has(i.id)).length
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

    // Purchase order summary - grouped by fulfillment status, with the
    // actual items on each PO (not just a count) so tapping one can show
    // real detail instead of nothing.
    const { data: pos } = await supabase
      .from("purchase_orders")
      .select("id, po_number, status, expected_delivery_date, created_at, suppliers(name), purchase_order_items(id, quantity_ordered, quantity_received, inventory_items(name, unit))")
      .eq("restaurant_id", RESTAURANT_ID)
      .order("created_at", { ascending: false });

    const allPOs = (pos || []).map((p) => ({
      id: p.id,
      po_number: p.po_number,
      supplier: p.suppliers?.name || "Unknown",
      expected_delivery_date: p.expected_delivery_date,
      itemCount: p.purchase_order_items?.length || 0,
      items: (p.purchase_order_items || []).map((poi) => ({
        name: poi.inventory_items?.name || "Unknown item",
        unit: poi.inventory_items?.unit || "",
        quantityOrdered: Number(poi.quantity_ordered),
        quantityReceived: Number(poi.quantity_received),
      })),
    }));

    setPoSummary({
      total: allPOs.length,
      openPOs: (pos || []).filter((p) => p.status === "sent").map((p) => allPOs.find((a) => a.id === p.id)).filter((p): p is POSummaryItem => p !== undefined),
      partialPOs: (pos || []).filter((p) => p.status === "partial").map((p) => allPOs.find((a) => a.id === p.id)).filter((p): p is POSummaryItem => p !== undefined),
      fulfilledPOs: (pos || []).filter((p) => p.status === "fulfilled").map((p) => allPOs.find((a) => a.id === p.id)).filter((p): p is POSummaryItem => p !== undefined),
    });

    const { data: events } = await supabase.rpc("get_upcoming_local_events", { p_restaurant_id: RESTAURANT_ID, p_within_days: 14 });
    setUpcomingEvents(events || []);

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
      {selectedPO && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "backdropFadeIn 0.15s ease-out" }}>
          <div style={{ background: "#FFFFFF", borderRadius: 12, padding: 20, width: "100%", maxWidth: 380, maxHeight: "80vh", display: "flex", flexDirection: "column", animation: "modalPopIn 0.25s ease-out" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div>
                <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 16, color: textPrimary }}>{selectedPO.po_number}</div>
                <div style={{ fontSize: 13, color: textMuted, marginTop: 2 }}>{selectedPO.supplier}</div>
              </div>
              <button onClick={() => setSelectedPO(null)} style={{ background: "none", border: "none", cursor: "pointer", color: textMuted, padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            {selectedPO.expected_delivery_date && (
              <div style={{ fontSize: 12, color: textMuted, marginBottom: 14 }}>Expected {selectedPO.expected_delivery_date}</div>
            )}
            <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedPO.items.map((item, i) => {
                const fulfilled = item.quantityReceived >= item.quantityOrdered;
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F1F4F8", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 13, color: textPrimary }}>{item.name}</div>
                    <div style={{ fontSize: 12, fontFamily: mono, color: fulfilled ? good : textMuted }}>
                      {item.quantityReceived}/{item.quantityOrdered} {item.unit}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {autoPOModal && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "backdropFadeIn 0.15s ease-out" }}>
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
          <button
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
          </button>
        )}

        {!loading && atRiskItems.length > 0 && (
          <button
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
          </button>
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

        {weather && (
          <button
            onClick={() => setShowAskAgent(true)}
            style={{ width: "100%", textAlign: "left", background: card, border: "1px solid #E2E6ED", borderRadius: 10, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
          >
            {weather.precipChance >= 40 ? <CloudRain size={26} color={accent} /> : weather.high <= 45 ? <CloudSnow size={26} color={accent} /> : weather.condition.includes("Clear") ? <Sun size={26} color={accent} /> : weather.condition.includes("Overcast") || weather.condition.includes("cloudy") ? <Cloud size={26} color={textMuted} /> : <CloudSun size={26} color={accent} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>
                {weather.condition}, {weather.high}° / {weather.low}°{weather.city ? ` in ${weather.city}` : ""}
              </div>
              <div style={{ fontSize: 11.5, color: textMuted, marginTop: 1 }}>
                {weather.precipChance}% chance of rain · Ask the agent how this should affect you →
              </div>
            </div>
          </button>
        )}

        {upcomingEvents.filter((e) => e.in_reminder_window).length > 0 ? (
          <div style={{ background: card, border: `1px solid ${accent}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Calendar size={16} color={accent} />
              <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>Coming up</span>
            </div>
            {upcomingEvents.filter((e) => e.in_reminder_window).map((e) => (
              <div key={e.id} style={{ fontSize: 12.5, color: textMuted, marginBottom: 2 }}>
                <span style={{ color: textPrimary, fontWeight: 500 }}>{e.event_name}</span> — {e.days_until === 0 ? "today" : e.days_until === 1 ? "tomorrow" : `in ${e.days_until} days`}
              </div>
            ))}
            <button
              onClick={() => navigate("/events")}
              style={{ background: "none", border: "none", padding: 0, marginTop: 6, color: accent, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
            >
              Manage local events →
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate("/events")}
            style={{ width: "100%", textAlign: "left", background: "none", border: "1px dashed #D6DCE5", borderRadius: 10, padding: "10px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: textMuted, fontSize: 12.5 }}
          >
            <Calendar size={15} color={textMuted} />
            {upcomingEvents.length > 0 ? "No local events due soon" : "Add a local event (graduation, festival…)"} · Manage →
          </button>
        )}

        {!loading && health.total > 0 && (
          <div style={{ background: card, border: "1px solid #E2E6ED", borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <button
                onClick={() => {
                  setShowHealthDetail((s) => !s);
                  setExpandedCategory(null);
                }}
                style={{ flex: 1, background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
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
              <button
                onClick={() => setShowBarcodeScanner(true)}
                aria-label="Scan a barcode to find an item"
                style={{ background: "none", border: "none", cursor: "pointer", color: textMuted, padding: "0 0 0 10px", display: "flex" }}
              >
                <ScanLine size={16} />
              </button>
            </div>

            {/* Segmented bar: healthy / below par / untracked */}
            <div style={{ display: "flex", width: "100%", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
              {health.healthy > 0 && <div style={{ flex: health.healthy, background: good }} />}
              {health.belowPar > 0 && <div style={{ flex: health.belowPar, background: danger }} />}
              {health.noPar > 0 && <div style={{ flex: health.noPar, background: "#D6DCE5" }} />}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: textMuted }}>
              <span><span style={{ color: good, fontFamily: mono }}>{health.healthy}</span> healthy</span>
              <span>
                <span style={{ color: danger, fontFamily: mono }}>{health.belowPar}</span> below par
                {health.belowParOnOrder > 0 && (
                  <span style={{ color: textMuted }}> ({health.belowParOnOrder} already on order)</span>
                )}
              </span>
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
                <POCategorySection categoryKey="open" label="Open" color={accent} items={poSummary.openPOs} expandedCategory={expandedPOCategory} setExpandedCategory={setExpandedPOCategory} onSelectPO={setSelectedPO} />
                <POCategorySection categoryKey="partial" label="Partial" color="#D97706" items={poSummary.partialPOs} expandedCategory={expandedPOCategory} setExpandedCategory={setExpandedPOCategory} onSelectPO={setSelectedPO} />
                <POCategorySection categoryKey="fulfilled" label="Fulfilled" color={good} items={poSummary.fulfilledPOs} expandedCategory={expandedPOCategory} setExpandedCategory={setExpandedPOCategory} onSelectPO={setSelectedPO} />
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
        {showBarcodeScanner && RESTAURANT_ID && (
          <Suspense fallback={null}>
            <BarcodeScannerModal restaurantId={RESTAURANT_ID} onClose={() => setShowBarcodeScanner(false)} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
