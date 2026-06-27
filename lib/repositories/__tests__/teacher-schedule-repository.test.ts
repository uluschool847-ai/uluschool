import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  classGroup: {
    findMany: vi.fn(),
  },
  scheduledClass: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  subject: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type LessonStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
type MeetingProvider = "GOOGLE_MEET" | "MANUAL_URL";

type TeacherScheduleInput = {
  teacherId: string;
  from: Date;
  to: Date;
  classGroupId?: string;
  subjectId?: string;
  status?: LessonStatus | string;
};

type TeacherScheduleLesson = {
  id: string;
  title: string;
  description: string | null;
  status: LessonStatus;
  startAt: Date;
  endAt: Date;
  timezone: string;
  liveLessonUrl: string | null;
  meetingProvider: MeetingProvider;
  googleCalendarEventId: string | null;
  googleMeetSpaceName: string | null;
  meetingUpdatedAt: Date | null;
  subject: { id: string; name: string; slug: string } | null;
  classGroup: { id: string; name: string } | null;
  cancelReason: string | null;
  rescheduledFromId: string | null;
  studentCount: number;
  rosterPreview: Array<{
    id: string;
    fullName: string;
    email: string;
    isActive: boolean;
  }>;
  materialsCount: number;
  assignmentsCount: number;
  pendingSubmissionsCount: number;
  materials?: Array<{ id: string; title: string; fileUrl: string | null }>;
  assignments?: Array<{
    id: string;
    title: string;
    dueDate: Date;
    submissionCount: number;
    pendingSubmissionCount: number;
  }>;
  submissionsSummary?: {
    total: number;
    pending: number;
    graded: number;
  };
};

type StartState = {
  enabled: boolean;
  href: string | null;
  reason: string | null;
};

type TeacherScheduleRepositoryModule = {
  listTeacherSchedule: (input: TeacherScheduleInput) => Promise<TeacherScheduleLesson[]>;
  getTeacherScheduleFilterOptions: (teacherId: string) => Promise<{
    classGroups: Array<{ id: string; name: string }>;
    subjects: Array<{ id: string; name: string }>;
  }>;
  canStartLesson: (
    lesson: {
      startAt: Date;
      endAt: Date;
      status: LessonStatus;
      liveLessonUrl?: string | null;
      meetingProvider?: MeetingProvider;
    },
    now: Date,
  ) => StartState;
};

async function loadTeacherScheduleRepository() {
  const specifier = "@/lib/repositories/teacher-schedule-repository";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherScheduleRepositoryModule>;
}

const from = new Date("2026-07-01T00:00:00.000Z");
const to = new Date("2026-07-31T23:59:59.999Z");
const startAt = new Date("2026-07-10T10:00:00.000Z");
const endAt = new Date("2026-07-10T11:00:00.000Z");

function lessonRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "lesson-1",
    title: "Algebra live workshop",
    description: "Teacher schedule detail lesson",
    status: "SCHEDULED",
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
    subjectId: "subject-math",
    subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    teacherId: "teacher-1",
    teacher: {
      id: "teacher-1",
      fullName: "Jane Teacher",
      email: "jane.teacher@example.com",
    },
    classGroupId: "group-1",
    classGroup: {
      id: "group-1",
      name: "Algebra Group A",
      teacherId: "teacher-1",
      students: [
        {
          id: "student-active",
          fullName: "Active Student",
          email: "active@example.com",
          isActive: true,
        },
        {
          id: "student-inactive",
          fullName: "Inactive Student",
          email: "inactive@example.com",
          isActive: false,
        },
      ],
    },
    students: [
      {
        id: "student-direct",
        fullName: "Legacy Direct Student",
        email: "direct@example.com",
        isActive: true,
      },
    ],
    courseMaterials: [
      { id: "material-1", title: "Algebra worksheet", fileUrl: "/materials/algebra.pdf" },
    ],
    assignments: [
      {
        id: "assignment-1",
        title: "Algebra homework",
        dueDate: new Date("2026-07-12T20:00:00.000Z"),
        submissions: [
          { id: "submission-pending", grade: null, studentId: "student-active" },
          { id: "submission-graded", grade: 95, studentId: "student-inactive" },
        ],
      },
    ],
    _count: {
      assignments: 1,
      courseMaterials: 1,
      reminders: 0,
    },
    ...overrides,
  };
}

