import { beforeEach, describe, expect, it, vi } from "vitest";

import { storageUrlForKey } from "@/lib/storage/storage-url";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  scheduledClass: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type LessonStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
type MeetingProvider = "GOOGLE_MEET" | "MANUAL_URL";

type StudentScheduleInput = {
  studentId: string;
  from: Date;
  to: Date;
  subjectId?: string;
  status?: LessonStatus | string;
};

type ParentScheduleInput = {
  parentId: string;
  from: Date;
  to: Date;
  studentId?: string;
  subjectId?: string;
  status?: LessonStatus | string;
};

type StudentScheduleLesson = {
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
  level: { id: string; name: string; slug: string } | null;
  teacher: { id: string; fullName: string; email: string } | null;
  classGroup: { id: string; name: string } | null;
  cancelReason: string | null;
  rescheduledFromId: string | null;
  materialsCount: number;
  materials: Array<{ id: string; title: string; url: string | null }>;
  assignments: Array<{
    id: string;
    title: string;
    dueDate: Date;
    submissionStatus: "NOT_SUBMITTED" | "SUBMITTED" | "GRADED";
    submissionId: string | null;
    grade: number | null;
  }>;
};

type JoinState = {
  enabled: boolean;
  href: string | null;
  reason: string | null;
};

type StudentScheduleRepositoryModule = {
  listStudentSchedule: (input: StudentScheduleInput) => Promise<StudentScheduleLesson[]>;
  getStudentScheduleLesson: (
    studentId: string,
    lessonId: string,
  ) => Promise<StudentScheduleLesson | null>;
  listParentChildSchedule: (input: ParentScheduleInput) => Promise<StudentScheduleLesson[]>;
  getParentScopedStudentScheduleLesson: (
    parentId: string,
    studentId: string,
    lessonId: string,
  ) => Promise<StudentScheduleLesson | null>;
  canJoinLesson: (
    lesson: {
      startAt: Date;
      endAt: Date;
      status: LessonStatus;
      liveLessonUrl?: string | null;
      meetingProvider?: MeetingProvider;
    },
    now: Date,
  ) => JoinState;
};

async function loadStudentScheduleRepository() {
  const specifier = "@/lib/repositories/student-schedule-repository";
  return import(/* @vite-ignore */ specifier) as Promise<StudentScheduleRepositoryModule>;
}

const from = new Date("2026-06-01T00:00:00.000Z");
const to = new Date("2026-06-30T23:59:59.999Z");
const startAt = new Date("2026-06-10T10:00:00.000Z");
const endAt = new Date("2026-06-10T11:00:00.000Z");

function lessonRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "lesson-1",
    title: "Quadratic functions",
    description: "Live problem-solving session",
    status: "SCHEDULED",
    startAt,
    endAt,
    timezone: null,
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
    meetingProvider: "GOOGLE_MEET",
    googleCalendarEventId: "calendar-event-1",
    googleMeetSpaceName: "spaces/abc-defg-hij",
    meetingUpdatedAt: new Date("2026-06-01T08:00:00.000Z"),
    cancelReason: null,
    rescheduledFromId: null,
    subjectId: "subject-math",
    subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    teacher: {
      id: "teacher-1",
      fullName: "Jane Teacher",
      email: "jane.teacher@example.com",
    },
    classGroup: {
      id: "group-1",
      name: "IGCSE Mathematics Group A",
      level: { id: "level-igcse", name: "IGCSE", slug: "igcse" },
      students: [{ id: "student-1", fullName: "Sofia Student", email: "sofia@example.com" }],
    },
    students: [],
    courseMaterials: [
      { id: "material-1", title: "Worksheet", fileUrl: "https://cdn.example.com/ws.pdf" },
    ],
    assignments: [
      {
        id: "assignment-1",
        title: "Practice set",
        dueDate: new Date("2026-06-12T20:00:00.000Z"),
        submissions: [
          {
            id: "submission-1",
            studentId: "student-1",
            submittedAt: new Date("2026-06-11T12:00:00.000Z"),
            grade: null,
          },
        ],
      },
    ],
    _count: { courseMaterials: 1 },
    ...overrides,
  };
}

