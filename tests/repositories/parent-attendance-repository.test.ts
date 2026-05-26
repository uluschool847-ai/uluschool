import { AttendanceStatus, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  appUser: {
    findFirst: vi.fn(),
  },
}));

const attendanceRepositoryMock = vi.hoisted(() => ({
  listStudentAttendance: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/repositories/attendance-repository", () => attendanceRepositoryMock);

type ParentAttendanceRepository = {
  listAttendanceForParentChild: (
    parentId: string,
    studentId: string,
    filters?: Record<string, string>,
  ) => Promise<unknown>;
};

const importRepository = async (): Promise<ParentAttendanceRepository> =>
  import(
    "@/lib/repositories/parent-attendance-repository" as string
  ) as Promise<ParentAttendanceRepository>;

const attendanceResult = (overrides: Record<string, unknown> = {}) => ({
  records: [
    {
      classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
      id: "attendance-1",
      lateMinutes: 11,
      lesson: {
        detailHref: "/portal/parent/schedule/student-1/lesson-1",
        id: "lesson-1",
        startAt: new Date("2026-06-10T10:00:00.000Z"),
        title: "Quadratic functions",
      },
      markedAt: new Date("2026-06-10T10:15:00.000Z"),
      reason: "Bus delay",
      status: AttendanceStatus.LATE,
      statusLabel: "Late",
      subject: { id: "subject-math", name: "Mathematics" },
    },
  ],
  summary: {
    absent: 1,
    attendanceRate: 67,
    late: 1,
    present: 1,
    total: 3,
  },
  ...overrides,
});

describe("parent-attendance-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.appUser.findFirst.mockResolvedValue({ id: "parent-1" });
    attendanceRepositoryMock.listStudentAttendance.mockResolvedValue(attendanceResult());
  });

  it("exports a dedicated parent attendance read API", async () => {
    const repository = await importRepository();

    expect(repository.listAttendanceForParentChild).toEqual(expect.any(Function));
  });

  it("checks parent-child ownership before reading attendance", async () => {
    const repository = await importRepository();

    await repository.listAttendanceForParentChild("parent-1", "student-1");

    expect(prismaMock.appUser.findFirst).toHaveBeenCalledWith({
      where: {
        id: "parent-1",
        role: UserRole.PARENT,
        children: {
          some: {
            id: "student-1",
          },
        },
      },
      select: {
        id: true,
      },
    });
  });

  it("returns attendance summary and rows for a linked child", async () => {
    const repository = await importRepository();

    const result = await repository.listAttendanceForParentChild("parent-1", "student-1");

    expect(attendanceRepositoryMock.listStudentAttendance).toHaveBeenCalledWith("student-1", {});
    expect(result).toEqual(attendanceResult());
  });

  it("returns an empty summary and rows for an unlinked child", async () => {
    prismaMock.appUser.findFirst.mockResolvedValue(null);
    const repository = await importRepository();

    const result = await repository.listAttendanceForParentChild("parent-1", "foreign-student");

    expect(result).toEqual({
      records: [],
      summary: {
        absent: 0,
        attendanceRate: null,
        late: 0,
        present: 0,
        total: 0,
      },
    });
    expect(attendanceRepositoryMock.listStudentAttendance).not.toHaveBeenCalled();
  });

  it("normalizes supported filters and maps parent lesson detail hrefs", async () => {
    const repository = await importRepository();

    await repository.listAttendanceForParentChild("parent-1", "student-1", {
      classGroupId: "group-1",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      scheduledClassId: "lesson-1",
      search: "quadratic",
      sort: "lessonDateAsc",
      status: "LATE",
      subjectId: "subject-math",
    });

    expect(attendanceRepositoryMock.listStudentAttendance).toHaveBeenCalledWith("student-1", {
      classGroupId: "group-1",
      from: "2026-06-01",
      scheduledClassId: "lesson-1",
      search: "quadratic",
      sort: "lessonDateAsc",
      status: "LATE",
      subjectId: "subject-math",
      to: "2026-06-30",
    });
  });

  it("ignores invalid dates and unsupported status/sort safely", async () => {
    const repository = await importRepository();

    await repository.listAttendanceForParentChild("parent-1", "student-1", {
      dateFrom: "not-a-date",
      dateTo: "also-not-a-date",
      sort: "teacher",
      status: "EXCUSED",
    });

    expect(attendanceRepositoryMock.listStudentAttendance).toHaveBeenCalledWith("student-1", {});
  });

  it.each(["markedAtDesc", "markedAtAsc", "lessonDateDesc", "lessonDateAsc", "status", "subject"])(
    "supports %s sorting",
    async (sort) => {
      const repository = await importRepository();

      await repository.listAttendanceForParentChild("parent-1", "student-1", { sort });

      expect(attendanceRepositoryMock.listStudentAttendance).toHaveBeenCalledWith(
        "student-1",
        expect.objectContaining({ sort }),
      );
    },
  );
});
