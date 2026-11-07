import "server-only";
import { cookies, headers } from "next/headers";
import { env } from "@/lib/env";
import { sha256Hex, signToken, verifyToken } from "@/lib/crypto";

export const GUEST_COOKIE = "nc_guest";
const GUEST_TTL_SECONDS = 60 * 60 * 12; // short-lived: 12 hours

export interface GuestSession {
  gp: string; // guest pass id
  c: string; // client id
  p: string; // project id
  col: string | null; // collection scope, or null for every guest-visible collection
  dl: boolean; // downloads allowed
  exp: number;
}

export async function setGuestCookie(session: Omit<GuestSession, "exp">, slug: string) {
  const exp = Math.floor(Date.now() / 1000) + GUEST_TTL_SECONDS;
  const token = await signToken({ ...session, exp }, `guest:${env.appSecret()}`);
  (await cookies()).set(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/c/${slug}`,
    maxAge: GUEST_TTL_SECONDS,
  });
}

export async function clearGuestCookie(slug: string) {
  (await cookies()).set(GUEST_COOKIE, "", { path: `/c/${slug}`, maxAge: 0 });
}

/** Returns the guest session only if the cookie is valid and scoped to this client. */
export async function getGuestSession(clientId: string): Promise<GuestSession | null> {
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  const session = await verifyToken<GuestSession>(token, `guest:${env.appSecret()}`);
  if (!session || session.c !== clientId) return null;
  return session;
}

/** A hashed IP, used for PIN lockouts without storing raw addresses. */
export async function requesterIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return sha256Hex(`ip:${env.appSecret()}:${ip}`);
}
