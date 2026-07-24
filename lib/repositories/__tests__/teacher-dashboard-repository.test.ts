import { ClassGroupStatus, LessonStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { storageUrlForKey } from "@/lib/storage/storage-url";

const prismaMock = vi.hoisted(() => ({
  assignment: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  appUser: {
    findMany: vi.fn(),
  },
  classGroup: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  scheduledClass: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  submission: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
}));

const hashPasswordMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: hashPasswordMock,
}));

type TeacherDashboardRepositoryModule = {
  getTeacherDashboardData: (teacherId: string) => Promise<{
    metrics: Record<string, number>;
    todayLessons: unknown[];
    upcomingLessons: unknown[];
    pastLessons: unknown[];
    classes: unknown[];
    activeAssignments: unknown[];
    pendingSubmissions: unknown[];
    alerts: unknown[];
  }>;
};

async function loadTeacherDashboardRepository() {
  const portalRepository = await import("@/lib/repositories/portal-repository");
  return portalRepository as unknown as TeacherDashboardRepositoryModule;
}

const directClass = {
  id: "lesson-direct",
  title: "Direct teacher algebra",
  description: "Owned through ScheduledClass.teacherId",
  startAt: new Date("2026-06-01T09:00:00.000Z"),
  endAt: new Date("2026-06-01T10:00:00.000Z"),
  timezone: null,
  status: "LIVE",
  liveLessonUrl: "https://meet.example/direct",
  cancelReason: null,
  subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
  students: [
    { id: "student-1", fullName: "Student One", email: "student1@example.com" },
    { id: "student-2", fullName: "Student Two", email: "student2@example.com" },
  ],
  classGroup: null,
};

const groupClass = {
  id: "lesson-group",
  title: "Class group geometry",
  description: "Owned through ClassGroup.teacherId",
  startAt: new Date("2026-06-02T09:00:00.000Z"),
  endAt: new Date("2026-06-02T10:00:00.000Z"),
  timezone: "Africa/Nairobi",
  status: "SCHEDULED",
  liveLessonUrl: "https://meet.example/group",
  cancelReason: null,
  subject: { id: "subject-geometry", name: "Geometry", slug: "geometry" },
  students: [],
  classGroup: {
    id: "group-1",
    name: "IGCSE Geometry Group A",
    teacherId: "teacher-1",
    students: [
      { id: "student-3", fullName: "Student Three", email: "student3@example.com" },
      { id: "student-4", fullName: "Student Four", email: "student4@example.com" },
      { id: "student-5", fullName: "Student Five", email: "student5@example.com" },
      { id: "student-6", fullName: "Student Six", email: "student6@example.com" },
    ],
  },
};

const assignmentRecord = {
  id: "assignment-group",
  title: "Geometry Homework",
  description: "Angles worksheet",
  dueDate: new Date("2026-06-05T20:00:00.000Z"),
  scheduledClassId: "lesson-group",
  scheduledClass: {
    id: "lesson-group",
    title: "Class group geometry",
    classGroup: { id: "group-1", name: "IGCSE Geometry Group A" },
    subject: { id: "subject-geometry", name: "Geometry", slug: "geometry" },
  },
  submissions: [
    { id: "submission-pending", grade: null },
    { id: "submission-graded", grade: 88 },
  ],
};

const pendingSubmissionRecord = {
  id: "submission-pending",
  contentUrl: "/uploads/submission.pdf",
  attachments: [],
  submittedAt: new Date("2026-06-01T11:00:00.000Z"),
  grade: null,
  student: {
    id: "student-3",
    fullName: "Student Three",
    email: "student3@example.com",
  },
  assignment: {
    id: "assignment-group",
    title: "Geometry Homework",
    scheduledClass: {
      id: "lesson-group",
      title: "Class group geometry",
      classGroup: { id: "group-1", name: "IGCSE Geometry Group A" },
      subject: { id: "subject-geometry", name: "Geometry", slug: "geometry" },
    },
  },
};

