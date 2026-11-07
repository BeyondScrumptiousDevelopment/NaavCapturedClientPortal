import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  fromBase64Url,
  hashPin,
  signToken,
  toBase64Url,
  verifyPin,
  verifyToken,
} from "./crypto";

const SECRET = "test-secret-that-is-long-enough";
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes));
  });
});

describe("PIN hashing", () => {
  it("verifies the right PIN and rejects others", async () => {
    const stored = await hashPin("482913", SECRET);
    expect(stored.startsWith("pbkdf2$100000$")).toBe(true);
    expect(await verifyPin("482913", stored, SECRET)).toBe(true);
    expect(await verifyPin("482914", stored, SECRET)).toBe(false);
  });

  it("depends on the pepper", async () => {
    const stored = await hashPin("123456", SECRET);
    expect(await verifyPin("123456", stored, "another-secret")).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPin("123456", SECRET)).not.toEqual(await hashPin("123456", SECRET));
  });

  it("rejects malformed stored values", async () => {
    expect(await verifyPin("123456", "plain-text", SECRET)).toBe(false);
    expect(await verifyPin("123456", "pbkdf2$999999999$a$b", SECRET)).toBe(false);
  });
});

describe("signed tokens", () => {
  const exp = () => Math.floor(Date.now() / 1000) + 60;

  it("verifies a valid token", async () => {
    const token = await signToken({ gp: "abc", exp: exp() }, SECRET);
    expect((await verifyToken<{ gp: string; exp: number }>(token, SECRET))?.gp).toBe("abc");
  });

  it("rejects tampered payloads", async () => {
    const token = await signToken({ gp: "abc", exp: exp() }, SECRET);
    const [, sig] = token.split(".");
    const forged = `${toBase64Url(new TextEncoder().encode(JSON.stringify({ gp: "xyz", exp: exp() })))}.${sig}`;
    expect(await verifyToken(forged, SECRET)).toBeNull();
  });

  it("rejects the wrong secret and expired tokens", async () => {
    const token = await signToken({ exp: exp() }, SECRET);
    expect(await verifyToken(token, "other")).toBeNull();
    const old = await signToken({ exp: Math.floor(Date.now() / 1000) - 1 }, SECRET);
    expect(await verifyToken(old, SECRET)).toBeNull();
  });

  it("rejects junk", async () => {
    expect(await verifyToken(undefined, SECRET)).toBeNull();
    expect(await verifyToken("nope", SECRET)).toBeNull();
    expect(await verifyToken("a.b.c", SECRET)).toBeNull();
  });
});

describe("secret encryption", () => {
  it("round-trips and uses a fresh IV", async () => {
    const a = await encryptSecret("1//refresh-token", KEY);
    const b = await encryptSecret("1//refresh-token", KEY);
    expect(a).not.toEqual(b);
    expect(await decryptSecret(a, KEY)).toBe("1//refresh-token");
  });

  it("fails on tampering", async () => {
    const token = await encryptSecret("secret", KEY);
    const [v, iv, ct] = token.split(".");
    const bytes = fromBase64Url(ct);
    bytes[0] ^= 1;
    await expect(decryptSecret(`${v}.${iv}.${toBase64Url(bytes)}`, KEY)).rejects.toThrow();
  });

  it("requires a 32-byte key", async () => {
    await expect(encryptSecret("x", btoa("short"))).rejects.toThrow(/32 bytes/);
  });
});
