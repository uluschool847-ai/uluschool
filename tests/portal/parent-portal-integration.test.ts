import { prisma } from "@/lib/prisma";
import * as parentDashboardRepository from "@/lib/repositories/parent-dashboard-repository";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_INTEGRATION_TIMEOUT_MS = 15_000;

type ParentDashboardChild = {
  id: string;
  assignmentsSummary: unknown;
  attendanceSummary: unknown;
  gradebookSummary: unknown;
  materialsSummary: unknown;
  progressSummary: unknown;
  reportsSummary: unknown;
  scheduleSummary: unknown;
};

describe("Parent Portal Integration & Database Seed Tests", () => {
  beforeAll(async () => {
    await prisma.$connect();
  }, DB_INTEGRATION_TIMEOUT_MS);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Seed Data Validation", () => {
    it("should have at least one Parent actively linked to at least one Student in the database", async () => {
      // Find a parent with children to ensure our seed.ts generated the relationships
      const parentWithChildren = await prisma.appUser.findFirst({
        where: {
          role: "PARENT",
          children: {
            some: {},
          },
        },
        include: {
          children: true,
        },
      });

      expect(parentWithChildren).toBeDefined();
      expect(parentWithChildren).not.toBeNull();

      if (parentWithChildren) {
        expect(parentWithChildren.role).toBe("PARENT");
        expect(parentWithChildren.children.length).toBeGreaterThan(0);
        expect(parentWithChildren.children[0].role).toBe("STUDENT");
      }
    });
  });

  describe("Portal Repository Strictness & Data Hydration", () => {
    it(
      "should return ONLY linked students and their deep relational data",
      async () => {
        // Pick a parent to test with, relying on the DB state
        const parent = await prisma.appUser.findFirst({
          where: { role: "PARENT", children: { some: {} } },
          select: {
            id: true,
            children: {
              select: { id: true },
            },
          },
        });

        const parentId = parent ? parent.id : "mock-parent-id";
        const expectedChildIds = parent ? parent.children.map((c) => c.id) : [];

        const dashboardData = await parentDashboardRepository.getParentDashboardData(parentId);

        expect(dashboardData).toBeDefined();
        expect(dashboardData).toHaveProperty("children");
        expect(Array.isArray(dashboardData.children)).toBe(true);

        // 1. Strictness Check: Only explicitly linked students are returned
        expect(dashboardData.children.length).toBeGreaterThan(0);
        expect(dashboardData.children.length).toBe(expectedChildIds.length);

        for (const child of dashboardData.children as ParentDashboardChild[]) {
          // Must be a truly linked student
          expect(expectedChildIds).toContain(child.id);

          // 2. Data Hydration Check: dedicated dashboard repository returns real summaries.
          expect(child).toHaveProperty("scheduleSummary");
          expect(child).toHaveProperty("assignmentsSummary");
          expect(child).toHaveProperty("materialsSummary");
          expect(child).toHaveProperty("attendanceSummary");
          expect(child).toHaveProperty("progressSummary");
          expect(child).toHaveProperty("gradebookSummary");
          expect(child).toHaveProperty("reportsSummary");
        }
      },
      DB_INTEGRATION_TIMEOUT_MS,
    );
  });
});
