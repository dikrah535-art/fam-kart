import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Fuel, Plane, Plus, Trash2, Upload, X, FileText, Loader2, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import PageTransition from "@/components/PageTransition";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { logExpense, removeExpense, inr } from "@/lib/expenses";
import { Toggle, Field, Stat, inputCls } from "@/pages/Finance";
import {
  STATES, citiesOf, FUEL_TYPES, FUEL_UNIT, fetchFuelRate, fallbackRate, type FuelType,
} from "@/lib/fuelRates";

const KINDS = ["Cab", "Hotel", "Flight", "Train", "Toll", "Other"];

interface FuelLog {
  id: string; state: string | null; city: string | null; fuel_type: string;
  rate: number; quantity: number; amount: number; logged_at: string;
}
interface Trip {
  id: string; title: string; kind: string; amount: number; spent_on: string; receipt_url: string | null;
}

export default function Mobility() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const fid = profile?.family_id ?? null;
  const [tab, setTab] = useState<"fuel" | "transport">("fuel");

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
          <h1 className="text-3xl font-bold text-white">Fuel &amp; Transport</h1>
          <p className="text-sm text-muted-foreground">Live-ish fuel rates, a two-way calculator, and every trip you pay for.</p>
        </header>

        <Toggle
          value={tab}
          onChange={(v) => setTab(v as "fuel" | "transport")}
          options={[
            { key: "fuel", label: "Fuel Tracker & Calculator", icon: Fuel },
            { key: "transport", label: "Transport Expenses", icon: Plane },
          ]}
        />

        <AnimatePresence mode="wait">
          {tab === "fuel" ? (
            <motion.div key="fuel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <FuelView fid={fid} userId={user?.id ?? null} />
            </motion.div>
          ) : (
            <motion.div key="tr" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <TransportView fid={fid} userId={user?.id ?? null} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}

/* ------------------------------------------------------------------ */
/* Fuel                                                                */
/* ------------------------------------------------------------------ */
function FuelView({ fid, userId }: { fid: string | null; userId: string | null }) {
  const [state, setState] = useState(STATES[0]);
  const [city, setCity] = useState(citiesOf(STATES[0])[0]);
  const [fuel, setFuel] = useState<FuelType>("Petrol");
  const [rate, setRate] = useState(fallbackRate(STATES[0], citiesOf(STATES[0])[0], "Petrol"));
  const [source, setSource] = useState<"live" | "average">("average");
  const [loadingRate, setLoadingRate] = useState(false);

  const [mode, setMode] = useState<"amount" | "quantity">("amount");
  const [amountIn, setAmountIn] = useState("");
  const [qtyIn, setQtyIn] = useState("");
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [saving, setSaving] = useState(false);

  const unit = FUEL_UNIT[fuel];

  const refreshRate = async (s = state, c = city, f = fuel) => {
    setLoadingRate(true);
    const r = await fetchFuelRate(s, c, f);
    setRate(r.rate);
    setSource(r.source);
    setLoadingRate(false);
  };

  useEffect(() => { refreshRate(state, city, fuel); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [state, city, fuel]);

  useEffect(() => {
    if (!fid) return;
    const load = async () => {
      const { data } = await supabase
        .from("fuel_logs")
        .select("id,state,city,fuel_type,rate,quantity,amount,logged_at")
        .eq("family_id", fid)
        .order("logged_at", { ascending: false })
        .limit(30);
      setLogs(((data as FuelLog[]) ?? []).map((l) => ({
        ...l, rate: Number(l.rate), quantity: Number(l.quantity), amount: Number(l.amount),
      })));
    };
    load();
    const ch = supabase
      .channel(`fuel-${fid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fuel_logs", filter: `family_id=eq.${fid}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fid]);

  const derivedQty = mode === "amount" ? (Number(amountIn) || 0) / (rate || 1) : Number(qtyIn) || 0;
  const derivedAmount = mode === "amount" ? Number(amountIn) || 0 : (Number(qtyIn) || 0) * rate;

  const log = async () => {
    if (!fid) return;
    if (derivedAmount <= 0) return toast.error("Enter an amount or a quantity first");
    setSaving(true);
    const { data, error } = await supabase
      .from("fuel_logs")
      .insert({
        family_id: fid, state, city, fuel_type: fuel,
        rate, quantity: Number(derivedQty.toFixed(3)), amount: Number(derivedAmount.toFixed(2)),
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) { setSaving(false); return toast.error(error.message); }
    await logExpense({
      familyId: fid,
      name: `${fuel} · ${city} (${derivedQty.toFixed(2)} ${unit})`,
      cost: Number(derivedAmount.toFixed(2)),
      sourceType: "fuel",
      sourceId: (data as { id: string }).id,
      userId,
    });
    setSaving(false);
    setAmountIn(""); setQtyIn("");
    toast.success(`Added ${inr(Math.round(derivedAmount))} to this month's spend`);
  };

  const del = async (l: FuelLog) => {
    await removeExpense("fuel", l.id);
    const { error } = await supabase.from("fuel_logs").delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success(`Removed ${inr(Math.round(l.amount))}`);
  };

  const monthTotal = logs
    .filter((l) => new Date(l.logged_at).getMonth() === new Date().getMonth())
    .reduce((s, l) => s + l.amount, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label={`${fuel} rate · ${city}`} value={`₹${rate.toFixed(2)} / ${unit}`} accent="hsl(var(--primary))" />
        <Stat label="Fuel spend this month" value={inr(Math.round(monthTotal))} accent="#f59e0b" />
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="State">
            <select
              value={state}
              onChange={(e) => { setState(e.target.value); setCity(citiesOf(e.target.value)[0]); }}
              className={inputCls}
            >
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="City">
            <select value={city} onChange={(e) => setCity(e.target.value)} className={inputCls}>
              {citiesOf(state).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Fuel type">
            <select value={fuel} onChange={(e) => setFuel(e.target.value as FuelType)} className={inputCls}>
              {FUEL_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => refreshRate()}
              className="inline-flex items-center gap-1.5 border border-border rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-white hover:border-primary/60 transition w-full justify-center"
            >
              {loadingRate ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {source === "live" ? "Live price" : "Monthly average"}
            </button>
          </div>
        </div>

        {/* Bi-directional calculator */}
        <div className="rounded-lg border border-border/70 p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-semibold text-white">Calculator</span>
            <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
              {(["amount", "quantity"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 transition ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-white"}`}
                >
                  {m === "amount" ? "₹ → quantity" : `${unit} → ₹`}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {mode === "amount" ? (
              <>
                <Field label="Amount (₹)">
                  <input value={amountIn} onChange={(e) => setAmountIn(e.target.value)} type="number" placeholder="500" className={inputCls} />
                </Field>
                <Field label={`You get (${unit})`}>
                  <div className="rounded-md border border-border px-3 py-2 text-sm text-primary font-semibold">
                    {derivedQty ? derivedQty.toFixed(2) : "—"} {unit}
                  </div>
                </Field>
              </>
            ) : (
              <>
                <Field label={`Quantity (${unit})`}>
                  <input value={qtyIn} onChange={(e) => setQtyIn(e.target.value)} type="number" placeholder="10" className={inputCls} />
                </Field>
                <Field label="You pay (₹)">
                  <div className="rounded-md border border-border px-3 py-2 text-sm text-primary font-semibold">
                    {derivedAmount ? inr(Math.round(derivedAmount)) : "—"}
                  </div>
                </Field>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={log}
            disabled={saving}
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:brightness-110 transition disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Log fuel expense
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border/60">
        <AnimatePresence initial={false}>
          {logs.map((l) => (
            <motion.div
              key={l.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <div className="text-white">{l.fuel_type} · {l.quantity} {FUEL_UNIT[(l.fuel_type as FuelType)] ?? "L"}</div>
                <div className="text-xs text-muted-foreground">
                  {l.city ?? "—"} · ₹{Number(l.rate).toFixed(2)}/unit · {new Date(l.logged_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white font-medium">{inr(Math.round(l.amount))}</span>
                <button type="button" onClick={() => del(l)} className="text-muted-foreground hover:text-destructive transition">
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {logs.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No fuel logged yet.</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */
function TransportView({ fid, userId }: { fid: string | null; userId: string | null }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState(KINDS[0]);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("All");
  const [preview, setPreview] = useState<Trip | null>(null);

  useEffect(() => {
    if (!fid) return;
    const load = async () => {
      const { data } = await supabase
        .from("transport_expenses")
        .select("id,title,kind,amount,spent_on,receipt_url")
        .eq("family_id", fid)
        .order("spent_on", { ascending: false });
      setTrips(((data as Trip[]) ?? []).map((t) => ({ ...t, amount: Number(t.amount) })));
    };
    load();
    const ch = supabase
      .channel(`transport-${fid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transport_expenses", filter: `family_id=eq.${fid}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fid]);

  const add = async () => {
    if (!fid) return;
    if (!title.trim()) return toast.error("Give the trip a title");
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter an amount");
    setSaving(true);
    let receipt_url: string | null = null;
    if (file) {
      const path = `${fid}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("bill_receipts").upload(path, file);
      if (upErr) { setSaving(false); return toast.error(`Receipt upload failed: ${upErr.message}`); }
      receipt_url = supabase.storage.from("bill_receipts").getPublicUrl(path).data.publicUrl;
    }
    const { data, error } = await supabase
      .from("transport_expenses")
      .insert({ family_id: fid, title: title.trim(), kind, amount: amt, spent_on: date, receipt_url, created_by: userId })
      .select("id")
      .single();
    if (error) { setSaving(false); return toast.error(error.message); }
    await logExpense({
      familyId: fid,
      name: `${title.trim()} (${kind})`,
      cost: amt,
      sourceType: "transport",
      sourceId: (data as { id: string }).id,
      userId,
      at: new Date(`${date}T12:00:00`).toISOString(),
    });
    setSaving(false);
    setTitle(""); setAmount(""); setFile(null);
    toast.success(`Added ${inr(amt)} to this month's spend`);
  };

  const del = async (t: Trip) => {
    await removeExpense("transport", t.id);
    const { error } = await supabase.from("transport_expenses").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success(`Removed ${inr(t.amount)}`);
  };

  const shown = useMemo(() => (filter === "All" ? trips : trips.filter((t) => t.kind === filter)), [trips, filter]);
  const total = shown.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">Add a transport expense</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Airport cab" className={inputCls} /></Field>
          <Field label="Type">
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Amount (₹)"><input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="640" className={inputCls} /></Field>
          <Field label="Date"><input value={date} onChange={(e) => setDate(e.target.value)} type="date" className={inputCls} /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground border border-border rounded-md px-3 py-2 cursor-pointer hover:text-white hover:border-primary/60 transition">
            <Upload size={14} />
            {file ? file.name : "Attach receipt"}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {file && <button type="button" onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive"><X size={14} /></button>}
          <button
            type="button"
            onClick={add}
            disabled={saving}
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:brightness-110 transition disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add expense
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {["All", ...KINDS].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              filter === k ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-white"
            }`}
          >
            {k}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">Total: <span className="text-white font-medium">{inr(total)}</span></span>
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border/60">
        <AnimatePresence initial={false}>
          {shown.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <div className="text-white">{t.title}</div>
                <div className="text-xs text-muted-foreground">{t.kind} · {t.spent_on}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white font-medium">{inr(t.amount)}</span>
                {t.receipt_url && (
                  <button type="button" onClick={() => setPreview(t)} className="text-muted-foreground hover:text-primary transition" title="View receipt">
                    <FileText size={16} />
                  </button>
                )}
                <button type="button" onClick={() => del(t)} className="text-muted-foreground hover:text-destructive transition">
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {shown.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">Nothing logged yet.</p>}
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
