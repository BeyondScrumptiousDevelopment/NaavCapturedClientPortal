"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { disconnectGoogle } from "@/lib/google";
import { logActivity } from "@/lib/activity";
import type { FormState } from "@/lib/form";

export async function disconnectGoogleAction(_prev: FormState): Promise<FormState> {
  const { user } = await requireAdmin();
  await disconnectGoogle();
  await logActivity({ actorId: user.id, actorLabel: "Naav", action: "google.disconnected" });
  revalidatePath("/admin/settings");
  return { ok: "Google disconnected." };
}
