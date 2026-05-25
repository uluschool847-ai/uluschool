import { existsSync, readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listStudentCourseMaterialsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/course-material-repository", () => ({
  listStudentCourseMaterials: listStudentCourseMaterialsMock,
}));

type StudentMaterialsPageModule = {
  default: (props: {
    searchParams?:
      | Promise<{
          classGroupId?: string;
          scheduledClassId?: string;
          search?: string;
          sort?: string;
          subjectId?: string;
        }>
      | {
          classGroupId?: string;
          scheduledClassId?: string;
          search?: string;
          sort?: string;
          subjectId?: string;
        };
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/student/materials/page.tsx";

async function loadStudentMaterialsPage() {
  const specifier = "@/app/portal/student/materials/page";
  return import(/* @vite-ignore */ specifier) as Promise<StudentMaterialsPageModule>;
}

function material(overrides: Record<string, unknown> = {}) {
  return {
    id: "material-1",
    title: "Algebra factorization guide",
    description: "Practice examples and teacher notes for the next lesson.",
    fileUrl: "/uploads/materials/algebra-factorization.pdf",
    safeFileUrl: "/uploads/materials/algebra-factorization.pdf",
    attachments: [
      {
        filename: "factorization-worksheet.pdf",
        href: "/uploads/materials/factorization-worksheet.pdf",
        mimeType: "application/pdf",
        size: 2048,
      },
    ],
    createdAt: new Date("2026-06-01T09:00:00.000Z"),
    updatedAt: new Date("2026-06-02T10:30:00.000Z"),
    scheduledClass: {
      id: "lesson-1",
      title: "Algebra lesson",
      startAt: new Date("2026-06-03T10:00:00.000Z"),
    },
    classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
    subject: { id: "subject-math", name: "Mathematics" },
    ...overrides,
  };
}

describe("Student materials page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({
      uid: "student-1",
      role: UserRole.STUDENT,
      email: "student@example.com",
    });
    listStudentCourseMaterialsMock.mockResolvedValue([material()]);
  });

  afterEach(() => {
    cleanup();
  });

  it("uses the STUDENT guard, dedicated student material repository, and no direct Prisma query", () => {
    expect(existsSync(PAGE_SOURCE_PATH), "student materials page should exist").toBe(true);

    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.STUDENT])");
    expect(source).toContain("listStudentCourseMaterials");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
  });

  it("requires STUDENT and forwards material filters using session.uid", async () => {
    const page = await loadStudentMaterialsPage();
    const element = await page.default({
      searchParams: Promise.resolve({
        classGroupId: "group-1",
        scheduledClassId: "lesson-1",
        search: "factorization",
        sort: "title",
        subjectId: "subject-math",
      }),
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
    expect(listStudentCourseMaterialsMock).toHaveBeenCalledWith("student-1", {
      classGroupId: "group-1",
      scheduledClassId: "lesson-1",
      search: "factorization",
      sort: "title",
      subjectId: "subject-math",
    });
  });

  it("renders filters, material metadata, safe file links, attachments, and dates", async () => {
    const page = await loadStudentMaterialsPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByRole("heading", { name: /^materials$/i })).toBeDefined();
    expect(screen.getByLabelText("Class group")).toBeDefined();
    expect(screen.getByLabelText("Class / lesson")).toBeDefined();
    expect(screen.getByLabelText("Subject")).toBeDefined();
    expect(screen.getByLabelText("Search")).toBeDefined();
    expect(screen.getByLabelText("Sort")).toBeDefined();

    const item = screen.getByRole("article", { name: /algebra factorization guide/i });
    expect(within(item).getByText(/practice examples and teacher notes/i)).toBeDefined();
    expect(within(item).getByText(/algebra lesson/i)).toBeDefined();
    expect(within(item).getByText(/igcse mathematics a/i)).toBeDefined();
    expect(within(item).getByText(/^Subject:\s*Mathematics$/i)).toBeDefined();
    expect(within(item).getByText(/created/i)).toBeDefined();
    expect(within(item).getByText(/updated/i)).toBeDefined();
    expect(within(item).getByRole("link", { name: /open material|view file/i })).toHaveAttribute(
      "href",
      "/uploads/materials/algebra-factorization.pdf",
    );
    expect(
      within(item).getByRole("link", { name: /factorization-worksheet\.pdf/i }),
    ).toHaveAttribute("href", "/uploads/materials/factorization-worksheet.pdf");
  });

  it("does not render unsafe material URLs as active links", async () => {
    listStudentCourseMaterialsMock.mockResolvedValueOnce([
      material({
        fileUrl: "javascript:alert(1)",
        safeFileUrl: null,
        title: "Unsafe worksheet",
        attachments: [
          {
            filename: "unsafe-data.html",
            href: null,
            mimeType: "text/html",
            size: 12,
          },
        ],
      }),
    ]);

    const page = await loadStudentMaterialsPage();
    const element = await page.default({ searchParams: {} });
    const { container } = render(element);

    expect(screen.getByText(/unsafe worksheet/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /open material|view file/i })).toBeNull();
    expect(screen.getByText(/unsafe-data\.html/i)).toBeDefined();
    expect(container.textContent).not.toContain("javascript:alert(1)");
  });

  it("shows distinct empty states for unfiltered and filtered material lists", async () => {
    listStudentCourseMaterialsMock.mockResolvedValueOnce([]);

    const page = await loadStudentMaterialsPage();
    const unfiltered = await page.default({ searchParams: {} });
    const { unmount } = render(unfiltered);

    expect(screen.getByText("No materials available yet.")).toBeDefined();
    unmount();

    listStudentCourseMaterialsMock.mockResolvedValueOnce([]);
    const filtered = await page.default({ searchParams: { search: "missing" } });
    render(filtered);

    expect(screen.getByText("No materials match the selected filters.")).toBeDefined();
  });

  it.each([UserRole.TEACHER, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before loading student materials",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));
      const page = await loadStudentMaterialsPage();

      await expect(page.default({ searchParams: {} })).rejects.toThrow(`NEXT_REDIRECT:${role}`);
      expect(requireRoleMock).toHaveBeenCalledWith([UserRole.STUDENT]);
      expect(listStudentCourseMaterialsMock).not.toHaveBeenCalled();
    },
  );
});
