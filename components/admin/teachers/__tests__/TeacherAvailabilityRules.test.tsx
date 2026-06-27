import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

type TeacherAvailabilityRule = {
  id: string;
  teacherId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  timezone: string;
  status: "ACTIVE" | "INACTIVE";
};

type TeacherAvailabilityRulesModule = {
  TeacherAvailabilityRules: (props: {
    teacherId: string;
    rules: TeacherAvailabilityRule[];
    message?: string;
    error?: string;
  }) => JSX.Element;
};

async function loadTeacherAvailabilityRules() {
  const specifier = "@/components/admin/teachers/TeacherAvailabilityRules";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherAvailabilityRulesModule>;
}

describe("TeacherAvailabilityRules", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders weekly rules with weekday, time range, timezone, and status", async () => {
    const { TeacherAvailabilityRules } = await loadTeacherAvailabilityRules();

    render(
      <TeacherAvailabilityRules
        teacherId="teacher-1"
        rules={[
          {
            id: "rule-1",
            teacherId: "teacher-1",
            weekday: 1,
            startTime: "09:00",
            endTime: "12:00",
            timezone: "Africa/Nairobi",
            status: "ACTIVE",
          },
          {
            id: "rule-2",
            teacherId: "teacher-1",
            weekday: 5,
            startTime: "14:00",
            endTime: "16:00",
            timezone: "Africa/Nairobi",
            status: "INACTIVE",
          },
        ]}
      />,
    );

    expect(screen.getByText(/monday|mon/i)).toBeDefined();
    expect(screen.getByText(/^friday$/i)).toBeDefined();
    expect(screen.getByText(/09:00/)).toBeDefined();
    expect(screen.getByText(/12:00/)).toBeDefined();
    expect(screen.getByText(/14:00/)).toBeDefined();
    expect(screen.getByText(/16:00/)).toBeDefined();
    expect(screen.getAllByText(/africa\/nairobi/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/^active$/i)).toBeDefined();
    expect(screen.getByText(/^inactive$/i)).toBeDefined();
  });

  it("renders add/edit form fields and lifecycle controls", async () => {
    const { TeacherAvailabilityRules } = await loadTeacherAvailabilityRules();

    render(
      <TeacherAvailabilityRules
        teacherId="teacher-1"
        rules={[
          {
            id: "rule-1",
            teacherId: "teacher-1",
            weekday: 1,
            startTime: "09:00",
            endTime: "12:00",
            timezone: "Africa/Nairobi",
            status: "ACTIVE",
          },
        ]}
      />,
    );

    expect(screen.getByLabelText(/weekday/i)).toBeDefined();
    expect(screen.getByLabelText(/start time/i)).toBeDefined();
    expect(screen.getByLabelText(/end time/i)).toBeDefined();
    expect(screen.getByLabelText(/timezone/i)).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /add availability|save availability|create rule/i }),
    ).toBeDefined();

    const row = screen.getByText(/09:00/).closest("tr") ?? document.body;
    expect(within(row as HTMLElement).queryByRole("button", { name: /edit/i })).toBeDefined();
    expect(
      within(row as HTMLElement).queryByRole("button", { name: /deactivate|activate/i }),
    ).toBeDefined();
    expect(
      within(row as HTMLElement).queryByRole("button", { name: /delete|remove/i }),
    ).toBeDefined();
  });

  it("renders empty and feedback states", async () => {
    const { TeacherAvailabilityRules } = await loadTeacherAvailabilityRules();

    render(
      <TeacherAvailabilityRules
        teacherId="teacher-1"
        rules={[]}
        message="Availability rule saved."
        error="Weekday is required."
      />,
    );

    expect(screen.getByText(/no availability rules|no weekly availability/i)).toBeDefined();
    expect(screen.getByText(/availability rule saved/i)).toBeDefined();
    expect(screen.getByRole("alert").textContent).toMatch(/weekday is required/i);
  });
});
