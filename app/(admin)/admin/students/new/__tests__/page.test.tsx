import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const studentFormMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/components/admin/students/StudentForm", () => ({
  StudentForm: (props: unknown) => {
    studentFormMock(props);
    return <div data-testid="student-form" />;
  },
}));

type StudentFormProps = {
  mode: "create" | "edit";
  flashMessage?: string;
  flashError?: string;
  successRedirect: string;
  errorRedirect: string;
  student?: unknown;
};

type StudentCreatePageModule = {
  default: (props?: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadStudentCreatePage() {
  const specifier = "@/app/(admin)/admin/students/new/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentCreatePageModule>;
}

describe("Admin student account create page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN role and renders the student form in create mode", async () => {
    const page = await loadStudentCreatePage();
    const element = await page.default({
      searchParams: Promise.resolve({ studentMessage: "Student account created." }),
    });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(screen.getByTestId("student-form")).toBeDefined();

    const props = studentFormMock.mock.calls[0]?.[0] as StudentFormProps;
    expect(props).toEqual(
      expect.objectContaining({
        mode: "create",
        successRedirect: "/admin/students",
        errorRedirect: "/admin/students/new",
        flashMessage: "Student account created.",
      }),
    );
    expect(props).not.toHaveProperty("role");
  });

  it("forwards flash error messages into the create form", async () => {
    const page = await loadStudentCreatePage();
    const element = await page.default({
      searchParams: Promise.resolve({ studentError: "Student account failed." }),
    });

    render(element);

    const props = studentFormMock.mock.calls[0]?.[0] as StudentFormProps;
    expect(props).toEqual(
      expect.objectContaining({
        mode: "create",
        flashError: "Student account failed.",
      }),
    );
  });
});
