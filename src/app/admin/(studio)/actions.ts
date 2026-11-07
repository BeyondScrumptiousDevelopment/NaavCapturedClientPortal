"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { clientSlug, regenerateSlug } from "@/lib/slug";
import { hashPin, verifyPin } from "@/lib/crypto";
import { addClientUser } from "@/lib/users";
import { env } from "@/lib/env";
import {
  collectionKindForFolder,
  DRIVE_FOLDER_MIME,
  getDriveFile,
  listDriveChildren,
  parseDriveFolderId,
} from "@/lib/google";
import { bool, isEmail, optStr, str, type FormState } from "@/lib/form";
import type { ClientType, CollectionKind, ProjectStatus, UserRole } from "@/lib/types";

const PROJECT_STATUSES: ProjectStatus[] = ["enquiry", "confirmed", "shot", "editing", "delivered", "closed"];

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong.";
}

/** Postgres timestamptz from an <input type="date"> (end of that day, London). */
function endOfDay(date: string | null) {
  return date ? `${date}T23:59:59+00:00` : null;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function createClientAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, user } = await requireAdmin();
  const name = str(fd, "name");
  const type = str(fd, "type") as ClientType;
  if (!name) return { error: "Give the client a name." };
  if (type !== "wedding" && type !== "business") return { error: "Choose wedding/event or business." };
  const contactEmail = optStr(fd, "contact_email")?.toLowerCase() ?? null;
  if (contactEmail && !isEmail(contactEmail)) return { error: "That email doesn't look right." };

  let created: { id: string } | null = null;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const { data, error } = await supabase
      .from("clients")
      .insert({
        name,
        type,
        slug: clientSlug(name),
        contact_name: optStr(fd, "contact_name"),
        contact_email: contactEmail,
        contact_phone: optStr(fd, "contact_phone"),
      })
      .select("id")
      .single();
    if (data) created = data;
    else if (error && error.code !== "23505") return { error: error.message }; // retry only on slug clash
  }
  if (!created) return { error: "Couldn't create a unique link. Try again." };

  await logActivity({ actorId: user.id, actorLabel: "Naav", clientId: created.id, action: "client.created" });
  redirect(`/admin/clients/${created.id}`);
}

