import { AttendanceStatus } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";

type ParentAttendanceHistoryComponent = {
  default: ComponentType<{
    attendance: {
      records: Array<Record<string, unknown>>;
      summary: Record<string, unknown>;
    };
    emptyMessage?: string;
    studentId: string;
  }>;
};

const importComponent = async () =>
  import(
    "@/app/portal/parent/components/ParentAttendanceHistory" as string
  ) as Promise<ParentAttendanceHistoryComponent>;

const attendance = (overrides: Record<string, unknown> = {}) => ({
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

describe("ParentAttendanceHistory", () => {
  afterEach(() => cleanup());

  it("renders summary counts and attendance rate", async () => {
    const { default: ParentAttendanceHistory } = await importComponent();

    render(<ParentAttendanceHistory attendance={attendance()} studentId="student-1" />);

    const summary = screen.getByLabelText(/attendance summary/i);
    expect(within(summary).getByText(/^present\s*1$/i)).toBeInTheDocument();
    expect(within(summary).getByText(/^late\s*1$/i)).toBeInTheDocument();
    expect(within(summary).getByText(/^absent\s*1$/i)).toBeInTheDocument();
    expect(within(summary).getByText(/^total\s*3$/i)).toBeInTheDocument();
    expect(within(summary).getByText(/attendance rate\s*67%/i)).toBeInTheDocument();
  });

  it("renders attendance rows with lesson, subject, status, marked date, late minutes, reason, and lesson link", async () => {
    const { default: ParentAttendanceHistory } = await importComponent();

    render(<ParentAttendanceHistory attendance={attendance()} studentId="student-1" />);

    const row = screen.getByRole("article", { name: /quadratic functions/i });
    expect(within(row).getByText(/mathematics/i)).toBeInTheDocument();
    expect(within(row).getByText(/igcse mathematics a/i)).toBeInTheDocument();
    expect(within(row).getByText(/late/i)).toBeInTheDocument();
    expect(within(row).getByText(/late minutes:\s*11/i)).toBeInTheDocument();
    expect(within(row).getByText(/bus delay/i)).toBeInTheDocument();
    expect(within(row).getByText(/marked/i)).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: /view lesson|lesson detail/i })).toHaveAttribute(
      "href",
      "/portal/parent/schedule/student-1/lesson-1",
    );
  });

  it("renders an empty state", async () => {
    const { default: ParentAttendanceHistory } = await importComponent();

    render(
      <ParentAttendanceHistory
        attendance={attendance({ records: [] })}
        emptyMessage="No attendance records yet."
        studentId="student-1"
      />,
    );

    expect(screen.getByText(/no attendance records/i)).toBeInTheDocument();
  });

  it("does not render mutation controls", async () => {
    const { default: ParentAttendanceHistory } = await importComponent();

    render(<ParentAttendanceHistory attendance={attendance()} studentId="student-1" />);

    for (const label of [/mark/i, /update/i, /delete/i, /save/i, /attendance status/i]) {
      expect(within(document.body).queryByRole("button", { name: label })).not.toBeInTheDocument();
      expect(within(document.body).queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });
});
