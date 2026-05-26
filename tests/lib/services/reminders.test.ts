import { ReminderChannel } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listUpcomingClassesForRemindersMock = vi.hoisted(() => vi.fn());
const listMissingAssignmentsForRemindersMock = vi.hoisted(() => vi.fn());
const createReminderLogMock = vi.hoisted(() => vi.fn());
const createAssignmentReminderLogMock = vi.hoisted(() => vi.fn());
const createInAppNotificationMock = vi.hoisted(() => vi.fn());
const listNotificationPreferencesByUserIdsMock = vi.hoisted(() => vi.fn());
const getUsersByIdsMock = vi.hoisted(() => vi.fn());
const sendClassReminderEmailMock = vi.hoisted(() => vi.fn());
const sendAssignmentReminderEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/schedule-repository", () => ({
  createReminderLog: createReminderLogMock,
  listUpcomingClassesForReminders: listUpcomingClassesForRemindersMock,
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  getUsersByIds: getUsersByIdsMock,
}));

vi.mock("@/lib/repositories/submission-repository", () => ({
  createAssignmentReminderLog: createAssignmentReminderLogMock,
  listMissingAssignmentsForReminders: listMissingAssignmentsForRemindersMock,
}));

vi.mock("@/lib/repositories/notification-repository", () => ({
  createInAppNotification: createInAppNotificationMock,
  listNotificationPreferencesByUserIds: listNotificationPreferencesByUserIdsMock,
}));

vi.mock("@/lib/services/email", () => ({
  sendAssignmentReminderEmail: sendAssignmentReminderEmailMock,
  sendClassReminderEmail: sendClassReminderEmailMock,
}));

type ReminderLogFixture = {
  recipientUserId: string;
  channel: ReminderChannel;
  status: "SENT" | "FAILED" | "SKIPPED";
  createdAt?: Date;
  reminderWindowStart?: Date;
  reminderWindowEnd?: Date;
};

function lessonFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "lesson-1",
    title: "Quadratic functions",
    startAt: new Date("2026-06-01T10:00:00.000Z"),
    endAt: new Date("2026-06-01T11:00:00.000Z"),
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
    meetingProvider: "GOOGLE_MEET",
    status: "SCHEDULED",
    reminderMinutesBefore: 60,
    teacherId: "teacher-direct",
    teacher: { id: "teacher-direct" },
    students: [{ id: "student-direct" }],
    classGroup: {
      id: "group-1",
      teacherId: "teacher-group",
      teacher: { id: "teacher-group" },
      students: [{ id: "student-group" }],
    },
    reminders: [] as ReminderLogFixture[],
    ...overrides,
  };
}

function userFixture(id: string) {
  return {
    id,
    email: `${id}@example.com`,
    fullName: id,
    phoneWhatsapp: null,
  };
}

function assignmentReminderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment-1",
    title: "Quadratic homework",
    dueDate: new Date("2026-05-31T20:00:00.000Z"),
    scheduledClass: {
      id: "lesson-1",
      title: "Quadratic functions",
    },
    recipients: [{ id: "student-direct" }, { id: "student-group" }],
    reminders: [] as ReminderLogFixture[],
    ...overrides,
  };
}

async function loadReminderService() {
  const specifier = "@/lib/services/reminders";
  return import(/* @vite-ignore */ specifier) as Promise<{
    processDueReminders: (options?: { dryRun?: boolean }) => Promise<{
      dryRun?: boolean;
      scannedClasses: number;
      scannedAssignments: number;
      sent: number;
      failed: number;
      skipped: number;
      wouldSend?: number;
    }>;
  }>;
}

