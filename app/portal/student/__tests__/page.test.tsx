import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getStudentDashboardDataMock = vi.hoisted(() => vi.fn());
const listAssignmentsForStudentMock = vi.hoisted(() => vi.fn());
const listStudentCourseMaterialsMock = vi.hoisted(() => vi.fn());
const listProgressNotesForStudentMock = vi.hoisted(() => vi.fn());
const getStudentGradebookMock = vi.hoisted(() => vi.fn());
const listReportSnapshotsForStudentMock = vi.hoisted(() => vi.fn());
const listStudentHomeworkMock = vi.hoisted(() => vi.fn());
const getStudentProgressMock = vi.hoisted(() => vi.fn());
const submitHomeworkActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/student-dashboard-repository", () => ({
  getStudentDashboardData: getStudentDashboardDataMock,
}));

vi.mock("@/lib/repositories/submission-repository", () => ({
  listAssignmentsForStudent: listAssignmentsForStudentMock,
}));

vi.mock("@/lib/repositories/course-material-repository", () => ({
  listStudentCourseMaterials: listStudentCourseMaterialsMock,
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

vi.mock("@/lib/repositories/portal-repository", () => ({
  getStudentProgress: getStudentProgressMock,
  listStudentHomework: listStudentHomeworkMock,
}));

vi.mock("@/app/portal/actions", () => ({
  submitHomeworkAction: submitHomeworkActionMock,
}));

type StudentDashboardPageModule = {
  default: () => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/student/page.tsx";

async function loadDashboardPage() {
  const specifier = "@/app/portal/student/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentDashboardPageModule>;
}

function assignmentPreview(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment-1",
    title: "Quadratic equations",
    descriptionPreview: "Solve questions 1-10.",
    dueDate: new Date("2026-06-20T20:00:00.000Z"),
    status: "Not submitted",
    detailHref: "/portal/student/assignments/assignment-1",
    subject: { id: "subject-math", name: "Mathematics" },
    scheduledClass: { id: "lesson-1", title: "Algebra lesson" },
    classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
    currentSubmission: null,
    ...overrides,
  };
}

function legacyHomework(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment-1",
    title: "Quadratic equations",
    description: "Solve questions 1-10.",
    dueDate: new Date("2026-06-20T20:00:00.000Z"),
    scheduledClass: { title: "Algebra lesson" },
    submissions: [],
    ...overrides,
  };
}

function progressPreview(overrides: Record<string, unknown> = {}) {
  return {
    id: "progress-1",
    archivedAt: null,
    content: "Strong algebra progress.",
    performanceLevel: "GOOD",
    recordedAt: "2026-06-01T10:00:00.000Z",
    statusLabel: "Active",
    subject: { id: "subject-math", name: "Mathematics" },
    teacherName: "Jane Teacher",
    teacherNotes: "Strong algebra progress.",
    updatedAt: "2026-06-02T10:30:00.000Z",
    ...overrides,
  };
}

function gradebookPreview(overrides: Record<string, unknown> = {}) {
  return {
    categories: [
      { category: "HOMEWORK", label: "Homework", average: 82 },
      { category: "MANUAL", label: "Manual", average: 91 },
    ],
    categoryWeights: { HOMEWORK: 70, MANUAL: 30 },
    homeworkGrades: [],
    manualGrades: [],
    manualGradeHistory: [],
    student: { email: "student@example.com", fullName: "Student One", id: "student-1" },
    term: { id: "term-1", name: "Spring 2026" },
    termAverage: 84.7,
    ...overrides,
  };
}

function reportPreview(overrides: Record<string, unknown> = {}) {
  return {
    academicTerm: { id: "term-1", name: "Spring 2026" },
    classGroup: { id: "group-1", name: "Algebra Group A" },
    generatedAt: new Date("2026-05-20T10:00:00.000Z"),
    href: "/portal/student/reports/snapshot-1",
    id: "snapshot-1",
    teacherCommentPreview: "Keep practicing",
    weightedTermAverage: 92,
    ...overrides,
  };
}

function dashboardData(overrides: Record<string, unknown> = {}) {
  return {
    assignmentsSummary: {
      pendingCount: 2,
      recentGradedCount: 1,
      nextPending: {
        dueDate: new Date("2026-06-20T20:00:00.000Z"),
        href: "/portal/student/assignments/assignment-1",
        title: "Quadratic equations",
      },
    },
    attendanceSummary: {
      absentCount: 1,
      attendanceRate: 87.5,
      lateCount: 1,
      presentCount: 12,
      totalCount: 14,
    },
    gradebookSummary: {
      currentTermAverage: 84.7,
      termName: "Spring 2026",
    },
    materialsSummary: {
      latestMaterial: {
        href: "/portal/student/materials?scheduledClassId=lesson-1",
        title: "Graphing worksheet",
      },
      totalCount: 3,
    },
    progressSummary: {
      latestNote: {
        content: "Strong algebra progress.",
        recordedAt: new Date("2026-06-01T10:00:00.000Z"),
        subjectName: "Mathematics",
      },
    },
    quickLinks: [
      { href: "/portal/student/schedule", label: "Open schedule" },
      { href: "/portal/student/assignments", label: "Open assignments" },
      { href: "/portal/student/materials", label: "Open materials" },
      { href: "/portal/student/attendance", label: "Open attendance" },
      { href: "/portal/student/progress", label: "Open progress" },
      { href: "/portal/student/gradebook", label: "Open gradebook" },
      { href: "/portal/student/reports", label: "Open reports" },
    ],
    reportsSummary: {
      latestReport: {
        generatedAt: new Date("2026-05-20T10:00:00.000Z"),
        href: "/portal/student/reports/snapshot-1",
        termName: "Spring 2026",
        weightedTermAverage: 92,
      },
    },
    scheduleSummary: {
      nextLesson: {
        href: "/portal/student/schedule/lesson-1",
        startAt: new Date("2026-06-01T09:00:00.000Z"),
        subjectName: "Mathematics",
        title: "Algebra lesson",
      },
      todayCount: 1,
      upcomingCount: 2,
    },
    student: { email: "student@example.com", fullName: "Student One", id: "student-1" },
    ...overrides,
  };
}

describe("Student dashboard assignment preview cleanup", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({
      uid: "student-1",
      role: UserRole.STUDENT,
      email: "student@example.com",
    });
    listAssignmentsForStudentMock.mockResolvedValue([assignmentPreview()]);
    listStudentCourseMaterialsMock.mockResolvedValue([]);
    listProgressNotesForStudentMock.mockResolvedValue([progressPreview()]);
    getStudentGradebookMock.mockResolvedValue(gradebookPreview());
    listReportSnapshotsForStudentMock.mockResolvedValue([reportPreview()]);
    getStudentDashboardDataMock.mockResolvedValue(dashboardData());
    listStudentHomeworkMock.mockResolvedValue([]);
    getStudentProgressMock.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps the STUDENT guard and removes legacy dashboard homework imports", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.STUDENT])");
    expect(source).toContain("getStudentDashboardData");
    expect(source).not.toContain("prisma.");
    expect(source).not.toContain("@/lib/repositories/portal-repository");
    expect(source).not.toContain("listAssignmentsForStudent");
    expect(source).not.toContain("listProgressNotesForStudent");
    expect(source).not.toContain("getStudentGradebook");
    expect(source).not.toContain("listReportSnapshotsForStudent");
    expect(source).not.toContain("getStudentProgress");
    expect(source).not.toContain("submitHomeworkAction");
    expect(source).not.toContain("listStudentHomework");
    expect(source).not.toContain("@/app/portal/actions");
  });

  it("loads the final dashboard hub through the dedicated student dashboard API using session.uid", async () => {
    const page = await loadDashboardPage();
    const element = await page.default();
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
    expect(getStudentDashboardDataMock).toHaveBeenCalledWith("student-1");
    expect(listAssignmentsForStudentMock).not.toHaveBeenCalled();
    expect(listProgressNotesForStudentMock).not.toHaveBeenCalled();
    expect(getStudentGradebookMock).not.toHaveBeenCalled();
    expect(listReportSnapshotsForStudentMock).not.toHaveBeenCalled();
  });

  it("renders the finalized student dashboard hub cards with concise summaries and section links", async () => {
    const page = await loadDashboardPage();
    const element = await page.default();
    render(element);

    for (const section of [
      "Schedule",
      "Assignments",
      "Materials",
      "Attendance",
      "Progress",
      "Gradebook",
      "Reports",
    ]) {
      expect(screen.getByRole("heading", { name: section })).toBeDefined();
    }

    expect(screen.getByText(/next lesson/i)).toBeDefined();
    expect(screen.getByText(/algebra lesson/i)).toBeDefined();
    expect(screen.getByText(/pending assignments:\s*2/i)).toBeDefined();
    expect(screen.getByText(/recently graded:\s*1/i)).toBeDefined();
    expect(screen.getByText(/materials:\s*3/i)).toBeDefined();
    expect(screen.getByText(/attendance rate:\s*87\.5%/i)).toBeDefined();
    expect(screen.getByText(/strong algebra progress/i)).toBeDefined();
    expect(screen.getByText(/grade average:\s*84\.7/i)).toBeDefined();
    expect(screen.getByText(/latest report/i)).toBeDefined();

    expect(screen.getByRole("link", { name: /open schedule/i })).toHaveAttribute(
      "href",
      "/portal/student/schedule",
    );
    expect(screen.getByRole("link", { name: /open assignments/i })).toHaveAttribute(
      "href",
      "/portal/student/assignments",
    );
    expect(screen.getByRole("link", { name: /open materials/i })).toHaveAttribute(
      "href",
      "/portal/student/materials",
    );
    expect(screen.getByRole("link", { name: /open attendance/i })).toHaveAttribute(
      "href",
      "/portal/student/attendance",
    );
    expect(screen.getByRole("link", { name: /open progress/i })).toHaveAttribute(
      "href",
      "/portal/student/progress",
    );
    expect(screen.getByRole("link", { name: /open gradebook/i })).toHaveAttribute(
      "href",
      "/portal/student/gradebook",
    );
    expect(screen.getByRole("link", { name: /open reports/i })).toHaveAttribute(
      "href",
      "/portal/student/reports",
    );
  });

  it("renders a student profile dashboard card without exposing raw IDs or unsafe URLs", async () => {
    getStudentDashboardDataMock.mockResolvedValueOnce(
      dashboardData({
        profileSummary: {
          email: "student@example.com",
          fullName: "Student One",
          href: "/portal/student/profile",
          membershipLabel: "IGCSE Mathematics A",
        },
        quickLinks: [
          { href: "/portal/student/schedule", label: "Open schedule" },
          { href: "/portal/student/assignments", label: "Open assignments" },
          { href: "/portal/student/materials", label: "Open materials" },
          { href: "/portal/student/attendance", label: "Open attendance" },
          { href: "/portal/student/progress", label: "Open progress" },
          { href: "/portal/student/gradebook", label: "Open gradebook" },
          { href: "/portal/student/reports", label: "Open reports" },
          { href: "/portal/student/profile", label: "Open profile" },
        ],
      }),
    );

    const page = await loadDashboardPage();
    const element = await page.default();
    const { container } = render(element);

    expect(screen.getByRole("heading", { name: /^profile$/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /^open profile$/i })).toHaveAttribute(
      "href",
      "/portal/student/profile",
    );
    expect(screen.getByText(/student one/i)).toBeDefined();
    expect(screen.getByText(/student@example\.com/i)).toBeDefined();
    expect(screen.getByText(/igcse mathematics a/i)).toBeDefined();
    expect(container.textContent).not.toContain("student-1");
    expect(container.textContent).not.toMatch(/javascript:|data:|file:/i);
  });

  it("renders accessible final dashboard empty states for every student workflow", async () => {
    getStudentDashboardDataMock.mockResolvedValueOnce(
      dashboardData({
        assignmentsSummary: { pendingCount: 0, recentGradedCount: 0, nextPending: null },
        attendanceSummary: null,
        gradebookSummary: { currentTermAverage: null, termName: null },
        materialsSummary: { latestMaterial: null, totalCount: 0 },
        progressSummary: { latestNote: null },
        reportsSummary: { latestReport: null },
        scheduleSummary: { nextLesson: null, todayCount: 0, upcomingCount: 0 },
      }),
    );

    const page = await loadDashboardPage();
    const element = await page.default();
    render(element);

    expect(screen.getByRole("status", { name: /schedule/i })).toHaveTextContent(
      /no upcoming lessons/i,
    );
    expect(screen.getByRole("status", { name: /assignments/i })).toHaveTextContent(
      /no pending assignments/i,
    );
    expect(screen.getByRole("status", { name: /materials/i })).toHaveTextContent(/no materials/i);
    expect(screen.getByRole("status", { name: /attendance/i })).toHaveTextContent(
      /no attendance records/i,
    );
    expect(screen.getByRole("status", { name: /progress/i })).toHaveTextContent(
      /no progress notes/i,
    );
    expect(screen.getByRole("status", { name: /gradebook/i })).toHaveTextContent(
      /no grade average/i,
    );
    expect(screen.getByRole("status", { name: /reports/i })).toHaveTextContent(/no reports/i);
  });

  it("does not surface archived or graded assignments as urgent pending work", async () => {
    getStudentDashboardDataMock.mockResolvedValueOnce(
      dashboardData({
        assignmentsSummary: {
          pendingCount: 1,
          recentGradedCount: 2,
          nextPending: {
            dueDate: new Date("2026-06-20T20:00:00.000Z"),
            href: "/portal/student/assignments/active-assignment",
            title: "Active work",
          },
        },
      }),
    );

    const page = await loadDashboardPage();
    const element = await page.default();
    render(element);

    expect(screen.getByText(/active work/i)).toBeDefined();
    expect(screen.queryByText(/graded assignment/i)).toBeNull();
    expect(screen.queryByText(/archived assignment/i)).toBeNull();
  });

  it("renders quick links to student workflows", async () => {
    const page = await loadDashboardPage();
    const element = await page.default();
    render(element);

    expect(screen.getByRole("link", { name: /assignments/i })).toHaveAttribute(
      "href",
      "/portal/student/assignments",
    );
    expect(screen.getByRole("link", { name: /materials/i })).toHaveAttribute(
      "href",
      "/portal/student/materials",
    );
    expect(screen.getByRole("link", { name: /attendance/i })).toHaveAttribute(
      "href",
      "/portal/student/attendance",
    );
    expect(screen.getByRole("link", { name: /progress/i })).toHaveAttribute(
      "href",
      "/portal/student/progress",
    );
    expect(screen.getByRole("link", { name: /schedule/i })).toHaveAttribute(
      "href",
      "/portal/student/schedule",
    );
    expect(screen.getByRole("link", { name: /gradebook/i })).toHaveAttribute(
      "href",
      "/portal/student/gradebook",
    );
    expect(screen.getByRole("link", { name: /reports/i })).toHaveAttribute(
      "href",
      "/portal/student/reports",
    );
  });

  it("links the pending assignment summary to detail instead of rendering legacy inline submit forms", async () => {
    listStudentHomeworkMock.mockResolvedValueOnce([legacyHomework()]);

    const page = await loadDashboardPage();
    const element = await page.default();
    render(element);

    expect(screen.getByText(/quadratic equations/i)).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: /quadratic equations|open assignments/i })
        .getAttribute("href"),
    ).toMatch(/^\/portal\/student\/assignments/);
    expect(screen.queryByRole("button", { name: /^submit$/i })).toBeNull();
    expect(screen.queryByPlaceholderText(/google drive|dropbox/i)).toBeNull();
    expect(submitHomeworkActionMock).not.toHaveBeenCalled();
  });

  it("links progress preview to the dedicated student progress page", async () => {
    const page = await loadDashboardPage();
    const element = await page.default();
    render(element);

    expect(screen.getByText(/strong algebra progress/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /open progress|progress/i })).toHaveAttribute(
      "href",
      "/portal/student/progress",
    );
  });

  it("renders an accessible empty assignment state", async () => {
    getStudentDashboardDataMock.mockResolvedValueOnce(
      dashboardData({
        assignmentsSummary: { pendingCount: 0, recentGradedCount: 0, nextPending: null },
      }),
    );
    listAssignmentsForStudentMock.mockResolvedValueOnce([]);
    listStudentHomeworkMock.mockResolvedValueOnce([]);

    const page = await loadDashboardPage();
    const element = await page.default();
    render(element);

    expect(screen.getByRole("status", { name: /assignments|homework/i })).toBeDefined();
    expect(
      screen.getByText(/no pending assignments|no assignments yet|no homework assigned yet/i),
    ).toBeDefined();
  });

  it("rejects wrong roles before loading dashboard assignment previews", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    const page = await loadDashboardPage();

    await expect(page.default()).rejects.toThrow("NEXT_REDIRECT");
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
    expect(getStudentDashboardDataMock).not.toHaveBeenCalled();
    expect(listAssignmentsForStudentMock).not.toHaveBeenCalled();
    expect(listProgressNotesForStudentMock).not.toHaveBeenCalled();
    expect(getStudentGradebookMock).not.toHaveBeenCalled();
    expect(listReportSnapshotsForStudentMock).not.toHaveBeenCalled();
    expect(listStudentHomeworkMock).not.toHaveBeenCalled();
  });
});
