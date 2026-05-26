import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listMaterialsForParentChildMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/parent-material-repository", () => ({
  listMaterialsForParentChild: listMaterialsForParentChildMock,
}));

type ParentMaterialsPageModule = {
  default: (props: {
    params: Promise<{ studentId: string }> | { studentId: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/parent/materials/[studentId]/page.tsx";

function loadPage() {
  const specifier = "@/app/portal/parent/materials/[studentId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentMaterialsPageModule>;
}

function material(overrides: Record<string, unknown> = {}) {
  return {
    attachments: [
      {
        filename: "factorization-practice.pdf",
        href: "/uploads/materials/factorization-practice.pdf",
        mimeType: "application/pdf",
        size: 2048,
      },
    ],
    classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
    createdAt: new Date("2026-06-01T09:00:00.000Z"),
    description: "Practice examples and teacher notes for the next lesson.",
    id: "material-1",
    safeFileUrl: "/uploads/materials/algebra-factorization.pdf",
    scheduledClass: {
      id: "lesson-1",
      startAt: new Date("2026-06-03T10:00:00.000Z"),
      title: "Algebra lesson",
    },
    subject: { id: "subject-math", name: "Mathematics" },
    title: "Algebra factorization guide",
    updatedAt: new Date("2026-06-02T10:30:00.000Z"),
    ...overrides,
  };
}

describe("Parent child materials page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ role: UserRole.PARENT, uid: "parent-1" });
    listMaterialsForParentChildMock.mockResolvedValue([material()]);
  });

  afterEach(() => cleanup());

  it("uses the PARENT guard, dedicated parent material repository, and no direct Prisma query", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.PARENT])");
    expect(source).toContain("@/lib/repositories/parent-material-repository");
    expect(source).toContain("listMaterialsForParentChild(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
    expect(source).not.toContain("createCourseMaterial");
    expect(source).not.toContain("updateCourseMaterial");
    expect(source).not.toContain("deleteCourseMaterial");
  });

  it("renders back navigation and all parent material filters", async () => {
    const page = await loadPage();
    const element = await page.default({ params: { studentId: "student-1" } });
    render(element);

    expect(screen.getByRole("link", { name: /back to parent dashboard/i })).toHaveAttribute(
      "href",
      "/portal/parent",
    );
    expect(screen.getByLabelText(/subject/i)).toBeDefined();
    expect(screen.getByLabelText(/class group/i)).toBeDefined();
    expect(screen.getByLabelText(/scheduled class|class \/ lesson|lesson/i)).toBeDefined();
    expect(screen.getByLabelText(/search/i)).toBeDefined();
    expect(screen.getByLabelText(/sort/i)).toBeDefined();
  });

  it("lists materials for the linked child using session.uid and route studentId", async () => {
    const page = await loadPage();
    const element = await page.default({
      params: { studentId: "student-1" },
      searchParams: { search: "factorization", sort: "title", subjectId: "subject-math" },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(listMaterialsForParentChildMock).toHaveBeenCalledWith("parent-1", "student-1", {
      search: "factorization",
      sort: "title",
      subjectId: "subject-math",
    });
    expect(screen.getByRole("heading", { name: /materials/i })).toBeDefined();

    const card = screen.getByRole("article", { name: /algebra factorization guide/i });
    expect(within(card).getByText(/practice examples and teacher notes/i)).toBeDefined();
    expect(within(card).getByText(/algebra lesson/i)).toBeDefined();
    expect(within(card).getByText(/igcse mathematics a/i)).toBeDefined();
    expect(within(card).getByText(/^Subject:\s*Mathematics$/i)).toBeDefined();
    expect(within(card).getByText(/created/i)).toBeDefined();
    expect(within(card).getByText(/updated/i)).toBeDefined();
    expect(
      within(card).getByRole("link", { name: /open material|view file|download/i }),
    ).toHaveAttribute("href", "/uploads/materials/algebra-factorization.pdf");
    expect(
      within(card).getByRole("link", { name: /factorization-practice\.pdf/i }),
    ).toHaveAttribute("href", "/uploads/materials/factorization-practice.pdf");
  });

  it("renders empty state for unlinked or material-free children without foreign material leakage", async () => {
    listMaterialsForParentChildMock.mockResolvedValueOnce([]);
    const page = await loadPage();
    const element = await page.default({ params: { studentId: "unlinked-student" } });
    render(element);

    expect(screen.getByText(/no materials available|no materials match/i)).toBeDefined();
    expect(screen.queryByText(/foreign material/i)).toBeNull();
  });

  it("renders unsafe URLs as unavailable and keeps the page read-only", async () => {
    listMaterialsForParentChildMock.mockResolvedValueOnce([
      material({
        attachments: [
          {
            filename: "unsafe-file.html",
            href: null,
            mimeType: "text/html",
            size: 12,
          },
        ],
        fileUrl: "javascript:alert(1)",
        safeFileUrl: null,
        title: "Unsafe parent material",
      }),
    ]);
    const page = await loadPage();
    const element = await page.default({ params: { studentId: "student-1" } });
    const { container } = render(element);

    expect(screen.getByText(/unsafe parent material/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /open material|view file|download/i })).toBeNull();
    expect(container.textContent).not.toContain("javascript:alert(1)");
    expect(
      screen.queryByRole("button", { name: /upload|create|edit|delete|unlink|save/i }),
    ).toBeNull();
    expect(screen.queryByLabelText(/file url|upload|attachment|title|description/i)).toBeNull();
  });

  it("rejects non-parent roles before loading material data", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    const page = await loadPage();

    await expect(page.default({ params: { studentId: "student-1" } })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(listMaterialsForParentChildMock).not.toHaveBeenCalled();
  });
});
