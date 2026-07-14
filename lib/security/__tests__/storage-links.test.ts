import { describe, expect, it } from "vitest";

import {
  preferredStoredFileHref,
  safeStoredFileHref,
  storageHrefForKey,
} from "@/lib/security/storage-links";
import { encodeStorageKey, storageUrlForKey } from "@/lib/storage/storage-url";

describe("storage link presentation", () => {
  const privateKey = "private/teachers/teacher-1/materials/worksheet.pdf";
  const publicKey = "public/teachers/admin-1/photo.webp";

  it("maps current storage keys to their purpose-bound application routes", () => {
    expect(storageHrefForKey(privateKey)).toBe(storageUrlForKey(privateKey));
    expect(storageHrefForKey(publicKey)).toBe(storageUrlForKey(publicKey));
    expect(storageHrefForKey(privateKey)).not.toContain("/uploads/");
  });

  it("preserves canonical, external HTTPS, and trusted legacy hrefs exactly", () => {
    const canonical = storageUrlForKey(privateKey);
    const external = "https://cdn.example.com/Files/Worksheet%20One.pdf?download=1#page=2";

    expect(safeStoredFileHref(canonical)).toBe(canonical);
    expect(safeStoredFileHref(external)).toBe(external);
    expect(safeStoredFileHref("/uploads/legacy/worksheet.pdf")).toBe(
      "/uploads/legacy/worksheet.pdf",
    );
    expect(preferredStoredFileHref(canonical, canonical)).toBe(canonical);
  });

  it("prefers a valid storage key over a stale duplicated URL", () => {
    expect(preferredStoredFileHref(privateKey, "https://cdn.example.com/stale.pdf")).toBe(
      storageUrlForKey(privateKey),
    );
  });

  it("normalizes trusted legacy keys without treating them as current keys", () => {
    expect(storageHrefForKey("uploads/legacy/worksheet.pdf")).toBe("/uploads/legacy/worksheet.pdf");
    expect(storageHrefForKey("/public/uploads/legacy/photo.webp")).toBe(
      "/uploads/legacy/photo.webp",
    );
    expect(storageHrefForKey("submissions/legacy-work.pdf")).toBe(
      "/uploads/submissions/legacy-work.pdf",
    );
  });

  it.each([
    "private/teachers/teacher-1/materials/file name.pdf",
    "private/teachers/teacher-1/materials/%2e%2e.pdf",
    "public/teachers/admin-1/photo name.webp",
    "/private/teachers/teacher-1/materials/file name.pdf",
    "/public/teachers/admin-1/photo name.webp",
  ])("rejects malformed current namespace key %s without a legacy upload fallback", (value) => {
    const href = storageHrefForKey(value);

    expect(href).toBeNull();
    expect(href).not.toBe(`/uploads/${value}`);
  });

  it.each([
    null,
    "",
    " javascript:alert(1)",
    "javascript:alert(1)",
    "data:application/pdf;base64,AAAA",
    "file:///secret.pdf",
    "//cdn.example.com/file.pdf",
    "http://cdn.example.com/file.pdf",
    "https://user:password@cdn.example.com/file.pdf",
    "https://cdn.example.com/file.pdf\nSet-Cookie: secret=1",
    "/name.pdf",
    "/api/upload/token",
    "/api/files/not+base64url",
    `/api/public-files/${encodeStorageKey(privateKey)}`,
    `/api/files/${encodeStorageKey(publicKey)}`,
  ])("rejects unsafe, malformed, or purpose-mismatched href %s", (value) => {
    expect(safeStoredFileHref(value)).toBeNull();
  });

  it("does not fall back to an unsafe URL when a storage key is malformed", () => {
    expect(
      preferredStoredFileHref(
        "private/teachers/teacher-1/materials/../secret.pdf",
        "javascript:alert(1)",
      ),
    ).toBeNull();
  });
});
