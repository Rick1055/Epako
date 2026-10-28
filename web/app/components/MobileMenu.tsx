import { useRef } from "react";
import { Link } from "react-router";

import { Icon } from "./Icon";

export type MenuLink = { to: string; label: string };

/**
 * Rule 4: a menu button opening a full-height sheet. A native modal <dialog> gives focus trapping,
 * Escape to close and an inert page behind it; a tap outside the sheet or on any link closes it too.
 */
export function MobileMenu({ links, label = "Menu", className = "" }: { links: MenuLink[]; label?: string; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();

  return (
    <div className={className}>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex min-h-12 items-center gap-2 rounded-full border-[1.5px] border-edge bg-surface px-4 text-label text-ink transition-[scale] duration-160 ease-out active:scale-[0.97]"
      >
        <Icon name="menu" />
        {label}
      </button>
      <dialog
        ref={dialog}
        aria-label={label}
        // A click on the dialog element itself is a click on the backdrop, outside the sheet.
        onClick={(e) => e.target === dialog.current && close()}
        // At most 85% wide, so there is always a real strip of page to tap to close it.
        className="sheet fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(85%,24rem)] max-w-none bg-bg p-0 text-ink backdrop:bg-scrim"
      >
        <div className="flex h-full flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border-[1.5px] border-edge bg-surface px-4 text-label text-ink"
            >
              <Icon name="close" />
              Close
            </button>
          </div>
          <nav aria-label="Pages" className="mt-6">
            <ul>
              {links.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    onClick={close}
                    className="flex min-h-14 items-center justify-between rounded-input px-2 text-title text-ink no-underline"
                  >
                    {link.label}
                    <Icon name="chevron" className="size-5 text-ink-soft" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </dialog>
    </div>
  );
}
