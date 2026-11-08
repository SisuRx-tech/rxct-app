import { supabase } from "./supabase";
import { executeRequest } from "./diagnostics/executeRequest";

export async function getMedicineByName(name) {
  return executeRequest(
    "getMedicineByName",
    async () => {
      const { data, error } = await supabase
        .from("medicines")
        .select(
          "name, drug_class, medicine_sections(id, section, body, review_status, sources(name))",
        )
        .eq("name", name)
        .single();

      if (error) throw error;
      return data;
    },
    { query: name },
  );
}

export async function searchMedicines(q) {
  return executeRequest(
    "searchMedicines",
    async () => {
      const { data, error } = await supabase.rpc("search_medicines", { q });

      if (error) throw error;
      return data;
    },
    { query: q },
  );
}

export async function getDrugClasses() {
  return executeRequest("getDrugClasses", async () => {
    const { data, error } = await supabase
      .from("medicines")
      .select("drug_class")
      .not("drug_class", "is", null)
      .order("drug_class");

    if (error) throw error;

    return [...new Set(data.map((item) => item.drug_class))];
  });
}
export async function getTherapeuticGroups() {
  return executeRequest("getTherapeuticGroups", async () => {
    const { data, error } = await supabase
      .from("drug_class_groups")
      .select("id, name, sort_order, drug_class_group_members(drug_class)")
      .order("sort_order");

    if (error) throw error;

    return data;
  });
}
export async function getMedicinesByClass(drugClass) {
  return executeRequest(
    "getMedicinesByClass",
    async () => {
      const { data, error } = await supabase
        .from("medicines")
        .select("id, name, drug_class")
        .eq("drug_class", drugClass)
        .order("name");

      if (error) throw error;
      return data;
    },
    { query: drugClass },
  );
}

export async function getClassStudy(drugClass) {
  return executeRequest(
    "getClassStudy",
    async () => {
      const { data, error } = await supabase
        .from("medicines")
        .select("id, name, drug_class, medicine_sections(id, section, body, review_status, sources(name))")
        .eq("drug_class", drugClass)
        .order("name");

      if (error) throw error;
      return data;
    },
    { query: drugClass },
  );
}

export async function searchDrugClasses(q) {
  return executeRequest(
    "searchDrugClasses",
    async () => {
      const { data, error } = await supabase.rpc("search_drug_classes", {
        q,
      });

      if (error) throw error;
      return data;
    },
    { query: q },
  );
}

export async function searchSuggestions(q) {
  return executeRequest(
    "searchSuggestions",
    async () => {
      const { data, error } = await supabase.rpc("search_suggestions", {
        q,
      });

      if (error) throw error;
      return data;
    },
    { query: q },
  );
}

/* ------------------------------------------------------------------
   Smart search
   ------------------------------------------------------------------
   One entry point for the whole search bar. The UI calls smartSearch()
   and renders whatever comes back. It never needs to know which
   Supabase function produced a result.

   Pipeline:
     query -> parse_search_query (subject + intent)
           -> search_medicines / search_drug_classes / search_interactions
           -> one normalised result object
------------------------------------------------------------------ */

// RxCT deliberately has no dosing content. Dosing errors can be fatal.
export const DOSAGE_NOTICE =
  "RxCT does not include dosing. Dosing errors can cause serious harm, " +
  "so check the BNF, the product label, or a pharmacist for doses.";

// A medicine counts as a confident match at or above this score.
// Below it, the UI should show "Did you mean" instead of jumping in.
const CONFIDENT_SCORE = 0.75;

// Which of the 5 medicine sections a search intent should open first.
// There is no dosing section, so "dosage" falls back to the overview.
export const INTENT_TO_SECTION = {
  overview: "overview",
  indications: "indications",
  adverse_effects: "adverse_effects",
  contraindications: "contraindications",
  interactions: "interactions",
  dosage: "overview",
};

export async function parseSearchQuery(q) {
  return executeRequest(
    "parseSearchQuery",
    async () => {
      const { data, error } = await supabase.rpc("parse_search_query", { q });

      if (error) throw error;
      return data?.[0] ?? null;
    },
    { query: q },
  );
}

export async function searchInteractions(q) {
  return executeRequest(
    "searchInteractions",
    async () => {
      const { data, error } = await supabase.rpc("search_interactions", { q });

      if (error) throw error;
      return data;
    },
    { query: q },
  );
}

// search_drug_classes returns one flat row per (class, medicine).
// This folds those rows into { type, title, slug, classes: [...] }.
export function groupClassRows(rows) {
  if (!rows || rows.length === 0) return null;

  const first = rows[0];
  const isGroup = first.result_type === "group";
  const byClass = new Map();

  for (const row of rows) {
    if (!byClass.has(row.drug_class)) {
      byClass.set(row.drug_class, []);
    }

    byClass.get(row.drug_class).push({
      id: row.medicine_id,
      name: row.medicine_name,
    });
  }

  return {
    type: isGroup ? "group" : "classes",
    title: isGroup ? first.group_name : null,
    slug: isGroup ? first.group_slug : null,
    classes: [...byClass].map(([drugClass, medicines]) => ({
      drugClass,
      medicines,
    })),
    medicineCount: rows.length,
  };
}

/*
  smartSearch(query) always resolves to this shape:

  {
    kind:         "medicines" | "classes" | "none",
    query:        what the user typed,
    subject:      the query with intent words stripped ("warfarin"),
    intent:       "overview" | "indications" | "adverse_effects" |
                  "contraindications" | "interactions" | "dosage",
    openSection:  which medicine section to open first,
    notice:       a message to show above results, or null,
    didYouMean:   true when the medicine matches are weak,
    medicines:    [{ id, name, drug_class, matched_term, score }],
    classResult:  output of groupClassRows(), or null,
    interactions: [{ medicine_id, medicine_name, drug_class, snippet }],
  }
*/
export async function smartSearch(rawQuery) {
  const query = (rawQuery ?? "").trim();

  const empty = {
    kind: "none",
    query,
    subject: "",
    intent: "overview",
    openSection: "overview",
    notice: null,
    didYouMean: false,
    medicines: [],
    classResult: null,
    interactions: [],
  };

  if (!query) return empty;

  const parsed = await parseSearchQuery(query);

  const subject = parsed?.subject ?? query;
  const intent = parsed?.intent ?? "overview";
  const wantsClass = parsed?.wants_class ?? false;

  const base = {
    ...empty,
    subject,
    intent,
    openSection: INTENT_TO_SECTION[intent] ?? "overview",
    notice: intent === "dosage" ? DOSAGE_NOTICE : null,
  };

  // Everything was an intent word ("dosage" on its own): nothing to search.
  if (!subject) return base;

  const [medicines, classRows, interactions] = await Promise.all([
    searchMedicines(query),
    searchDrugClasses(query),
    intent === "interactions" ? searchInteractions(query) : Promise.resolve([]),
  ]);

  const classResult = groupClassRows(classRows);
  const topScore = medicines[0]?.score ?? 0;
  const hasConfidentMedicine = topScore >= CONFIDENT_SCORE;

  let kind = "none";

  if (wantsClass && classResult) {
    kind = "classes";
  } else if (hasConfidentMedicine) {
    kind = "medicines";
  } else if (classResult) {
    kind = "classes";
  } else if (medicines.length > 0) {
    kind = "medicines";
  }

  return {
    ...base,
    kind,
    didYouMean: kind === "medicines" && !hasConfidentMedicine,
    medicines,
    classResult,
    interactions,
  };
}
