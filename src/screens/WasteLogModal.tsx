import { useRef, useState } from "react";
import { X, Camera, Loader2, Trash2, CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { card, textPrimary, textMuted, accent, danger, good, mono, sans } from "../lib/tokens";

interface InventoryMatch {
  id: string;
  name: string;
  score: number;
}

interface DetectedItem {
  description: string;
  quantity: number;
  unit: string;
  suggested_match: InventoryMatch | null;
  // Editable state, separate from what the AI originally returned - the
  // manager can correct any of this before anything gets logged.
  selectedInventoryId: string | null;
  logged: boolean;
  loggedResult?: { item_name: string; estimated_value: number | null };
}

interface InventoryItemLite {
  id: string;
  name: string;
  unit: string;
}

// Reuses the exact same Gemini-vision-photo pattern already proven on
// invoices (CaptureScreen), pointed at a different real problem: logging
// actual food waste instead of reading printed invoice text. Nothing
// auto-commits - every detected item is shown for review, with an
// editable quantity and a real dropdown of inventory items (pre-selected
// to the AI's best guess only when it's reasonably confident), and only
// gets written to the database when the manager explicitly logs it.
export default function WasteLogModal({ restaurantId, onClose }: { restaurantId: string; onClose: () => void }) {
  const { session } = useAuth();
  const [status, setStatus] = useState<"idle" | "uploading" | "processing" | "review" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [items, setItems] = useState<DetectedItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemLite[]>([]);
  const [loggingIndex, setLoggingIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("uploading");
    setErrorMsg("");

    const path = `${restaurantId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("waste-photos").upload(path, file);
    if (uploadError) {
      setErrorMsg(uploadError.message);
      setStatus("error");
      return;
    }

    setStatus("processing");
    const { data: invItems } = await supabase.from("inventory_items").select("id, name, unit").eq("restaurant_id", restaurantId).order("name");
    setInventoryItems(invItems || []);

    const { data, error: fnError } = await supabase.functions.invoke("extract-waste", {
      body: { restaurant_id: restaurantId, storage_path: path },
    });

    if (fnError || !data?.items) {
      let detail = "Couldn't read that photo — try again.";
      try {
        if (fnError?.context && typeof fnError.context.json === "function") {
          const body = await fnError.context.json();
          detail = body?.error || detail;
        }
      } catch {
        // fall back to generic message
      }
      setErrorMsg(detail);
      setStatus("error");
      return;
    }

    setItems(
      data.items.map((it: { description: string; quantity: number; unit: string; suggested_match: InventoryMatch | null }) => ({
        ...it,
        selectedInventoryId: it.suggested_match && it.suggested_match.score >= 0.5 ? it.suggested_match.id : null,
        logged: false,
      }))
    );
    setStatus("review");
  }

  function updateItem(index: number, updates: Partial<DetectedItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...updates } : it)));
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function logItem(index: number) {
    const item = items[index];
    setLoggingIndex(index);
    const invItem = inventoryItems.find((i) => i.id === item.selectedInventoryId);
    const { data: result } = await supabase.rpc("log_waste", {
      p_restaurant_id: restaurantId,
      p_inventory_item_id: item.selectedInventoryId,
      p_item_name_raw: item.description,
      p_quantity: item.quantity,
      p_unit: invItem?.unit || item.unit,
      p_photo_url: null,
      p_logged_by_email: session?.user?.email ?? "",
    });
    const typed = result as { logged: boolean; item_name?: string; estimated_value?: number | null } | null;
    if (typed?.logged) {
      updateItem(index, { logged: true, loggedResult: { item_name: typed.item_name || item.description, estimated_value: typed.estimated_value ?? null } });
    }
    setLoggingIndex(null);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1500, display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: sans }}>
      <div style={{ background: "#FFFFFF", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 480, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid #E2E6ED" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: textPrimary }}>Log food waste</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: textMuted, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
          {status === "idle" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 13, color: textMuted, textAlign: "center" }}>
                Snap a photo of what's being thrown out — AI identifies it and estimates the quantity.
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ display: "flex", alignItems: "center", gap: 8, background: accent, border: "none", borderRadius: 10, padding: "14px 20px", color: "#FFFFFF", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >
                <Camera size={18} /> Take or choose a photo
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} style={{ display: "none" }} />
            </div>
          )}

          {(status === "uploading" || status === "processing") && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "36px 0" }}>
              <Loader2 size={28} color={accent} style={{ animation: "spin 1s linear infinite" }} />
              <div style={{ fontSize: 13, color: textMuted }}>{status === "uploading" ? "Uploading…" : "Reading photo…"}</div>
            </div>
          )}

          {status === "error" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 13, color: danger, textAlign: "center" }}>{errorMsg}</div>
              <button
                onClick={() => setStatus("idle")}
                style={{ background: "none", border: "1px solid #E2E6ED", borderRadius: 8, padding: "10px 18px", color: textMuted, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                Try again
              </button>
            </div>
          )}

          {status === "review" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {items.length === 0 && <div style={{ fontSize: 13, color: textMuted, textAlign: "center", padding: 20 }}>Nothing left to log.</div>}
              {items.map((item, i) => (
                <div key={i} style={{ background: item.logged ? "#E6F4EC" : card, border: `1px solid ${item.logged ? "#BFE3D0" : "#E2E6ED"}`, borderRadius: 10, padding: "12px 14px" }}>
                  {item.logged ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: good }}>
                      <CheckCircle2 size={16} />
                      Logged {item.quantity} {item.unit} of {item.loggedResult?.item_name}
                      {item.loggedResult?.estimated_value != null && ` — ~$${item.loggedResult.estimated_value.toFixed(2)} lost`}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{item.description}</div>
                        <button onClick={() => removeItem(i)} style={{ background: "none", border: "none", cursor: "pointer", color: textMuted, padding: 0 }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                          style={{ width: 64, background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "8px 10px", fontSize: 13, fontFamily: mono, color: textPrimary }}
                        />
                        <span style={{ fontSize: 12, color: textMuted, alignSelf: "center" }}>{item.unit} (estimated)</span>
                      </div>
                      <select
                        value={item.selectedInventoryId || ""}
                        onChange={(e) => updateItem(i, { selectedInventoryId: e.target.value || null })}
                        style={{ width: "100%", background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: textPrimary, marginBottom: 10 }}
                      >
                        <option value="">Not in inventory / unmatched</option>
                        {inventoryItems.map((inv) => (
                          <option key={inv.id} value={inv.id}>{inv.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => logItem(i)}
                        disabled={loggingIndex === i}
                        style={{ width: "100%", background: danger, border: "none", borderRadius: 8, padding: 10, color: "#FFFFFF", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: loggingIndex === i ? 0.6 : 1 }}
                      >
                        {loggingIndex === i ? "Logging…" : "Log as waste"}
                      </button>
                    </>
                  )}
                </div>
              ))}
              <button
                onClick={() => { setStatus("idle"); setItems([]); }}
                style={{ background: "none", border: "1px solid #E2E6ED", borderRadius: 8, padding: "10px", color: textMuted, fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 4 }}
              >
                Log another photo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
