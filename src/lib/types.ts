// Row shapes for the tables in supabase/migrations/0001_init.sql.
// (Can be replaced by `supabase gen types typescript` once the project is linked.)

export type ClientType = "wedding" | "business";
export type UserRole = "admin" | "client_owner" | "client_member";
export type ProjectStatus = "enquiry" | "confirmed" | "shot" | "editing" | "delivered" | "closed";
export type BookingStatus = "requested" | "approved" | "confirmed" | "cancelled";
export type CollectionKind = "photos" | "raw" | "final" | "custom";
export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "overdue" | "void";

export interface Client {
  id: string;
  type: ClientType;
  name: string;
  slug: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  link_enabled: boolean;
  link_expires_at: string | null;
  brand_kit: Record<string, unknown> | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  client_id: string | null;
  can_download: boolean;
  can_approve: boolean;
  invited_by: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  client_id: string;
  title: string;
  package: string | null;
  shoot_date: string | null;
  shoot_end_date: string | null;
  location: string | null;
  raw_included: boolean;
  portfolio_consent: boolean;
  status: ProjectStatus;
  drive_folder_id: string | null;
  drive_folder_name: string | null;
  access_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  project_id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  google_event_id: string | null;
}

export interface Collection {
  id: string;
  project_id: string;
  name: string;
  kind: CollectionKind;
  drive_folder_id: string | null;
  guest_visible: boolean;
  downloads_allowed: boolean;
  watermark_preview: boolean;
  background: "white" | "ink";
  expires_at: string | null;
  sort_order: number;
  created_at: string;
}

export interface Invoice {
  id: string;
  project_id: string;
  number: string;
  total_pence: number;
  deposit_pence: number;
  amount_paid_pence: number;
  due_date: string | null;
  status: InvoiceStatus;
}

export interface GuestPass {
  id: string;
  project_id: string;
  collection_id: string | null;
  label: string | null;
  pin_hash: string;
  enabled: boolean;
  downloads_allowed: boolean;
  created_at: string;
}
