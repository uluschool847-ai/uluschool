import { prisma } from "@/lib/prisma";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_TEST_TIMEOUT_MS = 15_000;

describe("Database Seed Completeness (E2E Readiness)", () => {
  // Note: We do not run the seed script directly in the test.
  // We assume the test environment has been seeded via `npx prisma db seed` prior to execution.
  beforeAll(async () => {
    await prisma.$connect();
  }, DB_TEST_TIMEOUT_MS);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("CMS & Marketing", () => {
    it(
      "should have populated BlogPosts for SEO and content testing",
      async () => {
        const count = await prisma.blogPost.count();
        expect(count).toBeGreaterThan(0);

        // Ensure we have realistic B2B SEO-driven data
        const publishedPost = await prisma.blogPost.findFirst({
          where: { isPublished: true },
        });
        expect(publishedPost).toBeDefined();
        expect(publishedPost).not.toBeNull();
        if (publishedPost) {
          expect(publishedPost.slug.length).toBeGreaterThan(0);
        }
      },
      DB_TEST_TIMEOUT_MS,
    );

    it("should have populated FaqItems for support pages", async () => {
      const count = await prisma.faqItem.count();
      expect(count).toBeGreaterThanOrEqual(3);
    });
  });

  describe("CRM & Lead Generation", () => {
    it("should have populated Enquiries", async () => {
      const count = await prisma.enquiry.count();
      expect(count).toBeGreaterThan(0);
    });

    it("should have populated ContactLeads", async () => {
      const count = await prisma.contactLead.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  describe("Educational Core", () => {
    it("should have Assignment and Submission records", async () => {
      const assignmentCount = await prisma.assignment.count();
      expect(assignmentCount).toBeGreaterThan(0);

      const submissionCount = await prisma.submission.count();
      expect(submissionCount).toBeGreaterThan(0);
    });

    it("should have at least one graded submission", async () => {
      const gradedSubmission = await prisma.submission.findFirst({
        where: {
          grade: { not: null },
        },
      });

      expect(gradedSubmission).toBeDefined();
      expect(gradedSubmission).not.toBeNull();
    });

    it("should have StudentProgress tracking records", async () => {
      const progressCount = await prisma.studentProgress.count();
      expect(progressCount).toBeGreaterThan(0);
    });

    it("should have ManagerTask records for admin workflows", async () => {
      const taskCount = await prisma.managerTask.count();
      expect(taskCount).toBeGreaterThan(0);
    });
  });

  describe("Billing & Monetization", () => {
    it("should have StudentSubscription records linked to users", async () => {
      const subscriptionCount = await prisma.studentSubscription.count();
      expect(subscriptionCount).toBeGreaterThan(0);

      const subWithStudent = await prisma.studentSubscription.findFirst({
        include: { student: true },
      });
      expect(subWithStudent).toBeDefined();
      expect(subWithStudent?.student).toBeDefined();
      expect(subWithStudent?.student).not.toBeNull();
    });

    it("should have PaymentTransaction records", async () => {
      const paymentCount = await prisma.paymentTransaction.count();
      expect(paymentCount).toBeGreaterThan(0);
    });
  });

  describe("Relational Richness", () => {
    it("should have a ScheduledClass forming a connected graph (teacher, multiple students, assignments)", async () => {
      // Find a class that has a teacher and at least one assignment
      const complexClass = await prisma.scheduledClass.findFirst({
        where: {
          teacherId: { not: null },
          assignments: { some: {} },
        },
        include: {
          teacher: true,
          students: true,
          assignments: true,
        },
      });

      expect(complexClass).toBeDefined();
      expect(complexClass).not.toBeNull();

      if (complexClass) {
        // Assert the graph relationships
        expect(complexClass.teacher).toBeDefined();

        // Assert multiple students are enrolled
        expect(complexClass.students.length).toBeGreaterThanOrEqual(2);

        // Assert related assignments exist
        expect(complexClass.assignments.length).toBeGreaterThan(0);
      }
    });
  });
});
