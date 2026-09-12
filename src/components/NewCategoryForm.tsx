"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui";

/**
 * Add a category — a name and its fixed 3-letter item-ID prefix. Used inline
 * on Add item (so a new kind of product is never blocked on this first) and
 * on Manage people (so the full list can be reviewed in one place).
 */
export function NewCategoryForm({
  onCreated,
  onCancel,
}: {
  onCreated: (name: string) => void;
  onCancel?: () => void;
}) {
  const { categories, createCategory } = useStore();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const codeValue = code.trim().toUpperCase();
  const codeInvalid = codeValue !== "" && !/^[A-Z]{3}$/.test(codeValue);
  const taken =
    categories.some((c) => c.name.toLowerCase() === name.trim().toLowerCase()) ||
    categories.some((c) => c.code === codeValue);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || codeInvalid || codeValue === "") return;
    setBusy(true);
    setErr(null);
    try {
      const created = await createCategory(name, codeValue);
      setName("");
      setCode("");
      onCreated(created.name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add the category");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div className="min-w-40 flex-1">
        <label className="label" htmlFor="new-category-name">
          Category name
        </label>
        <input
          id="new-category-name"
          className="field"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Refractory materials"
        />
      </div>
      <div className="w-28">
        <label className="label" htmlFor="new-category-code">
          Code (3 letters)
        </label>
        <input
          id="new-category-code"
          className="field num uppercase"
          maxLength={3}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="REF"
        />
      </div>
      <Button type="submit" disabled={busy || !name.trim() || codeValue === "" || codeInvalid || taken}>
        {busy ? "Adding…" : "Add category"}
      </Button>
      {onCancel && (
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      )}
      {codeInvalid && <p className="w-full text-[11px] text-danger-600">Code must be exactly 3 letters.</p>}
      {!codeInvalid && taken && (
        <p className="w-full text-[11px] text-danger-600">That name or code is already in use.</p>
      )}
      {err && <p className="w-full text-[11px] text-danger-600">{err}</p>}
      <p className="w-full text-[11px] text-muted">
        The code becomes the item-ID prefix (<span className="num">SAI-{codeValue || "XXX"}-0001</span>) and cannot
        be changed afterwards.
      </p>
    </form>
  );
}
