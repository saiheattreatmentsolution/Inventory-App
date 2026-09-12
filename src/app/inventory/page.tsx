"use client";

import Link from "next/link";
import { Suspense, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { statusOf, STATUS_LABEL, StockStatus, Item } from "@/lib/types";
import { filterItems, ItemFilters, ItemSort } from "@/lib/filters";
import { qty, money, relative, toCsv, downloadCsv } from "@/lib/format";
import { Card, StatusBadge, ItemId, Spinner, Empty, PageHead, Chip, Button } from "@/components/ui";
import { SearchInput } from "@/components/SearchInput";
import { valueOf } from "@/lib/valuation";

const SORTS: { value: ItemSort; label: string }[] = [
  { value: "name", label: "Name A–Z" },
  { value: "status", label: "Worst status first" },
  { value: "qty_asc", label: "Quantity, low to high" },
  { value: "qty_desc", label: "Quantity, high to low" },
  { value: "updated", label: "Recently updated" },
];

const STATUSES: (StockStatus | "all" | "archived")[] = [
  "all",
  "in_stock",
  "low",
  "reorder",
  "out_of_stock",
  "none",
  "archived",
];

export default function InventoryPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <InventoryView />
    </Suspense>
  );
}

function InventoryView() {
  const { items, units, categories, loading, configured } = useStore();
  const { isAdmin } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  // Filter state lives in the URL, so a filtered view can be bookmarked or shared.
  const filters: ItemFilters = useMemo(
    () => ({
      query: params.get("q") ?? "",
      categories: (params.get("category") ?? "").split(",").filter(Boolean),
      status: (params.get("status") as ItemFilters["status"] | null) ?? "all",
      sort: (params.get("sort") as ItemSort | null) ?? "name",
    }),
    [params],
  );

  const setFilters = useCallback(
    (patch: Partial<ItemFilters>) => {
      const next = { ...filters, ...patch };
      const sp = new URLSearchParams();
      if (next.query) sp.set("q", next.query);
      if (next.categories.length) sp.set("category", next.categories.join(","));
      if (next.status !== "all") sp.set("status", next.status);
      if (next.sort !== "name") sp.set("sort", next.sort);
      router.replace(sp.toString() ? `/inventory?${sp}` : "/inventory", { scroll: false });
    },
    [filters, router],
  );

  const visible = useMemo(() => filterItems(items, filters), [items, filters]);

  // Balance is what is on the shelf. Total is everything we still own, which
  // includes units sitting out at a job — the difference is the whole point of
  // the column. Scrapped units are gone for good, so they are not counted.
  const unitCounts = useMemo(() => {
    const m = new Map<string, { total: number; out: number; lost: number }>();
    for (const u of units) {
      if (u.status === "scrapped") continue;
      const e = m.get(u.item_id) ?? { total: 0, out: 0, lost: 0 };
      e.total += 1;
      if (u.status === "at_job") e.out += 1;
      if (u.status === "damaged" || u.status === "missing") e.lost += 1;
      m.set(u.item_id, e);
    }
    return m;
  }, [units]);

  const totalOf = (item: Item) =>
    item.tracking === "serialized" ? (unitCounts.get(item.id)?.total ?? 0) : item.quantity;
  const outOf = (item: Item) => unitCounts.get(item.id)?.out ?? 0;
  const lostOf = (item: Item) => unitCounts.get(item.id)?.lost ?? 0;
  const activeCount =
    (filters.query ? 1 : 0) +
    filters.categories.length +
    (filters.status !== "all" ? 1 : 0);

  const toggleCategory = (name: string) =>
    setFilters({
      categories: filters.categories.includes(name)
        ? filters.categories.filter((c) => c !== name)
        : [...filters.categories, name],
    });

  // Viewers get the same export without the money columns.
  const exportCsv = () => {
    const header = ["S.No.", "Item ID", "Product Name", "Category", "Unit", "Total Owned", "Out At Jobs",
      "Damaged Or Missing", "Balance In Store", "Min Qty Required", "Re-order Alert"];
    if (isAdmin) header.push("Stock Value", "Units Not Priced");
    header.push("Last Updated");

    const rows: (string | number | null)[][] = [
      header,
      ...visible.map((i, n) => {
        const row: (string | number | null)[] = [n + 1, i.id, i.name, i.category, i.unit, totalOf(i),
          outOf(i), lostOf(i), i.quantity, i.reorder_threshold, STATUS_LABEL[statusOf(i)]];
        if (isAdmin) {
          const v = valueOf(i, units);
          row.push(v.value ?? "", v.counted - v.costed);
        }
        row.push(i.updated_at);
        return row;
      }),
    ];
    downloadCsv(`sai-stock-summary-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  };

  if (!configured) return null;

  return (
    <div className="space-y-4">
      <PageHead
        title="Inventory"
        subtitle="What we have, and where it is"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportCsv} disabled={visible.length === 0}>
              Export CSV
            </Button>
            <Link href="/add">
              <Button>Add item</Button>
            </Link>
          </div>
        }
      />

      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <SearchInput
            value={filters.query}
            onChange={(q) => setFilters({ query: q })}
            placeholder="Search by ID, name or category — try “hose”, “SAI-HOS”, “12 MBTU”"
          />
          <select
            className="field sm:w-44"
            value={filters.status}
            onChange={(e) => setFilters({ status: e.target.value as ItemFilters["status"] })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s === "archived" ? "Archived" : STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            className="field sm:w-48"
            value={filters.sort}
            onChange={(e) => setFilters({ sort: e.target.value as ItemSort })}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
          <Chip active={filters.categories.length === 0} onClick={() => setFilters({ categories: [] })}>
            All categories
          </Chip>
          {categories.map((c) => (
            <Chip
              key={c.code}
              active={filters.categories.includes(c.name)}
              onClick={() => toggleCategory(c.name)}
            >
              {c.name}
            </Chip>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-between px-1 text-xs text-muted">
        <span>
          <span className="num font-semibold text-ink">{visible.length}</span> of {items.length} products
          {activeCount > 0 && ` · ${activeCount} filter${activeCount > 1 ? "s" : ""} on`}
        </span>
        {activeCount > 0 && (
          <button onClick={() => router.replace("/inventory", { scroll: false })} className="font-semibold text-steel-600 hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <Spinner label="Loading stock…" />
      ) : visible.length === 0 ? (
        <Card>
          <Empty>
            No products match these filters.
            {items.length === 0 && (
              <>
                {" "}
                <Link href="/add" className="font-semibold text-steel-600 hover:underline">
                  Add the first item
                </Link>
                .
              </>
            )}
          </Empty>
        </Card>
      ) : (
        <>
          {/* Desktop: the ledger table. */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-steel-50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-semibold">Item ID</th>
                  <th className="px-3 py-2 font-semibold">Product name</th>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                  <th className="px-3 py-2 text-right font-semibold">Balance</th>
                  <th className="px-3 py-2 text-right font-semibold">Min qty</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((item) => (
                  <tr key={item.id} className="hover:bg-steel-50/60">
                    <td className="px-3 py-2">
                      <Link href={`/inventory/${item.id}`}>
                        <ItemId id={item.id} className="hover:bg-steel-100" />
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/inventory/${item.id}`} className="font-medium text-ink hover:text-steel-600 hover:underline">
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted">{item.category}</td>
                    <td className="num px-3 py-2 text-right text-ink">{qty(totalOf(item))}</td>
                    <td className="num px-3 py-2 text-right font-semibold text-ink">
                      {qty(item.quantity)} <span className="text-xs font-normal text-muted">{item.unit}</span>
                    </td>
                    <td className="num px-3 py-2 text-right text-muted">{qty(item.reorder_threshold)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={statusOf(item)} />
                    </td>
                    <td className="px-3 py-2 text-right text-[11px] text-muted">{relative(item.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile: the same rows as cards. */}
          <div className="space-y-2 md:hidden">
            {visible.map((item) => (
              <MobileRow
                key={item.id}
                item={item}
                total={totalOf(item)}
                out={outOf(item)}
                lost={lostOf(item)}
                value={isAdmin ? valueOf(item, units).value : null}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MobileRow({
  item,
  total,
  out,
  lost,
  value,
}: {
  item: Item;
  total: number;
  out: number;
  lost: number;
  value: number | null;
}) {
  return (
    <Link href={`/inventory/${item.id}`} className="block rounded-lg border border-line bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{item.name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <ItemId id={item.id} />
            <span className="text-xs text-muted">{item.category}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-base font-semibold text-ink">
            {qty(item.quantity)}
            <span className="text-[11px] font-normal text-muted"> / {qty(total)}</span>
          </p>
          <p className="text-[11px] text-muted">in store / total {item.unit}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2">
        <StatusBadge status={statusOf(item)} />
        <span className="num text-[11px] text-muted">
          min {qty(item.reorder_threshold)}
          {out > 0 && <span className="text-alert-600"> · {qty(out)} out at jobs</span>}
          {lost > 0 && <span className="text-danger-600"> · {qty(lost)} damaged/missing</span>}
          {value !== null && ` · ${money(value)}`}
        </span>
      </div>
    </Link>
  );
}
