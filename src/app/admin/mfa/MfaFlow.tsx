"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Button, Field, Notice, PinInput } from "@/components/ui";

type Enrolment = { factorId: string; qr: string; secret: string };

export function MfaFlow({
  mode,
  supabaseUrl,
  supabaseAnonKey,
}: {
  mode: "enrol" | "verify";
  supabaseUrl: string;
  supabaseAnonKey: string;
}) {
  const router = useRouter();
  const [supabase] = useState(() => createClient(supabaseUrl, supabaseAnonKey));
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) return setError(listError.message);

      if (mode === "verify") {
        const verified = data.totp[0];
        if (!cancelled) setFactorId(verified?.id ?? null);
        return;
      }

      // Clear any half-finished enrolment, then start a fresh one.
      for (const f of data.all.filter((f) => f.status === "unverified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: enrolled, error: enrolError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `naavcaptured ${new Date().toISOString().slice(0, 10)}`,
      });
      if (enrolError) return setError(enrolError.message);
      if (!cancelled) {
        setEnrolment({ factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret });
        setFactorId(enrolled.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (verifyError) {
      setError("That code didn't work. Check the time on your phone and try the newest code.");
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {mode === "enrol" ? (
        <div className="flex flex-col gap-3">
          <p>
            Scan this with an authenticator app (Google Authenticator, 1Password, Authy). You&apos;ll need a code from it
            every time you sign in.
          </p>
          {enrolment ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enrolment.qr} alt="Authenticator QR code" className="size-48 rounded-media bg-white p-2" />
              <p className="nc-meta break-all">
                Can&apos;t scan? Enter this key: <span className="font-bold text-ink">{enrolment.secret}</span>
              </p>
            </>
          ) : (
            <p className="nc-meta">Preparing your code…</p>
          )}
        </div>
      ) : (
        <p>Enter the 6-digit code from your authenticator app.</p>
      )}

      {error ? <Notice tone="rust">{error}</Notice> : null}

      <Field label="Code">
        <PinInput
          name="code"
          maxLength={6}
          minLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          required
          autoFocus
        />
      </Field>
      <Button variant="primary" type="submit" disabled={busy || !factorId || code.length !== 6}>
        {busy ? "Checking…" : mode === "enrol" ? "Turn on 2FA" : "Continue"}
      </Button>
    </form>
  );
}
