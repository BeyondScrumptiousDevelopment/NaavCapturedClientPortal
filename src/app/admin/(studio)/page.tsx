import Link from "next/link";
import { Badge, ButtonLink, Card, EmptyState, Notice } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getGoogleConnection } from "@/lib/google";
import { formatDate, formatDateTime, formatPence, humanise, invoiceStatusTone, projectStatusTone, todayISO } from "@/lib/format";
import type { InvoiceStatus, ProjectStatus } from "@/lib/types";

export const metadata = { title: "Today" };

type UpcomingRow = {
  id: string;
  title: string;
  shoot_date: string;
  location: string | null;
  status: ProjectStatus;
  clients: { name: string; id: string } | null;
};

type InvoiceRow = {
  id: string;
  number: string;
  total_pence: number;
  amount_paid_pence: number;
  due_date: string | null;
  status: InvoiceStatus;
  projects: { title: string; clients: { name: string } | null } | null;
};

type BookingRow = {
  id: string;
  starts_at: string;
  projects: { id: string; title: string; clients: { name: string } | null } | null;
};

export default async function AdminDashboard() {
  const { supabase } = await requireAdmin();
  const today = todayISO();
  const in14 = todayISO(14);

  const [upcoming, requests, invoices, editing, activity, google] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, shoot_date, location, status, clients(id, name)")
      .gte("shoot_date", today)
      .lte("shoot_date", in14)
      .order("shoot_date")
      .returns<UpcomingRow[]>(),
    supabase
      .from("bookings")
      .select("id, starts_at, projects(id, title, clients(name))")
      .eq("status", "requested")
      .order("starts_at")
      .returns<BookingRow[]>(),
    supabase
      .from("invoices")
      .select("id, number, total_pence, amount_paid_pence, due_date, status, projects(title, clients(name))")
      .in("status", ["sent", "partially_paid", "overdue"])
      .order("due_date")
      .returns<InvoiceRow[]>(),
    supabase
      .from("projects")
      .select("id, title, status, clients(id, name)")
      .in("status", ["shot", "editing"])
      .order("shoot_date")
      .returns<Omit<UpcomingRow, "shoot_date" | "location">[]>(),
    supabase
      .from("activity_log")
      .select("id, actor_label, action, created_at, client_id")
      .order("created_at", { ascending: false })
      .limit(8),
    getGoogleConnection(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="nc-label text-ash">{formatDate(today, { weekday: "long" })}</p>
          <h1 className="nc-h1 mt-1">today.</h1>
        </div>
        <ButtonLink href="/admin/clients?new=1" variant="primary">
          New client
        </ButtonLink>
      </div>

      {!google ? (
        <Notice tone="amber">
          Google isn&apos;t connected yet, so Drive folders and your calendar can&apos;t be used.{" "}
          <Link href="/admin/settings" className="font-bold underline underline-offset-4">
            Connect Google
          </Link>
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Shoots, next 14 days" value={upcoming.data?.length ?? 0} />
        <Stat label="Booking requests" value={requests.data?.length ?? 0} tone={requests.data?.length ? "amber" : undefined} />
        <Stat label="Unpaid invoices" value={invoices.data?.length ?? 0} tone={invoices.data?.some((i) => i.status === "overdue") ? "rust" : undefined} />
        <Stat label="In the edit" value={editing.data?.length ?? 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="nc-h2 mb-4">upcoming shoots.</h2>
          {upcoming.data?.length ? (
            <ul className="divide-y divide-stone">
              {upcoming.data.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/admin/projects/${p.id}`} className="font-bold hover:underline">
                      {p.title}
                    </Link>
                    <p className="nc-meta">
                      {p.clients?.name} · {formatDate(p.shoot_date, { weekday: "short" })}
                      {p.location ? ` · ${p.location}` : ""}
                    </p>
                  </div>
                  <Badge tone={projectStatusTone[p.status]}>{humanise(p.status)}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Nothing booked in the next two weeks.</EmptyState>
          )}
        </Card>

        <Card>
          <h2 className="nc-h2 mb-4">needs you.</h2>
          {requests.data?.length || invoices.data?.length ? (
            <ul className="divide-y divide-stone">
              {requests.data?.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-bold">Booking request: {b.projects?.clients?.name}</p>
                    <p className="nc-meta">{formatDateTime(b.starts_at)}</p>
                  </div>
                  <Badge tone="amber">review</Badge>
                </li>
              ))}
              {invoices.data?.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-bold">
                      Invoice {inv.number} · {formatPence(inv.total_pence - inv.amount_paid_pence)} due
                    </p>
                    <p className="nc-meta">
                      {inv.projects?.clients?.name} · due {formatDate(inv.due_date)}
                    </p>
                  </div>
                  <Badge tone={invoiceStatusTone[inv.status]}>{humanise(inv.status)}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>All clear. Booking requests, approvals and unpaid invoices will show up here.</EmptyState>
          )}
        </Card>

        <Card>
          <h2 className="nc-h2 mb-4">in the edit.</h2>
          {editing.data?.length ? (
            <ul className="divide-y divide-stone">
              {editing.data.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <Link href={`/admin/projects/${p.id}`} className="font-bold hover:underline">
                    {p.title} <span className="nc-meta font-normal">· {p.clients?.name}</span>
                  </Link>
                  <Badge tone={projectStatusTone[p.status]}>{humanise(p.status)}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>No projects waiting on edits.</EmptyState>
          )}
        </Card>

        <Card>
          <h2 className="nc-h2 mb-4">recent activity.</h2>
          {activity.data?.length ? (
            <ul className="divide-y divide-stone">
              {activity.data.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span>
                    <span className="font-bold">{a.actor_label ?? "someone"}</span> {humanise(String(a.action).replace(".", " "))}
                  </span>
                  <span className="nc-meta whitespace-nowrap">{formatDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Views, downloads and approvals will appear here.</EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "amber" | "rust" }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="nc-meta">{label}</span>
      <span className={`text-4xl font-black tracking-tight ${tone === "rust" ? "text-rust" : tone === "amber" ? "text-amber" : ""}`}>
        {value}
      </span>
    </Card>
  );
}
