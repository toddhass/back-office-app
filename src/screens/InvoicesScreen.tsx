import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Camera, AlertTriangle, Plus, ArrowLeft, Search, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { bg, card, textPrimary, textMuted, accent, danger, good, mono } from "../lib/tokens";
import type { Tables } from "../lib/database.types";
import type { ReopenInvoiceResult } from "../lib/rpc-types";

type InvoiceRow = Tables<"invoices">;
type LineItemRow = Tables<"invoice_line_items">;
type SupplierRow = Tables<"suppliers">;
type InventoryItemRow = Tables<"inventory_items">;

interface PendingInvoice extends InvoiceRow {
  suppliers: { name: string } | null;
  needsReviewCount: number;
  needsVendorConfirm: boolean;
}

// _createdNew: client-only flag for a line item resolved by creating a
// brand-new inventory item during review, not yet matched to an existing
// one - never persisted, purely local UI state.
interface ReviewLineItem extends LineItemRow {
  _createdNew?: boolean;
}

interface InvoiceDetail extends InvoiceRow {
  suppliers: { name: string } | null;
}

interface HistoryInvoice extends InvoiceRow {
  suppliers: { name: string } | null;
}

interface EditingEntity {
  type: "supplier" | "item";
  id: string;
  name: string;
}

interface DeleteCheck {
  checking: boolean;
  blockedReason: string | null;
}

type ViewName = "queue" | "detail" | "history" | "historyDetail";

// raw_extraction is genuinely unstructured jsonb (whatever the extraction
// function returned) - no fixed schema Postgres could describe. This reads
// just the two fields this screen uses, without pretending the whole shape
// is known.
function getRawExtractionField(rawExtraction: unknown, field: string): unknown {
  if (rawExtraction && typeof rawExtraction === "object" && field in rawExtraction) {
    return (rawExtraction as Record<string, unknown>)[field];
  }
  return undefined;
}

