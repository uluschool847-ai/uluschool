import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listStudentScheduleMock = vi.hoisted(() => vi.fn());
const listAssignmentsForStudentMock = vi.hoisted(() => vi.fn());
const listStudentCourseMaterialsMock = vi.hoisted(() => vi.fn());
const listStudentAttendanceMock = vi.hoisted(() => vi.fn());
const listProgressNotesForStudentMock = vi.hoisted(() => vi.fn());
const getStudentGradebookMock = vi.hoisted(() => vi.fn());
const listReportSnapshotsForStudentMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/student-schedule-repository", () => ({
  listStudentSchedule: listStudentScheduleMock,
}));

vi.mock("@/lib/repositories/submission-repository", () => ({
  listAssignmentsForStudent: listAssignmentsForStudentMock,
}));

vi.mock("@/lib/repositories/course-material-repository", () => ({
  listStudentCourseMaterials: listStudentCourseMaterialsMock,
}));

vi.mock("@/lib/repositories/attendance-repository", () => ({
  listStudentAttendance: listStudentAttendanceMock,
}));

vi.mock("@/lib/repositories/student-progress-repository", () => ({
  listProgressNotesForStudent: listProgressNotesForStudentMock,
}));

vi.mock("@/lib/repositories/gradebook-repository", () => ({
  getStudentGradebook: getStudentGradebookMock,
}));

vi.mock("@/lib/repositories/report-repository", () => ({
  listReportSnapshotsForStudent: listReportSnapshotsForStudentMock,
}));

type StudentDashboardRepositoryModule = {
  getStudentDashboardData: (studentId: string) => Promise<Record<string, unknown>>;
};

function loadStudentDashboardRepository() {
  const specifier = "@/lib/repositories/student-dashboard-repository";
  return import(/* @vite-ignore */ specifier) as Promise<StudentDashboardRepositoryModule>;
}

function lesson(overrides: Record<string, unknown> = {}) {
  return {
    classGroup: { id: "group-1", name: "Algebra Group A" },
    detailHref: "/portal/student/schedule/lesson-1",
    id: "lesson-1",
    startAt: new Date("2026-06-01T09:00:00.000Z"),
    subject: { id: "subject-1", name: "Mathematics" },
    title: "Algebra lesson",
    ...overrides,
  };
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    archivedAt: null,
    detailHref: "/portal/student/assignments/assignment-1",
    dueDate: new Date("2026-06-20T20:00:00.000Z"),
    id: "assignment-1",
    status: "Not submitted",
    title: "Quadratic equations",
    ...overrides,
  };
}

