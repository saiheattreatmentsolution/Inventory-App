"use client";

import { useStore } from "@/lib/store";

/**
 * Shown before .env.local points at a real Supabase project. Deliberately free
 * of hooks that need a provider — it renders above the auth gate, outside the
 * data layer.
 */
export function NotConfiguredNotice() {
  return (
    <div className="rounded-lg border border-warn-500/35 bg-warn-50 p-4 text-sm text-ink">
      <p className="font-semibold">Not connected to Supabase yet</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
        <li>
          Create a free project at{" "}
          <a
            className="text-steel-600 underline"
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
          >
            supabase.com/dashboard
          </a>
        </li>
        <li>
          In the SQL editor, run <code className="num">supabase/schema.sql</code>, then{" "}
          <code className="num">supabase/data.sql</code>
        </li>
        <li>
          Copy <code className="num">.env.local.example</code> to <code className="num">.env.local</code> and paste in
          your project URL and anon key
        </li>
        <li>Restart the dev server</li>
      </ol>
    </div>
  );
}

/** Query failures once we are connected and signed in. */
export function DataErrorNotice() {
  const { error } = useStore();
  if (!error) return null;

  return (
    <div className="mb-4 rounded-lg border border-danger-500/25 bg-danger-50 p-4 text-sm text-danger-600">
      <p className="font-semibold">Could not load data</p>
      <p className="mt-1">{error}</p>
      <p className="mt-1 text-muted">
        Check that <code className="num">supabase/schema.sql</code> has been run in your project.
      </p>
    </div>
  );
}
