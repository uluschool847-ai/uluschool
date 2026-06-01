import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const processDueRemindersMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("@/lib/services/reminders", () => ({
  processDueReminders: processDueRemindersMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

type AdminActionsModule = {
  runReminderDispatchAction: (
    stateOrFormData?: { status: "idle" | "success" | "error"; message: string } | FormData,
    formData?: FormData,
  ) => Promise<{ status: "idle" | "success" | "error"; message: string }>;
};

async function loadAdminActions() {
  const specifier = "@/app/(admin)/admin/actions";
  return import(/* @vite-ignore */ specifier) as Promise<AdminActionsModule>;
}

describe("admin reminder dispatch action", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
    processDueRemindersMock.mockResolvedValue({
      dryRun: true,
      failed: 0,
      scannedAssignments: 1,
      scannedClasses: 2,
      sent: 0,
      skipped: 0,
      wouldSend: 3,
    });
  });

  it("returns success feedback and writes an audit log for a dry run", async () => {
    const formData = new FormData();
    formData.set("dryRun", "true");

    const { runReminderDispatchAction } = await loadAdminActions();
    const result = await runReminderDispatchAction({ status: "idle", message: "" }, formData);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(processDueRemindersMock).toHaveBeenCalledWith({ dryRun: true });
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REMINDER_DISPATCH_DRY_RUN",
        adminUserId: "admin-1",
        meta: expect.objectContaining({ wouldSend: 3 }),
        targetType: "ReminderJob",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/reminders");
    expect(result).toEqual({
      status: "success",
      message:
        "Dry run completed. 3 reminders would be sent after scanning 2 classes and 1 assignments.",
    });
  });

  it("returns error feedback and does not write a success audit when processing fails", async () => {
    processDueRemindersMock.mockRejectedValueOnce(new Error("Network request failed"));
    const formData = new FormData();
    formData.set("dryRun", "true");

    const { runReminderDispatchAction } = await loadAdminActions();
    const result = await runReminderDispatchAction({ status: "idle", message: "" }, formData);

    expect(processDueRemindersMock).toHaveBeenCalledWith({ dryRun: true });
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/reminder job failed/i);
    expect(result.message).toMatch(/no success audit/i);
  });

  it("supports legacy direct form invocation while returning feedback", async () => {
    const formData = new FormData();

    const { runReminderDispatchAction } = await loadAdminActions();
    const result = await runReminderDispatchAction(formData);

    expect(processDueRemindersMock).toHaveBeenCalledWith({ dryRun: false });
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "REMINDER_DISPATCH_MANUAL_RUN" }),
    );
    expect(result.status).toBe("success");
  });
});
