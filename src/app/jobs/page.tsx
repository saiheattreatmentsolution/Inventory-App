"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore, JobInput } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import type { Job, Movement } from "@/lib/types";
import { dateOnly, dateTime, qty, signed, movementAmountLabel } from "@/lib/format";
import { Card, SectionTitle, PageHead, Spinner, Empty, Button, Chip, ItemId, TypeBadge } from "@/components/ui";

const BLANK_JOB: JobInput = { name: "", site: "", customer: "", notes: "" };

export default function JobsPage() {
  const { jobs, units, jobStock, items, movements, loading, configured, createJob, setJobStatus } = useStore();
  const { isAdmin } = useAuth();

  const [showClosed, setShowClosed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<JobInput>(BLANK_JOB);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unitOf = useMemo(() => new Map(items.map((i) => [i.id, i.unit])), [items]);

  // How much of our kit is sitting at each job right now.
  const outByJob = useMemo(() => {
    const map = new Map<string, { unitId: string; itemName: string }[]>();
    for (const u of units) {
      if (u.status !== "at_job" || !u.job_id) continue;
      const itemName = items.find((i) => i.id === u.item_id)?.name ?? u.item_id;
      const list = map.get(u.job_id) ?? [];
      list.push({ unitId: u.id, itemName });
      map.set(u.job_id, list);
    }
    return map;
  }, [units, items]);

  // Cable and coil sent to each job and not yet returned. Often it has simply
  // been used up on site, so this doesn't stop a job being closed.
  const bulkByJob = useMemo(() => {
    const map = new Map<string, { itemId: string; label: string }[]>();
    for (const s of jobStock) {
      const item = items.find((i) => i.id === s.item_id);
      const list = map.get(s.job_id) ?? [];
      list.push({ itemId: s.item_id, label: `${item?.name ?? s.item_id} · ${qty(s.quantity)} ${item?.unit ?? ""}` });
      map.set(s.job_id, list);
    }
    return map;
  }, [jobStock, items]);

  // The permanent record for a job: every movement that named it, dispatch and
  // return alike. This is what makes a job's page mean something once
  // everything has come home — the "currently out" list above is only ever a
  // snapshot, and it goes empty the moment the last unit returns.
  const historyByJob = useMemo(() => {
    const map = new Map<string, typeof movements>();
    for (const m of movements) {
      if (!m.job_id) continue;
      const list = map.get(m.job_id) ?? [];
      list.push(m);
      map.set(m.job_id, list);
    }
    return map;
  }, [movements]);

  const visible = jobs.filter((j) => (showClosed ? true : j.status === "active"));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await createJob(form);
      setForm(BLANK_JOB);
      setAdding(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add the job");
    } finally {
      setBusy(false);
    }
  };

  if (!configured) return null;
  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHead
        title="Jobs"
        subtitle="Sites your equipment goes out to"
        action={
          isAdmin && (
            <Button onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "Add job"}</Button>
          )
        }
      />

      {adding && isAdmin && (
        <Card>
          <SectionTitle>New job</SectionTitle>
          <form onSubmit={submit}>
            <JobFields idPrefix="new" form={form} onChange={setForm} />
            {err && (
              <p className="mx-4 mb-3 rounded border border-danger-500/25 bg-danger-50 p-2 text-xs text-danger-600">
                {err}
              </p>
            )}
            <div className="border-t border-line px-4 py-3">
              <Button type="submit" disabled={busy || !form.name.trim()}>
                {busy ? "Saving…" : "Save job"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="flex gap-1.5">
        <Chip active={!showClosed} onClick={() => setShowClosed(false)}>
          Active
        </Chip>
        <Chip active={showClosed} onClick={() => setShowClosed(true)}>
          All jobs
        </Chip>
      </div>

      {visible.length === 0 ? (
        <Card>
          <Empty>
            No jobs yet.
            {isAdmin && " Add one, then you can dispatch equipment to it."}
          </Empty>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((job) => {
            const out = outByJob.get(job.id) ?? [];
            const bulkOut = bulkByJob.get(job.id) ?? [];
            const history = historyByJob.get(job.id) ?? [];
            const editing = editingId === job.id;
            return (
              <Card key={job.id}>
                <SectionTitle
                  action={
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
                          job.status === "active"
                            ? "border-ok-500/25 bg-ok-50 text-ok-600"
                            : "border-line bg-steel-50 text-muted"
                        }`}
                      >
                        {job.status === "active" ? "Active" : "Closed"}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => setEditingId(editing ? null : job.id)}
                          className="text-xs font-semibold text-steel-600 hover:underline"
                        >
                          {editing ? "Cancel" : "Edit"}
                        </button>
                      )}
                      {isAdmin && !editing && (
                        <button
                          onClick={() => void setJobStatus(job.id, job.status === "active" ? "closed" : "active")}
                          disabled={job.status === "active" && out.length > 0}
                          title={
                            job.status === "active" && out.length > 0
                              ? "Equipment is still out at this job"
                              : undefined
                          }
                          className="text-xs font-semibold text-steel-600 hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
                        >
                          {job.status === "active" ? "Close job" : "Reopen"}
                        </button>
                      )}
                    </div>
                  }
                >
                  {job.name}
                </SectionTitle>

                {editing ? (
                  <JobEditor
                    job={job}
                    // The database has the final say (it sees history the page may not
                    // have loaded); this just explains up front why delete is off.
                    inUse={
                      out.length > 0
                        ? "Equipment is still out at this job — return it first."
                        : bulkOut.length > 0
                          ? "Cable or coil sent here hasn't all come back, so it can't be deleted. Close it instead."
                        : history.length > 0
                          ? "This job has stock history, so it can't be deleted. Close it instead."
                          : null
                    }
                    onDone={() => setEditingId(null)}
                  />
                ) : (
                <div className="px-4 py-3">
                  <p className="text-xs text-muted">
                    {[job.site, job.customer].filter(Boolean).join(" · ") || "No site or customer set"} · opened{" "}
                    {dateOnly(job.created_at)}
                  </p>

                  {job.notes && (
                    <p className="mt-2 rounded border border-line bg-steel-50 px-2.5 py-1.5 text-xs text-ink">
                      {job.notes}
                    </p>
                  )}

                  {out.length === 0 && bulkOut.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">Nothing of ours is out there right now.</p>
                  ) : (
                    <>
                      {out.length > 0 && (
                        <>
                          <p className="mt-3 text-xs font-semibold text-ink">
                            {out.length} {out.length === 1 ? "unit" : "units"} currently at this job
                          </p>
                          <ul className="mt-1.5 divide-y divide-line rounded-md border border-line">
                            {out.map((u) => (
                              <li key={u.unitId} className="flex items-center gap-3 px-3 py-2">
                                <ItemId id={u.unitId} />
                                <span className="min-w-0 flex-1 truncate text-sm text-ink">{u.itemName}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {bulkOut.length > 0 && (
                        <>
                          <p className="mt-3 text-xs font-semibold text-ink">Cable and coil sent here, not returned</p>
                          <ul className="mt-1.5 divide-y divide-line rounded-md border border-line">
                            {bulkOut.map((b) => (
                              <li key={b.itemId} className="flex items-center gap-3 px-3 py-2">
                                <ItemId id={b.itemId} />
                                <span className="num min-w-0 flex-1 truncate text-sm text-ink">{b.label}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {isAdmin && (
                        <p className="mt-2 text-[11px] text-muted">
                          To bring these back, use{" "}
                          <Link href="/update" className="font-semibold text-steel-600 hover:underline">
                            Update stock
                          </Link>{" "}
                          → Receive → Return from job.
                        </p>
                      )}
                    </>
                  )}
                </div>
                )}

                <JobLedger job={job} entries={history} unitOf={unitOf} />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The four fields a job has — shared by Add job and Edit, so they cannot drift. */
function JobFields({
  idPrefix,
  form,
  onChange,
}: {
  idPrefix: string;
  form: JobInput;
  onChange: (next: JobInput) => void;
}) {
  // maxLength mirrors the length checks on public.jobs.
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-3">
      <div>
        <label className="label" htmlFor={`${idPrefix}-name`}>
          Job name
        </label>
        <input
          id={`${idPrefix}-name`}
          className="field"
          required
          autoFocus
          maxLength={120}
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="Thane — Tata"
        />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-site`}>
          Site / location (optional)
        </label>
        <input
          id={`${idPrefix}-site`}
          className="field"
          maxLength={120}
          value={form.site}
          onChange={(e) => onChange({ ...form, site: e.target.value })}
          placeholder="Thane"
        />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-customer`}>
          Customer (optional)
        </label>
        <input
          id={`${idPrefix}-customer`}
          className="field"
          maxLength={120}
          value={form.customer}
          onChange={(e) => onChange({ ...form, customer: e.target.value })}
          placeholder="Tata Projects"
        />
      </div>
      <div className="sm:col-span-3">
        <label className="label" htmlFor={`${idPrefix}-notes`}>
          Notes (optional)
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          className="field"
          rows={2}
          maxLength={2000}
          value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
          placeholder="Site contact, gate pass, anything the team should know"
        />
      </div>
    </div>
  );
}

function JobEditor({ job, inUse, onDone }: { job: Job; inUse: string | null; onDone: () => void }) {
  const { updateJob, deleteJob } = useStore();
  const [form, setForm] = useState<JobInput>({
    name: job.name,
    site: job.site ?? "",
    customer: job.customer ?? "",
    notes: job.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await updateJob(job.id, form);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the job");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete the job "${job.name}"? This cannot be undone.`)) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteJob(job.id);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete the job");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save}>
      <JobFields idPrefix={`job-${job.id}`} form={form} onChange={setForm} />
      {err && (
        <p className="mx-4 mb-3 rounded border border-danger-500/25 bg-danger-50 p-2 text-xs text-danger-600">
          {err}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <Button type="submit" disabled={busy || !form.name.trim()}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          className="ml-auto"
          onClick={() => void remove()}
          disabled={busy || inUse !== null}
        >
          Delete job
        </Button>
        {inUse && <p className="w-full text-right text-[11px] text-muted">{inUse}</p>}
      </div>
    </form>
  );
}

function JobLedger({
  job,
  entries,
  unitOf,
}: {
  job: { id: string; name: string };
  entries: Movement[];
  unitOf: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const shown = open ? sorted : sorted.slice(0, 3);

  return (
    <div className="border-t border-line px-4 py-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xs font-semibold text-ink">
          History at this job · {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
        <span className="text-[11px] font-semibold text-steel-600">{open ? "Collapse" : "Show all"}</span>
      </button>
      <ul className="mt-2 divide-y divide-line">
        {shown.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-xs">
            <TypeBadge type={m.type} />
            <span className="min-w-0 flex-1 truncate text-ink">{m.item_name}</span>
            {(() => {
              const label = movementAmountLabel(m, unitOf.get(m.item_id) ?? "");
              return label && <span className="num text-[11px] text-muted">{label}</span>;
            })()}
            <span
              className={`num font-semibold ${
                m.quantity > 0 ? "text-ok-600" : m.quantity < 0 ? "text-alert-600" : "text-muted"
              }`}
            >
              {signed(m.quantity)}
            </span>
            <span className="text-[11px] text-muted">{dateTime(m.created_at)}</span>
          </li>
        ))}
      </ul>
      <Link
        href={`/history?job=${job.id}`}
        className="mt-2 inline-block text-[11px] font-semibold text-steel-600 hover:underline"
      >
        Full history for {job.name} →
      </Link>
    </div>
  );
}
