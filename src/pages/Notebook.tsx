import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageTransition from "@/components/PageTransition";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { localDateISO, formatLongDate } from "@/lib/dates";

interface Entry {
  id: string;
  entry_date: string;
  sr_no: number;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  price: number | null;
  bought: boolean;
}
interface Note {
  slot_index: number;
  content: string;
  entry_date: string;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function isoOf(d: Date) {
  return localDateISO(d);
}

export default function Notebook() {
  const { profile } = useAuth();
  const fid = profile?.family_id ?? null;
  const navigate = useNavigate();

  const todayISO = localDateISO();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string>(todayISO);
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  // Month view range
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);

  // Load which dates have entries or notes in the visible month
  useEffect(() => {
    if (!fid) return;
    let cancelled = false;
    (async () => {
      const [{ data: e }, { data: n }] = await Promise.all([
        supabase
          .from("notebook_entries")
          .select("entry_date")
          .eq("family_id", fid)
          .gte("entry_date", isoOf(monthStart))
          .lte("entry_date", isoOf(monthEnd)),
        supabase
          .from("notebook_notes")
          .select("entry_date, content")
          .eq("family_id", fid)
          .gte("entry_date", isoOf(monthStart))
          .lte("entry_date", isoOf(monthEnd)),
      ]);
      if (cancelled) return;
      const s = new Set<string>();
      (e ?? []).forEach((r: { entry_date: string }) => s.add(r.entry_date));
      (n ?? []).forEach((r: { entry_date: string; content: string }) => {
        if (r.content?.trim()) s.add(r.entry_date);
      });
      setActiveDates(s);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid, cursor.getFullYear(), cursor.getMonth()]);

  // Load entries + notes for selected date
  useEffect(() => {
    if (!fid) return;
    let cancelled = false;
    const load = async () => {
      const [{ data: e }, { data: n }] = await Promise.all([
        supabase
          .from("notebook_entries")
          .select("*")
          .eq("family_id", fid)
          .eq("entry_date", selected)
          .order("sr_no"),
        supabase
          .from("notebook_notes")
          .select("*")
          .eq("family_id", fid)
          .eq("entry_date", selected)
          .order("slot_index"),
      ]);
      if (cancelled) return;
      setEntries((e as Entry[]) ?? []);
      setNotes((n as Note[]) ?? []);
    };
    load();

    const ch = supabase
      .channel(`memory-${fid}-${selected}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notebook_entries",
          filter: `family_id=eq.${fid}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as { entry_date?: string };
          if (row?.entry_date === selected) load();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notebook_notes",
          filter: `family_id=eq.${fid}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as { entry_date?: string };
          if (row?.entry_date === selected) load();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [fid, selected]);

  const grid = useMemo(() => {
    const first = startOfMonth(cursor);
    const last = endOfMonth(cursor);
    const cells: (Date | null)[] = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(null);
    for (let d = 1; d <= last.getDate(); d++)
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const totalBought = entries.reduce(
    (s, r) => (r.bought ? s + (Number(r.price) || 0) : s),
    0,
  );

  const selectedDate = new Date(selected + "T00:00:00");

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-5">
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition hover:-translate-x-1"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Notebook Memory</h1>
            <p className="text-sm text-muted-foreground">
              Every day's list and notes, archived by date.
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          {/* Calendar */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() =>
                  setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
                }
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-white transition"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="text-sm font-semibold text-white">
                {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </div>
              <button
                onClick={() =>
                  setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
                }
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-white transition"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.map((d, i) => {
                if (!d) return <div key={i} />;
                const iso = isoOf(d);
                const isSelected = iso === selected;
                const isToday = iso === todayISO;
                const hasData = activeDates.has(iso);
                return (
                  <motion.button
                    key={i}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelected(iso)}
                    className={`relative aspect-square rounded-md text-sm transition ${
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold"
                        : isToday
                          ? "bg-primary/10 text-primary"
                          : "text-white hover:bg-muted"
                    }`}
                  >
                    {d.getDate()}
                    {hasData && !isSelected && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Selected day */}
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <div className="paper-dark rounded-xl px-10 py-4">
              <h2 className="font-hand text-3xl">{formatLongDate(selectedDate)}</h2>
              <p className="font-hand text-lg opacity-70">
                {entries.length === 0 && notes.every((n) => !n.content?.trim())
                  ? "Nothing recorded on this day."
                  : `${entries.length} item${entries.length === 1 ? "" : "s"} · ₹${totalBought.toLocaleString("en-IN")} spent`}
              </p>
            </div>

            {entries.length > 0 && (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  Instant list
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {entries.map((r) => (
                      <tr key={r.id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-1.5 text-muted-foreground w-8">{r.sr_no}</td>
                        <td
                          className={`px-3 py-1.5 text-white ${r.bought ? "line-through opacity-60" : ""}`}
                        >
                          {r.item_name || <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground w-28">
                          {r.quantity ?? ""} {r.unit ?? ""}
                        </td>
                        <td className="px-3 py-1.5 text-right w-24 text-white">
                          {r.price != null ? `₹${Number(r.price).toLocaleString("en-IN")}` : ""}
                        </td>
                        <td className="px-3 py-1.5 w-16 text-right text-xs">
                          {r.bought ? (
                            <span className="text-primary">bought</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {notes.some((n) => n.content?.trim()) && (
              <div className="grid gap-3 md:grid-cols-3">
                {notes
                  .filter((n) => n.content?.trim())
                  .map((n) => (
                    <div key={n.slot_index} className="paper-dark rounded-xl px-10 py-4">
                      <p
                        className="font-hand text-xl leading-[40px] whitespace-pre-wrap"
                        style={{ color: "#e8d5b0" }}
                      >
                        {n.content}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
