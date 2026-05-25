import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const archiveHomeworkActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/portal/teacher/actions/homework-actions", () => ({
  archiveHomeworkAction: archiveHomeworkActionMock,
}));

import { HomeworkList } from "@/app/portal/teacher/components/HomeworkList";

const HomeworkListWithPlannedProps = HomeworkList as unknown as ComponentType<{
  assignments: Array<Record<string, unknown>>;
  status?: "active" | "archived" | "all";
}>;

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "hw-1",
    title: "Mathematics - Fractions",
    description: "Complete workbook pages 5-6.",
    dueDate: "2026-06-10T10:00:00.000Z",
    className: "IGCSE Mathematics",
    classGroupName: "Algebra Group A",
    subjectName: "Mathematics",
    submissionsCount: 4,
    pendingSubmissionsCount: 2,
    gradedSubmissionsCount: 1,
    archivedAt: null,
    editHref: "/portal/teacher/assignments/hw-1/edit",
    submissionsHref: null,
    ...overrides,
  };
}

describe("HomeworkList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders a list of assignments", () => {
    render(
      <HomeworkList
        assignments={[
          {
            id: "hw-1",
            title: "Mathematics - Fractions",
            description: "Complete workbook pages 5-6.",
            dueDate: "2026-06-10T10:00:00.000Z",
            className: "IGCSE Mathematics",
          },
          {
            id: "hw-2",
            title: "Biology - Cell structure",
            description: "Draw and label a plant cell.",
            dueDate: "2026-06-11T10:00:00.000Z",
            className: "IGCSE Biology",
          },
        ]}
      />,
    );

    expect(screen.getByText(/mathematics - fractions/i)).toBeDefined();
    expect(screen.getByText(/biology - cell structure/i)).toBeDefined();
    expect(screen.getAllByRole("button", { name: /archive|delete/i }).length).toBe(2);
  });

  it("renders assignment metadata, edit/submission links, and archive-only wording", () => {
    render(<HomeworkListWithPlannedProps assignments={[assignment()]} />);

    expect(screen.getByText(/mathematics - fractions/i)).toBeDefined();
    expect(screen.getByText(/complete workbook pages 5-6/i)).toBeDefined();
    expect(screen.getByText(/algebra group a|igcse mathematics/i)).toBeDefined();
    expect(screen.getAllByText(/mathematics/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/submissions:\s*4/i)).toBeDefined();
    expect(screen.getByText(/pending:\s*2/i)).toBeDefined();
    expect(screen.getByText(/graded:\s*1/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /edit/i })).toHaveAttribute(
      "href",
      "/portal/teacher/assignments/hw-1/edit",
    );
    expect(screen.getByRole("button", { name: /view submissions/i })).toHaveAttribute("disabled");
    expect(screen.queryByRole("link", { name: /^view$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^archive$/i })).toBeDefined();
    expect(screen.queryByText(/\bdelete\b/i)).toBeNull();
    expect(screen.queryByText(/submissions.*deleted/i)).toBeNull();
  });

  it("renders archived badge and can hide archived assignments from the active list", () => {
    render(
      <HomeworkListWithPlannedProps
        assignments={[
          assignment(),
          assignment({
            id: "hw-archived",
            title: "Archived revision pack",
            archivedAt: "2026-06-01T10:00:00.000Z",
          }),
        ]}
        status="active"
      />,
    );

    expect(screen.getByText(/mathematics - fractions/i)).toBeDefined();
    expect(screen.queryByText(/archived revision pack/i)).toBeNull();
  });

  it("shows archived badge in archived/all views", () => {
    render(
      <HomeworkListWithPlannedProps
        assignments={[
          assignment({
            id: "hw-archived",
            title: "Archived revision pack",
            archivedAt: "2026-06-01T10:00:00.000Z",
          }),
        ]}
        status="archived"
      />,
    );

    expect(screen.getByText(/archived revision pack/i)).toBeDefined();
    expect(screen.getByText(/^archived$/i)).toBeDefined();
  });

  it("calls archiveHomeworkAction when archive is confirmed", async () => {
    archiveHomeworkActionMock.mockResolvedValue({ success: true });

    render(
      <HomeworkList
        assignments={[
          {
            id: "hw-1",
            title: "Chemistry - Acids and bases",
            description: "Prepare short notes.",
            dueDate: "2026-06-12T10:00:00.000Z",
            className: "IGCSE Chemistry",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^archive$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm archive/i }));

    expect(archiveHomeworkActionMock).toHaveBeenCalledWith("hw-1");
  });

  it("uses archive confirmation and loading state before archiving", async () => {
    archiveHomeworkActionMock.mockReturnValue(new Promise(() => undefined));

    render(<HomeworkListWithPlannedProps assignments={[assignment()]} />);

    fireEvent.click(screen.getByRole("button", { name: /^archive$/i }));

    expect(screen.getByText(/archive this homework assignment/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /confirm archive/i }));

    expect(screen.getByRole("button", { name: /archiving/i })).toHaveAttribute("disabled");
  });

  it("shows archive success and error feedback", async () => {
    archiveHomeworkActionMock.mockResolvedValueOnce({
      success: true,
      message: "Homework archived",
    });

    const { rerender } = render(<HomeworkListWithPlannedProps assignments={[assignment()]} />);

    fireEvent.click(screen.getByRole("button", { name: /^archive$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm archive/i }));

    expect(await screen.findByText(/homework archived/i)).toBeDefined();

    archiveHomeworkActionMock.mockResolvedValueOnce({ success: false, message: "Archive failed" });
    rerender(<HomeworkListWithPlannedProps assignments={[assignment({ id: "hw-2" })]} />);

    fireEvent.click(screen.getByRole("button", { name: /^archive$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm archive/i }));

    await waitFor(() => expect(screen.getByText(/archive failed/i)).toBeDefined());
  });
});
