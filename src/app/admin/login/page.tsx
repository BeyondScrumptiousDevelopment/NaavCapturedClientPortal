import { redirect } from "next/navigation";
import { Card, Wordmark } from "@/components/ui";
import { adminGate } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Admin sign in" };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const gate = await adminGate();
  if (gate.status === "ok") redirect("/admin");
  if (gate.status === "needs-enrol" || gate.status === "needs-verify") redirect("/admin/mfa");

  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4 py-12">
      <Wordmark size={28} />
      <Card>
        <h1 className="nc-h1 mb-6">studio sign in.</h1>
        <LoginForm initialError={error === "not-admin" ? "This account doesn't have studio access." : undefined} />
      </Card>
    </main>
  );
}
