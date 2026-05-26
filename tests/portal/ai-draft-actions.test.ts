import { AiDraftStatus, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockSession: { uid: string; role: UserRole } | null = null;

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(async (allowedRoles: UserRole[]) => {
    if (!mockSession) throw new Error("Unauthorized");
    if (!allowedRoles.includes(mockSession.role)) throw new Error("Forbidden");
    return mockSession;
  }),
}));

const createReportCommentDraftMock = vi.hoisted(() => vi.fn());
const createCrmFollowUpDraftMock = vi.hoisted(() => vi.fn());
const reviewAiDraftMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/ai-draft-repository", () => ({
  createCrmFollowUpDraft: createCrmFollowUpDraftMock,
  createReportCommentDraft: createReportCommentDraftMock,
  reviewAiDraft: reviewAiDraftMock,
}));
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

type TeacherAiActions = {
  generateReportCommentDraftAction: (input: unknown) => Promise<unknown>;
  reviewTeacherAiDraftAction: (input: unknown) => Promise<unknown>;
};

type AdminAiActions = {
  generateCrmFollowUpDraftAction: (input: unknown) => Promise<unknown>;
  reviewAdminAiDraftAction: (input: unknown) => Promise<unknown>;
};

async function loadTeacherActions() {
  const specifier = "@/app/portal/teacher/actions/ai-draft-actions";
  return import(/* @vite-ignore */ specifier) as Promise<TeacherAiActions>;
}

async function loadAdminActions() {
  const specifier = "@/app/(admin)/admin/actions/ai-draft-actions";
  return import(/* @vite-ignore */ specifier) as Promise<AdminAiActions>;
}

describe("AI draft actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { uid: "teacher-1", role: UserRole.TEACHER };
    createReportCommentDraftMock.mockResolvedValue({ id: "draft-1", status: AiDraftStatus.DRAFT });
    createCrmFollowUpDraftMock.mockResolvedValue({ id: "draft-2", status: AiDraftStatus.DRAFT });
    reviewAiDraftMock.mockResolvedValue({ id: "draft-1", status: AiDraftStatus.APPROVED });
  });

  it("lets teachers generate report comment drafts without publishing them", async () => {
    const actions = await loadTeacherActions();

    const result = await actions.generateReportCommentDraftAction({ snapshotId: "snapshot-1" });

    expect(createReportCommentDraftMock).toHaveBeenCalledWith("teacher-1", "snapshot-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/reports/snapshot-1");
    expect(result).toEqual({
      data: { id: "draft-1", status: AiDraftStatus.DRAFT },
      success: true,
    });
  });

  it("rejects invalid teacher draft requests before repository mutation", async () => {
    const actions = await loadTeacherActions();

    const result = await actions.generateReportCommentDraftAction({ snapshotId: "" });

    expect(result).toMatchObject({ success: false });
    expect(createReportCommentDraftMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("lets teachers approve or reject only through the review action", async () => {
    const actions = await loadTeacherActions();

    await actions.reviewTeacherAiDraftAction({
      draftId: "draft-1",
      status: AiDraftStatus.APPROVED,
    });

    expect(reviewAiDraftMock).toHaveBeenCalledWith("teacher-1", "draft-1", AiDraftStatus.APPROVED);
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/teacher/reports");
  });

  it("rejects non-teacher sessions from teacher AI actions", async () => {
    mockSession = { uid: "student-1", role: UserRole.STUDENT };
    const actions = await loadTeacherActions();

    await expect(
      actions.generateReportCommentDraftAction({ snapshotId: "snapshot-1" }),
    ).rejects.toThrow(/forbidden/i);
    expect(createReportCommentDraftMock).not.toHaveBeenCalled();
  });

  it("lets admins generate CRM follow-up drafts", async () => {
    mockSession = { uid: "admin-1", role: UserRole.ADMIN };
    const actions = await loadAdminActions();

    const result = await actions.generateCrmFollowUpDraftAction({ enquiryId: "enquiry-1" });

    expect(createCrmFollowUpDraftMock).toHaveBeenCalledWith("admin-1", "enquiry-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
    expect(result).toEqual({
      data: { id: "draft-2", status: AiDraftStatus.DRAFT },
      success: true,
    });
  });

  it("rejects non-admin sessions from admin AI actions", async () => {
    mockSession = { uid: "teacher-1", role: UserRole.TEACHER };
    const actions = await loadAdminActions();

    await expect(
      actions.generateCrmFollowUpDraftAction({ enquiryId: "enquiry-1" }),
    ).rejects.toThrow(/forbidden/i);
    expect(createCrmFollowUpDraftMock).not.toHaveBeenCalled();
  });
});
