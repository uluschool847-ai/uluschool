import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const createTeacherAvailabilityRuleMock = vi.hoisted(() => vi.fn());
const updateTeacherAvailabilityRuleMock = vi.hoisted(() => vi.fn());
const setTeacherAvailabilityRuleStatusMock = vi.hoisted(() => vi.fn());
const deleteTeacherAvailabilityRuleMock = vi.hoisted(() => vi.fn());
const createTeacherUnavailablePeriodMock = vi.hoisted(() => vi.fn());
const updateTeacherUnavailablePeriodMock = vi.hoisted(() => vi.fn());
const deleteTeacherUnavailablePeriodMock = vi.hoisted(() => vi.fn());
const transactionClientMock = vi.hoisted(() => ({ tx: true }));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: typeof transactionClientMock) => unknown) =>
    callback(transactionClientMock),
  ),
  appUser: {
    findUnique: vi.fn(),
  },
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
  createTeacherAvailabilityRule: createTeacherAvailabilityRuleMock,
  createTeacherUnavailablePeriod: createTeacherUnavailablePeriodMock,
  deleteTeacherAvailabilityRule: deleteTeacherAvailabilityRuleMock,
  deleteTeacherUnavailablePeriod: deleteTeacherUnavailablePeriodMock,
  setTeacherAvailabilityRuleStatus: setTeacherAvailabilityRuleStatusMock,
  updateTeacherAvailabilityRule: updateTeacherAvailabilityRuleMock,
  updateTeacherUnavailablePeriod: updateTeacherUnavailablePeriodMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

