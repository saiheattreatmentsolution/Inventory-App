"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { statusOf, Item } from "@/lib/types";
import { UNITS } from "@/lib/categories";
import { qty, signed, money, dateTime, dateOnly, movementAmountLabel } from "@/lib/format";
import { Card, SectionTitle, StatusBadge, ItemId, TypeBadge, Spinner, Empty, Button } from "@/components/ui";
import { UnitsEditor } from "@/components/UnitsEditor";
import { valueOf } from "@/lib/valuation";

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { items, movements, categories, loading, configured, updateItem, setArchived, unitsOf, jobName } =
    useStore();
  const { isAdmin } = useAuth();

  const item = items.find((i) => i.id === id);
  const history = useMemo(
    () => movements.filter((m) => m.item_id === id),
    [movements, id],
  );
  const units = useMemo(() => unitsOf(id), [unitsOf, id]);
  const valuation = useMemo(() => (item ? valueOf(item, units) : null), [item, units]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => draftFrom(null));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!configured) return null;
  if (loading) return <Spinner />;
  if (!item) {
    return (
      <Card>
        <Empty>
          No item with ID <span className="num">{id}</span>.{" "}
          <Link href="/inventory" className="font-semibold text-steel-600 hover:underline">
            Back to inventory
          </Link>
        </Empty>
      </Card>
    );
  }

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await updateItem(item.id, {
        name: draft.name.trim(),
        category: draft.category,
        unit: draft.unit,
        reorder_threshold: Number(draft.reorder_threshold) || 0,
        unit_cost: draft.unit_cost === "" ? null : Number(draft.unit_cost),
        notes: draft.notes.trim() || null,
      });
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const archived = item.archived_at !== null;

  const toggleArchive = async () => {
    if (!archived) {
      const warning = item.quantity > 0
        ? `${item.name} still has ${qty(item.quantity)} ${item.unit} in stock. Archive it anyway?`
        : `Archive ${item.name}? It will drop out of the inventory list, and its history is kept.`;
      if (!confirm(warning)) return;
    }
    try {
      await setArchived(item.id, !archived);
      if (!archived) router.push("/inventory");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not archive");
    }
  };

  return (
    <div className="space-y-4">
      <Link href="/inventory" className="inline-flex items-center gap-1 text-xs font-semibold text-steel-600 hover:underline">
        ← Inventory
      </Link>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ItemId id={item.id} />
              <span className="text-xs text-muted">{item.category}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-ink">{item.name}</h1>
              <StatusBadge status={statusOf(item)} />
            </div>
            {archived && (
              <p className="mt-1 inline-block rounded border border-warn-500/35 bg-warn-50 px-1.5 py-0.5 text-[11px] font-semibold text-warn-600">
                Archived — hidden from the inventory list, history kept
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="num text-3xl font-semibold text-ink">{qty(item.quantity)}</p>
            <p className="text-xs text-muted">{item.unit} on hand</p>
          </div>
        </div>

        {/* Viewers have no actions here, so the row is left out rather than shown empty. */}
        {isAdmin && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {archived ? (
              <Button variant="secondary" onClick={toggleArchive}>
                Restore item
              </Button>
            ) : (
              <>
                <Link href={`/update?item=${item.id}`}>
                  <Button>Update stock</Button>
                </Link>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!editing) setDraft(draftFrom(item));
                    setEditing((v) => !v);
                    setErr(null);
                  }}
                >
                  {editing ? "Cancel" : "Edit details"}
                </Button>
                {editing && (
                  <Button variant="danger" onClick={toggleArchive} className="ml-auto">
                    Archive item
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {err && <p className="mt-3 rounded border border-danger-500/25 bg-danger-50 p-2 text-xs text-danger-600">{err}</p>}

        {editing && isAdmin ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Product name</label>
              <input className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Category</label>
              <select
                className="field"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c.code} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted">
                Changes what this groups with and how it filters — the item&apos;s ID
                (<span className="num">{item.id}</span>) is permanent and keeps its original prefix either way.
              </p>
            </div>
            <div>
              <label className="label">Unit of measure</label>
              <select
                className="field"
                value={draft.unit}
                disabled={units.length > 0 || item.quantity !== 0}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              >
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
              {(units.length > 0 || item.quantity !== 0) && (
                <p className="mt-1 text-[11px] text-muted">
                  Locked — this decides whether the product is counted unit by unit, and it already
                  has stock on record. Add a new product instead.
                </p>
              )}
            </div>
            <div>
              <label className="label">Minimum quantity (reorder at)</label>
              <input
                className="field num"
                type="number"
                min={0}
                value={draft.reorder_threshold}
                onChange={(e) => setDraft({ ...draft, reorder_threshold: Number(e.target.value) })}
              />
            </div>
            {item.tracking === "bulk" && (
              <div>
                <label className="label">Average cost per {item.unit} (₹)</label>
                <input
                  className="field num"
                  type="number"
                  min={0}
                  step="any"
                  value={draft.unit_cost}
                  onChange={(e) => setDraft({ ...draft, unit_cost: e.target.value })}
                />
                <p className="mt-1 text-[11px] text-muted">
                  Updated automatically as purchases are received at different rates.
                </p>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea
                className="field"
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={save} disabled={saving || !draft.name.trim()}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        ) : (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <Fact label="Minimum qty" value={`${qty(item.reorder_threshold)} ${item.unit}`} mono />
            {isAdmin &&
              (item.tracking === "bulk" ? (
                <Fact label={`Average cost per ${item.unit}`} value={money(item.unit_cost)} mono />
              ) : (
                <Fact
                  label="Units priced"
                  value={valuation ? `${valuation.costed} of ${valuation.counted} on shelf` : "—"}
                  mono
                />
              ))}
            {isAdmin && (
              <Fact
                label={
                  valuation && valuation.costed < valuation.counted && valuation.costed > 0
                    ? "Stock value (partial)"
                    : "Stock value"
                }
                value={money(valuation?.value ?? null)}
                mono
              />
            )}
            <Fact label="Tracking" value={item.tracking === "serialized" ? "Unit by unit" : `By ${item.unit}`} />
            <Fact label="Added" value={dateOnly(item.created_at)} />
            <Fact label="Last updated" value={dateTime(item.updated_at)} />
            {item.notes && (
              <div className="col-span-2 sm:col-span-4">
                <dt className="text-xs font-medium text-muted">Notes</dt>
                <dd className="mt-0.5 text-sm text-ink">{item.notes}</dd>
              </div>
            )}
          </dl>
        )}
      </Card>

      {item.tracking === "serialized" && (
        <Card>
          <SectionTitle
            action={
              <span className="text-xs text-muted">
                {units.filter((u) => u.status === "in_store").length} of{" "}
                {units.filter((u) => u.status !== "scrapped").length} in store
              </span>
            }
          >
            Individual units
          </SectionTitle>
          <UnitsEditor units={units} canEdit={isAdmin} jobName={jobName} />
        </Card>
      )}

      <Card>
        <SectionTitle action={<span className="text-xs text-muted">{history.length} entries</span>}>
          Movement history
        </SectionTitle>
        {history.length === 0 ? (
          <Empty>No movements logged for this item yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <TypeBadge type={m.type} />
                <span className="num w-16 text-right text-sm font-semibold text-ink">{signed(m.quantity)}</span>
                <span className="num w-24 text-xs text-muted">→ {qty(m.balance_after)} {item.unit}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">
                  {m.reason ?? "—"}
                  {m.job_id ? ` · ${jobName(m.job_id)}` : ""}
                  {m.note ? ` · ${m.note}` : ""}
                  {(() => {
                    const label = movementAmountLabel(m, item.unit);
                    return label ? ` · ${label}` : "";
                  })()}
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

type Draft = {
  name: string;
  category: string;
  unit: string;
  reorder_threshold: number;
  unit_cost: string;
  notes: string;
};

function draftFrom(item: Item | null): Draft {
  return {
    name: item?.name ?? "",
    category: item?.category ?? "",
    unit: item?.unit ?? "pcs",
    reorder_threshold: item?.reorder_threshold ?? 0,
    unit_cost: item?.unit_cost == null ? "" : String(item.unit_cost),
    notes: item?.notes ?? "",
  };
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className={`mt-0.5 text-ink ${mono ? "num text-sm" : "text-sm"}`}>{value}</dd>
    </div>
  );
}
