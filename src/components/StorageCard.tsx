"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { dateOnly, megabytes } from "@/lib/format";
import { Card, SectionTitle, Button, Chip } from "@/components/ui";
import { BackupButton } from "@/components/BackupButton";

// The Supabase free plan caps the whole database at 500 MB. The ledger is the
// only table that grows without bound, so this is what eventually fills it.
const FREE_TIER_BYTES = 500 * 1024 * 1024;
const WARN_AT = 0.75;
const URGENT_AT = 0.9;

// Quick cutoffs, plus a free choice of date for anything in between.
const PRESETS: { label: string; days: number }[] = [
  { label: "1 month", days: 30 },
  { label: "3 months", days: 90 },
  { label: "6 months", days: 180 },
  { label: "1 year", days: 365 },
];

/** Local yyyy-mm-dd for N days ago, for the date input's value/max. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Midnight at the start of that day, in local (India) time rather than UTC. */
function startOfLocalDay(ymd: string): Date {
  return new Date(`${ymd}T00:00:00`);
}

/** What a clear would remove, for the cutoff it was worked out for. */
type Preview = {
  key: string;
  count: number;
  from: string | null;
  to: string | null;
  error: string | null;
};

export function StorageCard() {
  const { refresh } = useStore();
  const [bytes, setBytes] = useState<number | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  const [preset, setPreset] = useState<number | "custom">(30);
  const [customDate, setCustomDate] = useState(daysAgo(30));
  const [preview, setPreview] = useState<Preview | null>(null);
  // Bumped after a clear, so the range is worked out again from what is left.
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const before = preset === "custom" ? customDate : daysAgo(preset);
  const previewKey = `${before}#${version}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("database_size_bytes");
      if (cancelled) return;
      if (error) setLoadErr(error.message);
      else setBytes(data as number);
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  // Asked of the database rather than worked out from the page's data: the app
  // only loads the newest movements, and the old ones are the whole point here.
  useEffect(() => {
    if (!before) return;
    let cancelled = false;
    const cutoff = startOfLocalDay(before).toISOString();
    void (async () => {
      const older = () => supabase.from("movements").select("created_at").lt("created_at", cutoff);
      const [countRes, oldestRes, newestRes] = await Promise.all([
        supabase.from("movements").select("id", { count: "exact", head: true }).lt("created_at", cutoff),
        older().order("created_at", { ascending: true }).limit(1),
        older().order("created_at", { ascending: false }).limit(1),
      ]);
      if (cancelled) return;
      const failed = countRes.error ?? oldestRes.error ?? newestRes.error;
      setPreview({
        key: `${before}#${version}`,
        count: countRes.count ?? 0,
        from: oldestRes.data?.[0]?.created_at ?? null,
        to: newestRes.data?.[0]?.created_at ?? null,
        error: failed ? failed.message : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [before, version]);

  const ratio = bytes === null ? 0 : bytes / FREE_TIER_BYTES;
  const near = ratio >= WARN_AT;
  const barColor = ratio >= URGENT_AT ? "bg-danger-500" : ratio >= WARN_AT ? "bg-warn-500" : "bg-ok-500";
  const cutoffLabel = before ? dateOnly(startOfLocalDay(before).toISOString()) : "";

  const current = preview?.key === previewKey ? preview : null;
  const rangeLabel =
    current?.from && current.to ? `${dateOnly(current.from)} to ${dateOnly(current.to)}` : "";
  const nothingToClear = current !== null && !current.error && current.count === 0;

  const clear = async () => {
    if (!current) return;
    if (
      !confirm(
        `Delete ${current.count} movement ${current.count === 1 ? "entry" : "entries"} recorded from ${rangeLabel}? Current stock levels are not affected.`,
      )
    )
      return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc("purge_movements", {
        p_before: startOfLocalDay(before).toISOString(),
      });
      if (error) throw new Error(error.message);
      setResult(`Deleted ${data as number} movement entries recorded from ${rangeLabel}.`);
      setBackedUp(false);
      setVersion((v) => v + 1);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not clear history");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionTitle
        action={
          bytes !== null && (
            <span className={`text-xs font-semibold ${near ? "text-warn-600" : "text-muted"}`}>
              {megabytes(bytes)} MB of 500 MB used
            </span>
          )
        }
      >
        Storage
      </SectionTitle>

      <div className="space-y-3 p-4">
        {loadErr && <p className="text-xs text-danger-600">{loadErr}</p>}

        {bytes !== null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-steel-100">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
            />
          </div>
        )}

        {near && (
          <p className="rounded border border-warn-500/35 bg-warn-50 px-2 py-1.5 text-xs text-warn-600">
            Getting close to the free plan&apos;s limit. Download a backup, then clear out old history below —
            current stock levels are stored on each product, not calculated from the log, so this never changes
            a balance or a unit count. It only removes old entries from the History page.
          </p>
        )}

        <p className="text-xs text-muted">
          The movement log (History) is the only thing that grows without bound. Once you have a backup, you can
          clear entries older than a date of your choosing — recent history (last 30 days) is always kept, so this
          can&apos;t remove anything you might still need to check today.
        </p>

        <BackupButton onSuccess={() => setBackedUp(true)} />

        <div className="border-t border-line pt-3">
          <span className="label">Clear movements older than</span>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Chip key={p.days} active={preset === p.days} onClick={() => setPreset(p.days)}>
                {p.label}
              </Chip>
            ))}
            <Chip active={preset === "custom"} onClick={() => setPreset("custom")}>
              Custom date
            </Chip>
          </div>

          {preset === "custom" && (
            <input
              type="date"
              className="field mt-2 w-40"
              value={customDate}
              max={daysAgo(30)}
              onChange={(e) => setCustomDate(e.target.value)}
            />
          )}

          {before && (
            <div className="mt-2.5 rounded-md border border-line bg-steel-50 px-3 py-2 text-xs">
              {!current ? (
                <span className="text-muted">Checking what would be deleted…</span>
              ) : current.error ? (
                <span className="text-danger-600">{current.error}</span>
              ) : nothingToClear ? (
                <span className="text-muted">
                  Nothing was recorded before {cutoffLabel}, so there is nothing to delete.
                </span>
              ) : (
                <span className="text-ink">
                  <span className="num font-semibold">{current.count}</span>{" "}
                  {current.count === 1 ? "entry" : "entries"} will be deleted, recorded from{" "}
                  <span className="font-semibold">{current.from && dateOnly(current.from)}</span> to{" "}
                  <span className="font-semibold">{current.to && dateOnly(current.to)}</span>. Everything from{" "}
                  {cutoffLabel} onwards stays.
                </span>
              )}
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button
              variant="danger"
              onClick={() => void clear()}
              disabled={busy || !backedUp || !current || current.error !== null || nothingToClear}
            >
              {busy ? "Clearing…" : "Clear old history"}
            </Button>
            {!backedUp && <span className="text-[11px] text-muted">Download a backup first</span>}
          </div>
        </div>

        {result && <p className="text-[11px] text-ok-600">{result}</p>}
        {err && <p className="text-[11px] text-danger-600">{err}</p>}
      </div>
    </Card>
  );
}
