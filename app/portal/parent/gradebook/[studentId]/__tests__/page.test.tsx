import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());
const getParentChildGradebookMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/repositories/gradebook-repository", () => ({
  getParentChildGradebook: getParentChildGradebookMock,
}));

type ParentGradebookPageModule = {
  default: (props: {
    params: Promise<{ studentId: string }> | { studentId: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

function loadParentGradebookPage() {
  const specifier = "@/app/portal/parent/gradebook/[studentId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentGradebookPageModule>;
}

describe("Parent child gradebook page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "parent-1", role: UserRole.PARENT });
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    getParentChildGradebookMock.mockResolvedValue({
      categories: [
        { label: "Homework", average: 80 },
        { label: "Manual", average: 90 },
      ],
      student: { id: "student-1", fullName: "Amina Yusuf" },
      term: { id: "term-1", name: "Spring 2026" },
      termAverage: 83,
    });
  });

  afterEach(() => cleanup());

  it("requires PARENT and renders only linked child gradebook", async () => {
    const page = await loadParentGradebookPage();
    const element = await page.default({
      params: { studentId: "student-1" },
      searchParams: { termId: "term-1" },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(getParentChildGradebookMock).toHaveBeenCalledWith("parent-1", "student-1", "term-1");
    expect(screen.getByRole("heading", { name: /amina yusuf gradebook/i })).toBeDefined();
    expect(screen.getByText(/term average:\s*83/i)).toBeDefined();
  });

  it("returns notFound for an unlinked child", async () => {
    getParentChildGradebookMock.mockResolvedValueOnce(null);
    const page = await loadParentGradebookPage();

    await expect(
      page.default({
        params: { studentId: "unlinked-student" },
        searchParams: { termId: "term-1" },
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });
});
