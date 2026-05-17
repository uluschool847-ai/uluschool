import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

// Setup mock session for RBAC testing to switch active users easily
let mockSession: { uid: string; role: string; email: string } | null = null;
const ACADEMIC_TEST_ADMIN_ID = "academic-test-admin";
const ACADEMIC_TEST_ADMIN_EMAIL = "academic.admin@example.com";

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(async (allowedRoles: string[]) => {
    if (!mockSession) throw new Error("Unauthorized");
    if (!allowedRoles.includes(mockSession.role)) throw new Error("Forbidden");
    return mockSession;
  }),
  getSession: vi.fn(async () => mockSession),
}));

import {
  createScheduledClass,
  createSubject,
  deleteScheduledClass,
  deleteSubject,
  updateScheduledClass,
} from "@/app/(admin)/admin/actions/academic-actions";

describe("Admin Academic Master Data CRUD", () => {
  beforeEach(async () => {
    // Default to an ADMIN session for happy-path tests
    mockSession = {
      uid: ACADEMIC_TEST_ADMIN_ID,
      role: "ADMIN",
      email: ACADEMIC_TEST_ADMIN_EMAIL,
    };
    await prisma.appUser.upsert({
      where: { id: ACADEMIC_TEST_ADMIN_ID },
      update: { role: UserRole.ADMIN, isActive: true, email: ACADEMIC_TEST_ADMIN_EMAIL },
      create: {
        id: ACADEMIC_TEST_ADMIN_ID,
        email: ACADEMIC_TEST_ADMIN_EMAIL,
        fullName: "Academic Test Admin",
        role: UserRole.ADMIN,
        passwordHash: "test-password-hash",
        isActive: true,
      },
    });
  });

  async function ensureTeacher(email = "academic.teacher@example.com") {
    return prisma.appUser.upsert({
      where: { email },
      update: { role: UserRole.TEACHER, isActive: true },
      create: {
        email,
        fullName: "Academic Test Teacher",
        role: UserRole.TEACHER,
        passwordHash: "test-password-hash",
        isActive: true,
      },
    });
  }

  async function createClassForTest() {
    const teacher = await ensureTeacher(`academic.teacher.${Date.now()}@example.com`);
    return prisma.scheduledClass.create({
      data: {
        title: `Academic CRUD Class ${Date.now()}`,
        description: "Fixture class for academic CRUD tests.",
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 90000000),
        liveLessonUrl: "https://meet.google.com/test-room",
        teacherId: teacher.id,
      },
    });
  }

  describe("Creation (Create)", () => {
    it("should allow an ADMIN to successfully create a new academic subject", async () => {
      const payload = {
        slug: "advanced-physics",
        name: "Advanced Physics",
        description: "High-level physics concepts.",
      };

      const response = await createSubject(payload);

      expect(response).toBeDefined();
      expect(response.success, JSON.stringify(response)).toBe(true);
      expect(response.data).toHaveProperty("id");
      expect(response.data.slug).toBe(payload.slug);
    });

    it("should allow an ADMIN to create a new ScheduledClass", async () => {
      const teacher = await ensureTeacher();
      const payload = {
        title: "Physics 101",
        description: "Introduction to Physics",
        startAt: new Date(Date.now() + 86400000), // Tomorrow
        endAt: new Date(Date.now() + 90000000),
        liveLessonUrl: "https://meet.google.com/test-room",
        teacherId: teacher.id,
      };

      const response = await createScheduledClass(payload);

      expect(response).toBeDefined();
      expect(response.success, JSON.stringify(response)).toBe(true);
      expect(response.data).toHaveProperty("id");
      expect(response.data.title).toBe(payload.title);
    });
  });

  describe("Assignment & Modification (Update)", () => {
    it("should allow an ADMIN to assign a TEACHER to a specific ScheduledClass", async () => {
      const scheduledClass = await createClassForTest();
      const teacher = await ensureTeacher(`academic.reassigned.${Date.now()}@example.com`);
      const classId = scheduledClass.id;
      const payload = { teacherId: teacher.id };

      const response = await updateScheduledClass(classId, payload);

      expect(response).toBeDefined();
      expect(response.success, JSON.stringify(response)).toBe(true);
      expect(response.data).toHaveProperty("id", classId);
      expect(response.data.teacherId).toBe(payload.teacherId);
    }, 20_000);
  });

  describe("Retirement/Deletion (Delete)", () => {
    it("should allow an ADMIN to soft-delete, archive, or retire a Subject", async () => {
      const subjectId = "subject-123";

      const response = await deleteSubject(subjectId);

      expect(response).toBeDefined();
      expect(response.success, JSON.stringify(response)).toBe(true);
    });

    it("should allow an ADMIN to delete or archive a ScheduledClass", async () => {
      const scheduledClass = await createClassForTest();
      const classId = scheduledClass.id;

      const response = await deleteScheduledClass(classId);

      expect(response).toBeDefined();
      expect(response.success, JSON.stringify(response)).toBe(true);
    });
  });

  describe("Strict RBAC Enforcement", () => {
    const restrictedRoles = ["TEACHER", "STUDENT", "PARENT"];

    for (const role of restrictedRoles) {
      it(`should reject ANY CRUD action for role ${role} with a Forbidden error`, async () => {
        // Override session to a non-ADMIN role
        mockSession = { uid: `user-${role}`, role, email: `${role.toLowerCase()}@test.com` };

        // Attempt a creation action
        const response = await createSubject({
          slug: "test",
          name: "Test",
          description: "Test",
        }).catch((e) => e);

        // Assert rejection (either via a thrown Error or structured response with success = false)
        if (response instanceof Error) {
          expect(response.message).toMatch(/Forbidden|Unauthorized/i);
        } else {
          expect(response.success).toBe(false);
          expect(response.error).toMatch(/Forbidden|Unauthorized/i);
        }
      });
    }
  });

  describe("Input Validation", () => {
    it("should return a schema validation error when creating a class with invalid data", async () => {
      // Re-ensure we are ADMIN so RBAC doesn't block it first
      mockSession = { uid: "admin-123", role: "ADMIN", email: "admin@test.com" };

      const invalidPayload = {
        title: "", // Invalid: likely requires min length
        liveLessonUrl: "not-a-valid-url", // Invalid URL format
        // Missing startAt and endAt entirely
      };

      const response = await createScheduledClass(invalidPayload).catch((e) => e);

      // We expect the server action to catch Zod validation and return a structured error
      expect(response).toBeDefined();
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();

      // Zod errors often contain details about the fields
      const errorStr = JSON.stringify(response.error).toLowerCase();
      expect(errorStr).toContain("url"); // Should flag the URL
      expect(errorStr).toContain("startat"); // Should flag missing required fields
    });
  });
});
