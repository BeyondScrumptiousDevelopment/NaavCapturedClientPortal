import "server-only";
import { env } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { createServiceClient } from "@/lib/supabase/admin";

// Drive: read-only (list folders, thumbnails, streaming). Calendar: read free/busy + write events (Phase 3).
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/calendar",
];

export const googleRedirectUri = () => `${env.appUrl()}/api/google/callback`;

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId(),
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId(),
      client_secret: env.googleClientSecret(),
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) throw new Error(json.error_description ?? json.error ?? "Google token exchange failed");
  return json;
}

export async function fetchGoogleEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Could not read Google account email");
  const json = (await res.json()) as { email?: string };
  return json.email ?? "unknown";
}

export async function saveGoogleConnection(email: string, refreshToken: string, scopes: string) {
  const refresh_token_enc = await encryptSecret(refreshToken, env.tokenEncryptionKey());
  const { error } = await createServiceClient()
    .from("google_connections")
    .upsert({ id: 1, account_email: email, refresh_token_enc, scopes, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function getGoogleConnection() {
  const { data } = await createServiceClient()
    .from("google_connections")
    .select("account_email, scopes, connected_at, updated_at")
    .eq("id", 1)
    .maybeSingle();
  return data as { account_email: string; scopes: string; connected_at: string; updated_at: string } | null;
}

export async function disconnectGoogle() {
  const svc = createServiceClient();
  const { data } = await svc.from("google_connections").select("refresh_token_enc").eq("id", 1).maybeSingle();
  if (data?.refresh_token_enc) {
    try {
      const token = await decryptSecret(data.refresh_token_enc, env.tokenEncryptionKey());
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
    } catch {
      // Revocation is best-effort; the row is deleted either way.
    }
  }
  await svc.from("google_connections").delete().eq("id", 1);
}

// Short in-memory cache of the access token per isolate.
let cachedAccess: { token: string; expiresAt: number } | null = null;

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedAccess && cachedAccess.expiresAt > Date.now() + 60_000) return cachedAccess.token;

  const { data } = await createServiceClient()
    .from("google_connections")
    .select("refresh_token_enc")
    .eq("id", 1)
    .maybeSingle();
  if (!data) throw new GoogleNotConnectedError();

  const refreshToken = await decryptSecret(data.refresh_token_enc, env.tokenEncryptionKey());
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId(),
      client_secret: env.googleClientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) throw new Error(json.error_description ?? json.error ?? "Google token refresh failed");
  cachedAccess = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export class GoogleNotConnectedError extends Error {
  constructor() {
    super("Google account is not connected. Connect it in Settings.");
  }
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

/** Accepts a folder URL (drive.google.com/drive/folders/<id>, ?id=<id>) or a bare ID. */
export function parseDriveFolderId(input: string): string | null {
  const value = input.trim();
  const fromPath = value.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  if (fromPath) return fromPath[1];
  const fromQuery = value.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (fromQuery) return fromQuery[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(value)) return value;
  return null;
}

async function driveFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const token = await getGoogleAccessToken();
  const url = `https://www.googleapis.com/drive/v3/${path}?${new URLSearchParams({
    supportsAllDrives: "true",
    ...params,
  })}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Drive request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function getDriveFile(id: string): Promise<DriveFile> {
  return driveFetch<DriveFile>(`files/${encodeURIComponent(id)}`, { fields: "id,name,mimeType,size,modifiedTime" });
}

export async function listDriveChildren(folderId: string, onlyFolders = false): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  const q = `'${folderId.replace(/'/g, "")}' in parents and trashed = false${
    onlyFolders ? ` and mimeType = '${DRIVE_FOLDER_MIME}'` : ""
  }`;
  do {
    const page = await driveFetch<{ files: DriveFile[]; nextPageToken?: string }>("files", {
      q,
      fields: "nextPageToken, files(id,name,mimeType,size,modifiedTime)",
      pageSize: "1000",
      orderBy: "name",
      includeItemsFromAllDrives: "true",
      ...(pageToken ? { pageToken } : {}),
    });
    files.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return files;
}

/** Map the folder convention (<project>/Photos, /Raw, /Final) to collection kinds. */
export function collectionKindForFolder(name: string): "photos" | "raw" | "final" | "custom" {
  const n = name.trim().toLowerCase();
  if (n === "photos" || n === "photo") return "photos";
  if (n === "raw" || n === "raw video" || n === "raw footage") return "raw";
  if (n === "final" || n === "finals" || n === "final edits") return "final";
  return "custom";
}
