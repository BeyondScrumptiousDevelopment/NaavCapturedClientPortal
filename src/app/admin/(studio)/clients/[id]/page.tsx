import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { CopyButton } from "@/components/CopyButton";
import { Badge, Card, Checkbox, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { isLinkLive, requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatDate, formatDateTime, humanise, projectStatusTone } from "@/lib/format";
import type { Client, Profile, Project } from "@/lib/types";
import {
  archiveClientAction,
  createProjectAction,
  inviteClientUserAction,
  regenerateLinkAction,
  removeClientUserAction,
  updateClientAction,
  updateLinkAction,
} from "../../actions";

export const metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: client } = await supabase.from("clients").select("*").eq("id", id).maybeSingle<Client>();
  if (!client) notFound();

  const [{ data: projects }, { data: people }, { data: activity }] = await Promise.all([
    supabase.from("projects").select("*").eq("client_id", id).order("shoot_date", { ascending: false }).returns<Project[]>(),
    supabase.from("profiles").select("*").eq("client_id", id).order("created_at").returns<Profile[]>(),
    supabase
      .from("activity_log")
      .select("id, actor_label, action, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const link = `${env.appUrl()}/c/${client.slug}`;
  const live = isLinkLive(client);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/clients" className="nc-meta underline underline-offset-4">
            Clients
          </Link>
          <h1 className="nc-h1 mt-1">{client.name.toLowerCase()}.</h1>
          <p className="nc-meta mt-1">{client.type === "wedding" ? "Wedding / event client" : "Business client"}</p>
        </div>
        {client.archived_at ? <Badge>archived {formatDate(client.archived_at)}</Badge> : null}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="nc-h2">their link.</h2>
          <Badge tone={live ? "sage" : "amber"}>{live ? "live" : "not working"}</Badge>
        </div>
        <p className="mt-3 break-all rounded-card bg-status-tint px-4 py-3 font-bold">{link}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <CopyButton value={link} />
          <ActionForm
            action={regenerateLinkAction}
            submitLabel="Make a new link"
            variant="secondary"
            confirm="The current link will stop working immediately. Continue?"
          >
            <input type="hidden" name="client_id" value={client.id} />
          </ActionForm>
        </div>
        <ActionForm action={updateLinkAction} submitLabel="Save link settings" variant="secondary" className="mt-6">
          <input type="hidden" name="client_id" value={client.id} />
          <Checkbox name="link_enabled" defaultChecked={client.link_enabled} label="Link is switched on" />
          <Field label="Link expires" hint="Leave empty to keep it open.">
            <Input name="link_expires_at" type="date" defaultValue={client.link_expires_at?.slice(0, 10) ?? ""} className="max-w-xs" />
          </Field>
        </ActionForm>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="nc-h2 mb-4">projects.</h2>
          {projects?.length ? (
            <ul className="mb-6 divide-y divide-stone">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/admin/projects/${p.id}`} className="font-bold hover:underline">
                      {p.title}
                    </Link>
                    <p className="nc-meta">
                      {p.package ?? "No package"} · {formatDate(p.shoot_date)}
                    </p>
                  </div>
                  <Badge tone={projectStatusTone[p.status]}>{humanise(p.status)}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mb-6">
              <EmptyState>No projects yet.</EmptyState>
            </div>
          )}
          <h3 className="mb-3 font-bold">Add a project</h3>
          <ActionForm action={createProjectAction} submitLabel="Add project" variant="secondary">
            <input type="hidden" name="client_id" value={client.id} />
            <Field label="Title" hint={client.type === "wedding" ? "e.g. Wedding day" : "e.g. November content day"}>
              <Input name="title" required />
            </Field>
            <Field label="Package">
              <Select name="package" defaultValue="">
                <option value="">—</option>
                <option>Wedding</option>
                <option>Event</option>
                <option>Business Content Day</option>
                <option>Monthly Retainer</option>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Shoot date">
                <Input name="shoot_date" type="date" />
              </Field>
              <Field label="Location">
                <Input name="location" />
              </Field>
            </div>
          </ActionForm>
        </Card>

        <Card>
          <h2 className="nc-h2 mb-1">people with a login.</h2>
          <p className="nc-meta mb-4">
            They sign in at the link above with a one-time code sent to their email.
            {client.type === "wedding" ? " Family and friends use a guest PIN instead (set on a project)." : ""}
          </p>
          {people?.length ? (
            <ul className="mb-6 divide-y divide-stone">
              {people.map((person) => (
                <li key={person.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-bold">{person.full_name ?? person.email}</p>
                    <p className="nc-meta">
                      {person.email} · {person.role === "client_owner" ? (client.type === "wedding" ? "couple" : "owner") : "team member"}
                      {person.role === "client_member"
                        ? ` · ${[person.can_download && "downloads", person.can_approve && "approvals"].filter(Boolean).join(", ") || "view only"}`
                        : ""}
                    </p>
                  </div>
                  <ActionForm action={removeClientUserAction} submitLabel="Remove" variant="quiet" confirm={`Remove ${person.email}?`}>
                    <input type="hidden" name="profile_id" value={person.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mb-6">
              <EmptyState>Nobody can sign in yet.</EmptyState>
            </div>
          )}
          <h3 className="mb-3 font-bold">Give someone access</h3>
          <ActionForm action={inviteClientUserAction} submitLabel="Add person" variant="secondary">
            <input type="hidden" name="client_id" value={client.id} />
            <Field label="Email">
              <Input name="email" type="email" required defaultValue={people?.length ? "" : (client.contact_email ?? "")} />
            </Field>
            <Field label="Name">
              <Input name="full_name" defaultValue={people?.length ? "" : (client.contact_name ?? "")} />
            </Field>
            <Field label="Role">
              <Select name="role" defaultValue={people?.length ? "client_member" : "client_owner"}>
                <option value="client_owner">{client.type === "wedding" ? "Couple" : "Owner / marketing lead"}</option>
                <option value="client_member">Team member</option>
              </Select>
            </Field>
            <Checkbox name="can_download" defaultChecked label="Team member can download" />
            <Checkbox name="can_approve" label="Team member can approve edits" />
          </ActionForm>
        </Card>

        <Card>
          <h2 className="nc-h2 mb-4">details.</h2>
          <ActionForm action={updateClientAction} submitLabel="Save details" variant="secondary">
            <input type="hidden" name="client_id" value={client.id} />
            <Field label="Name">
              <Input name="name" defaultValue={client.name} required />
            </Field>
            <Field label="Contact name">
              <Input name="contact_name" defaultValue={client.contact_name ?? ""} />
            </Field>
            <Field label="Contact email">
              <Input name="contact_email" type="email" defaultValue={client.contact_email ?? ""} />
            </Field>
            <Field label="Phone">
              <Input name="contact_phone" type="tel" defaultValue={client.contact_phone ?? ""} />
            </Field>
            <Field label="Notes" hint="Only you can see these.">
              <Textarea name="notes" defaultValue={client.notes ?? ""} />
            </Field>
          </ActionForm>
        </Card>

        <Card>
          <h2 className="nc-h2 mb-4">activity.</h2>
          {activity?.length ? (
            <ul className="divide-y divide-stone">
              {activity.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span>
                    <span className="font-bold">{a.actor_label ?? "someone"}</span> {humanise(String(a.action).replace(".", " "))}
                  </span>
                  <span className="nc-meta whitespace-nowrap">{formatDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>No activity yet.</EmptyState>
          )}
          <div className="mt-6 border-t border-stone pt-4">
            <ActionForm
              action={archiveClientAction}
              submitLabel={client.archived_at ? "Restore client" : "Archive client"}
              variant={client.archived_at ? "secondary" : "danger"}
              confirm={client.archived_at ? undefined : "Archiving switches off their link and logins. Continue?"}
            >
              <input type="hidden" name="client_id" value={client.id} />
              <input type="hidden" name="archive" value={client.archived_at ? "0" : "1"} />
            </ActionForm>
          </div>
        </Card>
      </div>
    </div>
  );
}
