import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const updateTaskStatusMock = vi.hoisted(() => vi.fn());
const assignTaskMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const transactionClientMock = vi.hoisted(() => ({
  managerTask: {
    findUnique: vi.fn(),
  },
}));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: typeof transactionClientMock) => unknown) =>
    callback(transactionClientMock),
  ),
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/automation-repository", () => ({
  assignTask: assignTaskMock,
  updateTaskStatus: updateTaskStatusMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

type TaskActionsModule = {
  assignTaskAction: (input: { taskId: string; adminId?: string | null }) => Promise<unknown>;
  updateTaskStatusAction: (input: { taskId: string; status: string }) => Promise<unknown>;
};

async function loadTaskActions() {
  const specifier = "@/app/(admin)/admin/tasks/actions";
  return import(/* @vite-ignore */ specifier) as Promise<TaskActionsModule>;
}

function auditPayloadFor(action: string) {
  return createAdminAuditLogMock.mock.calls.find(([payload]) => payload?.action === action)?.[0];
}

function expectTaskRevalidation() {
  expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
  expect(revalidatePathMock).toHaveBeenCalledWith("/admin/tasks");
}

describe("Admin manager task actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
    transactionClientMock.managerTask.findUnique.mockResolvedValue({
      assignedToId: null,
      id: "task-1",
      status: "PENDING",
      title: "Follow up enquiry",
    });
    updateTaskStatusMock.mockResolvedValue({
      assignedToId: null,
      id: "task-1",
      status: "IN_PROGRESS",
    });
    assignTaskMock.mockResolvedValue({
      assignedToId: "admin-2",
      id: "task-1",
      status: "PENDING",
    });
  });

  it("updates task status with audit and dashboard/task revalidation", async () => {
    const actions = await loadTaskActions();

    const result = await actions.updateTaskStatusAction({
      taskId: "task-1",
      status: "IN_PROGRESS",
    });

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(updateTaskStatusMock).toHaveBeenCalledWith(
      "task-1",
      "IN_PROGRESS",
      transactionClientMock,
    );
    expect(auditPayloadFor("MANAGER_TASK_STATUS_UPDATED")).toEqual(
      expect.objectContaining({
        adminUserId: "admin-1",
        after: { status: "IN_PROGRESS" },
        before: { status: "PENDING" },
        targetId: "task-1",
        targetType: "manager_task",
      }),
    );
    expectTaskRevalidation();
  });

  it("assigns tasks with audit and preserves empty assignment as unassigned", async () => {
    assignTaskMock.mockResolvedValueOnce({
      assignedToId: null,
      id: "task-1",
      status: "PENDING",
    });
    const actions = await loadTaskActions();

    const result = await actions.assignTaskAction({
      adminId: "",
      taskId: "task-1",
    });

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(assignTaskMock).toHaveBeenCalledWith("task-1", null, transactionClientMock);
    expect(auditPayloadFor("MANAGER_TASK_ASSIGNED")).toEqual(
      expect.objectContaining({
        after: { assignedToId: null },
        before: { assignedToId: null },
        targetId: "task-1",
        targetType: "manager_task",
      }),
    );
    expectTaskRevalidation();
  });

  it("rejects invalid task status before mutation, audit, or revalidation", async () => {
    const actions = await loadTaskActions();

    const result = await actions.updateTaskStatusAction({
      taskId: "task-1",
      status: "DONE",
    });

    expect(result).toEqual(
      expect.objectContaining({
        error: "Invalid task status update.",
        success: false,
      }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(updateTaskStatusMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not write audit or revalidate when status mutation fails", async () => {
    updateTaskStatusMock.mockRejectedValueOnce(new Error("Task is already completed."));
    const actions = await loadTaskActions();

    const result = await actions.updateTaskStatusAction({
      taskId: "task-1",
      status: "COMPLETED",
    });

    expect(result).toEqual(
      expect.objectContaining({
        error: "Task is already completed.",
        success: false,
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not write audit or revalidate when assignment mutation fails", async () => {
    assignTaskMock.mockRejectedValueOnce(new Error("Task assignee must be an active admin."));
    const actions = await loadTaskActions();

    const result = await actions.assignTaskAction({
      adminId: "student-1",
      taskId: "task-1",
    });

    expect(result).toEqual(
      expect.objectContaining({
        error: "Task assignee must be an active admin.",
        success: false,
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects blank task IDs before mutation, audit, or revalidation", async () => {
    const actions = await loadTaskActions();

    const result = await actions.assignTaskAction({
      adminId: "admin-2",
      taskId: " ",
    });

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(assignTaskMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
