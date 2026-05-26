import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  managerTask: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  appUser: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  academicTerm: {
    findMany: vi.fn(),
  },
  assignment: {
    findMany: vi.fn(),
  },
  attendanceRecord: {
    groupBy: vi.fn(),
  },
  classGroup: {
    findMany: vi.fn(),
  },
  studentSubscription: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import * as automationRepository from "@/lib/repositories/automation-repository";

type TaskStatus = "OPEN" | "PENDING" | "IN_PROGRESS" | "COMPLETED";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

type ManagerTaskContract = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority?: TaskPriority;
  assignedToId: string | null;
  dueDate: Date;
  updatedAt: Date;
  meta?: Record<string, unknown>;
  relatedEnquiry?: { id: string; studentName: string; email: string } | null;
};

type AutomationRepositoryContract = {
  findAllTasks(input?: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assignedAdminId?: string;
  }): Promise<ManagerTaskContract[]>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<ManagerTaskContract>;
  assignTask(taskId: string, adminId: string): Promise<ManagerTaskContract>;
};

const repo = automationRepository as unknown as AutomationRepositoryContract;

describe("automation-repository ManagerTask operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("findAllTasks should filter by status, priority, and assigned admin", async () => {
    prismaMock.managerTask.findMany.mockResolvedValueOnce([
      {
        id: "task-1",
        title: "Follow up stale enquiry",
        description: "Call parent",
        status: "IN_PROGRESS",
        priority: "HIGH",
        assignedToId: "admin-1",
        dueDate: new Date("2026-05-05T10:00:00.000Z"),
        updatedAt: new Date("2026-05-01T10:00:00.000Z"),
      },
    ]);

    const result = await repo.findAllTasks({
      status: "IN_PROGRESS",
      priority: "HIGH",
      assignedAdminId: "admin-1",
    });

    expect(prismaMock.managerTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "IN_PROGRESS",
          priority: "HIGH",
          assignedToId: "admin-1",
        }),
        include: expect.objectContaining({
          assignedTo: expect.any(Object),
          relatedEnquiry: expect.any(Object),
        }),
        orderBy: expect.any(Array),
      }),
    );
    expect(result).toHaveLength(1);
  });

  it("findAllTasks should ignore invalid statuses instead of passing them to Prisma", async () => {
    prismaMock.managerTask.findMany.mockResolvedValueOnce([]);

    await repo.findAllTasks({ status: "BAD_STATUS" as TaskStatus });

    expect(prismaMock.managerTask.findMany.mock.calls[0][0].where).not.toHaveProperty("status");
  });

  it("findAllTasks should map OPEN filter to active task statuses", async () => {
    prismaMock.managerTask.findMany.mockResolvedValueOnce([]);

    await repo.findAllTasks({ status: "OPEN" });

    expect(prismaMock.managerTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["PENDING", "IN_PROGRESS"] },
        }),
      }),
    );
  });

  it("updateTaskStatus should update status and touch updatedAt", async () => {
    const before = new Date("2026-05-01T10:00:00.000Z");
    const after = new Date("2026-05-01T10:05:00.000Z");

    vi.setSystemTime(after);
    prismaMock.managerTask.findUnique.mockResolvedValueOnce({
      id: "task-1",
      status: "PENDING",
    });
    prismaMock.managerTask.update.mockResolvedValueOnce({
      id: "task-1",
      title: "Follow up",
      description: "Call parent",
      status: "IN_PROGRESS",
      assignedToId: null,
      dueDate: after,
      updatedAt: after,
    });

    const result = await repo.updateTaskStatus("task-1", "IN_PROGRESS");

    expect(prismaMock.managerTask.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: {
        status: "IN_PROGRESS",
        updatedAt: expect.any(Date),
      },
    });
    expect(result.updatedAt.getTime()).toBeGreaterThan(before.getTime());

    vi.useRealTimers();
  });

  it("updateTaskStatus should reject updates for already completed tasks", async () => {
    prismaMock.managerTask.findUnique.mockResolvedValueOnce({
      id: "task-1",
      status: "COMPLETED",
    });

    await expect(repo.updateTaskStatus("task-1", "IN_PROGRESS")).rejects.toThrow(
      /already completed|completed task|cannot update/i,
    );
    expect(prismaMock.managerTask.update).not.toHaveBeenCalled();
  });

  it("assignTask should assign the task to an admin user", async () => {
    prismaMock.managerTask.findUnique.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.appUser.findFirst.mockResolvedValueOnce({ id: "admin-2" });
    prismaMock.managerTask.update.mockResolvedValueOnce({
      id: "task-1",
      title: "Follow up",
      description: "Call parent",
      status: "PENDING",
      assignedToId: "admin-2",
      dueDate: new Date("2026-05-05T10:00:00.000Z"),
      updatedAt: new Date("2026-05-01T10:00:00.000Z"),
    });

    const result = await repo.assignTask("task-1", "admin-2");

    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith({
      where: { id: "admin-2", role: "ADMIN", isActive: true },
      select: { id: true },
    });
    expect(prismaMock.managerTask.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: {
        assignedToId: "admin-2",
        updatedAt: expect.any(Date),
      },
    });
    expect(result.assignedToId).toBe("admin-2");
  });

  it("assignTask rejects non-admin assignees", async () => {
    prismaMock.managerTask.findUnique.mockResolvedValueOnce({ id: "task-1" });
    prismaMock.appUser.findFirst.mockResolvedValueOnce(null);

    await expect(repo.assignTask("task-1", "student-1")).rejects.toThrow(/active admin/i);
    expect(prismaMock.managerTask.update).not.toHaveBeenCalled();
  });

  it("generateRuleBasedAutomationTasks creates deduped high-priority overdue payment follow-up tasks", async () => {
    vi.setSystemTime(new Date("2026-05-01T10:00:00.000Z"));
    prismaMock.studentSubscription.findMany.mockResolvedValueOnce([
      {
        id: "sub-1",
        planName: "IGCSE Monthly",
        payer: { email: "parent@example.test", fullName: "Parent One" },
        student: { email: "student@example.test", fullName: "Amina Yusuf" },
      },
    ]);
    prismaMock.attendanceRecord.groupBy.mockResolvedValueOnce([]);
    prismaMock.appUser.findMany.mockResolvedValueOnce([]);
    prismaMock.assignment.findMany.mockResolvedValueOnce([]);
    prismaMock.academicTerm.findMany.mockResolvedValueOnce([]);
    prismaMock.classGroup.findMany.mockResolvedValueOnce([]);
    prismaMock.managerTask.findFirst.mockResolvedValueOnce(null);
    prismaMock.managerTask.create.mockResolvedValueOnce({
      id: "task-1",
      title: "Follow up overdue payment: Amina Yusuf",
      description: "Subscription IGCSE Monthly is past due.",
      priority: "HIGH",
      status: "PENDING",
    });

    const database = { ...prismaMock };
    const result = await automationRepository.generateRuleBasedAutomationTasks(
      database as unknown as Parameters<
        typeof automationRepository.generateRuleBasedAutomationTasks
      >[0],
    );

    expect(prismaMock.studentSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "PAST_DUE" },
      }),
    );
    expect(prismaMock.managerTask.findFirst).toHaveBeenCalledWith({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        title: "Follow up overdue payment: Amina Yusuf",
      },
      select: { id: true },
    });
    expect(prismaMock.managerTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priority: "HIGH",
          title: "Follow up overdue payment: Amina Yusuf",
        }),
      }),
    );
    expect(result).toHaveLength(1);
    vi.useRealTimers();
  });
});
