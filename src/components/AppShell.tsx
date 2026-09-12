"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { UnitFinder } from "@/components/UnitFinder";

type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: (p: { active?: boolean }) => React.ReactElement;
  adminOnly?: boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", short: "Home", icon: IconGauge },
  { href: "/inventory", label: "Inventory", short: "Stock", icon: IconList },
  { href: "/update", label: "Update stock", short: "Update", icon: IconArrows, adminOnly: true },
  { href: "/add", label: "Add item", short: "Add", icon: IconPlus, adminOnly: true },
  { href: "/jobs", label: "Jobs", short: "Jobs", icon: IconSite },
  { href: "/history", label: "History", short: "History", icon: IconClock },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const nav = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-steel-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded bg-rust-500 text-sm font-bold">
              SG
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold">Sai Group inventory</span>
              <span className="hidden text-[11px] text-steel-200 sm:block">
                Heat treatment &amp; PWHT equipment store
              </span>
            </span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive(pathname, n.href)
                    ? "bg-white/12 text-white"
                    : "text-steel-200 hover:bg-white/8 hover:text-white"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto">
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-4 md:pb-10">{children}</main>

      {/* Mobile tab bar — thumb-reachable on the shop floor. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-card md:hidden"
        style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
      >
        {nav.map((n) => {
          const active = isActive(pathname, n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                active ? "text-steel-600" : "text-muted"
              }`}
            >
              <Icon active={active} />
              {n.short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function UserMenu() {
  const { profile, session, signOut, isAdmin, setDisplayName } = useAuth();
  const [open, setOpen] = useState(false);
  const [finding, setFinding] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const name = profile?.full_name || profile?.email || session?.user.email || "Account";
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-white/20 px-2.5 py-1.5 text-xs text-steel-100 hover:bg-white/10"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-steel-500 text-[10px] font-bold text-white">
          {initial}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{name}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            isAdmin ? "bg-rust-500 text-white" : "bg-white/15 text-steel-100"
          }`}
        >
          {isAdmin ? "Admin" : "Viewer"}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-56 rounded-md border border-line bg-card py-1 shadow-lg">
          <div className="border-b border-line px-3 py-2">
            {editingName ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void setDisplayName(draftName);
                  setEditingName(false);
                }}
              >
                <label className="label" htmlFor="displayname">
                  Your name
                </label>
                <input
                  id="displayname"
                  autoFocus
                  className="field"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Neeraj"
                />
                <p className="mt-1 text-[11px] text-muted">
                  Shown against everything you record, instead of your email address.
                </p>
              </form>
            ) : (
              <>
                <p className="truncate text-xs font-semibold text-ink">{name}</p>
                <p className="truncate text-[11px] text-muted">
                  {profile?.email ?? session?.user.email}
                </p>
                <button
                  onClick={() => {
                    setDraftName(profile?.full_name ?? "");
                    setEditingName(true);
                  }}
                  className="mt-1 text-[11px] font-semibold text-steel-600 hover:underline"
                >
                  {profile?.full_name ? "Change your name" : "Set your name"}
                </button>
              </>
            )}
          </div>
          <button
            onClick={() => {
              setOpen(false);
              setFinding(true);
            }}
            className="block w-full px-3 py-2 text-left text-xs text-ink hover:bg-steel-50"
          >
            Find a unit by ID
          </button>
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-xs text-ink hover:bg-steel-50"
            >
              Manage people
            </Link>
          )}
          <button
            onClick={() => void signOut()}
            className="block w-full px-3 py-2 text-left text-xs text-ink hover:bg-steel-50"
          >
            Sign out
          </button>
        </div>
      )}

      {finding && <UnitFinder onClose={() => setFinding(false)} />}
    </div>
  );
}

// ---- icons (inline, no dependency) ----
type IconProps = { active?: boolean };
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function IconGauge({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} strokeWidth={active ? 2.1 : 1.8}>
      <path d="M4 19a8 8 0 1 1 16 0" />
      <path d="M12 15l4-4" />
    </svg>
  );
}
function IconList({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} strokeWidth={active ? 2.1 : 1.8}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}
function IconArrows({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} strokeWidth={active ? 2.1 : 1.8}>
      <path d="M7 17V5m0 0L4 8m3-3l3 3" />
      <path d="M17 7v12m0 0l3-3m-3 3l-3-3" />
    </svg>
  );
}
function IconPlus({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} strokeWidth={active ? 2.1 : 1.8}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  );
}
function IconSite({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} strokeWidth={active ? 2.1 : 1.8}>
      <path d="M4 20h16" />
      <path d="M6 20V9l6-4 6 4v11" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}
function IconClock({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} strokeWidth={active ? 2.1 : 1.8}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 1.5" />
    </svg>
  );
}
