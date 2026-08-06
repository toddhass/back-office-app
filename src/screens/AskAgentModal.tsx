import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Loader2, PackagePlus } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { card, textPrimary, textMuted, accent, good, sans, mono } from "../lib/tokens";
import type { AutoCreatePOResult, CreatePOWithSupplierResult } from "../lib/rpc-types";

interface ProposedAction {
  type: "place_order";
  item_id: string;
  item_name: string;
  current_stock: number | null;
  par_level: number | null;
  unit: string;
}

interface ChatMessage {
  role: "user" | "agent";
  text: string;
  proposedAction?: ProposedAction;
  actionStatus?: "pending" | "confirmed" | "dismissed";
  actionResultText?: string;
}

interface AskAgentModalProps {
  restaurantId: string;
  healthyPercent: number | null;
  onClose: () => void;
}

// The agent can now PROPOSE placing an order (see ask-agent/index.ts), but
// this component is the actual safety boundary in practice: nothing gets
// created until the person taps Confirm below, and even then it's this
// same, already-tested auto_create_po_if_needed / vendor-picker flow doing
// the real work - not the LLM. The LLM only ever supplied an item_id that
// the edge function already resolved against a real inventory_items row.
export default function AskAgentModal({ restaurantId, healthyPercent, onClose }: AskAgentModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);
  const [vendorPickerFor, setVendorPickerFor] = useState<{ index: number; itemId: string } | null>(null);
  const [vendorPickerList, setVendorPickerList] = useState<{ id: string; name: string }[]>([]);
  const [vendorPickerLoading, setVendorPickerLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, asking]);

  const suggestions = [
    healthyPercent != null ? `Why is my inventory health at ${healthyPercent}%?` : "How's my inventory looking?",
    "What should I be worried about today?",
    "What's about to expire?",
  ];

  async function ask(question: string) {
    if (!question.trim() || asking) return;
    setError("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setAsking(true);

    const { data, error: fnError } = await supabase.functions.invoke("ask-agent", {
      body: { restaurant_id: restaurantId, question },
    });

    if (fnError || !data?.answer) {
      setError("Couldn't get an answer just now — try again in a moment.");
      setAsking(false);
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "agent",
        text: data.answer,
        proposedAction: data.proposed_action || undefined,
        actionStatus: data.proposed_action ? "pending" : undefined,
      },
    ]);
    setAsking(false);
  }

  function updateMessage(index: number, updates: Partial<ChatMessage>) {
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, ...updates } : m)));
  }

  async function confirmOrder(index: number) {
    const msg = messages[index];
    if (!msg.proposedAction) return;
    setConfirmingIndex(index);

    const { data: result } = await supabase.rpc("auto_create_po_if_needed", { p_inventory_item_id: msg.proposedAction.item_id });
    const typed = result as AutoCreatePOResult | null;

    if (typed?.created) {
      updateMessage(index, { actionStatus: "confirmed", actionResultText: `${typed.po_number} created — ordered ${typed.quantity} ${typed.unit} of ${typed.item_name} from ${typed.supplier_name}.` });
    } else if (typed?.reason === "no_known_supplier") {
      setVendorPickerLoading(true);
      setVendorPickerFor({ index, itemId: msg.proposedAction.item_id });
      const { data: suppliers } = await supabase.from("suppliers").select("id, name").eq("restaurant_id", restaurantId).order("name");
      setVendorPickerList(suppliers || []);
      setVendorPickerLoading(false);
    } else if (typed?.reason === "already_open") {
      updateMessage(index, { actionStatus: "confirmed", actionResultText: "There's already an open order for this item — nothing new created." });
    } else {
      updateMessage(index, { actionStatus: "confirmed", actionResultText: "This item isn't actually below par right now, so no order was needed." });
    }
    setConfirmingIndex(null);
  }

  async function assignSupplierAndCreatePO(supplierId: string) {
    if (!vendorPickerFor) return;
    setVendorPickerLoading(true);
    const { data: result } = await supabase.rpc("create_po_for_item_with_supplier", {
      p_inventory_item_id: vendorPickerFor.itemId,
      p_supplier_id: supplierId,
    });
    const typed = result as CreatePOWithSupplierResult | null;
    if (typed?.created) {
      updateMessage(vendorPickerFor.index, { actionStatus: "confirmed", actionResultText: `${typed.po_number} created — ordered ${typed.quantity} ${typed.unit} of ${typed.item_name} from ${typed.supplier_name}.` });
    } else {
      updateMessage(vendorPickerFor.index, { actionStatus: "confirmed", actionResultText: "Couldn't create the order — try again from the Reorder screen." });
    }
    setVendorPickerLoading(false);
    setVendorPickerFor(null);
  }

  function dismissAction(index: number) {
    updateMessage(index, { actionStatus: "dismissed" });
  }

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "backdropFadeIn 0.15s ease-out" }}>
      <div
        style={{
          background: card,
          borderRadius: 16,
          width: "100%",
          maxWidth: 480,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          animation: "modalPopIn 0.25s ease-out",
          fontFamily: sans,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid #E2E6ED" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={17} color={accent} />
            <span style={{ fontWeight: 700, fontSize: 15, color: textPrimary }}>Ask about your business</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: textMuted, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          {messages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13, color: textMuted, marginBottom: 4 }}>
                Ask anything about your current inventory, orders, or invoices — answers are grounded in your real, live data. You can also ask me to place an order for a specific item.
              </div>
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  style={{ textAlign: "left", background: "#F1F4F8", border: "1px solid #E2E6ED", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: textPrimary, cursor: "pointer" }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", gap: 8 }}>
              <div
                style={{
                  background: m.role === "user" ? accent : "#F1F4F8",
                  color: m.role === "user" ? "#FFFFFF" : textPrimary,
                  borderRadius: 12,
                  padding: "10px 13px",
                  fontSize: 14,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.text}
              </div>

              {m.proposedAction && m.actionStatus === "pending" && (
                <div style={{ background: "#FFFFFF", border: `1px solid ${accent}`, borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: accent, marginBottom: 4 }}>
                    <PackagePlus size={14} /> Place an order for {m.proposedAction.item_name}?
                  </div>
                  <div style={{ fontSize: 12, color: textMuted, fontFamily: mono, marginBottom: 10 }}>
                    Currently {m.proposedAction.current_stock ?? 0} / {m.proposedAction.par_level ?? "no par"} {m.proposedAction.unit}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => dismissAction(i)}
                      style={{ flex: 1, background: "none", border: "1px solid #E2E6ED", borderRadius: 8, padding: "8px", color: textMuted, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => confirmOrder(i)}
                      disabled={confirmingIndex === i}
                      style={{ flex: 1, background: accent, border: "none", borderRadius: 8, padding: "8px", color: "#FFFFFF", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: confirmingIndex === i ? 0.6 : 1 }}
                    >
                      {confirmingIndex === i ? "Placing…" : "Confirm order"}
                    </button>
                  </div>
                </div>
              )}

              {m.actionStatus === "confirmed" && m.actionResultText && (
                <div style={{ background: "#E6F4EC", border: "1px solid #BFE3D0", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: good }}>
                  {m.actionResultText}
                </div>
              )}

              {vendorPickerFor?.index === i && (
                <div style={{ background: "#FFFFFF", border: `1px solid ${accent}`, borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 13, color: textPrimary, marginBottom: 8 }}>No supplier on file for this item yet — who should this go to?</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
                    {vendorPickerLoading && <div style={{ fontSize: 13, color: textMuted, textAlign: "center", padding: 8 }}>Loading…</div>}
                    {!vendorPickerLoading && vendorPickerList.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => assignSupplierAndCreatePO(s.id)}
                        style={{ textAlign: "left", background: "#F1F4F8", border: "1px solid #E2E6ED", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: textPrimary, cursor: "pointer" }}
                      >
                        {s.name}
                      </button>
                    ))}
                    {!vendorPickerLoading && vendorPickerList.length === 0 && (
                      <div style={{ fontSize: 12, color: textMuted, textAlign: "center", padding: 8 }}>No vendors on file yet — add one in Invoices → History.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {asking && (
            <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, color: textMuted, fontSize: 13 }}>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              Thinking…
            </div>
          )}

          {error && <div style={{ fontSize: 12, color: "#B23B3B" }}>{error}</div>}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 14px", borderTop: "1px solid #E2E6ED" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(input)}
            placeholder="Ask a question…"
            style={{ flex: 1, background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 20, padding: "10px 16px", fontSize: 14, color: textPrimary, boxSizing: "border-box" }}
          />
          <button
            onClick={() => ask(input)}
            disabled={asking || !input.trim()}
            style={{ background: accent, border: "none", borderRadius: "50%", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, opacity: asking || !input.trim() ? 0.5 : 1 }}
          >
            <Send size={16} color="#FFFFFF" />
          </button>
        </div>
      </div>
    </div>
  );
}
