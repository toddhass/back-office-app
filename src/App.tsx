import { useEffect, useRef } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Camera, Receipt, ClipboardList, LogOut, Home, ChevronDown, ChefHat, UtensilsCrossed, X, CheckCircle2, AlertTriangle, Bell } from "lucide-react";
import HomeScreen from "./screens/HomeScreen";
import PresenceIndicator from "./components/PresenceIndicator";
import CaptureScreen from "./screens/CaptureScreen";
import InvoicesScreen from "./screens/InvoicesScreen";
import DigestScreen from "./screens/DigestScreen";
import KitchenScreen from "./screens/KitchenScreen";
import MenuScreen from "./screens/MenuScreen";
import EventsCalendarScreen from "./screens/EventsCalendarScreen";
import LoginScreen from "./screens/LoginScreen";
import OnboardingScreen from "./screens/OnboardingScreen";
import { useAuth } from "./lib/AuthContext";
import { supabase } from "./lib/supabaseClient";
import { useIsDesktop } from "./lib/useIsDesktop";
import { useNotifications } from "./lib/useNotifications";
import { bg, sans, textMuted, accent, card, textPrimary, border, good, danger, goodBg, dangerBg, accentBg } from "./lib/tokens";

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

// Non-blocking, auto-dismissing - deliberately not the earlier full-screen
// modal-with-OK-button design. With 3-10 people using the app at once,
// every session independently notices the same real event (nothing shared
// about dismissal - see PresenceIndicator's docs for why that's true of
// realtime in general), so requiring an explicit click on every single
// screen for every single event doesn't scale past one person. Auto-clears
// on its own timer instead; a manual close (X) is still there for anyone
// who wants it gone sooner, but nothing requires it.
function ToastStack({ toasts, onDismiss }) {
  const timersRef = useRef({});

  useEffect(() => {
    toasts.forEach((t) => {
      if (!timersRef.current[t.id]) {
        timersRef.current[t.id] = setTimeout(() => {
          onDismiss(t.id);
          delete timersRef.current[t.id];
        }, 6000);
      }
    });
    // A toast that left the array (dismissed manually, or by this same
    // timeout elsewhere) shouldn't leave an orphaned timer behind.
    Object.keys(timersRef.current).forEach((id) => {
      if (!toasts.some((t) => String(t.id) === id)) {
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      }
    });
  }, [toasts, onDismiss]);

  if (toasts.length === 0) return null;
  const toneStyles = {
    success: { iconBg: goodBg, iconColor: good, barColor: good, Icon: CheckCircle2 },
    warning: { iconBg: dangerBg, iconColor: danger, barColor: danger, Icon: AlertTriangle },
    info: { iconBg: accentBg, iconColor: accent, barColor: accent, Icon: Bell },
  };

  // Capped at 3 visible at once - a burst of events (several items
  // crossing below par from one big depletion, say) shouldn't stack an
  // unbounded pile of banners down the screen. Everything in the
  // underlying array still gets its own timer and will clear in turn.
  return (
    <div style={{ position: "fixed", top: 12, left: 0, right: 0, zIndex: 2000, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "0 16px", pointerEvents: "none" }}>
      {toasts.slice(0, 3).map((t) => {
        const s = toneStyles[t.tone] || toneStyles.info;
        const Icon = s.Icon;
        return (
          <div
            key={t.id}
            style={{
              pointerEvents: "auto",
              width: "100%",
              maxWidth: 400,
              background: "#FFFFFF",
              borderRadius: 14,
              boxShadow: "0 10px 28px rgba(16,24,40,0.14), 0 2px 6px rgba(16,24,40,0.06)",
              overflow: "hidden",
              animation: "bannerSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 14px" }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: s.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={16} color={s.iconColor} strokeWidth={2.25} />
              </div>
              <div style={{ flex: 1, fontSize: 13.5, color: textPrimary, lineHeight: 1.45, paddingTop: 4 }}>{t.text}</div>
              <button onClick={() => onDismiss(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: textMuted, padding: 4, flexShrink: 0, display: "flex", opacity: 0.6 }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ height: 3, background: "#F1F4F8" }}>
              <div style={{ height: "100%", background: s.barColor, opacity: 0.55, animation: "toastCountdown 6s linear forwards" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const { session, restaurants, restaurantId, restaurantName, onboardingCompleted, switchRestaurant, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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
    navigate("/");
  }

  const tabs = [
    { path: "/", label: "Home", icon: Home },
    { path: "/capture", label: "Capture", icon: Camera },
    { path: "/invoices", label: "Invoices", icon: Receipt },
    { path: "/reorder", label: "Reorder", icon: ClipboardList },
    { path: "/kitchen", label: "Kitchen", icon: ChefHat },
    { path: "/menu", label: "Menu", icon: UtensilsCrossed },
  ];

  // startsWith rather than exact match so /menu/:dishId still highlights
  // the Menu tab - nested detail routes are still "within" that section.
  function isActive(path) {
    return path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);
  }

  const activeScreen = (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/capture" element={<CaptureScreen onDone={() => navigate("/invoices")} />} />
      <Route path="/invoices" element={<InvoicesScreen />} />
      <Route path="/reorder" element={<DigestScreen />} />
      <Route path="/kitchen" element={<KitchenScreen />} />
      <Route path="/menu" element={<MenuScreen />} />
      <Route path="/menu/:dishId" element={<MenuScreen />} />
      <Route path="/events" element={<EventsCalendarScreen />} />
    </Routes>
  );

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
            <PresenceIndicator restaurantId={restaurantId} style={{ marginTop: 6 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {tabs.map(({ path, label, icon: Icon }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: isActive(path) ? "#E7F0FA" : "none",
                  color: isActive(path) ? accent : textMuted,
                  fontWeight: isActive(path) ? 600 : 500,
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
        <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "32px 24px", position: "relative", minHeight: "100vh" }}>
          <div style={{ width: "100%", maxWidth: 720 }}>{activeScreen}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: bg, minHeight: "100vh", fontFamily: sans, color: textPrimary }}>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <div style={{ maxWidth: 420, margin: "0 auto", position: "relative", minHeight: "100vh" }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <PresenceIndicator restaurantId={restaurantId} />
            <button
              onClick={() => supabase.auth.signOut()}
              style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
            >
              <LogOut size={12} /> Sign out
            </button>
          </div>
        </div>
        <div style={{ paddingBottom: 76 }}>{activeScreen}</div>

        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            margin: "0 auto",
            width: "100%",
            maxWidth: 420,
            background: "#FFFFFF",
            borderTop: `1px solid ${border}`,
            display: "flex",
            padding: "10px 12px 16px",
            gap: 8,
          }}
        >
          {tabs.map(({ path, label, icon: Icon }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
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
                color: isActive(path) ? accent : textMuted,
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
