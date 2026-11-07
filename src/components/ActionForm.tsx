"use client";

import { useActionState, type ReactNode } from "react";
import { Button, Notice, cx } from "@/components/ui";
import type { FormState } from "@/lib/form";

/** A form bound to a server action that returns { error } or { ok }, with inline feedback. */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
  variant = "primary",
  className,
  confirm,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  className?: string;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      action={formAction}
      className={cx("flex flex-col gap-4", className)}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state.error ? <Notice tone="rust">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="sage">{state.ok}</Notice> : null}
      <div>
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
