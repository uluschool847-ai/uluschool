import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listProgressNotesForParentChildMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/parent-progress-repository", () => ({
  listProgressNotesForParentChild: listProgressNotesForParentChildMock,
}));

type ParentProgressPageModule = {
  default: (props: {
    params: Promise<{ studentId: string }> | { studentId: string };
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<ReactElement> | ReactElement;
};

const PAGE_SOURCE_PATH = "app/portal/parent/progress/[studentId]/page.tsx";

function loadPage() {
  const specifier = "@/app/portal/parent/progress/[studentId]/page";
  return import(/* @vite-ignore */ specifier) as Promise<ParentProgressPageModule>;
}

function progressNote(overrides: Record<string, unknown> = {}) {
  return {
    archivedAt: null,
    content: "Algebra reasoning is improving with multi-step problems.",
    id: "progress-1",
    performanceLevel: "GOOD",
    recordedAt: new Date("2026-02-05T10:00:00.000Z"),
    statusLabel: "Active",
    studentName: "Linked Learner",
    subject: "Mathematics",
    teacherName: "Ada Teacher",
    updatedAt: new Date("2026-02-06T10:00:00.000Z"),
    ...overrides,
  };
}

describe("Parent child progress page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ role: UserRole.PARENT, uid: "parent-1" });
    listProgressNotesForParentChildMock.mockResolvedValue([progressNote()]);
  });

  afterEach(() => cleanup());

  it("uses the PARENT guard, dedicated parent progress repository, and no direct Prisma query", () => {
    const source = readFileSync(PAGE_SOURCE_PATH, "utf8");

    expect(source).toContain("requireRole([UserRole.PARENT])");
    expect(source).toContain("@/lib/repositories/parent-progress-repository");
    expect(source).toContain("listProgressNotesForParentChild(session.uid");
    expect(source).not.toContain("@/lib/prisma");
    expect(source).not.toContain("prisma.");
    expect(source).not.toContain("createProgress");
    expect(source).not.toContain("updateProgress");
    expect(source).not.toContain("archiveProgress");
    expect(source).not.toContain("deleteProgress");
  });

  it("renders back navigation and all parent progress filters", async () => {
    const page = await loadPage();
    const element = await page.default({ params: { studentId: "student-1" } });
    render(element);

    expect(screen.getByRole("link", { name: /back to parent dashboard/i })).toHaveAttribute(
      "href",
      "/portal/parent",
    );
    expect(screen.getByLabelText(/subject/i)).toBeDefined();
    expect(screen.getByLabelText(/performance level/i)).toBeDefined();
    expect(screen.getByLabelText(/status/i)).toBeDefined();
    expect(screen.getByLabelText(/search/i)).toBeDefined();
    expect(screen.getByLabelText(/sort/i)).toBeDefined();
  });

  it("lists progress for the linked child using session.uid and route studentId", async () => {
    const page = await loadPage();
    const element = await page.default({
      params: { studentId: "student-1" },
      searchParams: {
        performanceLevel: "GOOD",
        search: "algebra",
        sort: "subject",
        status: "all",
        subjectId: "subject-math",
      },
    });
    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.PARENT]);
    expect(listProgressNotesForParentChildMock).toHaveBeenCalledWith("parent-1", "student-1", {
      performanceLevel: "GOOD",
      search: "algebra",
      sort: "subject",
      status: "all",
      subjectId: "subject-math",
    });
    expect(screen.getByRole("heading", { name: /progress/i })).toBeDefined();

    const card = screen.getByRole("article", { name: /algebra reasoning is improving/i });
    expect(within(card).getByText(/mathematics/i)).toBeDefined();
    expect(within(card).getByText(/ada teacher/i)).toBeDefined();
    expect(within(card).getByText(/good/i)).toBeDefined();
    expect(within(card).getByText(/recorded/i)).toBeDefined();
    expect(within(card).getByText(/updated/i)).toBeDefined();
  });

  it("renders archived notes only when the repository returns them", async () => {
    listProgressNotesForParentChildMock.mockResolvedValueOnce([
      progressNote({
        archivedAt: new Date("2026-02-10T10:00:00.000Z"),
        content: "Archived note for long-term improvement review.",
        id: "archived-progress",
        performanceLevel: "EXCELLENT",
        statusLabel: "Archived",
      }),
    ]);
    const page = await loadPage();
    const element = await page.default({
      params: { studentId: "student-1" },
      searchParams: { status: "archived" },
    });
    render(element);

    expect(listProgressNotesForParentChildMock).toHaveBeenCalledWith(
      "parent-1",
      "student-1",
      expect.objectContaining({ status: "archived" }),
    );
    expect(screen.getByText(/archived note/i)).toBeDefined();
    expect(screen.getByText(/archived/i)).toBeDefined();
  });

  it("renders an empty state for unlinked or progress-free children without foreign note leakage", async () => {
    listProgressNotesForParentChildMock.mockResolvedValueOnce([]);
    const page = await loadPage();
    const element = await page.default({ params: { studentId: "unlinked-student" } });
    render(element);

    expect(screen.getByText(/no progress notes/i)).toBeDefined();
    expect(screen.queryByText(/foreign progress note/i)).toBeNull();
  });

  it("renders the parent progress view as read-only", async () => {
    const page = await loadPage();
    const element = await page.default({ params: { studentId: "student-1" } });
    render(element);

    expect(screen.queryByRole("button", { name: /create|edit|archive|delete|save/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /create|edit|archive|delete/i })).toBeNull();
    expect(screen.queryByLabelText(/progress note content|teacher notes|private note/i)).toBeNull();
  });

  it("rejects non-parent roles before loading progress data", async () => {
    requireRoleMock.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    const page = await loadPage();

    await expect(page.default({ params: { studentId: "student-1" } })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(listProgressNotesForParentChildMock).not.toHaveBeenCalled();
  });
});
