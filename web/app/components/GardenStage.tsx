const sizes = {
  // Welcome: the opening words fill the first screen on the misted left (desktop) or below the garden (phone).
  hero: "pt-[42svh] pb-16 lg:flex lg:min-h-[calc(100svh-4.5rem)] lg:items-center lg:pt-0 lg:pb-[8vh]",
  // Every other page: the heading, with room above it on phones for the vivid garden.
  band: "pt-[40svh] pb-6 lg:pt-[14vh] lg:pb-8",
} as const;

/**
 * The top of a page: its opening words, in the column the garden leaves calm. (The garden itself covers the whole
 * screen behind the page; the route says which stop in its `handle`.)
 */
export function GardenStage({ size = "band", children }: { size?: keyof typeof sizes; children: React.ReactNode }) {
  return (
    <section className={`mx-auto max-w-[1120px] px-5 md:px-10 ${sizes[size]}`}>
      <div className="w-full lg:max-w-[min(34rem,40vw)]">{children}</div>
    </section>
  );
}
