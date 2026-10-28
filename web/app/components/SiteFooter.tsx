import { Link } from "react-router";

import { contact, SITE_NAME } from "~/lib/site";
import { Logo } from "./Logo";

const links = [
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/accessibility", label: "Accessibility" },
  { to: "/help", label: "Help" },
];

/** DESIGN.md, Footer: the same on every page; contact links are real mailto/tel links (rules 6, 11, 12, 16). */
export function SiteFooter({ home = "/" }: { home?: string }) {
  const linkClass = "inline-flex min-h-12 items-center text-link underline-offset-4 hover:underline";
  return (
    <footer className="bg-bg-deep">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-5 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))] md:px-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <Logo to={home} />
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6">
              {links.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-x-6 sm:flex-row sm:flex-wrap">
            <a href={`mailto:${contact.email}`} className={linkClass}>
              {contact.email}
            </a>
            <a href={contact.phoneHref} className={linkClass}>
              {contact.phone}
            </a>
          </div>
          <p className="text-ink-soft">
            © {new Date().getFullYear()} {SITE_NAME}
          </p>
        </div>
      </div>
    </footer>
  );
}
