import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimation } from "framer-motion";
import { Trash2, CheckCircle2, Circle, ShoppingBag, AlertTriangle, Wallet, Copy, Check, Banknote } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import PageTransition from "@/components/PageTransition";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { localDateISO, msUntilNextLocalMidnight, formatLongDate } from "@/lib/dates";

interface Entry {
  id?: string;
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
interface Task {
  id: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
}
interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

const UNITS = ["kg", "g", "pcs", "L", "mL", "pack"] as const;
const MIN_ROWS = 3;
const MIN_NOTES = 3;
const NOTE_PLACEHOLDERS = ["Reminders…", "Menu ideas…", "Anything to say to the family…"];

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
  const navigate = useNavigate();
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
    Array.from({ length: MIN_NOTES }, (_, i) => ({ slot_index: i, content: "" })),
  );
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskRows, setTaskRows] = useState(3);
  const [addingCategory, setAddingCategory] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("📦");
  const [newCatColor, setNewCatColor] = useState("#3ecf8e");
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState({ needed: 0, urgent: 0, budget: 0, spent: 0 });

  const fid = profile?.family_id ?? null;

  useEffect(() => {
    if (!fid) return;
    let cancelled = false;
    supabase
      .from("families")
      .select("invite_code")
      .eq("id", fid)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setInviteCode((data as { invite_code?: string } | null)?.invite_code ?? null);
      });
    return () => { cancelled = true; };
  }, [fid]);

  const copyInviteCode = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    toast.success("Copied!");
    setTimeout(() => setCopied(false), 1500);
  };

  useEffect(() => {
    const t = setTimeout(() => setToday(localDateISO()), msUntilNextLocalMidnight());
    return () => clearTimeout(t);
  }, [today]);

  // Guards against the realtime-echo bug: your own save broadcasts back to you,
  // and a naive full refetch would wipe out whatever you've typed since.
  // We skip re-applying fresh server data to whatever the user is actively
  // touching right now.
  const focusedRow = useRef<number | null>(null);
  const focusedNote = useRef<number | null>(null);
  const pendingTaskToggle = useRef<Set<string>>(new Set());

  // Load notebook (entries + notes) for today with realtime
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
      setRows((prev) => {
        const prevByNo = new Map(prev.map((r) => [r.sr_no, r]));
        const merged: Entry[] = [];
        for (let i = 1; i <= maxNo; i++) {
          // Keep the local, in-progress value for whatever row the user is
          // currently typing in — the fresh server copy may be one keystroke
          // behind and would otherwise erase what they just typed.
          if (focusedRow.current === i && prevByNo.has(i)) {
            merged.push(prevByNo.get(i)!);
          } else {
            merged.push(byNo.get(i) ?? emptyRow(i));
          }
        }
        return merged;
      });
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
      const maxSlot = Math.max(MIN_NOTES - 1, ...Array.from(bySlot.keys()));
      setNotes((prev) => {
        const prevBySlot = new Map(prev.map((n) => [n.slot_index, n]));
        const merged: Note[] = [];
        for (let i = 0; i <= maxSlot; i++) {
          if (focusedNote.current === i && prevBySlot.has(i)) {
            merged.push(prevBySlot.get(i)!);
          } else {
            merged.push(bySlot.get(i) ?? { slot_index: i, content: "" });
          }
        }
        return merged;
      });
    };

    loadEntries();
    loadNotes();

    const ch = supabase
      .channel(`notebook-${fid}-${today}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notebook_entries", filter: `family_id=eq.${fid}` },
        (p) => {
          const r = (p.new ?? p.old) as { entry_date?: string };
          if (r?.entry_date === today) loadEntries();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notebook_notes", filter: `family_id=eq.${fid}` },
        (p) => {
          const r = (p.new ?? p.old) as { entry_date?: string };
          if (r?.entry_date === today) loadNotes();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [fid, today]);

  // Load tasks (carry over; hide tasks completed before today)
  useEffect(() => {
    if (!fid) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("notebook_tasks")
        .select("*")
        .eq("family_id", fid)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const filtered = ((data as Task[] | null) ?? []).filter((t) => {
        if (!t.completed) return true;
        if (!t.completed_at) return true;
        return t.completed_at.slice(0, 10) === today; // keep today's completed for the strike animation
      });
      setTasks((prev) => {
        if (pendingTaskToggle.current.size === 0) return filtered;
        // A toggle we just fired hasn't been confirmed by the server yet —
        // keep our optimistic local version of that one task so the click
        // doesn't appear to silently undo itself mid-flight.
        const prevById = new Map(prev.map((t) => [t.id, t]));
        return filtered.map((t) => (pendingTaskToggle.current.has(t.id) && prevById.has(t.id) ? prevById.get(t.id)! : t));
      });
    };
    load();

    const ch = supabase
      .channel(`tasks-${fid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notebook_tasks", filter: `family_id=eq.${fid}` },
        load,
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [fid, today]);

  // Load stat cards + categories with realtime
  useEffect(() => {
    if (!fid) return;
    let cancelled = false;

    const load = async () => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      // Fetch a safely wide window and filter client-side by local month/year —
      // this exactly mirrors how Budget.tsx computes monthSpent, so the two
      // pages can never disagree on what counts as "this month".
      const windowStart = new Date(year, month - 2, 1).toISOString();

      const [{ data: items }, { data: budget }, { data: history }, { data: cats }] = await Promise.all([
        supabase.from("items").select("status,priority").eq("family_id", fid),
        supabase
          .from("budgets")
          .select("amount")
          .eq("family_id", fid)
          .eq("month", month)
          .eq("year", year)
          .maybeSingle(),
        supabase
          .from("purchase_history")
          .select("cost,purchased_at")
          .eq("family_id", fid)
          .gte("purchased_at", windowStart),
        supabase.from("categories").select("id,name,icon,color").eq("family_id", fid).order("name"),
      ]);
      if (cancelled) return;
      const list = (items as { status: string; priority: string | null }[] | null) ?? [];
      const historyRows = (history as { cost: number; purchased_at: string }[] | null) ?? [];
      const monthSpent = historyRows
        .filter((r) => {
          const d = new Date(r.purchased_at);
          return d.getMonth() + 1 === month && d.getFullYear() === year;
        })
        .reduce((s, r) => s + Number(r.cost || 0), 0);
      setStats({
        needed: list.filter((i) => i.status === "needed").length,
        urgent: list.filter((i) => i.priority === "urgent" || i.status === "urgent").length,
        budget: Number((budget as { amount?: number } | null)?.amount ?? 0),
        spent: monthSpent,
      });
      setCategories((cats as Category[] | null) ?? []);
    };
    load();

    const ch = supabase
      .channel(`stats-${fid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items", filter: `family_id=eq.${fid}` },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "budgets", filter: `family_id=eq.${fid}` },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchase_history", filter: `family_id=eq.${fid}` },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories", filter: `family_id=eq.${fid}` },
        load,
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [fid]);

  // Debounced saves
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const scheduleSaveRow = (r: Entry, delay = 400) => {
    if (!fid || !user) return;
    const key = `r-${r.sr_no}`;
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      const hasContent =
        r.item_name.trim() !== "" || r.quantity !== null || r.price !== null || r.bought || r.unit;
      if (!hasContent && !r.id) return;
      await supabase.from("notebook_entries").upsert(
        {
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
        },
        { onConflict: "family_id,entry_date,sr_no" },
      );
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

  const addRow = () => setRows((prev) => [...prev, emptyRow(prev.length + 1)]);

  const setRowCount = async (count: number) => {
    if (count > rows.length) {
      setRows((prev) => {
        const next = [...prev];
        while (next.length < count) next.push(emptyRow(next.length + 1));
        return next;
      });
      return;
    }
    if (count < rows.length) {
      const toRemove = rows.slice(count);
      const idsToDelete = toRemove.filter((r) => r.id).map((r) => r.id as string);
      if (idsToDelete.length) {
        await supabase.from("notebook_entries").delete().in("id", idsToDelete);
      }
      setRows((prev) => prev.slice(0, Math.max(count, MIN_ROWS)));
    }
  };

  const deleteRow = async (idx: number) => {
    const r = rows[idx];
    if (r.id) await supabase.from("notebook_entries").delete().eq("id", r.id);
    setRows((prev) => {
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

  const addNoteLine = () =>
    setNotes((prev) => [...prev, { slot_index: prev.length, content: "" }]);

  const setNoteCount = (count: number) => {
    setNotes((prev) => {
      if (count > prev.length) {
        const next = [...prev];
        while (next.length < count) next.push({ slot_index: next.length, content: "" });
        return next;
      }
      return prev.slice(0, Math.max(count, 1));
    });
  };

  // Tasks
  const addTask = async () => {
    if (!fid || !user) return;
    const { data } = await supabase
      .from("notebook_tasks")
      .insert({ family_id: fid, title: "", created_by: user.id })
      .select()
      .single();
    if (data) setTasks((prev) => [...prev, data as Task]);
  };

  const updateTaskTitle = (id: string, title: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    const key = `t-${id}`;
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      await supabase.from("notebook_tasks").update({ title, updated_at: new Date().toISOString() }).eq("id", id);
    }, 400);
  };

  const toggleTask = async (t: Task) => {
    const next = !t.completed;
    setTasks((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? { ...x, completed: next, completed_at: next ? new Date().toISOString() : null }
          : x,
      ),
    );
    pendingTaskToggle.current.add(t.id);
    const { error } = await supabase
      .from("notebook_tasks")
      .update({
        completed: next,
        completed_at: next ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", t.id);
    pendingTaskToggle.current.delete(t.id);
    if (error) {
      toast.error(error.message);
      // Revert the optimistic flip since the server never confirmed it.
      setTasks((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, completed: t.completed, completed_at: t.completed_at } : x)),
      );
    }
  };

  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await supabase.from("notebook_tasks").delete().eq("id", id);
  };

  const createCategory = async () => {
    if (!fid || !user || !newCatName.trim()) return;
    const { error } = await supabase.from("categories").insert({
      family_id: fid,
      name: newCatName.trim(),
      icon: newCatIcon,
      color: newCatColor,
    });
    if (error) return toast.error(error.message);
    toast.success(`Added ${newCatName}`);
    setNewCatName(""); setNewCatIcon("📦"); setNewCatColor("#3ecf8e"); setAddingCategory(false);
  };

  const budgetPct = stats.budget > 0 ? Math.round((stats.spent / stats.budget) * 100) : 0;
  const budgetMeter = Math.min(100, budgetPct);
  const isOverspent = stats.budget > 0 && stats.spent > stats.budget;

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 space-y-4">
        {/* Unified Family Notebook */}
        <section className="paper-dark rounded-2xl pl-16 pr-6 md:pr-10 py-5 space-y-4">
          {/* Greeting */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-hand text-3xl md:text-4xl leading-tight min-h-[1.2em]">
                {typed}
                {typed.length < greet.length && <span className="animate-pulse">|</span>}
              </h1>
              <p className="font-hand text-lg md:text-xl mt-0.5 opacity-80 leading-tight min-h-[1.2em]">
                {typedDate}
              </p>
            </div>
            {inviteCode && (
              <button
                type="button"
                onClick={copyInviteCode}
                title="Copy family invite code"
                className="font-sans text-xs shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-black/20 hover:border-primary/50 hover:bg-primary/10 transition"
                style={{ color: "#e8d5b0" }}
              >
                <span className="opacity-60">Family code</span>
                <span className="font-semibold tracking-wider">{inviteCode}</span>
                {copied ? <Check size={13} className="text-primary" /> : <Copy size={13} className="opacity-60" />}
              </button>
            )}
          </div>

          {/* Instant Writing List */}
          <div className="pt-1 pb-4 relative z-10">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="font-hand text-2xl leading-tight">Instant list</h2>
              <div className="font-sans text-xs opacity-80">
                {boughtCount}/{rows.length} bought ·{" "}
                <span className="text-primary">₹{totalBought.toLocaleString("en-IN")}</span>
                <span className="opacity-60"> / ₹{totalAll.toLocaleString("en-IN")}</span>
              </div>
            </div>

            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wider opacity-60 font-sans">
                  <tr className="border-b border-white/10">
                    <th className="text-left font-medium px-2 py-1.5 w-8">#</th>
                    <th className="text-left font-medium px-2 py-1.5">Item</th>
                    <th className="text-left font-medium px-2 py-1.5 w-16">Qty</th>
                    <th className="text-left font-medium px-2 py-1.5 w-20">Unit</th>
                    <th className="text-left font-medium px-2 py-1.5 w-20">Price</th>
                    <th className="text-center font-medium px-2 py-1.5 w-14">Bought</th>
                    <th className="w-6" />
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
                        className="group align-middle"
                        style={{ height: "40px" }}
                      >
                        <td className="px-2 opacity-60 text-sm font-sans align-middle">{r.sr_no}</td>
                        <td className="px-2 align-middle">
                          <input
                            value={r.item_name}
                            onChange={(e) => updateRow(idx, { item_name: e.target.value })}
                            onFocus={() => { focusedRow.current = r.sr_no; }}
                            onBlur={() => { if (focusedRow.current === r.sr_no) focusedRow.current = null; }}
                            placeholder="Item name"
                            className={`paper-line w-full bg-transparent outline-none font-hand text-xl placeholder:opacity-40 transition ${
                              r.bought ? "line-through opacity-60" : ""
                            }`}
                            style={{ color: "#e8d5b0", height: "36px", lineHeight: "36px" }}
                          />
                        </td>
                        <td className="px-2 align-middle">
                          <input
                            type="number"
                            inputMode="decimal"
                            value={r.quantity ?? ""}
                            onChange={(e) =>
                              updateRow(idx, {
                                quantity: e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                            onFocus={() => { focusedRow.current = r.sr_no; }}
                            onBlur={() => { if (focusedRow.current === r.sr_no) focusedRow.current = null; }}
                            placeholder="—"
                            className="w-full bg-transparent outline-none font-sans text-sm placeholder:opacity-30"
                            style={{ height: "36px", lineHeight: "36px" }}
                          />
                        </td>
                        <td className="px-2 align-middle">
                          <UnitPicker
                            value={r.unit}
                            onChange={(u) => updateRow(idx, { unit: u }, true)}
                          />
                        </td>
                        <td className="px-2 align-middle">
                          <div className="flex items-center gap-1">
                            <span className="opacity-50 text-xs font-sans">₹</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              value={r.price ?? ""}
                              onChange={(e) =>
                                updateRow(idx, {
                                  price: e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                              onFocus={() => { focusedRow.current = r.sr_no; }}
                              onBlur={() => { if (focusedRow.current === r.sr_no) focusedRow.current = null; }}
                              placeholder="0"
                              className="w-full bg-transparent outline-none font-sans text-sm placeholder:opacity-30"
                              style={{ height: "36px", lineHeight: "36px" }}
                            />
                          </div>
                        </td>
                        <td className="px-2 text-center align-middle">
                          <BoughtCheck
                            checked={r.bought}
                            onChange={(v) => updateRow(idx, { bought: v }, true)}
                          />
                        </td>
                        <td className="px-1 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => deleteRow(idx)}
                            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive transition"
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

            <div className="pb-4">
              <ResizeHandle count={rows.length} setCount={setRowCount} min={MIN_ROWS} max={12} rowHeight={40} label="rows" />
            </div>
          </div>

          {/* Family Notes — stacked lines */}
          <div className="pt-1 pb-4 relative z-10">
            <h2 className="font-hand text-2xl leading-tight mb-1">Family notes</h2>
            <div>
              <AnimatePresence initial={false}>
                {notes.map((n, i) => (
                  <motion.div
                    key={n.slot_index}
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <input
                      value={n.content}
                      onChange={(e) => saveNote(n.slot_index, e.target.value)}
                      onFocus={() => { focusedNote.current = n.slot_index; }}
                      onBlur={() => { if (focusedNote.current === n.slot_index) focusedNote.current = null; }}
                      placeholder={NOTE_PLACEHOLDERS[i] ?? "Another note…"}
                      className="paper-line w-full bg-transparent outline-none font-hand text-xl placeholder:opacity-40"
                      style={{ color: "#e8d5b0", height: "40px", lineHeight: "40px", paddingBottom: "2px" }}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <div className="pb-4">
              <ResizeHandle count={notes.length} setCount={setNoteCount} min={1} max={10} rowHeight={40} label="notes" />
            </div>
          </div>

          {/* Quick tasks — single line entry, links to /todo */}
          <div className="pt-1 pb-4 relative z-10">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-hand text-2xl leading-tight">Quick task</h2>
              <a href="/todo" className="font-sans text-xs opacity-70 hover:text-primary transition">
                {tasks.filter((t) => !t.completed).length} pending · View all →
              </a>
            </div>
            <div className="paper-line flex items-center gap-2">
              <Circle size={18} className="opacity-50 shrink-0" />
              <input
                type="text"
                placeholder="Type and press Enter to add a task…"
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && e.currentTarget.value.trim() && fid && user) {
                    const title = e.currentTarget.value.trim();
                    e.currentTarget.value = "";
                    await supabase.from("notebook_tasks").insert({ family_id: fid, title, created_by: user.id });
                  }
                }}
                className="flex-1 bg-transparent outline-none font-hand text-xl placeholder:opacity-40"
                style={{ color: "#e8d5b0", height: "40px", lineHeight: "40px" }}
              />
            </div>

            <div className="mt-1">
              {tasks.slice(0, taskRows).map((t) => (
                <div key={t.id} className="paper-line flex items-center gap-2" style={{ height: "36px" }}>
                  <div className="relative flex-1 min-w-0">
                    <span
                      className={`block font-hand text-lg truncate transition-opacity duration-[3000ms] ${t.completed ? "opacity-50" : ""}`}
                      style={{ color: "#e8d5b0" }}
                    >
                      {t.title || <span className="italic opacity-40">Untitled</span>}
                    </span>
                    <motion.div
                      className="absolute left-0 top-1/2 w-full h-[2px] rounded-full"
                      style={{
                        transformOrigin: "left",
                        background: "#34d399",
                        boxShadow: "0 0 6px #34d399",
                        translateY: "-50%",
                      }}
                      initial={false}
                      animate={{ scaleX: t.completed ? 1 : 0, opacity: t.completed ? 1 : 0 }}
                      transition={{ duration: 3, ease: "easeInOut" }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleTask(t)}
                    className={`shrink-0 font-sans text-xs px-2.5 py-1 rounded-md border transition ${
                      t.completed
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-white/10 opacity-70 hover:opacity-100 hover:border-primary/50 hover:text-primary"
                    }`}
                  >
                    {t.completed ? "Done" : "Mark done"}
                  </button>
                </div>
              ))}
            </div>

            <ResizeHandle count={taskRows} setCount={setTaskRows} min={1} max={10} rowHeight={36} label="visible tasks" />
          </div>
        </section>

        {/* Stat Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label="Items needed"
            value={stats.needed}
            icon={<ShoppingBag size={16} />}
            accent="hsl(var(--primary))"
            meter={Math.min(100, stats.needed * 10)}
            onClick={() => navigate("/shopping?tab=needed")}
            hoverFx="lid"
          />
          <StatCard
            label="Urgent"
            value={stats.urgent}
            icon={<AlertTriangle size={16} />}
            accent="#f87171"
            meter={Math.min(100, stats.urgent * 20)}
            onClick={() => navigate("/shopping?tab=urgent")}
            hoverFx="ripple"
          />
          <StatCard
            label="Budget used"
            value={`${budgetPct}%`}
            icon={<Wallet size={16} />}
            accent={isOverspent ? "#ef4444" : "#34d399"}
            meter={budgetMeter}
            subtitle={
              stats.budget > 0
                ? `₹${stats.spent.toLocaleString("en-IN")} / ₹${stats.budget.toLocaleString("en-IN")}${isOverspent ? " · over budget" : ""}`
                : "No budget set"
            }
            onClick={() => navigate("/budget")}
            hoverFx="wallet"
          />

        </section>

        {/* Categories */}
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Categories</h2>
              <p className="text-xs text-muted-foreground">Organise your household by area.</p>
            </div>
            {!addingCategory && (
              <button
                type="button"
                onClick={() => setAddingCategory(true)}
                className="text-xs font-medium px-3 py-1.5 rounded-md border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition"
              >
                + Add category
              </button>
            )}
          </div>

          {addingCategory && (
            <div className="mb-4 rounded-lg border border-border bg-background/40 p-3 flex flex-wrap items-center gap-2">
              <input
                autoFocus
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createCategory()}
                placeholder="e.g. Kitchen, Groceries, Kids"
                className="flex-1 min-w-[140px] bg-muted rounded-md px-3 py-2 text-sm outline-none border border-transparent focus:border-primary"
              />
              <select
                value={newCatIcon}
                onChange={(e) => setNewCatIcon(e.target.value)}
                className="bg-muted rounded-md px-2 py-2 text-lg outline-none border border-transparent focus:border-primary"
                title="Icon"
              >
                {["📦", "🛒", "🍳", "🧹", "🧸", "🚗", "💊", "🐾", "🏠", "👕"].map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
              <div className="flex items-center gap-1.5">
                {["#3ecf8e", "#7c3aed", "#f59e0b", "#ef4444", "#38bdf8", "#f472b6"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewCatColor(c)}
                    className="h-6 w-6 rounded-full border-2 transition"
                    style={{ background: c, borderColor: newCatColor === c ? "#fff" : "transparent" }}
                    title={c}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={createCategory}
                disabled={!newCatName.trim()}
                className="text-xs font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:brightness-110 transition"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => { setAddingCategory(false); setNewCatName(""); }}
                className="text-xs font-medium px-3 py-2 rounded-md border border-white/10 opacity-70 hover:opacity-100 transition"
              >
                Cancel
              </button>
            </div>
          )}

          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No categories yet —{" "}
              <button type="button" onClick={() => setAddingCategory(true)} className="text-primary hover:underline">
                add your first one
              </button>
              .
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {categories.map((c) => (
                <motion.div
                  key={c.id}
                  whileHover={{ y: -2 }}
                  className="rounded-lg border border-border bg-background/40 px-4 py-3 transition"
                >
                  <div
                    className="h-8 w-8 rounded-md flex items-center justify-center text-lg mb-2"
                    style={{ background: (c.color ?? "hsl(var(--primary))") + "22" }}
                  >
                    {c.icon ?? "📦"}
                  </div>
                  <div className="text-sm font-medium text-white truncate">{c.name}</div>
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageTransition>
  );
}

function ResizeHandle({
  count,
  setCount,
  min,
  max,
  rowHeight,
  label,
}: {
  count: number;
  setCount: (n: number) => void;
  min: number;
  max: number;
  rowHeight: number;
  label: string;
}) {
  const drag = useRef<{ startY: number; startCount: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [live, setLive] = useState(count);

  useEffect(() => setLive(count), [count]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { startY: e.clientY, startCount: count };
    let lastApplied = count;
    setDragging(true);

    const onMove = (ev: PointerEvent) => {
      if (!drag.current) return;
      const deltaY = ev.clientY - drag.current.startY;
      // Dragging down (positive deltaY) grows the section; dragging up shrinks it.
      // Rounding here is what makes it "settle" on a whole row the instant you
      // stop moving, instead of leaving it hanging on a half-row.
      const deltaRows = Math.round(deltaY / rowHeight);
      const next = Math.min(max, Math.max(min, drag.current.startCount + deltaRows));
      setLive(next);
      if (next !== lastApplied) {
        lastApplied = next;
        setCount(next);
      }
    };
    const onUp = () => {
      drag.current = null;
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      title={`Drag down to add ${label}, up to remove`}
      className="absolute bottom-0 right-0 flex flex-col items-end gap-0.5 select-none touch-none z-20 px-1 py-1"
      style={{ cursor: "nwse-resize" }}
    >
      <span
        className={`font-sans text-[10px] leading-none transition-opacity ${
          dragging ? "opacity-90 text-primary" : "opacity-0"
        }`}
      >
        {live}
      </span>
      <svg width="13" height="13" viewBox="0 0 13 13" className={`transition-opacity ${dragging ? "opacity-100 text-primary" : "opacity-35 hover:opacity-70"}`}>
        <circle cx="10.5" cy="2.5" r="1.2" fill="currentColor" />
        <circle cx="10.5" cy="6.5" r="1.2" fill="currentColor" />
        <circle cx="10.5" cy="10.5" r="1.2" fill="currentColor" />
        <circle cx="6.5" cy="6.5" r="1.2" fill="currentColor" />
        <circle cx="6.5" cy="10.5" r="1.2" fill="currentColor" />
        <circle cx="2.5" cy="10.5" r="1.2" fill="currentColor" />
      </svg>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
  meter,
  subtitle,
  onClick,
  hoverFx,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent: string;
  meter: number;
  subtitle?: string;
  onClick?: () => void;
  hoverFx?: "lid" | "ripple" | "wallet";
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick(); }
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={onClick ? { y: -4, borderColor: accent, boxShadow: `0 8px 24px ${accent}33` } : undefined}
      whileTap={onClick ? { scale: 0.97 } : undefined}
      transition={{ duration: 0.25 }}
      className={`rounded-xl border border-border bg-card p-4 relative overflow-hidden transition-colors ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      {hoverFx === "ripple" && <RippleLayer isHovered={hovered} color={accent} />}
      {hoverFx === "wallet" && <FallingNotesLayer isHovered={hovered} />}

      <div className="flex items-center justify-between text-muted-foreground text-xs relative z-10">
        <span>{label}</span>
        <span style={{ color: accent }}>
          {hoverFx === "lid" ? (
            <LidBoxIcon isHovered={hovered} color={accent} />
          ) : hoverFx === "wallet" ? (
            <OpeningWalletIcon isHovered={hovered} color={accent} />
          ) : (
            icon
          )}
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-white relative z-10">{value}</div>
      {subtitle && <div className="text-[11px] text-muted-foreground mt-0.5 relative z-10">{subtitle}</div>}
      <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden relative z-10">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${meter}%` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: accent }}
        />
      </div>
    </motion.div>
  );
}

/** Box with a lid that opens/closes in a loop while hovered, then settles closed. */
function LidBoxIcon({ isHovered, color }: { isHovered: boolean; color: string }) {
  const controls = useAnimation();
  const hoveredRef = useRef(isHovered);
  hoveredRef.current = isHovered;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Loop while still hovered; each half-cycle is awaited so leaving mid-loop
      // finishes the current motion instead of snapping.
      while (!cancelled && hoveredRef.current) {
        await controls.start({ rotate: -70, transition: { duration: 0.45, ease: "easeOut" } });
        if (cancelled || !hoveredRef.current) break;
        await controls.start({ rotate: 0, transition: { duration: 0.45, ease: "easeIn" } });
      }
      if (!cancelled) {
        // Ensure lid returns to fully closed.
        await controls.start({ rotate: 0, transition: { duration: 0.35, ease: "easeInOut" } });
      }
    })();
    return () => { cancelled = true; };
  }, [isHovered, controls]);

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: "visible" }}>
      {/* box body */}
      <path d="M4 11 L4 20 L20 20 L20 11" fill={color} fillOpacity="0.08" />
      <path d="M4 15 L20 15" opacity="0.35" />
      {/* lid, hinged at back-left */}
      <motion.g animate={controls} initial={{ rotate: 0 }} style={{ transformOrigin: "4px 10px", transformBox: "fill-box" as const }}>
        <path d="M3 10 L21 10 L21 8 L3 8 Z" fill={color} fillOpacity="0.2" />
      </motion.g>
    </svg>
  );
}

