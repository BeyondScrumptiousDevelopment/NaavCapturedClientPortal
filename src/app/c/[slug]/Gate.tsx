"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Notice, PinInput } from "@/components/ui";
import { enterPinAction, requestCodeAction, verifyCodeAction, type CodeState } from "./actions";

export function Gate({ slug, ownerLabel, allowGuests }: { slug: string; ownerLabel: string; allowGuests: boolean }) {
  const [mode, setMode] = useState<"login" | "guest">("login");

  return (
    <div className="flex flex-col gap-6">
      {allowGuests ? (
        <div role="tablist" className="grid grid-cols-2 rounded-pill border border-stone bg-surface p-1 text-sm font-bold">
          {(["login", "guest"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              type="button"
              onClick={() => setMode(m)}
              className={`h-10 rounded-pill ${mode === m ? "bg-ink text-on-ink" : "text-ink"}`}
            >
              {m === "login" ? `I'm ${ownerLabel}` : "I'm a guest"}
            </button>
          ))}
        </div>
      ) : null}
      {mode === "login" ? <CodeLogin slug={slug} /> : <GuestPin slug={slug} />}
    </div>
  );
}

function CodeLogin({ slug }: { slug: string }) {
  const [requestState, requestAction, requesting] = useActionState<CodeState, FormData>(requestCodeAction, { step: "email" });
  const [verifyState, verifyAction, verifying] = useActionState<CodeState, FormData>(verifyCodeAction, {});
  const [restart, setRestart] = useState(false);

  const onCodeStep = !restart && (verifyState.step ?? requestState.step) === "code";
  const email = verifyState.email ?? requestState.email ?? "";

  if (!onCodeStep) {
    return (
      <form
        action={(fd) => {
          setRestart(false);
          return requestAction(fd);
        }}
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="slug" value={slug} />
        <p>Enter your email and we&apos;ll send you a code to sign in. No password needed.</p>
        {(verifyState.step === "email" && verifyState.error) || requestState.error ? (
          <Notice tone="rust">{requestState.error ?? verifyState.error}</Notice>
        ) : null}
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" defaultValue={email} required />
        </Field>
        <Button variant="primary" type="submit" disabled={requesting}>
          {requesting ? "Sending…" : "Email me a code"}
        </Button>
      </form>
    );
  }

  return (
    <form action={verifyAction} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="email" value={email} />
      {verifyState.error ? <Notice tone="rust">{verifyState.error}</Notice> : <Notice>{requestState.ok}</Notice>}
      <Field label={`Code sent to ${email}`}>
        <PinInput name="token" maxLength={10} minLength={6} required autoFocus />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" type="submit" disabled={verifying}>
          {verifying ? "Checking…" : "Sign in"}
        </Button>
        <Button variant="quiet" type="button" onClick={() => setRestart(true)}>
          Use a different email
        </Button>
      </div>
    </form>
  );
}

function GuestPin({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(enterPinAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
      <p>Enter the gallery PIN the couple shared with you.</p>
      {state.error ? <Notice tone="rust">{state.error}</Notice> : null}
      <Field label="Gallery PIN">
        <PinInput name="pin" maxLength={10} minLength={6} required autoComplete="off" />
      </Field>
      <Button variant="primary" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Open gallery"}
      </Button>
    </form>
  );
}
