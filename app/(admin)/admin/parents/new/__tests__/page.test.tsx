import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const parentFormMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/components/admin/parents/ParentForm", () => ({
  ParentForm: (props: unknown) => {
    parentFormMock(props);
    return <div data-testid="parent-form" />;
  },
}));

type ParentFormProps = {
  mode: "create" | "edit";
  parent?: unknown;
  flashMessage?: string;
  flashError?: string;
  successRedirect: string;
  errorRedirect: string;
};

type ParentCreatePageModule = {
  default: (props?: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadParentCreatePage() {
  const specifier = "@/app/(admin)/admin/parents/new/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentCreatePageModule>;
}

describe("Admin parent create page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN role and renders ParentForm in create mode", async () => {
    const page = await loadParentCreatePage();
    const element = await page.default({
      searchParams: Promise.resolve({ parentMessage: "Parent account created." }),
    });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(screen.getByTestId("parent-form")).toBeDefined();

    const props = parentFormMock.mock.calls[0]?.[0] as ParentFormProps;
    expect(props).toEqual(
      expect.objectContaining({
        mode: "create",
        successRedirect: "/admin/parents",
        errorRedirect: "/admin/parents/new",
        flashMessage: "Parent account created.",
      }),
    );
    expect(props).not.toHaveProperty("role");
  });

  it("forwards flash errors into the parent form", async () => {
    const page = await loadParentCreatePage();
    const element = await page.default({
      searchParams: Promise.resolve({ parentError: "Parent account failed." }),
    });

    render(element);

    const props = parentFormMock.mock.calls[0]?.[0] as ParentFormProps;
    expect(props).toEqual(
      expect.objectContaining({
        mode: "create",
        flashError: "Parent account failed.",
      }),
    );
  });
});
