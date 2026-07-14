import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createCourseMaterialForTeacherMock = vi.hoisted(() => vi.fn());
const updateCourseMaterialForTeacherMock = vi.hoisted(() => vi.fn());
const deleteCourseMaterialForTeacherMock = vi.hoisted(() => vi.fn());
const getCourseMaterialForTeacherMock = vi.hoisted(() => vi.fn());
const unlinkCourseMaterialAttachmentForTeacherMock = vi.hoisted(() => vi.fn());
const validateCourseMaterialFileUrlMock = vi.hoisted(() =>
  vi.fn((value: string | null | undefined) => {
    const fileUrl = value?.trim() ?? "";
    if (!fileUrl) return null;
    if (fileUrl.startsWith("/uploads/")) return fileUrl;
    const parsed = new URL(fileUrl);
    if (parsed.protocol !== "https:") {
      throw new Error("File URL must be a safe HTTPS URL or an internal upload path.");
    }
    return fileUrl;
  }),
);
const legacyCreateCourseMaterialMock = vi.hoisted(() => vi.fn());
const legacyUpdateCourseMaterialMock = vi.hoisted(() => vi.fn());
const legacyDeleteCourseMaterialMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const storageDeleteMock = vi.hoisted(() => vi.fn());
const createStorageServiceMock = vi.hoisted(() =>
  vi.fn(() => ({
    delete: storageDeleteMock,
  })),
);

let mockSession: { uid: string; role: UserRole | "GUEST"; email: string } | null = null;

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(async (allowedRoles: UserRole[]) => {
    if (!mockSession) throw new Error("Unauthorized");
    if (!allowedRoles.includes(mockSession.role)) throw new Error("Forbidden");
    return mockSession;
  }),
  getSession: vi.fn(async () => mockSession),
}));

vi.mock("@/lib/repositories/course-material-repository", () => ({
  createCourseMaterialForTeacher: createCourseMaterialForTeacherMock,
  deleteCourseMaterialForTeacher: deleteCourseMaterialForTeacherMock,
  getCourseMaterialForTeacher: getCourseMaterialForTeacherMock,
  unlinkCourseMaterialAttachmentForTeacher: unlinkCourseMaterialAttachmentForTeacherMock,
  updateCourseMaterialForTeacher: updateCourseMaterialForTeacherMock,
  validateCourseMaterialFileUrl: validateCourseMaterialFileUrlMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  createCourseMaterial: legacyCreateCourseMaterialMock,
  updateCourseMaterial: legacyUpdateCourseMaterialMock,
  deleteCourseMaterial: legacyDeleteCourseMaterialMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  createStorageService: createStorageServiceMock,
}));

import {
  createClassMaterialsAction,
  deleteCourseMaterialAction,
  deleteCourseMaterialWithFilesAction,
  submitCourseMaterial as submitCourseMaterialAction,
  unlinkAttachmentAction,
  updateCourseMaterialAction,
} from "@/app/portal/teacher/actions/material-actions";
import { requireRole } from "@/lib/auth/session";

const ACTION_SOURCE_PATH = "app/portal/teacher/actions/material-actions.ts";

const validMaterialPayload = {
  title: "Physics Handout",
  description: "Please read pages 10-15 before next class",
  fileUrl: "https://example.com/physics.pdf",
  scheduledClassId: "lesson-123",
};

const validMaterialUpdate = {
  title: "Updated Physics Handout",
  description: "Updated reading assignment: pages 10-20",
  fileUrl: "https://example.com/physics-updated.pdf",
};

function material(overrides: Record<string, unknown> = {}) {
  return {
    id: "mat-123",
    title: validMaterialPayload.title,
    description: validMaterialPayload.description,
    fileUrl: validMaterialPayload.fileUrl,
    scheduledClassId: "lesson-123",
    teacherId: "teacher-123",
    scheduledClass: {
      id: "lesson-123",
      classGroupId: "class-group-123",
      classGroup: { id: "class-group-123" },
    },
    cleanup: { deleted: 0, queued: false },
    attachments: [
      {
        id: "attachment-1",
        storageKey:
          "private/teachers/teacher-123/materials/00000000-0000-4000-8000-000000000001-material-1.pdf",
      },
    ],
    ...overrides,
  };
}

