import type { MovementType, Tracking, UnitStatus } from "./types";

// Categories live in the database (public.categories), not here, so admins can
// add new ones from the app. Load them from useStore().categories.

// Deliberately short. `tracking` is derived from this: "pcs" means every unit
// gets its own ID, anything else is measured out by amount. A longer list only
// creates ways to make a countable product non-countable by accident.
export const UNITS = ["pcs", "m", "kg"];

// Damage / loss: which units each outcome can apply to, and where they end up.
// apply_movement enforces the same table.
export const CONDITION_RULES: Record<string, { from: UnitStatus[]; to: UnitStatus }> = {
  Damaged: { from: ["in_store"], to: "damaged" },
  Missing: { from: ["in_store", "at_job"], to: "missing" },
  Scrapped: { from: ["in_store", "at_job", "damaged", "missing"], to: "scrapped" },
  Repaired: { from: ["damaged"], to: "in_store" },
  Found: { from: ["missing"], to: "in_store" },
};

// Structured replacements for the free-text "Reason" column in the workbook.
// "Opening Stock" is written automatically by create_item, so it is not offered.
export const REASONS: Record<MovementType, string[]> = {
  in: ["Purchase Restock", "Built in-house", "Return from Job"],
  out: ["Issued to Job"],
  adjust: ["Inventory Count Audit", "Correction"],
  condition: Object.keys(CONDITION_RULES),
};

/**
 * The reasons that make sense for this kind of product. Nothing is ever sold —
 * stock goes out to a job and comes back. Equipment is bought or built
 * in-house; cable and coil are only ever bought, and have no pieces to repair
 * or find.
 */
export function reasonsFor(type: MovementType, tracking: Tracking): string[] {
  if (tracking === "serialized") return REASONS[type];
  if (type === "in") return ["Purchase Restock", "Return from Job"];
  if (type === "condition") return REASONS.condition.filter((r) => CONDITION_RULES[r].to !== "in_store");
  return REASONS[type];
}
