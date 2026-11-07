"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getClientMember, loadClientBySlug } from "@/lib/auth";
import { clearGuestCookie, requesterIpHash, setGuestCookie } from "@/lib/guest";
import { verifyPin } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { addClientUser } from "@/lib/users";
import { bool, isEmail, optStr, str, type FormState } from "@/lib/form";

const MAX_PIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export interface CodeState extends FormState {
  step?: "email" | "code";
  email?: string;
}

const GENERIC_SENT = "If that email has access to this page, a 6-digit code is on its way. It can take a minute.";

export async function requestCodeAction(_prev: CodeState, fd: FormData): Promise<CodeState> {
  const slug = str(fd, "slug");
  const email = str(fd, "email").toLowerCase();
  if (!isEmail(email)) return { step: "email", error: "Enter the email we have for you." };

  const client = await loadClientBySlug(slug);
  if (!client) return { step: "email", error: "This link isn't working any more." };

  // Only send a code to people who belong to this client. Same answer either way, so emails can't be probed.
  const { data: profile } = await createServiceClient()
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .eq("client_id", client.id)
    .maybeSingle();

  if (profile) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) {
      console.error("OTP send failed", error.message);
      if (error.status === 429) return { step: "email", email, error: "Too many codes requested. Wait a minute and try again." };
    }
  }
  return { step: "code", email, ok: GENERIC_SENT };
}

export async function verifyCodeAction(_prev: CodeState, fd: FormData): Promise<CodeState> {
  const slug = str(fd, "slug");
  const email = str(fd, "email").toLowerCase();
  const token = str(fd, "token").replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(token)) return { step: "code", email, error: "Enter the code from the email." };

  const client = await loadClientBySlug(slug);
  if (!client) return { step: "email", error: "This link isn't working any more." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.user) return { step: "code", email, error: "That code didn't work or has expired. Request a new one." };

  const { data: profile } = await createServiceClient()
    .from("profiles")
    .select("client_id")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profile?.client_id !== client.id) {
    await supabase.auth.signOut();
    return { step: "email", error: "That email doesn't have access to this page." };
  }

  await logActivity({ actorId: data.user.id, actorLabel: email, clientId: client.id, action: "client.sign_in" });
  redirect(`/c/${slug}`);
}

export async function enterPinAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const slug = str(fd, "slug");
  const pin = str(fd, "pin");
  const client = await loadClientBySlug(slug);
  if (!client) return { error: "This link isn't working any more." };

  const svc = createServiceClient();
  const ipHash = await requesterIpHash();
  const { data: attempt } = await svc
    .from("pin_attempts")
    .select("failed_count, locked_until")
    .eq("client_id", client.id)
    .eq("ip_hash", ipHash)
    .maybeSingle();

  if (attempt?.locked_until && new Date(attempt.locked_until).getTime() > Date.now()) {
    const mins = Math.ceil((new Date(attempt.locked_until).getTime() - Date.now()) / 60_000);
    return { error: `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` };
  }

  let matched: { id: string; project_id: string; collection_id: string | null; downloads_allowed: boolean } | null = null;
  if (/^\d{6,10}$/.test(pin)) {
    const { data: passes } = await svc
      .from("guest_passes")
      .select("id, project_id, collection_id, downloads_allowed, pin_hash, projects!inner(client_id, access_expires_at)")
      .eq("enabled", true)
      .eq("projects.client_id", client.id);
    for (const gp of passes ?? []) {
      const project = gp.projects as unknown as { access_expires_at: string | null };
      if (project.access_expires_at && new Date(project.access_expires_at).getTime() <= Date.now()) continue;
      if (await verifyPin(pin, gp.pin_hash, env.appSecret())) {
        matched = gp;
        break;
      }
    }
  }

  if (!matched) {
    const failed = (attempt?.locked_until ? 0 : (attempt?.failed_count ?? 0)) + 1;
    const lock = failed >= MAX_PIN_ATTEMPTS;
    await svc.from("pin_attempts").upsert({
      client_id: client.id,
      ip_hash: ipHash,
      failed_count: lock ? 0 : failed,
      locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      updated_at: new Date().toISOString(),
    });
    if (lock) {
      await logActivity({ actorLabel: "guest", clientId: client.id, action: "guest.pin_locked" });
      return { error: `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes.` };
    }
    const left = MAX_PIN_ATTEMPTS - failed;
    return { error: `That PIN didn't work. ${left} tr${left === 1 ? "y" : "ies"} left.` };
  }

  await svc.from("pin_attempts").delete().eq("client_id", client.id).eq("ip_hash", ipHash);
  await setGuestCookie(
    { gp: matched.id, c: client.id, p: matched.project_id, col: matched.collection_id, dl: matched.downloads_allowed },
    slug,
  );
  await logActivity({ actorLabel: "guest", clientId: client.id, projectId: matched.project_id, action: "guest.opened" });
  redirect(`/c/${slug}`);
}

export async function leaveAction(fd: FormData) {
  const slug = str(fd, "slug");
  await clearGuestCookie(slug);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/c/${slug}`);
}

/** Business owners can invite their own team members. */
export async function inviteTeamMemberAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const slug = str(fd, "slug");
  const client = await loadClientBySlug(slug);
  if (!client) return { error: "This link isn't working any more." };
  const member = await getClientMember(client);
  if (!member || member.profile.role !== "client_owner" || client.type !== "business") {
    return { error: "Only the account owner can invite people." };
  }
  const email = str(fd, "email").toLowerCase();
  if (!isEmail(email)) return { error: "Enter a valid email." };
  const result = await addClientUser({
    clientId: client.id,
    email,
    role: "client_member",
    fullName: optStr(fd, "full_name"),
    canDownload: bool(fd, "can_download"),
    canApprove: bool(fd, "can_approve"),
    invitedBy: member.user.id,
    actorLabel: member.profile.email,
  });
  revalidatePath(`/c/${slug}`);
  return result.ok ? { ok: `${email} can now sign in here with an email code.` } : result;
}