export async function updateClientAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const id = str(fd, "client_id");
  const name = str(fd, "name");
  if (!name) return { error: "Name can't be empty." };
  const contactEmail = optStr(fd, "contact_email")?.toLowerCase() ?? null;
  if (contactEmail && !isEmail(contactEmail)) return { error: "That email doesn't look right." };
  const { error } = await supabase
    .from("clients")
    .update({
      name,
      contact_name: optStr(fd, "contact_name"),
      contact_email: contactEmail,
      contact_phone: optStr(fd, "contact_phone"),
      notes: optStr(fd, "notes"),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/clients/${id}`);
  return { ok: "Saved." };
}

export async function updateLinkAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, user } = await requireAdmin();
  const id = str(fd, "client_id");
  const { error } = await supabase
    .from("clients")
    .update({ link_enabled: bool(fd, "link_enabled"), link_expires_at: endOfDay(optStr(fd, "link_expires_at")) })
    .eq("id", id);
  if (error) return { error: error.message };
  await logActivity({ actorId: user.id, actorLabel: "Naav", clientId: id, action: "link.updated" });
  revalidatePath(`/admin/clients/${id}`);
  return { ok: "Link settings saved." };
}

export async function regenerateLinkAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, user } = await requireAdmin();
  const id = str(fd, "client_id");
  const { data: client } = await supabase.from("clients").select("slug").eq("id", id).single();
  if (!client) return { error: "Client not found." };
  const { error } = await supabase.from("clients").update({ slug: regenerateSlug(client.slug) }).eq("id", id);
  if (error) return { error: error.message };
  await logActivity({ actorId: user.id, actorLabel: "Naav", clientId: id, action: "link.regenerated" });
  revalidatePath(`/admin/clients/${id}`);
  return { ok: "New link created. The old one has stopped working." };
}

export async function archiveClientAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, user } = await requireAdmin();
  const id = str(fd, "client_id");
  const archive = str(fd, "archive") === "1";
  const { error } = await supabase
    .from("clients")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { error: error.message };
  await logActivity({ actorId: user.id, actorLabel: "Naav", clientId: id, action: archive ? "client.archived" : "client.restored" });
  revalidatePath(`/admin/clients/${id}`);
  revalidatePath("/admin/clients");
  return { ok: archive ? "Archived. Their link and logins no longer work." : "Restored." };
}

// ---------------------------------------------------------------------------
// People with logins (couple, business owner, team members)
// ---------------------------------------------------------------------------

export async function inviteClientUserAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { user } = await requireAdmin();
  const clientId = str(fd, "client_id");
  const email = str(fd, "email").toLowerCase();
  const role = str(fd, "role") as UserRole;
  if (!isEmail(email)) return { error: "Enter a valid email." };
  if (role !== "client_owner" && role !== "client_member") return { error: "Choose a role." };
  return addClientUser({
    clientId,
    email,
    role,
    fullName: optStr(fd, "full_name"),
    canDownload: role === "client_owner" || bool(fd, "can_download"),
    canApprove: role === "client_owner" || bool(fd, "can_approve"),
    invitedBy: user.id,
    actorLabel: "Naav",
  });
}

export async function removeClientUserAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { user } = await requireAdmin();
  const profileId = str(fd, "profile_id");
  const svc = createServiceClient();
  const { data: profile } = await svc.from("profiles").select("client_id, email, role").eq("id", profileId).single();
  if (!profile || profile.role === "admin") return { error: "Can't remove that account." };
  const { error } = await svc.auth.admin.deleteUser(profileId); // cascades to profiles
  if (error) return { error: error.message };
  await logActivity({
    actorId: user.id,
    actorLabel: "Naav",
    clientId: profile.client_id,
    action: "user.removed",
    meta: { email: profile.email },
  });
  revalidatePath(`/admin/clients/${profile.client_id}`);
  return { ok: "Access removed." };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function createProjectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, user } = await requireAdmin();
  const clientId = str(fd, "client_id");
  const title = str(fd, "title");
  if (!title) return { error: "Give the project a title." };
  const { data, error } = await supabase
    .from("projects")
    .insert({
      client_id: clientId,
      title,
      package: optStr(fd, "package"),
      shoot_date: optStr(fd, "shoot_date"),
      location: optStr(fd, "location"),
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't create the project." };
  await logActivity({ actorId: user.id, actorLabel: "Naav", clientId, projectId: data.id, action: "project.created" });
  redirect(`/admin/projects/${data.id}`);
}

export async function updateProjectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const id = str(fd, "project_id");
  const status = str(fd, "status") as ProjectStatus;
  if (!PROJECT_STATUSES.includes(status)) return { error: "Unknown status." };
  const title = str(fd, "title");
  if (!title) return { error: "Title can't be empty." };
  const rawIncluded = bool(fd, "raw_included");

  const { error } = await supabase
    .from("projects")
    .update({
      title,
      package: optStr(fd, "package"),
      shoot_date: optStr(fd, "shoot_date"),
      shoot_end_date: optStr(fd, "shoot_end_date"),
      location: optStr(fd, "location"),
      status,
      raw_included: rawIncluded,
      portfolio_consent: bool(fd, "portfolio_consent"),
      access_expires_at: endOfDay(optStr(fd, "access_expires_at")),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/projects/${id}`);
  return { ok: "Project saved." };
}

// ---------------------------------------------------------------------------
// Google Drive folder linking
// ---------------------------------------------------------------------------

export async function linkDriveFolderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, user } = await requireAdmin();
  const projectId = str(fd, "project_id");
  const folderId = parseDriveFolderId(str(fd, "folder"));
  if (!folderId) return { error: "Paste a Google Drive folder link or folder ID." };

  try {
    const folder = await getDriveFile(folderId);
    if (folder.mimeType !== DRIVE_FOLDER_MIME) return { error: "That link is a file, not a folder." };

    const { data: project, error } = await supabase
      .from("projects")
      .update({ drive_folder_id: folder.id, drive_folder_name: folder.name })
      .eq("id", projectId)
      .select("client_id")
      .single();
    if (error || !project) return { error: error?.message ?? "Project not found." };

    const summary = await syncCollectionsFromDrive(projectId, folder.id);
    await logActivity({
      actorId: user.id,
      actorLabel: "Naav",
      clientId: project.client_id,
      projectId,
      action: "drive.linked",
      meta: { folder: folder.name },
    });
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: `Linked "${folder.name}". ${summary}` };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function resyncDriveFolderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const projectId = str(fd, "project_id");
  const { data: project } = await supabase.from("projects").select("drive_folder_id").eq("id", projectId).single();
  if (!project?.drive_folder_id) return { error: "Link a Drive folder first." };
  try {
    const summary = await syncCollectionsFromDrive(projectId, project.drive_folder_id);
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: summary };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function unlinkDriveFolderAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const projectId = str(fd, "project_id");
  const { error } = await supabase
    .from("projects")
    .update({ drive_folder_id: null, drive_folder_name: null })
    .eq("id", projectId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: "Drive folder unlinked. Collections are kept." };
}

/**
 * Folder convention: <project>/Photos, /Raw, /Final (+ any other subfolder becomes a custom collection).
 * Creates missing collections and links existing ones by folder. File import arrives in Phase 2.
 */
