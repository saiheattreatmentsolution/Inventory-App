export function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export function signed(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${qty(Math.abs(n))}`;
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0);
}

export function dateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return dateOnly(iso);
}

// Excel and Sheets treat a cell beginning with = + - @ (or tab / carriage
// return) as a formula and evaluate it when the file is opened. These exports
// exist precisely so people can open them in Excel, and product names and
// notes are free text typed by users, so the lead character is neutralised
// with a leading apostrophe, which Excel reads as "this is text".
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Only text is at risk — a numeric -3 must stay -3.
  if (typeof value === "string" && FORMULA_LEAD.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null)[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Movements store whoever made them, which is an email address until someone
 * sets a display name. A full address swamps a dense row, so trim it to the
 * part before the @ and cap the length.
 */
export function shortActor(actor: string | null): string {
  if (!actor) return "";
  const name = actor.includes("@") ? actor.split("@")[0] : actor;
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

/**
 * The amount a movement covered, for the card subtitle — "3 units" for
 * serialized equipment, or the metres/kg for a bulk write-off at a job. A
 * bulk write-off at a job always shows quantity 0 (correctly — the store
 * balance already moved when the stock was dispatched), so without this the
 * card would give no clue how much cable was actually damaged, missing, or
 * used up. Empty string when neither applies (a normal bulk in/out/adjust
 * already shows its amount as the signed quantity itself).
 */
export function movementAmountLabel(
  m: { unit_ids: string[]; write_off_quantity: number | null },
  unit: string,
): string {
  if (m.unit_ids.length > 0) return `${m.unit_ids.length} ${m.unit_ids.length === 1 ? "unit" : "units"}`;
  if (m.write_off_quantity !== null) return `${qty(m.write_off_quantity)} ${unit}`;
  return "";
}

/** Hands the browser a file to save. Used for CSV exports and full backups. */
export function downloadFile(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
