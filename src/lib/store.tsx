"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase, isConfigured } from "./supabase";
import { Item, Movement, MovementType, Unit, Job, JobStock, Category } from "./types";

// One shared data layer for all five pages — the fix for three disconnected
// Excel sheets drifting out of sync.

type NewItem = {
  name: string;
  category: string;
  unit: string;
  quantity: number;
  reorder_threshold: number;
  unit_cost: number | null;
  notes: string;
};

type MovementInput = {
  item_id: string;
  type: MovementType;
  quantity: number;
  reason: string;
  note: string;
  job_id?: string | null;
  /** Which physical units this covers. Empty for bulk items. */
  unit_ids?: string[];
  /** On new stock: price per unit, who made it, and when (serialized only). */
  unit_cost?: number | null;
  manufacturer?: string;
  manufacturing_year?: number | null;
};

export type JobInput = { name: string; site: string; customer: string; notes: string };

/** Blank optional fields are stored as null, not as empty strings. */
const jobRow = (input: JobInput) => ({
  name: input.name.trim(),
  site: input.site.trim() || null,
  customer: input.customer.trim() || null,
  notes: input.notes.trim() || null,
});

type UnitPatch = {
  id: string;
  unit_cost: number | null;
  manufacturer: string | null;
  manufacturing_year: number | null;
};

type Snapshot = {
  items: Item[];
  movements: Movement[];
  units: Unit[];
  jobs: Job[];
  jobStock: JobStock[];
  categories: Category[];
};

// unit_cost is deliberately absent from both: the database does not grant it
// to everyone. Admins get costs from item_costs()/unit_costs(), which return
// nothing to a viewer, so a viewer simply sees no prices anywhere.
export const ITEM_COLUMNS =
  "id, name, category, unit, tracking, quantity, reorder_threshold, notes, archived_at, created_at, updated_at";
export const UNIT_COLUMNS =
  "id, item_id, seq, manufacturer, manufacturing_year, status, job_id, created_at, updated_at";

type CostRow = { id: string; unit_cost: number | null };

/** id -> cost, empty for viewers. */
export function costMap(rows: CostRow[] | null): Map<string, number | null> {
  return new Map((rows ?? []).map((r) => [r.id, r.unit_cost]));
}

/** Pure fetch — deliberately holds no React state, so effects can await it. */
async function loadAll(): Promise<Snapshot> {
  const [itemsRes, movesRes, unitsRes, jobsRes, jobStockRes, categoriesRes, itemCostsRes, unitCostsRes] =
    await Promise.all([
      supabase.from("items").select(ITEM_COLUMNS).order("name"),
      supabase.from("movements").select("*").order("created_at", { ascending: false }).limit(2000),
      supabase.from("units").select(UNIT_COLUMNS).order("id"),
      supabase.from("jobs").select("*").order("name"),
      supabase.from("job_stock").select("*"),
      supabase.from("categories").select("*").order("name"),
      supabase.rpc("item_costs"),
      supabase.rpc("unit_costs"),
    ]);
  for (const res of [itemsRes, movesRes, unitsRes, jobsRes, jobStockRes, categoriesRes, itemCostsRes, unitCostsRes]) {
    if (res.error) throw new Error(res.error.message);
  }
  const itemCosts = costMap(itemCostsRes.data as CostRow[] | null);
  const unitCosts = costMap(unitCostsRes.data as CostRow[] | null);
  return {
    items: (itemsRes.data ?? []).map((i) => ({ ...i, unit_cost: itemCosts.get(i.id) ?? null })) as Item[],
    movements: (movesRes.data ?? []) as Movement[],
    units: (unitsRes.data ?? []).map((u) => ({ ...u, unit_cost: unitCosts.get(u.id) ?? null })) as Unit[],
    jobs: (jobsRes.data ?? []) as Job[],
    jobStock: (jobStockRes.data ?? []) as JobStock[],
    categories: (categoriesRes.data ?? []) as Category[],
  };
}

