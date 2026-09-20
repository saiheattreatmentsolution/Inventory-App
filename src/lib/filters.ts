import { Item, Movement, MovementType, StockStatus, statusOf } from "./types";

// ---------------------------------------------------------------------------
// One derived-state function for items, used by BOTH the Inventory table and
// the Update-stock item picker, so filtering behaviour can never drift apart.
// ---------------------------------------------------------------------------

export type ItemSort = "name" | "qty_desc" | "qty_asc" | "updated" | "status";

export type ItemFilters = {
  query: string;
  categories: string[];
  /** "archived" is a view of its own — archived products are hidden otherwise. */
  status: StockStatus | "all" | "archived";
  sort: ItemSort;
};

export const EMPTY_ITEM_FILTERS: ItemFilters = {
  query: "",
  categories: [],
  status: "all",
  sort: "name",
};

const STATUS_RANK: Record<StockStatus, number> = {
  out_of_stock: 0,
  none: 0.5,
  reorder: 1,
  low: 2,
  in_stock: 3,
};

/** Matches ID, name and category at once, so "hose", "SAI-HOS" and "1/2" all work. */
function matchesQuery(item: Item, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${item.id} ${item.name} ${item.category}`.toLowerCase();
  // every whitespace-separated term must appear somewhere
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

export function filterItems(items: Item[], f: ItemFilters): Item[] {
  const out = items.filter((item) => {
    // Archived products stay out of every view except the one that asks for
    // them, so a retired product never pads a count or a reorder queue.
    const archived = item.archived_at !== null;
    if (f.status === "archived") {
      if (!archived) return false;
    } else if (archived) {
      return false;
    }
    if (!matchesQuery(item, f.query)) return false;
    if (f.categories.length > 0 && !f.categories.includes(item.category)) return false;
    if (f.status !== "all" && f.status !== "archived" && statusOf(item) !== f.status) return false;
    return true;
  });

  const byName = (a: Item, b: Item) => a.name.localeCompare(b.name);

  switch (f.sort) {
    case "qty_desc":
      return out.sort((a, b) => b.quantity - a.quantity || byName(a, b));
    case "qty_asc":
      return out.sort((a, b) => a.quantity - b.quantity || byName(a, b));
    case "updated":
      return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    case "status":
      return out.sort(
        (a, b) => STATUS_RANK[statusOf(a)] - STATUS_RANK[statusOf(b)] || byName(a, b),
      );
    default:
      return out.sort(byName);
  }
}

// ---------------------------------------------------------------------------
// Movement (history) filtering
// ---------------------------------------------------------------------------

export type DateRange = "all" | "today" | "week" | "month" | "custom";

export type MovementFilters = {
  query: string;
  type: MovementType | "all";
  range: DateRange;
  from: string; // yyyy-mm-dd, used when range === "custom"
  to: string;
  reason: string;
  category: string;
  job: string; // job id, or "all"
};

export const EMPTY_MOVEMENT_FILTERS: MovementFilters = {
  query: "",
  type: "all",
  range: "all",
  from: "",
  to: "",
  reason: "all",
  category: "all",
  job: "all",
};

function rangeStart(range: DateRange): Date | null {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range) {
    case "today":
      return midnight;
    case "week": {
      const d = new Date(midnight);
      d.setDate(d.getDate() - d.getDay()); // week starts Sunday
      return d;
    }
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    default:
      return null;
  }
}

export function filterMovements(movements: Movement[], f: MovementFilters): Movement[] {
  const q = f.query.trim().toLowerCase();
  const start = f.range === "custom" ? (f.from ? new Date(f.from) : null) : rangeStart(f.range);
  const end = f.range === "custom" && f.to ? new Date(`${f.to}T23:59:59`) : null;

  return movements
    .filter((m) => {
      if (q && !`${m.item_id} ${m.item_name} ${m.category} ${m.note ?? ""} ${m.supplier_invoice ?? ""}`.toLowerCase().includes(q))
        return false;
      if (f.type !== "all" && m.type !== f.type) return false;
      if (f.category !== "all" && m.category !== f.category) return false;
      if (f.reason !== "all" && (m.reason ?? "") !== f.reason) return false;
      if (f.job !== "all" && m.job_id !== f.job) return false;
      const at = new Date(m.created_at);
      if (start && at < start) return false;
      if (end && at > end) return false;
      return true;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