function expectEnumTeacherGuardSource() {
  const source = readFileSync(ACTION_SOURCE_PATH, "utf8");
  expect(source).toContain("UserRole.TEACHER");
  expect(source).toContain("requireRole([UserRole.TEACHER])");
  expect(source).not.toContain('requireRole(["TEACHER"])');
  expect(source).not.toContain("requireRole(['TEACHER'])");
}

function expectDedicatedMaterialRepositorySource() {
  const source = readFileSync(ACTION_SOURCE_PATH, "utf8");
  expect(source).toContain("@/lib/repositories/course-material-repository");
  expect(source).not.toMatch(
    /from\s+["']@\/lib\/repositories\/portal-repository["'][\s\S]*(createCourseMaterial|updateCourseMaterial|deleteCourseMaterial)/,
  );
  expect(source).not.toMatch(/teacherId\s*:\s*(data|payload|parsed\.data)\.teacherId/);
}

function expectMaterialRevalidation(classGroupId = "class-group-123", lessonId = "lesson-123") {
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/classes");
  expect(revalidatePathMock).toHaveBeenCalledWith(`/portal/teacher/classes/${classGroupId}`);
  expect(revalidatePathMock).toHaveBeenCalledWith(`/portal/teacher/lessons/${lessonId}`);
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/materials");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student/materials");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent");
}

function expectMaterialAudit(action: string) {
  expect(createAdminAuditLogMock).toHaveBeenCalledWith(
    expect.objectContaining({
      action,
      actorId: "teacher-123",
      targetType: "course_material",
      meta: expect.objectContaining({ teacherId: "teacher-123" }),
    }),
    expect.anything(),
  );
}

function expectRejectedAuthResult(result: unknown) {
  const message = result instanceof Error ? result.message : JSON.stringify(result);
  expect(message).toMatch(/forbidden|unauthorized|invalid|redirect/i);
}

