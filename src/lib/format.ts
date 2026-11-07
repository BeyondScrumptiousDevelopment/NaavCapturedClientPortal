import type { ProjectStatus, InvoiceStatus } from "@/lib/types";
import type { Tone } from "@/components/ui";

const tz = "Europe/London";

export function formatDate(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!value) return "—";
  // Plain dates (YYYY-MM-DD) are calendar days: format them without shifting time zones.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: tz, ...opts }).format(d);
}

export function formatDateTime(value: string | null | undefined) {
  return formatDate(value, { hour: "2-digit", minute: "2-digit" });
}

export function formatPence(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

/** Today's date in London as YYYY-MM-DD. */
export function todayISO(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}

export const projectStatusTone: Record<ProjectStatus, Tone> = {
  enquiry: "amber",
  confirmed: "sage",
  shot: "neutral",
  editing: "neutral",
  delivered: "sage",
  closed: "neutral",
};

export const invoiceStatusTone: Record<InvoiceStatus, Tone> = {
  draft: "neutral",
  sent: "amber",
  partially_paid: "amber",
  paid: "sage",
  overdue: "rust",
  void: "neutral",
};

export const humanise = (s: string) => s.replace(/_/g, " ");
