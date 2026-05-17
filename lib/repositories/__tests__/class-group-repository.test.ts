import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  classGroup: {
    create: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  level: {
    findUnique: vi.fn(),
  },
  scheduledClass: {
    findMany: vi.fn(),
  },
  subject: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type ClassGroupStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";

type ClassGroupInput = {
  name: string;
  description?: string | null;
  subjectId?: string | null;
  levelId?: string | null;
  teacherId?: string | null;
  status?: ClassGroupStatus;
  capacity?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
};

type AdminClassGroupRecord = {
  id: string;
  name: string;
  description: string | null;
  subjectId: string | null;
  subject: { id: string; name: string; slug: string } | null;
  levelId: string | null;
  level: { id: string; name: string; slug: string } | null;
  teacherId: string | null;
  teacher: { id: string; fullName: string; email: string; role: UserRole } | null;
  studentsCount: number;
  capacity: number | null;
  upcomingLessonsCount: number;
  status: ClassGroupStatus;
  createdAt: Date;
  updatedAt: Date;
};

type ClassGroupMutationResult = AdminClassGroupRecord & {
  before: Omit<AdminClassGroupRecord, "studentsCount" | "upcomingLessonsCount">;
  after: Omit<AdminClassGroupRecord, "studentsCount" | "upcomingLessonsCount">;
};

type ClassGroupRepositoryModule = {
  listAdminClassGroups: (filters?: {
    searchQuery?: string;
    status?: ClassGroupStatus;
    teacherId?: string;
    subjectId?: string;
    levelId?: string;
  }) => Promise<AdminClassGroupRecord[]>;
  getClassGroupById: (id: string) => Promise<AdminClassGroupRecord | null>;
  createClassGroup: (input: ClassGroupInput) => Promise<AdminClassGroupRecord>;
  updateClassGroup: (
    id: string,
    input: Partial<ClassGroupInput>,
  ) => Promise<ClassGroupMutationResult>;
  setClassGroupStatus: (id: string, status: ClassGroupStatus) => Promise<ClassGroupMutationResult>;
  deleteClassGroup: (id: string) => Promise<{ id: string }>;
  enrollStudentToClassGroup: (groupId: string, studentId: string) => Promise<AdminClassGroupRecord>;
  unenrollStudentFromClassGroup: (
    groupId: string,
    studentId: string,
  ) => Promise<AdminClassGroupRecord>;
  listAvailableStudentsForClassGroup: (
    groupId: string,
  ) => Promise<Array<{ id: string; fullName: string; email: string; role: UserRole }>>;
  listClassGroupLessons: (groupId: string) => Promise<
    Array<{
      id: string;
      title: string;
      startAt: Date;
      endAt: Date;
      classGroupId: string | null;
      subject: { id: string; name: string; slug: string } | null;
    }>
  >;
};

async function loadClassGroupRepository() {
  const specifier = "@/lib/repositories/class-group-repository";
  return import(/* @vite-ignore */ specifier) as Promise<ClassGroupRepositoryModule>;
}

describe("class-group-repository admin contract", () => {
  const createdAt = new Date("2026-05-01T09:00:00.000Z");
  const updatedAt = new Date("2026-05-10T09:00:00.000Z");
  const startDate = new Date("2026-06-01T00:00:00.000Z");
  const endDate = new Date("2026-12-15T00:00:00.000Z");

  function groupRecord(overrides?: Record<string, unknown>) {
    return {
      id: "group-1",
      name: "IGCSE Mathematics Group A",
      description: "Core IGCSE mathematics group",
      subjectId: "subject-math",
      subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
      levelId: "level-igcse",
      level: { id: "level-igcse", name: "IGCSE", slug: "igcse" },
      teacherId: "teacher-1",
      teacher: {
        id: "teacher-1",
        fullName: "John Smith",
        email: "john.smith@example.com",
        role: UserRole.TEACHER,
      },
      students: [
        { id: "student-1", fullName: "Sofia Shevchenko", email: "sofia@example.com" },
        { id: "student-2", fullName: "Mark Shevchenko", email: "mark@example.com" },
      ],
      lessons: [{ id: "lesson-1" }, { id: "lesson-2" }],
      capacity: 8,
      status: "ACTIVE",
      startDate,
      endDate,
      createdAt,
      updatedAt,
      _count: {
        students: 2,
        lessons: 4,
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lists admin class groups with search, filters, relation metadata, counts, and timestamps", async () => {
    prismaMock.classGroup.findMany.mockResolvedValueOnce([groupRecord()]);

    const { listAdminClassGroups } = await loadClassGroupRepository();
    const result = await listAdminClassGroups({
      searchQuery: "math",
      status: "ACTIVE",
      teacherId: "teacher-1",
      subjectId: "subject-math",
      levelId: "level-igcse",
    });

    expect(prismaMock.classGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ACTIVE",
          teacherId: "teacher-1",
          subjectId: "subject-math",
          levelId: "level-igcse",
          OR: expect.arrayContaining([
            { name: { contains: "math", mode: "insensitive" } },
            { teacher: { fullName: { contains: "math", mode: "insensitive" } } },
            { teacher: { email: { contains: "math", mode: "insensitive" } } },
            { subject: { name: { contains: "math", mode: "insensitive" } } },
            { subject: { slug: { contains: "math", mode: "insensitive" } } },
          ]),
        }),
        include: expect.objectContaining({
          subject: { select: { id: true, name: true, slug: true } },
          level: { select: { id: true, name: true, slug: true } },
          teacher: { select: { id: true, fullName: true, email: true, role: true } },
          _count: { select: { students: true } },
          lessons: expect.objectContaining({
            where: { startAt: { gte: expect.any(Date) } },
            select: { id: true },
          }),
        }),
        orderBy: [{ status: "asc" }, { name: "asc" }],
      }),
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        name: "IGCSE Mathematics Group A",
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        level: { id: "level-igcse", name: "IGCSE", slug: "igcse" },
        teacher: expect.objectContaining({ fullName: "John Smith" }),
        studentsCount: 2,
        capacity: 8,
        upcomingLessonsCount: 2,
        status: "ACTIVE",
        createdAt,
        updatedAt,
      }),
    );
  });

  it("gets one class group by id with subject, level, teacher, student count, lesson count, and timestamps", async () => {
    prismaMock.classGroup.findUnique.mockResolvedValueOnce(groupRecord());

    const { getClassGroupById } = await loadClassGroupRepository();
    const result = await getClassGroupById("group-1");

    expect(prismaMock.classGroup.findUnique).toHaveBeenCalledWith({
      where: { id: "group-1" },
      include: expect.objectContaining({
        subject: { select: { id: true, name: true, slug: true } },
        level: { select: { id: true, name: true, slug: true } },
        teacher: { select: { id: true, fullName: true, email: true, role: true } },
        _count: { select: { students: true } },
        lessons: expect.objectContaining({
          where: { startAt: { gte: expect.any(Date) } },
          select: { id: true },
        }),
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: "group-1",
        studentsCount: 2,
        upcomingLessonsCount: 2,
        createdAt,
        updatedAt,
      }),
    );
  });

  it("creates a class group after validating teacher role and selected subject/level existence", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "teacher-1",
      role: UserRole.TEACHER,
    });
    prismaMock.subject.findUnique.mockResolvedValueOnce({ id: "subject-math" });
    prismaMock.level.findUnique.mockResolvedValueOnce({ id: "level-igcse" });
    prismaMock.classGroup.create.mockResolvedValueOnce(groupRecord());

    const { createClassGroup } = await loadClassGroupRepository();
    const result = await createClassGroup({
      name: "IGCSE Mathematics Group A",
      description: "Core IGCSE mathematics group",
      subjectId: "subject-math",
      levelId: "level-igcse",
      teacherId: "teacher-1",
      status: "ACTIVE",
      capacity: 8,
      startDate,
      endDate,
    });

    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: "teacher-1" },
      select: { id: true, role: true },
    });
    expect(prismaMock.subject.findUnique).toHaveBeenCalledWith({
      where: { id: "subject-math" },
      select: { id: true },
    });
    expect(prismaMock.level.findUnique).toHaveBeenCalledWith({
      where: { id: "level-igcse" },
      select: { id: true },
    });
    expect(prismaMock.classGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "IGCSE Mathematics Group A",
          teacher: { connect: { id: "teacher-1" } },
          subject: { connect: { id: "subject-math" } },
          level: { connect: { id: "level-igcse" } },
          status: "ACTIVE",
          capacity: 8,
          startDate,
          endDate,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ id: "group-1", name: "IGCSE Mathematics Group A" }),
    );
  });

  it("rejects creating a class group with a non-teacher teacherId", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-1",
      role: UserRole.STUDENT,
    });

    const { createClassGroup } = await loadClassGroupRepository();

    await expect(
      createClassGroup({
        name: "Invalid Teacher Group",
        teacherId: "student-1",
      }),
    ).rejects.toThrow(/teacher/i);
    expect(prismaMock.classGroup.create).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "subject",
      input: { subjectId: "missing-subject" },
      setup: () => {
        prismaMock.subject.findUnique.mockResolvedValueOnce(null);
      },
    },
    {
      label: "level",
      input: { levelId: "missing-level" },
      setup: () => {
        prismaMock.level.findUnique.mockResolvedValueOnce(null);
      },
    },
  ])(
    "rejects creating a class group when selected $label does not exist",
    async ({ input, setup }) => {
      setup();

      const { createClassGroup } = await loadClassGroupRepository();

      await expect(
        createClassGroup({
          name: "Invalid Academic Reference Group",
          ...input,
        }),
      ).rejects.toThrow(/subject|level/i);
      expect(prismaMock.classGroup.create).not.toHaveBeenCalled();
    },
  );

  it("updates a class group and returns meaningful before and after snapshots", async () => {
    prismaMock.classGroup.findUnique.mockResolvedValueOnce(
      groupRecord({ name: "Old Group Name", capacity: 6 }),
    );
    prismaMock.classGroup.update.mockResolvedValueOnce(
      groupRecord({ name: "Updated Group Name", capacity: 10 }),
    );

    const { updateClassGroup } = await loadClassGroupRepository();
    const result = await updateClassGroup("group-1", {
      name: "Updated Group Name",
      capacity: 10,
    });

    expect(prismaMock.classGroup.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "group-1" } }),
    );
    expect(prismaMock.classGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "group-1" },
        data: expect.objectContaining({
          name: "Updated Group Name",
          capacity: 10,
        }),
      }),
    );
    expect(result.before).toEqual(
      expect.objectContaining({
        id: "group-1",
        name: "Old Group Name",
        capacity: 6,
        status: "ACTIVE",
      }),
    );
    expect(result.before).not.toEqual({ id: "group-1" });
    expect(result.after).toEqual(
      expect.objectContaining({
        id: "group-1",
        name: "Updated Group Name",
        capacity: 10,
        status: "ACTIVE",
      }),
    );
  });

  it("sets class group status and returns meaningful before and after snapshots", async () => {
    prismaMock.classGroup.findUnique.mockResolvedValueOnce(groupRecord({ status: "ACTIVE" }));
    prismaMock.classGroup.update.mockResolvedValueOnce(groupRecord({ status: "PAUSED" }));

    const { setClassGroupStatus } = await loadClassGroupRepository();
    const result = await setClassGroupStatus("group-1", "PAUSED");

    expect(prismaMock.classGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "group-1" },
        data: { status: "PAUSED" },
      }),
    );
    expect(result.before).toEqual(
      expect.objectContaining({
        id: "group-1",
        name: "IGCSE Mathematics Group A",
        status: "ACTIVE",
      }),
    );
    expect(result.before).not.toEqual({ id: "group-1" });
    expect(result.after).toEqual(
      expect.objectContaining({
        id: "group-1",
        name: "IGCSE Mathematics Group A",
        status: "PAUSED",
      }),
    );
  });

  it("deletes a class group only when no existing dependencies reference it", async () => {
    prismaMock.classGroup.findUnique.mockResolvedValueOnce(
      groupRecord({
        students: [],
        lessons: [],
        _count: { students: 0, lessons: 0 },
      }),
    );
    prismaMock.classGroup.delete.mockResolvedValueOnce({ id: "group-1" });

    const { deleteClassGroup } = await loadClassGroupRepository();
    const result = await deleteClassGroup("group-1");

    expect(prismaMock.classGroup.findUnique).toHaveBeenCalledWith({
      where: { id: "group-1" },
      include: expect.objectContaining({
        _count: { select: { students: true, lessons: true } },
        lessons: expect.objectContaining({
          include: expect.objectContaining({
            assignments: expect.objectContaining({
              select: { _count: { select: { submissions: true } } },
            }),
            _count: { select: { assignments: true, courseMaterials: true, reminders: true } },
          }),
        }),
      }),
    });
    expect(prismaMock.classGroup.delete).toHaveBeenCalledWith({ where: { id: "group-1" } });
    expect(result).toEqual({ id: "group-1" });
  });

  it.each([
    {
      dependency: "students",
      record: groupRecord({
        _count: { students: 1, lessons: 0 },
        students: [{ id: "student-1" }],
        lessons: [],
      }),
    },
    {
      dependency: "lessons",
      record: groupRecord({
        _count: { students: 0, lessons: 1 },
        students: [],
        lessons: [
          {
            id: "lesson-1",
            _count: { assignments: 0, courseMaterials: 0, reminders: 0 },
            assignments: [],
          },
        ],
      }),
    },
    {
      dependency: "assignments/homework through lessons",
      record: groupRecord({
        _count: { students: 0, lessons: 1 },
        students: [],
        lessons: [
          {
            id: "lesson-1",
            _count: { assignments: 1, courseMaterials: 0, reminders: 0 },
            assignments: [],
          },
        ],
      }),
    },
    {
      dependency: "submissions through assignments",
      record: groupRecord({
        _count: { students: 0, lessons: 1 },
        students: [],
        lessons: [
          {
            id: "lesson-1",
            _count: { assignments: 1, courseMaterials: 0, reminders: 0 },
            assignments: [{ _count: { submissions: 2 } }],
          },
        ],
      }),
    },
    {
      dependency: "course materials through lessons",
      record: groupRecord({
        _count: { students: 0, lessons: 1 },
        students: [],
        lessons: [
          {
            id: "lesson-1",
            _count: { assignments: 0, courseMaterials: 1, reminders: 0 },
            assignments: [],
          },
        ],
      }),
    },
    {
      dependency: "reminders through lessons",
      record: groupRecord({
        _count: { students: 0, lessons: 1 },
        students: [],
        lessons: [
          {
            id: "lesson-1",
            _count: { assignments: 0, courseMaterials: 0, reminders: 1 },
            assignments: [],
          },
        ],
      }),
    },
  ])("blocks deleting a class group with $dependency", async ({ record }) => {
    prismaMock.classGroup.findUnique.mockResolvedValueOnce(record);

    const { deleteClassGroup } = await loadClassGroupRepository();

    await expect(deleteClassGroup("group-1")).rejects.toThrow(
      /dependencies|students|lessons|assignments|submissions|materials|reminders/i,
    );
    expect(prismaMock.classGroup.delete).not.toHaveBeenCalled();
  });

  it("enrolls a student when the user is a STUDENT, not already enrolled, and capacity allows it", async () => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce({
      id: "student-3",
      role: UserRole.STUDENT,
    });
    prismaMock.classGroup.findUnique.mockResolvedValueOnce(
      groupRecord({
        capacity: 4,
        students: [{ id: "student-1" }],
        _count: { students: 1, lessons: 0 },
      }),
    );
    prismaMock.classGroup.update.mockResolvedValueOnce(
      groupRecord({
        students: [{ id: "student-1" }, { id: "student-3" }],
        _count: { students: 2, lessons: 0 },
      }),
    );

    const { enrollStudentToClassGroup } = await loadClassGroupRepository();
    const result = await enrollStudentToClassGroup("group-1", "student-3");

    expect(prismaMock.appUser.findUnique).toHaveBeenCalledWith({
      where: { id: "student-3" },
      select: { id: true, role: true },
    });
    expect(prismaMock.classGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "group-1" },
        data: { students: { connect: { id: "student-3" } } },
      }),
    );
    expect(prismaMock.classGroup.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ teacherStudents: expect.anything() }),
      }),
    );
    expect(result.studentsCount).toBe(2);
  });

  it.each([
    {
      reason: "non-student user",
      student: { id: "teacher-1", role: UserRole.TEACHER },
      group: groupRecord({ capacity: 4, students: [], _count: { students: 0, lessons: 0 } }),
      error: /student/i,
    },
    {
      reason: "duplicate enrolment",
      student: { id: "student-1", role: UserRole.STUDENT },
      group: groupRecord({
        capacity: 4,
        students: [{ id: "student-1" }],
        _count: { students: 1, lessons: 0 },
      }),
      error: /already|enrolled/i,
    },
    {
      reason: "full capacity",
      student: { id: "student-3", role: UserRole.STUDENT },
      group: groupRecord({
        capacity: 2,
        students: [{ id: "student-1" }, { id: "student-2" }],
        _count: { students: 2, lessons: 0 },
      }),
      error: /capacity|full/i,
    },
  ])("rejects enrollment for $reason", async ({ student, group, error }) => {
    prismaMock.appUser.findUnique.mockResolvedValueOnce(student);
    prismaMock.classGroup.findUnique.mockResolvedValueOnce(group);

    const { enrollStudentToClassGroup } = await loadClassGroupRepository();

    await expect(enrollStudentToClassGroup("group-1", student.id)).rejects.toThrow(error);
    expect(prismaMock.classGroup.update).not.toHaveBeenCalled();
  });

  it("unenrolls a student only when the class group enrolment exists", async () => {
    prismaMock.classGroup.findUnique.mockResolvedValueOnce(
      groupRecord({
        students: [{ id: "student-1" }],
        _count: { students: 1, lessons: 0 },
      }),
    );
    prismaMock.classGroup.update.mockResolvedValueOnce(
      groupRecord({
        students: [],
        _count: { students: 0, lessons: 0 },
      }),
    );

    const { unenrollStudentFromClassGroup } = await loadClassGroupRepository();
    const result = await unenrollStudentFromClassGroup("group-1", "student-1");

    expect(prismaMock.classGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "group-1" },
        data: { students: { disconnect: { id: "student-1" } } },
      }),
    );
    expect(result.studentsCount).toBe(0);
  });

  it("rejects unenrolling a student who is not enrolled in the class group", async () => {
    prismaMock.classGroup.findUnique.mockResolvedValueOnce(
      groupRecord({
        students: [],
        _count: { students: 0, lessons: 0 },
      }),
    );

    const { unenrollStudentFromClassGroup } = await loadClassGroupRepository();

    await expect(unenrollStudentFromClassGroup("group-1", "student-missing")).rejects.toThrow(
      /not enrolled|enrolment/i,
    );
    expect(prismaMock.classGroup.update).not.toHaveBeenCalled();
  });

  it("lists available students for a class group excluding students already enrolled", async () => {
    prismaMock.classGroup.findUnique.mockResolvedValueOnce(
      groupRecord({
        students: [{ id: "student-1" }, { id: "student-2" }],
      }),
    );
    prismaMock.appUser.findMany.mockResolvedValueOnce([
      {
        id: "student-3",
        fullName: "Available Student",
        email: "available.student@example.com",
        role: UserRole.STUDENT,
      },
    ]);

    const { listAvailableStudentsForClassGroup } = await loadClassGroupRepository();
    const result = await listAvailableStudentsForClassGroup("group-1");

    expect(prismaMock.classGroup.findUnique).toHaveBeenCalledWith({
      where: { id: "group-1" },
      select: { students: { select: { id: true } } },
    });
    expect(prismaMock.appUser.findMany).toHaveBeenCalledWith({
      where: {
        role: UserRole.STUDENT,
        id: { notIn: ["student-1", "student-2"] },
      },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: [{ fullName: "asc" }, { email: "asc" }],
    });
    expect(result).toEqual([
      {
        id: "student-3",
        fullName: "Available Student",
        email: "available.student@example.com",
        role: UserRole.STUDENT,
      },
    ]);
  });

  it("lists upcoming and past lessons for a class group ordered by startAt", async () => {
    const pastLesson = {
      id: "lesson-past",
      title: "Past lesson",
      startAt: new Date("2026-05-01T10:00:00.000Z"),
      endAt: new Date("2026-05-01T11:00:00.000Z"),
      classGroupId: "group-1",
      subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    };
    const upcomingLesson = {
      id: "lesson-upcoming",
      title: "Upcoming lesson",
      startAt: new Date("2026-06-01T10:00:00.000Z"),
      endAt: new Date("2026-06-01T11:00:00.000Z"),
      classGroupId: "group-1",
      subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
    };
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([pastLesson, upcomingLesson]);

    const { listClassGroupLessons } = await loadClassGroupRepository();
    const result = await listClassGroupLessons("group-1");

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith({
      where: { classGroupId: "group-1" },
      include: {
        subject: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ startAt: "asc" }, { title: "asc" }],
    });
    expect(result.map((lesson) => lesson.id)).toEqual(["lesson-past", "lesson-upcoming"]);
  });
});
