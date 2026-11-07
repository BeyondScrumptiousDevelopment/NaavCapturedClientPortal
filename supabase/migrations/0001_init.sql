-- naavcaptured Client Portal: Phase 1 schema
-- Media files never live here: the database holds metadata, access rules and Drive IDs only.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.client_type as enum ('wedding', 'business');
create type public.user_role as enum ('admin', 'client_owner', 'client_member');
create type public.project_status as enum ('enquiry', 'confirmed', 'shot', 'editing', 'delivered', 'closed');
create type public.booking_status as enum ('requested', 'approved', 'confirmed', 'cancelled');
create type public.collection_kind as enum ('photos', 'raw', 'final', 'custom');
create type public.asset_type as enum ('photo', 'video', 'other');
create type public.review_decision as enum ('approved', 'changes_requested');
create type public.invoice_status as enum ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.clients (
  id               uuid primary key default gen_random_uuid(),
  type             public.client_type not null,
  name             text not null,
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  link_enabled     boolean not null default true,
  link_expires_at  timestamptz,
  brand_kit        jsonb,            -- business clients: { logo_url, colours[], fonts[] }
  notes            text,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One row per signed-in person (Naav, couples, business owners, team members).
-- 2FA for the admin is Supabase Auth MFA (TOTP); admin powers require aal2 (see is_admin()).
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  full_name     text,
  role          public.user_role not null,
  client_id     uuid references public.clients (id) on delete cascade,
  can_download  boolean not null default true,
  can_approve   boolean not null default true,
  invited_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint profiles_client_required check (
    (role = 'admin' and client_id is null) or (role <> 'admin' and client_id is not null)
  )
);
create unique index profiles_email_client_idx on public.profiles (lower(email), client_id);

