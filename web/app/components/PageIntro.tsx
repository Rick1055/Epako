/** The top of a page: its heading and opening words, at the top of the screen, in a readable column. */
export function PageIntro({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-[1120px] px-5 pt-8 pb-6 md:px-10 lg:pt-12 lg:pb-8">
      <div className="w-full max-w-[40rem]">{children}</div>
    </section>
  );
}
