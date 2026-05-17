import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { type Prisma, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    courseMaterial: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const storageDeleteMock = vi.hoisted(() => vi.fn());
const createStorageServiceMock = vi.hoisted(() =>
  vi.fn(() => ({
    delete: storageDeleteMock,
  })),
);

// Mock the session module for robust authorization tests
let mockSession: { uid: string; role: UserRole | "GUEST"; email: string } | null = null;
vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(async (allowedRoles: UserRole[]) => {
    if (!mockSession) throw new Error("Unauthorized");
    if (!allowedRoles.includes(mockSession.role)) throw new Error("Forbidden");
    return mockSession;
  }),
  getSession: vi.fn(async () => mockSession),
}));

vi.mock("@/lib/storage", () => ({
  createStorageService: createStorageServiceMock,
}));

import {
  createClassMaterialsAction,
  deleteCourseMaterialAction,
  deleteCourseMaterialWithFilesAction,
  submitCourseMaterial,
  unlinkAttachmentAction,
  updateCourseMaterialAction,
} from "@/app/portal/teacher/actions/material-actions";
import { requireRole } from "@/lib/auth/session";

const ACTION_SOURCE_PATH = "app/portal/teacher/actions/material-actions.ts";

const validMaterialPayload = {
  title: "Physics Handout",
  description: "Please read pages 10-15 before next class",
  fileUrl: "https://example.com/physics.pdf",
  scheduledClassId: "class-123",
};

const validMaterialUpdate = {
  title: "Updated Physics Handout",
  description: "Updated reading assignment: pages 10-20",
};

function expectEnumTeacherGuardSource() {
  const source = readFileSync(ACTION_SOURCE_PATH, "utf8");
  expect(source).toContain("UserRole.TEACHER");
  expect(source).toContain("requireRole([UserRole.TEACHER])");
  expect(source).not.toContain('requireRole(["TEACHER"])');
  expect(source).not.toContain("requireRole(['TEACHER'])");
}

function expectRejectedAuthResult(result: unknown) {
  const message = result instanceof Error ? result.message : JSON.stringify(result);
  expect(message).toMatch(/forbidden|unauthorized|invalid|redirect/i);
}

