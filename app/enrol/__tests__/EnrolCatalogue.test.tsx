import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCatalogueDataMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/catalogue-repository", () => ({
  getCatalogueData: getCatalogueDataMock,
}));

vi.mock("@/components/enrol/enrol-form", () => ({
  EnrolForm: ({
    subjects,
    levels,
  }: {
    subjects?: Array<{ id: string; name: string }>;
    levels?: Array<{ id: string; name: string }>;
  }) => {
    if (!subjects || !levels) {
      return <div>Loading catalogue...</div>;
    }

    return (
      <div>
        <label htmlFor="subject">Subject</label>
        <select id="subject" aria-label="Subject">
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>

        <label htmlFor="level">Level / Grade</label>
        <select id="level" aria-label="Level / Grade">
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name}
            </option>
          ))}
        </select>
      </div>
    );
  },
}));

type EnrolPageModule = {
  default: () => Promise<JSX.Element> | JSX.Element;
};

async function loadEnrolPage() {
  const specifier = "@/app/enrol/page";
  return import(/* @vite-ignore */ specifier) as Promise<EnrolPageModule>;
}

describe("Enrolment page catalogue data wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("populates the Subject dropdown from catalogue repository data", async () => {
    getCatalogueDataMock.mockResolvedValueOnce({
      subjects: [
        { id: "subject-1", name: "Biology" },
        { id: "subject-2", name: "Chemistry" },
      ],
      levels: [{ id: "level-1", name: "Grade 5" }],
    });

    const page = await loadEnrolPage();
    const element = await page.default();

    render(element);

    expect(getCatalogueDataMock).toHaveBeenCalled();
    expect(screen.getByRole("option", { name: "Biology" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Chemistry" })).toBeDefined();
  });

  it("populates the Level / Grade select from database-backed levels", async () => {
    getCatalogueDataMock.mockResolvedValueOnce({
      subjects: [{ id: "subject-1", name: "Biology" }],
      levels: [
        { id: "level-1", name: "Grade 5" },
        { id: "level-2", name: "Grade 6" },
      ],
    });

    const page = await loadEnrolPage();
    const element = await page.default();

    render(element);

    expect(screen.getByRole("option", { name: "Grade 5" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Grade 6" })).toBeDefined();
  });

  it("shows a loading state while catalogue data is being prepared for the form", async () => {
    getCatalogueDataMock.mockResolvedValueOnce({
      subjects: undefined,
      levels: undefined,
    });

    const page = await loadEnrolPage();
    const element = await page.default();

    render(element);

    expect(screen.getByText(/loading catalogue/i)).toBeDefined();
  });
});
