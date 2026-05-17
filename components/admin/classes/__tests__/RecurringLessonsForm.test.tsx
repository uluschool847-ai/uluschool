import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createRecurringLessonsActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/lessons/actions", () => ({
  createRecurringLessonsAction: createRecurringLessonsActionMock,
}));

type RecurringLessonsFormModule = {
  RecurringLessonsForm: (props: {
    classGroup: { id: string; name: string };
    teachers: Array<{ id: string; fullName: string; email: string }>;
    subjects: Array<{ id: string; name: string; slug: string }>;
  }) => JSX.Element;
};

async function loadRecurringLessonsForm() {
  const specifier = "@/components/admin/classes/RecurringLessonsForm";
  return import(/* @vite-ignore */ specifier) as Promise<RecurringLessonsFormModule>;
}

describe("RecurringLessonsForm admin controls", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("supports weekly lesson generation fields and preview before creation", async () => {
    const { RecurringLessonsForm } = await loadRecurringLessonsForm();

    render(
      <RecurringLessonsForm
        classGroup={{ id: "group-1", name: "IGCSE Mathematics Group A" }}
        teachers={[{ id: "teacher-1", fullName: "Jane Teacher", email: "jane@example.com" }]}
        subjects={[{ id: "subject-math", name: "Mathematics", slug: "mathematics" }]}
      />,
    );

    expect(screen.getByLabelText(/monday/i)).toBeDefined();
    expect(screen.getByLabelText(/wednesday/i)).toBeDefined();
    expect(screen.getByLabelText(/start time/i)).toBeDefined();
    expect(screen.getByLabelText(/duration/i)).toBeDefined();
    expect(screen.getByLabelText(/^start date$/i)).toBeDefined();
    expect(screen.getByLabelText(/^end date$/i)).toBeDefined();
    expect(screen.getByLabelText(/live link strategy/i)).toBeDefined();
    expect(screen.getByLabelText(/live lesson url|base live link/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /preview/i })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /preview/i }));

    expect(screen.getByText(/preview/i)).toBeDefined();
    expect(screen.getByText(/weekly mathematics lesson|generated lessons/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /create recurring lessons/i })).toBeDefined();
  });
});
