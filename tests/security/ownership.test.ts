import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserRole } from "@prisma/client";

// Mock next/cache and next/navigation
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url) => { throw new Error(`REDIRECT:${url}`) }),
}));

// Setup a mock for our session to easily switch active users during tests
let mockSession: { uid: string; role: string; email: string } | null = null;
vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(async (allowedRoles: string[]) => {
    if (!mockSession) throw new Error("Unauthorized");
    if (!allowedRoles.includes(mockSession.role)) throw new Error("Forbidden");
    return mockSession;
  }),
  getSession: vi.fn(async () => mockSession),
}));

// Mock repositories
vi.mock("@/lib/repositories/portal-repository", () => ({
  submitHomework: vi.fn(),
  gradeHomework: vi.fn(),
  // Assume there is a function to check if a homework belongs to a student or if a teacher teaches a student
  checkHomeworkOwnership: vi.fn(() => Promise.resolve(false)),
  checkTeacherAssignment: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("@/lib/repositories/enquiry-repository", () => ({
  updateEnquiryReview: vi.fn(),
  getEnquiryById: vi.fn(),
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: vi.fn(),
}));

import { submitHomeworkAction, gradeHomeworkAction } from "@/app/portal/actions";
import { updateEnquiryAction } from "@/app/(admin)/admin/actions";

describe("Strict Authorization and IDOR Prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = null;
  });

  describe("Student Ownership Check (submitHomeworkAction)", () => {
    it("rejects a STUDENT attempting to submit homework using a studentId belonging to another user", async () => {
      // Authenticate as Student A
      mockSession = { uid: "student-A-id", role: UserRole.STUDENT, email: "studentA@ulu.com" };
      
      const formData = new FormData();
      formData.set("homeworkId", "homework-1");
      formData.set("contentUrl", "https://example.com/homework.pdf");
      // Maliciously trying to submit for Student B
      formData.set("studentId", "student-B-id"); 

      // In a strict IDOR check, the action must notice the mismatch or explicitly validate ownership of the homeworkId
      // and return a structured 403 / Forbidden error, not just blindly accept it.
      let result: any;
      try {
        result = await submitHomeworkAction(formData);
      } catch (error: any) {
        // If it throws an unhandled error instead of a structured validation/auth error, we consider that a failure
        // in our strict error-handling paradigm.
        result = { success: false, message: error.message };
      }

      // We expect the action to explicitly reject this cross-user attempt
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error || result.message).toMatch(/Forbidden|Unauthorized|Ownership/i);
    });
  });

  describe("Teacher Role and Context Check (gradeHomeworkAction)", () => {
    it("rejects a STUDENT attempting to call the grading action", async () => {
      // Authenticate as a Student
      mockSession = { uid: "student-A-id", role: UserRole.STUDENT, email: "studentA@ulu.com" };

      const formData = new FormData();
      formData.set("submissionId", "sub-1");
      formData.set("grade", "95");

      let result: any;
      try {
        result = await gradeHomeworkAction(formData);
      } catch (error: any) {
        result = { success: false, message: error.message };
      }

      // Should be rejected because the role is not TEACHER
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Forbidden/i);
    });

    it("rejects a TEACHER attempting to grade a submission outside their assigned classes (Context IDOR)", async () => {
      // Authenticate as Teacher A
      mockSession = { uid: "teacher-A-id", role: UserRole.TEACHER, email: "teacherA@ulu.com" };

      const formData = new FormData();
      formData.set("submissionId", "sub-belonging-to-teacher-B-class");
      formData.set("grade", "95");

      let result: any;
      try {
        result = await gradeHomeworkAction(formData);
      } catch (error: any) {
        result = { success: false, message: error.message };
      }

      // Expected to fail because Teacher A does not own the context for this submission
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.error || result.message).toMatch(/Forbidden|Unauthorized|Access Denied/i);
    });
  });

  describe("Admin Scoping (updateEnquiryAction)", () => {
    it("rejects non-ADMIN users from updating an enquiry", async () => {
      // Authenticate as a Teacher
      mockSession = { uid: "teacher-A-id", role: UserRole.TEACHER, email: "teacher@ulu.com" };

      const formData = new FormData();
      formData.set("id", "enq-1");
      formData.set("status", "ACCEPTED");

      let result: any;
      try {
        result = await updateEnquiryAction(formData);
      } catch (error: any) {
        result = { success: false, message: error.message };
      }

      // Should be rejected because role is not ADMIN
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Forbidden/i);
    });
  });

  describe("API Route Ownership (Profile/Settings)", () => {
    it("rejects payload modifications targeting a different user ID", async () => {
      // This is a TDD placeholder for an API route that updates a user's profile
      // It expects the route to return 403 Forbidden if the payload's target ID doesn't match the session
      mockSession = { uid: "user-A-id", role: UserRole.STUDENT, email: "studentA@ulu.com" };

      const request = new Request("http://localhost/api/alerts/test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Bearer TEST_TOKEN",
        },
        body: JSON.stringify({
          userId: "user-B-id", // Maliciously targeting someone else's alert context
          message: "Test",
          severity: "info"
        })
      });

      const module = await import("@/app/api/alerts/test/route");
      const apiRoute = module.POST;

      process.env.ALERT_TEST_TOKEN = "TEST_TOKEN";
      const response = await apiRoute(request);
      
      // We expect a hard 403 Forbidden for IDOR attempts, but currently it just returns 200 OK
      expect(response.status).toBe(403);
      
      const json = await response.json();
      expect(json.ok).toBe(false);
      expect(json.error).toMatch(/Forbidden|Ownership/i);
    });
  });
});