describe("student-schedule-repository access contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("presents current, legacy, and external lesson materials without exposing raw keys", async () => {
    const currentKey = "private/teachers/teacher-1/materials/schedule.pdf";
    const external = "https://cdn.example.com/schedule%20notes.pdf?download=1";
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      lessonRecord({
        courseMaterials: [
          {
            id: "current-material",
            title: "Current",
            fileUrl: "https://cdn.example.com/stale.pdf",
            attachments: [
              {
                id: "current-attachment",
                filename: "schedule.pdf",
                storageKey: currentKey,
                mimeType: "application/pdf",
                size: 20,
              },
            ],
          },
          {
            id: "legacy-material",
            title: "Legacy",
            fileUrl: "/uploads/materials/legacy.pdf",
            attachments: [
              {
                id: "legacy-attachment",
                filename: "legacy.pdf",
                storageKey: "uploads/materials/legacy.pdf",
                mimeType: "application/pdf",
                size: 20,
              },
            ],
          },
          { id: "external-material", title: "External", fileUrl: external, attachments: [] },
          {
            id: "unsafe-material",
            title: "Unsafe",
            fileUrl: "javascript:alert(1)",
            attachments: [],
          },
        ],
        _count: { courseMaterials: 4 },
      }),
    ]);

    const { listStudentSchedule } = await loadStudentScheduleRepository();
    const [lesson] = await listStudentSchedule({ studentId: "student-1", from, to });

    expect(lesson.materials).toEqual([
      expect.objectContaining({
        id: "current-material",
        safeFileUrl: storageUrlForKey(currentKey),
        attachments: [expect.objectContaining({ href: storageUrlForKey(currentKey) })],
      }),
      expect.objectContaining({
        id: "legacy-material",
        safeFileUrl: "/uploads/materials/legacy.pdf",
        attachments: [expect.objectContaining({ href: "/uploads/materials/legacy.pdf" })],
      }),
      expect.objectContaining({ id: "external-material", safeFileUrl: external }),
      expect.objectContaining({ id: "unsafe-material", safeFileUrl: null }),
    ]);
  });

  it("lists only lessons accessible by the student through ClassGroup or direct lesson enrolment", async () => {
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      lessonRecord(),
      lessonRecord({
        id: "lesson-direct",
        title: "Legacy direct lesson",
        classGroup: null,
        students: [{ id: "student-1", fullName: "Sofia Student", email: "sofia@example.com" }],
      }),
    ]);

    const { listStudentSchedule } = await loadStudentScheduleRepository();
    const result = await listStudentSchedule({ studentId: "student-1", from, to });

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startAt: { gte: from, lte: to },
          OR: [
            { classGroup: { students: { some: { id: "student-1" } } } },
            { students: { some: { id: "student-1" } } },
          ],
        }),
        include: expect.objectContaining({
          subject: expect.any(Object),
          teacher: expect.any(Object),
          classGroup: expect.objectContaining({
            include: expect.objectContaining({
              level: expect.any(Object),
              students: expect.any(Object),
            }),
          }),
          courseMaterials: expect.any(Object),
          assignments: expect.objectContaining({
            include: expect.objectContaining({
              submissions: expect.objectContaining({
                where: { studentId: "student-1" },
              }),
            }),
          }),
        }),
        orderBy: [{ startAt: "asc" }, { title: "asc" }],
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "lesson-1",
        title: "Quadratic functions",
        timezone: "Africa/Nairobi",
        meetingProvider: "GOOGLE_MEET",
        googleCalendarEventId: "calendar-event-1",
        googleMeetSpaceName: "spaces/abc-defg-hij",
        meetingUpdatedAt: new Date("2026-06-01T08:00:00.000Z"),
        subject: expect.objectContaining({ name: "Mathematics" }),
        level: expect.objectContaining({ name: "IGCSE" }),
        teacher: expect.objectContaining({ fullName: "Jane Teacher" }),
        classGroup: expect.objectContaining({ name: "IGCSE Mathematics Group A" }),
        materialsCount: 1,
        materials: [expect.objectContaining({ id: "material-1", title: "Worksheet" })],
        assignments: [
          expect.objectContaining({
            id: "assignment-1",
            title: "Practice set",
            submissionStatus: "SUBMITTED",
            submissionId: "submission-1",
          }),
        ],
      }),
      expect.objectContaining({ id: "lesson-direct", title: "Legacy direct lesson" }),
    ]);
  });

  it("preserves provider-specific meeting metadata in student and parent schedule DTOs", async () => {
    const manualLesson = lessonRecord({
      id: "manual-provider-lesson",
      liveLessonUrl: "https://example.com/live/classroom",
      meetingProvider: "MANUAL_URL",
      googleCalendarEventId: null,
      googleMeetSpaceName: null,
      meetingUpdatedAt: new Date("2026-06-02T08:00:00.000Z"),
    });
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([manualLesson]);
    prismaMock.appUser.findFirst.mockResolvedValueOnce({
      id: "parent-1",
      children: [{ id: "student-1" }],
    });
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([manualLesson]);

    const { listParentChildSchedule, listStudentSchedule } = await loadStudentScheduleRepository();

    await expect(listStudentSchedule({ studentId: "student-1", from, to })).resolves.toEqual([
      expect.objectContaining({
        id: "manual-provider-lesson",
        liveLessonUrl: "https://example.com/live/classroom",
        meetingProvider: "MANUAL_URL",
        googleCalendarEventId: null,
        googleMeetSpaceName: null,
        meetingUpdatedAt: new Date("2026-06-02T08:00:00.000Z"),
      }),
    ]);
    await expect(
      listParentChildSchedule({ parentId: "parent-1", studentId: "student-1", from, to }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "manual-provider-lesson",
        meetingProvider: "MANUAL_URL",
        googleCalendarEventId: null,
        googleMeetSpaceName: null,
        meetingUpdatedAt: new Date("2026-06-02T08:00:00.000Z"),
      }),
    ]);
  });

  it("filters student schedule by date range, subject, status, and preserves startAt ASC ordering", async () => {
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      lessonRecord({
        id: "lesson-filtered",
        status: "LIVE",
        subjectId: "subject-physics",
        subject: { id: "subject-physics", name: "Physics", slug: "physics" },
      }),
    ]);

    const { listStudentSchedule } = await loadStudentScheduleRepository();
    await listStudentSchedule({
      studentId: "student-1",
      from,
      to,
      subjectId: "subject-physics",
      status: "LIVE",
    });

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startAt: { gte: from, lte: to },
          subjectId: "subject-physics",
          status: "LIVE",
          OR: [
            { classGroup: { students: { some: { id: "student-1" } } } },
            { students: { some: { id: "student-1" } } },
          ],
        }),
        orderBy: [{ startAt: "asc" }, { title: "asc" }],
      }),
    );
  });

  it("ignores invalid raw student schedule status input without throwing or forwarding it to Prisma", async () => {
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([]);

    const { listStudentSchedule } = await loadStudentScheduleRepository();
    await expect(
      listStudentSchedule({
        studentId: "student-1",
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

  it("gets a student lesson detail only when the student has group or direct access", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(
      lessonRecord({
        status: "CANCELLED",
        cancelReason: "Teacher illness",
        rescheduledFromId: "lesson-old",
      }),
    );

    const { getStudentScheduleLesson } = await loadStudentScheduleRepository();
    const result = await getStudentScheduleLesson("student-1", "lesson-1");

    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "lesson-1",
          OR: [
            { classGroup: { students: { some: { id: "student-1" } } } },
            { students: { some: { id: "student-1" } } },
          ],
        },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "lesson-1",
        status: "CANCELLED",
        cancelReason: "Teacher illness",
        rescheduledFromId: "lesson-old",
        assignments: [
          expect.objectContaining({
            submissionStatus: "SUBMITTED",
            submissionId: "submission-1",
          }),
        ],
      }),
    );
  });

  it("returns null when a student opens another student's lesson", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(null);

    const { getStudentScheduleLesson } = await loadStudentScheduleRepository();
    const result = await getStudentScheduleLesson("student-1", "unrelated-lesson");

    expect(result).toBeNull();
  });

  it("lists parent child schedules only for linked children and supports filtering to one child", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce({
      id: "parent-1",
      children: [{ id: "student-1" }, { id: "student-2" }],
    });
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([lessonRecord()]);

    const { listParentChildSchedule } = await loadStudentScheduleRepository();
    const result = await listParentChildSchedule({
      parentId: "parent-1",
      studentId: "student-1",
      from,
      to,
      subjectId: "subject-math",
      status: "SCHEDULED",
    });

    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith({
      where: {
        id: "parent-1",
        role: "PARENT",
        children: { some: { id: "student-1" } },
      },
      select: { id: true, children: { select: { id: true } } },
    });
    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startAt: { gte: from, lte: to },
          subjectId: "subject-math",
          status: "SCHEDULED",
          OR: [
            { classGroup: { students: { some: { id: { in: ["student-1"] } } } } },
            { students: { some: { id: { in: ["student-1"] } } } },
          ],
        }),
      }),
    );
    expect(result[0]).toEqual(expect.objectContaining({ id: "lesson-1" }));
  });

  it("ignores invalid raw parent child schedule status input without throwing or forwarding it to Prisma", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce({
      id: "parent-1",
      children: [{ id: "student-1" }],
    });
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([]);

    const { listParentChildSchedule } = await loadStudentScheduleRepository();
    await expect(
      listParentChildSchedule({
        parentId: "parent-1",
        studentId: "student-1",
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

  it("rejects parent schedule access for an unlinked child without querying lessons", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce(null);

    const { listParentChildSchedule } = await loadStudentScheduleRepository();

    await expect(
      listParentChildSchedule({
        parentId: "parent-1",
        studentId: "student-unlinked",
        from,
        to,
      }),
    ).rejects.toThrow(/linked child|not linked|forbidden/i);
    expect(prismaMock.scheduledClass.findMany).not.toHaveBeenCalled();
  });

  it("gets parent-scoped lesson detail only for a linked child", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce({
      id: "parent-1",
      children: [{ id: "student-1" }],
    });
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(lessonRecord());

    const { getParentScopedStudentScheduleLesson } = await loadStudentScheduleRepository();
    const result = await getParentScopedStudentScheduleLesson("parent-1", "student-1", "lesson-1");

    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith({
      where: {
        id: "parent-1",
        role: "PARENT",
        children: { some: { id: "student-1" } },
      },
      select: { id: true },
    });
    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "lesson-1",
          OR: [
            { classGroup: { students: { some: { id: "student-1" } } } },
            { students: { some: { id: "student-1" } } },
          ],
        },
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: "lesson-1" }));
  });

  it("blocks parent-scoped lesson detail for an unlinked student", async () => {
    prismaMock.appUser.findFirst.mockResolvedValueOnce(null);

    const { getParentScopedStudentScheduleLesson } = await loadStudentScheduleRepository();

    await expect(
      getParentScopedStudentScheduleLesson("parent-1", "student-unlinked", "lesson-1"),
    ).rejects.toThrow(/linked child|not linked|forbidden/i);
    expect(prismaMock.scheduledClass.findFirst).not.toHaveBeenCalled();
  });
});

