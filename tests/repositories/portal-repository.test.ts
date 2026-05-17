import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCourseMaterial,
  deleteCourseMaterial,
  getMaterialsForClass,
  updateCourseMaterial,
} from "@/lib/repositories/portal-repository";

// Mock Prisma client to isolate unit tests
vi.mock("@/lib/prisma", () => ({
  prisma: {
    courseMaterial: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe("Portal Repository - Teacher Course Material Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Happy Path", () => {
    it("should successfully create a new course material attached to a specific class", async () => {
      const mockPayload = {
        title: "Algebra Worksheet",
        description: "Practice problems for Chapter 1",
        fileUrl: "https://example.com/worksheet.pdf",
        scheduledClassId: "class-123",
        teacherId: "teacher-123",
      };

      const mockResponse = { id: "material-1", ...mockPayload };
      vi.mocked(prisma.courseMaterial.create).mockResolvedValue(mockResponse);

      const result = await createCourseMaterial(mockPayload);

      expect(prisma.courseMaterial.create).toHaveBeenCalledWith({
        data: mockPayload,
      });
      expect(result).toEqual(mockResponse);
    });

    it("should successfully retrieve a list of materials for a specific class", async () => {
      const classId = "class-123";
      const mockMaterials = [
        { id: "m1", title: "Doc 1", scheduledClassId: classId },
        { id: "m2", title: "Doc 2", scheduledClassId: classId },
      ];

      vi.mocked(prisma.courseMaterial.findMany).mockResolvedValue(mockMaterials);

      const result = await getMaterialsForClass(classId);

      expect(prisma.courseMaterial.findMany).toHaveBeenCalledWith({
        where: { scheduledClassId: classId },
      });
      expect(result).toEqual(mockMaterials);
    });

    it("should successfully update an existing material details", async () => {
      const materialId = "material-1";
      const updatePayload = { title: "Updated Worksheet", description: "Updated desc" };
      const mockResponse = { id: materialId, ...updatePayload, scheduledClassId: "class-123" };

      vi.mocked(prisma.courseMaterial.update).mockResolvedValue(mockResponse);

      const result = await updateCourseMaterial(materialId, updatePayload);

      expect(prisma.courseMaterial.update).toHaveBeenCalledWith({
        where: { id: materialId },
        data: updatePayload,
      });
      expect(result).toEqual(mockResponse);
    });

    it("should successfully delete a course material", async () => {
      const materialId = "material-1";
      vi.mocked(prisma.courseMaterial.delete).mockResolvedValue({
        id: materialId,
      } as Prisma.CourseMaterialUncheckedCreateInput as never);

      const result = await deleteCourseMaterial(materialId);

      expect(prisma.courseMaterial.delete).toHaveBeenCalledWith({
        where: { id: materialId },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should fail gracefully when attempting to update a non-existent material", async () => {
      const error = new Error("Record to update not found");
      vi.mocked(prisma.courseMaterial.update).mockRejectedValue(error);

      const result = await updateCourseMaterial("invalid-id", { title: "New Title" }).catch(
        (e: unknown) => e,
      );

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain("not found");
    });

    it("should fail gracefully when attempting to delete a non-existent material", async () => {
      const error = new Error("Record to delete does not exist");
      vi.mocked(prisma.courseMaterial.delete).mockRejectedValue(error);

      const result = await deleteCourseMaterial("invalid-id").catch((e: unknown) => e);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain("does not exist");
    });
  });

  describe("Edge Cases", () => {
    it("should handle database connection errors gracefully without crashing the app", async () => {
      const dbError = new Error("Connection lost");
      vi.mocked(prisma.courseMaterial.create).mockRejectedValue(dbError);

      const result = await createCourseMaterial({
        title: "Test",
      } as Partial<Prisma.CourseMaterialCreateInput>).catch((e: unknown) => e);

      // It should either throw the DB error up, or return a structured failure response
      // Testing both patterns
      if (result instanceof Error) {
        expect(result.message).toContain("Connection lost");
      } else {
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });
  });
});
