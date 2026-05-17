import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCatalogueDataMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/catalogue-repository", () => ({
  getCatalogueData: getCatalogueDataMock,
}));

type PageModule = {
  default: () => Promise<JSX.Element> | JSX.Element;
};

async function loadCurriculumPage() {
  const specifier = "@/app/curriculum/page";
  return import(/* @vite-ignore */ specifier) as Promise<PageModule>;
}

async function loadSubjectsPage() {
  const specifier = "@/app/subjects/page";
  return import(/* @vite-ignore */ specifier) as Promise<PageModule>;
}

describe("Public catalogue pages use database-backed subjects and levels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders curriculum catalogue content from database records", async () => {
    getCatalogueDataMock.mockResolvedValueOnce({
      subjects: [
        { id: "subject-1", name: "Biology", isActive: true, priority: 1 },
        { id: "subject-2", name: "Chemistry", isActive: true, priority: 2 },
      ],
      levels: [{ id: "level-1", slug: "grade-5", name: "Grade 5" }],
    });

    const page = await loadCurriculumPage();
    const element = await page.default();

    render(element);

    expect(getCatalogueDataMock).toHaveBeenCalled();
    expect(screen.getByText(/grade 5/i)).toBeDefined();
    expect(screen.getByText(/biology/i)).toBeDefined();
    expect(screen.getByText(/chemistry/i)).toBeDefined();
  });

  it("does not display inactive subjects in the public curriculum overview", async () => {
    getCatalogueDataMock.mockResolvedValueOnce({
      subjects: [{ id: "subject-1", name: "Biology", isActive: true, priority: 1 }],
      levels: [{ id: "level-1", slug: "grade-5", name: "Grade 5" }],
    });

    const page = await loadCurriculumPage();
    const element = await page.default();

    render(element);

    expect(screen.getByText(/biology/i)).toBeDefined();
    expect(screen.queryByText(/inactive subject/i)).toBeNull();
  });

  it("renders the subjects page from catalogue repository records instead of static content", async () => {
    getCatalogueDataMock.mockResolvedValueOnce({
      subjects: [
        { id: "subject-1", name: "Biology", isActive: true, priority: 1 },
        { id: "subject-2", name: "Chemistry", isActive: true, priority: 2 },
      ],
      levels: [{ id: "level-1", slug: "grade-5", name: "Grade 5" }],
    });

    const page = await loadSubjectsPage();
    const element = await page.default();

    render(element);

    expect(getCatalogueDataMock).toHaveBeenCalled();
    expect(screen.getByText(/biology/i)).toBeDefined();
    expect(screen.getByText(/chemistry/i)).toBeDefined();
  });
});
