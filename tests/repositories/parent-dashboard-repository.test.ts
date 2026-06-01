import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getLinkedChildrenMock = vi.hoisted(() => vi.fn());
const listParentChildScheduleMock = vi.hoisted(() => vi.fn());
const listAssignmentsForStudentMock = vi.hoisted(() => vi.fn());
const listParentChildCourseMaterialsMock = vi.hoisted(() => vi.fn());
const listParentChildAttendanceMock = vi.hoisted(() => vi.fn());
const listProgressNotesForParentChildMock = vi.hoisted(() => vi.fn());
const getParentChildGradebookMock = vi.hoisted(() => vi.fn());
const listReportSnapshotsForParentChildMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/portal-repository", () => ({
  getLinkedChildren: getLinkedChildrenMock,
}));

vi.mock("@/lib/repositories/student-schedule-repository", () => ({
  listParentChildSchedule: listParentChildScheduleMock,
}));

vi.mock("@/lib/repositories/submission-repository", () => ({
  listAssignmentsForStudent: listAssignmentsForStudentMock,
}));

vi.mock("@/lib/repositories/course-material-repository", () => ({
  listParentChildCourseMaterials: listParentChildCourseMaterialsMock,
}));

vi.mock("@/lib/repositories/attendance-repository", () => ({
  listParentChildAttendance: listParentChildAttendanceMock,
}));

vi.mock("@/lib/repositories/student-progress-repository", () => ({
  listProgressNotesForParentChild: listProgressNotesForParentChildMock,
}));

vi.mock("@/lib/repositories/gradebook-repository", () => ({
  getParentChildGradebook: getParentChildGradebookMock,
}));

vi.mock("@/lib/repositories/report-repository", () => ({
  listReportSnapshotsForParentChild: listReportSnapshotsForParentChildMock,
}));

type ParentDashboardRepositoryModule = {
  getParentDashboardData: (parentId: string) => Promise<Record<string, unknown>>;
};

function loadParentDashboardRepository() {
  const specifier = "@/lib/repositories/parent-dashboard-repository";
  return import(/* @vite-ignore */ specifier) as Promise<ParentDashboardRepositoryModule>;
}

function lesson(overrides: Record<string, unknown> = {}) {
  return {
    classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
    id: "lesson-1",
    startAt: new Date("2026-06-01T09:00:00.000Z"),
    subject: { id: "subject-1", name: "Mathematics" },
    teacher: { id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" },
    title: "Algebra lesson",
    ...overrides,
  };
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    archivedAt: null,
    detailHref: "/portal/student/assignments/assignment-1",
    dueDate: new Date("2026-06-20T20:00:00.000Z"),
    grade: null,
    id: "assignment-1",
    status: "Not submitted",
    title: "Quadratic equations",
    ...overrides,
  };
}

