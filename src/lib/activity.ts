import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export interface ActivityEntry {
  actorId?: string | null;
  actorLabel?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}

/** Best-effort audit log; never blocks the user's action if logging fails. */
export async function logActivity(entry: ActivityEntry) {
  try {
    await createServiceClient()
      .from("activity_log")
      .insert({
        actor_id: entry.actorId ?? null,
        actor_label: entry.actorLabel ?? null,
        client_id: entry.clientId ?? null,
        project_id: entry.projectId ?? null,
        action: entry.action,
        target_type: entry.targetType ?? null,
        target_id: entry.targetId ?? null,
        meta: entry.meta ?? null,
      });
  } catch (err) {
    console.error("activity log failed", err);
  }
}
