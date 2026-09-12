import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

// Supabase's dashboard now emits NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (the
// sb_publishable_... format), while older projects and docs use
// NEXT_PUBLIC_SUPABASE_ANON_KEY (a JWT). Both are the same thing for our
// purposes — the browser-safe key — so accept whichever one is set.
// These must stay as direct member accesses: Next inlines them at build time.
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Copying .env.local.example without editing it leaves values that are present
// but meaningless. Treat those as "not set up yet" so the app shows the setup
// checklist instead of a spinner followed by an unexplained network failure.
function looksReal(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v.length < 24) return false;
  return !/your-project-ref|your-anon|placeholder|paste|xxxxxxxx|example\.com/i.test(v);
}

export const isConfigured = looksReal(url) && looksReal(anonKey);

// Falls back to a harmless placeholder so the app can still render the
// "connect your Supabase project" screen instead of crashing on import.
export const supabase = createClient(
  url ?? "https://placeholder.supabase.co",
  anonKey ?? "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
