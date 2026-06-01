import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toggleTeacherStatusActionMock = vi.hoisted(() => vi.fn());
const deleteTeacherActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/teachers/actions", () => ({
  toggleTeacherStatusAction: toggleTeacherStatusActionMock,
  deleteTeacherAction: deleteTeacherActionMock,
}));

import { TeacherRowActions } from "@/components/admin/teachers/TeacherRowActions";

describe("TeacherRowActions admin controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLFormElement.prototype, "requestSubmit", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the expected activate/deactivate and delete affordances", () => {
    render(<TeacherRowActions teacher={{ id: "teacher-1", isActive: true }} />);

    expect(screen.getByRole("button", { name: /deactivate/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /delete/i })).toBeDefined();
  });

  it("opens a visible confirmation step before permanent delete", () => {
    render(
      <TeacherRowActions teacher={{ id: "teacher-1", isActive: true, fullName: "Jane Doe" }} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(screen.getByRole("dialog")).toHaveTextContent(/jane doe/i);
    expect(screen.getByRole("button", { name: /confirm delete|delete teacher/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined();
  });

  it("does not submit the hidden delete form when permanent delete is cancelled", () => {
    const requestSubmit = vi.fn();
    Object.defineProperty(HTMLFormElement.prototype, "requestSubmit", {
      configurable: true,
      value: requestSubmit,
    });

    render(
      <TeacherRowActions teacher={{ id: "teacher-1", isActive: true, fullName: "Jane Doe" }} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(requestSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
