import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    findUnique: vi.fn(),
  },
  scheduledClass: {
    count: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  subject: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type AdminScheduledClassRepository = {
  getAdminScheduledClassById: (classId: string) => Promise<{
    id: string;
    title: string;
    description: string | null;
    startAt: Date;
    endAt: Date;
    liveLessonUrl: string;
    subjectId: string | null;
    subject: { id: string; name: string; slug: string } | null;
    teacherId: string | null;
    teacher: { id: string; fullName: string; email: string; isActive: boolean } | null;
    students: Array<{ id: string; fullName: string; email: string; isActive: boolean }>;
  } | null>;
  createScheduledClass: (data: {
    title: string;
    description?: string | null;
    startAt: Date;
    endAt: Date;
    liveLessonUrl: string;
    teacherId: string;
    subjectId?: string | null;
  }) => Promise<{ id: string; title: string; teacherId: string | null; subjectId: string | null }>;
  updateScheduledClass: (
    classId: string,
    data: {
      title?: string;
      description?: string | null;
      startAt?: Date;
      endAt?: Date;
      liveLessonUrl?: string;
      teacherId?: string;
      subjectId?: string | null;
    },
  ) => Promise<{ id: string; title: string; teacherId: string | null; subjectId: string | null }>;
  deleteScheduledClass: (classId: string) => Promise<{ id: string }>;
  listScheduleForUser: (
    userId: string,
    role: UserRole,
    monthStart: Date,
    monthEnd: Date,
  ) => Promise<
    Array<{
      id: string;
      title: string;
      teacherId: string | null;
      subject: { id: string; name: string; slug: string } | null;
      classGroup?: { id: string; name: string } | null;
    }>
  >;
  listUpcomingClassesForReminders: (
    windowStart: Date,
    windowEnd: Date,
  ) => Promise<
    Array<{
      id: string;
      title: string;
      status?: string;
      reminderMinutesBefore: number;
      classGroup?: {
        teacher?: { id: string } | null;
        students?: Array<{ id: string }>;
      } | null;
      students: Array<{ id: string }>;
      reminders: Array<{
        recipientUserId: string;
        channel: string;
        status: string;
        createdAt: Date;
      }>;
    }>
  >;
};

async function loadScheduleRepository() {
  const repository = await import("@/lib/repositories/schedule-repository");
  return repository as unknown as AdminScheduledClassRepository;
}

describe("Admin scheduled class repository contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gets one admin class with inactive assigned teacher and enrolled students for editing", async () => {
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce({
      id: "class-1",
      title: "IGCSE Mathematics - Group A",
      description: "Algebra and functions",
      startAt: new Date("2026-06-01T10:00:00.000Z"),
      endAt: new Date("2026-06-01T11:00:00.000Z"),
      liveLessonUrl: "https://meet.example.com/math-a",
      subjectId: "subject-math",
      subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
      teacherId: "teacher-inactive",
      teacher: {
        id: "teacher-inactive",
        fullName: "Inactive Teacher",
        email: "inactive.teacher@example.com",
        isActive: false,
      },
      students: [{ id: "student-1", fullName: "Sofia Shevchenko", email: "sofia@example.com" }],
    });

    const { getAdminScheduledClassById } = await loadScheduleRepository();
    const result = await getAdminScheduledClassById("class-1");

    expect(prismaMock.scheduledClass.findUnique).toHaveBeenCalledWith({
      where: { id: "class-1" },
      include: expect.objectContaining({
        teacher: { select: { id: true, fullName: true, email: true, isActive: true } },
        students: { select: { id: true, fullName: true, email: true, isActive: true } },
        subject: { select: { id: true, name: true, slug: true } },
      }),
    });
    expect(result?.teacher).toEqual(
      expect.objectContaining({ id: "teacher-inactive", isActive: false }),
    );
  });

  it("creates a scheduled class assigned to an existing TEACHER account", async () => {
    const startAt = new Date("2026-06-01T10:00:00.000Z");
    const endAt = new Date("2026-06-01T11:00:00.000Z");
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "teacher-1",
      role: UserRole.TEACHER,
    });
    prismaMock.subject.findUnique.mockResolvedValueOnce({
      id: "subject-math",
      name: "Mathematics",
      slug: "mathematics",
      isActive: true,
    });
    prismaMock.scheduledClass.create.mockResolvedValueOnce({
      id: "class-1",
      title: "IGCSE Mathematics - Group A",
      teacherId: "teacher-1",
      subjectId: "subject-math",
    });

    const { createScheduledClass } = await loadScheduleRepository();
    const result = await createScheduledClass({
      title: "IGCSE Mathematics - Group A",
      description: "Algebra and functions",
      startAt,
      endAt,
      liveLessonUrl: "https://meet.example.com/math-a",
      teacherId: "teacher-1",
      subjectId: "subject-math",
    });

    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: "teacher-1" },
      select: { id: true, role: true },
    });
    expect(prismaMock.scheduledClass.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "IGCSE Mathematics - Group A",
        teacher: { connect: { id: "teacher-1" } },
        subjectId: "subject-math",
      }),
    });
    expect(prismaMock.subject.findUnique).toHaveBeenCalledWith({
      where: { id: "subject-math" },
      select: { id: true, isActive: true },
    });
    expect(result).toEqual(
      expect.objectContaining({ teacherId: "teacher-1", subjectId: "subject-math" }),
    );
  });

  it("rejects a selected subjectId that does not exist before creating a scheduled class", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "teacher-1",
      role: UserRole.TEACHER,
    });
    prismaMock.subject.findUnique.mockResolvedValueOnce(null);

    const { createScheduledClass } = await loadScheduleRepository();

    await expect(
      createScheduledClass({
        title: "Invalid Subject Class",
        startAt: new Date("2026-06-01T10:00:00.000Z"),
        endAt: new Date("2026-06-01T11:00:00.000Z"),
        liveLessonUrl: "https://meet.example.com/invalid",
        teacherId: "teacher-1",
        subjectId: "missing-subject",
      }),
    ).rejects.toThrow(/subject/i);
    expect(prismaMock.scheduledClass.create).not.toHaveBeenCalled();
  });

  it("rejects non-teacher accounts as a scheduled class teacher", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({ id: "parent-1", role: UserRole.PARENT });

    const { createScheduledClass } = await loadScheduleRepository();

    await expect(
      createScheduledClass({
        title: "Invalid Teacher Class",
        startAt: new Date("2026-06-01T10:00:00.000Z"),
        endAt: new Date("2026-06-01T11:00:00.000Z"),
        liveLessonUrl: "https://meet.example.com/invalid",
        teacherId: "parent-1",
      }),
    ).rejects.toThrow(/teacher/i);
    expect(prismaMock.scheduledClass.create).not.toHaveBeenCalled();
  });

  it("updates class fields and teacher assignment without directly assigning students to teachers", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "teacher-2",
      role: UserRole.TEACHER,
    });
    prismaMock.subject.findUnique.mockResolvedValueOnce({
      id: "subject-biology",
      isActive: true,
    });
    prismaMock.scheduledClass.update.mockResolvedValueOnce({
      id: "class-1",
      title: "Updated Class",
      teacherId: "teacher-2",
      subjectId: "subject-biology",
    });

    const { updateScheduledClass } = await loadScheduleRepository();
    await updateScheduledClass("class-1", {
      title: "Updated Class",
      teacherId: "teacher-2",
      subjectId: "subject-biology",
    });

    expect(prismaMock.scheduledClass.update).toHaveBeenCalledWith({
      where: { id: "class-1" },
      data: expect.objectContaining({
        title: "Updated Class",
        teacher: { connect: { id: "teacher-2" } },
        subjectId: "subject-biology",
      }),
    });
    expect(prismaMock.subject.findUnique).toHaveBeenCalledWith({
      where: { id: "subject-biology" },
      select: { id: true, isActive: true },
    });
    expect(prismaMock.scheduledClass.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ teacherStudents: expect.anything() }),
      }),
    );
  });

  it("deletes or archives a scheduled class by changing database state, not by findUnique-only success", async () => {
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce({
      id: "class-1",
      _count: { students: 0, assignments: 0, courseMaterials: 0, reminders: 0 },
      assignments: [],
    });
    prismaMock.scheduledClass.delete.mockResolvedValueOnce({ id: "class-1" });

    const { deleteScheduledClass } = await loadScheduleRepository();
    await deleteScheduledClass("class-1");

    expect(prismaMock.scheduledClass.findUnique).toHaveBeenCalledWith({
      where: { id: "class-1" },
      include: expect.objectContaining({
        _count: expect.objectContaining({
          select: expect.objectContaining({
            students: true,
            assignments: true,
            courseMaterials: true,
            reminders: true,
          }),
        }),
        assignments: expect.objectContaining({
          select: expect.objectContaining({
            _count: { select: { submissions: true } },
          }),
        }),
      }),
    });
    expect(
      prismaMock.scheduledClass.delete.mock.calls.length +
        prismaMock.scheduledClass.update.mock.calls.length,
    ).toBeGreaterThan(0);
  });

  it("rejects destructive delete when the scheduled class has dependencies", async () => {
    prismaMock.scheduledClass.findUnique.mockResolvedValueOnce({
      id: "class-with-dependencies",
      title: "Protected Class",
      _count: {
        students: 2,
        assignments: 1,
        courseMaterials: 1,
        reminders: 1,
      },
      assignments: [{ _count: { submissions: 3 } }],
    });

    const { deleteScheduledClass } = await loadScheduleRepository();

    await expect(deleteScheduledClass("class-with-dependencies")).rejects.toThrow(
      /dependencies|cannot be deleted safely/i,
    );
    expect(prismaMock.scheduledClass.delete).not.toHaveBeenCalled();
    expect(prismaMock.scheduledClass.update).not.toHaveBeenCalled();
  });

  it("keeps student schedule visibility based on direct or group enrolment while including subject display data", async () => {
    const monthStart = new Date("2026-06-01T00:00:00.000Z");
    const monthEnd = new Date("2026-07-01T00:00:00.000Z");
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      {
        id: "class-1",
        title: "IGCSE Mathematics - Group A",
        teacherId: "teacher-1",
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
      },
    ]);

    const { listScheduleForUser } = await loadScheduleRepository();
    const result = await listScheduleForUser("student-1", UserRole.STUDENT, monthStart, monthEnd);

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startAt: { gte: monthStart, lt: monthEnd },
          OR: [
            { students: { some: { id: "student-1" } } },
            { classGroup: { students: { some: { id: "student-1" } } } },
          ],
        }),
        include: expect.objectContaining({
          teacher: expect.any(Object),
          subject: { select: { id: true, name: true, slug: true } },
          classGroup: { select: { id: true, name: true } },
        }),
      }),
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: "class-1",
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
      }),
    );
  });

  it("lists student lessons through ClassGroup enrolment without requiring direct ScheduledClass.students enrolment", async () => {
    const monthStart = new Date("2026-06-01T00:00:00.000Z");
    const monthEnd = new Date("2026-07-01T00:00:00.000Z");
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      {
        id: "lesson-group-math",
        title: "Quadratic functions",
        teacherId: null,
        students: [],
        classGroupId: "group-math-a",
        classGroup: {
          id: "group-math-a",
          name: "IGCSE Mathematics Group A",
          students: [{ id: "student-1" }],
        },
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
      },
    ]);

    const { listScheduleForUser } = await loadScheduleRepository();
    const result = await listScheduleForUser("student-1", UserRole.STUDENT, monthStart, monthEnd);

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          startAt: { gte: monthStart, lt: monthEnd },
          OR: [
            { students: { some: { id: "student-1" } } },
            { classGroup: { students: { some: { id: "student-1" } } } },
          ],
        },
        include: expect.objectContaining({
          classGroup: {
            select: {
              id: true,
              name: true,
            },
          },
          subject: { select: { id: true, name: true, slug: true } },
        }),
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "lesson-group-math",
        classGroup: expect.objectContaining({ id: "group-math-a" }),
      }),
    ]);
  });

  it("lists parent lessons through linked children direct and ClassGroup enrolments", async () => {
    const monthStart = new Date("2026-06-01T00:00:00.000Z");
    const monthEnd = new Date("2026-07-01T00:00:00.000Z");
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "parent-1",
      children: [{ id: "student-1" }, { id: "student-2" }],
    });
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      {
        id: "lesson-direct-child",
        title: "Direct child lesson",
        teacherId: "teacher-1",
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        classGroup: null,
      },
      {
        id: "lesson-group-child",
        title: "Group child lesson",
        teacherId: null,
        classGroupId: "group-math-a",
        classGroup: { id: "group-math-a", name: "IGCSE Mathematics Group A" },
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
      },
    ]);

    const { listScheduleForUser } = await loadScheduleRepository();
    const result = await listScheduleForUser("parent-1", UserRole.PARENT, monthStart, monthEnd);

    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: "parent-1" },
      select: { children: { select: { id: true } } },
    });
    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          startAt: { gte: monthStart, lt: monthEnd },
          OR: [
            { students: { some: { id: { in: ["student-1", "student-2"] } } } },
            {
              classGroup: {
                students: { some: { id: { in: ["student-1", "student-2"] } } },
              },
            },
          ],
        },
        include: expect.objectContaining({
          classGroup: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true, slug: true } },
        }),
      }),
    );
    expect(result.map((lesson) => lesson.id)).toEqual([
      "lesson-direct-child",
      "lesson-group-child",
    ]);
    expect(JSON.stringify(result)).not.toContain("Unrelated Group Lesson");
  });

  it("lists teacher lessons assigned directly or through ClassGroup ownership while excluding unrelated groups", async () => {
    const monthStart = new Date("2026-06-01T00:00:00.000Z");
    const monthEnd = new Date("2026-07-01T00:00:00.000Z");
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      {
        id: "lesson-direct-teacher",
        title: "Direct teacher lesson",
        teacherId: "teacher-1",
        classGroup: null,
      },
      {
        id: "lesson-group-teacher",
        title: "Group teacher lesson",
        teacherId: null,
        classGroupId: "group-math-a",
        classGroup: { id: "group-math-a", name: "IGCSE Mathematics Group A" },
      },
    ]);

    const { listScheduleForUser } = await loadScheduleRepository();
    const result = await listScheduleForUser("teacher-1", UserRole.TEACHER, monthStart, monthEnd);

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          startAt: { gte: monthStart, lt: monthEnd },
          OR: [{ teacherId: "teacher-1" }, { classGroup: { teacherId: "teacher-1" } }],
        },
        include: expect.objectContaining({
          classGroup: { select: { id: true, name: true } },
        }),
      }),
    );
    expect(result.map((lesson) => lesson.id)).toEqual([
      "lesson-direct-teacher",
      "lesson-group-teacher",
    ]);
    expect(JSON.stringify(result)).not.toContain("Unrelated Group");
  });

  it("lists all lessons for ADMIN while still including ClassGroup display data", async () => {
    const monthStart = new Date("2026-06-01T00:00:00.000Z");
    const monthEnd = new Date("2026-07-01T00:00:00.000Z");
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      {
        id: "lesson-admin",
        title: "Admin visible lesson",
        classGroup: { id: "group-any", name: "Any Group" },
      },
    ]);

    const { listScheduleForUser } = await loadScheduleRepository();
    await listScheduleForUser("admin-1", UserRole.ADMIN, monthStart, monthEnd);

    const call = prismaMock.scheduledClass.findMany.mock.calls.at(-1)?.[0];
    expect(call).toEqual(
      expect.objectContaining({
        where: {
          startAt: { gte: monthStart, lt: monthEnd },
        },
        include: expect.objectContaining({
          classGroup: { select: { id: true, name: true } },
        }),
      }),
    );
    expect(call.where).not.toHaveProperty("OR");
  });

  it("lists reminder candidates only for upcoming SCHEDULED/LIVE lessons with recipient scope and recent reminder logs", async () => {
    const windowStart = new Date("2026-06-01T09:00:00.000Z");
    const windowEnd = new Date("2026-06-01T10:10:00.000Z");
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      {
        id: "lesson-1",
        title: "Quadratic functions",
        status: "SCHEDULED",
        reminderMinutesBefore: 60,
        teacherId: "teacher-direct",
        teacher: { id: "teacher-direct" },
        students: [{ id: "student-direct" }],
        classGroup: {
          id: "group-1",
          teacher: { id: "teacher-group" },
          students: [{ id: "student-group" }],
        },
        reminders: [
          {
            recipientUserId: "student-direct",
            channel: "EMAIL",
            status: "SENT",
            createdAt: new Date("2026-06-01T09:05:00.000Z"),
          },
        ],
      },
    ]);

    const { listUpcomingClassesForReminders } = await loadScheduleRepository();
    const result = await listUpcomingClassesForReminders(windowStart, windowEnd);

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startAt: { gte: windowStart, lte: windowEnd },
          status: { in: ["SCHEDULED", "LIVE", "RESCHEDULED"] },
        }),
        include: expect.objectContaining({
          teacher: expect.objectContaining({ select: expect.objectContaining({ id: true }) }),
          students: { select: { id: true } },
          classGroup: expect.objectContaining({
            select: expect.objectContaining({
              teacher: expect.objectContaining({ select: { id: true } }),
              students: { select: { id: true } },
            }),
          }),
          reminders: expect.objectContaining({
            where: expect.objectContaining({
              createdAt: expect.objectContaining({ gte: expect.any(Date) }),
            }),
          }),
        }),
      }),
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: "lesson-1",
        status: "SCHEDULED",
        classGroup: expect.objectContaining({
          teacher: { id: "teacher-group" },
          students: [{ id: "student-group" }],
        }),
      }),
    );
  });
});
