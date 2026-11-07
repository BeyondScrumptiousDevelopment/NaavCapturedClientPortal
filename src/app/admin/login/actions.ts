"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { str, type FormState } from "@/lib/form";

export async function adminSignIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "That email and password don't match." };

  const { data: profile } = await createServiceClient()
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    await supabase.auth.signOut();
    return { error: "That email and password don't match." };
  }

  await logActivity({ actorId: data.user.id, actorLabel: email, action: "admin.sign_in" });
  // Second factor next: enrol on first sign-in, verify every time after.
  redirect("/admin/mfa");
}
