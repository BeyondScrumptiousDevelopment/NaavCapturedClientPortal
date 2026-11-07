import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { clientSlug, regenerateSlug, slugify, SLUG_PATTERN } from "./slug";
import { collectionKindForFolder, parseDriveFolderId } from "./google";

describe("slugs", () => {
  it("makes readable slugs", () => {
    expect(slugify("Riya & Bilal")).toBe("riya-and-bilal");
    expect(slugify("Beyond Scrumptious")).toBe("beyond-scrumptious");
    expect(slugify("Zoë's Café!!")).toBe("zoe-s-cafe");
    expect(slugify("!!!")).toBe("client");
  });

  it("adds 6 unguessable characters", () => {
    const slug = clientSlug("Riya & Bilal");
    expect(slug).toMatch(/^riya-and-bilal-[a-z2-9]{6}$/);
    expect(slug).toMatch(SLUG_PATTERN);
    expect(clientSlug("Riya & Bilal")).not.toBe(slug);
  });

  it("regenerates only the random part", () => {
    const next = regenerateSlug("riya-and-bilal-k7m2qx");
    expect(next).toMatch(/^riya-and-bilal-[a-z2-9]{6}$/);
    expect(next).not.toBe("riya-and-bilal-k7m2qx");
  });
});

describe("Drive helpers", () => {
  it("parses folder links and IDs", () => {
    const id = "1iuHGxSy3sE3q8NbOx4NOReX0smffJSTN";
    expect(parseDriveFolderId(`https://drive.google.com/drive/folders/${id}?usp=sharing`)).toBe(id);
    expect(parseDriveFolderId(`https://drive.google.com/drive/u/0/folders/${id}`)).toBe(id);
    expect(parseDriveFolderId(`https://drive.google.com/open?id=${id}`)).toBe(id);
    expect(parseDriveFolderId(id)).toBe(id);
    expect(parseDriveFolderId("not a link")).toBeNull();
  });

  it("maps the folder convention to collection kinds", () => {
    expect(collectionKindForFolder("Photos")).toBe("photos");
    expect(collectionKindForFolder("RAW")).toBe("raw");
    expect(collectionKindForFolder("Final")).toBe("final");
    expect(collectionKindForFolder("Reels")).toBe("custom");
  });
});
