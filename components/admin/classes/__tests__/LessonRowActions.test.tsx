import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cancelLessonActionMock = vi.hoisted(() => vi.fn());
const completeLessonActionMock = vi.hoisted(() => vi.fn());
const deleteLessonActionMock = vi.hoisted(() => vi.fn());
const rescheduleLessonActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/lessons/actions", () => ({
  cancelLessonAction: cancelLessonActionMock,
  completeLessonAction: completeLessonActionMock,
  deleteLessonAction: deleteLessonActionMock,
  rescheduleLessonAction: rescheduleLessonActionMock,
}));

type LessonRowActionsModule = {
  LessonRowActions: (props: {
    lesson: {
      id: string;
      classGroupId: string;
      title: string;
      status: string;
      startAt: Date;
      endAt: Date;
      liveLessonUrl: string;
    };
  }) => JSX.Element;
};

async function loadLessonRowActions() {
  const specifier = "@/components/admin/classes/LessonRowActions";
  return import(/* @vite-ignore */ specifier) as Promise<LessonRowActionsModule>;
}

describe("LessonRowActions admin controls", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows edit, reschedule, complete, cancel with reason, delete, and join/start affordances", async () => {
    const { LessonRowActions } = await loadLessonRowActions();

    render(
      <LessonRowActions
        lesson={{
          id: "lesson-1",
          classGroupId: "group-1",
          title: "Quadratic functions",
          status: "SCHEDULED",
          startAt: new Date("2026-06-01T10:00:00.000Z"),
          endAt: new Date("2026-06-01T11:00:00.000Z"),
          liveLessonUrl: "https://meet.google.com/abc-defg-hij",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: /edit/i })).toHaveProperty(
      "href",
      expect.stringContaining("/admin/classes/group-1/lessons/lesson-1/edit"),
    );
    expect(screen.getByRole("button", { name: /reschedule/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /complete/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /delete/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /join|start/i })).toHaveProperty(
      "href",
      "https://meet.google.com/abc-defg-hij",
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.getByLabelText(/cancel reason/i)).toBeRequired();
  });

  it("shows completed/cancelled states and hides or disables Join/Start for cancelled lessons", async () => {
    const { LessonRowActions } = await loadLessonRowActions();

    const { rerender } = render(
      <LessonRowActions
        lesson={{
          id: "lesson-1",
          classGroupId: "group-1",
          title: "Completed lesson",
          status: "COMPLETED",
          startAt: new Date("2026-06-01T10:00:00.000Z"),
          endAt: new Date("2026-06-01T11:00:00.000Z"),
          liveLessonUrl: "https://meet.google.com/completed",
        }}
      />,
    );

    expect(screen.getByText(/completed/i)).toBeDefined();

    rerender(
      <LessonRowActions
        lesson={{
          id: "lesson-2",
          classGroupId: "group-1",
          title: "Cancelled lesson",
          status: "CANCELLED",
          startAt: new Date("2026-06-01T10:00:00.000Z"),
          endAt: new Date("2026-06-01T11:00:00.000Z"),
          liveLessonUrl: "https://meet.google.com/cancelled",
        }}
      />,
    );

    expect(screen.getByText(/cancelled/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /join|start/i })).toBeNull();
  });
});