describe("canJoinLesson student schedule join window", () => {
  const lesson = {
    startAt: new Date("2026-06-10T10:00:00.000Z"),
    endAt: new Date("2026-06-10T11:00:00.000Z"),
    status: "SCHEDULED" as LessonStatus,
    liveLessonUrl: "https://meet.google.com/abc-defg-hij",
  };

  it("enables join from 15 minutes before start until 15 minutes after end", async () => {
    const { canJoinLesson } = await loadStudentScheduleRepository();

    expect(canJoinLesson(lesson, new Date("2026-06-10T09:44:59.999Z"))).toEqual({
      enabled: false,
      href: null,
      reason: "Available before lesson",
    });
    expect(canJoinLesson(lesson, new Date("2026-06-10T09:45:00.000Z"))).toEqual({
      enabled: true,
      href: "https://meet.google.com/abc-defg-hij",
      reason: null,
    });
    expect(canJoinLesson(lesson, new Date("2026-06-10T11:15:00.000Z"))).toEqual({
      enabled: true,
      href: "https://meet.google.com/abc-defg-hij",
      reason: null,
    });
    expect(canJoinLesson(lesson, new Date("2026-06-10T11:15:00.001Z"))).toEqual({
      enabled: false,
      href: null,
      reason: "Lesson has ended",
    });
  });

  it("disables cancelled and completed lessons", async () => {
    const { canJoinLesson } = await loadStudentScheduleRepository();

    expect(canJoinLesson({ ...lesson, status: "CANCELLED" }, startAt)).toEqual({
      enabled: false,
      href: null,
      reason: "Lesson is cancelled",
    });
    expect(canJoinLesson({ ...lesson, status: "COMPLETED" }, startAt)).toEqual({
      enabled: false,
      href: null,
      reason: "Lesson is completed",
    });
  });

  it("disables lessons without a live URL and keeps provider URL handling outside this helper", async () => {
    const { canJoinLesson } = await loadStudentScheduleRepository();

    expect(canJoinLesson({ ...lesson, liveLessonUrl: null }, startAt)).toEqual({
      enabled: false,
      href: null,
      reason: "Link not available yet",
    });
  });

  it("validates join links against the actual meeting provider", async () => {
    const { canJoinLesson } = await loadStudentScheduleRepository();

    expect(
      canJoinLesson(
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
      reason: expect.stringMatching(/invalid meeting link|not available|missing/i),
    });
    expect(
      canJoinLesson(
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
