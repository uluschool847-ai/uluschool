import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPushMock = vi.hoisted(() => vi.fn());
const submitHomeworkActionMock = vi.hoisted(() => vi.fn());
const editHomeworkActionMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/app/portal/teacher/actions/homework-actions", () => ({
  submitHomeworkAction: submitHomeworkActionMock,
  editHomeworkAction: editHomeworkActionMock,
}));

import { HomeworkForm } from "@/app/portal/teacher/components/HomeworkForm";

describe("HomeworkForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders fields for title, description, class selection, and due date", () => {
    render(
      <HomeworkForm
        mode="create"
        classes={[
          { id: "class-1", name: "IGCSE Mathematics" },
          { id: "class-2", name: "IGCSE Physics" },
        ]}
      />,
    );

    expect(screen.getByLabelText(/title/i)).toBeDefined();
    expect(screen.getByLabelText(/description/i)).toBeDefined();
    expect(screen.getByLabelText(/class/i)).toBeDefined();
    expect(screen.getByLabelText(/due date/i)).toBeDefined();
  });

  it("shows validation errors on empty submit", async () => {
    render(<HomeworkForm mode="create" classes={[{ id: "class-1", name: "IGCSE Mathematics" }]} />);

    fireEvent.click(screen.getByRole("button", { name: /create homework|save|submit/i }));

    expect(await screen.findByText(/title is required/i)).toBeDefined();
    expect(await screen.findByText(/class is required/i)).toBeDefined();
    expect(await screen.findByText(/due date is required/i)).toBeDefined();
  });

  it("calls submitHomeworkAction with payload for create mode", async () => {
    submitHomeworkActionMock.mockResolvedValue({ success: true, data: { id: "hw-1" } });

    render(<HomeworkForm mode="create" classes={[{ id: "class-1", name: "IGCSE Mathematics" }]} />);

    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "Quadratic Equations Practice" },
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Solve questions 1-10." },
    });
    fireEvent.change(screen.getByLabelText(/class/i), {
      target: { value: "class-1" },
    });
    fireEvent.change(screen.getByLabelText(/due date/i), {
      target: { value: "2026-06-22" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create homework|save|submit/i }));

    expect(submitHomeworkActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Quadratic Equations Practice",
        description: "Solve questions 1-10.",
        classId: "class-1",
      }),
    );
  });

  it("calls editHomeworkAction with payload for edit mode", async () => {
    editHomeworkActionMock.mockResolvedValue({ success: true, data: { id: "hw-9" } });

    render(
      <HomeworkForm
        mode="edit"
        assignmentId="hw-9"
        initialValues={{
          title: "Initial title",
          description: "Initial description",
          classId: "class-1",
          dueDate: "2026-06-23",
        }}
        classes={[{ id: "class-1", name: "IGCSE Mathematics" }]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "Final exam review pack" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes|update/i }));

    expect(editHomeworkActionMock).toHaveBeenCalledWith(
      "hw-9",
      expect.objectContaining({
        title: "Final exam review pack",
      }),
    );
  });
});
