import { Icon } from "./Icon";

/**
 * DESIGN.md, Success and error messages: always an icon and words, never colour alone.
 * Success is announced politely; an error interrupts (role="alert") because it blocks the person.
 */
export function Message({ tone, children }: { tone: "success" | "error"; children: React.ReactNode }) {
  const success = tone === "success";
  return (
    <div
      role={success ? "status" : "alert"}
      className={
        "flex items-start gap-3 rounded-card px-5 py-4 " +
        (success ? "bg-raised text-ink" : "border-[1.5px] border-error bg-surface text-ink")
      }
    >
      <Icon name={success ? "check" : "alert"} className={"mt-0.5 size-6 shrink-0 " + (success ? "text-link" : "text-error")} />
      <div>{children}</div>
    </div>
  );
}