describe("teacher-schedule-repository access contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists only lessons owned by the teacher directly or through a class group", async () => {
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      lessonRecord({ id: "direct-teacher-lesson" }),
      lessonRecord({
        id: "group-teacher-lesson",
        teacherId: "substitute-teacher",
        teacher: {
          id: "substitute-teacher",
          fullName: "Substitute Teacher",
          email: "substitute@example.com",
        },
      }),
    ]);

    const { listTeacherSchedule } = await loadTeacherScheduleRepository();
    const result = await listTeacherSchedule({ teacherId: "teacher-1", from, to });

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startAt: { gte: from, lte: to },
          OR: [{ teacherId: "teacher-1" }, { classGroup: { teacherId: "teacher-1" } }],
        }),
        include: expect.objectContaining({
          subject: expect.any(Object),
          classGroup: expect.objectContaining({
            include: expect.objectContaining({
              students: expect.objectContaining({
                orderBy: { fullName: "asc" },
              }),
            }),
          }),
          students: expect.objectContaining({
            orderBy: { fullName: "asc" },
          }),
          courseMaterials: expect.any(Object),
          assignments: expect.objectContaining({
            include: expect.objectContaining({
              submissions: expect.any(Object),
            }),
          }),
        }),
        orderBy: [{ startAt: "asc" }, { title: "asc" }],
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "direct-teacher-lesson",
        title: "Algebra live workshop",
        timezone: "Africa/Nairobi",
        meetingProvider: "GOOGLE_MEET",
        googleCalendarEventId: "calendar-event-1",
        googleMeetSpaceName: "spaces/abc-defg-hij",
        meetingUpdatedAt: new Date("2026-07-01T08:00:00.000Z"),
        subject: expect.objectContaining({ name: "Mathematics" }),
        classGroup: expect.objectContaining({ name: "Algebra Group A" }),
        studentCount: 2,
        rosterPreview: [
          expect.objectContaining({ fullName: "Active Student", isActive: true }),
          expect.objectContaining({ fullName: "Inactive Student", isActive: false }),
        ],
        materialsCount: 1,
        assignmentsCount: 1,
        pendingSubmissionsCount: 1,
      }),
      expect.objectContaining({ id: "group-teacher-lesson" }),
    ]);
    expect(JSON.stringify(result)).not.toContain("other-teacher-lesson");
  });

  it("preserves provider-specific meeting metadata in teacher schedule DTOs", async () => {
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      lessonRecord({
        id: "manual-provider-lesson",
        liveLessonUrl: "https://example.com/live/classroom",
        meetingProvider: "MANUAL_URL",
        googleCalendarEventId: null,
        googleMeetSpaceName: null,
        meetingUpdatedAt: new Date("2026-07-02T08:00:00.000Z"),
      }),
    ]);

    const { listTeacherSchedule } = await loadTeacherScheduleRepository();
    const result = await listTeacherSchedule({ teacherId: "teacher-1", from, to });

    expect(result[0]).toEqual(
      expect.objectContaining({
        id: "manual-provider-lesson",
        liveLessonUrl: "https://example.com/live/classroom",
        meetingProvider: "MANUAL_URL",
        googleCalendarEventId: null,
        googleMeetSpaceName: null,
        meetingUpdatedAt: new Date("2026-07-02T08:00:00.000Z"),
      }),
    );
    expect(result[0]?.meetingProvider).not.toBe("GOOGLE_MEET");
  });

  it("filters teacher schedule by date range, class group, subject, status, and preserves startAt ordering", async () => {
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      lessonRecord({
        id: "filtered-live-lesson",
        status: "LIVE",
        subjectId: "subject-physics",
        subject: { id: "subject-physics", name: "Physics", slug: "physics" },
      }),
    ]);

    const { listTeacherSchedule } = await loadTeacherScheduleRepository();
    await listTeacherSchedule({
      teacherId: "teacher-1",
      from,
      to,
      classGroupId: "group-1",
      subjectId: "subject-physics",
      status: "LIVE",
    });

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startAt: { gte: from, lte: to },
          classGroupId: "group-1",
          subjectId: "subject-physics",
          status: "LIVE",
          OR: [{ teacherId: "teacher-1" }, { classGroup: { teacherId: "teacher-1" } }],
        }),
        orderBy: [{ startAt: "asc" }, { title: "asc" }],
      }),
    );
  });

  it("ignores invalid raw status input without throwing or forwarding it to Prisma", async () => {
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([]);

    const { listTeacherSchedule } = await loadTeacherScheduleRepository();
    await expect(
      listTeacherSchedule({
        teacherId: "teacher-1",
        from,
        to,
        status: "ARCHIVED",
      }),
    ).resolves.toEqual([]);

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          status: expect.anything(),
        }),
      }),
    );
  });

  it("does not cast raw teacher schedule status input directly to LessonStatus", () => {
    const source = readFileSync("lib/repositories/teacher-schedule-repository.ts", "utf8");

    expect(source).not.toMatch(/input\.status\s+as\s+LessonStatus/);
  });

  it("keeps teacher ownership scope when filtering by class group", async () => {
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([]);

    const { listTeacherSchedule } = await loadTeacherScheduleRepository();
    const result = await listTeacherSchedule({
      teacherId: "teacher-1",
      from,
      to,
      classGroupId: "other-teacher-group",
    });

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classGroupId: "other-teacher-group",
          OR: [{ teacherId: "teacher-1" }, { classGroup: { teacherId: "teacher-1" } }],
        }),
      }),
    );
    expect(result).toEqual([]);
  });

  it("keeps teacher ownership scope when filtering by subject", async () => {
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([]);

    const { listTeacherSchedule } = await loadTeacherScheduleRepository();
    const result = await listTeacherSchedule({
      teacherId: "teacher-1",
      from,
      to,
      subjectId: "other-teacher-subject",
    });

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subjectId: "other-teacher-subject",
          OR: [{ teacherId: "teacher-1" }, { classGroup: { teacherId: "teacher-1" } }],
        }),
      }),
    );
    expect(result).toEqual([]);
  });

  it("returns teacher-owned class group and subject filter options sorted by name", async () => {
    prismaMock.classGroup.findMany.mockResolvedValueOnce([
      { id: "group-algebra", name: "Algebra Group A" },
      { id: "group-geometry", name: "Geometry Group B" },
    ]);
    prismaMock.subject.findMany.mockResolvedValueOnce([
      { id: "subject-math", name: "Mathematics" },
      { id: "subject-physics", name: "Physics" },
    ]);

    const { getTeacherScheduleFilterOptions } = await loadTeacherScheduleRepository();
    const result = await getTeacherScheduleFilterOptions("teacher-1");

    expect(prismaMock.classGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teacherId: "teacher-1" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    );
    expect(prismaMock.subject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { classGroups: { some: { teacherId: "teacher-1" } } },
            {
              scheduledClasses: {
                some: {
                  OR: [{ teacherId: "teacher-1" }, { classGroup: { teacherId: "teacher-1" } }],
                },
              },
            },
          ],
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    );
    expect(result).toEqual({
      classGroups: [
        { id: "group-algebra", name: "Algebra Group A" },
        { id: "group-geometry", name: "Geometry Group B" },
      ],
      subjects: [
        { id: "subject-math", name: "Mathematics" },
        { id: "subject-physics", name: "Physics" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("other-teacher");
  });

  it("returns empty filter option arrays when the teacher has no schedule data", async () => {
    prismaMock.classGroup.findMany.mockResolvedValueOnce([]);
    prismaMock.subject.findMany.mockResolvedValueOnce([]);

    const { getTeacherScheduleFilterOptions } = await loadTeacherScheduleRepository();
    const result = await getTeacherScheduleFilterOptions("teacher-empty");

    expect(result).toEqual({ classGroups: [], subjects: [] });
  });
});

describe("canStartLesson teacher schedule start window", () => {
  const lesson = {
    startAt: new Date("2026-07-10T10:00:00.000Z"),
    endAt: new Date("2026-07-10T11:00:00.000Z"),
    status: "SCHEDULED" as LessonStatus,
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
  };

  it("enables start from 15 minutes before start until 15 minutes after end", async () => {
    const { canStartLesson } = await loadTeacherScheduleRepository();

    expect(canStartLesson(lesson, new Date("2026-07-10T09:44:59.999Z"))).toEqual({
      enabled: false,
      href: null,
      reason: "Available before lesson",
    });
    expect(canStartLesson(lesson, new Date("2026-07-10T09:45:00.000Z"))).toEqual({
      enabled: true,
      href: "https://meet.google.com/abc-defg-hij",
      reason: null,
    });
    expect(canStartLesson(lesson, new Date("2026-07-10T11:15:00.000Z"))).toEqual({
      enabled: true,
      href: "https://meet.google.com/abc-defg-hij",
      reason: null,
    });
    expect(canStartLesson(lesson, new Date("2026-07-10T11:15:00.001Z"))).toEqual({
      enabled: false,
      href: null,
      reason: "Lesson has ended",
    });
  });

  it("disables cancelled and completed lessons", async () => {
    const { canStartLesson } = await loadTeacherScheduleRepository();

    expect(canStartLesson({ ...lesson, status: "CANCELLED" }, startAt)).toEqual({
      enabled: false,
      href: null,
      reason: "Lesson is cancelled",
    });
    expect(canStartLesson({ ...lesson, status: "COMPLETED" }, startAt)).toEqual({
      enabled: false,
      href: null,
      reason: "Lesson is completed",
    });
  });

  it("disables lessons without a meeting link", async () => {
    const { canStartLesson } = await loadTeacherScheduleRepository();

    expect(canStartLesson({ ...lesson, liveLessonUrl: null }, startAt)).toEqual({
      enabled: false,
      href: null,
      reason: "Meeting link missing",
    });
  });

  it("validates start links against the actual meeting provider", async () => {
    const { canStartLesson } = await loadTeacherScheduleRepository();

    expect(
      canStartLesson(
        {
          ...lesson,
          meetingProvider: "GOOGLE_MEET",
          liveLessonUrl: "https://example.com/live/classroom",
        },
        startAt,
      ),
    ).toEqual({
      enabled: false,
      href: null,
      reason: expect.stringMatching(/invalid meeting link|missing|not available/i),
    });
    expect(
      canStartLesson(
        {
          ...lesson,
          meetingProvider: "MANUAL_URL",
          liveLessonUrl: "https://example.com/live/classroom",
        },
        startAt,
      ),
    ).toEqual({
      enabled: true,
      href: "https://example.com/live/classroom",
      reason: null,
    });
  });
});
