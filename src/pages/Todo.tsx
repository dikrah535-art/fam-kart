import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, CheckCircle2, Circle, ArrowLeft, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageTransition from "@/components/PageTransition";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

interface Task {
  id: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
  assignee: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
}

type Filter = "all" | "mine" | "completed";

export default function Todo() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const fid = profile?.family_id ?? null;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [newTitle, setNewTitle] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!fid) return;
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from("notebook_tasks")
        .select("*")
        .eq("family_id", fid)
        .order("created_at", { ascending: false });
      if (error) { toast.error(error.message); return; }
      if (!cancelled) setTasks((data as Task[]) ?? []);
    };
    load();
    const ch = supabase
      .channel(`todo-${fid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notebook_tasks", filter: `family_id=eq.${fid}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [fid]);

  const filtered = useMemo(() => {
    if (filter === "mine") return tasks.filter((t) => (t.assignee ?? t.created_by) === user?.id);
    if (filter === "completed") return tasks.filter((t) => t.completed);
    return tasks;
  }, [tasks, filter, user?.id]);

  const addTask = async () => {
    if (!fid || !user || !newTitle.trim()) return;
    const payload: Record<string, unknown> = {
      family_id: fid,
      title: newTitle.trim(),
      created_by: user.id,
    };
    if (dueDate) payload.due_date = dueDate;
    const { error } = await supabase.from("notebook_tasks").insert(payload);
    if (error) { toast.error(error.message); return; }
    setNewTitle(""); setDueDate("");
  };

  const toggle = async (t: Task) => {
    const next = !t.completed;
    setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, completed: next, completed_at: next ? new Date().toISOString() : null } : x));
    const { error } = await supabase.from("notebook_tasks").update({
      completed: next,
      completed_at: next ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", t.id);
    if (error) toast.error(error.message);
  };

  const del = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from("notebook_tasks").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  const counts = {
    all: tasks.length,
    mine: tasks.filter((t) => (t.assignee ?? t.created_by) === user?.id).length,
    completed: tasks.filter((t) => t.completed).length,
  };

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition hover:-translate-x-1"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <header>
          <h1 className="text-3xl font-bold text-white">To-Do</h1>
          <p className="text-sm text-muted-foreground">Family tasks, synced across every device.</p>
        </header>

        {/* Add */}
        <div className="rounded-xl border border-border bg-card p-3 flex flex-col md:flex-row gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Add a task…"
            className="flex-1 bg-muted rounded-md px-3 py-2 text-sm outline-none border border-transparent focus:border-primary"
          />
          <div className="flex gap-2">
            <div className="relative">
              <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="bg-muted rounded-md pl-8 pr-3 py-2 text-sm outline-none border border-transparent focus:border-primary"
              />
            </div>
            <button
              type="button"
              onClick={addTask}
              disabled={!newTitle.trim()}
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40 hover:brightness-110 transition"
            >
              <Plus size={14}/> Add
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-1 border-b border-border">
          {(["all", "mine", "completed"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`relative px-4 py-2 text-sm capitalize transition ${
                filter === f ? "text-primary" : "text-muted-foreground hover:text-white"
              }`}
            >
              {f === "mine" ? "Assigned to me" : f === "all" ? "All tasks" : "Completed"}
              <span className="ml-1.5 text-xs opacity-60">({counts[f]})</span>
              {filter === f && (
                <motion.span layoutId="todo-underline" className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          <AnimatePresence initial={false}>
            {filtered.map((t) => (
              <TaskItem key={t.id} task={t} onToggle={() => toggle(t)} onDelete={() => del(t.id)} />
            ))}
          </AnimatePresence>
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">Nothing here yet.</p>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

function TaskItem({ task, onToggle, onDelete }: { task: Task; onToggle: () => void; onDelete: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className="flex items-center gap-3 px-4 py-3 group hover:bg-muted/40 transition"
    >
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0"
        style={{ color: task.completed ? "#34d399" : undefined }}
      >
        {task.completed ? <CheckCircle2 size={20}/> : <Circle size={20} className="opacity-60"/>}
      </button>

      <div className="relative flex-1 min-w-0">
        <div className={`text-sm text-white transition-opacity ${task.completed ? "opacity-60" : ""}`}>
          {task.title || <span className="italic opacity-50">Untitled</span>}
        </div>
        {task.due_date && (
          <div className="text-xs text-muted-foreground mt-0.5">Due {task.due_date}</div>
        )}
        <svg className="pointer-events-none absolute left-0 right-0" style={{ top: "50%" }} height="2" width="100%" preserveAspectRatio="none">
          <motion.line
            x1="0" y1="1" x2="100%" y2="1"
            stroke="#34d399" strokeWidth="2" strokeLinecap="round"
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
        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive transition"
        title="Delete"
      >
        <Trash2 size={16}/>
      </button>
    </motion.div>
  );
}
