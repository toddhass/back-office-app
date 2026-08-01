import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";

let nextId = 1;

// One shared subscription per restaurant, mounted at the App level so
// notifications fire no matter which tab (Home/Capture/Invoices/Reorder)
// is currently active - not tied to any single screen being open.
//
// This is in-app "toast" notification, not OS-level push. True push
// (alerts with the tab closed or phone locked) needs a service worker +
// Web Push API + VAPID key infrastructure - a separate, bigger project.
// This covers "something happened, tell me while I'm using the app."
export function useNotifications(restaurantId) {
  const [toasts, setToasts] = useState([]);
  const seenPOIds = useRef(new Set());

  const pushToast = useCallback((text, tone = "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 7000);
  }, []);

  const dismissToast = useCallback((id) => {
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
        (payload) => {
          if (payload.new?.status === "pending_review") {
            pushToast(`New invoice ready to review — ${payload.new.invoice_number || "no number"}.`, "info");
          }
        }
      )
      // A purchase order was created (manual Mark Sent, or the auto-PO feature)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "purchase_orders", filter: `restaurant_id=eq.${restaurantId}` },
        async (payload) => {
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
        (payload) => {
          const before = payload.old;
          const after = payload.new;
          if (after.par_level == null) return;
          const wasAbove = before.par_level == null || Number(before.current_stock) > Number(before.par_level);
          const isBelowNow = Number(after.current_stock) <= Number(after.par_level);
          if (wasAbove && isBelowNow) {
            pushToast(`${after.name} just dropped below par (${after.current_stock}/${after.par_level}).`, "warning");
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
        (payload) => {
          const wasShort = !!payload.old?.shipment_note;
          const isShortNow = !!payload.new?.shipment_note;
          if (!wasShort && isShortNow) {
            pushToast(`Short shipment flagged: ${payload.new.shipment_note}`, "warning");
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
