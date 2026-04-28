import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock environment and external dependencies
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ 
  redirect: vi.fn((url) => { throw new Error(`REDIRECT:${url}`) }) 
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(() => Promise.resolve({ uid: "user-1", role: "ADMIN" })),
  getSession: vi.fn(() => Promise.resolve({ uid: "user-1", role: "ADMIN" })),
}));

// Mock repositories so we don't hit the DB
vi.mock("@/lib/repositories/cms-repository", () => ({
  createFaqItem: vi.fn(),
  updateFaqItem: vi.fn(),
  createPage: vi.fn(),
  updatePage: vi.fn(),
  createBlogPost: vi.fn(),
  updateBlogPost: vi.fn(),
}));

vi.mock("@/lib/repositories/enquiry-repository", () => ({
  updateEnquiryReview: vi.fn(),
  getEnquiryById: vi.fn(),
  createEnquiry: vi.fn(),
}));

vi.mock("@/lib/repositories/contact-lead-repository", () => ({
  updateContactLeadReview: vi.fn(),
  getContactLeadById: vi.fn(),
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  submitHomework: vi.fn(),
  gradeHomework: vi.fn(),
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: vi.fn(),
}));

// Mock security and services for public actions
vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstileToken: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock("@/lib/security/spam-guard", () => ({
  getRequestIdentifier: vi.fn(() => Promise.resolve("127.0.0.1")),
  honeypotTriggered: vi.fn(() => false),
  submittedTooFast: vi.fn(() => false),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ ok: true })),
}));

vi.mock("@/lib/analytics/attribution", () => ({
  getAttributionFromRequest: vi.fn(),
}));

vi.mock("@/lib/services/email", () => ({
  sendEnquiryEmail: vi.fn(() => Promise.resolve({ delivered: true })),
  sendContactEmail: vi.fn(() => Promise.resolve({ delivered: true })),
}));

// Import actions after mocks
import { updateEnquiryAction, updateContactLeadAction } from "@/app/(admin)/admin/actions";
import { saveFaqItemAction, savePageAction, saveBlogPostAction } from "@/app/(admin)/admin/cms/actions";
import { submitHomeworkAction, gradeHomeworkAction } from "@/app/portal/actions";
import { submitEnrolment } from "@/app/enrol/actions";
import { submitContactEnquiry } from "@/app/contact/actions";

describe("Strict Schema Validation - Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Admin & CMS Actions (app/(admin)/admin/actions.ts, app/(admin)/admin/cms/actions.ts)", () => {
    it("updateEnquiryAction safely rejects empty payloads with structured errors, avoiding silent failures", async () => {
      const formData = new FormData();
      // Emulating empty submission
      const result = await updateEnquiryAction(formData) as any;
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveProperty("id");
      expect(result.errors).toHaveProperty("status");
    });

    it("updateContactLeadAction safely rejects incorrect data types (e.g. invalid status)", async () => {
      const formData = new FormData();
      formData.set("id", "lead-1");
      formData.set("status", "NOT_A_VALID_STATUS");
      
      const result = await updateContactLeadAction(formData) as any;
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveProperty("status");
    });

    it("saveFaqItemAction rejects missing required fields and returns structured validation errors", async () => {
      const formData = new FormData();
      formData.set("category", "General"); // Missing question and answer
      // displayOrder is missing, should default to 0 or fail depending on schema
      
      const result = await saveFaqItemAction(formData) as any;
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveProperty("question");
      expect(result.errors).toHaveProperty("answer");
    });

    it("savePageAction handles malformed JSON without crashing and returns structured errors", async () => {
      const formData = new FormData();
      formData.set("slug", "test-page");
      formData.set("title", "Test Page");
      formData.set("content", "{ malformed_json: true "); // Invalid JSON
      
      const result = await savePageAction(formData) as any;
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveProperty("content");
    });
  });

  describe("Portal Actions (app/portal/actions.ts)", () => {
    it("submitHomeworkAction handles missing required fields cleanly rather than throwing an exception", async () => {
      const formData = new FormData();
      // Missing homeworkId and contentUrl
      
      const result = await submitHomeworkAction(formData) as any;
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveProperty("homeworkId");
      expect(result.errors).toHaveProperty("contentUrl");
    });

    it("gradeHomeworkAction safely rejects invalid grades (not a number)", async () => {
      const formData = new FormData();
      formData.set("submissionId", "sub-1");
      formData.set("grade", "A+"); // Suppose the schema expects a numeric grade out of 100
      
      const result = await gradeHomeworkAction(formData) as any;
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveProperty("grade");
    });
  });

  describe("Public Actions (app/enrol/actions.ts, app/contact/actions.ts)", () => {
    it("submitEnrolment returns structured errors for invalid email formats", async () => {
      const formData = new FormData();
      formData.set("studentName", "John Doe");
      formData.set("email", "not-an-email-address"); // Invalid email
      
      const result = await submitEnrolment({ success: false, message: "" }, formData);
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveProperty("email");
    });

    it("submitContactEnquiry returns structured errors when required fields are missing", async () => {
      const formData = new FormData();
      // Missing name, email, message
      
      const result = await submitContactEnquiry({ success: false, message: "" }, formData);
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveProperty("fullName");
      expect(result.errors).toHaveProperty("email");
      expect(result.errors).toHaveProperty("message");
    });
  });
});