function mockDashboardQueryResults(overrides?: {
  classes?: unknown[];
  assignments?: unknown[];
  submissions?: unknown[];
  upcomingLessons?: unknown[];
  pastLessons?: unknown[];
}) {
  prismaMock.scheduledClass.count.mockResolvedValueOnce(2);
  prismaMock.scheduledClass.count.mockResolvedValueOnce(2);
  prismaMock.scheduledClass.count.mockResolvedValueOnce(2);
  prismaMock.assignment.count.mockResolvedValueOnce(1);
  prismaMock.submission.count.mockResolvedValueOnce(1);
  prismaMock.submission.count.mockResolvedValueOnce(0);
  prismaMock.scheduledClass.findMany.mockResolvedValueOnce(
    overrides?.classes ?? [directClass, groupClass],
  );
  prismaMock.assignment.findMany.mockResolvedValueOnce(
    overrides?.assignments ?? [assignmentRecord],
  );
  prismaMock.submission.findMany.mockResolvedValueOnce(
    overrides?.submissions ?? [pendingSubmissionRecord],
  );
  prismaMock.scheduledClass.findMany.mockResolvedValueOnce(
    overrides?.upcomingLessons ?? [directClass, groupClass],
  );
  prismaMock.scheduledClass.findMany.mockResolvedValueOnce(overrides?.pastLessons ?? []);
}