async function syncCollectionsFromDrive(projectId: string, folderId: string): Promise<string> {
  const { supabase } = await requireAdmin();
  const subfolders = await listDriveChildren(folderId, true);
  const { data: existing } = await supabase
    .from("collections")
    .select("id, kind, drive_folder_id, name")
    .eq("project_id", projectId);

  let created = 0;
  let linked = 0;
  for (const [index, sub] of subfolders.entries()) {
    const kind: CollectionKind = collectionKindForFolder(sub.name);
    const match =
      existing?.find((c) => c.drive_folder_id === sub.id) ??
      existing?.find((c) => !c.drive_folder_id && (kind === "custom" ? c.name === sub.name : c.kind === kind));
    if (match) {
      if (match.drive_folder_id !== sub.id) {
        await supabase.from("collections").update({ drive_folder_id: sub.id }).eq("id", match.id);
        linked++;
      }
      continue;
    }
    const names: Record<CollectionKind, string> = { photos: "Photos", raw: "Raw video", final: "Final edits", custom: sub.name };
    await supabase.from("collections").insert({
      project_id: projectId,
      name: names[kind],
      kind,
      drive_folder_id: sub.id,
      sort_order: index,
    });
    created++;
  }
  if (!subfolders.length) return "No subfolders yet. Add Photos, Raw and Final folders in Drive, then sync.";
  return `${subfolders.length} folder${subfolders.length === 1 ? "" : "s"} found: ${created} new collection${created === 1 ? "" : "s"}, ${linked} relinked.`;
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export async function createCollectionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const projectId = str(fd, "project_id");
  const name = str(fd, "name");
  const kind = str(fd, "kind") as CollectionKind;
  if (!name) return { error: "Name the collection." };
  if (!["photos", "raw", "final", "custom"].includes(kind)) return { error: "Choose a type." };
  const { error } = await supabase.from("collections").insert({ project_id: projectId, name, kind });
  if (error) return { error: error.message };
  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: "Collection added." };
}

export async function updateCollectionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const id = str(fd, "collection_id");
  const projectId = str(fd, "project_id");
  const kind = str(fd, "kind");
  const guestVisible = bool(fd, "guest_visible");
  if (kind === "raw" && guestVisible) return { error: "Raw footage can never be shown to guests." };
  const background = str(fd, "background") === "ink" ? "ink" : "white";
  const { error } = await supabase
    .from("collections")
    .update({
      name: str(fd, "name") || undefined,
      guest_visible: guestVisible,
      downloads_allowed: bool(fd, "downloads_allowed"),
      watermark_preview: bool(fd, "watermark_preview"),
      background,
      expires_at: endOfDay(optStr(fd, "expires_at")),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: "Saved." };
}

export async function deleteCollectionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const id = str(fd, "collection_id");
  const projectId = str(fd, "project_id");
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: "Collection removed. Files in Drive are untouched." };
}

// ---------------------------------------------------------------------------
// Guest PINs
// ---------------------------------------------------------------------------

export async function createGuestPassAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase, user } = await requireAdmin();
  const projectId = str(fd, "project_id");
  const pin = str(fd, "pin");
  if (!/^\d{6,10}$/.test(pin)) return { error: "PINs are 6 to 10 digits." };
  const collectionId = optStr(fd, "collection_id");

  const { data: project } = await supabase.from("projects").select("client_id, clients(type)").eq("id", projectId).single<{
    client_id: string;
    clients: { type: ClientType } | null;
  }>();
  if (!project) return { error: "Project not found." };

  const pinHash = await hashPin(pin, env.appSecret());

  // PINs must be unique within a client, so a typed PIN maps to exactly one pass.
  const { data: siblings } = await createServiceClient()
    .from("guest_passes")
    .select("pin_hash, projects!inner(client_id)")
    .eq("projects.client_id", project.client_id);
  for (const s of siblings ?? []) {
    if (await verifyPin(pin, s.pin_hash, env.appSecret())) return { error: "That PIN is already in use for this client." };
  }

  const { error } = await supabase.from("guest_passes").insert({
    project_id: projectId,
    collection_id: collectionId,
    label: optStr(fd, "label"),
    pin_hash: pinHash,
    downloads_allowed: bool(fd, "downloads_allowed"),
  });
  if (error) return { error: error.message.includes("raw") ? "Guest PINs can never open raw footage." : error.message };

  await logActivity({ actorId: user.id, actorLabel: "Naav", clientId: project.client_id, projectId, action: "guest_pin.created" });
  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: "Guest PIN created. Share it with the link; guests see final photos and films only." };
}

export async function updateGuestPassAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const id = str(fd, "guest_pass_id");
  const projectId = str(fd, "project_id");
  const { error } = await supabase
    .from("guest_passes")
    .update({ enabled: bool(fd, "enabled"), downloads_allowed: bool(fd, "downloads_allowed") })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: "Saved." };
}

export async function deleteGuestPassAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const id = str(fd, "guest_pass_id");
  const projectId = str(fd, "project_id");
  const { error } = await supabase.from("guest_passes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: "PIN deleted." };
}
