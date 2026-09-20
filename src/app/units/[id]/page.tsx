"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { UNIT_STATUS_LABEL } from "@/lib/types";
import { dateOnly, dateTime, money, qty, signed } from "@/lib/format";
import { Card, SectionTitle, ItemId, TypeBadge, Spinner, Empty } from "@/components/ui";
import { UnitStatusBadge } from "@/components/UnitPicker";

/**
 * One physical piece of equipment: what it is, where it is, when it was made,
 * and everything that has ever happened to it. This is what the ID stencilled
 * on the machine leads to.
 */
export default function UnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { units, items, movements, loading, configured, jobName } = useStore();
  const { isAdmin } = useAuth();

  const unit = units.find((u) => u.id === id);
  const item = items.find((i) => i.id === unit?.item_id);

  // Every entry that named this unit — dispatches, returns, counts, write-offs.
  const history = useMemo(
    () => movements.filter((m) => m.unit_ids.includes(id)),
    [movements, id],
  );

  if (!configured) return null;
  if (loading) return <Spinner />;
  if (!unit) {
    return (
      <Card>
        <Empty>
          No unit with ID <span className="num">{id}</span>.{" "}
          <Link href="/inventory" className="font-semibold text-steel-600 hover:underline">
            Back to inventory
          </Link>
        </Empty>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl space-y-3">
      <Link
        href={`/inventory/${unit.item_id}`}
        className="inline-flex items-center gap-1 text-xs font-semibold text-steel-600 hover:underline"
      >
        ← {item?.name ?? unit.item_id}
      </Link>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <ItemId id={unit.id} />
            <h1 className="mt-1.5 text-lg font-semibold text-ink">{item?.name ?? unit.item_id}</h1>
            <p className="text-xs text-muted">
              {item?.category}
              {" · unit "}
              {unit.seq} of this product
            </p>
          </div>
          <UnitStatusBadge status={unit.status} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <Fact
            label="Where it is"
            value={unit.status === "at_job" ? jobName(unit.job_id) : UNIT_STATUS_LABEL[unit.status]}
          />
          <Fact label="Made by" value={unit.manufacturer ?? "—"} />
          <Fact label="Year made" value={unit.manufacturing_year ? String(unit.manufacturing_year) : "—"} mono />
          {isAdmin && <Fact label="Cost" value={money(unit.unit_cost)} mono />}
          <Fact label="On record since" value={dateOnly(unit.created_at)} />
          <Fact label="Last moved" value={dateTime(unit.updated_at)} />
        </dl>
      </Card>

      <Card>
        <SectionTitle action={<span className="text-xs text-muted">{history.length} entries</span>}>
          History of this unit
        </SectionTitle>
        {history.length === 0 ? (
          <Empty>Nothing has been recorded against this unit yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <TypeBadge type={m.type} />
                <span className="num w-16 text-right text-sm font-semibold text-ink">{signed(m.quantity)}</span>
                <span className="num w-24 text-xs text-muted">
                  → {qty(m.balance_after)} {item?.unit}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">
                  {m.reason ?? "—"}
                  {m.job_id ? ` · ${jobName(m.job_id)}` : ""}
                  {m.note ? ` · ${m.note}` : ""}
                  {m.supplier_invoice ? ` · Invoice: ${m.supplier_invoice}` : ""}
                  {m.actor ? ` · ${m.actor}` : ""}
                </span>
                <span className="text-[11px] text-muted">{dateTime(m.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className={`mt-0.5 text-ink ${mono ? "num text-sm" : "text-sm"}`}>{value}</dd>
    </div>
  );
}
