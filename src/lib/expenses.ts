import { supabase } from "@/lib/supabase";

/**
 * Every money-out event in the app funnels into `purchase_history`, which is
 * what `useBudgetSummary` reads. Bills, fuel and transport therefore deduct
 * from the monthly budget automatically (realtime), just like bought items.
 */
export async function logExpense(params: {
  familyId: string;
  name: string;
  cost: number;
  sourceType: "bill" | "fuel" | "transport";
  sourceId: string;
  userId?: string | null;
  at?: string;
}) {
  const { error } = await supabase.from("purchase_history").insert({
    family_id: params.familyId,
    item_name: params.name,
    cost: params.cost,
    source_type: params.sourceType,
    source_id: params.sourceId,
    purchased_by: params.userId ?? null,
    purchased_at: params.at ?? new Date().toISOString(),
  });
  return error;
}

export async function removeExpense(sourceType: string, sourceId: string) {
  const { error } = await supabase
    .from("purchase_history")
    .delete()
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);
  return error;
}

export const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
