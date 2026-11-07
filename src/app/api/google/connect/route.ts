import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { googleAuthUrl } from "@/lib/google";
import { env } from "@/lib/env";
import { randomBytes, signToken, toBase64Url } from "@/lib/crypto";

const OAUTH_STATE_COOKIE = "nc_google_state";

export async function GET() {
  const { user } = await requireAdmin();
  const nonce = toBase64Url(randomBytes(24));
  const state = await signToken(
    { n: nonce, u: user.id, exp: Math.floor(Date.now() / 1000) + 600 },
    `oauth:${env.appSecret()}`,
  );
  const res = NextResponse.redirect(googleAuthUrl(state));
  res.cookies.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  return res;
}
