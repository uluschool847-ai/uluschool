import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const createLessonMock = vi.hoisted(() => vi.fn());
const updateLessonMock = vi.hoisted(() => vi.fn());
const updateLessonMeetingLinkMock = vi.hoisted(() => vi.fn());
const rescheduleLessonMock = vi.hoisted(() => vi.fn());
const checkTeacherAvailabilityMock = vi.hoisted(() => vi.fn());
const createGoogleMeetEventForLessonMock = vi.hoisted(() => vi.fn());
const updateGoogleMeetEventForLessonMock = vi.hoisted(() => vi.fn());
const deleteGoogleMeetEventForLessonMock = vi.hoisted(() => vi.fn());
const isGoogleCalendarEnabledMock = vi.hoisted(() => vi.fn());
const getLessonByIdMock = vi.hoisted(() => vi.fn());
const cancelLessonMock = vi.hoisted(() => vi.fn());
const completeLessonMock = vi.hoisted(() => vi.fn());
const deleteLessonMock = vi.hoisted(() => vi.fn());
const createRecurringLessonsMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/integrations/google-calendar", () => ({
  createGoogleMeetEventForLesson: createGoogleMeetEventForLessonMock,
  deleteGoogleMeetEventForLesson: deleteGoogleMeetEventForLessonMock,
  isGoogleCalendarEnabled: isGoogleCalendarEnabledMock,
  updateGoogleMeetEventForLesson: updateGoogleMeetEventForLessonMock,
}));

vi.mock("@/lib/repositories/lesson-repository", () => ({
  cancelLesson: cancelLessonMock,
  completeLesson: completeLessonMock,
  createLesson: createLessonMock,
  createRecurringLessons: createRecurringLessonsMock,
  deleteLesson: deleteLessonMock,
  getLessonById: getLessonByIdMock,
  rescheduleLesson: rescheduleLessonMock,
  updateLesson: updateLessonMock,
  updateLessonMeetingLink: updateLessonMeetingLinkMock,
}));

