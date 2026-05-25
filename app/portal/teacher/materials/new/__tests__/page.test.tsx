import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listTeacherScheduleMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/teacher-schedule-repository", () => ({
  listTeacherSchedule: listTeacherScheduleMock,
}));

vi.mock("@/app/portal/teacher/components/MaterialForm", () => ({
  MaterialForm: ({
    initialValues,
    lessons,
    mode,
  }: {
    initialValues?: { scheduledClassId?: string };
    lessons: Array<{ id: string; title: string }>;
    mode: string;
  }) => (
    <section aria-label="Material form mock">
      <p>mode:{mode}</p>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" />
      <label htmlFor="description">Description</label>
      <textarea id="description" name="description" />
      <label htmlFor="fileUrl">File URL</label>
      <input id="fileUrl" name="fileUrl" />
      <label htmlFor="scheduledClassId">Lesson</label>
      <select
        id="scheduledClassId"
        name="scheduledClassId"
        defaultValue={initialValues?.scheduledClassId ?? ""}
      >
        <option value="">Select lesson</option>
        {lessons.map((lesson) => (
          <option key={lesson.id} value={lesson.id}>
            {lesson.title}
          </option>
        ))}
      </select>
      <button type="submit">Create material</button>
      <a href="/portal/teacher/materials">Cancel</a>
    </section>
  ),
}));

type NewMaterialPageModule = {
  default: (props: {
    searchParams?: Promise<{ scheduledClassId?: string }> | { scheduledClassId?: string };
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/teacher/materials/new/page.tsx";

async function loadNewMaterialPage() {
  const specifier = "@/app/portal/teacher/materials/new/page";
  return import(/* @vite-ignore */ specifier) as Promise<NewMaterialPageModule>;
}

function lesson(overrides: Record<string, unknown> = {}) {
  return {
    id: "lesson-1",
    title: "Algebra Group A lesson",
    classGroupName: "Algebra Group A",
    startAt: new Date("2026-06-03T10:00:00.000Z"),
    ...overrides,
  };
}

describe("Teacher material create page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    listTeacherScheduleMock.mockResolvedValue([
      lesson(),
      lesson({ id: "lesson-2", title: "Geometry lesson" }),
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("uses enum-based TEACHER guard, teacher-owned lesson loader, and MaterialForm", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("MaterialForm");
    expect(source).toMatch(
      /listTeacherSchedule|listCourseMaterialsForTeacherClass|getTeacherSchedule/i,
    );
    expect(source).not.toContain('requireRole(["TEACHER"])');
  });

  it("requires TEACHER and loads only signed-in teacher scheduled class options", async () => {
    const page = await loadNewMaterialPage();
    const element = await page.default({ searchParams: Promise.resolve({}) });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(listTeacherScheduleMock).toHaveBeenCalledWith("teacher-1", expect.objectContaining({}));
    expect(screen.getByText("mode:create")).toBeDefined();
    expect(screen.getByRole("option", { name: /algebra group a lesson/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /geometry lesson/i })).toBeDefined();
    expect(screen.queryByRole("option", { name: /other teacher/i })).toBeNull();
  });

  it("renders create form fields and cancel link", async () => {
    const page = await loadNewMaterialPage();
    const element = await page.default({ searchParams: {} });
    render(element);

    expect(screen.getByLabelText(/^title$/i)).toBeDefined();
    expect(screen.getByLabelText(/description/i)).toBeDefined();
    expect(screen.getByLabelText(/file url/i)).toBeDefined();
    expect(screen.getByLabelText(/lesson|scheduled class/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /create material/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /cancel/i })).toHaveAttribute(
      "href",
      "/portal/teacher/materials",
    );
  });

  it("preselects scheduledClassId from query params", async () => {
    const page = await loadNewMaterialPage();
    const element = await page.default({ searchParams: { scheduledClassId: "lesson-2" } });
    render(element);

    expect(screen.getByLabelText(/lesson|scheduled class/i)).toHaveProperty("value", "lesson-2");
  });

  it.each([UserRole.STUDENT, UserRole.PARENT, UserRole.ADMIN])(
    "rejects %s before loading create form data",
    async (role) => {
      requireRoleMock.mockRejectedValueOnce(new Error(`NEXT_REDIRECT:${role}`));
      const page = await loadNewMaterialPage();

      await expect(page.default({ searchParams: {} })).rejects.toThrow(`NEXT_REDIRECT:${role}`);
      expect(listTeacherScheduleMock).not.toHaveBeenCalled();
    },
  );
});
