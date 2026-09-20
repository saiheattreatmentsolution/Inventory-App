"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import { Empty, ItemId } from "@/components/ui";
import { UnitStatusBadge } from "@/components/UnitPicker";

const LIMIT = 15;

/**
 * Look up one physical unit by the ID on it. The point of per-unit IDs is being
 * able to stand in front of a burner and ask "which one is this, and where is
 * it meant to be?" — so this searches unit IDs first, but a product ID or name
 * works too, and lists that product's units.
 */
export function UnitFinder({ onClose }: { onClose: () => void }) {
  const { units, items, jobName } = useStore();
  const { isAdmin } = useAuth();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toUpperCase();

  const found = useMemo(() => {
    if (!q) return { rows: [], total: 0 };
    const rows = units.filter((u) => {
      if (u.id.toUpperCase().includes(q)) return true;
      const item = items.find((i) => i.id === u.item_id);
      return item ? item.name.toUpperCase().includes(q) : false;
    });
    return { rows: rows.slice(0, LIMIT), total: rows.length };
  }, [q, units, items]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-steel-900/40 p-4 pt-16 sm:pt-24"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Find a unit by ID"
        className="elevated-pop w-full max-w-lg overflow-hidden rounded-xl border border-line bg-card"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line p-3">
          <input
            autoFocus
            className="field num"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SAI-BRN-001-01"
            aria-label="Unit ID"
          />
          <p className="mt-1 text-[11px] text-muted">
            The ID marked on the equipment. A product ID or name also works.
          </p>
        </div>

        {q === "" ? (
          <Empty>Type a unit ID to see what it is and where it is.</Empty>
        ) : found.rows.length === 0 ? (
          <Empty>
            Nothing matches <span className="num">{query}</span>.
          </Empty>
        ) : (
          <>
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {found.rows.map((u) => {
                const item = items.find((i) => i.id === u.item_id);
                const facts = [
                  u.status === "at_job" ? `At ${jobName(u.job_id)}` : null,
                  u.manufacturer,
                  u.manufacturing_year ? `Made ${u.manufacturing_year}` : null,
                  isAdmin && u.unit_cost !== null ? money(u.unit_cost) : null,
                ].filter(Boolean);
                return (
                  <li key={u.id}>
                    <Link
                      href={`/units/${u.id}`}
                      onClick={onClose}
                      className="block px-4 py-2.5 hover:bg-steel-50"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <ItemId id={u.id} />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">
                          {item?.name ?? u.item_id}
                        </span>
                        <UnitStatusBadge status={u.status} />
                      </div>
                      {facts.length > 0 && (
                        <p className="mt-0.5 truncate text-[11px] text-muted">{facts.join(" · ")}</p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {found.total > LIMIT && (
              <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
                Showing {LIMIT} of {found.total} — type more of the ID to narrow it down.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
