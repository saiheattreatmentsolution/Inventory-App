"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { statusOf, MovementType, Item, UNIT_STATUS_LABEL } from "@/lib/types";
import { CONDITION_RULES, reasonsFor } from "@/lib/categories";
import { filterItems, EMPTY_ITEM_FILTERS } from "@/lib/filters";
import { qty, relative } from "@/lib/format";
import { Card, SectionTitle, StatusBadge, ItemId, Spinner, Empty, PageHead, Button, Chip } from "@/components/ui";
import { SearchInput } from "@/components/SearchInput";
import { AdminOnly } from "@/components/AdminOnly";
import { UnitPicker } from "@/components/UnitPicker";

const MODES: { type: MovementType; label: string; hint: string }[] = [
  { type: "in", label: "Receive", hint: "Stock in — adds to the balance" },
  { type: "out", label: "Dispatch", hint: "Stock out — subtracts from the balance" },
  {
    type: "adjust",
    label: "Adjust",
    hint: "Set the balance to what is really there — after a count, or to fix an earlier entry",
  },
  {
    type: "condition",
    label: "Damage / loss",
    hint: "Something was damaged, lost, scrapped or used up — or has been repaired or found",
  },
];

const CONDITION_HINT: Record<string, string> = {
  Damaged:
    "Broken but repairable. It stops counting as stock until it is marked Repaired. A unit out at a job has to be returned first.",
  Missing: "Cannot be found. A unit lost at a job site can be marked missing too, and the job is recorded.",
  Scrapped: "Gone for good. It leaves the stock and the stock value permanently.",
  Repaired: "A damaged unit has been fixed and is back in the store.",
  Found: "A missing unit has turned up and is back in the store.",
};

const PICK_LABEL: Record<string, string> = {
  Damaged: "Which units are damaged?",
  Missing: "Which units are missing?",
  Scrapped: "Which units are being scrapped?",
  Repaired: "Which units have been repaired?",
  Found: "Which units have been found?",
};

export default function UpdateStockPage() {
  return (
    <AdminOnly>
      <Suspense fallback={<Spinner />}>
        <UpdateStockView />
      </Suspense>
    </AdminOnly>
  );
}

