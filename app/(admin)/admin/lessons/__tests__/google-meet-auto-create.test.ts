import { MeetingProvider, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const createLessonMock = vi.hoisted(() => vi.fn());
const updateLessonMock = vi.hoisted(() => vi.fn());
const rescheduleLessonMock = vi.hoisted(() => vi.fn());
const cancelLessonMock = vi.hoisted(() => vi.fn());
const completeLessonMock = vi.hoisted(() => vi.fn());
const deleteLessonMock = vi.hoisted(() => vi.fn());
const getLessonByIdMock = vi.hoisted(() => vi.fn());
const createRecurringLessonsMock = vi.hoisted(() => vi.fn());
const updateLessonMeetingLinkMock = vi.hoisted(() => vi.fn());
const checkTeacherAvailabilityMock = vi.hoisted(() => vi.fn());
const createGoogleMeetEventForLessonMock = vi.hoisted(() => vi.fn());
const updateGoogleMeetEventForLessonMock = vi.hoisted(() => vi.fn());
const deleteGoogleMeetEventForLessonMock = vi.hoisted(() => vi.fn());
const isGoogleCalendarEnabledMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/integrations/google-calendar", () => ({
  createGoogleMeetEventForLesson: createGoogleMeetEventForLessonMock,
  deleteGoogleMeetEventForLesson: deleteGoogleMeetEventForLessonMock,
  isGoogleCalendarEnabled: isGoogleCalendarEnabledMock,
  updateGoogleMeetEventForLesson: updateGoogleMeetEventForLessonMock,
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
  cancelLessonAction: (formData: FormData) => Promise<LessonActionResult>;
  createLessonAction: (formData: FormData) => Promise<LessonActionResult>;
  deleteLessonAction: (formData: FormData) => Promise<LessonActionResult>;
  rescheduleLessonAction: (formData: FormData) => Promise<LessonActionResult>;
  updateLessonAction: (formData: FormData) => Promise<LessonActionResult>;
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
  formData.set("meetingProvider", MeetingProvider.GOOGLE_MEET);
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

function lessonRecord(overrides?: Record<string, unknown>) {
  return {
    cancelReason: null,
    cancelledAt: null,
    classGroupId: "group-1",
    description: "Live problem-solving session",
    endAt: new Date("2026-06-01T11:00:00.000Z"),
    googleCalendarEventId: "calendar-event-1",
    googleMeetSpaceName: "spaces/abc-defg-hij",
    id: "lesson-1",
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
    meetingCreatedAt: new Date("2026-06-01T08:00:00.000Z"),
    meetingProvider: MeetingProvider.GOOGLE_MEET,
    meetingUpdatedAt: new Date("2026-06-01T08:00:00.000Z"),
    rescheduledFromId: null,
    startAt: new Date("2026-06-01T10:00:00.000Z"),
    status: "SCHEDULED",
    subjectId: "subject-math",
    teacherId: "teacher-1",
    timezone: "Africa/Nairobi",
    title: "Quadratic functions",
    ...overrides,
  };
}

function googleMeetResult(overrides?: Record<string, unknown>) {
  return {
    googleCalendarEventId: "calendar-event-1",
    googleMeetSpaceName: "spaces/abc-defg-hij",
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
    meetingCreatedAt: new Date("2026-06-01T08:00:00.000Z"),
    meetingProvider: MeetingProvider.GOOGLE_MEET,
    meetingUpdatedAt: new Date("2026-06-01T08:00:00.000Z"),
    ...overrides,
  };
}

function auditPayloadFor(action: string) {
  return createAdminAuditLogMock.mock.calls.find(([payload]) => payload?.action === action)?.[0];
}

function expectGoogleMeetAudit(
  action: string,
  targetId = "lesson-1",
  metaOverrides: Record<string, unknown> = {},
) {
  expect(auditPayloadFor(action)).toEqual(
    expect.objectContaining({
      action,
      adminUserId: "admin-1",
      meta: expect.objectContaining({
        classGroupId: "group-1",
        googleCalendarEventId: "calendar-event-1",
        liveLessonUrl: "https://meet.google.com/abc-defg-hij",
        meetingProvider: MeetingProvider.GOOGLE_MEET,
        teacherId: "teacher-1",
        ...metaOverrides,
      }),
      targetId,
      targetType: "lesson",
    }),
  );
}

describe("Admin lesson Google Meet auto-create actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ role: UserRole.ADMIN, uid: "admin-1" });
    getLessonByIdMock.mockResolvedValue(lessonRecord());
    checkTeacherAvailabilityMock.mockResolvedValue({ available: true });
    isGoogleCalendarEnabledMock.mockReturnValue(true);
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof transactionClientMock) => unknown) =>
        callback(transactionClientMock),
    );
  });

  it("auto-creates Google Meet for a GOOGLE_MEET lesson with no manual link and persists metadata", async () => {
    const createdWithoutMeeting = lessonRecord({
      googleCalendarEventId: null,
      googleMeetSpaceName: null,
      liveLessonUrl: null,
      meetingCreatedAt: null,
      meetingUpdatedAt: null,
    });
    createLessonMock.mockResolvedValueOnce(createdWithoutMeeting);
    createGoogleMeetEventForLessonMock.mockResolvedValueOnce(googleMeetResult());
    updateLessonMock.mockResolvedValueOnce({
      ...lessonRecord(),
      after: lessonRecord(),
      before: createdWithoutMeeting,
    });

    const { createLessonAction } = await loadLessonActions();
    const result = await createLessonAction(lessonForm({ liveLessonUrl: "" }));

    expect(createLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveLessonUrl: "",
        meetingProvider: MeetingProvider.GOOGLE_MEET,
      }),
      transactionClientMock,
    );
    expect(createGoogleMeetEventForLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        classGroupId: "group-1",
        description: "Live problem-solving session",
        endAt: new Date("2026-06-01T11:00:00.000Z"),
        lessonId: "lesson-1",
        startAt: new Date("2026-06-01T10:00:00.000Z"),
        timezone: "Africa/Nairobi",
        title: "Quadratic functions",
      }),
    );
    expect(updateLessonMock).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining(googleMeetResult()),
      transactionClientMock,
    );
    expectGoogleMeetAudit("LESSON_GOOGLE_MEET_CREATED");
    expect(revalidatePathMock).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("does not silently create a lesson when Google Meet auto-create fails", async () => {
    const createdWithoutMeeting = lessonRecord({
      googleCalendarEventId: null,
      googleMeetSpaceName: null,
      liveLessonUrl: null,
      meetingCreatedAt: null,
      meetingUpdatedAt: null,
    });
    createLessonMock.mockResolvedValueOnce(createdWithoutMeeting);
    createGoogleMeetEventForLessonMock.mockRejectedValueOnce(
      new Error("Google Calendar API unavailable"),
    );

    const { createLessonAction } = await loadLessonActions();
    const result = await createLessonAction(lessonForm({ liveLessonUrl: "" }));

    expect(createGoogleMeetEventForLessonMock).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/google|meet|calendar|unavailable|failed/i),
      }),
    );
    expect(updateLessonMock).not.toHaveBeenCalled();
    expect(auditPayloadFor("LESSON_CREATED")).toBeUndefined();
    expect(auditPayloadFor("LESSON_GOOGLE_MEET_CREATED")).toBeUndefined();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns a clear error when Google Calendar is disabled and no Meet URL was provided", async () => {
    isGoogleCalendarEnabledMock.mockReturnValue(false);

    const { createLessonAction } = await loadLessonActions();
    const result = await createLessonAction(lessonForm({ liveLessonUrl: "" }));

    expect(createGoogleMeetEventForLessonMock).not.toHaveBeenCalled();
    expect(createLessonMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/google calendar|meeting link|manual link|required/i),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("treats an admin-provided Google Meet URL as a manual override and does not call Google", async () => {
    createLessonMock.mockResolvedValueOnce(lessonRecord());

    const { createLessonAction } = await loadLessonActions();
    const result = await createLessonAction(lessonForm());

    expect(createGoogleMeetEventForLessonMock).not.toHaveBeenCalled();
    expect(createLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveLessonUrl: "https://meet.google.com/abc-defg-hij",
        meetingProvider: MeetingProvider.GOOGLE_MEET,
      }),
      transactionClientMock,
    );
    expect(auditPayloadFor("LESSON_CREATED")).toEqual(
      expect.objectContaining({ targetId: "lesson-1", targetType: "lesson" }),
    );
    expect(result.success).toBe(true);
  });

  it("keeps MANUAL_URL lessons on the manual validation path without calling Google", async () => {
    createLessonMock.mockResolvedValueOnce(
      lessonRecord({
        googleCalendarEventId: null,
        googleMeetSpaceName: null,
        liveLessonUrl: "https://classroom.example.com/live/lesson-1",
        meetingProvider: MeetingProvider.MANUAL_URL,
      }),
    );

    const { createLessonAction } = await loadLessonActions();
    const result = await createLessonAction(
      lessonForm({
        liveLessonUrl: "https://classroom.example.com/live/lesson-1",
        meetingProvider: MeetingProvider.MANUAL_URL,
      }),
    );

    expect(createGoogleMeetEventForLessonMock).not.toHaveBeenCalled();
    expect(createLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveLessonUrl: "https://classroom.example.com/live/lesson-1",
        meetingProvider: MeetingProvider.MANUAL_URL,
      }),
      transactionClientMock,
    );
    expect(result.success).toBe(true);
  });

  it("syncs Google Calendar metadata when updating a lesson with an existing calendar event", async () => {
    updateGoogleMeetEventForLessonMock.mockResolvedValueOnce(
      googleMeetResult({
        googleCalendarEventId: "calendar-event-1",
        googleMeetSpaceName: "spaces/updated-meet",
        liveLessonUrl: "https://meet.google.com/updated-room",
      }),
    );
    updateLessonMock.mockResolvedValueOnce({
      ...lessonRecord({
        googleMeetSpaceName: "spaces/updated-meet",
        liveLessonUrl: "https://meet.google.com/updated-room",
      }),
      after: lessonRecord({
        googleMeetSpaceName: "spaces/updated-meet",
        liveLessonUrl: "https://meet.google.com/updated-room",
      }),
      before: lessonRecord(),
    });

    const { updateLessonAction } = await loadLessonActions();
    const result = await updateLessonAction(lessonForm({ title: "Updated lesson" }));

    expect(updateGoogleMeetEventForLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        googleCalendarEventId: "calendar-event-1",
        lessonId: "lesson-1",
        title: "Updated lesson",
      }),
    );
    expect(updateLessonMock).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({
        googleCalendarEventId: "calendar-event-1",
        googleMeetSpaceName: "spaces/updated-meet",
        liveLessonUrl: "https://meet.google.com/updated-room",
      }),
      transactionClientMock,
    );
    expectGoogleMeetAudit("LESSON_GOOGLE_MEET_UPDATED", "lesson-1", {
      googleMeetSpaceName: "spaces/updated-meet",
      liveLessonUrl: "https://meet.google.com/updated-room",
    });
    expect(result.success).toBe(true);
  });

  it("surfaces Google update failures without reporting a successful lesson update", async () => {
    updateGoogleMeetEventForLessonMock.mockRejectedValueOnce(
      new Error("Google Calendar update failed"),
    );

    const { updateLessonAction } = await loadLessonActions();
    const result = await updateLessonAction(lessonForm({ title: "Updated lesson" }));

    expect(updateGoogleMeetEventForLessonMock).toHaveBeenCalled();
    expect(updateLessonMock).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/google|calendar|failed/i),
      }),
    );
    expect(auditPayloadFor("LESSON_UPDATED")).toBeUndefined();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("syncs Google Calendar metadata when rescheduling a lesson with an existing calendar event", async () => {
    const newStart = new Date("2026-06-08T10:00:00.000Z");
    const newEnd = new Date("2026-06-08T11:00:00.000Z");
    updateGoogleMeetEventForLessonMock.mockResolvedValueOnce(googleMeetResult());
    rescheduleLessonMock.mockResolvedValueOnce({
      ...lessonRecord({ endAt: newEnd, startAt: newStart, status: "RESCHEDULED" }),
      after: lessonRecord({ endAt: newEnd, startAt: newStart, status: "RESCHEDULED" }),
      before: lessonRecord(),
    });

    const { rescheduleLessonAction } = await loadLessonActions();
    const result = await rescheduleLessonAction(
      lessonForm({ endAt: "2026-06-08T11:00", startAt: "2026-06-08T10:00" }),
    );

    expect(updateGoogleMeetEventForLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endAt: newEnd,
        googleCalendarEventId: "calendar-event-1",
        lessonId: "lesson-1",
        startAt: newStart,
      }),
    );
    expect(rescheduleLessonMock).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({
        googleCalendarEventId: "calendar-event-1",
        googleMeetSpaceName: "spaces/abc-defg-hij",
        liveLessonUrl: "https://meet.google.com/abc-defg-hij",
      }),
      transactionClientMock,
    );
    expectGoogleMeetAudit("LESSON_GOOGLE_MEET_UPDATED");
    expect(result.success).toBe(true);
  });

  it("cancels the Google Calendar event when cancelling a lesson with calendar metadata", async () => {
    cancelLessonMock.mockResolvedValueOnce({
      ...lessonRecord({ cancelReason: "Teacher unavailable", status: "CANCELLED" }),
      after: lessonRecord({ cancelReason: "Teacher unavailable", status: "CANCELLED" }),
      before: lessonRecord(),
    });

    const { cancelLessonAction } = await loadLessonActions();
    const result = await cancelLessonAction(lessonForm({ cancelReason: "Teacher unavailable" }));

    expect(deleteGoogleMeetEventForLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        googleCalendarEventId: "calendar-event-1",
        lessonId: "lesson-1",
        mode: "cancel",
      }),
    );
    expectGoogleMeetAudit("LESSON_GOOGLE_MEET_DELETED");
    expect(result.success).toBe(true);
  });

  it("deletes the Google Calendar event when deleting a lesson with calendar metadata", async () => {
    getLessonByIdMock.mockResolvedValueOnce(lessonRecord());
    deleteLessonMock.mockResolvedValueOnce(lessonRecord());

    const { deleteLessonAction } = await loadLessonActions();
    const result = await deleteLessonAction(lessonForm());

    expect(deleteGoogleMeetEventForLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        googleCalendarEventId: "calendar-event-1",
        lessonId: "lesson-1",
        mode: "delete",
      }),
    );
    expectGoogleMeetAudit("LESSON_GOOGLE_MEET_DELETED");
    expect(result.success).toBe(true);
  });

  it("does not call Google delete when a lesson has no calendar event id", async () => {
    const lessonWithoutGoogleEvent = lessonRecord({
      googleCalendarEventId: null,
      googleMeetSpaceName: null,
    });
    getLessonByIdMock.mockResolvedValueOnce(lessonWithoutGoogleEvent);
    deleteLessonMock.mockResolvedValueOnce(lessonWithoutGoogleEvent);

    const { deleteLessonAction } = await loadLessonActions();
    const result = await deleteLessonAction(lessonForm());

    expect(deleteGoogleMeetEventForLessonMock).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
