import { deviceTheme, saveTheme, type Theme } from "~/lib/theme";
import { Icon } from "./Icon";

// Which icon and name show is decided by CSS (the dark: variant), so the server-rendered button is right before any script runs.
export function ThemeToggle({ className = "inline-flex" }: { className?: string }) {
  function toggle() {
    const current = (document.documentElement.dataset.theme as Theme | undefined) ?? deviceTheme();
    const next: Theme = current === "dark" ? "light" : "dark";
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !reduce) document.startViewTransition(() => saveTheme(next));
    else saveTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`group relative ${className} size-12 shrink-0 items-center justify-center rounded-full border-[1.5px] border-edge bg-surface text-ink transition-[scale] duration-160 ease-out active:scale-[0.97]`}
    >
      <span className="dark:hidden">
        <Icon name="moon" />
        <span className="sr-only">Switch to the evening look</span>
      </span>
      <span className="hidden dark:inline">
        <Icon name="sun" />
        <span className="sr-only">Switch to the morning look</span>
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-full right-0 z-10 mt-2 hidden rounded-input bg-ink px-3 py-1.5 text-[1rem] whitespace-nowrap text-bg shadow-float group-hover:block group-focus-visible:block"
      >
        <span className="dark:hidden">Evening look</span>
        <span className="hidden dark:inline">Morning look</span>
      </span>
    </button>
  );
}
