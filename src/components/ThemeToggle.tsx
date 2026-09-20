"use client";

import { useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const KEY = "sai-theme";

/**
 * Runs before the page paints, so the right theme is on <html> from the first
 * frame — otherwise a dark-mode user gets a white flash on every page load.
 * Kept as a string because it has to be inlined into the document head.
 */
export const THEME_SCRIPT = `
try {
  var t = localStorage.getItem('${KEY}');
  var dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
} catch (e) {}
`;

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

// The choice lives in localStorage, which React cannot see on its own, so it
// is read through useSyncExternalStore rather than copied into state — that
// keeps every mounted toggle in agreement without an effect writing state.
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  // `storage` only fires in OTHER tabs, so a second tab follows along too.
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): Theme {
  const t = localStorage.getItem(KEY);
  return t === "dark" || t === "light" ? t : "system";
}

/** The server cannot know the device preference; the inline script fixes it up. */
function getServerSnapshot(): Theme {
  return "system";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // "System" has to keep following the device after the first paint — someone
  // on a phone that flips to dark at sunset should not have to reload.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const choose = (next: Theme) => {
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
    apply(next);
    listeners.forEach((l) => l());
  };

  const options: { value: Theme; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "Auto" },
  ];

  return (
    <div className="px-3 py-2">
      <span className="mb-1.5 block text-[11px] font-semibold text-muted">Appearance</span>
      <div className="flex gap-1 rounded-lg bg-steel-50 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => choose(o.value)}
            className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
              theme === o.value ? "bg-card text-ink shadow-xs" : "text-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
