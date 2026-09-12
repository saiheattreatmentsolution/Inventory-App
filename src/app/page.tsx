"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { statusOf, StockStatus, STATUS_LABEL, Item } from "@/lib/types";
import { totalValue } from "@/lib/valuation";
import { qty, signed, money, relative, shortActor } from "@/lib/format";
import {
  Card,
  SectionTitle,
  StatusBadge,
  ItemId,
  TypeBadge,
  Spinner,
  Empty,
  PageHead,
  STATUS_FILL,
} from "@/components/ui";

const ORDER: StockStatus[] = ["in_stock", "none", "low", "reorder", "out_of_stock"];

export default function DashboardPage() {
  const { items, units, movements, categories, loading, configured, jobName } = useStore();
  const { isAdmin } = useAuth();

  const counts = useMemo(() => {
    const c: Record<StockStatus, number> = { in_stock: 0, none: 0, low: 0, reorder: 0, out_of_stock: 0 };
    items.forEach((i) => (c[statusOf(i)] += 1));
    return c;
  }, [items]);

  const valuation = useMemo(() => totalValue(items, units), [items, units]);

  // Worst first: out of stock, then deepest below its own threshold.
  const reorderQueue = useMemo(
    () =>
      items
        .filter((i) => {
          const s = statusOf(i);
          return s === "reorder" || s === "out_of_stock";
        })
        .sort((a, b) => shortfallRatio(a) - shortfallRatio(b))
        .slice(0, 12),
    [items],
  );

  const byCategory = useMemo(() => {
    return categories
      .map((cat) => {
        const rows = items.filter((i) => i.category === cat.name);
        const needs = rows.filter((i) => {
          const s = statusOf(i);
          return s === "reorder" || s === "out_of_stock";
        }).length;
        return { ...cat, total: rows.length, needs };
      })
      .filter((c) => c.total > 0);
  }, [items, categories]);

  if (!configured) return null;
  if (loading) return <Spinner label="Loading stock…" />;

  return (
    <div className="space-y-4">
      <PageHead
        title="Dashboard"
        subtitle={`${items.length} products · ${movements.length} logged movements`}
      />

      {/* KPI row — every tile is a link into the matching Inventory filter, and
          the four status tiles add up to the product count. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Products tracked" value={String(items.length)} href="/inventory" tone="neutral" />
        <Stat label="In stock" value={String(counts.in_stock + counts.low)} href="/inventory?status=in_stock" tone="ok" />
        <Stat label="None in store" value={String(counts.none)} href="/inventory?status=none" tone="muted" />
        <Stat label="Needs reorder" value={String(counts.reorder)} href="/inventory?status=reorder" tone="alert" />
        <Stat label="Out of stock" value={String(counts.out_of_stock)} href="/inventory?status=out_of_stock" tone="danger" />
      </div>

      <Card>
        <SectionTitle
          action={
            isAdmin && (
              <span className="num text-xs text-muted">
                Stock value {money(valuation.value)}
                {valuation.uncosted > 0 && (
                  <span className="text-warn-600"> · {valuation.uncosted} not priced yet</span>
                )}
              </span>
            )
          }
        >
          Stock health
        </SectionTitle>
        <div className="p-4">
          <HealthMeter counts={counts} total={items.length} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle
            action={
              <Link href="/inventory?status=reorder" className="text-xs font-semibold text-steel-600 hover:underline">
                View all
              </Link>
            }
          >
            Reorder queue
          </SectionTitle>
          {reorderQueue.length === 0 ? (
            <Empty>Nothing is at or below its minimum quantity. </Empty>
          ) : (
            <ul className="divide-y divide-line">
              {reorderQueue.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/inventory/${item.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-steel-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{item.name}</p>
                      <p className="mt-0.5 flex items-center gap-2">
                        <ItemId id={item.id} />
                        <span className="truncate text-xs text-muted">{item.category}</span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="num text-sm font-semibold text-ink">
                        {qty(item.quantity)} <span className="text-xs font-normal text-muted">{item.unit}</span>
                      </p>
                      <p className="num mt-0.5 text-[11px] text-muted">min {qty(item.reorder_threshold)}</p>
                    </div>
                    <StatusBadge status={statusOf(item)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle>By category</SectionTitle>
          <ul className="divide-y divide-line">
            {byCategory.map((c) => (
              <li key={c.code}>
                <Link
                  href={`/inventory?category=${encodeURIComponent(c.name)}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-steel-50"
                >
                  <span className="num rounded bg-steel-50 px-1.5 py-0.5 text-[11px] text-steel-600">{c.code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</span>
                  {c.needs > 0 && (
                    <span className="num rounded bg-alert-50 px-1.5 py-0.5 text-[11px] font-semibold text-alert-600">
                      {c.needs} low
                    </span>
                  )}
                  <span className="num text-sm text-muted">{c.total}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <SectionTitle
          action={
            <Link href="/history" className="text-xs font-semibold text-steel-600 hover:underline">
              Full history
            </Link>
          }
        >
          Recent movements
        </SectionTitle>
        {movements.length === 0 ? (
          <Empty>No stock movements logged yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {movements.slice(0, 8).map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <TypeBadge type={m.type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{m.item_name}</p>
                  <p className="truncate text-[11px] text-muted">
                    {m.reason ?? "—"}
                    {m.job_id && (
                      <>
                        {" · "}
                        <span className="font-semibold text-alert-600">{jobName(m.job_id)}</span>
                      </>
                    )}
                    {m.unit_ids.length > 0 &&
                      ` · ${m.unit_ids.length} unit${m.unit_ids.length > 1 ? "s" : ""}`}
                    {m.note ? ` · ${m.note}` : ""}
                    {m.actor ? ` · ${shortActor(m.actor)}` : ""}
                  </p>
                </div>
                <span
                  className={`num shrink-0 text-sm font-semibold ${
                    m.quantity > 0 ? "text-ok-600" : m.quantity < 0 ? "text-alert-600" : "text-muted"
                  }`}
                >
                  {signed(m.quantity)}
                </span>
                <span className="hidden w-20 shrink-0 text-right text-[11px] text-muted sm:block">
                  {relative(m.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function shortfallRatio(i: Item): number {
  if (i.quantity <= 0) return -1;
  return i.reorder_threshold > 0 ? i.quantity / i.reorder_threshold : 999;
}

function Stat({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: string;
  href: string;
  tone: "neutral" | "ok" | "muted" | "alert" | "danger";
}) {
  const toneCls = {
    neutral: "text-ink",
    ok: "text-ok-600",
    // No minimum set, nothing on the shelf — worth seeing, but not an alarm.
    muted: "text-muted",
    alert: "text-alert-600",
    danger: "text-danger-600",
  }[tone];
  return (
    <Link
      href={href}
      className="rounded-lg border border-line bg-card p-3.5 transition-colors hover:border-steel-400"
    >
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`num mt-1 text-2xl font-semibold ${toneCls}`}>{value}</p>
    </Link>
  );
}

/**
 * Ordinal status meter. Segments are separated by a 2px surface gap and every
 * segment is named in the legend beneath — the colour is never the only cue.
 */
function HealthMeter({ counts, total }: { counts: Record<StockStatus, number>; total: number }) {
  if (total === 0) return <p className="text-sm text-muted">No products yet.</p>;
  const present = ORDER.filter((s) => counts[s] > 0);

  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {present.map((s) => (
          <div
            key={s}
            className={`${STATUS_FILL[s]} first:rounded-l-full last:rounded-r-full`}
            style={{ width: `${(counts[s] / total) * 100}%` }}
          />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {ORDER.map((s) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${STATUS_FILL[s]}`} />
            <dt className="min-w-0 flex-1 truncate text-xs text-muted">{STATUS_LABEL[s]}</dt>
            <dd className="num text-sm font-semibold text-ink">{counts[s]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
