import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudentMaterialList } from "@/app/portal/student/components/StudentMaterialList";

describe("StudentMaterialList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows friendly empty state when there are no materials", () => {
    render(<StudentMaterialList materials={[]} />);

    expect(screen.getByText(/no materials available for your classes yet/i)).toBeDefined();
  });

  it("renders materials grouped by class/subject with title, description, and file link", () => {
    render(
      <StudentMaterialList
        materials={[
          {
            id: "mat-1",
            title: "Algebra Factorization Guide",
            description: "Practice examples for tomorrow's class.",
            fileUrl: "https://cdn.school/algebra-factorization.pdf",
            className: "IGCSE Mathematics - Set A",
            subjectName: "Mathematics",
          },
          {
            id: "mat-2",
            title: "Cell Division Summary",
            description: "Quick revision sheet.",
            fileUrl: "https://cdn.school/cell-division.pdf",
            className: "IGCSE Biology - Set B",
            subjectName: "Biology",
          },
        ]}
      />,
    );

    expect(screen.getByText(/igcse mathematics - set a/i)).toBeDefined();
    expect(screen.getByText(/mathematics/i)).toBeDefined();
    expect(screen.getByText(/algebra factorization guide/i)).toBeDefined();
    expect(screen.getByText(/practice examples for tomorrow's class/i)).toBeDefined();
    expect(
      screen.getByRole("link", { name: /view|download|open algebra factorization guide/i }),
    ).toBeDefined();
  });

  it("does not crash when material description is missing", () => {
    render(
      <StudentMaterialList
        materials={[
          {
            id: "mat-3",
            title: "Business Case Study Handout",
            fileUrl: "https://cdn.school/business-case-study.pdf",
            className: "IGCSE Business Studies - Set A",
            subjectName: "Business Studies",
          },
        ]}
      />,
    );

    expect(screen.getByText(/business case study handout/i)).toBeDefined();
    expect(
      screen.getByRole("link", { name: /view|download|open business case study handout/i }),
    ).toBeDefined();
  });
});
