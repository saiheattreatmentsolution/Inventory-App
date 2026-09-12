"use client";

import { Unit, UNIT_STATUS_LABEL, UnitStatus } from "@/lib/types";
import { ItemId } from "@/components/ui";

const STATUS_STYLE: Record<UnitStatus, string> = {
  in_store: "bg-ok-50 text-ok-600 border-ok-500/25",
  at_job: "bg-alert-50 text-alert-600 border-alert-500/30",
  damaged: "bg-danger-50 text-danger-600 border-danger-500/25",
  missing: "bg-warn-50 text-warn-600 border-warn-500/35",
  scrapped: "bg-steel-50 text-muted border-line-strong",
};

export function UnitStatusBadge({ status }: { status: UnitStatus }) {
  return (
    <span
      className={`inline-block shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status]}`}
    >
      {UNIT_STATUS_LABEL[status]}
    </span>
  );
}

/** Tick the specific physical units a movement applies to. */
export function UnitPicker({
  units,
  selected,
  onChange,
  jobLabel,
  emptyMessage,
}: {
  units: Unit[];
  selected: string[];
  onChange: (ids: string[]) => void;
  jobLabel?: (jobId: string | null) => string;
  emptyMessage: string;
}) {
  if (units.length === 0) {
    return (
      <p className="rounded-md border border-line bg-steel-50 px-3 py-4 text-center text-sm text-muted">
        {emptyMessage}
      </p>
    );
  }

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  const allSelected = selected.length === units.length;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] text-muted">
          {selected.length} of {units.length} selected
        </span>
        <button
          type="button"
          onClick={() => onChange(allSelected ? [] : units.map((u) => u.id))}
          className="text-[11px] font-semibold text-steel-600 hover:underline"
        >
          {allSelected ? "Clear all" : "Select all"}
        </button>
      </div>

      <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-md border border-line">
        {units.map((u) => {
          const on = selected.includes(u.id);
          return (
            <li key={u.id}>
              <label
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${
                  on ? "bg-steel-50" : "hover:bg-steel-50/60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(u.id)}
                  className="h-4 w-4 shrink-0 accent-[var(--color-steel-600)]"
                />
                <ItemId id={u.id} />
                <span className="min-w-0 flex-1 truncate text-xs text-muted">
                  {[u.manufacturer, u.status === "at_job" && jobLabel ? `at ${jobLabel(u.job_id)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <UnitStatusBadge status={u.status} />
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
