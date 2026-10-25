import { supabase } from "./supabase";

export async function getMedicineByName(name) {
  const { data, error } = await supabase
    .from("medicines")
    .select(
      "name, drug_class, medicine_sections(id, section, body, review_status, sources(name))",
    )
    .eq("name", name)
    .single();

  if (error) throw error;
  return data;
}
export async function searchMedicines(q) {
  const { data, error } = await supabase.rpc("search_medicines", { q });

  if (error) throw error;
  return data;
}
