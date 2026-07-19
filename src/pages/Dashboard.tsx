import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, TrendingDown } from "lucide-react";
import PageTransition from "@/components/PageTransition";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

interface Item {
  id: string;
  name: string;
  status: string;
  priority: string | null;
  quantity: number | null;
  unit: string | null;
  category_id: string | null;
  assigned_to: string | null;
  created_at: string;
}

interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good Morning", emoji: "☀️" };
  if (h < 17) return { text: "Good Afternoon", emoji: "🌤️" };
  if (h < 20) return { text: "Good Evening", emoji: "🌅" };
  return { text: "Good Night", emoji: "🌙" };
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

function formatDate(d: Date) {
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function Dashboard() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budget, setBudget] = useState<number>(0);
  const [spent, setSpent] = useState<number>(0);

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const g = greeting();
  const greetingText = `${g.text}, ${firstName} ${g.emoji}`;
  const typed = useTypewriter(greetingText, 40, true);
  const dateStr = formatDate(new Date());
  const typedDate = useTypewriter(dateStr, 30, typed === greetingText);

  useEffect(() => {
    if (!profile?.family_id) return;
    const fid = profile.family_id;

    const loadItems = async () => {
      const { data } = await supabase
        .from("items")
        .select("*")
        .eq("family_id", fid)
        .order("created_at", { ascending: false });
      setItems((data as Item[]) ?? []);
    };
    const loadCats = async () => {
      const { data } = await supabase
        .from("categories")
        .select("*")
        .eq("family_id", fid);
      setCategories((data as Category[]) ?? []);
    };
    const loadBudget = async () => {
      const now = new Date();
      const { data } = await supabase
        .from("budgets")
        .select("amount, spent")
        .eq("family_id", fid)
        .eq("month", now.getMonth() + 1)
        .eq("year", now.getFullYear())
        .maybeSingle();
      if (data) {
        setBudget(Number(data.amount) || 0);
        setSpent(Number(data.spent) || 0);
      } else {
        // fallback: use family monthly budget
        const { data: fam } = await supabase
          .from("families")
          .select("monthly_budget")
          .eq("id", fid)
          .maybeSingle();
        setBudget(Number(fam?.monthly_budget) || 0);

        // sum purchase_history this month
        const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const { data: hist } = await supabase
          .from("purchase_history")
          .select("cost")
          .eq("family_id", fid)
          .gte("purchased_at", first);
        const s = (hist ?? []).reduce((acc: number, r: { cost: number | null }) => acc + (Number(r.cost) || 0), 0);
        setSpent(s);
      }
    };

    loadItems();
    loadCats();
    loadBudget();

    const ch = supabase
      .channel(`dashboard-${fid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items", filter: `family_id=eq.${fid}` },
        loadItems,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchase_history", filter: `family_id=eq.${fid}` },
        loadBudget,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile?.family_id]);

  const active = items.filter((i) => i.status !== "stocked");
  const urgent = active.filter((i) => i.priority === "urgent" || i.status === "urgent").length;
  const lowStock = active.filter((i) => i.status === "low_stock").length;
  const needed = active.length;

  const budgetPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;

  const recent = useMemo(() => active.slice(0, 5), [active]);
  const mine = useMemo(
    () => active.filter((i) => i.assigned_to === user?.id).slice(0, 5),
    [active, user?.id],
  );

  const catCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of active) if (i.category_id) map.set(i.category_id, (map.get(i.category_id) ?? 0) + 1);
    return map;
  }, [active]);

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Notebook / Greeting */}
        <div className="paper-dark rounded-xl px-14 py-8">
          <h1 className="font-hand text-4xl md:text-5xl min-h-[1.2em]">
            {typed}
            {typed.length < greetingText.length && <span className="animate-pulse">|</span>}
          </h1>
          <p className="font-hand text-2xl mt-3 opacity-80 min-h-[1.2em]">
            {typedDate}
          </p>
        </div>

        {/* Stat boxes */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Items Needed"
            value={needed}
            color="#3ecf8e"
            icon={<span className="text-3xl">📦</span>}
            onClick={() => navigate("/shopping?tab=needed")}
          />
          <StatCard
            label="Urgent"
            value={urgent}
            color="#ef4444"
            icon={<AlertTriangle size={28} />}
            onClick={() => navigate("/shopping?tab=urgent")}
          />
          <StatCard
            label="Low Stock"
            value={lowStock}
            color="#f59e0b"
            icon={<TrendingDown size={28} />}
            onClick={() => navigate("/shopping?tab=low_stock")}
          />
          <StatCard
            label="Budget Used"
            value={`${budgetPct}%`}
            sub={`₹${spent.toLocaleString("en-IN")} / ₹${budget.toLocaleString("en-IN")}`}
            color="#7c3aed"
            icon={<span className="text-3xl">💳</span>}
            onClick={() => navigate("/budget")}
          />
        </div>

        {/* Categories preview */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">Categories</h2>
            <button onClick={() => navigate("/categories")} className="text-sm text-primary hover:underline">
              All →
            </button>
          </div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {categories.slice(0, 10).map((c, i) => {
              const cnt = catCounts.get(c.id) ?? 0;
              return (
                <motion.button
                  key={c.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => navigate(`/categories`)}
                  className={`rounded-xl border p-4 text-left transition hover:scale-[1.03] ${
                    cnt > 0 ? "border-primary/40 bg-primary/5 shadow-[0_0_0_1px_rgba(62,207,142,0.25)]" : "border-border bg-card"
                  }`}
                >
                  <div className="text-2xl mb-1">{c.icon ?? "📦"}</div>
                  <div className="text-sm font-medium text-white truncate">{c.name}</div>
                  <div className={`mt-1 text-xs ${cnt > 0 ? "text-primary" : "text-muted-foreground"}`}>
                    {cnt} active
                  </div>
                </motion.button>
              );
            })}
            {categories.length === 0 && (
              <div className="col-span-full rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                No categories yet.
              </div>
            )}
          </div>
        </section>

        {/* Recently added + Assigned to me */}
        <section className="grid gap-4 md:grid-cols-2">
          <ItemList title="Recently added" items={recent} />
          <ItemList title="Assigned to me" items={mine} emptyText="Nothing assigned to you." />
        </section>
      </div>
    </PageTransition>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
  icon,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="relative overflow-hidden rounded-xl border border-border bg-card p-5 text-left transition"
      style={{ boxShadow: `inset 0 0 0 1px ${color}22` }}
    >
      <div className="absolute top-4 right-4 opacity-80" style={{ color }}>
        {icon}
      </div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold text-white mt-2" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </motion.button>
  );
}

function ItemList({ title, items, emptyText }: { title: string; items: Item[]; emptyText?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText ?? "Nothing here yet."}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <span className="text-sm text-white">{i.name}</span>
              <span className="text-xs text-muted-foreground">
                {i.quantity ?? ""} {i.unit ?? ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
