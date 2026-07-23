import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Trash2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageTransition from "@/components/PageTransition";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

interface HistoryRow {
  id: string;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  cost: number;
  purchased_at: string;
  purchased_by: string | null;
  category_id: string | null;
  item_id: string | null;
}
interface Category { id: string; name: string }

export default function History() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const fid = profile?.family_id ?? null;

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [toDelete, setToDelete] = useState<HistoryRow | null>(null);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (!fid) return;
    let cancelled = false;
    const load = async () => {
      const [{ data: h }, { data: c }] = await Promise.all([
        supabase.from("purchase_history").select("*").eq("family_id", fid).order("purchased_at", { ascending: false }),
        supabase.from("categories").select("id,name").eq("family_id", fid),
      ]);
      if (cancelled) return;
      setRows((h as HistoryRow[]) ?? []);
      setCats((c as Category[]) ?? []);
    };
    load();
    const ch = supabase
      .channel(`history-${fid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_history", filter: `family_id=eq.${fid}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [fid]);

  const catMap = useMemo(() => new Map(cats.map((c) => [c.id, c.name])), [cats]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (catFilter && r.category_id !== catFilter) return false;
      if (!query) return true;
      return r.item_name.toLowerCase().includes(query) ||
        (r.category_id && (catMap.get(r.category_id) ?? "").toLowerCase().includes(query));
    });
  }, [rows, q, catFilter, catMap]);

  const totalSpend = filtered.reduce((s, r) => s + Number(r.cost || 0), 0);

  const openDelete = (r: HistoryRow) => { setToDelete(r); setConfirmText(""); };

  const doDelete = async () => {
    if (!toDelete || confirmText !== toDelete.item_name) return;
    const { error } = await supabase.from("purchase_history").delete().eq("id", toDelete.id);
    if (error) return toast.error(error.message);
    // Recalc current-month budget spent
    const d = new Date(toDelete.purchased_at);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const { data: monthRows } = await supabase
      .from("purchase_history")
      .select("cost, purchased_at")
      .eq("family_id", fid!)
      .gte("purchased_at", new Date(year, month - 1, 1).toISOString())
      .lt("purchased_at", new Date(year, month, 1).toISOString());
    const spent = ((monthRows as { cost: number }[] | null) ?? []).reduce((s, r) => s + Number(r.cost || 0), 0);
    await supabase.from("budgets").update({ spent, updated_at: new Date().toISOString() })
      .eq("family_id", fid!).eq("month", month).eq("year", year);
    toast.success("Deleted");
    setToDelete(null);
  };

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-5">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition hover:-translate-x-1"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <header className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-bold text-white">Purchase history</h1>
            <p className="text-sm text-muted-foreground">Everything the family has bought.</p>
          </div>
          <div className="text-sm text-muted-foreground">
            <span className="text-primary font-semibold">₹{totalSpend.toLocaleString("en-IN")}</span>{" "}
            across {filtered.length} purchases
          </div>
        </header>

        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by item or category…"
              className="w-full bg-card border border-border rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="bg-card border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Item</th>
                <th className="text-left px-4 py-2.5 font-medium">Category</th>
                <th className="text-left px-4 py-2.5 font-medium">Qty</th>
                <th className="text-right px-4 py-2.5 font-medium">Price</th>
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filtered.map((r) => (
                  <motion.tr
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    className="border-t border-border group hover:bg-muted/30 transition"
                  >
                    <td className="px-4 py-2.5 text-white">{r.item_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.category_id ? catMap.get(r.category_id) ?? "—" : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.quantity ?? ""} {r.unit ?? ""}
                    </td>
                    <td className="px-4 py-2.5 text-right text-white">
                      ₹{Number(r.cost).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {new Date(r.purchased_at).toLocaleDateString()}
                    </td>
                    <td className="px-2 text-right">
                      <button
                        type="button"
                        onClick={() => openDelete(r)}
                        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive transition"
                        title="Delete"
                      >
                        <Trash2 size={14}/>
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">No purchases match.</p>
          )}
        </div>

        <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this purchase?</DialogTitle>
              <DialogDescription>
                This permanently removes <span className="text-white font-medium">"{toDelete?.item_name}"</span> and recalculates your monthly budget.
                Type the item name to confirm.
              </DialogDescription>
            </DialogHeader>
            <input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={toDelete?.item_name ?? ""}
              className="w-full bg-muted rounded-md px-3 py-2 text-sm outline-none border border-transparent focus:border-destructive"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" onClick={() => setToDelete(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-white transition">
                Cancel
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={confirmText !== toDelete?.item_name}
                className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground disabled:opacity-40 hover:brightness-110 transition"
              >
                Confirm delete
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
