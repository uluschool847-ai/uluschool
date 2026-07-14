import { describe, expect, it } from "vitest";

import {
  buildStorageKey,
  isTeacherMaterialStorageKey,
  publicTeacherPhotoNamespace,
  teacherMaterialNamespace,
  teacherReportNamespace,
  validateLegacyStorageKey,
  validateStorageKey,
} from "@/lib/storage/storage-key";

describe("storage keys", () => {
  it("builds an opaque key from a validated namespace and sanitized basename", () => {
    expect(buildStorageKey("private/teachers/teacher-1/materials", "../lesson plan.pdf")).toMatch(
      /^private\/teachers\/teacher-1\/materials\/[0-9a-f-]+-lesson-plan\.pdf$/,
    );
  });

  it.each([
    "../../escape",
    "private//teachers/teacher-1",
    "private/teachers/./materials",
    "private/teachers/teacher.1/materials",
    "private/teachers/teacher-1\\materials",
    `private/teachers/${"a".repeat(65)}/materials`,
  ])("rejects invalid namespace %s", (namespace) => {
    expect(() => buildStorageKey(namespace, "file.pdf")).toThrow(/namespace/i);
  });

  it.each(["", ".", "..", "../", "a".repeat(256)])(
    "rejects an empty or unbounded filename %s",
    (filename) => {
      expect(() => buildStorageKey("private/teachers/teacher-1/materials", filename)).toThrow(
        /filename/i,
      );
    },
  );

  it.each([
    "CON",
    "con.txt",
    "PRN.pdf",
    "AUX",
    "NUL.txt",
    "COM1.doc",
    "LPT9.ppt",
    ".CON",
    "_NUL.txt",
    "-LPT1.doc",
  ])("rejects Win32 reserved device filename %s", (filename) => {
    expect(() => buildStorageKey("private/teachers/teacher-1/materials", filename)).toThrow(
      /filename/i,
    );
  });

  it("rejects control characters instead of normalizing them into a filename", () => {
    expect(() =>
      buildStorageKey("private/teachers/teacher-1/materials", "lesson\u0000.pdf"),
    ).toThrow(/filename/i);
  });

  it.each(["lesson.pdf.", "lesson.pdf "])(
    "rejects filenames with a trailing dot or space: %s",
    (filename) => {
      expect(() => buildStorageKey("private/teachers/teacher-1/materials", filename)).toThrow(
        /filename/i,
      );
    },
  );

  it("uses exact namespace segment boundaries for teacher material ownership", () => {
    expect(
      isTeacherMaterialStorageKey("private/teachers/teacher-1/materials/a.pdf", "teacher-1"),
    ).toBe(true);
    expect(
      isTeacherMaterialStorageKey("private/teachers/teacher-10/materials/a.pdf", "teacher-1"),
    ).toBe(false);
    expect(
      isTeacherMaterialStorageKey(
        "private/teachers/teacher-1/materials-archive/a.pdf",
        "teacher-1",
      ),
    ).toBe(false);
    expect(
      isTeacherMaterialStorageKey(
        "private/teachers/teacher-1/materials/../teacher-2/a.pdf",
        "teacher-1",
      ),
    ).toBe(false);
  });

  it("builds fixed public and private namespaces from one validated identity segment", () => {
    expect(teacherMaterialNamespace("teacher-1")).toBe("private/teachers/teacher-1/materials");
    expect(teacherReportNamespace("teacher-1")).toBe("private/teachers/teacher-1/reports");
    expect(publicTeacherPhotoNamespace("admin-1")).toBe("public/teachers/admin-1");
    expect(() => teacherMaterialNamespace("teacher-1/materials/teacher-2")).toThrow(/segment/i);
    expect(() => teacherMaterialNamespace("CON")).toThrow(/segment/i);
  });

  it.each([
    "uploads/file.pdf",
    "/private/teachers/teacher-1/materials/file.pdf",
    "private/teachers/../teacher-2/file.pdf",
    "private/teachers/teacher-1/materials/file\\name.pdf",
    "private/teachers/teacher-1/materials/file\u0000.pdf",
    "private/teachers/NUL/materials/file.pdf",
    "private/teachers/teacher-1/materials/CON",
    "private/teachers/teacher-1/materials/file.pdf.",
    "private/teachers/teacher-1/materials/file.pdf ",
    `private/teachers/teacher-1/materials/${"a".repeat(256)}`,
  ])("rejects storage keys outside bounded public/private roots: %s", (storageKey) => {
    expect(() => validateStorageKey(storageKey)).toThrow(/storage key/i);
  });

  it("normalizes only bounded trusted legacy upload keys", () => {
    expect(validateLegacyStorageKey("uploads/teacher-1/old photo.webp")).toBe(
      "uploads/teacher-1/old photo.webp",
    );
    expect(validateLegacyStorageKey("/public/uploads/teacher-1/old.webp")).toBe(
      "uploads/teacher-1/old.webp",
    );
  });

  it.each([
    "private/teachers/teacher-1/materials/a.pdf",
    "uploads/../secret.txt",
    "uploads/teacher-1/CON",
    "uploads/teacher-1/file.pdf.",
    "uploads/teacher-1/file\\name.pdf",
  ])("rejects unsafe trusted legacy key shape: %s", (storageKey) => {
    expect(() => validateLegacyStorageKey(storageKey)).toThrow(/legacy storage key/i);
  });
});
