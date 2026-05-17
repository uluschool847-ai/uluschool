import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createParentActionMock = vi.hoisted(() => vi.fn());
const updateParentActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/parents/actions", () => ({
  createParentAction: createParentActionMock,
  updateParentAction: updateParentActionMock,
}));

type ParentFormProps = {
  mode: "create" | "edit";
  parent?: {
    id: string;
    fullName: string;
    email: string;
    phoneWhatsapp?: string | null;
    isActive?: boolean;
  };
  flashMessage?: string;
  flashError?: string;
  successRedirect: string;
  errorRedirect: string;
};

async function loadParentForm() {
  const specifier = "@/components/admin/parents/ParentForm";
  return import(/* @vite-ignore */ specifier) as Promise<{
    ParentForm: React.ComponentType<ParentFormProps>;
  }>;
}

describe("ParentForm admin controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders create mode fields without exposing role editing", async () => {
    const { ParentForm } = await loadParentForm();

    render(
      <ParentForm
        mode="create"
        successRedirect="/admin/parents"
        errorRedirect="/admin/parents/new"
      />,
    );

    expect(screen.getByRole("heading", { name: /create parent|create guardian/i })).toBeDefined();
    expect(screen.getByLabelText(/full name/i)).toBeDefined();
    expect(screen.getByLabelText(/email/i)).toBeDefined();
    expect(screen.getByLabelText(/phone|whatsapp/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /create parent|create guardian/i })).toBeDefined();
    expect(screen.queryByLabelText(/role/i)).toBeNull();
    expect(screen.queryByRole("combobox", { name: /role/i })).toBeNull();
  }, 15_000);

  it("renders edit mode with existing parent values", async () => {
    const { ParentForm } = await loadParentForm();

    render(
      <ParentForm
        mode="edit"
        parent={{
          id: "parent-1",
          fullName: "Mary Parent",
          email: "mary.parent@example.com",
          phoneWhatsapp: "+254700000001",
          isActive: true,
        }}
        successRedirect="/admin/parents"
        errorRedirect="/admin/parents/parent-1/edit"
      />,
    );

    expect(screen.getByRole("heading", { name: /edit parent|edit guardian/i })).toBeDefined();
    expect(screen.getByDisplayValue("Mary Parent")).toBeDefined();
    expect(screen.getByDisplayValue("mary.parent@example.com")).toBeDefined();
    expect(screen.getByDisplayValue("+254700000001")).toBeDefined();
    expect(screen.getByRole("button", { name: /save changes|update parent/i })).toBeDefined();
    expect(screen.queryByLabelText(/role/i)).toBeNull();
  });

  it("shows visible success and error feedback", async () => {
    const { ParentForm } = await loadParentForm();

    render(
      <ParentForm
        mode="create"
        flashMessage="Parent account created."
        successRedirect="/admin/parents"
        errorRedirect="/admin/parents/new"
      />,
    );

    expect(screen.getByText(/parent account created/i)).toBeDefined();

    cleanup();

    render(
      <ParentForm
        mode="create"
        flashError="Parent account failed."
        successRedirect="/admin/parents"
        errorRedirect="/admin/parents/new"
      />,
    );

    expect(screen.getByRole("alert").textContent).toMatch(/parent account failed/i);
  });
});
