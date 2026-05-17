import { UserRole } from "@prisma/client";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listAdminSubjectsMock = vi.hoisted(() => vi.fn());
const subjectFiltersMock = vi.hoisted(() => vi.fn());
const subjectRowActionsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/subject-repository", () => ({
  listAdminSubjects: listAdminSubjectsMock,
}));

vi.mock("@/components/admin/subjects/SubjectFilters", () => ({
  SubjectFilters: (props: unknown) => {
    subjectFiltersMock(props);
    return <div data-testid="subject-filters" />;
  },
}));

vi.mock("@/components/admin/subjects/SubjectRowActions", () => ({
  SubjectRowActions: (props: { subject: { id: string; isActive: boolean } }) => {
    subjectRowActionsMock(props);
    return (
      <div data-testid={`subject-row-actions-${props.subject.id}`}>
        <a href={`/admin/subjects/${props.subject.id}/edit`}>Edit subject</a>
        <button type="button">{props.subject.isActive ? "Deactivate" : "Activate"}</button>
        <button type="button">Delete subject</button>
      </div>
    );
  },
}));

type AdminSubjectsPageModule = {
  default: (props?: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadAdminSubjectsPage() {
  const specifier = "@/app/(admin)/admin/subjects/page";
  return import(/* @vite-ignore */ specifier) as Promise<AdminSubjectsPageModule>;
}

describe("Admin subjects page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it("requires ADMIN role and renders subject management rows with core academic metadata", async () => {
    listAdminSubjectsMock.mockResolvedValueOnce([
      {
        id: "subject-biology",
        slug: "biology",
        name: "Biology",
        description: "Biology support for Cambridge and exam preparation.",
        isActive: true,
        priority: 1,
        teachersCount: 2,
        createdAt: new Date("2026-05-01T09:00:00.000Z"),
        updatedAt: new Date("2026-05-10T09:00:00.000Z"),
      },
      {
        id: "subject-history",
        slug: "history",
        name: "History",
        description: "History lessons are paused while staffing is reviewed.",
        isActive: false,
        priority: 7,
        teachersCount: 0,
        createdAt: new Date("2026-05-02T09:00:00.000Z"),
        updatedAt: new Date("2026-05-11T09:00:00.000Z"),
      },
    ]);

    const page = await loadAdminSubjectsPage();
    const element = await page.default();

    render(element);

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(listAdminSubjectsMock).toHaveBeenCalledWith({});
    expect(screen.getByRole("heading", { name: /subjects/i })).toBeDefined();
    expect(screen.getByTestId("subject-filters")).toBeDefined();
    expect(
      screen.queryByRole("link", { name: /create subject|new subject/i }) ??
        screen.queryByRole("button", { name: /create subject|new subject/i }),
    ).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /name/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /slug/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /description/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /status/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /priority/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /teachers/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /created/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /updated/i })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: /actions/i })).toBeDefined();

    const biologyRow = screen.getByText("Biology").closest("tr");
    expect(biologyRow).toBeTruthy();
    expect(within(biologyRow as HTMLElement).getByText("biology")).toBeDefined();
    expect(within(biologyRow as HTMLElement).getByText(/cambridge/i)).toBeDefined();
    expect(within(biologyRow as HTMLElement).getByText(/^active$/i)).toBeDefined();
    expect(within(biologyRow as HTMLElement).getByText("1")).toBeDefined();
    expect(within(biologyRow as HTMLElement).getByText("2")).toBeDefined();
    expect(within(biologyRow as HTMLElement).getAllByText(/2026/).length).toBeGreaterThanOrEqual(2);
    expect(
      within(biologyRow as HTMLElement).getByRole("link", { name: /edit subject/i }),
    ).toBeDefined();
    expect(
      within(biologyRow as HTMLElement).getByRole("button", { name: /deactivate/i }),
    ).toBeDefined();
    expect(
      within(biologyRow as HTMLElement).getByRole("button", { name: /delete subject/i }),
    ).toBeDefined();

    const historyRow = screen.getByText("History").closest("tr");
    expect(historyRow).toBeTruthy();
    expect(within(historyRow as HTMLElement).getByText("history")).toBeDefined();
    expect(within(historyRow as HTMLElement).getByText(/^inactive$/i)).toBeDefined();
    expect(within(historyRow as HTMLElement).getByText("7")).toBeDefined();
    expect(within(historyRow as HTMLElement).getByText("0")).toBeDefined();
    expect(
      within(historyRow as HTMLElement).getByRole("button", { name: /activate/i }),
    ).toBeDefined();

    expect(subjectRowActionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({ id: "subject-biology", isActive: true }),
      }),
    );
  });

  it("renders an empty state when no subjects exist yet", async () => {
    listAdminSubjectsMock.mockResolvedValueOnce([]);

    const page = await loadAdminSubjectsPage();
    const element = await page.default();

    render(element);

    expect(screen.getByText(/no subjects|create the first subject/i)).toBeDefined();
    expect(
      screen.queryByRole("link", { name: /create subject|new subject/i }) ??
        screen.queryByRole("button", { name: /create subject|new subject/i }),
    ).toBeDefined();
  });

  it("forwards search and active-state filters to listAdminSubjects", async () => {
    listAdminSubjectsMock.mockResolvedValueOnce([]);

    const page = await loadAdminSubjectsPage();
    const element = await page.default({
      searchParams: Promise.resolve({ q: "bio", isActive: "false" }),
    });

    render(element);

    expect(listAdminSubjectsMock).toHaveBeenCalledWith({
      searchQuery: "bio",
      isActive: false,
    });
    expect(subjectFiltersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        searchQuery: "bio",
        isActive: false,
      }),
    );
  });
});
