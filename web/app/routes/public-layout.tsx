import { PageIn } from "~/components/PageIn";
import { SiteFooter } from "~/components/SiteFooter";
import { SiteHeader } from "~/components/SiteHeader";

/** Every public page: skip link, header, the page, footer. */
export default function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-20 rounded-full bg-ink px-5 py-3 text-label text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <PageIn />
      </main>
      <SiteFooter />
    </div>
  );
}
