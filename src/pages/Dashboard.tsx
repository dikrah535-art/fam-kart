import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import PageTransition from "@/components/PageTransition";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { localDateISO, msUntilNextLocalMidnight, formatLongDate } from "@/lib/dates";

interface Entry {
  id?: string;
  family_id?: string;
  entry_date?: string;
  sr_no: number;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  price: number | null;
  bought: boolean;
}

interface Note {
  id?: string;
  slot_index: number;
  content: string;
}

const UNITS = ["kg", "g", "pcs", "L", "mL", "pack"] as const;
const MIN_ROWS = 5;

function greetingText(name: string) {
  const h = new Date().getHours();
  const g =
    h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 20 ? "Good evening" : "Good night";
  const emoji = h < 12 ? "☀️" : h < 17 ? "🌤️" : h < 20 ? "🌅" : "🌙";
  return `${g}, ${name} ${emoji}`;
}

function useTypewriter(text: string, speed = 40, start = true) {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!start) return;
    setOut("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, start]);
  return out;
}

function emptyRow(sr_no: number): Entry {
  return { sr_no, item_name: "", quantity: null, unit: null, price: null, bought: false };
}

export default function Dashboard() {
  const { profile, user } = useAuth();
  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const [today, setToday] = useState<string>(localDateISO());

  const greet = greetingText(firstName);
  const typed = useTypewriter(greet, 35, true);
  const dateStr = formatLongDate(new Date());
  const typedDate = useTypewriter(dateStr, 25, typed === greet);

  const [rows, setRows] = useState<Entry[]>(() =>
    Array.from({ length: MIN_ROWS }, (_, i) => emptyRow(i + 1)),
  );
  const [notes, setNotes] = useState<Note[]>(() =>
    [0, 1, 2].map((i) => ({ slot_index: i, content: "" })),
  );

  const fid = profile?.family_id ?? null;

  // Midnight rollover: recompute local date, which triggers a reload of the empty new day.
  useEffect(() => {
    const t = setTimeout(() => setToday(localDateISO()), msUntilNextLocalMidnight());
    return () => clearTimeout(t);
  }, [today]);

  // Load + realtime subscribe for today's entries and notes
  useEffect(() => {
    if (!fid) return;

    let cancelled = false;

    const loadEntries = async () => {
      const { data } = await supabase
        .from("notebook_entries")
        .select("*")
        .eq("family_id", fid)
        .eq("entry_date", today)
        .order("sr_no");
      if (cancelled) return;
      const byNo = new Map<number, Entry>();
      (data as Entry[] | null)?.forEach((r) => byNo.set(r.sr_no, r));
      const maxNo = Math.max(MIN_ROWS, ...Array.from(byNo.keys(), (n) => n));
      const merged: Entry[] = [];
      for (let i = 1; i <= maxNo; i++) merged.push(byNo.get(i) ?? emptyRow(i));
      setRows(merged);
    };

    const loadNotes = async () => {
      const { data } = await supabase
        .from("notebook_notes")
        .select("*")
        .eq("family_id", fid)
        .eq("entry_date", today);
      if (cancelled) return;
      const bySlot = new Map<number, Note>();
      (data as Note[] | null)?.forEach((n) => bySlot.set(n.slot_index, n));
      setNotes([0, 1, 2].map((i) => bySlot.get(i) ?? { slot_index: i, content: "" }));
    };

    loadEntries();
    loadNotes();

    const ch = supabase
      .channel(`notebook-${fid}-${today}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notebook_entries",
          filter: `family_id=eq.${fid}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as Entry;
          if (row?.entry_date === today) loadEntries();
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
          if (row?.entry_date === today) loadNotes();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [fid, today]);

  // Debounced upsert per row
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const scheduleSaveRow = (r: Entry, delay = 400) => {
    if (!fid || !user) return;
    const key = `r-${r.sr_no}`;
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      const hasContent =
        r.item_name.trim() !== "" ||
        r.quantity !== null ||
        r.price !== null ||
        r.bought ||
        r.unit;
      if (!hasContent && !r.id) return; // don't create empty rows
      const payload = {
        family_id: fid,
        entry_date: today,
        sr_no: r.sr_no,
        item_name: r.item_name,
        quantity: r.quantity,
        unit: r.unit,
        price: r.price,
        bought: r.bought,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      };
      await supabase
        .from("notebook_entries")
        .upsert(payload, { onConflict: "family_id,entry_date,sr_no" });
    }, delay);
  };

  const updateRow = (idx: number, patch: Partial<Entry>, immediate = false) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      scheduleSaveRow(next[idx], immediate ? 0 : 400);
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(prev.length + 1)]);
  };

  const deleteRow = async (idx: number) => {
    const r = rows[idx];
    if (r.id) await supabase.from("notebook_entries").delete().eq("id", r.id);
    setRows((prev) => {
      // Keep at least MIN_ROWS; renumber the tail to keep sr_no contiguous locally.
      const next = prev.filter((_, i) => i !== idx);
      while (next.length < MIN_ROWS) next.push(emptyRow(next.length + 1));
      return next.map((row, i) => ({ ...row, sr_no: i + 1 }));
    });
  };

  const totalBought = useMemo(
    () => rows.reduce((s, r) => (r.bought ? s + (Number(r.price) || 0) : s), 0),
    [rows],
  );
  const totalAll = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.price) || 0), 0),
    [rows],
  );
  const boughtCount = rows.filter((r) => r.bought).length;

  const saveNote = (slot: number, content: string) => {
    setNotes((prev) => prev.map((n) => (n.slot_index === slot ? { ...n, content } : n)));
    if (!fid || !user) return;
    const key = `n-${slot}`;
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      await supabase.from("notebook_notes").upsert(
        {
          family_id: fid,
          entry_date: today,
          slot_index: slot,
          content,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "family_id,entry_date,slot_index" },
      );
    }, 500);
  };

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-5 space-y-5">
        {/* Greeting notebook */}
        <div className="paper-dark rounded-xl px-8 md:px-14 py-5 md:py-6">
          <h1 className="font-hand text-3xl md:text-4xl min-h-[1.1em]">
            {typed}
            {typed.length < greet.length && <span className="animate-pulse">|</span>}
          </h1>
          <p className="font-hand text-xl md:text-2xl mt-1 opacity-80 min-h-[1.1em]">
            {typedDate}
          </p>
        </div>

        {/* Instant Writing List */}
        <section className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-white">Instant Writing List</h2>
              <p className="text-xs text-muted-foreground">
                Shared live with your family · resets at midnight
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">
                Bought {boughtCount}/{rows.length}
              </div>
              <div className="text-sm font-semibold text-primary">
                ₹{totalBought.toLocaleString("en-IN")}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  / ₹{totalAll.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left font-medium px-3 py-2 w-10">#</th>
                  <th className="text-left font-medium px-3 py-2">Item</th>
                  <th className="text-left font-medium px-3 py-2 w-24">Qty</th>
                  <th className="text-left font-medium px-3 py-2 w-32">Unit</th>
                  <th className="text-left font-medium px-3 py-2 w-28">Price</th>
                  <th className="text-center font-medium px-3 py-2 w-20">Bought</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {rows.map((r, idx) => (
                    <motion.tr
                      key={r.sr_no}
                      layout
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 60 }}
                      transition={{ duration: 0.18 }}
                      className={`border-b border-border/60 group ${
                        r.bought ? "bg-primary/5" : ""
                      }`}
                    >
                      <td className="px-3 py-1.5 text-muted-foreground">{r.sr_no}</td>
                      <td className="px-3 py-1.5">
                        <input
                          value={r.item_name}
                          onChange={(e) => updateRow(idx, { item_name: e.target.value })}
                          placeholder="Item name"
                          className={`w-full bg-transparent outline-none text-white placeholder:text-muted-foreground/50 transition ${
                            r.bought ? "line-through opacity-70" : ""
                          }`}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          inputMode="decimal"
                          value={r.quantity ?? ""}
                          onChange={(e) =>
                            updateRow(idx, {
                              quantity: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          placeholder="—"
                          className="w-full bg-transparent outline-none text-white placeholder:text-muted-foreground/40"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <UnitPicker
                          value={r.unit}
                          onChange={(u) => updateRow(idx, { unit: u }, true)}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground text-xs">₹</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={r.price ?? ""}
                            onChange={(e) =>
                              updateRow(idx, {
                                price: e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                            placeholder="0"
                            className="w-full bg-transparent outline-none text-white placeholder:text-muted-foreground/40"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <BoughtCheck
                          checked={r.bought}
                          onChange={(v) => updateRow(idx, { bought: v }, true)}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => deleteRow(idx)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                          title="Remove row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          <div className="p-3 border-t border-border flex justify-center">
            <button
              onClick={addRow}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5 transition"
            >
              <Plus size={14} /> Add row
            </button>
          </div>
        </section>

        {/* Shared notes */}
        <section>
          <h2 className="text-sm font-semibold text-white mb-2 px-1">Family Notes</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {notes.map((n) => (
              <NoteCard
                key={n.slot_index}
                value={n.content}
                onChange={(v) => saveNote(n.slot_index, v)}
                placeholder={
                  n.slot_index === 0
                    ? "Reminders…"
                    : n.slot_index === 1
                      ? "Menu ideas…"
                      : "Anything to say to the family…"
                }
              />
            ))}
          </div>
        </section>
      </div>
    </PageTransition>
  );
}

function UnitPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [custom, setCustom] = useState(false);
  const isKnown = value == null || (UNITS as readonly string[]).includes(value);

  useEffect(() => {
    if (value && !isKnown) setCustom(true);
  }, [value, isKnown]);

  if (custom) {
    return (
      <input
        autoFocus
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        onBlur={() => {
          if (!value) setCustom(false);
        }}
        placeholder="custom"
        className="w-full bg-muted/40 rounded px-1.5 py-0.5 outline-none text-white text-xs"
      />
    );
  }

  return (
    <select
      value={isKnown ? value ?? "" : ""}
      onChange={(e) => {
        if (e.target.value === "__other__") {
          setCustom(true);
          onChange("");
        } else {
          onChange(e.target.value || null);
        }
      }}
      className="w-full bg-transparent outline-none text-white text-xs cursor-pointer"
    >
      <option value="" className="bg-card">
        —
      </option>
      {UNITS.map((u) => (
        <option key={u} value={u} className="bg-card">
          {u}
        </option>
      ))}
      <option value="__other__" className="bg-card">
        Other…
      </option>
    </select>
  );
}

function BoughtCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-5 items-center justify-center rounded border transition ${
        checked
          ? "bg-primary border-primary"
          : "border-border hover:border-primary/60"
      }`}
      aria-pressed={checked}
    >
      <AnimatePresence>
        {checked && (
          <motion.svg
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 text-primary-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </motion.svg>
        )}
      </AnimatePresence>
    </button>
  );
}

function NoteCard({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="paper-dark rounded-xl px-10 py-4 min-h-[140px]">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={5}
        className="w-full bg-transparent outline-none resize-none font-hand text-xl leading-[40px] placeholder:opacity-40"
        style={{ color: "#e8d5b0" }}
      />
    </div>
  );
}
