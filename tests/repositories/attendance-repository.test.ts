import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    findFirst: vi.fn(),
  },
  attendanceRecord: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  scheduledClass: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT";

type AttendanceRepositoryModule = {
  getTeacherLessonAttendanceRoster: (
    teacherId: string,
    scheduledClassId: string,
  ) => Promise<unknown[]>;
  markLessonAttendanceForTeacher: (
    teacherId: string,
    input: {
      scheduledClassId: string;
      studentId: string;
      status: AttendanceStatus;
      lateMinutes?: number | null;
      reason?: string | null;
      now?: Date;
    },
  ) => Promise<unknown>;
  listAttendanceHistoryForStudent: (
    viewer: { role: UserRole; userId: string },
    studentId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  listAttendanceHistoryForClassGroup: (
    teacherId: string,
    classGroupId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
  listStudentAttendance: (studentId: string, filters?: Record<string, unknown>) => Promise<unknown>;
  listParentChildAttendance: (
    parentId: string,
    studentId: string,
    filters?: Record<string, unknown>,
  ) => Promise<unknown[]>;
};

function loadAttendanceRepository() {
  const specifier = "@/lib/repositories/attendance-repository";
  return import(/* @vite-ignore */ specifier) as Promise<AttendanceRepositoryModule>;
}

function student(overrides: Record<string, unknown> = {}) {
  return {
    email: "student@example.com",
    fullName: "Amina Yusuf",
    id: "student-1",
    ...overrides,
  };
}

function attendance(overrides: Record<string, unknown> = {}) {
  return {
    id: "attendance-1",
    lateMinutes: null,
    reason: null,
    scheduledClassId: "lesson-1",
    status: "PRESENT",
    studentId: "student-1",
    ...overrides,
  };
}

function studentAttendanceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "attendance-1",
    lateMinutes: 9,
    markedAt: new Date("2026-06-10T10:15:00.000Z"),
    reason: "Bus delay",
    scheduledClassId: "lesson-1",
    status: "LATE",
    studentId: "student-1",
    scheduledClass: {
      id: "lesson-1",
      classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
      classGroupId: "group-1",
      endAt: new Date("2026-06-10T11:00:00.000Z"),
      startAt: new Date("2026-06-10T10:00:00.000Z"),
      status: "COMPLETED",
      subject: { id: "subject-math", name: "Mathematics" },
      subjectId: "subject-math",
      teacher: { id: "teacher-1", fullName: "Jane Teacher" },
      title: "Quadratic functions",
    },
    ...overrides,
  };
}

function scheduledClass(overrides: Record<string, unknown> = {}) {
  return {
    classGroup: {
      id: "group-1",
      teacherId: "teacher-1",
      students: [
        student({ id: "student-1", fullName: "Present Student" }),
        student({ id: "student-2", fullName: "Late Student" }),
        student({ id: "student-3", fullName: "Absent Student" }),
        student({ id: "student-4", fullName: "Unmarked Student" }),
      ],
    },
    endAt: new Date("2026-06-10T11:00:00.000Z"),
    id: "lesson-1",
    startAt: new Date("2026-06-10T10:00:00.000Z"),
    students: [],
    teacherId: "teacher-1",
    attendanceRecords: [
      attendance({ id: "attendance-present", status: "PRESENT", studentId: "student-1" }),
      attendance({
        id: "attendance-late",
        lateMinutes: 12,
        reason: "Traffic",
        status: "LATE",
        studentId: "student-2",
      }),
      attendance({
        id: "attendance-absent",
        reason: "Sick",
        status: "ABSENT",
        studentId: "student-3",
      }),
    ],
    ...overrides,
  };
}

