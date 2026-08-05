import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface EmiRow {
  id: string;
  title: string;
  monthly_payment: number;
  total_months: number;
  start_date: string;
  due_day: number;
}

/** Months already paid (capped at total) for a given EMI, as of `now`. */
export function emiMonthsPaid(e: EmiRow, now = new Date()): number {
  const s = new Date(e.start_date);
  const months =
    (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth()) + (now.getDate() >= e.due_day ? 1 : 0);
  return Math.max(0, Math.min(e.total_months, months));
}

export function emiIsActive(e: EmiRow, now = new Date()): boolean {
  return emiMonthsPaid(e, now) < e.total_months;
}

interface Summary {
  amount: number;
  spent: number;
  purchases: number;
  emi: number;
  remaining: number;
  pct: number;
  history: { cost: number; purchased_at: string; category_id: string | null }[];
  emis: EmiRow[];
  loading: boolean;
}

/**
 * Single source of truth for the family's monthly budget + spend.
 * - `amount` comes from the `budgets` row for (family, month, year).
 * - `purchases` sums `purchase_history.cost` for that month (bought items,
 *   bills, fuel and transport all land there).
 * - `emi` sums the monthly payment of every still-active EMI.
 * - `spent` = purchases + emi.
 * Subscribes to realtime changes so every consumer stays in sync.
 */
export function useBudgetSummary(
  familyId: string | null,
  month: number,
  year: number,
): Summary {
  const [amount, setAmount] = useState(0);
  const [history, setHistory] = useState<Summary["history"]>([]);
  const [emis, setEmis] = useState<EmiRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!familyId) {
      setAmount(0);
      setHistory([]);
      setEmis([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    const monthStart = new Date(year, month - 1, 1).toISOString();
    const monthEnd = new Date(year, month, 1).toISOString();

    const load = async () => {
      const [{ data: b }, { data: h }, { data: e }] = await Promise.all([
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
        supabase
          .from("emis")
          .select("id,title,monthly_payment,total_months,start_date,due_day")
          .eq("family_id", familyId),
      ]);
      if (cancelled) return;
      setAmount(Number((b as { amount?: number } | null)?.amount ?? 0));
      setHistory((h as Summary["history"] | null) ?? []);
      setEmis(((e as EmiRow[] | null) ?? []).map((r) => ({ ...r, monthly_payment: Number(r.monthly_payment) })));
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "emis", filter: `family_id=eq.${familyId}` },
        load,
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [familyId, month, year]);

  const purchases = history.reduce((s, r) => s + Number(r.cost || 0), 0);
  const emi = emis.filter((e) => emiIsActive(e)).reduce((s, e) => s + Number(e.monthly_payment || 0), 0);
  const spent = purchases + emi;
  const remaining = Math.max(0, amount - spent);
  const pct = amount > 0 ? Math.min(100, (spent / amount) * 100) : 0;

  return { amount, spent, purchases, emi, remaining, pct, history, emis, loading };
}
