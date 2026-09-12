"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { ITEM_COLUMNS, UNIT_COLUMNS, costMap } from "@/lib/store";
import { downloadFile } from "@/lib/format";
import { Button } from "@/components/ui";

/**
 * A complete, restorable snapshot — every table, not just the visible page of a
 * list. The CSV exports elsewhere are for reading in Excel; this one exists so
 * the data can be put back if the Supabase project is ever lost. The free plan
 * does not give you point-in-time recovery, so this is the safety net.
 */
export function BackupButton({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      // Paged, so a growing ledger can't be silently truncated the way a
      // single capped select would be.
      const fetchAll = async (table: string, columns = "*") => {
        const size = 1000;
        const rows: Record<string, unknown>[] = [];
        for (let from = 0; ; from += size) {
          const { data, error } = await supabase
            .from(table)
            .select(columns)
            .range(from, from + size - 1);
          if (error) throw new Error(`${table}: ${error.message}`);
          // A runtime column list defeats supabase-js row typing, hence the cast.
          rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
          if (!data || data.length < size) break;
        }
        return rows;
      };

      // Categories come first when restoring: every item points at one.
      const [categories, itemRows, unitRows, movements, jobs, jobStock, profiles, itemCosts, unitCosts] =
        await Promise.all([
          fetchAll("categories"),
          fetchAll("items", ITEM_COLUMNS),
          fetchAll("units", UNIT_COLUMNS),
          fetchAll("movements"),
          fetchAll("jobs"),
          fetchAll("job_stock"),
          fetchAll("profiles"),
          supabase.rpc("item_costs"),
          supabase.rpc("unit_costs"),
        ]);
      if (itemCosts.error) throw new Error(itemCosts.error.message);
      if (unitCosts.error) throw new Error(unitCosts.error.message);

      // Costs come back separately because the database only hands them to an
      // admin. Put them back on the rows so the file is a complete copy.
      const byItem = costMap(itemCosts.data);
      const byUnit = costMap(unitCosts.data);
      const items = itemRows.map((i) => ({ ...i, unit_cost: byItem.get(i.id as string) ?? null }));
      const units = unitRows.map((u) => ({ ...u, unit_cost: byUnit.get(u.id as string) ?? null }));

      const backup = {
        app: "sai-group-inventory",
        format: 3,
        taken_at: new Date().toISOString(),
        counts: {
          categories: categories.length,
          items: items.length,
          units: units.length,
          movements: movements.length,
          jobs: jobs.length,
          job_stock: jobStock.length,
          profiles: profiles.length,
        },
        // No passwords here — those live in auth.users, which Supabase manages
        // and which this key deliberately cannot read.
        data: { categories, items, units, movements, jobs, job_stock: jobStock, profiles },
      };

      downloadFile(
        `sai-inventory-backup-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(backup, null, 2),
        "application/json",
      );
      setLastRun(
        `${items.length} products · ${units.length} units · ${movements.length} movements · ${jobs.length} jobs`,
      );
      onSuccess?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Button variant="secondary" onClick={() => void run()} disabled={busy}>
        {busy ? "Collecting…" : "Download full backup"}
      </Button>
      {lastRun && <p className="mt-2 text-[11px] text-ok-600">Saved — {lastRun}</p>}
      {err && <p className="mt-2 text-[11px] text-danger-600">{err}</p>}
    </div>
  );
}
