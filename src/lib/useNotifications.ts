import { useEffect, useState, useCallback, useRef } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import type { Tables } from "./database.types";

let nextId = 1;

type InvoiceRow = Tables<"invoices">;
type PurchaseOrderRow = Tables<"purchase_orders">;
type InventoryItemRow = Tables<"inventory_items">;
type InvoiceLineItemRow = Tables<"invoice_line_items">;

type ToastTone = "success" | "info" | "warning";
interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

// One shared subscription per restaurant, mounted at the App level so
// notifications fire no matter which tab (Home/Capture/Invoices/Reorder)
// is currently active - not tied to any single screen being open.
//
// This is in-app "toast" notification, not OS-level push. True push
// (alerts with the tab closed or phone locked) needs a service worker +
// Web Push API + VAPID key infrastructure - a separate, bigger project.
// This covers "something happened, tell me while I'm using the app."
export function useNotifications(restaurantId: string | null) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenPOIds = useRef(new Set<string>());

  const pushToast = useCallback((text: string, tone: ToastTone = "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, text, tone }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!restaurantId) return;

    const channel = supabase
      .channel(`notifications-${restaurantId}`)
      // New invoice arrived and needs review
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "invoices", filter: `restaurant_id=eq.${restaurantId}` },
        (payload: RealtimePostgresChangesPayload<InvoiceRow>) => {
          if (payload.new && "status" in payload.new && payload.new.status === "pending_review") {
            pushToast(`New invoice ready to review — ${payload.new.invoice_number || "no number"}.`, "info");
          }
        }
      )
      // A purchase order was created (manual Mark Sent, or the auto-PO feature)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "purchase_orders", filter: `restaurant_id=eq.${restaurantId}` },
        async (payload: RealtimePostgresChangesPayload<PurchaseOrderRow>) => {
          if (!payload.new || !("id" in payload.new)) return;
          if (seenPOIds.current.has(payload.new.id)) return;
          seenPOIds.current.add(payload.new.id);
          const { data: supplier } = await supabase.from("suppliers").select("name").eq("id", payload.new.supplier_id).maybeSingle();
          pushToast(`${payload.new.po_number} created${supplier ? ` — ${supplier.name}` : ""}.`, "success");
        }
      )
      // An item just crossed below par (wasn't before, is now) - only fires
      // on the actual crossing, not every subsequent stock change while
      // already below par, thanks to replica identity full giving us the
      // real old row to compare against.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "inventory_items", filter: `restaurant_id=eq.${restaurantId}` },
        (payload: RealtimePostgresChangesPayload<InventoryItemRow>) => {
          const before = payload.old;
          const after = payload.new;
          if (!after || !("par_level" in after) || after.par_level == null) return;
          const beforeParLevel = before && "par_level" in before ? before.par_level : null;
          const beforeCurrentStock = before && "current_stock" in before ? before.current_stock : null;
          const wasAbove = beforeParLevel == null || Number(beforeCurrentStock) > Number(beforeParLevel);
          const isBelowNow = Number(after.current_stock) <= Number(after.par_level);
          if (wasAbove && isBelowNow) {
            pushToast(`${after.name} just dropped below par (${after.current_stock}/${after.par_level}).`, "warning");
          }
        }
      )
      // A dish just became impossible to make - stock of one of its recipe
      // ingredients dropped below the quantity a single serving actually
      // needs. Only fires on the actual crossing (had enough before, don't
      // now), same "crossed" discipline as the par-level check above - a
      // dish that's already unmakeable doesn't re-notify on every further
      // depletion of the same ingredient.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "inventory_items", filter: `restaurant_id=eq.${restaurantId}` },
        async (payload: RealtimePostgresChangesPayload<InventoryItemRow>) => {
          const before = payload.old;
          const after = payload.new;
          if (!after || !("id" in after) || !("current_stock" in after)) return;
          const beforeStock = before && "current_stock" in before && before.current_stock != null ? Number(before.current_stock) : null;
          if (beforeStock == null) return;
          const afterStock = Number(after.current_stock);
          if (afterStock >= beforeStock) return; // only relevant when stock went down

          const { data: uses } = await supabase
            .from("recipe_ingredients")
            .select("quantity, menu_items(name)")
            .eq("inventory_item_id", after.id);

          for (const use of uses || []) {
            const needed = Number(use.quantity);
            const wasMakeable = beforeStock >= needed;
            const isMakeableNow = afterStock >= needed;
            if (wasMakeable && !isMakeableNow && use.menu_items?.name) {
              pushToast(`${use.menu_items.name} can't be made — out of ${after.name}.`, "warning");
            }
          }
        }
      )
      .subscribe();

    // invoice_line_items has no restaurant_id to filter server-side, so this
    // listens unfiltered and checks the transition client-side instead.
    const lineItemChannel = supabase
      .channel(`notifications-line-items-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "invoice_line_items" },
        (payload: RealtimePostgresChangesPayload<InvoiceLineItemRow>) => {
          const wasShort = !!(payload.old && "shipment_note" in payload.old && payload.old.shipment_note);
          const isShortNow = !!(payload.new && "shipment_note" in payload.new && payload.new.shipment_note);
          if (!wasShort && isShortNow && payload.new && "shipment_note" in payload.new) {
            pushToast(`Short shipment flagged: ${payload.new.shipment_note}`, "warning");
          }
        }
      )
      // A line item just became matched-and-priced (either at extraction
      // time, or once match-line-items assigns inventory_item_id
      // afterward) - real price history already exists per item from
      // every past invoice, nobody was actually looking at it changing
      // over time. Fires once per real transition (wasn't matched+priced
      // before, is now), not on every subsequent edit to an already-priced
      // line, avoiding a repeat alert for the same real event.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoice_line_items" },
        async (payload: RealtimePostgresChangesPayload<InvoiceLineItemRow>) => {
          const before = payload.old;
          const after = payload.new;
          if (!after || !("inventory_item_id" in after) || !("unit_price" in after)) return;
          const wasPriced = !!(before && "inventory_item_id" in before && before.inventory_item_id && "unit_price" in before && before.unit_price != null);
          const isPricedNow = !!(after.inventory_item_id && after.unit_price != null);
          if (wasPriced || !isPricedNow) return;
          // Narrowed into their own consts - TypeScript can't carry the
          // null-check from the isPricedNow boolean back onto
          // after.inventory_item_id/after.unit_price directly.
          const inventoryItemId: string = after.inventory_item_id!;
          const newPriceValue: number = after.unit_price!;

          const { data: prior } = await supabase
            .from("invoice_line_items")
            .select("unit_price, invoices!inner(invoice_date, restaurant_id)")
            .eq("inventory_item_id", inventoryItemId)
            .eq("invoices.restaurant_id", restaurantId)
            .not("unit_price", "is", null)
            .neq("id", after.id)
            .order("invoice_date", { foreignTable: "invoices", ascending: false })
            .limit(1)
            .maybeSingle();

          if (!prior?.unit_price) return; // no prior price to compare against yet
          const priorPrice = Number(prior.unit_price);
          const newPrice = Number(newPriceValue);
          if (priorPrice <= 0) return;
          const pctChange = ((newPrice - priorPrice) / priorPrice) * 100;

          if (Math.abs(pctChange) >= 10) {
            const { data: item } = await supabase.from("inventory_items").select("name").eq("id", inventoryItemId).maybeSingle();
            const direction = pctChange > 0 ? "up" : "down";
            pushToast(
              `${item?.name || "An item"}'s price is ${direction} ${Math.abs(Math.round(pctChange))}% — $${priorPrice.toFixed(2)} → $${newPrice.toFixed(2)}.`,
              pctChange > 0 ? "warning" : "success"
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(lineItemChannel);
    };
  }, [restaurantId, pushToast]);

  return { toasts, dismissToast };
}