describe("attendance-repository contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exports the planned attendance repository API", async () => {
    const repository = await loadAttendanceRepository();

    expect(repository).toEqual(
      expect.objectContaining({
        getTeacherLessonAttendanceRoster: expect.any(Function),
        listAttendanceHistoryForClassGroup: expect.any(Function),
        listAttendanceHistoryForStudent: expect.any(Function),
        listParentChildAttendance: expect.any(Function),
        listStudentAttendance: expect.any(Function),
        markLessonAttendanceForTeacher: expect.any(Function),
      }),
    );
  });

  it("loads roster attendance for a direct teacher-owned ScheduledClass", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(
      scheduledClass({ classGroup: null, students: [student()] }),
    );

    const { getTeacherLessonAttendanceRoster } = await loadAttendanceRepository();
    const roster = await getTeacherLessonAttendanceRoster("teacher-1", "lesson-1");

    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "lesson-1",
          OR: expect.arrayContaining([{ teacherId: "teacher-1" }]),
        }),
      }),
    );
    expect(roster).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attendance: expect.objectContaining({ status: "PRESENT" }),
          email: "student@example.com",
          fullName: "Amina Yusuf",
          id: "student-1",
        }),
      ]),
    );
  });

  it("loads class-group roster attendance through ScheduledClass.classGroup.teacherId and maps unmarked rows", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(scheduledClass());

    const { getTeacherLessonAttendanceRoster } = await loadAttendanceRepository();
    const roster = await getTeacherLessonAttendanceRoster("teacher-1", "lesson-1");

    expect(prismaMock.scheduledClass.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "lesson-1",
          OR: expect.arrayContaining([{ classGroup: { teacherId: "teacher-1" } }]),
        }),
      }),
    );
    expect(roster).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fullName: "Present Student",
          attendance: expect.objectContaining({ status: "PRESENT" }),
        }),
        expect.objectContaining({
          fullName: "Late Student",
          attendance: expect.objectContaining({ lateMinutes: 12, status: "LATE" }),
        }),
        expect.objectContaining({
          fullName: "Absent Student",
          attendance: expect.objectContaining({ reason: "Sick", status: "ABSENT" }),
        }),
        expect.objectContaining({
          fullName: "Unmarked Student",
          attendance: null,
        }),
      ]),
    );
  });

  it("rejects foreign lessons and students outside the teacher-owned roster", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(null);

    const { markLessonAttendanceForTeacher } = await loadAttendanceRepository();

    await expect(
      markLessonAttendanceForTeacher("teacher-1", {
        now: new Date("2026-06-10T10:15:00.000Z"),
        scheduledClassId: "foreign-lesson",
        status: "PRESENT",
        studentId: "student-1",
      }),
    ).rejects.toThrow(/forbidden|unauthorized|not found|not assigned/i);
    expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
  });

  it("allows marking attendance during the live lesson window", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(
      scheduledClass({ students: [student()] }),
    );
    prismaMock.attendanceRecord.upsert.mockResolvedValueOnce(attendance({ status: "PRESENT" }));

    const { markLessonAttendanceForTeacher } = await loadAttendanceRepository();
    await markLessonAttendanceForTeacher("teacher-1", {
      now: new Date("2026-06-10T10:30:00.000Z"),
      scheduledClassId: "lesson-1",
      status: "PRESENT",
      studentId: "student-1",
    });

    expect(prismaMock.attendanceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          markedById: "teacher-1",
          scheduledClassId: "lesson-1",
          status: "PRESENT",
          studentId: "student-1",
        }),
        update: expect.objectContaining({ status: "PRESENT" }),
      }),
    );
  });

  it("allows correction within 24 hours after lesson end and requires a correction reason", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(
      scheduledClass({ students: [student()] }),
    );
    prismaMock.attendanceRecord.upsert.mockResolvedValueOnce(
      attendance({ reason: "Corrected from teacher notes", status: "ABSENT" }),
    );

    const { markLessonAttendanceForTeacher } = await loadAttendanceRepository();
    await markLessonAttendanceForTeacher("teacher-1", {
      now: new Date("2026-06-11T10:59:00.000Z"),
      reason: "Corrected from teacher notes",
      scheduledClassId: "lesson-1",
      status: "ABSENT",
      studentId: "student-1",
    });

    expect(prismaMock.attendanceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          reason: "Corrected from teacher notes",
          status: "ABSENT",
        }),
      }),
    );
  });

  it("rejects edits after the 24-hour correction window", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValueOnce(
      scheduledClass({ students: [student()] }),
    );

    const { markLessonAttendanceForTeacher } = await loadAttendanceRepository();

    await expect(
      markLessonAttendanceForTeacher("teacher-1", {
        now: new Date("2026-06-11T11:01:00.000Z"),
        reason: "Too late",
        scheduledClassId: "lesson-1",
        status: "ABSENT",
        studentId: "student-1",
      }),
    ).rejects.toThrow(/correction window|24 hours|closed/i);
    expect(prismaMock.attendanceRecord.upsert).not.toHaveBeenCalled();
  });

  it("validates late minutes and post-live correction reason while allowing optional absent reason during live lesson", async () => {
    prismaMock.scheduledClass.findFirst.mockResolvedValue(
      scheduledClass({ students: [student()] }),
    );

    const { markLessonAttendanceForTeacher } = await loadAttendanceRepository();

    await expect(
      markLessonAttendanceForTeacher("teacher-1", {
        lateMinutes: 0,
        now: new Date("2026-06-10T10:30:00.000Z"),
        scheduledClassId: "lesson-1",
        status: "LATE",
        studentId: "student-1",
      }),
    ).rejects.toThrow(/late minutes|greater than 0/i);

    await expect(
      markLessonAttendanceForTeacher("teacher-1", {
        now: new Date("2026-06-10T12:00:00.000Z"),
        scheduledClassId: "lesson-1",
        status: "ABSENT",
        studentId: "student-1",
      }),
    ).rejects.toThrow(/reason|required/i);

    await markLessonAttendanceForTeacher("teacher-1", {
      now: new Date("2026-06-10T10:30:00.000Z"),
      scheduledClassId: "lesson-1",
      status: "ABSENT",
      studentId: "student-1",
    });
    expect(prismaMock.attendanceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          reason: null,
          status: "ABSENT",
        }),
      }),
    );
  });

  it("lists attendance history by student and by class group inside teacher scope", async () => {
    prismaMock.attendanceRecord.findMany.mockResolvedValue([attendance()]);

    const { listAttendanceHistoryForClassGroup, listAttendanceHistoryForStudent } =
      await loadAttendanceRepository();
    await listAttendanceHistoryForStudent(
      { role: UserRole.TEACHER, userId: "teacher-1" },
      "student-1",
      { classGroupId: "group-1" },
    );
    await listAttendanceHistoryForClassGroup("teacher-1", "group-1", {});

    expect(prismaMock.attendanceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: "student-1",
          scheduledClass: expect.objectContaining({
            OR: expect.arrayContaining([
              { teacherId: "teacher-1" },
              { classGroup: { teacherId: "teacher-1" } },
            ]),
          }),
        }),
      }),
    );
    expect(prismaMock.attendanceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduledClass: expect.objectContaining({
            classGroupId: "group-1",
            classGroup: expect.objectContaining({ teacherId: "teacher-1" }),
          }),
        }),
      }),
    );
  });

  it("scopes student and parent attendance visibility to own or linked-child records", async () => {
    prismaMock.attendanceRecord.findMany.mockResolvedValue([attendance()]);
    prismaMock.appUser.findFirst
      .mockResolvedValueOnce({ id: "parent-1" })
      .mockResolvedValueOnce(null);

    const { listParentChildAttendance, listStudentAttendance } = await loadAttendanceRepository();
    await listStudentAttendance("student-1", {});
    await listParentChildAttendance("parent-1", "student-1", {});

    expect(prismaMock.attendanceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studentId: "student-1" }),
      }),
    );
    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          children: { some: { id: "student-1" } },
          id: "parent-1",
          role: UserRole.PARENT,
        }),
      }),
    );

    await expect(listParentChildAttendance("parent-1", "unlinked-student", {})).rejects.toThrow(
      /linked|unauthorized|not found/i,
    );
  });

  it("lists student attendance through the signed-in student id with supported filters and lesson context", async () => {
    prismaMock.attendanceRecord.findMany.mockResolvedValueOnce([
      studentAttendanceRecord(),
      studentAttendanceRecord({
        id: "attendance-present",
        lateMinutes: null,
        markedAt: new Date("2026-06-09T10:05:00.000Z"),
        reason: null,
        scheduledClassId: "lesson-2",
        status: "PRESENT",
        scheduledClass: {
          id: "lesson-2",
          classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
          classGroupId: "group-1",
          endAt: new Date("2026-06-09T11:00:00.000Z"),
          startAt: new Date("2026-06-09T10:00:00.000Z"),
          status: "COMPLETED",
          subject: { id: "subject-math", name: "Mathematics" },
          subjectId: "subject-math",
          teacher: { id: "teacher-1", fullName: "Jane Teacher" },
          title: "Linear equations",
        },
      }),
    ]);

    const { listStudentAttendance } = await loadAttendanceRepository();
    const result = await listStudentAttendance("student-1", {
      classGroupId: "group-1",
      from: "2026-06-01",
      scheduledClassId: "lesson-1",
      search: "quadratic bus",
      sort: "lessonDateAsc",
      status: "LATE",
      subjectId: "subject-math",
      to: "2026-06-30",
    });

    expect(prismaMock.attendanceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: "student-1",
          status: "LATE",
          scheduledClassId: "lesson-1",
          scheduledClass: expect.objectContaining({
            classGroupId: "group-1",
            subjectId: "subject-math",
          }),
          OR: expect.arrayContaining([
            { reason: expect.objectContaining({ contains: "quadratic bus" }) },
            {
              scheduledClass: expect.objectContaining({
                title: expect.objectContaining({ contains: "quadratic bus" }),
              }),
            },
          ]),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        records: expect.arrayContaining([
          expect.objectContaining({
            id: "attendance-1",
            lateMinutes: 9,
            lesson: expect.objectContaining({
              detailHref: "/portal/student/schedule/lesson-1",
              status: "COMPLETED",
              title: "Quadratic functions",
            }),
            reason: "Bus delay",
            status: "LATE",
            statusLabel: "Late",
            subject: { id: "subject-math", name: "Mathematics" },
          }),
        ]),
        summary: expect.objectContaining({
          absent: 0,
          late: 1,
          present: 1,
          total: 2,
        }),
      }),
    );
  });

  it("ignores invalid student attendance filters safely and keeps default latest-first sorting", async () => {
    prismaMock.attendanceRecord.findMany.mockResolvedValueOnce([]);

    const { listStudentAttendance } = await loadAttendanceRepository();
    await expect(
      listStudentAttendance("student-1", {
        from: "not-a-date",
        sort: "teacher",
        status: "EXCUSED",
        to: "also-not-a-date",
      }),
    ).resolves.toBeDefined();

    expect(prismaMock.attendanceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.arrayContaining([
          { markedAt: "desc" },
          { scheduledClass: { startAt: "desc" } },
        ]),
        where: expect.not.objectContaining({
          status: "EXCUSED",
        }),
      }),
    );
  });
});
