import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listCourseMaterialsForTeacherMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/course-material-repository", () => ({
  listCourseMaterialsForTeacher: listCourseMaterialsForTeacherMock,
}));

type MaterialsPageModule = {
  default: (props: {
    searchParams?:
      | Promise<{ classGroupId?: string; scheduledClassId?: string; search?: string }>
      | { classGroupId?: string; scheduledClassId?: string; search?: string };
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/teacher/materials/page.tsx";

async function loadMaterialsPage() {
  const specifier = "@/app/portal/teacher/materials/page";
  return import(/* @vite-ignore */ specifier) as Promise<MaterialsPageModule>;
}

function material(overrides: Record<string, unknown> = {}) {
  return {
    id: "material-1",
    title: "Algebra worksheet",
    description: "Practice problems for quadratic equations.",
    fileUrl: "https://cdn.school/materials/algebra.pdf",
    scheduledClassId: "lesson-1",
    createdAt: new Date("2026-06-01T09:00:00.000Z"),
    updatedAt: new Date("2026-06-02T10:00:00.000Z"),
    scheduledClass: {
      id: "lesson-1",
      title: "Algebra Group A lesson",
      startAt: new Date("2026-06-03T10:00:00.000Z"),
      classGroup: { id: "group-1", name: "Algebra Group A" },
    },
    ...overrides,
  };
}

describe("Teacher materials list page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    listCourseMaterialsForTeacherMock.mockResolvedValue([material()]);
  });

  afterEach(() => {
    cleanup();
  });

  it("uses enum-based TEACHER guard and the dedicated course material repository", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("@/lib/repositories/course-material-repository");
    expect(source).toContain("listCourseMaterialsForTeacher");
    expect(source).not.toContain('requireRole(["TEACHER"])');
    expect(source).not.toContain("portal-repository");
  });

  it("requires TEACHER and forwards material filters to the repository", async () => {
    const page = await loadMaterialsPage();
    const element = await page.default({
      searchParams: Promise.resolve({
        classGroupId: "group-1",
        scheduledClassId: "lesson-1",
        search: "algebra",
      }),
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(listCourseMaterialsForTeacherMock).toHaveBeenCalledWith("teacher-1", {
      classGroupId: "group-1",
      scheduledClassId: "lesson-1",
      search: "algebra",
    });
  });

  it("renders material metadata, safe file links, and teacher actions", async () => {
    const page = await loadMaterialsPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByRole("heading", { name: /course materials|materials/i })).toBeDefined();
    expect(screen.getByText(/algebra worksheet/i)).toBeDefined();
    expect(screen.getByText(/practice problems for quadratic equations/i)).toBeDefined();
    expect(screen.getByText(/algebra group a/i)).toBeDefined();
    expect(screen.getByText(/algebra group a lesson/i)).toBeDefined();
    expect(screen.getByText(/created/i)).toBeDefined();
    expect(screen.getByText(/updated/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /view file/i })).toHaveAttribute(
      "href",
      "https://cdn.school/materials/algebra.pdf",
    );
    expect(screen.getByRole("link", { name: /edit/i })).toHaveAttribute(
      "href",
      "/portal/teacher/materials/material-1/edit",
    );
    expect(screen.getByRole("button", { name: /delete/i })).toBeDefined();
  });

  it("does not render unsafe file URLs as active links", async () => {
    listCourseMaterialsForTeacherMock.mockResolvedValueOnce([
      material({ fileUrl: "javascript:alert(1)", title: "Unsafe material" }),
    ]);

    const page = await loadMaterialsPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByText(/unsafe material/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /view file/i })).toBeNull();
    expect(screen.getByText(/invalid file link|file unavailable/i)).toBeDefined();
  });

  it("shows empty state when no materials are available", async () => {
    listCourseMaterialsForTeacherMock.mockResolvedValueOnce([]);

    const page = await loadMaterialsPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByText(/no materials/i)).toBeDefined();
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before loading materials",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));
      const page = await loadMaterialsPage();

      await expect(page.default({ searchParams: {} })).rejects.toThrow(`NEXT_REDIRECT:${role}`);
      expect(listCourseMaterialsForTeacherMock).not.toHaveBeenCalled();
    },
  );
});
