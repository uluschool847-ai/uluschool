import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createUserActionMock = vi.hoisted(() => vi.fn());
const updateUserRoleActionMock = vi.hoisted(() => vi.fn());
const toggleUserStatusActionMock = vi.hoisted(() => vi.fn());
const routerRefreshMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/users/actions", () => ({
  createUserAction: createUserActionMock,
  updateUserRoleAction: updateUserRoleActionMock,
  toggleUserStatusAction: toggleUserStatusActionMock,
}));

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    useRouter: () => ({
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
      push: vi.fn(),
      refresh: routerRefreshMock,
      replace: vi.fn(),
    }),
  };
});

import { UserCreateForm } from "@/components/admin/users/UserCreateForm";
import { UserRoleEditor } from "@/components/admin/users/UserRoleEditor";

describe("Admin user mutation feedback", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("shows loading and success feedback when creating a user", async () => {
    createUserActionMock.mockResolvedValue({
      success: true,
      data: {
        user: { email: "teacher@example.com" },
        temporaryPassword: "UniqueTemporary123_A",
        mustChangePassword: true,
      },
    });
    render(<UserCreateForm />);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Teacher User" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "teacher@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /create user/i }));
    expect(await screen.findByRole("heading", { name: /temporary credentials/i })).toBeDefined();
    expect(screen.getByText("teacher@example.com")).toBeDefined();
    expect(screen.getByText("UniqueTemporary123_A")).toBeDefined();
    expect(screen.getByText(/will not be shown after leaving this page/i)).toBeDefined();
    expect(screen.queryByText(/default password/i)).toBeNull();
  });

  it("shows generic error feedback when create user throws unexpectedly", async () => {
    createUserActionMock.mockResolvedValue({ success: false, error: "Something went wrong" });
    render(<UserCreateForm />);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Teacher User" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "teacher@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /create user/i }));
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeDefined());
  });

  it("re-enables controls and preserves selected role after role update failure", async () => {
    updateUserRoleActionMock.mockResolvedValue({ success: false, error: "Role update failed" });
    render(
      <UserRoleEditor
        user={{
          id: "u1",
          email: "a@test.com",
          fullName: "User A",
          role: "STUDENT",
          isActive: true,
        }}
      />,
    );
    const select = screen.getByLabelText(/role/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "TEACHER" } });
    await waitFor(() => expect(screen.getByText(/role update failed/i)).toBeDefined());
    expect(select.disabled).toBe(false);
  });
});
