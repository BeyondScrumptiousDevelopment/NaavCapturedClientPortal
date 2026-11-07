import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** naav (italic serif) + captured. (Nunito Sans 900), always together, full stop included. */
export function Wordmark({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <span
      className={cx("inline-flex items-baseline whitespace-nowrap leading-none text-ink", className)}
      style={{ fontSize: size, gap: "0.06em" }}
      aria-label="naavcaptured."
    >
      <span className="nc-accent" style={{ fontSize: "1.02em" }} aria-hidden>
        naav
      </span>
      <span className="font-black" style={{ letterSpacing: "-0.05em" }} aria-hidden>
        captured.
      </span>
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const buttonBase =
  "inline-flex h-11 items-center justify-center gap-2 rounded-pill border-[1.5px] px-6 text-[15px] font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "border-ink bg-ink text-on-ink hover:opacity-90",
  secondary: "border-ink bg-transparent text-ink hover:bg-ink/5",
  quiet: "border-transparent bg-transparent px-2 text-ink underline underline-offset-4",
  danger: "border-rust bg-transparent text-rust hover:bg-rust/5",
};

export function Button({
  variant = "secondary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={cx(buttonBase, buttonVariants[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cx(buttonBase, buttonVariants[variant], className)} {...props} />;
}

export type Tone = "neutral" | "sage" | "amber" | "rust";

const badgeTone: Record<Tone, string> = {
  neutral: "text-ink",
  sage: "text-sage",
  amber: "text-amber",
  rust: "text-rust",
};

/** Status badge. Colour is only ever used for status: paid/approved, pending, overdue/clash. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "nc-label inline-flex items-center gap-1.5 rounded-pill bg-status-tint px-2.5 py-1 text-[12px]",
        badgeTone[tone],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export function Card({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section className={cx("rounded-card border border-stone bg-surface p-4 sm:p-6", className)} {...props}>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("flex flex-col gap-1 text-sm font-medium", className)}>
      <span>{label}</span>
      {children}
      {hint ? <span className="text-sm font-normal text-ash">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-card border border-stone bg-surface px-4 text-base text-ink placeholder:text-ash";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(inputClass, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputClass, "h-auto min-h-24 py-3", className)} {...props} />;
}

export function PinInput(props: ComponentProps<"input">) {
  return (
    <input
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      className="h-12 w-full max-w-[240px] rounded-pill border border-stone bg-surface px-4 text-center text-lg tracking-[0.5em] text-ink"
      {...props}
    />
  );
}

export function Checkbox({ label, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-ink" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <p
      role={tone === "rust" ? "alert" : "status"}
      className={cx("rounded-card bg-status-tint px-4 py-3 text-sm", badgeTone[tone])}
    >
      {children}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-card border border-dashed border-stone px-4 py-6 text-center text-sm text-ash">{children}</p>;
}

export { cx };
