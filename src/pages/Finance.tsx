import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Plus, Trash2, Receipt, CreditCard, Upload, X, FileText, Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import PageTransition from "@/components/PageTransition";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { logExpense, removeExpense, inr } from "@/lib/expenses";
import { emiMonthsPaid, emiIsActive, type EmiRow } from "@/hooks/useBudgetSummary";

const BILL_CATEGORIES = ["Dine-out", "Utilities", "Education/Fees", "Medical", "Other"];

interface Bill {
  id: string;
  title: string;
  category: string;
  amount: number;
  bill_date: string;
  receipt_url: string | null;
}

export default function Finance() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const fid = profile?.family_id ?? null;
  const [tab, setTab] = useState<"emis" | "bills">("emis");

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-5">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition hover:-translate-x-1"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <header>
          <h1 className="text-3xl font-bold text-white">EMI &amp; Bills</h1>
          <p className="text-sm text-muted-foreground">Loans, instalments and household bills — synced to your budget.</p>
        </header>

        <Toggle
          value={tab}
          onChange={(v) => setTab(v as "emis" | "bills")}
          options={[
            { key: "emis", label: "EMIs", icon: CreditCard },
            { key: "bills", label: "Household Bills", icon: Receipt },
          ]}
        />

        <AnimatePresence mode="wait">
          {tab === "emis" ? (
            <motion.div key="emis" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <EmiView fid={fid} userId={user?.id ?? null} />
            </motion.div>
          ) : (
            <motion.div key="bills" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <BillsView fid={fid} userId={user?.id ?? null} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}

/* ------------------------------------------------------------------ */
/* Shared toggle                                                       */
/* ------------------------------------------------------------------ */
export function Toggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { key: string; label: string; icon: React.ComponentType<{ size?: number }> }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card p-1">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`relative inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-white"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`toggle-${options.map((x) => x.key).join("-")}`}
                className="absolute inset-0 rounded-md bg-primary"
                transition={{ type: "spring", damping: 26, stiffness: 320 }}
              />
            )}
            <span className="relative flex items-center gap-2">
              <o.icon size={15} />
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* EMIs                                                                */
/* ------------------------------------------------------------------ */
function EmiView({ fid, userId }: { fid: string | null; userId: string | null }) {
  const [emis, setEmis] = useState<EmiRow[]>([]);
  const [title, setTitle] = useState("");
  const [monthly, setMonthly] = useState("");
  const [months, setMonths] = useState("");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [dueDay, setDueDay] = useState("5");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!fid) return;
    const load = async () => {
      const { data } = await supabase
        .from("emis")
        .select("id,title,monthly_payment,total_months,start_date,due_day")
        .eq("family_id", fid)
        .order("created_at", { ascending: false });
      setEmis(((data as EmiRow[]) ?? []).map((e) => ({ ...e, monthly_payment: Number(e.monthly_payment) })));
    };
    load();
    const ch = supabase
      .channel(`emis-${fid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "emis", filter: `family_id=eq.${fid}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fid]);

  const add = async () => {
    if (!fid) return;
    if (!title.trim()) return toast.error("Give the EMI a title");
    const pay = Number(monthly);
    const tot = Number(months);
    if (!pay || pay <= 0) return toast.error("Enter a monthly payment");
    if (!tot || tot <= 0) return toast.error("Enter the total number of months");
    setSaving(true);
    const { error } = await supabase.from("emis").insert({
      family_id: fid,
      title: title.trim(),
      monthly_payment: pay,
      total_months: Math.round(tot),
      start_date: start,
      due_day: Math.min(31, Math.max(1, Number(dueDay) || 1)),
      created_by: userId,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${title.trim()} added — ${inr(pay)}/month`);
    setTitle(""); setMonthly(""); setMonths("");
  };

  const del = async (e: EmiRow) => {
    const { error } = await supabase.from("emis").delete().eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success(`${e.title} removed`);
  };

  const activeTotal = emis.filter((e) => emiIsActive(e)).reduce((s, e) => s + e.monthly_payment, 0);
  const debtLeft = emis.reduce((s, e) => s + Math.max(0, e.total_months - emiMonthsPaid(e)) * e.monthly_payment, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Active monthly EMI" value={inr(activeTotal)} accent="#f59e0b" />
        <Stat label="Total remaining debt" value={inr(debtLeft)} accent="#ef4444" />
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">Add an EMI</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Car loan" className={inputCls} /></Field>
          <Field label="Monthly (₹)"><input value={monthly} onChange={(e) => setMonthly(e.target.value)} type="number" placeholder="12000" className={inputCls} /></Field>
          <Field label="Total months"><input value={months} onChange={(e) => setMonths(e.target.value)} type="number" placeholder="36" className={inputCls} /></Field>
          <Field label="Start date"><input value={start} onChange={(e) => setStart(e.target.value)} type="date" className={inputCls} /></Field>
          <Field label="Due day"><input value={dueDay} onChange={(e) => setDueDay(e.target.value)} type="number" min={1} max={31} className={inputCls} /></Field>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={saving}
          className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:brightness-110 transition disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add EMI
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <AnimatePresence initial={false}>
          {emis.map((e) => {
            const paid = emiMonthsPaid(e);
            const pct = Math.min(100, (paid / e.total_months) * 100);
            const left = Math.max(0, e.total_months - paid);
            const active = emiIsActive(e);
            return (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="rounded-xl border border-border bg-card p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{e.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {inr(e.monthly_payment)}/month · due on the {e.due_day}
                      {active ? "" : " · completed"}
                    </div>
                  </div>
                  <button type="button" onClick={() => del(e)} className="text-muted-foreground hover:text-destructive transition">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: active ? "hsl(var(--primary))" : "#64748b" }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div><div className="text-white font-medium">{paid} / {e.total_months}</div><div className="text-muted-foreground">months paid</div></div>
                  <div><div className="text-white font-medium">{inr(paid * e.monthly_payment)}</div><div className="text-muted-foreground">paid</div></div>
                  <div><div className="text-white font-medium">{inr(left * e.monthly_payment)}</div><div className="text-muted-foreground">remaining</div></div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {emis.length === 0 && <p className="text-sm text-muted-foreground">No EMIs yet.</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bills                                                               */
/* ------------------------------------------------------------------ */
function BillsView({ fid, userId }: { fid: string | null; userId: string | null }) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(BILL_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("All");
  const [preview, setPreview] = useState<Bill | null>(null);

  useEffect(() => {
    if (!fid) return;
    const load = async () => {
      const { data } = await supabase
        .from("bills")
        .select("id,title,category,amount,bill_date,receipt_url")
        .eq("family_id", fid)
        .order("bill_date", { ascending: false });
      setBills(((data as Bill[]) ?? []).map((b) => ({ ...b, amount: Number(b.amount) })));
    };
    load();
    const ch = supabase
      .channel(`bills-${fid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bills", filter: `family_id=eq.${fid}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fid]);

  const add = async () => {
    if (!fid) return;
    if (!title.trim()) return toast.error("Give the bill a title");
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter an amount");
    setSaving(true);
    let receipt_url: string | null = null;
    if (file) {
      const path = `${fid}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("bill_receipts").upload(path, file);
      if (upErr) {
        setSaving(false);
        return toast.error(`Receipt upload failed: ${upErr.message}`);
      }
      receipt_url = supabase.storage.from("bill_receipts").getPublicUrl(path).data.publicUrl;
    }
    const { data, error } = await supabase
      .from("bills")
      .insert({ family_id: fid, title: title.trim(), category, amount: amt, bill_date: date, receipt_url, created_by: userId })
      .select("id")
      .single();
    if (error) { setSaving(false); return toast.error(error.message); }
    await logExpense({
      familyId: fid,
      name: `${title.trim()} (${category})`,
      cost: amt,
      sourceType: "bill",
      sourceId: (data as { id: string }).id,
      userId,
      at: new Date(`${date}T12:00:00`).toISOString(),
    });
    setSaving(false);
    toast.success(`Added ${inr(amt)} to this month's spend`);
    setTitle(""); setAmount(""); setFile(null);
  };

  const del = async (b: Bill) => {
    await removeExpense("bill", b.id);
    const { error } = await supabase.from("bills").delete().eq("id", b.id);
    if (error) return toast.error(error.message);
    toast.success(`Removed ${inr(b.amount)}`);
  };

  const shown = useMemo(
    () => (filter === "All" ? bills : bills.filter((b) => b.category === filter)),
    [bills, filter],
  );
  const total = shown.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">Add a bill</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Electricity" className={inputCls} /></Field>
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              {BILL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Amount (₹)"><input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="1800" className={inputCls} /></Field>
          <Field label="Date"><input value={date} onChange={(e) => setDate(e.target.value)} type="date" className={inputCls} /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground border border-border rounded-md px-3 py-2 cursor-pointer hover:text-white hover:border-primary/60 transition">
            <Upload size={14} />
            {file ? file.name : "Attach receipt"}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {file && (
            <button type="button" onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive"><X size={14} /></button>
          )}
          <button
            type="button"
            onClick={add}
            disabled={saving}
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:brightness-110 transition disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add bill
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {["All", ...BILL_CATEGORIES].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              filter === c ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-white"
            }`}
          >
            {c}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">Total: <span className="text-white font-medium">{inr(total)}</span></span>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left px-4 py-3">Title</th>
              <th className="text-left px-4 py-3 hidden sm:table-cell">Category</th>
              <th className="text-left px-4 py-3 hidden sm:table-cell">Date</th>
              <th className="text-right px-4 py-3">Amount</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {shown.map((b) => (
                <motion.tr
                  key={b.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, x: -12 }}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="px-4 py-3 text-white">{b.title}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{b.category}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{b.bill_date}</td>
                  <td className="px-4 py-3 text-right text-white">{inr(b.amount)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      {b.receipt_url && (
                        <button type="button" onClick={() => setPreview(b)} className="text-muted-foreground hover:text-primary transition" title="View receipt">
                          <FileText size={16} />
                        </button>
                      )}
                      <button type="button" onClick={() => del(b)} className="text-muted-foreground hover:text-destructive transition">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
        {shown.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No bills yet.</p>}
      </div>

      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setPreview(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-xl max-w-2xl w-full max-h-[85vh] overflow-auto p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-white">{preview.title}</span>
                <button type="button" onClick={() => setPreview(null)} className="text-muted-foreground hover:text-white"><X size={16} /></button>
              </div>
              {preview.receipt_url?.match(/\.pdf($|\?)/i) ? (
                <iframe src={preview.receipt_url} title="Receipt" className="w-full h-[70vh] rounded-md bg-white" />
              ) : (
                <img src={preview.receipt_url ?? ""} alt={`Receipt for ${preview.title}`} className="w-full rounded-md" />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export const inputCls =
  "w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm text-white outline-none focus:border-primary transition";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold" style={{ color: accent ?? "white" }}>{value}</div>
    </div>
  );
}
