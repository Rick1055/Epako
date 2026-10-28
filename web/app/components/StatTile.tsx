/** A number that matters, with its plain-words label. */
export function StatTile({ label, value, suffix = "", note }: { label: string; value: number | null; suffix?: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[1rem] text-ink-soft">{label}</dt>
      <dd className="text-headline">{value === null ? "–" : `${value}${suffix}`}</dd>
      {note && <dd className="text-[1rem] text-ink-soft">{note}</dd>}
    </div>
  );
}
