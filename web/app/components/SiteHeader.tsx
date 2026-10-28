import { Link } from "react-router";

import { Logo } from "./Logo";
import { MobileMenu, type MenuLink } from "./MobileMenu";
import { ThemeToggle } from "./ThemeToggle";

const menu: MenuLink[] = [
  { to: "/sign-in", label: "Sign in" },
  { to: "/sign-up", label: "Create an account" },
  { to: "/help", label: "Help" },
  { to: "/clinician/sign-up", label: "I'm a clinician" },
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/accessibility", label: "Accessibility" },
];

/** Header for public pages: logo, theme toggle, and a menu (inline links from tablets up, a sheet on phones). */
export function SiteHeader() {
  const linkClass = "inline-flex min-h-12 items-center px-3 text-label text-ink underline-offset-4 hover:underline";
  return (
    // Transparent, over the top of the page's garden; z-10 keeps it above the scene.
    <header className="relative z-10 mx-auto flex w-full max-w-[1120px] items-center justify-between gap-4 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:px-10">
      <Logo />
      <div className="flex items-center gap-2">
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center">
            <li>
              <Link to="/help" className={linkClass}>
                Help
              </Link>
            </li>
            <li>
              <Link to="/sign-in" className={linkClass}>
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
        <ThemeToggle />
        <MobileMenu links={menu} className="md:hidden" />
      </div>
    </header>
  );
}
