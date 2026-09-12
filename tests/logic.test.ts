// Covers the shared derived-state logic that both the Inventory table and the
// Update-stock picker depend on. Run with:  npm test

import { filterItems, filterMovements, EMPTY_ITEM_FILTERS, EMPTY_MOVEMENT_FILTERS } from "../src/lib/filters";
import { statusOf } from "../src/lib/types";
import { toCsv, signed, qty } from "../src/lib/format";
import type { Item, Movement, Unit } from "../src/lib/types";
import { valueOf, totalValue } from "../src/lib/valuation";
import { reasonsFor, CONDITION_RULES } from "../src/lib/categories";

const mk = (id: string, name: string, category: string, quantity: number, threshold: number): Item => ({
  id, name, category, unit: "pcs", tracking: "serialized", quantity, reorder_threshold: threshold,
  unit_cost: 100, notes: null, archived_at: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
});

const items: Item[] = [
  mk("SAI-HOS-0001", 'Hose 1/2 inch x 10M', "Hoses", 0, 6),
  mk("SAI-HOS-0002", 'Hose 1/2 inch x 5M', "Hoses", 9, 10),
  mk("SAI-HOS-0003", 'Hose 2 inch x 10M', "Hoses", 12, 5),
  mk("SAI-BRN-0001", "Oil Burner 8 MBTU", "Burners", 2, 3),
  mk("SAI-CBL-0001", "Welding Cable 35 sq mm", "Cables", 60, 100),
];

let fails = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};

// status is computed from qty vs threshold
eq("status out_of_stock", statusOf(items[0]), "out_of_stock");
eq("status reorder (9 <= 10)", statusOf(items[1]), "reorder");
eq("status in_stock (12 > 7.5)", statusOf(items[2]), "in_stock");
eq("status low (boundary 4 <= 3*1.5)", statusOf(mk("x","x","x",4,3)), "low");
// No minimum set = capital equipment, not something you restock. An empty
// shelf there usually means it is all out at jobs, so it raises no alert.
eq("no minimum, nothing in store, is not an alert", statusOf(mk("x","x","x",0,0)), "none");
eq("no minimum, some in store, is in stock", statusOf(mk("x","x","x",2,0)), "in_stock");

// search matches id, name AND category
const ids = (f: Partial<typeof EMPTY_ITEM_FILTERS>) =>
  filterItems(items, { ...EMPTY_ITEM_FILTERS, ...f }).map((i) => i.id);
eq("search by category word", ids({ query: "hose" }).length, 3);
eq("search by ID prefix", ids({ query: "SAI-HOS" }).length, 3);
eq("search by size fragment", ids({ query: "1/2" }).length, 2);
eq("single term 'burner'", ids({ query: "burner" }), ["SAI-BRN-0001"]);
eq("single term 'cable'", ids({ query: "cable" }), ["SAI-CBL-0001"]);
// decisive: OR would return both, AND returns neither
eq("multi-term search is AND not OR", ids({ query: "burner cable" }), []);
eq("multi-term AND narrows", ids({ query: "hose 5m" }), ["SAI-HOS-0002"]);
eq("search is case-insensitive", ids({ query: "OIL BURNER" }), ["SAI-BRN-0001"]);

// filters combine (AND)
eq("category multi-select", ids({ categories: ["Hoses", "Cables"] }).length, 4);
eq("status filter", ids({ status: "reorder" }).sort(), ["SAI-BRN-0001", "SAI-CBL-0001", "SAI-HOS-0002"]);
eq("category AND status", ids({ categories: ["Hoses"], status: "reorder" }), ["SAI-HOS-0002"]);
eq("no match returns empty", ids({ query: "nothing here" }), []);

// archived products stay out of every view except the archived one
const archivedItem: Item = { ...mk("SAI-MSC-0009", "Retired Trunk", "Storage & misc", 4, 1),
  archived_at: "2026-02-01T00:00:00Z" };
const withArchived = [...items, archivedItem];
eq("archived hidden from the default list",
   filterItems(withArchived, EMPTY_ITEM_FILTERS).map((i) => i.id).includes("SAI-MSC-0009"), false);
eq("archived hidden from a status filter",
   filterItems(withArchived, { ...EMPTY_ITEM_FILTERS, status: "in_stock" }).map((i) => i.id).includes("SAI-MSC-0009"), false);
eq("archived view shows only archived",
   filterItems(withArchived, { ...EMPTY_ITEM_FILTERS, status: "archived" }).map((i) => i.id), ["SAI-MSC-0009"]);

// sorting
eq("sort qty asc", ids({ sort: "qty_asc" })[0], "SAI-HOS-0001");
eq("sort qty desc", ids({ sort: "qty_desc" })[0], "SAI-CBL-0001");
eq("sort worst status first", ids({ sort: "status" })[0], "SAI-HOS-0001");

// filtering must not mutate the caller's array
const before = items.map((i) => i.id);
filterItems(items, { ...EMPTY_ITEM_FILTERS, sort: "qty_desc" });
eq("source array not reordered", items.map((i) => i.id), before);

