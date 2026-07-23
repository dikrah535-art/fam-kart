import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, ShoppingBag, CheckSquare, StickyNote } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { localDateISO } from "@/lib/dates";

const UNITS = ["kg", "g", "pcs", "L", "mL", "pack"] as const;

export default function QuickAddFab() {
  const { profile, user } = useAuth();
  const fid = profile?.family_id ?? null;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("item");

  // Item
  const [itemName, setItemName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [priority, setPriority] = useState("normal");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  // Task
  const [taskTitle, setTaskTitle] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Note
  const [noteText, setNoteText] = useState("");

  const load = async () => {
    if (!fid) return;
    const { data } = await supabase.from("categories").select("id,name").eq("family_id", fid).order("name");
    setCategories((data as { id: string; name: string }[]) ?? []);
  };

  const openDialog = () => {
    load();
    setOpen(true);
  };

  const reset = () => {
    setItemName(""); setQty(""); setUnit(""); setPrice(""); setPriority("normal"); setCategoryId("");
    setTaskTitle(""); setDueDate(""); setNoteText("");
  };

  const submitItem = async () => {
    if (!fid || !user || !itemName.trim()) return;
    const { error } = await supabase.from("items").insert({
      family_id: fid,
      category_id: categoryId || null,
      name: itemName.trim(),
      quantity: qty ? Number(qty) : null,
      unit: unit || null,
      estimated_cost: price ? Number(price) : null,
      priority,
      status: priority === "urgent" ? "urgent" : "needed",
      created_by: user.id,
    });
    if (error) return toast.error(error.message);
    toast.success(`Added ${itemName}`);
    reset(); setOpen(false);
  };

  const submitTask = async () => {
    if (!fid || !user || !taskTitle.trim()) return;
    const payload: Record<string, unknown> = {
      family_id: fid,
      title: taskTitle.trim(),
      created_by: user.id,
    };
    if (dueDate) payload.due_date = dueDate;
    const { error } = await supabase.from("notebook_tasks").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Task added");
    reset(); setOpen(false);
  };

  const submitNote = async () => {
    if (!fid || !user || !noteText.trim()) return;
    // Append to today's notes at next slot
    const today = localDateISO();
    const { data: existing } = await supabase
      .from("notebook_notes")
      .select("slot_index")
      .eq("family_id", fid)
      .eq("entry_date", today);
    const nextSlot = ((existing as { slot_index: number }[] | null) ?? []).reduce(
      (m, r) => Math.max(m, r.slot_index + 1),
      0,
    );
    const { error } = await supabase.from("notebook_notes").upsert(
      {
        family_id: fid,
        entry_date: today,
        slot_index: nextSlot,
        content: noteText.trim(),
        updated_by: user.id,
      },
      { onConflict: "family_id,entry_date,slot_index" },
    );
    if (error) return toast.error(error.message);
    toast.success("Note added");
    reset(); setOpen(false);
  };

  return (
    <>
      <motion.button
        type="button"
        onClick={openDialog}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-24 lg:bottom-8 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center border border-primary/50"
        style={{ boxShadow: "0 8px 30px hsl(var(--primary) / 0.45), 0 0 0 4px hsl(var(--primary) / 0.12)" }}
        aria-label="Quick add"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={open ? "open" : "closed"}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <Plus size={26} strokeWidth={2.5} />
          </motion.div>
        </AnimatePresence>
      </motion.button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quick add</DialogTitle>
          </DialogHeader>
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="item" className="gap-1.5"><ShoppingBag size={14}/> Item</TabsTrigger>
              <TabsTrigger value="task" className="gap-1.5"><CheckSquare size={14}/> Task</TabsTrigger>
              <TabsTrigger value="note" className="gap-1.5"><StickyNote size={14}/> Note</TabsTrigger>
            </TabsList>

            <TabsContent value="item" className="space-y-3 pt-3">
              <input
                autoFocus
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="Item name"
                className="w-full bg-muted rounded-md px-3 py-2 text-sm outline-none border border-transparent focus:border-primary"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="Qty"
                  type="number"
                  className="bg-muted rounded-md px-3 py-2 text-sm outline-none border border-transparent focus:border-primary"
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="bg-muted rounded-md px-3 py-2 text-sm outline-none border border-transparent focus:border-primary"
                >
                  <option value="">Unit</option>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="₹ Price"
                  type="number"
                  className="bg-muted rounded-md px-3 py-2 text-sm outline-none border border-transparent focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="bg-muted rounded-md px-3 py-2 text-sm outline-none border border-transparent focus:border-primary"
                >
                  <option value="">Category (optional)</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="bg-muted rounded-md px-3 py-2 text-sm outline-none border border-transparent focus:border-primary"
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <button
                type="button"
                onClick={submitItem}
                disabled={!itemName.trim()}
                className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium disabled:opacity-40 hover:brightness-110 transition"
              >
                Add item
              </button>
            </TabsContent>

            <TabsContent value="task" className="space-y-3 pt-3">
              <input
                autoFocus
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="What needs to be done?"
                className="w-full bg-muted rounded-md px-3 py-2 text-sm outline-none border border-transparent focus:border-primary"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Assign to</label>
                  <input
                    disabled
                    value={profile?.full_name ?? "Me"}
                    className="mt-1 w-full bg-muted rounded-md px-3 py-2 text-sm outline-none opacity-60"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Due date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-1 w-full bg-muted rounded-md px-3 py-2 text-sm outline-none border border-transparent focus:border-primary"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={submitTask}
                disabled={!taskTitle.trim()}
                className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium disabled:opacity-40 hover:brightness-110 transition"
              >
                Add task
              </button>
            </TabsContent>

            <TabsContent value="note" className="space-y-3 pt-3">
              <textarea
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Jot down a quick note for the family…"
                rows={4}
                className="w-full bg-muted rounded-md px-3 py-2 text-sm outline-none border border-transparent focus:border-primary resize-none"
              />
              <button
                type="button"
                onClick={submitNote}
                disabled={!noteText.trim()}
                className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium disabled:opacity-40 hover:brightness-110 transition"
              >
                Add note
              </button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
