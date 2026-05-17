import { prisma } from "@/lib/prisma";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_TEST_TIMEOUT_MS = 15_000;

describe("Database Seed Scenarios (E2E Readiness)", () => {
  // Note: We do not run the seed script directly in the test.
  // We assume the test environment has been seeded prior to execution.
  beforeAll(async () => {
    await prisma.$connect();
  }, DB_TEST_TIMEOUT_MS);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('The "Happy Path" Family Lifecycle', () => {
    it(
      "should have a Parent linked to a Student with varied academic states",
      async () => {
        // Find seeded parent/child pairs, then select the child that exercises
        // the full academic state. Some E2E fixtures intentionally include
        // lightweight parent-child links for empty-state flows.
        const parents = await prisma.appUser.findMany({
          where: {
            role: "PARENT",
            children: { some: {} },
          },
          include: {
            children: {
              include: {
                enrolledClasses: true,
                enrolledClassGroups: true,
                submissions: true,
              },
            },
          },
        });
        const parent = parents.find((candidate) =>
          candidate.children.some(
            (child) =>
              child.enrolledClasses.length + child.enrolledClassGroups.length >= 2 &&
              child.submissions.some((sub) => sub.grade !== null) &&
              child.submissions.some((sub) => sub.grade === null),
          ),
        );

        expect(parent).toBeDefined();
        expect(parent).not.toBeNull();

        if (parent) {
          expect(parent.children.length).toBeGreaterThan(0);

          // Find a child that matches the complex criteria:
          // Multiple classes, at least 1 graded submission, and at least 1 pending submission
          const fullyHydratedChild = parent.children.find(
            (child) =>
              child.enrolledClasses.length + child.enrolledClassGroups.length >= 2 &&
              child.submissions.some((sub) => sub.grade !== null) &&
              child.submissions.some((sub) => sub.grade === null),
          );

          expect(fullyHydratedChild).toBeDefined();

          if (fullyHydratedChild) {
            expect(
              fullyHydratedChild.enrolledClasses.length +
                fullyHydratedChild.enrolledClassGroups.length,
            ).toBeGreaterThanOrEqual(2);

            const hasGraded = fullyHydratedChild.submissions.some((sub) => sub.grade !== null);
            const hasPending = fullyHydratedChild.submissions.some((sub) => sub.grade === null);

            expect(hasGraded).toBe(true);
            expect(hasPending).toBe(true);
          }
        }
      },
      DB_TEST_TIMEOUT_MS,
    );
  });

  describe("Empty States & Edge Cases", () => {
    it("should have a freshly registered Student (0 classes, 0 submissions)", async () => {
      const emptyStudent = await prisma.appUser.findFirst({
        where: {
          role: "STUDENT",
          enrolledClasses: { none: {} },
          submissions: { none: {} },
        },
      });

      expect(emptyStudent).toBeDefined();
      expect(emptyStudent).not.toBeNull();
    });

    it("should have a newly hired Teacher (0 assigned classes)", async () => {
      const emptyTeacher = await prisma.appUser.findFirst({
        where: {
          role: "TEACHER",
          scheduledAsTeacher: { none: {} },
        },
      });

      expect(emptyTeacher).toBeDefined();
      expect(emptyTeacher).not.toBeNull();
    });

    it("should have a Parent without children (incomplete onboarding)", async () => {
      const emptyParent = await prisma.appUser.findFirst({
        where: {
          role: "PARENT",
          children: { none: {} },
        },
      });

      expect(emptyParent).toBeDefined();
      expect(emptyParent).not.toBeNull();
    });

    it("should have a ScheduledClass with a teacher but 0 enrolled students", async () => {
      const emptyClass = await prisma.scheduledClass.findFirst({
        where: {
          teacherId: { not: null },
          students: { none: {} },
        },
      });

      expect(emptyClass).toBeDefined();
      expect(emptyClass).not.toBeNull();
    });
  });
});
