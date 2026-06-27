import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const createTeacherUnavailablePeriodMock = vi.hoisted(() => vi.fn());
const updateTeacherUnavailablePeriodMock = vi.hoisted(() => vi.fn());
const deleteTeacherUnavailablePeriodMock = vi.hoisted(() => vi.fn());
const transactionClientMock = vi.hoisted(() => ({ tx: true }));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: typeof transactionClientMock) => unknown) =>
    callback(transactionClientMock),
  ),
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("@/lib/repositories/teacher-availability-repository", () => ({
  createTeacherUnavailablePeriod: createTeacherUnavailablePeriodMock,
  deleteTeacherUnavailablePeriod: deleteTeacherUnavailablePeriodMock,
  updateTeacherUnavailablePeriod: updateTeacherUnavailablePeriodMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

type TeacherPortalAvailabilityActionResult = {
  success: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

type TeacherPortalAvailabilityActionsModule = {
  createTeacherUnavailablePeriodAction: (
    formData: FormData,
  ) => Promise<TeacherPortalAvailabilityActionResult>;
  updateTeacherUnavailablePeriodAction: (
    formData: FormData,
  ) => Promise<TeacherPortalAvailabilityActionResult>;
  deleteTeacherUnavailablePeriodAction: (
    formData: FormData,
  ) => Promise<TeacherPortalAvailabilityActionResult>;
  createTeacherAvailabilityRuleAction?: unknown;
  updateTeacherAvailabilityRuleAction?: unknown;
  deleteTeacherAvailabilityRuleAction?: unknown;
};

async function loadTeacherPortalAvailabilityActions() {
  const specifier = "@/app/portal/teacher/availability/actions";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherPortalAvailabilityActionsModule>;
}

const ACTION_SOURCE_PATH = "app/portal/teacher/availability/actions.ts";

function expectEnumTeacherGuardSource() {
  const source = readFileSync(ACTION_SOURCE_PATH, "utf8");
  expect(source).toContain("requireRole([UserRole.TEACHER])");
  expect(source).not.toContain('requireRole(["TEACHER"])');
  expect(source).not.toContain("requireRole(['TEACHER'])");
}

function unavailablePeriodForm(overrides?: Partial<Record<string, string | null>>) {
  const formData = new FormData();
  formData.set("id", "period-1");
  formData.set("teacherId", "teacher-1");
  formData.set("startAt", "2026-06-10T09:00");
  formData.set("endAt", "2026-06-10T12:00");
  formData.set("reason", "Exam board meeting");

  for (const [key, value] of Object.entries(overrides ?? {})) {
    formData.delete(key);
    if (value !== null) {
      formData.set(key, value);
    }
  }

  return formData;
}

function expectPortalAvailabilityRevalidation() {
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/availability");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/schedule");
  expect(revalidatePathMock).not.toHaveBeenCalledWith("/portal/schedule");
}

function expectUnavailablePeriodAudit(action: string) {
  expect(createAdminAuditLogMock).toHaveBeenCalledWith(
    expect.objectContaining({
      action,
      meta: expect.objectContaining({
        teacherId: "teacher-1",
      }),
      targetId: "period-1",
      targetType: "teacher_availability",
    }),
    expect.anything(),
  );
}

describe("Teacher portal availability actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    createTeacherUnavailablePeriodMock.mockResolvedValue({
      id: "period-1",
      teacherId: "teacher-1",
      startAt: new Date("2026-06-10T09:00:00.000Z"),
      endAt: new Date("2026-06-10T12:00:00.000Z"),
      reason: "Exam board meeting",
    });
    updateTeacherUnavailablePeriodMock.mockResolvedValue({
      before: { id: "period-1", teacherId: "teacher-1", reason: "Exam board meeting" },
      after: { id: "period-1", teacherId: "teacher-1", reason: "Training day" },
    });
    deleteTeacherUnavailablePeriodMock.mockResolvedValue({
      id: "period-1",
      teacherId: "teacher-1",
      startAt: new Date("2026-06-10T09:00:00.000Z"),
      endAt: new Date("2026-06-10T12:00:00.000Z"),
      reason: "Exam board meeting",
    });
  });

  it("requires TEACHER before mutating unavailable periods", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    const { createTeacherUnavailablePeriodAction } = await loadTeacherPortalAvailabilityActions();

    await expect(createTeacherUnavailablePeriodAction(unavailablePeriodForm())).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(createTeacherUnavailablePeriodMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("uses enum-based teacher guards in source", () => {
    expectEnumTeacherGuardSource();
  });

  it.each([
    [UserRole.STUDENT, "createTeacherUnavailablePeriodAction"],
    [UserRole.STUDENT, "updateTeacherUnavailablePeriodAction"],
    [UserRole.STUDENT, "deleteTeacherUnavailablePeriodAction"],
    [UserRole.PARENT, "createTeacherUnavailablePeriodAction"],
    [UserRole.PARENT, "updateTeacherUnavailablePeriodAction"],
    [UserRole.PARENT, "deleteTeacherUnavailablePeriodAction"],
    [UserRole.ADMIN, "createTeacherUnavailablePeriodAction"],
    [UserRole.ADMIN, "updateTeacherUnavailablePeriodAction"],
    [UserRole.ADMIN, "deleteTeacherUnavailablePeriodAction"],
  ] as const)("rejects %s before %s mutates availability", async (role, actionName) => {
    requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));

    const actions = await loadTeacherPortalAvailabilityActions();

    await expect(actions[actionName](unavailablePeriodForm())).rejects.toThrow(
      `NEXT_REDIRECT:${role}`,
    );
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(createTeacherUnavailablePeriodMock).not.toHaveBeenCalled();
    expect(updateTeacherUnavailablePeriodMock).not.toHaveBeenCalled();
    expect(deleteTeacherUnavailablePeriodMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("treats invalid or role-changed sessions as requireRole failures before availability mutation", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/portal/login?reason=invalid"));

    const { createTeacherUnavailablePeriodAction } = await loadTeacherPortalAvailabilityActions();

    await expect(createTeacherUnavailablePeriodAction(unavailablePeriodForm())).rejects.toThrow(
      "NEXT_REDIRECT:/portal/login?reason=invalid",
    );
    expect(createTeacherUnavailablePeriodMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each([
    { field: "startAt", value: null, message: /start/i },
    { field: "startAt", value: "not-a-date", message: /date.*valid|valid.*date/i },
    { field: "endAt", value: null, message: /end/i },
    { field: "endAt", value: "not-a-date", message: /date.*valid|valid.*date/i },
    { field: "endAt", value: "2026-06-10T09:00", message: /start.*end|end.*start/i },
  ])("validates unavailable period input %#", async ({ field, value, message }) => {
    const { createTeacherUnavailablePeriodAction } = await loadTeacherPortalAvailabilityActions();
    const result = await createTeacherUnavailablePeriodAction(
      unavailablePeriodForm({ [field]: value }),
    );

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.errors ?? result.message)).toMatch(message);
    expect(createTeacherUnavailablePeriodMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("uses the shared timezone conversion helper instead of appending Z to datetime-local input", () => {
    const source = readFileSync(ACTION_SOURCE_PATH, "utf8");

    expect(source).toContain("localDateTimeToUtc");
    expect(source).not.toContain("`${value}Z`");
    expect(source).not.toContain("`${value}:00.000Z`");
  });

  it("allows teachers to create an unavailable period for themselves with optional reason", async () => {
    const { createTeacherUnavailablePeriodAction } = await loadTeacherPortalAvailabilityActions();
    const result = await createTeacherUnavailablePeriodAction(
      unavailablePeriodForm({ reason: null }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/created|saved/i),
      }),
    );
    expect(createTeacherUnavailablePeriodMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: "teacher-1",
        reason: undefined,
      }),
      expect.anything(),
    );
    expectUnavailablePeriodAudit("TEACHER_UNAVAILABLE_PERIOD_CREATED");
    expectPortalAvailabilityRevalidation();
  });

  it("converts datetime-local values from Africa/Nairobi before creating unavailable periods", async () => {
    const { createTeacherUnavailablePeriodAction } = await loadTeacherPortalAvailabilityActions();
    await createTeacherUnavailablePeriodAction(unavailablePeriodForm());

    expect(createTeacherUnavailablePeriodMock).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: new Date("2026-06-10T06:00:00.000Z"),
        endAt: new Date("2026-06-10T09:00:00.000Z"),
      }),
      expect.anything(),
    );
  });

  it("allows teachers to update and delete their own unavailable periods", async () => {
    const actions = await loadTeacherPortalAvailabilityActions();

    const updateResult = await actions.updateTeacherUnavailablePeriodAction(
      unavailablePeriodForm({ reason: "Training day" }),
    );
    const deleteResult = await actions.deleteTeacherUnavailablePeriodAction(
      unavailablePeriodForm(),
    );

    expect(updateResult).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/updated|saved/i),
      }),
    );
    expect(deleteResult).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/deleted|removed/i),
      }),
    );
    expect(updateTeacherUnavailablePeriodMock).toHaveBeenCalledWith(
      "period-1",
      "teacher-1",
      expect.objectContaining({ reason: "Training day" }),
      expect.anything(),
    );
    expect(deleteTeacherUnavailablePeriodMock).toHaveBeenCalledWith(
      "period-1",
      "teacher-1",
      expect.anything(),
    );
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expectUnavailablePeriodAudit("TEACHER_UNAVAILABLE_PERIOD_UPDATED");
    expectUnavailablePeriodAudit("TEACHER_UNAVAILABLE_PERIOD_DELETED");
  });

  it.each([
    ["create", "createTeacherUnavailablePeriodAction", "TEACHER_UNAVAILABLE_PERIOD_CREATED"],
    ["update", "updateTeacherUnavailablePeriodAction", "TEACHER_UNAVAILABLE_PERIOD_UPDATED"],
    ["delete", "deleteTeacherUnavailablePeriodAction", "TEACHER_UNAVAILABLE_PERIOD_DELETED"],
  ] as const)(
    "ignores submitted teacherId while trying to %s another teacher's unavailable period",
    async (_, actionName, auditAction) => {
      const actions = await loadTeacherPortalAvailabilityActions();
      const result = await actions[actionName](
        unavailablePeriodForm({
          teacherId: "teacher-2",
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
        }),
      );
      if (actionName === "createTeacherUnavailablePeriodAction") {
        expect(createTeacherUnavailablePeriodMock).toHaveBeenCalledWith(
          expect.objectContaining({ teacherId: "teacher-1" }),
          expect.anything(),
        );
      }
      if (actionName === "updateTeacherUnavailablePeriodAction") {
        expect(updateTeacherUnavailablePeriodMock).toHaveBeenCalledWith(
          "period-1",
          "teacher-1",
          expect.any(Object),
          expect.anything(),
        );
      }
      if (actionName === "deleteTeacherUnavailablePeriodAction") {
        expect(deleteTeacherUnavailablePeriodMock).toHaveBeenCalledWith(
          "period-1",
          "teacher-1",
          expect.anything(),
        );
      }
      expectUnavailablePeriodAudit(auditAction);
    },
  );

  it("does not expose weekly availability rule mutations in the teacher portal", async () => {
    const actions = await loadTeacherPortalAvailabilityActions();

    expect(actions.createTeacherAvailabilityRuleAction).toBeUndefined();
    expect(actions.updateTeacherAvailabilityRuleAction).toBeUndefined();
    expect(actions.deleteTeacherAvailabilityRuleAction).toBeUndefined();
  });

  it("does not write audit or revalidate when unavailable period mutation fails", async () => {
    updateTeacherUnavailablePeriodMock.mockRejectedValueOnce(new Error("Forbidden"));

    const { updateTeacherUnavailablePeriodAction } = await loadTeacherPortalAvailabilityActions();
    const result = await updateTeacherUnavailablePeriodAction(unavailablePeriodForm());

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/failed|forbidden/i),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each([
    ["updateTeacherUnavailablePeriodAction", updateTeacherUnavailablePeriodMock],
    ["deleteTeacherUnavailablePeriodAction", deleteTeacherUnavailablePeriodMock],
  ] as const)(
    "returns a visible error without audit when teacher tries to %s for another teacher",
    async (actionName, repositoryMock) => {
      repositoryMock.mockRejectedValueOnce(new Error("Unavailable period not found for teacher."));

      const actions = await loadTeacherPortalAvailabilityActions();
      const result = await actions[actionName](
        unavailablePeriodForm({
          teacherId: "other-teacher",
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/not found|teacher|failed/i),
        }),
      );
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    },
  );
});
