import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeStorageKey, storageUrlForKey } from "@/lib/storage/storage-url";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getCourseMaterialForTeacherMock = vi.hoisted(() => vi.fn());
const listTeacherScheduleMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/course-material-repository", () => ({
  getCourseMaterialForTeacher: getCourseMaterialForTeacherMock,
}));

vi.mock("@/lib/repositories/teacher-schedule-repository", () => ({
  listTeacherSchedule: listTeacherScheduleMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/app/portal/teacher/components/MaterialForm", () => ({
  MaterialForm: ({
    initialValues,
    lessons,
    materialId,
    mode,
  }: {
    initialValues?: { fileUrl?: string; scheduledClassId?: string; title?: string };
    lessons: Array<{ id: string; title: string }>;
    materialId?: string;
    mode: string;
  }) => (
    <section aria-label="Material form mock">
      <p>mode:{mode}</p>
      <p>materialId:{materialId}</p>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" defaultValue={initialValues?.title ?? ""} />
      <label htmlFor="fileUrl">File URL</label>
      <input id="fileUrl" name="fileUrl" defaultValue={initialValues?.fileUrl ?? ""} />
      <label htmlFor="scheduledClassId">Lesson</label>
      <select
        id="scheduledClassId"
        name="scheduledClassId"
        defaultValue={initialValues?.scheduledClassId ?? ""}
      >
        {lessons.map((lesson) => (
          <option key={lesson.id} value={lesson.id}>
            {lesson.title}
          </option>
        ))}
      </select>
      <button type="submit">Save changes</button>
      <a href="/portal/teacher/materials">Cancel</a>
    </section>
  ),
}));

type EditMaterialPageModule = {
  default: (props: {
    params: Promise<{ materialId: string }> | { materialId: string };
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/teacher/materials/[materialId]/edit/page.tsx";

async function loadEditMaterialPage() {
  const specifier = "@/app/portal/teacher/materials/[materialId]/edit/page";
  return import(/* @vite-ignore */ specifier) as Promise<EditMaterialPageModule>;
}

function material(overrides: Record<string, unknown> = {}) {
  return {
    id: "material-1",
    title: "Algebra worksheet",
    description: "Practice problems",
    fileUrl: "https://cdn.school/materials/algebra.pdf",
    attachments: [],
    scheduledClassId: "lesson-1",
    scheduledClass: {
      id: "lesson-1",
      title: "Algebra Group A lesson",
      classGroup: { id: "group-1", name: "Algebra Group A" },
    },
    ...overrides,
  };
}

describe("Teacher material edit page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "teacher-1", role: UserRole.TEACHER });
    getCourseMaterialForTeacherMock.mockResolvedValue(material());
    listTeacherScheduleMock.mockResolvedValue([
      { id: "lesson-1", title: "Algebra Group A lesson" },
      { id: "lesson-2", title: "Geometry lesson" },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("uses enum-based TEACHER guard and teacher-scoped material loader", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.TEACHER])");
    expect(source).toContain("getCourseMaterialForTeacher");
    expect(source).toContain("MaterialForm");
    expect(source).not.toContain('requireRole(["TEACHER"])');
  });

  it("loads material with session.uid and renders edit form with initial values", async () => {
    const page = await loadEditMaterialPage();
    const element = await page.default({ params: Promise.resolve({ materialId: "material-1" }) });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.TEACHER]);
    expect(getCourseMaterialForTeacherMock).toHaveBeenCalledWith("material-1", "teacher-1");
    expect(screen.getByText("mode:edit")).toBeDefined();
    expect(screen.getByText("materialId:material-1")).toBeDefined();
    expect(screen.getByDisplayValue(/algebra worksheet/i)).toBeDefined();
    expect(screen.getByDisplayValue("https://cdn.school/materials/algebra.pdf")).toBeDefined();
    expect(screen.getByLabelText(/lesson|scheduled class/i)).toHaveProperty("value", "lesson-1");
  });

  it("prefills the canonical primary attachment href instead of a stale duplicated URL", async () => {
    const storageKey = "private/teachers/teacher-1/materials/algebra.pdf";
    getCourseMaterialForTeacherMock.mockResolvedValueOnce(
      material({
        fileUrl: "https://cdn.example.com/stale-algebra.pdf",
        attachments: [
          {
            id: "attachment-z",
            storageKey,
            createdAt: new Date("2026-07-14T08:00:00.000Z"),
          },
          {
            id: "attachment-a",
            storageKey: "private/teachers/teacher-1/materials/old-algebra.pdf",
            createdAt: new Date("2026-07-14T08:00:00.000Z"),
          },
        ],
      }),
    );

    const page = await loadEditMaterialPage();
    const element = await page.default({ params: { materialId: "material-1" } });
    render(element);

    expect(screen.getByLabelText(/file url/i)).toHaveProperty(
      "value",
      storageUrlForKey(storageKey),
    );
    expect(screen.queryByDisplayValue("https://cdn.example.com/stale-algebra.pdf")).toBeNull();
  });

  it("preserves a safe external material URL byte-for-byte when no attachment exists", async () => {
    const externalHref =
      "https://cdn.example.com/Files/Extension%20Work.pdf?download=1#teacher-copy";
    getCourseMaterialForTeacherMock.mockResolvedValueOnce(
      material({ fileUrl: externalHref, attachments: [] }),
    );

    const page = await loadEditMaterialPage();
    const element = await page.default({ params: { materialId: "material-1" } });
    render(element);

    expect(screen.getByLabelText(/file url/i)).toHaveProperty("value", externalHref);
  });

  it.each([
    "javascript:alert(1)",
    "/api/files/not+base64url",
    `/api/public-files/${encodeStorageKey("private/teachers/teacher-1/materials/algebra.pdf")}`,
  ])("does not prefill malformed or cross-purpose material href %s", async (fileUrl) => {
    getCourseMaterialForTeacherMock.mockResolvedValueOnce(material({ fileUrl, attachments: [] }));

    const page = await loadEditMaterialPage();
    const element = await page.default({ params: { materialId: "material-1" } });
    render(element);

    expect(screen.getByLabelText(/file url/i)).toHaveProperty("value", "");
  });

  it("returns notFound for missing or foreign material", async () => {
    getCourseMaterialForTeacherMock.mockResolvedValueOnce(null);

    const page = await loadEditMaterialPage();

    await expect(page.default({ params: { materialId: "foreign-material" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("scheduled class select includes only teacher-owned options", async () => {
    const page = await loadEditMaterialPage();
    const element = await page.default({ params: { materialId: "material-1" } });
    render(element);

    expect(listTeacherScheduleMock).toHaveBeenCalledWith("teacher-1", expect.objectContaining({}));
    expect(screen.getByRole("option", { name: /algebra group a lesson/i })).toBeDefined();
    expect(screen.queryByRole("option", { name: /other teacher/i })).toBeNull();
  });
});