vi.mock("@/lib/repositories/teacher-availability-repository", () => ({
  checkTeacherAvailability: checkTeacherAvailabilityMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

type LessonActionResult = {
  success: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

type LessonActionsModule = {
  createLessonAction: (formData: FormData) => Promise<LessonActionResult>;
  updateLessonAction: (formData: FormData) => Promise<LessonActionResult>;
  rescheduleLessonAction: (formData: FormData) => Promise<LessonActionResult>;
  cancelLessonAction: (formData: FormData) => Promise<LessonActionResult>;
  completeLessonAction: (formData: FormData) => Promise<LessonActionResult>;
  deleteLessonAction: (formData: FormData) => Promise<LessonActionResult>;
  createRecurringLessonsAction: (formData: FormData) => Promise<LessonActionResult>;
};

async function loadLessonActions() {
  return import("@/app/(admin)/admin/lessons/actions") as Promise<LessonActionsModule>;
}

function lessonForm(overrides?: Partial<Record<string, string | null>>) {
  const formData = new FormData();
  formData.set("id", "lesson-1");
  formData.set("classGroupId", "group-1");
  formData.set("title", "Quadratic functions");
  formData.set("description", "Live problem-solving session");
  formData.set("startAt", "2026-06-01T10:00");
  formData.set("endAt", "2026-06-01T11:00");
  formData.set("timezone", "Africa/Nairobi");
  formData.set("teacherId", "teacher-1");
  formData.set("subjectId", "subject-math");
  formData.set("liveLessonUrl", "https://meet.google.com/abc-defg-hij");
  formData.set("meetingProvider", "GOOGLE_MEET");
  formData.set("reminderMinutesBefore", "60");

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === null) {
      formData.delete(key);
    } else {
      formData.set(key, value);
    }
  }

  return formData;
}

function recurringForm(overrides?: Partial<Record<string, string | null>>) {
  const formData = new FormData();
  formData.set("classGroupId", "group-1");
  formData.set("title", "Weekly mathematics lesson");
  formData.set("description", "Weekly practice");
  formData.set("startDate", "2026-06-01");
  formData.set("endDate", "2026-06-30");
  formData.set("weekdays", "1");
  formData.append("weekdays", "3");
  formData.set("startTime", "10:00");
  formData.set("endTime", "11:00");
  formData.set("timezone", "Africa/Nairobi");
  formData.set("teacherId", "teacher-1");
  formData.set("subjectId", "subject-math");
  formData.set("liveLessonUrl", "https://meet.google.com/abc-defg-hij");
  formData.set("meetingProvider", "GOOGLE_MEET");

  for (const [key, value] of Object.entries(overrides ?? {})) {
    formData.delete(key);
    if (value !== null) {
      formData.set(key, value);
    }
  }

  return formData;
}

function lessonRecord(overrides?: Record<string, unknown>) {
  return {
    id: "lesson-1",
    classGroupId: "group-1",
    title: "Quadratic functions",
    description: "Live problem-solving session",
    startAt: new Date("2026-06-01T07:00:00.000Z"),
    endAt: new Date("2026-06-01T08:00:00.000Z"),
    timezone: "Africa/Nairobi",
    status: "SCHEDULED",
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
    meetingProvider: "GOOGLE_MEET",
    teacherId: "teacher-1",
    subjectId: "subject-math",
    cancelledAt: null,
    cancelReason: null,
    rescheduledFromId: null,
    ...overrides,
  };
}

function auditPayloadFor(action: string) {
  return createAdminAuditLogMock.mock.calls.find(([payload]) => payload?.action === action)?.[0];
}

function expectLessonRevalidation(classGroupId = "group-1", lessonId = "lesson-1") {
  expect(revalidatePathMock).toHaveBeenCalledWith("/admin/classes");
  expect(revalidatePathMock).toHaveBeenCalledWith(`/admin/classes/${classGroupId}`);
  expect(revalidatePathMock).toHaveBeenCalledWith(`/admin/lessons/${lessonId}`);
  expect(revalidatePathMock).toHaveBeenCalledWith(`/admin/lessons/${lessonId}/edit`);
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/schedule");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/parent");
}

function expectLessonAudit(action: string, targetId = "lesson-1") {
  const expectsNullBefore = action === "LESSON_CREATED" || action === "LESSON_BULK_CREATED";
  expect(auditPayloadFor(action)).toEqual(
    expect.objectContaining({
      adminUserId: "admin-1",
      action,
      targetType: "lesson",
      targetId,
      before: expectsNullBefore ? null : expect.anything(),
      after: expect.anything(),
      meta: expect.objectContaining({
        classGroupId: "group-1",
        teacherId: "teacher-1",
        status: expect.any(String),
        startAt: expect.any(Date),
        endAt: expect.any(Date),
      }),
    }),
  );
}

function expectClassGroupLessonAudit(action: string, lessonId = "lesson-1") {
  expect(auditPayloadFor(action)).toEqual(
    expect.objectContaining({
      adminUserId: "admin-1",
      action,
      targetType: "class_group",
      targetId: "group-1",
      meta: expect.objectContaining({
        actorRole: UserRole.ADMIN,
        classGroupId: "group-1",
        lessonId,
      }),
    }),
  );
}

describe("Admin lesson actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
    getLessonByIdMock.mockResolvedValue(lessonRecord());
    checkTeacherAvailabilityMock.mockResolvedValue({ available: true });
    isGoogleCalendarEnabledMock.mockReturnValue(false);
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof transactionClientMock) => unknown) =>
        callback(transactionClientMock),
    );
  });

  it("requires ADMIN before every lesson mutation", async () => {
    const actions = await loadLessonActions();

    for (const action of [
      actions.createLessonAction,
      actions.updateLessonAction,
      actions.rescheduleLessonAction,
      actions.cancelLessonAction,
      actions.completeLessonAction,
      actions.deleteLessonAction,
      actions.createRecurringLessonsAction,
    ]) {
      vi.clearAllMocks();
      requireRoleMock.mockRejectedValueOnce(new Error("Unauthorized"));

      const result = await action(lessonForm());

      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/unauthorized|failed/i),
        }),
      );
    }

    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(createLessonMock).not.toHaveBeenCalled();
    expect(updateLessonMock).not.toHaveBeenCalled();
    expect(rescheduleLessonMock).not.toHaveBeenCalled();
    expect(cancelLessonMock).not.toHaveBeenCalled();
    expect(completeLessonMock).not.toHaveBeenCalled();
    expect(deleteLessonMock).not.toHaveBeenCalled();
    expect(createRecurringLessonsMock).not.toHaveBeenCalled();
  });

  it("rethrows auth redirects instead of converting them to action errors", async () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/portal/login;307;",
    });
    requireRoleMock.mockRejectedValueOnce(redirectError);

    const { createLessonAction } = await loadLessonActions();

    await expect(createLessonAction(lessonForm())).rejects.toBe(redirectError);
    expect(createLessonMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it.each([
    { field: "title", value: "", errorKey: "title", pattern: /required/i },
    { field: "classGroupId", value: "", errorKey: "classGroupId", pattern: /required/i },
    { field: "startAt", value: "not-a-date", errorKey: "startAt", pattern: /date|valid/i },
    { field: "endAt", value: "not-a-date", errorKey: "endAt", pattern: /date|valid/i },
    {
      field: "endAt",
      value: "2026-06-01T09:00",
      errorKey: "endAt",
      pattern: /after|start.*before/i,
    },
    {
      field: "liveLessonUrl",
      value: "https://zoom.us/j/123",
      errorKey: "liveLessonUrl",
      pattern: /google meet|meet\.google\.com/i,
    },
  ])(
    "returns create validation errors for invalid $field",
    async ({ field, value, errorKey, pattern }) => {
      const { createLessonAction } = await loadLessonActions();

      const result = await createLessonAction(lessonForm({ [field]: value }));

      expect(result).toEqual({
        success: false,
        errors: {
          [errorKey]: expect.arrayContaining([expect.stringMatching(pattern)]),
        },
      });
      expect(createLessonMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    },
  );

  it("blocks unavailable-period conflicts before Google Meet auto-create or lesson mutation", async () => {
    isGoogleCalendarEnabledMock.mockReturnValue(true);
    checkTeacherAvailabilityMock.mockResolvedValueOnce({
      available: false,
      reason: "UNAVAILABLE_PERIOD",
    });

    const { createLessonAction } = await loadLessonActions();
    const result = await createLessonAction(lessonForm({ liveLessonUrl: "" }));

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message:
          "Teacher is not available at this time. The lesson overlaps an unavailable period.",
      }),
    );
    expect(checkTeacherAvailabilityMock).toHaveBeenCalledWith(
      {
        teacherId: "teacher-1",
        startAt: new Date("2026-06-01T07:00:00.000Z"),
        endAt: new Date("2026-06-01T08:00:00.000Z"),
      },
      transactionClientMock,
    );
    expect(createGoogleMeetEventForLessonMock).not.toHaveBeenCalled();
    expect(createLessonMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each([
    { field: "title", value: "", errorKey: "title", pattern: /required/i },
    { field: "classGroupId", value: "", errorKey: "classGroupId", pattern: /required/i },
    {
      field: "endAt",
      value: "2026-06-01T09:00",
      errorKey: "endAt",
      pattern: /after|start.*before/i,
    },
    {
      field: "liveLessonUrl",
      value: "https://example.com/not-google-meet",
      errorKey: "liveLessonUrl",
      pattern: /google meet|meet\.google\.com/i,
    },
  ])(
    "returns update validation errors for invalid $field",
    async ({ field, value, errorKey, pattern }) => {
      const { updateLessonAction } = await loadLessonActions();

      const result = await updateLessonAction(lessonForm({ [field]: value }));

      expect(result).toEqual({
        success: false,
        errors: {
          [errorKey]: expect.arrayContaining([expect.stringMatching(pattern)]),
        },
      });
      expect(updateLessonMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["invalid teacher role", "Selected teacher must be an existing teacher account."],
    ["inactive class group", "Class group must be ACTIVE before lessons can be scheduled."],
  ])("surfaces create validation from repository for %s without audit", async (_label, message) => {
    createLessonMock.mockRejectedValueOnce(new Error(message));

    const { createLessonAction } = await loadLessonActions();
    const result = await createLessonAction(lessonForm());

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/teacher|active class group|class group.*active/i),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("creates a lesson with transaction-safe lesson and class-group audits", async () => {
    createLessonMock.mockResolvedValueOnce(lessonRecord());

    const { createLessonAction } = await loadLessonActions();
    const result = await createLessonAction(lessonForm());

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(createLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        classGroupId: "group-1",
        title: "Quadratic functions",
        teacherId: "teacher-1",
        liveLessonUrl: "https://meet.google.com/abc-defg-hij",
        meetingProvider: "GOOGLE_MEET",
      }),
      transactionClientMock,
    );
    expect(checkTeacherAvailabilityMock).toHaveBeenCalledWith(
      {
        teacherId: "teacher-1",
        startAt: new Date("2026-06-01T07:00:00.000Z"),
        endAt: new Date("2026-06-01T08:00:00.000Z"),
      },
      transactionClientMock,
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith(expect.any(Object), transactionClientMock);
    expectLessonAudit("LESSON_CREATED");
    expectClassGroupLessonAudit("CLASS_GROUP_LESSON_CREATED");
    expect(auditPayloadFor("LESSON_CREATED")).toEqual(
      expect.objectContaining({
        before: null,
        after: expect.objectContaining({ id: "lesson-1", title: "Quadratic functions" }),
      }),
    );
    expect(auditPayloadFor("CLASS_GROUP_LESSON_CREATED")).toEqual(
      expect.objectContaining({
        before: null,
        after: expect.objectContaining({ id: "lesson-1", classGroupId: "group-1" }),
      }),
    );
    expectLessonRevalidation();
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/lesson.*created/i),
      }),
    );
  });

  it("converts Africa/Nairobi datetime-local values to UTC before availability and persistence", async () => {
    const formData = lessonForm({
      startAt: "2026-01-20T10:00",
      endAt: "2026-01-20T11:00",
    });
    createLessonMock.mockResolvedValueOnce(
      lessonRecord({
        startAt: new Date("2026-01-20T07:00:00.000Z"),
        endAt: new Date("2026-01-20T08:00:00.000Z"),
      }),
    );

    const { createLessonAction } = await loadLessonActions();
    const result = await createLessonAction(formData);

    const expectedStartAt = new Date("2026-01-20T07:00:00.000Z");
    const expectedEndAt = new Date("2026-01-20T08:00:00.000Z");
    expect(checkTeacherAvailabilityMock).toHaveBeenCalledWith(
      {
        teacherId: "teacher-1",
        startAt: expectedStartAt,
        endAt: expectedEndAt,
      },
      transactionClientMock,
    );
    expect(createLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: expectedStartAt,
        endAt: expectedEndAt,
        timezone: "Africa/Nairobi",
      }),
      transactionClientMock,
    );
    expect(result.success).toBe(true);
  });

  it.each([
    ["absolute Z timestamp", "2026-01-20T10:00:00Z"],
    ["offset timestamp", "2026-01-20T10:00:00+03:00"],
    ["impossible date", "2026-02-30T10:00"],
    ["rollover hour", "2026-01-20T25:00"],
  ])("rejects tampered datetime-local %s before opening a transaction", async (_label, startAt) => {
    const { createLessonAction } = await loadLessonActions();

    const result = await createLessonAction(lessonForm({ startAt }));

    expect(result).toEqual({
      success: false,
      errors: {
        startAt: expect.arrayContaining([expect.stringMatching(/date|valid/i)]),
      },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(createLessonMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it.each([
    ["OUTSIDE_AVAILABILITY", /not available|outside availability/i],
    ["UNAVAILABLE_PERIOD", /not available|unavailable period/i],
    ["ALREADY_BOOKED", /not available|already booked|overlapping/i],
  ])(
    "rejects create when teacher availability returns %s without mutation or audit",
    async (reason, messagePattern) => {
      checkTeacherAvailabilityMock.mockResolvedValueOnce({ available: false, reason });

      const { createLessonAction } = await loadLessonActions();
      const result = await createLessonAction(lessonForm());

      expect(checkTeacherAvailabilityMock).toHaveBeenCalledWith(
        {
          teacherId: "teacher-1",
          startAt: new Date("2026-06-01T07:00:00.000Z"),
          endAt: new Date("2026-06-01T08:00:00.000Z"),
        },
        transactionClientMock,
      );
      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(messagePattern),
        }),
      );
      expect(createLessonMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    },
  );

  it("updates a lesson with meaningful before/after audit and meeting-link audit when URL changes", async () => {
    updateLessonMock.mockResolvedValueOnce({
      ...lessonRecord({ liveLessonUrl: "https://meet.google.com/new-code" }),
      before: lessonRecord({
        title: "Old lesson",
        liveLessonUrl: "https://meet.google.com/old-code",
      }),
      after: lessonRecord({
        title: "Updated lesson",
        liveLessonUrl: "https://meet.google.com/new-code",
      }),
    });

    const { updateLessonAction } = await loadLessonActions();
    const result = await updateLessonAction(
      lessonForm({ title: "Updated lesson", liveLessonUrl: "https://meet.google.com/new-code" }),
    );

    expect(checkTeacherAvailabilityMock).toHaveBeenCalledWith(
      {
        teacherId: "teacher-1",
        startAt: new Date("2026-06-01T07:00:00.000Z"),
        endAt: new Date("2026-06-01T08:00:00.000Z"),
        excludeLessonId: "lesson-1",
      },
      transactionClientMock,
    );
    expect(updateLessonMock).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({
        title: "Updated lesson",
        liveLessonUrl: "https://meet.google.com/new-code",
      }),
      transactionClientMock,
    );
    expectLessonAudit("LESSON_UPDATED");
    expectClassGroupLessonAudit("CLASS_GROUP_LESSON_UPDATED");
    expect(auditPayloadFor("LESSON_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ id: "lesson-1", title: "Old lesson" }),
        after: expect.objectContaining({ id: "lesson-1", title: "Updated lesson" }),
      }),
    );
    expect(auditPayloadFor("CLASS_GROUP_LESSON_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ id: "lesson-1", title: "Old lesson" }),
        after: expect.objectContaining({ id: "lesson-1", title: "Updated lesson" }),
      }),
    );
    expect(auditPayloadFor("LESSON_UPDATED")?.before).not.toEqual({ id: "lesson-1" });
    expectLessonAudit("LESSON_MEETING_LINK_UPDATED");
    expect(auditPayloadFor("LESSON_MEETING_LINK_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ liveLessonUrl: "https://meet.google.com/old-code" }),
        after: expect.objectContaining({ liveLessonUrl: "https://meet.google.com/new-code" }),
      }),
    );
    expectLessonRevalidation();
    expect(result.success).toBe(true);
  });

  it("passes the validated timezone when update intent reschedules a lesson", async () => {
    const formData = lessonForm({
      startAt: "2026-01-20T10:00",
      endAt: "2026-01-20T11:00",
      timezone: "Asia/Tokyo",
    });
    formData.set("intent", "reschedule");
    rescheduleLessonMock.mockResolvedValueOnce({
      ...lessonRecord({ status: "RESCHEDULED", timezone: "Asia/Tokyo" }),
      before: lessonRecord(),
      after: lessonRecord({ status: "RESCHEDULED", timezone: "Asia/Tokyo" }),
    });

    const { updateLessonAction } = await loadLessonActions();
    const result = await updateLessonAction(formData);

    expect(rescheduleLessonMock).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({
        startAt: new Date("2026-01-20T01:00:00.000Z"),
        endAt: new Date("2026-01-20T02:00:00.000Z"),
        timezone: "Asia/Tokyo",
      }),
      transactionClientMock,
    );
    expect(result.success).toBe(true);
  });

  it("reschedules a lesson, writes LESSON_RESCHEDULED audit, and revalidates lesson routes", async () => {
    const newStart = new Date("2026-01-20T01:00:00.000Z");
    const newEnd = new Date("2026-01-20T02:00:00.000Z");
    rescheduleLessonMock.mockResolvedValueOnce({
      ...lessonRecord({
        startAt: newStart,
        endAt: newEnd,
        status: "RESCHEDULED",
        rescheduledFromId: "lesson-1",
      }),
      before: lessonRecord(),
      after: lessonRecord({
        startAt: newStart,
        endAt: newEnd,
        status: "RESCHEDULED",
        rescheduledFromId: "lesson-1",
      }),
    });

    const { rescheduleLessonAction } = await loadLessonActions();
    const result = await rescheduleLessonAction(
      lessonForm({
        startAt: "2026-01-20T10:00",
        endAt: "2026-01-20T11:00",
        timezone: "Asia/Tokyo",
      }),
    );

    expect(checkTeacherAvailabilityMock).toHaveBeenCalledWith(
      {
        teacherId: "teacher-1",
        startAt: newStart,
        endAt: newEnd,
        excludeLessonId: "lesson-1",
      },
      transactionClientMock,
    );
    expect(rescheduleLessonMock).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({
        startAt: newStart,
        endAt: newEnd,
        timezone: "Asia/Tokyo",
      }),
      transactionClientMock,
    );
    expectLessonAudit("LESSON_RESCHEDULED");
    expectClassGroupLessonAudit("CLASS_GROUP_LESSON_UPDATED");
    expect(auditPayloadFor("LESSON_RESCHEDULED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({
          status: "SCHEDULED",
          startAt: new Date("2026-06-01T07:00:00.000Z"),
          endAt: new Date("2026-06-01T08:00:00.000Z"),
        }),
        after: expect.objectContaining({
          status: "RESCHEDULED",
          rescheduledFromId: "lesson-1",
          startAt: newStart,
          endAt: newEnd,
        }),
      }),
    );
    expect(auditPayloadFor("CLASS_GROUP_LESSON_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ id: "lesson-1", status: "SCHEDULED" }),
        after: expect.objectContaining({
          id: "lesson-1",
          status: "RESCHEDULED",
          startAt: newStart,
          endAt: newEnd,
        }),
      }),
    );
    expectLessonRevalidation();
    expect(result.success).toBe(true);
  });

  it.each([
    ["updateLessonAction", "update"],
    ["rescheduleLessonAction", "reschedule"],
  ] as const)(
    "%s rejects teacher availability failure before lesson mutation or audit",
    async (actionName) => {
      checkTeacherAvailabilityMock.mockResolvedValueOnce({
        available: false,
        reason: "ALREADY_BOOKED",
      });

      const actions = await loadLessonActions();
      const result = await actions[actionName](lessonForm());

      expect(checkTeacherAvailabilityMock).toHaveBeenCalledWith(
        expect.objectContaining({
          teacherId: "teacher-1",
          excludeLessonId: "lesson-1",
        }),
        transactionClientMock,
      );
      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/not available|already booked|overlapping/i),
        }),
      );
      expect(updateLessonMock).not.toHaveBeenCalled();
      expect(rescheduleLessonMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["createLessonAction", "direct teacher overlap", "ALREADY_BOOKED"],
    ["createLessonAction", "class group teacher overlap", "ALREADY_BOOKED"],
    ["createLessonAction", "unavailable period", "UNAVAILABLE_PERIOD"],
    ["rescheduleLessonAction", "direct teacher overlap", "ALREADY_BOOKED"],
    ["rescheduleLessonAction", "class group teacher overlap", "ALREADY_BOOKED"],
    ["rescheduleLessonAction", "unavailable period", "UNAVAILABLE_PERIOD"],
    ["rescheduleLessonAction", "outside weekly availability", "OUTSIDE_AVAILABILITY"],
  ] as const)(
    "%s blocks %s from the availability engine without mutation, audit, or revalidation",
    async (actionName, _label, reason) => {
      checkTeacherAvailabilityMock.mockResolvedValueOnce({ available: false, reason });

      const actions = await loadLessonActions();
      const result = await actions[actionName](lessonForm());

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/not available|outside|unavailable period|booked/i),
        }),
      );
      if (actionName === "rescheduleLessonAction") {
        expect(checkTeacherAvailabilityMock).toHaveBeenCalledWith(
          expect.objectContaining({ excludeLessonId: "lesson-1" }),
          transactionClientMock,
        );
      }
      expect(createLessonMock).not.toHaveBeenCalled();
      expect(updateLessonMock).not.toHaveBeenCalled();
      expect(rescheduleLessonMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
      expect(auditPayloadFor("TEACHER_AVAILABILITY_CONFLICT_BLOCKED")).toBeUndefined();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    },
  );

  it("requires cancel reason before calling repository", async () => {
    const { cancelLessonAction } = await loadLessonActions();

    const result = await cancelLessonAction(lessonForm({ cancelReason: "" }));

    expect(result).toEqual({
      success: false,
      errors: {
        cancelReason: expect.arrayContaining([expect.stringMatching(/reason|required/i)]),
      },
    });
    expect(cancelLessonMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("cancels a lesson with LESSON_CANCELLED audit", async () => {
    cancelLessonMock.mockResolvedValueOnce({
      ...lessonRecord({ status: "CANCELLED", cancelReason: "Teacher unavailable" }),
      before: lessonRecord(),
      after: lessonRecord({ status: "CANCELLED", cancelReason: "Teacher unavailable" }),
    });

    const { cancelLessonAction } = await loadLessonActions();
    const result = await cancelLessonAction(lessonForm({ cancelReason: "Teacher unavailable" }));

    expect(cancelLessonMock).toHaveBeenCalledWith(
      "lesson-1",
      "Teacher unavailable",
      transactionClientMock,
    );
    expectLessonAudit("LESSON_CANCELLED");
    expect(auditPayloadFor("LESSON_CANCELLED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ status: "SCHEDULED" }),
        after: expect.objectContaining({
          status: "CANCELLED",
          cancelReason: "Teacher unavailable",
        }),
      }),
    );
    expectLessonRevalidation();
    expect(result.success).toBe(true);
  });

  it("completes a lesson with LESSON_COMPLETED audit", async () => {
    const completedAt = new Date("2026-06-01T11:05:00.000Z");
    completeLessonMock.mockResolvedValueOnce({
      ...lessonRecord({ status: "COMPLETED", completedAt }),
      before: lessonRecord({ status: "LIVE" }),
      after: lessonRecord({ status: "COMPLETED", completedAt }),
    });

    const { completeLessonAction } = await loadLessonActions();
    const result = await completeLessonAction(lessonForm());

    expect(completeLessonMock).toHaveBeenCalledWith("lesson-1", transactionClientMock);
    expectLessonAudit("LESSON_COMPLETED");
    expect(auditPayloadFor("LESSON_COMPLETED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ status: "LIVE" }),
        after: expect.objectContaining({ status: "COMPLETED", completedAt }),
      }),
    );
    expectLessonRevalidation();
    expect(result.success).toBe(true);
  });

  it.each([
    {
      actionName: "rescheduleLessonAction" as const,
      repositoryMock: rescheduleLessonMock,
      formData: lessonForm({ startAt: "2026-06-08T10:00", endAt: "2026-06-08T11:00" }),
    },
    {
      actionName: "cancelLessonAction" as const,
      repositoryMock: cancelLessonMock,
      formData: lessonForm({ cancelReason: "Already completed" }),
    },
    {
      actionName: "completeLessonAction" as const,
      repositoryMock: completeLessonMock,
      formData: lessonForm(),
    },
  ])(
    "$actionName surfaces invalid status transitions without audit or revalidation",
    async ({ actionName, repositoryMock, formData }) => {
      repositoryMock.mockRejectedValueOnce(new Error("Invalid lesson status transition."));

      const actions = await loadLessonActions();
      const result = await actions[actionName](formData);

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/invalid lesson status transition/i),
        }),
      );
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    },
  );

  it("blocks delete with dependencies and does not audit", async () => {
    deleteLessonMock.mockRejectedValueOnce(
      new Error("Lesson has dependencies and cannot be deleted safely."),
    );

    const { deleteLessonAction } = await loadLessonActions();
    const result = await deleteLessonAction(lessonForm());

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/dependencies|cannot be deleted/i),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("deletes a dependency-free lesson with LESSON_DELETED audit", async () => {
    deleteLessonMock.mockResolvedValueOnce(lessonRecord());

    const { deleteLessonAction } = await loadLessonActions();
    const result = await deleteLessonAction(lessonForm());

    expect(deleteLessonMock).toHaveBeenCalledWith("lesson-1", transactionClientMock);
    expectLessonAudit("LESSON_DELETED");
    expectClassGroupLessonAudit("CLASS_GROUP_LESSON_DELETED");
    expect(auditPayloadFor("LESSON_DELETED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ id: "lesson-1" }),
        after: expect.objectContaining({ deleted: true }),
      }),
    );
    expect(auditPayloadFor("CLASS_GROUP_LESSON_DELETED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ id: "lesson-1", classGroupId: "group-1" }),
        after: expect.objectContaining({ deleted: true }),
      }),
    );
    expectLessonRevalidation();
    expect(result.success).toBe(true);
  });

  it.each([
    { field: "weekdays", value: null, errorKey: "weekdays", pattern: /weekday|required/i },
    { field: "endDate", value: "2026-05-01", errorKey: "endDate", pattern: /after|range/i },
    { field: "endTime", value: "09:00", errorKey: "endTime", pattern: /duration|after/i },
    {
      field: "timezone",
      value: "Invalid/Timezone",
      errorKey: "timezone",
      pattern: /timezone|valid/i,
    },
  ])(
    "validates recurring lesson generation for invalid $field",
    async ({ field, value, errorKey, pattern }) => {
      const { createRecurringLessonsAction } = await loadLessonActions();

      const result = await createRecurringLessonsAction(recurringForm({ [field]: value }));

      expect(result).toEqual({
        success: false,
        errors: {
          [errorKey]: expect.arrayContaining([expect.stringMatching(pattern)]),
        },
      });
      expect(createRecurringLessonsMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    },
  );

  it("normalizes a blank recurring timezone before persistence", async () => {
    createRecurringLessonsMock.mockResolvedValueOnce({
      createdCount: 1,
      skippedCount: 0,
      created: [lessonRecord()],
    });

    const { createRecurringLessonsAction } = await loadLessonActions();
    const result = await createRecurringLessonsAction(recurringForm({ timezone: "" }));

    expect(createRecurringLessonsMock).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "Africa/Nairobi" }),
      transactionClientMock,
    );
    expect(result.success).toBe(true);
  });

  it("creates recurring lessons, skips duplicate dates, and writes LESSON_BULK_CREATED audit", async () => {
    createRecurringLessonsMock.mockResolvedValueOnce({
      createdCount: 2,
      skippedCount: 1,
      created: [
        lessonRecord({ id: "lesson-1", startAt: new Date("2026-06-01T07:00:00.000Z") }),
        lessonRecord({ id: "lesson-2", startAt: new Date("2026-06-08T07:00:00.000Z") }),
      ],
    });

    const { createRecurringLessonsAction } = await loadLessonActions();
    const result = await createRecurringLessonsAction(recurringForm());

    expect(createRecurringLessonsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        classGroupId: "group-1",
        weekdays: [1, 3],
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        endDate: new Date("2026-06-30T00:00:00.000Z"),
        startTime: "10:00",
        endTime: "11:00",
      }),
      transactionClientMock,
    );
    expectLessonAudit("LESSON_BULK_CREATED", "lesson-1");
    expect(auditPayloadFor("LESSON_BULK_CREATED")).toEqual(
      expect.objectContaining({
        before: null,
        after: expect.objectContaining({
          createdCount: 2,
          skippedCount: 1,
          createdLessonIds: ["lesson-1", "lesson-2"],
        }),
      }),
    );
    expectLessonRevalidation("group-1", "lesson-1");
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/2.*created.*1.*skipped|recurring lessons created/i),
      }),
    );
  });

  it("returns a clean weekly availability message when recurring lesson generation is blocked", async () => {
    createRecurringLessonsMock.mockRejectedValueOnce(
      new Error(
        "Teacher is not available at this time. The lesson is outside weekly availability.",
      ),
    );

    const { createRecurringLessonsAction } = await loadLessonActions();
    const result = await createRecurringLessonsAction(recurringForm());

    expect(result).toEqual({
      success: false,
      message: "Teacher is not available at this time. The lesson is outside weekly availability.",
    });
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not write audit or revalidate on mutation failure", async () => {
    updateLessonMock.mockRejectedValueOnce(new Error("Database unavailable"));

    const { updateLessonAction } = await loadLessonActions();
    const result = await updateLessonAction(lessonForm());

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/database unavailable|failed/i),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