type Store = {
  items: Item[];
  movements: Movement[];
  units: Unit[];
  jobs: Job[];
  jobStock: JobStock[];
  categories: Category[];
  unitsOf: (itemId: string) => Unit[];
  jobName: (jobId: string | null) => string;
  loading: boolean;
  error: string | null;
  configured: boolean;
  refresh: () => Promise<void>;
  createItem: (input: NewItem) => Promise<Item>;
  createCategory: (name: string, code: string) => Promise<Category>;
  applyMovement: (input: MovementInput) => Promise<Item>;
  updateItem: (id: string, patch: Partial<Item>) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  updateUnits: (patches: UnitPatch[]) => Promise<void>;
  createJob: (input: JobInput) => Promise<void>;
  updateJob: (id: string, input: JobInput) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  setJobStatus: (id: string, status: "active" | "closed") => Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    items: [],
    movements: [],
    units: [],
    jobs: [],
    jobStock: [],
    categories: [],
  });
  const [loading, setLoading] = useState(isConfigured);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isConfigured) return;
    try {
      setSnapshot(await loadAll());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await loadAll();
        if (!cancelled) {
          setSnapshot(next);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const createItem = useCallback(
    async (input: NewItem) => {
      const { data, error: rpcError } = await supabase.rpc("create_item", {
        p_name: input.name.trim(),
        p_category: input.category,
        p_unit: input.unit,
        p_quantity: input.quantity,
        p_reorder_threshold: input.reorder_threshold,
        p_unit_cost: input.unit_cost,
        p_notes: input.notes.trim() || null,
      });
      if (rpcError) throw new Error(rpcError.message);
      await refresh();
      return data as Item;
    },
    [refresh],
  );

  const createCategory = useCallback(
    async (name: string, code: string) => {
      const { data, error: rpcError } = await supabase.rpc("create_category", {
        p_name: name.trim(),
        p_code: code.trim().toUpperCase(),
      });
      if (rpcError) throw new Error(rpcError.message);
      await refresh();
      return data as Category;
    },
    [refresh],
  );

  const applyMovement = useCallback(
    async (input: MovementInput) => {
      const { data, error: rpcError } = await supabase.rpc("apply_movement", {
        p_item_id: input.item_id,
        p_type: input.type,
        p_quantity: input.quantity,
        p_reason: input.reason || null,
        p_note: input.note.trim() || null,
        p_job_id: input.job_id ?? null,
        p_unit_ids: input.unit_ids ?? [],
        p_unit_cost: input.unit_cost ?? null,
        p_manufacturer: input.manufacturer?.trim() || null,
        p_year: input.manufacturing_year ?? null,
      });
      if (rpcError) throw new Error(rpcError.message);
      await refresh();
      return data as Item;
    },
    [refresh],
  );

  const updateItem = useCallback(
    async (id: string, patch: Partial<Item>) => {
      const { error: updErr } = await supabase
        .from("items")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (updErr) throw new Error(updErr.message);
      await refresh();
    },
    [refresh],
  );

  // Products are archived, never deleted — deleting one would cascade its
  // entire movement history away with it.
  const setArchived = useCallback(
    async (id: string, archived: boolean) => {
      const { error: updErr } = await supabase
        .from("items")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", id);
      if (updErr) throw new Error(updErr.message);
      await refresh();
    },
    [refresh],
  );

  const createJob = useCallback(
    async (input: JobInput) => {
      const { error: insErr } = await supabase.from("jobs").insert(jobRow(input));
      if (insErr) throw new Error(insErr.message);
      await refresh();
    },
    [refresh],
  );

  // History refers to a job by id, so a rename shows up everywhere at once.
  const updateJob = useCallback(
    async (id: string, input: JobInput) => {
      const { error: updErr } = await supabase.from("jobs").update(jobRow(input)).eq("id", id);
      if (updErr) throw new Error(updErr.message);
      await refresh();
    },
    [refresh],
  );

  const deleteJob = useCallback(
    async (id: string) => {
      const { error: rpcError } = await supabase.rpc("delete_job", { p_job_id: id });
      if (rpcError) throw new Error(rpcError.message);
      await refresh();
    },
    [refresh],
  );

  const setJobStatus = useCallback(
    async (id: string, status: "active" | "closed") => {
      const { error: updErr } = await supabase.from("jobs").update({ status }).eq("id", id);
      if (updErr) throw new Error(updErr.message);
      await refresh();
    },
    [refresh],
  );

  // Cost and maker are properties of the thing itself, so they are written
  // directly. Status and job are not grantable and cannot be.
  const updateUnits = useCallback(
    async (patches: UnitPatch[]) => {
      const now = new Date().toISOString();
      const results = await Promise.all(
        patches.map((p) =>
          supabase
            .from("units")
            .update({
              unit_cost: p.unit_cost,
              manufacturer: p.manufacturer,
              manufacturing_year: p.manufacturing_year,
              updated_at: now,
            })
            .eq("id", p.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);
      await refresh();
    },
    [refresh],
  );

  const unitsOf = useCallback(
    (itemId: string) => snapshot.units.filter((u) => u.item_id === itemId),
    [snapshot.units],
  );

  const jobName = useCallback(
    (jobId: string | null) => snapshot.jobs.find((j) => j.id === jobId)?.name ?? "—",
    [snapshot.jobs],
  );

  const value = useMemo<Store>(
    () => ({
      items: snapshot.items,
      movements: snapshot.movements,
      units: snapshot.units,
      jobs: snapshot.jobs,
      jobStock: snapshot.jobStock,
      categories: snapshot.categories,
      unitsOf,
      jobName,
      loading,
      error,
      configured: isConfigured,
      refresh,
      createItem,
      createCategory,
      applyMovement,
      updateItem,
      setArchived,
      updateUnits,
      createJob,
      updateJob,
      deleteJob,
      setJobStatus,
    }),
    [snapshot, loading, error, refresh, createItem, createCategory, applyMovement, updateItem, setArchived,
     updateUnits, createJob, updateJob, deleteJob, setJobStatus, unitsOf, jobName],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
