import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { card, textPrimary, textMuted, accent, sans, mono } from "../lib/tokens";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

interface AskAgentModalProps {
  restaurantId: string;
  healthyPercent: number | null;
  onClose: () => void;
}

export default function AskAgentModal({ restaurantId, healthyPercent, onClose }: AskAgentModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
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

    setMessages((prev) => [...prev, { role: "agent", text: data.answer }]);
    setAsking(false);
  }

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1500, display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "backdropFadeIn 0.15s ease-out" }}>
      <div
        style={{
          background: card,
          borderRadius: "16px 16px 0 0",
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
                Ask anything about your current inventory, orders, or invoices — answers are grounded in your real, live data.
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
            <div
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
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
