import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useMatches } from "react-router";

import { useTheme } from "~/lib/theme";
import stills from "./stills.json";
import type { StopId } from "./stops";

// Three.js, the scene and its models load only after the page is readable and interactive.
const Scene = lazy(() => import("./Scene"));

/** What a route puts in its `handle` to say where it is in the garden. `still`: no pointer play (clinician screens). */
export type GardenHandle = { garden: { stop: StopId; still?: boolean } };

/** The current page's stop: the deepest matched route that declares one. */
export function useGardenStop() {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = matches[i].handle as Partial<GardenHandle> | undefined;
    if (handle?.garden) return handle.garden;
  }
  return null;
}

/** When the live garden is not right for this device or person, the still picture is all they see. */
function liveAllowed() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return false;
  if ((navigator.hardwareConcurrency ?? 4) <= 2) return false;
  try {
    if (localStorage.getItem("garden") === "off") return false; // Me, "Show the garden"
  } catch {
    // storage blocked: keep the default
  }
  return !!document.createElement("canvas").getContext("webgl2");
}

/** If WebGL fails at run time (lost context, driver trouble), fall back quietly to the still picture. */
class Fallback extends Component<{ onError: () => void; children: React.ReactNode }> {
  componentDidCatch() {
    this.props.onError();
  }
  static getDerivedStateFromError() {
    return null;
  }
  render() {
    return this.props.children;
  }
}

/**
 * The mist over the garden follows the scroll: vivid at the top of a page, misting over as the person reads into
 * it (phones fully, desktops partly, since there the words stay on the misted left). Sets --vivid on the layers.
 */
function useScrollMist() {
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const wide = innerWidth >= 960 && innerWidth / innerHeight > 1.15;
      const vivid = wide ? Math.max(0.55, 1 - scrollY / (1.2 * innerHeight)) : Math.max(0.2, 1 - scrollY / (0.55 * innerHeight));
      document.querySelectorAll<HTMLElement>(".garden-layer").forEach((el) => el.style.setProperty("--vivid", vivid.toFixed(3)));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
}

const hasStill = new Set<string>(stills);

/**
 * The still picture of this stop, behind the whole page: what the server sends, and what anyone without the live
 * scene sees. Each theme and screen shape has its own; the hidden theme's picture is never downloaded (lazy + CSS).
 */
export function GardenStill({ stop }: { stop: StopId }) {
  const picture = (theme: "light" | "dark") => (
    <picture>
      <source media="(min-width: 60rem) and (min-aspect-ratio: 23/20)" srcSet={`/garden/${stop}-${theme}-wide.webp`} />
      <img
        src={`/garden/${stop}-${theme}-narrow.webp`}
        alt=""
        loading="lazy"
        decoding="async"
        className={`size-full object-cover ${theme === "light" ? "dark:hidden" : "hidden dark:block"}`}
      />
    </picture>
  );
  return (
    <div id="garden-still" aria-hidden="true" data-garden-slot={stop} className="garden-layer pointer-events-none z-0">
      {hasStill.has(stop) && (
        <>
          {picture("light")}
          {picture("dark")}
        </>
      )}
    </div>
  );
}

/**
 * The one canvas for the whole visit, mounted once at the root: fixed behind every page, covering the screen.
 * It walks to each page's stop on navigation; it draws while visible, and nothing while the tab is hidden.
 */
export function GardenHost({ stop, still = false }: { stop: StopId; still?: boolean }) {
  const theme = useTheme();
  const [mode, setMode] = useState<"wait" | "live" | "still">("wait");
  const [visibleTab, setVisibleTab] = useState(true);
  const [shown, setShown] = useState(false);
  // Development only (stripped from production builds): scripts/review-garden.mjs sends the garden to any stop.
  const [reviewStop, setReviewStop] = useState<StopId | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { gardenReview: (s: StopId) => void }).gardenReview = setReviewStop;
  }, []);
  useScrollMist();

  // Decide once, after hydration, when the browser is idle.
  useEffect(() => {
    if (!liveAllowed()) return setMode("still");
    const go = () => setMode("live");
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(go, { timeout: 1500 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(go, 300);
    return () => clearTimeout(id);
  }, []);

  // Me, "Show the garden": switching it takes effect at once.
  useEffect(() => {
    const change = () => setMode(liveAllowed() ? "live" : "still");
    window.addEventListener("garden-setting", change);
    return () => window.removeEventListener("garden-setting", change);
  }, []);

  useEffect(() => {
    const update = () => setVisibleTab(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  // A new stop isn't "ready" until the camera has walked there (pages sharing a stop stay ready).
  useEffect(() => {
    delete document.getElementById("garden-still")?.dataset.gardenReady;
  }, [stop]);

  const onSettled = useCallback((arrived: StopId) => {
    setShown(true);
    if (import.meta.env.DEV) document.documentElement.dataset.gardenArrived = arrived;
    const layer = document.getElementById("garden-still");
    if (layer?.dataset.gardenSlot === arrived) layer.dataset.gardenReady = "true";
  }, []);
  const fallback = useCallback(() => setMode("still"), []);
  // A lost drawing context leaves a blank canvas over the page: build a new canvas once the tab is visible again
  // (a hidden tab may lose it again); after three losses, settle for the still picture.
  const [generation, setGeneration] = useState(0);
  const losses = useRef(0);
  const [lostWhileHidden, setLostWhileHidden] = useState(false);
  const onLost = useCallback(() => {
    losses.current += 1;
    if (losses.current > 3) return setMode("still");
    if (document.visibilityState === "visible") setGeneration((g) => g + 1);
    else setLostWhileHidden(true);
  }, []);
  useEffect(() => {
    if (!visibleTab || !lostWhileHidden) return;
    setLostWhileHidden(false);
    setGeneration((g) => g + 1);
  }, [visibleTab, lostWhileHidden]);

  // Once the live scene shows, the still picture underneath is hidden: both are misted behind the words, so it would
  // show through as a second, faint garden (and after a page change, of the next stop before the camera gets there).
  const live = mode === "live" && shown;
  useEffect(() => {
    const still = document.getElementById("garden-still");
    if (!still) return;
    if (live) still.dataset.live = "";
    else delete still.dataset.live;
  }, [live]);

  if (mode !== "live") return null;
  return (
    <div
      aria-hidden="true"
      data-garden-canvas=""
      // Above the still picture (z-0), below the page (z-10); covers the screen, no frame.
      className="garden-layer pointer-events-none z-[1] transition-opacity duration-500"
      style={{ opacity: shown ? 1 : 0 }}
    >
      <Fallback onError={fallback}>
        <Suspense fallback={null}>
          <Scene key={generation} stop={reviewStop ?? stop} theme={theme} still={still} active={visibleTab} onSettled={onSettled} onFallback={fallback} onLost={onLost} />
        </Suspense>
      </Fallback>
    </div>
  );
}
