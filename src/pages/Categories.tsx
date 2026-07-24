import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Package, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import PageTransition from "@/components/PageTransition";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}
interface Item {
  id: string;
  name: string;
  status: string;
  priority: string | null;
  category_id: string | null;
}

const ICONS = ["🛒", "🥦", "🧼", "💡", "🍞", "🍎", "🧴", "🧻", "🥛", "🍫", "🧊", "📦"];
const COLORS = [
  "hsl(var(--primary))",
  "#f87171",
  "#fbbf24",
  "#34d399",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
];

export default function Categories() {
  const { profile, user } = useAuth();
  const fid = profile?.family_id ?? null;
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!fid) return;
    const load = async () => {
      const [{ data: c }, { data: i }] = await Promise.all([
        supabase.from("categories").select("*").eq("family_id", fid).order("name"),
        supabase.from("items").select("id,name,status,priority,category_id").eq("family_id", fid),
      ]);
      setCats((c as Category[]) ?? []);
      setItems((i as Item[]) ?? []);
    };
    load();
    const ch = supabase
      .channel(`categories-${fid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "categories", filter: `family_id=eq.${fid}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `family_id=eq.${fid}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [fid]);

  const counts = useMemo(() => {
    const map = new Map<string, { total: number; urgent: number; low: number; needed: number }>();
    for (const i of items) {
      if (!i.category_id) continue;
      const c = map.get(i.category_id) ?? { total: 0, urgent: 0, low: 0, needed: 0 };
      if (i.status !== "stocked") {
        c.total++;
        if (i.priority === "urgent" || i.status === "urgent") c.urgent++;
        else if (i.status === "low_stock") c.low++;
        else if (i.status === "needed") c.needed++;
      }
      map.set(i.category_id, c);
    }
    return map;
  }, [items]);

  const submit = async () => {
    if (!fid || !user || !name.trim()) return;
    if (editingId) {
      const { error } = await supabase.from("categories").update({ name: name.trim(), icon, color }).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Category updated");
    } else {
      const { error } = await supabase.from("categories").insert({
        family_id: fid,
        name: name.trim(),
        icon,
        color,
        created_by: user.id,
      });
      if (error) return toast.error(error.message);
      toast.success("Category created");
    }
    setName(""); setIcon(ICONS[0]); setColor(COLORS[0]); setCreating(false); setEditingId(null);
  };

  const del = async (id: string) => {
    if (!confirm("Delete this category? Items will keep their history but lose their category link.")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Category deleted");
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setName(c.name);
    setIcon(c.icon ?? ICONS[0]);
    setColor(c.color ?? COLORS[0]);
    setCreating(true);
  };

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Categories</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Organise your household by area — grocery, personal care, utilities…
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setCreating(true); setEditingId(null); setName(""); }}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-md bg-primary text-primary-foreground hover:brightness-110 transition"
          >
            <Plus size={16} /> New
          </button>
        </div>

        <AnimatePresence>
          {creating && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 overflow-hidden"
            >
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Category name"
                  className="w-full bg-muted rounded-md px-3 py-2 text-sm outline-none border border-transparent focus:border-primary"
                />
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">Icon</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ICONS.map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setIcon(ic)}
                        className={`h-9 w-9 rounded-md text-lg flex items-center justify-center border transition ${
                          icon === ic ? "border-primary bg-primary/10" : "border-border bg-muted hover:border-primary/40"
                        }`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">Colour</div>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map((cl) => (
                      <button
                        key={cl}
                        type="button"
                        onClick={() => setColor(cl)}
                        className={`h-7 w-7 rounded-full border-2 transition ${color === cl ? "border-white scale-110" : "border-transparent"}`}
                        style={{ background: cl }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setCreating(false); setEditingId(null); }}
                    className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-white"
                  >
                    <X size={14} /> Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!name.trim()}
                    className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:brightness-110"
                  >
                    <Check size={14} /> {editingId ? "Save" : "Create"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {cats.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <Package className="mx-auto text-muted-foreground mb-3" size={40} />
            <p className="text-white font-medium">No categories yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first one to start organising items.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {cats.map((c) => {
              const k = counts.get(c.id) ?? { total: 0, urgent: 0, low: 0, needed: 0 };
              return (
                <motion.div
                  key={c.id}
                  whileHover={{ y: -3 }}
                  className="group rounded-xl border border-border bg-card p-4 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between">
                    <div
                      className="h-11 w-11 rounded-lg flex items-center justify-center text-2xl"
                      style={{ background: (c.color ?? "hsl(var(--primary))") + "22", color: c.color ?? undefined }}
                    >
                      {c.icon ?? "📦"}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => del(c.id)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 text-white font-semibold truncate">{c.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {k.total} active item{k.total === 1 ? "" : "s"}
                  </div>
                  {k.total > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {k.urgent > 0 && (
                        <span className="text-[10px] uppercase tracking-wider border rounded-full px-2 py-0.5 bg-destructive/15 text-destructive border-destructive/30">
                          {k.urgent} urgent
                        </span>
                      )}
                      {k.low > 0 && (
                        <span className="text-[10px] uppercase tracking-wider border rounded-full px-2 py-0.5 bg-warning/15 text-warning border-warning/30">
                          {k.low} low
                        </span>
                      )}
                      {k.needed > 0 && (
                        <span className="text-[10px] uppercase tracking-wider border rounded-full px-2 py-0.5 bg-primary/10 text-primary border-primary/30">
                          {k.needed} needed
                        </span>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
