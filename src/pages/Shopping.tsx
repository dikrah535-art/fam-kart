import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShoppingBasket, Check, ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import PageTransition from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

interface Item {
  id: string;
  name: string;
  status: string;
  priority: string | null;
  quantity: number | null;
  unit: string | null;
  estimated_cost: number | null;
  category_id: string | null;
  family_id: string;
}

const statusOrder: Record<string, number> = { urgent: 0, low_stock: 1, needed: 2 };

const statusBadge: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "bg-destructive/15 text-destructive border-destructive/30" },
  low_stock: { label: "Low Stock", className: "bg-warning/15 text-warning border-warning/30" },
  needed: { label: "Needed", className: "bg-primary/10 text-primary border-primary/30" },
};

export default function Shopping() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialTab = params.get("tab") ?? "all";
  const [tab, setTab] = useState(initialTab);
  const [items, setItems] = useState<Item[]>([]);
  const [buyItem, setBuyItem] = useState<Item | null>(null);
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (!profile?.family_id) return;
    const fid = profile.family_id;

    const load = async () => {
      const { data } = await supabase
        .from("items")
        .select("*")
        .eq("family_id", fid)
        .neq("status", "stocked");
      setItems((data as Item[]) ?? []);
    };
    load();

    const ch = supabase
      .channel(`shopping-${fid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items", filter: `family_id=eq.${fid}` },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile?.family_id]);

  const filtered = useMemo(() => {
    const sorted = [...items].sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3));
    if (tab === "all") return sorted;
    if (tab === "urgent") return sorted.filter((i) => i.priority === "urgent" || i.status === "urgent");
    if (tab === "low_stock") return sorted.filter((i) => i.status === "low_stock");
    if (tab === "needed") return sorted.filter((i) => i.status === "needed");
    return sorted;
  }, [items, tab]);

  const openBuy = (i: Item) => {
    setBuyItem(i);
    setPrice(i.estimated_cost != null ? String(i.estimated_cost) : "");
  };

  const confirmBuy = async () => {
    if (!buyItem || !profile?.family_id || !user) return;
    const cost = Number(price) || 0;
    // Optimistic remove
    setItems((prev) => prev.filter((x) => x.id !== buyItem.id));
    const { error: hErr } = await supabase.from("purchase_history").insert({
      family_id: profile.family_id,
      item_id: buyItem.id,
      category_id: buyItem.category_id,
      quantity: buyItem.quantity,
      unit: buyItem.unit,
      cost,
      source_type: "shopping_list",
      source_id: buyItem.id,
      item_name: buyItem.name,
      purchased_at: new Date().toISOString(),
    });
    const { error: uErr } = await supabase
      .from("items")
      .update({ status: "stocked", updated_at: new Date().toISOString() })
      .eq("id", buyItem.id);
    if (hErr || uErr) {
      toast.error("Failed to save. Please retry.");
    } else {
      toast.success(`✓ ${buyItem.name} bought · ₹${cost.toLocaleString("en-IN")}`);
    }
    setBuyItem(null);
    setPrice("");
  };

  const tabs = [
    { id: "all", label: "All" },
    { id: "needed", label: "Needed" },
    { id: "urgent", label: "Urgent" },
    { id: "low_stock", label: "Low Stock" },
  ];

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition mb-4 hover:-translate-x-1"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="flex items-baseline justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">Shopping List</h1>
          <span className="text-sm text-muted-foreground">{items.length} items</span>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <ShoppingBasket className="mx-auto text-muted-foreground mb-3" size={40} />
            <p className="text-white font-medium">Nothing to buy right now</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your family's shopping list is empty. Add items from Categories.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {filtered.map((i) => {
                const badge = statusBadge[i.status] ?? statusBadge.needed;
                return (
                  <motion.li
                    key={i.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 200, transition: { duration: 0.25 } }}
                    className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-white truncate">{i.name}</span>
                        <span className={`text-[10px] uppercase tracking-wider border rounded-full px-2 py-0.5 ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {i.quantity ?? ""} {i.unit ?? ""}
                        {i.estimated_cost != null && ` · ₹${Number(i.estimated_cost).toLocaleString("en-IN")}`}
                      </p>
                    </div>
                    <Button
                      onClick={() => openBuy(i)}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                      size="sm"
                    >
                      <Check size={14} className="mr-1" /> Bought
                    </Button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <Dialog open={!!buyItem} onOpenChange={(o) => !o && setBuyItem(null)}>
        <DialogContent className="glass">
          <DialogHeader>
            <DialogTitle>Mark as bought</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              How much did you pay for <span className="text-white font-medium">{buyItem?.name}</span>?
            </p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                className="pl-8 text-lg"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuyItem(null)}>Cancel</Button>
            <Button onClick={confirmBuy} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