describe("API/Action Integration - Teacher Course Material Management", () => {
  beforeEach(() => {
    // Reset to a valid Teacher session by default for happy paths
    mockSession = {
      uid: "teacher-123",
      role: UserRole.TEACHER,
      email: "teacher@uluglobalacademy.com",
    };
    vi.clearAllMocks();
  });

  describe("Authorization Rules", () => {
    it("uses enum-based teacher guards in source", () => {
      expectEnumTeacherGuardSource();
    });

    const restrictedRoles = [UserRole.STUDENT, "GUEST", UserRole.PARENT, UserRole.ADMIN] as const;

    for (const role of restrictedRoles) {
      it(`should completely reject material creation for user with role ${role}`, async () => {
        mockSession = { uid: `user-${role}`, role, email: `${role.toLowerCase()}@test.com` };

        const response = await submitCourseMaterial({
          title: "Hacked Material",
          scheduledClassId: "class-1",
        }).catch((e: unknown) => e);

        // Server actions typically return structured objects like { success: false, error: 'Forbidden' }
        // or throw an Error entirely
        if (response instanceof Error) {
          expect(response.message).toMatch(/Forbidden|Unauthorized/i);
        } else {
          expect(response.success).toBe(false);
          expect(response.error).toMatch(/Forbidden|Unauthorized/i);
        }
        expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
        expect(prisma.courseMaterial.create).not.toHaveBeenCalled();
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
        expect(prisma.courseMaterial.update).not.toHaveBeenCalled();
        expect(prisma.courseMaterial.delete).not.toHaveBeenCalled();
      },
    );

    it("treats invalid or role-changed sessions as requireRole failures before material mutation", async () => {
      vi.mocked(requireRole).mockRejectedValueOnce(
        new Error("NEXT_REDIRECT:/portal/login?reason=invalid"),
      );

      const response = await submitCourseMaterial(validMaterialPayload);

      expect(response).toEqual(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/invalid|redirect/i),
        }),
      );
      expect(prisma.courseMaterial.create).not.toHaveBeenCalled();
    });

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
      expect(prisma.courseMaterial.delete).not.toHaveBeenCalled();
      expect(createStorageServiceMock).not.toHaveBeenCalled();
      expect(storageDeleteMock).not.toHaveBeenCalled();
    });
  });

  describe("Happy Path", () => {
    it("should successfully process a valid material payload by a Teacher and return success", async () => {
      vi.mocked(prisma.courseMaterial.create).mockResolvedValue({
        id: "mat-123",
        title: validMaterialPayload.title,
        description: validMaterialPayload.description,
        fileUrl: validMaterialPayload.fileUrl,
        scheduledClassId: validMaterialPayload.scheduledClassId,
        teacherId: "teacher-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Prisma.CourseMaterialUncheckedCreateInput as never);

      const response = await submitCourseMaterial(validMaterialPayload);

      expect(response).toBeDefined();
      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty("id");
      expect(response.data.title).toBe(validMaterialPayload.title);
      expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
    });
  });

  describe("Validation & Data Integrity", () => {
    it("should throw a validation error (Bad Request) if required fields are missing", async () => {
      // Explicitly missing the required 'title' and 'scheduledClassId'
      const invalidPayload = {
        description: "Some random description without a class or title",
      };

      const response = await submitCourseMaterial(invalidPayload).catch((e: unknown) => e);

      expect(response).toBeDefined();

      // Zod validation inside the action should catch this and return a structured error
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();

      const errorString = JSON.stringify(response.error).toLowerCase();
      expect(errorString).toContain("title");
    });
  });

  describe("Update Action (updateCourseMaterialAction)", () => {
    it("should successfully process a valid update payload by a Teacher", async () => {
      const materialId = "mat-123";
      vi.mocked(prisma.courseMaterial.update).mockResolvedValue({
        id: materialId,
        title: validMaterialUpdate.title,
        description: validMaterialUpdate.description,
        fileUrl: "https://example.com/physics.pdf",
        scheduledClassId: "class-123",
        teacherId: "teacher-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Prisma.CourseMaterialUncheckedCreateInput as never);

      const response = await updateCourseMaterialAction(materialId, validMaterialUpdate);

      expect(response).toBeDefined();
      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty("id", materialId);
      expect(response.data.title).toBe(validMaterialUpdate.title);
      expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
    });

    it("scopes material updates to the signed-in teacher to prevent cross-teacher edits", async () => {
      vi.mocked(prisma.courseMaterial.update).mockResolvedValue({
        id: "foreign-material",
        title: "Foreign material",
        description: "Should not be editable",
        fileUrl: "https://example.com/foreign.pdf",
        scheduledClassId: "foreign-class",
        teacherId: "teacher-2",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Prisma.CourseMaterialUncheckedCreateInput as never);

      await updateCourseMaterialAction("foreign-material", validMaterialUpdate);

      expect(prisma.courseMaterial.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "foreign-material",
            teacherId: "teacher-123",
          }),
        }),
      );
    });

    it("should throw a validation error if invalid fields are provided during update", async () => {
      const materialId = "mat-123";
      // Testing URL validation failure
      const invalidUpdate = {
        fileUrl: "not-a-valid-url",
      };

      const response = await updateCourseMaterialAction(materialId, invalidUpdate).catch(
        (e: unknown) => e,
      );

      expect(response).toBeDefined();
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();

      const errorString = JSON.stringify(response.error).toLowerCase();
      expect(errorString).toContain("url");
    });
  });

  describe("Delete Action (deleteCourseMaterialAction)", () => {
    it("should successfully delete a material when a valid ID is provided by a Teacher", async () => {
      const materialId = "mat-123";
      vi.mocked(prisma.courseMaterial.delete).mockResolvedValue({
        id: materialId,
        title: "Updated Physics Handout",
        description: "Updated reading assignment: pages 10-20",
        fileUrl: "https://example.com/physics.pdf",
        scheduledClassId: "class-123",
        teacherId: "teacher-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Prisma.CourseMaterialUncheckedCreateInput as never);

      const response = await deleteCourseMaterialAction(materialId);

      expect(response).toBeDefined();
      expect(response.success).toBe(true);
      expect(requireRole).toHaveBeenCalledWith([UserRole.TEACHER]);
    });

    it("scopes material deletion to the signed-in teacher to prevent cross-teacher deletes", async () => {
      vi.mocked(prisma.courseMaterial.delete).mockResolvedValue({
        id: "foreign-material",
        title: "Foreign material",
        description: "Should not be deletable",
        fileUrl: "https://example.com/foreign.pdf",
        scheduledClassId: "foreign-class",
        teacherId: "teacher-2",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Prisma.CourseMaterialUncheckedCreateInput as never);

      await deleteCourseMaterialAction("foreign-material");

      expect(prisma.courseMaterial.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "foreign-material",
            teacherId: "teacher-123",
          }),
        }),
      );
    });

    it("should return an appropriate error if attempting to delete a material that does not exist", async () => {
      const invalidMaterialId = "non-existent-mat-404";
      vi.mocked(prisma.courseMaterial.delete).mockRejectedValue(
        new Error("Record to delete does not exist"),
      );

      const response = await deleteCourseMaterialAction(invalidMaterialId).catch((e: unknown) => e);

      expect(response).toBeDefined();
      // Server action handles "not found" gracefully returning success: false
      if (response instanceof Error) {
        expect(response.message).toMatch(/not found|exist/i);
      } else {
        expect(response.success).toBe(false);
        const errorString = JSON.stringify(response.error).toLowerCase();
        expect(errorString).toMatch(/not found|exist/i);
      }
    });
  });
});
