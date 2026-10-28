import { PageIntro } from "./PageIntro";

/** Help and the legal pages: the heading and a short summary, then readable sections (DESIGN.md, rule 17). */
export function ProsePage({ title, summary, before, children }: { title: string; summary: React.ReactNode; before?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <PageIntro>
        {before}
        <h1 className="text-headline text-balance">{title}</h1>
        <div className="mt-4">{summary}</div>
      </PageIntro>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <div className="prose-page flex max-w-[40rem] flex-col gap-10">{children}</div>
      </div>
    </>
  );
}

export function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id ?? title} className="flex flex-col gap-3">
      <h2 id={id ?? title} className="text-title">
        {title}
      </h2>
      {children}
    </section>
  );
}
