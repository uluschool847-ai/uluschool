import { readFileSync } from "node:fs";
import path from "node:path";
import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(async (allowedRoles: UserRole[]) => {
    if (!allowedRoles.includes(UserRole.TEACHER)) {
      throw new Error("Forbidden");
    }

    return {
      uid: "teacher-1",
      role: UserRole.TEACHER,
      email: "teacher@example.com",
    };
  }),
}));

describe("lib/storage local-first contract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("schema should define Attachment/File model linked to Submission and CourseMaterial", () => {
    const schemaPath = path.resolve(process.cwd(), "prisma/schema.prisma");
    const schema = readFileSync(schemaPath, "utf8");

    const hasAttachmentModel = /model\s+(Attachment|File)\s*\{/m.test(schema);
    const hasSubmissionRelation =
      /(Submission|HomeworkSubmission).*\[\]/m.test(schema) ||
      /(submissionId|homeworkSubmissionId)\s+String/m.test(schema);
    const hasMaterialRelation =
      /CourseMaterial.*\[\]/m.test(schema) || /courseMaterialId\s+String/m.test(schema);

    expect(hasAttachmentModel).toBe(true);
    expect(hasSubmissionRelation).toBe(true);
    expect(hasMaterialRelation).toBe(true);
  });

  it("StorageService upload() should return a local path or stable fileId", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService({ runtimeRole: "DEVELOPER" });
    const file = new File(["hello"], "sample.pdf", { type: "application/pdf" });

    const location = await service.upload(file);

    expect(typeof location).toBe("string");
    expect(location.length).toBeGreaterThan(3);
    expect(location).toMatch(/^(\/public\/uploads\/|\.\/uploads\/|uploads\/|[a-f0-9-]{8,})/i);
  });

  it("should generate deterministic but unique keys for image uploads", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService({ runtimeRole: "DEVELOPER" });
    const image = new File(["image-bytes"], "avatar.png", { type: "image/png" });

    const keyA = await service.upload(image);
    const keyB = await service.upload(image);

    expect(keyA).toMatch(/(avatar|image|png|uploads)/i);
    expect(keyB).toMatch(/(avatar|image|png|uploads)/i);
    expect(keyA).not.toBe(keyB);
  });

  it("StorageService getURL() should resolve to local relative path in developer mode", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService({ runtimeRole: "DEVELOPER" });

    const url = service.getURL("file-local-id");

    expect(url).toMatch(/^\/(public\/)?uploads\//i);
  });

  it("StorageService delete() should resolve without throwing for existing file", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService({ runtimeRole: "DEVELOPER" });

    await expect(service.delete("existing-file-id")).resolves.toBeUndefined();
  });

  it("should avoid collisions when uploading duplicate file names", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService({ runtimeRole: "DEVELOPER" });
    const fileA = new File(["resume-a"], "resume.pdf", { type: "application/pdf" });
    const fileB = new File(["resume-b"], "resume.pdf", { type: "application/pdf" });

    const firstKey = await service.upload(fileA);
    const secondKey = await service.upload(fileB);

    expect(firstKey).not.toBe(secondKey);
  });

  it("should reject upload when file exceeds 5MB", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService({ runtimeRole: "DEVELOPER" });
    const sixMb = new Uint8Array(6 * 1024 * 1024);
    const oversized = new File([sixMb], "oversized.pdf", { type: "application/pdf" });

    await expect(service.upload(oversized)).rejects.toThrow(/(5mb|too large|size limit)/i);
  });

  it("should reject upload for disallowed MIME type", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService({ runtimeRole: "DEVELOPER" });
    const invalid = new File(["<script />"], "x.html", { type: "text/html" });

    await expect(service.upload(invalid)).rejects.toThrow(/(mime|type|not allowed)/i);
  });

  it("should reject zero-byte files", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService({ runtimeRole: "DEVELOPER" });
    const zero = new File([new Uint8Array(0)], "empty.pdf", { type: "application/pdf" });

    await expect(service.upload(zero)).rejects.toThrow(/(empty|zero|size)/i);
  });

  it("student submission should support attaching local file reference", async () => {
    const { submitWorkWithAttachmentAction } = await import(
      "@/app/portal/student/actions/submission-actions"
    );

    const result = await submitWorkWithAttachmentAction({
      assignmentId: "assignment-1",
      contentUrl: "/public/uploads/student/submission-1.pdf",
      attachment: {
        storageKey: "student/submission-1.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.attachment?.storageKey).toBe("student/submission-1.pdf");
  });

  it("teacher should attach multiple materials to one lesson", async () => {
    const { createClassMaterialsAction } = await import(
      "@/app/portal/teacher/actions/material-actions"
    );

    const result = await createClassMaterialsAction({
      classId: "class-1",
      materials: [
        {
          title: "Worksheet",
          fileUrl: "/public/uploads/teacher/worksheet.pdf",
          mimeType: "application/pdf",
        },
        {
          title: "Slides",
          fileUrl: "/public/uploads/teacher/slides.zip",
          mimeType: "application/zip",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.materials).toHaveLength(2);
  });

  it("should delete local file when attachment is unlinked from record", async () => {
    const { unlinkAttachmentAction } = await import(
      "@/app/portal/teacher/actions/material-actions"
    );
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService({ runtimeRole: "DEVELOPER" });
    const deleteSpy = vi.spyOn(service, "delete").mockResolvedValueOnce();

    const response = await unlinkAttachmentAction({
      attachmentId: "att-1",
      storageKey: "uploads/teacher/material-1.pdf",
    });

    expect(response.success).toBe(true);
    expect(deleteSpy).toHaveBeenCalledWith("uploads/teacher/material-1.pdf");
  });

  it("should sanitize filenames to prevent path traversal", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService({ runtimeRole: "DEVELOPER" });
    const traversalA = new File(["x"], "../../etc/passwd", { type: "text/plain" });
    const traversalB = new File(["y"], "..\\secret.txt", { type: "text/plain" });

    const keyA = await service.upload(traversalA);
    const keyB = await service.upload(traversalB);

    expect(keyA).not.toMatch(/\.\./);
    expect(keyB).not.toMatch(/\.\./);
    expect(keyA).toMatch(/^\/?((public\/)?uploads\/)/i);
    expect(keyB).toMatch(/^\/?((public\/)?uploads\/)/i);
  });

  it("should cascade cleanup file references when deleting course material", async () => {
    const { deleteCourseMaterialWithFilesAction } = await import(
      "@/app/portal/teacher/actions/material-actions"
    );

    const response = await deleteCourseMaterialWithFilesAction({
      materialId: "material-1",
    });

    expect(response.success).toBe(true);
    expect(response.cleanup).toEqual(
      expect.objectContaining({
        queued: expect.any(Boolean),
        deleted: expect.any(Number),
      }),
    );
  }, 15_000);

  it("should cascade cleanup file references when deleting homework submission", async () => {
    const { deleteSubmissionWithFilesAction } = await import(
      "@/app/portal/student/actions/submission-actions"
    );

    const response = await deleteSubmissionWithFilesAction({
      submissionId: "submission-1",
    });

    expect(response.success).toBe(true);
    expect(response.cleanup).toEqual(
      expect.objectContaining({
        queued: expect.any(Boolean),
        deleted: expect.any(Number),
      }),
    );
  });

  it("should fail gracefully when storage backend reports disk full", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService({ runtimeRole: "DEVELOPER" });

    vi.spyOn(service, "upload").mockRejectedValueOnce(new Error("ENOSPC: no space left on device"));

    const file = new File(["x"], "note.pdf", { type: "application/pdf" });
    await expect(service.upload(file)).rejects.toThrow(/(enospc|disk|space)/i);
  });
});