create table public.projects (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients (id) on delete cascade,
  title              text not null,
  package            text,
  shoot_date         date,
  shoot_end_date     date,
  location           text,
  raw_included       boolean not null default false,  -- "Include raw footage" toggle, off by default
  portfolio_consent  boolean not null default false,  -- may Naav use this work in portfolio/socials
  status             public.project_status not null default 'enquiry',
  drive_folder_id    text,
  drive_folder_name  text,
  access_expires_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index projects_client_idx on public.projects (client_id);
create index projects_shoot_date_idx on public.projects (shoot_date);

create table public.bookings (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid not null references public.projects (id) on delete cascade,
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  buffer_before_minutes  integer not null default 0,
  buffer_after_minutes   integer not null default 0,
  google_event_id        text,
  status                 public.booking_status not null default 'requested',
  conflict_check         jsonb,
  created_at             timestamptz not null default now(),
  constraint bookings_time_order check (ends_at > starts_at)
);
create index bookings_project_idx on public.bookings (project_id);
create index bookings_starts_idx on public.bookings (starts_at);

create table public.collections (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  name               text not null,
  kind               public.collection_kind not null,
  drive_folder_id    text,
  guest_visible      boolean not null default false,
  downloads_allowed  boolean not null default true,
  watermark_preview  boolean not null default false,
  background         text not null default 'white' check (background in ('white', 'ink')),
  expires_at         timestamptz,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  -- Raw footage is never visible to guests: enforced by the database, not just hidden.
  constraint collections_raw_never_guest check (not (kind = 'raw' and guest_visible))
);
create index collections_project_idx on public.collections (project_id);

create table public.assets (
  id                uuid primary key default gen_random_uuid(),
  collection_id     uuid not null references public.collections (id) on delete cascade,
  drive_file_id     text not null,
  name              text not null,
  mime_type         text,
  type              public.asset_type not null default 'other',
  size_bytes        bigint,
  duration_seconds  numeric,
  width             integer,
  height            integer,
  version           integer not null default 1,
  added_at          timestamptz not null default now(),
  unique (collection_id, drive_file_id)
);
create index assets_collection_idx on public.assets (collection_id);

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references public.assets (id) on delete cascade,
  version     integer not null,
  decision    public.review_decision not null,
  decided_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index reviews_asset_idx on public.reviews (asset_id);

create table public.review_comments (
  id                 uuid primary key default gen_random_uuid(),
  asset_id           uuid not null references public.assets (id) on delete cascade,
  version            integer not null,
  author_id          uuid references public.profiles (id) on delete set null,
  body               text not null check (length(body) between 1 and 4000),
  timestamp_seconds  numeric,  -- position in a video the comment refers to
  created_at         timestamptz not null default now()
);
create index review_comments_asset_idx on public.review_comments (asset_id);

create table public.invoices (
  id                        uuid primary key default gen_random_uuid(),
  project_id                uuid not null references public.projects (id) on delete cascade,
  number                    text not null unique,
  line_items                jsonb not null default '[]'::jsonb,  -- [{ description, quantity, unit_pence }]
  vat_enabled               boolean not null default false,
  vat_rate                  numeric not null default 20,
  total_pence               integer not null default 0,
  deposit_pence             integer not null default 0,
  amount_paid_pence         integer not null default 0,
  due_date                  date,
  stripe_checkout_id        text,
  stripe_payment_intent_id  text,
  status                    public.invoice_status not null default 'draft',
  created_at                timestamptz not null default now()
);
create index invoices_project_idx on public.invoices (project_id);

-- Guest gallery PINs. Scoped to a project (all guest-visible collections) or one collection.
create table public.guest_passes (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  collection_id      uuid references public.collections (id) on delete cascade,
  label              text,
  pin_hash           text not null,
  enabled            boolean not null default true,
  downloads_allowed  boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index guest_passes_project_idx on public.guest_passes (project_id);

-- Failed PIN attempts per client link and (hashed) IP, for the 5-tries / 15-minute lockout.
create table public.pin_attempts (
  client_id     uuid not null references public.clients (id) on delete cascade,
  ip_hash       text not null,
  failed_count  integer not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (client_id, ip_hash)
);

create table public.activity_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles (id) on delete set null,
  actor_label  text,  -- e.g. 'guest', 'system', or the actor's email at the time
  client_id    uuid references public.clients (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete cascade,
  action       text not null,
  target_type  text,
  target_id    text,
  meta         jsonb,
  created_at   timestamptz not null default now()
);
create index activity_log_client_idx on public.activity_log (client_id, created_at desc);

-- Naav's Google account (Drive + Calendar). Single row. Token is AES-GCM encrypted by the app.
-- RLS on with no policies: only the service role (server) can touch it.
create table public.google_connections (
  id                 integer primary key default 1 check (id = 1),
  account_email      text not null,
  refresh_token_enc  text not null,
  scopes             text not null,
  connected_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger guest_passes_touch before update on public.guest_passes
  for each row execute function public.touch_updated_at();

-- A guest pass may only point at a non-raw collection belonging to the same project.
create or replace function public.check_guest_pass_collection() returns trigger
language plpgsql as $$
declare
  c record;
begin
  if new.collection_id is null then
    return new;
  end if;
  select project_id, kind into c from public.collections where id = new.collection_id;
  if c.project_id is distinct from new.project_id then
    raise exception 'guest pass collection must belong to the same project';
  end if;
  if c.kind = 'raw' then
    raise exception 'guest passes can never open raw footage';
  end if;
  return new;
end $$;

create trigger guest_passes_collection_check before insert or update on public.guest_passes
  for each row execute function public.check_guest_pass_collection();

-- ---------------------------------------------------------------------------
-- RLS helpers (security definer so they can read profiles without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function public.my_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.client_id
  from public.profiles p
  join public.clients c on c.id = p.client_id
  where p.id = auth.uid()
    and c.archived_at is null
    and c.link_enabled
    and (c.link_expires_at is null or c.link_expires_at > now());
$$;

create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Can the signed-in client see this collection? Raw only when the project includes it.
create or replace function public.client_can_view_collection(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.collections col
    join public.projects pr on pr.id = col.project_id
    where col.id = cid
      and pr.client_id = public.my_client_id()
      and (pr.access_expires_at is null or pr.access_expires_at > now())
      and (col.expires_at is null or col.expires_at > now())
      and (col.kind <> 'raw' or pr.raw_included)
  );
$$;

create or replace function public.client_can_view_asset(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assets a
    where a.id = aid and public.client_can_view_collection(a.collection_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.clients            enable row level security;
alter table public.profiles           enable row level security;
alter table public.projects           enable row level security;
alter table public.bookings           enable row level security;
alter table public.collections        enable row level security;
alter table public.assets             enable row level security;
alter table public.reviews            enable row level security;
alter table public.review_comments    enable row level security;
alter table public.invoices           enable row level security;
alter table public.guest_passes       enable row level security;
alter table public.pin_attempts       enable row level security;
alter table public.activity_log       enable row level security;
alter table public.google_connections enable row level security;

-- Admin (Naav, with 2FA) can do everything except read the Google token table.
create policy admin_all on public.clients         for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.profiles        for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.projects        for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.bookings        for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.collections     for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.assets          for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.reviews         for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.review_comments for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.invoices        for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.guest_passes    for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.activity_log    for select using (public.is_admin());

-- Clients: only ever their own rows.
create policy client_read_own on public.clients
  for select using (id = public.my_client_id());

create policy self_read on public.profiles
  for select using (id = auth.uid());
create policy owner_reads_team on public.profiles
  for select using (public.my_role() = 'client_owner' and client_id = public.my_client_id());

create policy client_read_own on public.projects
  for select using (
    client_id = public.my_client_id()
    and (access_expires_at is null or access_expires_at > now())
  );

create policy client_read_own on public.bookings
  for select using (
    exists (select 1 from public.projects pr
            where pr.id = project_id and pr.client_id = public.my_client_id())
  );

create policy client_read_visible on public.collections
  for select using (public.client_can_view_collection(id));

create policy client_read_visible on public.assets
  for select using (public.client_can_view_collection(collection_id));

create policy client_read on public.reviews
  for select using (public.client_can_view_asset(asset_id));
create policy client_decide on public.reviews
  for insert with check (
    decided_by = auth.uid()
    and public.client_can_view_asset(asset_id)
    and exists (select 1 from public.profiles where id = auth.uid() and can_approve)
  );

create policy client_read on public.review_comments
  for select using (public.client_can_view_asset(asset_id));
create policy client_comment on public.review_comments
  for insert with check (author_id = auth.uid() and public.client_can_view_asset(asset_id));

-- Invoices: account owners (couple / business owner) only, not team members.
create policy owner_read_own on public.invoices
  for select using (
    public.my_role() = 'client_owner'
    and exists (select 1 from public.projects pr
                where pr.id = project_id and pr.client_id = public.my_client_id())
  );

-- guest_passes, pin_attempts, google_connections: no client policies.
-- Guest (PIN) access never uses a Supabase account; the server checks the signed guest
-- cookie and queries with the service role, filtering to guest-visible, non-raw collections.
