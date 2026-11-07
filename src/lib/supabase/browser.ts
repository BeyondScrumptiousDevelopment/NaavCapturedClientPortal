"use client";
import { createBrowserClient } from "@supabase/ssr";

// URL and anon key are passed in from the server (they are runtime secrets on Cloudflare,
// so they are not inlined into the browser bundle at build time). Both are safe to expose.
export function createClient(url: string, anonKey: string) {
  return createBrowserClient(url, anonKey, {
    cookieOptions: { maxAge: 60 * 60 * 24 * 30, sameSite: "lax" },
  });
}
