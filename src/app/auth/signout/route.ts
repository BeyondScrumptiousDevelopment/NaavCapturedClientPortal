import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const next = request.nextUrl.searchParams.get("next");
  // Only allow same-site relative redirects.
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin/login";
  return NextResponse.redirect(new URL(target, request.url), { status: 303 });
}
