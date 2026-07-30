import { useState } from "react";
import { Camera, Receipt, ClipboardList, LogOut } from "lucide-react";
import CaptureScreen from "./screens/CaptureScreen";
import InvoicesScreen from "./screens/InvoicesScreen";
import DigestScreen from "./screens/DigestScreen";
import LoginScreen from "./screens/LoginScreen";
import { useAuth } from "./lib/AuthContext";
import { supabase } from "./lib/supabaseClient";
import { bg, sans, textMuted, accent, danger, card, textPrimary } from "./lib/tokens";

export default function App() {
  const { session, restaurantId, restaurantName, loading } = useAuth();
  const [tab, setTab] = useState("capture");

  if (loading) {
    return <div style={{ background: bg, minHeight: "100vh", color: textMuted, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans }}>Loading…</div>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (!restaurantId) {
    // Signed in but not yet linked to a restaurant — shouldn't normally happen
    // since signup wires this up, but covers edge cases (e.g. invite pending).
    return (
      <div style={{ background: bg, minHeight: "100vh", color: textMuted, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: sans, gap: 12, padding: 20, textAlign: "center" }}>
        <div>No restaurant linked to this account yet.</div>
        <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "1px solid #45413A", borderRadius: 8, padding: "8px 16px", color: textMuted, cursor: "pointer" }}>
          Sign out
        </button>
      </div>
    );
  }

  const tabs = [
    { key: "capture", label: "Capture", icon: Camera },
    { key: "invoices", label: "Invoices", icon: Receipt },
    { key: "digest", label: "Reorder", icon: ClipboardList },
  ];

  return (
    <div style={{ background: bg, minHeight: "100vh", fontFamily: sans }}>
      <div style={{ maxWidth: 420, margin: "0 auto", position: "relative" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 16px",
            borderBottom: "1px solid #2A2825",
            background: card,
          }}
        >
          <span style={{ fontSize: 12, color: textPrimary, fontWeight: 600 }}>{restaurantName}</span>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
        <div style={{ paddingBottom: 76 }}>
          {tab === "capture" && <CaptureScreen onDone={() => setTab("invoices")} />}
          {tab === "invoices" && <InvoicesScreen />}
          {tab === "digest" && <DigestScreen />}
        </div>

        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "100%",
            maxWidth: 420,
            background: "#201F1C",
            borderTop: "1px solid #35322D",
            display: "flex",
            padding: "10px 12px 16px",
            gap: 8,
          }}
        >
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                background: "none",
                border: "none",
                padding: "8px",
                cursor: "pointer",
                color: tab === key ? accent : textMuted,
              }}
            >
              <Icon size={20} />
              <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
