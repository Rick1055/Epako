import { useEffect } from "react";
import { NavLink, redirect, useNavigate } from "react-router";

import { Icon, type IconName } from "~/components/Icon";
import { Logo } from "~/components/Logo";
import { MobileMenu, type MenuLink } from "~/components/MobileMenu";
import { PageIn } from "~/components/PageIn";
import { SiteFooter } from "~/components/SiteFooter";
import { ThemeToggle } from "~/components/ThemeToggle";
import { requireSession, supabase } from "~/lib/supabase";
import type { Route } from "./+types/app-layout";

// Signed-in patient pages. The login lives only in the browser, so the server renders just this shell (rule 35).
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const s = await requireSession(request);
  const { data: clinician } = await supabase().from("clinicians").select("user_id").eq("user_id", s.user.id).maybeSingle();
  if (clinician) throw redirect("/clinician");
  return null;
}

const tabs: { to: string; label: string; icon: IconName }[] = [
  { to: "/home", label: "Home", icon: "home" },
  { to: "/progress", label: "Progress", icon: "chart" },
  { to: "/speak", label: "Speak", icon: "mic" },
  { to: "/voice", label: "My voice", icon: "wave" },
  { to: "/me", label: "Me", icon: "person" },
];

// The header's menu (DESIGN.md, Redesign 5): help, the legal pages and signing out. Care team is a card on Me.
const more: MenuLink[] = [
  { to: "/care", label: "Care team" },
  { to: "/help", label: "Help" },
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/accessibility", label: "Accessibility" },
  { to: "/sign-out", label: "Sign out" },
];

function Header() {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-[1120px] items-center justify-between gap-4 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:px-10">
      <div className="lg:hidden">
        <Logo to="/home" />
      </div>
      <div className="flex items-center gap-2">
        {/* Phones: the theme lives on Me, so the header is the logo and the menu. */}
        <ThemeToggle className="hidden lg:inline-flex" />
        <MobileMenu links={more} label="Menu" className="lg:hidden" />
      </div>
    </header>
  );
}

/** Desktop: a left rail. Phones: a bottom tab bar with Speak centred and larger. Active = fill and weight. */
function Nav() {
  return (
    <nav aria-label="Main" className="app-rail fixed inset-x-0 bottom-0 z-20 border-t border-card-line bg-surface pb-[env(safe-area-inset-bottom)] lg:inset-x-auto lg:top-0 lg:left-0 lg:w-28 lg:border-t-0 lg:bg-transparent lg:pt-6 lg:pb-0">
      <div className="hidden lg:flex lg:flex-col lg:items-center lg:mb-8 lg:pt-2">
        <Logo to="/home" vertical />
      </div>
      <ul className="mx-auto flex max-w-[640px] items-end justify-around px-1 lg:flex-col lg:items-stretch lg:gap-2 lg:px-3">
        {tabs.map((t) => (
          <li key={t.to} className="flex-1 lg:flex-none">
            <NavLink
              to={t.to}
              className={({ isActive }) =>
                "group flex min-h-16 flex-col items-center justify-center gap-1 rounded-card px-1 py-2 text-[0.875rem] leading-tight text-ink no-underline transition-[background-color] duration-160 " +
                (isActive ? "font-bold" : "font-normal")
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={
                      "inline-flex items-center justify-center rounded-full transition-[background-color,scale] duration-160 ease-out group-active:scale-[0.97] " +
                      (t.to === "/speak" ? "size-14 -mt-6 lg:mt-0 bg-secondary text-secondary-ink " : "h-8 w-14 ") +
                      (isActive && t.to !== "/speak" ? "bg-raised" : "")
                    }
                  >
                    <Icon name={t.icon} />
                  </span>
                  {t.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    // Signing out in another tab signs out here too.
    const { data } = supabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        navigate("/sign-in");
      }
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="flex min-h-dvh flex-col pb-24 lg:pb-0 lg:pl-28">
      <a href="#main" className="sr-only z-30 rounded-full bg-ink px-5 py-3 text-label text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <Header />
      <Nav />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <PageIn />
      </main>
      <SiteFooter home="/home" />
    </div>
  );
}

/** Shown while the browser checks the login (and as the server-rendered shell). */
export function HydrateFallback() {
  return (
    <div className="flex min-h-dvh flex-col lg:pl-28">
      <Header />
      <main id="main" className="mx-auto w-full max-w-[1120px] px-5 pt-8 md:px-10 lg:pt-12">
        <p className="text-ink-soft">Getting things ready…</p>
      </main>
    </div>
  );
}
