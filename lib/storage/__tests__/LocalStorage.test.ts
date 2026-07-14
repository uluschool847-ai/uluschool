import { readFileSync } from "node:fs";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

    const service = createStorageService();
    const file = new File(["hello"], "sample.pdf", { type: "application/pdf" });

    const location = await service.upload(file, {
      filename: file.name,
      namespace: "private/teachers/teacher-1/materials",
      contentType: file.type,
    });

    expect(typeof location).toBe("string");
    expect(location.length).toBeGreaterThan(3);
    expect(location).toMatch(/^private\/teachers\/teacher-1\/materials\/[0-9a-f-]+-sample\.pdf$/i);
  });

  it("should generate deterministic but unique keys for image uploads", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService();
    const image = new File(["image-bytes"], "avatar.png", { type: "image/png" });

    const options = {
      filename: image.name,
      namespace: "public/teachers/admin-1",
      contentType: image.type,
    };
    const keyA = await service.upload(image, options);
    const keyB = await service.upload(image, options);

    expect(keyA).toMatch(/^public\/teachers\/admin-1\/[0-9a-f-]+-avatar\.png$/i);
    expect(keyB).toMatch(/^public\/teachers\/admin-1\/[0-9a-f-]+-avatar\.png$/i);
    expect(keyA).not.toBe(keyB);
  });

  it("StorageService getURL() should resolve to local relative path in developer mode", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService();

    const url = service.getURL("private/teachers/teacher-1/materials/file-local-id.pdf");

    expect(url).toMatch(/^\/api\/files\//i);
  });

  it("StorageService delete() should resolve without throwing for existing file", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService();

    await expect(
      service.delete("private/teachers/teacher-1/materials/existing-file-id.pdf"),
    ).resolves.toBeUndefined();
  });

  it("should avoid collisions when uploading duplicate file names", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService();
    const fileA = new File(["resume-a"], "resume.pdf", { type: "application/pdf" });
    const fileB = new File(["resume-b"], "resume.pdf", { type: "application/pdf" });

    const options = {
      filename: "resume.pdf",
      namespace: "private/teachers/teacher-1/materials",
      contentType: "application/pdf",
    };
    const firstKey = await service.upload(fileA, options);
    const secondKey = await service.upload(fileB, options);

    expect(firstKey).not.toBe(secondKey);
  });

  it("should reject upload when file exceeds 5MB", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService();
    const sixMb = new Uint8Array(6 * 1024 * 1024);
    const oversized = new File([sixMb], "oversized.pdf", { type: "application/pdf" });

    await expect(
      service.upload(oversized, {
        filename: oversized.name,
        namespace: "private/teachers/teacher-1/materials",
        contentType: oversized.type,
      }),
    ).rejects.toThrow(/(5mb|too large|size limit)/i);
  });

  it("should reject upload for disallowed MIME type", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService();
    const invalid = new File(["<script />"], "x.html", { type: "text/html" });

    await expect(
      service.upload(invalid, {
        filename: invalid.name,
        namespace: "private/teachers/teacher-1/materials",
        contentType: invalid.type,
      }),
    ).rejects.toThrow(/(mime|type|not allowed)/i);
  });

  it("should reject zero-byte files", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService();
    const zero = new File([new Uint8Array(0)], "empty.pdf", { type: "application/pdf" });

    await expect(
      service.upload(zero, {
        filename: zero.name,
        namespace: "private/teachers/teacher-1/materials",
        contentType: zero.type,
      }),
    ).rejects.toThrow(/(empty|zero|size)/i);
  });

  it.each([
    ["oversized", 5 * 1024 * 1024 + 1, "application/pdf", /5mb|too large|size/i],
    ["disallowed MIME", 1, "image/svg+xml", /mime|type|not allowed/i],
    ["unbounded filename", 1, "application/pdf", /filename/i],
  ] as const)(
    "rejects %s File metadata before reading bytes",
    async (caseName, size, type, error) => {
      const { LocalStorageService } = await import("@/lib/storage/LocalStorageService");
      const arrayBuffer = vi.fn(async () => new ArrayBuffer(1));
      const file = {
        name: caseName === "unbounded filename" ? "a".repeat(256) : "file.pdf",
        size,
        type,
        arrayBuffer,
      } as unknown as File;
      const service = new LocalStorageService(path.join(tmpdir(), "unused-storage-root"));

      await expect(
        service.upload(file, {
          filename: file.name,
          namespace: "private/teachers/teacher-1/materials",
          contentType: file.type,
        }),
      ).rejects.toThrow(error);
      expect(arrayBuffer).not.toHaveBeenCalled();
    },
  );

  it("enforces the same size and MIME bounds for Buffer uploads", async () => {
    const { LocalStorageService } = await import("@/lib/storage/LocalStorageService");
    const service = new LocalStorageService(path.join(tmpdir(), "unused-storage-root"));
    const namespace = "private/teachers/teacher-1/reports";

    await expect(
      service.upload(Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: "report.pdf",
        namespace,
        contentType: "application/pdf",
      }),
    ).rejects.toThrow(/5mb|too large|size/i);
    await expect(
      service.upload(Buffer.from("<svg />"), {
        filename: "report.svg",
        namespace,
        contentType: "image/svg+xml",
      }),
    ).rejects.toThrow(/mime|type|not allowed/i);
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

    const service = createStorageService();
    const deleteSpy = vi.spyOn(service, "delete").mockResolvedValueOnce();

    const response = await unlinkAttachmentAction({
      attachmentId: "att-1",
      storageKey:
        "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-material-1.pdf",
    });

    expect(response.success).toBe(true);
    expect(deleteSpy).toHaveBeenCalledWith(
      "private/teachers/teacher-1/materials/00000000-0000-4000-8000-000000000001-material-1.pdf",
    );
  });

  it("should sanitize filenames to prevent path traversal", async () => {
    const { createStorageService } = await import("@/lib/storage");

    const service = createStorageService();
    const traversalA = new File(["x"], "../../etc/passwd", { type: "text/plain" });
    const traversalB = new File(["y"], "..\\secret.txt", { type: "text/plain" });

    const namespace = "private/teachers/teacher-1/materials";
    const keyA = await service.upload(traversalA, {
      filename: traversalA.name,
      namespace,
      contentType: traversalA.type,
    });
    const keyB = await service.upload(traversalB, {
      filename: traversalB.name,
      namespace,
      contentType: traversalB.type,
    });

    expect(keyA).not.toMatch(/\.\./);
    expect(keyB).not.toMatch(/\.\./);
    expect(keyA).toMatch(/^private\/teachers\/teacher-1\/materials\//i);
    expect(keyB).toMatch(/^private\/teachers\/teacher-1\/materials\//i);
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

    const service = createStorageService();

    vi.spyOn(service, "upload").mockRejectedValueOnce(new Error("ENOSPC: no space left on device"));

    const file = new File(["x"], "note.pdf", { type: "application/pdf" });
    await expect(
      service.upload(file, {
        filename: file.name,
        namespace: "private/teachers/teacher-1/materials",
        contentType: file.type,
      }),
    ).rejects.toThrow(/(enospc|disk|space)/i);
  });

  it("writes a namespaced key beneath the configured upload root", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "ulu-storage-upload-"));
    try {
      const { LocalStorageService } = await import("@/lib/storage/LocalStorageService");
      const service = new LocalStorageService(tempRoot);
      const file = new File(["content"], "../lesson plan.pdf", { type: "application/pdf" });
      const storageKey = await service.upload(file, {
        filename: file.name,
        namespace: "private/teachers/teacher-1/materials",
        contentType: file.type,
      });
      const absolutePath = path.resolve(tempRoot, ...storageKey.split("/"));
      const relativePath = path.relative(path.resolve(tempRoot), absolutePath);

      expect(relativePath).not.toMatch(/^\.\.(?:[\\/]|$)/);
      await expect(access(absolutePath)).resolves.toBeUndefined();
      await expect(service.createDownloadURL(storageKey)).resolves.toBe(`/uploads/${storageKey}`);
      await expect(service.createDownloadURL("../outside.txt")).rejects.toThrow(/storage key/i);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("delete() should ignore path traversal keys and never remove files outside uploads root", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "ulu-storage-delete-"));
    const uploadRoot = path.join(tempRoot, "uploads");
    const outsidePath = path.join(tempRoot, "outside.txt");
    await writeFile(outsidePath, "do-not-delete");

    try {
      const { LocalStorageService } = await import("@/lib/storage/LocalStorageService");
      const service = new LocalStorageService(uploadRoot);

      await expect(service.delete("../outside.txt")).resolves.toBeUndefined();

      await expect(access(outsidePath)).resolves.toBeUndefined();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects unsupported storage drivers instead of caching an unvalidated instance", async () => {
    const previousDriver = process.env.STORAGE_DRIVER;
    process.env.STORAGE_DRIVER = "teacher-local";
    vi.resetModules();

    try {
      const { createStorageService } = await import("@/lib/storage");
      expect(() => createStorageService()).toThrow(/unsupported storage driver/i);
    } finally {
      if (previousDriver === undefined) Reflect.deleteProperty(process.env, "STORAGE_DRIVER");
      else process.env.STORAGE_DRIVER = previousDriver;
      vi.resetModules();
    }
  });
});
