import { type Page, expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

const PASSWORD = process.env.E2E_PORTAL_PASSWORD ?? "ChangeMe123!";
const TEST_LIVE_LESSON_URL =
  process.env.E2E_LIVE_LESSON_URL ?? "https://meet.google.com/math-visibility";

test.describe("Teacher Portal", () => {
  async function loginAsTeacher(page: Page, email: string) {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await page.waitForURL(/\/portal\/teacher/);
  }

  test("teacher dashboard loads with data", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill("fixed.teacher@uluglobalacademy.com");
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await page.waitForURL(/\/portal\/teacher/);

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/class|assignment|submission/i).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("teacher schedule loads", async ({ page }) => {
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill("fixed.teacher@uluglobalacademy.com");
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /login|sign in/i }).click();
    await page.waitForURL(/\/portal\/teacher/);

    await page.goto("/portal/schedule");
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("teacher portal shows only assigned classes and enrolled student submissions", async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const passwordHash = await hashPassword(PASSWORD);
    const john = await prisma.appUser.create({
      data: {
        email: `qa.teacher.john.${suffix}@uluglobalacademy.com`,
        fullName: `John Smith ${suffix}`,
        role: UserRole.TEACHER,
        passwordHash,
        isActive: true,
      },
    });
    const otherTeacher = await prisma.appUser.create({
      data: {
        email: `qa.teacher.other.${suffix}@uluglobalacademy.com`,
        fullName: `Other Teacher ${suffix}`,
        role: UserRole.TEACHER,
        passwordHash,
        isActive: true,
      },
    });
    const sofia = await prisma.appUser.create({
      data: {
        email: `qa.sofia.${suffix}@uluglobalacademy.com`,
        fullName: `Sofia ${suffix}`,
        role: UserRole.STUDENT,
        passwordHash,
        isActive: true,
      },
    });
    const mark = await prisma.appUser.create({
      data: {
        email: `qa.mark.${suffix}@uluglobalacademy.com`,
        fullName: `Mark ${suffix}`,
        role: UserRole.STUDENT,
        passwordHash,
        isActive: true,
      },
    });
    const otherStudent = await prisma.appUser.create({
      data: {
        email: `qa.other.student.${suffix}@uluglobalacademy.com`,
        fullName: `Other Student ${suffix}`,
        role: UserRole.STUDENT,
        passwordHash,
        isActive: true,
      },
    });

    const johnClass = await prisma.scheduledClass.create({
      data: {
        title: `Math Visibility ${suffix}`,
        description: "Teacher visibility class",
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 90000000),
        liveLessonUrl: TEST_LIVE_LESSON_URL,
        teacherId: john.id,
        students: {
          connect: [{ id: sofia.id }, { id: mark.id }],
        },
      },
    });
    const otherClass = await prisma.scheduledClass.create({
      data: {
        title: `Other Teacher Class ${suffix}`,
        description: "Should not be visible to John",
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 90000000),
        liveLessonUrl: TEST_LIVE_LESSON_URL,
        teacherId: otherTeacher.id,
        students: {
          connect: [{ id: otherStudent.id }],
        },
      },
    });
    const johnAssignment = await prisma.assignment.create({
      data: {
        title: `Math Homework ${suffix}`,
        description: "Assigned class homework",
        dueDate: new Date(Date.now() + 172800000),
        scheduledClassId: johnClass.id,
        teacherId: john.id,
      },
    });
    const otherAssignment = await prisma.assignment.create({
      data: {
        title: `Other Homework ${suffix}`,
        description: "Other teacher homework",
        dueDate: new Date(Date.now() + 172800000),
        scheduledClassId: otherClass.id,
        teacherId: otherTeacher.id,
      },
    });
    await prisma.submission.createMany({
      data: [
        {
          studentId: sofia.id,
          assignmentId: johnAssignment.id,
          contentUrl: "/uploads/sofia-math.pdf",
        },
        {
          studentId: mark.id,
          assignmentId: johnAssignment.id,
          contentUrl: "/uploads/mark-math.pdf",
        },
        {
          studentId: otherStudent.id,
          assignmentId: otherAssignment.id,
          contentUrl: "/uploads/other-homework.pdf",
        },
      ],
    });

    await loginAsTeacher(page, john.email);

    await expect(page.getByText(johnClass.title).first()).toBeVisible();
    await expect(page.getByText(johnAssignment.title).first()).toBeVisible();
    await expect(page.getByText(sofia.fullName)).toBeVisible();
    await expect(page.getByText(mark.fullName)).toBeVisible();
    await expect(page.getByText(otherClass.title)).toHaveCount(0);
    await expect(page.getByText(otherAssignment.title)).toHaveCount(0);
    await expect(page.getByText(otherStudent.fullName)).toHaveCount(0);

    await prisma.scheduledClass.update({
      where: { id: johnClass.id },
      data: { teacherId: otherTeacher.id },
    });
    await page.reload();

    await expect(page.getByText(johnClass.title)).toHaveCount(0);
    await expect(page.getByText(sofia.fullName)).toHaveCount(0);
    await expect(page.getByText(mark.fullName)).toHaveCount(0);
  });
});
