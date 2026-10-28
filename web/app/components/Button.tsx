import { Link, type LinkProps } from "react-router";

// DESIGN.md, Buttons: one coral primary per screen; secondary teal (mint in the evening); quiet; danger.
const base =
  "inline-flex items-center justify-center gap-2 rounded-full text-label no-underline select-none " +
  // Tailwind 4 moves with the separate translate and scale properties, so those are what transition.
  "transition-[translate,scale,background-color] duration-160 ease-out active:scale-[0.97] " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";

const variants = {
  primary:
    "min-h-14 px-8 border-[1.5px] border-primary-edge bg-primary text-primary-ink hover:-translate-y-px active:bg-primary-press",
  secondary: "min-h-13 px-7 bg-secondary text-secondary-ink hover:-translate-y-px active:bg-secondary-press",
  quiet: "min-h-12 px-3 text-link underline-offset-4 hover:underline",
  danger: "min-h-13 px-7 border-2 border-error bg-surface text-error",
} as const;

type Variant = keyof typeof variants;

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `${base} ${variants[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...rest} />;
}

export function ButtonLink({ variant = "primary", className = "", ...rest }: LinkProps & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...rest} />;
}
