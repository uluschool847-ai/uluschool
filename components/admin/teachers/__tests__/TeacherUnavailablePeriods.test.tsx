import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

type TeacherUnavailablePeriod = {
  id: string;
  teacherId: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
};

type TeacherUnavailablePeriodsModule = {
  TeacherUnavailablePeriods: (props: {
    teacherId: string;
    periods: TeacherUnavailablePeriod[];
    message?: string;
    error?: string;
  }) => JSX.Element;
};

async function loadTeacherUnavailablePeriods() {
  const specifier = "@/components/admin/teachers/TeacherUnavailablePeriods";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherUnavailablePeriodsModule>;
}

describe("TeacherUnavailablePeriods", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders unavailable periods with start, end, and reason", async () => {
    const { TeacherUnavailablePeriods } = await loadTeacherUnavailablePeriods();

    render(
      <TeacherUnavailablePeriods
        teacherId="teacher-1"
        periods={[
          {
            id: "period-1",
            teacherId: "teacher-1",
            startAt: new Date("2026-06-10T09:00:00.000Z"),
            endAt: new Date("2026-06-10T12:00:00.000Z"),
            reason: "Exam board meeting",
          },
        ]}
      />,
    );

    expect(screen.getByText(/2026|jun|10/i)).toBeDefined();
    expect(screen.getByText(/09:00|12:00/)).toBeDefined();
    expect(screen.getByText(/exam board meeting/i)).toBeDefined();
  });

  it("renders the period form and delete/cancel controls", async () => {
    const { TeacherUnavailablePeriods } = await loadTeacherUnavailablePeriods();

    render(
      <TeacherUnavailablePeriods
        teacherId="teacher-1"
        periods={[
          {
            id: "period-1",
            teacherId: "teacher-1",
            startAt: new Date("2026-06-10T09:00:00.000Z"),
            endAt: new Date("2026-06-10T12:00:00.000Z"),
            reason: "Exam board meeting",
          },
        ]}
      />,
    );

    expect(screen.getByLabelText(/start/i)).toBeDefined();
    expect(screen.getByLabelText(/end/i)).toBeDefined();
    expect(screen.getByLabelText(/reason/i)).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /add unavailable period|save unavailable period/i }),
    ).toBeDefined();

    const row = screen.getByText(/exam board meeting/i).closest("tr") ?? document.body;
    expect(within(row as HTMLElement).queryByRole("button", { name: /edit/i })).toBeDefined();
    expect(
      within(row as HTMLElement).queryByRole("button", { name: /delete|remove/i }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeDefined();
  });

  it("renders empty and feedback states", async () => {
    const { TeacherUnavailablePeriods } = await loadTeacherUnavailablePeriods();

    render(
      <TeacherUnavailablePeriods
        teacherId="teacher-1"
        periods={[]}
        message="Unavailable period saved."
        error="End time must be after start time."
      />,
    );

    expect(screen.getByText(/no unavailable periods|no blocked periods/i)).toBeDefined();
    expect(screen.getByText(/unavailable period saved/i)).toBeDefined();
    expect(screen.getByRole("alert").textContent).toMatch(/end time must be after start time/i);
  });
});
