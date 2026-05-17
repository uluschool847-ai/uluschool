import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listUsersByRoleMock = vi.hoisted(() => vi.fn());
const listActiveSubjectsMock = vi.hoisted(() => vi.fn());
const getLevelsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/portal-repository", () => ({
  listUsersByRole: listUsersByRoleMock,
}));

vi.mock("@/lib/repositories/subject-repository", () => ({
  listActiveSubjects: listActiveSubjectsMock,
}));

vi.mock("@/lib/repositories/catalogue-repository", () => ({
  getLevels: getLevelsMock,
}));

type NewClassGroupPageModule = {
  default: (props?: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadNewClassGroupPage() {
  const specifier = "@/app/(admin)/admin/classes/new/page";
  return import(/* @vite-ignore */ specifier) as Promise<NewClassGroupPageModule>;
}

describe("Admin class group create page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
    listUsersByRoleMock.mockResolvedValue([
      { id: "teacher-1", fullName: "John Smith", email: "john@example.com", isActive: true },
      { id: "teacher-2", fullName: "Jane Doe", email: "jane@example.com", isActive: true },
    ]);
    listActiveSubjectsMock.mockResolvedValue([
      { id: "subject-math", name: "Mathematics", slug: "mathematics", isActive: true },
      { id: "subject-biology", name: "Biology", slug: "biology", isActive: true },
    ]);
    getLevelsMock.mockResolvedValue([
      { id: "level-igcse", name: "IGCSE", slug: "igcse" },
      { id: "level-a-level", name: "A Level", slug: "a-level" },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN and renders the class group form with teacher-only options", async () => {
    const page = await loadNewClassGroupPage();
    const element = await page.default();

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(listUsersByRoleMock).toHaveBeenCalledWith(UserRole.TEACHER);
    expect(listActiveSubjectsMock).toHaveBeenCalled();
    expect(getLevelsMock).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /create.*class group|new.*class/i })).toBeDefined();
    expect(screen.getByLabelText(/^name$/i)).toBeDefined();
    expect(screen.getByLabelText(/description/i)).toBeDefined();
    expect(screen.getByLabelText(/subject/i)).toBeDefined();
    expect(screen.getByLabelText(/level/i)).toBeDefined();
    expect(screen.getByLabelText(/teacher/i)).toBeDefined();
    expect(screen.getByLabelText(/status/i)).toBeDefined();
    expect(screen.getByLabelText(/capacity/i)).toBeDefined();
    expect(screen.getByLabelText(/start date/i)).toBeDefined();
    expect(screen.getByLabelText(/end date/i)).toBeDefined();
    expect(screen.getByRole("option", { name: /john smith/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /^mathematics$/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /^igcse$/i })).toBeDefined();
    expect(screen.queryByRole("option", { name: /student|parent|admin/i })).toBeNull();
  });
});
