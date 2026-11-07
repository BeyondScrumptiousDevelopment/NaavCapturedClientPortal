import { randomBytes } from "./crypto";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // 32 chars, no 0/o/1/l to avoid misreads

export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return base || "client";
}

export function randomSuffix(length = 6): string {
  // 256 is divisible by 32, so the modulo is unbiased.
  return Array.from(randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Unguessable client link slug: name + 6 random characters, e.g. riya-and-bilal-k7m2qx */
export function clientSlug(name: string): string {
  return `${slugify(name)}-${randomSuffix(6)}`;
}

/** Keep the readable part of an existing slug and swap the random suffix. */
export function regenerateSlug(existing: string): string {
  const base = existing.replace(/-[a-z0-9]{6}$/, "");
  return `${base || "client"}-${randomSuffix(6)}`;
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
