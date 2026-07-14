import { describe, expect, it } from "vitest";

import { decodeStorageToken, encodeStorageKey, storageUrlForKey } from "@/lib/storage/storage-url";

describe("storage application URLs", () => {
  it("round-trips private storage keys through an opaque application URL", () => {
    const storageKey = "private/teachers/teacher-1/materials/a.pdf";
    const url = storageUrlForKey(storageKey);
    const token = url.split("/").at(-1);

    expect(url).toMatch(/^\/api\/files\//);
    expect(token).toBeTruthy();
    if (!token) throw new Error("Storage token is missing");
    expect(decodeStorageToken(token)).toBe(storageKey);
  });

  it("routes only public-root keys through the public application endpoint", () => {
    expect(storageUrlForKey("public/teachers/admin-1/photo.webp")).toMatch(
      /^\/api\/public-files\//,
    );
    expect(storageUrlForKey("private/teachers/admin-1/photo.webp")).toMatch(/^\/api\/files\//);
  });

  it.each([
    "",
    "not+base64url",
    "YQ",
    `${encodeStorageKey("private/teachers/teacher-1/materials/a.pdf")}A`,
    "A".repeat(2_000),
  ])("rejects malformed, non-canonical, or unbounded tokens", (token) => {
    expect(() => decodeStorageToken(token)).toThrow(/storage (token|key)/i);
  });

  it.each([
    "uploads/file.pdf",
    "private/teachers/teacher-1/materials/../teacher-2/file.pdf",
    "private/teachers/teacher-1/materials/file\\name.pdf",
    "private/teachers/teacher-1/materials/file\u0000.pdf",
  ])("decodes only validated storage keys under allowed roots: %s", (storageKey) => {
    const token = Buffer.from(storageKey, "utf8").toString("base64url");
    expect(() => decodeStorageToken(token)).toThrow(/storage key/i);
  });
});
