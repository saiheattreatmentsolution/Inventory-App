"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui";

/**
 * Add a category — a name and its fixed 5-letter item-ID prefix. Used inline
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
  const codeInvalid = codeValue !== "" && !/^[A-Z]{5}$/.test(codeValue);
  const taken =
    categories.some((c) => c.name.toLowerCase() === name.trim().toLowerCase()) ||
    categories.some((c) => c.code === codeValue);

  const submit = async () => {
    if (!name.trim() || codeInvalid || codeValue === "" || taken || busy) return;
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

  // Enter would otherwise submit whichever form this sits inside — on Add
  // item, that is the create-the-product form, which is not what someone
  // typing a category name is asking for.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void submit();
  };

  // Deliberately a div, not a form: this is rendered inside the Add item
  // page's own form, and a form nested in a form is invalid HTML that the
  // browser silently discards — which detaches the button below from its
  // handler and hands it to the outer form instead.
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-40 flex-1">
        <label className="label" htmlFor="new-category-name">
          Category name
        </label>
        <input
          id="new-category-name"
          className="field"
          autoFocus
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Refractory materials"
        />
      </div>
      <div className="w-28">
        <label className="label" htmlFor="new-category-code">
          Code (5 letters)
        </label>
        <input
          id="new-category-code"
          className="field num uppercase"
          maxLength={5}
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={onKeyDown}
          placeholder="BURNR"
        />
      </div>
      <Button
        type="button"
        onClick={submit}
        disabled={busy || !name.trim() || codeValue === "" || codeInvalid || taken}
      >
        {busy ? "Adding…" : "Add category"}
      </Button>
      {onCancel && (
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      )}
      {codeInvalid && <p className="w-full text-[11px] text-danger-600">Code must be exactly 5 letters.</p>}
      {!codeInvalid && taken && (
        <p className="w-full text-[11px] text-danger-600">That name or code is already in use.</p>
      )}
      {err && <p className="w-full text-[11px] text-danger-600">{err}</p>}
      <p className="w-full text-[11px] text-muted">
        The code becomes the item-ID prefix (<span className="num">SAI-{codeValue || "XXXXX"}-01</span>) and cannot
        be changed afterwards.
      </p>
    </div>
  );
}
