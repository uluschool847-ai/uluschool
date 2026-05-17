import { within } from "@testing-library/dom";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getActiveTeachersMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/cms-repository", () => ({
  getActiveTeachers: getActiveTeachersMock,
}));

type TeachersPageModule = {
  default: () => Promise<JSX.Element> | JSX.Element;
};

async function loadTeachersPage() {
  const specifier = "@/app/teachers/page";
  return import(/* @vite-ignore */ specifier) as Promise<TeachersPageModule>;
}

describe("Public teachers page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders teacher profiles fetched from the repository with their subjects", async () => {
    getActiveTeachersMock.mockResolvedValueOnce([
      {
        id: "teacher-1",
        fullName: "Alice Teacher",
        title: "STEM Specialist",
        bio: "Cambridge mathematics specialist.",
        photoUrl: "/alice.jpg",
        displayOrder: 1,
        isActive: true,
        cabinetUserId: "teacher-123",
        subjects: [
          { id: "subject-1", slug: "mathematics", name: "Mathematics" },
          { id: "subject-2", slug: "physics", name: "Physics" },
        ],
      },
    ]);

    const page = await loadTeachersPage();
    const element = await page.default();

    render(element);

    expect(getActiveTeachersMock).toHaveBeenCalled();
    expect(screen.getByText(/alice teacher/i)).toBeDefined();
    expect(screen.getByText(/stem specialist/i)).toBeDefined();
    expect(screen.getByText(/cambridge mathematics specialist/i)).toBeDefined();
    const teacherCard = screen.getByRole("img", { name: /alice teacher/i }).closest("div");
    expect(teacherCard).toBeTruthy();
    const subjectsGroup = within(teacherCard as HTMLElement).getByRole("group", {
      name: /teacher subjects/i,
    });
    expect(within(subjectsGroup).getByText(/mathematics/i)).toBeDefined();
    expect(within(subjectsGroup).getByText(/physics/i)).toBeDefined();
  });

  it("renders every active teacher profile returned by the repository", async () => {
    getActiveTeachersMock.mockResolvedValueOnce([
      {
        id: "teacher-1",
        fullName: "Active Teacher",
        title: "Biology Specialist",
        bio: "Published profile",
        photoUrl: "/active.jpg",
        displayOrder: 1,
        isActive: true,
        cabinetUserId: null,
        subjects: [{ id: "subject-3", slug: "biology", name: "Biology" }],
      },
      {
        id: "teacher-2",
        fullName: "Second Teacher",
        title: "Chemistry Specialist",
        bio: "Second published profile",
        photoUrl: "/second.jpg",
        displayOrder: 2,
        isActive: true,
        cabinetUserId: "teacher-456",
        subjects: [{ id: "subject-4", slug: "chemistry", name: "Chemistry" }],
      },
    ]);

    const page = await loadTeachersPage();
    const element = await page.default();

    render(element);

    expect(screen.getByText(/active teacher/i)).toBeDefined();
    expect(screen.getByText(/second teacher/i)).toBeDefined();
    const teacherCards = screen.getAllByRole("img");
    const firstCard = teacherCards[0]?.closest("div");
    const secondCard = teacherCards[1]?.closest("div");
    expect(firstCard).toBeTruthy();
    expect(secondCard).toBeTruthy();
    expect(
      within(
        within(firstCard as HTMLElement).getByRole("group", { name: /teacher subjects/i }),
      ).getByText(/biology/i),
    ).toBeDefined();
    expect(
      within(
        within(secondCard as HTMLElement).getByRole("group", { name: /teacher subjects/i }),
      ).getByText(/chemistry/i),
    ).toBeDefined();
  });

  it("shows an empty state when no active teachers are available", async () => {
    getActiveTeachersMock.mockResolvedValueOnce([]);

    const page = await loadTeachersPage();
    const element = await page.default();

    render(element);

    expect(screen.getByText(/our teaching team is being updated/i)).toBeDefined();
  });

  it("shows a fallback avatar or placeholder when a teacher photo is missing", async () => {
    getActiveTeachersMock.mockResolvedValueOnce([
      {
        id: "teacher-1",
        fullName: "Jane Doe",
        title: "English Specialist",
        bio: "Published teacher profile without a photo should still show a visible avatar placeholder.",
        photoUrl: null,
        displayOrder: 1,
        isActive: true,
        cabinetUserId: null,
        subjects: [{ id: "subject-5", slug: "english-language", name: "English Language" }],
      },
    ]);

    const page = await loadTeachersPage();
    const element = await page.default();

    render(element);

    expect(screen.getByText(/jane doe/i)).toBeDefined();
    expect(screen.getByText(/english specialist/i)).toBeDefined();
    expect(screen.getByText(/english language/i)).toBeDefined();
    expect(screen.getByRole("img", { name: /placeholder avatar for jane doe/i })).toBeDefined();
  });
});
