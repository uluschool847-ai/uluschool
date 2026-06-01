import { LessonStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  scheduledClass: {
    findFirst: vi.fn(),
  },
}));

const canStartLessonMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/lessons/lesson-status", () => ({
  canStartLesson: canStartLessonMock,
}));

type TeacherLessonWorkspaceRepositoryModule = {
  getTeacherLessonWorkspace: (
    teacherId: string,
    lessonId: string,
  ) => Promise<Record<string, unknown> | null>;
};

async function loadTeacherLessonWorkspaceRepository() {
  const specifier = "@/lib/repositories/" + "teacher-lesson-workspace-repository";
  const repository = await import(/* @vite-ignore */ specifier);
  return repository as unknown as TeacherLessonWorkspaceRepositoryModule;
}

const now = new Date("2026-07-10T09:45:00.000Z");
const startAt = new Date("2026-07-10T10:00:00.000Z");
const endAt = new Date("2026-07-10T11:00:00.000Z");

function lessonRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "lesson-1",
    title: "Algebra live workspace",
    description: "Teacher lesson workspace detail",
    status: LessonStatus.SCHEDULED,
    startAt,
    endAt,
    timezone: null,
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
    meetingProvider: "GOOGLE_MEET",
    googleCalendarEventId: "calendar-event-1",
    googleMeetSpaceName: "spaces/abc-defg-hij",
    meetingUpdatedAt: new Date("2026-07-01T08:00:00.000Z"),
    cancelReason: null,
    rescheduledFromId: null,
    teacherId: "teacher-1",
    subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    classGroup: {
      id: "group-1",
      name: "Algebra Group A",
      status: "ACTIVE",
      teacherId: "teacher-1",
      students: [
        {
          id: "student-active",
          fullName: "Active Student",
          email: "active@example.com",
          isActive: true,
          learningStatus: "ACTIVE",
          studentProgresses: [{ id: "progress-active" }],
        },
        {
          id: "student-inactive",
          fullName: "Inactive Student",
          email: "inactive@example.com",
          isActive: false,
          learningStatus: "PAUSED",
          studentProgresses: [],
        },
      ],
    },
    students: [
      {
        id: "student-direct",
        fullName: "Legacy Direct Student",
        email: "direct@example.com",
        isActive: true,
        learningStatus: "ACTIVE",
        studentProgresses: [{ id: "progress-direct" }],
      },
    ],
    courseMaterials: [
      {
        id: "material-1",
        title: "Algebra worksheet",
        description: "Practice file",
        fileUrl: "/uploads/algebra.pdf",
        createdAt: new Date("2026-07-01T08:00:00.000Z"),
      },
    ],
    assignments: [
      {
        id: "assignment-1",
        title: "Algebra homework",
        dueDate: new Date("2026-07-12T20:00:00.000Z"),
        archivedAt: null,
        submissions: [
          {
            id: "submission-pending",
            submittedAt: new Date("2026-07-10T12:00:00.000Z"),
            grade: null,
            feedback: null,
            student: {
              id: "student-active",
              fullName: "Active Student",
              email: "active@example.com",
            },
          },
          {
            id: "submission-graded",
            submittedAt: new Date("2026-07-10T12:30:00.000Z"),
            grade: 94,
            feedback: "Good work",
            student: {
              id: "student-inactive",
              fullName: "Inactive Student",
              email: "inactive@example.com",
            },
          },
        ],
      },
      {
        id: "assignment-archived",
        title: "Archived homework",
        dueDate: new Date("2026-07-01T20:00:00.000Z"),
        archivedAt: new Date("2026-07-02T09:00:00.000Z"),
        submissions: [],
      },
    ],
    ...overrides,
  };
}

function setupStartState() {
  canStartLessonMock.mockImplementation(
    (lesson: { status: LessonStatus; liveLessonUrl?: string | null }) => {
      if (lesson.status === LessonStatus.CANCELLED) {
        return { enabled: false, href: null, reason: "Lesson is cancelled" };
      }
      if (lesson.status === LessonStatus.COMPLETED) {
        return { enabled: false, href: null, reason: "Lesson is completed" };
      }
      if (!lesson.liveLessonUrl || lesson.liveLessonUrl.startsWith("javascript:")) {
        return { enabled: false, href: null, reason: "Meeting link missing" };
      }
      return { enabled: true, href: lesson.liveLessonUrl, reason: null };
    },
  );
}

