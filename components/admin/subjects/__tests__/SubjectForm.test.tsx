import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createSubjectActionMock = vi.hoisted(() => vi.fn());
const updateSubjectActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/subjects/actions", () => ({
  createSubjectAction: createSubjectActionMock,
  updateSubjectAction: updateSubjectActionMock,
}));

type SubjectFormProps = {
  mode: "create" | "edit";
  subject?: {
    id: string;
    slug: string;
    name: string;
    description: string;
    isActive: boolean;
    priority: number;
  };
  flashMessage?: string;
  flashError?: string;
  successRedirect: string;
  errorRedirect: string;
};

async function loadSubjectForm() {
  const specifier = "@/components/admin/subjects/SubjectForm";
  return import(/* @vite-ignore */ specifier) as Promise<{
    SubjectForm: React.ComponentType<SubjectFormProps>;
  }>;
}

function textInput(label: RegExp) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

describe("SubjectForm admin controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders create mode fields for the full subject management contract", async () => {
    const { SubjectForm } = await loadSubjectForm();

    render(
      <SubjectForm
        mode="create"
        successRedirect="/admin/subjects"
        errorRedirect="/admin/subjects/new"
      />,
    );

    expect(screen.getByRole("heading", { name: /create subject/i })).toBeDefined();
    expect(screen.getByLabelText(/name/i)).toBeDefined();
    expect(screen.getByLabelText(/slug/i)).toBeDefined();
    expect(screen.getByLabelText(/description/i)).toBeDefined();
    expect(screen.getByLabelText(/priority/i)).toBeDefined();
    expect(screen.getByLabelText(/active/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /create subject/i })).toBeDefined();
  });

  it("renders edit mode with existing subject values pre-filled", async () => {
    const { SubjectForm } = await loadSubjectForm();

    render(
      <SubjectForm
        mode="edit"
        subject={{
          id: "subject-biology",
          slug: "biology",
          name: "Biology",
          description: "Biology support for Cambridge and exam preparation.",
          isActive: true,
          priority: 1,
        }}
        successRedirect="/admin/subjects"
        errorRedirect="/admin/subjects/subject-biology/edit"
      />,
    );

    expect(screen.getByRole("heading", { name: /edit subject/i })).toBeDefined();
    expect(screen.getByDisplayValue("Biology")).toBeDefined();
    expect(screen.getByDisplayValue("biology")).toBeDefined();
    expect(
      screen.getByDisplayValue("Biology support for Cambridge and exam preparation."),
    ).toBeDefined();
    expect(screen.getByDisplayValue("1")).toBeDefined();
    expect(screen.getByLabelText(/active/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /save changes|update subject/i })).toBeDefined();
  });

  it("uses browser validation for required name, required slug, URL-safe slug, and numeric priority", async () => {
    const { SubjectForm } = await loadSubjectForm();

    render(
      <SubjectForm
        mode="create"
        successRedirect="/admin/subjects"
        errorRedirect="/admin/subjects/new"
      />,
    );

    const name = textInput(/name/i);
    const slug = textInput(/slug/i);
    const priority = textInput(/priority/i);

    expect(name.required).toBe(true);
    expect(slug.required).toBe(true);
    expect(slug.pattern).toBeTruthy();
    expect(new RegExp(`^(?:${slug.pattern})$`).test("biology")).toBe(true);
    expect(new RegExp(`^(?:${slug.pattern})$`).test("english-language")).toBe(true);
    expect(new RegExp(`^(?:${slug.pattern})$`).test("English Language")).toBe(false);
    expect(new RegExp(`^(?:${slug.pattern})$`).test("biology!")).toBe(false);
    expect(priority.type).toBe("number");

    fireEvent.change(slug, { target: { value: "Upper Case" } });
    expect(slug.checkValidity()).toBe(false);

    fireEvent.change(priority, { target: { value: "not-a-number" } });
    expect(priority.checkValidity()).toBe(false);
  });

  it("shows flash success and error feedback visibly", async () => {
    const { SubjectForm } = await loadSubjectForm();

    render(
      <SubjectForm
        mode="create"
        flashMessage="Subject created."
        successRedirect="/admin/subjects"
        errorRedirect="/admin/subjects/new"
      />,
    );

    expect(screen.getByText(/subject created/i)).toBeDefined();

    cleanup();

    render(
      <SubjectForm
        mode="create"
        flashError="Subject failed."
        successRedirect="/admin/subjects"
        errorRedirect="/admin/subjects/new"
      />,
    );

    expect(screen.getByRole("alert").textContent).toMatch(/subject failed/i);
  });
});
