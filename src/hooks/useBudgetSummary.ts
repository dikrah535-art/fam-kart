import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Summary {
  amount: number;
  spent: number;
  remaining: number;
  pct: number;
  history: { cost: number; purchased_at: string; category_id: string | null }[];
  loading: boolean;
}

/**
 * Single source of truth for the family's monthly budget + spend.
 * - `amount` comes from the `budgets` row for (family, month, year).
 * - `spent` is computed by summing `purchase_history.cost` for that month
 *   (we never read `budgets.spent` — it can drift).
 * Subscribes to realtime changes on both tables so every consumer stays in sync.
 */
export function useBudgetSummary(
  familyId: string | null,
  month: number,
  year: number,
): Summary {
  const [amount, setAmount] = useState(0);
  const [history, setHistory] = useState<Summary["history"]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!familyId) {
      setAmount(0);
      setHistory([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    const monthStart = new Date(year, month - 1, 1).toISOString();
    const monthEnd = new Date(year, month, 1).toISOString();

    const load = async () => {
      const [{ data: b }, { data: h }] = await Promise.all([
        supabase
          .from("budgets")
          .select("amount")
          .eq("family_id", familyId)
          .eq("month", month)
          .eq("year", year)
          .maybeSingle(),
        supabase
          .from("purchase_history")
          .select("cost,purchased_at,category_id")
          .eq("family_id", familyId)
          .gte("purchased_at", monthStart)
          .lt("purchased_at", monthEnd),
      ]);
      if (cancelled) return;
      setAmount(Number((b as { amount?: number } | null)?.amount ?? 0));
      setHistory((h as Summary["history"] | null) ?? []);
      setLoading(false);
    };
    load();

    const ch = supabase
      .channel(`budget-sum-${familyId}-${year}-${month}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchase_history", filter: `family_id=eq.${familyId}` },
        load,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "budgets", filter: `family_id=eq.${familyId}` },
        load,
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [familyId, month, year]);

  const spent = history.reduce((s, r) => s + Number(r.cost || 0), 0);
  const remaining = Math.max(0, amount - spent);
  const pct = amount > 0 ? Math.min(100, (spent / amount) * 100) : 0;

  return { amount, spent, remaining, pct, history, loading };
}
