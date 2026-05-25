import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    findUnique: vi.fn(),
  },
  classGroup: {
    findUnique: vi.fn(),
  },
  scheduledClass: {
    create: vi.fn(),
    createMany: vi.fn(),
    delete: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  subject: {
    findUnique: vi.fn(),
  },
  teacherAvailabilityRule: {
    findMany: vi.fn(),
  },
  teacherUnavailablePeriod: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type LessonStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
type MeetingProvider = "GOOGLE_MEET" | "ZOOM" | "MANUAL";

type LessonInput = {
  classGroupId: string;
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  timezone?: string;
  teacherId?: string | null;
  subjectId?: string | null;
  liveLessonUrl: string;
  meetingProvider?: MeetingProvider | null;
  reminderMinutesBefore?: number;
};

type AdminLessonRecord = {
  id: string;
  classGroupId: string | null;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  status: LessonStatus;
  liveLessonUrl: string;
  meetingProvider: MeetingProvider | null;
  teacherId: string | null;
  subjectId: string | null;
  classGroup: { id: string; name: string; status?: string } | null;
  teacher: { id: string; fullName: string; email: string; role?: UserRole } | null;
  subject: { id: string; name: string; slug: string } | null;
  remindersCount: number;
  cancelledAt: Date | null;
  cancelReason: string | null;
  completedAt: Date | null;
  rescheduledFromId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LessonMutationResult = AdminLessonRecord & {
  before: Partial<AdminLessonRecord>;
  after: Partial<AdminLessonRecord>;
};

type LessonRepositoryModule = {
  listAdminLessons: (filters?: {
    teacherId?: string;
    classGroupId?: string;
    subjectId?: string;
    status?: LessonStatus;
    from?: Date;
    to?: Date;
  }) => Promise<AdminLessonRecord[]>;
  getLessonById: (id: string) => Promise<AdminLessonRecord | null>;
  createLesson: (input: LessonInput) => Promise<AdminLessonRecord>;
  updateLesson: (id: string, input: Partial<LessonInput>) => Promise<LessonMutationResult>;
  rescheduleLesson: (
    id: string,
    input: {
      startAt: Date;
      endAt: Date;
      teacherId?: string | null;
      liveLessonUrl?: string | null;
    },
  ) => Promise<LessonMutationResult>;
  cancelLesson: (id: string, reason: string) => Promise<LessonMutationResult>;
  completeLesson: (id: string) => Promise<LessonMutationResult>;
  deleteLesson: (id: string) => Promise<{ id: string }>;
  listLessonsForStudent: (
    studentId: string,
    range: { from: Date; to: Date },
  ) => Promise<AdminLessonRecord[]>;
  listLessonsForTeacher: (
    teacherId: string,
    range: { from: Date; to: Date },
  ) => Promise<AdminLessonRecord[]>;
  createRecurringLessons: (input: {
    classGroupId: string;
    title: string;
    description?: string | null;
    startDate: Date;
    endDate: Date;
    weekdays: number[];
    startTime: string;
    endTime: string;
    timezone: string;
    teacherId?: string | null;
    subjectId?: string | null;
    liveLessonUrl: string;
    meetingProvider?: MeetingProvider | null;
  }) => Promise<{ createdCount: number; skippedCount: number; created: AdminLessonRecord[] }>;
};

async function loadLessonRepository() {
  const specifier = "@/lib/repositories/lesson-repository";
  return import(/* @vite-ignore */ specifier) as Promise<LessonRepositoryModule>;
}

describe("lesson-repository ScheduledClass-as-lesson contract", () => {
  const createdAt = new Date("2026-05-01T09:00:00.000Z");
  const updatedAt = new Date("2026-05-10T09:00:00.000Z");
  const startAt = new Date("2026-06-01T10:00:00.000Z");
  const endAt = new Date("2026-06-01T11:00:00.000Z");

  function lessonRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: "lesson-1",
      classGroupId: "group-1",
      title: "Quadratic functions",
      description: "Live problem-solving session",
      startAt,
      endAt,
      timezone: "Europe/Kiev",
      status: "SCHEDULED",
      liveLessonUrl: "https://meet.google.com/abc-defg-hij",
      meetingProvider: "GOOGLE_MEET",
      googleCalendarEventId: "calendar-event-1",
      googleMeetSpaceName: "spaces/meet-space-1",
      teacherId: "teacher-1",
      subjectId: "subject-math",
      reminderMinutesBefore: 60,
      cancelledAt: null,
      cancelReason: null,
      completedAt: null,
      rescheduledFromId: null,
      classGroup: {
        id: "group-1",
        name: "IGCSE Mathematics Group A",
        status: "ACTIVE",
        teacherId: "teacher-1",
        subjectId: "subject-math",
      },
      teacher: {
        id: "teacher-1",
        fullName: "Jane Teacher",
        email: "jane.teacher@example.com",
        role: UserRole.TEACHER,
      },
      subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
      students: [],
      assignments: [],
      _count: {
        reminders: 2,
        assignments: 0,
        courseMaterials: 0,
      },
      createdAt,
      updatedAt,
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.teacherUnavailablePeriod.findMany.mockResolvedValue([]);
    prismaMock.scheduledClass.findFirst.mockResolvedValue(null);
  });

  it("lists admin lessons with filters, schedule metadata, relations, and reminder counts", async () => {
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([lessonRecord()]);

    const { listAdminLessons } = await loadLessonRepository();
    const result = await listAdminLessons({
      teacherId: "teacher-1",
      classGroupId: "group-1",
      subjectId: "subject-math",
      status: "SCHEDULED",
      from: new Date("2026-06-01T00:00:00.000Z"),
      to: new Date("2026-06-30T23:59:59.999Z"),
    });

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teacherId: "teacher-1",
          classGroupId: "group-1",
          subjectId: "subject-math",
          status: "SCHEDULED",
          startAt: {
            gte: new Date("2026-06-01T00:00:00.000Z"),
            lte: new Date("2026-06-30T23:59:59.999Z"),
          },
        }),
        include: expect.objectContaining({
          classGroup: expect.any(Object),
          teacher: expect.any(Object),
          subject: expect.any(Object),
          _count: { select: { reminders: true } },
        }),
        orderBy: [{ startAt: "asc" }, { title: "asc" }],
      }),
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        title: "Quadratic functions",
        classGroup: expect.objectContaining({ name: "IGCSE Mathematics Group A" }),
        teacher: expect.objectContaining({ fullName: "Jane Teacher" }),
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        startAt,
        endAt,
        status: "SCHEDULED",
        liveLessonUrl: "https://meet.google.com/abc-defg-hij",
        remindersCount: 2,
      }),
    );
  });

  it("gets one lesson by id with full admin display and lifecycle fields", async () => {
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce(lessonRecord());

    const { getLessonById } = await loadLessonRepository();
    const result = await getLessonById("lesson-1");

    expect(prismaMock.scheduledClass.findUnique).toHaveBeenCalledWith({
      where: { id: "lesson-1" },
      include: expect.objectContaining({
        classGroup: expect.any(Object),
        teacher: expect.any(Object),
        subject: expect.any(Object),
        _count: { select: { reminders: true } },
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: "lesson-1",
        timezone: "Europe/Kiev",
        status: "SCHEDULED",
        cancelledAt: null,
        cancelReason: null,
        rescheduledFromId: null,
      }),
    );
  });

  it("validates lesson creation time range, teacher role, active class group, required URL, and Google Meet URL shape", async () => {
    const { createLesson } = await loadLessonRepository();

    await expect(
      createLesson({
        classGroupId: "group-1",
        title: "Invalid time range",
        startAt: endAt,
        endAt: startAt,
        liveLessonUrl: "https://meet.google.com/abc-defg-hij",
      }),
    ).rejects.toThrow(/start.*before.*end|end.*after.*start/i);

    await expect(
      createLesson({
        classGroupId: "group-1",
        title: "Missing live URL",
        startAt,
        endAt,
        liveLessonUrl: "",
      }),
    ).rejects.toThrow(/live.*url|required/i);

    await expect(
      createLesson({
        classGroupId: "group-1",
        title: "Invalid Google Meet",
        startAt,
        endAt,
        liveLessonUrl: "https://zoom.us/j/123",
        meetingProvider: "GOOGLE_MEET",
      }),
    ).rejects.toThrow(/google meet|meet\.google\.com/i);

    expect(prismaMock.scheduledClass.create).not.toHaveBeenCalled();
  });

  it("creates a lesson and defaults teacher and subject from the active class group when omitted", async () => {
    prismaMock.classGroup.findUnique.mockResolvedValueOnce({
      id: "group-1",
      status: "ACTIVE",
      teacherId: "teacher-1",
      subjectId: "subject-math",
    });
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "teacher-1",
      role: UserRole.TEACHER,
    });
    prismaMock.subject.findUnique.mockResolvedValueOnce({ id: "subject-math" });
    prismaMock.scheduledClass.create.mockResolvedValueOnce(lessonRecord());

    const { createLesson } = await loadLessonRepository();
    const result = await createLesson({
      classGroupId: "group-1",
      title: "Quadratic functions",
      description: "Live problem-solving session",
      startAt,
      endAt,
      timezone: "Europe/Kiev",
      liveLessonUrl: "https://meet.google.com/abc-defg-hij",
      meetingProvider: "GOOGLE_MEET",
    });

    expect(prismaMock.classGroup.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "group-1" } }),
    );
    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: "teacher-1" },
      select: { id: true, role: true },
    });
    expect(prismaMock.scheduledClass.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Quadratic functions",
          classGroup: { connect: { id: "group-1" } },
          teacher: { connect: { id: "teacher-1" } },
          subject: { connect: { id: "subject-math" } },
          status: "SCHEDULED",
          timezone: "Europe/Kiev",
          liveLessonUrl: "https://meet.google.com/abc-defg-hij",
          meetingProvider: "GOOGLE_MEET",
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: "lesson-1", status: "SCHEDULED" }));
  });

  it.each([
    {
      label: "missing class group",
      classGroup: null,
      teacher: null,
      error: /class group/i,
    },
    {
      label: "inactive class group",
      classGroup: { id: "group-1", status: "PAUSED", teacherId: "teacher-1", subjectId: null },
      teacher: { id: "teacher-1", role: UserRole.TEACHER },
      error: /active/i,
    },
    {
      label: "non-teacher account",
      classGroup: { id: "group-1", status: "ACTIVE", teacherId: "student-1", subjectId: null },
      teacher: { id: "student-1", role: UserRole.STUDENT },
      error: /teacher/i,
    },
  ])("rejects creating a lesson for $label", async ({ classGroup, teacher, error }) => {
    prismaMock.classGroup.findUnique.mockResolvedValueOnce(classGroup);
    if (teacher) {
      prismaMock.appUser.findUnique.mockResolvedValueOnce(teacher);
    }

    const { createLesson } = await loadLessonRepository();

    await expect(
      createLesson({
        classGroupId: "group-1",
        title: "Validation lesson",
        startAt,
        endAt,
        liveLessonUrl: "https://meet.google.com/abc-defg-hij",
      }),
    ).rejects.toThrow(error);
    expect(prismaMock.scheduledClass.create).not.toHaveBeenCalled();
  });

  it("updates a lesson and returns meaningful before and after snapshots", async () => {
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce(
      lessonRecord({ title: "Old title", liveLessonUrl: "https://meet.google.com/old-code" }),
    );
    prismaMock.scheduledClass.update.mockResolvedValueOnce(
      lessonRecord({ title: "Updated title", liveLessonUrl: "https://meet.google.com/new-code" }),
    );

    const { updateLesson } = await loadLessonRepository();
    const result = await updateLesson("lesson-1", {
      title: "Updated title",
      liveLessonUrl: "https://meet.google.com/new-code",
    });

    expect(prismaMock.scheduledClass.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lesson-1" },
        data: expect.objectContaining({
          title: "Updated title",
          liveLessonUrl: "https://meet.google.com/new-code",
        }),
      }),
    );
    expect(result.before).toEqual(expect.objectContaining({ id: "lesson-1", title: "Old title" }));
    expect(result.before).not.toEqual({ id: "lesson-1" });
    expect(result.after).toEqual(
      expect.objectContaining({ id: "lesson-1", title: "Updated title" }),
    );
  });

  it("reschedules a lesson with new time, optional teacher, optional live URL, and reschedule metadata", async () => {
    const newStart = new Date("2026-06-08T10:00:00.000Z");
    const newEnd = new Date("2026-06-08T11:00:00.000Z");
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce(lessonRecord());
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "teacher-2",
      role: UserRole.TEACHER,
    });
    prismaMock.scheduledClass.update.mockResolvedValueOnce(
      lessonRecord({
        startAt: newStart,
        endAt: newEnd,
        teacherId: "teacher-2",
        liveLessonUrl: "https://meet.google.com/res-ched-ule",
        status: "RESCHEDULED",
        rescheduledFromId: "lesson-1",
      }),
    );

    const { rescheduleLesson } = await loadLessonRepository();
    const result = await rescheduleLesson("lesson-1", {
      startAt: newStart,
      endAt: newEnd,
      teacherId: "teacher-2",
      liveLessonUrl: "https://meet.google.com/res-ched-ule",
    });

    expect(prismaMock.scheduledClass.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lesson-1" },
        data: expect.objectContaining({
          startAt: newStart,
          endAt: newEnd,
          teacher: { connect: { id: "teacher-2" } },
          liveLessonUrl: "https://meet.google.com/res-ched-ule",
          status: "RESCHEDULED",
          rescheduledFromId: "lesson-1",
        }),
      }),
    );
    expect(result.before).toEqual(expect.objectContaining({ startAt, endAt }));
    expect(result.after).toEqual(
      expect.objectContaining({ startAt: newStart, endAt: newEnd, status: "RESCHEDULED" }),
    );
  });

  it("cancels a lesson by setting status, cancellation timestamp, and visible reason", async () => {
    const cancelledAt = new Date("2026-05-15T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(cancelledAt);
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce(lessonRecord());
    prismaMock.scheduledClass.update.mockResolvedValueOnce(
      lessonRecord({
        status: "CANCELLED",
        cancelledAt,
        cancelReason: "Teacher unavailable",
      }),
    );

    const { cancelLesson } = await loadLessonRepository();
    const result = await cancelLesson("lesson-1", "Teacher unavailable");

    expect(prismaMock.scheduledClass.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lesson-1" },
        data: expect.objectContaining({
          status: "CANCELLED",
          cancelledAt: expect.any(Date),
          cancelReason: "Teacher unavailable",
        }),
      }),
    );
    expect(result.after).toEqual(
      expect.objectContaining({
        status: "CANCELLED",
        cancelledAt,
        cancelReason: "Teacher unavailable",
      }),
    );
    vi.useRealTimers();
  });

  it("marks a lesson complete without changing class group membership", async () => {
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce(lessonRecord({ status: "LIVE" }));
    prismaMock.scheduledClass.update.mockResolvedValueOnce(lessonRecord({ status: "COMPLETED" }));

    const { completeLesson } = await loadLessonRepository();
    const result = await completeLesson("lesson-1");

    expect(prismaMock.scheduledClass.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lesson-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          completedAt: expect.any(Date),
        }),
      }),
    );
    expect(prismaMock.scheduledClass.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ teacherStudents: expect.anything() }),
      }),
    );
    expect(result.after).toEqual(expect.objectContaining({ status: "COMPLETED" }));
  });

  it("records completion timestamp when marking a lesson complete", async () => {
    const completedAt = new Date("2026-05-15T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(completedAt);
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce(lessonRecord({ status: "LIVE" }));
    prismaMock.scheduledClass.update.mockResolvedValueOnce(
      lessonRecord({ status: "COMPLETED", completedAt }),
    );

    const { completeLesson } = await loadLessonRepository();
    try {
      const result = await completeLesson("lesson-1");

      expect(prismaMock.scheduledClass.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "lesson-1" },
          data: expect.objectContaining({
            status: "COMPLETED",
            completedAt: expect.any(Date),
          }),
        }),
      );
      expect(result.after).toEqual(
        expect.objectContaining({
          status: "COMPLETED",
          completedAt,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    {
      label: "cancel a completed lesson",
      beforeStatus: "COMPLETED" as LessonStatus,
      mutate: (repository: LessonRepositoryModule) =>
        repository.cancelLesson("lesson-1", "Teacher unavailable"),
    },
    {
      label: "complete a cancelled lesson",
      beforeStatus: "CANCELLED" as LessonStatus,
      mutate: (repository: LessonRepositoryModule) => repository.completeLesson("lesson-1"),
    },
    {
      label: "reschedule a cancelled lesson",
      beforeStatus: "CANCELLED" as LessonStatus,
      mutate: (repository: LessonRepositoryModule) =>
        repository.rescheduleLesson("lesson-1", {
          startAt: new Date("2026-06-08T10:00:00.000Z"),
          endAt: new Date("2026-06-08T11:00:00.000Z"),
        }),
    },
    {
      label: "update a rescheduled lesson back to scheduled",
      beforeStatus: "RESCHEDULED" as LessonStatus,
      mutate: (repository: LessonRepositoryModule) =>
        repository.updateLesson("lesson-1", { status: "SCHEDULED" } as Partial<LessonInput>),
    },
  ])("rejects invalid status transition: $label", async ({ beforeStatus, mutate }) => {
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce(
      lessonRecord({ status: beforeStatus }),
    );

    const repository = await loadLessonRepository();

    await expect(mutate(repository)).rejects.toThrow(
      /invalid status transition|cancelled|completed|rescheduled/i,
    );
    expect(prismaMock.scheduledClass.update).not.toHaveBeenCalled();
  });

  it("deletes a dependency-free lesson", async () => {
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce(
      lessonRecord({
        assignments: [],
        _count: { assignments: 0, courseMaterials: 0, reminders: 0 },
      }),
    );
    prismaMock.scheduledClass.delete.mockResolvedValueOnce({ id: "lesson-1" });

    const { deleteLesson } = await loadLessonRepository();
    const result = await deleteLesson("lesson-1");

    expect(prismaMock.scheduledClass.findUnique).toHaveBeenCalledWith({
      where: { id: "lesson-1" },
      include: expect.objectContaining({
        assignments: expect.objectContaining({
          select: { _count: { select: { submissions: true } } },
        }),
        _count: { select: { assignments: true, courseMaterials: true, reminders: true } },
      }),
    });
    expect(prismaMock.scheduledClass.delete).toHaveBeenCalledWith({ where: { id: "lesson-1" } });
    expect(result).toEqual({ id: "lesson-1" });
  });

  it.each([
    {
      dependency: "assignments",
      record: lessonRecord({
        assignments: [],
        _count: { assignments: 1, courseMaterials: 0, reminders: 0 },
      }),
    },
    {
      dependency: "submissions through assignments",
      record: lessonRecord({
        assignments: [{ _count: { submissions: 2 } }],
        _count: { assignments: 1, courseMaterials: 0, reminders: 0 },
      }),
    },
    {
      dependency: "course materials",
      record: lessonRecord({
        assignments: [],
        _count: { assignments: 0, courseMaterials: 1, reminders: 0 },
      }),
    },
    {
      dependency: "reminders",
      record: lessonRecord({
        assignments: [],
        _count: { assignments: 0, courseMaterials: 0, reminders: 1 },
      }),
    },
  ])("blocks deleting a lesson with $dependency", async ({ record }) => {
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce(record);

    const { deleteLesson } = await loadLessonRepository();

    await expect(deleteLesson("lesson-1")).rejects.toThrow(
      /dependencies|assignments|submissions|materials|reminders/i,
    );
    expect(prismaMock.scheduledClass.delete).not.toHaveBeenCalled();
  });

  it("lists student lessons from enrolled class groups and backward-compatible direct lesson enrolment", async () => {
    const range = {
      from: new Date("2026-06-01T00:00:00.000Z"),
      to: new Date("2026-06-30T23:59:59.999Z"),
    };
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      lessonRecord({ id: "group-lesson" }),
      lessonRecord({ id: "direct-lesson", classGroupId: null, classGroup: null }),
    ]);

    const { listLessonsForStudent } = await loadLessonRepository();
    const result = await listLessonsForStudent("student-1", range);

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          startAt: { gte: range.from, lt: range.to },
          OR: [
            { classGroup: { students: { some: { id: "student-1" } } } },
            { students: { some: { id: "student-1" } } },
          ],
        },
      }),
    );
    expect(result.map((lesson) => lesson.id)).toEqual(["group-lesson", "direct-lesson"]);
    expect(JSON.stringify(result)).not.toContain("unrelated-student");
  });

  it("lists teacher lessons from direct lesson assignment and class group assignment", async () => {
    const range = {
      from: new Date("2026-06-01T00:00:00.000Z"),
      to: new Date("2026-06-30T23:59:59.999Z"),
    };
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      lessonRecord({ id: "direct-teacher-lesson" }),
      lessonRecord({ id: "group-teacher-lesson", teacherId: null }),
    ]);

    const { listLessonsForTeacher } = await loadLessonRepository();
    const result = await listLessonsForTeacher("teacher-1", range);

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          startAt: { gte: range.from, lt: range.to },
          OR: [{ teacherId: "teacher-1" }, { classGroup: { teacherId: "teacher-1" } }],
        },
      }),
    );
    expect(result.map((lesson) => lesson.id)).toEqual([
      "direct-teacher-lesson",
      "group-teacher-lesson",
    ]);
    expect(JSON.stringify(result)).not.toContain("unrelated-teacher");
  });

  it("creates weekly recurring lessons for selected weekdays, respects date bounds, and skips duplicate dates", async () => {
    prismaMock.classGroup.findUnique.mockResolvedValueOnce({
      id: "group-1",
      status: "ACTIVE",
      teacherId: "teacher-1",
      subjectId: "subject-math",
    });
    prismaMock.appUser.findUnique.mockResolvedValue({
      id: "teacher-1",
      role: UserRole.TEACHER,
    });
    prismaMock.teacherAvailabilityRule.findMany.mockResolvedValue([
      {
        id: "rule-monday",
        teacherId: "teacher-1",
        weekday: 1,
        startTime: "09:00",
        endTime: "12:00",
        timezone: "Europe/Kiev",
        status: "ACTIVE",
      },
      {
        id: "rule-wednesday",
        teacherId: "teacher-1",
        weekday: 3,
        startTime: "09:00",
        endTime: "12:00",
        timezone: "Europe/Kiev",
        status: "ACTIVE",
      },
    ]);
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      {
        id: "existing-lesson",
        startAt: new Date("2026-06-03T07:00:00.000Z"),
      },
    ]);
    prismaMock.scheduledClass.createMany.mockResolvedValueOnce({ count: 2 });
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      lessonRecord({ id: "created-1", startAt: new Date("2026-06-01T07:00:00.000Z") }),
      lessonRecord({ id: "created-2", startAt: new Date("2026-06-08T07:00:00.000Z") }),
    ]);

    const { createRecurringLessons } = await loadLessonRepository();
    const result = await createRecurringLessons({
      classGroupId: "group-1",
      title: "Weekly mathematics lesson",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2026-06-10T23:59:59.999Z"),
      weekdays: [1, 3],
      startTime: "10:00",
      endTime: "11:00",
      timezone: "Europe/Kiev",
      liveLessonUrl: "https://meet.google.com/abc-defg-hij",
      meetingProvider: "GOOGLE_MEET",
    });

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classGroupId: "group-1",
          startAt: expect.objectContaining({
            gte: new Date("2026-06-01T00:00:00.000Z"),
            lte: new Date("2026-06-10T23:59:59.999Z"),
          }),
        }),
        select: { id: true, startAt: true },
      }),
    );
    expect(prismaMock.scheduledClass.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            classGroupId: "group-1",
            title: "Weekly mathematics lesson",
            startAt: new Date("2026-06-01T07:00:00.000Z"),
            endAt: new Date("2026-06-01T08:00:00.000Z"),
          }),
          expect.objectContaining({
            classGroupId: "group-1",
            title: "Weekly mathematics lesson",
            startAt: new Date("2026-06-08T07:00:00.000Z"),
            endAt: new Date("2026-06-08T08:00:00.000Z"),
          }),
        ]),
      }),
    );
    expect(prismaMock.scheduledClass.createMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ startAt: new Date("2026-06-03T07:00:00.000Z") }),
        ]),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        createdCount: 2,
        skippedCount: 1,
        created: expect.arrayContaining([
          expect.objectContaining({ id: "created-1" }),
          expect.objectContaining({ id: "created-2" }),
        ]),
      }),
    );
  });

  it("blocks recurring lesson generation outside teacher weekly availability", async () => {
    prismaMock.classGroup.findUnique.mockResolvedValueOnce({
      id: "group-1",
      status: "ACTIVE",
      teacherId: "teacher-1",
      subjectId: "subject-math",
    });
    prismaMock.appUser.findUnique.mockResolvedValue({
      id: "teacher-1",
      role: UserRole.TEACHER,
    });
    prismaMock.teacherAvailabilityRule.findMany.mockResolvedValue([
      {
        id: "rule-monday",
        teacherId: "teacher-1",
        weekday: 1,
        startTime: "09:00",
        endTime: "12:00",
        timezone: "Europe/Kiev",
        status: "ACTIVE",
      },
    ]);
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([]);

    const { createRecurringLessons } = await loadLessonRepository();

    await expect(
      createRecurringLessons({
        classGroupId: "group-1",
        title: "Weekly mathematics lesson",
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        endDate: new Date("2026-06-03T23:59:59.999Z"),
        weekdays: [1, 3],
        startTime: "10:00",
        endTime: "11:00",
        timezone: "Europe/Kiev",
        liveLessonUrl: "https://meet.google.com/abc-defg-hij",
        meetingProvider: "GOOGLE_MEET",
      }),
    ).rejects.toThrow(
      "Teacher is not available at this time. The lesson is outside weekly availability.",
    );

    expect(prismaMock.scheduledClass.createMany).not.toHaveBeenCalled();
  });
});
