import { Item, Unit } from "./types";

type Valuation = {
  /** null when nothing on hand has a cost yet. */
  value: number | null;
  /** How many of the counted things have a cost recorded. */
  costed: number;
  /** How many things are being valued (units on the shelf, or 1 for bulk). */
  counted: number;
};

/**
 * What the stock on the shelf is worth.
 *
 * Countable products are valued unit by unit, at what each one actually cost —
 * the same product bought from two makers at two prices is two different
 * numbers. Measured products (cable, coil) have no unit to price, so they use
 * the product's running average cost.
 */
export function valueOf(item: Item, units: Unit[]): Valuation {
  if (item.tracking === "serialized") {
    const onShelf = units.filter((u) => u.item_id === item.id && u.status === "in_store");
    const priced = onShelf.filter((u) => u.unit_cost !== null);
    return {
      value: priced.length ? priced.reduce((sum, u) => sum + (u.unit_cost ?? 0), 0) : null,
      costed: priced.length,
      counted: onShelf.length,
    };
  }
  return {
    value: item.unit_cost === null ? null : item.quantity * item.unit_cost,
    costed: item.unit_cost === null ? 0 : 1,
    counted: 1,
  };
}

export function totalValue(items: Item[], units: Unit[]) {
  let value = 0;
  let uncosted = 0;
  for (const item of items) {
    if (item.archived_at !== null) continue;
    const v = valueOf(item, units);
    value += v.value ?? 0;
    uncosted += v.counted - v.costed;
  }
  return { value, uncosted };
}
