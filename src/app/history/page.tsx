"use client";

import Link from "next/link";
import { Suspense, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { MovementType } from "@/lib/types";
import { REASONS } from "@/lib/categories";
import { filterMovements, MovementFilters, DateRange } from "@/lib/filters";
import { qty, signed, dateTime, toCsv, downloadCsv, movementAmountLabel } from "@/lib/format";
import { Card, ItemId, TypeBadge, Spinner, Empty, PageHead, Chip, Button } from "@/components/ui";
import { SearchInput } from "@/components/SearchInput";

const RANGES: { value: DateRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
];

const TYPES: (MovementType | "all")[] = ["all", "in", "out", "adjust", "condition"];
const TYPE_LABEL: Record<string, string> = {
  all: "All movements",
  in: "In",
  out: "Out",
  adjust: "Adjust",
  condition: "Damage / loss",
};

// "Opening Stock" is written by create_item rather than chosen, but it is
// still a reason worth filtering on.
const ALL_REASONS = ["Opening Stock", ...Object.values(REASONS).flat()];

export default function HistoryPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <HistoryView />
    </Suspense>
  );
}

function HistoryView() {
  const { movements, items, loading, configured, jobs, categories, jobName } = useStore();
  const unitOf = useMemo(() => new Map(items.map((i) => [i.id, i.unit])), [items]);
  const router = useRouter();
  const params = useSearchParams();

  const filters: MovementFilters = useMemo(
    () => ({
      query: params.get("q") ?? "",
      type: (params.get("type") as MovementType | null) ?? "all",
      range: (params.get("range") as DateRange | null) ?? "all",
      from: params.get("from") ?? "",
      to: params.get("to") ?? "",
      reason: params.get("reason") ?? "all",
      category: params.get("category") ?? "all",
      job: params.get("job") ?? "all",
    }),
    [params],
  );

  const setFilters = useCallback(
    (patch: Partial<MovementFilters>) => {
      const next = { ...filters, ...patch };
      const sp = new URLSearchParams();
      if (next.query) sp.set("q", next.query);
      if (next.type !== "all") sp.set("type", next.type);
      if (next.range !== "all") sp.set("range", next.range);
      if (next.range === "custom" && next.from) sp.set("from", next.from);
      if (next.range === "custom" && next.to) sp.set("to", next.to);
      if (next.reason !== "all") sp.set("reason", next.reason);
      if (next.category !== "all") sp.set("category", next.category);
      if (next.job !== "all") sp.set("job", next.job);
      router.replace(sp.toString() ? `/history?${sp}` : "/history", { scroll: false });
    },
    [filters, router],
  );

  const visible = useMemo(() => filterMovements(movements, filters), [movements, filters]);

  const totals = useMemo(
    () =>
      visible.reduce(
        (acc, m) => {
          if (m.quantity > 0) acc.in += m.quantity;
          else acc.out += Math.abs(m.quantity);
          return acc;
        },
        { in: 0, out: 0 },
      ),
    [visible],
  );

  const exportCsv = () => {
    const rows: (string | number | null)[][] = [
      ["S.No.", "Date", "Item ID", "Product Name", "Category", "Type", "Stock In", "Stock Out", "Balance", "Reason", "Job", "Written off", "Note", "Unit IDs", "User"],
      ...visible.map((m, n) => [
        n + 1,
        dateTime(m.created_at),
        m.item_id,
        m.item_name,
        m.category,
        m.type,
        m.quantity > 0 ? m.quantity : "",
        m.quantity < 0 ? Math.abs(m.quantity) : "",
        m.balance_after,
        m.reason ?? "",
        m.job_id ? jobName(m.job_id) : "",
        m.write_off_quantity ?? "",
        m.note ?? "",
        m.unit_ids.join(" "),
        m.actor ?? "",
      ]),
    ];
    downloadCsv(`sai-stock-movements-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  };

  if (!configured) return null;

  return (
    <div className="space-y-4">
      <PageHead
        title="History"
        subtitle="Every stock movement, newest first"
        action={
          <Button variant="secondary" onClick={exportCsv} disabled={visible.length === 0}>
            Export CSV
          </Button>
        }
      />

      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <SearchInput
            value={filters.query}
            onChange={(q) => setFilters({ query: q })}
            placeholder="Search by item ID, name or note…"
          />
          <select
            className="field sm:w-40"
            value={filters.category}
            onChange={(e) => setFilters({ category: e.target.value })}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.code} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="field sm:w-48"
            value={filters.reason}
            onChange={(e) => setFilters({ reason: e.target.value })}
          >
            <option value="all">All reasons</option>
            {ALL_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {jobs.length > 0 && (
            <select
              className="field sm:w-48"
              value={filters.job}
              onChange={(e) => setFilters({ job: e.target.value })}
            >
              <option value="all">All jobs</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
          {TYPES.map((t) => (
            <Chip key={t} active={filters.type === t} onClick={() => setFilters({ type: t })}>
              {TYPE_LABEL[t]}
            </Chip>
          ))}
          <span className="mx-1 w-px shrink-0 bg-line" />
          {RANGES.map((r) => (
            <Chip key={r.value} active={filters.range === r.value} onClick={() => setFilters({ range: r.value })}>
              {r.label}
            </Chip>
          ))}
        </div>

        {filters.range === "custom" && (
          <div className="mt-2.5 flex flex-wrap items-end gap-2">
            <div>
              <label className="label" htmlFor="from">
                From
              </label>
              <input
                id="from"
                type="date"
                className="field w-40"
                value={filters.from}
                onChange={(e) => setFilters({ from: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="to">
                To
              </label>
              <input
                id="to"
                type="date"
                className="field w-40"
                value={filters.to}
                onChange={(e) => setFilters({ to: e.target.value })}
              />
            </div>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted">
        <span>
          <span className="num font-semibold text-ink">{visible.length}</span> of {movements.length} movements
          {filters.job !== "all" && (
            <>
              {" for "}
              <span className="font-semibold text-ink">{jobName(filters.job)}</span>
            </>
          )}
        </span>
        <span className="flex gap-3">
          <span>
            In <span className="num font-semibold text-ok-600">+{qty(totals.in)}</span>
          </span>
          <span>
            Out <span className="num font-semibold text-alert-600">−{qty(totals.out)}</span>
          </span>
        </span>
      </div>

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <Card>
          <Empty>No movements match these filters.</Empty>
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-steel-50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Item ID</th>
                  <th className="px-3 py-2 font-semibold">Product name</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 text-right font-semibold">Change</th>
                  <th className="px-3 py-2 text-right font-semibold">Balance</th>
                  <th className="px-3 py-2 font-semibold">Reason</th>
                  <th className="px-3 py-2 font-semibold">Job</th>
                  <th className="px-3 py-2 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((m) => (
                  <tr key={m.id} className="hover:bg-steel-50/60">
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-muted">{dateTime(m.created_at)}</td>
                    <td className="px-3 py-2">
                      <Link href={`/inventory/${m.item_id}`}>
                        <ItemId id={m.item_id} className="hover:bg-steel-100" />
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-ink">{m.item_name}</td>
                    <td className="px-3 py-2">
                      <TypeBadge type={m.type} />
                    </td>
                    <td
                      className={`num px-3 py-2 text-right font-semibold ${
                        m.quantity > 0 ? "text-ok-600" : m.quantity < 0 ? "text-alert-600" : "text-muted"
                      }`}
                    >
                      {signed(m.quantity)}
                    </td>
                    <td className="num px-3 py-2 text-right text-ink">{qty(m.balance_after)}</td>
                    <td className="px-3 py-2 text-muted">
                      {m.reason ?? "—"}
                      {m.note && <span className="block text-[11px]">{m.note}</span>}
                    </td>
                    <td className="px-3 py-2 text-muted">{m.job_id ? jobName(m.job_id) : "—"}</td>
                    <td className="num px-3 py-2 text-[11px] text-muted">
                      {m.unit_ids.length > 0
                        ? m.unit_ids.length <= 2
                          ? m.unit_ids.map((u) => u.split("-").slice(-1)[0]).join(", ")
                          : `${m.unit_ids.length} units`
                        : (m.write_off_quantity !== null && `${qty(m.write_off_quantity)} ${unitOf.get(m.item_id) ?? ""}`) || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="space-y-2 md:hidden">
            {visible.map((m) => (
              <div key={m.id} className="rounded-lg border border-line bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{m.item_name}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2">
                      <Link href={`/inventory/${m.item_id}`}>
                        <ItemId id={m.item_id} />
                      </Link>
                      <TypeBadge type={m.type} />
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`num text-base font-semibold ${
                        m.quantity > 0 ? "text-ok-600" : m.quantity < 0 ? "text-alert-600" : "text-muted"
                      }`}
                    >
                      {signed(m.quantity)}
                    </p>
                    <p className="num text-[11px] text-muted">→ {qty(m.balance_after)}</p>
                  </div>
                </div>
                <p className="mt-2 border-t border-line pt-2 text-[11px] text-muted">
                  {m.reason ?? "—"}
                  {m.job_id ? ` · ${jobName(m.job_id)}` : ""}
                  {m.note ? ` · ${m.note}` : ""}
                  {(() => {
                    const label = movementAmountLabel(m, unitOf.get(m.item_id) ?? "");
                    return label ? ` · ${label}` : "";
                  })()}
                  {" · "}
                  {dateTime(m.created_at)}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