type TeacherAvailabilityActionResult = {
  success: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

type TeacherAvailabilityActionsModule = {
  createTeacherAvailabilityRuleAction: (
    formData: FormData,
  ) => Promise<TeacherAvailabilityActionResult>;
  updateTeacherAvailabilityRuleAction: (
    formData: FormData,
  ) => Promise<TeacherAvailabilityActionResult>;
  toggleTeacherAvailabilityRuleStatusAction: (
    formData: FormData,
  ) => Promise<TeacherAvailabilityActionResult>;
  deleteTeacherAvailabilityRuleAction: (
    formData: FormData,
  ) => Promise<TeacherAvailabilityActionResult>;
  createTeacherUnavailablePeriodAction: (
    formData: FormData,
  ) => Promise<TeacherAvailabilityActionResult>;
  updateTeacherUnavailablePeriodAction: (
    formData: FormData,
  ) => Promise<TeacherAvailabilityActionResult>;
  deleteTeacherUnavailablePeriodAction: (
    formData: FormData,
  ) => Promise<TeacherAvailabilityActionResult>;
};

async function loadTeacherAvailabilityActions() {
  const specifier = "@/app/(admin)/admin/teachers/[id]/availability/actions";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherAvailabilityActionsModule>;
}

function availabilityRuleForm(overrides?: Partial<Record<string, string | null>>) {
  const formData = new FormData();
  formData.set("id", "rule-1");
  formData.set("teacherId", "teacher-1");
  formData.set("weekday", "1");
  formData.set("startTime", "09:00");
  formData.set("endTime", "12:00");
  formData.set("timezone", "Europe/Kiev");
  formData.set("status", "ACTIVE");

  for (const [key, value] of Object.entries(overrides ?? {})) {
    formData.delete(key);
    if (value !== null) {
      formData.set(key, value);
    }
  }

  return formData;
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

function expectAvailabilityRevalidation(teacherId = "teacher-1") {
  expect(revalidatePathMock).toHaveBeenCalledWith(`/admin/teachers/${teacherId}/availability`);
  expect(revalidatePathMock).toHaveBeenCalledWith("/admin/teachers");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/availability");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/schedule");
}

function expectAudit(
  action: string,
  targetType: string,
  targetId: string,
  meta: Record<string, unknown> = {},
) {
  expect(createAdminAuditLogMock).toHaveBeenCalledWith(
    expect.objectContaining({
      action,
      adminUserId: "admin-1",
      meta: expect.objectContaining({
        teacherId: "teacher-1",
        ...meta,
      }),
      targetId,
      targetType,
    }),
    expect.anything(),
  );
}

describe("Admin teacher availability actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
    prismaMock.appUser.findUnique.mockResolvedValue({
      id: "teacher-1",
      role: UserRole.TEACHER,
      email: "teacher@example.com",
      name: "Jane Teacher",
    });
    createTeacherAvailabilityRuleMock.mockResolvedValue({
      id: "rule-1",
      teacherId: "teacher-1",
      weekday: 1,
      startTime: "09:00",
      endTime: "12:00",
      timezone: "Europe/Kiev",
      status: "ACTIVE",
    });
    updateTeacherAvailabilityRuleMock.mockResolvedValue({
      before: { id: "rule-1", startTime: "09:00", endTime: "12:00", status: "ACTIVE" },
      after: { id: "rule-1", startTime: "10:00", endTime: "13:00", status: "ACTIVE" },
    });
    setTeacherAvailabilityRuleStatusMock.mockResolvedValue({
      before: { id: "rule-1", status: "ACTIVE" },
      after: { id: "rule-1", status: "INACTIVE" },
    });
    deleteTeacherAvailabilityRuleMock.mockResolvedValue({
      id: "rule-1",
      teacherId: "teacher-1",
      weekday: 1,
      startTime: "09:00",
      endTime: "12:00",
      timezone: "Europe/Kiev",
      status: "ACTIVE",
    });
    createTeacherUnavailablePeriodMock.mockResolvedValue({
      id: "period-1",
      teacherId: "teacher-1",
      startAt: new Date("2026-06-10T09:00:00.000Z"),
      endAt: new Date("2026-06-10T12:00:00.000Z"),
      reason: "Exam board meeting",
    });
    updateTeacherUnavailablePeriodMock.mockResolvedValue({
      before: { id: "period-1", reason: "Exam board meeting" },
      after: { id: "period-1", reason: "Training day" },
    });
    deleteTeacherUnavailablePeriodMock.mockResolvedValue({
      id: "period-1",
      teacherId: "teacher-1",
      startAt: new Date("2026-06-10T09:00:00.000Z"),
      endAt: new Date("2026-06-10T12:00:00.000Z"),
      reason: "Exam board meeting",
    });
  });

  it.each([
    ["createTeacherAvailabilityRuleAction", availabilityRuleForm()],
    ["updateTeacherAvailabilityRuleAction", availabilityRuleForm()],
    ["toggleTeacherAvailabilityRuleStatusAction", availabilityRuleForm({ status: "INACTIVE" })],
    ["deleteTeacherAvailabilityRuleAction", availabilityRuleForm()],
    ["createTeacherUnavailablePeriodAction", unavailablePeriodForm()],
    ["updateTeacherUnavailablePeriodAction", unavailablePeriodForm()],
    ["deleteTeacherUnavailablePeriodAction", unavailablePeriodForm()],
  ] as const)("requires ADMIN before %s mutates teacher availability", async (actionName, form) => {
    requireRoleMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const actions = await loadTeacherAvailabilityActions();
    const result = await actions[actionName](form);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/unauthorized|failed/i),
      }),
    );
    expect(createTeacherAvailabilityRuleMock).not.toHaveBeenCalled();
    expect(updateTeacherAvailabilityRuleMock).not.toHaveBeenCalled();
    expect(setTeacherAvailabilityRuleStatusMock).not.toHaveBeenCalled();
    expect(deleteTeacherAvailabilityRuleMock).not.toHaveBeenCalled();
    expect(createTeacherUnavailablePeriodMock).not.toHaveBeenCalled();
    expect(updateTeacherUnavailablePeriodMock).not.toHaveBeenCalled();
    expect(deleteTeacherUnavailablePeriodMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects non-teacher target accounts without mutation or audit", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: UserRole.STUDENT,
      email: "student@example.com",
    });

    const { createTeacherAvailabilityRuleAction } = await loadTeacherAvailabilityActions();
    const result = await createTeacherAvailabilityRuleAction(
      availabilityRuleForm({ teacherId: "student-1" }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/teacher/i),
      }),
    );
    expect(createTeacherAvailabilityRuleMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it.each([
    { field: "weekday", value: "0", message: /weekday|1-7/i },
    { field: "weekday", value: "8", message: /weekday|1-7/i },
    { field: "startTime", value: "9am", message: /hh:mm|time/i },
    { field: "endTime", value: "noon", message: /hh:mm|time/i },
    { field: "endTime", value: "09:00", message: /start.*end|end.*start/i },
    { field: "timezone", value: "Invalid/Timezone", message: /timezone/i },
  ])("validates availability rule input %#", async ({ field, value, message }) => {
    const { createTeacherAvailabilityRuleAction } = await loadTeacherAvailabilityActions();
    const result = await createTeacherAvailabilityRuleAction(
      availabilityRuleForm({ [field]: value }),
    );

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.errors ?? result.message)).toMatch(message);
    expect(createTeacherAvailabilityRuleMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("creates a rule with success feedback, revalidation, and audit", async () => {
    const { createTeacherAvailabilityRuleAction } = await loadTeacherAvailabilityActions();
    const result = await createTeacherAvailabilityRuleAction(availabilityRuleForm());

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/created|saved/i),
      }),
    );
    expect(createTeacherAvailabilityRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: "teacher-1",
        weekday: 1,
        startTime: "09:00",
        endTime: "12:00",
        timezone: "Europe/Kiev",
      }),
      expect.anything(),
    );
    expectAudit("TEACHER_AVAILABILITY_RULE_CREATED", "teacher_availability", "rule-1", {
      endTime: "12:00",
      startTime: "09:00",
      timezone: "Europe/Kiev",
      weekday: 1,
    });
    expectAvailabilityRevalidation();
  });

  it("updates a rule with meaningful before/after audit", async () => {
    const { updateTeacherAvailabilityRuleAction } = await loadTeacherAvailabilityActions();
    const result = await updateTeacherAvailabilityRuleAction(
      availabilityRuleForm({ startTime: "10:00", endTime: "13:00" }),
    );

    expect(result.success).toBe(true);
    expect(updateTeacherAvailabilityRuleMock).toHaveBeenCalledWith(
      "rule-1",
      "teacher-1",
      expect.objectContaining({ startTime: "10:00", endTime: "13:00" }),
      expect.anything(),
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TEACHER_AVAILABILITY_RULE_UPDATED",
        before: expect.objectContaining({ startTime: "09:00" }),
        after: expect.objectContaining({ startTime: "10:00" }),
        meta: expect.objectContaining({
          endTime: "13:00",
          startTime: "10:00",
          teacherId: "teacher-1",
          timezone: "Europe/Kiev",
          weekday: 1,
        }),
      }),
      expect.anything(),
    );
    expectAvailabilityRevalidation();
  });

  it("toggles rule status and writes status audit", async () => {
    const { toggleTeacherAvailabilityRuleStatusAction } = await loadTeacherAvailabilityActions();
    const result = await toggleTeacherAvailabilityRuleStatusAction(
      availabilityRuleForm({ status: "INACTIVE" }),
    );

    expect(result.success).toBe(true);
    expect(setTeacherAvailabilityRuleStatusMock).toHaveBeenCalledWith(
      "rule-1",
      "teacher-1",
      "INACTIVE",
      expect.anything(),
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TEACHER_AVAILABILITY_RULE_STATUS_UPDATED",
        before: expect.objectContaining({ status: "ACTIVE" }),
        after: expect.objectContaining({ status: "INACTIVE" }),
        meta: expect.objectContaining({
          teacherId: "teacher-1",
          timezone: "Europe/Kiev",
          weekday: 1,
        }),
      }),
      expect.anything(),
    );
  });

  it("deletes a rule with visible feedback and audit", async () => {
    const { deleteTeacherAvailabilityRuleAction } = await loadTeacherAvailabilityActions();
    const result = await deleteTeacherAvailabilityRuleAction(availabilityRuleForm());

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/deleted|removed/i),
      }),
    );
    expect(deleteTeacherAvailabilityRuleMock).toHaveBeenCalledWith(
      "rule-1",
      "teacher-1",
      expect.anything(),
    );
    expectAudit("TEACHER_AVAILABILITY_RULE_DELETED", "teacher_availability", "rule-1", {
      endTime: "12:00",
      startTime: "09:00",
      timezone: "Europe/Kiev",
      weekday: 1,
    });
  });

  it("validates unavailable period start and end before mutation or audit", async () => {
    const { createTeacherUnavailablePeriodAction } = await loadTeacherAvailabilityActions();
    const result = await createTeacherUnavailablePeriodAction(
      unavailablePeriodForm({ endAt: "2026-06-10T09:00" }),
    );

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.errors ?? result.message)).toMatch(/start.*end|end.*start/i);
    expect(createTeacherUnavailablePeriodMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("converts unavailable period datetime-local values through the shared timezone helper", async () => {
    const { createTeacherUnavailablePeriodAction } = await loadTeacherAvailabilityActions();
    await createTeacherUnavailablePeriodAction(unavailablePeriodForm());

    expect(createTeacherUnavailablePeriodMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endAt: new Date("2026-06-10T09:00:00.000Z"),
        startAt: new Date("2026-06-10T06:00:00.000Z"),
      }),
      expect.anything(),
    );
  });

  it("creates an unavailable period with success feedback, revalidation, and audit", async () => {
    const { createTeacherUnavailablePeriodAction } = await loadTeacherAvailabilityActions();
    const result = await createTeacherUnavailablePeriodAction(unavailablePeriodForm());

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/created|saved/i),
      }),
    );
    expect(createTeacherUnavailablePeriodMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teacherId: "teacher-1",
        reason: "Exam board meeting",
      }),
      expect.anything(),
    );
    expectAudit("TEACHER_UNAVAILABLE_PERIOD_CREATED", "teacher_availability", "period-1", {
      endAt: new Date("2026-06-10T09:00:00.000Z"),
      startAt: new Date("2026-06-10T06:00:00.000Z"),
      timezone: "Europe/Kiev",
    });
    expectAvailabilityRevalidation();
  });

  it("updates and deletes unavailable periods with transaction-safe audit", async () => {
    const actions = await loadTeacherAvailabilityActions();

    const updateResult = await actions.updateTeacherUnavailablePeriodAction(
      unavailablePeriodForm({ reason: "Training day" }),
    );
    const deleteResult = await actions.deleteTeacherUnavailablePeriodAction(
      unavailablePeriodForm(),
    );

    expect(updateResult.success).toBe(true);
    expect(deleteResult.success).toBe(true);
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TEACHER_UNAVAILABLE_PERIOD_UPDATED",
        before: expect.objectContaining({ reason: "Exam board meeting" }),
        after: expect.objectContaining({ reason: "Training day" }),
        meta: expect.objectContaining({
          teacherId: "teacher-1",
          timezone: "Europe/Kiev",
        }),
      }),
      expect.anything(),
    );
    expectAudit("TEACHER_UNAVAILABLE_PERIOD_DELETED", "teacher_availability", "period-1", {
      timezone: "Europe/Kiev",
    });
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it("does not write audit when repository mutation fails", async () => {
    createTeacherUnavailablePeriodMock.mockRejectedValueOnce(new Error("Database unavailable"));

    const { createTeacherUnavailablePeriodAction } = await loadTeacherAvailabilityActions();
    const result = await createTeacherUnavailablePeriodAction(unavailablePeriodForm());

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/failed|unavailable/i),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
