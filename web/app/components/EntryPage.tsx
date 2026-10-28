import { Sylva } from "./Sylva";

/**
 * Welcome, Sign in and Sign up (DESIGN.md, Redesign 3): the Sylva tree behind, the page on a cream card. The card keeps
 * the morning colours in either theme (the scheme-light class), so its words always read the same on the dark moss.
 */
export function EntryPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sylva />
      {/* Phones: the tree shows in the top third, the card below it; wider screens: the card on the left, the tree beside it. */}
      <div className="relative z-10 mx-auto max-w-[1120px] px-4 pt-[26svh] pb-16 md:px-10 md:pt-8 lg:pb-[30vh]">
        <div className="max-w-[36rem] rounded-[28px] bg-cream p-6 scheme-light text-ink shadow-[0_16px_48px_rgb(0_0_0/0.28)] md:p-10">
          {children}
        </div>
      </div>
    </>
  );
}
