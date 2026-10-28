import { Link } from "react-router";

import { SITE_NAME } from "~/lib/site";

/** The tree mark and name; always a link home (rule 9). Signed-in screens pass to="/home". */
export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link
      to={to}
      aria-label={`${SITE_NAME}, home`}
      className="inline-flex min-h-12 items-center gap-2.5 rounded-input text-title text-ink no-underline"
    >
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="size-8 shrink-0">
        <path d="M16 30V17" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M16 21l-4.5-3.5M16 19l4-3" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="11" r="8" fill="var(--fill)" />
        <circle cx="9.5" cy="15.5" r="5" fill="var(--fill)" />
        <circle cx="22.5" cy="15" r="5.5" fill="var(--fill)" />
        <circle cx="20" cy="8" r="2" fill="var(--primary)" />
      </svg>
      <span className="whitespace-nowrap">{SITE_NAME}</span>
    </Link>
  );
}
