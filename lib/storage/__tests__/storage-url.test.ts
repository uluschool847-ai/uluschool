import { describe, expect, it } from "vitest";

import {
  decodeStorageToken,
  encodeStorageKey,
  legacyStorageKeyFromUrl,
  normalizePersistedStorageReference,
  storageKeyFromUrl,
  storageUrlForKey,
  storageUrlMatchesKey,
} from "@/lib/storage/storage-url";

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

  it("derives storage keys only from matching opaque application routes", () => {
    const privateKey = "private/teachers/teacher-1/materials/a.pdf";
    const publicKey = "public/teachers/admin-1/photo.webp";

    expect(storageKeyFromUrl(storageUrlForKey(privateKey))).toBe(privateKey);
    expect(storageKeyFromUrl(storageUrlForKey(publicKey))).toBe(publicKey);
    expect(() =>
      storageKeyFromUrl(storageUrlForKey(privateKey).replace("/api/files/", "/api/public-files/")),
    ).toThrow(/storage url/i);
    expect(() => storageKeyFromUrl(`${storageUrlForKey(privateKey)}?download=1`)).toThrow(
      /storage url/i,
    );
  });

  it("requires an application URL to identify the exact storage key", () => {
    const first = "private/teachers/teacher-1/materials/a.pdf";
    const second = "private/teachers/teacher-1/materials/b.pdf";

    expect(storageUrlMatchesKey(storageUrlForKey(first), first)).toBe(true);
    expect(storageUrlMatchesKey(storageUrlForKey(first), second)).toBe(false);
    expect(storageUrlMatchesKey("https://example.com/a.pdf", first)).toBe(false);
  });

  it("derives legacy keys only through the explicit trusted legacy URL parser", () => {
    expect(legacyStorageKeyFromUrl("/uploads/teacher-1/old-photo.webp")).toBe(
      "uploads/teacher-1/old-photo.webp",
    );
    expect(legacyStorageKeyFromUrl("/public/uploads/teacher-1/old-photo.webp")).toBe(
      "uploads/teacher-1/old-photo.webp",
    );
    expect(() => legacyStorageKeyFromUrl("/uploads/../private.txt")).toThrow(/legacy storage url/i);
    expect(() => storageKeyFromUrl("/uploads/teacher-1/old-photo.webp")).toThrow(/storage url/i);
  });

  it("normalizes raw and canonical current references to one key with complete aliases", () => {
    const storageKey = "private/teachers/teacher-1/reports/report.pdf";
    const canonicalUrl = storageUrlForKey(storageKey);
    const expected = {
      aliases: [storageKey, canonicalUrl],
      kind: "current" as const,
      storageKey,
    };

    expect(normalizePersistedStorageReference(storageKey)).toEqual(expected);
    expect(normalizePersistedStorageReference(canonicalUrl)).toEqual(expected);
  });

  it.each([
    "uploads/reports/old.pdf",
    "/uploads/reports/old.pdf",
    "public/uploads/reports/old.pdf",
    "/public/uploads/reports/old.pdf",
    "reports/old.pdf",
  ])("normalizes every supported legacy reference form: %s", (value) => {
    expect(normalizePersistedStorageReference(value)).toEqual({
      aliases: [
        "uploads/reports/old.pdf",
        "/uploads/reports/old.pdf",
        "public/uploads/reports/old.pdf",
        "/public/uploads/reports/old.pdf",
        "reports/old.pdf",
      ],
      kind: "legacy",
      storageKey: "uploads/reports/old.pdf",
    });
  });

  it.each([
    "https://cdn.example.com/report.pdf",
    "private/teachers/teacher-1/reports/file name.pdf",
    "/api/files/not-a-valid-token",
    "/private/teachers/teacher-1/reports/report.pdf",
  ])("rejects malformed, external, or untrusted persisted references: %s", (value) => {
    expect(normalizePersistedStorageReference(value)).toBeNull();
  });

  it("rejects a Base64URL token with non-zero unused padding bits", () => {
    const canonical = encodeStorageKey("private/a/a");
    expect(canonical.endsWith("E")).toBe(true);

    const nonCanonical = `${canonical.slice(0, -1)}F`;
    expect(Buffer.from(nonCanonical, "base64url")).toEqual(Buffer.from(canonical, "base64url"));
    expect(() => decodeStorageToken(nonCanonical)).toThrow(/storage token/i);
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
