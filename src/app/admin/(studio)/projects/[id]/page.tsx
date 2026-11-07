import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, Checkbox, EmptyState, Field, Input, Notice, Select } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getGoogleConnection } from "@/lib/google";
import { formatDate, humanise } from "@/lib/format";
import type { Client, Collection, GuestPass, Project } from "@/lib/types";
import {
  createCollectionAction,
  createGuestPassAction,
  deleteCollectionAction,
  deleteGuestPassAction,
  linkDriveFolderAction,
  resyncDriveFolderAction,
  unlinkDriveFolderAction,
  updateCollectionAction,
  updateGuestPassAction,
  updateProjectAction,
} from "../../actions";

export const metadata = { title: "Project" };

const kindLabel = { photos: "Photos", raw: "Raw video", final: "Final edits", custom: "Custom" } as const;

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: project } = await supabase
    .from("projects")
    .select("*, clients(*)")
    .eq("id", id)
    .maybeSingle<Project & { clients: Client }>();
  if (!project) notFound();
  const client = project.clients;

  const [{ data: collections }, { data: passes }, google] = await Promise.all([
    supabase.from("collections").select("*").eq("project_id", id).order("sort_order").order("created_at").returns<Collection[]>(),
    supabase.from("guest_passes").select("*").eq("project_id", id).order("created_at").returns<GuestPass[]>(),
    getGoogleConnection(),
  ]);

  const guestable = (collections ?? []).filter((c) => c.kind !== "raw");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/admin/clients/${client.id}`} className="nc-meta underline underline-offset-4">
          {client.name}
        </Link>
        <h1 className="nc-h1 mt-1">{project.title.toLowerCase()}.</h1>
        <p className="nc-meta mt-1">
          {project.package ?? "No package"} · {formatDate(project.shoot_date)}
          {project.location ? ` · ${project.location}` : ""}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="nc-h2 mb-4">project.</h2>
          <ActionForm action={updateProjectAction} submitLabel="Save project" variant="secondary">
            <input type="hidden" name="project_id" value={project.id} />
            <Field label="Title">
              <Input name="title" defaultValue={project.title} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Package">
                <Input name="package" defaultValue={project.package ?? ""} />
              </Field>
              <Field label="Status">
                <Select name="status" defaultValue={project.status}>
                  {(["enquiry", "confirmed", "shot", "editing", "delivered", "closed"] as const).map((s) => (
                    <option key={s} value={s}>
                      {humanise(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Shoot date">
                <Input name="shoot_date" type="date" defaultValue={project.shoot_date ?? ""} />
              </Field>
              <Field label="End date" hint="Multi-day events only.">
                <Input name="shoot_end_date" type="date" defaultValue={project.shoot_end_date ?? ""} />
              </Field>
            </div>
            <Field label="Location">
              <Input name="location" defaultValue={project.location ?? ""} />
            </Field>
            <Field label="Client access ends" hint="After this date the client can no longer open this project.">
              <Input name="access_expires_at" type="date" defaultValue={project.access_expires_at?.slice(0, 10) ?? ""} />
            </Field>
            <Checkbox
              name="raw_included"
              defaultChecked={project.raw_included}
              label="Include raw footage (the couple or business client can see the Raw collection; guests never can)"
            />
            <Checkbox
              name="portfolio_consent"
              defaultChecked={project.portfolio_consent}
              label="Client agreed to portfolio and social use"
            />
          </ActionForm>
        </Card>

        <Card>
          <h2 className="nc-h2 mb-1">google drive folder.</h2>
          <p className="nc-meta mb-4">
            Convention: <span className="font-bold">naavcaptured/Clients/{client.name}/{project.title}</span> with Photos, Raw
            and Final inside. Files stay in your Drive; the portal only stores their IDs.
          </p>
          {!google ? (
            <Notice tone="amber">
              Connect Google in{" "}
              <Link href="/admin/settings" className="font-bold underline underline-offset-4">
                Settings
              </Link>{" "}
              before linking a folder.
            </Notice>
          ) : project.drive_folder_id ? (
            <div className="flex flex-col gap-4">
              <p className="rounded-card bg-status-tint px-4 py-3">
                <span className="font-bold">{project.drive_folder_name ?? "Linked folder"}</span>{" "}
                <a
                  className="nc-meta underline underline-offset-4"
                  href={`https://drive.google.com/drive/folders/${project.drive_folder_id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Drive
                </a>
              </p>
              <div className="flex flex-wrap gap-3">
                <ActionForm action={resyncDriveFolderAction} submitLabel="Sync folders" pendingLabel="Syncing…" variant="secondary">
                  <input type="hidden" name="project_id" value={project.id} />
                </ActionForm>
                <ActionForm action={unlinkDriveFolderAction} submitLabel="Unlink" variant="quiet" confirm="Unlink this Drive folder?">
                  <input type="hidden" name="project_id" value={project.id} />
                </ActionForm>
              </div>
            </div>
          ) : (
            <ActionForm action={linkDriveFolderAction} submitLabel="Link folder" pendingLabel="Checking Drive…">
              <input type="hidden" name="project_id" value={project.id} />
              <Field label="Drive folder link or ID">
                <Input name="folder" placeholder="https://drive.google.com/drive/folders/…" required />
              </Field>
            </ActionForm>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="nc-h2 mb-1">collections.</h2>
        <p className="nc-meta mb-4">
          Galleries and video playback arrive in Phase 2. Set who sees what now: raw is hidden unless the project includes
          it, and is never shown to guests.
        </p>
        {collections?.length ? (
          <ul className="mb-6 flex flex-col gap-4">
            {collections.map((col) => {
              const rawHidden = col.kind === "raw" && !project.raw_included;
              return (
                <li key={col.id} className="rounded-card border border-stone p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="font-bold">{col.name}</span>
                    <Badge>{kindLabel[col.kind]}</Badge>
                    {col.drive_folder_id ? <Badge tone="sage">drive linked</Badge> : <Badge tone="amber">no folder</Badge>}
                    {rawHidden ? <Badge tone="amber">hidden: raw not included</Badge> : null}
                  </div>
                  <ActionForm action={updateCollectionAction} submitLabel="Save" variant="secondary">
                    <input type="hidden" name="collection_id" value={col.id} />
                    <input type="hidden" name="project_id" value={project.id} />
                    <input type="hidden" name="kind" value={col.kind} />
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Name">
                        <Input name="name" defaultValue={col.name} />
                      </Field>
                      <Field label="Gallery background">
                        <Select name="background" defaultValue={col.background}>
                          <option value="white">White</option>
                          <option value="ink">Ink</option>
                        </Select>
                      </Field>
                      <Field label="Expires">
                        <Input name="expires_at" type="date" defaultValue={col.expires_at?.slice(0, 10) ?? ""} />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      {col.kind === "raw" ? (
                        <span className="nc-meta">Never visible to guests</span>
                      ) : (
                        <Checkbox name="guest_visible" defaultChecked={col.guest_visible} label="Visible to guests" />
                      )}
                      <Checkbox name="downloads_allowed" defaultChecked={col.downloads_allowed} label="Downloads on" />
                      <Checkbox name="watermark_preview" defaultChecked={col.watermark_preview} label="Watermarked previews" />
                    </div>
                  </ActionForm>
                  <div className="mt-2">
                    <ActionForm
                      action={deleteCollectionAction}
                      submitLabel="Remove collection"
                      variant="quiet"
                      confirm="Remove this collection from the portal? Files in Drive are untouched."
                    >
                      <input type="hidden" name="collection_id" value={col.id} />
                      <input type="hidden" name="project_id" value={project.id} />
                    </ActionForm>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mb-6">
            <EmptyState>No collections. Link a Drive folder to create them, or add one below.</EmptyState>
          </div>
        )}
        <h3 className="mb-3 font-bold">Add a collection</h3>
        <ActionForm action={createCollectionAction} submitLabel="Add collection" variant="secondary">
          <input type="hidden" name="project_id" value={project.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" hint='e.g. "Reels", "Highlights"'>
              <Input name="name" required />
            </Field>
            <Field label="Type">
              <Select name="kind" defaultValue="custom">
                <option value="photos">Photos</option>
                <option value="raw">Raw video</option>
                <option value="final">Final edits</option>
                <option value="custom">Custom</option>
              </Select>
            </Field>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <h2 className="nc-h2 mb-1">guest PINs.</h2>
        <p className="nc-meta mb-4">
          Family and friends open the client link and enter a PIN. No account needed. They only see collections marked
          &ldquo;visible to guests&rdquo;, and never raw footage, invoices or comments. 5 wrong tries locks the PIN screen
          for 15 minutes.
        </p>
        {client.type === "business" ? (
          <div className="mb-4">
            <Notice>Guest PINs are meant for wedding and event galleries. Business clients usually invite team members instead.</Notice>
          </div>
        ) : null}
        {passes?.length ? (
          <ul className="mb-6 divide-y divide-stone">
            {passes.map((gp) => (
              <li key={gp.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold">{gp.label ?? "Guest PIN"}</p>
                  <p className="nc-meta">
                    {gp.collection_id
                      ? `Only: ${collections?.find((c) => c.id === gp.collection_id)?.name ?? "one collection"}`
                      : "All guest-visible collections"}{" "}
                    · created {formatDate(gp.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <ActionForm action={updateGuestPassAction} submitLabel="Save" variant="secondary" className="sm:flex-row sm:items-center">
                    <input type="hidden" name="guest_pass_id" value={gp.id} />
                    <input type="hidden" name="project_id" value={project.id} />
                    <Checkbox name="enabled" defaultChecked={gp.enabled} label="On" />
                    <Checkbox name="downloads_allowed" defaultChecked={gp.downloads_allowed} label="Guests can download" />
                  </ActionForm>
                  <ActionForm action={deleteGuestPassAction} submitLabel="Delete" variant="quiet" confirm="Delete this PIN?">
                    <input type="hidden" name="guest_pass_id" value={gp.id} />
                    <input type="hidden" name="project_id" value={project.id} />
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mb-6">
            <EmptyState>No guest PINs.</EmptyState>
          </div>
        )}
        <h3 className="mb-3 font-bold">New guest PIN</h3>
        <ActionForm action={createGuestPassAction} submitLabel="Create PIN" variant="secondary">
          <input type="hidden" name="project_id" value={project.id} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="PIN" hint="6 to 10 digits. Shown only now; it's stored hashed.">
              <Input name="pin" inputMode="numeric" pattern="[0-9]{6,10}" required autoComplete="off" />
            </Field>
            <Field label="Label">
              <Input name="label" placeholder="e.g. Family & friends" />
            </Field>
            <Field label="Opens">
              <Select name="collection_id" defaultValue="">
                <option value="">All guest-visible collections</option>
                {guestable.map((c) => (
                  <option key={c.id} value={c.id}>
                    Only {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Checkbox name="downloads_allowed" defaultChecked label="Guests can download" />
        </ActionForm>
      </Card>
    </div>
  );
}
