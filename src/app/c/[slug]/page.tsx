import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, Checkbox, EmptyState, Field, Input, Wordmark } from "@/components/ui";
import { getClientMember, loadClientBySlug } from "@/lib/auth";
import { getGuestSession, type GuestSession } from "@/lib/guest";
import { createServiceClient } from "@/lib/supabase/admin";
import { formatDate, formatPence, humanise, invoiceStatusTone, projectStatusTone, todayISO } from "@/lib/format";
import type { Client, Collection, Invoice, Profile, Project } from "@/lib/types";
import { Gate } from "./Gate";
import { inviteTeamMemberAction, leaveAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your portal", robots: { index: false, follow: false } };

export default async function ClientLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const client = await loadClientBySlug(slug);
  if (!client) notFound();

  const member = await getClientMember(client);
  if (member) return <ClientHome client={client} profile={member.profile} supabase={member.supabase} />;

  const guest = await getGuestSession(client.id);
  if (guest) {
    const view = await loadGuestView(client, guest);
    if (view) return <GuestHome client={client} {...view} />;
  }

  // Show the guest tab only when this client has at least one PIN switched on.
  const { count } = await createServiceClient()
    .from("guest_passes")
    .select("id, projects!inner(client_id)", { count: "exact", head: true })
    .eq("enabled", true)
    .eq("projects.client_id", client.id);

  return (
    <Shell>
      <div className="flex flex-col gap-8">
        <div>
          <p className="nc-label text-ash">{client.type === "wedding" ? "your day," : "your content,"}</p>
          <h1 className="nc-display mt-2">
            <span className="nc-accent font-normal tracking-normal">{client.name.toLowerCase()}</span>
            <br />
            captured.
          </h1>
        </div>
        <Card>
          <Gate slug={slug} ownerLabel={client.type === "wedding" ? "the couple" : "the client"} allowGuests={(count ?? 0) > 0} />
        </Card>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Signed-in couple / business client / team member
// ---------------------------------------------------------------------------

async function ClientHome({
  client,
  profile,
  supabase,
}: {
  client: Client;
  profile: Profile;
  supabase: SupabaseClient;
}) {
  const isOwner = profile.role === "client_owner";
  // RLS scopes every query below to this client's own rows.
  const [{ data: projects }, { data: collections }, { data: invoices }, { data: team }] = await Promise.all([
    supabase.from("projects").select("*").order("shoot_date", { ascending: false }).returns<Project[]>(),
    supabase.from("collections").select("*").order("sort_order").returns<Collection[]>(),
    isOwner
      ? supabase.from("invoices").select("*").neq("status", "draft").order("due_date").returns<Invoice[]>()
      : Promise.resolve({ data: [] as Invoice[] }),
    isOwner && client.type === "business"
      ? supabase.from("profiles").select("*").eq("client_id", client.id).order("created_at").returns<Profile[]>()
      : Promise.resolve({ data: [] as Profile[] }),
  ]);

  const today = todayISO();
  const nextShoot = [...(projects ?? [])]
    .filter((p) => p.shoot_date && p.shoot_date >= today)
    .sort((a, b) => (a.shoot_date! < b.shoot_date! ? -1 : 1))[0];
  const unpaid = (invoices ?? []).filter((i) => ["sent", "partially_paid", "overdue"].includes(i.status));
  const firstName = (profile.full_name ?? "").split(" ")[0]?.toLowerCase();

  return (
    <Shell slug={client.slug} signedInAs={profile.email}>
      <div className="flex flex-col gap-8">
        <div>
          <p className="nc-label text-ash">{client.name}</p>
          <h1 className="nc-h1 mt-2">hello{firstName ? `, ${firstName}` : ""}.</h1>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <p className="nc-meta">Next shoot</p>
            {nextShoot ? (
              <>
                <p className="nc-h2 mt-1">{formatDate(nextShoot.shoot_date, { weekday: "long" })}</p>
                <p className="nc-meta">
                  {nextShoot.title}
                  {nextShoot.location ? ` · ${nextShoot.location}` : ""}
                </p>
              </>
            ) : (
              <p className="mt-1">Nothing booked right now.</p>
            )}
          </Card>
          <Card>
            <p className="nc-meta">Awaiting your approval</p>
            <p className="mt-1">Nothing to approve yet. We&apos;ll email you when an edit is ready.</p>
          </Card>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="nc-h2">your projects.</h2>
          {projects?.length ? (
            projects.map((p) => {
              const cols = (collections ?? []).filter((c) => c.project_id === p.id);
              return (
                <Card key={p.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">{p.title}</p>
                      <p className="nc-meta">
                        {formatDate(p.shoot_date)}
                        {p.location ? ` · ${p.location}` : ""}
                      </p>
                    </div>
                    <Badge tone={projectStatusTone[p.status]}>{humanise(p.status)}</Badge>
                  </div>
                  {cols.length ? (
                    <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {cols.map((c) => (
                        <li key={c.id} className="flex aspect-[4/5] flex-col justify-end rounded-media bg-stone p-3">
                          <span className="nc-label w-fit rounded-pill bg-ink px-2 py-0.5 text-[11px] text-on-ink">{c.kind === "raw" ? "RAW" : c.name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="nc-meta mt-4">Your galleries will appear here once they&apos;re ready… capturing in progress.</p>
                  )}
                </Card>
              );
            })
          ) : (
            <EmptyState>Your projects will appear here.</EmptyState>
          )}
        </section>

        {isOwner ? (
          <section className="flex flex-col gap-4">
            <h2 className="nc-h2">invoices.</h2>
            {invoices?.length ? (
              <Card>
                <ul className="divide-y divide-stone">
                  {invoices.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="font-bold">
                          {inv.number} · {formatPence(inv.total_pence)}
                        </p>
                        <p className="nc-meta">Due {formatDate(inv.due_date)}</p>
                      </div>
                      <Badge tone={invoiceStatusTone[inv.status]}>{humanise(inv.status)}</Badge>
                    </li>
                  ))}
                </ul>
                {unpaid.length ? <p className="nc-meta mt-3">Online payment is coming soon. For now, pay by bank transfer.</p> : null}
              </Card>
            ) : (
              <EmptyState>No invoices yet.</EmptyState>
            )}
          </section>
        ) : null}

        {isOwner && client.type === "business" ? (
          <section className="flex flex-col gap-4">
            <h2 className="nc-h2">your team.</h2>
            <Card>
              <ul className="mb-6 divide-y divide-stone">
                {(team ?? []).map((t) => (
                  <li key={t.id} className="flex justify-between gap-3 py-3">
                    <span className="font-bold">{t.full_name ?? t.email}</span>
                    <span className="nc-meta">{t.role === "client_owner" ? "owner" : "team"}</span>
                  </li>
                ))}
              </ul>
              <h3 className="mb-3 font-bold">Invite someone</h3>
              <ActionForm action={inviteTeamMemberAction} submitLabel="Invite" variant="secondary">
                <input type="hidden" name="slug" value={client.slug} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Email">
                    <Input name="email" type="email" required />
                  </Field>
                  <Field label="Name">
                    <Input name="full_name" />
                  </Field>
                </div>
                <Checkbox name="can_download" defaultChecked label="Can download files" />
                <Checkbox name="can_approve" label="Can approve edits" />
              </ActionForm>
            </Card>
          </section>
        ) : null}
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Guest (PIN) view: final, guest-visible collections only
// ---------------------------------------------------------------------------

async function loadGuestView(client: Client, guest: GuestSession) {
  const svc = createServiceClient();
  // Re-check the pass on every request so switching a PIN off takes effect immediately.
  const { data: pass } = await svc
    .from("guest_passes")
    .select("id, enabled, project_id, collection_id, downloads_allowed")
    .eq("id", guest.gp)
    .maybeSingle();
  if (!pass?.enabled || pass.project_id !== guest.p) return null;

  const { data: project } = await svc
    .from("projects")
    .select("id, title, shoot_date, client_id, access_expires_at")
    .eq("id", pass.project_id)
    .maybeSingle<Pick<Project, "id" | "title" | "shoot_date" | "client_id" | "access_expires_at">>();
  if (!project || project.client_id !== client.id) return null;
  if (project.access_expires_at && new Date(project.access_expires_at).getTime() <= Date.now()) return null;

  let query = svc
    .from("collections")
    .select("*")
    .eq("project_id", project.id)
    .eq("guest_visible", true)
    .neq("kind", "raw") // never raw, whatever else is set
    .order("sort_order");
  if (pass.collection_id) query = query.eq("id", pass.collection_id);
  const { data: collections } = await query.returns<Collection[]>();
  const now = Date.now();
  return {
    project,
    downloads: pass.downloads_allowed,
    collections: (collections ?? []).filter((c) => !c.expires_at || new Date(c.expires_at).getTime() > now),
  };
}

function GuestHome({
  client,
  project,
  collections,
}: {
  client: Client;
  project: Pick<Project, "title" | "shoot_date">;
  collections: Collection[];
  downloads: boolean;
}) {
  return (
    <Shell slug={client.slug} guest>
      <div className="flex flex-col gap-8">
        <div>
          <p className="nc-label text-ash">{formatDate(project.shoot_date)}</p>
          <h1 className="nc-display mt-2">
            <span className="nc-accent font-normal tracking-normal">{client.name.toLowerCase()}</span>
            <br />
            captured.
          </h1>
        </div>
        {collections.length ? (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {collections.map((c) => (
              <li key={c.id} className="flex aspect-[4/5] flex-col justify-end rounded-media bg-stone p-3">
                <span className="nc-label w-fit rounded-pill bg-ink px-2 py-0.5 text-[11px] text-on-ink">{c.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>The photos and films aren&apos;t ready yet… capturing in progress.</EmptyState>
        )}
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------

function Shell({
  children,
  slug,
  signedInAs,
  guest,
}: {
  children: React.ReactNode;
  slug?: string;
  signedInAs?: string;
  guest?: boolean;
}) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Wordmark size={22} />
        {slug && (signedInAs || guest) ? (
          <form action={leaveAction}>
            <input type="hidden" name="slug" value={slug} />
            <button type="submit" className="nc-meta rounded-pill px-3 py-2 hover:bg-ink/5" title={signedInAs}>
              {guest ? "Leave gallery" : "Sign out"}
            </button>
          </form>
        ) : null}
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-6 sm:px-6 sm:pt-12">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 pb-8 sm:px-6">
        <p className="nc-label text-ash">EST 2025.</p>
      </footer>
    </div>
  );
}
