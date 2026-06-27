import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const createLessonMock = vi.hoisted(() => vi.fn());
const updateLessonMock = vi.hoisted(() => vi.fn());
const updateLessonMeetingLinkMock = vi.hoisted(() => vi.fn());
const getLessonByIdMock = vi.hoisted(() => vi.fn());
const checkTeacherAvailabilityMock = vi.hoisted(() => vi.fn());
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
  createLesson: createLessonMock,
  getLessonById: getLessonByIdMock,
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

type MeetingProvider = "GOOGLE_MEET" | "MANUAL_URL";

type LessonActionsModule = {
  createLessonAction: (formData: FormData) => Promise<LessonActionResult>;
  updateLessonAction: (formData: FormData) => Promise<LessonActionResult>;
  updateLessonMeetingLinkAction: (formData: FormData) => Promise<LessonActionResult>;
};

async function loadLessonActions() {
  return import("@/app/(admin)/admin/lessons/actions") as Promise<LessonActionsModule>;
}

function lessonRecord(overrides?: Record<string, unknown>) {
  return {
    id: "lesson-1",
    classGroupId: "group-1",
    title: "Quadratic functions",
    description: "Live problem-solving session",
    startAt: new Date("2026-06-01T10:00:00.000Z"),
    endAt: new Date("2026-06-01T11:00:00.000Z"),
    timezone: "Africa/Nairobi",
    status: "SCHEDULED",
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
    meetingProvider: "GOOGLE_MEET",
    googleCalendarEventId: "calendar-event-1",
    googleMeetSpaceName: "spaces/abc-defg-hij",
    meetingUpdatedAt: new Date("2026-06-01T08:00:00.000Z"),
    teacherId: "teacher-1",
    subjectId: "subject-math",
    ...overrides,
  };
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

function meetingLinkForm(overrides?: Partial<Record<string, string | null>>) {
  const formData = new FormData();
  formData.set("lessonId", "lesson-1");
  formData.set("classGroupId", "group-1");
  formData.set("meetingProvider", "GOOGLE_MEET");
  formData.set("liveLessonUrl", " https://meet.google.com/new-code-room ");

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === null) {
      formData.delete(key);
    } else {
      formData.set(key, value);
    }
  }

  return formData;
}

function auditPayloadFor(action: string) {
  return createAdminAuditLogMock.mock.calls.find(([payload]) => payload?.action === action)?.[0];
}

function expectMeetingLinkRevalidation(classGroupId = "group-1", lessonId = "lesson-1") {
  expect(revalidatePathMock).toHaveBeenCalledWith(
    `/admin/classes/${classGroupId}/lessons/${lessonId}`,
  );
  expect(revalidatePathMock).toHaveBeenCalledWith(
    `/admin/classes/${classGroupId}/lessons/${lessonId}/edit`,
  );
  expect(revalidatePathMock).toHaveBeenCalledWith(`/admin/lessons/${lessonId}`);
  expect(revalidatePathMock).toHaveBeenCalledWith(`/admin/lessons/${lessonId}/edit`);
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/student/schedule");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/schedule");
  expect(revalidatePathMock).toHaveBeenCalledWith("/portal/schedule");
}

