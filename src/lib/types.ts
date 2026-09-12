export type Tracking = "serialized" | "bulk";

export type Item = {
  id: string;
  name: string;
  category: string;
  unit: string;
  /** serialized = every physical unit has its own ID; bulk = amount only. */
  tracking: Tracking;
  quantity: number;
  reorder_threshold: number;
  unit_cost: number | null;
  notes: string | null;
  /** Set when the product is archived. Archived products keep their history. */
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

/** condition = damaged, missing, scrapped, repaired or found. */
export type MovementType = "in" | "out" | "adjust" | "condition";

export type Movement = {
  id: string;
  item_id: string;
  item_name: string;
  category: string;
  type: MovementType;
  quantity: number; // signed change to the store balance
  reason: string | null;
  note: string | null;       // invoice number on a purchase, what happened on a damage / loss
  actor: string | null;      // display name/email, taken from the session
  actor_id: string | null;   // auth user id, so attribution survives a rename
  job_id: string | null;
  unit_ids: string[];        // which physical units this movement covered
  balance_after: number;
  created_at: string;
};

export type StockStatus = "in_stock" | "none" | "low" | "reorder" | "out_of_stock";

export const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: "In stock",
  none: "None in store",
  low: "Low stock",
  reorder: "Reorder needed",
  out_of_stock: "Out of stock",
};

/**
 * Status is computed from quantity vs threshold — never set by hand, which is
 * what the "Re-order Alert" column in the workbook needed a person to do.
 *
 * A product with no minimum set never raises an alert: you only own two of a
 * burner, and an empty shelf usually means both are out at jobs, not that
 * something needs buying. Set a minimum on the things you do restock — coil,
 * cable, spares — and those get the warnings.
 */
export function statusOf(item: Pick<Item, "quantity" | "reorder_threshold">): StockStatus {
  if (item.reorder_threshold <= 0) return item.quantity > 0 ? "in_stock" : "none";
  if (item.quantity <= 0) return "out_of_stock";
  if (item.quantity <= item.reorder_threshold) return "reorder";
  if (item.quantity <= item.reorder_threshold * 1.5) return "low";
  return "in_stock";
}

export type UnitStatus = "in_store" | "at_job" | "damaged" | "missing" | "scrapped";

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  in_store: "In store",
  at_job: "At job",
  damaged: "Damaged",
  missing: "Missing",
  scrapped: "Scrapped",
};

/** One physical thing — a specific burner, not "burners" in general. */
export type Unit = {
  id: string; // SAI-BRN-0001-01
  item_id: string;
  seq: number;
  unit_cost: number | null;
  manufacturer: string | null;
  /** Year of manufacture off the nameplate, when it is known. */
  manufacturing_year: number | null;
  status: UnitStatus;
  job_id: string | null;
  created_at: string;
  updated_at: string;
};

/** How much of a cable/coil product has gone to a job and not come back. */
export type JobStock = {
  job_id: string;
  item_id: string;
  quantity: number;
};

/** One product grouping. `code` is the fixed 3-letter item-ID prefix. */
export type Category = {
  name: string;
  code: string;
  created_at: string;
};

export type Job = {
  id: string;
  name: string;
  site: string | null;
  customer: string | null;
  status: "active" | "closed";
  notes: string | null;
  created_at: string;
};
