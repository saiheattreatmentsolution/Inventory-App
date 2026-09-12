"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "./supabase";

export type Role = "viewer" | "admin";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  created_at: string;
};

type Auth = {
  session: Session | null;
  profile: Profile | null;
  /** true only once we actually know whether someone is signed in. */
  ready: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
  /** true while the user is here from a password-reset email. */
  recovering: boolean;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  return (data as Profile) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(!isConfigured);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      if (data.session) setProfile(await fetchProfile(data.session.user.id));
      if (!cancelled) setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Clicking the emailed link signs them in with a recovery session. They
      // must set a new password before the app is usable, or they are back
      // where they started next time.
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(next);
      if (!next) {
        setProfile(null);
        return;
      }
      void fetchProfile(next.user.id).then((p) => {
        if (!cancelled) setProfile(p);
      });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    setRecovering(false);
    await supabase.auth.signOut();
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) throw new Error(error.message);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
    setRecovering(false);
  }, []);

  // Only full_name is grantable on profiles, so this cannot touch the role.
  const setDisplayName = useCallback(
    async (name: string) => {
      const id = session?.user.id;
      if (!id) return;
      const trimmed = name.trim();
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: trimmed || null })
        .eq("id", id);
      if (error) throw new Error(error.message);
      setProfile(await fetchProfile(id));
    },
    [session],
  );

  const value = useMemo<Auth>(
    () => ({
      session,
      profile,
      ready,
      // The UI uses this to hide controls. It is NOT the security boundary —
      // the database enforces the role on every write regardless.
      isAdmin: profile?.role === "admin",
      signIn,
      signOut,
      setDisplayName,
      recovering,
      requestPasswordReset,
      updatePassword,
    }),
    [session, profile, ready, signIn, signOut, setDisplayName, recovering,
     requestPasswordReset, updatePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
