import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listStudentHomeworkMock = vi.hoisted(() => vi.fn());
const getStudentProgressMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  listStudentHomework: listStudentHomeworkMock,
  getStudentProgress: getStudentProgressMock,
}));

vi.mock("@/app/portal/actions", () => ({
  submitHomeworkAction: vi.fn(),
}));

import StudentDashboardPage from "@/app/portal/student/page";

const fullMonthDateRegex =
  /\b\d{2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/;
const shortMonthRegex = /\b\d{2} (Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/;
const gradeRegex = /\b[A-F][+-]?\b/;

async function renderServerComponent(element: ReactElement) {
  const component = element.type as (props: unknown) => ReactElement | Promise<ReactElement>;
  return render(await component(element.props));
}

describe("Student dashboard formatting consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({
      uid: "student-1",
      role: "STUDENT",
      email: "student@example.com",
    });
    listStudentHomeworkMock.mockResolvedValue([
      {
        id: "hw-1",
        title: "Quadratic Equations",
        description: "Solve the attached worksheet.",
        dueDate: new Date("2026-09-08T00:00:00.000Z"),
        scheduledClass: { title: "IGCSE Mathematics" },
        submissions: [
          {
            id: "submission-1",
            submittedAt: new Date("2026-09-07T14:30:00.000Z"),
            grade: "A+",
            feedback: "Excellent work",
          },
        ],
      },
    ]);
    getStudentProgressMock.mockResolvedValue([
      {
        id: "progress-1",
        subject: { name: "Mathematics" },
        gradeLevel: "Year 10",
        teacherNotes: "Strong algebra progress.",
        recordedAt: new Date("2026-09-06T09:00:00.000Z"),
      },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders homework due dates and progress dates with one full-month date style", async () => {
    const { container } = await renderServerComponent(<StudentDashboardPage />);
    const text = container.textContent ?? "";

    expect(text).toMatch(fullMonthDateRegex);
    expect(text).not.toMatch(shortMonthRegex);
  });

  it("keeps grade labels in the compact letter-grade format across the dashboard", async () => {
    const { container } = await renderServerComponent(<StudentDashboardPage />);
    const text = container.textContent ?? "";

    expect(text).toMatch(/Grade:\s+[A-F][+-]?/);
    expect(text).toMatch(gradeRegex);
    expect(text).not.toMatch(/A Plus|B Plus|C Minus/i);
  });

  it("uses one consistent wording for student dashboard labels and avoids alternate portal terminology", async () => {
    const { container } = await renderServerComponent(<StudentDashboardPage />);
    const text = container.textContent ?? "";

    expect(text).toContain("Student Dashboard");
    expect(text).toContain("My Assignments");
    expect(text).toContain("My Progress");
    expect(text).not.toMatch(/Students Portal|Learner Portal/i);
  });
});
