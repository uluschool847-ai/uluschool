import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it } from "vitest";

type ParentMaterialListProps = {
  materials: Array<Record<string, unknown>>;
  studentId: string;
};

type ParentMaterialListModule = {
  ParentMaterialList: ComponentType<ParentMaterialListProps>;
};

function loadComponent() {
  const specifier = "@/app/portal/parent/components/ParentMaterialList";
  return import(/* @vite-ignore */ specifier) as Promise<ParentMaterialListModule>;
}

function material(overrides: Record<string, unknown> = {}) {
  return {
    attachments: [
      {
        filename: "factorization-practice.pdf",
        href: "/uploads/materials/factorization-practice.pdf",
        mimeType: "application/pdf",
        size: 2048,
      },
    ],
    classGroup: { id: "group-1", name: "IGCSE Mathematics A" },
    createdAt: "2026-06-01T09:00:00.000Z",
    description: "Practice examples and teacher notes for the next lesson.",
    id: "material-1",
    safeFileUrl: "/uploads/materials/algebra-factorization.pdf",
    scheduledClass: {
      id: "lesson-1",
      startAt: "2026-06-03T10:00:00.000Z",
      title: "Algebra lesson",
    },
    subject: { id: "subject-math", name: "Mathematics" },
    title: "Algebra factorization guide",
    updatedAt: "2026-06-02T10:30:00.000Z",
    ...overrides,
  };
}

describe("ParentMaterialList", () => {
  afterEach(() => cleanup());

  it("renders linked-child material cards with context, dates, safe file links, and attachments", async () => {
    const { ParentMaterialList } = await loadComponent();
    render(<ParentMaterialList materials={[material()]} studentId="student-1" />);

    const card = screen.getByRole("article", { name: /algebra factorization guide/i });
    expect(within(card).getByText(/practice examples and teacher notes/i)).toBeDefined();
    expect(within(card).getByText(/algebra lesson/i)).toBeDefined();
    expect(within(card).getByText(/igcse mathematics a/i)).toBeDefined();
    expect(within(card).getByText(/^Subject:\s*Mathematics$/i)).toBeDefined();
    expect(within(card).getByText(/created/i)).toBeDefined();
    expect(within(card).getByText(/updated/i)).toBeDefined();
    expect(
      within(card).getByRole("link", { name: /open material|view file|download/i }),
    ).toHaveAttribute("href", "/uploads/materials/algebra-factorization.pdf");
    expect(
      within(card).getByRole("link", { name: /factorization-practice\.pdf/i }),
    ).toHaveAttribute("href", "/uploads/materials/factorization-practice.pdf");
  });

  it.each(["https://cdn.school/material.pdf", "/uploads/materials/internal.pdf"])(
    "allows safe material URLs: %s",
    async (safeUrl) => {
      const { ParentMaterialList } = await loadComponent();
      render(
        <ParentMaterialList
          materials={[
            material({
              attachments: [
                {
                  filename: "safe-attachment.pdf",
                  href: safeUrl,
                  mimeType: "application/pdf",
                  size: 123,
                },
              ],
              safeFileUrl: safeUrl,
              title: "Safe parent material",
            }),
          ]}
          studentId="student-1"
        />,
      );

      expect(screen.getByRole("link", { name: /open material|view file/i })).toHaveAttribute(
        "href",
        safeUrl,
      );
      expect(screen.getByRole("link", { name: /safe-attachment\.pdf/i })).toHaveAttribute(
        "href",
        safeUrl,
      );
    },
  );

  it.each([
    "javascript:alert(1)",
    "data:text/html,<h1>unsafe</h1>",
    "file:///etc/passwd",
    "http://cdn.school/insecure.pdf",
  ])("renders unsafe material URLs as unavailable read-only text: %s", async (unsafeUrl) => {
    const { ParentMaterialList } = await loadComponent();
    const { container } = render(
      <ParentMaterialList
        materials={[
          material({
            attachments: [
              {
                filename: "unsafe-file.pdf",
                href: null,
                mimeType: "application/pdf",
                size: 123,
              },
            ],
            fileUrl: unsafeUrl,
            safeFileUrl: null,
            title: "Unsafe parent material",
          }),
        ]}
        studentId="student-1"
      />,
    );

    expect(screen.getByText(/unsafe parent material/i)).toBeDefined();
    expect(screen.getByText(/unsafe-file\.pdf/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: /open material|view file|download/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /unsafe-file\.pdf/i })).toBeNull();
    expect(container.textContent).not.toContain(unsafeUrl);
  });

  it("renders an empty state without leaking foreign material labels", async () => {
    const { ParentMaterialList } = await loadComponent();
    render(<ParentMaterialList materials={[]} studentId="student-1" />);

    expect(screen.getByText(/no materials available|no materials match/i)).toBeDefined();
    expect(screen.queryByText(/foreign material/i)).toBeNull();
  });

  it("does not render upload, create, edit, delete, or unlink controls", async () => {
    const { ParentMaterialList } = await loadComponent();
    render(<ParentMaterialList materials={[material()]} studentId="student-1" />);

    expect(
      screen.queryByRole("button", { name: /upload|create|edit|delete|unlink|save/i }),
    ).toBeNull();
    expect(screen.queryByLabelText(/file url|upload|attachment|title|description/i)).toBeNull();
    expect(
      screen.queryByText(/upload material|new material|delete material|unlink file/i),
    ).toBeNull();
  });
});
