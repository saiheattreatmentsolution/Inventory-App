"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { isConfigured } from "@/lib/supabase";
import { Button, Spinner } from "@/components/ui";
import { NotConfiguredNotice } from "@/components/SetupNotice";

/**
 * Shows the sign-in screen until there is a session. This is a convenience, not
 * a security control — every table and function is locked down in Postgres, so
 * an unauthenticated browser gets nothing back even if it skips this screen.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, ready, recovering } = useAuth();

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <NotConfiguredNotice />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label="Checking your session…" />
      </div>
    );
  }

  // A recovery session is signed in, but landing straight on the dashboard
  // would leave the old password in place and the reset unfinished.
  if (recovering) return <SetNewPassword />;
  if (!session) return <SignIn />;

  return <>{children}</>;
}

/** Shell shared by the signed-out screens, so they look like one thing. */
function AuthShell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-steel-900">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded bg-rust-500 text-base font-bold text-white">
              SG
            </span>
            <div className="leading-tight text-white">
              <p className="text-base font-semibold">Sai Group inventory</p>
              <p className="text-xs text-steel-200">Heat treatment &amp; PWHT equipment store</p>
            </div>
          </div>
          {children}
          {footer && <p className="mt-4 text-center text-[11px] text-steel-200">{footer}</p>}
        </div>
      </div>
    </div>
  );
}

function SetNewPassword() {
  const { updatePassword, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await updatePassword(password);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not set the password");
      setBusy(false);
    }
  };

  return (
    <AuthShell
      footer={
        <button onClick={() => void signOut()} className="underline">
          Cancel and sign out
        </button>
      }
    >
      <form onSubmit={submit} className="rounded-lg border border-line bg-card p-5">
        <h1 className="text-sm font-semibold text-ink">Choose a new password</h1>
        <p className="mt-1 text-xs text-muted">
          You are here from a reset email. Set a password to finish.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="newpass">
              New password
            </label>
            <input
              id="newpass"
              className="field"
              type="password"
              autoComplete="new-password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {tooShort && <p className="mt-1 text-[11px] text-danger-600">At least 8 characters.</p>}
          </div>
          <div>
            <label className="label" htmlFor="confirmpass">
              Confirm password
            </label>
            <input
              id="confirmpass"
              className="field"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch && <p className="mt-1 text-[11px] text-danger-600">These do not match.</p>}
          </div>
        </div>
        {err && (
          <p className="mt-3 rounded border border-danger-500/25 bg-danger-50 p-2 text-xs text-danger-600">
            {err}
          </p>
        )}
        <Button
          type="submit"
          className="mt-4 w-full"
          disabled={busy || password.length < 8 || password !== confirm}
        >
          {busy ? "Saving…" : "Set password and continue"}
        </Button>
      </form>
    </AuthShell>
  );
}

function SignIn() {
  const { signIn, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const sendReset = async () => {
    if (!email.trim()) {
      setErr("Type your email address first, then choose Forgot password.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await requestPasswordReset(email);
      setResetSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the reset email");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setErr(
        e instanceof Error && /invalid login/i.test(e.message)
          ? "That email and password don't match."
          : e instanceof Error
            ? e.message
            : "Could not sign in",
      );
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-steel-900">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded bg-rust-500 text-base font-bold text-white">
              SG
            </span>
            <div className="leading-tight text-white">
              <p className="text-base font-semibold">Sai Group inventory</p>
              <p className="text-xs text-steel-200">Heat treatment &amp; PWHT equipment store</p>
            </div>
          </div>

          <form onSubmit={submit} className="rounded-lg border border-line bg-card p-5">
            <h1 className="text-sm font-semibold text-ink">Sign in</h1>
            <p className="mt-1 text-xs text-muted">
              Use the email and password your admin set up for you.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="label" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  className="field"
                  type="email"
                  autoComplete="username"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@saigroup.in"
                />
              </div>
              <div>
                <label className="label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  className="field"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {err && (
              <p className="mt-3 rounded border border-danger-500/25 bg-danger-50 p-2 text-xs text-danger-600">
                {err}
              </p>
            )}
            {resetSent && (
              <p className="mt-3 rounded border border-ok-500/30 bg-ok-50 p-2 text-xs text-ok-600">
                Reset link sent to {email}. Open it on this device and you can set a new password.
              </p>
            )}

            <Button type="submit" className="mt-4 w-full" disabled={busy || !email || !password}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>

            <button
              type="button"
              onClick={() => void sendReset()}
              disabled={busy}
              className="mt-3 w-full text-center text-[11px] font-semibold text-steel-600 hover:underline disabled:text-muted"
            >
              Forgot password?
            </button>
          </form>

          <p className="mt-4 text-center text-[11px] text-steel-200">
            No account? Accounts are created by an admin in the Supabase dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
