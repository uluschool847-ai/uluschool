import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const linkStudentParentActionMock = vi.hoisted(() => vi.fn());
const unlinkStudentParentActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/students/actions", () => ({
  linkStudentParentAction: linkStudentParentActionMock,
  unlinkStudentParentAction: unlinkStudentParentActionMock,
}));

type StudentParentLinksProps = {
  studentId: string;
  linkedParents: Array<{
    id: string;
    fullName: string;
    email: string | null;
  }>;
  availableParents: Array<{
    id: string;
    fullName: string;
    email: string | null;
  }>;
  flashMessage?: string;
  flashError?: string;
};

async function loadStudentParentLinks() {
  const specifier = "@/components/admin/students/StudentParentLinks";
  return import(/* @vite-ignore */ specifier) as Promise<{
    StudentParentLinks: React.ComponentType<StudentParentLinksProps>;
  }>;
}

describe("StudentParentLinks admin controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders linked parents, remove controls, and a parent-link add control", async () => {
    const { StudentParentLinks } = await loadStudentParentLinks();

    render(
      <StudentParentLinks
        studentId="student-1"
        linkedParents={[
          {
            id: "parent-1",
            fullName: "Mary Parent",
            email: "mary.parent@example.com",
          },
          {
            id: "parent-2",
            fullName: "John Parent",
            email: "john.parent@example.com",
          },
        ]}
        availableParents={[
          {
            id: "parent-1",
            fullName: "Mary Parent",
            email: "mary.parent@example.com",
          },
          {
            id: "parent-3",
            fullName: "Beth Parent",
            email: "beth.parent@example.com",
          },
        ]}
      />,
    );

    expect(screen.getByText(/mary parent/i)).toBeDefined();
    expect(screen.getByText(/john parent/i)).toBeDefined();
    expect(screen.getAllByRole("button", { name: /remove/i })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /link parent/i })).toBeDefined();
    expect(screen.getByRole("combobox")).toBeDefined();

    const optionLabels = screen
      .getAllByRole("option")
      .map((option) => option.textContent?.trim())
      .filter((value): value is string => Boolean(value));

    expect(optionLabels).not.toContain("Mary Parent");
    expect(optionLabels).toContain("Beth Parent");
  });

  it("keeps already linked parents visible even when they are absent from the selectable parent list", async () => {
    const { StudentParentLinks } = await loadStudentParentLinks();

    render(
      <StudentParentLinks
        studentId="student-1"
        linkedParents={[
          {
            id: "parent-inactive",
            fullName: "Inactive Parent",
            email: "inactive.parent@example.com",
          },
        ]}
        availableParents={[
          {
            id: "parent-active",
            fullName: "Active Parent",
            email: "active.parent@example.com",
          },
        ]}
      />,
    );

    expect(screen.getByText(/inactive parent/i)).toBeDefined();
    const optionLabels = screen
      .getAllByRole("option")
      .map((option) => option.textContent?.trim())
      .filter((value): value is string => Boolean(value));

    expect(optionLabels).not.toContain("Inactive Parent");
    expect(optionLabels).toContain("Active Parent");
  });

  it("shows an empty state when no parents are linked", async () => {
    const { StudentParentLinks } = await loadStudentParentLinks();

    render(
      <StudentParentLinks
        studentId="student-1"
        linkedParents={[]}
        availableParents={[
          {
            id: "parent-1",
            fullName: "Mary Parent",
            email: "mary.parent@example.com",
          },
        ]}
      />,
    );

    expect(screen.getByRole("status").textContent).toMatch(/no linked parents|no parents linked/i);
    expect(screen.getByRole("button", { name: /link parent/i })).toBeDefined();
  });

  it("shows visible success and error feedback", async () => {
    const { StudentParentLinks } = await loadStudentParentLinks();

    render(
      <StudentParentLinks
        studentId="student-1"
        linkedParents={[]}
        availableParents={[]}
        flashMessage="Parent linked."
      />,
    );

    expect(screen.getByText(/parent linked/i)).toBeDefined();

    cleanup();

    render(
      <StudentParentLinks
        studentId="student-1"
        linkedParents={[]}
        availableParents={[]}
        flashError="Parent link failed."
      />,
    );

    expect(screen.getByRole("alert").textContent).toMatch(/parent link failed/i);
  });
});
