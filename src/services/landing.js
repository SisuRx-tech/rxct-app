import { supabase } from "./supabase";
import { executeRequest } from "./diagnostics/executeRequest";

/* ========================================
   LANDING PAGE DATA
   Classes (with how many medicines each
   holds and which group they belong to)
   and the therapeutic groups.
======================================== */

const FEATURED_LIMIT = 5;

const normalise = (value = "") => String(value).trim().toLowerCase();

export async function getLandingData() {
  return executeRequest("getLandingData", async () => {
    const [classResult, groupResult] = await Promise.all([
      supabase
        .from("drug_classes")
        .select("id, name, slug, medicines(name)")
        .order("name"),

      supabase
        .from("drug_class_groups")
        .select(
          "id, name, sort_order, drug_class_group_members(drug_class)",
        )
        .order("sort_order"),
    ]);

    if (classResult.error) throw classResult.error;
    if (groupResult.error) throw groupResult.error;

    // class name -> the first group that contains it
    const groupOfClass = new Map();

    for (const group of groupResult.data) {
      for (const member of group.drug_class_group_members || []) {
        const key = normalise(member.drug_class);

        if (!groupOfClass.has(key)) {
          groupOfClass.set(key, group.name);
        }
      }
    }

    const classes = classResult.data
      .map((row) => {
        const names = (row.medicines || [])
          .map((medicine) => medicine.name)
          .sort((a, b) => a.localeCompare(b));

        return {
          id: row.id,
          name: row.name,
          medicineCount: names.length,
          members: names.slice(0, 3),
          groupName: groupOfClass.get(normalise(row.name)) || "",
        };
      })
      .filter((item) => item.medicineCount > 0);

    return { classes };
  });
}

/* ========================================
   WHICH CLASSES TO FEATURE
   Restrained on purpose: classes the
   student explored recently come first,
   then the classes with the most medicines
   in the catalogue. Never more than five.
======================================== */

export function pickFeaturedClasses(classes, recentActivity = []) {
  const recentNames = recentActivity
    .filter((item) => item.type === "class")
    .map((item) => normalise(item.name));

  const recentRank = (item) => {
    const index = recentNames.indexOf(normalise(item.name));

    return index === -1 ? Infinity : index;
  };

  return [...classes]
    .sort((a, b) => {
      const byRecent = recentRank(a) - recentRank(b);

      // Infinity - Infinity is NaN, so compare explicitly
      if (recentRank(a) !== recentRank(b)) return byRecent < 0 ? -1 : 1;

      if (b.medicineCount !== a.medicineCount) {
        return b.medicineCount - a.medicineCount;
      }

      return a.name.localeCompare(b.name);
    })
    .slice(0, FEATURED_LIMIT);
}
