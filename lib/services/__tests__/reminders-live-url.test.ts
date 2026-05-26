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
    status: "SCHEDULED",
    reminderMinutesBefore: 60,
    teacherId: "teacher-direct",
    students: [],
    classGroup: {
      id: "group-1",
      teacherId: null,
      students: [],
    },
    reminders: [] as ReminderLogFixture[],
    ...overrides,
  };
}

function userFixture(id = "teacher-direct", overrides: Record<string, unknown> = {}) {
  return {
    id,
    email: `${id}@example.com`,
    fullName: id,
    phoneWhatsapp: "+380501112233",
    ...overrides,
  };
}

async function loadReminderService() {
  const specifier = "@/lib/services/reminders";
  return import(/* @vite-ignore */ specifier) as Promise<{
    processDueReminders: () => Promise<{
      scannedClasses: number;
      sent: number;
      failed: number;
      skipped: number;
    }>;
  }>;
}

describe("reminder live lesson URL content safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T09:00:00.000Z"));
    vi.stubEnv("WHATSAPP_WEBHOOK_URL", "https://wa.example.test/send");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    listMissingAssignmentsForRemindersMock.mockResolvedValue([]);
    sendClassReminderEmailMock.mockResolvedValue({ delivered: true });
    sendAssignmentReminderEmailMock.mockResolvedValue({ delivered: true });
    createInAppNotificationMock.mockResolvedValue({});
    listNotificationPreferencesByUserIdsMock.mockResolvedValue(new Map());
    createReminderLogMock.mockResolvedValue({});
    createAssignmentReminderLogMock.mockResolvedValue({});
    getUsersByIdsMock.mockResolvedValue([userFixture()]);
  });

  it("includes a safe meeting link in email and WhatsApp reminder payloads", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([
      lessonFixture({ liveLessonUrl: "https://meet.google.com/abc-defg-hij" }),
    ]);

    const { processDueReminders } = await loadReminderService();
    await processDueReminders();

    expect(sendClassReminderEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveLessonUrl: "https://meet.google.com/abc-defg-hij",
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://wa.example.test/send",
      expect.objectContaining({
        body: expect.stringContaining("https://meet.google.com/abc-defg-hij"),
      }),
    );
  });

  it("uses a stable placeholder when the meeting link is missing", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([
      lessonFixture({ id: "missing-link-lesson", liveLessonUrl: null }),
    ]);

    const { processDueReminders } = await loadReminderService();
    await processDueReminders();

    expect(sendClassReminderEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveLessonUrl: "Meeting link will be shared before the lesson",
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://wa.example.test/send",
      expect.objectContaining({
        body: expect.stringContaining("Meeting link will be shared before the lesson"),
      }),
    );
  });

  it("does not include unsafe URLs in reminder content", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([
      lessonFixture({ id: "unsafe-link-lesson", liveLessonUrl: "javascript:alert(1)" }),
    ]);

    const { processDueReminders } = await loadReminderService();
    await processDueReminders();

    expect(sendClassReminderEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveLessonUrl: "Meeting link will be shared before the lesson",
      }),
    );
    expect(sendClassReminderEmailMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        liveLessonUrl: "javascript:alert(1)",
      }),
    );
    expect(JSON.stringify((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(
      "javascript:alert(1)",
    );
  });

  it("skips cancelled and completed lessons without sending link content", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([
      lessonFixture({ id: "cancelled-lesson", status: "CANCELLED" }),
      lessonFixture({ id: "completed-lesson", status: "COMPLETED" }),
    ]);

    const { processDueReminders } = await loadReminderService();
    await processDueReminders();

    expect(sendClassReminderEmailMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the changed meeting link for future eligible reminders", async () => {
    listUpcomingClassesForRemindersMock.mockResolvedValue([
      lessonFixture({
        id: "changed-link-lesson",
        liveLessonUrl: "https://meet.google.com/new-code-room",
        reminders: [
          {
            recipientUserId: "teacher-direct",
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

    expect(sendClassReminderEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveLessonUrl: "https://meet.google.com/new-code-room",
      }),
    );
  });
});
