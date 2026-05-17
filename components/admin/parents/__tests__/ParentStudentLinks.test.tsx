import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const linkParentStudentActionMock = vi.hoisted(() => vi.fn());
const unlinkParentStudentActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/parents/actions", () => ({
  linkParentStudentAction: linkParentStudentActionMock,
  unlinkParentStudentAction: unlinkParentStudentActionMock,
}));

type StudentOption = {
  id: string;
  fullName: string;
  email: string | null;
  isActive?: boolean;
};

type ParentStudentLinksProps = {
  parentId: string;
  linkedStudents: StudentOption[];
  availableStudents: StudentOption[];
  flashMessage?: string;
  flashError?: string;
};

async function loadParentStudentLinks() {
  const specifier = "@/components/admin/parents/ParentStudentLinks";
  return import(/* @vite-ignore */ specifier) as Promise<{
    ParentStudentLinks: React.ComponentType<ParentStudentLinksProps>;
  }>;
}

describe("ParentStudentLinks admin controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders linked students, remove controls, and an add-student control", async () => {
    const { ParentStudentLinks } = await loadParentStudentLinks();

    render(
      <ParentStudentLinks
        parentId="parent-1"
        linkedStudents={[
          {
            id: "student-1",
            fullName: "Alice Student",
            email: "alice.student@example.com",
            isActive: true,
          },
          {
            id: "student-inactive",
            fullName: "Inactive Student",
            email: "inactive.student@example.com",
            isActive: false,
          },
        ]}
        availableStudents={[
          {
            id: "student-1",
            fullName: "Alice Student",
            email: "alice.student@example.com",
            isActive: true,
          },
          {
            id: "student-2",
            fullName: "Bob Student",
            email: "bob.student@example.com",
            isActive: true,
          },
        ]}
      />,
    );

    expect(screen.getByText(/alice student/i)).toBeDefined();
    expect(screen.getByText(/inactive student/i)).toBeDefined();
    expect(screen.getAllByRole("button", { name: /remove|unlink/i })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /link student|add student/i })).toBeDefined();
    expect(screen.getByRole("combobox")).toBeDefined();

    const optionLabels = screen
      .getAllByRole("option")
      .map((option) => option.textContent?.trim())
      .filter((value): value is string => Boolean(value));

    expect(optionLabels).not.toContain("Alice Student");
    expect(optionLabels).toContain("Bob Student");
  });

  it("shows an empty state when no students are linked", async () => {
    const { ParentStudentLinks } = await loadParentStudentLinks();

    render(
      <ParentStudentLinks
        parentId="parent-1"
        linkedStudents={[]}
        availableStudents={[
          {
            id: "student-1",
            fullName: "Alice Student",
            email: "alice.student@example.com",
            isActive: true,
          },
        ]}
      />,
    );

    expect(screen.getByText(/no linked students|no students linked/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /link student|add student/i })).toBeDefined();
  });

  it("keeps inactive linked students visible while excluding already-linked options", async () => {
    const { ParentStudentLinks } = await loadParentStudentLinks();

    render(
      <ParentStudentLinks
        parentId="parent-1"
        linkedStudents={[
          {
            id: "student-inactive",
            fullName: "Inactive Student",
            email: "inactive.student@example.com",
            isActive: false,
          },
        ]}
        availableStudents={[
          {
            id: "student-inactive",
            fullName: "Inactive Student",
            email: "inactive.student@example.com",
            isActive: false,
          },
          {
            id: "student-active",
            fullName: "Active Student",
            email: "active.student@example.com",
            isActive: true,
          },
        ]}
      />,
    );

    expect(screen.getByText(/inactive student/i)).toBeDefined();

    const optionLabels = screen
      .getAllByRole("option")
      .map((option) => option.textContent?.trim())
      .filter((value): value is string => Boolean(value));

    expect(optionLabels).not.toContain("Inactive Student");
    expect(optionLabels).toContain("Active Student");
  });

  it("shows visible success and error feedback", async () => {
    const { ParentStudentLinks } = await loadParentStudentLinks();

    render(
      <ParentStudentLinks
        parentId="parent-1"
        linkedStudents={[]}
        availableStudents={[]}
        flashMessage="Student linked."
      />,
    );

    expect(screen.getByText(/student linked/i)).toBeDefined();

    cleanup();

    render(
      <ParentStudentLinks
        parentId="parent-1"
        linkedStudents={[]}
        availableStudents={[]}
        flashError="Student link failed."
      />,
    );

    expect(screen.getByRole("alert").textContent).toMatch(/student link failed/i);
  });
});
