import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, Repeat, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/AuthContext";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

interface DayOccurrence {
  id: string;
  event_name: string;
  notes: string | null;
  recurrence_type: string;
  occurrence_date: string;
}

interface FullEvent {
  id: string;
  event_name: string;
  event_date: string;
  notes: string | null;
  recurrence_type: string;
  remind_days_before: number;
}

const RECURRENCE_LABELS: Record<string, string> = {
  none: "One-time",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Real month-grid calendar, not just a list - expands recurring events
// across the whole visible range via get_local_events_in_range(), which
// is a different job from the "next occurrence" function powering
// Home's reminder card. This is the single destination for managing
// local events now (add/delete live here), not a second, separate flow
// alongside a list-only modal for the same underlying data.
export default function EventsCalendarScreen() {
  const { restaurantId: RESTAURANT_ID } = useAuth();
  const navigate = useNavigate();
  const [viewDate, setViewDate] = useState(new Date());
  const [occurrences, setOccurrences] = useState<DayOccurrence[]>([]);
  const [allEvents, setAllEvents] = useState<FullEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [remindDays, setRemindDays] = useState("3");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const leadingBlanks = firstOfMonth.getDay();
  const daysInMonth = lastOfMonth.getDate();

  useEffect(() => {
    load();
  }, [RESTAURANT_ID, year, month]);

  useEffect(() => {
    if (!RESTAURANT_ID) return;
    const channel = supabase
      .channel(`events-calendar-${RESTAURANT_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "local_events", filter: `restaurant_id=eq.${RESTAURANT_ID}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [RESTAURANT_ID, year, month]);

  async function load() {
    if (!RESTAURANT_ID) return;
    setLoading(true);
    const rangeStart = toISODate(new Date(year, month, 1));
    const rangeEnd = toISODate(new Date(year, month + 1, 0));
    const { data: occ } = await supabase.rpc("get_local_events_in_range", {
      p_restaurant_id: RESTAURANT_ID,
      p_start_date: rangeStart,
      p_end_date: rangeEnd,
    });
    setOccurrences((occ as DayOccurrence[]) || []);

    const { data: full } = await supabase
      .from("local_events")
      .select("id, event_name, event_date, notes, recurrence_type, remind_days_before")
      .eq("restaurant_id", RESTAURANT_ID);
    setAllEvents(full || []);
    setLoading(false);
  }

  function occurrencesFor(dayISO: string) {
    return occurrences.filter((o) => o.occurrence_date === dayISO);
  }

  async function addEvent() {
    if (!RESTAURANT_ID || !name.trim() || !date) return;
    setSaving(true);
    setError("");
    const { data: session } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from("local_events").insert({
      restaurant_id: RESTAURANT_ID,
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
    setSelectedDate(null);
    load();
  }

  const todayISO = toISODate(new Date());
  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="font-sans pb-6">
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => navigate("/")} className="bg-transparent border-none cursor-pointer text-slate p-0">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold m-0 text-ink flex-1">Local events</h1>
        <button
          onClick={() => { setShowAddForm(true); setDate(""); }}
          className="flex items-center gap-1.5 bg-accent text-white border-none rounded-lg px-3 py-2 text-xs font-bold cursor-pointer"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      <div className="px-4 flex items-center justify-between mb-3">
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="bg-input-bg border-none rounded-lg p-2 cursor-pointer">
          <ChevronLeft size={16} className="text-ink" />
        </button>
        <div className="text-sm font-bold text-ink">{monthLabel}</div>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="bg-input-bg border-none rounded-lg p-2 cursor-pointer">
          <ChevronRight size={16} className="text-ink" />
        </button>
      </div>

      <div className="px-4">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-semibold text-slate py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const dayISO = toISODate(new Date(year, month, day));
            const dayEvents = occurrencesFor(dayISO);
            const isToday = dayISO === todayISO;
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(dayISO)}
                className={`aspect-square rounded-lg border flex flex-col items-center justify-center gap-0.5 cursor-pointer ${isToday ? "border-accent bg-accent-bg" : "border-border-strong bg-white"}`}
              >
                <span className={`text-xs ${isToday ? "font-bold text-accent" : "text-ink"}`}>{day}</span>
                {dayEvents.length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {!loading && occurrences.length === 0 && (
        <div className="px-4 mt-4">
          <Card className="text-sm text-slate text-center">Nothing on the calendar this month.</Card>
        </div>
      )}

      {selectedDate && (
        <Modal onClose={() => setSelectedDate(null)}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold m-0 text-ink">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </h2>
            <button onClick={() => setSelectedDate(null)} className="bg-transparent border-none cursor-pointer text-slate p-0">
              <X size={18} />
            </button>
          </div>
          {occurrencesFor(selectedDate).length === 0 && <div className="text-sm text-slate mb-3">Nothing scheduled.</div>}
          <div className="flex flex-col gap-2 mb-3">
            {occurrencesFor(selectedDate).map((o) => {
              const full = allEvents.find((e) => e.id === o.id);
              return (
                <Card key={o.id} className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-ink">{o.event_name}</div>
                    {o.recurrence_type !== "none" && (
                      <div className="text-xs text-slate flex items-center gap-1 mt-0.5">
                        <Repeat size={10} /> {RECURRENCE_LABELS[o.recurrence_type]}
                        {full && ` · remind ${full.remind_days_before}d before`}
                      </div>
                    )}
                    {o.notes && <div className="text-xs text-slate mt-1">{o.notes}</div>}
                  </div>
                  <button onClick={() => deleteEvent(o.id)} className="bg-transparent border-none cursor-pointer text-slate p-0 flex-shrink-0">
                    <Trash2 size={14} />
                  </button>
                </Card>
              );
            })}
          </div>
          <Button
            onClick={() => { setShowAddForm(true); setDate(selectedDate); setSelectedDate(null); }}
            className="w-full"
          >
            Add event on this day
          </Button>
        </Modal>
      )}

      {showAddForm && (
        <Modal onClose={() => setShowAddForm(false)}>
          <h2 className="text-base font-bold mb-3 text-ink">Add local event</h2>
          <input
            placeholder="Event name — e.g. Central Catholic graduation"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-input-bg border border-border-strong rounded-lg px-3 py-2.5 text-sm text-ink mb-2"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-input-bg border border-border-strong rounded-lg px-3 py-2.5 text-sm text-ink mb-2"
          />
          <div className="flex gap-2 mb-2">
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value)}
              className="flex-1 bg-input-bg border border-border-strong rounded-lg px-3 py-2.5 text-sm text-ink"
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
              className="w-28 bg-input-bg border border-border-strong rounded-lg px-3 py-2.5 text-sm text-ink"
            />
          </div>
          <input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-input-bg border border-border-strong rounded-lg px-3 py-2.5 text-sm text-ink mb-3"
          />
          {error && <div className="text-danger text-xs mb-2">{error}</div>}
          <Button onClick={addEvent} disabled={saving || !name.trim() || !date} className="w-full">
            {saving ? "Saving…" : "Add event"}
          </Button>
        </Modal>
      )}
    </div>
  );
}
