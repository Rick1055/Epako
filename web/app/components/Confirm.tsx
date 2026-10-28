import { useEffect, useRef } from "react";

import { Button } from "./Button";

/** A confirmation as a native modal dialog (focus trapped, Escape cancels). The safe choice is first and focused. */
export function Confirm({
  title,
  children,
  confirm,
  cancel = "Keep it",
  onConfirm,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  confirm: string;
  cancel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={onCancel}
      className="m-auto w-[min(100%-2.5rem,28rem)] rounded-card bg-bg p-6 text-ink shadow-float backdrop:bg-scrim"
    >
      <h2 id="confirm-title" className="text-title">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button variant="secondary" onClick={onCancel} autoFocus>
          {cancel}
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirm}
        </Button>
      </div>
    </dialog>
  );
}
