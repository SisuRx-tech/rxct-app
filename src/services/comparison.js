import { supabase } from "./supabase";
import { executeRequest } from "./diagnostics/executeRequest";

export async function compareMedicines(medicineIds) {
  const ids = [
    ...new Set(
      (medicineIds || [])
        .map(Number)
        .filter(Number.isFinite)
    ),
  ];

  if (ids.length < 2) {
    throw new Error("Select at least two medicines.");
  }

  if (ids.length > 4) {
    throw new Error("Compare up to four medicines at a time.");
  }

  return executeRequest(
    "compareMedicines",
    async () => {
      const { data, error } = await supabase.rpc(
        "compare_medicines_with_patterns",
        {
          p_medicine_ids: ids,
        }
      );

      if (error) throw error;

      return data;
    },
    { query: ids.join(",") }
  );
}
