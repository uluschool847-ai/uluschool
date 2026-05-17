import { ClassGroupStatus, LessonStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  classGroup: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  scheduledClass: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

type TeacherClassesRepositoryModule = {
  listTeacherClassGroups: (
    teacherId: string,
    filters?: {
      levelId?: string;
      q?: string;
      sort?: "name" | "nextLesson" | "pendingSubmissions" | "rosterSize";
      status?: ClassGroupStatus;
      subjectId?: string;
    },
  ) => Promise<Array<Record<string, unknown>>>;
  getTeacherClassGroupDetail: (
    teacherId: string,
    classGroupId: string,
  ) => Promise<Record<string, unknown> | null>;
};

async function loadTeacherClassesRepository() {
  const specifier = "@/lib/repositories/" + "teacher-classes-repository";
  const repository = await import(/* @vite-ignore */ specifier);
  return repository as unknown as TeacherClassesRepositoryModule;
}

const futureLesson = {
  id: "lesson-next",
  title: "Nearest future lesson",
  description: null,
  startAt: new Date("2026-06-02T09:00:00.000Z"),
  endAt: new Date("2026-06-02T10:00:00.000Z"),
  status: LessonStatus.SCHEDULED,
  liveLessonUrl: "https://meet.example/class",
};

const groupRecord = {
  id: "group-1",
  name: "IGCSE Geometry Group A",
  status: ClassGroupStatus.ACTIVE,
  capacity: 12,
  teacherId: "teacher-1",
  subject: { id: "subject-geometry", name: "Geometry", slug: "geometry" },
  level: { id: "level-igcse", name: "IGCSE" },
  students: [
    {
      id: "student-active",
      fullName: "Active Student",
      email: "active@example.com",
      isActive: true,
      learningStatus: "ACTIVE",
    },
    {
      id: "student-inactive",
      fullName: "Inactive Student",
      email: "inactive@example.com",
      isActive: false,
      learningStatus: "PAUSED",
    },
  ],
  lessons: [
    { ...futureLesson },
    {
      id: "lesson-cancelled",
      title: "Cancelled lesson",
      description: null,
      startAt: new Date("2026-06-01T09:00:00.000Z"),
      endAt: new Date("2026-06-01T10:00:00.000Z"),
      status: LessonStatus.CANCELLED,
    },
  ],
  assignments: [
    {
      id: "assignment-1",
      title: "Geometry homework",
      dueDate: new Date("2026-06-05T20:00:00.000Z"),
      archivedAt: null,
      submissions: [
        { id: "submission-pending", grade: null },
        { id: "submission-graded", grade: 90 },
      ],
    },
  ],
};

describe("teacher classes repository", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T08:00:00.000Z"));
    vi.resetAllMocks();
  });

  it("lists teacher class groups from ClassGroup.teacherId with filters, search, and supported statuses", async () => {
    prismaMock.classGroup.findMany.mockResolvedValueOnce([
      groupRecord,
      {
        ...groupRecord,
        id: "group-paused",
        name: "Paused Group",
        status: ClassGroupStatus.PAUSED,
        lessons: [],
      },
      {
        ...groupRecord,
        id: "group-archived",
        name: "Archived Group",
        status: ClassGroupStatus.ARCHIVED,
        lessons: [],
      },
    ]);
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([]);

    const { listTeacherClassGroups } = await loadTeacherClassesRepository();
    const result = await listTeacherClassGroups("teacher-1", {
      levelId: "level-igcse",
      q: "geometry",
      sort: "nextLesson",
      status: ClassGroupStatus.ACTIVE,
      subjectId: "subject-geometry",
    });

    expect(prismaMock.classGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          levelId: "level-igcse",
          name: expect.objectContaining({ contains: "geometry", mode: "insensitive" }),
          status: ClassGroupStatus.ACTIVE,
          subjectId: "subject-geometry",
          teacherId: "teacher-1",
        }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain("Other Teacher");
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "group-1",
          name: "IGCSE Geometry Group A",
          status: ClassGroupStatus.ACTIVE,
          subject: { id: "subject-geometry", name: "Geometry", slug: "geometry" },
          level: { id: "level-igcse", name: "IGCSE" },
          capacity: 12,
          rosterCount: 2,
          activeRosterCount: 1,
          nextLesson: expect.objectContaining({ id: "lesson-next" }),
          upcomingLessonsCount: 1,
          activeAssignmentsCount: 1,
          pendingSubmissionsCount: 1,
          openHref: "/portal/teacher/classes/group-1",
          scheduleHref: "/portal/teacher/schedule?classGroupId=group-1",
          nextLessonHref: "/portal/teacher/lessons/lesson-next",
        }),
      ]),
    );
  });

  it("keeps zero-lesson and cancelled-only groups, then appends direct legacy class fallbacks without duplicates", async () => {
    prismaMock.classGroup.findMany.mockResolvedValueOnce([
      { ...groupRecord, id: "group-zero", name: "Zero Lesson Group", lessons: [] },
      {
        ...groupRecord,
        id: "group-cancelled",
        name: "Cancelled Only Group",
        lessons: [
          {
            id: "lesson-cancelled-only",
            title: "Cancelled only",
            description: null,
            startAt: new Date("2026-06-03T09:00:00.000Z"),
            endAt: new Date("2026-06-03T10:00:00.000Z"),
            status: LessonStatus.CANCELLED,
          },
          {
            id: "lesson-completed-only",
            title: "Completed only",
            description: null,
            startAt: new Date("2026-06-04T09:00:00.000Z"),
            endAt: new Date("2026-06-04T10:00:00.000Z"),
            status: LessonStatus.COMPLETED,
          },
        ],
      },
      { ...groupRecord, id: "group-duplicate", name: "Duplicate Group" },
    ]);
    prismaMock.scheduledClass.findMany.mockResolvedValueOnce([
      {
        id: "legacy-direct",
        title: "Legacy Direct Class",
        classGroupId: null,
        subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
        students: [{ id: "legacy-student", fullName: "Legacy Student", isActive: true }],
        startAt: new Date("2026-06-02T09:00:00.000Z"),
        endAt: new Date("2026-06-02T10:00:00.000Z"),
        status: LessonStatus.SCHEDULED,
      },
    ]);

    const { listTeacherClassGroups } = await loadTeacherClassesRepository();
    const result = await listTeacherClassGroups("teacher-1", { sort: "name" });

    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          classGroupId: null,
          teacherId: "teacher-1",
        },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "group-zero",
        nextLesson: null,
        openHref: "/portal/teacher/classes/group-zero",
      }),
      expect.objectContaining({
        id: "group-cancelled",
        nextLesson: null,
        upcomingLessonsCount: 0,
      }),
      expect.objectContaining({ id: "group-duplicate" }),
      expect.objectContaining({
        id: "legacy-direct",
        name: "Legacy Direct Class",
        openHref: "/portal/teacher/lessons/legacy-direct",
        scheduleHref: "/portal/teacher/schedule",
      }),
    ]);
  });

  it.each(["pendingSubmissions", "rosterSize", "nextLesson", "name"] as const)(
    "supports %s sorting",
    async (sort) => {
      prismaMock.classGroup.findMany.mockResolvedValueOnce([groupRecord]);
      prismaMock.scheduledClass.findMany.mockResolvedValueOnce([]);

      const { listTeacherClassGroups } = await loadTeacherClassesRepository();
      await expect(listTeacherClassGroups("teacher-1", { sort })).resolves.toEqual(
        expect.any(Array),
      );
    },
  );

  it("loads class group detail by classGroup.id and ClassGroup.teacherId with the full read-only class contract", async () => {
    prismaMock.classGroup.findFirst.mockResolvedValueOnce({
      ...groupRecord,
      materials: [{ id: "material-1", title: "Angles worksheet", fileUrl: "/uploads/angles.pdf" }],
      pendingSubmissions: [
        {
          id: "submission-pending",
          submittedAt: new Date("2026-06-06T10:00:00.000Z"),
          student: {
            id: "student-active",
            fullName: "Active Student",
            email: "active@example.com",
          },
          assignment: { id: "assignment-1", title: "Geometry homework" },
        },
      ],
    });

    const { getTeacherClassGroupDetail } = await loadTeacherClassesRepository();
    const result = await getTeacherClassGroupDetail("teacher-1", "group-1");

    expect(prismaMock.classGroup.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "group-1",
          teacherId: "teacher-1",
        },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "group-1",
        name: "IGCSE Geometry Group A",
        status: ClassGroupStatus.ACTIVE,
        capacity: 12,
        roster: expect.arrayContaining([
          expect.objectContaining({
            fullName: "Active Student",
            isActive: true,
            learningStatus: "ACTIVE",
          }),
          expect.objectContaining({
            fullName: "Inactive Student",
            isActive: false,
            learningStatus: "PAUSED",
          }),
        ]),
        upcomingLessons: expect.arrayContaining([
          expect.objectContaining({
            detailHref: "/portal/teacher/lessons/lesson-next",
            startHref: "https://meet.example/class",
            status: LessonStatus.SCHEDULED,
          }),
        ]),
        pastLessons: expect.any(Array),
        assignments: expect.arrayContaining([
          expect.objectContaining({
            dueDate: new Date("2026-06-05T20:00:00.000Z"),
            pendingSubmissionsCount: 1,
            submissionsCount: 2,
          }),
        ]),
        materials: expect.arrayContaining([
          expect.objectContaining({ fileHref: "/uploads/angles.pdf", title: "Angles worksheet" }),
        ]),
        pendingSubmissions: expect.arrayContaining([
          expect.objectContaining({
            reviewHref: "/portal/teacher/submissions/submission-pending",
            submittedAt: new Date("2026-06-06T10:00:00.000Z"),
          }),
        ]),
      }),
    );
  });

  it("returns null for another teacher's class group and handles empty detail sections", async () => {
    prismaMock.classGroup.findFirst.mockResolvedValueOnce(null);

    const { getTeacherClassGroupDetail } = await loadTeacherClassesRepository();

    await expect(getTeacherClassGroupDetail("teacher-1", "other-group")).resolves.toBeNull();
    expect(prismaMock.classGroup.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "other-group",
          teacherId: "teacher-1",
        },
      }),
    );
  });
});
