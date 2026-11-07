import "server-only";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import type { FormState } from "@/lib/form";
import type { UserRole } from "@/lib/types";

/** Shared by the admin and by business owners inviting their team. Caller must have checked access. */
export async function addClientUser(input: {
  clientId: string;
  email: string;
  role: Exclude<UserRole, "admin">;
  fullName: string | null;
  canDownload: boolean;
  canApprove: boolean;
  invitedBy: string;
  actorLabel: string;
}): Promise<FormState> {
  const svc = createServiceClient();

  const { data: existing } = await svc.from("profiles").select("id, client_id, role").ilike("email", input.email).maybeSingle();
  if (existing) {
    if (existing.client_id === input.clientId) return { error: "That person already has access." };
    return { error: "That email already has access to another client or the studio. Use a different email." };
  }

  const { data: created, error: createError } = await svc.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (createError || !created.user) {
    return { error: createError?.message ?? "Couldn't create the login." };
  }

  const { error } = await svc.from("profiles").insert({
    id: created.user.id,
    email: input.email,
    full_name: input.fullName,
    role: input.role,
    client_id: input.clientId,
    can_download: input.canDownload,
    can_approve: input.canApprove,
    invited_by: input.invitedBy,
  });
  if (error) {
    await svc.auth.admin.deleteUser(created.user.id);
    return { error: error.message };
  }

  await logActivity({
    actorId: input.invitedBy,
    actorLabel: input.actorLabel,
    clientId: input.clientId,
    action: "user.invited",
    meta: { email: input.email, role: input.role },
  });
  revalidatePath(`/admin/clients/${input.clientId}`);
  return { ok: `${input.email} can now sign in with an email code from the client link.` };
}

