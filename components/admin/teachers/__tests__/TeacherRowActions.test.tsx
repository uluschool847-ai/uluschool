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

  it("opens a visible confirmation step before permanent delete", async () => {
    render(<TeacherRowActions teacher={{ id: "teacher-1", isActive: true }} />);

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByRole("button", { name: /confirm delete|delete teacher/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined();
  });
});
