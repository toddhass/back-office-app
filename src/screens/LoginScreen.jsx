import { useState } from "react";
import { Store, Mail, Lock, Ticket } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { bg, card, textPrimary, textMuted, accent, danger, sans } from "../lib/tokens";

const inputStyle = {
  width: "100%",
  background: "#F9FAFB",
  border: "1px solid #D6DCE5",
  borderRadius: 8,
  padding: "12px 14px",
  color: "#16202E",
  fontSize: 14,
  boxSizing: "border-box",
  marginBottom: 10,
};

export default function LoginScreen() {
  const { refreshRestaurant } = useAuth();
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joinMethod, setJoinMethod] = useState("new"); // new | invite
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (!email || !password) {
        setError("Enter both email and password.");
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(`${error.name || "AuthError"} (${error.status || "?"}): ${error.message || JSON.stringify(error)}`);
    } catch (err) {
      setError(`Unexpected error: ${err?.name || "Error"}: ${err?.message || JSON.stringify(err) || String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // If email confirmation is required, there's no session yet — the
    // restaurant creation/join step runs after they confirm and sign in.
    if (!data.session) {
      setError("Check your email to confirm your account, then sign in.");
      setLoading(false);
      setMode("signin");
      return;
    }

    if (joinMethod === "new") {
      const { error: rpcError } = await supabase.rpc("create_restaurant_and_owner", {
        p_restaurant_name: restaurantName,
      });
      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }
    } else {
      const { error: rpcError } = await supabase.rpc("redeem_invite", { p_code: inviteCode });
      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }
    }

    await refreshRestaurant();
    } catch (err) {
      setError(`Unexpected error: ${err?.name || "Error"}: ${err?.message || JSON.stringify(err) || String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: sans, padding: 20, color: textPrimary }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#E7F0FA", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <Store size={24} color={accent} />
          </div>
          <h1 style={{ color: textPrimary, fontSize: 22, fontWeight: 700, margin: 0 }}>Back Office</h1>
          <div style={{ color: textMuted, fontSize: 13, marginTop: 4 }}>
            {mode === "signin" ? "Sign in to your restaurant" : "Set up your account"}
          </div>
        </div>

        <form onSubmit={mode === "signin" ? handleSignIn : handleSignUp} style={{ background: card, border: "1px solid #E2E6ED", borderRadius: 12, padding: 20 }}>
          <label style={{ fontSize: 12, color: textMuted, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Mail size={13} /> Email
          </label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="you@restaurant.com" />

          <label style={{ fontSize: 12, color: textMuted, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Lock size={13} /> Password
          </label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} placeholder="••••••••" />

          {mode === "signup" && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setJoinMethod("new")}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: 8,
                    border: joinMethod === "new" ? `1px solid ${accent}` : "1px solid #D6DCE5",
                    background: joinMethod === "new" ? "#E7F0FA" : "none",
                    color: joinMethod === "new" ? accent : textMuted,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  New restaurant
                </button>
                <button
                  type="button"
                  onClick={() => setJoinMethod("invite")}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: 8,
                    border: joinMethod === "invite" ? `1px solid ${accent}` : "1px solid #D6DCE5",
                    background: joinMethod === "invite" ? "#E7F0FA" : "none",
                    color: joinMethod === "invite" ? accent : textMuted,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Join with invite
                </button>
              </div>

              {joinMethod === "new" ? (
                <>
                  <label style={{ fontSize: 12, color: textMuted, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Store size={13} /> Restaurant name
                  </label>
                  <input required value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} style={inputStyle} placeholder="The Copper Skillet" />
                </>
              ) : (
                <>
                  <label style={{ fontSize: 12, color: textMuted, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Ticket size={13} /> Invite code
                  </label>
                  <input required value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} style={inputStyle} placeholder="8-character code" />
                </>
              )}
            </>
          )}

          {error && (
            <div style={{ color: danger, fontSize: 13, marginBottom: 10, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.4, border: "1px solid #F3B8B8", background: "#FDECEC", borderRadius: 6, padding: 8 }}>
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={(e) => (mode === "signin" ? handleSignIn(e) : handleSignUp(e))}
            style={{ width: "100%", background: accent, border: "none", borderRadius: 8, padding: "12px", color: "#FFFFFF", fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 4 }}
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError("");
            }}
            style={{ background: "none", border: "none", color: textMuted, fontSize: 13, cursor: "pointer" }}
          >
            {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
