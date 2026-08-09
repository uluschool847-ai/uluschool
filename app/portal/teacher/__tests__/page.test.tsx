import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeStorageKey, storageUrlForKey } from "@/lib/storage/storage-url";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getTeacherDashboardDataMock = vi.hoisted(() => vi.fn());
const countUnreadNotificationsForUserMock = vi.hoisted(() => vi.fn());
const gradeHomeworkActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  getTeacherDashboardData: getTeacherDashboardDataMock,
}));

vi.mock("@/lib/repositories/notification-repository", () => ({
  countUnreadNotificationsForUser: countUnreadNotificationsForUserMock,
}));

vi.mock("@/app/portal/actions", () => ({
  gradeHomeworkAction: gradeHomeworkActionMock,
}));

import TeacherPortalPage from "@/app/portal/teacher/page";

const PAGE_SOURCE_PATH = "app/portal/teacher/page.tsx";

async function renderServerComponent(element: ReactElement) {
  const component = element.type as (props: unknown) => ReactElement | Promise<ReactElement>;
  return render(await component(element.props));
}

function expectEnumTeacherGuardSource() {
  const source = readFileSync(PAGE_SOURCE_PATH, "utf8");
  expect(source).toContain("requireRole([UserRole.TEACHER])");
  expect(source).not.toContain('requireRole(["TEACHER"])');
  expect(source).not.toContain("requireRole(['TEACHER'])");
}

