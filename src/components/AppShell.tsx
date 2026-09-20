"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { UnitFinder } from "@/components/UnitFinder";
import { ThemeToggle } from "@/components/ThemeToggle";

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

  const current = nav.find((n) => isActive(pathname, n.href));

  return (
    <div className="min-h-dvh md:flex">
      {/* Rail — fixed on desktop, so long tables scroll under a steady nav. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-line bg-sidebar md:flex">
        <Link href="/" className="flex items-center gap-2.5 px-4 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rust-500 text-sm font-bold text-white">
            SG
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-sidebar-fg">Sai Group</span>
            <span className="block text-[11px] text-muted">Inventory</span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
          {nav.map((n) => {
            const active = isActive(pathname, n.href);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-fg"
                    : "text-muted hover:bg-sidebar-accent/60 hover:text-sidebar-fg"
                }`}
              >
                <Icon active={active} />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-line p-3">
          <UserMenu align="up" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        {/* Slim bar: page name on desktop, brand and account on phones. */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-paper/80 px-4 py-3 backdrop-blur md:px-6">
          <Link href="/" className="flex items-center gap-2 md:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rust-500 text-xs font-bold text-white">
              SG
            </span>
          </Link>
          <h1 className="truncate text-base font-semibold text-ink">
            {current?.label ?? "Sai Group inventory"}
          </h1>
          <div className="ml-auto md:hidden">
            <UserMenu />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-4 md:px-6 md:pb-8 md:pt-6">{children}</main>
      </div>

      {/* Mobile tab bar — thumb-reachable on the shop floor, where a side rail
          would cost a tap to open every time. */}
      <nav
        className="surface-pop fixed inset-x-0 bottom-0 z-30 grid rounded-none border-t border-line md:hidden"
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

function UserMenu({ align = "down" }: { align?: "up" | "down" }) {
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
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted transition-colors hover:bg-sidebar-accent ${
          align === "up" ? "" : "border border-line"
        }`}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-steel-600 text-[10px] font-bold text-on-primary">
          {initial}
        </span>
        <span className="hidden min-w-0 flex-1 truncate text-left text-ink sm:inline">{name}</span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            isAdmin ? "bg-rust-50 text-rust-600" : "bg-steel-50 text-muted"
          }`}
        >
          {isAdmin ? "Admin" : "Viewer"}
        </span>
      </button>

      {open && (
        <div
          className={`surface-pop absolute z-40 w-56 py-1 ${
            align === "up" ? "bottom-full left-0 mb-1.5" : "right-0 mt-1.5"
          }`}
        >
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
          <div className="border-t border-line">
            <ThemeToggle />
          </div>
          <button
            onClick={() => void signOut()}
            className="block w-full border-t border-line px-3 py-2 text-left text-xs text-ink hover:bg-steel-50"
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
