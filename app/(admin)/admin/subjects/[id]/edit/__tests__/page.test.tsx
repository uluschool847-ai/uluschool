import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getSubjectByIdMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
const subjectFormMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/subject-repository", () => ({
  getSubjectById: getSubjectByIdMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/components/admin/subjects/SubjectForm", () => ({
  SubjectForm: (props: unknown) => {
    subjectFormMock(props);
    return <div data-testid="subject-form" />;
  },
}));

type SubjectFormProps = {
  mode: "create" | "edit";
  subject?: {
    id: string;
    slug: string;
    name: string;
    description: string;
    isActive: boolean;
    priority: number;
    teachersCount: number;
    createdAt: Date;
    updatedAt: Date;
  };
  flashMessage?: string;
  flashError?: string;
  successRedirect: string;
  errorRedirect: string;
};

type SubjectEditPageModule = {
  default: (props: {
    params: Promise<{ id: string }> | { id: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadSubjectEditPage() {
  const specifier = "@/app/(admin)/admin/subjects/[id]/edit/page";
  return import(/* @vite-ignore */ specifier) as Promise<SubjectEditPageModule>;
}

describe("Admin subject edit page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN role, loads the subject, and pre-fills SubjectForm", async () => {
    const subject = {
      id: "subject-biology",
      slug: "biology",
      name: "Biology",
      description: "Biology support for Cambridge and exam preparation.",
      isActive: true,
      priority: 1,
      teachersCount: 2,
      createdAt: new Date("2026-05-01T09:00:00.000Z"),
      updatedAt: new Date("2026-05-10T09:00:00.000Z"),
    };
    getSubjectByIdMock.mockResolvedValueOnce(subject);

    const page = await loadSubjectEditPage();
    const element = await page.default({
      params: Promise.resolve({ id: "subject-biology" }),
      searchParams: Promise.resolve({ subjectMessage: "Subject updated." }),
    });

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(getSubjectByIdMock).toHaveBeenCalledWith("subject-biology");
    expect(screen.getByTestId("subject-form")).toBeDefined();

    const props = subjectFormMock.mock.calls[0]?.[0] as SubjectFormProps;
    expect(props).toEqual(
      expect.objectContaining({
        mode: "edit",
        subject,
        successRedirect: "/admin/subjects",
        errorRedirect: "/admin/subjects/subject-biology/edit",
        flashMessage: "Subject updated.",
      }),
    );
  });

  it("calls notFound when the subject is missing", async () => {
    getSubjectByIdMock.mockResolvedValueOnce(null);

    const page = await loadSubjectEditPage();

    await expect(
      page.default({
        params: Promise.resolve({ id: "missing-subject" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
    expect(subjectFormMock).not.toHaveBeenCalled();
  });

  it("forwards flash errors into the edit form", async () => {
    getSubjectByIdMock.mockResolvedValueOnce({
      id: "subject-biology",
      slug: "biology",
      name: "Biology",
      description: "Biology support for Cambridge and exam preparation.",
      isActive: true,
      priority: 1,
      teachersCount: 2,
      createdAt: new Date("2026-05-01T09:00:00.000Z"),
      updatedAt: new Date("2026-05-10T09:00:00.000Z"),
    });

    const page = await loadSubjectEditPage();
    const element = await page.default({
      params: Promise.resolve({ id: "subject-biology" }),
      searchParams: Promise.resolve({ subjectError: "Subject update failed." }),
    });

    render(element);

    const props = subjectFormMock.mock.calls[0]?.[0] as SubjectFormProps;
    expect(props).toEqual(
      expect.objectContaining({
        mode: "edit",
        flashError: "Subject update failed.",
      }),
    );
  });
});
