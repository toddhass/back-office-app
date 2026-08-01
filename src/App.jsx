import { useState } from "react";
import { Camera, Receipt, ClipboardList, LogOut, Home, ChevronDown } from "lucide-react";
import HomeScreen from "./screens/HomeScreen";
import CaptureScreen from "./screens/CaptureScreen";
import InvoicesScreen from "./screens/InvoicesScreen";
import DigestScreen from "./screens/DigestScreen";
import LoginScreen from "./screens/LoginScreen";
import OnboardingScreen from "./screens/OnboardingScreen";
import { useAuth } from "./lib/AuthContext";
import { supabase } from "./lib/supabaseClient";
import { useIsDesktop } from "./lib/useIsDesktop";
import { useNotifications } from "./lib/useNotifications";
import { bg, sans, textMuted, accent, card, textPrimary, border } from "./lib/tokens";

function RestaurantSwitcher({ restaurants, restaurantId, restaurantName, onSwitch, style }) {
  if (restaurants.length <= 1) {
    return <span style={style}>{restaurantName}</span>;
  }
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <select
        value={restaurantId}
        onChange={(e) => onSwitch(e.target.value)}
        style={{
          ...style,
          appearance: "none",
          background: "none",
          border: "none",
          paddingRight: 16,
          cursor: "pointer",
        }}
      >
        {restaurants.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      <ChevronDown size={12} color={style?.color || textMuted} style={{ position: "absolute", right: 0, pointerEvents: "none" }} />
    </div>
  );
}

function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  const current = toasts[0]; // show one at a time, oldest first
  const toneColors = {
    success: { bg: "#E7F0FA", border: accent, text: accent },
    warning: { bg: "#FDECEC", border: "#F3B8B8", text: "#B23B3B" },
    info: { bg: "#F1F4F8", border: "#D6DCE5", text: textMuted },
  };
  const c = toneColors[current.tone] || toneColors.info;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#FFFFFF", borderRadius: 12, padding: 20, width: "100%", maxWidth: 360, borderTop: `4px solid ${c.text}` }}>
        <div style={{ fontSize: 15, color: textPrimary, lineHeight: 1.5, marginBottom: 16 }}>
          {current.text}
        </div>
        <button
          onClick={() => onDismiss(current.id)}
          style={{ width: "100%", background: c.text, border: "none", borderRadius: 8, padding: "11px", color: "#FFFFFF", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >
          OK{toasts.length > 1 ? ` (${toasts.length - 1} more)` : ""}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { session, restaurants, restaurantId, restaurantName, onboardingCompleted, switchRestaurant, loading } = useAuth();
  const [tab, setTab] = useState("home");
  const isDesktop = useIsDesktop();
  const { toasts, dismissToast } = useNotifications(restaurantId);

  if (loading) {
    return <div style={{ background: bg, minHeight: "100vh", color: textMuted, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans }}>Loading…</div>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (!restaurantId) {
    return (
      <div style={{ background: bg, minHeight: "100vh", color: textMuted, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: sans, gap: 12, padding: 20, textAlign: "center" }}>
        <div>No restaurant linked to this account yet.</div>
        <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "8px 16px", color: textMuted, cursor: "pointer" }}>
          Sign out
        </button>
      </div>
    );
  }

  if (!onboardingCompleted) {
    return <OnboardingScreen />;
  }

  function handleSwitch(id) {
    switchRestaurant(id);
    setTab("home");
  }

  const tabs = [
    { key: "home", label: "Home", icon: Home },
    { key: "capture", label: "Capture", icon: Camera },
    { key: "invoices", label: "Invoices", icon: Receipt },
    { key: "digest", label: "Reorder", icon: ClipboardList },
  ];

  const activeScreen =
    tab === "home" ? <HomeScreen onNavigate={setTab} /> :
    tab === "capture" ? <CaptureScreen onDone={() => setTab("invoices")} /> :
    tab === "invoices" ? <InvoicesScreen /> :
    <DigestScreen />;

  if (isDesktop) {
    return (
      <div style={{ background: bg, minHeight: "100vh", fontFamily: sans, color: textPrimary, display: "flex" }}>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        {/* Sidebar */}
        <div style={{ width: 240, flexShrink: 0, background: card, borderRight: `1px solid ${border}`, minHeight: "100vh", display: "flex", flexDirection: "column", padding: "24px 16px" }}>
          <div style={{ padding: "0 8px 24px" }}>
            <RestaurantSwitcher
              restaurants={restaurants}
              restaurantId={restaurantId}
              restaurantName={restaurantName}
              onSwitch={handleSwitch}
              style={{ fontWeight: 700, fontSize: 15, letterSpacing: -0.2, color: textPrimary }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: tab === key ? "#E7F0FA" : "none",
                  color: tab === key ? accent : textMuted,
                  fontWeight: tab === key ? 600 : 500,
                  fontSize: 14,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 13 }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "32px 24px" }}>
          <div style={{ width: "100%", maxWidth: 720 }}>{activeScreen}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: bg, minHeight: "100vh", fontFamily: sans, color: textPrimary }}>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <div style={{ maxWidth: 420, margin: "0 auto", position: "relative" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 16px",
            borderBottom: `1px solid ${border}`,
            background: card,
          }}
        >
          <RestaurantSwitcher
            restaurants={restaurants}
            restaurantId={restaurantId}
            restaurantName={restaurantName}
            onSwitch={handleSwitch}
            style={{ fontSize: 12, color: textPrimary, fontWeight: 600 }}
          />
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
        <div style={{ paddingBottom: 76 }}>{activeScreen}</div>

        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "100%",
            maxWidth: 420,
            background: "#FFFFFF",
            borderTop: `1px solid ${border}`,
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