describe("teacher dashboard repository view model", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T08:00:00.000Z"));
    vi.resetAllMocks();
  });

  it("returns one stable teacher dashboard view model shape with scoped metric names", async () => {
    prismaMock.classGroup.count.mockResolvedValue(0);
    prismaMock.scheduledClass.count.mockResolvedValue(0);
    prismaMock.assignment.count.mockResolvedValue(0);
    prismaMock.submission.count.mockResolvedValue(0);
    prismaMock.scheduledClass.findMany.mockResolvedValue([]);
    prismaMock.assignment.findMany.mockResolvedValue([]);
    prismaMock.submission.findMany.mockResolvedValue([]);

    const { getTeacherDashboardData } = await loadTeacherDashboardRepository();
    const result = await getTeacherDashboardData("teacher-empty");

    expect(result).toEqual({
      metrics: {
        activeGroups: 0,
        scheduledLessons: 0,
        todayLessons: 0,
        upcomingLessons: 0,
        activeStudents: 0,
        activeAssignments: 0,
        pendingSubmissions: 0,
        gradedThisWeek: 0,
        attendanceToMark: 0,
        reportsToGenerate: 0,
      },
      todayLessons: [],
      upcomingLessons: [],
      pastLessons: [],
      classes: [],
      activeAssignments: [],
      pendingSubmissions: [],
      alerts: [],
    });
  });

  it("scopes lessons, assignments, submissions, and metrics through lesson and ClassGroup ownership", async () => {
    prismaMock.classGroup.count.mockResolvedValueOnce(1);
    mockDashboardQueryResults();

    const { getTeacherDashboardData } = await loadTeacherDashboardRepository();
    const result = await getTeacherDashboardData("teacher-1");

    const teacherClassScope = {
      OR: [{ teacherId: "teacher-1" }, { classGroup: { teacherId: "teacher-1" } }],
    };
    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(teacherClassScope) }),
    );
    expect(prismaMock.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { scheduledClass: { teacherId: "teacher-1" } },
            { scheduledClass: { classGroup: { teacherId: "teacher-1" } } },
          ]),
        }),
      }),
    );
    expect(prismaMock.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          grade: null,
          assignment: expect.objectContaining({
            OR: expect.arrayContaining([
              { scheduledClass: { teacherId: "teacher-1" } },
              { scheduledClass: { classGroup: { teacherId: "teacher-1" } } },
            ]),
          }),
        }),
      }),
    );
    expect(result.metrics).toEqual(
      expect.objectContaining({
        activeGroups: 1,
        scheduledLessons: 2,
        upcomingLessons: 2,
        activeAssignments: 1,
        pendingSubmissions: 1,
        activeStudents: 6,
      }),
    );
    expect(JSON.stringify(result)).not.toContain("Other Teacher");
  });

  it("exposes the stable teacher dashboard metrics contract with zeros for empty dashboards", async () => {
    prismaMock.classGroup.count.mockResolvedValue(0);
    prismaMock.classGroup.findMany.mockResolvedValue([]);
    prismaMock.scheduledClass.count.mockResolvedValue(0);
    prismaMock.scheduledClass.findMany.mockResolvedValue([]);
    prismaMock.assignment.count.mockResolvedValue(0);
    prismaMock.assignment.findMany.mockResolvedValue([]);
    prismaMock.submission.count.mockResolvedValue(0);
    prismaMock.submission.findMany.mockResolvedValue([]);

    const { getTeacherDashboardData } = await loadTeacherDashboardRepository();
    const result = await getTeacherDashboardData("teacher-empty");

    expect(result.metrics).toEqual({
      activeGroups: 0,
      scheduledLessons: 0,
      todayLessons: 0,
      upcomingLessons: 0,
      activeStudents: 0,
      activeAssignments: 0,
      pendingSubmissions: 0,
      gradedThisWeek: 0,
      attendanceToMark: 0,
      reportsToGenerate: 0,
    });
  });

  it("uses teacher-scoped metric query rules for groups, lessons, assignments, submissions, and active students", async () => {
    prismaMock.classGroup.count.mockResolvedValueOnce(1);
    prismaMock.scheduledClass.count.mockResolvedValueOnce(3);
    prismaMock.scheduledClass.count.mockResolvedValueOnce(1);
    prismaMock.scheduledClass.count.mockResolvedValueOnce(1);
    prismaMock.assignment.count.mockResolvedValueOnce(1);
    prismaMock.submission.count.mockResolvedValueOnce(1);
    prismaMock.submission.count.mockResolvedValueOnce(0);
    mockDashboardQueryResults({
      classes: [
        {
          ...directClass,
          students: [
            { id: "active-direct", fullName: "Active Direct", email: "active-direct@example.com" },
            {
              id: "inactive-direct",
              fullName: "Inactive Direct",
              email: "inactive-direct@example.com",
              isActive: false,
            },
          ],
        },
        {
          ...groupClass,
          status: LessonStatus.CANCELLED,
          classGroup: {
            ...groupClass.classGroup,
            status: ClassGroupStatus.ACTIVE,
            students: [
              { id: "active-group", fullName: "Active Group", email: "active-group@example.com" },
              {
                id: "inactive-group",
                fullName: "Inactive Group",
                email: "inactive-group@example.com",
                isActive: false,
              },
            ],
          },
        },
      ],
      assignments: [
        {
          ...assignmentRecord,
          archivedAt: null,
          teacherId: "teacher-1",
          dueDate: new Date("2026-06-05T20:00:00.000Z"),
          scheduledClass: {
            ...assignmentRecord.scheduledClass,
            teacherId: "teacher-1",
            classGroup: { id: "group-1", name: "IGCSE Geometry Group A", teacherId: "teacher-1" },
          },
        },
      ],
      submissions: [
        {
          ...pendingSubmissionRecord,
          grade: null,
          updatedAt: new Date("2026-06-02T10:00:00.000Z"),
          assignment: {
            ...pendingSubmissionRecord.assignment,
            teacherId: "teacher-1",
            scheduledClass: {
              ...pendingSubmissionRecord.assignment.scheduledClass,
              teacherId: "teacher-1",
              classGroup: {
                id: "group-1",
                name: "IGCSE Geometry Group A",
                teacherId: "teacher-1",
              },
            },
          },
        },
      ],
      upcomingLessons: [
        directClass,
        { ...groupClass, status: LessonStatus.CANCELLED },
        {
          ...groupClass,
          id: "lesson-completed",
          status: LessonStatus.COMPLETED,
          startAt: new Date("2026-06-03T09:00:00.000Z"),
        },
      ],
    });

    const { getTeacherDashboardData } = await loadTeacherDashboardRepository();
    const result = await getTeacherDashboardData("teacher-1");

    const teacherLessonScope = {
      OR: [{ teacherId: "teacher-1" }, { classGroup: { teacherId: "teacher-1" } }],
    };
    const teacherAssignmentScope = {
      OR: [
        { scheduledClass: { teacherId: "teacher-1" } },
        { scheduledClass: { classGroup: { teacherId: "teacher-1" } } },
      ],
    };

    expect(prismaMock.classGroup.count).toHaveBeenCalledWith({
      where: {
        teacherId: "teacher-1",
        status: ClassGroupStatus.ACTIVE,
      },
    });
    expect(prismaMock.scheduledClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining(teacherLessonScope),
      }),
    );
    expect(prismaMock.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          dueDate: expect.objectContaining({ gte: expect.any(Date) }),
          OR: expect.arrayContaining(teacherAssignmentScope.OR),
        }),
      }),
    );
    expect(prismaMock.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          grade: null,
          assignment: expect.objectContaining(teacherAssignmentScope),
        }),
      }),
    );
    expect(result.metrics).toEqual(
      expect.objectContaining({
        activeGroups: 1,
        scheduledLessons: 3,
        todayLessons: 1,
        upcomingLessons: 1,
        activeStudents: 2,
        activeAssignments: 1,
        pendingSubmissions: 1,
        gradedThisWeek: 0,
        attendanceToMark: 0,
        reportsToGenerate: 0,
      }),
    );
    expect(JSON.stringify(result.metrics)).not.toContain("Other Teacher");
  });

  it("maps lessons to teacher dashboard lesson cards with shared start-state and teacher detail links", async () => {
    mockDashboardQueryResults();

    const { getTeacherDashboardData } = await loadTeacherDashboardRepository();
    const result = await getTeacherDashboardData("teacher-1");

    expect(result.upcomingLessons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "lesson-direct",
          title: "Direct teacher algebra",
          subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
          classGroup: null,
          startAt: directClass.startAt,
          endAt: directClass.endAt,
          timezone: "Africa/Nairobi",
          status: "LIVE",
          liveLessonUrl: "https://meet.example/direct",
          studentsCount: 2,
          startState: {
            enabled: true,
            href: "https://meet.example/direct",
            reason: null,
          },
          detailHref: "/portal/teacher/lessons/lesson-direct",
        }),
      ]),
    );
  });

  it("maps classes, assignments, and pending submissions to teacher-route dashboard cards", async () => {
    mockDashboardQueryResults();

    const { getTeacherDashboardData } = await loadTeacherDashboardRepository();
    const result = await getTeacherDashboardData("teacher-1");

    expect(result.classes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "lesson-group",
          name: "IGCSE Geometry Group A",
          subject: { id: "subject-geometry", name: "Geometry", slug: "geometry" },
          nextLesson: expect.objectContaining({
            id: "lesson-group",
            startAt: groupClass.startAt,
          }),
          rosterCount: 4,
          students: expect.arrayContaining([
            expect.objectContaining({ id: "student-3", fullName: "Student Three" }),
          ]),
          detailHref: "/portal/teacher/classes/group-1",
          scheduleHref: "/portal/teacher/schedule?classGroupId=group-1",
        }),
      ]),
    );
    expect(result.classes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scheduleHref: expect.stringContaining("/portal/schedule"),
        }),
      ]),
    );
    expect(result.activeAssignments).toEqual([
      expect.objectContaining({
        id: "assignment-group",
        title: "Geometry Homework",
        classGroup: { id: "group-1", name: "IGCSE Geometry Group A" },
        dueDate: assignmentRecord.dueDate,
        submissionsCount: 2,
        pendingGradingCount: 1,
      }),
    ]);
    expect(result.pendingSubmissions).toEqual([
      expect.objectContaining({
        id: "submission-pending",
        contentUrl: "/uploads/submission.pdf",
        student: { id: "student-3", fullName: "Student Three", email: "student3@example.com" },
        assignment: { id: "assignment-group", title: "Geometry Homework" },
        classGroup: { id: "group-1", name: "IGCSE Geometry Group A" },
        submittedAt: pendingSubmissionRecord.submittedAt,
        reviewHref: "/portal/teacher/submissions/submission-pending",
        score: expect.objectContaining({
          min: 0,
          max: 100,
          value: null,
        }),
      }),
    ]);
  });

  it("prefers a current attachment key over a stale legacy submission URL", async () => {
    const storageKey = "private/teachers/teacher-1/submissions/current-work.pdf";
    mockDashboardQueryResults({
      submissions: [
        {
          ...pendingSubmissionRecord,
          contentUrl: "/uploads/submission-stale.pdf",
          attachments: [{ storageKey }],
        },
      ],
    });

    const { getTeacherDashboardData } = await loadTeacherDashboardRepository();
    const result = await getTeacherDashboardData("teacher-1");

    expect(result.pendingSubmissions).toEqual([
      expect.objectContaining({
        id: "submission-pending",
        contentUrl: storageUrlForKey(storageKey),
      }),
    ]);
    expect(JSON.stringify(result.pendingSubmissions)).not.toContain("submission-stale.pdf");
  });

  it("builds My Classes/Groups from ClassGroup.teacherId before legacy direct lesson fallbacks", async () => {
    prismaMock.classGroup.count.mockResolvedValueOnce(2);
    mockDashboardQueryResults({
      classes: [
        {
          ...directClass,
          id: "legacy-direct-lesson",
          title: "Legacy direct lesson",
          classGroup: null,
          students: [
            { id: "direct-active", fullName: "Direct Active", email: "direct@example.com" },
          ],
        },
      ],
    });
    prismaMock.classGroup.findMany.mockResolvedValueOnce([
      {
        id: "group-without-lessons",
        name: "Zero Lesson Group",
        status: ClassGroupStatus.ACTIVE,
        capacity: 12,
        teacherId: "teacher-1",
        subject: { id: "subject-algebra", name: "Algebra", slug: "algebra" },
        level: { id: "level-igcse", name: "IGCSE" },
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
        scheduledClasses: [],
        assignments: [],
      },
      {
        id: "group-cancelled-only",
        name: "Cancelled Only Group",
        status: ClassGroupStatus.ACTIVE,
        capacity: 8,
        teacherId: "teacher-1",
        subject: { id: "subject-geometry", name: "Geometry", slug: "geometry" },
        level: { id: "level-a-level", name: "A Level" },
        students: [],
        scheduledClasses: [
          {
            id: "cancelled-lesson",
            title: "Cancelled lesson",
            description: null,
            startAt: new Date("2026-06-03T09:00:00.000Z"),
            endAt: new Date("2026-06-03T10:00:00.000Z"),
            status: LessonStatus.CANCELLED,
          },
          {
            id: "completed-lesson",
            title: "Completed lesson",
            description: null,
            startAt: new Date("2026-06-04T09:00:00.000Z"),
            endAt: new Date("2026-06-04T10:00:00.000Z"),
            status: LessonStatus.COMPLETED,
          },
        ],
        assignments: [],
      },
    ]);

    const { getTeacherDashboardData } = await loadTeacherDashboardRepository();
    const result = await getTeacherDashboardData("teacher-1");

    expect(prismaMock.classGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teacherId: "teacher-1",
        },
      }),
    );
    expect(result.classes).toEqual([
      expect.objectContaining({
        id: "group-without-lessons",
        name: "Zero Lesson Group",
        status: ClassGroupStatus.ACTIVE,
        subject: { id: "subject-algebra", name: "Algebra", slug: "algebra" },
        level: { id: "level-igcse", name: "IGCSE" },
        capacity: 12,
        rosterCount: 2,
        activeRosterCount: 1,
        studentsPreview: [
          expect.objectContaining({ id: "student-active", fullName: "Active Student" }),
          expect.objectContaining({
            id: "student-inactive",
            fullName: "Inactive Student",
            isActive: false,
          }),
        ],
        inactiveStudentsCount: 1,
        nextLesson: null,
        upcomingLessonsCount: 0,
        pendingSubmissionsCount: 0,
        activeAssignmentsCount: 0,
        detailHref: "/portal/teacher/classes/group-without-lessons",
        scheduleHref: "/portal/teacher/schedule?classGroupId=group-without-lessons",
      }),
      expect.objectContaining({
        id: "group-cancelled-only",
        name: "Cancelled Only Group",
        nextLesson: null,
        upcomingLessonsCount: 0,
        detailHref: "/portal/teacher/classes/group-cancelled-only",
        scheduleHref: "/portal/teacher/schedule?classGroupId=group-cancelled-only",
      }),
      expect.objectContaining({
        id: "legacy-direct-lesson",
        name: "Legacy direct lesson",
        classGroup: null,
        detailHref: "/portal/teacher/lessons/legacy-direct-lesson",
        scheduleHref: "/portal/teacher/schedule",
      }),
    ]);
    expect(JSON.stringify(result.classes)).not.toContain("Other Teacher");
  });

  it("deduplicates class-group cards, picks the nearest valid next lesson, and counts group workload", async () => {
    prismaMock.classGroup.count.mockResolvedValueOnce(1);
    mockDashboardQueryResults({ classes: [] });
    prismaMock.classGroup.findMany.mockResolvedValueOnce([
      {
        id: "group-1",
        name: "IGCSE Geometry Group A",
        status: ClassGroupStatus.ACTIVE,
        capacity: 10,
        teacherId: "teacher-1",
        subject: { id: "subject-geometry", name: "Geometry", slug: "geometry" },
        level: { id: "level-igcse", name: "IGCSE" },
        students: [
          { id: "s1", fullName: "Student 1", email: "s1@example.com", isActive: true },
          { id: "s2", fullName: "Student 2", email: "s2@example.com", isActive: true },
          { id: "s3", fullName: "Student 3", email: "s3@example.com", isActive: true },
          { id: "s4", fullName: "Student 4", email: "s4@example.com", isActive: true },
          { id: "s5", fullName: "Student 5", email: "s5@example.com", isActive: true },
          { id: "s6", fullName: "Student 6", email: "s6@example.com", isActive: false },
        ],
        scheduledClasses: [
          {
            id: "later-lesson",
            title: "Later lesson",
            description: null,
            startAt: new Date("2026-06-10T09:00:00.000Z"),
            endAt: new Date("2026-06-10T10:00:00.000Z"),
            status: LessonStatus.SCHEDULED,
          },
          {
            id: "nearest-lesson",
            title: "Nearest valid lesson",
            description: null,
            startAt: new Date("2026-06-02T09:00:00.000Z"),
            endAt: new Date("2026-06-02T10:00:00.000Z"),
            status: LessonStatus.SCHEDULED,
          },
          {
            id: "cancelled-nearer-lesson",
            title: "Cancelled nearer lesson",
            description: null,
            startAt: new Date("2026-06-01T09:00:00.000Z"),
            endAt: new Date("2026-06-01T10:00:00.000Z"),
            status: LessonStatus.CANCELLED,
          },
        ],
        assignments: [
          {
            id: "assignment-active",
            archivedAt: null,
            dueDate: new Date("2026-06-05T20:00:00.000Z"),
            submissions: [
              { id: "pending-1", grade: null },
              { id: "graded-1", grade: 90 },
            ],
          },
          {
            id: "assignment-archived",
            archivedAt: new Date("2026-06-01T00:00:00.000Z"),
            dueDate: new Date("2026-06-05T20:00:00.000Z"),
            submissions: [{ id: "pending-archived", grade: null }],
          },
        ],
      },
    ]);

    const { getTeacherDashboardData } = await loadTeacherDashboardRepository();
    const result = await getTeacherDashboardData("teacher-1");

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]).toEqual(
      expect.objectContaining({
        id: "group-1",
        rosterCount: 6,
        activeRosterCount: 5,
        studentsPreview: expect.arrayContaining([
          expect.objectContaining({ id: "s1" }),
          expect.objectContaining({ id: "s4" }),
        ]),
        studentsMoreCount: 2,
        inactiveStudentsCount: 1,
        nextLesson: expect.objectContaining({
          id: "nearest-lesson",
          title: "Nearest valid lesson",
          detailHref: "/portal/teacher/lessons/nearest-lesson",
        }),
        upcomingLessonsCount: 2,
        pendingSubmissionsCount: 1,
        activeAssignmentsCount: 1,
      }),
    );
    expect(JSON.stringify(result.classes[0])).not.toContain("cancelled-nearer-lesson");
  });

  it("handles sparse teacher data without crashing and preserves empty view-model defaults", async () => {
    mockDashboardQueryResults({
      classes: [
        {
          ...directClass,
          subject: null,
          students: [],
          classGroup: null,
          liveLessonUrl: null,
        },
      ],
      assignments: [
        {
          ...assignmentRecord,
          submissions: [],
          scheduledClass: {
            id: "lesson-direct",
            title: "Direct teacher algebra",
            classGroup: null,
            subject: null,
          },
        },
      ],
      submissions: [],
      upcomingLessons: [],
      pastLessons: [],
    });

    const { getTeacherDashboardData } = await loadTeacherDashboardRepository();
    const result = await getTeacherDashboardData("teacher-1");

    expect(result.classes).toEqual([
      expect.objectContaining({
        id: "lesson-direct",
        subject: null,
        rosterCount: 0,
        students: [],
      }),
    ]);
    expect(result.activeAssignments).toEqual([
      expect.objectContaining({
        submissionsCount: 0,
        pendingGradingCount: 0,
      }),
    ]);
    expect(result.pendingSubmissions).toEqual([]);
    expect(result.alerts).toEqual([]);
  });
});