describe("Teacher Portal misleading UI safeguards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    countUnreadNotificationsForUserMock.mockResolvedValue(0);
    getTeacherDashboardDataMock.mockResolvedValue({
      metrics: {
        myClasses: 1,
        activeAssignments: 2,
        pendingSubmissions: 1,
        upcomingLessons: 1,
      },
      classes: [
        {
          id: "class-1",
          title: "IGCSE Mathematics - Group A",
          studentCount: 12,
          startAt: new Date("2026-05-06T09:00:00.000Z"),
          endAt: new Date("2026-05-06T10:00:00.000Z"),
          subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
          classGroup: { id: "group-math-a", name: "IGCSE Mathematics Group A" },
          students: [
            { id: "student-1", fullName: "Student One", email: "student1@example.com" },
            { id: "student-2", fullName: "Student Two", email: "student2@example.com" },
          ],
        },
      ],
      todayLessons: [],
      upcomingLessons: [
        {
          id: "lesson-1",
          title: "IGCSE Mathematics - Algebra",
          studentCount: 12,
          startAt: new Date("2026-05-06T09:00:00.000Z"),
          endAt: new Date("2026-05-06T10:00:00.000Z"),
          liveLessonUrl: "https://example.com/live/lesson-1",
          status: "SCHEDULED",
          subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
          classGroup: { id: "group-math-a", name: "IGCSE Mathematics Group A" },
        },
        {
          id: "lesson-rescheduled",
          title: "Rescheduled functions",
          studentCount: 10,
          startAt: new Date("2026-05-07T09:00:00.000Z"),
          endAt: new Date("2026-05-07T10:00:00.000Z"),
          liveLessonUrl: "https://example.com/live/rescheduled",
          status: "RESCHEDULED",
          subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
          classGroup: { id: "group-math-a", name: "IGCSE Mathematics Group A" },
        },
        {
          id: "lesson-cancelled",
          title: "Cancelled geometry",
          studentCount: 8,
          startAt: new Date("2026-05-08T09:00:00.000Z"),
          endAt: new Date("2026-05-08T10:00:00.000Z"),
          liveLessonUrl: "https://example.com/live/cancelled",
          status: "CANCELLED",
          cancelReason: "Teacher unavailable",
          subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
          classGroup: { id: "group-math-a", name: "IGCSE Mathematics Group A" },
        },
      ],
      pastLessons: [
        {
          id: "lesson-past",
          title: "Past trigonometry",
          studentCount: 9,
          startAt: new Date("2026-04-30T09:00:00.000Z"),
          endAt: new Date("2026-04-30T10:00:00.000Z"),
          liveLessonUrl: "https://example.com/live/past",
          status: "COMPLETED",
          subject: { id: "subject-math", name: "Mathematics", slug: "mathematics" },
          classGroup: { id: "group-math-a", name: "IGCSE Mathematics Group A" },
        },
      ],
      activeAssignments: [
        {
          id: "assignment-1",
          title: "Algebra Homework",
          description: "Solve algebraic equations and submit full working.",
          dueDate: new Date("2026-05-08T00:00:00.000Z"),
          submissionCount: 4,
          pendingSubmissionCount: 2,
          scheduledClassTitle: "IGCSE Mathematics - Group A",
        },
      ],
      pendingSubmissions: [
        {
          id: "submission-1",
          studentName: "Student One",
          studentEmail: "student1@example.com",
          assignmentTitle: "Algebra Homework",
          classTitle: "IGCSE Mathematics - Group A",
          submittedAt: new Date("2026-05-05T08:00:00.000Z"),
          contentUrl: "https://example.com/submission-1",
          reviewHref: "/portal/teacher/lessons/lesson-1",
          score: null,
        },
      ],
      recentPendingSubmissions: [
        {
          id: "submission-1",
          studentName: "Student One",
          studentEmail: "student1@example.com",
          assignmentTitle: "Algebra Homework",
          classTitle: "IGCSE Mathematics - Group A",
          submittedAt: new Date("2026-05-05T08:00:00.000Z"),
          contentUrl: "https://example.com/submission-1",
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("does not expose a disabled Create Assignment control", async () => {
    await renderServerComponent(<TeacherPortalPage />);

    expect(screen.queryByRole("button", { name: /create assignment/i })).toBeNull();
  });

  it("does not expose coming soon or under construction teacher messaging", async () => {
    const { container } = await renderServerComponent(<TeacherPortalPage />);
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/coming soon/i);
    expect(text).not.toMatch(/under construction/i);
  });

  it("does not render disabled or aria-disabled assignment-related functionality", async () => {
    const { container } = await renderServerComponent(<TeacherPortalPage />);

    const disabledNodes = Array.from(
      container.querySelectorAll("[disabled], [aria-disabled='true']"),
    ).filter((node) => (node.textContent ?? "").match(/assignment/i));

    expect(disabledNodes).toHaveLength(0);
  });

  it("renders a meaningful teacher dashboard heading", async () => {
    await renderServerComponent(<TeacherPortalPage />);

    const heading = await screen.findByRole("heading", { name: /teacher dashboard/i });
    expect(heading).not.toBeNull();
    expect(heading.textContent ?? "").not.toMatch(/placeholder|coming soon/i);
  });

  it("renders only teacher-scoped classes, lessons, assignments, and pending student submissions", async () => {
    await renderServerComponent(<TeacherPortalPage />);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherDashboardDataMock).toHaveBeenCalledWith("teacher-1");
    expect(screen.getAllByText("IGCSE Mathematics - Group A").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Subject: Mathematics$/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/^Group: IGCSE Mathematics Group A$/i).length).toBeGreaterThan(0);
    expect(screen.getByText("IGCSE Mathematics - Algebra")).not.toBeNull();
    expect(screen.getByText("Algebra Homework")).not.toBeNull();
    expect(screen.getByText("Student One")).not.toBeNull();
    expect(screen.getByText("Student Two")).not.toBeNull();
    expect(screen.queryByText("Other Teacher Class")).toBeNull();
    expect(screen.queryByText("Unassigned Student")).toBeNull();
    expect(screen.queryByText("Unrelated Group Lesson")).toBeNull();
  });

  it("renders canonical and exact external submission hrefs but rejects malformed values", async () => {
    const defaultDashboard = await getTeacherDashboardDataMock("fixture-only");
    getTeacherDashboardDataMock.mockClear();
    const storageKey = "private/teachers/teacher-1/submissions/current-work.pdf";
    const canonicalHref = storageUrlForKey(storageKey);
    const externalHref =
      "https://CDN.Example.com/Files/Submission%20One.pdf?download=1#teacher-copy";
    const crossPurposeHref = `/api/public-files/${encodeStorageKey(storageKey)}`;
    const submission = (id: string, fullName: string, contentUrl: string) => ({
      id,
      contentUrl,
      submittedAt: new Date("2026-05-05T08:00:00.000Z"),
      student: { id: `student-${id}`, fullName, email: `${id}@example.com` },
      assignment: { id: "assignment-1", title: "Algebra Homework" },
      classGroup: null,
      classTitle: "IGCSE Mathematics - Group A",
    });
    getTeacherDashboardDataMock.mockResolvedValueOnce({
      ...defaultDashboard,
      pendingSubmissions: [
        submission("canonical", "Canonical Student", canonicalHref),
        submission("external", "External Student", externalHref),
        submission("malformed", "Malformed Student", "/api/files/not+base64url"),
        submission("cross-purpose", "Cross Purpose Student", crossPurposeHref),
        submission("raw-key", "Raw Key Student", "private/teachers/teacher-1/file name.pdf"),
      ],
    });

    await renderServerComponent(<TeacherPortalPage />);

    const canonicalArticle = screen.getByText("Canonical Student").closest("article");
    const externalArticle = screen.getByText("External Student").closest("article");
    const malformedArticle = screen.getByText("Malformed Student").closest("article");
    const crossPurposeArticle = screen.getByText("Cross Purpose Student").closest("article");
    const rawKeyArticle = screen.getByText("Raw Key Student").closest("article");
    expect(canonicalArticle).not.toBeNull();
    expect(externalArticle).not.toBeNull();
    expect(malformedArticle).not.toBeNull();
    expect(crossPurposeArticle).not.toBeNull();
    expect(rawKeyArticle).not.toBeNull();
    expect(
      within(canonicalArticle as HTMLElement).getByRole("link", { name: "Review" }),
    ).toHaveAttribute("href", canonicalHref);
    expect(
      within(externalArticle as HTMLElement).getByRole("link", { name: "Review" }),
    ).toHaveAttribute("href", externalHref);
    expect(
      within(malformedArticle as HTMLElement).queryByRole("link", { name: "Review" }),
    ).toBeNull();
    expect(
      within(crossPurposeArticle as HTMLElement).queryByRole("link", { name: "Review" }),
    ).toBeNull();
    expect(within(rawKeyArticle as HTMLElement).queryByRole("link", { name: "Review" })).toBeNull();
  });

  it("shows teacher lesson lifecycle, roster count, detail links, and upcoming/past split", async () => {
    await renderServerComponent(<TeacherPortalPage />);

    expect(screen.getByText("IGCSE Mathematics - Algebra")).toBeDefined();
    expect(screen.getByText("Rescheduled functions")).toBeDefined();
    expect(screen.getByText("Cancelled geometry")).toBeDefined();
    expect(screen.getByText("Past trigonometry")).toBeDefined();
    expect(screen.getAllByText(/^Group: IGCSE Mathematics Group A$/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/students: 12/i)).toBeDefined();
    expect(screen.getByText(/^Status: Scheduled$/i)).toBeDefined();
    expect(screen.getByText(/^Status: Rescheduled$/i)).toBeDefined();
    expect(screen.getByText(/^Status: Cancelled$/i)).toBeDefined();
    expect(screen.getByText(/teacher unavailable/i)).toBeDefined();
    expect(screen.getByText(/completed/i)).toBeDefined();
    expect(screen.getByRole("heading", { name: /upcoming lessons/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /past lessons/i })).toBeDefined();
    expect(screen.getAllByRole("link", { name: /start lesson/i }).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: /lesson details.*igcse mathematics - algebra/i }),
    ).toHaveProperty("href", expect.stringContaining("/portal/teacher/lessons/lesson-1"));
    expect(screen.queryByText("Other Teacher Lesson")).toBeNull();
  });

  it("uses the enum-based server-side TEACHER page guard", () => {
    expectEnumTeacherGuardSource();
  });

  it("lets an active teacher render the dashboard through the page guard", async () => {
    await renderServerComponent(<TeacherPortalPage />);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherDashboardDataMock).toHaveBeenCalledWith("teacher-1");
    expect(screen.getByRole("heading", { name: /teacher dashboard/i })).toBeDefined();
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s sessions at the dashboard page guard",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));

      await expect(renderServerComponent(<TeacherPortalPage />)).rejects.toThrow(
        `NEXT_REDIRECT:${role}`,
      );
      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
      expect(getTeacherDashboardDataMock).not.toHaveBeenCalled();
    },
  );

  it("treats invalid or role-changed sessions as requireRole failures before dashboard data loads", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/portal/login?reason=invalid"));

    await expect(renderServerComponent(<TeacherPortalPage />)).rejects.toThrow(
      "NEXT_REDIRECT:/portal/login?reason=invalid",
    );
    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getTeacherDashboardDataMock).not.toHaveBeenCalled();
  });

  it("renders the stable teacher dashboard sections and explicit empty states", async () => {
    getTeacherDashboardDataMock.mockResolvedValueOnce({
      metrics: {
        myClasses: 0,
        activeAssignments: 0,
        pendingSubmissions: 0,
        upcomingLessons: 0,
        classesCount: 0,
        todayLessonsCount: 0,
        upcomingLessonsCount: 0,
        pendingSubmissionsCount: 0,
        activeAssignmentsCount: 0,
        studentsCount: 0,
      },
      todayLessons: [],
      upcomingLessons: [],
      pastLessons: [],
      classes: [],
      activeAssignments: [],
      pendingSubmissions: [],
      recentPendingSubmissions: [],
      alerts: [],
    });

    await renderServerComponent(<TeacherPortalPage />);

    expect(screen.getByRole("heading", { name: /metrics/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /today lessons/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /upcoming lessons/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /my classes\/groups/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /grading workload/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /^assignments$/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /past lessons/i })).toBeDefined();
    expect(screen.getByRole("heading", { name: /quick navigation/i })).toBeDefined();

    expect(screen.getByText(/no classes yet/i)).toBeDefined();
    expect(screen.getByText(/no lessons today/i)).toBeDefined();
    expect(screen.getByText(/no upcoming lessons/i)).toBeDefined();
    expect(screen.getByText(/no submissions to grade/i)).toBeDefined();
    expect(screen.getByText(/no active assignments/i)).toBeDefined();
    expect(screen.getByText(/no past lessons/i)).toBeDefined();
  });

  it("renders the stable teacher dashboard metric cards from dashboard.metrics without legacy labels", async () => {
    getTeacherDashboardDataMock.mockResolvedValueOnce({
      metrics: {
        activeGroups: 3,
        scheduledLessons: 9,
        todayLessons: 2,
        upcomingLessons: 4,
        activeStudents: 17,
        activeAssignments: 5,
        pendingSubmissions: 6,
        gradedThisWeek: 7,
        attendanceToMark: 0,
        reportsToGenerate: 0,
      },
      todayLessons: [],
      upcomingLessons: [],
      pastLessons: [],
      classes: [],
      activeAssignments: [],
      pendingSubmissions: [],
      recentPendingSubmissions: [],
      alerts: [],
    });

    await renderServerComponent(<TeacherPortalPage />);

    expect(screen.getByText("Active Groups")).toBeDefined();
    expect(screen.getByText("Today's Lessons")).toBeDefined();
    expect(screen.getAllByText("Upcoming Lessons").length).toBeGreaterThan(0);
    expect(screen.getByText("Active Students")).toBeDefined();
    expect(screen.getByText("Active Assignments")).toBeDefined();
    expect(screen.getByText("Pending Submissions")).toBeDefined();

    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("4")).toBeDefined();
    expect(screen.getByText("17")).toBeDefined();
    expect(screen.getByText("5")).toBeDefined();
    expect(screen.getByText("6")).toBeDefined();

    const metrics = screen.getByRole("region", { name: "Metrics" });
    expect(within(metrics).queryByText("My Classes")).toBeNull();
    expect(within(metrics).queryByText("Students")).toBeNull();
    expect(within(metrics).queryByText(/attendance/i)).toBeNull();
    expect(within(metrics).queryByText(/reports/i)).toBeNull();
  });

  it("does not read legacy dashboard metric names from the page source", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).not.toContain("myClasses");
    expect(source).not.toContain("classesCount");
    expect(source).not.toContain("studentsCount");
    expect(source).not.toContain("pendingSubmissionsCount");
    expect(source).not.toContain("activeAssignmentsCount");
  });

  it("uses only teacher dashboard routes for schedule, lesson detail, and availability links", async () => {
    await renderServerComponent(<TeacherPortalPage />);

    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href") ?? "");
    expect(hrefs).not.toContain("/portal/schedule");
    expect(screen.getByRole("link", { name: /open schedule/i })).toHaveAttribute(
      "href",
      "/portal/teacher/schedule",
    );
    expect(screen.getByRole("link", { name: /full calendar/i })).toHaveAttribute(
      "href",
      "/portal/teacher/schedule",
    );
    expect(
      screen.getByRole("link", { name: /open details.*igcse mathematics - algebra/i }),
    ).toHaveAttribute("href", "/portal/teacher/lessons/lesson-1");
    expect(screen.getByRole("link", { name: /availability/i })).toHaveAttribute(
      "href",
      "/portal/teacher/availability",
    );
  });

  it("links every teacher workspace from quick navigation", async () => {
    await renderServerComponent(<TeacherPortalPage />);

    const expectedLinks = [
      ["Classes", "/portal/teacher/classes"],
      ["Students", "/portal/teacher/students"],
      ["Schedule", "/portal/teacher/schedule"],
      ["Availability", "/portal/teacher/availability"],
      ["Assignments", "/portal/teacher/assignments"],
      ["Submissions", "/portal/teacher/submissions"],
      ["Progress", "/portal/teacher/progress"],
      ["Materials", "/portal/teacher/materials"],
      ["Gradebook", "/portal/teacher/gradebook"],
      ["Reports", "/portal/teacher/reports"],
      ["Activity", "/portal/teacher/activity"],
    ] as const;

    for (const [name, href] of expectedLinks) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(screen.getByRole("link", { name: /^notifications/i })).toHaveAttribute(
      "href",
      "/portal/teacher/notifications",
    );
  });

  it("renders My Classes/Groups cards from the class-group dashboard shape", async () => {
    getTeacherDashboardDataMock.mockResolvedValueOnce({
      metrics: {
        activeGroups: 2,
        scheduledLessons: 1,
        todayLessons: 0,
        upcomingLessons: 1,
        activeStudents: 5,
        activeAssignments: 1,
        pendingSubmissions: 1,
        gradedThisWeek: 0,
        attendanceToMark: 0,
        reportsToGenerate: 0,
      },
      todayLessons: [],
      upcomingLessons: [],
      pastLessons: [],
      classes: [
        {
          id: "group-with-next",
          name: "IGCSE Geometry Group A",
          status: "ACTIVE",
          subject: { id: "subject-geometry", name: "Geometry", slug: "geometry" },
          level: { id: "level-igcse", name: "IGCSE" },
          capacity: 12,
          rosterCount: 6,
          activeRosterCount: 5,
          studentsPreview: [
            { id: "student-1", fullName: "Student One", email: "student1@example.com" },
            { id: "student-2", fullName: "Student Two", email: "student2@example.com" },
            { id: "student-3", fullName: "Student Three", email: "student3@example.com" },
            { id: "student-4", fullName: "Student Four", email: "student4@example.com" },
          ],
          studentsMoreCount: 2,
          inactiveStudentsCount: 1,
          nextLesson: {
            id: "lesson-next",
            title: "Nearest valid lesson",
            startAt: new Date("2026-05-09T09:00:00.000Z"),
            endAt: new Date("2026-05-09T10:00:00.000Z"),
            detailHref: "/portal/teacher/lessons/lesson-next",
          },
          upcomingLessonsCount: 2,
          pendingSubmissionsCount: 1,
          activeAssignmentsCount: 1,
          detailHref: "/portal/teacher/classes/group-with-next",
          scheduleHref: "/portal/teacher/schedule?classGroupId=group-with-next",
        },
        {
          id: "group-empty",
          name: "Empty Roster Group",
          status: "ACTIVE",
          subject: null,
          level: null,
          capacity: null,
          rosterCount: 0,
          activeRosterCount: 0,
          studentsPreview: [],
          studentsMoreCount: 0,
          inactiveStudentsCount: 0,
          nextLesson: null,
          upcomingLessonsCount: 0,
          pendingSubmissionsCount: 0,
          activeAssignmentsCount: 0,
          detailHref: "/portal/teacher/classes/group-empty",
          scheduleHref: "/portal/teacher/schedule?classGroupId=group-empty",
        },
      ],
      activeAssignments: [],
      pendingSubmissions: [],
      alerts: [],
    });

    await renderServerComponent(<TeacherPortalPage />);

    expect(screen.getByRole("heading", { name: /my classes\/groups/i })).toBeDefined();
    expect(screen.getByText("IGCSE Geometry Group A")).toBeDefined();
    expect(screen.getByText(/^Subject: Geometry$/i)).toBeDefined();
    expect(screen.getByText(/^Level: IGCSE$/i)).toBeDefined();
    expect(screen.getByText(/^Status: ACTIVE$/i)).toBeDefined();
    expect(screen.getByText(/^Capacity: 12$/i)).toBeDefined();
    expect(screen.getByText(/^Roster: 5 active \/ 6 total$/i)).toBeDefined();
    expect(screen.getByText(/\+2 more/i)).toBeDefined();
    expect(screen.getByText(/1 inactive/i)).toBeDefined();
    expect(screen.getByText(/^Upcoming lessons: 2$/i)).toBeDefined();
    expect(screen.getByText(/^Active assignments: 1$/i)).toBeDefined();
    expect(screen.getByText(/^Pending submissions: 1$/i)).toBeDefined();
    expect(screen.getByText(/next lesson:.*Africa\/Nairobi/i)).toBeDefined();

    expect(
      screen.getByRole("link", { name: /view class.*igcse geometry group a/i }),
    ).toHaveAttribute("href", "/portal/teacher/classes/group-with-next");
    expect(screen.getByRole("link", { name: /schedule.*igcse geometry group a/i })).toHaveAttribute(
      "href",
      "/portal/teacher/schedule?classGroupId=group-with-next",
    );
    expect(
      screen.getByRole("link", { name: /open details.*nearest valid lesson/i }),
    ).toHaveAttribute("href", "/portal/teacher/lessons/lesson-next");

    expect(screen.getByText("Empty Roster Group")).toBeDefined();
    expect(screen.getByText(/no students enrolled/i)).toBeDefined();
    expect(screen.getByText(/no upcoming lesson scheduled/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /edit student/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /view class.*empty roster group/i })).toHaveAttribute(
      "href",
      "/portal/teacher/classes/group-empty",
    );
  });

  it("uses teacher schedule start state and safe external-link handling on dashboard lessons", async () => {
    getTeacherDashboardDataMock.mockResolvedValueOnce({
      metrics: {
        myClasses: 0,
        activeAssignments: 0,
        pendingSubmissions: 0,
        upcomingLessons: 5,
      },
      classes: [],
      todayLessons: [
        {
          id: "lesson-startable",
          title: "Live algebra",
          studentCount: 12,
          startAt: new Date("2026-05-06T09:00:00.000Z"),
          endAt: new Date("2026-05-06T10:00:00.000Z"),
          liveLessonUrl: "https://meet.example.com/live-algebra",
          status: "SCHEDULED",
          startState: { canStart: true, label: "Start Lesson" },
        },
        {
          id: "lesson-missing-link",
          title: "No meeting link",
          studentCount: 12,
          startAt: new Date("2026-05-06T11:00:00.000Z"),
          endAt: new Date("2026-05-06T12:00:00.000Z"),
          liveLessonUrl: null,
          status: "SCHEDULED",
          startState: { canStart: false, label: "Meeting link missing" },
        },
        {
          id: "lesson-unsafe-link",
          title: "Unsafe meeting link",
          studentCount: 12,
          startAt: new Date("2026-05-06T13:00:00.000Z"),
          endAt: new Date("2026-05-06T14:00:00.000Z"),
          liveLessonUrl: "javascript:alert(1)",
          status: "SCHEDULED",
          startState: { canStart: false, label: "Meeting link missing" },
        },
      ],
      upcomingLessons: [
        {
          id: "lesson-cancelled",
          title: "Cancelled geometry",
          studentCount: 8,
          startAt: new Date("2026-05-08T09:00:00.000Z"),
          endAt: new Date("2026-05-08T10:00:00.000Z"),
          liveLessonUrl: "https://meet.example.com/cancelled",
          status: "CANCELLED",
          startState: { canStart: false, label: "Cancelled" },
        },
        {
          id: "lesson-completed",
          title: "Completed trigonometry",
          studentCount: 9,
          startAt: new Date("2026-04-30T09:00:00.000Z"),
          endAt: new Date("2026-04-30T10:00:00.000Z"),
          liveLessonUrl: "https://meet.example.com/completed",
          status: "COMPLETED",
          startState: { canStart: false, label: "Completed" },
        },
      ],
      pastLessons: [],
      activeAssignments: [],
      pendingSubmissions: [],
      recentPendingSubmissions: [],
    });

    const { container } = await renderServerComponent(<TeacherPortalPage />);

    const startLinks = screen.getAllByRole("link", { name: /start lesson/i });
    expect(startLinks).toHaveLength(1);
    expect(startLinks[0]).toHaveAttribute("href", "https://meet.example.com/live-algebra");
    expect(startLinks[0]).toHaveAttribute("target", "_blank");
    expect(startLinks[0]).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByText(/meeting link missing/i)).toBeDefined();
    expect(container.querySelector('a[href="https://meet.example.com/cancelled"]')).toBeNull();
    expect(container.querySelector('a[href="https://meet.example.com/completed"]')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.textContent ?? "").not.toContain("javascript:alert(1)");
  });

  it("uses the shared TeacherStartLessonButton contract instead of local dashboard start-link logic", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("TeacherStartLessonButton");
    expect(source).not.toContain("safeLiveLessonHref");
    expect(source).not.toMatch(/<a\s+href=\{safeStartState\.href\}/);
    expect(source).not.toMatch(/rawStartState\?\.canStart/);
  });

  it("uses the teacher-specific grading action and numeric score contract", async () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("@/app/portal/teacher/actions/grading-actions");
    expect(source).toContain("gradeSubmissionAction");
    expect(source).not.toContain("gradeHomeworkAction");

    await renderServerComponent(<TeacherPortalPage />);

    const scoreInput = screen.getByPlaceholderText(/score 0-100/i);
    expect(scoreInput).toHaveAttribute("type", "number");
    expect(scoreInput).toHaveAttribute("min", "0");
    expect(scoreInput).toHaveAttribute("max", "100");
    expect(screen.getByLabelText(/score 0-100/i)).toBe(scoreInput);
    expect(screen.getByLabelText(/feedback/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /save grade/i })).toBeDefined();
  });
});
