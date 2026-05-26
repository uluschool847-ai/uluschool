import { render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";

type ParentProgressHistoryComponent = {
  default: ComponentType<{
    notes: Array<Record<string, unknown>>;
    studentId: string;
  }>;
};

const importComponent = async () =>
  import(
    "@/app/portal/parent/components/ParentProgressHistory" as string
  ) as Promise<ParentProgressHistoryComponent>;

const progressNote = (overrides: Record<string, unknown> = {}) => ({
  id: "progress-1",
  studentName: "Linked Learner",
  subject: "Mathematics",
  teacherName: "Ada Teacher",
  performanceLevel: "GOOD",
  content: "Algebra reasoning is improving with multi-step problems.",
  recordedAt: new Date("2026-02-05T10:00:00.000Z"),
  updatedAt: new Date("2026-02-06T10:00:00.000Z"),
  archivedAt: null,
  statusLabel: "Active",
  ...overrides,
});

describe("ParentProgressHistory", () => {
  it("renders progress note cards with subject, teacher, performance, content, and dates", async () => {
    const { default: ParentProgressHistory } = await importComponent();

    render(<ParentProgressHistory notes={[progressNote()]} studentId="student-1" />);

    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText(/Ada Teacher/i)).toBeInTheDocument();
    expect(screen.getByText(/Good/i)).toBeInTheDocument();
    expect(screen.getByText(/Algebra reasoning is improving/i)).toBeInTheDocument();
    expect(screen.getByText(/recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/updated/i)).toBeInTheDocument();
  });

  it("renders archived notes with an archived badge", async () => {
    const { default: ParentProgressHistory } = await importComponent();

    render(
      <ParentProgressHistory
        notes={[
          progressNote({
            id: "archived-progress",
            archivedAt: new Date("2026-02-07T10:00:00.000Z"),
            statusLabel: "Archived",
          }),
        ]}
        studentId="student-1"
      />,
    );

    expect(screen.getByText(/Archived/i)).toBeInTheDocument();
  });

  it("renders an empty state", async () => {
    const { default: ParentProgressHistory } = await importComponent();

    render(<ParentProgressHistory notes={[]} studentId="student-1" />);

    expect(screen.getByText(/no progress notes/i)).toBeInTheDocument();
  });

  it("does not render mutation controls", async () => {
    const { default: ParentProgressHistory } = await importComponent();

    render(<ParentProgressHistory notes={[progressNote()]} studentId="student-1" />);

    const mutationLabels = [/create/i, /edit/i, /archive/i, /delete/i, /save/i];

    for (const label of mutationLabels) {
      expect(within(document.body).queryByRole("button", { name: label })).not.toBeInTheDocument();
      expect(within(document.body).queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });
});
