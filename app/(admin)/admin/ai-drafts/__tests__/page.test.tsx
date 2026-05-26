import { UserRole } from "@prisma/client";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listAdminAiDraftsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/repositories/ai-draft-repository", () => ({
  listAdminAiDrafts: listAdminAiDraftsMock,
}));
vi.mock("@/app/(admin)/admin/actions/ai-draft-actions", () => ({
  generateCrmFollowUpDraftAction: vi.fn(),
  reviewAdminAiDraftAction: vi.fn(),
}));

type PageModule = {
  default: () => Promise<ReactElement> | ReactElement;
};

async function loadPage() {
  const specifier = "@/app/(admin)/admin/ai-drafts/page";
  return import(/* @vite-ignore */ specifier) as Promise<PageModule>;
}

describe("admin AI drafts page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
    listAdminAiDraftsMock.mockResolvedValue([]);
  });

  it("requires ADMIN and lists reviewable drafts", async () => {
    listAdminAiDraftsMock.mockResolvedValueOnce([
      {
        id: "draft-1",
        outputText: "Follow up with the parent about scheduling.",
        status: "DRAFT",
        type: "CRM_FOLLOW_UP",
      },
    ]);
    const page = await loadPage();

    render(await page.default());

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(listAdminAiDraftsMock).toHaveBeenCalledWith("admin-1");
    expect(screen.getByRole("heading", { name: /ai draft assistant/i })).toBeDefined();
    expect(screen.getByText(/follow up with the parent/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /approve draft/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /reject draft/i })).toBeDefined();
  });

  it("renders an empty state without mutation-by-default publishing controls", async () => {
    const page = await loadPage();

    render(await page.default());

    expect(screen.getByText(/no ai drafts yet/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /^publish$/i })).toBeNull();
  });
});
