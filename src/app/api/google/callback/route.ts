import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { exchangeCode, fetchGoogleEmail, saveGoogleConnection } from "@/lib/google";
import { env } from "@/lib/env";
import { timingSafeEqual, verifyToken } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";

const STATE_COOKIE = "nc_google_state";

export async function GET(request: NextRequest) {
  const { user } = await requireAdmin();
  const settings = new URL("/admin/settings", env.appUrl());
  const fail = () => {
    settings.searchParams.set("google", "error");
    const res = NextResponse.redirect(settings);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/google" });
    return res;
  };

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = await verifyToken<{ n: string; u: string; exp: number }>(
    params.get("state") ?? undefined,
    `oauth:${env.appSecret()}`,
  );
  const cookieNonce = request.cookies.get(STATE_COOKIE)?.value ?? "";
  const enc = new TextEncoder();
  if (
    !code ||
    !state ||
    state.u !== user.id ||
    !timingSafeEqual(enc.encode(state.n), enc.encode(cookieNonce))
  ) {
    return fail();
  }

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token");
    const email = await fetchGoogleEmail(tokens.access_token);
    await saveGoogleConnection(email, tokens.refresh_token, tokens.scope);
    await logActivity({ actorId: user.id, actorLabel: "Naav", action: "google.connected", meta: { email } });
  } catch (err) {
    console.error("Google connect failed", err);
    return fail();
  }

  settings.searchParams.set("google", "connected");
  const res = NextResponse.redirect(settings);
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/google" });
  return res;
}
