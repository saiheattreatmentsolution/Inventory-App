"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Unit } from "@/lib/types";
import { useStore } from "@/lib/store";
import { formatDateInput, money, parseDateInput } from "@/lib/format";
import { Button, Empty, ItemId } from "@/components/ui";
import { UnitStatusBadge } from "@/components/UnitPicker";

type Row = { manufacturer: string; unit_cost: string; date: string };

const toRow = (u: Unit): Row => ({
  manufacturer: u.manufacturer ?? "",
  unit_cost: u.unit_cost === null ? "" : String(u.unit_cost),
  date: formatDateInput(u.manufacturing_date),
});

const badDate = (date: string) => date !== "" && parseDateInput(date) === null;

/**
 * Every physical unit of a product, with who made it, when, and what it cost.
 * Viewers see the list; admins can edit it. "Fill every unit" exists because
 * units of a product usually came in one batch — price the batch once, then
 * correct the odd one bought elsewhere.
 */
export function UnitsEditor({
  units,
  canEdit,
  jobName,
}: {
  units: Unit[];
  canEdit: boolean;
  jobName: (id: string | null) => string;
}) {
  const { units: allUnits, updateUnits } = useStore();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [fill, setFill] = useState({ manufacturer: "", unit_cost: "", date: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Makers already in use anywhere, offered as suggestions so "Riello" does
  // not become "riello" and "Rielo" — the same drift that broke the workbook.
  const makers = useMemo(
    () =>
      Array.from(
        new Set(allUnits.map((u) => u.manufacturer?.trim()).filter((m): m is string => !!m)),
      ).sort(),
    [allUnits],
  );

  const start = () => {
    setRows(Object.fromEntries(units.map((u) => [u.id, toRow(u)])));
    setFill({ manufacturer: "", unit_cost: "", date: "" });
    setErr(null);
    setEditing(true);
  };

  const setRow = (id: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const fillAll = () =>
    setRows((r) =>
      Object.fromEntries(
        Object.entries(r).map(([id, row]) => [
          id,
          {
            ...row,
            manufacturer: fill.manufacturer || row.manufacturer,
            unit_cost: fill.unit_cost || row.unit_cost,
            date: fill.date || row.date,
          },
        ]),
      ),
    );

  const badCost = Object.values(rows).some(
    (r) => r.unit_cost !== "" && (Number.isNaN(Number(r.unit_cost)) || Number(r.unit_cost) < 0),
  );
  const badDates = Object.values(rows).some((r) => badDate(r.date));
  const invalid = badCost || badDates;

  const save = async () => {
    const changed = units.filter((u) => {
      const r = rows[u.id];
      const before = toRow(u);
      return (
        r.manufacturer.trim() !== before.manufacturer ||
        r.unit_cost !== before.unit_cost ||
        r.date !== before.date
      );
    });
    if (changed.length === 0) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await updateUnits(
        changed.map((u) => {
          const r = rows[u.id];
          return {
            id: u.id,
            manufacturer: r.manufacturer.trim() || null,
            unit_cost: r.unit_cost === "" ? null : Number(r.unit_cost),
            manufacturing_date: parseDateInput(r.date),
          };
        }),
      );
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the units");
    } finally {
      setBusy(false);
    }
  };

  if (units.length === 0) return <Empty>No units recorded yet.</Empty>;

  if (!editing) {
    return (
      <>
        <ul className="divide-y divide-line">
          {units.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <Link href={`/units/${u.id}`}>
                <ItemId id={u.id} className="hover:bg-steel-100" />
              </Link>
              <span className="min-w-0 flex-1 truncate text-xs text-muted">
                {[
                  u.manufacturer,
                  u.manufacturing_date ? `made ${formatDateInput(u.manufacturing_date)}` : null,
                  u.status === "at_job" ? `at ${jobName(u.job_id)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "No maker recorded"}
              </span>
              {/* canEdit means admin, and what things cost is admin-only. */}
              {canEdit && (
                <span className={`num text-sm ${u.unit_cost === null ? "text-muted" : "text-ink"}`}>
                  {u.unit_cost === null ? "No cost" : money(u.unit_cost)}
                </span>
              )}
              <UnitStatusBadge status={u.status} />
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="border-t border-line px-4 py-3">
            <Button variant="secondary" onClick={start}>
              Edit maker, manufacturing date and cost
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <div>
      <datalist id="known-makers">
        {makers.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-end gap-2 border-b border-line bg-steel-50 px-4 py-3">
        <div className="w-full max-w-xl flex-1">
          <label className="label" htmlFor="fill-maker">
            Maker for every unit
          </label>
          <input
            id="fill-maker"
            className="field"
            list="known-makers"
            value={fill.manufacturer}
            onChange={(e) => setFill({ ...fill, manufacturer: e.target.value })}
          />
        </div>
        <div className="w-36">
          <label className="label" htmlFor="fill-cost">
            Cost for every unit (₹)
          </label>
          <input
            id="fill-cost"
            className="field num"
            type="number"
            min={0}
            step="any"
            value={fill.unit_cost}
            onChange={(e) => setFill({ ...fill, unit_cost: e.target.value })}
          />
        </div>
        <div className="w-28">
          <label className="label" htmlFor="fill-year">
            Manufacturing date for every unit
          </label>
          <input
            id="fill-date"
            className="field num"
            type="text"
            inputMode="numeric"
            placeholder="dd-mm-yyyy"
            value={fill.date}
            onChange={(e) => setFill({ ...fill, date: e.target.value })}
          />
        </div>
        <Button
          variant="secondary"
          onClick={fillAll}
          disabled={!fill.manufacturer && !fill.unit_cost && !fill.date}
        >
          Fill every unit
        </Button>
      </div>

      <ul className="divide-y divide-line">
        {units.map((u) => {
          const r = rows[u.id];
          return (
            <li key={u.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[auto_minmax(12rem,28rem)_8rem_8rem] sm:items-center">
              <div className="flex items-center gap-2">
                <ItemId id={u.id} />
                <UnitStatusBadge status={u.status} />
              </div>
              <input
                aria-label={`Maker of ${u.id}`}
                className="field"
                list="known-makers"
                placeholder="Maker"
                value={r.manufacturer}
                onChange={(e) => setRow(u.id, { manufacturer: e.target.value })}
              />

              <input
                aria-label={`Manufacturing date of ${u.id}`}
                className={`field ${badDate(r.date) ? "border-danger-500" : ""}`}
                type="text"
                inputMode="numeric"
                placeholder="dd-mm-yyyy"
                value={r.date}
                onChange={(e) => setRow(u.id, { date: e.target.value })}
              />

              <input
                aria-label={`Cost of ${u.id}`}
                className="field num"
                type="number"
                min={0}
                step="any"
                placeholder="Cost ₹"
                value={r.unit_cost}
                onChange={(e) => setRow(u.id, { unit_cost: e.target.value })}
              />
            </li>
          );
        })}
      </ul>

      {err && (
        <p className="mx-4 mt-3 rounded border border-danger-500/25 bg-danger-50 p-2 text-xs text-danger-600">
          {err}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <Button onClick={() => void save()} disabled={busy || invalid}>
          {busy ? "Saving…" : "Save units"}
        </Button>
        <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
          Cancel
        </Button>
        {badCost && <span className="text-[11px] text-danger-600">A cost is not a valid amount.</span>}
        {badDates && (
          <span className="text-[11px] text-danger-600">
            A manufacturing date is not valid.
          </span>
        )}
      </div>
    </div>
  );
}
