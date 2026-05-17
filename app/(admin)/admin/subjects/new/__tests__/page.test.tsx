import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const subjectFormMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/components/admin/subjects/SubjectForm", () => ({
  SubjectForm: (props: unknown) => {
    subjectFormMock(props);
    return <div data-testid="subject-form" />;
  },
}));

type SubjectFormProps = {
  mode: "create" | "edit";
  subject?: unknown;
  flashMessage?: string;
  flashError?: string;
  successRedirect: string;
  errorRedirect: string;
};

type SubjectCreatePageModule = {
  default: (props?: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadSubjectCreatePage() {
  const specifier = "@/app/(admin)/admin/subjects/new/page";
  return import(/* @vite-ignore */ specifier) as Promise<SubjectCreatePageModule>;
}

describe("Admin subject create page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN role and renders SubjectForm in create mode", async () => {
    const page = await loadSubjectCreatePage();
    const element = await page.default({
      searchParams: Promise.resolve({ subjectMessage: "Subject created." }),
    });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(screen.getByTestId("subject-form")).toBeDefined();

    const props = subjectFormMock.mock.calls[0]?.[0] as SubjectFormProps;
    expect(props).toEqual(
      expect.objectContaining({
        mode: "create",
        successRedirect: "/admin/subjects",
        errorRedirect: "/admin/subjects/new",
        flashMessage: "Subject created.",
      }),
    );
    expect(props).not.toHaveProperty("subject");
  });

  it("forwards flash errors into the create form", async () => {
    const page = await loadSubjectCreatePage();
    const element = await page.default({
      searchParams: Promise.resolve({ subjectError: "Subject creation failed." }),
    });

    render(element);

    const props = subjectFormMock.mock.calls[0]?.[0] as SubjectFormProps;
    expect(props).toEqual(
      expect.objectContaining({
        mode: "create",
        flashError: "Subject creation failed.",
      }),
    );
  });
});
