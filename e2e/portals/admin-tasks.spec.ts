import { type Page, expect, test } from "@playwright/test";
import { TaskPriority, TaskStatus, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const AUTH_SECRET = process.env.AUTH_SESSION_SECRET ?? "dev-only-auth-session-secret-please-change";
const ADMIN_EMAIL = "fixed.admin@uluglobalacademy.com";
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const QA_PREFIX = `QA Tasks ${RUN_ID}`;
const SECOND_ADMIN_EMAIL = `qa.tasks.admin.${RUN_ID}@example.com`;
const STUDENT_EMAIL = `qa.tasks.student.${RUN_ID}@example.com`;

let adminUserId = "";
let secondAdminId = "";
let studentUserId = "";
let pendingTaskId = "";
let inProgressTaskId = "";
let completedTaskId = "";

function toBase64Url(input: string) {
  return Buffer.from(input, "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function signPayload(payloadBase64: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadBase64));
  const signatureString = Array.from(new Uint8Array(signature))
    .map((byte) => String.fromCharCode(byte))
    .join("");
  return toBase64Url(signatureString);
}

async function createSessionToken(input: {
  uid: string;
  role: UserRole;
  email: string;
  fullName: string;
}) {
  const payloadBase64 = toBase64Url(
    JSON.stringify({
      uid: input.uid,
      role: input.role,
      email: input.email,
      fullName: input.fullName,
      exp: Date.now() + 1000 * 60 * 60,
      mfaVerified: true,
      authMethod: "password",
    }),
  );
  return `${payloadBase64}.${await signPayload(payloadBase64)}`;
}

async function setPortalSession(
  page: Page,
  input: {
    uid: string;
    role: UserRole;
    email: string;
    fullName: string;
  },
) {
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "ulu_session",
      value: await createSessionToken(input),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);
}

async function cleanupQaTasksData() {
  const taskIds = await prisma.managerTask.findMany({
    where: { title: { startsWith: QA_PREFIX } },
    select: { id: true },
  });
  if (taskIds.length > 0) {
    await prisma.adminAuditLog.deleteMany({
      where: {
        targetType: "manager_task",
        targetId: { in: taskIds.map((task) => task.id) },
      },
    });
  }
  await prisma.managerTask.deleteMany({
    where: { title: { startsWith: QA_PREFIX } },
  });
  await prisma.appUser.deleteMany({
    where: {
      email: {
        in: [SECOND_ADMIN_EMAIL, STUDENT_EMAIL],
      },
    },
  });
}

async function createTasksFixtures() {
  const fixedAdmin = await prisma.appUser.findUniqueOrThrow({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  });
  adminUserId = fixedAdmin.id;

  const [secondAdmin, student] = await Promise.all([
    prisma.appUser.create({
      data: {
        email: SECOND_ADMIN_EMAIL,
        fullName: `QA Tasks Admin ${RUN_ID}`,
        role: UserRole.ADMIN,
        passwordHash: "test-password-hash",
        isActive: true,
      },
    }),
    prisma.appUser.create({
      data: {
        email: STUDENT_EMAIL,
        fullName: `QA Tasks Student ${RUN_ID}`,
        role: UserRole.STUDENT,
        passwordHash: "test-password-hash",
        isActive: true,
      },
    }),
  ]);
  secondAdminId = secondAdmin.id;
  studentUserId = student.id;

  const [pendingTask, inProgressTask, completedTask] = await Promise.all([
    prisma.managerTask.create({
      data: {
        title: `${QA_PREFIX} PENDING qa-tasks-pending`,
        description:
          "A long pending manager task description that should wrap cleanly without breaking the card layout.",
        dueDate: new Date("2099-01-01T09:00:00.000Z"),
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
      },
    }),
    prisma.managerTask.create({
      data: {
        title: `${QA_PREFIX} IN_PROGRESS qa-tasks-progress`,
        description: "Assigned follow-up task.",
        dueDate: new Date("2099-01-02T09:00:00.000Z"),
        status: TaskStatus.IN_PROGRESS,
        assignedToId: secondAdmin.id,
      },
    }),
    prisma.managerTask.create({
      data: {
        title: `${QA_PREFIX} COMPLETED qa-tasks-completed`,
        description: "Completed follow-up task.",
        dueDate: new Date("2099-01-03T09:00:00.000Z"),
        status: TaskStatus.COMPLETED,
        assignedToId: fixedAdmin.id,
      },
    }),
  ]);
  pendingTaskId = pendingTask.id;
  inProgressTaskId = inProgressTask.id;
  completedTaskId = completedTask.id;
}

function taskCard(page: Page, taskId: string) {
  return page.getByTestId(`task-card-${taskId}`);
}

test.describe("Admin Manager Tasks", () => {
  test.describe.configure({ timeout: 180000, mode: "serial" });

  test.beforeAll(async () => {
    await cleanupQaTasksData();
    await createTasksFixtures();
  });

  test.afterAll(async () => {
    await cleanupQaTasksData();
    await prisma.$disconnect();
  });

  test("admin filters tasks, assigns active admins, and changes task status", async ({ page }) => {
    await setPortalSession(page, {
      uid: adminUserId,
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: "Fixed Admin",
    });

    await page.goto("/admin/tasks");
    await expect(page.getByRole("heading", { name: "Manager Tasks" })).toBeVisible();
    await expect(
      page.getByText(/operational follow-ups generated by admin workflows/i),
    ).toBeVisible();
    await expect(taskCard(page, pendingTaskId)).toBeVisible();
    await expect(taskCard(page, inProgressTaskId)).toBeVisible();
    await expect(taskCard(page, completedTaskId)).toBeVisible();
    await expect(taskCard(page, pendingTaskId)).toContainText("Unassigned");
    await expect(page.locator("body")).not.toContainText("undefined");
    await expect(page.locator("body")).not.toContainText("null");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Manager Tasks" })).toBeVisible();
    await expect(taskCard(page, pendingTaskId)).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/admin/tasks?status=PENDING");
    await expect(taskCard(page, pendingTaskId)).toBeVisible();
    await expect(taskCard(page, inProgressTaskId)).toHaveCount(0);
    await expect(taskCard(page, completedTaskId)).toHaveCount(0);

    await page.goto("/admin/tasks?status=IN_PROGRESS");
    await expect(taskCard(page, inProgressTaskId)).toBeVisible();
    await expect(taskCard(page, pendingTaskId)).toHaveCount(0);

    await page.goto("/admin/tasks?status=COMPLETED");
    await expect(taskCard(page, completedTaskId)).toBeVisible();
    await expect(taskCard(page, inProgressTaskId)).toHaveCount(0);

    await page.goto("/admin/tasks?status=NOT_A_STATUS&priority=HIGH");
    await expect(page.getByRole("heading", { name: "Manager Tasks" })).toBeVisible();
    await expect(taskCard(page, pendingTaskId)).toBeVisible();

    await page.goto(`/admin/tasks?assignedAdminId=${secondAdminId}`);
    await expect(taskCard(page, inProgressTaskId)).toBeVisible();
    await expect(taskCard(page, pendingTaskId)).toHaveCount(0);

    await page.goto(`/admin/tasks?status=IN_PROGRESS&assignedAdminId=${secondAdminId}`);
    await expect(taskCard(page, inProgressTaskId)).toBeVisible();

    await page.goto("/admin/tasks?status=PENDING");
    const pendingCard = taskCard(page, pendingTaskId);
    await pendingCard.getByLabel("Assign admin").selectOption(secondAdminId);
    await expect(pendingCard).toContainText("Task assignment updated");
    await expect(pendingCard).toContainText(`QA Tasks Admin ${RUN_ID}`);
    await expect
      .poll(async () => {
        const task = await prisma.managerTask.findUnique({
          where: { id: pendingTaskId },
          select: { assignedToId: true },
        });
        return task?.assignedToId;
      })
      .toBe(secondAdminId);

    await pendingCard.getByRole("button", { name: "Start in progress" }).click();
    await expect
      .poll(async () => {
        const task = await prisma.managerTask.findUnique({
          where: { id: pendingTaskId },
          select: { status: true },
        });
        return task?.status;
      })
      .toBe(TaskStatus.IN_PROGRESS);

    await page.goto("/admin/tasks?status=PENDING");
    await expect(taskCard(page, pendingTaskId)).toHaveCount(0);

    await page.goto(`/admin/tasks?status=IN_PROGRESS&assignedAdminId=${secondAdminId}`);
    await expect(taskCard(page, pendingTaskId)).toBeVisible();
    await taskCard(page, pendingTaskId).getByRole("button", { name: "Complete" }).click();
    await expect
      .poll(async () => {
        const task = await prisma.managerTask.findUnique({
          where: { id: pendingTaskId },
          select: { status: true },
        });
        return task?.status;
      })
      .toBe(TaskStatus.COMPLETED);

    await page.goto("/admin/tasks?status=COMPLETED");
    await expect(taskCard(page, pendingTaskId)).toBeVisible();

    await expect(
      taskCard(page, pendingTaskId)
        .getByLabel("Assign admin")
        .locator("option", {
          hasText: `QA Tasks Student ${RUN_ID}`,
        }),
    ).toHaveCount(0);

    const auditLogs = await prisma.adminAuditLog.findMany({
      where: {
        targetType: "manager_task",
        targetId: pendingTaskId,
        action: { in: ["MANAGER_TASK_ASSIGNED", "MANAGER_TASK_STATUS_UPDATED"] },
      },
    });
    expect(auditLogs.some((log) => log.action === "MANAGER_TASK_ASSIGNED")).toBe(true);
    expect(auditLogs.some((log) => log.action === "MANAGER_TASK_STATUS_UPDATED")).toBe(true);
    expect(JSON.stringify(auditLogs)).not.toMatch(/password|token|secret/i);
  });

  test("guest and non-admin users cannot access manager tasks", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/admin/tasks");
    await expect(page).toHaveURL(/\/portal\/login/);

    for (const user of [
      {
        uid: studentUserId,
        role: UserRole.STUDENT,
        email: STUDENT_EMAIL,
        fullName: `QA Tasks Student ${RUN_ID}`,
      },
      {
        uid: "teacher-tasks-1",
        role: UserRole.TEACHER,
        email: "fixed.teacher@uluglobalacademy.com",
        fullName: "Fixed Teacher",
      },
      {
        uid: "parent-tasks-1",
        role: UserRole.PARENT,
        email: "fixed.parent@uluglobalacademy.com",
        fullName: "Fixed Parent",
      },
    ]) {
      await setPortalSession(page, user);
      await page.goto("/admin/tasks");
      await expect(page).toHaveURL(
        /\/portal\/(student|teacher|parent|unauthorized)|\/portal\/login/,
      );
    }
  });
});
