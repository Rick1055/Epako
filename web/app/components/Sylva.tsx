import { useEffect, useRef, useState } from "react";

/**
 * The Sylva tree behind Welcome, Sign in and Sign up (DESIGN.md, Redesign 3): a still picture for everyone, and on
 * capable devices the live moss root (public/sylva/), faded in over it. Building it takes about 2 s of work on the
 * page's thread (a sandboxed frame shares it in Chrome), so it starts only once the visitor has been still for 2.5 s,
 * and never once they have started typing in a form: a form must never stall. If it draws under 30 frames a second
 * it is removed and the still stays.
 */
export function Sylva() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [live, setLive] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.moss = "";
    return () => void delete document.documentElement.dataset.moss;
  }, []);

  useEffect(() => {
    if (!capable()) return;
    let timer = 0;
    const wait = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setLive(true), 2500);
    };
    // Once someone starts filling in a form, the still picture stays for this visit to the page.
    const typing = (e: Event) => {
      if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) return;
      clearTimeout(timer);
      stop();
    };
    const events = ["pointerdown", "keydown", "scroll", "wheel", "touchstart"] as const;
    const stop = () => {
      events.forEach((n) => window.removeEventListener(n, wait));
      window.removeEventListener("focusin", typing);
    };
    events.forEach((n) => window.addEventListener(n, wait, { passive: true }));
    window.addEventListener("focusin", typing);
    wait();
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, []);

  useEffect(() => {
    if (!live) return;
    // The frame's origin is opaque (sandboxed), so its messages are recognised by where they come from.
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || typeof e.data?.sylva !== "string") return;
      if (e.data.sylva === "ready") setShown(true);
      if (e.data.sylva === "slow") setLive(false);
    };
    // The frame takes no pointer events, so the pointer is passed on (once a frame at most).
    let queued = 0;
    const onMove = (e: PointerEvent) => {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        frame.current?.contentWindow?.postMessage({ sylva: "pointer", x: e.clientX, y: e.clientY }, "*");
      });
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(queued);
    };
  }, [live]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-moss overflow-hidden">
      <div className="relative size-full -translate-y-10 sm:-translate-y-16 md:-translate-y-20 lg:-translate-y-28 scale-[1.08] origin-top">
      <picture>
        <source media="(min-width: 901px)" srcSet="/sylva/still-wide-2.webp" />
        <img src="/sylva/still-narrow-3.webp" alt="" decoding="async" fetchPriority="low" className="size-full object-cover object-top max-[900px]:h-auto" />
      </picture>
      {live && (
        <iframe
          ref={frame}
          src="/sylva/index.html"
          title=""
          tabIndex={-1}
          sandbox="allow-scripts"
          className={"absolute inset-0 size-full border-0 transition-opacity duration-700 " + (shown ? "opacity-100" : "opacity-0")}
        />
      )}
      </div>
    </div>
  );
}

/** Only where the live scene will run smoothly: a mouse, a wide screen, 8+ threads, 8 GB+, no data saving, WebGL 2. */
function capable() {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (/(?:^|;\s*)calm=1/.test(document.cookie)) return false; // user chose calm mode in Me
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(pointer: fine)").matches || innerWidth < 901) return false;
  if (nav.connection?.saveData || (nav.hardwareConcurrency ?? 0) < 8 || (nav.deviceMemory !== undefined && nav.deviceMemory < 8)) return false;
  return !!document.createElement("canvas").getContext("webgl2");
}