function ConfidenceBar({ score }: { score: number }) {
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
  const { restaurantId: RESTAURANT_ID, session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [historyList, setHistoryList] = useState<HistoryInvoice[]>([]);
  const [historyDetail, setHistoryDetail] = useState<{ invoice: HistoryInvoice; lineItems: (LineItemRow & { inventory_items: { name: string } | null })[] } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [suppliersList, setSuppliersList] = useState<Pick<SupplierRow, "id" | "name" | "phone">[]>([]);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [addingVendor, setAddingVendor] = useState(false);
  const [addVendorError, setAddVendorError] = useState("");
  const [vendorSelection, setVendorSelection] = useState<string | null>(null); // candidate id, or 'new'
  const [showNewVendorConfirm, setShowNewVendorConfirm] = useState(false);
  const [newVendorConfirmName, setNewVendorConfirmName] = useState("");
  const [confirmingVendor, setConfirmingVendor] = useState(false);
  const [itemsList, setItemsList] = useState<Pick<InventoryItemRow, "id" | "name" | "unit" | "par_level" | "sku">[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemFormName, setNewItemFormName] = useState("");
  const [newItemFormUnit, setNewItemFormUnit] = useState("lb");
  const [newItemFormPar, setNewItemFormPar] = useState("");
  const [newItemFormSku, setNewItemFormSku] = useState("");
  const [newItemFormShelfLife, setNewItemFormShelfLife] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [addItemError, setAddItemError] = useState("");
  const [showVendorsList, setShowVendorsList] = useState(false);
  const [showItemsList, setShowItemsList] = useState(false);
  const [editingEntity, setEditingEntity] = useState<EditingEntity | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editShelfLife, setEditShelfLife] = useState("");
  const [deleteCheck, setDeleteCheck] = useState<DeleteCheck>({ checking: false, blockedReason: null });
  const [savingEdit, setSavingEdit] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenConfirming, setReopenConfirming] = useState(false);
  const [reopenSummary, setReopenSummary] = useState<ReopenInvoiceResult | null>(null);
  const [reopenError, setReopenError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [lineItems, setLineItems] = useState<ReviewLineItem[]>([]);
  const [pendingList, setPendingList] = useState<PendingInvoice[]>([]);
  const [view, setView] = useState<ViewName>("queue");
  const [cardIndex, setCardIndex] = useState(0);
  const [newItemName, setNewItemName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [invoicePhotoUrl, setInvoicePhotoUrl] = useState<string | null>(null);
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

    const counts: Record<string, number> = {};
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

  async function loadInvoiceDetail(invId: string) {
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

  async function updateLineItemValue(itemId: string, field: "quantity" | "unit_price", value: string) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    const updated: Partial<LineItemRow> = { [field]: numValue };
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

  async function loadHistoryDetail(inv: HistoryInvoice) {
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

  async function loadItems() {
    if (!RESTAURANT_ID) return;
    const { data } = await supabase
      .from("inventory_items")
      .select("id, name, unit, par_level, sku")
      .eq("restaurant_id", RESTAURANT_ID)
      .order("name", { ascending: true });
    setItemsList(data || []);
  }

  async function addItem() {
    if (!newItemFormName.trim() || !RESTAURANT_ID) return;
    setAddingItem(true);
    setAddItemError("");

    const exists = itemsList.some(
      (i) => i.name.trim().toLowerCase() === newItemFormName.trim().toLowerCase()
    );
    if (exists) {
      setAddItemError("An item with this name already exists.");
      setAddingItem(false);
      return;
    }

    const { error } = await supabase.from("inventory_items").insert({
      restaurant_id: RESTAURANT_ID,
      name: newItemFormName.trim(),
      unit: newItemFormUnit || "ea",
      par_level: newItemFormPar ? Number(newItemFormPar) : null,
      sku: newItemFormSku.trim() || null,
      shelf_life_days: newItemFormShelfLife ? Number(newItemFormShelfLife) : null,
      current_stock: 0,
    });

    if (error) {
      setAddItemError(error.message);
    } else {
      setNewItemFormName("");
      setNewItemFormUnit("lb");
      setNewItemFormPar("");
      setNewItemFormSku("");
      setNewItemFormShelfLife("");
      setShowAddItem(false);
      loadItems();
    }
    setAddingItem(false);
  }

  async function reopenInvoice(invoiceId: string) {
    setReopening(true);
    setReopenError("");
    const { data, error } = await supabase.rpc("reopen_invoice_for_correction", { p_invoice_id: invoiceId });
    if (error) {
      setReopenError(error.message);
    } else {
      setReopenSummary(data as ReopenInvoiceResult);
    }
    setReopenConfirming(false);
    setReopening(false);
  }
  async function openEditPanel(type: "supplier" | "item", id: string, name: string) {
    setEditingEntity({ type, id, name });
    setRenameValue(name);
    setDeleteCheck({ checking: true, blockedReason: null });

    if (type === "item") {
      const { data: itemRow } = await supabase.from("inventory_items").select("shelf_life_days").eq("id", id).single();
      setEditShelfLife(itemRow?.shelf_life_days != null ? String(itemRow.shelf_life_days) : "");
    }

    // Only allow deleting an entity with zero usage history - renaming is
    // always safe, but deleting something with real invoice/PO history
    // would orphan or corrupt that history. This mirrors how real
    // accounting software treats vendors/items with transaction history.
    if (type === "supplier") {
      const [{ count: invCount }, { count: poCount }] = await Promise.all([
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("supplier_id", id),
        supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("supplier_id", id),
      ]);
      const total = (invCount || 0) + (poCount || 0);
      setDeleteCheck({
        checking: false,
        blockedReason: total > 0 ? `Used in ${invCount || 0} invoice${invCount === 1 ? "" : "s"} and ${poCount || 0} purchase order${poCount === 1 ? "" : "s"} — rename instead of delete.` : null,
      });
    } else {
      const [{ count: liCount }, { count: poiCount }] = await Promise.all([
        supabase.from("invoice_line_items").select("id", { count: "exact", head: true }).eq("inventory_item_id", id),
        supabase.from("purchase_order_items").select("id", { count: "exact", head: true }).eq("inventory_item_id", id),
      ]);
      const total = (liCount || 0) + (poiCount || 0);
      setDeleteCheck({
        checking: false,
        blockedReason: total > 0 ? `Used in ${liCount || 0} invoice line item${liCount === 1 ? "" : "s"} and ${poiCount || 0} purchase order line${poiCount === 1 ? "" : "s"} — rename instead of delete.` : null,
      });
    }
  }

  async function saveRename() {
    if (!editingEntity || !renameValue.trim()) return;
    setSavingEdit(true);
    let error;
    if (editingEntity.type === "supplier") {
      ({ error } = await supabase.from("suppliers").update({ name: renameValue.trim() }).eq("id", editingEntity.id));
    } else {
      const shelfLife = editShelfLife ? Number(editShelfLife) : null;
      ({ error } = await supabase.from("inventory_items").update({ name: renameValue.trim(), shelf_life_days: shelfLife }).eq("id", editingEntity.id));
    }
    if (!error) {
      setEditingEntity(null);
      if (editingEntity.type === "supplier") loadSuppliers();
      else loadItems();
    }
    setSavingEdit(false);
  }

  async function confirmDelete() {
    if (!editingEntity || deleteCheck.blockedReason) return;
    setSavingEdit(true);
    const table = editingEntity.type === "supplier" ? "suppliers" : "inventory_items";
    const { error } = await supabase.from(table).delete().eq("id", editingEntity.id);
    if (!error) {
      setEditingEntity(null);
      if (editingEntity.type === "supplier") loadSuppliers();
      else loadItems();
    }
    setSavingEdit(false);
  }

  async function addVendor() {
    if (!newVendorName.trim() || !RESTAURANT_ID) return;
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
              loadItems();
    }
    setAddingVendor(false);
  }

  async function confirmVendorMatch(candidateId: string) {
    if (!invoice) return;
    setConfirmingVendor(true);
    const { error } = await supabase
      .from("invoices")
      .update({ supplier_id: candidateId })
      .eq("id", invoice.id);
    if (!error) {
      setInvoice((prev) => (prev ? { ...prev, supplier_id: candidateId } : prev));
      loadInvoiceDetail(invoice.id);
    }
    setConfirmingVendor(false);
  }

  async function confirmNewVendorFromInvoice() {
    if (!newVendorConfirmName.trim()) return;
    if (!invoice || !RESTAURANT_ID) { setConfirmingVendor(false); return; }
    setConfirmingVendor(true);

    const { data: created, error: createError } = await supabase
      .from("suppliers")
      .insert({ restaurant_id: RESTAURANT_ID, name: newVendorConfirmName.trim(), phone: vendorPhone.trim() || null })
      .select("id")
      .single();

    if (!createError && created) {
      await supabase.from("invoices").update({ supplier_id: created.id }).eq("id", invoice.id);
      setInvoice((prev) => (prev ? { ...prev, supplier_id: created.id } : prev));
      setVendorPhone("");
      loadSuppliers();
              loadItems();
      loadInvoiceDetail(invoice.id);
    }
    setConfirmingVendor(false);
    setShowNewVendorConfirm(false);
  }

  useEffect(() => {
    loadPendingList();
  }, [RESTAURANT_ID]);

  // Refs so the stable Realtime subscription below can always read the
  // CURRENT view/invoice without needing to tear down and resubscribe every
  // time they change (which would happen if they were effect dependencies).
  const viewRef = useRef(view);
  const invoiceRef = useRef(invoice);
  const confirmErrorRef = useRef(confirmError);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { invoiceRef.current = invoice; }, [invoice]);
  useEffect(() => { confirmErrorRef.current = confirmError; }, [confirmError]);

  // Live sync: refreshes whichever view is currently showing when the
  // underlying data changes - a new invoice arriving (another device, or
  // this one's own QR-scan/batch-upload flow finishing async), a vendor or
  // item getting renamed/deleted, or line-item matching finishing.
  useEffect(() => {
    if (!RESTAURANT_ID) return;
    const channel = supabase
      .channel(`invoices-${RESTAURANT_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `restaurant_id=eq.${RESTAURANT_ID}` }, (payload: { new?: { id?: string; status?: string; confirmed_by_email?: string } }) => {
        if (viewRef.current === "queue") loadPendingList();
        else if (viewRef.current === "history") loadHistory();
        else if (viewRef.current === "detail") {
          // The actual gap this closes: previously nothing told someone
          // sitting on an invoice's detail view that it had just been
          // confirmed elsewhere - they'd keep working on a page for an
          // invoice that no longer needed it, and if they hit Confirm
          // themselves, only found out via the atomic RPC's rejection
          // after the fact. Now it's live: if THIS invoice just moved
          // out of pending_review while being viewed, and it wasn't this
          // browser tab's own confirm action (that path already shows
          // its own message), say so immediately.
          const currentInvoiceId = invoiceRef.current?.id;
          if (currentInvoiceId && payload.new?.id === currentInvoiceId && payload.new?.status === "confirmed" && !confirmErrorRef.current) {
            setConfirmError(
              payload.new.confirmed_by_email
                ? `Just confirmed by ${payload.new.confirmed_by_email} — returning to the queue.`
                : "This invoice was just confirmed elsewhere — returning to the queue."
            );
            setTimeout(() => {
              setView("queue");
              loadPendingList();
            }, 2500);
          }
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_line_items" }, (payload: { new?: { invoice_id?: string } }) => {
        const currentInvoiceId = invoiceRef.current?.id;
        if (viewRef.current === "detail" && currentInvoiceId && payload.new?.invoice_id === currentInvoiceId) {
          loadInvoiceDetail(currentInvoiceId);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "suppliers", filter: `restaurant_id=eq.${RESTAURANT_ID}` }, () => loadSuppliers())
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items", filter: `restaurant_id=eq.${RESTAURANT_ID}` }, () => loadItems())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [RESTAURANT_ID]);

  const reviewItems = lineItems.filter((i) => i.needs_review);
  const allResolved = reviewItems.every((i) => i.inventory_item_id || i._createdNew);
  const currentItem = reviewItems[cardIndex];

  async function selectCandidate(itemId: string, candidateId: string) {
    const item = lineItems.find((i) => i.id === itemId);
    if (!item || !RESTAURANT_ID) return;

    // Same open-PO short-shipment check the automatic matcher runs -
    // a manually confirmed match deserves the same protection. Skipped
    // entirely when the vendor isn't confirmed yet - there's no open PO
    // to check against without knowing who the item came from.
    const { data: shortNote } = invoice?.supplier_id
      ? await supabase.rpc("check_short_shipment", {
          p_supplier_id: invoice.supplier_id,
          p_inventory_item_id: candidateId,
          p_invoice_qty: item?.quantity || 0,
          p_invoice_line_item_id: itemId,
        })
      : { data: null };

    const { error } = await supabase
      .from("invoice_line_items")
      .update({ inventory_item_id: candidateId, needs_review: !!shortNote, shipment_note: shortNote || null })
      .eq("id", itemId);

    if (!error) {
      // Also record this as a learned mapping for next time
      await supabase.from("item_mappings").upsert(
        {
          restaurant_id: RESTAURANT_ID,
          raw_description: item.raw_description,
          inventory_item_id: candidateId,
        },
        { onConflict: "restaurant_id,raw_description" }
      );

      // If this line item had a SKU and the matched inventory item doesn't
      // have one recorded yet, backfill it - future invoices with this same
      // code can then match instantly via SKU instead of fuzzy text.
      if (item?.sku) {
        const { data: existingItem } = await supabase
          .from("inventory_items")
          .select("sku")
          .eq("id", candidateId)
          .single();
        if (existingItem && !existingItem.sku) {
          await supabase.from("inventory_items").update({ sku: item.sku }).eq("id", candidateId);
        }
      }

      setLineItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, inventory_item_id: candidateId, needs_review: !!shortNote, shipment_note: shortNote || null } : i))
      );
    }
  }

  async function createNewItem() {
    if (!currentItem || !newItemName || !RESTAURANT_ID) return;
    const { data: created, error } = await supabase
      .from("inventory_items")
      .insert({
        restaurant_id: RESTAURANT_ID,
        name: newItemName,
        unit: currentItem.unit || "ea",
        current_stock: currentItem.quantity || 0,
        sku: currentItem.sku || null,
      })
      .select()
      .single();

    if (!error && created) {
      // A brand-new item can still be short if it happens to match an
      // inventory_item_id already referenced by an open PO - rare (a PO
      // would have to reference an item that didn't exist until just now
      // isn't possible), so this is really just for consistency/symmetry
      // with selectCandidate; in practice this will almost always be null
      // for a newly created item since no PO could reference it yet.
      const { data: shortNote } = invoice?.supplier_id
        ? await supabase.rpc("check_short_shipment", {
            p_supplier_id: invoice.supplier_id,
            p_inventory_item_id: created.id,
            p_invoice_qty: currentItem.quantity || 0,
            p_invoice_line_item_id: currentItem.id,
          })
        : { data: null };

      await supabase
        .from("invoice_line_items")
        .update({ inventory_item_id: created.id, needs_review: !!shortNote, shipment_note: shortNote || null })
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
        prev.map((i) => (i.id === currentItem.id ? { ...i, inventory_item_id: created.id, needs_review: !!shortNote, shipment_note: shortNote || null } : i))
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
    if (!invoice) return;
    setConfirmError("");
    // Single atomic call, not the previous multi-step sequence (separate
    // SELECT + UPDATE per line item, then a final invoices UPDATE) - that
    // had a real race: two people with this same invoice open, both
    // confirming close together, would both pass through and double-post
    // stock for every line item with zero warning. This RPC checks
    // status = 'pending_review' as part of the same UPDATE that flips it
    // to confirmed, so a second concurrent call safely detects it's
    // already been handled instead of quietly repeating the work.
    const { data, error } = await supabase.rpc("confirm_invoice_and_post", { p_invoice_id: invoice.id });
    if (error) {
      setConfirmError("Something went wrong confirming this invoice — try again.");
      return;
    }
    const result = data as { confirmed: boolean; reason?: string; items_posted?: number };
    if (!result.confirmed) {
      setConfirmError(
        result.reason === "already_confirmed"
          ? "This invoice was just confirmed — likely by someone else. Returning to the queue."
          : "Couldn't confirm this invoice — it may have been removed."
      );
      setTimeout(() => {
        setView("queue");
        loadPendingList();
      }, 2000);
      return;
    }
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
            <button
              onClick={() => setShowVendorsList((s) => !s)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: textMuted }}
            >
              Vendors ({suppliersList.length}) {showVendorsList ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <button
              onClick={() => {
                setShowAddVendor((s) => !s);
                setAddVendorError("");
                setShowVendorsList(true);
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

          {showVendorsList && suppliersList.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 220, overflowY: "auto" }}>
              {suppliersList.map((s) => {
                const active = historySearch.trim().toLowerCase() === s.name.trim().toLowerCase();
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", background: active ? accent : "#F1F4F8", border: active ? `1px solid ${accent}` : "1px solid #E2E6ED", borderRadius: 20, overflow: "hidden" }}>
                    <button
                      onClick={() => setHistorySearch(active ? "" : s.name)}
                      style={{
                        fontSize: 12,
                        color: active ? "#FFFFFF" : textMuted,
                        background: "none",
                        border: "none",
                        padding: "5px 4px 5px 12px",
                        fontWeight: active ? 700 : 400,
                        cursor: "pointer",
                      }}
                    >
                      {s.name}{s.phone ? ` · ${s.phone}` : ""}
                    </button>
                    <button
                      onClick={() => openEditPanel("supplier", s.id, s.name)}
                      style={{ background: "none", border: "none", padding: "5px 10px 5px 4px", cursor: "pointer", color: active ? "#FFFFFF" : textMuted }}
                    >
                      <Pencil size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: "8px 16px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <button
              onClick={() => setShowItemsList((s) => !s)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: textMuted }}
            >
              Inventory Items ({itemsList.length}) {showItemsList ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <button
              onClick={() => {
                setShowAddItem((s) => !s);
                setAddItemError("");
                setShowItemsList(true);
              }}
              style={{ background: "none", border: "none", color: accent, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
            >
              <Plus size={13} /> Add item
            </button>
          </div>

          {showAddItem && (
            <div style={{ background: card, border: "1px solid #E2E6ED", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <input
                placeholder="Item name"
                value={newItemFormName}
                onChange={(e) => setNewItemFormName(e.target.value)}
                style={{ width: "100%", background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "8px 10px", color: textPrimary, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <select
                  value={newItemFormUnit}
                  onChange={(e) => setNewItemFormUnit(e.target.value)}
                  style={{ flex: 1, background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "8px 10px", color: textPrimary, fontSize: 13 }}
                >
                  {["lb", "case", "ea", "gal", "cs", "bag", "dz"].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Par level (optional)"
                  value={newItemFormPar}
                  onChange={(e) => setNewItemFormPar(e.target.value)}
                  style={{ flex: 1, background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "8px 10px", color: textPrimary, fontSize: 13, fontFamily: mono }}
                />
              </div>
              <input
                placeholder="SKU (optional)"
                value={newItemFormSku}
                onChange={(e) => setNewItemFormSku(e.target.value)}
                style={{ width: "100%", background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "8px 10px", color: textPrimary, fontSize: 13, marginBottom: 8, boxSizing: "border-box", fontFamily: mono }}
              />
              <input
                type="number"
                placeholder="Shelf life in days (optional)"
                value={newItemFormShelfLife}
                onChange={(e) => setNewItemFormShelfLife(e.target.value)}
                style={{ width: "100%", background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "8px 10px", color: textPrimary, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
              />
              {addItemError && <div style={{ color: danger, fontSize: 12, marginBottom: 8 }}>{addItemError}</div>}
              <button
                onClick={addItem}
                disabled={!newItemFormName.trim() || addingItem}
                style={{
                  width: "100%",
                  background: newItemFormName.trim() ? accent : "#D6DCE5",
                  border: "none",
                  borderRadius: 6,
                  padding: "9px 12px",
                  color: "#FFFFFF",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: newItemFormName.trim() ? "pointer" : "not-allowed",
                }}
              >
                {addingItem ? "Adding…" : "Save item"}
              </button>
            </div>
          )}

          {showItemsList && itemsList.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 220, overflowY: "auto" }}>
              {itemsList.map((it) => (
                <div key={it.id} style={{ display: "flex", alignItems: "center", background: "#F1F4F8", border: "1px solid #E2E6ED", borderRadius: 20, overflow: "hidden" }}>
                  <span style={{ fontSize: 12, color: textMuted, padding: "5px 4px 5px 12px" }}>
                    {it.name} ({it.unit}){it.par_level != null ? ` · par ${it.par_level}` : ""}
                  </span>
                  <button
                    onClick={() => openEditPanel("item", it.id, it.name)}
                    style={{ background: "none", border: "none", padding: "5px 10px 5px 4px", cursor: "pointer", color: textMuted }}
                  >
                    <Pencil size={11} />
                  </button>
                </div>
              ))}
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
                  {new Date(inv.confirmed_at || inv.created_at || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {inv.confirmed_by_email && ` · ${inv.confirmed_by_email}`}
                </div>
              </div>
              <div style={{ fontFamily: mono, fontSize: 14, color: accent }}>${Number(inv.invoice_total || 0).toFixed(2)}</div>
            </button>
          ))}
        </div>

        {editingEntity && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "backdropFadeIn 0.15s ease-out" }}>
            <div style={{ background: "#FFFFFF", borderRadius: 12, padding: 20, width: "100%", maxWidth: 340, animation: "modalPopIn 0.25s ease-out" }}>
              <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: textMuted, marginBottom: 4 }}>
                {editingEntity.type === "supplier" ? "Edit vendor" : "Edit item"}
              </div>
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                style={{ width: "100%", background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "10px 12px", color: textPrimary, fontSize: 14, marginTop: 8, marginBottom: editingEntity.type === "item" ? 8 : 14, boxSizing: "border-box" }}
              />

              {editingEntity.type === "item" && (
                <input
                  type="number"
                  placeholder="Shelf life in days (optional)"
                  value={editShelfLife}
                  onChange={(e) => setEditShelfLife(e.target.value)}
                  style={{ width: "100%", background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "10px 12px", color: textPrimary, fontSize: 14, marginBottom: 14, boxSizing: "border-box" }}
                />
              )}

              <button
                onClick={saveRename}
                disabled={savingEdit || !renameValue.trim()}
                style={{ width: "100%", background: accent, border: "none", borderRadius: 8, padding: "11px", color: "#FFFFFF", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 8 }}
              >
                {savingEdit ? "Saving…" : "Save name"}
              </button>

              {deleteCheck.checking ? (
                <div style={{ fontSize: 12, color: textMuted, textAlign: "center", padding: 8 }}>Checking usage…</div>
              ) : deleteCheck.blockedReason ? (
                <div style={{ fontSize: 11, color: textMuted, textAlign: "center", padding: "4px 4px 0" }}>{deleteCheck.blockedReason}</div>
              ) : (
                <button
                  onClick={confirmDelete}
                  disabled={savingEdit}
                  style={{ width: "100%", background: "none", border: `1px solid ${danger}`, borderRadius: 8, padding: "11px", color: danger, fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                >
                  Delete — unused, safe to remove
                </button>
              )}

              <button
                onClick={() => setEditingEntity(null)}
                style={{ width: "100%", background: "none", border: "none", padding: "10px", color: textMuted, fontSize: 13, cursor: "pointer", marginTop: 4 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
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

        {!reopenSummary && (
          <div style={{ padding: "0 16px 20px" }}>
            {!reopenConfirming ? (
              <button
                onClick={() => setReopenConfirming(true)}
                style={{ width: "100%", background: "none", border: "1px solid #E2E6ED", borderRadius: 8, padding: "11px", color: textMuted, fontSize: 13, cursor: "pointer" }}
              >
                Reopen for correction
              </button>
            ) : (
              <div style={{ background: "#FDECEC", border: "1px solid #F3B8B8", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 12, color: textPrimary, marginBottom: 10 }}>
                  This will reverse the stock and any purchase-order credit this invoice added, and put it back in your review queue to fix. This can't be undone.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setReopenConfirming(false)}
                    style={{ flex: 1, background: "none", border: "1px solid #E2E6ED", borderRadius: 8, padding: "10px", color: textMuted, fontSize: 13, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => reopenInvoice(histInv.id)}
                    disabled={reopening}
                    style={{ flex: 1, background: danger, border: "none", borderRadius: 8, padding: "10px", color: "#FFFFFF", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    {reopening ? "Reopening…" : "Yes, reopen it"}
                  </button>
                </div>
                {reopenError && <div style={{ color: danger, fontSize: 12, marginTop: 8 }}>{reopenError}</div>}
              </div>
            )}
          </div>
        )}

        {reopenSummary && (
          <div style={{ margin: "0 16px 20px", background: "#E7F0FA", border: `1px solid ${accent}`, borderRadius: 8, padding: 14, animation: "bannerSlideIn 0.25s ease-out" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginBottom: 8 }}>Reopened for correction</div>
            {(reopenSummary.reversed_items || []).map((r, idx) => (
              <div key={idx} style={{ fontSize: 12, color: textPrimary, marginBottom: 2 }}>
                Reversed {r.quantity_reversed} of {r.name}{r.clamped ? " (stock had already dropped further, so we reversed as much as was actually there)" : ""}
              </div>
            ))}
            {(reopenSummary.po_adjustments || []).map((p, idx) => (
              <div key={idx} style={{ fontSize: 12, color: textMuted, marginBottom: 2 }}>
                {p.po_number}: released {p.quantity_reversed} {p.item_name} back to open
              </div>
            ))}
            <button
              onClick={() => { setReopenSummary(null); setView("history"); loadHistory(); }}
              style={{ width: "100%", marginTop: 10, background: accent, border: "none", borderRadius: 8, padding: "10px", color: "#FFFFFF", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              Done — find it in the review queue
            </button>
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
              loadItems();
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
              loadItems();
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
    const rawName = (getRawExtractionField(invoice.raw_extraction, "supplier_name") as string | undefined) || "Unknown";
    const candidates = (getRawExtractionField(invoice.raw_extraction, "supplier_candidates") as { id: string; name: string }[] | undefined) || [];
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
              onClick={() => vendorSelection && confirmVendorMatch(vendorSelection)}
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
            {currentItem.sku && (
              <div style={{ fontFamily: mono, fontSize: 11, color: textMuted, marginBottom: 4 }}>SKU {currentItem.sku}</div>
            )}
            {currentItem.shipment_note && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6, background: "#E7F0FA", border: "1px solid #BFDCF0", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontSize: 12, color: accent, animation: "bannerSlideIn 0.25s ease-out" }}>
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
                  defaultValue={currentItem.quantity ?? ""}
                  onBlur={(e) => updateLineItemValue(currentItem.id, "quantity", e.target.value)}
                  style={{ width: 60, background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "6px 8px", color: textPrimary, fontSize: 13 }}
                />
                <span style={{ color: textMuted, fontSize: 13 }}>{currentItem.unit} @ $</span>
                <input
                  type="number"
                  step="0.01"
                  defaultValue={currentItem.unit_price ?? ""}
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

            {(() => {
              // match_candidates is jsonb (an array of AI-suggested matches
              // with a confidence score) - genuinely unstructured from
              // Postgres's point of view, cast here to the real shape this
              // screen has always expected from the matching function.
              const matchCandidates = (currentItem.match_candidates || []) as { id: string; name: string; score: number }[];
              return matchCandidates.length === 0 ? (
              <div style={{ fontSize: 13, color: textMuted, marginBottom: 12 }}>No close match found — likely a new item.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {matchCandidates.map((c) => (
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
              );
            })()}

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
        {confirmError && <div style={{ color: danger, fontSize: 12, marginBottom: 8, textAlign: "center" }}>{confirmError}</div>}
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
