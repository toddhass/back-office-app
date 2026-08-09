import { useEffect, useState } from "react";
import { X, Plus, Trash2, Calendar, Repeat } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import { card, textPrimary, textMuted, accent, danger, good, sans } from "../lib/tokens";

interface LocalEvent {
  id: string;
  event_name: string;
  event_date: string;
  notes: string | null;
  recurrence_type: string;
  recurrence_end_date: string | null;
  remind_days_before: number;
}

const RECURRENCE_LABELS: Record<string, string> = {
  none: "One-time",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

// Manager-maintained deliberately - there's no real public data source for
// things like school graduations or local festivals the way there is for
// weather or the Steelers schedule, so this is honest about being a
// self-service list rather than pretending to be an automated feed.
export default function LocalEventsModal({ restaurantId, onClose }: { restaurantId: string; onClose: () => void }) {
  const { session } = useAuth();
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [remindDays, setRemindDays] = useState("3");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, [restaurantId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("local_events")
      .select("id, event_name, event_date, notes, recurrence_type, recurrence_end_date, remind_days_before")
      .eq("restaurant_id", restaurantId)
      .order("event_date", { ascending: true });
    setEvents(data || []);
    setLoading(false);
  }

  async function addEvent() {
    if (!name.trim() || !date) return;
    setSaving(true);
    setError("");
    const { error: insertError } = await supabase.from("local_events").insert({
      restaurant_id: restaurantId,
      event_name: name.trim(),
      event_date: date,
      recurrence_type: recurrence,
      remind_days_before: Number(remindDays) || 0,
      notes: notes.trim() || null,
      created_by_email: session?.user?.email ?? null,
    });
    if (insertError) {
      setError("Couldn't save that event — try again.");
      setSaving(false);
      return;
    }
    setName("");
    setDate("");
    setRecurrence("none");
    setRemindDays("3");
    setNotes("");
    setShowAddForm(false);
    setSaving(false);
    load();
  }

  async function deleteEvent(id: string) {
    await supabase.from("local_events").delete().eq("id", id);
    load();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1500, display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: sans }}>
      <div style={{ background: "#FFFFFF", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 480, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid #E2E6ED" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: textPrimary }}>Local events</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: textMuted, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
          {loading && <div style={{ fontSize: 13, color: textMuted, textAlign: "center", padding: 20 }}>Loading…</div>}

          {!loading && events.length === 0 && !showAddForm && (
            <div style={{ fontSize: 13, color: textMuted, textAlign: "center", padding: "20px 0" }}>
              No local events yet — add graduations, festivals, or anything else worth knowing about.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {events.map((e) => (
              <div key={e.id} style={{ background: card, border: "1px solid #E2E6ED", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
                <Calendar size={16} color={accent} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>{e.event_name}</div>
                  <div style={{ fontSize: 11.5, color: textMuted, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                    {new Date(e.event_date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    {e.recurrence_type !== "none" && (
                      <>
                        <Repeat size={10} /> {RECURRENCE_LABELS[e.recurrence_type]}
                      </>
                    )}
                    {" · remind "}{e.remind_days_before}d before
                  </div>
                  {e.notes && <div style={{ fontSize: 11.5, color: textMuted, marginTop: 2 }}>{e.notes}</div>}
                </div>
                <button onClick={() => deleteEvent(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: textMuted, padding: 2, flexShrink: 0 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {showAddForm ? (
            <div style={{ marginTop: 14, background: card, border: "1px solid #E2E6ED", borderRadius: 10, padding: 14 }}>
              <input
                placeholder="Event name — e.g. Central Catholic graduation"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: "100%", background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: textPrimary, marginBottom: 8, boxSizing: "border-box" }}
              />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ width: "100%", background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: textPrimary, marginBottom: 8, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value)}
                  style={{ flex: 1, background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: textPrimary }}
                >
                  <option value="none">Doesn't repeat</option>
                  <option value="weekly">Repeats weekly</option>
                  <option value="monthly">Repeats monthly</option>
                  <option value="yearly">Repeats yearly</option>
                </select>
                <input
                  type="number"
                  min={0}
                  value={remindDays}
                  onChange={(e) => setRemindDays(e.target.value)}
                  placeholder="Remind (days)"
                  style={{ width: 110, background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: textPrimary }}
                />
              </div>
              <input
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ width: "100%", background: "#F9FAFB", border: "1px solid #D6DCE5", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: textPrimary, marginBottom: 10, boxSizing: "border-box" }}
              />
              {error && <div style={{ color: danger, fontSize: 12, marginBottom: 8 }}>{error}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setShowAddForm(false)}
                  style={{ flex: 1, background: "none", border: "1px solid #E2E6ED", borderRadius: 8, padding: 10, color: textMuted, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={addEvent}
                  disabled={saving || !name.trim() || !date}
                  style={{ flex: 1, background: good, border: "none", borderRadius: 8, padding: 10, color: "#FFFFFF", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: saving || !name.trim() || !date ? 0.6 : 1 }}
                >
                  {saving ? "Saving…" : "Add event"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              style={{ width: "100%", marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: accent, border: "none", borderRadius: 10, padding: 12, color: "#FFFFFF", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              <Plus size={16} /> Add local event
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