function UpdateStockView() {
  const router = useRouter();
  const params = useSearchParams();
  const { items, movements, jobs, jobStock, units: allUnits, unitsOf, jobName, loading, configured, applyMovement } =
    useStore();

  const [selectedId, setSelectedId] = useState<string | null>(params.get("item"));
  const [search, setSearch] = useState("");
  const [type, setType] = useState<MovementType>("in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("Purchase Restock");
  const [note, setNote] = useState("");
  const [supplierInvoice, setSupplierInvoice] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [maker, setMaker] = useState("");
  const [year, setYear] = useState("");
  const [jobId, setJobId] = useState("");
  // null means "not touched yet", so the tick list falls back to whatever the
  // shelf is believed to hold right now — recomputed after every save, rather
  // than frozen at the moment the form was opened.
  const [pickedUnits, setPickedUnits] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ item: Item; delta: number } | null>(null);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const serialized = selected?.tracking === "serialized";
  const units = useMemo(() => (selected ? unitsOf(selected.id) : []), [selected, unitsOf]);
  const activeJobs = jobs.filter((j) => j.status === "active");

  // A count usually confirms what we already believe, so it starts with the
  // whole shelf ticked and you untick whatever is not there.
  const shelfDefault = useMemo(
    () =>
      type === "adjust" && serialized
        ? units.filter((u) => u.status === "in_store").map((u) => u.id)
        : [],
    [type, serialized, units],
  );
  const picked = pickedUnits ?? shelfDefault;

  const resetMovement = () => {
    setPickedUnits(null);
    setAmount("");
    setJobId("");
    setSupplierInvoice("");
    setNote("");
    setUnitCost("");
    setMaker("");
    setYear("");
    setErr(null);
  };

  const startMovement = (next: MovementType, item: Item | null) => {
    setType(next);
    setReason(item ? reasonsFor(next, item.tracking)[0] : "");
    setAmount("");
    setJobId("");
    setSupplierInvoice("");
    setUnitCost("");
    setMaker("");
    setYear("");
    setNote("");
    setErr(null);
    setPickedUnits(null);
  };

  const reasonOptions = selected ? reasonsFor(type, selected.tracking) : [];

  const matches = useMemo(
    () => filterItems(items, { ...EMPTY_ITEM_FILTERS, query: search }).slice(0, 30),
    [items, search],
  );

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: Item[] = [];
    for (const m of movements) {
      if (seen.has(m.item_id)) continue;
      seen.add(m.item_id);
      const item = items.find((i) => i.id === m.item_id);
      if (item) out.push(item);
      if (out.length === 6) break;
    }
    return out;
  }, [movements, items]);

  // Which units the picker offers depends on what we're doing.
  const pickable = useMemo(() => {
    if (!serialized) return [];
    if (type === "out") return units.filter((u) => u.status === "in_store");
    if (type === "in") return units.filter((u) => u.status === "at_job");
    if (type === "condition") {
      const rule = CONDITION_RULES[reason];
      return rule ? units.filter((u) => rule.from.includes(u.status)) : [];
    }
    // A count is about the shelf. Units at a job come home through Return from
    // job, and damaged ones through Damage / loss → Repaired.
    return units.filter((u) => u.status === "in_store" || u.status === "missing");
  }, [serialized, type, units, reason]);

  const entered = Number(amount);
  const validAmount = amount !== "" && !Number.isNaN(entered) && entered >= 0;
  // Bought or built mints new units; returned brings existing ones home. One
  // choice drives the form, rather than a mode and a reason saying it twice.
  const mintingNew = Boolean(serialized) && type === "in" && reason !== "Return from Job";
  // Everything that leaves the store goes to a job. A returned unit already
  // knows which job it is at; returned cable/coil has to be told.
  const bulkReturn = !serialized && type === "in" && reason === "Return from Job";
  // Cable can also be written off where it stands — burnt or lost at the site it
  // went to. Equipment already allows that: a unit at a job can be marked
  // missing without coming home first. This is the same thing for cable, and
  // without it a loss at site would come off the shelf a second time.
  const bulkLoss = !serialized && type === "condition";
  const lostAtJob = bulkLoss && jobId !== "";
  // Cable that was installed or used up at a job is not a loss, but it closes
  // out that job's balance the same way — and unlike a loss, it can only ever
  // have happened at a job, so the job is required rather than optional.
  const usedAtJob = bulkLoss && reason === "Used at Job";
  const needsJob = (type === "out" && reason === "Issued to Job") || bulkReturn || usedAtJob;
  const showJob = needsJob || bulkLoss;
  // How much of this cable/coil is out at each job — a return can't exceed it.
  const outAtJobs = useMemo(
    () => (selected ? jobStock.filter((s) => s.item_id === selected.id) : []),
    [jobStock, selected],
  );
  const outAt = (id: string) => outAtJobs.find((s) => s.job_id === id)?.quantity ?? 0;
  // Coming back from, or lost at, a job lists only the jobs that actually have
  // some — closed ones too, since cable can come home after a job is closed.
  const jobChoices = bulkReturn || bulkLoss ? jobs.filter((j) => outAt(j.id) > 0) : activeJobs;
  // Either way, you cannot account for more than that job still has out.
  const atJobCap = (bulkReturn || lostAtJob) && jobId ? outAt(jobId) : null;
  const isPurchase = type === "in" && reason === "Purchase Restock";
  const builtInHouse = type === "in" && reason === "Built in-house";
  // Both bring new stock in at a cost; only a purchase has supplier paperwork.
  const costed = isPurchase || builtInHouse;
  // Every entry can carry a note. An Adjust most of all: it moves the balance to
  // a number somebody typed, and the ledger should be able to say why.
  const noteLabel = type === "condition" ? "What happened? (optional)" : "Notes (optional)";
  const notePlaceholder =
    type === "condition"
      ? "Nozzle cracked on site"
      : builtInHouse
          ? "Built for the Vizag spread"
          : type === "adjust"
            ? "Recount after the shelf was reorganised"
            : "What this is for";
  const costValue = unitCost === "" ? null : Number(unitCost);
  const costInvalid = costValue !== null && (Number.isNaN(costValue) || costValue < 0);
  // Matches the check constraint on units.manufacturing_year.
  const yearValue = year === "" ? null : Number(year);
  const yearInvalid = yearValue !== null && !(yearValue >= 1950 && yearValue <= 2100);

  const makers = useMemo(
    () =>
      Array.from(
        new Set(allUnits.map((u) => u.manufacturer?.trim()).filter((m): m is string => !!m)),
      ).sort(),
    [allUnits],
  );

  const projected = useMemo(() => {
    if (!selected) return null;
    if (!serialized) {
      if (!validAmount) return null;
      // Written off at a job, it left the shelf when it was issued, so the
      // store balance does not move a second time.
      if (lostAtJob) return selected.quantity;
      return type === "in"
        ? selected.quantity + entered
        : type === "adjust"
          ? entered
          : selected.quantity - entered;
    }
    if (type === "adjust") return picked.length;
    if (type === "condition") {
      const affected = units.filter((u) => picked.includes(u.id));
      return CONDITION_RULES[reason]?.to === "in_store"
        ? selected.quantity + affected.length
        : selected.quantity - affected.filter((u) => u.status === "in_store").length;
    }
    if (mintingNew) return validAmount ? selected.quantity + entered : null;
    if (type === "in") return selected.quantity + picked.length;
    return selected.quantity - picked.length;
  }, [selected, serialized, validAmount, type, entered, mintingNew, picked, units, reason, lostAtJob]);

  const wouldGoNegative = projected !== null && projected < 0;

  const blocker = (() => {
    if (!selected) return "Pick an item";
    if (costInvalid) return "The cost is not a valid amount";
    if (yearInvalid) return "The year of manufacture is not valid";
    if (needsJob && !jobId) return "Choose the job";
    if (serialized) {
      if (mintingNew && (!validAmount || entered <= 0)) return "Enter how many units you received";
      if (!mintingNew && type !== "adjust" && picked.length === 0)
        return type === "out"
          ? "Choose which units are going out"
          : type === "in"
            ? "Choose which units are coming back"
            : "Choose which units this applies to";
    } else {
      // A count can legitimately come to zero; receiving or sending nothing cannot.
      if (!validAmount || (type !== "adjust" && entered <= 0)) return "Enter a quantity";
      if (atJobCap !== null && entered > atJobCap)
        return `Only ${qty(atJobCap)} ${selected.unit} is out at that job`;
      if (wouldGoNegative) return "Not enough stock";
    }
    return null;
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || blocker) return;
    setBusy(true);
    setErr(null);
    try {
      const before = selected.quantity;
      const updated = await applyMovement({
        item_id: selected.id,
        type,
        quantity: serialized && !mintingNew ? 0 : entered,
        reason,
        note,
        supplier_invoice: isPurchase ? supplierInvoice : "",
        job_id: showJob ? jobId || null : null,
        unit_ids: serialized && !mintingNew ? picked : [],
        unit_cost: costed ? costValue : null,
        manufacturer: mintingNew ? maker : "",
        manufacturing_year: mintingNew ? yearValue : null,
      });
      setDone({ item: updated, delta: updated.quantity - before });
      resetMovement();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the movement");
    } finally {
      setBusy(false);
    }
  };

  const choose = (id: string | null) => {
    setSelectedId(id);
    setDone(null);
    setSearch("");
    startMovement(type, items.find((i) => i.id === id) ?? null);
    router.replace(id ? `/update?item=${id}` : "/update", { scroll: false });
  };

  if (!configured) return null;
  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHead title="Update stock" subtitle="Receive, dispatch or correct a balance" />

      {done && (
        <div className="rounded-lg border border-ok-500/30 bg-ok-50 p-3 text-sm">
          <p className="font-semibold text-ok-600">Saved</p>
          <p className="mt-0.5 text-ink">
            {done.item.name} is now{" "}
            <span className="num font-semibold">
              {qty(done.item.quantity)} {done.item.unit}
            </span>{" "}
            in store{" "}
            <span className="num text-muted">
              ({done.delta > 0 ? "+" : ""}
              {qty(done.delta)})
            </span>
            .{" "}
            <Link href={`/inventory/${done.item.id}`} className="font-semibold text-steel-600 underline">
              View item
            </Link>
          </p>
        </div>
      )}

      {/* Step 1 — pick the item */}
      <Card>
        <SectionTitle
          action={
            selected && (
              <button onClick={() => choose(null)} className="text-xs font-semibold text-steel-600 hover:underline">
                Back
              </button>
            )
          }
        >
        1 · Item
        </SectionTitle>

        {selected ? (
          <div className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{selected.name}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2">
                <ItemId id={selected.id} />
                <span className="text-xs text-muted">{selected.category}</span>
                <span className="text-[11px] text-muted">
                  {serialized ? "tracked unit by unit" : `tracked by ${selected.unit}`}
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="num text-xl font-semibold text-ink">{qty(selected.quantity)}</p>
              <p className="text-[11px] text-muted">{selected.unit} in store</p>
            </div>
            <StatusBadge status={statusOf(selected)} />
          </div>
        ) : null}
      </Card>

      {!selected && (
        <>
          <Card className="p-4">
            <SearchInput
              autoFocus
              value={search}
              onChange={setSearch}
              placeholder="Search by ID, name or category…"
            />
            {!search && recent.length > 0 && (
              <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Recently updated
              </p>
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
                {recent.map((i) => (
                  <Chip key={i.id} onClick={() => choose(i.id)}>
                    {i.name}
                  </Chip>
                ))}
              </div>
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>
              {matches.length} item{matches.length === 1 ? "" : "s"} available
            </SectionTitle>
            <ul className="divide-y divide-line overflow-y-auto">
              {matches.length === 0 ? (
                <li>
                  <Empty>
                    No items match “{search}”.{" "}
                    <Link href="/add" className="font-semibold text-steel-600 hover:underline">
                      Add an item
                    </Link>
                  </Empty>
                </li>
              ) : (
                matches.map((i) => (
                  <li key={i.id}>
                    <button
                      onClick={() => choose(i.id)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-steel-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{i.name}</p>
                        <p className="mt-0.5 flex items-center gap-2">
                          <ItemId id={i.id} />
                          <span className="truncate text-[11px] text-muted">{i.category}</span>
                        </p>
                      </div>
                      <span className="num shrink-0 text-sm font-semibold text-ink">
                        {qty(i.quantity)} <span className="text-[11px] font-normal text-muted">{i.unit}</span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </>
      )}

      {/* Step 2 — the movement */}
      {selected && (
        <form onSubmit={submit}>
          <Card>
            <SectionTitle>2 · Movement</SectionTitle>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {MODES.map((m) => (
                  <button
                    key={m.type}
                    type="button"
                    onClick={() => startMovement(m.type, selected)}
                    className={`rounded-md border px-3 py-2.5 text-sm font-semibold transition-colors ${
                      type === m.type
                        ? "border-steel-600 bg-steel-600 text-on-primary"
                        : "border-line-strong bg-card text-muted hover:border-steel-400"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="-mt-2 text-[11px] text-muted">{MODES.find((m) => m.type === type)!.hint}</p>

              {/* Damage / loss: what happened decides which units can be picked */}
              {type === "condition" && (
                <div>
                  <span className="label">What happened?</span>
                  <div className="flex flex-wrap gap-1.5">
                    {reasonOptions.map((r) => (
                      <Chip
                        key={r}
                        type="button"
                        active={reason === r}
                        onClick={() => {
                          setReason(r);
                          setPickedUnits(null);
                        }}
                      >
                        {r}
                      </Chip>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    {serialized
                      ? CONDITION_HINT[reason]
                      : reason === "Used at Job"
                        ? "For cable or coil that was installed or otherwise used up — the normal end for it, not a loss. Closes out what the job still has out."
                        : "Cable and coil are tracked by amount, so this writes off a quantity — from the store, or from what a job still has out. If it turns up again, receive it back in."}
                  </p>
                </div>
              )}

              {/* The reason is the whole choice: it decides whether this mints
                  new units or brings existing ones home. Hidden when a movement
                  has only one possible reason, e.g. dispatching to a job. */}
              {type !== "condition" && reasonOptions.length > 1 && (
                <div>
                  <span className="label">
                    {type === "in" ? "Where is it coming from?" : "Why is the balance changing?"}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {reasonOptions.map((r) => (
                      <Chip
                        key={r}
                        type="button"
                        active={reason === r}
                        onClick={() => {
                          setReason(r);
                          // On a receive the answer changes the form itself, so
                          // start it clean. The two reasons for an adjust ask
                          // for exactly the same thing, so keep what is typed —
                          // including the shelf you have already ticked off.
                          if (type === "in") resetMovement();
                        }}
                      >
                        {r}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              {/* Job — where this is going, coming back from, was lost, or was used up */}
              {showJob && (
                <div>
                  <label className="label" htmlFor="job">
                    {usedAtJob
                      ? "Which job was this used at?"
                      : bulkLoss
                        ? "Where did this happen?"
                        : bulkReturn
                          ? "Coming back from which job?"
                          : "Going to which job?"}
                  </label>
                  {jobChoices.length === 0 && !bulkLoss ? (
                    <p className="rounded border border-warn-500/35 bg-warn-50 px-2 py-1.5 text-xs text-warn-600">
                      {bulkReturn ? (
                        "None of this product is out at a job, so there is nothing to bring back."
                      ) : (
                        <>
                          No active jobs yet.{" "}
                          <Link href="/jobs" className="font-semibold underline">
                            Add a job
                          </Link>{" "}
                          first.
                        </>
                      )}
                    </p>
                  ) : jobChoices.length === 0 && usedAtJob ? (
                    <p className="rounded border border-warn-500/35 bg-warn-50 px-2 py-1.5 text-xs text-warn-600">
                      None of this product is out at a job, so there is nothing to close out.
                    </p>
                  ) : (
                    <select
                      id="job"
                      className="field"
                      value={jobId}
                      onChange={(e) => setJobId(e.target.value)}
                      required={needsJob}
                    >
                      <option value="">{bulkLoss && !usedAtJob ? "In the store" : "Choose a job…"}</option>
                      {jobChoices.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.name}
                          {bulkReturn || bulkLoss ? ` — ${qty(outAt(j.id))} ${selected.unit} out` : ""}
                          {j.status === "closed" ? " (closed)" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  {lostAtJob && !usedAtJob && (
                    <p className="mt-1 text-[11px] text-muted">
                      This leaves the store balance alone — it left the store when it was issued.
                      It comes off what that job still has out.
                    </p>
                  )}
                  {usedAtJob && jobId && (
                    <p className="mt-1 text-[11px] text-muted">
                      This leaves the store balance alone — it left the store when it was issued.
                      It closes out what that job still has out, permanently.
                    </p>
                  )}
                </div>
              )}

              {/* Quantity — bulk items, or brand-new serialized units */}
              {(!serialized || mintingNew) && type !== "adjust" && (
                <div>
                  <label className="label" htmlFor="amount">
                    {mintingNew ? "How many new units?" : `Quantity (${selected.unit})`}
                  </label>
                  <input
                    id="amount"
                    className="field num text-lg"
                    type="number"
                    min={mintingNew ? 1 : 0}
                    max={atJobCap ?? undefined}
                    step={serialized ? 1 : "any"}
                    inputMode="decimal"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                  />
                  {atJobCap !== null && (
                    <p className="mt-1 text-[11px] text-muted">
                      <span className="num font-semibold text-ink">
                        {qty(atJobCap)} {selected.unit}
                      </span>{" "}
                      is out at this job, so you can account for up to that.
                    </p>
                  )}
                  {mintingNew && (
                    <p className="mt-1 text-[11px] text-muted">
                      Each one gets its own ID, carrying on after{" "}
                      <span className="num">
                        {selected.id}-{String(units.length).padStart(2, "0")}
                      </span>
                      .
                    </p>
                  )}
                </div>
              )}

              {/* Bulk adjust keeps the counted-figure box */}
              {!serialized && type === "adjust" && (
                <div>
                  <label className="label" htmlFor="counted">
                    Counted quantity ({selected.unit})
                  </label>
                  <input
                    id="counted"
                    className="field num text-lg"
                    type="number"
                    min={0}
                    step="any"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              )}

              {/* Serialized: name the actual units */}
              {serialized && !mintingNew && (
                <div>
                  <span className="label">
                    {type === "out"
                      ? "Which units are going out?"
                      : type === "in"
                        ? "Which units are coming back?"
                        : type === "condition"
                          ? PICK_LABEL[reason]
                          : "Tick every unit you can actually find on the shelf"}
                  </span>
                  <UnitPicker
                    units={pickable}
                    selected={picked}
                    onChange={setPickedUnits}
                    jobLabel={jobName}
                    emptyMessage={
                      type === "out"
                        ? "No units of this product are in the store."
                        : type === "in"
                          ? "Nothing of this product is out at a job, so there is nothing to bring back. Dispatch some units first."
                          : type === "condition"
                            ? `No units of this product are ${(CONDITION_RULES[reason]?.from ?? [])
                                .map((s) => UNIT_STATUS_LABEL[s].toLowerCase())
                                .join(" or ")}.`
                            : "This product has no units in the store or missing."
                    }
                  />
                  {type === "adjust" && (
                    <p className="mt-1.5 text-[11px] text-muted">
                      Unticked units that we think are in the store get marked{" "}
                      <span className="font-semibold">missing</span>. Ticking one that was missing puts
                      it back in stock. Units out at a job or damaged are not listed — they come back
                      through Return from job, or Damage / loss → Repaired.
                    </p>
                  )}
                  {type === "in" && (
                    <p className="mt-1.5 text-[11px] text-muted">
                      No job to pick — each unit already knows which job it is at, and that job is
                      recorded against this return automatically. The job name is shown beside every
                      unit above.
                    </p>
                  )}
                </div>
              )}

              {costed && (
                <div className={`grid gap-3 ${serialized ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                  <div>
                    <label className="label" htmlFor="unitcost">
                      {serialized
                        ? builtInHouse
                          ? "Cost to build one (₹)"
                          : "Cost per unit (₹)"
                        : `Cost per ${selected.unit} (₹)`}
                    </label>
                    <input
                      id="unitcost"
                      className="field num"
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      value={unitCost}
                      onChange={(e) => setUnitCost(e.target.value)}
                      placeholder={builtInHouse ? "Materials and labour" : "From the invoice"}
                    />
                    <p className="mt-1 text-[11px] text-muted">
                      {serialized
                        ? "Recorded on each new unit, so units that cost different amounts are valued correctly."
                        : "Blended into this product's average cost."}
                    </p>
                  </div>
                  {serialized && (
                    <div>
                      <label className="label" htmlFor="maker">
                        {builtInHouse ? "Built by" : "Manufacturer"}
                      </label>
                      <input
                        id="maker"
                        className="field"
                        list="purchase-makers"
                        value={maker}
                        onChange={(e) => setMaker(e.target.value)}
                        placeholder={builtInHouse ? "Sai Group" : "Who made these"}
                      />
                      <datalist id="purchase-makers">
                        {makers.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>
                  )}
                  {serialized && (
                    <div>
                      <label className="label" htmlFor="year">
                        Year made
                      </label>
                      <input
                        id="year"
                        className="field num"
                        type="number"
                        min={1950}
                        max={2100}
                        step={1}
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        placeholder="2026"
                      />
                      <p className="mt-1 text-[11px] text-muted">From the nameplate. Optional.</p>
                    </div>
                  )}
                </div>
              )}

              <div className={isPurchase ? "grid gap-3 sm:grid-cols-2" : ""}>
                {isPurchase && (
                  <div>
                    <label className="label" htmlFor="supplier-invoice">
                      Supplier invoice / PO number (optional)
                    </label>
                    <input
                      id="supplier-invoice"
                      className="field"
                      maxLength={200}
                      value={supplierInvoice}
                      onChange={(e) => setSupplierInvoice(e.target.value)}
                      placeholder="PO-2291"
                    />
                  </div>
                )}
                <div>
                  <label className="label" htmlFor="note">
                    {noteLabel}
                  </label>
                  <input
                    id="note"
                    className="field"
                    maxLength={500}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={notePlaceholder}
                  />
                </div>
              </div>

              {/* Current → projected, so a slip is caught before it is saved. */}
              <div className="flex items-center gap-3 rounded-md border border-line bg-neutral-surface px-3 py-2.5">
                <div>
                  <p className="text-[11px] text-muted">In store now</p>
                  <p className="num text-lg font-semibold text-ink">{qty(selected.quantity)}</p>
                </div>
                <span className="text-muted">→</span>
                <div>
                  <p className="text-[11px] text-muted">After this entry</p>
                  <p
                    className={`num text-lg font-semibold ${
                      projected === null ? "text-muted" : wouldGoNegative ? "text-danger-600" : "text-ok-600"
                    }`}
                  >
                    {projected === null ? "—" : qty(projected)}
                  </p>
                </div>
                <span className="ml-auto text-[11px] text-muted">{selected.unit}</span>
              </div>

              {err && (
                <p className="rounded border border-danger-500/25 bg-danger-50 p-2 text-xs text-danger-600">{err}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
              <Button type="submit" disabled={busy || !!blocker}>
                {busy ? "Saving…" : `Confirm ${MODES.find((m) => m.type === type)!.label.toLowerCase()}`}
              </Button>
              <span className="text-[11px] text-muted">
                {blocker ?? `Recorded against your account · last change ${relative(selected.updated_at)}`}
              </span>
            </div>
          </Card>
        </form>
      )}
    </div>
  );
}
