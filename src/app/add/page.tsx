"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { UNITS } from "@/lib/categories";
import { Card, SectionTitle, PageHead, Button, ItemId } from "@/components/ui";
import { AdminOnly } from "@/components/AdminOnly";
import { NewCategoryForm } from "@/components/NewCategoryForm";

export default function AddItemPage() {
  return (
    <AdminOnly>
      <AddItemForm />
    </AdminOnly>
  );
}

function AddItemForm() {
  const router = useRouter();
  const { items, categories, createItem, configured } = useStore();

  const [form, setForm] = useState({
    name: "",
    category: "",
    unit: "pcs",
    quantity: "0",
    reorder_threshold: "0",
    unit_cost: "",
    notes: "",
  });
  const [addingCategory, setAddingCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The category picked so far defaults to the first once categories load.
  const category = form.category || categories[0]?.name || "";
  const code = categories.find((c) => c.name === category)?.code;

  // Preview of the ID the database will mint — generated, never typed by hand.
  const previewId = useMemo(() => {
    if (!code) return null;
    const used = items
      .filter((i) => i.id.startsWith(`SAI-${code}-`))
      .map((i) => Number(i.id.split("-")[2]))
      .filter((n) => !Number.isNaN(n));
    const next = (used.length ? Math.max(...used) : 0) + 1;
    return `SAI-${code}-${String(next).padStart(3, "0")}`;
  }, [code, items]);

  const duplicate = useMemo(
    () => items.find((i) => i.name.trim().toLowerCase() === form.name.trim().toLowerCase()),
    [items, form.name],
  );

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const created = await createItem({
        name: form.name,
        category,
        unit: form.unit,
        quantity: Number(form.quantity) || 0,
        reorder_threshold: Number(form.reorder_threshold) || 0,
        unit_cost: form.unit_cost === "" ? null : Number(form.unit_cost),
        notes: form.notes,
      });
      router.push(`/inventory/${created.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the item");
      setSaving(false);
    }
  };

  if (!configured) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHead title="Add item" subtitle="Creates the product record and logs its opening stock" />

      <form onSubmit={submit}>
        <Card>
          <SectionTitle action={previewId && <ItemId id={previewId} />}>New product</SectionTitle>

          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="name">
                Product name
              </label>
              <input
                id="name"
                className="field"
                required
                autoFocus
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Oil Burner 12 MBTU"
              />
              {duplicate && (
                <p className="mt-1.5 rounded border border-warn-500/35 bg-warn-50 px-2 py-1.5 text-xs text-warn-600">
                  <span className="font-semibold">{duplicate.name}</span> already exists as{" "}
                  <span className="num">{duplicate.id}</span>. Update its stock instead of adding a second record.{" "}
                  <Link href={`/update?item=${duplicate.id}`} className="underline">
                    Go to update stock
                  </Link>
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              {/* Points at the select, which is not rendered while the new
                  category fields are open — those carry their own labels. */}
              {addingCategory ? (
                <span className="label">Category</span>
              ) : (
                <label className="label" htmlFor="category">
                  Category
                </label>
              )}
              {addingCategory ? (
                <NewCategoryForm
                  onCreated={(name) => {
                    set({ category: name });
                    setAddingCategory(false);
                  }}
                  onCancel={() => setAddingCategory(false)}
                />
              ) : (
                <>
                  <div className="flex gap-2">
                    <select
                      id="category"
                      className="field"
                      value={category}
                      onChange={(e) => set({ category: e.target.value })}
                    >
                      {categories.length === 0 && <option value="">No categories yet</option>}
                      {categories.map((c) => (
                        <option key={c.code} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="secondary" onClick={() => setAddingCategory(true)}>
                      + New category
                    </Button>
                  </div>
                  {code && (
                    <p className="mt-1 text-[11px] text-muted">
                      Sets the ID prefix <span className="num">{code}</span> — fixed for life, even if the name
                      changes later.
                    </p>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="label" htmlFor="unit">
                Unit of measure
              </label>
              <select id="unit" className="field" value={form.unit} onChange={(e) => set({ unit: e.target.value })}>
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="quantity">
                Opening quantity
              </label>
              <input
                id="quantity"
                className="field num"
                type="number"
                min={0}
                step={form.unit === "pcs" ? 1 : "any"}
                value={form.quantity}
                onChange={(e) => set({ quantity: e.target.value })}
              />
            </div>

            <div>
              <label className="label" htmlFor="threshold">
                Minimum quantity (reorder at)
              </label>
              <input
                id="threshold"
                className="field num"
                type="number"
                min={0}
                step="any"
                value={form.reorder_threshold}
                onChange={(e) => set({ reorder_threshold: e.target.value })}
              />
            </div>

            <div>
              <label className="label" htmlFor="cost">
                {form.unit === "pcs" ? "Cost per unit (₹, optional)" : `Cost per ${form.unit} (₹, optional)`}
              </label>
              <input
                id="cost"
                className="field num"
                type="number"
                min={0}
                step="any"
                value={form.unit_cost}
                onChange={(e) => set({ unit_cost: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="label" htmlFor="notes">
                Notes (optional)
              </label>
              <textarea
                id="notes"
                className="field"
                rows={2}
                value={form.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </div>
          </div>

          {err && (
            <p className="mx-4 mb-3 rounded border border-danger-500/25 bg-danger-50 p-2 text-xs text-danger-600">{err}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
            <Button type="submit" disabled={saving || !form.name.trim() || !category}>
              {saving ? "Saving…" : "Save item"}
            </Button>
            <Link href="/inventory">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <span className="text-[11px] text-muted">
              Logged against your account automatically.
            </span>
          </div>
        </Card>
      </form>
    </div>
  );
}
