// Web Crypto only, so this runs the same in Node (dev) and Cloudflare Workers (prod).

const enc = new TextEncoder();
const dec = new TextDecoder();

// Cloudflare Workers caps PBKDF2 at 100k iterations.
const PBKDF2_ITERATIONS = 100_000;

export function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(input: string): Uint8Array<ArrayBuffer> {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Constant-time comparison of two byte arrays. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function hmac(secret: string, data: string): Promise<Uint8Array<ArrayBuffer>> {
  const key = await hmacKey(secret);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function sha256Hex(data: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(data)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Signed tokens (guest cookies, OAuth state): base64url(json).base64url(hmac)
// ---------------------------------------------------------------------------

export async function signToken(payload: { exp: number } & Record<string, unknown>, secret: string): Promise<string> {
  const body = toBase64Url(enc.encode(JSON.stringify(payload)));
  const sig = toBase64Url(await hmac(secret, body));
  return `${body}.${sig}`;
}

export async function verifyToken<T extends { exp: number }>(
  token: string | undefined,
  secret: string,
): Promise<T | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmac(secret, body);
  let given: Uint8Array;
  try {
    given = fromBase64Url(sig);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(dec.decode(fromBase64Url(body))) as T;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PIN hashing: PBKDF2-SHA256 over HMAC(pepper, pin). Format: pbkdf2$iter$salt$hash
// The pepper (APP_SECRET) means a leaked database alone cannot be brute-forced offline.
// ---------------------------------------------------------------------------

async function pbkdf2(input: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", input, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPin(pin: string, pepper: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await pbkdf2(await hmac(pepper, pin), salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPin(pin: string, stored: string, pepper: string): Promise<boolean> {
  const [scheme, iterStr, saltStr, hashStr] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterStr || !saltStr || !hashStr) return false;
  const iterations = Number(iterStr);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return false;
  const hash = await pbkdf2(await hmac(pepper, pin), fromBase64Url(saltStr), iterations);
  return timingSafeEqual(hash, fromBase64Url(hashStr));
}

// ---------------------------------------------------------------------------
// AES-256-GCM for secrets at rest (Google refresh token). Format: v1.iv.ciphertext
// ---------------------------------------------------------------------------

async function aesKey(keyB64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plain: string, keyB64: string): Promise<string> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(keyB64), enc.encode(plain)),
  );
  return `v1.${toBase64Url(iv)}.${toBase64Url(ct)}`;
}

export async function decryptSecret(token: string, keyB64: string): Promise<string> {
  const [v, ivStr, ctStr] = token.split(".");
  if (v !== "v1" || !ivStr || !ctStr) throw new Error("Unrecognised secret format");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(ivStr) },
    await aesKey(keyB64),
    fromBase64Url(ctStr),
  );
  return dec.decode(pt);
}
