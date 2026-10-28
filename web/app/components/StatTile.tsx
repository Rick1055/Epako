import CountUp from "./reactbits/CountUp";

/** A number that matters, counted up once as it comes into view (React Bits CountUp), with its plain-words label. */
export function StatTile({ label, value, suffix = "", note }: { label: string; value: number | null; suffix?: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[1rem] text-ink-soft">{label}</dt>
      <dd className="text-headline">{value === null ? "–" : <CountUp to={value} duration={0.9} suffix={suffix} />}</dd>
      {note && <dd className="text-[1rem] text-ink-soft">{note}</dd>}
    </div>
  );
}
