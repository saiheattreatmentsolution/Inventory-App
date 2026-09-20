"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth, Profile, Role } from "@/lib/auth";
import { AdminOnly } from "@/components/AdminOnly";
import { Card, SectionTitle, PageHead, Spinner, Empty } from "@/components/ui";
import { dateOnly } from "@/lib/format";
import { StorageCard } from "@/components/StorageCard";

export default function AdminPage() {
  return (
    <AdminOnly>
      <People />
    </AdminOnly>
  );
}

function People() {
  const { profile: me } = useAuth();
  const [people, setPeople] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Pure fetch, so the effect below can await before touching state.
  const fetchPeople = useCallback(
    async () =>
      supabase
        .from("profiles")
        .select("id, email, full_name, role, created_at")
        .order("created_at"),
    [],
  );

  const load = useCallback(async () => {
    const { data, error } = await fetchPeople();
    if (error) setErr(error.message);
    else setPeople((data ?? []) as Profile[]);
    setLoading(false);
  }, [fetchPeople]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await fetchPeople();
      if (cancelled) return;
      if (error) setErr(error.message);
      else setPeople((data ?? []) as Profile[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPeople]);

  const changeRole = async (id: string, role: Role) => {
    setBusyId(id);
    setErr(null);
    const { error } = await supabase.rpc("set_user_role", { p_user_id: id, p_role: role });
    if (error) setErr(error.message);
    await load();
    setBusyId(null);
  };

  const adminCount = people.filter((p) => p.role === "admin").length;

  return (
    <div className="space-y-4">
      <PageHead title="Manage people" subtitle="Who can sign in, and what they can do" />

      <Card>
        <SectionTitle action={<span className="text-xs text-muted">{people.length} accounts</span>}>
          Accounts
        </SectionTitle>

        {err && (
          <p className="mx-4 mt-3 rounded border border-danger-500/25 bg-danger-50 p-2 text-xs text-danger-600">
            {err}
          </p>
        )}

        {loading ? (
          <Spinner />
        ) : people.length === 0 ? (
          <Empty>No accounts yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {people.map((p) => {
              const isMe = p.id === me?.id;
              const lastAdmin = p.role === "admin" && adminCount <= 1;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {p.full_name || p.email}
                      {isMe && <span className="ml-2 text-[11px] font-normal text-muted">(you)</span>}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {p.email} · added {dateOnly(p.created_at)}
                    </p>
                  </div>
                  <select
                    className="field w-32"
                    value={p.role}
                    disabled={busyId === p.id || lastAdmin}
                    onChange={(e) => void changeRole(p.id, e.target.value as Role)}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-line px-4 py-3 text-[11px] text-muted">
          <p>
            <span className="font-semibold text-ink">Viewer</span> can see stock, search and export,
            but not what anything cost. <span className="font-semibold text-ink">Admin</span> can also record stock
            movements, add and edit products, archive them, see costs and stock value, and change
            these roles.
          </p>
          <p className="mt-1.5">
            To add someone, create their account in the Supabase dashboard under Authentication →
            Users → Add user. They appear here as a viewer, and you promote them if needed. The last
            remaining admin can&apos;t be demoted, so nobody gets locked out.
          </p>
        </div>
      </Card>

      <StorageCard />
    </div>
  );
}