/** Red sonar ripple emitted from the icon corner, expanding to card edge. */
function RippleLayer({ isHovered, color }: { isHovered: boolean; color: string }) {
  const [ripples, setRipples] = useState<number[]>([]);
  useEffect(() => {
    if (!isHovered) return;
    const spawn = () => setRipples((r) => [...r, Date.now() + Math.random()]);
    spawn();
    const id = setInterval(spawn, 750);
    return () => clearInterval(id);
  }, [isHovered]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r}
            initial={{ scale: 0.2, opacity: 0.55 }}
            animate={{ scale: 12, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.6, ease: "easeOut" }}
            onAnimationComplete={() => setRipples((rs) => rs.filter((x) => x !== r))}
            className="absolute h-6 w-6 rounded-full border-2"
            style={{
              top: 10,
              right: 10,
              borderColor: color,
              boxShadow: `0 0 10px ${color}`,
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Wallet that unfolds open on the hinge to reveal its interior. */
function OpeningWalletIcon({ isHovered, color }: { isHovered: boolean; color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: "visible" }}>
      {/* interior revealed when open */}
      <rect x="4" y="7" width="16" height="12" rx="1.5" fill={color} fillOpacity="0.18" />
      <path d="M8 11 L16 11 M8 14 L14 14" opacity="0.6" />
      {/* front flap, hinged on the left, unfolds outward */}
      <motion.g
        animate={{ rotateY: isHovered ? -155 : 0 }}
        transition={{ duration: 0.55, ease: "easeInOut" }}
        style={{ transformOrigin: "4px 13px", transformBox: "fill-box" as const }}
      >
        <rect x="4" y="7" width="16" height="12" rx="1.5" fill="hsl(var(--card))" stroke={color} />
        <circle cx="16" cy="13" r="1.2" fill={color} />
      </motion.g>
    </svg>
  );
}

/** Falling ₹ glyphs inside the card while wallet is open. */
function FallingNotesLayer({ isHovered }: { isHovered: boolean }) {
  const [notes, setNotes] = useState<{ id: number; x: number; r: number }[]>([]);
  useEffect(() => {
    if (!isHovered) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    // Small delay so the wallet visibly opens before notes start falling.
    const delayId = setTimeout(() => {
      const spawn = () =>
        setNotes((n) => [
          ...n,
          { id: Date.now() + Math.random(), x: 8 + Math.random() * 26, r: -20 + Math.random() * 40 },
        ]);
      spawn();
      intervalId = setInterval(spawn, 380);
    }, 350);
    return () => {
      clearTimeout(delayId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [isHovered]);


  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
      <AnimatePresence>
        {notes.map((n) => (
          <motion.span
            key={n.id}
            initial={{ y: -4, opacity: 0, rotate: n.r }}
            animate={{ y: 140, opacity: [0, 1, 1, 0], rotate: n.r + 35 }}
            transition={{ duration: 2.2, ease: "easeIn", times: [0, 0.15, 0.75, 1] }}
            onAnimationComplete={() => setNotes((ns) => ns.filter((x) => x.id !== n.id))}
            className="absolute text-[11px] font-semibold"
            style={{ right: n.x, top: 14, color: "#34d399", textShadow: "0 0 6px rgba(52,211,153,0.6)" }}
          >
            ₹
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}


function TaskRow({
  task,
  onToggle,
  onChange,
  onDelete,
}: {
  task: Task;
  onToggle: () => void;
  onChange: (v: string) => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className="flex items-center gap-2 group relative z-10"
    >
      <button
        type="button"
        onClick={onToggle}
        className="p-1 shrink-0 transition-colors"
        aria-pressed={task.completed}
        title={task.completed ? "Mark incomplete" : "Task completed"}
        style={{ color: task.completed ? "#34d399" : undefined }}
      >
        {task.completed ? <CheckCircle2 size={20} /> : <Circle size={18} className="opacity-60" />}
      </button>

      <div className="relative flex-1">
        <input
          value={task.title}
          onChange={(e) => onChange(e.target.value)}
          placeholder="New task…"
          className={`w-full bg-transparent outline-none font-hand text-xl placeholder:opacity-40 transition-opacity ${
            task.completed ? "opacity-70" : ""
          }`}
          style={{ color: "#e8d5b0", height: "36px", lineHeight: "36px" }}
        />
        {/* Green strikethrough animated line cutting across the text */}
        <svg
          className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2"
          height="3"
          width="100%"
          preserveAspectRatio="none"
        >
          <motion.line
            x1="0"
            y1="1.5"
            x2="100%"
            y2="1.5"
            stroke="#34d399"
            strokeWidth="2"
            strokeLinecap="round"
            initial={false}
            animate={{ pathLength: task.completed ? 1 : 0, opacity: task.completed ? 1 : 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            style={{ filter: "drop-shadow(0 0 4px #34d399)" }}
          />
        </svg>
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive transition px-2"
        title="Remove task"
      >
        <Trash2 size={14} />
      </button>
    </motion.div>
  );
}

function UnitPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
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
        className="w-full bg-white/5 rounded px-1.5 py-0.5 outline-none text-sm"
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
      className="w-full bg-transparent outline-none text-lg font-hand cursor-pointer"
    >
      <option value="" className="bg-card text-white font-sans">
        —
      </option>
      {UNITS.map((u) => (
        <option key={u} value={u} className="bg-card text-white font-sans">
          {u}
        </option>
      ))}
      <option value="__other__" className="bg-card text-white font-sans">
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
        checked ? "bg-primary border-primary" : "border-white/30 hover:border-primary/60"
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
