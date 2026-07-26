import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageTransition from "@/components/PageTransition";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useBudgetSummary } from "@/hooks/useBudgetSummary";
import { toast } from "sonner";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

interface HistoryRow {
  cost: number;
  purchased_at: string;
  category_id: string | null;
}
interface Category { id: string; name: string; color: string | null }

const COLORS = ["#3ecf8e", "#7c3aed", "#f59e0b", "#ef4444", "#38bdf8", "#f472b6", "#a3e635", "#fb923c"];

export default function Budget() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const fid = profile?.family_id ?? null;

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [amount, setAmount] = useState<number>(0);
  const [amountDraft, setAmountDraft] = useState<string>("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [cats, setCats] = useState<Category[]>([]);

  useEffect(() => {
    if (!fid) return;
    let cancelled = false;
    const load = async () => {
      const sixMonthsAgo = new Date(year, month - 6, 1).toISOString();
      const [{ data: b }, { data: h }, { data: c }] = await Promise.all([
        supabase.from("budgets").select("amount").eq("family_id", fid).eq("month", month).eq("year", year).maybeSingle(),
        supabase.from("purchase_history").select("cost,purchased_at,category_id").eq("family_id", fid).gte("purchased_at", sixMonthsAgo),
        supabase.from("categories").select("id,name,color").eq("family_id", fid),
      ]);
      if (cancelled) return;
      const amt = Number((b as { amount?: number } | null)?.amount ?? 0);
      setAmount(amt);
      setAmountDraft(String(amt || ""));
      setHistory((h as HistoryRow[]) ?? []);
      setCats((c as Category[]) ?? []);
    };
    load();
    const ch = supabase
      .channel(`budget-${fid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_history", filter: `family_id=eq.${fid}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "budgets", filter: `family_id=eq.${fid}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [fid, month, year]);

  const monthSpent = useMemo(
    () => history.filter((r) => {
      const d = new Date(r.purchased_at);
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    }).reduce((s, r) => s + Number(r.cost || 0), 0),
    [history, month, year],
  );

  const pct = amount > 0 ? Math.min(100, (monthSpent / amount) * 100) : 0;
  const remaining = Math.max(0, amount - monthSpent);
  const health = pct < 70 ? "#3ecf8e" : pct < 90 ? "#fbbf24" : "#ef4444";
  const healthLabel = pct < 70 ? "Healthy" : pct < 90 ? "Watchful" : "Over budget";

  const catData = useMemo(() => {
    const map = new Map<string, number>();
    history
      .filter((r) => {
        const d = new Date(r.purchased_at);
        return d.getMonth() + 1 === month && d.getFullYear() === year;
      })
      .forEach((r) => {
        const key = r.category_id ?? "uncategorized";
        map.set(key, (map.get(key) ?? 0) + Number(r.cost || 0));
      });
    const nameOf = new Map(cats.map((c) => [c.id, c.name]));
    return Array.from(map.entries())
      .map(([id, v]) => ({ name: id === "uncategorized" ? "Uncategorized" : nameOf.get(id) ?? "Other", value: Math.round(v) }))
      .sort((a, b) => b.value - a.value);
  }, [history, cats, month, year]);

  const donut = amount > 0
    ? [{ name: "Spent", value: Math.min(monthSpent, amount) }, { name: "Remaining", value: remaining }]
    : [{ name: "Spent", value: monthSpent || 1 }];

  const trend = useMemo(() => {
    const buckets: { label: string; spent: number; key: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      buckets.push({ label: d.toLocaleDateString(undefined, { month: "short" }), spent: 0, key });
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    history.forEach((r) => {
      const d = new Date(r.purchased_at);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      const i = idx.get(k);
      if (i != null) buckets[i].spent += Number(r.cost || 0);
    });
    return buckets.map((b) => ({ label: b.label, spent: Math.round(b.spent) }));
  }, [history, month, year]);

  const saveBudget = async () => {
    if (!fid) return;
    const value = Number(amountDraft) || 0;
    const { error } = await supabase.from("budgets").upsert(
      { family_id: fid, month, year, amount: value, spent: monthSpent, updated_at: new Date().toISOString() },
      { onConflict: "family_id,month,year" },
    );
    if (error) return toast.error(error.message);
    setAmount(value);
    toast.success("Budget saved");
  };

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-5">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition hover:-translate-x-1"
        >
          <ArrowLeft size={16}/> Back
        </button>

        <header className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-bold text-white">Budget</h1>
            <p className="text-sm text-muted-foreground">
              {now.toLocaleDateString(undefined, { month: "long", year: "numeric" })} · real-time spend
            </p>
          </div>
        </header>

        {/* Setup + Health */}
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Monthly budget</label>
            <div className="flex gap-2 items-center">
              <span className="text-2xl text-muted-foreground">₹</span>
              <input
                value={amountDraft}
                onChange={(e) => setAmountDraft(e.target.value)}
                type="number"
                placeholder="0"
                className="flex-1 bg-transparent text-3xl font-semibold text-white outline-none border-b border-border focus:border-primary py-1"
              />
            </div>
            <button
              type="button"
              onClick={saveBudget}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:brightness-110 transition"
            >
              <Save size={14}/> Save
            </button>
            <div className="text-xs text-muted-foreground pt-2 border-t border-border">
              Spent so far: <span className="text-white font-medium">₹{monthSpent.toLocaleString("en-IN")}</span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Budget health</div>
                <div className="text-2xl font-semibold" style={{ color: health }}>{healthLabel}</div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-white">{Math.round(pct)}%</div>
                <div className="text-xs text-muted-foreground">
                  ₹{monthSpent.toLocaleString("en-IN")} / ₹{amount.toLocaleString("en-IN")}
                </div>
              </div>
            </div>
            <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: health, boxShadow: `0 0 12px ${health}` }}
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <Metric label="Budget" value={`₹${amount.toLocaleString("en-IN")}`}/>
              <Metric label="Spent" value={`₹${monthSpent.toLocaleString("en-IN")}`} accent={health}/>
              <Metric label="Remaining" value={`₹${remaining.toLocaleString("en-IN")}`} accent="#34d399"/>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="By category" subtitle="This month">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={catData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a"/>
                <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false}/>
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false}/>
                <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8 }} itemStyle={{ color: "#e5e5e5" }} labelStyle={{ color: "#e5e5e5" }}/>
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Used vs remaining" subtitle="Current month">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                  <Cell fill={health}/>
                  <Cell fill="#2a2a2a"/>
                </Pie>
                <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8 }} itemStyle={{ color: "#e5e5e5" }} labelStyle={{ color: "#e5e5e5" }}/>
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="6-month trend" subtitle="Total spent per month" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a"/>
                <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false}/>
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} tickLine={false} axisLine={false}/>
                <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8 }} itemStyle={{ color: "#e5e5e5" }} labelStyle={{ color: "#e5e5e5" }}/>
                <Line type="monotone" dataKey="spent" stroke="#3ecf8e" strokeWidth={2.5} dot={{ r: 4, fill: "#3ecf8e" }} activeDot={{ r: 6 }}/>
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </PageTransition>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-1" style={{ color: accent ?? "#fff" }}>{value}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>
      <div className="mb-3">
        <div className="text-sm font-semibold text-white">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}