describe("student-dashboard-repository contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    listStudentScheduleMock.mockResolvedValue([lesson(), lesson({ id: "lesson-2" })]);
    listAssignmentsForStudentMock.mockResolvedValue([
      assignment(),
      assignment({ id: "assignment-graded", status: "Graded", title: "Graded assignment" }),
      assignment({
        archivedAt: new Date("2026-05-01T00:00:00.000Z"),
        id: "assignment-archived",
        status: "Archived",
        title: "Archived assignment",
      }),
    ]);
    listStudentCourseMaterialsMock.mockResolvedValue([
      {
        createdAt: new Date("2026-05-28T10:00:00.000Z"),
        href: "/uploads/material.pdf",
        id: "material-1",
        title: "Graphing worksheet",
      },
    ]);
    listStudentAttendanceMock.mockResolvedValue({
      records: [
        { id: "attendance-1", status: "PRESENT" },
        { id: "attendance-2", status: "LATE" },
        { id: "attendance-3", status: "ABSENT" },
      ],
      summary: { absent: 1, attendanceRate: 66.7, late: 1, present: 1, total: 3 },
    });
    listProgressNotesForStudentMock.mockResolvedValue([
      {
        content: "Strong algebra progress.",
        id: "progress-1",
        recordedAt: new Date("2026-06-01T10:00:00.000Z"),
        subject: { id: "subject-1", name: "Mathematics" },
      },
    ]);
    getStudentGradebookMock.mockResolvedValue({
      term: { id: "term-1", name: "Spring 2026" },
      termAverage: 84.7,
    });
    listReportSnapshotsForStudentMock.mockResolvedValue([
      {
        academicTerm: { id: "term-1", name: "Spring 2026" },
        generatedAt: new Date("2026-05-20T10:00:00.000Z"),
        href: "/portal/student/reports/snapshot-1",
        id: "snapshot-1",
        weightedTermAverage: 92,
      },
    ]);
  });

  it("exports a dedicated student dashboard read API", async () => {
    const repository = await loadStudentDashboardRepository();

    expect(repository).toEqual(
      expect.objectContaining({
        getStudentDashboardData: expect.any(Function),
      }),
    );
  });

  it("aggregates dashboard summaries through student-scoped read APIs using only the provided student id", async () => {
    const { getStudentDashboardData } = await loadStudentDashboardRepository();
    const dashboard = await getStudentDashboardData("student-1");

    expect(listStudentScheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "student-1" }),
    );
    expect(listAssignmentsForStudentMock).toHaveBeenCalledWith(
      "student-1",
      expect.objectContaining({ status: expect.stringMatching(/active|all/) }),
    );
    expect(listStudentCourseMaterialsMock).toHaveBeenCalledWith("student-1", expect.anything());
    expect(listStudentAttendanceMock).toHaveBeenCalledWith("student-1", expect.anything());
    expect(listProgressNotesForStudentMock).toHaveBeenCalledWith(
      "student-1",
      expect.objectContaining({ status: "active" }),
    );
    expect(getStudentGradebookMock).toHaveBeenCalledWith("student-1", expect.anything());
    expect(listReportSnapshotsForStudentMock).toHaveBeenCalledWith(
      "student-1",
      expect.objectContaining({ sort: "generatedAtDesc" }),
    );

    expect(dashboard).toEqual(
      expect.objectContaining({
        assignmentsSummary: expect.objectContaining({
          pendingCount: 1,
          recentGradedCount: 1,
          nextPending: expect.objectContaining({ title: "Quadratic equations" }),
        }),
        attendanceSummary: expect.objectContaining({ attendanceRate: 66.7, totalCount: 3 }),
        gradebookSummary: expect.objectContaining({ currentTermAverage: 84.7 }),
        materialsSummary: expect.objectContaining({ totalCount: 1 }),
        progressSummary: expect.objectContaining({
          latestNote: expect.objectContaining({ content: "Strong algebra progress." }),
        }),
        quickLinks: expect.arrayContaining([
          expect.objectContaining({ href: "/portal/student/schedule" }),
          expect.objectContaining({ href: "/portal/student/assignments" }),
          expect.objectContaining({ href: "/portal/student/materials" }),
          expect.objectContaining({ href: "/portal/student/attendance" }),
          expect.objectContaining({ href: "/portal/student/progress" }),
          expect.objectContaining({ href: "/portal/student/gradebook" }),
          expect.objectContaining({ href: "/portal/student/reports" }),
        ]),
        reportsSummary: expect.objectContaining({
          latestReport: expect.objectContaining({ weightedTermAverage: 92 }),
        }),
        scheduleSummary: expect.objectContaining({
          nextLesson: expect.objectContaining({ title: "Algebra lesson" }),
          upcomingCount: 2,
        }),
        student: expect.objectContaining({ id: "student-1" }),
      }),
    );
    expect(JSON.stringify(dashboard)).not.toContain("foreign-student");
  });

  it("does not depend on teacher/admin repositories or legacy portal writes", async () => {
    const source = readFileSync("lib/repositories/student-dashboard-repository.ts", "utf8");

    expect(source).not.toContain("teacher-dashboard-repository");
    expect(source).not.toContain("portal-repository");
    expect(source).not.toContain("submitHomeworkAction");
    expect(source).not.toContain("generatedByTeacherId");
  });
});