describe("parent-dashboard-repository contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getLinkedChildrenMock.mockResolvedValue([
      { email: "linked-one@example.com", fullName: "Linked One", id: "student-1" },
      { email: "linked-two@example.com", fullName: "Linked Two", id: "student-2" },
    ]);
    listParentChildScheduleMock.mockImplementation((_input) =>
      Promise.resolve([lesson(), lesson({ id: "lesson-2", title: "Geometry lesson" })]),
    );
    listAssignmentsForStudentMock.mockImplementation((studentId: string) =>
      Promise.resolve(
        studentId === "student-1"
          ? [
              assignment(),
              assignment({
                grade: 91,
                id: "assignment-graded",
                status: "Graded",
                title: "Graded trigonometry",
              }),
              assignment({
                archivedAt: new Date("2026-05-01T00:00:00.000Z"),
                id: "assignment-archived",
                status: "Archived",
                title: "Archived assignment",
              }),
            ]
          : [],
      ),
    );
    listParentChildCourseMaterialsMock.mockResolvedValue([
      {
        createdAt: new Date("2026-05-28T10:00:00.000Z"),
        id: "material-1",
        title: "Graphing worksheet",
      },
    ]);
    listParentChildAttendanceMock.mockResolvedValue({
      records: [
        { id: "attendance-1", status: "PRESENT" },
        { id: "attendance-2", status: "ABSENT" },
      ],
      summary: { absent: 1, attendanceRate: 50, late: 0, present: 1, total: 2 },
    });
    listProgressNotesForParentChildMock.mockResolvedValue([
      {
        content: "Strong algebra progress.",
        id: "progress-1",
        recordedAt: new Date("2026-06-01T10:00:00.000Z"),
        subject: { id: "subject-1", name: "Mathematics" },
      },
    ]);
    getParentChildGradebookMock.mockResolvedValue({
      term: { id: "term-1", name: "Spring 2026" },
      termAverage: 84.7,
    });
    listReportSnapshotsForParentChildMock.mockResolvedValue([
      {
        academicTerm: { id: "term-1", name: "Spring 2026" },
        generatedAt: new Date("2026-05-20T10:00:00.000Z"),
        href: "/portal/parent/reports/student-1/snapshot-1",
        id: "snapshot-1",
        weightedTermAverage: 92,
      },
    ]);
  });

  it("exports a dedicated parent dashboard read API", async () => {
    const repository = await loadParentDashboardRepository();

    expect(repository).toEqual(
      expect.objectContaining({
        getParentDashboardData: expect.any(Function),
      }),
    );
  });

  it("aggregates each linked child through parent-scoped read APIs and never queries unlinked children", async () => {
    const { getParentDashboardData } = await loadParentDashboardRepository();
    const dashboard = await getParentDashboardData("parent-1");

    expect(getLinkedChildrenMock).toHaveBeenCalledWith("parent-1");
    for (const childId of ["student-1", "student-2"]) {
      expect(listParentChildScheduleMock).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: "parent-1", studentId: childId }),
      );
      expect(listParentChildCourseMaterialsMock).toHaveBeenCalledWith(
        "parent-1",
        childId,
        expect.anything(),
      );
      expect(listParentChildAttendanceMock).toHaveBeenCalledWith(
        "parent-1",
        childId,
        expect.anything(),
      );
      expect(listProgressNotesForParentChildMock).toHaveBeenCalledWith(
        "parent-1",
        childId,
        expect.objectContaining({ status: "active" }),
      );
      expect(getParentChildGradebookMock).toHaveBeenCalledWith("parent-1", childId, "");
      expect(listReportSnapshotsForParentChildMock).toHaveBeenCalledWith(
        "parent-1",
        childId,
        expect.objectContaining({ sort: "generatedAtDesc" }),
      );
    }
    expect(listParentChildScheduleMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "foreign-student" }),
    );
    expect(JSON.stringify(dashboard)).not.toContain("foreign-student");
  });

  it("returns an empty dashboard without reading child domains when the parent has no linked children", async () => {
    getLinkedChildrenMock.mockResolvedValueOnce([]);
    const { getParentDashboardData } = await loadParentDashboardRepository();
    const dashboard = await getParentDashboardData("parent-1");

    expect(dashboard).toEqual({ children: [] });
    expect(listParentChildScheduleMock).not.toHaveBeenCalled();
    expect(listAssignmentsForStudentMock).not.toHaveBeenCalled();
    expect(listParentChildCourseMaterialsMock).not.toHaveBeenCalled();
    expect(listParentChildAttendanceMock).not.toHaveBeenCalled();
    expect(listProgressNotesForParentChildMock).not.toHaveBeenCalled();
    expect(getParentChildGradebookMock).not.toHaveBeenCalled();
    expect(listReportSnapshotsForParentChildMock).not.toHaveBeenCalled();
  });

  it("returns real per-child summaries and parent workflow links without legacy hardcoded values", async () => {
    const { getParentDashboardData } = await loadParentDashboardRepository();
    const dashboard = await getParentDashboardData("parent-1");

    expect(dashboard).toEqual(
      expect.objectContaining({
        children: expect.arrayContaining([
          expect.objectContaining({
            assignmentsSummary: expect.objectContaining({
              pendingCount: 1,
              recentGradedCount: 1,
            }),
            attendanceSummary: expect.objectContaining({ attendanceRate: 50, totalCount: 2 }),
            gradebookSummary: expect.objectContaining({ currentTermAverage: 84.7 }),
            id: "student-1",
            materialsSummary: expect.objectContaining({ totalCount: 1 }),
            progressSummary: expect.objectContaining({
              latestNote: expect.objectContaining({ content: "Strong algebra progress." }),
            }),
            quickLinks: expect.arrayContaining([
              expect.objectContaining({ href: "/portal/parent/schedule?studentId=student-1" }),
              expect.objectContaining({ href: "/portal/parent/assignments/student-1" }),
              expect.objectContaining({ href: "/portal/parent/materials/student-1" }),
              expect.objectContaining({ href: "/portal/parent/attendance/student-1" }),
              expect.objectContaining({ href: "/portal/parent/progress/student-1" }),
              expect.objectContaining({ href: "/portal/parent/gradebook/student-1" }),
              expect.objectContaining({ href: "/portal/parent/reports/student-1" }),
            ]),
            reportsSummary: expect.objectContaining({
              latestReport: expect.objectContaining({ weightedTermAverage: 92 }),
            }),
            scheduleSummary: expect.objectContaining({
              nextLesson: expect.objectContaining({
                teacherName: "Jane Teacher",
                title: "Algebra lesson",
              }),
              upcomingCount: 2,
            }),
          }),
        ]),
      }),
    );
    expect(JSON.stringify(dashboard)).not.toContain("95%");
    expect(JSON.stringify(dashboard)).not.toContain("8/10");
    expect(JSON.stringify(dashboard)).not.toContain("tasks");
  });

  it("does not keep the finalized dashboard aggregation in the legacy portal repository", () => {
    const source = readFileSync("lib/repositories/parent-dashboard-repository.ts", "utf8");

    expect(source).not.toContain("structuredProgress");
    expect(source).not.toContain('"95%"');
    expect(source).not.toContain("portal-repository.ts");
    expect(source).not.toContain("prisma.appUser.findUnique");
  });
});
