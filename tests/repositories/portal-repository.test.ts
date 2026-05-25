import { prisma } from "@/lib/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMaterialsForClass } from "@/lib/repositories/portal-repository";

// Mock Prisma client to isolate unit tests
vi.mock("@/lib/prisma", () => ({
  prisma: {
    courseMaterial: {
      findMany: vi.fn(),
    },
  },
}));

describe("Portal Repository - Course Material read compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Happy Path", () => {
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
  });
});
