import { redirect } from "next/navigation";
import { Card, Wordmark } from "@/components/ui";
import { adminGate } from "@/lib/auth";
import { env } from "@/lib/env";
import { MfaFlow } from "./MfaFlow";

export const metadata = { title: "Two-factor check" };

export default async function MfaPage() {
  const gate = await adminGate();
  if (gate.status === "ok") redirect("/admin");
  if (gate.status === "signed-out") redirect("/admin/login");
  if (gate.status === "not-admin") redirect("/admin/login?error=not-admin");

  const mode = gate.status === "needs-enrol" ? "enrol" : "verify";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4 py-12">
      <Wordmark size={28} />
      <Card>
        <h1 className="nc-h1 mb-6">{mode === "enrol" ? "set up 2fa." : "one more step."}</h1>
        <MfaFlow mode={mode} supabaseUrl={env.supabaseUrl()} supabaseAnonKey={env.supabaseAnonKey()} />
        <form action="/auth/signout" method="post" className="mt-4">
          <button className="nc-meta underline underline-offset-4" type="submit">
            Sign out
          </button>
        </form>
      </Card>
    </main>
  );
}
