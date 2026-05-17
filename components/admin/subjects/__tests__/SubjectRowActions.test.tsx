import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setSubjectActiveActionMock = vi.hoisted(() => vi.fn());
const deleteSubjectActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/subjects/actions", () => ({
  deleteSubjectAction: deleteSubjectActionMock,
  setSubjectActiveAction: setSubjectActiveActionMock,
}));

type SubjectRowActionsProps = {
  subject: {
    id: string;
    slug: string;
    name: string;
    isActive: boolean;
    teachersCount?: number;
  };
};

async function loadSubjectRowActions() {
  const specifier = "@/components/admin/subjects/SubjectRowActions";
  return import(/* @vite-ignore */ specifier) as Promise<{
    SubjectRowActions: React.ComponentType<SubjectRowActionsProps>;
  }>;
}

describe("SubjectRowActions admin controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLFormElement.prototype, "requestSubmit", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders edit, active-state, and delete affordances for an active subject", async () => {
    const { SubjectRowActions } = await loadSubjectRowActions();

    render(
      <SubjectRowActions
        subject={{
          id: "subject-biology",
          slug: "biology",
          name: "Biology",
          isActive: true,
          teachersCount: 2,
        }}
      />,
    );

    expect(screen.getByRole("link", { name: /edit/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /deactivate|archive|make inactive/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /delete/i })).toBeDefined();
  });

  it("renders an activation affordance for an inactive subject", async () => {
    const { SubjectRowActions } = await loadSubjectRowActions();

    render(
      <SubjectRowActions
        subject={{
          id: "subject-history",
          slug: "history",
          name: "History",
          isActive: false,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: /activate|restore|make active/i })).toBeDefined();
  });

  it("requires an explicit confirmation step before destructive delete", async () => {
    const { SubjectRowActions } = await loadSubjectRowActions();

    render(
      <SubjectRowActions
        subject={{
          id: "subject-biology",
          slug: "biology",
          name: "Biology",
          isActive: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText(/biology/i)).toBeDefined();
    expect(
      screen.getByRole("button", {
        name: /confirm delete|delete subject|yes, delete/i,
      }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined();
  });
});
