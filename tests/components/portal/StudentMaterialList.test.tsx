import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudentMaterialList } from "@/app/portal/student/components/StudentMaterialList";
import { storageUrlForKey } from "@/lib/storage/storage-url";

type StudentMaterialListMaterials = Parameters<typeof StudentMaterialList>[0]["materials"];

describe("StudentMaterialList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows friendly empty state when there are no materials", () => {
    render(<StudentMaterialList materials={[]} />);

    expect(
      screen.getByText(/no materials available yet|no materials available for your classes yet/i),
    ).toBeDefined();
  });

  it("renders materials grouped by class/subject with title, description, and file link", () => {
    const materials = [
      {
        id: "mat-1",
        title: "Algebra Factorization Guide",
        description: "Practice examples for tomorrow's class.",
        fileUrl: "https://cdn.school/algebra-factorization.pdf",
        safeFileUrl: "https://cdn.school/algebra-factorization.pdf",
        attachments: [
          {
            filename: "factorization-practice.pdf",
            href: "/uploads/materials/factorization-practice.pdf",
            mimeType: "application/pdf",
            size: 2048,
          },
        ],
        className: "IGCSE Mathematics - Set A",
        scheduledClass: {
          id: "lesson-1",
          title: "IGCSE Mathematics - Set A",
          startAt: new Date("2026-06-04T10:00:00.000Z"),
        },
        classGroup: { id: "group-1", name: "Mathematics Group A" },
        subjectName: "Mathematics",
        subject: { id: "subject-math", name: "Mathematics" },
        createdAt: new Date("2026-06-01T09:00:00.000Z"),
        updatedAt: new Date("2026-06-02T09:00:00.000Z"),
      },
      {
        id: "mat-2",
        title: "Cell Division Summary",
        description: "Quick revision sheet.",
        fileUrl: "https://cdn.school/cell-division.pdf",
        safeFileUrl: "https://cdn.school/cell-division.pdf",
        attachments: [],
        className: "IGCSE Biology - Set B",
        scheduledClass: {
          id: "lesson-2",
          title: "IGCSE Biology - Set B",
          startAt: new Date("2026-06-05T10:00:00.000Z"),
        },
        classGroup: { id: "group-2", name: "Biology Group B" },
        subjectName: "Biology",
        subject: { id: "subject-bio", name: "Biology" },
        createdAt: new Date("2026-06-03T09:00:00.000Z"),
        updatedAt: new Date("2026-06-03T09:00:00.000Z"),
      },
    ] as unknown as StudentMaterialListMaterials;

    render(<StudentMaterialList materials={materials} />);

    const algebraMaterial = screen.getByRole("article", {
      name: /algebra factorization guide/i,
    });

    expect(within(algebraMaterial).getByText(/igcse mathematics - set a/i)).toBeDefined();
    expect(within(algebraMaterial).getByText(/^Subject:\s*Mathematics$/i)).toBeDefined();
    expect(within(algebraMaterial).getByText(/mathematics group a/i)).toBeDefined();
    expect(within(algebraMaterial).getByText(/algebra factorization guide/i)).toBeDefined();
    expect(
      within(algebraMaterial).getByText(/practice examples for tomorrow's class/i),
    ).toBeDefined();
    expect(within(algebraMaterial).getByText(/created/i)).toBeDefined();
    expect(within(algebraMaterial).getByText(/updated/i)).toBeDefined();
    expect(
      within(algebraMaterial).getByRole("link", { name: /view file|open material/i }),
    ).toHaveAttribute("href", "https://cdn.school/algebra-factorization.pdf");
    expect(
      within(algebraMaterial).getByRole("link", { name: /factorization-practice\.pdf/i }),
    ).toHaveAttribute("href", "/uploads/materials/factorization-practice.pdf");
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
    expect(screen.getByRole("link", { name: /open material/i })).toBeDefined();
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<h1>unsafe</h1>",
    "file:///etc/passwd",
    "http://cdn.school/insecure.pdf",
  ])("blocks unsafe material and attachment URLs: %s", (unsafeUrl) => {
    const materials = [
      {
        id: "mat-unsafe",
        title: "Unsafe material",
        description: "This link should be unavailable.",
        fileUrl: unsafeUrl,
        safeFileUrl: null,
        attachments: [
          {
            filename: "unsafe-file.pdf",
            href: unsafeUrl,
            mimeType: "application/pdf",
            size: 123,
          },
        ],
        className: "IGCSE ICT",
        scheduledClass: { id: "lesson-unsafe", title: "ICT lesson" },
        classGroup: { id: "group-ict", name: "ICT Group" },
        subjectName: "ICT",
        subject: { id: "subject-ict", name: "ICT" },
        createdAt: new Date("2026-06-01T09:00:00.000Z"),
        updatedAt: new Date("2026-06-01T09:00:00.000Z"),
      },
    ] as unknown as StudentMaterialListMaterials;

    const { container } = render(<StudentMaterialList materials={materials} />);

    expect(screen.getByText(/unsafe material/i)).toBeDefined();
    expect(screen.getByText(/unsafe-file\.pdf/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /view|download|open unsafe material/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /unsafe-file\.pdf/i })).toBeNull();
    expect(container.textContent).not.toContain(unsafeUrl);
  });

  it.each([
    "https://cdn.school/material.pdf",
    "/uploads/materials/internal.pdf",
    storageUrlForKey("private/teachers/teacher-1/materials/internal.pdf"),
  ])("allows safe material URLs: %s", (safeUrl) => {
    const materials = [
      {
        id: "mat-safe",
        title: "Safe material",
        description: "Long description ".repeat(40),
        fileUrl: safeUrl,
        safeFileUrl: safeUrl,
        attachments: [
          {
            filename: "safe-attachment.pdf",
            href: safeUrl,
            mimeType: "application/pdf",
            size: 123,
          },
        ],
        className: "IGCSE English",
        scheduledClass: { id: "lesson-safe", title: "English lesson" },
        classGroup: { id: "group-english", name: "English Group" },
        subjectName: "English",
        subject: { id: "subject-english", name: "English" },
        createdAt: new Date("2026-06-01T09:00:00.000Z"),
        updatedAt: new Date("2026-06-01T09:00:00.000Z"),
      },
    ] as unknown as StudentMaterialListMaterials;

    render(<StudentMaterialList materials={materials} />);

    expect(screen.getByRole("link", { name: /open material/i })).toHaveAttribute("href", safeUrl);
    expect(screen.getByRole("link", { name: /safe-attachment\.pdf/i })).toHaveAttribute(
      "href",
      safeUrl,
    );
    expect(screen.getByText(/long description long description/i)).toBeDefined();
  });
});
