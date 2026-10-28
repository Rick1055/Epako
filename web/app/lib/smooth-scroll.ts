import Lenis from "lenis";
import { useEffect } from "react";

/** DESIGN.md, Scroll: Lenis on long pages (moderate lerp, about 0.1); off under reduced motion, never on forms or Speak. */
export function useSmoothScroll() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.1 });
    let frame = requestAnimationFrame(function step(time) {
      lenis.raf(time);
      frame = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);
}
