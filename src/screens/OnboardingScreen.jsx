import { useState } from "react";
import { Store, Plus, Trash2, ArrowRight, CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { bg, card, cardAlt, textPrimary, textMuted, accent, accentBg, border, borderStrong, good, sans, mono } from "../lib/tokens";

const inputStyle = {
  width: "100%",
  background: "#F9FAFB",
  border: `1px solid ${borderStrong}`,
  borderRadius: 8,
  padding: "10px 12px",
  color: textPrimary,
  fontSize: 14,
  boxSizing: "border-box",
};

export default function OnboardingScreen() {
  const { restaurantId, refreshRestaurant } = useAuth();
  const [step, setStep] = useState(0); // 0 welcome, 1 suppliers, 2 inventory, 3 done
  const [suppliers, setSuppliers] = useState([{ name: "", phone: "" }]);
  const [items, setItems] = useState([{ name: "", unit: "lb", parLevel: "" }]);
  const [saving, setSaving] = useState(false);

  function updateSupplier(i, field, value) {
    setSuppliers((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }
  function addSupplierRow() {
    setSuppliers((prev) => [...prev, { name: "", phone: "" }]);
  }
  function removeSupplierRow(i) {
    setSuppliers((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateItem(i, field, value) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)));
  }
  function addItemRow() {
    setItems((prev) => [...prev, { name: "", unit: "lb", parLevel: "" }]);
  }
  function removeItemRow(i) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function saveSuppliersAndContinue() {
    setSaving(true);
    const validSuppliers = suppliers.filter((s) => s.name.trim());
    if (validSuppliers.length > 0) {
      await supabase.from("suppliers").insert(
        validSuppliers.map((s) => ({ restaurant_id: restaurantId, name: s.name.trim(), phone: s.phone.trim() || null }))
      );
    }
    setSaving(false);
    setStep(2);
  }

  async function saveItemsAndFinish() {
    setSaving(true);
    const validItems = items.filter((it) => it.name.trim());
    if (validItems.length > 0) {
      await supabase.from("inventory_items").insert(
        validItems.map((it) => ({
          restaurant_id: restaurantId,
          name: it.name.trim(),
          unit: it.unit || "ea",
          par_level: it.parLevel ? Number(it.parLevel) : null,
          current_stock: 0,
        }))
      );
    }
    await finishOnboarding();
  }

  async function finishOnboarding() {
    await supabase.from("restaurants").update({ onboarding_completed: true }).eq("id", restaurantId);
    await refreshRestaurant();
    setSaving(false);
  }

  async function skipAll() {
    setSaving(true);
    await finishOnboarding();
  }

  return (
    <div style={{ minHeight: "100vh", background: bg, fontFamily: sans, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 20 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i <= step ? accent : border }} />
          ))}
        </div>

        {step === 0 && (
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 28, textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: accentBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Store size={24} color={accent} />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: textPrimary, margin: "0 0 8px" }}>Welcome — let's get set up</h1>
            <p style={{ fontSize: 14, color: textMuted, lineHeight: 1.5, margin: "0 0 24px" }}>
              Two quick steps: add the suppliers you order from, and a few inventory items you'd like reorder alerts for.
              Takes about a minute, and you can always add more later.
            </p>
            <button
              onClick={() => setStep(1)}
              style={{ width: "100%", background: accent, border: "none", borderRadius: 8, padding: "13px", color: "#FFFFFF", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              Get started <ArrowRight size={15} />
            </button>
            <button
              onClick={skipAll}
              disabled={saving}
              style={{ width: "100%", background: "none", border: "none", color: textMuted, fontSize: 13, padding: "12px", cursor: "pointer", marginTop: 6 }}
            >
              Skip setup — I'll do this later
            </button>
          </div>
        )}

        {step === 1 && (
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: textMuted, marginBottom: 4 }}>Step 1 of 2</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: textPrimary, margin: "0 0 4px" }}>Who do you order from?</h2>
            <p style={{ fontSize: 13, color: textMuted, margin: "0 0 18px" }}>Add a few suppliers — phone number is optional but lets you text reorders directly later.</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
              {suppliers.map((s, i) => (
                <div key={i} style={{ background: cardAlt, borderRadius: 8, padding: 10, display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    <input placeholder="Supplier name" value={s.name} onChange={(e) => updateSupplier(i, "name", e.target.value)} style={inputStyle} />
                    <input placeholder="Phone (optional)" value={s.phone} onChange={(e) => updateSupplier(i, "phone", e.target.value)} style={inputStyle} />
                  </div>
                  {suppliers.length > 1 && (
                    <button onClick={() => removeSupplierRow(i)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", padding: 4 }}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={addSupplierRow}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none", border: `1px dashed ${borderStrong}`, borderRadius: 8, padding: "10px", color: textMuted, fontSize: 13, cursor: "pointer", marginBottom: 18 }}
            >
              <Plus size={14} /> Add another supplier
            </button>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setStep(2)}
                style={{ flex: 1, background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "12px", color: textMuted, fontSize: 13, cursor: "pointer" }}
              >
                Skip this step
              </button>
              <button
                onClick={saveSuppliersAndContinue}
                disabled={saving}
                style={{ flex: 2, background: accent, border: "none", borderRadius: 8, padding: "12px", color: "#FFFFFF", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                {saving ? "Saving…" : "Continue"} <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: textMuted, marginBottom: 4 }}>Step 2 of 2</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: textPrimary, margin: "0 0 4px" }}>What should we track?</h2>
            <p style={{ fontSize: 13, color: textMuted, margin: "0 0 18px" }}>
              Add a few key items and how much you like to keep on hand — we'll flag anything that dips below that.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
              {items.map((it, i) => (
                <div key={i} style={{ background: cardAlt, borderRadius: 8, padding: 10, display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    <input placeholder="Item name" value={it.name} onChange={(e) => updateItem(i, "name", e.target.value)} style={inputStyle} />
                    <div style={{ display: "flex", gap: 6 }}>
                      <select value={it.unit} onChange={(e) => updateItem(i, "unit", e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                        {["lb", "case", "ea", "gal", "cs", "bag", "dz"].map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder="Par level"
                        value={it.parLevel}
                        onChange={(e) => updateItem(i, "parLevel", e.target.value)}
                        style={{ ...inputStyle, flex: 1, fontFamily: mono }}
                      />
                    </div>
                  </div>
                  {items.length > 1 && (
                    <button onClick={() => removeItemRow(i)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", padding: 4 }}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={addItemRow}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none", border: `1px dashed ${borderStrong}`, borderRadius: 8, padding: "10px", color: textMuted, fontSize: 13, cursor: "pointer", marginBottom: 18 }}
            >
              <Plus size={14} /> Add another item
            </button>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={skipAll}
                disabled={saving}
                style={{ flex: 1, background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "12px", color: textMuted, fontSize: 13, cursor: "pointer" }}
              >
                Skip this step
              </button>
              <button
                onClick={saveItemsAndFinish}
                disabled={saving}
                style={{ flex: 2, background: accent, border: "none", borderRadius: 8, padding: "12px", color: "#FFFFFF", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                {saving ? "Finishing…" : "Finish setup"} <CheckCircle2 size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
