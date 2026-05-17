import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const findUserByIdMock = vi.hoisted(() => vi.fn());
const getAdminParentByIdMock = vi.hoisted(() => vi.fn());
const listUsersByRoleMock = vi.hoisted(() => vi.fn());
const parentFormMock = vi.hoisted(() => vi.fn());
const parentStudentLinksMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  findUserById: findUserByIdMock,
  listUsersByRole: listUsersByRoleMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  getAdminParentById: getAdminParentByIdMock,
}));

vi.mock("@/components/admin/parents/ParentForm", () => ({
  ParentForm: (props: unknown) => {
    parentFormMock(props);
    return <div data-testid="parent-form" />;
  },
}));

vi.mock("@/components/admin/parents/ParentStudentLinks", () => ({
  ParentStudentLinks: (props: unknown) => {
    parentStudentLinksMock(props);
    return <div data-testid="parent-student-links" />;
  },
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

type ParentFormProps = {
  mode: "create" | "edit";
  parent?: {
    id: string;
    fullName: string;
    email: string;
    phoneWhatsapp?: string | null;
    isActive?: boolean;
  };
  flashMessage?: string;
  flashError?: string;
  successRedirect: string;
  errorRedirect: string;
};

type ParentStudentLinksProps = {
  parentId: string;
  linkedStudents: Array<{
    id: string;
    fullName: string;
    email: string | null;
    isActive?: boolean;
  }>;
  availableStudents: Array<{
    id: string;
    fullName: string;
    email: string | null;
    isActive?: boolean;
  }>;
  flashMessage?: string;
  flashError?: string;
};

type ParentEditPageModule = {
  default: (props: {
    params: Promise<{ id: string }> | { id: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadParentEditPage() {
  const specifier = "@/app/(admin)/admin/parents/[id]/edit/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentEditPageModule>;
}

describe("Admin parent edit page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN, loads only PARENT targets, and renders form plus student links", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "parent-1",
      fullName: "Mary Parent",
      email: "mary.parent@example.com",
      phoneWhatsapp: "+254700000001",
      role: "PARENT",
      isActive: true,
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    getAdminParentByIdMock.mockResolvedValueOnce({
      id: "parent-1",
      fullName: "Mary Parent",
      email: "mary.parent@example.com",
      phoneWhatsapp: "+254700000001",
      role: "PARENT",
      isActive: true,
      children: [
        {
          id: "student-inactive",
          fullName: "Inactive Student",
          email: "inactive.student@example.com",
          isActive: false,
        },
      ],
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    listUsersByRoleMock.mockResolvedValueOnce([
      {
        id: "student-active",
        fullName: "Active Student",
        email: "active.student@example.com",
        phoneWhatsapp: null,
      },
    ]);

    const page = await loadParentEditPage();
    const element = await page.default({
      params: Promise.resolve({ id: "parent-1" }),
      searchParams: Promise.resolve({ parentMessage: "Student linked." }),
    });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(findUserByIdMock).toHaveBeenCalledWith("parent-1");
    expect(getAdminParentByIdMock).toHaveBeenCalledWith("parent-1");
    expect(listUsersByRoleMock).toHaveBeenCalledWith(UserRole.STUDENT);
    expect(screen.getByTestId("parent-form")).toBeDefined();
    expect(screen.getByTestId("parent-student-links")).toBeDefined();

    const formProps = parentFormMock.mock.calls[0]?.[0] as ParentFormProps;
    expect(formProps).toEqual(
      expect.objectContaining({
        mode: "edit",
        parent: expect.objectContaining({
          fullName: "Mary Parent",
          email: "mary.parent@example.com",
          phoneWhatsapp: "+254700000001",
        }),
      }),
    );

    const linkProps = parentStudentLinksMock.mock.calls[0]?.[0] as ParentStudentLinksProps;
    expect(linkProps).toEqual(
      expect.objectContaining({
        parentId: "parent-1",
        linkedStudents: [
          expect.objectContaining({
            fullName: "Inactive Student",
            isActive: false,
          }),
        ],
        availableStudents: expect.arrayContaining([
          expect.objectContaining({
            fullName: "Active Student",
          }),
        ]),
        flashMessage: "Student linked.",
      }),
    );
  });

  it("shows empty linked-student state data when no students are linked", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "parent-1",
      fullName: "Mary Parent",
      email: "mary.parent@example.com",
      role: "PARENT",
      isActive: true,
    });
    getAdminParentByIdMock.mockResolvedValueOnce({
      id: "parent-1",
      fullName: "Mary Parent",
      email: "mary.parent@example.com",
      phoneWhatsapp: null,
      role: "PARENT",
      isActive: true,
      children: [],
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });
    listUsersByRoleMock.mockResolvedValueOnce([]);

    const page = await loadParentEditPage();
    const element = await page.default({
      params: { id: "parent-1" },
      searchParams: { parentError: "Student link failed." },
    });

    render(element);

    const linkProps = parentStudentLinksMock.mock.calls[0]?.[0] as ParentStudentLinksProps;
    expect(linkProps).toEqual(
      expect.objectContaining({
        linkedStudents: [],
        availableStudents: [],
        flashError: "Student link failed.",
      }),
    );
  });

  it("rejects non-parent targets with notFound", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: "student-1",
      fullName: "Alice Student",
      email: "alice.student@example.com",
      role: "STUDENT",
      isActive: true,
    });

    const page = await loadParentEditPage();
    await page.default({
      params: { id: "student-1" },
    });

    expect(notFoundMock).toHaveBeenCalled();
    expect(parentFormMock).not.toHaveBeenCalled();
  });
});
