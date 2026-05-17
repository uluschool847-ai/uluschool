import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const archiveHomeworkActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/portal/teacher/actions/homework-actions", () => ({
  archiveHomeworkAction: archiveHomeworkActionMock,
}));

import { HomeworkList } from "@/app/portal/teacher/components/HomeworkList";

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

  it("calls archiveHomeworkAction when Archive/Delete is clicked", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: /archive|delete/i }));

    expect(archiveHomeworkActionMock).toHaveBeenCalledWith("hw-1");
  });
});
