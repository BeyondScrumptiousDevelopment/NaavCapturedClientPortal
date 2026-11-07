export interface FormState {
  error?: string;
  ok?: string;
}

export const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
};

export const optStr = (fd: FormData, key: string) => str(fd, key) || null;

export const bool = (fd: FormData, key: string) => fd.get(key) === "on" || fd.get(key) === "true";

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