describe("Admin lesson meeting link actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
    checkTeacherAvailabilityMock.mockResolvedValue({ available: true });
    getLessonByIdMock.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof transactionClientMock) => unknown) =>
        callback(transactionClientMock),
    );
  });

  it("requires ADMIN before updating a lesson meeting link", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const { updateLessonMeetingLinkAction } = await loadLessonActions();
    const result = await updateLessonMeetingLinkAction(meetingLinkForm());

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/unauthorized|failed/i),
      }),
    );
    expect(updateLessonMeetingLinkMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("validates lesson id before persistence", async () => {
    const { updateLessonMeetingLinkAction } = await loadLessonActions();
    const cases = [
      meetingLinkForm({ lessonId: "" }),
      meetingLinkForm({ id: "lesson-1", lessonId: null }),
    ];

    for (const formData of cases) {
      const result = await updateLessonMeetingLinkAction(formData);
      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          errors: expect.objectContaining({
            lessonId: expect.arrayContaining([expect.stringMatching(/lesson id|required/i)]),
          }),
        }),
      );
    }
    expect(updateLessonMeetingLinkMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("accepts a Google Meet URL, normalizes it, persists meeting metadata, audits, and revalidates", async () => {
    const before = lessonRecord({
      liveLessonUrl: "https://meet.google.com/old-code",
      meetingProvider: "GOOGLE_MEET",
    });
    const after = lessonRecord({
      liveLessonUrl: "https://meet.google.com/new-code-room",
      meetingProvider: "GOOGLE_MEET",
      meetingUpdatedAt: new Date("2026-06-01T09:00:00.000Z"),
    });
    updateLessonMeetingLinkMock.mockResolvedValueOnce({
      ...after,
      before,
      after,
    });

    const { updateLessonMeetingLinkAction } = await loadLessonActions();
    const result = await updateLessonMeetingLinkAction(meetingLinkForm());

    expect(updateLessonMeetingLinkMock).toHaveBeenCalledWith(
      "lesson-1",
      {
        meetingProvider: "GOOGLE_MEET",
        liveLessonUrl: "https://meet.google.com/new-code-room",
        meetingUpdatedAt: expect.any(Date),
      },
      transactionClientMock,
    );
    expect(auditPayloadFor("LESSON_MEETING_LINK_UPDATED")).toEqual(
      expect.objectContaining({
        adminUserId: "admin-1",
        action: "LESSON_MEETING_LINK_UPDATED",
        targetType: "lesson",
        targetId: "lesson-1",
        before: expect.objectContaining({
          meetingProvider: "GOOGLE_MEET",
          liveLessonUrl: "https://meet.google.com/old-code",
          googleCalendarEventId: "calendar-event-1",
          googleMeetSpaceName: "spaces/abc-defg-hij",
          meetingUpdatedAt: expect.any(Date),
        }),
        after: expect.objectContaining({
          meetingProvider: "GOOGLE_MEET",
          liveLessonUrl: "https://meet.google.com/new-code-room",
          googleCalendarEventId: "calendar-event-1",
          googleMeetSpaceName: "spaces/abc-defg-hij",
          meetingUpdatedAt: expect.any(Date),
        }),
        meta: expect.objectContaining({
          teacherId: "teacher-1",
          classGroupId: "group-1",
        }),
      }),
    );
    expectMeetingLinkRevalidation();
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        message: expect.stringMatching(/meeting link|updated/i),
      }),
    );
  });

  it.each([
    ["GOOGLE_MEET", "https://zoom.us/j/123456789"],
    ["GOOGLE_MEET", "javascript:alert(1)"],
    ["GOOGLE_MEET", "data:text/html,<script>alert(1)</script>"],
    ["GOOGLE_MEET", "file:///tmp/lesson.html"],
    ["GOOGLE_MEET", "http://meet.google.com/abc-defg-hij"],
  ] as Array<[MeetingProvider, string]>)(
    "rejects unsafe or invalid %s meeting URL %s",
    async (meetingProvider, liveLessonUrl) => {
      const { updateLessonMeetingLinkAction } = await loadLessonActions();
      const result = await updateLessonMeetingLinkAction(
        meetingLinkForm({ meetingProvider, liveLessonUrl }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          errors: expect.objectContaining({
            liveLessonUrl: expect.arrayContaining([expect.stringMatching(/meet|https|safe|url/i)]),
          }),
        }),
      );
      expect(updateLessonMeetingLinkMock).not.toHaveBeenCalled();
      expect(createAdminAuditLogMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    },
  );

  it("accepts safe non-Meet HTTPS URLs for MANUAL_URL", async () => {
    const before = lessonRecord();
    const after = lessonRecord({
      meetingProvider: "MANUAL_URL",
      liveLessonUrl: "https://example.com/live/classroom",
    });
    updateLessonMeetingLinkMock.mockResolvedValueOnce({ ...after, before, after });

    const { updateLessonMeetingLinkAction } = await loadLessonActions();
    const result = await updateLessonMeetingLinkAction(
      meetingLinkForm({
        meetingProvider: "MANUAL_URL",
        liveLessonUrl: " https://example.com/live/classroom ",
      }),
    );

    expect(updateLessonMeetingLinkMock).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({
        meetingProvider: "MANUAL_URL",
        liveLessonUrl: "https://example.com/live/classroom",
      }),
      transactionClientMock,
    );
    expect(result.success).toBe(true);
  });

  it("allows clearing the URL while preserving an explicit provider", async () => {
    const before = lessonRecord();
    const after = lessonRecord({ liveLessonUrl: null, meetingProvider: "GOOGLE_MEET" });
    updateLessonMeetingLinkMock.mockResolvedValueOnce({ ...after, before, after });

    const { updateLessonMeetingLinkAction } = await loadLessonActions();
    const result = await updateLessonMeetingLinkAction(
      meetingLinkForm({ liveLessonUrl: "", meetingProvider: "GOOGLE_MEET" }),
    );

    expect(updateLessonMeetingLinkMock).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({
        meetingProvider: "GOOGLE_MEET",
        liveLessonUrl: null,
        meetingUpdatedAt: expect.any(Date),
      }),
      transactionClientMock,
    );
    expect(result.success).toBe(true);
  });

  it("does not audit or revalidate when meeting-link mutation fails", async () => {
    updateLessonMeetingLinkMock.mockRejectedValueOnce(new Error("Database unavailable"));

    const { updateLessonMeetingLinkAction } = await loadLessonActions();
    const result = await updateLessonMeetingLinkAction(meetingLinkForm());

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringMatching(/database unavailable|failed/i),
      }),
    );
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("createLessonAction validates Google Meet URLs and allows safe MANUAL_URL links", async () => {
    createLessonMock.mockResolvedValueOnce(
      lessonRecord({
        liveLessonUrl: "https://example.com/live/classroom",
        meetingProvider: "MANUAL_URL",
      }),
    );

    const { createLessonAction } = await loadLessonActions();
    const invalid = await createLessonAction(
      lessonForm({ meetingProvider: "GOOGLE_MEET", liveLessonUrl: "https://example.com/live" }),
    );
    const valid = await createLessonAction(
      lessonForm({
        meetingProvider: "MANUAL_URL",
        liveLessonUrl: "https://example.com/live/classroom",
      }),
    );

    expect(invalid).toEqual(
      expect.objectContaining({
        success: false,
        errors: expect.objectContaining({
          liveLessonUrl: expect.arrayContaining([expect.stringMatching(/meet\.google\.com/i)]),
        }),
      }),
    );
    expect(valid.success).toBe(true);
    expect(createLessonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingProvider: "MANUAL_URL",
        liveLessonUrl: "https://example.com/live/classroom",
      }),
      transactionClientMock,
    );
    expect(auditPayloadFor("LESSON_CREATED")).toEqual(
      expect.objectContaining({
        after: expect.objectContaining({
          meetingProvider: "MANUAL_URL",
          liveLessonUrl: "https://example.com/live/classroom",
          googleCalendarEventId: "calendar-event-1",
          googleMeetSpaceName: "spaces/abc-defg-hij",
          meetingUpdatedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("updateLessonAction validates Google Meet URLs and includes meeting fields in audit snapshots", async () => {
    const before = lessonRecord({
      liveLessonUrl: "https://meet.google.com/old-code",
      meetingProvider: "GOOGLE_MEET",
    });
    const after = lessonRecord({
      liveLessonUrl: "https://example.com/live/classroom",
      meetingProvider: "MANUAL_URL",
    });
    updateLessonMock.mockResolvedValueOnce({ ...after, before, after });

    const { updateLessonAction } = await loadLessonActions();
    const invalid = await updateLessonAction(
      lessonForm({ meetingProvider: "GOOGLE_MEET", liveLessonUrl: "https://example.com/live" }),
    );
    const valid = await updateLessonAction(
      lessonForm({
        meetingProvider: "MANUAL_URL",
        liveLessonUrl: "https://example.com/live/classroom",
      }),
    );

    expect(invalid).toEqual(
      expect.objectContaining({
        success: false,
        errors: expect.objectContaining({
          liveLessonUrl: expect.arrayContaining([expect.stringMatching(/meet\.google\.com/i)]),
        }),
      }),
    );
    expect(valid.success).toBe(true);
    expect(updateLessonMock).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({
        meetingProvider: "MANUAL_URL",
        liveLessonUrl: "https://example.com/live/classroom",
      }),
      transactionClientMock,
    );
    expect(auditPayloadFor("LESSON_UPDATED")).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({
          meetingProvider: "GOOGLE_MEET",
          liveLessonUrl: "https://meet.google.com/old-code",
          googleCalendarEventId: "calendar-event-1",
          googleMeetSpaceName: "spaces/abc-defg-hij",
          meetingUpdatedAt: expect.any(Date),
        }),
        after: expect.objectContaining({
          meetingProvider: "MANUAL_URL",
          liveLessonUrl: "https://example.com/live/classroom",
          googleCalendarEventId: "calendar-event-1",
          googleMeetSpaceName: "spaces/abc-defg-hij",
          meetingUpdatedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("keeps lesson URL validation centralized instead of relying on raw zod url checks", () => {
    const sourceFiles = [
      "app/(admin)/admin/actions/academic-actions.ts",
      "app/(admin)/admin/classes/actions.ts",
      "app/(admin)/admin/lessons/actions.ts",
      "components/admin/classes/LessonForm.tsx",
      "components/admin/classes/RecurringLessonsForm.tsx",
      "components/admin/classes/ScheduledClassForm.tsx",
    ];

    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");

      expect(source, file).not.toMatch(/liveLessonUrl[\s\S]{0,160}\.url\s*\(/);
      if (source.includes("liveLessonUrl") || source.includes("meetingProvider")) {
        expect(source, file).toMatch(/validateLiveLessonUrl|meetingProvider/);
      }
    }
  });
});