// movements
const mv = (id: string, item: string, type: "in"|"out"|"adjust", q: number, when: string, reason: string): Movement => ({
  id, item_id: "SAI-HOS-0001", item_name: item, category: "Hoses", type, quantity: q,
  reason, note: "PO-1", actor: "Neeraj", actor_id: null, job_id: null, unit_ids: [],
  write_off_quantity: null, balance_after: 10, created_at: when,
});
const now = new Date();
const iso = (d: Date) => d.toISOString();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
const lastYear = new Date(now.getFullYear() - 1, 0, 15);
const movements: Movement[] = [
  mv("m1", "Hose A", "in", 12, iso(today), "Purchase Restock"),
  mv("m2", "Hose A", "out", -3, iso(today), "Issued to Job"),
  mv("m3", "Hose A", "adjust", -1, iso(lastYear), "Inventory Count Audit"),
];
const mids = (f: Partial<typeof EMPTY_MOVEMENT_FILTERS>) =>
  filterMovements(movements, { ...EMPTY_MOVEMENT_FILTERS, ...f }).map((m) => m.id);
eq("movement type filter", mids({ type: "out" }), ["m2"]);
eq("movement range today", mids({ range: "today" }).sort(), ["m1", "m2"]);
eq("movement reason filter", mids({ reason: "Inventory Count Audit" }), ["m3"]);
eq("movement type AND range", mids({ type: "in", range: "today" }), ["m1"]);
eq("movement sorted newest first", filterMovements(movements, EMPTY_MOVEMENT_FILTERS)[2].id, "m3");

// formatting
eq("signed positive", signed(12), "+12");
eq("signed negative", signed(-3), "−3");
eq("qty trims decimals", qty(12.5), "12.5");
eq("csv escapes commas and quotes", toCsv([['Hose 1/2", 10M', 5]]), '"Hose 1/2"", 10M",5');

// CSV formula injection: these exports are opened in Excel, and product names
// and notes are free text, so a leading = + - @ must not stay executable.
eq("csv neutralises = formula", toCsv([["=cmd|'/c calc'!A1"]]), "'=cmd|'/c calc'!A1");
eq("csv neutralises @ formula", toCsv([["@SUM(1+1)"]]), "'@SUM(1+1)");
eq("csv neutralises + formula", toCsv([['+HYPERLINK("http://x")']]), `"'+HYPERLINK(""http://x"")"`);
eq("csv neutralises - formula", toCsv([["-2+3"]]), "'-2+3");
eq("csv leaves negative NUMBERS alone", toCsv([[-3]]), "-3");
eq("csv leaves ordinary text alone", toCsv([["Oil Burner 8 MBTU"]]), "Oil Burner 8 MBTU");
eq("csv still escapes embedded CR", toCsv([["a\rb"]]), '"a\rb"');

// valuation: same product, two makers, two prices
const burner = mk("SAI-BRN-0003", "Oil Burner 8 MBTU", "Burners", 3, 1);
const u = (id: string, cost: number | null, status: Unit["status"] = "in_store", maker: string | null = null): Unit => ({
  id, item_id: "SAI-BRN-0003", seq: Number(id.slice(-2)), unit_cost: cost,
  manufacturer: maker, manufacturing_year: null, status, job_id: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
});
const burnerUnits = [
  u("SAI-BRN-0003-01", 74000, "in_store", "Riello"),
  u("SAI-BRN-0003-02", 81000, "in_store", "Baltur"),
  u("SAI-BRN-0003-03", 74000, "in_store", "Riello"),
  u("SAI-BRN-0003-04", 90000, "at_job", "Riello"),
];
eq("each unit valued at its own price", valueOf(burner, burnerUnits).value, 229000);
eq("units out at a job are not on the shelf", valueOf(burner, burnerUnits).counted, 3);
eq("partly costed stock reports the gap",
   valueOf(burner, [u("SAI-BRN-0003-01", 74000), u("SAI-BRN-0003-02", null)]),
   { value: 74000, costed: 1, counted: 2 });
eq("no costs at all is null, not zero", valueOf(burner, [u("SAI-BRN-0003-01", null)]).value, null);

const cable: Item = { ...mk("SAI-TCS-0004", "Compensating Cable", "Thermocouples & sensors", 850, 300),
  unit: "m", tracking: "bulk", unit_cost: 95 };
eq("bulk valued at average cost", valueOf(cable, []).value, 80750);

const archivedBurner: Item = { ...burner, archived_at: "2026-02-01T00:00:00Z" };
eq("archived products are not counted in total value",
   totalValue([archivedBurner, cable], burnerUnits).value, 80750);

// reasons offered per kind of product
eq("equipment is only issued to jobs, never sold", reasonsFor("out", "serialized"), ["Issued to Job"]);
eq("nothing is ever sold, cable included", reasonsFor("out", "bulk"), ["Issued to Job"]);
eq("equipment comes in bought, built, or back from a job",
   reasonsFor("in", "serialized"), ["Purchase Restock", "Built in-house", "Return from Job"]);
eq("cable is only ever bought or returned", reasonsFor("in", "bulk"), ["Purchase Restock", "Return from Job"]);
eq("cable cannot be repaired or found, but can be used up",
   reasonsFor("condition", "bulk"), ["Used at Job", "Damaged", "Missing", "Scrapped"]);
eq("equipment has all five damage / loss outcomes, and cannot be \"used up\"",
   reasonsFor("condition", "serialized").length, 5);
eq("equipment cannot be used up", reasonsFor("condition", "serialized").includes("Used at Job"), false);
eq("damaged units come back only through Repaired", CONDITION_RULES.Repaired.from, ["damaged"]);
eq("a unit at a job must be returned before it is marked damaged",
   CONDITION_RULES.Damaged.from.includes("at_job"), false);

console.log(fails === 0 ? "\nALL PASSED" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
