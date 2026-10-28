import { useId, useState } from "react";

import type { Day } from "~/lib/progress";
import { dayKey, weekday } from "~/lib/progress";

export type Measure = "phrases" | "spotOn" | "minutes";

export const value = (d: Day, m: Measure) => (m === "phrases" ? d.phrases : m === "minutes" ? Math.round(d.minutes) : d.phrases ? Math.round((100 * d.confirmed) / d.phrases) : null);
const label = (v: number | null, m: Measure) => (v === null ? "no phrases" : m === "spotOn" ? `${v}%` : m === "minutes" ? `${v} min` : `${v} ${v === 1 ? "phrase" : "phrases"}`);
const dateWords = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/**
 * One calm bar chart (dataviz: one series, so no legend; the heading names it). Thin bars with 4px rounded tops
 * standing on a quiet baseline, a 2px gap between them, a tooltip on hover and focus, labels only on today and the
 * best day, an optional reference line, no red anywhere, and the same numbers as a table one tap away.
 */
export function DayBars({ days, measure, title, height = 144, goal }: { days: Day[]; measure: Measure; title: string; height?: number; goal?: number }) {
  const values = days.map((d) => value(d, measure));
  const top = measure === "spotOn" ? 100 : Math.max(1, goal ?? 0, ...values.map((v) => v ?? 0));
  const best = Math.max(...values.map((v) => v ?? 0));
  const today = dayKey(new Date());
  const dense = days.length > 10;
  const [hover, setHover] = useState<number | null>(null);
  const tableId = useId();

  return (
    <figure className="m-0">
      <div className="relative" style={{ height: height + 28 }} onPointerLeave={() => setHover(null)}>
        {goal !== undefined && (
          <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-edge" style={{ bottom: 28 + (height * goal) / top }}>
            <span className="absolute -top-6 right-0 text-[1rem] text-ink-soft">Daily {goal}</span>
          </div>
        )}
        <ol className={"absolute inset-x-0 top-0 grid items-end " + (dense ? "gap-[2px]" : "gap-2")} style={{ height, gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((d, i) => {
            const v = values[i];
            const isToday = d.date === today;
            const named = !dense && v !== null && v > 0 && (isToday || v === best);
            return (
              <li key={d.date} className="relative flex h-full flex-col items-center justify-end">
                {named && <span className="mb-1 text-[1rem] font-semibold text-ink">{measure === "spotOn" ? `${v}%` : v}</span>}
                <button
                  type="button"
                  aria-label={`${dateWords(d.date)}: ${label(v, measure)}`}
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="flex w-full justify-center outline-offset-2"
                  style={{ height: v ? Math.max(6, (height * v) / top) : 6 }}
                >
                  <span className={"h-full w-full max-w-8 rounded-t-[4px] transition-[opacity] duration-150 " + (v ? "bg-chart" : "bg-track") + (hover !== null && hover !== i ? " opacity-55" : "")} />
                </button>
                {hover === i && (
                  <span role="tooltip" className="pointer-events-none absolute bottom-full z-10 mb-2 rounded-input bg-ink px-3 py-1.5 text-[1rem] whitespace-nowrap text-bg shadow-float">
                    {weekday(d.date, "long")}: {label(v, measure)}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <div className="absolute inset-x-0 border-t border-edge" style={{ top: height }} />
        <ol aria-hidden="true" className={"absolute inset-x-0 bottom-0 grid " + (dense ? "gap-[2px]" : "gap-2")} style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((d, i) => (
            <li key={d.date} className={"text-center text-[1rem] " + (d.date === today ? "font-bold text-ink" : "text-ink-soft")}>
              {dense ? (i % 7 === days.length % 7 ? new Date(`${d.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "") : weekday(d.date).slice(0, 2)}
            </li>
          ))}
        </ol>
      </div>
      <details className="mt-4">
        <summary className="inline-flex min-h-12 cursor-pointer items-center text-[1rem] font-semibold text-link">See the numbers</summary>
        <table id={tableId} className="mt-2 w-full text-left text-[1rem]">
          <caption className="sr-only">{title}, day by day</caption>
          <thead>
            <tr className="border-b border-card-line">
              <th className="py-2 font-semibold">Day</th>
              <th className="py-2 font-semibold">{title}</th>
            </tr>
          </thead>
          <tbody>
            {days
              .map((d, i) => [d, values[i]] as const)
              .reverse()
              .map(([d, v]) => (
                <tr key={d.date} className="border-b border-card-line last:border-0">
                  <td className="py-2">{dateWords(d.date)}</td>
                  <td className="py-2">{label(v, measure)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