describe("teacher lesson workspace repository", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.resetAllMocks();
    setupStartState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an owned direct lesson workspace using teacherId ownership", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(
      lessonRecord({ id: "direct-lesson", classGroup: null }),
    );

    const { getTeacherLessonWorkspace } = await loadTeacherLessonWorkspaceRepository();
    const result = await getTeacherLessonWorkspace("teacher-1", "direct-lesson");

    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "direct-lesson",
          OR: [{ teacherId: "teacher-1" }, { classGroup: { teacherId: "teacher-1" } }],
        },
      }),
    );
    const where = prismaMock.scheduledClass.findFirst.mock.calls[0]?.[0]?.where;
    expect(JSON.stringify(where)).not.toContain("students");
    expect(result).toEqual(
      expect.objectContaining({
        lesson: expect.objectContaining({
          id: "direct-lesson",
          title: "Algebra live workspace",
          timezone: "Europe/Kiev",
          meetingProvider: "GOOGLE_MEET",
          googleCalendarEventId: "calendar-event-1",
          googleMeetSpaceName: "spaces/abc-defg-hij",
          meetingUpdatedAt: new Date("2026-07-01T08:00:00.000Z"),
          startState: {
            enabled: true,
            href: "https://meet.google.com/abc-defg-hij",
            reason: null,
          },
        }),
        classGroup: null,
        navigationHrefs: expect.objectContaining({
          backToSchedule: "/portal/teacher/schedule",
        }),
      }),
    );
    expect(canStartLessonMock).toHaveBeenCalled();
  });

  it("returns an owned classGroup lesson workspace with the full teacher-facing data contract", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(lessonRecord());

    const { getTeacherLessonWorkspace } = await loadTeacherLessonWorkspaceRepository();
    const result = await getTeacherLessonWorkspace("teacher-1", "lesson-1");

    expect(result).toEqual(
      expect.objectContaining({
        lesson: expect.objectContaining({
          id: "lesson-1",
          title: "Algebra live workspace",
          description: "Teacher lesson workspace detail",
          status: LessonStatus.SCHEDULED,
          startAt,
          endAt,
          timezone: "Europe/Kiev",
          cancelReason: null,
          rescheduledFromId: null,
          isRescheduled: false,
          liveLessonUrl: "https://meet.google.com/abc-defg-hij",
          meetingProvider: "GOOGLE_MEET",
          googleCalendarEventId: "calendar-event-1",
          googleMeetSpaceName: "spaces/abc-defg-hij",
          meetingUpdatedAt: new Date("2026-07-01T08:00:00.000Z"),
          startState: {
            enabled: true,
            href: "https://meet.google.com/abc-defg-hij",
            reason: null,
          },
        }),
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        classGroup: {
          id: "group-1",
          name: "Algebra Group A",
          status: "ACTIVE",
          href: "/portal/teacher/classes/group-1",
        },
        navigationHrefs: {
          backToSchedule: "/portal/teacher/schedule",
          classDetail: "/portal/teacher/classes/group-1",
          submissions: {
            disabled: false,
            href: "/portal/teacher/submissions?scheduledClassId=lesson-1",
            label: "Review Submissions",
          },
          progress: {
            disabled: false,
            href: "/portal/teacher/progress?subjectId=subject-math",
            label: "Open Progress",
          },
          materials: {
            disabled: false,
            href: "/portal/teacher/materials?scheduledClassId=lesson-1",
            label: "Materials",
          },
          attendance: {
            disabled: false,
            href: "/portal/teacher/lessons/lesson-1#attendance",
            label: "Attendance",
          },
        },
        roster: [
          expect.objectContaining({
            id: "student-active",
            fullName: "Active Student",
            email: "active@example.com",
            isActive: true,
            learningStatus: "ACTIVE",
            submissionStatus: "pending",
          }),
          expect.objectContaining({
            id: "student-inactive",
            fullName: "Inactive Student",
            isActive: false,
            learningStatus: "PAUSED",
            submissionStatus: "graded",
          }),
        ],
        materials: [
          {
            id: "material-1",
            title: "Algebra worksheet",
            description: "Practice file",
            fileUrl: "/uploads/algebra.pdf",
            createdAt: new Date("2026-07-01T08:00:00.000Z"),
            fileLink: {
              href: "/uploads/algebra.pdf",
              label: "Open Algebra worksheet",
              disabled: false,
            },
          },
        ],
        assignments: expect.arrayContaining([
          expect.objectContaining({
            id: "assignment-1",
            title: "Algebra homework",
            dueDate: new Date("2026-07-12T20:00:00.000Z"),
            isArchived: false,
            dueState: "due-soon",
            submissionsCount: 2,
            pendingSubmissionsCount: 1,
            review: {
              disabled: false,
              href: "/portal/teacher/submissions?assignmentId=assignment-1",
              label: "Review assignment work",
            },
          }),
          expect.objectContaining({
            id: "assignment-archived",
            isArchived: true,
          }),
        ]),
        submissions: [
          expect.objectContaining({
            id: "submission-pending",
            student: expect.objectContaining({ id: "student-active" }),
            assignment: expect.objectContaining({ id: "assignment-1" }),
            grade: null,
            feedback: null,
            status: "pending",
            review: {
              disabled: false,
              href: "/portal/teacher/submissions/submission-pending?assignmentId=assignment-1&scheduledClassId=lesson-1",
              label: "Review",
            },
          }),
          expect.objectContaining({
            id: "submission-graded",
            grade: 94,
            feedback: "Good work",
            status: "graded",
          }),
        ],
        gradingSummary: {
          totalSubmissions: 2,
          pendingSubmissions: 1,
          gradedSubmissions: 1,
        },
        progressSummary: {
          count: 1,
          disabled: false,
          href: "/portal/teacher/progress?subjectId=subject-math",
          label: "Open Progress",
          reason: null,
        },
        attendanceSummary: {
          disabled: false,
          hidden: false,
          reason: null,
        },
      }),
    );
  });

  it("returns null for another teacher's lesson", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(null);

    const { getTeacherLessonWorkspace } = await loadTeacherLessonWorkspaceRepository();

    await expect(
      getTeacherLessonWorkspace("teacher-1", "other-teacher-lesson"),
    ).resolves.toBeNull();
    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "other-teacher-lesson",
          OR: [{ teacherId: "teacher-1" }, { classGroup: { teacherId: "teacher-1" } }],
        },
      }),
    );
  });

  it("preserves provider-specific meeting metadata in the workspace lesson DTO", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(
      lessonRecord({
        liveLessonUrl: "https://example.com/live/classroom",
        meetingProvider: "MANUAL_URL",
        googleCalendarEventId: null,
        googleMeetSpaceName: null,
        meetingUpdatedAt: new Date("2026-07-02T08:00:00.000Z"),
      }),
    );

    const { getTeacherLessonWorkspace } = await loadTeacherLessonWorkspaceRepository();
    const result = await getTeacherLessonWorkspace("teacher-1", "lesson-1");

    expect(result).toEqual(
      expect.objectContaining({
        lesson: expect.objectContaining({
          liveLessonUrl: "https://example.com/live/classroom",
          meetingProvider: "MANUAL_URL",
          googleCalendarEventId: null,
          googleMeetSpaceName: null,
          meetingUpdatedAt: new Date("2026-07-02T08:00:00.000Z"),
        }),
      }),
    );
  });

  it.each([
    [LessonStatus.CANCELLED, "Teacher unavailable", "Lesson is cancelled"],
    [LessonStatus.COMPLETED, null, "Lesson is completed"],
  ])("disables start state for %s lessons", async (status, cancelReason, reason) => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(
      lessonRecord({
        status,
        cancelReason,
      }),
    );

    const { getTeacherLessonWorkspace } = await loadTeacherLessonWorkspaceRepository();
    const result = await getTeacherLessonWorkspace("teacher-1", "lesson-1");

    expect(result).toEqual(
      expect.objectContaining({
        lesson: expect.objectContaining({
          status,
          cancelReason,
          startState: { enabled: false, href: null, reason },
        }),
      }),
    );
  });

  it.each([
    [null, "Meeting link missing"],
    ["javascript:alert(1)", "Meeting link missing"],
  ])(
    "does not emit an active start link for missing or unsafe live URLs",
    async (liveLessonUrl) => {
      prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(lessonRecord({ liveLessonUrl }));

      const { getTeacherLessonWorkspace } = await loadTeacherLessonWorkspaceRepository();
      const result = await getTeacherLessonWorkspace("teacher-1", "lesson-1");

      expect(result).toEqual(
        expect.objectContaining({
          lesson: expect.objectContaining({
            liveLessonUrl,
            startState: { enabled: false, href: null, reason: "Meeting link missing" },
          }),
        }),
      );
    },
  );

  it("returns safe empty arrays and zero summaries for lessons with no workspace records", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(
      lessonRecord({
        classGroup: { id: "group-empty", name: "Empty Group", status: "ACTIVE", students: [] },
        students: [],
        courseMaterials: [],
        assignments: [],
      }),
    );

    const { getTeacherLessonWorkspace } = await loadTeacherLessonWorkspaceRepository();
    const result = await getTeacherLessonWorkspace("teacher-1", "lesson-empty");

    expect(result).toEqual(
      expect.objectContaining({
        roster: [],
        materials: [],
        assignments: [],
        submissions: [],
        gradingSummary: {
          totalSubmissions: 0,
          pendingSubmissions: 0,
          gradedSubmissions: 0,
        },
        progressSummary: expect.objectContaining({
          count: 0,
          disabled: false,
          href: "/portal/teacher/progress?subjectId=subject-math",
          reason: "No current progress notes for this lesson roster yet.",
        }),
        attendanceSummary: expect.objectContaining({ disabled: false, hidden: false }),
      }),
    );
  });
});
