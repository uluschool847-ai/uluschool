import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createUserActionMock = vi.hoisted(() => vi.fn());
const updateUserRoleActionMock = vi.hoisted(() => vi.fn());
const toggleUserStatusActionMock = vi.hoisted(() => vi.fn());
const routerRefreshMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/users/actions", () => ({
  createUserAction: createUserActionMock,
  updateUserRoleAction: updateUserRoleActionMock,
  toggleUserStatusAction: toggleUserStatusActionMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    refresh: routerRefreshMock,
  }),
}));

type UserCreateFormProps = {
  defaultRole?: "ADMIN" | "TEACHER" | "PARENT" | "STUDENT";
};

type UserRoleEditorProps = {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: "ADMIN" | "TEACHER" | "PARENT" | "STUDENT";
    isActive: boolean;
  };
};

async function loadUserCreateForm() {
  const specifier = "@/components/admin/users/UserCreateForm";
  return import(/* @vite-ignore */ specifier) as Promise<{
    UserCreateForm: React.ComponentType<UserCreateFormProps>;
  }>;
}

async function loadUserRoleEditor() {
  const specifier = "@/components/admin/users/UserRoleEditor";
  return import(/* @vite-ignore */ specifier) as Promise<{
    UserRoleEditor: React.ComponentType<UserRoleEditorProps>;
  }>;
}

describe("Admin user management client interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerRefreshMock.mockClear();
    routerPushMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("UserCreateForm validates required fields before submitting", async () => {
    const { UserCreateForm } = await loadUserCreateForm();

    render(<UserCreateForm />);

    fireEvent.click(screen.getByRole("button", { name: /create user|add user|create account/i }));

    expect(await screen.findByText(/name is required|full name is required/i)).toBeDefined();
    expect(screen.getByText(/email is required/i)).toBeDefined();
    expect(createUserActionMock).not.toHaveBeenCalled();
  });

  it("UserCreateForm validates email format", async () => {
    const { UserCreateForm } = await loadUserCreateForm();

    render(<UserCreateForm />);

    fireEvent.change(screen.getByLabelText(/full name|name/i), {
      target: { value: "Invalid Email User" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create user|add user|create account/i }));

    expect(await screen.findByText(/valid email|invalid email/i)).toBeDefined();
    expect(createUserActionMock).not.toHaveBeenCalled();
  });

  it("UserCreateForm submits valid data to the create user action", async () => {
    createUserActionMock.mockResolvedValueOnce({
      success: true,
      data: {
        user: {
          id: "teacher-1",
          email: "teacher@example.com",
          fullName: "Teacher User",
          role: "TEACHER",
          isActive: true,
        },
        temporaryPassword: "UniqueTemporary123_A",
        mustChangePassword: true,
      },
    });
    const { UserCreateForm } = await loadUserCreateForm();

    const { unmount } = render(<UserCreateForm defaultRole="TEACHER" />);

    fireEvent.change(screen.getByLabelText(/full name|name/i), {
      target: { value: "Teacher User" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "teacher@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/role/i), {
      target: { value: "TEACHER" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create user|add user|create account/i }));

    await waitFor(() => {
      expect(createUserActionMock).toHaveBeenCalledWith({
        fullName: "Teacher User",
        email: "teacher@example.com",
        role: "TEACHER",
      });
    });
    expect(await screen.findByText("teacher@example.com")).toBeDefined();
    expect(screen.getByText("UniqueTemporary123_A")).toBeDefined();

    unmount();
    render(<UserCreateForm defaultRole="TEACHER" />);

    expect(screen.queryByText("UniqueTemporary123_A")).toBeNull();
  });

  it("UserRoleEditor changes a user's role and reflects the selected value", async () => {
    updateUserRoleActionMock.mockResolvedValueOnce({
      success: true,
      data: { id: "student-1", role: "TEACHER" },
    });
    const { UserRoleEditor } = await loadUserRoleEditor();

    render(
      <UserRoleEditor
        user={{
          id: "student-1",
          email: "student@example.com",
          fullName: "Student User",
          role: "STUDENT",
          isActive: true,
        }}
      />,
    );

    const roleSelect = screen.getByLabelText(/role/i) as HTMLSelectElement;
    fireEvent.change(roleSelect, { target: { value: "TEACHER" } });

    await waitFor(() => {
      expect(updateUserRoleActionMock).toHaveBeenCalledWith({
        userId: "student-1",
        role: "TEACHER",
      });
    });
    expect(roleSelect.value).toBe("TEACHER");
  });

  it("UserRoleEditor can deactivate an active non-admin account", async () => {
    toggleUserStatusActionMock.mockResolvedValueOnce({
      success: true,
      data: { id: "student-1", isActive: false },
    });
    const { UserRoleEditor } = await loadUserRoleEditor();

    render(
      <UserRoleEditor
        user={{
          id: "student-1",
          email: "student@example.com",
          fullName: "Student User",
          role: "STUDENT",
          isActive: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /deactivate|disable/i }));
    expect(toggleUserStatusActionMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /deactivate user account/i })).toBeDefined();
    expect(screen.getByText(/student user.*student@example\.com/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /confirm deactivation/i }));

    await waitFor(() => {
      expect(toggleUserStatusActionMock).toHaveBeenCalledWith({
        userId: "student-1",
        isActive: false,
      });
    });
  });

  it("UserRoleEditor shows a safety error when self-deactivation or last-admin protection fails", async () => {
    toggleUserStatusActionMock.mockResolvedValueOnce({
      success: false,
      error: "Cannot deactivate your own account or the last admin.",
    });
    const { UserRoleEditor } = await loadUserRoleEditor();

    render(
      <UserRoleEditor
        user={{
          id: "admin-1",
          email: "admin@example.com",
          fullName: "Admin User",
          role: "ADMIN",
          isActive: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /deactivate|disable/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm deactivation/i }));

    expect(await screen.findByText(/cannot deactivate|own account|last admin/i)).toBeDefined();
  });
});
