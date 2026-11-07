import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Field, Input, Select } from "@/components/ui";
import { requireAdmin, isLinkLive } from "@/lib/auth";
import type { Client } from "@/lib/types";
import { createClientAction } from "../actions";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { supabase } = await requireAdmin();
  const { archived } = await searchParams;
  const showArchived = archived === "1";

  let query = supabase.from("clients").select("*, projects(count)").order("created_at", { ascending: false });
  query = showArchived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data } = await query.returns<(Client & { projects: { count: number }[] })[]>();

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <h1 className="nc-h1">clients.</h1>
          <Link href={showArchived ? "/admin/clients" : "/admin/clients?archived=1"} className="nc-meta underline underline-offset-4">
            {showArchived ? "Show active" : "Show archived"}
          </Link>
        </div>
        {data?.length ? (
          <ul className="flex flex-col gap-3">
            {data.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/clients/${c.id}`} className="block">
                  <Card className="flex items-center justify-between gap-4 transition-colors hover:border-ink">
                    <div>
                      <p className="font-bold">{c.name}</p>
                      <p className="nc-meta">
                        {c.type === "wedding" ? "Wedding / event" : "Business"} · {c.projects?.[0]?.count ?? 0} project
                        {c.projects?.[0]?.count === 1 ? "" : "s"}
                      </p>
                    </div>
                    {c.archived_at ? (
                      <Badge>archived</Badge>
                    ) : isLinkLive(c) ? (
                      <Badge tone="sage">link live</Badge>
                    ) : (
                      <Badge tone="amber">link off</Badge>
                    )}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>{showArchived ? "No archived clients." : "No clients yet. Add your first one."}</EmptyState>
        )}
      </div>

      <Card className="h-fit">
        <h2 className="nc-h2 mb-4">new client.</h2>
        <ActionForm action={createClientAction} submitLabel="Create client" pendingLabel="Creating…">
          <Field label="Name" hint="e.g. Riya & Bilal, or Beyond Scrumptious">
            <Input name="name" required />
          </Field>
          <Field label="Type">
            <Select name="type" defaultValue="wedding">
              <option value="wedding">Wedding / event</option>
              <option value="business">Business</option>
            </Select>
          </Field>
          <Field label="Contact name">
            <Input name="contact_name" />
          </Field>
          <Field label="Contact email">
            <Input name="contact_email" type="email" />
          </Field>
          <Field label="Phone">
            <Input name="contact_phone" type="tel" />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
