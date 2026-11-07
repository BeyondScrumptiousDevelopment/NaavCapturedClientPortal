import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import type { Client, Profile } from "@/lib/types";

/** The signed-in Supabase user and their profile, if any. */
export const getSessionProfile = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null as Profile | null };
  // Read via service role: RLS on profiles requires aal2 for admins, and we need the role first.
  const { data: profile } = await createServiceClient().from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { supabase, user, profile: (profile as Profile | null) ?? null };
});

export type AdminGate =
  | { status: "ok" }
  | { status: "signed-out" }
  | { status: "not-admin" }
  | { status: "needs-enrol" }
  | { status: "needs-verify" };

export async function adminGate(): Promise<AdminGate> {
  const { supabase, user, profile } = await getSessionProfile();
  if (!user) return { status: "signed-out" };
  if (profile?.role !== "admin") return { status: "not-admin" };

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") return { status: "ok" };
  return { status: aal?.nextLevel === "aal2" ? "needs-verify" : "needs-enrol" };
}

/** Use at the top of every admin page and admin server action. */
export async function requireAdmin() {
  const gate = await adminGate();
  switch (gate.status) {
    case "ok": {
      const { supabase, user, profile } = await getSessionProfile();
      return { supabase, user: user!, profile: profile! };
    }
    case "signed-out":
      redirect("/admin/login");
    case "not-admin":
      redirect("/admin/login?error=not-admin");
    case "needs-enrol":
    case "needs-verify":
      redirect("/admin/mfa");
  }
}

/** Load a client by its link slug, only if the link is live. Uses the service role (visitor may be anonymous). */
export async function loadClientBySlug(slug: string): Promise<Client | null> {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;
  const { data } = await createServiceClient().from("clients").select("*").eq("slug", slug).maybeSingle();
  const client = data as Client | null;
  if (!client) return null;
  if (!isLinkLive(client)) return null;
  return client;
}

export function isLinkLive(client: Pick<Client, "link_enabled" | "link_expires_at" | "archived_at">): boolean {
  if (!client.link_enabled || client.archived_at) return false;
  if (client.link_expires_at && new Date(client.link_expires_at).getTime() <= Date.now()) return false;
  return true;
}

/** The signed-in person, if they belong to this client. */
export async function getClientMember(client: Client) {
  const { supabase, user, profile } = await getSessionProfile();
  if (!user || !profile || profile.client_id !== client.id) return null;
  return { supabase, user, profile };
}