describe("API/Action Integration - Teacher Course Material Management", () => {
  beforeEach(() => {
    mockSession = {
      uid: "teacher-123",
      role: UserRole.TEACHER,
      email: "teacher@uluglobalacademy.com",
    };
    vi.clearAllMocks();
    createCourseMaterialForTeacherMock.mockResolvedValue(material());
    updateCourseMaterialForTeacherMock.mockResolvedValue(
      material({ title: validMaterialUpdate.title, ...validMaterialUpdate }),
    );
    deleteCourseMaterialForTeacherMock.mockResolvedValue({
      ...material(),
      success: true,
      cleanup: {
        deleted: 1,
        queued: true,
        storageKeys: [
          "private/teachers/teacher-123/materials/00000000-0000-4000-8000-000000000001-material-1.pdf",
        ],
      },
    });
    getCourseMaterialForTeacherMock.mockResolvedValue(material());
    unlinkCourseMaterialAttachmentForTeacherMock.mockResolvedValue({
      attachmentId: "attachment-1",
      materialId: "mat-123",
      storageKey:
        "private/teachers/teacher-123/materials/00000000-0000-4000-8000-000000000001-material-1.pdf",
    });
    legacyCreateCourseMaterialMock.mockResolvedValue(material());
    legacyUpdateCourseMaterialMock.mockResolvedValue(
      material({ title: validMaterialUpdate.title, ...validMaterialUpdate }),
    );
    legacyDeleteCourseMaterialMock.mockResolvedValue({ success: true });
  });

  describe("Authorization and source ownership", () => {
    it("uses enum-based teacher guards in source", () => {
      expectEnumTeacherGuardSource();
    });

    it("imports dedicated material repository write helpers and does not trust hidden teacherId", () => {
      expectDedicatedMaterialRepositorySource();
    });

    const restrictedRoles = [UserRole.STUDENT, "GUEST", UserRole.PARENT, UserRole.ADMIN] as const;

    for (const role of restrictedRoles) {
      it(`rejects material creation for user with role ${role}`, async () => {
        mockSession = { uid: `user-${role}`, role, email: `${role.toLowerCase()}@test.com` };

        const response = await submitCourseMaterialAction(validMaterialPayload).catch(
          (error: unknown) => error,
        );

        expectRejectedAuthResult(response);
        expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
        expect(createCourseMaterialForTeacherMock).not.toHaveBeenCalled();
        expect(legacyCreateCourseMaterialMock).not.toHaveBeenCalled();
      });
    }

    it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
      "rejects %s before material update and delete mutations",
      async (role) => {
        mockSession = { uid: `user-${role}`, role, email: `${role.toLowerCase()}@test.com` };

        const updateResponse = await updateCourseMaterialAction(
          "mat-123",
          validMaterialUpdate,
        ).catch((error: unknown) => error);
        const deleteResponse = await deleteCourseMaterialAction("mat-123").catch(
          (error: unknown) => error,
        );

        expectRejectedAuthResult(updateResponse);
        expectRejectedAuthResult(deleteResponse);
        expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
        expect(updateCourseMaterialForTeacherMock).not.toHaveBeenCalled();
        expect(deleteCourseMaterialForTeacherMock).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["createClassMaterialsAction"],
      ["unlinkAttachmentAction"],
      ["deleteCourseMaterialWithFilesAction"],
    ] as const)("requires teacher auth before %s", async (actionName) => {
      mockSession = null;

      const result =
        actionName === "createClassMaterialsAction"
          ? await createClassMaterialsAction({
              classId: "class-123",
              materials: [
                {
                  title: "Bulk handout",
                  fileUrl: "https://example.com/bulk.pdf",
                  mimeType: "application/pdf",
                },
              ],
            }).catch((error: unknown) => error)
          : actionName === "unlinkAttachmentAction"
            ? await unlinkAttachmentAction({
                attachmentId: "attachment-1",
                storageKey: "teacher-2/private.pdf",
              }).catch((error: unknown) => error)
            : await deleteCourseMaterialWithFilesAction({
                materialId: "teacher-2-material",
              }).catch((error: unknown) => error);

      expectRejectedAuthResult(result);
      expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
      expect(deleteCourseMaterialForTeacherMock).not.toHaveBeenCalled();
      expect(createStorageServiceMock).not.toHaveBeenCalled();
      expect(storageDeleteMock).not.toHaveBeenCalled();
    });
  });

  describe("Create action", () => {
    it("uses session.uid, ignores submitted teacherId, calls dedicated repository, audits, and revalidates", async () => {
      const response = await submitCourseMaterialAction({
        ...validMaterialPayload,
        teacherId: "teacher-2",
      });

      expect(response).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: "mat-123", title: validMaterialPayload.title }),
        }),
      );
      expect(createCourseMaterialForTeacherMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: validMaterialPayload.title,
          scheduledClassId: "lesson-123",
          teacherId: "teacher-123",
        }),
      );
      expect(JSON.stringify(createCourseMaterialForTeacherMock.mock.calls[0][0])).not.toContain(
        "teacher-2",
      );
      expect(legacyCreateCourseMaterialMock).not.toHaveBeenCalled();
      expectMaterialAudit("COURSE_MATERIAL_CREATED");
      expectMaterialRevalidation();
    });

    it("returns repository ownership errors for foreign classes without audit or revalidation", async () => {
      createCourseMaterialForTeacherMock.mockRejectedValueOnce(
        new Error("Unauthorized: teacher does not own this class."),
      );

      const response = await submitCourseMaterialAction({
        ...validMaterialPayload,
        scheduledClassId: "foreign-lesson",
      });

      expect(response).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/unauthorized|own|class/i),
        }),
      );
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("rejects a cross-teacher attachment before repository mutation or success audit", async () => {
      const response = await submitCourseMaterialAction({
        ...validMaterialPayload,
        attachment: {
          filename: "private.pdf",
          storageKey:
            "private/teachers/teacher-2/materials/00000000-0000-4000-8000-000000000002-private.pdf",
          mimeType: "application/pdf",
          size: 2048,
        },
      });

      expect(response).toEqual({
        success: false,
        error: "Uploaded file is not owned by this teacher.",
      });
      expect(createCourseMaterialForTeacherMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it.each([
      ["missing title", { title: "" }, /title/i],
      ["missing scheduledClassId", { scheduledClassId: "" }, /scheduled class/i],
      ["missing fileUrl", { fileUrl: "" }, /file|url/i],
      ["javascript URL", { fileUrl: "javascript:alert(1)" }, /file|url|safe/i],
      ["data URL", { fileUrl: "data:text/html;base64,PHNjcmlwdA==" }, /file|url|safe/i],
      ["file URL", { fileUrl: "file:///etc/passwd" }, /file|url|safe/i],
      ["http URL", { fileUrl: "http://example.com/physics.pdf" }, /file|url|safe/i],
    ])("validates create payload: %s", async (_caseName, overrides, message) => {
      const response = await submitCourseMaterialAction({
        ...validMaterialPayload,
        ...overrides,
      });

      expect(response).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.anything(),
        }),
      );
      expect(JSON.stringify(response.error).toLowerCase()).toMatch(message);
      expect(createCourseMaterialForTeacherMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    });

    it.each(["https://example.com/physics.pdf", "/uploads/teacher/physics.pdf"])(
      "accepts safe fileUrl: %s",
      async (fileUrl) => {
        await submitCourseMaterialAction({ ...validMaterialPayload, fileUrl });

        expect(createCourseMaterialForTeacherMock).toHaveBeenCalledWith(
          expect.objectContaining({ fileUrl }),
        );
      },
    );
  });

  describe("Update action", () => {
    it("uses session.uid, calls dedicated repository, audits, and revalidates", async () => {
      const response = await updateCourseMaterialAction("mat-123", {
        ...validMaterialUpdate,
        teacherId: "teacher-2",
      });

      expect(response).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: "mat-123", title: validMaterialUpdate.title }),
        }),
      );
      expect(updateCourseMaterialForTeacherMock).toHaveBeenCalledWith(
        "mat-123",
        "teacher-123",
        expect.not.objectContaining({ teacherId: "teacher-2" }),
      );
      expect(legacyUpdateCourseMaterialMock).not.toHaveBeenCalled();
      expectMaterialAudit("COURSE_MATERIAL_UPDATED");
      expectMaterialRevalidation();
    });

    it("rejects foreign material or moving to a foreign scheduledClassId without audit", async () => {
      updateCourseMaterialForTeacherMock.mockRejectedValueOnce(
        new Error("Assignment not found or not owned by teacher."),
      );

      const response = await updateCourseMaterialAction("foreign-material", {
        ...validMaterialUpdate,
        scheduledClassId: "foreign-lesson",
      });

      expect(response).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/not found|owned|teacher|unauthorized/i),
        }),
      );
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("validates every replacement attachment before loading or mutating the material", async () => {
      const response = await updateCourseMaterialAction("mat-123", {
        title: "Replacement",
        attachments: [
          {
            filename: "owned.pdf",
            storageKey:
              "private/teachers/teacher-123/materials/00000000-0000-4000-8000-000000000001-owned.pdf",
            mimeType: "application/pdf",
            size: 1024,
          },
          {
            filename: "foreign.pdf",
            storageKey:
              "private/teachers/teacher-2/materials/00000000-0000-4000-8000-000000000002-foreign.pdf",
            mimeType: "application/pdf",
            size: 1024,
          },
        ],
      });

      expect(response).toEqual({
        success: false,
        error: "Uploaded file is not owned by this teacher.",
      });
      expect(getCourseMaterialForTeacherMock).not.toHaveBeenCalled();
      expect(updateCourseMaterialForTeacherMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    });
  });

  describe("Delete and attachment actions", () => {
    it("uses session.uid, calls dedicated repository, audits, revalidates, and reports cleanup", async () => {
      const response = await deleteCourseMaterialAction("mat-123");

      expect(response).toEqual(expect.objectContaining({ success: true }));
      expect(deleteCourseMaterialForTeacherMock).toHaveBeenCalledWith("mat-123", "teacher-123");
      expect(legacyDeleteCourseMaterialMock).not.toHaveBeenCalled();
      expectMaterialAudit("COURSE_MATERIAL_DELETED");
      expectMaterialRevalidation();
    });

    it("rejects foreign material delete without audit or cleanup", async () => {
      getCourseMaterialForTeacherMock.mockResolvedValueOnce(null);

      const response = await deleteCourseMaterialAction("foreign-material");

      expect(response).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/not found|owned|teacher|unauthorized/i),
        }),
      );
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
      expect(storageDeleteMock).not.toHaveBeenCalled();
    });

    it("rejects a foreign stored attachment before material deletion, storage cleanup, or audit", async () => {
      getCourseMaterialForTeacherMock.mockResolvedValueOnce(
        material({
          attachments: [
            {
              id: "attachment-foreign",
              storageKey:
                "private/teachers/teacher-2/materials/00000000-0000-4000-8000-000000000002-foreign.pdf",
            },
          ],
        }),
      );

      const response = await deleteCourseMaterialAction("mat-123");

      expect(response).toEqual({
        success: false,
        error: "Uploaded file is not owned by this teacher.",
      });
      expect(deleteCourseMaterialForTeacherMock).not.toHaveBeenCalled();
      expect(storageDeleteMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    });

    it("deleteCourseMaterialWithFilesAction delegates ownership and does not clean arbitrary files", async () => {
      await deleteCourseMaterialWithFilesAction({ materialId: "mat-123" });

      expect(deleteCourseMaterialForTeacherMock).toHaveBeenCalledWith("mat-123", "teacher-123");
      expect(storageDeleteMock).not.toHaveBeenCalledWith("teacher-2/private.pdf");
      expectMaterialAudit("COURSE_MATERIAL_DELETED");
    });

    it("unlinkAttachmentAction audits owned attachment unlink/delete when action exists", async () => {
      const response = await unlinkAttachmentAction({
        attachmentId: "attachment-1",
        storageKey:
          "private/teachers/teacher-123/materials/00000000-0000-4000-8000-000000000001-material-1.pdf",
      });

      expect(response).toEqual(expect.objectContaining({ success: true }));
      expect(createAdminAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "COURSE_MATERIAL_ATTACHMENT_DELETED",
          actorId: "teacher-123",
          targetType: "course_material_attachment",
          targetId: "attachment-1",
        }),
        expect.anything(),
      );
    });
  });

  describe("Uploaded file lifecycle", () => {
    it("create action forwards uploaded attachment metadata and audits the file upload", async () => {
      createCourseMaterialForTeacherMock.mockResolvedValueOnce(
        material({
          attachments: [
            {
              id: "attachment-1",
              filename: "physics.pdf",
              storageKey:
                "private/teachers/teacher-123/materials/00000000-0000-4000-8000-000000000001-physics.pdf",
              mimeType: "application/pdf",
              size: 2048,
            },
          ],
        }),
      );

      const response = await submitCourseMaterialAction({
        ...validMaterialPayload,
        fileUrl: "https://example.com/physics.pdf",
        attachment: {
          filename: "physics.pdf",
          storageKey:
            "private/teachers/teacher-123/materials/00000000-0000-4000-8000-000000000001-physics.pdf",
          mimeType: "application/pdf",
          size: 2048,
        },
      });

      expect(response).toEqual(expect.objectContaining({ success: true }));
      expect(createCourseMaterialForTeacherMock).toHaveBeenCalledWith(
        expect.objectContaining({
          teacherId: "teacher-123",
          attachments: [
            expect.objectContaining({
              filename: "physics.pdf",
              storageKey:
                "private/teachers/teacher-123/materials/00000000-0000-4000-8000-000000000001-physics.pdf",
              mimeType: "application/pdf",
              size: 2048,
            }),
          ],
        }),
      );
      expectMaterialAudit("COURSE_MATERIAL_CREATED");
      expect(createAdminAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "COURSE_MATERIAL_FILE_UPLOADED",
          actorId: "teacher-123",
          targetType: "course_material_attachment",
          meta: expect.objectContaining({
            teacherId: "teacher-123",
            materialId: "mat-123",
            storageKey:
              "private/teachers/teacher-123/materials/00000000-0000-4000-8000-000000000001-physics.pdf",
          }),
        }),
        expect.anything(),
      );
    });

    it("update action can keep the existing file unchanged", async () => {
      await updateCourseMaterialAction("mat-123", {
        title: "Metadata only",
        description: "No file replacement",
      });

      expect(updateCourseMaterialForTeacherMock).toHaveBeenCalledWith(
        "mat-123",
        "teacher-123",
        expect.not.objectContaining({
          attachments: expect.anything(),
        }),
      );
      expect(createAdminAuditLogMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: "COURSE_MATERIAL_FILE_REPLACED" }),
        expect.anything(),
      );
    });

    it("update action forwards replacement attachment metadata and audits replacement", async () => {
      updateCourseMaterialForTeacherMock.mockResolvedValueOnce(
        material({
          fileUrl: "https://example.com/replacement.pdf",
          cleanup: {
            queued: true,
            deleted: 1,
            storageKeys: [
              "private/teachers/teacher-123/materials/00000000-0000-4000-8000-000000000001-old.pdf",
            ],
          },
          attachments: [
            {
              id: "attachment-new",
              filename: "replacement.pdf",
              storageKey:
                "private/teachers/teacher-123/materials/00000000-0000-4000-8000-000000000002-replacement.pdf",
              mimeType: "application/pdf",
              size: 4096,
            },
          ],
        }),
      );

      const response = await updateCourseMaterialAction("mat-123", {
        title: "Replacement",
        fileUrl: "https://example.com/replacement.pdf",
        attachment: {
          filename: "replacement.pdf",
          storageKey:
            "private/teachers/teacher-123/materials/00000000-0000-4000-8000-000000000002-replacement.pdf",
          mimeType: "application/pdf",
          size: 4096,
        },
      });

      expect(response).toEqual(expect.objectContaining({ success: true }));
      expect(updateCourseMaterialForTeacherMock).toHaveBeenCalledWith(
        "mat-123",
        "teacher-123",
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              storageKey:
                "private/teachers/teacher-123/materials/00000000-0000-4000-8000-000000000002-replacement.pdf",
            }),
          ],
        }),
      );
      expect(createAdminAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "COURSE_MATERIAL_FILE_REPLACED",
          actorId: "teacher-123",
          targetType: "course_material",
          targetId: "mat-123",
          meta: expect.objectContaining({
            teacherId: "teacher-123",
            materialId: "mat-123",
            oldStorageKeys: [
              "private/teachers/teacher-123/materials/00000000-0000-4000-8000-000000000001-old.pdf",
            ],
          }),
        }),
        expect.anything(),
      );
    });

    it("unlink action accepts materialId and attachmentId only, loads storageKey from repository, and audits", async () => {
      const response = await unlinkAttachmentAction({
        materialId: "mat-123",
        attachmentId: "attachment-1",
      } as never);

      expect(response).toEqual(expect.objectContaining({ success: true }));
      expect(unlinkCourseMaterialAttachmentForTeacherMock).toHaveBeenCalledWith(
        "teacher-123",
        "mat-123",
        "attachment-1",
      );
      expect(storageDeleteMock).toHaveBeenCalledWith(
        "private/teachers/teacher-123/materials/00000000-0000-4000-8000-000000000001-material-1.pdf",
      );
      expect(createAdminAuditLogMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "COURSE_MATERIAL_ATTACHMENT_DELETED",
          actorId: "teacher-123",
          targetType: "course_material_attachment",
          targetId: "attachment-1",
          meta: expect.objectContaining({
            teacherId: "teacher-123",
            materialId: "mat-123",
          }),
        }),
        expect.anything(),
      );
      expect(
        JSON.stringify(unlinkCourseMaterialAttachmentForTeacherMock.mock.calls[0]),
      ).not.toMatch(/client-private\.pdf/);
    });

    it("unlink action does not trust client-provided storageKey on ownership failure", async () => {
      unlinkCourseMaterialAttachmentForTeacherMock.mockRejectedValueOnce(
        new Error("Material attachment not found or not owned by teacher."),
      );

      const response = await unlinkAttachmentAction({
        materialId: "foreign-material",
        attachmentId: "attachment-1",
        storageKey: "teacher-2/client-private.pdf",
      } as never);

      expect(response).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/not found|owned|teacher|unauthorized/i),
        }),
      );
      expect(storageDeleteMock).not.toHaveBeenCalledWith("teacher-2/client-private.pdf");
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    });

    it("rejects a repository-loaded cross-teacher key before unlink mutation or audit", async () => {
      getCourseMaterialForTeacherMock.mockResolvedValueOnce(
        material({
          attachments: [
            {
              id: "attachment-1",
              storageKey:
                "private/teachers/teacher-2/materials/00000000-0000-4000-8000-000000000002-private.pdf",
            },
          ],
        }),
      );

      const response = await unlinkAttachmentAction({
        materialId: "mat-123",
        attachmentId: "attachment-1",
      });

      expect(response).toEqual({
        success: false,
        error: "Uploaded file is not owned by this teacher.",
      });
      expect(unlinkCourseMaterialAttachmentForTeacherMock).not.toHaveBeenCalled();
      expect(storageDeleteMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    });
  });
});