describe("reminder lifecycle for scheduled lessons", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T09:00:00.000Z"));
    listMissingAssignmentsForRemindersMock.mockResolvedValue([]);
    sendClassReminderEmailMock.mockResolvedValue({ delivered: true });
    sendAssignmentReminderEmailMock.mockResolvedValue({ delivered: true });
    createReminderLogMock.mockResolvedValue({});
    createAssignmentReminderLogMock.mockResolvedValue({});
    createInAppNotificationMock.mockResolvedValue({});
    listNotificationPreferencesByUserIdsMock.mockResolvedValue(new Map());
    getUsersByIdsMock.mockImplementation((ids: string[]) => Promise.resolve(ids.map(userFixture)));
  });

  it("sends reminders only for upcoming SCHEDULED or LIVE lessons and skips cancelled/completed lessons", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([
      lessonFixture({ id: "scheduled-lesson", status: "SCHEDULED" }),
      lessonFixture({ id: "live-lesson", status: "LIVE" }),
      lessonFixture({
        id: "cancelled-lesson",
        status: "CANCELLED",
        reminders: [
          { recipientUserId: "student-direct", channel: ReminderChannel.EMAIL, status: "SENT" },
        ],
      }),
      lessonFixture({ id: "completed-lesson", status: "COMPLETED" }),
    ]);

    const { processDueReminders } = await loadReminderService();
    await processDueReminders();

    const loggedLessonIds = createReminderLogMock.mock.calls.map(
      ([payload]) => payload.scheduledClassId,
    );
    expect(loggedLessonIds).toContain("scheduled-lesson");
    expect(loggedLessonIds).toContain("live-lesson");
    expect(loggedLessonIds).not.toContain("cancelled-lesson");
    expect(loggedLessonIds).not.toContain("completed-lesson");
  });

  it("respects reminderMinutesBefore for each concrete lesson", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([
      lessonFixture({
        id: "due-lesson",
        startAt: new Date("2026-06-01T10:00:00.000Z"),
        reminderMinutesBefore: 60,
      }),
      lessonFixture({
        id: "not-yet-due-lesson",
        startAt: new Date("2026-06-01T10:00:00.000Z"),
        reminderMinutesBefore: 30,
      }),
    ]);

    const { processDueReminders } = await loadReminderService();
    await processDueReminders();

    const loggedLessonIds = createReminderLogMock.mock.calls.map(
      ([payload]) => payload.scheduledClassId,
    );
    expect(loggedLessonIds).toContain("due-lesson");
    expect(loggedLessonIds).not.toContain("not-yet-due-lesson");
  });

  it("links reminder logs to the concrete lesson id and includes direct/group recipients", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([lessonFixture()]);

    const { processDueReminders } = await loadReminderService();
    await processDueReminders();

    expect(getUsersByIdsMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        "teacher-direct",
        "teacher-group",
        "student-direct",
        "student-group",
      ]),
    );
    expect(createReminderLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledClassId: "lesson-1",
        recipientUserId: expect.stringMatching(/teacher-|student-/),
      }),
    );
  });

  it("does not create duplicate reminders for the same lesson, user, channel, and reminder window", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([
      lessonFixture({
        reminders: [
          {
            recipientUserId: "student-direct",
            channel: ReminderChannel.EMAIL,
            status: "SENT",
            reminderWindowStart: new Date("2026-06-01T09:00:00.000Z"),
            reminderWindowEnd: new Date("2026-06-01T10:00:00.000Z"),
          },
        ],
      }),
    ]);

    const { processDueReminders } = await loadReminderService();
    await processDueReminders();

    expect(createReminderLogMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledClassId: "lesson-1",
        recipientUserId: "student-direct",
        channel: "EMAIL",
      }),
    );
  });

  it("allows a reminder after reschedule when the existing sent log is outside the new reminder window", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([
      lessonFixture({
        id: "rescheduled-lesson",
        startAt: new Date("2026-06-01T10:00:00.000Z"),
        status: "RESCHEDULED",
        reminders: [
          {
            recipientUserId: "student-direct",
            channel: ReminderChannel.EMAIL,
            status: "SENT",
            reminderWindowStart: new Date("2026-05-31T09:00:00.000Z"),
            reminderWindowEnd: new Date("2026-05-31T10:00:00.000Z"),
          },
        ],
      }),
    ]);

    const { processDueReminders } = await loadReminderService();
    await processDueReminders();

    expect(createReminderLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledClassId: "rescheduled-lesson",
        recipientUserId: "student-direct",
        channel: "EMAIL",
      }),
    );
  });

  it("does not let legacy logs without reminder windows block a new rescheduled reminder", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([
      lessonFixture({
        id: "rescheduled-legacy-log-lesson",
        startAt: new Date("2026-06-01T10:00:00.000Z"),
        status: "RESCHEDULED",
        reminders: [
          {
            recipientUserId: "student-direct",
            channel: ReminderChannel.EMAIL,
            status: "SENT",
            reminderWindowStart: undefined,
            reminderWindowEnd: undefined,
          },
        ],
      }),
    ]);

    const { processDueReminders } = await loadReminderService();
    await processDueReminders();

    expect(createReminderLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledClassId: "rescheduled-legacy-log-lesson",
        recipientUserId: "student-direct",
        channel: "EMAIL",
        reminderWindowStart: new Date("2026-06-01T09:00:00.000Z"),
        reminderWindowEnd: new Date("2026-06-01T10:00:00.000Z"),
      }),
    );
  });

  it("includes the live meeting link in reminders only when provider and URL are valid", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([
      lessonFixture({
        id: "valid-google-meet",
        title: "Valid Google Meet lesson",
        liveLessonUrl: "https://meet.google.com/abc-defg-hij",
        meetingProvider: "GOOGLE_MEET",
      }),
      lessonFixture({
        id: "invalid-google-meet-domain",
        title: "Invalid Google Meet domain lesson",
        liveLessonUrl: "https://example.com/live/classroom",
        meetingProvider: "GOOGLE_MEET",
      }),
      lessonFixture({
        id: "valid-manual-url",
        title: "Valid manual URL lesson",
        liveLessonUrl: "https://example.com/live/classroom",
        meetingProvider: "MANUAL_URL",
      }),
      lessonFixture({
        id: "unsafe-manual-url",
        title: "Unsafe manual URL lesson",
        liveLessonUrl: "javascript:alert(1)",
        meetingProvider: "MANUAL_URL",
      }),
    ]);

    const { processDueReminders } = await loadReminderService();
    await processDueReminders();

    const linksByTitle = new Map(
      sendClassReminderEmailMock.mock.calls.map(([payload]) => [
        payload.classTitle,
        payload.liveLessonUrl,
      ]),
    );
    expect(linksByTitle.get("Valid Google Meet lesson")).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
    expect(linksByTitle.get("Invalid Google Meet domain lesson")).toBe(
      "Meeting link will be shared before the lesson",
    );
    expect(linksByTitle.get("Valid manual URL lesson")).toBe("https://example.com/live/classroom");
    expect(linksByTitle.get("Unsafe manual URL lesson")).toBe(
      "Meeting link will be shared before the lesson",
    );
    expect(
      sendClassReminderEmailMock.mock.calls.some(([payload]) =>
        String(payload.liveLessonUrl).includes("javascript:"),
      ),
    ).toBe(false);
  });

  it("sends assignment overdue reminders to enrolled students with missing submissions", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([]);
    listMissingAssignmentsForRemindersMock.mockResolvedValue([assignmentReminderFixture()]);

    const { processDueReminders } = await loadReminderService();
    const result = await processDueReminders();

    expect(result.scannedAssignments).toBe(1);
    expect(getUsersByIdsMock).toHaveBeenCalledWith(
      expect.arrayContaining(["student-direct", "student-group"]),
    );
    expect(sendAssignmentReminderEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentHref: expect.stringContaining("/portal/student/assignments/assignment-1"),
        assignmentTitle: "Quadratic homework",
        dueDate: new Date("2026-05-31T20:00:00.000Z"),
        recipientEmail: "student-direct@example.com",
      }),
    );
    expect(createAssignmentReminderLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: "assignment-1",
        recipientUserId: expect.stringMatching(/student-/),
        channel: "EMAIL",
        status: "SENT",
        reminderWindowStart: new Date("2026-06-01T00:00:00.000Z"),
        reminderWindowEnd: new Date("2026-06-01T23:59:59.999Z"),
      }),
    );
    expect(createInAppNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: expect.stringMatching(/student-/),
        title: "Overdue assignment reminder",
        type: "ASSIGNMENT_OVERDUE",
      }),
    );
  });

  it("supports dry-run mode without sending or writing reminder logs", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([lessonFixture()]);
    listMissingAssignmentsForRemindersMock.mockResolvedValue([assignmentReminderFixture()]);

    const { processDueReminders } = await loadReminderService();
    const result = await processDueReminders({ dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.wouldSend).toBeGreaterThan(0);
    expect(sendClassReminderEmailMock).not.toHaveBeenCalled();
    expect(sendAssignmentReminderEmailMock).not.toHaveBeenCalled();
    expect(createReminderLogMock).not.toHaveBeenCalled();
    expect(createAssignmentReminderLogMock).not.toHaveBeenCalled();
    expect(createInAppNotificationMock).not.toHaveBeenCalled();
  });

  it("respects reminder channel preferences while keeping in-app notifications", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([]);
    listMissingAssignmentsForRemindersMock.mockResolvedValue([assignmentReminderFixture()]);
    listNotificationPreferencesByUserIdsMock.mockResolvedValue(
      new Map([["student-direct", { emailEnabled: false, whatsappEnabled: false }]]),
    );

    const { processDueReminders } = await loadReminderService();
    await processDueReminders();

    expect(sendAssignmentReminderEmailMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "student-direct@example.com" }),
    );
    expect(createAssignmentReminderLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        details: "EMAIL_DISABLED_BY_PREFERENCE",
        recipientUserId: "student-direct",
        status: "SKIPPED",
      }),
    );
    expect(createInAppNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: "student-direct" }),
    );
  });

  it("does not send duplicate assignment reminders within the same daily reminder window", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([]);
    listMissingAssignmentsForRemindersMock.mockResolvedValue([
      assignmentReminderFixture({
        reminders: [
          {
            recipientUserId: "student-direct",
            channel: ReminderChannel.EMAIL,
            status: "SENT",
            reminderWindowStart: new Date("2026-06-01T00:00:00.000Z"),
            reminderWindowEnd: new Date("2026-06-01T23:59:59.999Z"),
          },
        ],
      }),
    ]);

    const { processDueReminders } = await loadReminderService();
    await processDueReminders();

    expect(sendAssignmentReminderEmailMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: "student-direct@example.com",
      }),
    );
    expect(createAssignmentReminderLogMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: "assignment-1",
        recipientUserId: "student-direct",
        channel: "EMAIL",
      }),
    );
  });
});
