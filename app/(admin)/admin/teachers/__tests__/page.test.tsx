import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getAdminTeachersMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/cms-repository", () => ({
  getAdminTeachers: getAdminTeachersMock,
}));

type TeachersAdminPageModule = {
  default: () => Promise<JSX.Element> | JSX.Element;
};

async function loadTeachersAdminPage() {
  const specifier = "@/app/(admin)/admin/teachers/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeachersAdminPageModule>;
}

describe("Admin teacher profiles page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN role and renders teacher rows with management actions", async () => {
    getAdminTeachersMock.mockResolvedValueOnce([
      {
        id: "teacher-1",
        fullName: "Jane Doe",
        title: "STEM Specialist",
        bio: "Cambridge mathematics specialist with strong IGCSE teaching experience.",
        photoUrl: "/uploads/jane.webp",
        subjects: [
          { id: "subject-1", slug: "mathematics", name: "Mathematics" },
          { id: "subject-2", slug: "physics", name: "Physics" },
        ],
        cabinetUserId: "teacher-123",
        displayOrder: 1,
        isActive: true,
        updatedAt: new Date("2026-05-05T10:00:00.000Z"),
      },
      {
        id: "teacher-2",
        fullName: "John Smith",
        title: "Language Specialist",
        bio: "Experienced Cambridge Physics educator with live online teaching expertise.",
        photoUrl: null,
        subjects: [{ id: "subject-3", slug: "english-language", name: "English Language" }],
        cabinetUserId: null,
        displayOrder: 2,
        isActive: false,
        updatedAt: new Date("2026-05-04T10:00:00.000Z"),
      },
    ]);

    const page = await loadTeachersAdminPage();
    const element = await page.default();

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(getAdminTeachersMock).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: /teachers/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /teacher/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /title/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /subjects/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /cabinet access/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /updated/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /status/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /actions/i })).toBeDefined();
    expect(screen.getByText(/jane doe/i)).toBeDefined();
    expect(screen.getByText(/john smith/i)).toBeDefined();
    expect(screen.getByText(/stem specialist/i)).toBeDefined();
    expect(screen.getByText(/language specialist/i)).toBeDefined();
    expect(screen.getByText(/mathematics/i)).toBeDefined();
    expect(screen.getByText(/physics/i)).toBeDefined();
    expect(screen.getByText(/english language/i)).toBeDefined();
    expect(
      screen.queryByRole("link", { name: /create teacher/i }) ??
        screen.queryByRole("button", { name: /create teacher/i }),
    ).toBeDefined();
    expect(
      screen.queryAllByRole("link", { name: /edit/i }).length +
        screen.queryAllByRole("button", { name: /edit/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /activate|deactivate|hide|show|delete/i }).length,
    ).toBeGreaterThan(0);

    const janeRow = screen.getByText(/jane doe/i).closest("tr");
    expect(janeRow).toBeTruthy();
    expect(within(janeRow as HTMLElement).getByRole("img", { name: /jane doe/i })).toBeDefined();
    expect(within(janeRow as HTMLElement).getByText(/2026/)).toBeDefined();
    expect(
      within(janeRow as HTMLElement).getByText(/linked account|cabinet access/i),
    ).toBeDefined();

    const johnRow = screen.getByText(/john smith/i).closest("tr");
    expect(johnRow).toBeTruthy();
    expect(
      within(johnRow as HTMLElement).getByRole("img", {
        name: /placeholder avatar for john smith/i,
      }),
    ).toBeDefined();
    expect(within(johnRow as HTMLElement).getByText(/inactive/i)).toBeDefined();

    const table = screen.getByRole("table");
    expect(table.className).toContain("min-w-[1080px]");
    expect(table.parentElement?.className).toContain("overflow-x-auto");
    expect(table.parentElement?.className).toContain("relative");
    expect(screen.getByRole("columnheader", { name: "Status" }).className).toContain(
      "whitespace-nowrap",
    );
    expect(screen.getByRole("columnheader", { name: "Actions" }).className).toContain(
      "whitespace-nowrap",
    );
  }, 15_000);

  it("renders an empty state when no teacher profiles exist yet", async () => {
    getAdminTeachersMock.mockResolvedValueOnce([]);

    const page = await loadTeachersAdminPage();
    const element = await page.default();

    render(element);

    expect(
      screen.getByText(/no teachers|no teacher profiles|create the first teacher/i),
    ).toBeDefined();
  });

  it("renders a visible creation affordance for adding a new teacher profile", async () => {
    getAdminTeachersMock.mockResolvedValueOnce([]);

    const page = await loadTeachersAdminPage();
    const element = await page.default();

    render(element);

    expect(
      screen.queryByRole("link", { name: /create teacher/i }) ??
        screen.queryByRole("button", { name: /create teacher/i }),
    ).toBeDefined();
  });

  it("renders flash success and error feedback after teacher mutations", async () => {
    getAdminTeachersMock.mockResolvedValueOnce([]);

    const page = await loadTeachersAdminPage();

    render(
      await page.default({
        searchParams: { teacherMessage: "Teacher profile created." },
      }),
    );

    expect(screen.getByText(/teacher profile created/i)).toBeDefined();

    cleanup();
    getAdminTeachersMock.mockResolvedValueOnce([]);

    render(
      await page.default({
        searchParams: { teacherError: "Teacher profile failed." },
      }),
    );

    expect(screen.getByRole("alert").textContent).toMatch(/teacher profile failed/i);
  });
});
